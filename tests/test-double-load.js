// Double-load test: stale caches and duplicated HACS resource entries load
// the script twice (forum: v3.1.0 cache issues). A second evaluation must
// not throw, must not re-register the element, and must not duplicate the
// card in the picker list.
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
let defineCalls = 0;
global.customElements = {
    get: (n) => definedElements[n],
    define: (n, c) => { defineCalls++; definedElements[n] = c; },
};
global.window = { customCards: [], addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
global.document = { createElement: makeEl, createElementNS: (_n, t) => makeEl(t), createDocumentFragment: () => makeEl('#f') };
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() { this.shadowRoot = Object.assign(makeEl('#s'), { adoptedStyleSheets: [] }); return this.shadowRoot; }
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

// First load.
new Function(code)();
const firstClass = definedElements['meteo-card'];
assert('first load registers the element', !!firstClass, true);
assert('first load adds one picker entry', global.window.customCards.filter(c => c.type === 'meteo-card').length, 1);

// Second load (stale cache / duplicated resource).
let threw = null;
try {
    new Function(code)();
} catch (e) {
    threw = e.message;
}
assert('second load does not throw', threw, null);
assert('element not re-registered', defineCalls, 1);
assert('element class unchanged', definedElements['meteo-card'], firstClass);
assert('picker entry not duplicated', global.window.customCards.filter(c => c.type === 'meteo-card').length, 1);

// The card must still be fully functional after the double load.
const card = new definedElements['meteo-card']();
const renders = [];
card._renderAll = (s) => renders.push(s);
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });
card.hass = {
    states: {
        'weather.home': { state: 'rainy', attributes: { wind_speed: 10 } },
        'sun.sun': { state: 'above_horizon', attributes: { azimuth: 100, elevation: 10, rising: true } },
    },
};
assert('card still renders after double load', renders.length > 0, true);
assert('card still processes real data', renders[renders.length - 1]?.condition, 'rainy');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
