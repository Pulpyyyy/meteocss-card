// Test for perf fix #7 (and the push-based slave sync): outside demo mode a
// slave renders synchronously when the master publishes (no rAF polling),
// skips redundant frames, defers off-screen publications without consuming
// the state version (replayed on return), and still takes over as demo
// master when the current master vanishes (the demo path keeps the rAF loop).
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
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const makeHass = (weatherState, azimuth, elevation) => ({
    states: {
        'weather.home': { state: weatherState, attributes: { wind_speed: 10 } },
        'sun.sun': { state: 'above_horizon', attributes: { azimuth, elevation, rising: true } },
    },
});

const instrument = (card) => {
    const calls = [];
    card._renderAll = (state) => calls.push({ kind: 'renderAll', state });
    card._updateDynamic = (state) => calls.push({ kind: 'updateDynamic', state });
    card._updateDemoUI = () => {};
    return calls;
};

// --- Scenario 1: non-demo group, publication pushes the render to the slave ---
const card1 = new MeteoCard();
instrument(card1);
card1.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', singleton_id: 'grp', layers: ['sky', 'sun'] });

const card2 = new MeteoCard();
const calls2 = instrument(card2);
card2.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', singleton_id: 'grp', layers: ['sky', 'sun'] });
card2._hass = makeHass('sunny', 100, 10);

// A master's FIRST hass update publishes more than once (the hass setter,
// _update and _getRealData each publish until realDataReady bootstraps), so
// the slave is pushed once per publication. Only the follow-up publications
// (asserted below) are strictly once-per-publication.
calls2.length = 0;
card1.hass = makeHass('sunny', 100, 10); // publishes actualState -> subscriber push
assert('S1: first hass update pushes render(s) to the slave', calls2.length >= 1, true);

calls2.length = 0;
card2._updateOptimized();
card2._updateOptimized();
card2._updateOptimized();
assert('S1: idle frames skipped (0 renders on 3 frames)', calls2.length, 0);

card1._lastHassUpdate = 0;
calls2.length = 0;
card1.hass = makeHass('sunny', 120, 20); // new publication
assert('S1: renders once per new publication', calls2.length, 1);
assert('S1: rendered state carries new azimuth', calls2[0]?.state.sunPos?.azimuth, 120);
calls2.length = 0;
card2._updateOptimized();
assert('S1: idle again after consuming the new version', calls2.length, 0);

// --- Scenario 1b: off-screen slave skips the work WITHOUT consuming the
// version, so the visibility observer's catch-up call replays the missed
// state instead of leaving the card frozen on its last paint ---
card2._isVisible = false;
card1._lastHassUpdate = 0;
calls2.length = 0;
card1.hass = makeHass('sunny', 140, 30); // published while card2 is off-screen
assert('S1b: off-screen publication deferred (no render)', calls2.length, 0);
card2._isVisible = true;
card2._updateOptimized(); // what the IntersectionObserver fires on return
assert('S1b: catch-up on return renders the missed state', calls2.length, 1);
assert('S1b: caught-up state carries the missed azimuth', calls2[0]?.state.sunPos?.azimuth, 140);

// --- Scenario 2: demo group, dead master is replaced on stale frames ---
const cardM = new MeteoCard();
instrument(cardM);
cardM.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'sun', 'demo_mode-grp2'] });

const cardS = new MeteoCard();
instrument(cardS);
cardS.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'sun', 'demo_mode-grp2'] });
cardS._hass = makeHass('sunny', 100, 10);

const shared = cardS._sharedState;
assert('S2: master elected', shared.demoUIMaster, cardM._cardId);

cardS._updateOptimized(); // consume current version
cardS._updateOptimized(); // stale frame, master alive
assert('S2: master untouched while alive', shared.demoUIMaster, cardM._cardId);

cardM.disconnectedCallback(); // master vanishes (unregisters)
cardS._updateOptimized();     // stale frame -> takeover
assert('S2: slave promoted to demo master', shared.demoUIMaster, cardS._cardId);
assert('S2: demo running under new master', shared.demoState, 'running');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
