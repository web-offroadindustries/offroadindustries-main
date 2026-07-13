# Core Web Vitals Staging Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve homepage mobile and desktop Core Web Vitals while preserving client-requested slideshow autoplay after the visitor's first meaningful interaction.

**Architecture:** Add an opt-in interaction gate to the existing slideshow component and enable it only on the homepage. Remove time-based fallbacks from the theme-owned GTM and Podium loaders, reserve measured space for the vehicle finder, and narrow Bold's early resource hints without changing generated integration snippets.

**Tech Stack:** Shopify Liquid, JSON templates, plain JavaScript custom elements, Node.js built-in test runner, Playwright, Shopify CLI, Lighthouse 13.

## Global Constraints

- Work only on `optimizing/core-web-vitals-staging`, based on `origin/main` commit `6c90d47`.
- Do not change or promote `main`.
- Keep homepage slideshow arrows and dots immediately usable.
- Keep slideshow autoplay at five seconds, starting only after the first meaningful interaction.
- Keep the video deferred until its slide becomes active.
- GTM and Podium must load only after interaction and at most once.
- Do not rewrite scripts injected through Shopify's `content_for_header` or app embeds.
- Keep generated Bold and Shop Circle snippets unchanged.
- Do not modify `config/settings_data.json`.
- Preserve the user's untracked `AGENTS.md` and `full_page.html`.
- Use test-first development and keep each production change paired with a failing regression test.

---

## File Responsibility Map

- `sections/slideshow.liquid`: converts merchant autoplay settings into immediate or interaction-deferred Flickity configuration and exposes the new opt-in setting.
- `assets/slideshow-component.js`: observes the first meaningful interaction and starts the already-configured autoplay timer without advancing immediately.
- `templates/index.json`: enables deferred autoplay on the homepage and reserves measured vehicle-finder space.
- `layout/theme.liquid`: owns GTM/Podium interaction loaders and product-only Bold resource hints.
- `tests/core-web-vitals-contract.test.cjs`: validates Liquid schema and homepage configuration contracts.
- `tests/fixtures/slideshow-interaction.html`: isolates the real slideshow JavaScript behind a small Flickity test double.
- `tests/core-web-vitals.spec.js`: verifies autoplay timing, deferred video activation, and reduced-motion behavior in Chromium.
- `tests/core-web-vitals-playwright.config.js`: serves the repository fixture for the focused browser suite.
- `tests/core-web-vitals-inline-loaders.test.cjs`: executes the real inline GTM/Podium scripts inside a deterministic fake browser environment.
- `tests/core-web-vitals-template.test.cjs`: verifies vehicle-finder reservation and product-only Bold hints.
- `tests/core-web-vitals-staging.spec.js`: verifies resource timing and behavior against a Shopify staging preview.
- `tests/core-web-vitals-staging.config.js`: supplies mobile and desktop staging projects.

---

### Task 1: Defer Homepage Slideshow Autoplay Until Interaction

**Files:**
- Create: `tests/core-web-vitals-contract.test.cjs`
- Create: `tests/fixtures/slideshow-interaction.html`
- Create: `tests/core-web-vitals.spec.js`
- Create: `tests/core-web-vitals-playwright.config.js`
- Modify: `sections/slideshow.liquid:41-44,105-114,462-477`
- Modify: `assets/slideshow-component.js:3-63,87-95,193-205`
- Modify: `templates/index.json:203-219`

**Interfaces:**
- Consumes: existing `section.settings.autoplay`, `section.settings.autorotate_speed`, Flickity `options.autoPlay`, `playPlayer()`, and `stopPlayer()`.
- Produces: `section.settings.defer_autoplay_until_interaction`, `data-autoplay-after-interaction`, and private slideshow methods `_watchForAutoplayInteraction()`, `_handleAutoplayInteraction()`, `_startDeferredAutoplay()`, and `_removeAutoplayInteractionListeners()`.

- [ ] **Step 1: Write the failing static contract test**

