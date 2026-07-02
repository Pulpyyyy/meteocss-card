// Test: the shadow engine must survive a WebGL context loss — preventDefault
// on 'webglcontextlost' (required for restore), stop rendering while lost,
// and rebuild everything on 'webglcontextrestored' without killing the
// freshly restored context via loseContext().
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
global.Image = class { set src(_v) { /* never fires onload in this test */ } };

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

// Proxy-based WebGL mock: every method succeeds, status queries return true.
let loseContextCalls = 0;
const makeGl = () => new Proxy({}, {
    get(_t, prop) {
        if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true;
        if (prop === 'getUniformLocation') return () => ({});
        if (prop === 'getExtension') return () => ({ loseContext() { loseContextCalls++; } });
        return () => true; // generic: methods no-op, constants are truthy
    },
});

// Canvas stub with listener tracking and a stable GL context.
const canvas = makeEl('canvas');
canvas.parentElement = makeEl('div');
const listeners = {};
canvas.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
canvas.removeEventListener = (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); };
const glInstance = makeGl();
canvas.getContext = () => glInstance;

const card = new MeteoCard();
card._renderAll = () => {};
card._updateDemoUI = () => {};
card.setConfig({
    weather: 'weather.home', sun_entity: 'sun.sun',
    layers: ['sky', 'shadow'],
    shadow: { depthmap: '/local/depth.png' },
});
card._domCache.shadowCanvas = canvas;

// --- Init attaches both handlers ---
card._initShadowEngine();
assert('gl initialized', !!card._shadowGl, true);
assert('contextlost handler attached', (listeners['webglcontextlost'] || []).length, 1);
assert('contextrestored handler attached', (listeners['webglcontextrestored'] || []).length, 1);

// --- Context lost: preventDefault + stop rendering ---
card._shadowReady = true;
let prevented = false;
listeners['webglcontextlost'][0]({ preventDefault() { prevented = true; } });
assert('preventDefault called (restore allowed)', prevented, true);
assert('rendering stopped while lost', card._shadowReady, false);

// --- Context restored: full re-init, no loseContext on the fresh context ---
loseContextCalls = 0;
listeners['webglcontextrestored'][0]();
assert('engine re-initialized (gl handle back)', !!card._shadowGl, true);
assert('no loseContext() on the restored context', loseContextCalls, 0);
assert('handlers re-attached exactly once (lost)', (listeners['webglcontextlost'] || []).length, 1);
assert('handlers re-attached exactly once (restored)', (listeners['webglcontextrestored'] || []).length, 1);

// --- Cleanup removes the handlers ---
card._cleanupShadow();
assert('handlers removed on cleanup (lost)', (listeners['webglcontextlost'] || []).length, 0);
assert('handlers removed on cleanup (restored)', (listeners['webglcontextrestored'] || []).length, 0);
assert('cleanup releases the real context', loseContextCalls, 1);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
