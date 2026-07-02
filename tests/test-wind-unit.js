// Test for the wind unit fix: wind_speed must be converted to km/h using
// the entity's wind_speed_unit instead of being read as km/h blindly.
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(), style: {}, children: [], attributes: {}, _html: '', _text: '',
        parentNode: null, parentElement: null, isConnected: true, offsetWidth: 400, offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {}, getAttribute() { return null; },
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
global.document = { createElement: makeEl, createElementNS: (_n, t) => makeEl(t), createDocumentFragment: () => makeEl('#f') };
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() { this.shadowRoot = Object.assign(makeEl('#s'), { adoptedStyleSheets: [] }); return this.shadowRoot; }
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assertClose = (label, actual, expected) => {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) < 0.01;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ~' + expected}`);
};

// --- Unit helper (direct) ---
const card = new MeteoCard();
card._renderAll = () => {};
card._updateDynamic = () => {};
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });

const mk = (speed, unit) => ({ attributes: unit === undefined ? { wind_speed: speed } : { wind_speed: speed, wind_speed_unit: unit } });
assertClose("10 km/h stays 10", card._windSpeedKmh(mk(10, 'km/h')), 10);
assertClose('10 mph -> 16.09 km/h', card._windSpeedKmh(mk(10, 'mph')), 16.0934);
assertClose('10 m/s -> 36 km/h', card._windSpeedKmh(mk(10, 'm/s')), 36);
assertClose('10 kn -> 18.52 km/h', card._windSpeedKmh(mk(10, 'kn')), 18.52);
assertClose('10 ft/s -> 10.97 km/h', card._windSpeedKmh(mk(10, 'ft/s')), 10.9728);
assertClose('no unit attr -> assumed km/h', card._windSpeedKmh(mk(10)), 10);
assertClose('unknown unit -> assumed km/h', card._windSpeedKmh(mk(10, 'furlong/h')), 10);
assertClose('non-numeric -> 0', card._windSpeedKmh(mk('n/a', 'm/s')), 0);
assertClose('negative clamped to 0', card._windSpeedKmh(mk(-5, 'm/s')), 0);

// --- Integration: through the hass setter into the rendered state ---
const card2 = new MeteoCard();
const calls = [];
card2._renderAll = (state) => calls.push(state);
card2._updateDynamic = (state) => calls.push(state);
card2._updateDemoUI = () => {};
card2.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });
card2.hass = {
    states: {
        'weather.home': { state: 'sunny', attributes: { wind_speed: 10, wind_speed_unit: 'm/s' } },
        'sun.sun': { state: 'above_horizon', attributes: { azimuth: 100, elevation: 10, rising: true } },
    },
};
assertClose('rendered state windSpeed converted (10 m/s -> 36)', calls[calls.length - 1]?.windSpeed, 36);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
