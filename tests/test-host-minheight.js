// Test: the :host styles must declare a min-height so the card stays visible
// in the Lovelace editor preview pane, which gives the card no height
// (height:100% collapsed to 0px and the preview looked blank).
'use strict';
const fs = require('fs');

function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(), style: { setProperty(k, v) { this[k] = v; } },
        children: [], attributes: {}, _html: '', _text: '',
        parentNode: null, parentElement: null, isConnected: true, offsetWidth: 400, offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; },
        appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        get firstChild() { return this.children[0] || null; },
        querySelector(sel) {
            // Only what _injectStyles needs: lookup of the injected style tag.
            const match = (node) => node.tagName === 'STYLE' && node.attributes['data-meteo-injected'];
            const walk = (node) => {
                for (const c of node.children || []) {
                    if (match(c)) return c;
                    const found = walk(c);
                    if (found) return found;
                }
                return null;
            };
            return sel === 'style[data-meteo-injected]' ? walk(this) : null;
        },
        querySelectorAll() { return []; },
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

// CSSStyleSheet is undefined in this environment, so _injectStyles takes the
// <style> fallback path — the same CSS text as the adopted-stylesheet path.
const card = new MeteoCard();
card._renderAll = () => {};
card.setConfig({ weather: 'weather.home', sun_entity: 'sun.sun', layers: ['sky'] });

const injected = card.shadowRoot.querySelector('style[data-meteo-injected]');
assert('styles injected into the shadow root', !!injected);
const hostRule = (injected?.textContent.match(/:host\s*\{[^}]*\}/) || [''])[0];
assert(':host declares min-height (visible in zero-height preview pane)', /min-height:\s*\d+px/.test(hostRule));
assert(':host keeps height:100% for normal layouts', /[^-]height:\s*100%/.test(hostRule));

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
