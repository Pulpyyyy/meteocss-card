// Test for fix #4: _updateDynamic and _updateStaticDOM must fall back to
// conditions.default for unknown conditions instead of throwing on conf.night_sky.
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(), style: {}, children: [], attributes: {},
        _html: '', _text: '', parentNode: null, parentElement: null, isConnected: true,
        offsetWidth: 400, offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k]; },
        appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        get firstChild() { return this.children[0] || null; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {}, remove() {},
        getBoundingClientRect() { return { width: 400, height: 300 }; },
    };
    Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children = []; } });
    Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
    return el;
}

const definedElements = {};
global.customElements = { get: (n) => definedElements[n], define: (n, c) => { definedElements[n] = c; } };
global.window = { customCards: [], addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
global.document = {
    createElement: (t) => makeEl(t),
    createElementNS: (_n, t) => makeEl(t),
    createDocumentFragment: () => makeEl('#fragment'),
};
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() { this.shadowRoot = Object.assign(makeEl('#shadow-root'), { adoptedStyleSheets: [] }); return this.shadowRoot; }
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assert = (label, cond) => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};

const card = new MeteoCard();
card._renderAll = () => {};
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });

// Plant a fake sky element in the DOM cache.
const parent = makeEl('div');
const sky = makeEl('div');
parent.appendChild(sky);
card._domCache.skyBg = sky;

// State with a condition that has no entry in the conditions config.
const state = {
    condition: 'volcanic-ash',
    isNight: false,
    sunPos: { left: 50, top: 40, elevation: 45, azimuth: 180 },
    moonPos: { left: 20, top: 70, elevation: -10, azimuth: 0 },
    moonPhase: 'Full Moon',
    moonPhaseDegrees: 0,
    rising: false,
    simulatedHour: 12,
    windSpeed: 10,
};

sky.style.background = undefined;
card._updateDynamic(state);
assert('_updateDynamic: sky painted for unknown condition',
    typeof sky.style.background === 'string' && sky.style.background.includes('radial-gradient'));

sky.style.background = undefined;
card._updateStaticDOM(state);
assert('_updateStaticDOM: sky painted for unknown condition',
    typeof sky.style.background === 'string' && sky.style.background.includes('radial-gradient'));

// Known condition still uses its own config (sanity check).
sky.style.background = undefined;
card._updateDynamic({ ...state, condition: 'sunny' });
assert('_updateDynamic: known condition still works',
    typeof sky.style.background === 'string' && sky.style.background.includes('radial-gradient'));

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
