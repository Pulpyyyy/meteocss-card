console.info("%c 🙂 MeteoCSS Card %c v3.0.0%c", "background:#2196F3;color:white;padding:2px 8px;border-radius:3px 0 0 3px;font-weight:bold", "background:#4CAF50;color:white;padding:2px 8px;border-radius:0 3px 3px 0", "background:none");

const _genId = () => {
    try {
        // 122 bits of randomness, universally unique — preferred over Math.random().
        return crypto.randomUUID().replace(/-/g, '');
    } catch {
        // Fallback for environments that don't expose crypto.randomUUID.
        return Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
    }
};

const CARD_CONFIG = {
    type: 'meteo-card',
    name: 'MeteoCSS Card',
    description: 'Weather card with realistic weather conditions, sky, sun, and moon.',
    preview: true
};

const METEO_SINGLETONS = {};

// Adopted StyleSheet shared across all instances — created only once.
let _meteoSharedSheet = null;

/**
 * Manages shared state between multiple MeteoCard instances that belong to the
 * same logical group (identified by a singletonId). Handles demo lifecycle
 * (start / pause / stop), master election (which card drives the demo loop and
 * which drives the data fetch), and card registration / unregistration.
 * All methods are static — the class acts as a namespace over the METEO_SINGLETONS map.
 */
class SingletonManager {
    static getSingleton(singletonId) {
        if (!METEO_SINGLETONS[singletonId]) {
            METEO_SINGLETONS[singletonId] = {
                demoTimeOffset: 0,
                demoState: 'stopped',
                lastUpdateTimestamp: Date.now(),
                demoScenario: [],
                demoForcedCondition: 'auto',
                demoUIMaster: null,
                actualState: null,
                bgCloudCount: 0,
                fgCloudCount: 0,
                registeredCards: new Set(),
                dataMaster: null,
                realDataReady: false,
                realDataTimestamp: null
            };
        }
        return METEO_SINGLETONS[singletonId];
    }

    static stopDemo(singletonId) {
        const singleton = this.getSingleton(singletonId);
        singleton.demoState = 'stopped';
        singleton.demoTimeOffset = 0;
        singleton.demoScenario = [];
    }

    static startDemo(singletonId) {
        const state = this.getSingleton(singletonId);
        state.demoState = 'running';
        state.lastUpdateTimestamp = Date.now();
        if (!state.demoTimeOffset || state.demoTimeOffset === 0) {
            state.demoTimeOffset = Date.now();
        }
    }

    static getDemoState(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.demoState;
    }

    static setDemoState(singletonId, state) {
        const singleton = this.getSingleton(singletonId);
        if (['running', 'paused', 'stopped'].includes(state)) {
            singleton.demoState = state;
        }
    }


    static isMaster(singletonId, cardId) {
        const singleton = this.getSingleton(singletonId);

        if (singleton.demoUIMaster === cardId) {
            return true;
        }

        if (!singleton.demoUIMaster) {
            singleton.demoUIMaster = cardId;
            return true;
        }

        const currentMaster = singleton.demoUIMaster;
        const masterExists = currentMaster && singleton.registeredCards.has(currentMaster);

        if (!masterExists) {
            singleton.demoUIMaster = cardId;
            return true;
        }

        return false;
    }

    static electDataMaster(singletonId, cardId, hasDemo) {
        const singleton = this.getSingleton(singletonId);

        if (hasDemo) {
            if (singleton.dataMaster !== cardId) {
                singleton.dataMaster = cardId;
            }
            return true;
        }

        if (!singleton.dataMaster) {
            singleton.dataMaster = cardId;
            return true;
        }

        const currentDataMaster = singleton.dataMaster;
        if (currentDataMaster && !singleton.registeredCards.has(currentDataMaster)) {
            singleton.dataMaster = cardId;
            return true;
        }

        return singleton.dataMaster === cardId;
    }

    static getDataMaster(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.dataMaster;
    }

    static getActualState(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.actualState;
    }

    static setActualState(singletonId, state) {
        const singleton = this.getSingleton(singletonId);
        singleton.actualState = state;
    }

    static registerCard(singletonId, cardId) {
        const singleton = this.getSingleton(singletonId);
        singleton.registeredCards.add(cardId);
    }

    static unregisterCard(singletonId, cardId) {
        if (METEO_SINGLETONS[singletonId]) {
            METEO_SINGLETONS[singletonId].registeredCards.delete(cardId);
            if (METEO_SINGLETONS[singletonId].dataMaster === cardId) {
                METEO_SINGLETONS[singletonId].dataMaster = null;
            }
            if (METEO_SINGLETONS[singletonId].registeredCards.size === 0) {
                if (METEO_SINGLETONS[singletonId].demoUIElement) {
                    METEO_SINGLETONS[singletonId].demoUIElement.remove();
                }
                delete METEO_SINGLETONS[singletonId];
            }
        }
    }

    static getCardCount(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.registeredCards.size;
    }

    static getSlaveCount(singletonId) {
        const singleton = this.getSingleton(singletonId);
        const totalCards = singleton.registeredCards.size;

        if (singleton.demoUIMaster && totalCards > 0) {
            return totalCards - 1;
        }
        return totalCards;
    }
}

/**
 * Computes a synthetic weather state for the demo / preview mode.
 * Each call to compute() advances an internal time offset and returns a
 * MeteoState-compatible object that simulates a full 24-hour day cycle
 * compressed into 60 seconds, cycling through all available weather conditions.
 * Sun and moon positions are derived from a simplified orbital model;
 * wind speed and moon phase are animated trigonometrically.
 */
class DemoEngine {
    constructor(config, singletonId) {
        this.config = config;
        this.singletonId = singletonId;
        this.moonPhases = ['Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent', 'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous'];
    }

    compute() {
        const shared = SingletonManager.getSingleton(this.singletonId);
        const now = Date.now();

        if (shared.demoState === 'running') {
            shared.demoTimeOffset += (now - shared.lastUpdateTimestamp);
        }
        shared.lastUpdateTimestamp = now;

        // One full demo cycle lasts 60 seconds, compressing a full day into one minute.
        const totalDuration = 60000;
        const prog = (shared.demoTimeOffset % totalDuration) / totalDuration;
        const hour = prog * 24;

        if (!shared.demoScenario || shared.demoScenario.length === 0) {
            const availConditions = Object.keys(this.config.get('conditions')).filter(c => c !== 'default');
            shared.demoScenario = availConditions.sort(() => Math.random() - 0.5);
        }

        let condition = shared.demoForcedCondition;
        if (!condition || condition === 'auto') {
            const conditionIndex = Math.floor(prog * shared.demoScenario.length);
            const safeIndex = Math.min(conditionIndex, shared.demoScenario.length - 1);
            condition = shared.demoScenario[safeIndex];
        }

        const sunAzimuth = (hour / 24) * 360;
        const sunElevation = 85 * Math.sin((hour - 6) * Math.PI / 12);
        const sunPos = this._getCoords(sunAzimuth, sunElevation);
        const moonPos = this._getCoords((sunAzimuth + 180) % 360, -sunElevation);

        const phasePeriod = totalDuration * 0.5;
        const phaseProgress = (shared.demoTimeOffset % phasePeriod) / phasePeriod;
        const moonCycleIndex = Math.floor(phaseProgress * this.moonPhases.length) % this.moonPhases.length;
        const moonPhase = this.moonPhases[moonCycleIndex];
        const moonPhaseDegrees = (phaseProgress * this.moonPhases.length * 360) % 360;

        const windSpeed = 15 + Math.abs(Math.sin(prog * Math.PI * 2)) * 65;

        const state = {
            condition: condition,
            isNight: sunPos.elevation <= 0,
            sunPos: sunPos,
            moonPos: moonPos,
            moonPhase: moonPhase,
            moonPhaseDegrees: moonPhaseDegrees,
            rising: hour >= 6 && hour < 12,
            simulatedHour: hour,
            windSpeed: windSpeed
        };

        SingletonManager.setActualState(this.singletonId, state);
        return state;
    }

    _getCoords(azimuth, elevation) {
        return MeteoCoordsCalculator.getCoords(azimuth, elevation, this.config);
    }
}

/**
 * Converts astronomical coordinates (azimuth + elevation in degrees) into
 * CSS percentage positions (left / top) on the card surface.
 * The projection accounts for the configurable orbital ellipse (rx, ry, cx, cy),
 * an optional tilt angle, the house orientation angle, and azimuth inversion.
 * All methods are static — instantiation is never needed.
 */
class MeteoCoordsCalculator {
    static getCoords(azimuth, elevation, config) {
        try {
            const az = parseFloat(azimuth);
            const el = parseFloat(elevation);

            if (isNaN(az) || isNaN(el)) {
                console.warn('[MeteoCoordsCalculator] Invalid coordinates:', {
                    azimuth,
                    elevation
                });
                return this._defaultPosition();
            }

            const orbit = this._getOrbit(config);
            const houseAngle = this._getHouseAngle(config);
            const invertAzimuth = this._getInvertAzimuth(config);

            return this._calculatePosition(az, el, orbit, houseAngle, invertAzimuth);

        } catch (e) {
            console.error('[MeteoCoordsCalculator] getCoords error:', e);
            return this._defaultPosition();
        }
    }

    static _calculatePosition(azimuth, elevation, orbit, houseAngle, invertAzimuth) {
        let finalAz = invertAzimuth ? (azimuth + 180) % 360 : azimuth;
        const rad = (finalAz - houseAngle) * Math.PI / 180;
        const x0 = orbit.rx * Math.sin(rad);
        const y0 = -orbit.ry * Math.cos(rad);
        const tiltRad = orbit.tilt * Math.PI / 180;
        const xRot = x0 * Math.cos(tiltRad) - y0 * Math.sin(tiltRad);
        const yRot = x0 * Math.sin(tiltRad) + y0 * Math.cos(tiltRad);
        return {
            left: Math.max(0, Math.min(100, orbit.cx + xRot)),
            top: Math.max(0, Math.min(100, orbit.cy + yRot)),
            elevation: elevation,
            azimuth: finalAz
        };
    }

    // Reads a value from either a MeteoConfig instance (via .get()) or a plain object.
    static _readConfig(config, key, defaultValue) {
        const val = typeof config?.get === 'function' ? config.get(key) : config?.[key];
        return val ?? defaultValue;
    }

    static _getOrbit(config) {
        return this._readConfig(config, 'orbit', null) || this._defaultOrbit();
    }

    static _getHouseAngle(config) {
        return this._readConfig(config, 'house_angle', 25);
    }

    static _getInvertAzimuth(config) {
        return this._readConfig(config, 'invert_azimuth', false);
    }

    static _defaultOrbit() {
        return {
            rx: 45,
            ry: 40,
            cx: 50,
            cy: 50,
            tilt: 0
        };
    }

    static _defaultPosition() {
        return {
            left: 50,
            top: 50,
            elevation: 0,
            azimuth: 0
        };
    }

    static isVisible(position) {
        return position?.elevation >= 0;
    }

    static getAzimuthDistance(az1, az2) {
        const diff = Math.abs(az1 - az2);
        return Math.min(diff, 360 - diff);
    }

    static interpolate(pos1, pos2, t) {
        return {
            left: pos1.left + (pos2.left - pos1.left) * t,
            top: pos1.top + (pos2.top - pos1.top) * t,
            elevation: pos1.elevation + (pos2.elevation - pos1.elevation) * t,
            azimuth: pos1.azimuth + (pos2.azimuth - pos1.azimuth) * t
        };
    }
}


/**
 * Validates Home Assistant entity objects before they are used by MeteoCard.
 * Checks that the entity exists in hass.states, that required attributes are
 * present, and that numeric attributes fall within expected bounds.
 * Returns the entity on success or null on any validation failure, keeping
 * rendering code free of defensive null-checks against raw HA data.
 */
class EntityValidator {
    static validate(hass, entityId, schema = {}) {
        if (!hass || typeof hass !== 'object') {
            console.error('[EntityValidator] hass object is invalid');
            return null;
        }

        const entity = hass.states?.[entityId];
        if (!entity) {
            return null;
        }

        if (schema.state !== undefined) {
            if (typeof entity.state !== 'string') {
                console.error(`[EntityValidator] Invalid state type for ${entityId}`);
                return null;
            }
        }

        if (schema.requiredAttributes && Array.isArray(schema.requiredAttributes)) {
            for (const attr of schema.requiredAttributes) {
                if (!(attr in entity.attributes)) {
                    console.warn(`[EntityValidator] Missing attribute '${attr}' for ${entityId}`);
                    return null;
                }
            }
        }

        if (schema.numericAttribute) {
            for (const [attr, options] of Object.entries(schema.numericAttribute)) {
                const value = parseFloat(entity.attributes?.[attr]);
                if (isNaN(value)) {
                    console.warn(`[EntityValidator] ${attr} is not numeric for ${entityId}`);
                    return null;
                }
                if (options.min !== undefined && value < options.min) {
                    console.warn(`[EntityValidator] ${attr} (${value}) below minimum ${options.min}`);
                    return null;
                }
                if (options.max !== undefined && value > options.max) {
                    console.warn(`[EntityValidator] ${attr} (${value}) above maximum ${options.max}`);
                    return null;
                }
            }
        }

        return entity;
    }

    static getNumericAttribute(entity, attributeName, defaultValue = 0) {
        if (!entity || !entity.attributes) return defaultValue;
        const value = parseFloat(entity.attributes[attributeName]);
        return isNaN(value) ? defaultValue : value;
    }

    static getStringAttribute(entity, attributeName, defaultValue = '') {
        if (!entity || !entity.attributes) return defaultValue;
        const value = entity.attributes[attributeName];
        return (value !== null && value !== undefined) ? String(value) : defaultValue;
    }
}

/**
 * Immutable-style data transfer object that holds the current weather state
 * consumed by the rendering pipeline. Normalises raw data (from real HA entities
 * or from DemoEngine) into a single, consistent shape with safe defaults, so
 * rendering methods never need to guard against missing or undefined fields.
 */
class MeteoState {
    constructor(data = {}) {
        this.condition = data.condition || 'sunny';
        this.isNight = data.isNight ?? false;
        this.sunPos = data.sunPos || {
            left: 50,
            top: 50,
            elevation: 80,
            azimuth: 160
        };
        this.moonPos = data.moonPos || {
            left: 50,
            top: 50,
            elevation: -25,
            azimuth: 340
        };
        this.moonPhase = data.moonPhase || 'Full Moon';
        this.moonPhaseDegrees = data.moonPhaseDegrees || 0;
        this.rising = data.rising ?? false;
        const _now = new Date();
        this.simulatedHour = data.simulatedHour ?? (_now.getHours() + _now.getMinutes() / 60);
        this.windSpeed = data.windSpeed ?? 25;
    }
}

/**
 * Holds the resolved card configuration, merging user-supplied YAML values over
 * a comprehensive set of built-in defaults (DEFAULTS). Deep merge ensures nested
 * objects like sun, moon, clouds, colors, and conditions can be partially
 * overridden without losing unmentioned keys.
 * Values are accessed via get(dotted.path) to avoid scattered optional-chain
 * gymnastics throughout rendering code.
 */
