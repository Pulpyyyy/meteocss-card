// Test for fix #5: _weatherMatrix must map all official HA weather states
// sensibly (hail, snowy-rainy, windy-variant) and not force the night sky
// for a plain 'clear' during the day.
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
const wm = MeteoCard.prototype._weatherMatrix;

let failures = 0;
const check = (input, isNight, expected) => {
    const got = wm.call({}, input, isNight);
    const ok = got === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} '${input}'${isNight ? ' (night)' : ''} -> ${got}${ok ? '' : ' expected ' + expected}`);
};

// Official HA weather states.
check('lightning', false, 'lightning-rainy');
check('lightning-rainy', false, 'lightning-rainy');
check('hail', false, 'pouring');            // was 'sunny'
check('pouring', false, 'pouring');
check('rainy', false, 'rainy');
check('snowy', false, 'snowy');
check('snowy-rainy', false, 'snowy');       // was 'rainy' (rain checked first)
check('partlycloudy', false, 'partlycloudy');
check('cloudy', false, 'cloudy');
check('fog', false, 'fog');
check('clear-night', true, 'clear-night');
check('clear-night', false, 'clear-night'); // explicit night string wins
check('sunny', false, 'sunny');
check('windy', false, 'sunny');             // no wind-only visual; wind drives clouds
check('windy-variant', false, 'partlycloudy'); // was 'sunny'
check('exceptional', false, 'sunny');

// Custom integrations reporting plain 'clear'.
check('clear', false, 'sunny');             // was 'clear-night' at noon
check('clear', true, 'clear-night');
check('clear sky', false, 'sunny');
check('clear sky', true, 'clear-night');

// Keyword variants.
check('heavy rain', false, 'pouring');
check('broken clouds', false, 'partlycloudy');
check('mist', false, 'fog');
check('thunderstorm', false, 'lightning-rainy');
check(null, false, 'sunny');

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
