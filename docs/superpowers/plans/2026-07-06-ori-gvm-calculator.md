# ORI GVM Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native, ORI-branded GVM load simulator page with the reference calculator's calculations, controls, indicators, tutorial, and responsive layout.

**Architecture:** A Liquid section supplies editable content, translated labels, and CDN asset URLs to a custom element. A standalone UMD calculation engine keeps formulas deterministic and testable without a bundler; a second browser asset renders and controls the simulator from a replaceable JSON dataset. A dedicated JSON page template makes the feature assignable in Shopify Admin.

**Tech Stack:** Shopify Liquid, Online Store 2.0 JSON templates, plain CSS, browser JavaScript/custom elements, Node built-in test runner, Playwright.

---

## File map

- Create `assets/ori-gvm-calculator-engine.js`: normalization, validation, limits, axle/load calculations, status classification, percentage helpers.
- Create `assets/ori-gvm-calculator.js`: custom element, fetch/retry lifecycle, controls, result rendering, SVG indicators, guided tour.
- Create `assets/ori-gvm-calculator.css`: ORI-branded responsive layout and component states.
- Create `assets/ori-gvm-calculator-data.json`: eight reference vehicles, upgrades, and accessories.
- Create `sections/ori-gvm-load-calculator.liquid`: component host, editable content, localization/config JSON, schema.
- Create `templates/page.gvm-calculator.json`: assignable page template.
- Modify `locales/en.default.json`: calculator labels and errors.
- Create `tests/ori-gvm-calculator-engine.test.cjs`: calculation unit tests.
- Create `tests/fixtures/ori-gvm-calculator.html`: local browser fixture.
- Create `tests/ori-gvm-calculator.spec.js`: interaction and responsive browser tests.

### Task 1: Define and prove the calculation contract

**Files:**
- Create: `tests/ori-gvm-calculator-engine.test.cjs`
- Create: `assets/ori-gvm-calculator-engine.js`

- [ ] **Step 1: Write the failing engine tests**

Create a CommonJS test that requires `../assets/ori-gvm-calculator-engine.js` and defines this representative vehicle:

```js
const vehicle = {
  id: 'test-vehicle',
  factory_specs: {
    wheelbase_mm: 3000,
    hitch_overhang_mm: 1200,
    baseline_front_kg: 1500,
    baseline_rear_kg: 1000,
    gvm: 3500,
    gcm: 6500,
    front_axle_limit: 1800,
    rear_axle_limit: 2000,
    towing_capacity: 3500,
    tbm_limit: 350
  },
  upgrades: [{
    id: 'upgrade-4000',
    gvm: 4000,
    gcm: 7500,
    front_axle_limit: 2000,
    rear_axle_limit: 2400,
    towing_capacity: 4000,
    tbm_limit: 400
  }]
};

const state = {
  selectedUpgradeId: null,
  atm: 3500,
  tbm: 300,
  passengersKg: 200,
  cargoRearKg: 300,
  selectedAccessories: [{ id: 'bullbar', mass_kg: 100, position_ratio: -0.2 }]
};
```

Assert these exact behaviors with `node:test` and `node:assert/strict`:

```js
assert.deepEqual(engine.splitMass(100, 0.45), { front: 55, rear: 45 });
assert.deepEqual(engine.splitMass(100, 1.1), { front: -10, rear: 110 });
assert.equal(engine.normalizeMass(-2), 0);
assert.equal(engine.normalizeMass('not-a-number'), 0);
assert.equal(engine.normalizeMass('42.5'), 42.5);

const result = engine.calculate(vehicle, state);
assert.equal(result.frontAxle, 1580);
assert.equal(result.rearAxle, 1820);
assert.equal(result.vehicleMass, 3400);
assert.equal(result.combinedMass, 6600);
assert.equal(result.trailerAxleMass, 3200);

assert.equal(engine.classifyStatus(94.99, 100, 0.95), 'ok');
assert.equal(engine.classifyStatus(95, 100, 0.95), 'warning');
assert.equal(engine.classifyStatus(100, 100, 0.95), 'warning');
assert.equal(engine.classifyStatus(100.01, 100, 0.95), 'danger');

assert.equal(engine.getLimits(vehicle, null).gvm, 3500);
assert.equal(engine.getLimits(vehicle, 'upgrade-4000').gvm, 4000);
assert.equal(engine.getLimits(vehicle, 'missing').gvm, 3500);
assert.equal(engine.validateVehicle(vehicle).valid, true);
assert.equal(engine.validateVehicle({ id: 'bad' }).valid, false);
```

- [ ] **Step 2: Run the tests and verify the expected RED state**

Run:

```powershell
node --test tests/ori-gvm-calculator-engine.test.cjs
```

Expected: FAIL because `assets/ori-gvm-calculator-engine.js` does not exist.

