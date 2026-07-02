// Test for perf fix #6: puff-drift and snow-sway must animate transform,
// not margin-left, and snow must split fall/sway across two elements.
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(), style: {}, children: [], attributes: {},
        _html: '', _text: '', parentNode: null, parentElement: null, isConnected: true,
        offsetWidth: 400, offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k]; },
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
global.document = {
    createElement: (t) => makeEl(t),
    createElementNS: (_n, t) => makeEl(t),
    createDocumentFragment: () => makeEl('#fragment'),
};
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() { this.shadowRoot = Object.assign(makeEl('#shadow-root'), { adoptedStyleSheets: [] }); return this.shadowRoot; }
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

const card = new MeteoCard();
card._renderAll = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky', 'foreground'] });
card._renderAll = MeteoCard.prototype._renderAll.bind(card); // restore for keyframes path

// --- Keyframes ---
card._injectKeyframesForCondition('snowy', false);
const kf = card._keyframesSheet.textContent;
assert('keyframes contain puff-drift with translateX', /puff-drift[^}]*translateX/.test(kf));
assert('keyframes contain snow-sway with translateX', /snow-sway[\s\S]*?translateX/.test(kf));
assert('no margin-left left in keyframes', !kf.includes('margin-left'));
assert('snow-fall still uses translateY', /snow-fall[\s\S]*?translateY/.test(kf));

// --- Snow markup: wrapper + inner flake ---
const cssSnow = { content: '', shared: new Set() };
const snowHtml = card._snow(3, cssSnow);
assert('snow wrapper has fall animation only', /-snow\{[^}]*animation:snow-fall[^}]*\}/.test(cssSnow.content));
assert('snow wrapper has no sway/background', !/-snow\{[^}]*(snow-sway|background)[^}]*\}/.test(cssSnow.content));
assert('inner flake carries sway animation', /-snow-flake\{[^}]*animation:snow-sway[^}]*\}/.test(cssSnow.content));
assert('inner flake carries visuals (bg/opacity/blur)', /-snow-flake\{[^}]*background:#FFFFFF[^}]*opacity:var\(--op\)[^}]*blur\(1px\)[^}]*\}/.test(cssSnow.content));
assert('markup nests flake inside wrapper', /<div class="[^"]*-snow" [^>]*><div class="[^"]*-snow-flake"><\/div><\/div>/.test(snowHtml));
assert('3 flakes generated', (snowHtml.match(/-snow-flake/g) || []).length === 3);

// --- Cloud puffs ---
const cssClouds = { content: '', shared: new Set() };
const { html: cloudHtml, count } = card._clouds('normal', cssClouds, false, 25, 1.0);
assert('clouds generated', count > 0 && cloudHtml.includes('puff-drift'));
assert('no margin-left in cloud css', !cssClouds.content.includes('margin-left') && !cloudHtml.includes('margin-left'));

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
