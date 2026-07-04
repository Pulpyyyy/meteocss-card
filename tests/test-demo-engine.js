// DemoEngine tests: pause/resume time continuity, 24h-cycle coherence
// (day/night, sun/moon opposition, wind bounds) and forced conditions.
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

const realNow = Date.now.bind(Date);
let t = 1_000_000_000;
Date.now = () => t;

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};
const assertClose = (label, actual, expected, eps = 0.001) => {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) < eps;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ~' + expected}`);
};

// A demo-master card owns a DemoEngine instance.
const card = new MeteoCard();
card._renderAll = () => {};
card._updateDynamic = () => {};
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'demo_mode-engine'] });
const engine = card._demoEngine;
const shared = card._sharedState;
assert('engine created for the demo master', !!engine, true);

// --- Pause / resume: simulated time must freeze, then continue seamlessly ---
shared.demoState = 'running';
shared.demoTimeOffset = 10000; // 10s into the 60s cycle -> 04:00
shared.lastUpdateTimestamp = t;
assertClose('t+0: hour 04:00', engine.compute().simulatedHour, 4.0);
t += 5000;
assertClose('running 5s: hour 06:00', engine.compute().simulatedHour, 6.0);
shared.demoState = 'paused';
t += 10000;
assertClose('paused 10s: hour frozen at 06:00', engine.compute().simulatedHour, 6.0);
shared.demoState = 'running';
t += 2000;
assertClose('resumed 2s: hour 06:48 (no jump)', engine.compute().simulatedHour, 6.8);

// --- 24h cycle coherence ---
shared.demoState = 'paused'; // freeze the offset, we drive it manually
const validConditions = Object.keys(card._meteoConfig.get('conditions')).filter(c => c !== 'default');
let coherent = true, windOk = true, moonOpposite = true, phaseOk = true, condOk = true;
for (const h of [0, 3, 6.01, 9, 12, 15, 18, 21, 23.9]) {
    shared.demoTimeOffset = h * 2500; // 60000ms / 24h
    const s = engine.compute();
    if (Math.abs(s.simulatedHour - h) > 0.01) coherent = false;
    if (s.isNight !== (s.sunPos.elevation <= 0)) coherent = false;
    if (s.windSpeed < 15 || s.windSpeed > 80) windOk = false;
    if (Math.abs(s.moonPos.elevation + s.sunPos.elevation) > 1e-9) moonOpposite = false;
    if (s.moonPhaseDegrees < 0 || s.moonPhaseDegrees >= 360) phaseOk = false;
    if (!validConditions.includes(s.condition)) condOk = false;
}
assert('hour tracks the offset across the cycle', coherent, true);
assert('wind stays within [15, 80] km/h', windOk, true);
assert('moon elevation mirrors the sun', moonOpposite, true);
assert('moon phase degrees stay in [0, 360)', phaseOk, true);
assert('conditions come from the configured set', condOk, true);

shared.demoTimeOffset = 12 * 2500;
assert('noon is day', engine.compute().isNight, false);
shared.demoTimeOffset = 0;
assert('midnight is night', engine.compute().isNight, true);

// --- Forced condition overrides the scenario ---
shared.demoForcedCondition = 'snowy';
assert('forced condition wins', engine.compute().condition, 'snowy');
shared.demoForcedCondition = 'auto';
assert('auto returns to the scenario', validConditions.includes(engine.compute().condition), true);

Date.now = realNow;
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
