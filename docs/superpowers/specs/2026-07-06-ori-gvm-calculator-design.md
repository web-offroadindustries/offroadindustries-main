# ORI GVM Calculator Design

## Objective

Build a native Shopify page that reproduces the reference GVM calculator's useful behavior and information hierarchy while using the Gusto theme's ORI brand system. The page must calculate vehicle, axle, towing, and combined-mass estimates interactively; remain editable as a theme component; work without a bundler or external app; and live on a feature branch until the user authorizes a merge.

## Selected approach

Use a dedicated Online Store 2.0 page template containing a data-driven calculator section. Keep calculation logic, browser rendering, presentation, and vehicle data in separate assets. This follows the theme's direct-CDN architecture, permits formula testing with Node's built-in test runner, and lets ORI replace vehicle specifications without rewriting the component.

An all-in-one Liquid section was rejected because it would mix data, formulas, DOM rendering, and styling in one large file. An embedded third-party app was rejected because it would add an unnecessary runtime and maintenance dependency.

## Branch and repository constraints

- Work on `codex/gvm-calculator`, created from local `main` at commit `96f24a1`.
- Do not merge into `main` or push without explicit authorization.
- Preserve the existing untracked `AGENTS.md` and `full_page.html` files.
- Do not modify `config/settings_data.json`.
- The theme has no package manager or build step; production assets are committed directly.

## Files and responsibilities

- `sections/ori-gvm-load-calculator.liquid`: semantic calculator shell, theme settings, translated labels, asset URLs, and section-scoped configuration.
- `assets/ori-gvm-calculator-engine.js`: side-effect-free calculations and status classification. Exposes a browser global and a CommonJS export for tests.
- `assets/ori-gvm-calculator.js`: custom-element controller, data loading, state updates, DOM rendering, accessibility behavior, and guided tour.
- `assets/ori-gvm-calculator.css`: responsive component styles using existing ORI variables and theme color-scheme variables.
- `assets/ori-gvm-calculator-data.json`: replaceable vehicle, upgrade, and accessory dataset.
- `templates/page.gvm-calculator.json`: page template containing the calculator section.
- `locales/en.default.json`: static calculator interface and error strings.
- `tests/ori-gvm-calculator-engine.test.cjs`: deterministic formula and threshold tests run with `node --test`.
- `tests/fixtures/ori-gvm-calculator.html`: browser fixture used for interaction and responsive verification without a Shopify preview store.

## Initial dataset policy

The first data asset will reproduce the eight public reference vehicles and their published baseline, limit, upgrade, and accessory values so the completed feature can be exercised end to end. The interface will call all results estimates and display an ORI-specific disclaimer stating that the tool does not replace weighbridge measurements, compliance plates, manufacturer documentation, or professional assessment.

The data will not be described as ORI-certified. ORI's live product range includes additional American platforms not covered by the reference dataset, and their specifications must be added only from client-approved figures. All vehicle data remains isolated in one JSON file for that replacement.

## User experience

### Initial state

The page opens with an ORI-branded heading, explanatory copy, disclaimer, optional image, and a required vehicle selector. Selecting a vehicle acknowledges the disclaimer, hides the introduction, and reveals the calculator. Clearing the selector restores the introduction and resets the current simulation.

### Calculator state

The selected vehicle view contains:

1. Vehicle heading, quote/pricing link, and tutorial replay control.
2. Factory and available GVM/towing upgrade radio options.
3. ATM and TBM number inputs.
4. Passenger and rear-cargo weight inputs.
5. Accessory checkboxes grouped into front, middle, and rear zones.
6. A summary showing current legal limits and entered trailer values.
7. Compliance chips for ATM, TBM, vehicle GVM, and combined GCM.
8. Circular front-axle, rear-axle, and ATM indicators; a vertical TBM indicator; and horizontal GVM/GCM indicators.

Changing any input or upgrade recalculates every dependent result immediately. Selecting an upgrade changes legal limits but preserves the user's entered load and accessory state so the improvement can be compared directly.

### Status behavior

- Green: value is below 95% of the applicable limit.
- Amber: value is at or above 95% and no greater than the limit.
- Red: value exceeds the limit.
- Indicators may visually show an over-limit segment while their accessible label reports the uncapped percentage.
- Empty numeric inputs are treated as zero. Negative and non-finite values are normalized to zero.