Create `tests/core-web-vitals-contract.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseShopifyJson(relativePath) {
  return JSON.parse(read(relativePath).replace(/^\/\*[\s\S]*?\*\//, '').trim());
}

function readSectionSchema(relativePath) {
  const source = read(relativePath);
  const match = source.match(/{% schema %}([\s\S]*?){% endschema %}/);
  assert.ok(match, `${relativePath} contains a schema block`);
  return JSON.parse(match[1]);
}

test('homepage keeps five-second autoplay but defers its start until interaction', () => {
  const schema = readSectionSchema('sections/slideshow.liquid');
  const deferSetting = schema.settings.find(
    (setting) => setting.id === 'defer_autoplay_until_interaction',
  );

  assert.deepEqual(deferSetting, {
    type: 'checkbox',
    id: 'defer_autoplay_until_interaction',
    label: 'Start autoplay after first visitor interaction',
    default: false,
    visible_if: '{{ section.settings.autoplay == true }}',
  });

  const home = parseShopifyJson('templates/index.json');
  const hero = home.sections['1653903038c126b831'];
  assert.equal(hero.type, 'slideshow');
  assert.equal(hero.settings.autoplay, true);
  assert.equal(hero.settings.autorotate_speed, 5);
  assert.equal(hero.settings.defer_autoplay_until_interaction, true);

  const liquid = read('sections/slideshow.liquid');
  assert.match(liquid, /data-autoplay-after-interaction="{{ autoplay_after_interaction }}"/);

  const javascript = read('assets/slideshow-component.js');
  assert.match(javascript, /_watchForAutoplayInteraction\(\)/);
  assert.match(javascript, /_startDeferredAutoplay\(\)/);
});

test('slideshow keeps only the initially visible image eager and high priority', () => {
  const liquid = read('sections/slideshow.liquid');
  assert.match(liquid, /assign loading = 'lazy'/);
  assert.match(liquid, /assign fetchpriority = 'low'/);
  assert.match(liquid, /if is_hero_slide[\s\S]*assign loading = 'eager'[\s\S]*assign fetchpriority = 'high'/);
  assert.match(liquid, /<deferred-media[\s\S]*<template>[\s\S]*<video/);
});
```

- [ ] **Step 2: Write the failing browser fixture and tests**

Create `tests/fixtures/slideshow-interaction.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Slideshow interaction fixture</title>
  </head>
  <body>
    <slideshow-component
      id="hero"
      data-media-loading
      data-autoplay-after-interaction="200"
    >
      <flickity-component>
        <div class="f-slideshow__slide" data-index="0"><img alt="First slide"></div>
        <div class="f-slideshow__slide" data-index="1">
          <deferred-media>
            <template><video muted playsinline></video></template>
          </deferred-media>
        </div>
      </flickity-component>
      <div class="f-slideshow__content-wrapper" data-text-color="#000"></div>
      <div class="f-slideshow__content-wrapper" data-text-color="#000"></div>
    </slideshow-component>
    <button id="next-slide" type="button">Next slide</button>

    <script>
      window.FoxThemeSettings = { isMobile: false };
      window.queryDomNodes = function queryDomNodes(selectors, context) {
        return Object.fromEntries(
          Object.entries(selectors).map(([key, selector]) => [
            key,
            Array.isArray(selector)
              ? Array.from(context.querySelectorAll(selector[0]))
              : context.querySelector(selector),
          ]),
        );
      };

      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};

      class DeferredMedia extends HTMLElement {
        constructor() {
          super();
          this.loadCount = 0;
        }

        loadContent() {
          this.loadCount += 1;
          const template = this.querySelector('template');
          if (template) {
            this.appendChild(template.content.cloneNode(true));
            template.remove();
          }
        }
      }
      customElements.define('deferred-media', DeferredMedia);

      class FakeSlider {
        constructor(element) {
          this.element = element;
          this.options = { autoPlay: false };
          this.selectedIndex = 0;
          this.selectedElement = element.querySelectorAll('.f-slideshow__slide')[0];
          this.handlers = {};
          this.playCalls = 0;
          this.timer = null;
        }

        on(name, callback) {
          this.handlers[name] = callback;
        }

        playPlayer() {
          this.playCalls += 1;
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.next(), this.options.autoPlay);
        }

        stopPlayer() {
          clearTimeout(this.timer);
        }

        next() {
          const slides = this.element.querySelectorAll('.f-slideshow__slide');
          this.selectedIndex = (this.selectedIndex + 1) % slides.length;
          this.selectedElement = slides[this.selectedIndex];
          if (this.handlers.change) this.handlers.change(this.selectedIndex);
        }
      }

      class FakeFlickity extends HTMLElement {
        connectedCallback() {
          if (new URLSearchParams(window.location.search).get('missing') === '1') {
            this.slider = { instance: null };
            return;
          }
          this.slider = { instance: new FakeSlider(this) };
        }
      }
      customElements.define('flickity-component', FakeFlickity);

      document.querySelector('#next-slide').addEventListener('click', () => {
        document.querySelector('flickity-component').slider.instance.next();
      });
    </script>
    <script src="../../assets/slideshow-component.js"></script>
  </body>
</html>
```

