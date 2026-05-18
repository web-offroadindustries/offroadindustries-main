# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Theme Overview

This is the **Zest v9.1.1** Shopify theme by FoxEcom, customized as "Gusto-Theme" for ORI Offroad Industries. It is a native Shopify theme — there is no build step, no package.json, and no bundler. Files are served directly via Shopify's CDN.

- Documentation: https://docs.foxecom.com/zest-theme/
- Support: https://help.foxecom.com

## Development Commands

Development requires [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
# Start local development server (hot reload via Shopify CDN proxy)
shopify theme dev --store=<store-url>

# Push theme to Shopify (overwrite remote)
shopify theme push

# Pull latest from Shopify (overwrite local)
shopify theme pull

# Deploy to a specific environment/theme
shopify theme push --theme=<theme-id>
```

There are no lint, test, or build commands — changes are validated by Shopify CLI during `dev` or `push`.

## Architecture

### Directory Layout

| Directory | Purpose |
|-----------|---------|
| `sections/` | ~99 configurable page sections (main building blocks) |
| `snippets/` | 200+ reusable partials rendered via `{% render %}` |
| `templates/` | 49 JSON templates mapping sections to page types |
| `assets/` | Flat directory of all CSS, JS, and image files (no subdirectories) |
| `config/` | `settings_schema.json` (schema) and `settings_data.json` (live values) |
| `layout/` | `theme.liquid` (main wrapper), `password.liquid`, `theme.pagefly.liquid` |
| `locales/` | 48 translation files (`en.default.json`, etc., including RTL languages) |

### Templates

All templates use the modern **JSON format** (not `.liquid`). Each template defines which sections appear on the page:

```json
// templates/index.json
{
  "sections": { "main": { "type": "main-home", ... } },
  "order": ["main", ...]
}
```

Multiple template variants exist for the same page type (e.g., `collection.banner-left.json`, `collection.banner-right.json`). Customer account templates under `templates/customers/` still use `.liquid` format.

Notable custom templates:
- `templates/page.b2b-catalog.json` — B2B wholesale portal (see B2B section below)
- `templates/page.dealer-landing.json` — Dealer landing pages
- `templates/product.spicegems-addon.liquid` — Spice Gems app integration
- `templates/page.*.json` — Various GVM package, contact, and lookbook variants

### Sections Pattern

Every section follows a consistent structure:

```liquid
{%- liquid
  assign section_id = section.settings.custom_id | default: section.id
  assign animation_effect = settings.animations
  assign container = section.settings.container
-%}

<div id="{{ section_id }}"
  class="f-section-padding color-{{ section.settings.color_schema }}"
  data-section-type="collapsible-tabs"
  style="--section-padding-top: {{ section.settings.padding_top }}px;">
```

Key conventions:
- CSS custom properties (`--section-padding-top`) set inline for per-section overrides
- `color-{{ section.settings.color_schema }}` applies theme color palette class
- `data-section-type` used by JS to initialize section-specific behavior
- `f-section-padding` is a global utility class

### JavaScript Architecture

**No module bundler** — JS files are loaded via `<script defer>` tags in `theme.liquid`.

**Global namespace:**
```javascript
window.FoxTheme           // Main namespace
window.FoxThemeSettings   // Theme config passed from Liquid
window.FoxThemeEvents     // Pub/Sub event bus
window.FoxThemeCartHelpers // Cart utilities
window.Store.id           // Shop ID (set in theme.liquid)
```

**Component pattern** — Web Components (Custom Elements):
```javascript
class CartRemoveButton extends HTMLElement {
  connectedCallback() { /* attach listeners */ }
}
customElements.define('cart-remove-button', CartRemoveButton);
```

**Event bus** — used for cross-component communication:
```javascript
FoxThemeEvents.subscribe(PUB_SUB_EVENTS.cartUpdate, callback);
FoxThemeEvents.publish(PUB_SUB_EVENTS.cartUpdate, payload);
```

Key JS files:
- `global.js` — Utilities and `PUB_SUB_EVENTS` event name constants
- `cart.js` — Cart API wrapper; `cart-drawer.js` — Cart drawer UI
- `animations.js` — Intersection observer for scroll animations
- `product-form.js` — Variant selection; `variants-picker.js` — Variant UI
- `facets.js` — Collection filtering; `quick-view.js` — Quick view modal
- `age-verifier.js` — Age gate
- `b2b-shipping-calc.js` — B2B shipping calculator custom element
- `bold-options-form-linker.js` / `bold-options-position-fix.js` — Bold Product Options integration
- `dealer-klaviyo-worker.js` — Dealer-specific Klaviyo integration
- `so-special-order.js` — Special order handling

### CSS Architecture

**No preprocessor** — plain CSS with custom properties.

Asset loading in `theme.liquid`:
- **Critical** (render-blocking): `base.css`, `theme.css`, `grid.css`, `components.css`
- **Deferred** (preload + swap): `non-critical.css`, `modal-component.css`, `drawer-component.css`, `flickity-component.css`
- **B2B**: `b2b-portal.css` — B2B catalog table, stock badges, and pagination styles
- **RTL**: `rtl.css` conditionally loaded when `settings.rtl_enable` is true

CSS custom properties are defined globally and overridden inline per-section:
```css
--color-btn-bg, --color-link, --section-padding-top
```

Typography and color are entirely controlled via `config/settings_schema.json` and surfaced as CSS variables.

## Settings System

- `config/settings_schema.json` — defines all theme customizer settings (typography, colors, layout, product cards, cart behavior); uses `t:settings_schema.*` translation keys
- `config/settings_data.json` — **live merchant values**; do not commit — contains store-specific configuration
- Section-level settings are defined inline at the bottom of each `.liquid` section file under `{% schema %}`

## B2B Wholesale Feature

The B2B catalog is a gated wholesale portal living on the `feature/b2b-setup` branch.

**Key files:**
- `sections/b2b-catalog-page.liquid` — Main catalog section; checks `customer.b2b?` for auth, displays product table with variant, SKU, stock level, retail price, and B2B pricing
- `snippets/b2b-shipping-calc.liquid` — Wrapper for the shipping rate calculator
- `assets/b2b-shipping-calc.js` — Custom element `<b2b-shipping-calc>` that calculates shipping via `/cart/shipping_rates.json`
- `assets/b2b-portal.css` — Stock badge variants (`.b2b-stock-badge--in-stock`, `--low-stock`, `--out-of-stock`), catalog table, pagination
- `templates/page.b2b-catalog.json` — Page template at `/pages/b2b-catalog`

**Auth pattern used throughout:**
```liquid
{% if customer.b2b? or customer.tags contains 'b2b' %}
  {# Show B2B pricing / content #}
{% endif %}
```

`snippets/product-card.liquid` uses this same pattern to conditionally show B2B pricing on collection pages.

## Third-Party Integrations

Integrations are wired up in `layout/theme.liquid` and relevant section/snippet files:

| Integration | Where |
|-------------|-------|
| **Klaviyo** | `dealer-klaviyo-worker.js`; preconnect in `theme.liquid` |
| **Podium** | Preconnect in `theme.liquid` |
| **Bold Product Options** | `bold-options-form-linker.js`, `bold-options-position-fix.js` |
| **PageFly** | `layout/theme.pagefly.liquid`, `templates/page.pagefly-*.json` |
| **Spice Gems** | `templates/product.spicegems-addon.liquid` |
| **Google Tag Manager** | GTM-PNBCJ3H, loaded in `theme.liquid` |
| **Google Maps** | `assets/google-map.js` |

## Localization

Translation strings live in `locales/en.default.json`. To add/modify UI text, update the relevant locale file and reference via `{{ 'key.path' | t }}` in Liquid. Settings schema labels use the `t:settings_schema.*` prefix pattern.