### Guided tour

On the first vehicle selection, a five-step modal tour explains Trailer and Hitch, Occupants and Cargo, Accessories, Summary and Visuals, and Upgrade Options. It supports Next, Back, Skip, Close, Escape, focus restoration, and a replay link. Completion is stored in versioned local storage so a future tour revision can run again.

## Calculation model

All calculations use kilograms.

For a mass placed at a normalized longitudinal ratio `r`:

- Front contribution = `mass * (1 - r)`
- Rear contribution = `mass * r`

Passenger weight uses ratio `0.45`; rear cargo uses `1.10`; each accessory can provide its own ratio. Ratios outside zero to one intentionally model weight transfer beyond an axle.

Tow-ball load transfers axle weight using the vehicle wheelbase and hitch overhang:

- Lever ratio = `hitch overhang / wheelbase`
- Front tow-ball contribution = `-TBM * lever ratio`
- Rear tow-ball contribution = `TBM * (1 + lever ratio)`

Vehicle mass is:

`baseline front + baseline rear + passengers + rear cargo + selected accessories + TBM`

Combined mass is:

`vehicle mass + max(0, ATM - TBM)`

ATM compares with towing capacity, TBM with tow-ball limit, vehicle mass with GVM, combined mass with GCM, and calculated axle weights with their selected factory or upgraded axle limits.

## Theme integration and visual design

- Reuse `--brand-display-font`, `--brand-body-font`, `--brand-teal`, and `--brand-black` supplied by `brand-guidelines.css`.
- Use the section's `color-<scheme>` class and existing container utilities.
- Keep the reference page's desktop hierarchy: controls on the left, a sticky results area on the right, and full-width accessories below.
- On small screens, stack the selector, heading, summary, visuals, inputs, upgrades, and accessories in a logical reading order.
- Unlike the reference page, visual indicators and summary chips must wrap without horizontal page overflow at 320 CSS pixels.
- Provide section settings for heading, introduction, disclaimer, image, quote label/link fallback, color scheme, container width, warning threshold, tutorial toggle, and vertical padding.

## Accessibility

- Use a labelled `<select>`, `<fieldset>` and `<legend>` groups, native radio buttons, native checkboxes, and labelled numeric inputs.
- Use `aria-live="polite"` for recalculated summary status.
- SVG indicators expose descriptive accessible names containing current value, limit, and percentage.
- Status never relies on color alone; each chip includes text and an icon/label.
- The tutorial behaves as a modal dialog with focus containment, Escape handling, focus restoration, and reduced-motion support.
- Touch targets are at least 44 CSS pixels where practical, and visible focus styling uses the ORI teal accent.

## Error handling

- Show a loading state while the JSON asset is fetched.
- Show a section-level error with a retry button when loading or JSON validation fails.
- Ignore malformed accessories and upgrades rather than crashing the entire simulator.
- Disable the calculator and identify a vehicle record as unavailable when required baseline or limit fields are missing.
- Missing quote URLs use the section-level contact-page fallback.

## Verification

1. Write engine tests before implementation and observe them fail because the engine does not yet exist.
2. Cover baseline totals, accessory position ratios, passenger/cargo distribution, tow-ball leverage, GVM/GCM totals, upgrade limit selection, invalid numeric normalization, and 95%/over-limit status thresholds.
3. Run `node --test tests/ori-gvm-calculator-engine.test.cjs` after each engine change.
4. Validate all changed Liquid, JSON template, locale, CSS, and JavaScript files with the Shopify theme validator required by the Shopify Liquid workflow.
5. Serve the browser fixture locally and verify initial state, vehicle selection, live recalculation, upgrade comparison, tutorial controls, retry state, and reset behavior with Playwright.
6. Capture and inspect desktop, tablet, and 390-pixel mobile screenshots, plus a 320-pixel overflow assertion.
7. Run `git diff --check`, parse every changed JSON file, and inspect the final diff and branch status before completion.

## Out of scope

- Publishing the page in Shopify Admin or assigning the template to a page record.
- Pushing the branch, opening a pull request, or merging to `main`.
- Claiming that the initial reference figures are ORI-certified.
- Creating new ORI product, collection, metafield, or vehicle records.