Create `tests/core-web-vitals.spec.js`:

```js
const { test, expect } = require('@playwright/test');

const FIXTURE_URL = 'http://127.0.0.1:4173/tests/fixtures/slideshow-interaction.html';

async function sliderState(page) {
  return page.locator('#hero').evaluate((hero) => {
    const deferredMedia = hero.querySelector('deferred-media');
    const slider = hero.querySelector('flickity-component').slider.instance;
    return {
      autoPlay: slider.options.autoPlay,
      selectedIndex: slider.selectedIndex,
      playCalls: slider.playCalls,
      videoLoads: deferredMedia.loadCount,
    };
  });
}

test('first interaction starts autoplay without immediately skipping the current slide', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await page.waitForTimeout(260);
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    playCalls: 0,
    videoLoads: 0,
  });

  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 200,
    selectedIndex: 0,
    playCalls: 1,
    videoLoads: 0,
  });

  await page.waitForTimeout(240);
  await expect.poll(() => sliderState(page)).toMatchObject({
    selectedIndex: 1,
    videoLoads: 1,
  });
});

test('manual navigation works immediately and activates deferred video', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole('button', { name: 'Next slide' }).click();

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 200,
    selectedIndex: 1,
    videoLoads: 1,
  });
});

test('reduced motion keeps autoplay off while leaving the slider initialized', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(FIXTURE_URL);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')));
  await page.waitForTimeout(260);

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    playCalls: 0,
    videoLoads: 0,
  });
});

test('failed Flickity initialization stops polling and reveals fallback content', async ({ page }) => {
  await page.clock.install();
  await page.goto(`${FIXTURE_URL}?missing=1`);
  await page.clock.fastForward(10100);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');
});
```

Create `tests/core-web-vitals-playwright.config.js`:

```js
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: 'core-web-vitals.spec.js',
  timeout: 30000,
  retries: 0,
  reporter: [['list']],
  use: { headless: true },
  webServer: {
    command: 'python -m http.server 4173 --bind 127.0.0.1',
    cwd: path.join(__dirname, '..'),
    url: 'http://127.0.0.1:4173/tests/fixtures/slideshow-interaction.html',
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: Run both tests and verify RED**

Run:

```powershell
node --test tests/core-web-vitals-contract.test.cjs
Set-Location tests
npx playwright test --config=core-web-vitals-playwright.config.js
Set-Location ..
```

Expected: the Node test fails because `defer_autoplay_until_interaction` is absent; the browser tests fail because interaction does not set `autoPlay` to `200` and failed initialization leaves `data-media-loading` in place.

- [ ] **Step 4: Add the Liquid setting and data flow**

Replace the autoplay assignment in `sections/slideshow.liquid` with:

```liquid
assign autoplay = false
assign autoplay_after_interaction = false
if section.settings.autoplay
  assign autoplay = section.settings.autorotate_speed | times: 1000
  if section.settings.defer_autoplay_until_interaction
    assign autoplay_after_interaction = autoplay
    assign autoplay = false
  endif
