// Regression test for bug #1: real data must refresh when hass pushes new state.
// Runs the card file in a minimal DOM-stub environment (no jsdom needed).
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- Minimal DOM stubs ----------
function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(),
        style: {},
        children: [],
        attributes: {},
        _html: '',
        _text: '',
        parentNode: null,
        parentElement: null,
        isConnected: true,
        offsetWidth: 400,
        offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k]; },
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        get firstChild() { return this.children[0] || null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        remove() {},
        getBoundingClientRect() { return { width: 400, height: 300 }; },
    };
    Object.defineProperty(el, 'innerHTML', {
        get() { return this._html; },
        set(v) { this._html = String(v); this.children = []; },
    });
    Object.defineProperty(el, 'textContent', {
        get() { return this._text; },
        set(v) { this._text = String(v); },
    });
    return el;
}

const definedElements = {};
global.customElements = {
    get: (name) => definedElements[name],
    define: (name, cls) => { definedElements[name] = cls; },
};
global.window = {
    customCards: [],
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
};
global.document = {
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    createDocumentFragment: () => makeEl('#fragment'),
};
global.HTMLElement = class {
    constructor() { this.style = {}; }
    attachShadow() {
        this.shadowRoot = Object.assign(makeEl('#shadow-root'), { adoptedStyleSheets: [] });
        return this.shadowRoot;
    }
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

// ---------- Load the card ----------
const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();

const MeteoCard = definedElements['meteo-card'];
if (!MeteoCard) { console.error('FAIL: meteo-card not defined'); process.exit(1); }

// ---------- Test scaffolding ----------
const card = new MeteoCard();
const renderCalls = [];
card._renderAll = (state) => renderCalls.push({ kind: 'renderAll', state });
card._updateDynamic = (state) => renderCalls.push({ kind: 'updateDynamic', state });
card._updateDemoUI = () => {};

card.setConfig({
    weather: 'weather.home',
    sun_entity: 'sun.sun',
    layers: ['sky', 'sun', 'moon', 'background', 'foreground'],
});

const makeHass = (weatherState, azimuth, elevation) => ({
    states: {
        'weather.home': { state: weatherState, attributes: { wind_speed: 10 } },
        'sun.sun': {
            state: elevation > 0 ? 'above_horizon' : 'below_horizon',
            attributes: { azimuth, elevation, rising: true },
        },
    },
});

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

// --- Update 1: initial real data ---
renderCalls.length = 0;
card.hass = makeHass('sunny', 100, 10);
let last = renderCalls[renderCalls.length - 1];
assert('U1 render happened', !!last, true);
assert('U1 condition', last?.state.condition, 'sunny');
assert('U1 sun azimuth', last?.state.sunPos.azimuth, 100);

// --- Update 2: weather + position change (the bug scenario) ---
card._lastHassUpdate = 0; // bypass the 1s throttle, as if >1s elapsed
renderCalls.length = 0;
card.hass = makeHass('rainy', 140, 30);
last = renderCalls[renderCalls.length - 1];
assert('U2 render happened', !!last, true);
assert('U2 condition refreshed (was frozen before fix)', last?.state.condition, 'rainy');
assert('U2 sun azimuth refreshed', last?.state.sunPos.azimuth, 140);
assert('U2 full re-render on condition change', last?.kind, 'renderAll');

// --- Update 3: position-only change -> dynamic path ---
card._lastHassUpdate = 0;
renderCalls.length = 0;
card.hass = makeHass('rainy', 150, 35);
last = renderCalls[renderCalls.length - 1];
assert('U3 render happened', !!last, true);
assert('U3 sun azimuth refreshed', last?.state.sunPos.azimuth, 150);
assert('U3 dynamic path (no full rebuild)', last?.kind, 'updateDynamic');

// --- Update 4: nothing changed -> early return, no render ---
card._lastHassUpdate = 0;
renderCalls.length = 0;
card.hass = makeHass('rainy', 150, 35);
assert('U4 no render when data unchanged', renderCalls.length, 0);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
