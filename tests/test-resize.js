// Regression test for bug #3: sun/moon %→px positioning must follow card resizes.
'use strict';
const fs = require('fs');

// ---------- Minimal DOM stubs ----------
function makeEl(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(),
        style: { setProperty(k, v) { this[k] = v; } },
        children: [],
        attributes: {},
        _html: '',
        _text: '',
        parentNode: null,
        parentElement: null,
        isConnected: true,
        offsetWidth: 400,
        offsetHeight: 300,
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k]; },
        appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
        get firstChild() { return this.children[0] || null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        remove() {},
        getBoundingClientRect() { return { width: this.offsetWidth, height: this.offsetHeight }; },
    };
    Object.defineProperty(el, 'innerHTML', {
        get() { return this._html; },
        set(v) { this._html = String(v); this.children = []; },
    });
    Object.defineProperty(el, 'textContent', {
        get() { return this._text; },
        set(v) { this._text = String(v); },
    });
    return el;
}

const definedElements = {};
global.customElements = {
    get: (name) => definedElements[name],
    define: (name, cls) => { definedElements[name] = cls; },
};
global.window = { customCards: [], addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
global.document = {
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    createDocumentFragment: () => makeEl('#fragment'),
};
global.HTMLElement = class {
    constructor() { this.style = {}; this.isConnected = true; }
    attachShadow() {
        this.shadowRoot = Object.assign(makeEl('#shadow-root'), { adoptedStyleSheets: [] });
        return this.shadowRoot;
    }
};
const rafQueue = [];
global.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
global.cancelAnimationFrame = () => {};
global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
};
const resizeObservers = [];
global.ResizeObserver = class {
    constructor(cb) { this.cb = cb; resizeObservers.push(this); }
    observe(t) { this.target = t; }
    disconnect() { this.disconnected = true; }
};

// ---------- Load the card ----------
const code = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'dist', 'meteocss-card.js'), 'utf8');
new Function(code)();
const MeteoCard = definedElements['meteo-card'];

let failures = 0;
const assert = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ' expected ' + JSON.stringify(expected)}`);
};

const card = new MeteoCard();
card._renderAll = () => {};
card._updateDynamic = () => {};
card._updateDemoUI = () => {};

card.setConfig({
    weather: 'weather.home',
    sun_entity: 'sun.sun',
    layers: ['sky', 'sun', 'moon'],
});
card.connectedCallback();

const cardRO = resizeObservers.find(ro => ro.target === card);
assert('card-level ResizeObserver attached', !!cardRO, true);

if (cardRO) {
    // Plant fake sun/moon wrappers as the DOM cache would after a render.
    const fakeParent = makeEl('div');
    const sunWrapper = makeEl('div');
    const moonWrapper = makeEl('div');
    fakeParent.appendChild(sunWrapper);
    fakeParent.appendChild(moonWrapper);
    card._domCache.sunWrapper = sunWrapper;
    card._domCache.moonContainer = moonWrapper;

    // Baseline: 400x300 card, sun at 50%/50%, elevation 45.
    card._cardWidth = 400;
    card._cardHeight = 300;
    card._sharedState.actualState = {
        condition: 'sunny',
        isNight: false,
        sunPos: { left: 50, top: 50, elevation: 45, azimuth: 180 },
        moonPos: { left: 25, top: 75, elevation: -10, azimuth: 0 },
    };

    // Resize the card to 800x600 and fire the observer.
    card.content.offsetWidth = 800;
    card.content.offsetHeight = 600;
    cardRO.cb();

    assert('cached width updated', card._cardWidth, 800);
    assert('cached height updated', card._cardHeight, 600);
    // x = 50% * 800 - 450 = -50 ; y = 50% * 600 - 450 = -150
    assert('sun repositioned with new dimensions', sunWrapper.style.transform, 'translate(-50.0px, -150.0px)');
    assert('transition suspended during snap', sunWrapper.style.transition, 'none');
    rafQueue.splice(0).forEach(fn => fn());
    assert('transition restored after snap', sunWrapper.style.transition, '');
    // Moon below horizon stays hidden but still tracks position.
    assert('moon hidden (below horizon)', moonWrapper.style.display, 'none');

    // No-op when dimensions are unchanged.
    sunWrapper.style.transform = 'SENTINEL';
    cardRO.cb();
    assert('no reposition when size unchanged', sunWrapper.style.transform, 'SENTINEL');
}

// Disconnect cleanup.
card.disconnectedCallback();
assert('observer disconnected on disconnect', cardRO ? cardRO.disconnected : false, true);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