class MeteoConfig {
    static DEFAULTS = {
        weather: 'weather.home',
        sun_entity: 'sun.sun',
        moon_azimuth_entity: 'sensor.luna_lunar_azimuth',
        moon_elevation_entity: 'sensor.luna_lunar_elevation',
        moon_phase_entity: 'sensor.luna_lunar_phase',
        moon_degrees_entity: 'sensor.luna_lunar_phase_degrees',
        house_angle: 25,
        invert_azimuth: false,
        singleton_id: "UUID",
        orbit: {
            rx: 45,
            ry: 40,
            cx: 50,
            cy: 50,
            tilt: 0
        },
        sun: {
            disc_radius: 8,
            halo_radius: 50,
            aura_radius: 130,
            aura_opacity: 0.15,
            halo_opacity: 0.4,
            zoom: 1.0,
            sunset_limits: [0, 5],
            sunrise_limits: [0, 5],
            colors: {
                aura: '#FFCC00',
                halo: '#FFFFFF',
                disc: '#FFFFFF'
            },
            lens_flare: {
                enabled: true,
                halo_radius: 120,
                halo_stroke_width: 2,
                halo_opacity: 0.3,
                inner_halo_radius: 50,
                inner_halo_stroke_width: 1,
                inner_halo_opacity: 0.2,
                flares: [{
                        distance: 80,
                        radius: 18,
                        color: '#FFFFFF',
                        opacity: 0.25
                    },
                    {
                        distance: 130,
                        radius: 12,
                        color: '#FFAAFF',
                        opacity: 0.15
                    },
                    {
                        distance: 160,
                        radius: 8,
                        color: '#AAFFFF',
                        opacity: 0.1
                    }
                ],
                glow_stdDeviation: 3
            }
        },
        moon: {
            disc_radius: 8,
            halo_radius: 35,
            aura_radius: 80,
            aura_opacity: 0.1,
            halo_opacity: 0.2,
            zoom: 1.0,
            colors: {
                aura: '#FFFFFF',
                disc_light: '#FDFDFD',
                disc_dark: '#9595A5'
            }
        },
        rain_intensity: {
            width: 1,
            heavy: 200,
            normal: 100,
            low: 50
        },
        snow_intensity: {
            normal: 80
        },
        clouds: {
            heavy: [15, 5, 4],
            normal: [10, 3, 2],
            low: [4, 2, 1],
            minimal: [2, 2, 0],
            none: [0, 0, 0],
            animation: {
                min_margin: 5,
                max_margin: 85,
                random_variation: 0.3
            }
        },
        fog: {
            opacity_min: 0.15,
            opacity_max: 0.85,
            blur: 15,
            height: 180,
            count: 4
        },
        shadow: {
            depthmap: null,
            bias: 0.003,
            step: 0.002,
            ambient: 0.2,
            intensity: 0.7
        },
        colors: {
            night: {
                clear: '#25259C 0%, #2A2A60 40%, #0F0344 100%',
                normal: '#272762 0%, #302C2C 100%',
                dark: '#0E0E54 0%, #000000 100%'
            },
            day: {
                normal: '#FFFFFF 0%, #4BA0DB 50%, #004390 100%',
                inter: '#B9DFFF 0%, #B0C4C8 60%, #7A9BA0 100%',
                rainy: '#B9DFFF 0%, #C1CBD0 60%, #91A6B0 100%',
                dark: '#B9DFFF 0%, #2F4F4F 60%, #708090 100%',
                snowy: '#B0E2FF 0%, #AAAAAA 60%, #D3D3D3 100%',
                grey: '#B4C4CB 0%, #A4A6A8 60%, #94A9C7 100%'
            },
            sunrise: '#FFF5C3 0%, #FFD966 10%, #FFA64D 30%, #FF7F50 50%, #5D0000 80%, #002340 100%',
            sunset: '#FEFEFFCC 0%, #ECFF00 10%, #FD3229 25%, #F30000 45%, #5D0000 75%, #001A33 100%'
        },
        conditions: {
            'lightning-rainy': {
                clouds: 'heavy',
                background_ratio: 0.3,
                day_sky: 'dark',
                night_sky: 'dark',
                drops: 'heavy',
                lightning: true
            },
            'pouring': {
                clouds: 'heavy',
                background_ratio: 0.3,
                day_sky: 'dark',
                night_sky: 'dark',
                drops: 'normal'
            },
            'rainy': {
                clouds: 'normal',
                background_ratio: 0.7,
                day_sky: 'rainy',
                night_sky: 'normal',
                drops: 'low'
            },
            'snowy': {
                clouds: 'normal',
                background_ratio: 0.5,
                day_sky: 'snowy',
                night_sky: 'normal',
                flakes: 'normal'
            },
            'cloudy': {
                clouds: 'heavy',
                background_ratio: 0.6,
                day_sky: 'grey',
                night_sky: 'normal'
            },
            'partlycloudy': {
                clouds: 'low',
                background_ratio: 0.8,
                day_sky: 'inter',
                night_sky: 'normal'
            },
            'sunny': {
                clouds: 'minimal',
                background_ratio: 0.9,
                day_sky: 'normal',
                night_sky: 'clear'
            },
            'clear-night': {
                clouds: 'none',
                background_ratio: 0.5,
                day_sky: 'normal',
                stars: true,
                night_sky: 'clear'
            },
            'fog': {
                clouds: 'none',
                background_ratio: 0.3,
                fog: true,
                day_sky: 'grey',
                night_sky: 'normal'
            },
            'default': {
                clouds: 'low',
                background_ratio: 0.5,
                day_sky: 'normal',
                night_sky: 'normal'
            }
        },
        layers: ['sky', 'sun', 'moon', 'background', 'foreground', 'demo_mode']
    };

    constructor(yamlConfig = {}) {
        this.raw = JSON.parse(JSON.stringify(MeteoConfig.DEFAULTS));
        if (yamlConfig && typeof yamlConfig === 'object') {
            this._deepMerge(this.raw, yamlConfig);
        }
    }

    _deepMerge(target, source) {
        if (!source) return;
        for (const key in source) {
            if (Object.hasOwn(source, key)) {
                const sourceVal = source[key];
                const targetVal = target[key];
                if (sourceVal !== null && sourceVal !== undefined) {
                    if (typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
                        typeof targetVal === 'object' && !Array.isArray(targetVal)) {
                        this._deepMerge(targetVal, sourceVal);
                    } else {
                        target[key] = sourceVal;
                    }
                }
            }
        }
    }

    get(path, defaultValue = undefined) {
        const parts = path.split('.');
        let current = this.raw;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return defaultValue !== undefined ? defaultValue : null;
            }
        }
        return current;
    }
}

/**
 * LRU (Least Recently Used) cache for MeteoCoordsCalculator results.
 * Coordinate projection involves trigonometry that is called every animation
 * frame; caching avoids redundant computation when azimuth and elevation have
 * not changed. The cache is keyed on rounded (azimuth:elevation) pairs and
 * evicts the oldest entry once it reaches MAX_SIZE entries.
 * One instance lives per MeteoCard and is cleared whenever the sun moves.
 */
class CoordsCache {
    static MAX_SIZE = 200;

    constructor() {
        this.cache = new Map();
    }

    getCoords(azimuth, elevation, config) {
        const key = `${Math.round(azimuth * 10) / 10}:${Math.round(elevation * 10) / 10}`;

        if (this.cache.has(key)) {
            const val = this.cache.get(key);
            // Refresh insertion order for LRU
            this.cache.delete(key);
            this.cache.set(key, val);
            return val;
        }

        const coords = MeteoCoordsCalculator.getCoords(azimuth, elevation, config);
        if (this.cache.size >= CoordsCache.MAX_SIZE) {
            // Evict oldest entry (first key in insertion order)
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, coords);
        return coords;
    }

    clear() {
        this.cache.clear();
    }
}

/**
 * Single shared requestAnimationFrame loop used by all slave MeteoCard instances
 * (cards that mirror the state computed by the demo-master). Instead of each
 * slave running its own rAF loop, they all register here so the browser schedules
 * a single callback per frame. Cards are automatically unregistered when they
 * disconnect or scroll off-screen (via IntersectionObserver), and the loop stops
 * entirely when no cards remain registered.
 */
class SharedAnimationLoop {
    static registeredCards = new Set();
    static rafId = null;
    static isRunning = false;
    static lastFrameTime = 0;

    static register(card) {
        if (!card || typeof card._updateOptimized !== 'function') {
            console.warn('[SharedAnimationLoop] Invalid card registration');
            return;
        }

        SharedAnimationLoop.registeredCards.add(card);

        if (!SharedAnimationLoop.isRunning) {
            SharedAnimationLoop.start();
        }
    }

    static unregister(card) {
        SharedAnimationLoop.registeredCards.delete(card);

        if (SharedAnimationLoop.registeredCards.size === 0) {
            SharedAnimationLoop.stop();
        }
    }

    static start() {
        if (SharedAnimationLoop.isRunning) {
            return;
        }

        SharedAnimationLoop.isRunning = true;
        SharedAnimationLoop.lastFrameTime = Date.now();

        const loop = () => {
            try {
                const currentTime = Date.now();
                SharedAnimationLoop.lastFrameTime = currentTime;

                const cardsToUpdate = Array.from(SharedAnimationLoop.registeredCards);

                for (const card of cardsToUpdate) {
                    if (card && card.isConnected && typeof card._updateOptimized === 'function') {
                        try {
                            card._updateOptimized();
                        } catch (e) {
                            console.error('[SharedAnimationLoop] Card update error:', e);
                        }
                    }
                }

                if (SharedAnimationLoop.isRunning) {
                    SharedAnimationLoop.rafId = requestAnimationFrame(loop);
                }
            } catch (e) {
                console.error('[SharedAnimationLoop] Loop error:', e);
                SharedAnimationLoop.stop();
            }
        };

        SharedAnimationLoop.rafId = requestAnimationFrame(loop);
    }

    static stop() {
        if (SharedAnimationLoop.rafId !== null) {
            cancelAnimationFrame(SharedAnimationLoop.rafId);
            SharedAnimationLoop.rafId = null;
        }

        SharedAnimationLoop.isRunning = false;
        SharedAnimationLoop.lastFrameTime = 0;
    }

    static getCardCount() {
        return SharedAnimationLoop.registeredCards.size;
    }

    static isActive() {
        return SharedAnimationLoop.isRunning;
    }
}

/**
 * Main custom element (<meteo-card>) registered with the Home Assistant Lovelace
 * dashboard. Responsible for the full lifecycle of the weather card:
 *  - setConfig(): parses YAML config, elects demo/data master via SingletonManager,
 *    and performs the initial render.
 *  - hass setter: receives live HA state updates, validates entities, throttles
 *    redundant renders, and delegates to _update().
 *  - _renderAll(): full DOM rebuild into a DocumentFragment (prevents flash-of-
 *    unstyled content), injects CSS via Adopted StyleSheets or a <style> fallback.
 *  - _updateDynamic(): lightweight per-frame update that mutates only changed
 *    attributes (position, rotation, opacity) without touching the full DOM.
 *  - Demo mode: the elected UI master runs DemoEngine in a rAF loop; slaves
 *    mirror the shared state via SharedAnimationLoop.
 * Uses a Shadow DOM to isolate styles while still inheriting CSS custom properties
 * from the HA theme.
 */
class MeteoCard extends HTMLElement {
    constructor() {
        super();
        this._cardId = 'meteo-' + _genId();
        this._singletonId = null;
        this._sharedState = null;
        this._isDemoUIMaster = false;
        this._isDemoLayerEnabled = false;
        this._demoEngine = null;
        this._registeredInSingleton = false;
        this._cloudCounter = 0;
        this._moonMaskIdCounter = 0;
        this._initialized = false;
        this._lastHassUpdate = 0;
        this._demoRequest = undefined;
        this._slaveListenerRequest = undefined;
        this._previousStates = {};
        this._domCache = {};
        this._demoListeners = [];
        this._dynamicStyleSheet = null;
        this._loadedKeyframes = null;
        this._keyframesSheet = null;
        this._weatherEntityId = null;
        this._sunEntityId = null;
        this._moonAzimuthEntityId = null;
        this._moonElevationEntityId = null;
        this._moonPhaseEntityId = null;
        this._moonDegreesEntityId = null;
        this._meteoConfig = null;
        this._validatedEntities = {
            weather: null,
            sun: null,
            moonAzimuth: null,
            moonElevation: null,
            moonPhase: null,
            moonDegrees: null
        };
        this._lastCondition = null;
        this._lastNight = null;
        this._hass = null;
        this._isDataMaster = false;
        this._coordsCache = new CoordsCache();
        this._lastSunAzimuth = null;
        this._lastSunElevation = null;
        this._lastLayers = [];
        this._lastSunElevationForSVG = null;
        this._lastMoonPhaseForSVG = null;
        this._lastMoonPhaseDegreesForSVG = null;
        this._lastLensMinute = null;
        this._lastDemoUIUpdate = 0;
        this._editModeHandler = null;
        // Cached references for demo UI hot-path (avoid querySelector every frame).
        this._demoCacheStats = null;
        this._demoCacheBtn   = null;
        this._demoCacheSelect = null;
        // IntersectionObserver: pause SharedAnimationLoop when off-screen.
        this._visibilityObserver = null;
        this._isVisible = true;
        this._isSlaveListening = false;
        // Open shadow root once — all internal DOM lives here, isolating CSS
        // from HA global themes while CSS custom properties still penetrate.
        this.attachShadow({ mode: 'open' });
    }

    set hass(hass) {
        try {
            if (!this._ensureContent()) return;

            this._hass = hass;

            if (this._singletonId && !this._registeredInSingleton) {
                SingletonManager.registerCard(this._singletonId, this._cardId);
                this._registeredInSingleton = true;
            }

            const sharedState = SingletonManager.getSingleton(this._singletonId);

            const demoState = SingletonManager.getDemoState(this._singletonId);

            if (demoState === 'running') {
                return;
            }

            if (!sharedState.realDataReady && demoState !== 'running') {
                this._validateEntitiesFromHass(hass);
                const realData = this._realData();
                if (realData) {
                    SingletonManager.setActualState(this._singletonId, realData);
                    sharedState.realDataReady = true;
                    sharedState.realDataTimestamp = Date.now();
                }
            }

            const now = Date.now();
            if (this._initialized && this._lastHassUpdate && now - this._lastHassUpdate < 1000) {
                return;
            }
            this._lastHassUpdate = now;

            const newWeatherState = hass.states[this._weatherEntityId]?.state;
            const sunAttrs = hass.states[this._sunEntityId]?.attributes;
            const newSunAzimuth   = sunAttrs?.azimuth;
            const newSunElevation = sunAttrs?.elevation;

            if (this._initialized &&
                this._previousStates.weather   === newWeatherState &&
                this._previousStates.azimuth   === newSunAzimuth   &&
                this._previousStates.elevation === newSunElevation) {
                return;
            }

            this._previousStates.weather   = newWeatherState;
            this._previousStates.azimuth   = newSunAzimuth;
            this._previousStates.elevation = newSunElevation;

            if (this._validatedEntities.weather === null) {
                this._validateEntitiesFromHass(hass);
            }

            this._update();
        } catch (e) {
            console.error('[MeteoCard] hass setter:', e);
        }
    }

