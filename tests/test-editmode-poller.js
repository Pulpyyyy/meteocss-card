// Test: the edit-mode polling fallback must use ONE shared interval for all
// cards (was one permanent 2s timer per card), still detect the edit-mode
// exit transition, and stop entirely when the last card disconnects.
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
global.window = { customCards: [], addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 1600, innerHeight: 800 };
global.document = { createElement: makeEl, createElementNS: (_n, t) => makeEl(t), createDocumentFragment: () => makeEl('#f') };
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() { this.shadowRoot = Object.assign(makeEl('#s'), { adoptedStyleSheets: [] }); return this.shadowRoot; }
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.ResizeObserver = class { constructor() {} observe() {} disconnect() {} };
global.IntersectionObserver = class { constructor() {} observe() {} disconnect() {} };

// Interval accounting: the whole point of this test.
const activeIntervals = new Map();
let nextIntervalId = 1;
global.setInterval = (fn, _ms) => { const id = nextIntervalId++; activeIntervals.set(id, fn); return id; };
global.clearInterval = (id) => { activeIntervals.delete(id); };

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const lovelace = { editMode: false };
const makeCard = () => {
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDynamic = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });
    card.getRootNode = () => ({ host: { lovelace } });
    card.connectedCallback();
    return card;
};

const cards = [makeCard(), makeCard(), makeCard()];
assert('3 cards share a single interval (was 3)', activeIntervals.size, 1);

// --- Functional: exit-transition triggers a forced re-render on each card ---
const tick = () => activeIntervals.forEach(fn => fn());
lovelace.editMode = true;
tick(); // all cards latch editMode=true

const rerenders = [];
cards.forEach((card, i) => {
    card._initialized = true;
    card._forceRerender = () => rerenders.push(i);
    card._sharedState.actualState = {
        condition: 'sunny', isNight: false,
        sunPos: { left: 50, top: 50, elevation: 45, azimuth: 180 },
        moonPos: { left: 20, top: 70, elevation: -10, azimuth: 0 },
    };
});
lovelace.editMode = false;
tick();
assert('all cards re-render on edit-mode exit', rerenders.length, 3);
tick();
assert('no re-render while state is stable', rerenders.length, 3);

// --- Teardown: interval survives until the LAST card leaves ---
cards[0].disconnectedCallback();
cards[1].disconnectedCallback();
assert('interval kept while cards remain', activeIntervals.size, 1);
cards[2].disconnectedCallback();
assert('interval stopped with the last card', activeIntervals.size, 0);

// --- Reconnect restarts the shared poller ---
cards[2].connectedCallback();
assert('reconnect restarts the shared interval', activeIntervals.size, 1);
cards[2].disconnectedCallback();

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
