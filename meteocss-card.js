const CARD_CONFIG = {
    type: 'meteo-card',
    name: 'MeteoCSS Card',
    description: 'Weather card with realistic weather conditions, sky, sun, and moon.',
    preview: true
};

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
        this.simulatedHour = data.simulatedHour ?? 12;
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
                flares: [
                    { distance: 80, radius: 18, color: '#FFFFFF', opacity: 0.25 },
                    { distance: 130, radius: 12, color: '#FFAAFF', opacity: 0.15 },
                    { distance: 160, radius: 8, color: '#AAFFFF', opacity: 0.1 }
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
            height: 180
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
                day_sky: 'dark',
                night_sky: 'dark',
                drops: 'heavy',
                lightning: true
            },
            'pouring': {
                clouds: 'heavy',
                day_sky: 'dark',
                night_sky: 'dark',
                drops: 'normal'
            },
            'rainy': {
                clouds: 'normal',
                day_sky: 'rainy',
                night_sky: 'normal',
                drops: 'low'
            },
            'snowy': {
                clouds: 'normal',
                day_sky: 'snowy',
                night_sky: 'normal',
                flakes: 'normal'
            },
            'cloudy': {
                clouds: 'heavy',
                day_sky: 'grey',
                night_sky: 'normal'
            },
            'partlycloudy': {
                clouds: 'low',
                day_sky: 'inter',
                night_sky: 'normal'
            },
            'sunny': {
                clouds: 'minimal',
                day_sky: 'normal',
                night_sky: 'clear'
            },
            'clear-night': {
                clouds: 'none',
                stars: true,
                night_sky: 'clear'
            },
            'fog': {
                clouds: 'none',
                fog: true,
                day_sky: 'grey',
                night_sky: 'normal'
            },
            'default': {
                clouds: 'low',
                day_sky: 'normal',
                night_sky: 'normal'
            }
        },

        layers: ['sky', 'sun', 'moon', 'background', 'foreground'],
        demo_mode: false
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
                    if (
                        typeof sourceVal === 'object' &&
                        !Array.isArray(sourceVal) &&
                        typeof targetVal === 'object' &&
                        !Array.isArray(targetVal)
                    ) {
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

    getEntity(configKey, fallbackKey) {
        return this.get(configKey) || this.get(fallbackKey);
    }
}

class MeteoCard extends HTMLElement {
    constructor() {
        super();
        this.cloudCounter = 0;
        this._moonMaskIdCounter = 0;
        this._initialized = false;
        this._demoScenario = [];
        this._lastCycleId = -1;
        this._demoForcedCondition = 'auto';
        this._demoPaused = false;
        this._demoTimeOffset = 0;
        this._lastUpdateTimestamp = Date.now();
        this._lastHassUpdate = 0;
        this._demoRequest = undefined;
        this._previousStates = {};
        this._domCache = {};
        this._demoListeners = [];
        this.dynamicStyleSheet = null;
        this._moonPhases = null;
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
            weather: null,
            sun: null,
            moonAzimuth: null,
            moonElevation: null,
            moonPhase: null,
            moonDegrees: null
        };
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

            if (this._validatedEntities && !this._meteoConfig.get('demo_mode')) {
                const now = Date.now();
                if (this._lastHassUpdate && now - this._lastHassUpdate < 1000) {
                    this._hass = hass;
                    return;
                }
                this._lastHassUpdate = now;

                const newWeatherState = hass.states[this._weatherEntityId]?.state;
                const newSunAzimuth = hass.states[this._sunEntityId]?.attributes?.azimuth;

                if (this._previousStates.weather === newWeatherState &&
                    this._previousStates.azimuth === newSunAzimuth) {
                    this._hass = hass;
                    return;
                }
                this._previousStates.weather = newWeatherState;
                this._previousStates.azimuth = newSunAzimuth;
            }

            this._hass = hass;
            