    _validateEntitiesFromHass(hass) {
        try {
            this._validatedEntities.weather = EntityValidator.validate(hass, this._weatherEntityId, {
                state: true
            });
            this._validatedEntities.sun = EntityValidator.validate(hass, this._sunEntityId, {
                requiredAttributes: ['azimuth', 'elevation'],
                numericAttribute: {
                    'azimuth': {
                        min: 0,
                        max: 360
                    },
                    'elevation': {
                        min: -180,
                        max: 180
                    }
                }
            });

            const currentSunAz = parseFloat(hass.states[this._sunEntityId]?.attributes?.azimuth);
            const currentSunEl = parseFloat(hass.states[this._sunEntityId]?.attributes?.elevation);

            if (!isNaN(currentSunAz) && !isNaN(currentSunEl)) {
                if (this._lastSunAzimuth !== currentSunAz || this._lastSunElevation !== currentSunEl) {
                    this._coordsCache.clear();
                    this._lastSunAzimuth = currentSunAz;
                    this._lastSunElevation = currentSunEl;
                }
            }

            this._validatedEntities.moonAzimuth = this._resolveMoonEntity(hass, this._moonAzimuthEntityId, ['sensor.luna_lunar_azimuth', 'sensor.moon_azimuth']);
            this._validatedEntities.moonElevation = this._resolveMoonEntity(hass, this._moonElevationEntityId, ['sensor.luna_lunar_elevation', 'sensor.moon_elevation']);
            this._validatedEntities.moonPhase = this._resolveMoonEntity(hass, this._moonPhaseEntityId, ['sensor.luna_lunar_phase', 'sensor.moon_phase']);
            this._validatedEntities.moonDegrees = this._resolveMoonEntity(hass, this._moonDegreesEntityId, ['sensor.luna_lunar_phase_degrees', 'sensor.moon_phase_degrees']);
        } catch (e) {
            console.error('[MeteoCard] _validateEntitiesFromHass:', e);
        }
    }

    _resolveMoonEntity(hass, configured, fallbacks) {
        // Use the explicitly configured entity, or fall back to the first valid entity from the fallback list.
        if (configured) return EntityValidator.validate(hass, configured);
        return fallbacks.reduce((found, id) => found || EntityValidator.validate(hass, id), null);
    }

    _ensureContent() {
        if (this.content) return true;
        // Safe to access this.style here — element is being adopted into a document
        if (!this._opacityInitialized) {
            this._opacityInitialized = true;
            this.style.opacity = '0';
            this.style.transition = 'opacity 0.25s ease-out';
        }
        this.content = this.shadowRoot.querySelector('ha-card');
        if (!this.content) {
            const card = document.createElement('ha-card');
            this.shadowRoot.appendChild(card);
            this.content = card;
            if (!this.content) {
                console.error('[MeteoCard] Failed to create ha-card content');
                return false;
            }
        }
        this.content.id = this._cardId;
        this._injectStyles();
        return true;
    }

    setConfig(config) {
        try {
            if (!this._cardId) {
                this._cardId = 'card_' + _genId();
            }

            this._meteoConfig = new MeteoConfig(config);
            this._sunSVGCache = null;

            const layers = this._meteoConfig.get('layers') || [];
            const demoLayer = layers.find(l => typeof l === 'string' && l.startsWith('demo_mode'));

            this._singletonId = config.singleton_id || demoLayer || this._cardId;
            SingletonManager.getSingleton(this._singletonId);

            this._isDemoLayerEnabled = !!demoLayer;

            SingletonManager.registerCard(this._singletonId, this._cardId);
            this._registeredInSingleton = true;

            const isDataMaster = SingletonManager.electDataMaster(
                this._singletonId,
                this._cardId,
                this._isDemoLayerEnabled
            );
            this._isDataMaster = isDataMaster;

            this._isDemoUIMaster = this._isDemoLayerEnabled && SingletonManager.isMaster(this._singletonId, this._cardId);

            this._sharedState = SingletonManager.getSingleton(this._singletonId);

            if (this._isDemoUIMaster && !this._demoEngine) {
                this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                const initialState = this._demoEngine.compute();
                SingletonManager.setActualState(this._singletonId, initialState);
            }

            this._weatherEntityId = this._meteoConfig.get('weather');
            this._sunEntityId = this._meteoConfig.get('sun_entity');
            this._moonAzimuthEntityId = this._meteoConfig.get('moon_azimuth_entity');
            this._moonElevationEntityId = this._meteoConfig.get('moon_elevation_entity');
            this._moonPhaseEntityId = this._meteoConfig.get('moon_phase_entity');
            this._moonDegreesEntityId = this._meteoConfig.get('moon_degrees_entity');

            this._validatedEntities = {
                weather: null,
                sun: null,
                moonAzimuth: null,
                moonElevation: null,
                moonPhase: null,
                moonDegrees: null
            };

            if (!this._ensureContent()) return;

            if (this._isDemoLayerEnabled && !this._isDemoUIMaster) {
                this._startSlaveListener();
            } else if (!this._isDemoLayerEnabled && this._sharedState.registeredCards.size > 1) {
                this._startSlaveListener();
            }

            if (!this._initialized) {
                const existingState = SingletonManager.getActualState(this._singletonId);

                if (existingState) {
                    this._initialized = true;
                    this._renderAll(new MeteoState(existingState));
                } else {
                    const defaultState = new MeteoState({
                        condition: 'sunny',
                        isNight: false,
                        sunPos: {
                            left: 50,
                            top: 50,
                            elevation: 80,
                            azimuth: 160
                        },
                        moonPos: {
                            left: 50,
                            top: 50,
                            elevation: -25,
                            azimuth: 340
                        },
                        windSpeed: 0
                    });
                    this._renderAll(defaultState);
                }

                const retryData = () => {
                    if (SingletonManager.getDemoState(this._singletonId) === 'running') return;
                    if (this._hass) {
                        this._validateEntitiesFromHass(this._hass);
                        const realData = this._realData();
                        if (realData) {
                            SingletonManager.setActualState(this._singletonId, realData);
                            this._sharedState.realDataReady = true;
                            this._update();
                        }
                    }
                };

                setTimeout(retryData, 10);
                setTimeout(retryData, 100);
            }

        } catch (e) {
            console.error('[MeteoCard] setConfig:', e);
        }
    }

    _startSlaveListener() {
        if (this._slaveListenerRequest) {
            cancelAnimationFrame(this._slaveListenerRequest);
            this._slaveListenerRequest = undefined;
        }

        this._isSlaveListening = true;
        // Only register in the animation loop if the card is currently visible.
        if (this._isVisible) {
            SharedAnimationLoop.register(this);
        }
    }

    _stopSlaveListener() {
        this._isSlaveListening = false;
        SharedAnimationLoop.unregister(this);
        this._slaveListenerRequest = undefined;
    }

    // Entry point called by SharedAnimationLoop every rAF frame for slave cards.
    // The isConnected guard prevents stale updates on cards that disconnected
    // between the rAF schedule and its execution.
    _updateOptimized() {
        try {
            if (!this.isConnected) {
                return;
            }

            this._update();
        } catch (e) {
            console.error('[MeteoCard] _updateOptimized:', e);
        }
    }

    connectedCallback() {
        try {
            if (super.connectedCallback) {
                super.connectedCallback();
            }

            if (!this._ensureContent()) return;

            // On reconnect (e.g. switching HA views back), re-register in singleton
            // and force the next hass update to re-render, bypassing stale throttle/flags.
            if (this._singletonId && this._meteoConfig) {
                const singleton = SingletonManager.getSingleton(this._singletonId);
                if (!singleton.registeredCards.has(this._cardId)) {
                    SingletonManager.registerCard(this._singletonId, this._cardId);
                    this._registeredInSingleton = true;
                }
                // Reset flags so next hass setter triggers a full re-render.
                this._initialized = false;
                this._lastHassUpdate = 0;
                this._lastCondition = null;
                this._lastNight = null;
                this._lastDemoState = null;
                this._previousStates = {};
                // Reset demo master flag so _update() re-elects and restarts the demo
                // (new singleton has demoState='stopped', so the flag must be cleared
                //  to enter the election branch that calls SingletonManager.startDemo).
                if (this._isDemoLayerEnabled) {
                    this._isDemoUIMaster = false;
                }
                // Re-attach demo control listeners (removed by _cleanupAllListeners
                // on disconnect, but _demoControlsCreated prevents DOM recreation).
                if (this._demoControlsCreated) {
                    this._attachDemoListeners();
                }
                // Restart slave listener if needed.
                if (this._isDemoLayerEnabled && !this._isDemoUIMaster) {
                    this._startSlaveListener();
                } else if (!this._isDemoLayerEnabled && singleton.registeredCards.size > 1) {
                    this._startSlaveListener();
                }
            }

            this._lastEditMode = false;
            const checkEditMode = () => {
                try {
                    const root = this.getRootNode();
                    if (!root || !root.host) return;
                    const lovelace = root.host.lovelace;
                    const isEditMode = lovelace?.editMode === true;
                    if (isEditMode !== this._lastEditMode) {
                        this._lastEditMode = isEditMode;
                        if (!isEditMode && this._initialized) {
                            const state = SingletonManager.getActualState(this._singletonId);
                            if (state && this.content && this.isConnected) {
                                this._forceRerender(new MeteoState(state));
                            }
                        }
                    }
                } catch (e) {
                    console.error('[MeteoCard] Edit mode check error:', e);
                }
            };
            this._editModeHandler = checkEditMode;
            window.addEventListener('ll-edit-mode-changed', checkEditMode);
            // Slow fallback for environments where the event is not fired
            this._editCheckInterval = setInterval(checkEditMode, 2000);

            if (this._isDemoUIMaster && !this._demoRequest && SingletonManager.getDemoState(this._singletonId) === 'running') {
                this._startDemo();
            }

            // Pause all animation when the card scrolls off-screen, resume when it returns.
            // threshold:0 fires as soon as a single pixel enters/leaves the viewport.
            this._isVisible = true;
            this._visibilityObserver = new IntersectionObserver(entries => {
                this._isVisible = entries[0].isIntersecting;
                if (this._isVisible) {
                    // Resume slave sync loop.
                    if (this._isSlaveListening) SharedAnimationLoop.register(this);
                    // Resume demo master rAF loop if the demo is still running.
                    if (this._isDemoUIMaster && !this._demoRequest &&
                        SingletonManager.getDemoState(this._singletonId) === 'running') {
                        this._startDemo();
                    }
                } else {
                    SharedAnimationLoop.unregister(this);
                    // Suspend demo master rAF loop — does not reset demo state or time offset.
                    if (this._isDemoUIMaster) this._stopDemo();
                }
            }, { threshold: 0 });
            this._visibilityObserver.observe(this);
        } catch (e) {
            console.error('[MeteoCard] connectedCallback:', e);
        }
    }

    disconnectedCallback() {
        try {
            if (this._visibilityObserver) {
                this._visibilityObserver.disconnect();
                this._visibilityObserver = null;
            }

            if (this._editModeHandler) {
                window.removeEventListener('ll-edit-mode-changed', this._editModeHandler);
                this._editModeHandler = null;
            }
            if (this._editCheckInterval) {
                clearInterval(this._editCheckInterval);
                this._editCheckInterval = null;
            }

            if (this._demoRequest) {
                cancelAnimationFrame(this._demoRequest);
                this._demoRequest = undefined;
            }

            SharedAnimationLoop.unregister(this);
            SingletonManager.unregisterCard(this._singletonId, this._cardId);
            this._registeredInSingleton = false;
            this._cleanup();

            if (super.disconnectedCallback) {
                super.disconnectedCallback();
            }
        } catch (e) {
            console.error('[MeteoCard] disconnectedCallback:', e);
        }
    }

    // Clears all render caches and performs a full re-render from a given state.
    // Called when Lovelace exits edit mode to discard any DOM mutations the editor
    // may have introduced during the editing session.
    _forceRerender(state) {
        try {
            if (!this.content) {
                const card = document.createElement('ha-card');
                this.shadowRoot.appendChild(card);
                this.content = card;
                if (!this.content) return;
            }

            this._clearDOMCache();
            this._initialized = false;
            this._lastCondition = null;
            this._lastNight = null;
            this._lastDemoState = null;

            this._renderAll(state);
        } catch (e) {
            console.error('[MeteoCard] _forceRerender:', e);
        }
    }

    // Promotes this card to data master if the current master has gone away
    // (e.g. disconnected without unregistering). Guards against a singleton
    // group being left with real data updates blocked because no master exists.
    _recheckMaster() {
        const singleton = SingletonManager.getSingleton(this._singletonId);
        if (!singleton.dataMaster || !singleton.registeredCards.has(singleton.dataMaster)) {
            singleton.dataMaster = this._cardId;
        }
    }

    _checkForMasterAndStartDemo() {
        const sharedState = SingletonManager.getSingleton(this._singletonId);

        const shouldBeDataMaster = SingletonManager.electDataMaster(
            this._singletonId,
            this._cardId,
            this._isDemoLayerEnabled
        );

        if (shouldBeDataMaster && !this._isDataMaster) {
            this._isDataMaster = true;
        }
        if (!shouldBeDataMaster && this._isDataMaster) {
            this._isDataMaster = false;
        }

        if (this._isDemoLayerEnabled) {
            const isMaster = SingletonManager.isMaster(this._singletonId, this._cardId);

            if (isMaster && !this._isDemoUIMaster) {
                this._isDemoUIMaster = true;
                if (!this._demoEngine) {
                    this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                    const initialState = this._demoEngine.compute();
                    SingletonManager.setActualState(this._singletonId, initialState);
                }
                SingletonManager.startDemo(this._singletonId);
                this._startDemo();
            }

            if (!isMaster && this._isDemoUIMaster) {
                this._isDemoUIMaster = false;
                this._stopDemo();
            }
        }
    }

    getCardSize() {
        return 6;
    }

    getGridOptions() {
        return {
            min_columns: 2,
            max_columns: 4,
            min_rows: 3,
            max_rows: 10
        };
    }

    static getStubConfig() {
        return {
            weather: 'weather.home',
            sun_entity: 'sun.sun',
            layers: ['sky', 'sun', 'moon', 'background', 'foreground']
        };
    }

    _cleanup() {
        this._stopSlaveListener();
        this._stopDemo();
        this._cleanupAllListeners();
        this._cleanupShadow();
        this._clearDOMCache();
        this._coordsCache.clear();
        this._demoListeners = [];
        this._previousStates = {};
    }

