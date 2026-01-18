console.info("%c 🙂 MeteoCSS Card %c v2.0.0 %c", "background:#2196F3;color:white;padding:2px 8px;border-radius:3px 0 0 3px;font-weight:bold", "background:#4CAF50;color:white;padding:2px 8px;border-radius:0 3px 3px 0", "background:none");

const CARD_CONFIG = {
    type: 'meteo-card',
    name: 'MeteoCSS Card',
    description: 'Weather card with realistic weather conditions, sky, sun, and moon.',
    preview: true
};

const MeteoSingletons = {};
const singletonStructure = {
    demoTimeOffset: 0,
    demoState: 'stopped',
    demoResetRequested: false,
    lastUpdateTimestamp: Date.now(),
    demoScenario: [],
    lastCycleId: -1,
    demoForcedCondition: 'auto',
    demoUIMaster: null,
    demoUIElement: null,
    actualState: null,
    masterLock: null,
    bgCloudCount: 0,
    fgCloudCount: 0,
    registeredCards: new Set(),
    lastPauseState: false,
    dataMaster: null
};

class SingletonManager {
    static getSingleton(singletonId) {
        if (!MeteoSingletons[singletonId]) {
            MeteoSingletons[singletonId] = {
                demoTimeOffset: 0,
                demoState: 'stopped',
                demoResetRequested: false,
                lastUpdateTimestamp: Date.now(),
                demoScenario: [],
                lastCycleId: -1,
                demoForcedCondition: 'auto',
                demoUIMaster: null,
                demoUIElement: null,
                actualState: null,
                masterLock: null,
                bgCloudCount: 0,
                fgCloudCount: 0,
                registeredCards: new Set(),
                lastPauseState: false,
                dataMaster: null,
                realDataReady: false,
                realDataTimestamp: null
            };
        }
        return MeteoSingletons[singletonId];
    }

    static stopDemo(singletonId) {
        const singleton = this.getSingleton(singletonId);
        singleton.demoState = 'stopped';
    }

