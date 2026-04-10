# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Theme Overview

This is the **Zest v9.1.1** Shopify theme by FoxEcom, customized as "Gusto-Theme". It is a native Shopify theme — there is no build step, no package.json, and no bundler. Files are served directly via Shopify's CDN.

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
| `sections/` | 97 configurable page sections (main building blocks) |
| `snippets/` | 250 reusable partials rendered via `{% render %}` |
| `templates/` | 54 JSON templates mapping sections to page types |
| `assets/` | Flat directory of all CSS and JS files (no subdirectories) |
| `config/` | `settings_schema.json` (schema) and `settings_data.json` (live values) |
| `layout/` | `theme.liquid` (main wrapper), `password.liquid` |
| `locales/` | 30+ translation files (`en.default.json`, etc.) |

### Templates

All templates use the modern **JSON format** (not `.liquid`). Each template defines which sections appear on the page:

```json
// templates/index.json
{
  "sections": { "main": { "type": "main-home", ... } },
  "order": ["main", ...]
}
```

Multiple template variants exist for the same page type (e.g., `collection.banner-left.json`, `collection.banner-right.json`).

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

Key JS files: `global.js` (utilities), `cart.js` (cart drawer logic), `animations.js` (intersection observer), `product-form.js` (variant selection), `age-verifier.js` (age gate).

### CSS Architecture

**No preprocessor** — plain CSS with custom properties.

Asset loading in `theme.liquid`:
- **Critical** (render-blocking): `base.css`, `theme.css`, `grid.css`, `components.css`
- **Deferred** (preload + swap): `non-critical.css`, `modal-component.css`, `drawer-component.css`, `flickity-component.css`
- **RTL**: `rtl.css` conditionally loaded when `settings.rtl_enable` is true

CSS custom properties are defined globally and overridden inline per-section:
```css
--color-btn-bg, --color-link, --section-padding-top
```

Typography and color are entirely controlled via `config/settings_schema.json` and surfaced as CSS variables.

## Settings System

- `config/settings_schema.json` — defines all theme customizer settings (typography, colors, layout, product cards, cart behavior)
- `config/settings_data.json` — **live merchant values**, gitignored by default; do not commit unless intentional
- Section-level settings are defined inline at the bottom of each `.liquid` section file under `{% schema %}`

## Localization

Translation strings live in `locales/en.default.json`. To add/modify UI text, update the relevant locale file and reference via `{{ 'key.path' | t }}` in Liquid.