    _cleanupAllListeners() {
        this._demoListeners.forEach(({
            el,
            ev,
            fn
        }) => {
            if (el && typeof el.removeEventListener === 'function') {
                el.removeEventListener(ev, fn);
            }
        });
        this._demoListeners = [];

        if (this._boundPlayPauseFn) {
            const btn = this.shadowRoot.querySelector('#btn-toggle-demo');
            if (btn) btn.removeEventListener('click', this._boundPlayPauseFn);
            this._boundPlayPauseFn = null;
        }

        if (this._boundStopFn) {
            const stopBtn = this.shadowRoot.querySelector('#btn-stop-demo');
            if (stopBtn) stopBtn.removeEventListener('click', this._boundStopFn);
            this._boundStopFn = null;
        }

        if (this._boundSelectFn) {
            const select = this.shadowRoot.querySelector('#select-demo-condition');
            if (select) select.removeEventListener('change', this._boundSelectFn);
            this._boundSelectFn = null;
        }

        if (this.content) {
            this.content.onclick = null;
        }

        this._hasEvents = false;
        this._demoListenersBound = false;
    }

    _clearDOMCache() {
        Object.keys(this._domCache).forEach(key => {
            this._domCache[key] = null;
        });
        this._domCache = {
            skyBg: null,
            sunWrapper: null,
            sunContainer: null,
            moonContainer: null,
            lensFlare: null,
            shadowCanvas: null
        };
    }

    _clearStyleSheets() {
        if (this._dynamicStyleSheet && this._dynamicStyleSheet.parentNode) {
            try {
                this._dynamicStyleSheet.parentNode.removeChild(this._dynamicStyleSheet);
            } catch (e) {
                console.warn('[MeteoCard] Error removing dynamicStyleSheet:', e);
            }
        }
        this._dynamicStyleSheet = null;

        if (this._keyframesSheet && this._keyframesSheet.parentNode) {
            try {
                this._keyframesSheet.parentNode.removeChild(this._keyframesSheet);
            } catch (e) {
                console.warn('[MeteoCard] Error removing keyframesSheet:', e);
            }
        }
        this._keyframesSheet = null;

        // Adopted StyleSheets path: remove the shared sheet from this shadow root.
        if (_meteoSharedSheet && this.shadowRoot.adoptedStyleSheets.includes(_meteoSharedSheet)) {
            this.shadowRoot.adoptedStyleSheets = this.shadowRoot.adoptedStyleSheets.filter(s => s !== _meteoSharedSheet);
        }

        // Fallback path: remove the injected <style> element if present.
        const injectedStyle = this.shadowRoot.querySelector('style[data-meteo-injected]');
        if (injectedStyle && injectedStyle.parentNode) {
            try {
                injectedStyle.parentNode.removeChild(injectedStyle);
            } catch (e) {
                console.warn('[MeteoCard] Error removing injectedStyle:', e);
            }
        }
    }

    _startDemo() {
        this._stopDemo();

        const demoStartTime = Date.now();
        // Auto-stop demo after 10 minutes to avoid running indefinitely.
        const demoDuration = 10 * 60 * 1000;
        let frameCount = 0;

        const loop = () => {
            frameCount++;
            const currentTime = Date.now();

            if (!this.isConnected) {
                this._demoRequest = undefined;
                return;
            }

            const demoState = SingletonManager.getDemoState(this._singletonId);
            const sharedState = SingletonManager.getSingleton(this._singletonId);

            if (!sharedState.realDataReady) {
                if (!this._isDemoUIMaster || demoState === 'stopped') {
                    if (this._hass) {
                        this._validateEntitiesFromHass(this._hass);
                        const realData = this._realData();
                        if (realData) {
                            SingletonManager.setActualState(this._singletonId, realData);
                            sharedState.realDataReady = true;
                        }
                    }
                }
            }

            if (demoState === 'stopped') {
                this._demoRequest = undefined;
                return;
            }

            const elapsedTime = currentTime - demoStartTime;
            if (elapsedTime >= demoDuration) {
                SingletonManager.stopDemo(this._singletonId);
                this._demoRequest = undefined;
                return;
            }

            try {
                if (demoState === 'running') {
                    const demoStateObj = this._demoEngine.compute();
                    SingletonManager.setActualState(this._singletonId, demoStateObj);
                    this._update();
                }
            } catch (e) {
                console.error('[MeteoCard] demo loop error at frame ' + frameCount + ':', e);
            }

            this._demoRequest = requestAnimationFrame(loop);
        };

        this._demoRequest = requestAnimationFrame(loop);
    }

    _stopDemo() {
        if (this._demoRequest) {
            cancelAnimationFrame(this._demoRequest);
            this._demoRequest = undefined;
        }
    }

    _safe(text) {
        // Escape HTML to prevent XSS when inserting dynamic strings into innerHTML.
        if (text === null || text === undefined) return '?';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    _getCoords(azimuth, elevation) {
        return MeteoCoordsCalculator.getCoords(azimuth, elevation, this._meteoConfig);
    }

    _update() {
        try {
            if (!this.content) return;

            const layers = this._meteoConfig.get('layers') || [];
            const demoLayerExists = layers.find(l => typeof l === 'string' && l.startsWith('demo_mode'));
            const wasDemoLayerEnabled = this._isDemoLayerEnabled;
            this._isDemoLayerEnabled = !!demoLayerExists;

            const layersChanged = layers.length !== this._lastLayers.length ||
                layers.some((l, i) => l !== this._lastLayers[i]);
            this._lastLayers = [...layers];

            if (wasDemoLayerEnabled !== this._isDemoLayerEnabled) {
                this._checkForMasterAndStartDemo();
            }

            const sharedState = SingletonManager.getSingleton(this._singletonId);
            let rawData = SingletonManager.getActualState(this._singletonId);

            if (this._isDemoLayerEnabled) {
                const shouldBeMaster = SingletonManager.isMaster(this._singletonId, this._cardId);
                if (shouldBeMaster && !this._isDemoUIMaster) {
                    this._isDemoUIMaster = true;
                    if (!this._demoEngine) {
                        this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                        const initialState = this._demoEngine.compute();
                        SingletonManager.setActualState(this._singletonId, initialState);
                    }
                    SingletonManager.startDemo(this._singletonId);
                    this._startDemo();
                    rawData = SingletonManager.getActualState(this._singletonId);
                }
                if (!shouldBeMaster && this._isDemoUIMaster) {
                    this._isDemoUIMaster = false;
                    this._stopDemo();
                }
                if (this._isDemoUIMaster && !this._demoRequest && SingletonManager.getDemoState(this._singletonId) === 'running') {
                    this._startDemo();
                }
            }

            this._updateDemoUI();

            if (!this._hass) {
                if (!this._initialized) {
                    this._renderAll(new MeteoState());
                }
                return;
            }

            if (!rawData && this._hass) {
                const currentDemoState = SingletonManager.getDemoState(this._singletonId);
                if (currentDemoState !== 'running') {
                    rawData = this._realData();
                }
            }

            if (!rawData) return;

            const state = new MeteoState(rawData);
            const demoState = SingletonManager.getDemoState(this._singletonId);

            if (!this._initialized ||
                layersChanged ||
                this._lastCondition !== state.condition ||
                state.isNight !== this._lastNight ||
                this._lastDemoState !== demoState) {
                this._initialized = true;
                this._lastCondition = state.condition;
                this._lastNight = state.isNight;
                this._lastDemoState = demoState;
                this._renderAll(state);
            } else {
                this._updateDynamic(state);
            }
        } catch (e) {
            console.error('[MeteoCard] _update:', e);
        }
    }

    _realData() {
        try {
            if (!this._hass || !this._validatedEntities.weather || !this._validatedEntities.sun) {
                return null;
            }

            const weatherEntity = this._hass.states[this._weatherEntityId];
            const sunEntity = this._hass.states[this._sunEntityId];

            if (!weatherEntity || !sunEntity) return null;

            const cond = this._weatherMatrix(weatherEntity.state);
            const isNight = sunEntity.state === 'below_horizon';

            const sunAzimuth = parseFloat(sunEntity.attributes?.azimuth) || 0;
            const sunElevation = parseFloat(sunEntity.attributes?.elevation) || 0;
            const sunPos = this._coordsCache.getCoords(sunAzimuth, sunElevation, this._meteoConfig);

            const {
                moonAz,
                moonEl
            } = this._calculateMoonCoordinates(sunAzimuth, sunElevation, this._hass);
            const moonPos = this._coordsCache.getCoords(moonAz, moonEl, this._meteoConfig);

            const windSpeed = Math.max(0, parseFloat(weatherEntity.attributes?.wind_speed) || 0);
            const moonPhaseEntity = this._hass.states[this._moonPhaseEntityId];
            const moonDegreesEntity = this._hass.states[this._moonDegreesEntityId];

            const realDataState = {
                condition: cond,
                isNight,
                sunPos,
                moonPos,
                moonPhase: moonPhaseEntity?.state || 'Full Moon',
                moonPhaseDegrees: parseFloat(moonDegreesEntity?.state) || 0,
                rising: sunEntity.attributes?.rising === true,
                simulatedHour: (() => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; })(),
                windSpeed
            };

            if (SingletonManager.getDemoState(this._singletonId) !== 'running') {
                SingletonManager.setActualState(this._singletonId, realDataState);
            }

            return realDataState;
        } catch (e) {
            console.error('[MeteoCard] _realData:', e);
            return null;
        }
    }

    _updateDynamic(state) {
        try {
            if (!this.content) {
                return;
            }

            const sharedState = SingletonManager.getSingleton(this._singletonId);
            this._updateSharedState(state);

            // In demo mode positions change every frame — skip SVG caches entirely.
            const isDemo = SingletonManager.getDemoState(this._singletonId) === 'running';

            const sunWrapper = this._getCachedEl('sunWrapper', '.sun-wrapper');
            if (sunWrapper) this._positionCelestialBody(sunWrapper, sharedState.sunPos);

            const sun = this._getCachedEl('sunContainer', '.sun-container');

            if (sun && sun.parentNode && sharedState.sunPos.elevation >= 0) {
                // _sunSVG() depends only on config — regenerate only when the
                // container is empty (sun rising above horizon after being hidden).
                if (!sun.firstChild) {
                    this._lastSunElevationForSVG = sharedState.sunPos.elevation;
                    sun.innerHTML = this._sunSVG();
                }
            } else if (sun && sun.parentNode && sharedState.sunPos.elevation < 0) {
                if (sun.firstChild) sun.innerHTML = '';
            }

            const lensFlare = this._getCachedEl('lensFlare', '.lens-flare');

            if (lensFlare && lensFlare.parentNode) {
                if (sharedState.sunPos.elevation >= 0 && this._meteoConfig.get('sun.lens_flare.enabled')) {
                    const rotation = this._lensFlareRotation(sharedState.sunPos, isDemo);
                    const elevationOpacity = Math.max(0, Math.min(1, (sharedState.sunPos.elevation + 5) / 20));
                    if (!lensFlare.firstChild) {
                        // First paint: full SVG generation.
                        lensFlare.innerHTML = this._lensFlare(sharedState.sunPos, rotation);
                    } else {
                        // Subsequent updates in both normal and demo mode: mutate only
                        // the attributes that change — no SVG reparse, no DOM rebuild.
                        const g = lensFlare.querySelector('g');
                        if (g) {
                            g.setAttribute('transform', `translate(450, 450) rotate(${rotation})`);
                            g.setAttribute('opacity', elevationOpacity);
                        }
                    }
                } else {
                    lensFlare.innerHTML = '';
                }
            }

            const moon = this._getCachedEl('moonContainer', '.moon-container');
            if (moon) {
                this._positionCelestialBody(moon, sharedState.moonPos);
                if (sharedState.moonPos.elevation >= 0) {
                    const phaseChanged = this._lastMoonPhaseForSVG !== sharedState.moonPhase;
                    const degsChanged  = this._lastMoonPhaseDegreesForSVG !== sharedState.moonPhaseDegrees;
                    if (!moon.firstChild || phaseChanged) {
                        // Phase string changed (mask path shape changes) or first paint:
                        // full rebuild required.
                        this._lastMoonPhaseForSVG = sharedState.moonPhase;
                        this._lastMoonPhaseDegreesForSVG = sharedState.moonPhaseDegrees;
                        moon.innerHTML = this._moonSVG(sharedState.moonPhase, !sharedState.isNight, sharedState.moonPhaseDegrees);
                    } else if (degsChanged) {
                        // Only rotation changed: mutate the three attribute groups
                        // that depend on moonPhaseDegrees, no SVG reparse.
                        this._lastMoonPhaseDegreesForSVG = sharedState.moonPhaseDegrees;
                        const deg = sharedState.moonPhaseDegrees;
                        const svg = moon.querySelector('svg');
                        if (svg) {
                            const maskG = svg.querySelector('mask g');
                            if (maskG) maskG.setAttribute('transform', `translate(150,150) rotate(${deg})`);
                            const distLight = svg.querySelector('feDistantLight');
                            if (distLight) distLight.setAttribute('azimuth', deg);
                            const grad3d = svg.querySelectorAll('radialGradient')[1];
                            if (grad3d) {
                                grad3d.setAttribute('cx', `${40 + Math.cos(deg * Math.PI / 180) * 15}%`);
                                grad3d.setAttribute('cy', `${40 + Math.sin(deg * Math.PI / 180) * 15}%`);
                            }
                            svg.querySelectorAll('[transform*="150 150"]').forEach(el => {
                                el.setAttribute('transform', `rotate(${deg} 150 150)`);
                            });
                        }
                    }
                }
            }

            const sky = this._getCachedEl('skyBg', '.sky-bg');
            if (sky) {
                const conf = this._meteoConfig.get(`conditions.${sharedState.condition}`);
                sky.style.background = this._computeSkyBackground(
                    sharedState.sunPos, sharedState.moonPos, sharedState.isNight, sharedState.rising, conf
                );
            }

            this._updateShadow();
            this._updateDemoUI();
        } catch (e) {
            console.error('[MeteoCard] _updateDynamic:', e);
        }
    }

    _updateDemoUI() {
        const sharedState = SingletonManager.getSingleton(this._singletonId);
        const demoState = SingletonManager.getDemoState(this._singletonId);
        const isRunning = demoState === 'running';

        const statsContainer = this._demoCacheStats || this.shadowRoot.querySelector('.demo-stats-inner');
        if (statsContainer) {
            if (!statsContainer.firstChild) {
                // First paint: full build.
                statsContainer.innerHTML = this._demoUI();
            } else {
                // Subsequent updates: mutate only the value spans — no HTML reparse.
                const set = (key, val) => {
                    const el = statsContainer.querySelector(`[data-stat="${key}"]`);
                    if (el && el.textContent !== val) el.textContent = val;
                };
                const s  = SingletonManager.getSingleton(this._singletonId);
                const sh = s.actualState || {};
                set('state',   s.demoState.toUpperCase());
                set('time',    this._formatTime(sh.simulatedHour || 0));
                set('weather', (sh.condition || '').toUpperCase());
                set('wind',    `${(sh.windSpeed || 0).toFixed(1)} km/h`);
                set('sun',     `${(sh.sunPos?.elevation || 0).toFixed(1)}° | ${(sh.sunPos?.azimuth || 0).toFixed(1)}°`);
                set('moon',    `${(sh.moonPos?.elevation || 0).toFixed(1)}° | ${(sh.moonPos?.azimuth || 0).toFixed(1)}°`);
                set('phase',   `${this._safe(sh.moonPhase)} | ${(sh.moonPhaseDegrees || 0).toFixed(1)}°`);
                set('clouds',  `BG: ${s.bgCloudCount || 0} FG: ${s.fgCloudCount || 0}`);
                const _slaves  = SingletonManager.getSlaveCount(this._singletonId);
                const _masters = SingletonManager.getCardCount(this._singletonId) - _slaves;
                set('cards',   `👑 ${_masters} / 👷 ${_slaves}`);
            }
        }

        const btn = this._demoCacheBtn || this.shadowRoot.querySelector('#btn-toggle-demo');
        if (btn) {
            const newText = isRunning ? '⏸ Pause' : '▶ Play';
            const newClass = isRunning ? 'btn-pause' : 'btn-play';
            btn.textContent = newText;
            btn.classList.remove('btn-play', 'btn-pause');
            btn.classList.add(newClass);
        }

        const select = this._demoCacheSelect || this.shadowRoot.querySelector('#select-demo-condition');
        if (select) {
            select.value = sharedState.demoForcedCondition || 'auto';
        }
    }

