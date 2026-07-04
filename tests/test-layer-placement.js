// Layer placement tests (forum-derived): rain/snow/lightning render ONLY in
// the foreground layer (users applying rain_intensity to a background-only
// card saw no effect), fog splits between layers per background_ratio, and
// the z-index table keeps the stacking contract.
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(), style: { setProperty(k, v) { this[k] = v; } },
        children: [], attributes: {}, _html: '', _text: '',
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
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const card = new MeteoCard();
card._renderAll = () => {};
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'background', 'foreground'] });

const sunPos = { left: 60, top: 30, elevation: 45, azimuth: 180 };
const moonPos = { left: 20, top: 70, elevation: -10, azimuth: 0 };
const render = (layer, condition) => {
    const cond = card._meteoConfig.get(`conditions.${condition}`);
    const css = { content: '', shared: new Set() };
    return card._renderLayer(layer, condition, false, sunPos, moonPos, 'Full Moon', false, css, 25, cond);
};
const count = (html, marker) => (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

// --- Rain: foreground only (rainy -> drops 'low' -> 50 drops) ---
assert('no rain in the background layer', count(render('background', 'rainy'), '-rain"'), 0);
assert('rain renders in the foreground (50 drops for rainy)', count(render('foreground', 'rainy'), '-rain"'), 50);

// --- Snow: foreground only (snowy -> 'normal' -> 80 flakes) ---
assert('no snow in the background layer', count(render('background', 'snowy'), '-snow"'), 0);
assert('snow renders in the foreground (80 flakes)', count(render('foreground', 'snowy'), '-snow"'), 80);

// --- Lightning: foreground only ---
assert('no lightning in the background layer', count(render('background', 'lightning-rainy'), 'class="lightning"'), 0);
assert('lightning renders in the foreground', count(render('foreground', 'lightning-rainy'), 'class="lightning"'), 1);

// --- Fog splits across both layers per background_ratio (fog: ratio 0.3, count 4) ---
assert('fog in background: ceil(4 x 0.3) = 2 banks', count(render('background', 'fog'), '-fog-'), 2);
assert('fog in foreground: ceil(4 x 0.7) = 3 banks', count(render('foreground', 'fog'), '-fog-'), 3);

// --- Cloud split wiring: cloudy (heavy=15, ratio 0.6) -> 9 back / 6 front ---
render('background', 'cloudy');
assert('background cloud count published (9)', card._sharedState.bgCloudCount, 9);
render('foreground', 'cloudy');
assert('foreground cloud count published (6)', card._sharedState.fgCloudCount, 6);

// --- z-index stacking contract ---
const z = (l) => card._zIdx(l);
assert('sky is the deepest layer', z('sky'), 1);
assert('stacking: sky < background < shadow < moon < sun',
    z('sky') < z('background') && z('background') < z('shadow') && z('shadow') < z('moon') && z('moon') < z('sun'), true);
assert('foreground sits far above all celestial layers', z('foreground') > z('sun') && z('foreground') >= 500, true);
assert('demo controls sit above everything', z('demo_mode') > z('foreground'), true);
assert('unknown layers land at background level', z('anything-else'), 2);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
