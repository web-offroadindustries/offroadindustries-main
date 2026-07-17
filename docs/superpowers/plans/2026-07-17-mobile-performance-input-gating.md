# Mobile Performance Input Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent automated scrolls from activating deferred homepage work while preserving every genuine visitor input path and improving mobile slideshow image selection.

**Architecture:** A shared event contract is expressed identically in the slideshow component and the two inline third-party loaders. Existing fixture tests exercise the component behavior, while static tests validate Liquid-owned loaders and responsive image candidates.

**Tech Stack:** Shopify Liquid, browser JavaScript, Node.js test runner, Playwright Chromium/WebKit, Lighthouse.

## Global Constraints

- Preserve homepage slideshow autoplay after genuine visitor interaction.
- Preserve arrows, dots, video slides, reduced-motion behavior, and all page layouts.
- Do not modify `config/settings_data.json` or Shopify app embeds.
- Push only after static, Chromium, WebKit, live-route, and Lighthouse verification.

---

### Task 1: Lock the physical-input contract

**Files:**
- Modify: `tests/core-web-vitals-contract.test.cjs`
- Modify: `tests/core-web-vitals-inline-loaders.test.cjs`
- Modify: `tests/core-web-vitals.spec.js`

**Interfaces:**
- Consumes: `SlideshowComponent._autoplayInteractionEvents` and the two `interactionEvents` arrays in `layout/theme.liquid`.
- Produces: A required event set of `wheel`, `pointerdown`, `touchstart`, and `keydown` with no `scroll` or `click` triggers.

- [ ] **Step 1: Write failing static and browser tests**

Add assertions that generic programmatic scroll does not change `selectedIndex`, while a wheel event starts deferred autoplay, and assert the exact event set in both Liquid loaders.

- [ ] **Step 2: Verify RED**

Run `node --test tests/core-web-vitals-contract.test.cjs tests/core-web-vitals-inline-loaders.test.cjs` and the focused Chromium test; expect failures because current arrays contain `scroll` and `click` and omit `wheel` and `touchstart`.

- [ ] **Step 3: Implement the minimum event changes**

Replace each current array with `['wheel', 'pointerdown', 'touchstart', 'keydown']` without changing loader functions, autoplay timers, or media behavior.

- [ ] **Step 4: Verify GREEN**

Run the focused Chromium test and the two Node contract files; expect all tests to pass.

### Task 2: Add the missing mobile image candidate

**Files:**
- Modify: `tests/core-web-vitals-template.test.cjs`
- Modify: `sections/slideshow.liquid`

**Interfaces:**
- Consumes: Shopify `image_tag` `widths` lists for desktop and mobile slideshow images.
- Produces: A `1200` candidate between `1100` and `1500` in both lists.

- [ ] **Step 1: Write a failing template test**

Assert that both slideshow image `widths` strings contain `375, 550, 750, 1100, 1200, 1500, 1780, 2000, 3000, 3840`.

- [ ] **Step 2: Verify RED**

Run `node --test tests/core-web-vitals-template.test.cjs`; expect failure because `1200` is missing.

- [ ] **Step 3: Add the candidate**

Insert `1200` after `1100` in both `widths` strings in `sections/slideshow.liquid`.

- [ ] **Step 4: Verify GREEN**

Run `node --test tests/core-web-vitals-template.test.cjs`; expect all template tests to pass.

### Task 3: Cross-browser and deployment verification

**Files:**
- Verify: `assets/slideshow-component.js`
- Verify: `layout/theme.liquid`
- Verify: `sections/slideshow.liquid`
- Verify: `tests/`

**Interfaces:**
- Consumes: The updated event and image contracts.
- Produces: Verified main-branch deployment with a measured mobile performance improvement.

- [ ] **Step 1: Run complete local suites**

Run the 23 Node/static tests, 21 Chromium tests, 21 Desktop WebKit tests, 21 iPhone WebKit tests, and 36 GVM calculator checks with zero failures.

- [ ] **Step 2: Validate theme syntax**

Run JavaScript syntax checks, `git diff --check`, and Shopify Theme Check on the touched Liquid files; compare any finding against the pre-change baseline.

- [ ] **Step 3: Run live route coverage**

Exercise representative homepage, landing, collection, product, search, cart, and content routes in Chrome and WebKit desktop/mobile profiles, checking visible main content, controls, page errors, and horizontal overflow.

- [ ] **Step 4: Commit and push**

Stage only the design, plan, three production files, and their tests; commit with `perf: ignore synthetic scroll activation`; push `main` to `origin`.

- [ ] **Step 5: Verify deployment and performance**

Confirm remote SHA parity, wait for the CDN asset versions to change, rerun live smoke tests, and rerun the same mobile Lighthouse command to compare score, LCP, TBT, and CLS against baseline.

## Self-Review

The plan covers every design requirement, contains no placeholders, uses consistent event names, and keeps each production change paired with a failing regression test before implementation.