    _injectKeyframesForCondition(condition, isNight) {
        const cacheKey = `${condition}:${isNight ? 1 : 0}`;
        if (this._loadedKeyframes === cacheKey) return;
        this._loadedKeyframes = cacheKey;

        const keyframes = {
            base: `@keyframes to-right { to { transform:translateX(calc(100vw + 500px)); } } @keyframes flash { 0%,90%,94%,100%{opacity:0;} 92%{opacity:0.4;} } @keyframes puff-drift { 0% { margin-left:calc(var(--pdrift) * -1); } 100% { margin-left:var(--pdrift); } }`,
            star: `@keyframes star { 0%,100%{opacity:1;} 50%{opacity:0.2;} }`,
            shot: `@keyframes shot { 0%{transform:rotate(45deg) translateX(-200px);opacity:0;} 1%{opacity:1;} 10%{transform:rotate(45deg) translateX(1200px);opacity:0;} 100%{opacity:0;} }`,
            rain: `@keyframes rain-fall { to { transform:translateY(110vh) skewX(-15deg); } }`,
            snow: `@keyframes snow-fall { 0% { transform: translateY(-10vh); } 100% { transform: translateY(110vh); } } @keyframes snow-sway { 0% { margin-left: calc(var(--sway) * -1); } 100% { margin-left: var(--sway); } }`,
            fog: `@keyframes fog-boil { 0% { transform: scale(1) translateY(0); opacity: var(--fog-opacity-min); } 50% { opacity: var(--fog-opacity-max); } 100% { transform: scale(1.15) translateY(-20px); opacity: var(--fog-opacity-min); } }`
        };

        const conf = this._meteoConfig.get(`conditions.${condition}`) || this._meteoConfig.get('conditions.default');
        const neededParts = new Set(['base']);

        if (isNight && conf.stars) { neededParts.add('star'); neededParts.add('shot'); }
        if (conf.drops) neededParts.add('rain');
        if (conf.flakes) neededParts.add('snow');
        if (conf.fog) neededParts.add('fog');

        let requiredKeyframes = '';
        for (const part of neededParts) requiredKeyframes += keyframes[part];

        if (!this._keyframesSheet) {
            this._keyframesSheet = document.createElement('style');
            this._keyframesSheet.id = 'meteo-keyframes';
            this.shadowRoot.appendChild(this._keyframesSheet);
        }

        this._keyframesSheet.textContent = requiredKeyframes;
    }

    _calculateMoonCoordinates(sunAzimuth, sunElevation, hass) {
        // Default: place the moon opposite the sun on the celestial sphere.
        // Overridden by real sensor data when moon entities are available.
        let moonAz = (sunAzimuth + 180) % 360;
        let moonEl = -sunElevation;

        const moonAzEntity = hass?.states?.[this._moonAzimuthEntityId];
        const moonElEntity = hass?.states?.[this._moonElevationEntityId];

        if (moonAzEntity?.state && moonElEntity?.state) {
            const parsedAz = parseFloat(moonAzEntity.state);
            const parsedEl = parseFloat(moonElEntity.state);

            if (!isNaN(parsedAz) && !isNaN(parsedEl)) {
                moonAz = parsedAz;
                moonEl = parsedEl;
            }
        }

        return {
            moonAz,
            moonEl
        };
    }

    _updateSharedState(state) {
        const sharedState = SingletonManager.getSingleton(this._singletonId);

        sharedState.sunPos = state.sunPos;
        sharedState.moonPos = state.moonPos;
        sharedState.moonPhase = state.moonPhase;
        sharedState.moonPhaseDegrees = state.moonPhaseDegrees;
        sharedState.isNight = state.isNight;
        sharedState.rising = state.rising;
        sharedState.condition = state.condition;
        sharedState.windSpeed = state.windSpeed;
        sharedState.simulatedHour = state.simulatedHour;
    }

    _renderAll(state) {
        try {
            this._cloudCounter = 0;
            const {
                condition,
                isNight,
                sunPos,
                moonPos,
                moonPhase,
                rising,
                windSpeed
            } = state;
            const css = {
                content: '',
                shared: new Set()
            };

            this._cleanupEvents();

            if (!this._ensureContent()) return;

            this._injectKeyframesForCondition(condition, isNight);

            const cond = this._meteoConfig.get(`conditions.${condition}`) || this._meteoConfig.get('conditions.default');
            const configuredLayers = this._meteoConfig.get('layers') || [];

            this._updateSharedState(state);

            // Build new content in a DocumentFragment so the DOM is never in a
            // partially-built (unstyled) state — prevents white flashes.
            const fragment = document.createDocumentFragment();

            const svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgFilter.setAttribute('style', 'width:0;height:0;position:absolute;');
            const filterDef = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            filterDef.setAttribute('id', 'cloud-distort');
            const feTurbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
            feTurbulence.setAttribute('type', 'fractalNoise');
            feTurbulence.setAttribute('baseFrequency', '0.012');
            feTurbulence.setAttribute('numOctaves', '3');
            feTurbulence.setAttribute('seed', '5');
            const feDisplacementMap = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
            feDisplacementMap.setAttribute('in', 'SourceGraphic');
            feDisplacementMap.setAttribute('scale', '35');
            filterDef.appendChild(feTurbulence);
            filterDef.appendChild(feDisplacementMap);
            svgFilter.appendChild(filterDef);
            fragment.appendChild(svgFilter);

            configuredLayers.forEach((l, idx) => {
                if (!l || (typeof l === 'string' && l === '')) {
                    return;
                }
                const zIdx = this._zIdx(l);
                const layerHtml = this._renderLayer(l, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed, cond);
                if (layerHtml) {
                    const layerContainer = document.createElement('div');
                    layerContainer.className = 'layer-container';
                    layerContainer.setAttribute('data-layer-id', `layer-${idx}-${typeof l === 'string' ? l : 'custom'}`);
                    layerContainer.style.zIndex = zIdx;
                    layerContainer.innerHTML = layerHtml;
                    fragment.appendChild(layerContainer);
                }
            });

            // Apply CSS before swapping DOM: stylesheet is global (no Shadow DOM)
            // so it takes effect immediately, ensuring layers are styled on first paint.
            if (this._dynamicStyleSheet && this._dynamicStyleSheet.parentNode) {
                this._dynamicStyleSheet.parentNode.removeChild(this._dynamicStyleSheet);
            }

            this._dynamicStyleSheet = document.createElement('style');
            this._dynamicStyleSheet.setAttribute('data-meteo-dynamic', 'true');
            this._dynamicStyleSheet.textContent = css.content;
            this.shadowRoot.appendChild(this._dynamicStyleSheet);

            // CSS is now active — swap DOM atomically.
            // The fragment is fully built and styled before the old content is removed,
            // so the browser never paints an unstyled or empty card.
            while (this.content.firstChild) {
                this.content.removeChild(this.content.firstChild);
            }
            this.content.appendChild(fragment);

            this._cacheDOM();
            this._updateStaticDOM(state);
            // Defer shadow init: WebGL shader compilation blocks the main thread.
            // The canvas renders empty initially and fills in asynchronously.
            clearTimeout(this._shadowInitTimer);
            this._shadowInitTimer = setTimeout(() => this._initShadowEngine(), 0);
            // Reveal card on first load (opacity starts at 0 via _ensureContent).
            this.style.opacity = '1';

            if (this._isDemoLayerEnabled && this._isDemoUIMaster && !this._demoControlsCreated) {
                this._createPersistentDemoControls();
                this._demoControlsCreated = true;
            }
        } catch (e) {
            console.error('[MeteoCard] _renderAll:', e);
            this.style.opacity = '1';
        }
    }

    // Returns a cached DOM element, re-querying if it has been detached.
    _getCachedEl(key, selector) {
        const el = this._domCache[key];
        if (el && el.parentNode) return el;
        const found = this.content?.querySelector(selector) || null;
        if (found) this._domCache[key] = found;
        return found;
    }

    // Positions a celestial-body wrapper (sun or moon) using a compositor-only
    // transform, avoiding layout thrashing caused by animating left/top on mobile.
    _positionCelestialBody(el, pos, disableTransition = false) {
        el.style.display = pos.elevation >= 0 ? 'block' : 'none';
        const w = this._cardWidth  || el.parentElement?.offsetWidth  || 400;
        const h = this._cardHeight || el.parentElement?.offsetHeight || 300;
        const x = (pos.left / 100) * w - 450;
        const y = (pos.top  / 100) * h - 450;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        if (disableTransition) el.style.transition = 'none';
    }

    // Computes the radial-gradient CSS value for the sky layer given the current state.
    _computeSkyBackground(sunPos, moonPos, isNight, rising, cond) {
        let fPos = isNight ? moonPos : sunPos;
        const sunConf = this._meteoConfig.get('sun');
        const srLimits = [...sunConf.sunrise_limits].sort((a, b) => a - b);
        const ssLimits = [...sunConf.sunset_limits].sort((a, b) => a - b);
        let colors;
        if (rising && sunPos.elevation >= srLimits[0] && sunPos.elevation <= srLimits[1]) {
            fPos = sunPos;
            colors = this._meteoConfig.get('colors.sunrise');
        } else if (!rising && sunPos.elevation >= ssLimits[0] && sunPos.elevation <= ssLimits[1]) {
            fPos = sunPos;
            colors = this._meteoConfig.get('colors.sunset');
        } else if (isNight) {
            colors = this._meteoConfig.get(`colors.night.${cond.night_sky}`);
        } else {
            colors = this._meteoConfig.get(`colors.day.${cond.day_sky}`);
        }
        return colors ? `radial-gradient(circle at ${fPos.left}% ${fPos.top}%, ${colors})` : '';
    }

    _cacheDOM() {
        const skyBg = this.content?.querySelector('.sky-bg');
        const sunWrapper = this.content?.querySelector('.sun-wrapper');
        const sunContainer = this.content?.querySelector('.sun-container');
        const moonContainer = this.content?.querySelector('.moon-container');
        const lensFlare = this.content?.querySelector('.lens-flare');
        const shadowCanvas = this.content?.querySelector('.shadow-canvas');

        this._domCache = {
            skyBg: skyBg || null,
            sunWrapper: sunWrapper || null,
            sunContainer: sunContainer || null,
            moonContainer: moonContainer || null,
            lensFlare: lensFlare || null,
            shadowCanvas: shadowCanvas || null
        };
        // Cache card dimensions for transform-based celestial body positioning.
        this._cardWidth  = this.content?.offsetWidth  || 0;
        this._cardHeight = this.content?.offsetHeight || 0;
    }

    _updateStaticDOM(state) {
        try {
            const {
                isNight,
                sunPos,
                moonPos,
                moonPhase,
                moonPhaseDegrees,
                rising,
                condition,
                simulatedHour: hour,
                windSpeed
            } = state;

            this._updateSharedState(state);

            if (!this.content) {
                return;
            }

            const sunWrapper = this._getCachedEl('sunWrapper', '.sun-wrapper');
            if (sunWrapper) this._positionCelestialBody(sunWrapper, sunPos, this._isDemoLayerEnabled);

            const sun = this._getCachedEl('sunContainer', '.sun-container');

            if (sun) {
                if (sunPos.elevation >= 0) {
                    sun.innerHTML = this._sunSVG();
                } else {
                    sun.innerHTML = '';
                }
            }

            const lensFlare = this._getCachedEl('lensFlare', '.lens-flare');
            if (lensFlare) {
                if (sunPos.elevation >= 0 && this._meteoConfig.get('sun.lens_flare.enabled')) {
                    lensFlare.innerHTML = this._lensFlare(sunPos, this._lensFlareRotation(sunPos, false));
                } else {
                    lensFlare.innerHTML = '';
                }
            }

            const moon = this._getCachedEl('moonContainer', '.moon-container');
            if (moon) {
                this._positionCelestialBody(moon, moonPos, this._isDemoLayerEnabled);
                if (moonPos.elevation >= 0) {
                    moon.innerHTML = this._moonSVG(moonPhase, !isNight, moonPhaseDegrees);
                } else {
                    moon.innerHTML = '';
                }
            }

            const sky = this._getCachedEl('skyBg', '.sky-bg');
            if (sky) {
                const conf = this._meteoConfig.get(`conditions.${condition}`);
                sky.style.background = this._computeSkyBackground(sunPos, moonPos, isNight, rising, conf);
            }

            this._updateShadow();
            this._updateDemoUI();
        } catch (e) {
            console.error('[MeteoCard] _updateStaticDOM:', e);
        }
    }

    _cleanupEvents() {
        this._demoListeners.forEach(({
            el,
            ev,
            fn
        }) => {
            if (el && typeof el.removeEventListener === 'function') {
                el.removeEventListener(ev, fn);
            }
        });
        this._demoListeners = [];
    }

