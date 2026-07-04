// Shadow shader construction tests: both quality tiers generated from one
// template (no fragile String.replace), pow() baked out at the default
// depth_exp, config-driven depth/relight uniforms, and the physical
// tan(elevation) occlusion slope.
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
global.Image = class { set src(_v) { /* never loads in this test */ } };

const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assert = (label, cond) => {
    if (!cond) failures++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};
const assertClose = (label, actual, expected, eps = 0.001) => {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) < eps;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}${ok ? '' : ' expected ~' + expected}`);
};

// GL stub recording compiled shader sources and named uniform writes.
const makeGlEnv = () => {
    const sources = [];
    const uniforms = {};
    const gl = {
        VERTEX_SHADER: 'v', FRAGMENT_SHADER: 'f', COLOR_BUFFER_BIT: 1,
        ARRAY_BUFFER: 1, STATIC_DRAW: 1, FLOAT: 1, TEXTURE0: 1, TEXTURE_2D: 1,
        TEXTURE_WRAP_S: 1, TEXTURE_WRAP_T: 1, TEXTURE_MIN_FILTER: 1, TEXTURE_MAG_FILTER: 1,
        CLAMP_TO_EDGE: 1, NEAREST: 1, RGBA: 1, UNSIGNED_BYTE: 1, BLEND: 1,
        SRC_ALPHA: 1, ONE_MINUS_SRC_ALPHA: 1, TRIANGLE_STRIP: 1,
        createShader: () => ({}),
        shaderSource: (_sh, src) => sources.push(src),
        compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => '',
        createProgram: () => ({}), attachShader() {}, bindAttribLocation() {},
        linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => '',
        createBuffer: () => ({}), bindBuffer() {}, bufferData() {},
        vertexAttribPointer() {}, enableVertexAttribArray() {},
        createTexture: () => ({}), activeTexture() {}, bindTexture() {}, texParameteri() {}, texImage2D() {},
        getUniformLocation: (_p, name) => ({ name }),
        uniform1i(loc, v) { if (loc) uniforms[loc.name] = v; },
        uniform1f(loc, v) { if (loc) uniforms[loc.name] = v; },
        uniform2f(loc, a, b) { if (loc) uniforms[loc.name] = [a, b]; },
        uniform3f(loc, a, b, c) { if (loc) uniforms[loc.name] = [a, b, c]; },
        enable() {}, blendFunc() {}, clearColor() {}, clear() {}, drawArrays() {},
        useProgram() {}, viewport() {}, getExtension: () => null,
    };
    const canvas = Object.assign(makeEl('canvas'), { getContext: () => gl });
    canvas.parentElement = makeEl('div');
    return { gl, canvas, sources, uniforms };
};

const mkCard = (shadowCfg) => {
    const card = new MeteoCard();
    card._renderAll = () => {};
    card._updateDemoUI = () => {};
    card.setConfig({
        weather: 'weather.home', sun_entity: 'sun.sun',
        layers: ['sky', 'shadow'], shadow: { depthmap: '/local/depth.png', ...shadowCfg },
    });
    const env = makeGlEnv();
    card._domCache.shadowCanvas = env.canvas;
    card._initShadowEngine();
    return { card, ...env };
};

// --- Default config: template consistency + pow baked out ---
{
    const { sources } = mkCard({});
    const frags = sources.filter(s => s.includes('gl_FragColor'));
    assert('two fragment shaders compiled', frags.length === 2);
    const demo = frags.find(s => s.includes('samples = 8.0'));
    const normal = frags.find(s => s.includes('samples = 32.0'));
    assert('demo tier: 8 directions x 16 steps', !!demo && demo.includes('j < 16.0'));
    assert('normal tier: 32 directions x 30 steps', !!normal && normal.includes('j < 30.0'));
    assert('demo angle step = 2pi/8', demo.includes('0.7854'));
    assert('normal angle step = 2pi/32', normal.includes('0.1963'));
    // The real template guarantee: the tiers differ ONLY by their constants.
    const normalized = normal
        .replace(/32\.0/g, '8.0').replace(/30\.0/g, '16.0').replace('0.1963', '0.7854');
    assert('tiers are the same template modulo constants', normalized === demo);
    assert('pow() baked out at default depth_exp', !demo.includes('pow(') && !normal.includes('pow('));
    assert('occlusion slope is a uniform', demo.includes('dist * uSlope'));
}

// --- depth_exp != 1 re-enables pow in the generated source ---
{
    const { sources } = mkCard({ depth_exp: 2.2 });
    const frag = sources.find(s => s.includes('gl_FragColor'));
    assert('custom depth_exp compiles pow()', frag.includes('pow(max(h, 1e-6), uDepthExp)'));
}

// --- Config-driven uniforms + tan(elevation) slope ---
{
    const { card, uniforms } = mkCard({ depth_exp: 2.2, depth_gain: 2.0, normal_strength: 0.8, bias: 0.004 });
    card._shadowReady = true; // image never loads in the stub; force readiness
    const shared = card._sharedState;
    shared.demoState = 'stopped';
    shared.isNight = false;
    shared.sunPos = { left: 70, top: 30, elevation: 30, azimuth: 180 };
    shared.moonPos = { left: 20, top: 70, elevation: -10, azimuth: 0 };
    card._updateShadow();

    assertClose('uDepthExp from config', uniforms.uDepthExp, 2.2);
    assertClose('uDepthGain from config', uniforms.uDepthGain, 2.0);
    assertClose('uNormalStrength from config', uniforms.uNormalStrength, 0.8);
    assertClose('uBias from config', uniforms.uBias, 0.004);
    // elevation 30: len = (90-30)/60 = 1 -> slope = tan(30) = 0.5774
    assertClose('slope = len * tan(elev) at 30 deg', uniforms.uSlope, Math.tan(30 * Math.PI / 180));

    // Low sun: len = 4/3, tan(10 deg) -> flatter climb, longer shadows.
    shared.sunPos = { left: 90, top: 60, elevation: 10, azimuth: 250 };
    card._updateShadow();
    assertClose('slope at 10 deg (low sun, long shadows)', uniforms.uSlope, (80 / 60) * Math.tan(10 * Math.PI / 180));

    // High sun: steep climb, short shadows.
    shared.sunPos = { left: 50, top: 12, elevation: 80, azimuth: 180 };
    card._updateShadow();
    assertClose('slope at 80 deg (high sun, short shadows)', uniforms.uSlope, (10 / 60) * Math.tan(80 * Math.PI / 180));
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
