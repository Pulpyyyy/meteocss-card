// setConfig structural validation: invalid YAML must throw (Lovelace then
// shows an explicit error card — the HA custom-card convention), while
// tolerated looseness (null/empty layer entries, unknown layer names) must
// NOT throw so existing dashboards keep working after an update.
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
const assert = (label, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok || !detail ? '' : ' — ' + detail}`);
};

const makeCard = () => {
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDynamic = () => {};
    card._updateDemoUI = () => {};
    return card;
};

const throws = (config, expectedInMessage) => {
    try {
        makeCard().setConfig(config);
        return { threw: false, message: '' };
    } catch (e) {
        const msg = String(e && e.message);
        return { threw: true, message: msg, matches: !expectedInMessage || msg.includes(expectedInMessage) };
    }
};

// --- Valid configs must NOT throw ---
let r = throws({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'sun', 'moon'] });
assert('full valid config accepted', !r.threw, r.message);

r = throws({});
assert('empty object accepted (defaults apply)', !r.threw, r.message);

r = throws({ layers: ['sky', null, ''] });
assert('null/empty layer entries tolerated (trailing "-" in YAML)', !r.threw, r.message);

r = throws({ layers: ['demo_mode-group1'] });
assert('demo_mode* layer variants accepted', !r.threw, r.message);

r = throws({ orbit: { rx: 45 }, shadow: { depthmap: '/local/d.png' } });
assert('partial object sub-configs accepted', !r.threw, r.message);

// --- Structurally invalid configs MUST throw, with the key named ---
r = throws(null);
assert('null config throws', r.threw);

r = throws([1, 2]);
assert('array config throws', r.threw);

r = throws({ layers: 'sky' }, 'layers');
assert('layers as string throws, message names "layers"', r.threw && r.matches, r.message);

r = throws({ layers: ['sky', 42] }, 'layers');
assert('numeric layer entry throws', r.threw && r.matches, r.message);

r = throws({ weather: { entity: 'weather.home' } }, 'weather');
assert('weather as object throws, message names "weather"', r.threw && r.matches, r.message);

r = throws({ sun_entity: 7 }, 'sun_entity');
assert('sun_entity as number throws', r.threw && r.matches, r.message);

r = throws({ orbit: [45, 40] }, 'orbit');
assert('orbit as array throws', r.threw && r.matches, r.message);

r = throws({ conditions: 'sunny' }, 'conditions');
assert('conditions as string throws', r.threw && r.matches, r.message);

// --- Unknown layer name: warn, do not throw ---
const warnings = [];
const origWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
r = throws({ layers: ['skyy'] });
console.warn = origWarn;
assert('unknown layer name does not throw', !r.threw, r.message);
assert('unknown layer name emits a console.warn naming it',
    warnings.some(w => w.includes('skyy')), JSON.stringify(warnings));

// --- A rejected config must not corrupt the card: valid setConfig after ---
const card = makeCard();
let rejected = false;
try { card.setConfig({ layers: 'sky' }); } catch { rejected = true; }
let recovered = true;
try { card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] }); } catch { recovered = false; }
assert('card recovers with a valid config after a rejected one', rejected && recovered);
assert('rejected config left no partial state (config not applied)',
    rejected && card._meteoConfig && card._meteoConfig.get('weather') === 'weather.home');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