    _renderLayer(layer, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed, cond) {
        try {
            if (layer === 'sky') {
                const nightContent = isNight ? `<div style="position:absolute; inset:0;">${this._stars(100, css)}${this._shootings(2, css)}</div>` : '';
                // Pre-compute the sky background to avoid a CSS transition flash.
                // Without this, the stylesheet swap in _renderAll triggers a style
                // recalculation that "commits" the sky-bg background as transparent,
                // causing the 3s transition to animate from white → gradient.
                const initialBg = this._computeSkyBackground(sunPos, moonPos, isNight, rising, cond);
                return `<div class="sky-bg" style="position:absolute; inset:0; background:${initialBg}; transition: background 3s ease-in-out;"></div>${nightContent}`;
            }

            if (layer === 'sun') {
                return `<div class="sun-wrapper" style="position:absolute; pointer-events:none; display:none; width:900px; height:900px;"><div class="sun-container" style="position:absolute; inset:0; width:100%; height:100%;"></div><div class="lens-flare" style="position:absolute; inset:0; width:100%; height:100%;"></div></div>`;
            }

            if (layer === 'moon') {
                return `<div class="moon-container" style="position:absolute; pointer-events:none; display:none; width:900px; height:900px;"></div>`;
            }

            if (layer === 'shadow') {
                const shadowCfg = this._meteoConfig.get('shadow') || {};
                if (!shadowCfg.depthmap) {
                    console.warn('[MeteoCard] shadow layer: "depthmap" is required in shadow config');
                    return '';
                }
                const shadowBlur = shadowCfg.blur ?? 0;
                const blurStyle = shadowBlur > 0 ? `filter:blur(${shadowBlur}px);` : '';
                return `<canvas class="shadow-canvas" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;will-change:transform;transform:translateZ(0);${blurStyle}"></canvas>`;
            }

            const cloudRatio = cond.background_ratio || 0.5;

            if (layer === 'background') {
                const { html: bgHtml, count: bgCloudCount } = this._clouds(cond.clouds, css, isNight, windSpeed, cloudRatio);
                const sharedState = SingletonManager.getSingleton(this._singletonId);
                sharedState.bgCloudCount = bgCloudCount;

                let h = bgHtml;
                if (cond.fog) {
                    const fogCount = Math.ceil(this._meteoConfig.get('fog.count') * cloudRatio);
                    h += this._fog(fogCount, css);
                }
                return h;
            }

            if (layer === 'foreground') {
                let h = '';
                if (cond.lightning) h += `<div class="lightning"></div>`;

                const { html: fgHtml, count: fgCloudCount } = this._clouds(cond.clouds, css, isNight, windSpeed, (1 - cloudRatio));
                const sharedState = SingletonManager.getSingleton(this._singletonId);
                sharedState.fgCloudCount = fgCloudCount;
                h += fgHtml;

                if (cond.drops) {
                    const dropsCount = this._meteoConfig.get(`rain_intensity.${cond.drops}`) || 0;
                    h += this._rain(dropsCount, css);
                }
                if (cond.flakes) {
                    const flakesCount = this._meteoConfig.get(`snow_intensity.${cond.flakes}`) || 0;
                    h += this._snow(flakesCount, css);
                }
                if (cond.fog) {
                    const fogCount = Math.ceil(this._meteoConfig.get('fog.count') * (1 - cloudRatio));
                    h += this._fog(fogCount, css);
                }
                return h;
            }

            return '';
        } catch (e) {
            console.error('[MeteoCard] _renderLayer:', e);
            return '';
        }
    }

    _resolveTemplate(value, callback) {
        const isTemplate = value && (value.includes('{{') || value.includes('{%'));
        if (isTemplate && this._hass) {
            this._hass.callApi('POST', 'template', { template: value })
                .then(result => callback(result.trim()))
                .catch(err => {
                    console.error('[MeteoCard] shadow template error:', err);
                    callback(null);
                });
        } else if (isTemplate) {
            // hass not ready yet — skip, will retry when hass is set
            callback(null);
        } else {
            callback(value || null);
        }
    }

