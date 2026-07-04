// Coordinate projection tests: orbit geometry (rx/ry/cx/cy/tilt), the
// house_angle rotation, invert_azimuth, fixed positioning via rx=ry=0
// (forum feature v1.0.6) and clamping to the card bounds.
// The calculator is module-private; it is reached through DemoEngine.
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
const assertClose = (label, actual, expected, eps = 0.001) => {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) < eps;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}${ok ? '' : ' expected ~' + expected}`);
};

// getCoords is reached through the DemoEngine of a demo-master card, whose
// config carries the orbit / house_angle / invert_azimuth under test.
const coordsWith = (config) => {
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({
        weather: 'weather.home', sun_entity: 'sun.sun',
        layers: ['sky', `demo_mode-coords-${Math.floor(Math.random() * 1e9)}`],
        house_angle: 0, ...config,
    });
    return (az, el) => card._demoEngine._getCoords(az, el);
};

// --- Base ellipse, no rotation ---
{
    const coords = coordsWith({ orbit: { rx: 45, ry: 40, cx: 50, cy: 50, tilt: 0 } });
    let p = coords(0, 10);   // north
    assertClose('az 0: centered horizontally', p.left, 50);
    assertClose('az 0: top of the ellipse', p.top, 10);
    p = coords(90, 10);      // east
    assertClose('az 90: right edge', p.left, 95);
    assertClose('az 90: vertically centered', p.top, 50);
    p = coords(180, 10);     // south
    assertClose('az 180: bottom of the ellipse', p.top, 90);
    assertClose('elevation passes through', p.elevation, 10);
}

// --- house_angle rotates the scene ---
{
    const coords = coordsWith({ house_angle: 90, orbit: { rx: 45, ry: 40, cx: 50, cy: 50, tilt: 0 } });
    const p = coords(90, 10); // east now points to the top of the card
    assertClose('house_angle 90: az 90 lands at the top', p.top, 10);
    assertClose('house_angle 90: az 90 centered horizontally', p.left, 50);
}

// --- invert_azimuth adds 180° ---
{
    const coords = coordsWith({ invert_azimuth: true, orbit: { rx: 45, ry: 40, cx: 50, cy: 50, tilt: 0 } });
    const p = coords(0, 10); // north behaves like south
    assertClose('inverted az 0 lands at the bottom', p.top, 90);
}

// --- tilt rotates the ellipse itself ---
{
    const coords = coordsWith({ orbit: { rx: 45, ry: 40, cx: 50, cy: 50, tilt: 90 } });
    const p = coords(0, 10); // the ellipse top swings to the right
    assertClose('tilt 90: top point swings right', p.left, 90);
    assertClose('tilt 90: vertically centered', p.top, 50);
}

// --- Fixed positioning: rx = ry = 0 pins the body at cx/cy (v1.0.6) ---
{
    const coords = coordsWith({ orbit: { rx: 0, ry: 0, cx: 30, cy: 20, tilt: 0 } });
    for (const az of [0, 90, 200, 330]) {
        const p = coords(az, 10);
        assertClose(`fixed position ignores azimuth ${az} (left)`, p.left, 30);
        assertClose(`fixed position ignores azimuth ${az} (top)`, p.top, 20);
    }
}

// --- Clamping: the projection never leaves the card ---
{
    const coords = coordsWith({ orbit: { rx: 80, ry: 80, cx: 50, cy: 50, tilt: 0 } });
    const east = coords(90, 10);
    assertClose('overshoot clamped to 100', east.left, 100);
    const north = coords(0, 10);
    assertClose('undershoot clamped to 0', north.top, 0);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