    static startDemo(singletonId) {
        const state = this.getSingleton(singletonId);
        state.demoState = 'running';
        state.lastUpdateTimestamp = Date.now();
        state.masterLock = null;
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

    static isResetRequested(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.demoResetRequested;
    }

    static isMaster(singletonId, cardId) {
        const singleton = this.getSingleton(singletonId);
        if (singleton.demoUIMaster === cardId) return true;

        if (!singleton.demoUIMaster || !document.getElementById(singleton.demoUIMaster)) {
            singleton.demoUIMaster = cardId;
            singleton.masterLock = Date.now();
            return true;
        }
        return singleton.demoUIMaster === cardId;
    }

    static electDataMaster(singletonId, cardId, hasDemo) {
        const singleton = this.getSingleton(singletonId);
        
        if (hasDemo) {
            singleton.dataMaster = cardId;
            return true;
        }
        
        if (!singleton.dataMaster) {
            singleton.dataMaster = cardId;
            return true;
        }
        
        if (!document.getElementById(singleton.dataMaster)) {
            singleton.dataMaster = cardId;
            return true;
        }
        
        const isMaster = singleton.dataMaster === cardId;
        return isMaster;
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
        const singleton = this.getSingleton(singletonId);
        singleton.registeredCards.delete(cardId);
    }

    static getCardCount(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.registeredCards.size;
    }

    static getMasterCount(singletonId) {
        const singleton = this.getSingleton(singletonId);
        return singleton.demoUIMaster ? 1 : 0;
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

class DemoEngine {
    constructor(config, singletonId) {
        this.config = config;
        this.singletonId = singletonId;
        this.moonPhases = ['Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent','New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous'];
    }

    compute() {
        const shared = SingletonManager.getSingleton(this.singletonId);
        const now = Date.now();
        
        if (shared.demoState === 'running') {
            shared.demoTimeOffset += (now - shared.lastUpdateTimestamp);
        }
        shared.lastUpdateTimestamp = now;

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
        const sunElevation = 35 * Math.sin((hour - 6) * Math.PI / 12);
        const sunPos = this._getCoords(sunAzimuth, sunElevation);
        const moonPos = this._getCoords((sunAzimuth + 180) % 360, -sunElevation);

        const moonCycleIndex = Math.floor((prog * this.moonPhases.length) % this.moonPhases.length);
        const moonPhase = this.moonPhases[moonCycleIndex];
        const moonPhaseDegrees = (prog * this.moonPhases.length * 360) % 360;
        
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
        try {
            const az = parseFloat(azimuth);
            const el = parseFloat(elevation);

            if (isNaN(az) || isNaN(el)) {
                return { left: 50, top: 50, elevation: 0, azimuth: 0 };
            }

            const o = this.config.get('orbit');
            const houseAngle = this.config.get('house_angle');
            const invertAzimuth = this.config.get('invert_azimuth');

            let finalAz = invertAzimuth ? (az + 180) % 360 : az;
            const rad = (finalAz - houseAngle) * Math.PI / 180;
            const x0 = o.rx * Math.sin(rad);
            const y0 = -o.ry * Math.cos(rad);
            const tiltRad = o.tilt * Math.PI / 180;
            const xRot = x0 * Math.cos(tiltRad) - y0 * Math.sin(tiltRad);
            const yRot = x0 * Math.sin(tiltRad) + y0 * Math.cos(tiltRad);

            return {
                left: Math.max(0, Math.min(100, o.cx + xRot)),
                top: Math.max(0, Math.min(100, o.cy + yRot)),
                elevation: el,
                azimuth: finalAz
            };
        } catch (e) {
            console.error('[DemoEngine] _getCoords:', e);
            return { left: 50, top: 50, elevation: 0, azimuth: 0 };
        }
    }
}


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

class MeteoState {
    constructor(data = {}) {
        this.condition = data.condition || 'sunny';
        this.isNight = data.isNight ?? false;
        this.sunPos = data.sunPos || { left: 50, top: 50, elevation: 80, azimuth: 160 };
        this.moonPos = data.moonPos || { left: 50, top: 50, elevation: -25, azimuth: 340 };
        this.moonPhase = data.moonPhase || 'Full Moon';
        this.moonPhaseDegrees = data.moonPhaseDegrees || 0;
        this.rising = data.rising ?? false;
        this.simulatedHour = data.simulatedHour ?? (new Date().getHours() + (new Date().getMinutes() / 60));
        this.windSpeed = data.windSpeed ?? 25;
    }
}

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
        orbit: { rx: 45, ry: 40, cx: 50, cy: 50, tilt: 0 },
        sun: {
            disc_radius: 8, halo_radius: 50, aura_radius: 130,
            aura_opacity: 0.15, halo_opacity: 0.4, zoom: 1.0,
            sunset_limits: [0, 5], sunrise_limits: [0, 5],
            colors: { aura: '#FFCC00', halo: '#FFFFFF', disc: '#FFFFFF' },
            lens_flare: {
                enabled: true, halo_radius: 120, halo_stroke_width: 2,
                halo_opacity: 0.3, inner_halo_radius: 50, inner_halo_stroke_width: 1,
                inner_halo_opacity: 0.2,
                flares: [
                    { distance: 80, radius: 18, color: '#FFFFFF', opacity: 0.25 },
                    { distance: 130, radius: 12, color: '#FFAAFF', opacity: 0.15 },
                    { distance: 160, radius: 8, color: '#AAFFFF', opacity: 0.1 }
                ],
                glow_stdDeviation: 3
            }
        },
        moon: {
            disc_radius: 8, halo_radius: 35, aura_radius: 80,
            aura_opacity: 0.1, halo_opacity: 0.2, zoom: 1.0,
            colors: { aura: '#FFFFFF', disc_light: '#FDFDFD', disc_dark: '#9595A5' }
        },
        rain_intensity: { width: 1, heavy: 200, normal: 100, low: 50 },
        snow_intensity: { normal: 80 },
        clouds: {
            heavy: [15, 5, 4], normal: [10, 3, 2], low: [4, 2, 1],
            minimal: [2, 2, 0], none: [0, 0, 0],
            animation: { min_margin: 5, max_margin: 85, random_variation: 0.3 }
        },
        fog: { opacity_min: 0.15, opacity_max: 0.85, blur: 15, height: 180, count: 4 },
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
            'lightning-rainy': { clouds: 'heavy', background_ratio: 0.3, day_sky: 'dark', night_sky: 'dark', drops: 'heavy', lightning: true },
            'pouring': { clouds: 'heavy', background_ratio: 0.3, day_sky: 'dark', night_sky: 'dark', drops: 'normal' },
            'rainy': { clouds: 'normal', background_ratio: 0.7, day_sky: 'rainy', night_sky: 'normal', drops: 'low' },
            'snowy': { clouds: 'normal', background_ratio: 0.5, day_sky: 'snowy', night_sky: 'normal', flakes: 'normal' },
            'cloudy': { clouds: 'heavy', background_ratio: 0.6, day_sky: 'grey', night_sky: 'normal' },
            'partlycloudy': { clouds: 'low', background_ratio: 0.8, day_sky: 'inter', night_sky: 'normal' },
            'sunny': { clouds: 'minimal', background_ratio: 0.9, day_sky: 'normal', night_sky: 'clear' },
            'clear-night': { clouds: 'none', background_ratio: 0.5, day_sky: 'normal', stars: true, night_sky: 'clear' },
            'fog': { clouds: 'none', background_ratio: 0.3, fog: true, day_sky: 'grey', night_sky: 'normal' },
            'default': { clouds: 'low', background_ratio: 0.5, day_sky: 'normal', night_sky: 'normal' }
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
            if (source.hasOwnProperty(key)) {
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

class MeteoCard extends HTMLElement {
    constructor() {
        super();
        this._cardId = 'meteo-' + Math.random().toString(36).substr(2, 9);
        this._singletonId = null;
        this._sharedState = null;
        this._isDemoUIMaster = false;
        this._isDemoLayerEnabled = false;
        this._demoEngine = null;
        this._registeredInSingleton = false;
        this.cloudCounter = 0;
        this._moonMaskIdCounter = 0;
        this._initialized = false;
        this._lastHassUpdate = 0;
        this._demoRequest = undefined;
        this._slaveListenerRequest = undefined;
        this._previousStates = {};
        this._domCache = {};
        this._demoListeners = [];
        this.dynamicStyleSheet = null;
        this._loadedKeyframes = null;
        this._keyframesSheet = null;
        this._weatherEntityId = null;
        this._sunEntityId = null;
        this._moonAzimuthEntityId = null;
        this._moonElevationEntityId = null;
        this._moonPhaseEntityId = null;
        this._moonDegreesEntityId = null;
        this._cachedDemoOptions = null;
        this._meteoConfig = null;
        this._validatedEntities = {
            weather: null, sun: null, moonAzimuth: null,
            moonElevation: null, moonPhase: null, moonDegrees: null
        };
        this._lastCondition = null;
        this._lastNight = null;
        this._hass = null;
        this._isDataMaster = false;
    }

    set hass(hass) {
        try {
            if (!this.content) {
                this.innerHTML = `<ha-card></ha-card>`;
                this.content = this.querySelector('ha-card');
                if (!this.content) {
                    console.error('[MeteoCard] Failed to initialize content container');
                    return;
                }
                this._injectStyles();
            }

            this._hass = hass;

            if (this._singletonId && !this._registeredInSingleton) {
                SingletonManager.registerCard(this._singletonId, this._cardId);
                this._registeredInSingleton = true;
            }

            const sharedState = SingletonManager.getSingleton(this._singletonId);
            
            if (!sharedState.realDataReady) {
                this._validateEntitiesFromHass(hass);
                const realData = this._realData();
                if (realData) {
                    SingletonManager.setActualState(this._singletonId, realData);
                    sharedState.realDataReady = true;
                    sharedState.realDataTimestamp = Date.now();
                }
            }
            
            const hasActiveDemo = sharedState && sharedState.actualState && sharedState.demoUIMaster;
            const demoState = SingletonManager.getDemoState(this._singletonId);

            if (hasActiveDemo && demoState === 'running' && this._initialized) {
                return;
            }

            const now = Date.now();
            if (this._initialized && this._lastHassUpdate && now - this._lastHassUpdate < 1000) {
                return;
            }
            this._lastHassUpdate = now;

            const newWeatherState = hass.states[this._weatherEntityId]?.state;
            const newSunAzimuth = hass.states[this._sunEntityId]?.attributes?.azimuth;

            if (this._initialized && 
                this._previousStates.weather === newWeatherState &&
                this._previousStates.azimuth === newSunAzimuth) {
                return;
            }
            
            this._previousStates.weather = newWeatherState;
            this._previousStates.azimuth = newSunAzimuth;

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
            this._validatedEntities.weather = EntityValidator.validate(hass, this._weatherEntityId, { state: true });
            this._validatedEntities.sun = EntityValidator.validate(hass, this._sunEntityId, {
                requiredAttributes: ['azimuth', 'elevation'],
                numericAttribute: { 'azimuth': { min: 0, max: 360 }, 'elevation': { min: -180, max: 180 } }
            });

            if (!this._moonAzimuthEntityId) {
                const moonAzAlt = EntityValidator.validate(hass, 'sensor.luna_lunar_azimuth') ||
                                  EntityValidator.validate(hass, 'sensor.moon_azimuth');
                this._validatedEntities.moonAzimuth = moonAzAlt;
            } else {
                this._validatedEntities.moonAzimuth = EntityValidator.validate(hass, this._moonAzimuthEntityId);
            }

            if (!this._moonElevationEntityId) {
                const moonElAlt = EntityValidator.validate(hass, 'sensor.luna_lunar_elevation') ||
                                  EntityValidator.validate(hass, 'sensor.moon_elevation');
                this._validatedEntities.moonElevation = moonElAlt;
            } else {
                this._validatedEntities.moonElevation = EntityValidator.validate(hass, this._moonElevationEntityId);
            }

            if (!this._moonPhaseEntityId) {
                const moonPhaseAlt = EntityValidator.validate(hass, 'sensor.luna_lunar_phase') ||
                                     EntityValidator.validate(hass, 'sensor.moon_phase');
                this._validatedEntities.moonPhase = moonPhaseAlt;
            } else {
                this._validatedEntities.moonPhase = EntityValidator.validate(hass, this._moonPhaseEntityId);
            }

            if (!this._moonDegreesEntityId) {
                const moonDegreesAlt = EntityValidator.validate(hass, 'sensor.luna_lunar_phase_degrees') ||
                                       EntityValidator.validate(hass, 'sensor.moon_phase_degrees');
                this._validatedEntities.moonDegrees = moonDegreesAlt;
            } else {
                this._validatedEntities.moonDegrees = EntityValidator.validate(hass, this._moonDegreesEntityId);
            }
        } catch (e) {
            console.error('[MeteoCard] _validateEntitiesFromHass:', e);
        }
    }

    setConfig(config) {
        try {
            if (!this._cardId) {
                this._cardId = 'card_' + Math.random().toString(36).substr(2, 9);
            }

            this._meteoConfig = new MeteoConfig(config);

            const layers = this._meteoConfig.get('layers') || [];
            const demoLayer = layers.find(l => typeof l === 'string' && l.startsWith('demo_mode'));

            if (config.singleton_id) {
                this._singletonId = config.singleton_id;
                SingletonManager.getSingleton(this._singletonId);
            } else if (demoLayer) {
                this._singletonId = demoLayer;
                SingletonManager.getSingleton(this._singletonId);
            } else {
                this._singletonId = this._cardId;
                SingletonManager.getSingleton(this._singletonId);
            }

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
                weather: null, sun: null, moonAzimuth: null,
                moonElevation: null, moonPhase: null, moonDegrees: null
            };

            if (!this.content) {
                this.innerHTML = `<ha-card></ha-card>`;
                this.content = this.querySelector('ha-card');
                if (!this.content) {
                    console.error('[MeteoCard] Failed to initialize content in setConfig');
                    return;
                }
                this.content.id = this._cardId; 
                this._injectStyles();
            }

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
                        sunPos: { left: 50, top: 50, elevation: 80, azimuth: 160 },
                        moonPos: { left: 50, top: 50, elevation: -25, azimuth: 340 },
                        windSpeed: 0
                    });
                    this._renderAll(defaultState);
                }
                
                const retryData = () => {
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
        }

        const loop = () => {
            if (!this.isConnected) {
                this._stopSlaveListener();
                return;
            }
            try {
                this._checkForMasterAndStartDemo();
                this._update();
            } catch (e) {
                console.error('[MeteoCard] slave listener:', e);
            }
            this._slaveListenerRequest = requestAnimationFrame(loop);
        };
        this._slaveListenerRequest = requestAnimationFrame(loop);
    }

    _stopSlaveListener() {
        if (this._slaveListenerRequest) {
            cancelAnimationFrame(this._slaveListenerRequest);
            this._slaveListenerRequest = undefined;
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

        if (!this._isDemoLayerEnabled) {
            const totalCards = sharedState.registeredCards.size;
            
            if (totalCards > 1) {
                const isMaster = SingletonManager.isMaster(this._singletonId, this._cardId);
                if (isMaster && !this._isDemoUIMaster) {
                    this._isDemoUIMaster = true;
                }
                if (!isMaster && this._isDemoUIMaster) {
                    this._isDemoUIMaster = false;
                }
            }
            return;
        }
        
        const master = sharedState.demoUIMaster;
        const isMaster = SingletonManager.isMaster(this._singletonId, this._cardId);
        
        if (isMaster && !this._demoEngine) {
            this._isDemoUIMaster = true;
            this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
            this._demoEngine.compute();
            SingletonManager.setActualState(this._singletonId, this._demoEngine.compute());
            this._startDemo();
        }
        
        if (!master || !document.getElementById(master)) {
            if (isMaster) {
                this._isDemoUIMaster = true;
                if (!this._demoEngine) {
                    this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                }
            }
        }
    }

    disconnectedCallback() {
        SingletonManager.unregisterCard(this._singletonId, this._cardId);
        this._cleanup();
    }

    getCardSize() {
        return 6;
    }

    getGridOptions() {
        return { min_columns: 2, max_columns: 4, min_rows: 3, max_rows: 10 };
    }

    _cleanup() {
        this._stopSlaveListener();
        this._cleanupDemoEvents();
        this._domCache = {};
        this._demoListeners = [];
    }

    _startDemo() {
        this._stopDemo();

        const demoStartTime = Date.now();
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
            
            if (SingletonManager.isResetRequested(this._singletonId)) {
                this._sharedState.demoResetRequested = false;
                this._demoRequest = undefined;
                this._startDemo();
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    _getCoords(azimuth, elevation) {
        try {
            const az = parseFloat(azimuth);
            const el = parseFloat(elevation);

            if (isNaN(az) || isNaN(el)) {
                console.warn('[MeteoCard] Invalid coordinates:', { azimuth, elevation });
                return { left: 50, top: 50, elevation: 0, azimuth: 0 };
            }

            const o = this._meteoConfig.get('orbit');
            const houseAngle = this._meteoConfig.get('house_angle');
            const invertAzimuth = this._meteoConfig.get('invert_azimuth');

            let finalAz = invertAzimuth ? (az + 180) % 360 : az;
            const rad = (finalAz - houseAngle) * Math.PI / 180;
            const x0 = o.rx * Math.sin(rad);
            const y0 = -o.ry * Math.cos(rad);
            const tiltRad = o.tilt * Math.PI / 180;
            const xRot = x0 * Math.cos(tiltRad) - y0 * Math.sin(tiltRad);
            const yRot = x0 * Math.sin(tiltRad) + y0 * Math.cos(tiltRad);

            return {
                left: Math.max(0, Math.min(100, o.cx + xRot)),
                top: Math.max(0, Math.min(100, o.cy + yRot)),
                elevation: el,
                azimuth: finalAz
            };
        } catch (e) {
            console.error('[MeteoCard] _getCoords:', e);
            return { left: 50, top: 50, elevation: 0, azimuth: 0 };
        }
    }

    _update() {
        try {
            if (!this.content) return;

            const layers = this._meteoConfig.get('layers') || [];
            const demoLayerExists = layers.find(l => typeof l === 'string' && l.startsWith('demo_mode'));
            this._isDemoLayerEnabled = !!demoLayerExists;

            const sharedState = SingletonManager.getSingleton(this._singletonId);
            let rawData = SingletonManager.getActualState(this._singletonId);
            
            if (this._isDemoLayerEnabled) {
                const shouldBeMaster = SingletonManager.isMaster(this._singletonId, this._cardId);
                if (shouldBeMaster && !this._isDemoUIMaster) {
                    this._isDemoUIMaster = true;
                    if (!this._demoEngine) {
                        this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                        this._demoEngine.compute();
                    }
                    this._startDemo();
                }
                if (!shouldBeMaster && this._isDemoUIMaster) {
                    this._isDemoUIMaster = false;
                    this._stopDemo();
                }
            }
            this._updateDemoUI();
            if (!this._hass) {
                if (!this._initialized) {
                    this._renderAll(new MeteoState());
                }
                return;
            }

            const hasActiveDemoState = sharedState && sharedState.actualState;

            if (hasActiveDemoState) {
                rawData = SingletonManager.getActualState(this._singletonId);
            }

            if (!rawData && this._hass) {
                rawData = this._realData();
            }
            this._updateDemoUI();

            if (!rawData) return;

            const state = new MeteoState(rawData);
            const demoState = SingletonManager.getDemoState(this._singletonId);
            if (!this._initialized || 
                this._lastCondition !== state.condition || 
                state.isNight !== this._lastNight || 
                this._lastDemoState !== demoState)
            {
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
            const sunPos = this._getCoords(sunAzimuth, sunElevation);

            let moonPos = this._getCoords((sunAzimuth + 180) % 360, -sunElevation);

            const moonAzEntity = this._hass.states[this._moonAzimuthEntityId];
            const moonElEntity = this._hass.states[this._moonElevationEntityId];
            
            if (moonAzEntity && moonElEntity) {
                const moonAz = parseFloat(moonAzEntity.state) || (sunAzimuth + 180);
                const moonEl = parseFloat(moonElEntity.state) || -sunElevation;
                moonPos = this._getCoords(moonAz, moonEl);
            }

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
                simulatedHour: new Date().getHours() + (new Date().getMinutes() / 60), 
                windSpeed 
            };

            SingletonManager.setActualState(this._singletonId, realDataState);

            return realDataState;
        } catch (e) {
            console.error('[MeteoCard] _realData:', e);
            return null;
        }
    }

    _getDemoUIOptions() {
        if (this._cachedDemoOptions) return this._cachedDemoOptions;

        const cond = this._meteoConfig.get('conditions');
        let opts = `<option value="auto">🔄 Auto</option>`;
        Object.keys(cond).filter(c => c !== 'default').forEach(c => {
            opts += `<option value="${c}">${c.toUpperCase()}</option>`;
        });

        this._cachedDemoOptions = opts;
        return opts;
    }

    _updateDynamic(state) {
        try {
            let { isNight, sunPos, moonPos, moonPhase, moonPhaseDegrees, rising, condition, simulatedHour: hour, windSpeed } = state;

            const sharedState = SingletonManager.getSingleton(this._singletonId);
            const demoState = SingletonManager.getDemoState(this._singletonId);
            
            sharedState.sunPos = sunPos;
            sharedState.moonPos = moonPos;
            sharedState.moonPhase = moonPhase;
            sharedState.moonPhaseDegrees = moonPhaseDegrees;
            sharedState.isNight = isNight;
            sharedState.rising = rising;
            sharedState.condition = condition;
            sharedState.windSpeed = windSpeed;
            sharedState.simulatedHour = hour;

            const sunWrapper = this._domCache.sunWrapper || this.content?.querySelector('.sun-wrapper');
            if (sunWrapper) {
                if (this._isDemoLayerEnabled) sunWrapper.style.transition = 'none';
                sunWrapper.style.display = sharedState.sunPos.elevation >= 0 ? 'block' : 'none';
                sunWrapper.style.left = `${sharedState.sunPos.left}%`;
                sunWrapper.style.top = `${sharedState.sunPos.top}%`;
            }

            const sun = this._domCache.sunContainer || this.content?.querySelector('.sun-container');
            if (sun) {
                if (sharedState.sunPos.elevation >= 0) {
                    sun.innerHTML = this._sunSVG();
                } else {
                    sun.innerHTML = '';
                }
            }

            const lensFlare = this._domCache.lensFlare || this.content?.querySelector('.lens-flare');
            if (lensFlare) {
                if (sharedState.sunPos.elevation >= 0 && this._meteoConfig.get('sun.lens_flare.enabled')) {
                    const minuteOfDay = Math.floor(hour * 60);
                    lensFlare.innerHTML = this._lensFlare(sharedState.sunPos, minuteOfDay);
                } else {
                    lensFlare.innerHTML = '';
                }
            }

            const moon = this._domCache.moonContainer || this.content?.querySelector('.moon-container');
            if (moon) {
                if (this._isDemoLayerEnabled) moon.style.transition = 'none';
                moon.style.display = sharedState.moonPos.elevation >= 0 ? 'block' : 'none';
                moon.style.left = `${sharedState.moonPos.left}%`;
                moon.style.top = `${sharedState.moonPos.top}%`;
                if (sharedState.moonPos.elevation >= 0) {
                    moon.innerHTML = this._moonSVG(sharedState.moonPhase, !sharedState.isNight, sharedState.moonPhaseDegrees);
                } else {
                    moon.innerHTML = '';
                }
            }

            const sky = this._domCache.skyBg || this.content?.querySelector('.sky-bg');
            if (sky) {
                let fPos = isNight ? moonPos : sunPos;
                const conf = this._meteoConfig.get(`conditions.${condition}`);
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
                } else {
                    if (isNight) {
                        colors = this._meteoConfig.get(`colors.night.${conf.night_sky}`);
                    } else {
                        colors = this._meteoConfig.get(`colors.day.${conf.day_sky}`);
                    }
                }
                
                sky.style.background = `radial-gradient(circle at ${fPos.left}% ${fPos.top}%, ${colors})`;
            }
            this._updateDemoUI();
        } catch (e) {
            console.error('[MeteoCard] _updateDynamic:', e);
        }
    }

    _updateDemoUI() {
        const sharedState = SingletonManager.getSingleton(this._singletonId);
        const demoState = SingletonManager.getDemoState(this._singletonId);
        const isRunning = demoState === 'running';

        const statsContainer = this.querySelector('.demo-stats-inner');
        if (statsContainer) {
            statsContainer.innerHTML = this._demoUI();
        }

        const btn = this.querySelector('#btn-toggle-demo');
        if (btn) {
            const newText = isRunning ? '⏸ Pause' : '▶ Play';
            const newClass = isRunning ? 'btn-pause' : 'btn-play';
            btn.textContent = newText;
            btn.classList.remove('btn-play', 'btn-pause');
            btn.classList.add(newClass);
        }

        const select = this.querySelector('#select-demo-condition');
        if (select) {
            select.value = sharedState.demoForcedCondition || 'auto';
        }
    }

    _injectKeyframesForCondition(condition, isNight) {
        if (this._loadedKeyframes === condition) return;
        this._loadedKeyframes = condition;

        const keyframes = {
            base: `@keyframes to-right { to { transform:translateX(calc(100vw + 500px)); } } @keyframes flash { 0%,90%,94%,100%{opacity:0;} 92%{opacity:0.4;} }`,
            star: `@keyframes star { 0%,100%{opacity:1;} 50%{opacity:0.2;} }`,
            shot: `@keyframes shot { 0%{transform:rotate(45deg) translateX(-200px);opacity:0;} 1%{opacity:1;} 10%{transform:rotate(45deg) translateX(1200px);opacity:0;} 100%{opacity:0;} }`,
            rain: `@keyframes rain-fall { to { transform:translateY(110vh) skewX(-15deg); } }`,
            snow: `@keyframes snow-fall { 0% { transform: translateY(-10vh); } 100% { transform: translateY(110vh); } } @keyframes snow-sway { 0% { margin-left: calc(var(--sway) * -1); } 100% { margin-left: var(--sway); } }`,
            fog: `@keyframes fog-boil { 0% { transform: scale(1) translateY(0); opacity: var(--fog-opacity-min); } 50% { opacity: var(--fog-opacity-max); } 100% { transform: scale(1.15) translateY(-20px); opacity: var(--fog-opacity-min); } }`
        };

        let requiredKeyframes = keyframes.base;
        const conf = this._meteoConfig.get(`conditions.${condition}`) || this._meteoConfig.get('conditions.default');

        if (isNight && conf.stars) requiredKeyframes += keyframes.star + keyframes.shot;
        if (conf.clouds && conf.clouds !== 'none') requiredKeyframes += keyframes.base;
        if (conf.drops) requiredKeyframes += keyframes.rain;
        if (conf.flakes) requiredKeyframes += keyframes.snow;
        if (conf.fog) requiredKeyframes += keyframes.fog;
        if (conf.lightning) requiredKeyframes += keyframes.base;

        if (!this._keyframesSheet) {
            this._keyframesSheet = document.createElement('style');
            this._keyframesSheet.id = 'meteo-keyframes';
            this.appendChild(this._keyframesSheet);
        }

        this._keyframesSheet.textContent = requiredKeyframes;
    }

    _renderAll(state) {
        try {
            this.cloudCounter = 0;
            const { condition, isNight, sunPos, moonPos, moonPhase, rising, windSpeed } = state;
            const css = { content: '' };
            
            this._cleanupEvents();
            
            const old = this.content?.querySelector('.demo-ui-container');
            if (old) old.remove();

            this._injectKeyframesForCondition(condition, isNight);

            const cond = this._meteoConfig.get(`conditions.${condition}`) || this._meteoConfig.get('conditions.default');
            const configuredLayers = this._meteoConfig.get('layers') || [];

            const sharedState = SingletonManager.getSingleton(this._singletonId);
            sharedState.sunPos = sunPos;
            sharedState.moonPos = moonPos;
            sharedState.moonPhase = moonPhase;
            sharedState.moonPhaseDegrees = state.moonPhaseDegrees;
            sharedState.isNight = isNight;
            sharedState.rising = rising;
            sharedState.condition = condition;
            sharedState.windSpeed = windSpeed;

            let html = `<svg style="width:0;height:0;position:absolute;"><filter id="cloud-distort"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="35" /></filter></svg>`;

            configuredLayers.forEach(l => {
                const zIdx = this._zIdx(l);
                const layerHtml = this._renderLayer(l, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed, cond);
                if (layerHtml) {
                    html += `<div class="layer-container" style="z-index:${zIdx};">${layerHtml}</div>`;
                }
            });

            this.content.innerHTML = html;
            this._cacheDOM();

            if (!this.dynamicStyleSheet) {
                this.dynamicStyleSheet = document.createElement('style');
                this.appendChild(this.dynamicStyleSheet);
            }
            this.dynamicStyleSheet.textContent = css.content;

            this._updateDynamic(state);
        } catch (e) {
            console.error('[MeteoCard] _renderAll:', e);
        }
    }

    _cacheDOM() {
        this._domCache = {
            skyBg: this.content?.querySelector('.sky-bg'),
            sunWrapper: this.content?.querySelector('.sun-wrapper'),
            sunContainer: this.content?.querySelector('.sun-container'),
            moonContainer: this.content?.querySelector('.moon-container'),
            lensFlare: this.content?.querySelector('.lens-flare'),
        };
    }

    _cleanupEvents() {
        this._demoListeners.forEach(({ el, ev, fn }) => {
            if (el) el.removeEventListener(ev, fn);
        });
        this._demoListeners = [];
    }

    _cleanupDemoEvents() {
        this._cleanupEvents();
    }


    _renderLayer(layer, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed, cond) {
        try {
            const configuredLayers = this._meteoConfig.get('layers');
            if (!Array.isArray(configuredLayers) || !configuredLayers.includes(layer)) {
                return '';
            }
                
            if (layer === 'sky') {
                return `<div class="sky-bg" style="position:absolute; inset:0; transition: background 3s ease-in-out;"></div>` +
                    (isNight ? `<div style="position:absolute; inset:0;">${this._stars(100, css)}${this._shootings(2, css)}</div>` : '');
            }

            if (layer === 'sun') {
                return `<div class="sun-wrapper" style="position:absolute; transform:translate(-50%, -50%); pointer-events:none; display:none; width:900px; height:900px;">
                            <div class="sun-container" style="position:absolute; inset:0; width:100%; height:100%;"></div>
                            <div class="lens-flare" style="position:absolute; inset:0; width:100%; height:100%;"></div>
                        </div>`;
            }

            if (layer === 'moon') {
                return `<div class="moon-container" style="position:absolute; transform:translate(-50%, -50%); pointer-events:none; display:none; width:900px; height:900px;"></div>`;
            }
            
            let h = '';
            const cloudRatio = cond.background_ratio || 0.5;

            if (layer === 'background') {
                const bgHtml = this._clouds(cond.clouds, css, isNight, windSpeed, cloudRatio);
                const bgCloudCount = (bgHtml.match(/class="[^"]*-cl-/g) || []).length;
                const sharedState = SingletonManager.getSingleton(this._singletonId);
                sharedState.bgCloudCount = bgCloudCount;
                h += bgHtml;
                
                if (cond.fog) {
                    const fogCount = Math.ceil(this._meteoConfig.get('fog.count') * cloudRatio);
                    h += this._fog(fogCount, css);
                }
            }
            
            if (layer === 'foreground') {
                if (cond.lightning) h += `<div class="lightning"></div>`;
                const fgHtml = this._clouds(cond.clouds, css, isNight, windSpeed, (1 - cloudRatio));
                const fgCloudCount = (fgHtml.match(/class="[^"]*-cl-/g) || []).length;
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
            
            return h;
        } catch (e) {
            console.error('[MeteoCard] _renderLayer:', e);
            return '';
        }
    }

    _demoUI() {
        const state = SingletonManager.getSingleton(this._singletonId);
        const sharedState = state.actualState || {};
        
        const simulatedHour = sharedState.simulatedHour || 0;
        const h = Math.floor(simulatedHour);
        const m = Math.floor((simulatedHour % 1) * 60);
        const timeStr = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:00`;

        const totalClouds = (state.bgCloudCount || 0) + (state.fgCloudCount || 0);
        const sunConf = this._meteoConfig.get('sun');
        const srLimits = Array.isArray(sunConf.sunrise_limits) ? sunConf.sunrise_limits : [0, 5];
        const ssLimits = Array.isArray(sunConf.sunset_limits) ? sunConf.sunset_limits : [0, 5];
        const sunLimitsStr = `Rise: ${srLimits[0]}°/${srLimits[1]}° | Set: ${ssLimits[0]}°/${ssLimits[1]}°`;

        const rising = sharedState.rising ? '⬆️ RISING' : '⬇️ SETTING';
        const slaveCount = (state.registeredCards ? state.registeredCards.size : 1) - 1;

        return `
            <div class="stat-row">
                <span class="stat-label">State:</span>
                <span class="stat-value">${state.demoState.toUpperCase()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Time:</span>
                <span class="stat-value">${timeStr}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Weather:</span>
                <span class="stat-value">${(sharedState.condition || '').toUpperCase()}</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Wind:</span>
                <span class="stat-value">${(sharedState.windSpeed || 0).toFixed(1)} km/h</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Sun:</span>
                <span class="stat-value">${(sharedState.sunPos?.elevation || 0).toFixed(1)}° | ${(sharedState.sunPos?.azimuth || 0).toFixed(1)}°</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Moon:</span>
                <span class="stat-value">${(sharedState.moonPos?.elevation || 0).toFixed(1)}° | ${(sharedState.moonPos?.azimuth || 0).toFixed(1)}°</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Phase:</span>
                <span class="stat-value">${this._safe(sharedState.moonPhase)} | ${(sharedState.moonPhaseDegrees || 0).toFixed(1)}°</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Clouds:</span>
                <span class="stat-value">BG: ${state.bgCloudCount || 0} FG: ${state.fgCloudCount || 0}</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Limits:</span>
                <span class="stat-value">${sunLimitsStr}</span>
            </div>

            <div class="stat-row">
                <span class="stat-label">Cards:</span>
                <span class="stat-value"> 👑 1 / 👷 ${Math.max(0, slaveCount)}</div>
        `;
    }

    _createPersistentDemoControls() {
        const sharedState = SingletonManager.getSingleton(this._singletonId);
        const currentState = SingletonManager.getDemoState(this._singletonId);

        const isRunning = currentState === 'running';
        const playPauseBtn = `<button class="demo-btn btn-toggle ${isRunning ? 'btn-pause' : 'btn-play'}" id="btn-toggle-demo">${isRunning ? '⏸ Pause' : '▶ Play'}</button>`;

        const currentCondition = sharedState.demoForcedCondition || 'auto';
        const options = ['auto', ...Object.keys(this._meteoConfig.get('conditions'))]
            .filter(c => c !== 'default')
            .map(c => `<option value="${c}" ${currentCondition === c ? 'selected' : ''}>${c === 'auto' ? 'AUTO' : c.toUpperCase()}</option>`)
            .join('');

        const controlsHtml = `
            <div class="demo-controls">
                <div class="demo-stats-container">
                    <div class="demo-stats-inner">
                        ${this._demoUI()}
                    </div>
                </div>
                
                <div class="demo-controls-container">
                    <div class="demo-controls-buttons">
                        ${playPauseBtn}
                        <button class="demo-btn btn-stop" id="btn-stop-demo">⏹ STOP</button>
                    </div>
                    <select class="demo-select" id="select-demo-condition">
                        ${options}
                    </select>
                </div>
            </div>`;

        this.insertAdjacentHTML('beforeend', controlsHtml);
        this._attachDemoListeners();
    }

    _attachDemoListeners() {
        const btn = this.querySelector('#btn-toggle-demo');
        const stopBtn = this.querySelector('#btn-stop-demo');
        const select = this.querySelector('#select-demo-condition');
        
        if (this._demoListenersBound) {
            if (this._boundPlayPauseFn) btn?.removeEventListener('click', this._boundPlayPauseFn);
            if (this._boundStopFn) stopBtn?.removeEventListener('click', this._boundStopFn);
            if (this._boundSelectFn) select?.removeEventListener('change', this._boundSelectFn);
        }
        
        if (btn) {
        btn.onclick = (e) => {
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
                const initialState = this._demoEngine.compute();
                SingletonManager.setActualState(this._singletonId, initialState);
            }

            if (!this._demoRequest) {
                this._startDemo();
            }
            }

            btn.classList.toggle('btn-play', newState !== 'running');
            btn.classList.toggle('btn-pause', newState === 'running');
            btn.textContent = newState === 'running' ? '⏸ Pause' : '▶ Play';

            this._update();
        };
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
        try {
            const s = this._meteoConfig.get('sun');
            const col = s.colors;
            const center = 150; 

            return `
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
        } catch (e) {
            console.error('[MeteoCard] _sunSVG:', e);
            return '';
        }
    }

    _lensFlare(sunPos, minuteOfDay = 0) {
        try {
            const def = this._meteoConfig.get('sun.lens_flare');
            const lf = this._meteoConfig.get('sun.lens_flare');
            
            if (!lf.enabled) return '';
            
            const sharedState = SingletonManager.getSingleton(this._singletonId);
            const demoState = SingletonManager.getDemoState(this._singletonId);
            
            let rotation;
            if (demoState === 'running') {
                const now = Date.now();
                rotation = (now / 50) % 360;
            } else {
                const now = new Date();
                const totalSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                const rotationPerSecond = 360 / 86400;
                rotation = (totalSeconds * rotationPerSecond) % 360;
            }
            
            const elevationOpacity = Math.max(0, Math.min(1, (sunPos.elevation + 5) / 20));
            const center = 450;
            const uniqueId = this._cardId;
            const glowStd = lf.glow_stdDeviation ?? def.glow_stdDeviation;
            const haloRadius = lf.halo_radius ?? def.halo_radius;
            const haloStrokeWidth = lf.halo_stroke_width ?? def.halo_stroke_width;
            const haloOpacity = (lf.halo_opacity ?? def.halo_opacity) * elevationOpacity;
            const innerHaloRadius = lf.inner_halo_radius ?? def.inner_halo_radius;
            const innerHaloStrokeWidth = lf.inner_halo_stroke_width ?? def.inner_halo_stroke_width;
            const innerHaloOpacity = (lf.inner_halo_opacity ?? def.inner_halo_opacity) * elevationOpacity;
            const flares = lf.flares ?? def.flares;
            
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
            const def = this._meteoConfig.get('moon');
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
            if (adjustedNc === 0) return '';
            
            const anim = this._meteoConfig.get('clouds.animation');
            const minMargin = anim?.min_margin ?? 5;
            const maxMargin = anim?.max_margin ?? 85;
            const randomVariation = anim?.random_variation ?? 0.3;
            const bc = 255 - (gr * 25);
            let html = '';
            const baseDuration = (20 / (windSpeed + 1)) * 60;
            const minSpacing = 100 / (adjustedNc + 1);
            
            for (let i = 0; i < adjustedNc; i++) {
                const id = `${this._cardId}-cl-${this.cloudCounter++}`;
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

                css.content += `.${id}{position:absolute;top:${tp}%;left:-${cw * 2}px;width:${cw}px;height:${Math.round(bs * 2.2)}px;animation:to-right ${dur}s linear infinite;animation-delay:-${delay}s;filter:url(#cloud-distort) blur(5px);opacity:${opacity};mix-blend-mode:${isNight ? 'normal' : 'screen'};z-index:${zIdx};pointer-events:none} .${id} .puff{position:absolute;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(${Math.min(255, bc + 45)},${Math.min(255, bc + 45)},${Math.min(255, bc + 45)},1) 0%,rgba(${bc},${bc},${bc + 10},.8) 50%,rgba(${Math.max(0, bc - 55)},${Math.max(0, bc - 55)},${Math.max(0, bc - 55 + 20)},.4) 100%);filter:blur(10px)}`;

                let puffs = '';
                for (let j = 0; j < pc; j++) {
                    const pw = Math.round(bs * (1.1 + Math.random() * 0.9));
                    const ph = Math.round(pw * 0.9);
                    const pl = Math.round((j * (85 / pc) + Math.random() * 10) * 100) / 100;
                    const pt = Math.round((Math.random() * (bs * 0.4) - bs * 0.2) * 100) / 100;

                    puffs += `<div class="puff" style="width:${pw}px;height:${ph}px;left:${pl}%;top:${pt}px"></div>`;
                }
                html += `<div class="${id}">${puffs}</div>`;
            }
            return html;
        } catch (e) {
            console.error('[MeteoCard] _clouds:', e);
            return '';
        }
    }

    _stars(n, css) {
        try {
            let html = '';
            for (let i = 0; i < n; i++) {
                const id = `${this._cardId}-st-${i}`;
                const duration = (2 + Math.random() * 3).toFixed(2);
                const top = Math.round(Math.random() * 10000) / 100;
                const left = Math.round(Math.random() * 10000) / 100;

                css.content += `.${id}{position:absolute;width:1.5px;height:1.5px;background:#FFF;border-radius:50%;top:${top}%;left:${left}%;animation:star ${duration}s infinite;z-index:1}`;
                html += `<div class="${id}"></div>`;
            }
            return html;
        } catch (e) {
            console.error('[MeteoCard] _stars:', e);
            return '';
        }
    }

    _shootings(n, css) {
        let h = '';
        for (let i = 0; i < n; i++) {
            const id = `${this._cardId}-sh-${i}`;
            css.content += `.${id}{position:absolute;width:100px;height:1px;background:linear-gradient(to right,transparent,white);top:${Math.random()*50}%;left:${Math.random()*100}%;transform:rotate(45deg) translateX(-200px);opacity:0;animation:shot 15s infinite;animation-delay:${Math.random()*15}s;z-index:2;}`;
            h += `<div class="${id}"></div>`;
        }
        return h;
    }

    _rain(n, css) {
        try {
            let html = '';
            const rainWidth = this._meteoConfig.get('rain_intensity.width');
            for (let i = 0; i < n; i++) {
                const id = `${this._cardId}-ra-${i}`;
                const left = Math.round(Math.random() * 10000) / 100;
                const delay = Math.round(Math.random() * 2000) / 100;

                css.content += `.${id}{position:absolute;width:${rainWidth}px;height:40px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,0.4));left:${left}%;top:-50px;animation:rain-fall 0.6s linear infinite;animation-delay:-${delay}s;z-index:500}`;
                html += `<div class="${id}"></div>`;
            }
            return html;
        } catch (e) {
            console.error('[MeteoCard] _rain:', e);
            return '';
        }
    }

    _snow(n, css) {
        let h = '';
        for (let i = 0; i < n; i++) {
            const id = `${this._cardId}-sn-${i}`;
            const sw = 15 + Math.random() * 30;
            css.content += `.${id}{position:absolute;width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;background:#FFFFFF;border-radius:50%;left:${Math.random()*100}%;top:-10px;opacity:${0.4+Math.random()*0.6};filter:blur(1px);animation:snow-fall ${7+Math.random()*5}s linear infinite, snow-sway ${2+Math.random()*2}s ease-in-out infinite alternate;animation-delay:-${Math.random()*10}s;--sway:${sw}px;z-index:500;}`;
            h += `<div class="${id}"></div>`;
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

    _zIdx(l) {
        const layerStr = typeof l === 'string' ? l : '';
        return { 'sky': 1, 'sun': 2, 'moon': 2, 'background': 10, 'foreground': 500, 'demo_mode': 9999 }[layerStr] || 2;
    }

    _formatTime(hour) {
        const h = Math.floor(hour);
        const m = Math.floor((hour % 1) * 60);
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
    }

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

    _safe(val) {
        return val === undefined || val === null ? '?' : val;
    }

    _injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
            meteo-card { isolation: isolate; position: relative; }
            ha-card { width: 100% !important; height: 100% !important; min-height: 320px !important; position: relative !important; overflow: hidden !important; background: transparent !important; border: none !important; display: block !important; isolation: isolate; }
            .layer-container { pointer-events: none; position: absolute; inset: 0; overflow: hidden; }
            .sun-wrapper, .moon-container { position: absolute; transform: translate(-50%, -50%); pointer-events: none; width: 900px; height: 900px; transition: left 0.5s linear, top 0.5s linear; }
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
        this.appendChild(s);

        if (!this._keyframesSheet) {
            this._keyframesSheet = document.createElement('style');
            this._keyframesSheet.id = 'meteo-keyframes';
            this.appendChild(this._keyframesSheet);
        }

        if (!this._demoControlsCreated && this._isDemoLayerEnabled && this._isDemoUIMaster) {
            this._createPersistentDemoControls();
            this._demoControlsCreated = true;
        }

        if (!this._hasEvents) {
            this.addEventListener('click', (e) => {
                const btn = e.composedPath().find(el => el && el.id === 'btn-toggle-demo');
                const stopBtn = e.composedPath().find(el => el && el.id === 'btn-stop-demo');
                
                if (btn) {
                    e.preventDefault(); 
                    e.stopPropagation();
                    
                    const currentState = SingletonManager.getDemoState(this._singletonId);
                    const sharedState = SingletonManager.getSingleton(this._singletonId);
                    if (currentState === 'running') {
                        SingletonManager.setDemoState(this._singletonId, 'paused');
                        this._stopDemo();
                        
                    } else if (currentState === 'paused') {
                        SingletonManager.startDemo(this._singletonId);
                        if (!this._demoRequest) {
                            this._startDemo();
                        }
                        
                    } else {
                        
                        SingletonManager.startDemo(this._singletonId);
                        
                        if (!this._demoEngine) {
                            this._demoEngine = new DemoEngine(this._meteoConfig, this._singletonId);
                            const initialState = this._demoEngine.compute();
                            SingletonManager.setActualState(this._singletonId, initialState);
                        }
                        
                        if (!this._demoRequest) {
                            this._startDemo();
                        }
                    }
                    
                    this._update();
                }
                
                if (stopBtn) {
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
                }
            });
            this._hasEvents = true;
        }
    }
}

if (!customElements.get('meteo-card')) {
    customElements.define('meteo-card', MeteoCard);
}
window.customCards = window.customCards || [];
window.customCards.push(CARD_CONFIG);