    _initShadowEngine() {
        const canvas = this._domCache.shadowCanvas;
        if (!canvas) return;

        const shadowCfg = this._meteoConfig.get('shadow') || {};
        const depthmap = shadowCfg.depthmap;
        if (!depthmap) return;

        this._cleanupShadow();

        const gl = canvas.getContext('webgl');
        if (!gl) {
            console.warn('[MeteoCard] shadow layer: WebGL not available');
            return;
        }

        const vs = `
            attribute vec2 p;
            attribute vec2 t;
            varying vec2 v;
            void main(){
                gl_Position = vec4(p, 0.0, 1.0);
                v = t;
            }
        `;

        // Overlay shader (no base image) — unit 0 = depthmap
        const fsOverlayDemo = `
            precision highp float;
            varying vec2 v;
            uniform sampler2D uDepth;
            uniform vec2 uLight;
            uniform vec3 uLightDir;
            uniform float uLightIntensity;
            uniform float uAmbient;
            uniform vec2 uTexel;
            uniform float uBias;
            uniform float uStepSize;
            uniform int uShadowEnabled;
            uniform float uDepthExp;
            uniform float uDepthGain;
            uniform float uNormalStrength;
            uniform float uIntensity;
            float getDepth(vec2 uv){
                vec3 d = texture2D(uDepth, uv).rgb;
                float h = dot(d, vec3(0.3, 0.59, 0.11));
                h = pow(max(h, 1e-6), uDepthExp) * uDepthGain;
                return h;
            }
            vec3 normalFromDepth(vec2 uv){
                float hL = getDepth(uv - vec2(uTexel.x, 0.0));
                float hR = getDepth(uv + vec2(uTexel.x, 0.0));
                float hD = getDepth(uv - vec2(0.0, uTexel.y));
                float hU = getDepth(uv + vec2(0.0, uTexel.y));
                float dx = (hR - hL) * 0.5;
                float dy = (hU - hD) * 0.5;
                return normalize(vec3(-dx, -dy, 1.0));
            }
            void main(){
                vec4 depthSample = texture2D(uDepth, v);
                float mask = depthSample.a;
                if(mask < 0.01) discard;
                float hBase = dot(depthSample.rgb, vec3(0.3, 0.59, 0.11));
                hBase = pow(max(hBase, 1e-6), uDepthExp) * uDepthGain;
                float acc = 0.0;
                const float samples = 8.0;
                if(uShadowEnabled == 1){
                    float seed = fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
                    for(float i = 0.0; i < 8.0; i++){
                        float ang = (i + seed) * 0.785;
                        float sh = 1.0;
                        for(float j = 1.0; j < 16.0; j++){
                            float dist = j * uStepSize;
                            float soft = dist * 0.22;
                            vec2 jitter = vec2(cos(ang), sin(ang)) * soft;
                            vec2 p = v + (uLight + jitter) * dist;
                            if(p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0){
                                if(getDepth(p) > (hBase + dist * 0.65 + uBias)){
                                    sh = 0.5;
                                    break;
                                }
                            }
                        }
                        acc += sh;
                    }
                } else { acc = samples; }
                float shade = acc / samples;
                vec3 N = normalFromDepth(v);
                float lambert = max(dot(N, normalize(uLightDir)), 0.0);
                float relit = 0.15 + 0.85 * lambert;
                float lightFactor = mix(1.0, relit, uNormalStrength);
                float brightness = shade * lightFactor;
                float shadowOpacity = clamp((1.0 - brightness) * uLightIntensity * uIntensity, 0.0, 1.0 - uAmbient) * mask;
                gl_FragColor = vec4(0.0, 0.0, 0.0, shadowOpacity);
            }
        `;
        const fsOverlayNormal = fsOverlayDemo
            .replace('const float samples = 8.0;', 'const float samples = 32.0;')
            .replace('i < 8.0;', 'i < 32.0;')
            .replace('j < 16.0;', 'j < 30.0;')
            .replace('* 0.785;', '* 0.196;');

        try {
            const makeShader = (type, src) => {
                const sh = gl.createShader(type);
                gl.shaderSource(sh, src);
                gl.compileShader(sh);
                if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                    throw new Error(gl.getShaderInfoLog(sh));
                }
                return sh;
            };

            const vsShader = makeShader(gl.VERTEX_SHADER, vs);
            const makeProgram = (fsSrc) => {
                const p = gl.createProgram();
                gl.attachShader(p, vsShader);
                gl.attachShader(p, makeShader(gl.FRAGMENT_SHADER, fsSrc));
                gl.bindAttribLocation(p, 0, 'p');
                gl.bindAttribLocation(p, 1, 't');
                gl.linkProgram(p);
                if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
                return p;
            };

            const progDemo   = makeProgram(fsOverlayDemo);
            const progNormal = makeProgram(fsOverlayNormal);

            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1,  1, 0, 0,
                 1,  1, 1, 0,
                -1, -1, 0, 1,
                 1, -1, 1, 1
            ]), gl.STATIC_DRAW);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
            gl.enableVertexAttribArray(1);

            // unit 0 = depthmap (NEAREST — exact depth values)
            const texDepth = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texDepth);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

            const getUniforms = (p) => {
                gl.useProgram(p);
                const u = {
                    uLight:          gl.getUniformLocation(p, 'uLight'),
                    uLightDir:       gl.getUniformLocation(p, 'uLightDir'),
                    uTexel:          gl.getUniformLocation(p, 'uTexel'),
                    uBias:           gl.getUniformLocation(p, 'uBias'),
                    uStepSize:       gl.getUniformLocation(p, 'uStepSize'),
                    uShadowEnabled:  gl.getUniformLocation(p, 'uShadowEnabled'),
                    uDepthExp:       gl.getUniformLocation(p, 'uDepthExp'),
                    uDepthGain:      gl.getUniformLocation(p, 'uDepthGain'),
                    uNormalStrength: gl.getUniformLocation(p, 'uNormalStrength'),
                    uLightIntensity: gl.getUniformLocation(p, 'uLightIntensity'),
                    uAmbient:        gl.getUniformLocation(p, 'uAmbient'),
                    uIntensity:      gl.getUniformLocation(p, 'uIntensity'),
                    uDepth:          gl.getUniformLocation(p, 'uDepth')
                };
                gl.uniform1i(u.uDepth, 0);
                return u;
            };
            const uniformsDemo   = getUniforms(progDemo);
            const uniformsNormal = getUniforms(progNormal);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            this._shadowGl = gl;
            this._shadowProgs = { demo: progDemo, normal: progNormal };
            this._shadowUniformSets = { demo: uniformsDemo, normal: uniformsNormal };
            this._shadowUniforms = uniformsDemo;
            this._shadowReady = false;

            const loadImage = (url, onload, onerror) => {
                const i = new Image();
                i.onload = () => onload(i);
                i.onerror = () => onerror(url);
                i.src = url;
            };

            const onReady = (depthImg) => {
                try {
                    this._shadowTexW = depthImg.width;
                    this._shadowTexH = depthImg.height;
                    gl.activeTexture(gl.TEXTURE0);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, depthImg);
                    const shared = SingletonManager.getSingleton(this._singletonId);
                    const isDemo = shared && shared.demoState === 'running';
                    this._shadowIsDemo = null;
                    this._switchShadowQuality(isDemo);
                    this._shadowReady = true;
                    if (!this._shadowResizeObserver) {
                        this._shadowResizeObserver = new ResizeObserver(() => {
                            if (this._shadowReady) {
                                this._shadowIsDemo = null; // force canvas resize
                                this._updateShadow();
                            }
                        });
                        this._shadowResizeObserver.observe(canvas.parentElement || canvas);
                    }
                    this._updateShadow();
                } catch (e) {
                    console.error('[MeteoCard] shadow onReady:', e);
                }
            };

            this._resolveTemplate(depthmap, (depUrl) => {
                try {
                    if (!depUrl) return;
                    loadImage(depUrl, onReady,
                        (u) => console.error('[MeteoCard] shadow depthmap failed:', u));
                } catch (e) {
                    console.error('[MeteoCard] shadow resolve:', e);
                }
            });
        } catch (e) {
            console.error('[MeteoCard] _initShadowEngine:', e);
        }
    }

    _updateShadow() {
        if (!this._shadowReady || !this._shadowGl) return;
        try {
            const gl = this._shadowGl;
            const shared = SingletonManager.getSingleton(this._singletonId);
            if (!shared) return;

            const lightPos = shared.isNight ? shared.moonPos : shared.sunPos;

            // Light inactive: clear once and stop — keep old render otherwise
            const active = lightPos && lightPos.elevation > 0;
            let lightIntensity = 1.0;
            if (active && shared.isNight) {
                const phaseDeg = shared.moonPhaseDegrees ?? 0;
                lightIntensity = (1 + Math.cos(phaseDeg * Math.PI / 180)) / 2;
            }
            const shouldRender = active && lightIntensity >= 0.01;

            if (!shouldRender) {
                if (this._shadowWasActive) {
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    this._shadowWasActive = false;
                    this._lastShadowAzimuth = null;
                    this._lastShadowElevation = null;
                }
                return;
            }

            // Switch shader quality if demo mode changed
            const isDemo = shared.demoState === 'running';
            if (isDemo !== this._shadowIsDemo) {
                this._switchShadowQuality(isDemo);
                this._lastShadowAzimuth = null; // force redraw after switch
                this._lastShadowElevation = null;
            }

            // Skip render if position hasn't changed enough (keep last frame)
            const azDiff = Math.abs((lightPos.azimuth ?? 0) - (this._lastShadowAzimuth ?? -999));
            const elDiff = Math.abs((lightPos.elevation ?? 0) - (this._lastShadowElevation ?? -999));
            const now = Date.now();
            const elapsed = now - (this._lastShadowRender ?? 0);
            if (this._shadowWasActive && azDiff < 0.5 && elDiff < 0.5 && elapsed < 250) return;

            this._lastShadowAzimuth = lightPos.azimuth;
            this._lastShadowElevation = lightPos.elevation;
            this._lastShadowRender = now;
            this._shadowWasActive = true;

            const u = this._shadowUniforms;
            const shadowCfg = this._meteoConfig.get('shadow') || {};
            const bias      = shadowCfg.bias      ?? 0.003;
            const step      = shadowCfg.step      ?? 0.002;
            const ambient   = shadowCfg.ambient   ?? 0.2;
            const intensity = shadowCfg.intensity ?? 0.7;

            const altRad = lightPos.elevation * Math.PI / 180;
            const len = (90 - lightPos.elevation) / 60;

            // Derive 2D shadow direction from screen position so it matches the
            // sun/moon layer (which already includes orbit/house_angle/tilt transforms).
            const lightU = lightPos.left / 100;
            const lightV = lightPos.top / 100;
            const dx = lightU - 0.5;
            const dy = lightV - 0.5;
            const mag = Math.sqrt(dx * dx + dy * dy) || 0.001;
            gl.uniform2f(u.uLight, (dx / mag) * len, (dy / mag) * len);

            // 3D light direction for normal-map shading (raw azimuth is fine here).
            const aziRad = (lightPos.azimuth - 90) * Math.PI / 180;
            gl.uniform3f(u.uLightDir,
                Math.cos(aziRad) * Math.cos(altRad),
                Math.sin(aziRad) * Math.cos(altRad),
                Math.sin(altRad)
            );
            gl.uniform1f(u.uBias, bias);
            gl.uniform1f(u.uStepSize, step);
            gl.uniform1i(u.uShadowEnabled, 1);
            gl.uniform1f(u.uDepthExp, 1.0);
            gl.uniform1f(u.uDepthGain, 1.15);
            gl.uniform1f(u.uNormalStrength, 0.45);
            gl.uniform1f(u.uLightIntensity, lightIntensity);
            gl.uniform1f(u.uAmbient, ambient);
            gl.uniform1f(u.uIntensity, intensity);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } catch (e) {
            console.error('[MeteoCard] _updateShadow:', e);
        }
    }

    _switchShadowQuality(isDemo) {
        if (!this._shadowGl || !this._shadowProgs) return;
        const gl = this._shadowGl;
        const key = isDemo ? 'demo' : 'normal';
        gl.useProgram(this._shadowProgs[key]);
        this._shadowUniforms = this._shadowUniformSets[key];
        const canvas = this._domCache.shadowCanvas;
        if (canvas && this._shadowTexW) {
            const iw = this._shadowTexW;
            const ih = this._shadowTexH;
            // Canvas buffer follows card CSS size (+ devicePixelRatio), not depthmap dimensions.
            // The depthmap is just a UV texture — its pixel size only matters for uTexel (normal/ray step).
            const dpr = window.devicePixelRatio || 1;
            const rect = (canvas.parentElement || canvas).getBoundingClientRect();
            const baseW = rect.width  > 0 ? rect.width  * dpr : iw;
            const baseH = rect.height > 0 ? rect.height * dpr : ih;
            let factor = isDemo ? 0.5 : 1.0;
            if (!isDemo) {
                const blur = (this._meteoConfig?.get('shadow') || {}).blur ?? 0;
                if (blur > 0) {
                    factor = Math.max(0.5, 1.0 - blur * 0.05);
                }
            }
            canvas.width  = Math.round(baseW * factor);
            canvas.height = Math.round(baseH * factor);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(this._shadowUniforms.uTexel, 1 / iw, 1 / ih);
        }
        this._shadowIsDemo = isDemo;
    }

    _cleanupShadow() {
        if (this._shadowGl) {
            const ext = this._shadowGl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
            this._shadowGl = null;
        }
        this._shadowUniforms = null;
        this._shadowProgs = null;
        this._shadowUniformSets = null;
        this._shadowReady = false;
        this._shadowWasActive = false;
        this._lastShadowAzimuth = null;
        this._lastShadowElevation = null;
        this._lastShadowRender = null;
        this._shadowIsDemo = null;
        this._shadowTexW = null;
        this._shadowTexH = null;
        if (this._shadowResizeObserver) {
            this._shadowResizeObserver.disconnect();
            this._shadowResizeObserver = null;
        }
        clearTimeout(this._shadowInitTimer);
        this._shadowInitTimer = null;
    }

    _createStatRow(label, value, statKey = '') {
        const attr = statKey ? ` data-stat="${statKey}"` : '';
        return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value"${attr}>${value}</span></div>`;
    }

    _createButton(id, className, text) {
        return `<button class="demo-btn ${className}" id="${id}">${text}</button>`;
    }

    _demoUI() {
        const state = SingletonManager.getSingleton(this._singletonId);
        const sharedState = state.actualState || {};

        const timeStr = this._formatTime(sharedState.simulatedHour || 0);

        const sunConf = this._meteoConfig.get('sun');
        const srLimits = Array.isArray(sunConf.sunrise_limits) ? sunConf.sunrise_limits : [0, 5];
        const ssLimits = Array.isArray(sunConf.sunset_limits) ? sunConf.sunset_limits : [0, 5];
        const sunLimitsStr = `Rise: ${srLimits[0]}°/${srLimits[1]}° | Set: ${ssLimits[0]}°/${ssLimits[1]}°`;

        const slaveCount  = SingletonManager.getSlaveCount(this._singletonId);
        const masterCount = SingletonManager.getCardCount(this._singletonId) - slaveCount;

        return `
    ${this._createStatRow('State:', state.demoState.toUpperCase(), 'state')}
    ${this._createStatRow('Time:', timeStr, 'time')}
    ${this._createStatRow('Weather:', (sharedState.condition || '').toUpperCase(), 'weather')}
    ${this._createStatRow('Wind:', `${(sharedState.windSpeed || 0).toFixed(1)} km/h`, 'wind')}
    ${this._createStatRow('Sun:', `${(sharedState.sunPos?.elevation || 0).toFixed(1)}° | ${(sharedState.sunPos?.azimuth || 0).toFixed(1)}°`, 'sun')}
    ${this._createStatRow('Moon:', `${(sharedState.moonPos?.elevation || 0).toFixed(1)}° | ${(sharedState.moonPos?.azimuth || 0).toFixed(1)}°`, 'moon')}
    ${this._createStatRow('Phase:', `${this._safe(sharedState.moonPhase)} | ${(sharedState.moonPhaseDegrees || 0).toFixed(1)}°`, 'phase')}
    ${this._createStatRow('Clouds:', `BG: ${state.bgCloudCount || 0} FG: ${state.fgCloudCount || 0}`, 'clouds')}
    ${this._createStatRow('Limits:', sunLimitsStr, 'limits')}
    ${this._createStatRow('Cards:', `👑 ${masterCount} / 👷 ${slaveCount}`, 'cards')}
        `.trim();
    }

    _createPersistentDemoControls() {
        const sharedState = SingletonManager.getSingleton(this._singletonId);
        const currentState = SingletonManager.getDemoState(this._singletonId);

        const isRunning = currentState === 'running';
        const playPauseBtnClass = isRunning ? 'btn-pause' : 'btn-play';
        const playPauseBtnText = isRunning ? '⏸ Pause' : '▶ Play';
        const playPauseBtn = this._createButton('btn-toggle-demo', playPauseBtnClass, playPauseBtnText);
        const stopBtn = this._createButton('btn-stop-demo', 'btn-stop', '⏹ STOP');

        const currentCondition = sharedState.demoForcedCondition || 'auto';
        const conditionOptions = ['auto', ...Object.keys(this._meteoConfig.get('conditions'))]
            .filter(c => c !== 'default')
            .map(c => `<option value="${c}" ${currentCondition === c ? 'selected' : ''}>${c === 'auto' ? 'AUTO' : c.toUpperCase()}</option>`)
            .join('');
        const conditionSelect = `<select class="demo-select" id="select-demo-condition">${conditionOptions}</select>`;

        const controlsHtml = `
    <div class="demo-controls">
        <div class="demo-stats-container">
            <div class="demo-stats-inner">${this._demoUI()}</div>
        </div>
        <div class="demo-controls-container">
            <div class="demo-controls-buttons">${playPauseBtn}${stopBtn}</div>
            ${conditionSelect}
        </div>
    </div>
        `.trim();

        const tpl = document.createElement('template');
        tpl.innerHTML = controlsHtml;
        this.shadowRoot.appendChild(tpl.content);
        // Cache hot-path references immediately after insertion.
        this._demoCacheStats  = this.shadowRoot.querySelector('.demo-stats-inner');
        this._demoCacheBtn    = this.shadowRoot.querySelector('#btn-toggle-demo');
        this._demoCacheSelect = this.shadowRoot.querySelector('#select-demo-condition');
        this._attachDemoListeners();
    }

    _attachDemoListeners() {
        const btn     = this.shadowRoot.querySelector('#btn-toggle-demo');
        const stopBtn = this.shadowRoot.querySelector('#btn-stop-demo');
        const select  = this.shadowRoot.querySelector('#select-demo-condition');

        if (this._demoListenersBound) {
            if (this._boundPlayPauseFn) btn?.removeEventListener('click', this._boundPlayPauseFn);
            if (this._boundStopFn) stopBtn?.removeEventListener('click', this._boundStopFn);
            if (this._boundSelectFn) select?.removeEventListener('change', this._boundSelectFn);
        }

        if (btn) {
            this._boundPlayPauseFn = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const currentState = SingletonManager.getDemoState(this._singletonId);
                let newState;

                if (currentState === 'running') {
                    newState = 'paused';
                    SingletonManager.setDemoState(this._singletonId, 'paused');
                    this._stopDemo();
                } else {
                    newState = 'running';
                    SingletonManager.startDemo(this._singletonId);

                    if (!this._demoEngine) {
                        this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                    }
                    const initialState = this._demoEngine.compute();
                    SingletonManager.setActualState(this._singletonId, initialState);

                    this._startDemo();
                }

                btn.classList.toggle('btn-play', newState !== 'running');
                btn.classList.toggle('btn-pause', newState === 'running');
                btn.textContent = newState === 'running' ? '⏸ Pause' : '▶ Play';

                this._update();
            };
            btn.addEventListener('click', this._boundPlayPauseFn);
        }

        if (stopBtn) {
            this._boundStopFn = (e) => {
                e.preventDefault();
                e.stopPropagation();

                SingletonManager.stopDemo(this._singletonId);
                this._stopDemo();

                if (this._hass) {
                    const realData = this._realData();
                    if (realData) {
                        SingletonManager.setActualState(this._singletonId, realData);
                    }
                }

                this._update();
            };
            stopBtn.addEventListener('click', this._boundStopFn);
        }

        if (select) {
            this._boundSelectFn = (e) => {
                e.stopPropagation();
                const sharedState = SingletonManager.getSingleton(this._singletonId);
                sharedState.demoForcedCondition = select.value;
                this._update();
            };
            select.addEventListener('change', this._boundSelectFn);
        }

        this._demoListenersBound = true;
    }

    _sunSVG() {
        if (this._sunSVGCache) return this._sunSVGCache;
        try {
            const s = this._meteoConfig.get('sun');
            const col = s.colors;
            const center = 150;

            this._sunSVGCache = `
            <svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible; display:block;">
                <defs>
                    <radialGradient id="sunAura" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="${col.aura}" stop-opacity="${s.aura_opacity}"/>
                        <stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/>
                    </radialGradient>
                    <radialGradient id="sunHalo" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="${col.halo}" stop-opacity="${s.halo_opacity}"/>
                        <stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/>
                    </radialGradient>
                </defs>
                <circle cx="${center}" cy="${center}" r="${s.aura_radius}" fill="url(#sunAura)"/>
                <circle cx="${center}" cy="${center}" r="${s.halo_radius}" fill="url(#sunHalo)"/>
                <circle cx="${center}" cy="${center}" r="${s.disc_radius}" fill="${col.disc}" style="filter:blur(1px);"/>
            </svg>`;
            return this._sunSVGCache;
        } catch (e) {
            console.error('[MeteoCard] _sunSVG:', e);
            return '';
        }
    }

    _lensFlareRotation(sunPos, isDemo) {
        return isDemo
            ? (Date.now() / 50) % 360
            : Math.atan2(sunPos.top - 50, sunPos.left - 50) * 180 / Math.PI + 180;
    }

    _lensFlare(sunPos, rotation) {
        try {
            const lf = this._meteoConfig.get('sun.lens_flare');

            if (!lf.enabled) return '';

            const elevationOpacity = Math.max(0, Math.min(1, (sunPos.elevation + 5) / 20));
            const center = 450;
            const uniqueId = this._cardId;
            const glowStd = lf.glow_stdDeviation;
            const haloRadius = lf.halo_radius;
            const haloStrokeWidth = lf.halo_stroke_width;
            const haloOpacity = lf.halo_opacity * elevationOpacity;
            const innerHaloRadius = lf.inner_halo_radius;
            const innerHaloStrokeWidth = lf.inner_halo_stroke_width;
            const innerHaloOpacity = lf.inner_halo_opacity * elevationOpacity;
            const flares = lf.flares;

            let flareCircles = '';
            if (flares && Array.isArray(flares)) {
                flares.forEach(flare => {
                    const opacityValue = (flare.opacity ?? 0.2) * elevationOpacity;
                    flareCircles += `<circle cx="${flare.distance}" cy="0" r="${flare.radius}" fill="${flare.color}" opacity="${opacityValue}"/>\n`;
                });
            }

            return `<svg viewBox="0 0 900 900" style="width:100%; height:100%; position:absolute; top:0; left:0; overflow:visible;">
                <defs>
                    <filter id="lens-glow-${uniqueId}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="${glowStd}"/>
                    </filter>
                </defs>
                <g transform="translate(${center}, ${center}) rotate(${rotation})" opacity="${elevationOpacity}">
                    <circle cx="0" cy="0" r="${haloRadius}" fill="none" stroke="#FFFFFF" stroke-width="${haloStrokeWidth}" opacity="${haloOpacity}" filter="url(#lens-glow-${uniqueId})"/>
                    ${flareCircles}
                    <circle cx="0" cy="0" r="${innerHaloRadius}" fill="none" stroke="#FFFF99" stroke-width="${innerHaloStrokeWidth}" opacity="${innerHaloOpacity}" filter="url(#lens-glow-${uniqueId})"/>
                </g>
            </svg>`;
        } catch (e) {
            console.error('[MeteoCard] _lensFlare:', e);
            return '';
        }
    }

    _moonSVG(phase, isDaytime, moonPhaseDegrees = 0) {
        try {
            const m = this._meteoConfig.get('moon');
            const col = m.colors;
            const r = m.disc_radius;
            const pl = (phase || '').toLowerCase();
            let p = pl.includes('new') ? 0 : pl.includes('crescent') ? 0.22 : pl.includes('quarter') ? 0.5 : pl.includes('gibbous') ? 0.78 : 1;
            const iw = pl.includes('waning') || pl.includes('last');
            const hr = Math.abs(Math.cos(p * Math.PI)) * r;
            const bo = isDaytime ? 0.4 : 1.0;

            this._moonMaskIdCounter = (this._moonMaskIdCounter || 0) + 1;
            const mid = `moon-mask-${this._moonMaskIdCounter}`;
            const gradId = `m3d-${this._moonMaskIdCounter}`;

            return `
            <svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible;">
                <defs>
                    <filter id="mtx-${this._moonMaskIdCounter}" x="-100%" y="-100%" width="300%" height="300%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="noise"/>
                        <feDiffuseLighting lighting-color="#FFFFFF" surfaceScale="1" result="diffuse">
                            <feDistantLight azimuth="${moonPhaseDegrees}" elevation="45"/>
                        </feDiffuseLighting>
                        <feComposite in="diffuse" in2="SourceGraphic" operator="in"/>
                    </filter>
                    
                    <mask id="${mid}">
                        <g transform="translate(150,150) rotate(${moonPhaseDegrees})">
                            <path d="M 0,${-r} A ${r},${r} 0 1,${iw ? 0 : 1} 0,${r} A ${hr},${r} 0 0,${p <= 0.5 ? (iw ? 1 : 0) : (iw ? 0 : 1)} 0,${-r}" fill="white" filter="blur(0.8px)"/>
                        </g>
                    </mask>

                    <radialGradient id="ma-${this._moonMaskIdCounter}">
                        <stop offset="0%" stop-color="${col.aura}" stop-opacity="${m.aura_opacity * p * bo}"/>
                        <stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/>
                    </radialGradient>
                    <radialGradient id="${gradId}" cx="${40 + Math.cos(moonPhaseDegrees * Math.PI / 180) * 15}%" cy="${40 + Math.sin(moonPhaseDegrees * Math.PI / 180) * 15}%" r="50%">
                        <stop offset="0%" stop-color="${col.disc_light}"/>
                        <stop offset="100%" stop-color="${col.disc_dark}"/>
                    </radialGradient>
                </defs>

                <circle cx="150" cy="150" r="${m.aura_radius}" fill="url(#ma-${this._moonMaskIdCounter})"/>
                <circle cx="150" cy="150" r="${m.halo_radius}" fill="#FFFFFF" opacity="${m.halo_opacity * p * bo}" style="filter:blur(5px);"/>
                
                <g mask="url(#${mid})" style="opacity:${bo};">
                    <circle cx="150" cy="150" r="${r + 0.5}" fill="url(#${gradId})" transform="rotate(${moonPhaseDegrees} 150 150)" />
                    <circle cx="150" cy="150" r="${r + 0.5}" fill="white" filter="url(#mtx-${this._moonMaskIdCounter})" opacity="0.3" style="mix-blend-mode: soft-light;" transform="rotate(${moonPhaseDegrees} 150 150)"/>
                </g>
            </svg>`;
        } catch (e) {
            console.error('[MeteoCard] _moonSVG:', e);
            return '';
        }
    }

    _clouds(type, css, isNight, windSpeed = 25, ratio = 1.0) {
        try {
            const [nc, pc, gr] = this._meteoConfig.get(`clouds.${type}`) || this._meteoConfig.get('clouds.low');
            const adjustedNc = Math.ceil(nc * ratio);
            if (adjustedNc === 0) return { html: '', count: 0 };

            const anim = this._meteoConfig.get('clouds.animation');
            const minMargin = anim?.min_margin ?? 5;
            const maxMargin = anim?.max_margin ?? 85;
            const randomVariation = anim?.random_variation ?? 0.3;
            const bc = 255 - (gr * 25);
            let html = '';
            const baseDuration = (20 / (windSpeed + 1)) * 60;
            const minSpacing = 100 / (adjustedNc + 1);

            for (let i = 0; i < adjustedNc; i++) {
                const id = `${this._cardId}-cl-${this._cloudCounter++}`;
                const bs = 60 + Math.random() * 50;
                const randomFactor = (Math.floor(Math.random() * 81) + 60) / 100;
                const dur = (baseDuration * randomFactor).toFixed(2);

                const baseTop = (i + 1) * minSpacing;
                const randomOffset = (Math.random() - 0.5) * minSpacing * randomVariation;
                const tp = Math.max(minMargin, Math.min(maxMargin, baseTop + randomOffset));

                const cw = Math.round(bs * (2.5 + (pc / 4)));
                const delay = Math.round(Math.random() * dur * 100) / 100;
                const opacity = type === 'heavy' ? 0.9 : 0.7;
                const zIdx = Math.floor(tp);

                const puffCls = `${this._cardId}-puff`;
                if (!css.shared.has(puffCls)) {
                    css.shared.add(puffCls);
                    css.content += `.${puffCls}{position:absolute;border-radius:50%;background:var(--puff-bg);filter:blur(10px)}`;
                }
                const puffBg = `radial-gradient(circle at 35% 30%,rgba(${Math.min(255, bc + 45)},${Math.min(255, bc + 45)},${Math.min(255, bc + 45)},1) 0%,rgba(${bc},${bc},${bc + 10},.8) 50%,rgba(${Math.max(0, bc - 55)},${Math.max(0, bc - 55)},${Math.max(0, bc - 55 + 20)},.4) 100%)`;
                css.content += `.${id}{position:absolute;top:${tp}%;left:-${cw * 2}px;width:${cw}px;height:${Math.round(bs * 2.2)}px;animation:to-right ${dur}s linear infinite;animation-delay:-${delay}s;filter:url(#cloud-distort) blur(5px);opacity:${opacity};mix-blend-mode:${isNight ? 'normal' : 'screen'};z-index:${zIdx};pointer-events:none;--puff-bg:${puffBg}}`;

                let puffs = '';
                for (let j = 0; j < pc; j++) {
                    const pw = Math.round(bs * (1.1 + Math.random() * 0.9));
                    const ph = Math.round(pw * 0.9);
                    const pl = Math.round((j * (85 / pc) + Math.random() * 10) * 100) / 100;
                    const pt = Math.round((Math.random() * (bs * 0.4) - bs * 0.2) * 100) / 100;
                    const driftSign = j % 2 === 0 ? 1 : -1; // alternate with/against wind direction
                    const driftAmt = driftSign * Math.round(12 + Math.random() * 18); // 12–30px lateral drift
                    const driftDur = (parseFloat(dur) * (0.35 + Math.random() * 0.3)).toFixed(2);
                    const driftDelay = (Math.random() * parseFloat(driftDur)).toFixed(2);

                    puffs += `<div class="${this._cardId}-puff" style="width:${pw}px;height:${ph}px;left:${pl}%;top:${pt}px;--pdrift:${driftAmt}px;animation:puff-drift ${driftDur}s linear infinite alternate;animation-delay:-${driftDelay}s"></div>`;
                }
                html += `<div class="${id}">${puffs}</div>`;
            }
            return { html, count: adjustedNc };
        } catch (e) {
            console.error('[MeteoCard] _clouds:', e);
            return { html: '', count: 0 };
        }
    }

    _stars(n, css) {
        try {
            const cls = `${this._cardId}-star`;
            if (!css.shared.has(cls)) {
                css.shared.add(cls);
                css.content += `.${cls}{position:absolute;width:1.5px;height:1.5px;background:#FFF;border-radius:50%;top:var(--t);left:var(--l);animation:star var(--d) infinite;z-index:1}`;
            }
            let html = '';
            for (let i = 0; i < n; i++) {
                const d = (2 + Math.random() * 3).toFixed(2);
                const t = Math.round(Math.random() * 10000) / 100;
                const l = Math.round(Math.random() * 10000) / 100;
                html += `<div class="${cls}" style="--t:${t}%;--l:${l}%;--d:${d}s"></div>`;
            }
            return html;
        } catch (e) {
            console.error('[MeteoCard] _stars:', e);
            return '';
        }
    }

    _shootings(n, css) {
        const cls = `${this._cardId}-shot`;
        if (!css.shared.has(cls)) {
            css.shared.add(cls);
            css.content += `.${cls}{position:absolute;width:100px;height:1px;background:linear-gradient(to right,transparent,white);transform:rotate(45deg) translateX(-200px);opacity:0;animation:shot 15s infinite;top:var(--t);left:var(--l);animation-delay:var(--d);z-index:2}`;
        }
        let h = '';
        for (let i = 0; i < n; i++) {
            h += `<div class="${cls}" style="--t:${(Math.random()*50).toFixed(1)}%;--l:${(Math.random()*100).toFixed(1)}%;--d:${(Math.random()*15).toFixed(2)}s"></div>`;
        }
        return h;
    }

    _rain(n, css) {
        try {
            const rainWidth = this._meteoConfig.get('rain_intensity.width');
            const cls = `${this._cardId}-rain`;
            if (!css.shared.has(cls)) {
                css.shared.add(cls);
                css.content += `.${cls}{position:absolute;width:${rainWidth}px;height:40px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,0.4));top:-50px;animation:rain-fall 0.6s linear infinite;z-index:500;left:var(--l);animation-delay:var(--d)}`;
            }
            let html = '';
            for (let i = 0; i < n; i++) {
                const l = Math.round(Math.random() * 10000) / 100;
                const d = Math.round(Math.random() * 2000) / 100;
                html += `<div class="${cls}" style="--l:${l}%;--d:-${d}s"></div>`;
            }
            return html;
        } catch (e) {
            console.error('[MeteoCard] _rain:', e);
            return '';
        }
    }

    _snow(n, css) {
        const cls = `${this._cardId}-snow`;
        if (!css.shared.has(cls)) {
            css.shared.add(cls);
            css.content += `.${cls}{position:absolute;width:var(--w);height:var(--w);background:#FFFFFF;border-radius:50%;left:var(--l);top:-10px;opacity:var(--op);filter:blur(1px);animation:snow-fall var(--dur) linear infinite,snow-sway var(--sdur) ease-in-out infinite alternate;animation-delay:var(--dd);z-index:500}`;
        }
        let h = '';
        for (let i = 0; i < n; i++) {
            const w = (2 + Math.random() * 4).toFixed(1);
            const sw = Math.round(15 + Math.random() * 30);
            const dur = (7 + Math.random() * 5).toFixed(1);
            const sdur = (2 + Math.random() * 2).toFixed(1);
            h += `<div class="${cls}" style="--w:${w}px;--l:${(Math.random()*100).toFixed(1)}%;--op:${(0.4+Math.random()*0.6).toFixed(2)};--dur:${dur}s;--sdur:${sdur}s;--dd:-${(Math.random()*10).toFixed(1)}s;--sway:${sw}px"></div>`;
        }
        return h;
    }

    _fog(n, css) {
        try {
            if (n <= 0) return '';

            const fogConf = this._meteoConfig.get('fog');
            const opacityMin = fogConf?.opacity_min ?? 0.15;
            const opacityMax = fogConf?.opacity_max ?? 0.85;
            const blur = fogConf?.blur ?? 15;
            const height = fogConf?.height ?? 180;
            let html = '';
            for (let i = 0; i < n; i++) {
                const id = `${this._cardId}-fog-${i}`;
                const dur = (8 + Math.random() * 8).toFixed(2);
                const top = 30 + (i * 10);
                const delay = Math.round(Math.random() * dur * 100) / 100;
                const zIdx = 600 + i;

                css.content += `.${id}{position:absolute;width:150%;height:${height}px;left:-25%;top:${top}%;background:linear-gradient(to bottom,transparent 0%,rgba(255,255,255,0.25) 35%,rgba(255,255,255,0.45) 50%,rgba(255,255,255,0.25) 65%,transparent 100%);animation:fog-boil ${dur}s ease-in-out infinite alternate;animation-delay:-${delay}s;filter:blur(${blur}px);will-change:transform,opacity;z-index:${zIdx};--fog-opacity-min:${opacityMin};--fog-opacity-max:${opacityMax}}`;
                html += `<div class="${id}"></div>`;
            }
            return html;
        } catch (e) {
            console.error('[MeteoCard] _fog:', e);
            return '';
        }
    }

    // Returns the CSS z-index for a named layer.
    // sky(1) < background(2) < shadow(3) < moon(4) < sun(5) < foreground(500) < demo_mode(9999).
    // The large gap before foreground ensures rain/snow/fog always render above all celestial layers.
    // demo_mode sits above everything so the control panel is never obscured.
    _zIdx(l) {
        const layerStr = typeof l === 'string' ? l : '';
        return {
            'sky': 1,
            'background': 2,
            'shadow': 3,
            'moon': 4,
            'sun': 5,
            'foreground': 500,
            'demo_mode': 9999
        } [layerStr] || 2;
    }

    _formatTime(hour) {
        const h = Math.floor(hour);
        const m = Math.floor((hour % 1) * 60);
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:00`;
    }

    // Maps a raw Home Assistant weather state string to one of the card's
    // internal condition keys (defined in MeteoConfig.DEFAULTS.conditions).
    // Uses substring matching so it handles both standard HA states ('rainy',
    // 'partlycloudy') and custom integrations that embed the same keywords.
    // Falls back to 'sunny' for any unrecognised state.
    _weatherMatrix(state) {
        const s = (state || '').toLowerCase();
        if (s.includes('lightning') || s.includes('storm')) return 'lightning-rainy';
        if (s.includes('pouring') || s.includes('heavy')) return 'pouring';
        if (s.includes('rain')) return 'rainy';
        if (s.includes('snow')) return 'snowy';
        if (s.includes('partly') || s.includes('broken')) return 'partlycloudy';
        if (s.includes('cloud')) return 'cloudy';
        if (s.includes('fog') || s.includes('mist')) return 'fog';
        if (s.includes('clear')) return 'clear-night';
        return 'sunny';
    }

    _injectStyles() {
        const cssText = `
            :host { display: block; isolation: isolate; position: relative; width: 100%; height: 100%; overflow: hidden; }
            ha-card { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; overflow: hidden !important; background: transparent !important; border: none !important; border-radius: 0 !important; padding: 0 !important; display: block !important; isolation: isolate; }
            .layer-container { pointer-events: none; position: absolute; inset: 0; overflow: hidden; }
            .sun-wrapper, .moon-container { position: absolute; left: 0; top: 0; pointer-events: none; width: 900px; height: 900px; will-change: transform; transition: transform 0.5s linear; }
            .layer-container { contain: paint; }
            .sun-container { position: absolute; inset: 0; width: 100%; height: 100%; }
            .lens-flare { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
            .lightning { position: absolute; inset: 0; background: white; opacity: 0; animation: flash 5s infinite; z-index: 998; mix-blend-mode: overlay; }

            .demo-controls { position: absolute; top: 12px; left: 12px; z-index: 10000; background: rgba(0, 0, 0, 0.85); padding: 8px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); min-width: 140px; pointer-events: auto !important; font-family: system-ui, -apple-system, sans-serif; }

            .demo-controls-buttons { display: flex; gap: 6px; justify-content: space-between; }
            .demo-btn { border: none; color: white !important; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 10px; text-transform: uppercase; transition: background 0.2s ease; min-width: 65px; font-weight: bold; pointer-events: auto !important; }
            .demo-btn.btn-pause { background-color: #d1a513 !important; color: black !important; }
            .demo-btn.btn-play { background-color: #2196F3 !important; color: white !important; }
            .demo-btn.btn-stop { background-color: #FF5252 !important; padding: 4px 8px; min-width: auto; }
            .demo-btn:hover { filter: brightness(1.2); }
            .demo-btn:active { transform: scale(0.95); }

            .demo-select { background: rgba(255, 255, 255, 0.15); color: white; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; font-size: 10px; padding: 3px; cursor: pointer; outline: none; width: 100%; pointer-events: auto !important; font-family: inherit; }
            .demo-select option { background: #222; color: white; }

            .demo-stats-inner { display: flex; flex-direction: column; gap: 3px; pointer-events: none; }
            .stat-row { display: flex; justify-content: space-between; gap: 8px; font-family: system-ui, -apple-system, sans-serif; font-size: 9px; line-height: 1.2; }
            .stat-label { color: #2196F3; font-weight: bold; flex-shrink: 0; }
            .stat-value { color: rgba(255, 255, 255, 0.9); text-align: right; }

            .demo-stats-container { padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .demo-controls-container { display: flex; flex-direction: column; gap: 8px; }
        `;

        // Adopted StyleSheets: a single CSS object shared across all Shadow Roots.
        if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in ShadowRoot.prototype) {
            if (!_meteoSharedSheet) {
                _meteoSharedSheet = new CSSStyleSheet();
                _meteoSharedSheet.replaceSync(cssText);
            }
            if (!this.shadowRoot.adoptedStyleSheets.includes(_meteoSharedSheet)) {
                this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, _meteoSharedSheet];
            }
        } else {
            // Fallback for older browsers that don't support Adopted StyleSheets: inject a <style> tag.
            if (!this.shadowRoot.querySelector('style[data-meteo-injected]')) {
                const s = document.createElement('style');
                s.setAttribute('data-meteo-injected', 'true');
                s.textContent = cssText;
                this.shadowRoot.appendChild(s);
            }
        }

        if (!this._keyframesSheet) {
            this._keyframesSheet = document.createElement('style');
            this._keyframesSheet.id = 'meteo-keyframes';
            this.shadowRoot.appendChild(this._keyframesSheet);
        }

        if (!this._demoControlsCreated && this._isDemoLayerEnabled && this._isDemoUIMaster) {
            this._createPersistentDemoControls();
            this._demoControlsCreated = true;
        }
    }
}

if (!customElements.get('meteo-card')) {
    customElements.define('meteo-card', MeteoCard);
}
window.customCards = window.customCards || [];
window.customCards.push(CARD_CONFIG);
