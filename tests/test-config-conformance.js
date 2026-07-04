// Config conformance tests: pins the promises made by the README — cloud
// background_ratio math (the documented 9/6 example), partial deep-merge
// ("Keep It Simple!"), rain intensity mapping, and card-picker stubs.
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
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const mkCard = (config = {}) => {
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'], ...config });
    return card;
};

// --- Cloud ratio math (the README example: heavy=15, ratio 0.6 -> 9 / 6) ---
{
    const card = mkCard();
    const css = () => ({ content: '', shared: new Set() });
    assert('heavy x 0.6 = 9 background clouds', card._clouds('heavy', css(), false, 25, 0.6).count, 9);
    assert('heavy x 0.4 = 6 foreground clouds', card._clouds('heavy', css(), false, 25, 0.4).count, 6);
    assert('low(4) x 0.5 rounds up to 2', card._clouds('low', css(), false, 25, 0.5).count, 2);
    const none = card._clouds('none', css(), false, 25, 1.0);
    assert('none produces no clouds', none.count, 0);
    assert('none produces no markup', none.html, '');
}

// --- Deep merge: partial overrides keep unmentioned defaults ---
{
    const card = mkCard({ moon: { disc_radius: 12 } });
    assert('overridden moon.disc_radius', card._meteoConfig.get('moon.disc_radius'), 12);
    assert('moon.halo_radius default preserved', card._meteoConfig.get('moon.halo_radius'), 35);
    assert('nested moon color default preserved', card._meteoConfig.get('moon.colors.disc_dark'), '#9595A5');
}
{
    const card = mkCard({ clouds: { heavy: [3, 1, 0] } });
    assert('arrays replaced wholesale', card._meteoConfig.get('clouds.heavy'), [3, 1, 0]);
    assert('sibling array untouched', card._meteoConfig.get('clouds.normal'), [10, 3, 2]);
}
{
    const card = mkCard({ sun: null });
    assert('null cannot erase a default section', card._meteoConfig.get('sun.disc_radius'), 8);
}

// --- Rain intensity mapping (forum: users tune rain_intensity for mobile) ---
{
    const card = mkCard({ rain_intensity: { heavy: 50 } });
    assert('custom heavy rain count', card._meteoConfig.get('rain_intensity.heavy'), 50);
    assert('normal rain default preserved', card._meteoConfig.get('rain_intensity.normal'), 100);
    const css = { content: '', shared: new Set() };
    const html = card._rain(5, css);
    assert('rain generates exactly n drops', (html.match(/class="/g) || []).length, 5);
}

// --- getStubConfig: entity-first card picker prefill ---
{
    const hass = { states: { 'weather.zeus': {}, 'sun.custom': {}, 'light.x': {} } };
    assert('picks weather entity from picker selection',
        MeteoCard.getStubConfig(hass, ['light.x', 'weather.a'], []).weather, 'weather.a');
    assert('falls back to the fallback list',
        MeteoCard.getStubConfig(hass, ['light.x'], ['weather.b']).weather, 'weather.b');
    assert('falls back to hass states',
        MeteoCard.getStubConfig(hass, [], []).weather, 'weather.zeus');
    assert('uses a real sun entity when present',
        MeteoCard.getStubConfig(hass, [], []).sun_entity, 'sun.custom');
    assert('defaults to sun.sun otherwise',
        MeteoCard.getStubConfig({ states: {} }, [], []).sun_entity, 'sun.sun');
}

// --- getEntitySuggestion (2026.6 entity-first picker) ---
{
    const entry = global.window.customCards.find(c => c.type === 'meteo-card');
    assert('card registered in customCards', !!entry, true);
    const hass = { states: { 'sun.custom': {} } };
    const suggestion = entry.getEntitySuggestion(hass, 'weather.a');
    assert('suggests a config for weather entities', suggestion?.config.weather, 'weather.a');
    assert('suggestion picks the real sun entity', suggestion?.config.sun_entity, 'sun.custom');
    assert('no suggestion for non-weather entities', entry.getEntitySuggestion(hass, 'light.x'), null);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
