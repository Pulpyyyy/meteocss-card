// Test for perf fix #8: the shadow shader must not re-render while the light
// is static (old code forced a redraw every 250ms), but must re-render on
// light movement >= 0.5° and on moon-phase intensity changes.
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

// Controllable clock (the old code keyed its forced redraw on Date.now()).
const realNow = Date.now.bind(Date);
let timeOffset = 0;
Date.now = () => realNow() + timeOffset;

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const card = new MeteoCard();
card._renderAll = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'shadow'] });

// Fake a ready WebGL shadow engine that just counts draw calls.
const gl = {
    drawCount: 0,
    COLOR_BUFFER_BIT: 16384,
    uniform2f() {}, uniform3f() {}, uniform1f() {}, uniform1i() {},
    clearColor() {}, clear() {}, useProgram() {}, viewport() {},
    drawArrays() { this.drawCount++; },
};
card._shadowGl = gl;
card._shadowReady = true;
card._shadowUniforms = {};
card._shadowProgs = { demo: {}, normal: {} };
card._shadowUniformSets = { demo: {}, normal: {} };
card._shadowIsDemo = false;

const shared = card._sharedState;
shared.demoState = 'stopped';
shared.isNight = false;
shared.sunPos = { left: 60, top: 30, elevation: 45, azimuth: 180 };
shared.moonPos = { left: 20, top: 70, elevation: -10, azimuth: 0 };
shared.moonPhaseDegrees = 0;

// 1. First render draws.
card._updateShadow();
assert('initial render draws', gl.drawCount, 1);

// 2. Same position immediately -> skipped.
card._updateShadow();
assert('static light skipped (immediate)', gl.drawCount, 1);

// 3. Same position 300ms later -> must STILL be skipped (old code redrew here).
timeOffset += 300;
card._updateShadow();
assert('static light skipped after 300ms (old code redrew)', gl.drawCount, 1);

// 4. Light moved by 1 degree -> redraw.
shared.sunPos = { left: 61, top: 30, elevation: 45, azimuth: 181 };
card._updateShadow();
assert('moved light redraws', gl.drawCount, 2);

// 5. Night: static moon but phase intensity change -> redraw.
shared.isNight = true;
shared.moonPos = { left: 40, top: 40, elevation: 30, azimuth: 90 };
shared.moonPhaseDegrees = 0; // full moon, intensity 1.0
card._updateShadow();
const afterMoonFirst = gl.drawCount;
assert('moon light renders', afterMoonFirst, 3);
card._updateShadow();
assert('static moon skipped', gl.drawCount, 3);
shared.moonPhaseDegrees = 90; // intensity 0.5, position unchanged
card._updateShadow();
assert('phase/intensity change redraws static moon', gl.drawCount, 4);

// 6. Light below horizon -> clears once, then no more draws.
shared.moonPos = { left: 40, top: 40, elevation: -5, azimuth: 90 };
card._updateShadow();
card._updateShadow();
assert('below horizon does not draw', gl.drawCount, 4);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
