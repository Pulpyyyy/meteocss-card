class MeteoState {
  constructor(data = {}) {
    this.condition = data.condition || 'sunny';
    this.isNight = data.isNight ?? false;
    this.sunPos = data.sunPos || { left: 50, top: 50, elevation: 80, azimuth: 160 };
    this.moonPos = data.moonPos || { left: 50, top: 50, elevation: -25, azimuth: 340 };
    this.moonPhase = data.moonPhase || 'Full Moon';
    this.rising = data.rising ?? false;
    this.simulatedHour = data.simulatedHour ?? 12;
    this.windSpeed = data.windSpeed ?? 25;
  }
}

class MeteoCard extends HTMLElement {
  static get DEFAULTS() {
    return {
      orbit: { rx: 45, ry: 40 }, 
      sun: { disc_radius: 8, halo_radius: 50, aura_radius: 130, aura_opacity: 0.15, halo_opacity: 0.4, zoom: 1.0, colors: { aura: '#FFCC00', halo: '#FFFFFF', disc: '#FFFFFF' } },
      moon: { disc_radius: 8, halo_radius: 35, aura_radius: 80, aura_opacity: 0.1, halo_opacity: 0.2, zoom: 1.0, colors: { aura: '#FFFFFF', disc_light: '#FDFDFD', disc_dark: '#9595A5' } },
      location: 'weather.home', sun_entity: 'sun.sun', moon_azimuth_entity: 'sensor.luna_lunar_azimuth', moon_elevation_entity: 'sensor.luna_lunar_elevation', moon_phase_entity: 'sensor.luna_lunar_phase', house_angle: 25, invert_azimuth: false,
      colors: { night: { clear: '#25259C 0%, #2A2A60 40%, #0F0344 100%', normal: '#272762 0%, #302C2C 100%', dark: '#0E0E54 0%, #000000 100%' }, day: { normal: '#FFFFFF 0%, #4BA0DB 50%, #004390 100%', inter: '#B9DFFF 0%, #B0C4C8 60%, #7A9BA0 100%', rainy: '#B9DFFF 0%, #C1CBD0 60%, #91A6B0 100%', dark: '#B9DFFF 0%, #2F4F4F 60%, #708090 100%', snowy: '#B0E2FF 0%, #AAAAAA 60%, #D3D3D3 100%', grey: '#B4C4CB 0%, #A4A6A8 60%, #94A9C7 100%' }, sunrise: '#FFF5C3 0%, #FFD966 10%, #FFA64D 30%, #FF7F50 50%, #5D0000 80%, #002340 100%', sunset: '#FEFEFFCC 0%, #ECFF00 10%, #FD3229 25%, #F30000 45%, #5D0000 75%, #001A33 100%' },
      clouds: { heavy: [15, 5, 4], normal: [10, 3, 2], low: [4, 2, 1], minimal: [2, 2, 0], none: [0, 0, 0] },
      conditions: { 'lightning-rainy': { clouds: 'heavy', day_sky: 'dark', night_sky: 'dark', drops: 500, lightning: true }, 'pouring': { clouds: 'heavy', day_sky: 'dark', night_sky: 'dark', drops: 350 }, 'rainy': { clouds: 'normal', day_sky: 'rainy', night_sky: 'normal', drops: 150 }, 'snowy': { clouds: 'normal', day_sky: 'snowy', night_sky: 'normal', flakes: 120 }, 'cloudy': { clouds: 'heavy', day_sky: 'grey', night_sky: 'normal' }, 'partlycloudy': { clouds: 'low', day_sky: 'inter', night_sky: 'normal' }, 'sunny': { clouds: 'minimal', day_sky: 'normal', night_sky: 'clear' }, 'clear-night': { clouds: 'none', stars: true, night_sky: 'clear' }, 'fog': { clouds: 'none', fog: true, day_sky: 'grey', night_sky: 'normal' }, 'default': { clouds: 'low', day_sky: 'normal', night_sky: 'normal' } }
    };
  }

