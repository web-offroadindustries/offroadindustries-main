# Theme guide

Developer notes for working on this theme: architecture, commands and the conventions worth knowing before changing anything. New maintainers should read `DEVELOPER-HANDOVER.md` first for the full custom-system inventory, repository state, risks, and stabilization plan.

## Theme Overview

This is the **Zest v9.1.1** Shopify theme by FoxEcom, customized as "Gusto-Theme" for ORI Offroad Industries (Australian GVM/GCM vehicle upgrades). It is a native Shopify theme — no bundler, no root `package.json`, no framework. Files are served directly via Shopify's CDN.

Two layers live side by side, and telling them apart matters:

- **Zest framework files** — stock theme code (`theme.css`, `base.css`, `main-product.liquid`, `cart.js`, …). A FoxEcom theme update overwrites these, so customizations here are fragile.
- **ORI custom files** — commonly prefixed `ori-`, `gvm-`, `dealer-`, `b2b-`, or `so-`. These generally survive a theme update, but ORI behavior also exists in modified Zest core files, so every upstream update still requires a manual merge and regression test.

Zest docs: https://docs.foxecom.com/zest-theme/

## Commands

Development requires [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
shopify theme dev --store=<store-url>   # local dev server (hot reload via CDN proxy)
shopify theme push                       # overwrite remote
shopify theme pull                       # overwrite local
shopify theme push --theme=<theme-id>    # deploy to a specific theme
```

### CSS bundle build — the theme's only build step

`assets/critical-bundle.css` and `assets/header-bundle.css` are **generated**, not source. PageSpeed flagged eight render-blocking stylesheets; all are above the fold so none can be deferred without a flash of unstyled content, and combining them keeps the same bytes and cascade in fewer requests.

After editing `theme.css`, `base.css`, `grid.css`, `components.css`, `header.css`, or `site-nav.css` — **and after any FoxEcom Zest theme update** — run:

```bash
node tools/build-css-bundles.js          # rebuild
node tools/build-css-bundles.js --check  # exits 1 if stale
```

A Zest update overwrites the source files and the bundle would then silently serve the old CSS with nothing erroring. Run `--check` before any push touching these files. Note the source files are *still* loaded individually by `password.liquid` and `theme.pagefly.liquid`, which do not use the bundles.

### Tests

The repository currently tracks 14 test/config/fixture files under `tests/`. Additional local dependencies and generated test output remain ignored, so a fresh clone may need Playwright and its browsers installed before the browser suites run. The suite is a developer-run safety net rather than enforced CI.

```bash
# Node contract tests — no browser, run from the theme root
node --test tests/ori-gvm-calculator-engine.test.cjs
node --test tests/gvm-review-directory.test.cjs
node --test tests/core-web-vitals-contract.test.cjs

# Playwright — run from inside tests/, each suite has its own config
cd tests
npx playwright test -c ori-gvm-playwright.config.js            # GVM calculator, 3 browsers
npx playwright test -c core-web-vitals-playwright.config.js    # CWV against local fixture
npx playwright test -c core-web-vitals-staging.config.js       # CWV against live staging URL

# Single test by name
npx playwright test -c ori-gvm-playwright.config.js -g "payload"
```

The two fixture-based Playwright configs boot `python -m http.server 4173` from the theme root and drive a static page in `tests/fixtures/` — so they exercise the real asset JS without a Shopify store.

The `.test.cjs` files are **contract tests**: they read `.liquid` and `.json` files off disk and assert on their structure (section schema keys, template section order, inline loader markup). They catch a template or schema edit that breaks an agreed contract. When you change a section's schema or a JSON template covered by one, run it.

## Shopify GitHub integration — read before editing JSON

The store is connected to this repo via Shopify's GitHub integration. It **commits directly to `main`** with the message `Update from Shopify for theme Gusto-Theme/main`. Those commits carry:

- `config/settings_data.json` — live merchant customizer values (this file **is tracked**, despite the stale `.gitignore` entry; that entry has no effect on an already-tracked file)
- `templates/*.json` — any template the merchant touched in the theme editor

Consequences:

- A JSON template or a theme setting you edit locally can be overwritten by the merchant editing the same page in the customizer, and vice versa. Pull before editing JSON.
- When a feature "vanishes," check `settings_data.json` history before hunting through code — it is often a customizer toggle, not a regression.
- 50 of the 70 JSON templates carry a leading `/* auto-generated */` comment block, which makes them **invalid JSON for standard parsers**. Strip it before parsing — see the `parseShopifyJson` helper in `tests/gvm-review-directory.test.cjs`.

## Architecture

| Directory | Contents |
|-----------|----------|
| `sections/` | ~121 page sections (main building blocks) |
| `snippets/` | ~260 partials rendered via `{% render %}` |
| `templates/` | ~117 templates; JSON except `templates/customers/*.liquid` |
| `assets/` | Flat — all CSS, JS, JSON data, images (no subdirectories) |
| `config/` | `settings_schema.json` (schema) + `settings_data.json` (live values) |
| `layout/` | `theme.liquid`, `password.liquid`, `theme.pagefly.liquid` |
| `locales/` | 52 translation files |
| `tools/` | `build-css-bundles.js` |
| `scripts/` | One-off Node scripts hitting the Shopify Admin API (product/collection creation, redirect import); need `scripts/.env` |
| `docs/`, `.ori-audit/` | Data-maintenance docs and local audit snapshots (`.ori-audit/` is gitignored and is not available in a fresh clone) |

### Section pattern

```liquid
{{ 'ori-package-grid.css' | asset_url | stylesheet_tag }}   {# ORI sections only #}
{%- liquid
  assign section_id = section.settings.custom_id | default: section.id
  assign container = section.settings.container
-%}
<div id="{{ section_id }}"
  class="f-section-padding color-{{ section.settings.color_schema }}"
  data-section-type="collapsible-tabs"
  style="--section-padding-top: {{ section.settings.padding_top }}px;">
```

- **ORI custom sections load their own CSS/JS at the top of the section file** via `asset_url`. Zest core sections rely on `theme.liquid` instead. Follow the local convention when adding a new ORI section — it keeps per-page weight down and survives theme updates.
- CSS custom properties set inline for per-section overrides; `color-*` applies a palette class; `data-section-type` is the JS init hook; `f-section-padding` is a global utility.
- Section settings live in the `{% schema %}` block at the bottom of each file.

### JavaScript

No bundler — `<script defer>` tags in `theme.liquid`. Globals: `window.FoxTheme`, `FoxThemeSettings`, `FoxThemeEvents` (pub/sub), `FoxThemeCartHelpers`, `Store.id`.

Components are Web Components:

```javascript
class CartRemoveButton extends HTMLElement {
  connectedCallback() { /* attach listeners */ }
}
customElements.define('cart-remove-button', CartRemoveButton);
```

Cross-component messaging goes through the event bus, with names in `PUB_SUB_EVENTS` (`global.js`):

```javascript
FoxThemeEvents.subscribe(PUB_SUB_EVENTS.cartUpdate, callback);
FoxThemeEvents.publish(PUB_SUB_EVENTS.cartUpdate, payload);
```

Core files: `global.js`, `cart.js` / `cart-drawer.js`, `animations.js`, `product-form.js` / `variants-picker.js`, `facets.js`, `quick-view.js`.

### CSS

Plain CSS, no preprocessor. Loading in `theme.liquid`: `critical-bundle.css` and `header-bundle.css` render-blocking; `non-critical.css`, `modal-component.css`, `drawer-component.css`, `flickity-component.css` preload-and-swap; `rtl.css` when `settings.rtl_enable`. Typography and color come entirely from `settings_schema.json`, surfaced as CSS variables (`--color-btn-bg`, `--color-link`, `--section-padding-top`).

## GVM/GCM system — the main ORI feature

The bulk of the custom work. ORI sells GVM (Gross Vehicle Mass) upgrade packages per vehicle, staged 1–6.

**Load calculator** (`sections/ori-gvm-load-calculator.liquid`) — deliberately split in two:

- `assets/ori-gvm-calculator-engine.js` — **pure calculation, UMD-wrapped** so it loads as `window.ORIGvmCalculatorEngine` in the browser *and* `require()`s in Node. That is what makes `tests/ori-gvm-calculator-engine.test.cjs` possible. Keep it free of DOM access.
- `assets/ori-gvm-calculator.js` — the `<ori-gvm-calculator>` custom element, all DOM.
- `assets/ori-gvm-calculator-data.json` — vehicles, `factory_specs`, per-stage `upgrades`, accessories. Fetched at runtime via `data-source-url`.

**Editing calculator data**: read `docs/gvm-calculator-data.md` first — it documents required fields, the `position_ratio` conventions for accessory placement, the rule that `baseline_front_kg + baseline_rear_kg` must equal published kerb weight, and the warning not to use spring/load/tow ratings as accessory masses. The section also exposes theme-editor blocks (Custom specification / Custom accessory) so the client can add options without touching theme files — prefer that path for client-requested additions.

**Page families** — a GVM package page is composed from `ori-gvm-hero`, `ori-gvm-benefits`, `ori-gvm-included`, `ori-gvm-steps`, `ori-gvm-weight-chart`, `ori-gvm-approved`, `ori-package-grid`, `ori-faq`, `ori-installer-network`, plus `gvm-comparison` and `ori-gvm-review-directory`. Templates come in per-vehicle variants (`page.ram-2500-6thgen-gvm-package.json`, `collection.silverado-2500hd-gvm.json`, …). Adding a vehicle usually means copying the closest existing template, not writing new sections.

Spec tables are transcribed from client-supplied sheets — recent history is full of corrections aligning tables to "the client's NB1 sheet." Match the source document exactly rather than normalizing it.

## B2B wholesale portal

Fully merged into `main` (the `feature/b2b-setup` branch is stale — do not work there).

- `sections/b2b-catalog-page.liquid` — gated catalog at `/pages/b2b-catalog`
- `assets/b2b-shipping-calc.js` — `<b2b-shipping-calc>` custom element; prices **the current cart** via `/cart/shipping_rates.json` against live Machship rates. It deliberately does not mutate the cart; an earlier version added and removed the product to get a quote, which mispriced multi-item carts and could strand an item.
- `assets/b2b-portal.css` — stock badges (`--in-stock` >10, `--low-stock` 1–10, `--out-of-stock`), catalog table, pagination

Auth check, used throughout including `snippets/product-card.liquid`:

```liquid
{% if customer.b2b? or customer.tags contains 'b2b' %}
```

Wholesale customers now check out online like retail customers; the difference is price and the freight estimator. `ORI-B2B-Portal-Guide.md` is the client-facing walkthrough of the intended behaviour.

## Custom forms

`gvm-order-form`, `warranty-claim-form`, `dealer-enquiry-form`, `dealer-split-content-form`, `support-ticket-form`, and `contact-form-v2/v3/v4` all wrap Shopify's `{% form 'contact' %}`, so submissions arrive as store enquiry emails. Each offers a **multi-step or single-page layout** toggle in the theme editor — the client wants these to read as structured, numbered steppers rather than plain field stacks.

Shopify contact forms cannot carry attachments, so `warranty-claim-form.liquid` uploads photos to **Cloudinary** client-side as they are picked and writes the resulting links into the message body. `ORI-Forms-and-Calculator-Guide.md` documents the fields and the client's open questions.

## Other ORI subsystems

- **Pre-order / stock line** — `snippets/ori-preorder-state.liquid` outputs `pre` for a variant selling past zero. It exists because `variant.available` stays true under `inventory_policy: continue`, and `quantity_rule_soldout` switches itself off in exactly that case. It only suppresses the stock line; a previous version also hid the buy button, which was reverted because it took the Selleasy add-on upsell with it. Read the header comment before changing it.
- **Special orders** — `so-special-order.js` / `snippets/so-special-order-modal.liquid`
- **SEO structured data** — `ori-schema-product`, `ori-schema-breadcrumb`, `ori-schema-local-business`, all rendered from `layout/theme.liquid`
- **Dealer locator** — `sections/dealer-locator.liquid` + `assets/google-map.js`

## Third-Party Integrations

| Integration | Where |
|-------------|-------|
| **Klaviyo** | `dealer-klaviyo-worker.js`; preconnect in `theme.liquid` |
| **Cloudinary** | `sections/warranty-claim-form.liquid` (photo uploads) |
| **Machship** | via Shopify carrier rates, consumed by `b2b-shipping-calc.js` |
| **Bold Product Options** | `bold-options-form-linker.js`, `bold-options-position-fix.js` |
| **PageFly** | `layout/theme.pagefly.liquid`, `templates/page.pagefly-*.json` |
| **Spice Gems** | `templates/product.spicegems-addon.liquid` |
| **Google Tag Manager** | GTM-PNBCJ3H in `theme.liquid` |
| **Podium** | preconnect in `theme.liquid` |

## Conventions

- **Commit messages** describe the user-visible outcome, not the mechanism: "Stop fetching a 151 KiB flag sprite to draw two flags", "Let wholesale customers order online instead of contacting us".
- **Performance is a standing constraint.** Changes have been reverted for adding weight ("Revert the promotion sizes fix, it made the page 38 KB heavier"). `lighthouse-perf-preview.json` and `.ori-audit/lighthouse-*` hold baselines.
- **UI strings** go in `locales/en.default.json` and are referenced as `{{ 'key.path' | t }}`; settings labels use the `t:settings_schema.*` prefix. Calculator strings live under `gvm_calculator.*`.
- `sections/dealer-conversion.liquid.bak` and `.new` are leftover working copies, not live sections. Shopify ignores them; do not edit them expecting an effect.
