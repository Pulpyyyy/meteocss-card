// Test: animation travel distances must be card-relative (CSS vars with
// viewport fallbacks) and durations scaled to preserve px/s speeds.
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const style = { _props: {}, setProperty(k, v) { this._props[k] = v; } };
    const el = {
        tagName: tag.toUpperCase(), style, children: [], attributes: {}, _html: '', _text: '',
        parentNode: null, parentElement: null, isConnected: true, offsetWidth: 400, offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {}, getAttribute() { return null; },
        appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        get firstChild() { return this.children[0] || null; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {}, remove() {},
        getBoundingClientRect() { return { width: this.offsetWidth, height: this.offsetHeight }; },
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
const resizeObservers = [];
global.ResizeObserver = class { constructor(cb) { this.cb = cb; resizeObservers.push(this); } observe(t) { this.target = t; } disconnect() {} };
global.IntersectionObserver = class { constructor() {} observe() {} disconnect() {} };

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assert = (label, cond) => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};

const card = new MeteoCard();
card._renderAll = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'foreground'] });

// --- Keyframes are card-relative with viewport fallbacks ---
card._injectKeyframesForCondition('snowy', false);
let kf = card._keyframesSheet.textContent;
card._loadedKeyframes = null;
card._injectKeyframesForCondition('rainy', false);
kf += card._keyframesSheet.textContent;
assert('to-right travels var(--meteo-w, 100vw)', kf.includes('translateX(calc(var(--meteo-w, 100vw) + 500px))'));
assert('rain-fall travels var(--meteo-h, 100vh)', kf.includes('translateY(calc(var(--meteo-h, 100vh) * 1.1))'));
assert('snow-fall travels var(--meteo-h, 100vh)', /snow-fall[\s\S]*?var\(--meteo-h, 100vh\) \* 1\.1/.test(kf));
assert('no bare 110vh / 100vw travel left', !kf.includes('110vh') && !kf.includes('translateX(calc(100vw'));

// --- Durations scaled by the card/viewport ratio ---
const css = { content: '', shared: new Set() };
card._clouds('normal', css, false, 25, 1.0);
card._rain(5, css);
card._snow(5, css);
assert('cloud duration scaled by --meteo-wr', /animation:to-right calc\([\d.]+s \* var\(--meteo-wr, 1\)\)/.test(css.content));
assert('rain duration scaled by --meteo-hr', css.content.includes('animation:rain-fall calc(0.6s * var(--meteo-hr, 1))'));
assert('snow duration scaled by --meteo-hr', css.content.includes('animation:snow-fall calc(var(--dur) * var(--meteo-hr, 1))'));

// --- _updateSizeVars publishes the right values ---
card._cardWidth = 400;
card._cardHeight = 300;
card._updateSizeVars();
const props = card.content.style._props;
assert('--meteo-w = 400px', props['--meteo-w'] === '400px');
assert('--meteo-h = 300px', props['--meteo-h'] === '300px');
assert('--meteo-wr = 400/1600 = 0.250', props['--meteo-wr'] === '0.250');
assert('--meteo-hr = 300/800 = 0.375', props['--meteo-hr'] === '0.375');

// --- Resize path refreshes the vars ---
card.connectedCallback();
const cardRO = resizeObservers.find(ro => ro.target === card);
card.content.offsetWidth = 800;
card.content.offsetHeight = 400;
if (cardRO) cardRO.cb();
assert('resize updates --meteo-w', props['--meteo-w'] === '800px');
assert('resize updates --meteo-hr (400/800 = 0.500)', props['--meteo-hr'] === '0.500');

// --- Zero dimensions keep fallbacks (no vars published) ---
const card2 = new MeteoCard();
card2._renderAll = () => {};
card2.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });
card2._cardWidth = 0;
card2._cardHeight = 0;
card2._updateSizeVars();
assert('no vars published before first layout', card2.content.style._props['--meteo-w'] === undefined);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