endif
```

Add this attribute to `<slideshow-component>`:

```liquid
data-autoplay-after-interaction="{{ autoplay_after_interaction }}"
```

Add this schema setting immediately after the existing `autoplay` checkbox:

```json
{
  "type": "checkbox",
  "id": "defer_autoplay_until_interaction",
  "label": "Start autoplay after first visitor interaction",
  "default": false,
  "visible_if": "{{ section.settings.autoplay == true }}"
}
```

Add this homepage setting inside `templates/index.json` section `1653903038c126b831`:

```json
"autoplay": true,
"defer_autoplay_until_interaction": true,
"autorotate_speed": 5
```

- [ ] **Step 5: Add the JavaScript interaction gate**

In the constructor, after `_reducedMotion` is assigned, add:

```js
this._autoplayInteractionEvents = ['scroll', 'pointerdown', 'click', 'keydown']
this._autoplayInteractionSeen = false
this._sliderReady = false
this._sliderInitAttempts = 0
this._onAutoplayInteraction = this._handleAutoplayInteraction.bind(this)
this._watchForAutoplayInteraction()
```

In `disconnectedCallback()`, add:

```js
this._removeAutoplayInteractionListeners()
```

At the start of the `setInterval` callback in `init()`, increment the attempt count. Keep the existing successful initialization branch, and add the failure branch shown here so polling ends after ten seconds:

```js
this._sliderInitAttempts += 1
this.slider = this.domNodes.flickity.slider && this.domNodes.flickity.slider.instance
if (this.slider && typeof this.slider == 'object') {
  clearInterval(this.check)
  this.removeAttribute('data-media-loading')
  this.slider.on('change', this.handleChange.bind(this))
  this.domNodes.contents[0].classList.add('selected')
  this.handleScreenChange()
  this.addEventListener('mouseenter', this._onPointerEnter)
  this.addEventListener('mouseleave', this._onPointerLeave)
  this.addEventListener('focusin', this._onPointerEnter)
  this.addEventListener('focusout', this._onPointerLeave)
  this._sliderReady = true
  this.playVideo()
  this._startDeferredAutoplay()
  if (this.domNodes.pageCounter) {
    this.domNodes.flickity.insertBefore(this.domNodes.pageCounter, null)
  }
} else if (this._sliderInitAttempts >= 100) {
  clearInterval(this.check)
  this.removeAttribute('data-media-loading')
}
```

Add these methods before `get autoplayEnabled()`:

```js
get deferredAutoplaySpeed() {
  const speed = Number(this.dataset.autoplayAfterInteraction)
  return Number.isFinite(speed) && speed > 0 ? speed : 0
}

_watchForAutoplayInteraction() {
  if (!this.deferredAutoplaySpeed || this._reducedMotion) return
  this._autoplayInteractionEvents.forEach((eventName) => {
    window.addEventListener(eventName, this._onAutoplayInteraction, { passive: true })
  })
}

_handleAutoplayInteraction() {
  if (this._autoplayInteractionSeen) return
  this._autoplayInteractionSeen = true
  this._removeAutoplayInteractionListeners()
  this._startDeferredAutoplay()
}

_startDeferredAutoplay() {
  if (
    !this._autoplayInteractionSeen ||
    !this._sliderReady ||
    !this.slider ||
    this._reducedMotion ||
    !this.deferredAutoplaySpeed
  ) return

  this.slider.options.autoPlay = this.deferredAutoplaySpeed
  this.slider.playPlayer()
}

_removeAutoplayInteractionListeners() {
  this._autoplayInteractionEvents.forEach((eventName) => {
    window.removeEventListener(eventName, this._onAutoplayInteraction)
  })
}
```

- [ ] **Step 6: Run both tests and verify GREEN**

Run:

```powershell
node --test tests/core-web-vitals-contract.test.cjs
Set-Location tests
npx playwright test --config=core-web-vitals-playwright.config.js
Set-Location ..
```

Expected: Node reports `2` passing tests; Playwright reports `4` passing tests.

- [ ] **Step 7: Commit the slideshow change**

```powershell
git add sections/slideshow.liquid assets/slideshow-component.js templates/index.json
git add -f tests/core-web-vitals-contract.test.cjs tests/fixtures/slideshow-interaction.html tests/core-web-vitals.spec.js tests/core-web-vitals-playwright.config.js
git commit -m "perf: defer homepage slideshow autoplay until interaction"
```

---

### Task 2: Gate Theme-Owned GTM and Podium on Interaction

**Files:**
- Create: `tests/core-web-vitals-inline-loaders.test.cjs`
- Modify: `layout/theme.liquid:62-82,437-455`

**Interfaces:**
- Consumes: browser `window` and `document` event targets.
- Produces: idempotent `loadGTM()` and `loadPodium()` loaders using `['scroll', 'pointerdown', 'click', 'keydown']` and no timer fallback.

- [ ] **Step 1: Write the failing inline-loader behavior tests**

Create `tests/core-web-vitals-inline-loaders.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const theme = fs.readFileSync(
  path.resolve(__dirname, '../layout/theme.liquid'),
  'utf8',
);

