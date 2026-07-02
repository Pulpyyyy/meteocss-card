// Regression test for bug #2: when the demo auto-stops after 10 minutes,
// real data must be restored (same behavior as the STOP button).
'use strict';
const fs = require('fs');

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
        appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
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
global.window = { customCards: [], addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
global.document = {
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    createDocumentFragment: () => makeEl('#fragment'),
};
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() {
        this.shadowRoot = Object.assign(makeEl('#shadow-root'), { adoptedStyleSheets: [] });
        return this.shadowRoot;
    }
};
// Capture rAF callbacks so the test drives the demo loop manually.
const rafQueue = [];
global.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
global.cancelAnimationFrame = () => {};

// ---------- Load the card ----------
const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

// Mock the clock AFTER load so we can jump past the 10-minute demo limit.
const realNow = Date.now.bind(Date);
let timeOffset = 0;
Date.now = () => realNow() + timeOffset;

// ---------- Scaffolding ----------
const card = new MeteoCard();
const renderCalls = [];
card._renderAll = (state) => renderCalls.push({ kind: 'renderAll', state });
card._updateDynamic = (state) => renderCalls.push({ kind: 'updateDynamic', state });
card._updateDemoUI = () => {};

card.setConfig({
    weather: 'weather.home',
    sun_entity: 'sun.sun',
    layers: ['sky', 'sun', 'moon', 'background', 'foreground', 'demo_mode'],
});

// Provide hass (the setter stores it, then early-returns once demo runs).
card._hass = {
    states: {
        'weather.home': { state: 'rainy', attributes: { wind_speed: 10 } },
        'sun.sun': { state: 'above_horizon', attributes: { azimuth: 140, elevation: 30, rising: true } },
    },
};

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const SM_getState = () => {
    // Access the singleton through the card's public-ish surface.
    return card._sharedState;
};

// Start the demo like the UI master would.
SM_getState().demoState = 'running';
SM_getState().lastUpdateTimestamp = Date.now();
SM_getState().demoTimeOffset = Date.now();
card._startDemo();

assert('demo loop scheduled', rafQueue.length > 0, true);

// Jump past the 10-minute auto-stop and run the pending loop iteration.
timeOffset = 10 * 60 * 1000 + 1000;
renderCalls.length = 0;
const loop = rafQueue.pop();
loop();

assert('demo stopped after 10 min', SM_getState().demoState, 'stopped');
const last = renderCalls[renderCalls.length - 1];
assert('render happened after auto-stop', !!last, true);
assert('real condition restored (rainy)', last?.state.condition, 'rainy');
assert('real sun azimuth restored', last?.state.sunPos?.azimuth, 140);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