  constructor() {
    super();
    this.cloudCounter = 0;
    this._initialized = false;
    this._demoScenario = [];
    this._lastCycleId = -1;
    this._demoForcedCondition = 'auto';
    this._demoPaused = false;
    this._demoTimeOffset = 0;
    this._lastUpdateTimestamp = Date.now();
    this._demoRequest = undefined;
    this._previousStates = {};
    this._domCache = {};
    this._demoListeners = [];
    this.dynamicStyleSheet = null;
  }

  set hass(hass) {
    try {
      if (this.config && !this.config.demo_mode) {
        const weatherEnt = this._getEntity('weather', 'location');
        const sunEnt = this._getEntity('sun_entity', 'sun_entity');
        const newWeatherState = hass.states[weatherEnt]?.state;
        const newSunAzimuth = hass.states[sunEnt]?.attributes?.azimuth;
        if (this._previousStates.weather === newWeatherState && this._previousStates.azimuth === newSunAzimuth) {
          this._hass = hass;
          return;
        }
        this._previousStates.weather = newWeatherState;
        this._previousStates.azimuth = newSunAzimuth;
      }
      this._hass = hass;
      if (!this.content) {
        this.innerHTML = `<ha-card></ha-card>`;
        this.content = this.querySelector('ha-card');
        this._injectStyles();
      }
      this._update();
    } catch (e) { console.error('[MeteoCard] hass setter:', e); }
  }

  setConfig(config) {
    try {
      this.config = config;
      this.layers = config.layers || ['sky', 'sun', 'moon', 'background', 'foreground'];
      if (this.config.demo_mode) this._startDemo();
      else this._stopDemo();
    } catch (e) { console.error('[MeteoCard] setConfig:', e); }
  }

  disconnectedCallback() { this._cleanup(); }

  _cleanup() {
    this._stopDemo();
    this._cleanupDemoEvents();
    this._domCache = {};
    this._demoListeners = [];
  }

  _startDemo() {
    this._stopDemo();
    const loop = () => {
      if (!this.isConnected) { this._stopDemo(); return; }
      try { this._update(); } catch (e) { console.error('[MeteoCard] demo loop:', e); }
      this._demoRequest = requestAnimationFrame(loop);
    };
    this._demoRequest = requestAnimationFrame(loop);
  }

  _stopDemo() {
    if (this._demoRequest) { cancelAnimationFrame(this._demoRequest); this._demoRequest = undefined; }
  }

  _getEntity(configKey, defaultKey) {
    return this.config?.[configKey] || MeteoCard.DEFAULTS[defaultKey];
  }

