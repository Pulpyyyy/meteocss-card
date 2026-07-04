// Lifecycle tests: disconnect/reconnect (HA view switching), singleton
// destruction with the last card, cascading demo-master deaths, and the
// demo_mode-layer-as-singleton-id sharing behavior.
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
global.setInterval = () => 0;
global.clearInterval = () => {};
global.ResizeObserver = class { constructor() {} observe() {} disconnect() {} };
global.IntersectionObserver = class { constructor() {} observe() {} disconnect() {} };

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
    const record = (kind) => (state) => calls.push({ kind, state });
    card._renderAll = record('renderAll');
    card._updateDynamic = record('updateDynamic');
    card._updateDemoUI = () => {};
    return calls;
};

// --- 1. Disconnect / reconnect (view switch) forces a full re-render ---
{
    const card = new MeteoCard();
    const calls = instrument(card);
    card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'sun'] });
    card.connectedCallback();
    card.hass = makeHass('sunny', 100, 10);
    assert('L1: initial render happened', calls.some(c => c.kind === 'renderAll'), true);

    card.disconnectedCallback();
    card.connectedCallback();
    calls.length = 0;
    // Same hass values as before: only the reconnect flag reset can trigger this.
    card.hass = makeHass('sunny', 100, 10);
    assert('L1: full re-render after reconnect (same data)', calls.some(c => c.kind === 'renderAll'), true);
    assert('L1: re-rendered with correct azimuth', calls.find(c => c.kind === 'renderAll')?.state.sunPos.azimuth, 100);
}

// --- 2. Last card leaving destroys the singleton (no ghost state) ---
{
    const card1 = new MeteoCard();
    instrument(card1);
    card1.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', singleton_id: 'grp-death', layers: ['sky'] });
    card1.hass = makeHass('rainy', 120, 20);
    const s1 = card1._sharedState;
    assert('L2: state stored in singleton', !!s1.actualState, true);

    card1.disconnectedCallback(); // last card -> singleton deleted

    const card2 = new MeteoCard();
    instrument(card2);
    card2.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', singleton_id: 'grp-death', layers: ['sky'] });
    assert('L2: fresh singleton object after death', card2._sharedState !== s1, true);
    assert('L2: no ghost actualState', card2._sharedState.actualState, null);
    assert('L2: data must be re-fetched', card2._sharedState.realDataReady, false);
}

// --- 3. Cascading demo-master deaths: M -> A -> B ---
{
    const layers = ['sky', 'sun', 'demo_mode-cascade'];
    const mk = () => {
        const card = new MeteoCard();
        instrument(card);
        card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers });
        card._hass = makeHass('sunny', 100, 10);
        return card;
    };
    const M = mk(), A = mk(), B = mk();
    const shared = M._sharedState;
    assert('L3: M elected first master', shared.demoUIMaster, M._cardId);

    // Slaves consume the pending state version once.
    A._updateOptimized();
    B._updateOptimized();

    M.disconnectedCallback();
    A._updateOptimized(); // stale frame -> takeover
    assert('L3: A takes over after M dies', shared.demoUIMaster, A._cardId);
    assert('L3: demo running under A', shared.demoState, 'running');

    B._updateOptimized(); // consume A's new state version
    A.disconnectedCallback();
    B._updateOptimized();
    B._updateOptimized(); // stale frame -> takeover
    assert('L3: B takes over after A dies', shared.demoUIMaster, B._cardId);
    assert('L3: demo still running under B', shared.demoState, 'running');
    B.disconnectedCallback();
}

// --- 4. Bare demo_mode layer shares one singleton; suffixed layer isolates ---
{
    const mk = (demoLayer) => {
        const card = new MeteoCard();
        instrument(card);
        card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', demoLayer] });
        return card;
    };
    const x = mk('demo_mode');
    const y = mk('demo_mode');
    const z = mk('demo_mode-iso');
    assert('L4: bare demo_mode cards share the singleton id', x._singletonId === 'demo_mode' && y._singletonId === 'demo_mode', true);
    assert('L4: bare demo_mode cards share the state object', x._sharedState === y._sharedState, true);
    assert('L4: suffixed layer gets its own singleton', z._singletonId, 'demo_mode-iso');
    assert('L4: suffixed layer state is isolated', z._sharedState !== x._sharedState, true);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