- [ ] **Step 3: Implement the minimal UMD engine**

Expose this API to `window.ORIGvmCalculatorEngine` and `module.exports`:

```js
{
  normalizeMass,
  splitMass,
  validateVehicle,
  getLimits,
  calculate,
  classifyStatus,
  percentage
}
```

Implement:

```js
function normalizeMass(value) {
  var number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function splitMass(mass, ratio) {
  var normalizedMass = normalizeMass(mass);
  var normalizedRatio = Number.isFinite(Number(ratio)) ? Number(ratio) : 0.5;
  return {
    front: normalizedMass * (1 - normalizedRatio),
    rear: normalizedMass * normalizedRatio
  };
}
```

`calculate(vehicle, state)` must apply passenger ratio `0.45`, rear-cargo ratio `1.10`, per-accessory ratios, tow-ball leverage, vehicle total, trailer axle mass, combined total, and return current limits plus all component totals. `getLimits` falls back to factory limits when no matching upgrade exists. `validateVehicle` requires finite positive baseline masses, wheelbase, GVM/GCM, axle limits, towing capacity, and TBM limit.

- [ ] **Step 4: Run the engine tests and verify GREEN**

Run the same `node --test` command. Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit the engine and tests**

```powershell
git add -- assets/ori-gvm-calculator-engine.js tests/ori-gvm-calculator-engine.test.cjs
git commit -m "feat: add tested GVM calculation engine"
```

### Task 2: Add and validate the replaceable simulator dataset

**Files:**
- Create: `assets/ori-gvm-calculator-data.json`
- Modify: `tests/ori-gvm-calculator-engine.test.cjs`

- [ ] **Step 1: Add a failing dataset validation test**

Parse the JSON asset and assert:

```js
assert.equal(data.version, 1);
assert.equal(data.vehicles.length, 8);
assert.deepEqual(
  data.vehicles.map((vehicle) => vehicle.id),
  ['lc300', 'lc200', 'lcp250', 'lc79', 'hilux', 'ranger_ng', 'everest_ng', 'd-max']
);
for (const vehicle of data.vehicles) {
  assert.equal(engine.validateVehicle(vehicle).valid, true, vehicle.id);
  assert.ok(Array.isArray(vehicle.upgrades));
  assert.ok(vehicle.quote_url.startsWith('/'));
}
assert.ok(data.accessories.front.length > 0);
assert.ok(data.accessories.middle.length > 0);
assert.ok(data.accessories_by_category.rear.Wagon.length > 0);
assert.ok(data.accessories_by_category.rear.Ute.length > 0);
```

- [ ] **Step 2: Verify RED because the data asset is missing**

Run `node --test tests/ori-gvm-calculator-engine.test.cjs`. Expected: missing JSON module/file failure.

- [ ] **Step 3: Create the versioned JSON dataset**

Use the captured reference data for:

- Toyota LandCruiser 300, LandCruiser 200, Prado 250, LandCruiser 79, HiLux.
- Ford Ranger Next Gen, Ford Everest Next Gen.
- Isuzu D-Max.
- Factory wheelbase, hitch overhang, representative front/rear baseline weights, GVM, GCM, axle limits, towing capacity, and TBM limits.
- Every published upgrade for each vehicle.
- Front, middle, Wagon-rear, and Ute-rear accessories with mass and longitudinal position ratios.

Rename the source field `moduleurl` to `quote_url`. Keep all values numeric. Add top-level `version: 1` and `source_kind: "reference_estimates"`. Do not add certification claims.

- [ ] **Step 4: Verify GREEN and JSON validity**

```powershell
node --test tests/ori-gvm-calculator-engine.test.cjs
Get-Content -Raw assets/ori-gvm-calculator-data.json | ConvertFrom-Json | Out-Null
```

Expected: tests pass; PowerShell exits zero.

- [ ] **Step 5: Commit the data asset**

```powershell
git add -- assets/ori-gvm-calculator-data.json tests/ori-gvm-calculator-engine.test.cjs
git commit -m "feat: add GVM simulator reference dataset"
```

### Task 3: Build the Liquid host and localization contract

**Files:**
- Create: `sections/ori-gvm-load-calculator.liquid`
- Modify: `locales/en.default.json`

- [ ] **Step 1: Add the `gvm_calculator` locale tree**

Add three-level-or-shallower keys for: vehicle selection, intro labels, factory option, upgrades, trailer/hitch, occupants/cargo, accessories, summary/compliance, each limit/value name, loading, load failure, retry, quote CTA, tutorial controls/steps, status words, units, and unavailable-data message.

The English copy must call results estimates and must not use ORI certification language for the reference values.

- [ ] **Step 2: Create the semantic section shell**

The section must:

```liquid
{{ 'ori-gvm-calculator.css' | asset_url | stylesheet_tag }}
<script src="{{ 'ori-gvm-calculator-engine.js' | asset_url }}" defer></script>
<script src="{{ 'ori-gvm-calculator.js' | asset_url }}" defer></script>
```

Render one `<ori-gvm-calculator>` with unique section ID, `data-source-url` pointing to `ori-gvm-calculator-data.json`, warning threshold, tutorial flag, and fallback quote URL. Include editable heading, rich-text intro, disclaimer, optional responsive image, a loading fallback, and a `<script type="application/json" data-gvm-translations>` dictionary generated exclusively with locale filters.

- [ ] **Step 3: Add a complete section schema**

Settings: heading, intro, disclaimer, image, image alt text, fallback quote URL, quote button label, color scheme, container, warning threshold from 80 to 100 percent, tutorial checkbox, padding top/bottom, custom ID, and custom class. Include a preset. Use the same container and color options as existing ORI sections.

- [ ] **Step 4: Parse and inspect changed locale/schema JSON**

Use a short PowerShell/Node extraction check to parse the locale file and the JSON between `{% schema %}` tags. Expected: both parse successfully.

- [ ] **Step 5: Commit the host contract**

```powershell
git add -- sections/ori-gvm-load-calculator.liquid locales/en.default.json
git commit -m "feat: add GVM calculator section host"
```

### Task 4: Drive browser behavior with failing Playwright tests

**Files:**
- Create: `tests/fixtures/ori-gvm-calculator.html`
- Create: `tests/ori-gvm-calculator.spec.js`
- Create: `assets/ori-gvm-calculator.js`

- [ ] **Step 1: Create a browser fixture**

Serve the repository root and load the production engine/controller assets. Render an `<ori-gvm-calculator>` configured with `/assets/ori-gvm-calculator-data.json`, English test translations, `warningThreshold: 0.95`, tutorial enabled, and a `/pages/contact` fallback URL.

- [ ] **Step 2: Write failing interaction tests**

Add Playwright tests using `http://127.0.0.1:4173/tests/fixtures/ori-gvm-calculator.html`:

```js
await expect(page.getByLabel('Select your vehicle')).toBeVisible();
await page.getByLabel('Select your vehicle').selectOption('lc300');
await expect(page.getByRole('heading', { name: /Toyota LandCruiser 300/i })).toBeVisible();
await expect(page.getByText('Vehicle total (GVM): 2550 / 3280 kg')).toBeVisible();

await page.getByLabel('ATM').fill('3500');
await page.getByLabel('TBM').fill('350');
await page.getByLabel('Passengers').fill('300');
await page.getByLabel('Cargo - rear').fill('500');
await page.getByLabel(/Bull bar/i).check();
await expect(page.getByText('Vehicle total (GVM): 3785 / 3280 kg')).toBeVisible();
await expect(page.getByText('Combined mass (GCM): 6935 / 6800 kg')).toBeVisible();

await page.getByLabel(/Lovells 4205kg with BTC/i).check();
await expect(page.getByText('Vehicle GVM: 4205 kg')).toBeVisible();
await expect(page.getByText('Towing capacity: 4000 kg')).toBeVisible();
```

Also test: tutorial opens once and replays; clearing vehicle restores intro; malformed fetch displays retry; retry succeeds after route recovery; inaccessible vehicle data shows unavailable message rather than crashing.

- [ ] **Step 3: Verify RED because the controller is missing**

Start `python -m http.server 4173` from the repository root, then run:

```powershell
Push-Location tests
npx playwright test ori-gvm-calculator.spec.js
Pop-Location
```

Expected: tests fail because the custom element/controller has not been implemented.

- [ ] **Step 4: Implement the custom element**

Implement one guarded registration for `ori-gvm-calculator`. The controller must parse translations, fetch and validate data, render intro/selector/calculator states, preserve load state while upgrades change, combine category-specific accessories without duplicate IDs, update all results on `input`/`change`, and render accessible SVG ring/bar indicators.

Use event delegation and section-local queries so multiple calculator sections can coexist. Escape all dataset text before placing it in HTML, or create text nodes/attributes through DOM APIs. Use `AbortController` on disconnect. The retry control must issue a fresh fetch.

Implement the five-step modal tutorial with focus trap, Escape, Back/Next/Skip/Close, focus restoration, reduced motion, replay, and the storage key `ori_gvm_tour_seen_v1`.

- [ ] **Step 5: Verify interaction tests GREEN**

Run the Playwright file again. Expected: all interaction tests pass.

- [ ] **Step 6: Commit the controller and browser tests**

```powershell
git add -- assets/ori-gvm-calculator.js tests/fixtures/ori-gvm-calculator.html tests/ori-gvm-calculator.spec.js
git commit -m "feat: add interactive GVM simulator controller"
```

### Task 5: Implement ORI styling and responsive fidelity

