// Security & bounds tests: entity states never reach innerHTML unescaped
// (XSS pin), out-of-range astronomy data is rejected, and a new moon fully
// disables the shadow render.
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const el = {
        tagName: tag.toUpperCase(), style: { setProperty(k, v) { this[k] = v; } },
        children: [], attributes: {}, _html: null, _text: '',
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
    Object.defineProperty(el, 'innerHTML', {
        // Mimic the browser: reading innerHTML after a textContent write
        // returns the HTML-escaped text (this is what _safe() relies on).
        get() { return this._html !== null ? this._html : escapeHtml(this._text); },
        set(v) { this._html = String(v); this.children = []; },
    });
    Object.defineProperty(el, 'textContent', {
        get() { return this._text; },
        set(v) { this._text = String(v); this._html = null; },
    });
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
const assert = (label, cond) => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};

// --- XSS pin: a hostile moon-phase entity state must be escaped ---
{
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });
    card._sharedState.actualState = {
        condition: 'sunny', isNight: false, windSpeed: 10, simulatedHour: 12,
        sunPos: { left: 50, top: 50, elevation: 45, azimuth: 180 },
        moonPos: { left: 20, top: 70, elevation: -10, azimuth: 0 },
        moonPhase: '<img src=x onerror=alert(1)>',
        moonPhaseDegrees: 0,
    };
    const html = card._demoUI();
    assert('hostile phase name is HTML-escaped', html.includes('&lt;img'));
    assert('no raw <img injected into demo UI', !html.includes('<img'));
}

// --- EntityValidator bounds: absurd astronomy data is rejected ---
{
    const mkHass = (azimuth, elevation) => ({
        states: {
            'weather.home': { state: 'sunny', attributes: { wind_speed: 10 } },
            'sun.sun': { state: 'above_horizon', attributes: { azimuth, elevation, rising: true } },
        },
    });
    const runCase = (label, azimuth, elevation) => {
        const card = new MeteoCard();
        const renders = [];
        card._renderAll = (s) => renders.push(s);
        card._updateDynamic = (s) => renders.push(s);
        card._updateDemoUI = () => {};
        card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });
        const baseline = renders.length; // setConfig renders a default state
        card.hass = mkHass(azimuth, elevation);
        assert(`${label}: sun entity rejected`, card._validatedEntities.sun === null);
        assert(`${label}: no render from invalid data`, renders.length === baseline);
    };
    runCase('azimuth 400°', 400, 10);
    runCase('elevation -300°', 180, -300);
    runCase('non-numeric azimuth', 'n/a', 10);
}

// --- New moon: shadow must clear once and stop rendering ---
{
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'shadow'] });
    const gl = {
        drawCount: 0, clearCount: 0, COLOR_BUFFER_BIT: 16384,
        uniform2f() {}, uniform3f() {}, uniform1f() {}, uniform1i() {},
        clearColor() {}, clear() { this.clearCount++; }, useProgram() {}, viewport() {},
        drawArrays() { this.drawCount++; },
    };
    Object.assign(card, {
        _shadowGl: gl, _shadowReady: true, _shadowUniforms: {},
        _shadowProgs: { demo: {}, normal: {} }, _shadowUniformSets: { demo: {}, normal: {} },
        _shadowIsDemo: false,
    });
    const shared = card._sharedState;
    shared.demoState = 'stopped';
    shared.isNight = true;
    shared.sunPos = { left: 50, top: 90, elevation: -30, azimuth: 0 };
    shared.moonPos = { left: 40, top: 30, elevation: 40, azimuth: 120 };

    shared.moonPhaseDegrees = 0; // full moon -> intensity 1
    card._updateShadow();
    assert('full moon renders a shadow', gl.drawCount === 1);

    shared.moonPhaseDegrees = 180; // new moon -> intensity 0
    card._updateShadow();
    assert('new moon: no shadow drawn', gl.drawCount === 1);
    assert('new moon: canvas cleared once', gl.clearCount === 2); // 1 render clear + 1 disable clear
    card._updateShadow();
    assert('stays idle while the moon is new', gl.drawCount === 1 && gl.clearCount === 2);

    shared.moonPhaseDegrees = 0; // back to full moon
    card._updateShadow();
    assert('full moon again: shadow re-rendered', gl.drawCount === 2);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