            if (this._validatedEntities && this._validatedEntities.weather === null) {
                this._validateEntitiesFromHass(hass);
            }

            this._update();
        } catch (e) {
            console.error('[MeteoCard] hass setter:', e);
        }
    }

    _validateEntitiesFromHass(hass) {
        try {
            this._validatedEntities.weather = EntityValidator.validate(
                hass,
                this._weatherEntityId,
                { state: true }
            );

            this._validatedEntities.sun = EntityValidator.validate(
                hass,
                this._sunEntityId,
                {
                    requiredAttributes: ['azimuth', 'elevation'],
                    numericAttribute: {
                        'azimuth': { min: 0, max: 360 },
                        'elevation': { min: -180, max: 180 }
                    }
                }
            );

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
            this._meteoConfig = new MeteoConfig(config);

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

            if (!this.content) {
                this.innerHTML = `<ha-card></ha-card>`;
                this.content = this.querySelector('ha-card');
                if (!this.content) {
                    console.error('[MeteoCard] Failed to initialize content in setConfig');
                    return;
                }
                this._injectStyles();
            }

            if (this._meteoConfig.get('demo_mode')) {
                this._startDemo();
            } else {
                this._stopDemo();
            }

            if (!this._initialized) {
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
                setTimeout(() => {
                    const demoUI = this.content?.querySelector('.demo-ui-container');
                    if (demoUI) demoUI.style.zIndex = '9999';
                }, 0);
            } else {
                this._initialized = false;
                this._update();
            }
        } catch (e) {
            console.error('[MeteoCard] setConfig:', e);
        }
    }

    disconnectedCallback() {
        this._cleanup();
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

    _cleanup() {
        this._stopDemo();
        this._cleanupDemoEvents();
        this._domCache = {};
        this._demoListeners = [];
    }

    _startDemo() {
        this._stopDemo();
        const loop = () => {
            if (!this.isConnected) {
                this._stopDemo();
                return;
            }
            try {
                this._update();
            } catch (e) {
                console.error('[MeteoCard] demo loop:', e);
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
                return {
                    left: 50,
                    top: 50,
                    elevation: 0,
                    azimuth: 0
                };
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
            return {
                left: 50,
                top: 50,
                elevation: 0,
                azimuth: 0
            };
        }
    }

    _update() {
        try {
            if (!this.content) {
                console.warn('[MeteoCard] Content not initialized');
                return;
            }

            if (!this._hass && !this._meteoConfig.get('demo_mode')) {
                if (!this._initialized) {
                    const emptyState = new MeteoState({
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
                        }
                    });
                    this._renderAll(emptyState);
                }
                return;
            }

            let rawData;
            if (this._meteoConfig.get('demo_mode')) {
                this._updateDemo();
                rawData = this._demoData();
            } else {
                rawData = this._realData();
                if (!rawData) {
                    if (!this._initialized) {
                        rawData = {
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
                        };
                    } else {
                        return;
                    }
                }
            }

            const state = new MeteoState(rawData);

            if (!this._initialized ||
                this._lastCondition !== state.condition ||
                (this._meteoConfig.get('demo_mode') && state.isNight !== this._lastNight)) {
                this._initialized = true;
                this._lastCondition = state.condition;
                this._lastNight = state.isNight;
                this._renderAll(state);
            } else {
                this._updateDynamic(state);
            }
        } catch (e) {
            console.error('[MeteoCard] _update:', e);
        }
    }

    _updateDemo() {
        const now = Date.now();
        if (!this._demoPaused) this._demoTimeOffset += (now - this._lastUpdateTimestamp);
        this._lastUpdateTimestamp = now;
        const cid = Math.floor(this._demoTimeOffset / 60000);
        if (cid !== this._lastCycleId) {
            this._lastCycleId = cid;
            const avail = Object.keys(this._meteoConfig.get('conditions')).filter(c => c !== 'default');
            this._demoScenario = avail.sort(() => Math.random() - 0.5);
        }
    }

    _demoData() {
        try {
            if (!this._moonPhases) {
                this._moonPhases = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
            }

            const prog = (this._demoTimeOffset % 60000) / 60000;
            const cond = (this._demoForcedCondition !== 'auto') ? this._demoForcedCondition : this._demoScenario[Math.floor(prog * this._demoScenario.length)];

            const seed = Math.floor(prog * this._demoScenario.length);
            const windSpeed = 15 + (Math.abs(Math.sin(seed)) * (80 - 15));

            const hour = prog * 24;
            const sunAz = (hour / 24) * 360;
            const sunEl = 35 * Math.sin((hour - 6) * Math.PI / 12);
            const sunPos = this._getCoords(sunAz, sunEl);
            const moonPos = this._getCoords((sunAz + 180) % 360, -sunEl);

            const phaseProgress = (prog * 4) % 1;
            const moonPhaseDegrees = phaseProgress * 360;
            const phaseIndex = Math.floor((prog * 4 * this._moonPhases.length) % this._moonPhases.length);

            return {
                condition: cond,
                isNight: sunPos.elevation <= 0,
                sunPos,
                moonPos,
                moonPhase: this._moonPhases[phaseIndex],
                moonPhaseDegrees: moonPhaseDegrees,
                rising: hour >= 6 && hour < 12,
                simulatedHour: hour,
                windSpeed: windSpeed
            };
        } catch (e) {
            console.error('[MeteoCard] _demoData:', e);
            return null;
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

            return {
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

            const sky = this._domCache.skyBg || this.content?.querySelector('.sky-bg');
            if (sky) {
                const fPos = isNight ? moonPos : sunPos;
                const conf = this._meteoConfig.get(`conditions.${condition}`) || this._meteoConfig.get('conditions.default');
                const colors = (!isNight && sunPos.elevation < 12 && sunPos.elevation > -0.5) ? 
                    (rising ? this._meteoConfig.get('colors.sunrise') : this._meteoConfig.get('colors.sunset')) : 
                    (isNight ? this._meteoConfig.get(`colors.night.${conf.night_sky || 'normal'}`) : this._meteoConfig.get(`colors.day.${conf.day_sky || 'normal'}`));
                sky.style.background = `radial-gradient(circle at ${fPos.left}% ${fPos.top}%, ${colors})`;
            }

            const sun = this._domCache.sunContainer || this.content?.querySelector('.sun-container');
            if (sun) {
                sun.style.display = sunPos.elevation >= 0 ? 'block' : 'none';
                sun.style.left = `${sunPos.left}%`;
                sun.style.top = `${sunPos.top}%`;
                if (sunPos.elevation >= 0 && !sun.innerHTML) sun.innerHTML = this._sunSVG();
                if (sunPos.elevation < 0) sun.innerHTML = '';
            }

            const lensFlare = this._domCache.lensFlare || this.content?.querySelector('.lens-flare');
            if (lensFlare) {
                if (sunPos.elevation >= 0 && this._meteoConfig.get('sun.lens_flare.enabled')) {
                    const minuteOfDay = Math.floor(hour * 60);
                    lensFlare.innerHTML = this._lensFlare(sunPos, minuteOfDay);
                } else {
                    lensFlare.innerHTML = '';
                }
            }

            const moon = this._domCache.moonContainer || this.content?.querySelector('.moon-container');
            if (moon) {
                moon.style.display = moonPos.elevation >= 0 ? 'block' : 'none';
                moon.style.left = `${moonPos.left}%`;
                moon.style.top = `${moonPos.top}%`;
                if (moonPos.elevation >= 0) {
                    moon.innerHTML = this._moonSVG(moonPhase, !isNight, moonPhaseDegrees);
                } else {
                    moon.innerHTML = '';
                }
            }

            const info = this._domCache.infoBox || this.content?.querySelector('.demo-data');
            if (info && this._meteoConfig.get('demo_mode')) {
                const timeStr = this._formatTime(hour);
                info.innerHTML = `
                    <div class="line time-row"><b>Time:</b> ${timeStr} | <b>Weather:</b> ${this._safe(condition)}</div>
                    <div class="line"><b>Wind Speed:</b> ${windSpeed.toFixed(1)} km/h</div>
                    <div class="line"><b>Sun:</b> Alt: ${sunPos.elevation.toFixed(1)}° | Az: ${sunPos.azimuth.toFixed(1)}°</div>
                    <div class="line"><b>Moon:</b> Alt: ${moonPos.elevation.toFixed(1)}° | Az: ${moonPos.azimuth.toFixed(1)}°</div>
                    <div class="line"><b>Phase:</b> ${this._safe(moonPhase)} | <b>Rot:</b> ${Math.floor(moonPhaseDegrees || 0)}°</div>
                `;
            }
        } catch (e) {
            console.error('[MeteoCard] _updateDynamic:', e);
        }
    }

    _injectKeyframesForCondition(condition, isNight) {
        if (this._loadedKeyframes === condition) return;
        this._loadedKeyframes = condition;

        const keyframes = {
            base: `
                @keyframes to-right { to { transform:translateX(calc(100vw + 500px)); } }
                @keyframes flash { 0%,90%,94%,100%{opacity:0;} 92%{opacity:0.4;} }
            `,
            star: `
                @keyframes star { 0%,100%{opacity:1;} 50%{opacity:0.2;} }
            `,
            shot: `
                @keyframes shot { 0%{transform:rotate(45deg) translateX(-200px);opacity:0;} 1%{opacity:1;} 10%{transform:rotate(45deg) translateX(1200px);opacity:0;} 100%{opacity:0;} }
            `,
            rain: `
                @keyframes rain-fall { to { transform:translateY(110vh) skewX(-15deg); } }
            `,
            snow: `
                @keyframes snow-fall { 0% { transform: translateY(-10vh); } 100% { transform: translateY(110vh); } }
                @keyframes snow-sway { 0% { margin-left: calc(var(--sway) * -1); } 100% { margin-left: var(--sway); } }
            `,
            fog: `
                @keyframes fog-boil { 0% { transform: scale(1) translateY(0); opacity: var(--fog-opacity-min); } 50% { opacity: var(--fog-opacity-max); } 100% { transform: scale(1.15) translateY(-20px); opacity: var(--fog-opacity-min); } }
            `
        };

        let requiredKeyframes = keyframes.base;
        const conf = this._meteoConfig.get(`conditions.${condition}`) || this._meteoConfig.get('conditions.default');

        if (isNight && conf.stars) {
            requiredKeyframes += keyframes.star + keyframes.shot;
        }
        if (conf.clouds && conf.clouds !== 'none') {
            requiredKeyframes += keyframes.base;
        }
        if (conf.drops) {
            requiredKeyframes += keyframes.rain;
        }
        if (conf.flakes) {
            requiredKeyframes += keyframes.snow;
        }
        if (conf.fog) {
            requiredKeyframes += keyframes.fog;
        }
        if (conf.lightning) {
            requiredKeyframes += keyframes.base;
        }

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
            const layers = this._meteoConfig.get('layers');

            let html = `<svg style="width:0;height:0;position:absolute;"><filter id="cloud-distort"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="35" /></filter></svg>`;
            if (this._meteoConfig.get('demo_mode')) html += this._demoUI();

            layers.forEach(l => {
                html += `<div class="layer-container" style="z-index:${this._zIdx(l)};">${this._renderLayer(l, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed, cond)}</div>`;
            });

            this.content.innerHTML = html;
            this._cacheDOM();
            
            if (this._meteoConfig.get('demo_mode')) this._setupEvents();

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
            sunContainer: this.content?.querySelector('.sun-container'),
            moonContainer: this.content?.querySelector('.moon-container'),
            lensFlare: this.content?.querySelector('.lens-flare'),
            infoBox: this.content?.querySelector('.demo-data')
        };
    }

    _demoUI() {
        try {
            const opts = this._getDemoUIOptions();
            return `<div class="demo-ui-container"><div class="demo-top-bar"><select class="demo-select">${opts}</select><button class="demo-btn-play">${this._demoPaused ? '▶️' : '⏸️'}</button></div><div class="demo-data"></div></div>`;
        } catch (e) {
            console.error('[MeteoCard] _demoUI:', e);
            return '';
        }
    }

    _cleanupEvents() {
        this._demoListeners.forEach(({ el, ev, fn }) => {
            if (el) {
                el.removeEventListener(ev, fn);
            }
        });
        this._demoListeners = [];
    }

    _cleanupDemoEvents() {
        this._cleanupEvents();
    }

    _setupEvents() {
        try {
            this._cleanupEvents();
            
            const sel = this.content?.querySelector('.demo-select');
            if (sel) {
                const fn = (e) => {
                    this._demoForcedCondition = e.target.value;
                    this._initialized = false;
                    this._update();
                };
                sel.addEventListener('change', fn);
                this._demoListeners.push({
                    el: sel,
                    ev: 'change',
                    fn
                });
            }
            
            const btn = this.content?.querySelector('.demo-btn-play');
            if (btn) {
                const fn = () => {
                    this._demoPaused = !this._demoPaused;
                    btn.textContent = this._demoPaused ? '▶️' : '⏸️';
                };
                btn.addEventListener('click', fn);
                this._demoListeners.push({
                    el: btn,
                    ev: 'click',
                    fn
                });
            }
        } catch (e) {
            this._cleanupEvents();
            console.error('[MeteoCard] _setupEvents:', e);
        }
    }

    _renderLayer(layer, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed, cond) {
        try {
            if (layer === 'sky') {
                return `<div class="sky-bg" style="position:absolute; inset:0; transition: background 3s ease-in-out;"></div>` +
                    (isNight ? `<div style="position:absolute; inset:0;">${this._stars(100, css)}${this._shootings(2, css)}</div>` : '');
            }
            if (layer === 'sun' || layer === 'moon') {
                let sunLayer = `<div class="${layer}-container" style="position:absolute; transform:translate(-50%, -50%); pointer-events:none; display:none; width:900px; height:900px;"></div>`;
                if (layer === 'sun') {
                    sunLayer += `<div class="lens-flare" style="position:absolute;inset:0;"></div>`;
                }
                return sunLayer;
            }
            let h = '';
            const bg = ['partlycloudy', 'sunny', 'clear-night'].includes(condition);
            if (layer === 'background') return (bg && cond.clouds !== 'none') ? this._clouds(cond.clouds, css, isNight, windSpeed) : '';
            if (layer === 'foreground') {
                if (cond.lightning) h += `<div class="lightning"></div>`;
                if (!bg && cond.clouds !== 'none') h += this._clouds(cond.clouds, css, isNight, windSpeed);
                if (cond.drops) {
                    const dropsCount = this._meteoConfig.get(`rain_intensity.${cond.drops}`) || 0;
                    h += this._rain(dropsCount, css);
                }
                if (cond.flakes) {
                    const flakesCount = this._meteoConfig.get(`snow_intensity.${cond.flakes}`) || 0;
                    h += this._snow(flakesCount, css);
                }
                if (cond.fog) h += this._fog(5, css);
                return h;
            }
            return '';
        } catch (e) {
            console.error('[MeteoCard] _renderLayer:', e);
            return '';
        }
    }

    _sunSVG() {
        try {
            const def = this._meteoConfig.get('sun');
            const s = this._meteoConfig.get('sun');
            const col = s.colors;
            return `<svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible;"><defs><radialGradient id="sunAura"><stop offset="0%" stop-color="${col.aura}" stop-opacity="${s.aura_opacity}"/><stop offset="100%" stop-color="#FF6600" stop-opacity="0"/></radialGradient><radialGradient id="sunHalo"><stop offset="0%" stop-color="${col.halo}" stop-opacity="${s.halo_opacity}"/><stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/></radialGradient></defs><circle cx="150" cy="150" r="${s.aura_radius}" fill="url(#sunAura)"/><circle cx="150" cy="150" r="${s.halo_radius}" fill="url(#sunHalo)"/><circle cx="150" cy="150" r="${s.disc_radius}" fill="${col.disc}" style="filter:blur(1px);"/></svg>`;
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
            
            const safeMinute = minuteOfDay % 1440;
            const rotation = (safeMinute / 720) * 360;
            const elevationOpacity = Math.max(0, Math.min(1, (sunPos.elevation + 5) / 20));
            const cx = (sunPos.left / 100) * 300;
            const cy = (sunPos.top / 100) * 300;
            
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
            
            return `<svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible;">
                <defs>
                    <filter id="lens-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="${glowStd}"/>
                    </filter>
                </defs>
                <g transform="translate(${cx}, ${cy}) rotate(${rotation})" opacity="${elevationOpacity}">
                    <!-- Grand halo central -->
                    <circle cx="0" cy="0" r="${haloRadius}" fill="none" stroke="#FFFFFF" stroke-width="${haloStrokeWidth}" opacity="${haloOpacity}" filter="url(#lens-glow)"/>
                    
                    <!-- Reflets en ligne -->
                    ${flareCircles}
                    
                    <!-- Petit halo intérieur -->
                    <circle cx="0" cy="0" r="${innerHaloRadius}" fill="none" stroke="#FFFF99" stroke-width="${innerHaloStrokeWidth}" opacity="${innerHaloOpacity}" filter="url(#lens-glow)"/>
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

            return `<svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible;"><defs><filter id="mtx" x="-100%" y="-100%" width="300%" height="300%"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="noise"/><feDiffuseLighting lighting-color="#FFFFFF" surfaceScale="1" result="diffuse"><feDistantLight azimuth="45" elevation="45"/></feDiffuseLighting><feComposite in="diffuse" in2="SourceGraphic" operator="in"/></filter><mask id="${mid}"><g transform="translate(150,150) rotate(${moonPhaseDegrees})"><path d="M 0,${-r} A ${r},${r} 0 1,${iw ? 0 : 1} 0,${r} A ${hr},${r} 0 0,${p <= 0.5 ? (iw ? 1 : 0) : (iw ? 0 : 1)} 0,${-r}" fill="white" filter="blur(0.8px)"/></g></mask><radialGradient id="ma"><stop offset="0%" stop-color="${col.aura}" stop-opacity="${m.aura_opacity * p * bo}"/><stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/></radialGradient><radialGradient id="m3d" cx="40%" cy="40%" r="50%"><stop offset="0%" stop-color="${col.disc_light}"/><stop offset="100%" stop-color="${col.disc_dark}"/></radialGradient></defs><circle cx="150" cy="150" r="${m.aura_radius}" fill="url(#ma)"/><circle cx="150" cy="150" r="${m.halo_radius}" fill="#FFFFFF" opacity="${m.halo_opacity * p * bo}" style="filter:blur(5px);"/><g mask="url(#${mid})" style="opacity:${bo}"><g transform="translate(150,150) rotate(${moonPhaseDegrees})"><circle cx="0" cy="0" r="${r + 0.5}" fill="url(#m3d)" /><circle cx="0" cy="0" r="${r + 0.5}" fill="white" filter="url(#mtx)" opacity="0.3" style="mix-blend-mode: soft-light;"/></g></g></svg>`;
        } catch (e) {
            console.error('[MeteoCard] _moonSVG:', e);
            return '';
        }
    }

    _clouds(type, css, isNight, windSpeed = 25) {
        try {
            const [nc, pc, gr] = this._meteoConfig.get(`clouds.${type}`) || this._meteoConfig.get('clouds.low');
            const anim = this._meteoConfig.get('clouds.animation');
            const minMargin = anim?.min_margin ?? 5;
            const maxMargin = anim?.max_margin ?? 85;
            const randomVariation = anim?.random_variation ?? 0.3;
            const bc = 255 - (gr * 25);
            let html = '';
            const baseDuration = (20 / (windSpeed + 1)) * 60;
            const minSpacing = 100 / (nc + 1);
            
            for (let i = 0; i < nc; i++) {
                const id = `cl-${this.cloudCounter++}`;
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
                const id = `st-${i}`;
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
            const id = `sh-${i}`;
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
                const id = `ra-${i}`;
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
            const id = `sn-${i}`;
            const sw = 15 + Math.random() * 30;
            css.content += `.${id}{position:absolute;width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;background:#FFFFFF;border-radius:50%;left:${Math.random()*100}%;top:-10px;opacity:${0.4+Math.random()*0.6};filter:blur(1px);animation:snow-fall ${7+Math.random()*5}s linear infinite, snow-sway ${2+Math.random()*2}s ease-in-out infinite alternate;animation-delay:-${Math.random()*10}s;--sway:${sw}px;z-index:500;}`;
            h += `<div class="${id}"></div>`;
        }
        return h;
    }

    _fog(n, css) {
        try {
            const fogConf = this._meteoConfig.get('fog');
            const opacityMin = fogConf?.opacity_min ?? 0.15;
            const opacityMax = fogConf?.opacity_max ?? 0.85;
            const blur = fogConf?.blur ?? 15;
            const height = fogConf?.height ?? 180;
            let html = '';
            for (let i = 0; i < n; i++) {
                const id = `fog-${i}`;
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
        return {
            'sky': 1,
            'sun': 2,
            'moon': 2,
            'background': 10,
            'foreground': 500
        } [l] || 2;
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

    _injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
            ha-card { width: 100% !important; height: 100% !important; min-height: 320px !important; position: relative !important; overflow: hidden !important; background: transparent !important; border: none !important; display: block !important; isolation: isolate; }
            .layer-container { pointer-events: none; position: absolute; inset: 0; overflow: hidden; }
            .demo-ui-container { position: absolute; top: 10px; left: 10px; z-index: 999; pointer-events: auto; display: flex; flex-direction: column; gap: 8px; }
            .demo-top-bar { display: flex; gap: 5px; align-items: center; }
            .demo-select { background: rgba(0,0,0,0.85); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; backdrop-filter: blur(5px); }
            .demo-btn-play { background: rgba(0,0,0,0.85); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 6px; width: 30px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; }
            .demo-data { background: rgb(20, 20, 20); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 10px; color: #eee; font-family: monospace; font-size: 10px; line-height: 1.4; pointer-events: none; text-shadow: 1px 1px 1px black; min-width: 200px; min-height: 80px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); }
            .line { margin-bottom: 2px; }
            .sun-container, .moon-container { transition: left 0.5s linear, top 0.5s linear; }
            .lightning { position: absolute; inset: 0; background: white; opacity: 0; animation: flash 5s infinite; z-index: 998; mix-blend-mode: overlay; }
            `;
        this.appendChild(s);

        if (!this._keyframesSheet) {
            this._keyframesSheet = document.createElement('style');
            this._keyframesSheet.id = 'meteo-keyframes';
            this.appendChild(this._keyframesSheet);
        }
    }
}

if (!customElements.get('meteo-card')) {
    customElements.define('meteo-card', MeteoCard);
}

window.customCards = window.customCards || [];
window.customCards.push(CARD_CONFIG);

console.info("%c MeteoCSS Card %c v1.2.1 %c", "background:#2196F3;color:white;padding:2px 8px;border-radius:3px 0 0 3px;font-weight:bold", "background:#4CAF50;color:white;padding:2px 8px;border-radius:0 3px 3px 0", "background:none");
