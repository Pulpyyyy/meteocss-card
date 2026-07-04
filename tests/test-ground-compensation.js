// Ground compensation tests: the ML depth map (camera proximity) is turned
// into height above ground by subtracting the estimated ground ramp — flat
// ground drops to ~0 (no self-shadowing), standing objects keep a height
// growing toward their top, transparency is preserved, and the horizon
// option constrains the estimation.
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
const assert = (label, cond, detail = '') => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${cond ? '' : ' — ' + detail}`);
};

const card = new MeteoCard();
card._renderAll = () => {};
card._updateDemoUI = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });

// --- Synthetic scene: 20x100, inverse depth (bright = near camera) ---
// Rows 0-9: sky (transparent). Rows 10-39: far field, value 10.
// Rows 40-99: ground ramp from 40 (horizon) to 200 (bottom).
// Columns 5-7, rows 30-99: a vertical wall at constant depth 200.
const W = 20, H = 100;
const groundAt = (y) => Math.round(40 + (y - 40) * (200 - 40) / (99 - 40));
const buildScene = () => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            let v = 0, a = 255;
            if (y < 10) { v = 123; a = 0; }            // erased sky
            else if (y < 40) v = 10;                    // far field
            else v = groundAt(y);                       // ground ramp
            if (x >= 5 && x <= 7 && y >= 30) v = 200;   // the wall
            px[i] = px[i + 1] = px[i + 2] = v;
            px[i + 3] = a;
        }
    }
    return px;
};
const lum = (px, x, y) => px[(y * W + x) * 4];

// --- Automatic mode (no horizon) ---
{
    const px = buildScene();
    card._applyGroundCompensation(px, W, H, null);

    let groundZero = true;
    for (const y of [50, 70, 90, 99]) {
        if (lum(px, 15, y) > 2) { groundZero = false; break; }
    }
    assert('flat ground flattened to ~0 (no self-shadowing)', groundZero, `got ${lum(px, 15, 70)}`);

    const base = lum(px, 6, 98), mid = lum(px, 6, 60), top = lum(px, 6, 35);
    assert('wall base sits on the ground (~0)', base <= 5, `got ${base}`);
    assert('wall height grows toward its top', top > mid && mid > base, `top=${top} mid=${mid} base=${base}`);
    assert('wall top keeps a strong height', top >= 150, `got ${top}`);

    assert('transparent sky untouched', lum(px, 15, 5) === 123 && px[(5 * W + 15) * 4 + 3] === 0);
    assert('far field reduced by the far ramp', lum(px, 15, 20) <= 10);
}

// --- Horizon option constrains the estimation ---
{
    const pxAuto = buildScene();
    card._applyGroundCompensation(pxAuto, W, H, null);
    const pxHorizon = buildScene();
    card._applyGroundCompensation(pxHorizon, W, H, 0.4);

    // Above the horizon, the ramp keeps the value found AT the horizon (40)
    // instead of chasing the darker far field (10): the wall loses more.
    const wallAuto = lum(pxAuto, 6, 35);
    const wallHorizon = lum(pxHorizon, 6, 35);
    assert('horizon option changes the above-horizon ramp', wallHorizon < wallAuto, `auto=${wallAuto} horizon=${wallHorizon}`);
    assert('ground still ~0 with explicit horizon', lum(pxHorizon, 15, 70) <= 2, `got ${lum(pxHorizon, 15, 70)}`);
}

// --- Quantization noise: jittered ground must flatten to exactly 0 ---
// (palettized depth maps leave ±few-level speckle; residual micro-heights
// freckle the shadow with false occluders at close range)
{
    const px = buildScene();
    for (let y = 45; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (x >= 5 && x <= 7) continue; // keep the wall clean
            const i = (y * W + x) * 4;
            const jitter = ((x * 7 + y * 13) % 7) - 3; // deterministic ±3
            const v = Math.max(0, Math.min(255, px[i] + jitter));
            px[i] = px[i + 1] = px[i + 2] = v;
        }
    }
    card._applyGroundCompensation(px, W, H, null);
    let maxGround = 0;
    for (let y = 50; y < H; y++) {
        for (let x = 10; x < W; x++) {
            maxGround = Math.max(maxGround, lum(px, x, y));
        }
    }
    assert('noisy ground fully squashed to 0 (no shadow freckles)', maxGround === 0, `max residual ${maxGround}`);
    assert('wall still tall despite the noise floor', lum(px, 6, 35) >= 150, `got ${lum(px, 6, 35)}`);
}

// --- Partial strength: doses the subtraction, keeps some ground relief ---
{
    const px = buildScene();
    card._applyGroundCompensation(px, W, H, null, 0.5);
    const g70 = groundAt(70);
    const residual = lum(px, 15, 70);
    assert('50% strength leaves ~half the ground ramp',
        Math.abs(residual - g70 / 2) <= 3, `ground=${g70} residual=${residual}`);
    const wallBase = lum(px, 6, 98);
    assert('wall keeps more height at partial strength',
        Math.abs(wallBase - (200 - groundAt(98) / 2)) <= 3, `got ${wallBase}`);
}

// --- _prepareDepthSource plumbing ---
{
    const img = { width: W, height: H };
    assert('disabled: raw image passed through', card._prepareDepthSource(img, {}) === img);
    assert('disabled explicitly: raw image passed through', card._prepareDepthSource(img, { ground_compensation: false }) === img);

    // Enabled: a canvas is produced and the pixel data goes through compensation.
    const scene = buildScene();
    let putBack = null;
    const fakeCanvas = {
        getContext: () => ({
            drawImage() {},
            getImageData: () => ({ data: scene, width: W, height: H }),
            putImageData: (imageData) => { putBack = imageData.data; },
        }),
    };
    const origCreate = global.document.createElement;
    global.document.createElement = (tag) => (tag === 'canvas' ? fakeCanvas : origCreate(tag));
    const result = card._prepareDepthSource(img, { ground_compensation: true });
    global.document.createElement = origCreate;
    assert('enabled: returns the working canvas', result === fakeCanvas);
    assert('enabled: compensated data written back', putBack === scene && lum(scene, 15, 70) <= 2);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