**Files:**
- Create: `assets/ori-gvm-calculator.css`
- Modify: `tests/ori-gvm-calculator.spec.js`

- [ ] **Step 1: Add failing responsive assertions**

Test 1280, 768, 390, and 320 CSS-pixel widths. At 1280, controls and sticky results must be side by side. At 390 and 320, the summary precedes controls visually and:

```js
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth
);
expect(overflow).toBeLessThanOrEqual(1);
```

Assert the component uses `--brand-display-font`, `--brand-body-font`, and `--brand-teal` through computed styles. Add screenshot assertions or retained screenshots for desktop and mobile visual inspection.

- [ ] **Step 2: Verify RED without the stylesheet**

Run the Playwright file. Expected: layout/brand assertions fail.

- [ ] **Step 3: Implement responsive component styles**

Use a two-column `minmax(300px, 1fr) minmax(0, 2fr)` layout above 990px, sticky results, full-width accessories, card borders/radii, wrap-safe chips, and grid indicators. Use ORI font/color variables with theme fallbacks. On narrow screens, use CSS grid areas to order title, results, controls, upgrades, and accessories without changing accessible DOM order. Respect `prefers-reduced-motion` and `forced-colors`.

- [ ] **Step 4: Verify responsive tests and inspect screenshots**

Run Playwright, open the desktop and 390-pixel screenshots, and confirm no clipped labels, controls, charts, or page overflow.

- [ ] **Step 5: Commit the stylesheet**

```powershell
git add -- assets/ori-gvm-calculator.css tests/ori-gvm-calculator.spec.js
git commit -m "style: apply ORI responsive calculator design"
```

### Task 6: Add the assignable page template

**Files:**
- Create: `templates/page.gvm-calculator.json`

- [ ] **Step 1: Create the JSON template**

Define one enabled `ori-gvm-load-calculator` section named `main`. Configure the standard container, default color scheme, 60px desktop padding, 40px mobile-safe content spacing through CSS, tutorial enabled, 95% warning threshold, contact fallback, rewritten ORI intro/disclaimer, and no hard-coded image.

- [ ] **Step 2: Parse the template JSON**

```powershell
Get-Content -Raw templates/page.gvm-calculator.json | ConvertFrom-Json | Out-Null
```

Expected: exit zero.

- [ ] **Step 3: Commit the template**

```powershell
git add -- templates/page.gvm-calculator.json
git commit -m "feat: add GVM calculator page template"
```

### Task 7: Shopify validation and completion audit

**Files:**
- Modify only files required by validator findings.

- [ ] **Step 1: Run the Shopify skill validator**

Run `scripts/validate.mjs` from the installed Shopify Liquid skill in full-theme mode with every created/modified production file, model/client flags, one stable artifact ID, and revision 1. If it fails, search the named Liquid/schema issue, fix only that issue, and retry with revision 2 or 3.

- [ ] **Step 2: Run the complete automated verification set**

```powershell
node --test tests/ori-gvm-calculator-engine.test.cjs
Push-Location tests
npx playwright test ori-gvm-calculator.spec.js
Pop-Location
git diff --check main...HEAD
```

Parse `assets/ori-gvm-calculator-data.json`, `templates/page.gvm-calculator.json`, and `locales/en.default.json` independently. Expected: all commands exit zero.

- [ ] **Step 3: Inspect requirements against evidence**

Confirm from fresh evidence:

- Dedicated branch exists and `main` remains unchanged.
- Template and section render the calculator without external runtime dependencies.
- Vehicle selection, upgrades, loads, accessories, axle transfer, GVM/GCM/ATM/TBM status, charts, tutorial, reset, retry, and quote links are covered.
- ORI fonts/colors are applied.
- 320/390/768/1280 layouts are usable and do not overflow.
- Initial data is disclosed as estimated reference data, not ORI certification.
- `AGENTS.md`, `full_page.html`, and `config/settings_data.json` remain untouched/uncommitted.

- [ ] **Step 4: Review final diff and working tree**

```powershell
git diff --stat main...HEAD
git diff --name-status main...HEAD
git status --short --branch
```

Expected: only planned files and documentation are committed; only the user's pre-existing untracked files remain.

- [ ] **Step 5: Commit any validation-only corrections**

If corrections were required:

```powershell
git add -- assets/ori-gvm-calculator-engine.js assets/ori-gvm-calculator.js assets/ori-gvm-calculator.css assets/ori-gvm-calculator-data.json sections/ori-gvm-load-calculator.liquid templates/page.gvm-calculator.json locales/en.default.json tests/ori-gvm-calculator-engine.test.cjs tests/fixtures/ori-gvm-calculator.html tests/ori-gvm-calculator.spec.js
git commit -m "fix: resolve GVM calculator validation findings"
```

Do not push, open a pull request, or merge.