function extractScript(startMarker) {
  const markerIndex = theme.indexOf(startMarker);
  assert.notEqual(markerIndex, -1, `found ${startMarker}`);
  const scriptStart = theme.indexOf('<script>', markerIndex) + '<script>'.length;
  const scriptEnd = theme.indexOf('</script>', scriptStart);
  return theme.slice(scriptStart, scriptEnd);
}

function makeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
    },
    dispatch(name) {
      for (const callback of Array.from(listeners.get(name) || [])) callback();
    },
    listenerCount(name) {
      return listeners.get(name)?.size || 0;
    },
  };
}

function runLoader(script) {
  const windowTarget = makeEventTarget();
  const documentTarget = makeEventTarget();
  const inserted = [];
  const scheduled = [];
  const firstScript = { parentNode: { insertBefore: (node) => inserted.push(node) } };

  const document = {
    ...documentTarget,
    body: { appendChild: (node) => inserted.push(node) },
    createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
    getElementsByTagName: () => [firstScript],
  };
  const window = { ...windowTarget, dataLayer: [] };

  vm.runInNewContext(script, {
    window,
    document,
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
    },
  });

  return { window, document, inserted, scheduled };
}

for (const scenario of [
  {
    name: 'GTM',
    marker: '<!-- Google Tag Manager (interaction-deferred for performance) -->',
    target: 'window',
    expectedSrc: 'https://www.googletagmanager.com/gtm.js?id=GTM-PNBCJ3H',
  },
  {
    name: 'Podium',
    marker: '{% comment %} WebChat',
    target: 'document',
    expectedSrc: 'https://connect.podium.com/widget.js#ORG_TOKEN=',
  },
]) {
  test(`${scenario.name} loads once after meaningful interaction and never from a timeout`, () => {
    const harness = runLoader(extractScript(scenario.marker));
    assert.equal(harness.inserted.length, 0);
    assert.equal(harness.scheduled.length, 0);

    const target = harness[scenario.target];
    target.dispatch('pointerdown');
    assert.equal(harness.inserted.length, 1);
    assert.match(harness.inserted[0].src, new RegExp(scenario.expectedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    target.dispatch('scroll');
    target.dispatch('click');
    target.dispatch('keydown');
    assert.equal(harness.inserted.length, 1);
    assert.equal(target.listenerCount('mousemove'), 0);
  });
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/core-web-vitals-inline-loaders.test.cjs
```

Expected: both tests fail because each current loader schedules an eight-second timeout.

- [ ] **Step 3: Replace the GTM loader with interaction-only code**

Keep the existing comment and replace its script with:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
  (function() {
    var gtmLoaded = false;
    var interactionEvents = ['scroll', 'pointerdown', 'click', 'keydown'];

    function removeInteractionListeners() {
      interactionEvents.forEach(function(eventName) {
        window.removeEventListener(eventName, loadGTM);
      });
    }

    function loadGTM() {
      if (gtmLoaded) return;
      gtmLoaded = true;
      removeInteractionListeners();
      var f = document.getElementsByTagName('script')[0];
      var j = document.createElement('script');
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-PNBCJ3H';
      f.parentNode.insertBefore(j, f);
    }

    interactionEvents.forEach(function(eventName) {
      window.addEventListener(eventName, loadGTM, { passive: true });
    });
  })();
</script>
```

- [ ] **Step 4: Replace the Podium loader with interaction-only code**

Keep the existing WebChat comment and replace its script with:

```html
<script>
  (function() {
    var podiumLoaded = false;
    var interactionEvents = ['scroll', 'pointerdown', 'click', 'keydown'];

    function removeInteractionListeners() {
      interactionEvents.forEach(function(eventName) {
        document.removeEventListener(eventName, loadPodium);
      });
    }

    function loadPodium() {
      if (podiumLoaded) return;
      podiumLoaded = true;
      removeInteractionListeners();
      var s = document.createElement('script');
      s.src = 'https://connect.podium.com/widget.js#ORG_TOKEN=211a92b8-ab89-45c7-ba01-acab8089df3d';
      s.id = 'podium-widget';
      s.setAttribute('data-organization-api-token', '211a92b8-ab89-45c7-ba01-acab8089df3d');
      document.body.appendChild(s);
    }

    interactionEvents.forEach(function(eventName) {
      document.addEventListener(eventName, loadPodium, { passive: true });
    });
  })();
</script>
```

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```powershell
node --test tests/core-web-vitals-inline-loaders.test.cjs
```

Expected: `2` tests pass, no scheduled fallback exists, and repeated interactions insert one script per loader.

- [ ] **Step 6: Commit the interaction loaders**

```powershell
git add layout/theme.liquid
git add -f tests/core-web-vitals-inline-loaders.test.cjs
git commit -m "perf: load GTM and Podium after interaction"
```

---

### Task 3: Stabilize Vehicle Finder and Narrow Bold Resource Hints

**Files:**
- Create: `tests/core-web-vitals-template.test.cjs`
- Modify: `templates/index.json:221-266`
- Modify: `layout/theme.liquid:93-98,275-287`

**Interfaces:**
- Consumes: homepage apps section `1770092251a8cb32bd` and Shopify template context `template.name`.
- Produces: section-scoped `440px` mobile and `218px` desktop minimum heights, plus product-only Bold preconnect/preload hints.

- [ ] **Step 1: Write the failing template tests**

Create `tests/core-web-vitals-template.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseShopifyJson(relativePath) {
  return JSON.parse(read(relativePath).replace(/^\/\*[\s\S]*?\*\//, '').trim());
}

test('vehicle finder reserves its measured mobile and desktop height', () => {
  const home = parseShopifyJson('templates/index.json');
  const apps = home.sections['1770092251a8cb32bd'];
  assert.deepEqual(apps.custom_css, [
    '.f-apps-wrapper { min-height: 440px; }',
    '@media (min-width: 768px) { .f-apps-wrapper { min-height: 218px; } }',
  ]);
});

test('Bold connection and preload hints are product-only while runtime includes remain global', () => {
  const theme = read('layout/theme.liquid');
  const productHintBlock = theme.match(
    /{%- if template\.name == 'product' -%}([\s\S]*?){%- endif -%}/,
  );
  assert.ok(productHintBlock, 'product-only hint block exists');
  assert.match(productHintBlock[1], /options\.shopapps\.site/);
  assert.match(productHintBlock[1], /bold-options\.css/);
  assert.match(productHintBlock[1], /bold-options-form-linker\.js/);

  assert.match(theme, /{%- render 'bold-options-hybrid' -%}/);
  assert.match(theme, /{%- render 'bold-common' -%}/);
  assert.match(theme, /{%- render 'sc-includes' -%}/);

  const productBlockRemoved = theme.replace(productHintBlock[0], '');
  assert.doesNotMatch(productBlockRemoved, /rel="preconnect" href="https:\/\/options\.shopapps\.site"/);
  assert.doesNotMatch(productBlockRemoved, /rel="preload" href="https:\/\/options\.shopapps\.site\/js\/options\.js"/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/core-web-vitals-template.test.cjs
```

Expected: the first test fails because `custom_css` is absent; the second fails because the Bold hints are global.

- [ ] **Step 3: Add the measured vehicle-finder reservation**

Add this property to homepage section `1770092251a8cb32bd` immediately before its `settings` property:

```json
"custom_css": [
  ".f-apps-wrapper { min-height: 440px; }",
  "@media (min-width: 768px) { .f-apps-wrapper { min-height: 218px; } }"
],
```

- [ ] **Step 4: Scope early Bold hints to product templates**

Remove the global `options.shopapps.site` preconnect from the shared preconnect list. Wrap the Bold preconnect and existing Bold preload hints in one product-only block near the current preload group:

```liquid
{%- if template.name == 'product' -%}
  <link rel="preconnect" href="https://options.shopapps.site" crossorigin>
  <link
    rel="preload"
    href="{{ 'bold-options.css' | asset_url }}"
    as="style"
    onload="this.onload=null;this.rel='stylesheet';"
  >
  <link rel="preload" href="https://options.shopapps.site/js/options.js" as="script" crossorigin>
  <link rel="preload" href="{{ 'bold-options-form-linker.js' | asset_url }}" as="script">
{%- endif -%}
```

Keep these existing body-level integrations unchanged:

```liquid
{%- render 'bold-options-hybrid' -%}
{%- render 'bold-common' -%}
{%- render 'sc-includes' -%}
<script src="{{ 'bold-options-form-linker.js' | asset_url }}" defer></script>
```

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```powershell
node --test tests/core-web-vitals-template.test.cjs
```

Expected: both tests pass.

- [ ] **Step 6: Verify generated snippets remain unchanged**

Run:

```powershell
git diff --exit-code HEAD -- snippets/bold-options-hybrid.liquid snippets/bold-common.liquid snippets/sc-includes.liquid
```

Expected: exit code `0` and no output.

- [ ] **Step 7: Commit the template and resource-hint changes**

```powershell
git add templates/index.json layout/theme.liquid
git add -f tests/core-web-vitals-template.test.cjs
git commit -m "perf: stabilize homepage app loading"
```

---

### Task 4: Add Staging Behavior and Resource Verification

**Files:**
- Create: `tests/core-web-vitals-staging.spec.js`
- Create: `tests/core-web-vitals-staging.config.js`

**Interfaces:**
- Consumes: `STAGING_URL`, the deployed staging homepage, and the existing homepage product links.
- Produces: mobile and desktop assertions for deferred autoplay, video loading, GTM/Podium requests, CLS, and Bold resource hints.

- [ ] **Step 1: Write the staging Playwright suite**

Create `tests/core-web-vitals-staging.spec.js`:

```js
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STAGING_URL;
if (!BASE_URL) throw new Error('STAGING_URL is required');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__coreWebVitalsCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__coreWebVitalsCls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
});

test('homepage waits for interaction before autoplay and theme-owned third parties', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const hero = page.locator('slideshow-component').first();
  await expect(hero).toBeVisible();

  const firstIndex = await hero.locator('.f-slideshow__slide.is-selected').getAttribute('data-index');
  const videoUrl = await hero.evaluate((node) => {
    const template = node.querySelector('deferred-media template');
    return template?.content.querySelector('video')?.src || '';
  });

  await page.waitForTimeout(6000);
  await expect(hero.locator('.f-slideshow__slide.is-selected')).toHaveAttribute('data-index', firstIndex);
  expect(requests).not.toContain(videoUrl);
  expect(requests.filter((url) => url.includes('gtm.js?id=GTM-PNBCJ3H'))).toHaveLength(0);
  expect(requests.filter((url) => url.includes('connect.podium.com/widget.js'))).toHaveLength(0);

  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(5400);
  await expect(hero.locator('.f-slideshow__slide.is-selected')).not.toHaveAttribute('data-index', firstIndex);

  await expect.poll(() => requests.filter((url) => url.includes('gtm.js?id=GTM-PNBCJ3H')).length).toBe(1);
  await expect.poll(() => requests.filter((url) => url.includes('connect.podium.com/widget.js')).length).toBe(1);
  if (videoUrl) await expect.poll(() => requests.includes(videoUrl)).toBe(true);

  await page.waitForTimeout(1000);
  const cls = await page.evaluate(() => window.__coreWebVitalsCls);
  expect(cls).toBeLessThan(0.1);
});

test('homepage omits Bold preload hints while product pages retain them', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('link[rel="preload"][href*="options.shopapps.site"]')).toHaveCount(0);

  const productPath = await page.locator('a[href*="/products/"]').first().getAttribute('href');
  expect(productPath).toBeTruthy();
  await page.goto(new URL(productPath, BASE_URL).href, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('link[rel="preconnect"][href="https://options.shopapps.site"]')).toHaveCount(1);
  await expect(page.locator('link[rel="preload"][href*="options.shopapps.site/js/options.js"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => Boolean(window.BOLD?.common))).toBe(true);
});
```

Create `tests/core-web-vitals-staging.config.js`:

```js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: 'core-web-vitals-staging.spec.js',
  timeout: 60000,
  retries: 1,
  reporter: [['list']],
  use: { headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- [ ] **Step 2: Commit the staging verification suite**

```powershell
git add -f tests/core-web-vitals-staging.spec.js tests/core-web-vitals-staging.config.js
git commit -m "test: add staging Core Web Vitals checks"
```

- [ ] **Step 3: Run local structural and fixture verification**

Run:

```powershell
node --test tests/core-web-vitals-contract.test.cjs tests/core-web-vitals-inline-loaders.test.cjs tests/core-web-vitals-template.test.cjs
Set-Location tests
npx playwright test --config=core-web-vitals-playwright.config.js
Set-Location ..
shopify theme check
git diff --check origin/main...HEAD
```

Expected: all Node tests pass, both fixture Playwright tests pass, Shopify Theme Check reports no new errors, and `git diff --check` returns no output.

- [ ] **Step 4: Start a Shopify staging preview**

Run in a dedicated terminal:

```powershell
shopify theme dev --store=offroad-ind.myshopify.com
```

Copy the printed preview URL, including its `preview_theme_id`, into the current shell when prompted:

```powershell
$env:STAGING_URL = Read-Host 'Paste the Shopify CLI preview URL'
```

Expected: the preview renders `optimizing/core-web-vitals-staging`; do not use a production theme ID.

- [ ] **Step 5: Run staging behavior tests**

Run:

```powershell
Set-Location tests
npx playwright test --config=core-web-vitals-staging.config.js
Set-Location ..
```

Expected: `4` project-tests pass: two tests on mobile and two on desktop.

- [ ] **Step 6: Run three Lighthouse passes per form factor**

Run:

```powershell
$out = Join-Path $env:TEMP 'ori-core-web-vitals-staging'
New-Item -ItemType Directory -Force -Path $out | Out-Null
1..3 | ForEach-Object {
  npx --no-install lighthouse $env:STAGING_URL --quiet --output=json --output-path=(Join-Path $out "mobile-$_.json") --only-categories=performance --chrome-flags='--headless --no-sandbox'
  npx --no-install lighthouse $env:STAGING_URL --quiet --preset=desktop --output=json --output-path=(Join-Path $out "desktop-$_.json") --only-categories=performance --chrome-flags='--headless --no-sandbox'
}
```

Summarize medians:

```powershell
@('mobile','desktop') | ForEach-Object {
  $form = $_
  $rows = 1..3 | ForEach-Object {
    $report = Get-Content (Join-Path $out "$form-$_.json") -Raw | ConvertFrom-Json
    [pscustomobject]@{
      Performance = [math]::Round($report.categories.performance.score * 100)
      LCP = $report.audits.'largest-contentful-paint'.numericValue
      TBT = $report.audits.'total-blocking-time'.numericValue
      CLS = $report.audits.'cumulative-layout-shift'.numericValue
    }
  }
  [pscustomobject]@{
    FormFactor = $form
    PerformanceMedian = ($rows.Performance | Sort-Object)[1]
    LcpMedianMs = [math]::Round(($rows.LCP | Sort-Object)[1])
    TbtMedianMs = [math]::Round(($rows.TBT | Sort-Object)[1])
    ClsMedian = [math]::Round(($rows.CLS | Sort-Object)[1], 3)
  }
}
```

Expected targets:

- Mobile median LCP at or below `4000 ms`, TBT at or below `1000 ms`, CLS below `0.1`.
- Desktop median LCP at or below `2500 ms`, TBT at or below `400 ms`, CLS below `0.1`.
- The initial passive run contains no 22 MB slideshow video transfer and no theme-owned GTM or Podium request.

If an app-injected script prevents a numeric target, record the responsible URL and its main-thread or transfer cost from the Lighthouse report.

- [ ] **Step 7: Verify branch scope before handoff**

Run:

```powershell
git branch --show-current
git status --short --branch
git log --oneline origin/main..HEAD
git diff --name-status origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected:

- Current branch is `optimizing/core-web-vitals-staging`.
- Only `AGENTS.md` and `full_page.html` remain untracked.
- `main` is unchanged.
- The diff contains the approved spec, plan, performance files, and focused tests only.

Do not push or promote to `main` without a separate explicit instruction.
