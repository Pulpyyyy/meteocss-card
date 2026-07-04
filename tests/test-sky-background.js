// Sky background + moon geometry tests: gradient selection windows
// (day/night/sunrise/sunset, custom limits, custom colors — the v1.2.0 forum
// bug) and the moon phase -> SVG parameters mapping.
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
const assert = (label, cond) => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};
const assertClose = (label, actual, expected, eps = 1e-6) => {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) < eps;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}${ok ? '' : ' expected ~' + expected}`);
};

const mkCard = (config = {}) => {
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'], ...config });
    return card;
};

const sun = (elevation) => ({ left: 60, top: 30, elevation, azimuth: 180 });
const moonPos = { left: 10, top: 80, elevation: 30, azimuth: 0 };

// --- Gradient selection windows ---
{
    const card = mkCard();
    const cond = card._meteoConfig.get('conditions.sunny');
    const bg = (s, isNight, rising) => card._computeSkyBackground(s, moonPos, isNight, rising, cond);

    const day = bg(sun(45), false, false);
    assert('day: gradient centered on the sun', day.includes('circle at 60% 30%'));
    assert('day: day.normal colors used', day.includes('#FFFFFF 0%'));

    const night = bg(sun(-20), true, false);
    assert('night: gradient centered on the moon', night.includes('circle at 10% 80%'));
    assert('night: night.clear colors used (sunny -> clear)', night.includes('#25259C'));

    const sunrise = bg(sun(3), false, true);
    assert('sunrise window: sunrise colors', sunrise.includes('#FFF5C3'));

    const sunset = bg(sun(3), false, false);
    assert('sunset window: sunset colors', sunset.includes('#ECFF00'));

    const outside = bg(sun(10), false, true);
    assert('above the window: back to day colors', outside.includes('#FFFFFF 0%'));
}

// --- Custom sunrise color reaches the gradient (forum bug, fixed v1.2.0) ---
{
    const card = mkCard({ colors: { sunrise: '#FFFFFF00 0%, #000000 100%' } });
    const cond = card._meteoConfig.get('conditions.sunny');
    const bg = card._computeSkyBackground(sun(3), moonPos, false, true, cond);
    assert('custom sunrise color applied', bg.includes('#FFFFFF00'));
}

// --- Custom sunrise limits widen the window (feature v2.0.0) ---
{
    const card = mkCard({ sun: { sunrise_limits: [0, 10] } });
    const cond = card._meteoConfig.get('conditions.sunny');
    const at8 = card._computeSkyBackground(sun(8), moonPos, false, true, cond);
    assert('elevation 8 inside custom [0,10] window', at8.includes('#FFF5C3'));
    const at12 = card._computeSkyBackground(sun(12), moonPos, false, true, cond);
    assert('elevation 12 outside custom window', at12.includes('#FFFFFF 0%'));
}

// --- Moon phase -> SVG parameters ---
{
    const card = mkCard();
    const haloOpacity = (svg) => parseFloat((svg.match(/r="35" fill="#FFFFFF" opacity="([^"]+)"/) || [])[1]);

    assertClose('full moon at night: halo 0.2', haloOpacity(card._moonSVG('Full Moon', false, 0)), 0.2);
    assertClose('full moon in daylight: halo dimmed x0.4', haloOpacity(card._moonSVG('Full Moon', true, 0)), 0.08);
    assertClose('gibbous at night: halo 0.2 x 0.78', haloOpacity(card._moonSVG('Waxing Gibbous', false, 0)), 0.156);
    assertClose('new moon: no halo', haloOpacity(card._moonSVG('New Moon', false, 0)), 0);

    const waxing = (card._moonSVG('Waxing Crescent', false, 0).match(/<path d="([^"]+)"/) || [])[1];
    const waning = (card._moonSVG('Waning Crescent', false, 0).match(/<path d="([^"]+)"/) || [])[1];
    assert('waxing and waning crescents mirror each other', !!waxing && !!waning && waxing !== waning);

    const day = card._moonSVG('Full Moon', true, 0);
    assert('daylight moon group at 40% opacity', day.includes('style="opacity:0.4;"'));
    const rotated = card._moonSVG('Full Moon', false, 42);
    assert('phase rotation applied to the mask', rotated.includes('rotate(42)'));
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