  _safe(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  _getCoords(azimuth, elevation) {
    try {
      const o = this.config.orbit || MeteoCard.DEFAULTS.orbit;
      const rx = parseFloat(o.rx) || 45, ry = parseFloat(o.ry) || 40;
      const ha = (this.config.house_angle !== undefined) ? parseFloat(this.config.house_angle) : MeteoCard.DEFAULTS.house_angle;
      let az = (this.config.invert_azimuth === true) ? (parseFloat(azimuth) + 180) % 360 : parseFloat(azimuth);
      const rad = (az - ha) * Math.PI / 180;
      return { left: 50 + rx * Math.sin(rad), top: 50 - ry * Math.cos(rad), elevation: parseFloat(elevation) || 0, azimuth: az };
    } catch (e) { console.error('[MeteoCard] _getCoords:', e); return { left: 50, top: 50, elevation: 0, azimuth: 0 }; }
  }

  _update() {
    try {
      if (!this.content || (!this._hass && !this.config.demo_mode)) return;
      
      let rawData;
      if (this.config.demo_mode) {
        this._updateDemo();
        rawData = this._demoData();
      } else {
        rawData = this._realData();
        if (!rawData) return;
      }

      // Utilisation de la classe MeteoState pour formater les données
      const state = new MeteoState(rawData);

      if (!this._initialized || this._lastCondition !== state.condition || (this.config.demo_mode && state.isNight !== this._lastNight)) {
        this._initialized = true;
        this._lastCondition = state.condition;
        this._lastNight = state.isNight;
        this._renderAll(state);
      } else {
        this._updateDynamic(state);
      }
    } catch (e) { console.error('[MeteoCard] _update:', e); }
  }

  _updateDemo() {
    const now = Date.now();
    if (!this._demoPaused) this._demoTimeOffset += (now - this._lastUpdateTimestamp);
    this._lastUpdateTimestamp = now;
    const cid = Math.floor(this._demoTimeOffset / 60000);
    if (cid !== this._lastCycleId) {
      this._lastCycleId = cid;
      const avail = Object.keys(MeteoCard.DEFAULTS.conditions).filter(c => c !== 'default');
      this._demoScenario = avail.sort(() => Math.random() - 0.5);
    }
  }

  _demoData() {
    try {
      const prog = (this._demoTimeOffset % 60000) / 60000;
      const cond = (this._demoForcedCondition !== 'auto') ? this._demoForcedCondition : this._demoScenario[Math.floor(prog * this._demoScenario.length)];
      
      // Randomisation de la vitesse du vent par condition (stable par cycle)
      const seed = Math.floor(prog * this._demoScenario.length);
      const windSpeed = 15 + (Math.abs(Math.sin(seed)) * (80 - 15));

      const hour = prog * 24;
      const sunAz = (hour / 24) * 360;
      const sunEl = 35 * Math.sin((hour - 6) * Math.PI / 12);
      const sunPos = this._getCoords(sunAz, sunEl);
      const moonPos = this._getCoords((sunAz + 180) % 360, -sunEl);
      const phases = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
      
      return { 
        condition: cond, 
        isNight: sunPos.elevation <= 0, 
        sunPos, 
        moonPos, 
        moonPhase: phases[Math.floor((prog * 4 * phases.length) % phases.length)], 
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
      const we = this._getEntity('weather', 'location');
      const se = this._getEntity('sun_entity', 'sun_entity');
      const w = this._hass?.states?.[we];
      const s = this._hass?.states?.[se];
      if (!w || !s) return null;
      
      const cond = this._weatherMatrix(w.state);
      const isNight = s.state === 'below_horizon';
      const sunPos = this._getCoords(s.attributes?.azimuth || 0, s.attributes?.elevation || 0);
      const hour = new Date().getHours() + (new Date().getMinutes() / 60);
      
      const mae = this._getEntity('moon_azimuth_entity', 'moon_azimuth_entity');
      const mee = this._getEntity('moon_elevation_entity', 'moon_elevation_entity');
      const mpe = this._getEntity('moon_phase_entity', 'moon_phase_entity');
      
      const ma = this._hass.states?.[mae];
      const me = this._hass.states?.[mee];
      const mp = this._hass.states?.[mpe];
      
      const moonPos = (ma && me) ? this._getCoords(parseFloat(ma.state) || 0, parseFloat(me.state) || 0) : this._getCoords((s.attributes?.azimuth || 0 + 180) % 360, -(s.attributes?.elevation || 0));
      const windSpeed = parseFloat(w.attributes?.wind_speed) || 0;

      return { condition: cond, isNight, sunPos, moonPos, moonPhase: mp?.state || 'Full Moon', rising: s.attributes?.rising || false, simulatedHour: hour, windSpeed };
    } catch (e) { console.error('[MeteoCard] _realData:', e); return null; }
  }

  _updateDynamic(state) {
    try {
      const conf = MeteoCard.DEFAULTS;
      const { isNight, sunPos, moonPos, moonPhase, rising, condition, simulatedHour: hour, windSpeed } = state;

      const sky = this._domCache.skyBg || this.content?.querySelector('.sky-bg');
      if (sky) {
        const fPos = isNight ? moonPos : sunPos;
        const cond = conf.conditions[condition] || conf.conditions.default;
        const colors = (!isNight && sunPos.elevation < 12 && sunPos.elevation > -0.5) ? (rising ? conf.colors.sunrise : conf.colors.sunset) : (isNight ? conf.colors.night[cond.night_sky || 'normal'] : conf.colors.day[cond.day_sky || 'normal']);
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

      const moon = this._domCache.moonContainer || this.content?.querySelector('.moon-container');
      if (moon) {
        moon.style.display = moonPos.elevation >= 0 ? 'block' : 'none';
        moon.style.left = `${moonPos.left}%`;
        moon.style.top = `${moonPos.top}%`;
        if (moonPos.elevation >= 0) moon.innerHTML = this._moonSVG(moonPhase, !isNight);
        else moon.innerHTML = '';
      }

      const info = this._domCache.infoBox || this.content?.querySelector('.demo-data');
      if (info && this.config.demo_mode) {
        const h = Math.floor(hour), m = Math.floor((hour % 1) * 60);
        info.innerHTML = `
          <div class="line time-row"><b>Time:</b> ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} | <b>Weather:</b> ${this._safe(condition)}</div>
          <div class="line"><b>Wind Speed:</b> ${windSpeed.toFixed(1)} km/h</div>
          <div class="line"><b>Sun:</b> Alt: ${sunPos.elevation.toFixed(1)}° | Az: ${sunPos.azimuth.toFixed(1)}°</div>
          <div class="line"><b>Moon:</b> Alt: ${moonPos.elevation.toFixed(1)}° | Az: ${moonPos.azimuth.toFixed(1)}°</div>
          <div class="line"><b>Phase:</b> ${this._safe(moonPhase)}</div>
        `;
      }
    } catch (e) { console.error('[MeteoCard] _updateDynamic:', e); }
  }

  _renderAll(state) {
    try {
      const { condition, isNight, sunPos, moonPos, moonPhase, rising, windSpeed } = state;
      const css = { content: '' };
      const old = this.content?.querySelector('.demo-ui-container');
      if (old) old.remove();

      let html = `<svg style="width:0;height:0;position:absolute;"><filter id="cloud-distort"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="35" /></filter></svg>`;
      if (this.config.demo_mode) html += this._demoUI();
      
      this.layers.forEach(l => { 
        html += `<div class="layer-container" style="z-index:${this._zIdx(l)*1000};">${this._renderLayer(l, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed)}</div>`; 
      });

      this.content.innerHTML = html;
      this._cacheDOM();
      if (this.config.demo_mode) this._setupEvents();
      
      if (!this.dynamicStyleSheet) { 
        this.dynamicStyleSheet = document.createElement('style'); 
        this.appendChild(this.dynamicStyleSheet); 
      }
      this.dynamicStyleSheet.textContent = css.content;
      
      this._updateDynamic(state);
    } catch (e) { console.error('[MeteoCard] _renderAll:', e); }
  }

  _cacheDOM() {
    this._domCache = { 
        skyBg: this.content?.querySelector('.sky-bg'), 
        sunContainer: this.content?.querySelector('.sun-container'), 
        moonContainer: this.content?.querySelector('.moon-container'), 
        infoBox: this.content?.querySelector('.demo-data') 
    };
  }

  _demoUI() {
    try {
      const cond = MeteoCard.DEFAULTS.conditions;
      let opts = `<option value="auto">🔄 Auto</option>`;
      Object.keys(cond).filter(c => c !== 'default').forEach(c => { opts += `<option value="${c}">${c.toUpperCase()}</option>`; });
      return `<div class="demo-ui-container"><div class="demo-top-bar"><select class="demo-select">${opts}</select><button class="demo-btn-play">${this._demoPaused ? '▶️' : '⏸️'}</button></div><div class="demo-data"></div></div>`;
    } catch (e) { console.error('[MeteoCard] _demoUI:', e); return ''; }
  }

  _cleanupEvents() {
    this._demoListeners.forEach(({ el, ev, fn }) => { if (el) el.removeEventListener(ev, fn); });
    this._demoListeners = [];
  }

  _cleanupDemoEvents() { this._cleanupEvents(); }

  _setupEvents() {
    try {
      this._cleanupEvents();
      const sel = this.content?.querySelector('.demo-select');
      if (sel) {
        sel.value = this._demoForcedCondition;
        const fn = (e) => { this._demoForcedCondition = e.target.value; this._initialized = false; this._update(); };
        sel.addEventListener('change', fn);
        this._demoListeners.push({ el: sel, ev: 'change', fn });
      }
      const btn = this.content?.querySelector('.demo-btn-play');
      if (btn) {
        const fn = () => { this._demoPaused = !this._demoPaused; btn.textContent = this._demoPaused ? '▶️' : '⏸️'; };
        btn.addEventListener('click', fn);
        this._demoListeners.push({ el: btn, ev: 'click', fn });
      }
    } catch (e) { console.error('[MeteoCard] _setupEvents:', e); }
  }

  _renderLayer(layer, condition, isNight, sunPos, moonPos, moonPhase, rising, css, windSpeed) {
    try {
      const conf = MeteoCard.DEFAULTS;
      const cond = conf.conditions[condition] || conf.conditions.default;
      if (layer === 'sky') return `<div class="sky-bg" style="position:absolute; inset:0; transition: background 3s ease-in-out;"></div>` + (isNight ? `<div style="position:absolute; inset:0;">${this._stars(100, css)}${this._shootings(2, css)}</div>` : '');
      if (layer === 'sun') return `<div class="sun-container" style="position:absolute; transform:translate(-50%, -50%); pointer-events:none; display:none; width:900px; height:900px;"></div>`;
      if (layer === 'moon') return `<div class="moon-container" style="position:absolute; transform:translate(-50%, -50%); pointer-events:none; display:none; width:900px; height:900px;"></div>`;
      
      let h = '';
      const bg = ['partlycloudy', 'sunny', 'clear-night'].includes(condition);
      if (layer === 'background') return (bg && cond.clouds !== 'none') ? this._clouds(cond.clouds, css, isNight, windSpeed) : '';
      if (layer === 'foreground') {
        if (cond.lightning) h += `<div class="lightning"></div>`;
        if (!bg && cond.clouds !== 'none') h += this._clouds(cond.clouds, css, isNight, windSpeed);
        if (cond.drops) h += this._rain(cond.drops, css);
        if (cond.flakes) h += this._snow(cond.flakes, css);
        if (cond.fog) h += this._fog(5, css);
        return h;
      }
      return '';
    } catch (e) { console.error('[MeteoCard] _renderLayer:', e); return ''; }
  }

  _sunSVG() {
    try {
      const def = MeteoCard.DEFAULTS.sun;
      const s = this.config.sun || {};
      const col = s.colors || def.colors;
      return `<svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible;"><defs><radialGradient id="sunAura"><stop offset="0%" stop-color="${col.aura}" stop-opacity="${s.aura_opacity || def.aura_opacity}"/><stop offset="100%" stop-color="#FF6600" stop-opacity="0"/></radialGradient><radialGradient id="sunHalo"><stop offset="0%" stop-color="${col.halo}" stop-opacity="${s.halo_opacity || def.halo_opacity}"/><stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/></radialGradient></defs><circle cx="150" cy="150" r="${s.aura_radius || def.aura_radius}" fill="url(#sunAura)"/><circle cx="150" cy="150" r="${s.halo_radius || def.halo_radius}" fill="url(#sunHalo)"/><circle cx="150" cy="150" r="${s.disc_radius || def.disc_radius}" fill="${col.disc}" style="filter:blur(1px);"/></svg>`;
    } catch (e) { console.error('[MeteoCard] _sunSVG:', e); return ''; }
  }

  _moonSVG(phase, isDaytime) {
    try {
      const def = MeteoCard.DEFAULTS.moon;
      const m = this.config.moon || {};
      const col = m.colors || def.colors;
      const r = m.disc_radius || def.disc_radius;
      const pl = (phase || '').toLowerCase();
      let p = pl.includes('new') ? 0 : pl.includes('crescent') ? 0.22 : pl.includes('quarter') ? 0.5 : pl.includes('gibbous') ? 0.78 : 1;
      const iw = pl.includes('waning') || pl.includes('last');
      const hr = Math.abs(Math.cos(p * Math.PI)) * r;
      const bo = isDaytime ? 0.4 : 1.0;
      const mid = `moon-mask-${Math.random().toString(36).substr(2, 5)}`;
      return `<svg viewBox="0 0 300 300" style="width:100%; height:100%; overflow:visible;"><defs><filter id="mtx" x="-100%" y="-100%" width="300%" height="300%"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="noise"/><feDiffuseLighting lighting-color="#FFFFFF" surfaceScale="1" result="diffuse"><feDistantLight azimuth="45" elevation="45"/></feDiffuseLighting><feComposite in="diffuse" in2="SourceGraphic" operator="in"/></filter><mask id="${mid}"><g transform="translate(150,150) rotate(25)"><path d="M 0,${-r} A ${r},${r} 0 1,${iw ? 0 : 1} 0,${r} A ${hr},${r} 0 0,${p <= 0.5 ? (iw ? 1 : 0) : (iw ? 0 : 1)} 0,${-r}" fill="white" filter="blur(0.8px)"/></g></mask><radialGradient id="ma"><stop offset="0%" stop-color="${col.aura}" stop-opacity="${(m.aura_opacity || def.aura_opacity) * p * bo}"/><stop offset="100%" stop-color="${col.aura}" stop-opacity="0"/></radialGradient><radialGradient id="m3d" cx="40%" cy="40%" r="50%"><stop offset="0%" stop-color="${col.disc_light}"/><stop offset="100%" stop-color="${col.disc_dark}"/></radialGradient></defs><circle cx="150" cy="150" r="${m.aura_radius || def.aura_radius}" fill="url(#ma)"/><circle cx="150" cy="150" r="${m.halo_radius || def.halo_radius}" fill="#FFFFFF" opacity="${(m.halo_opacity || def.halo_opacity) * p * bo}" style="filter:blur(5px);"/><g mask="url(#${mid})" style="opacity:${bo}"><circle cx="150" cy="150" r="${r + 0.5}" fill="url(#m3d)" /><circle cx="150" cy="150" r="${r + 0.5}" fill="white" filter="url(#mtx)" opacity="0.3" style="mix-blend-mode: soft-light;"/></g></svg>`;
    } catch (e) { console.error('[MeteoCard] _moonSVG:', e); return ''; }
  }

  _clouds(type, css, isNight, windSpeed = 25) {
    try {
      const [nc, pc, gr] = MeteoCard.DEFAULTS.clouds[type] || MeteoCard.DEFAULTS.clouds.low;
      const bc = 255 - (gr * 25);
      let h = '';
      const baseDuration = (20 / (windSpeed + 1)) * 60;

      for (let i = 0; i < nc; i++) {
        const id = `cl-${this.cloudCounter++}`;
        const bs = 60 + Math.random() * 50;
        const randomFactor = (Math.floor(Math.random() * (140 - 60 + 1)) + 60) / 100;
        const dur = baseDuration * randomFactor;
        
        const tp = Math.random() * 95;
        const cw = bs * (2.5 + (pc / 4));
        css.content += `.${id} { position: absolute; top: ${tp}%; left: -${cw * 2}px; width: ${cw}px; height: ${bs * 2.2}px; animation: to-right ${dur}s linear infinite; animation-delay: -${Math.random()*dur}s; filter: url(#cloud-distort) blur(5px); opacity: ${type === 'heavy' ? 0.9 : 0.7}; mix-blend-mode: ${isNight ? 'normal' : 'screen'}; z-index: ${Math.floor(tp)}; } .${id} .puff { position: absolute; border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(${Math.min(255, bc+45)}, ${Math.min(255, bc+45)}, ${Math.min(255, bc+45)}, 1) 0%, rgba(${bc}, ${bc}, ${bc+10}, 0.8) 50%, rgba(${Math.max(0, bc-55)}, ${Math.max(0, bc-55)}, ${Math.max(0, bc-55+20)}, 0.4) 100%); filter: blur(10px); }`;
        let puffs = '';
        for (let j = 0; j < pc; j++) puffs += `<div class="puff" style="width:${bs*(1.1+Math.random()*0.9)}px; height:${bs*(1.1+Math.random()*0.9)*0.9}px; left:${(j*(85/pc))+(Math.random()*10)}%; top:${(Math.random()*(bs*0.4))-(bs*0.2)}px;"></div>`;
        h += `<div class="${id}">${puffs}</div>`;
      }
      return h;
    } catch (e) { console.error('[MeteoCard] _clouds:', e); return ''; }
  }

  _stars(n, css) {
    let h = '';
    for (let i = 0; i < n; i++) {
      const id = `st-${i}`;
      css.content += `.${id}{position:absolute;width:1.5px;height:1.5px;background:#FFFFFF;border-radius:50%;top:${Math.random()*100}%;left:${Math.random()*100}%;animation:star ${2+Math.random()*3}s infinite;z-index:1;}`;
      h += `<div class="${id}"></div>`;
    }
    return h;
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
    let h = '';
    for (let i = 0; i < n; i++) {
      const id = `ra-${i}`;
      css.content += `.${id}{position:absolute;width:1px;height:40px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,0.4));left:${Math.random()*100}%;top:-50px;animation:rain-fall 0.6s linear infinite;animation-delay:-${Math.random()*2}s;z-index:500;}`;
      h += `<div class="${id}"></div>`;
    }
    return h;
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
    let h = '';
    for (let i = 0; i < n; i++) {
      const id = `fog-dense-${i}`;
      const dur = 8 + Math.random() * 8;
      const top = 30 + (i * 10);
      css.content += `
        .${id} { 
          position: absolute; 
          width: 150%; height: 180px; 
          left: -25%; top: ${top}%;
          background: linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.25) 35%, rgba(255, 255, 255, 0.45) 50%, rgba(255, 255, 255, 0.25) 65%, transparent 100%);
          animation: fog-boil ${dur}s ease-in-out infinite alternate; 
          animation-delay: -${Math.random() * dur}s; 
          z-index: ${600 + i}; 
          filter: blur(15px);
          will-change: transform, opacity;
        }`;
      h += `<div class="${id}"></div>`;
    }
    return h;
  }

  _zIdx(l) { return { 'sky': 1, 'sun': 2, 'moon': 2, 'background': 3, 'foreground': 4 }[l] || 2; }

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
      ha-card { width:100%; height:100%; position:relative; overflow:hidden; background:transparent!important; border:none!important; }
      .layer-container { pointer-events:none; position:absolute; inset:0; }
      .demo-ui-container { position:absolute; top:10px; left:10px; z-index:9999; pointer-events:auto; display:flex; flex-direction:column; gap:8px; }
      .demo-top-bar { display:flex; gap:5px; align-items:center; }
      .demo-select { background: rgba(0,0,0,0.85); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; backdrop-filter: blur(5px); }
      .demo-btn-play { background: rgba(0,0,0,0.85); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 6px; width: 30px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; }
      .demo-data { background: rgb(20, 20, 20); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 10px; color: #eee; font-family: monospace; font-size: 10px; line-height: 1.4; pointer-events: none; text-shadow: 1px 1px 1px black; min-width: 200px; min-height: 80px; box-shadow: 0 4px 15px rgba(0,0,0,0.6); }
      .line { margin-bottom: 2px; }
      @keyframes star { 0%,100%{opacity:1;} 50%{opacity:0.2;} }
      @keyframes shot { 0%{transform:rotate(45deg) translateX(-200px);opacity:0;} 1%{opacity:1;} 10%{transform:rotate(45deg) translateX(1200px);opacity:0;} 100%{opacity:0;} }
      @keyframes to-right { to { transform:translateX(130vw); } }
      @keyframes rain-fall { to { transform:translateY(110vh) skewX(-15deg); } }
      @keyframes snow-fall { 0% { transform: translateY(-10vh); } 100% { transform: translateY(110vh); } }
      @keyframes snow-sway { 0% { margin-left: calc(var(--sway) * -1); } 100% { margin-left: var(--sway); } }
      .lightning { position:absolute; inset:0; background:white; opacity:0; animation:flash 5s infinite; z-index:1000; mix-blend-mode: overlay; }
      @keyframes flash { 0%,90%,94%,100%{opacity:0;} 92%{opacity:0.4;} }
      @keyframes fog-boil { 
        0% { transform: scale(1) translateY(0); opacity: 0.15; } 
        50% { opacity: 0.85; } 
        100% { transform: scale(1.15) translateY(-20px); opacity: 0.15; } 
      }
      .sun-container, .moon-container { transition: left 0.5s linear, top 0.5s linear; }
    `;
    this.appendChild(s);
  }
}
customElements.define('meteo-card', MeteoCard);
console.info("%c MeteoCSS Card %c v1.0.1 %c", "background:#2196F3;color:white;padding:2px 8px;border-radius:3px 0 0 3px;font-weight:bold", "background:#4CAF50;color:white;padding:2px 8px;border-radius:0 3px 3px 0", "background:none");
window.customCards = window.customCards || [];
window.customCards.push({
    type: "meteocss-card",
    name: "MeteoCSS Card",
    description: "Weather card with realistic weather conditions, sky, sun, and moon."
});;
