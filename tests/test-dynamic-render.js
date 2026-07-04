// Dynamic render tests: the incremental update paths of _updateDynamic —
// moon SVG rebuilt only on phase change, attribute-only mutation on rotation
// change, sun SVG cleared below the horizon and regenerated above it.
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

// Rigged containers: count innerHTML rebuilds, expose a fake SVG whose
// attribute mutations are recorded (the attribute-only update path).
const makeAttrEl = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } });
const maskG = makeAttrEl(), distLight = makeAttrEl(), grad0 = makeAttrEl(), grad3d = makeAttrEl(), rotEl = makeAttrEl();
const fakeSvg = {
    querySelector: (sel) => sel === 'mask g' ? maskG : sel === 'feDistantLight' ? distLight : null,
    querySelectorAll: (sel) => sel === 'radialGradient' ? [grad0, grad3d] : (sel.includes('150 150') ? [rotEl] : []),
};
const makeContainer = (svg) => {
    let rebuilds = 0;
    const el = {
        parentNode: {}, parentElement: null, style: { setProperty() {} },
        _hasChild: false,
        get firstChild() { return this._hasChild ? {} : null; },
        get rebuilds() { return rebuilds; },
        querySelector: (sel) => (sel === 'svg' ? svg : null),
        querySelectorAll: () => [],
    };
    Object.defineProperty(el, 'innerHTML', {
        get() { return ''; },
        set(v) { rebuilds++; el._hasChild = v !== ''; },
    });
    return el;
};

const card = new MeteoCard();
card._renderAll = () => {};
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'sun', 'moon'] });
card._cardWidth = 400;
card._cardHeight = 300;

const moon = makeContainer(fakeSvg);
const sun = makeContainer(null);
const sunWrapper = { parentNode: {}, parentElement: null, style: { setProperty() {} } };
card._domCache.moonContainer = moon;
card._domCache.sunContainer = sun;
card._domCache.sunWrapper = sunWrapper;

const state = (over = {}) => ({
    condition: 'sunny', isNight: false, rising: false, simulatedHour: 12, windSpeed: 10,
    sunPos: { left: 60, top: 30, elevation: 45, azimuth: 180 },
    moonPos: { left: 20, top: 70, elevation: 30, azimuth: 0 },
    moonPhase: 'Full Moon', moonPhaseDegrees: 0,
    ...over,
});

// --- First paint: both bodies fully built ---
card._updateDynamic(state());
assert('first paint builds the moon SVG', moon.rebuilds, 1);
assert('first paint builds the sun SVG', sun.rebuilds, 1);

// --- Same state: nothing rebuilt ---
card._updateDynamic(state());
assert('no rebuild without changes (moon)', moon.rebuilds, 1);
assert('no rebuild without changes (sun)', sun.rebuilds, 1);

// --- Rotation-only change: attribute mutation, no SVG reparse ---
card._updateDynamic(state({ moonPhaseDegrees: 15 }));
assert('degrees-only change does NOT rebuild', moon.rebuilds, 1);
assert('mask rotation mutated', maskG.attrs.transform, 'translate(150,150) rotate(15)');
assert('light azimuth mutated', distLight.attrs.azimuth, '15');
assert('3d gradient recentered (cx)', grad3d.attrs.cx, `${40 + Math.cos(15 * Math.PI / 180) * 15}%`);
assert('static rotations updated', rotEl.attrs.transform, 'rotate(15 150 150)');

// --- Phase change: full rebuild required (mask path shape changes) ---
card._updateDynamic(state({ moonPhase: 'Waning Gibbous', moonPhaseDegrees: 15 }));
assert('phase change rebuilds the moon SVG', moon.rebuilds, 2);

// --- Sun horizon transitions ---
card._updateDynamic(state({ moonPhase: 'Waning Gibbous', moonPhaseDegrees: 15, sunPos: { left: 60, top: 95, elevation: -5, azimuth: 270 } }));
assert('sunset clears the sun container', sun._hasChild, false);
assert('clearing counts as one write', sun.rebuilds, 2);
card._updateDynamic(state({ moonPhase: 'Waning Gibbous', moonPhaseDegrees: 15, sunPos: { left: 40, top: 20, elevation: 10, azimuth: 90 } }));
assert('sunrise regenerates the sun SVG', sun.rebuilds, 3);
assert('sun container repopulated', sun._hasChild, true);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
