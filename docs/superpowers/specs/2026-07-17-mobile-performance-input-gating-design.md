# Mobile Performance Input Gating Design

## Goal

Improve mobile Lighthouse performance without changing layout or storefront functionality by preventing programmatic page scrolling from starting deferred homepage autoplay, Google Tag Manager, or Podium.

## Evidence

- Mobile Lighthouse scored 57 with FCP 2.6s, LCP 13.9s, TBT 330ms, and CLS 0.
- The reported LCP was a later slideshow image that remained `loading="lazy"` and `fetchpriority="low"`.
- A passive browser visit stayed on slide 0 and did not request GTM or Podium.
- Calling `window.scrollBy()` without user input advanced the slideshow and requested both deferred third-party scripts.
- Lighthouse reported the active slideshow image at 1500px where a 1200px candidate would satisfy the emulated mobile DPR with less transfer.

## Approaches Considered

1. **Physical-input gating (selected):** Listen for `wheel`, `pointerdown`, `touchstart`, and `keydown`, which cover mouse, trackpad, touch, pen, and keyboard users while ignoring script-generated scrolls and clicks.
2. **Debounce generic scroll:** Delay loading after a scroll event, but automated audits can still wait through the debounce and trigger the same work.
3. **Disable autoplay or app scripts:** Produces a larger score change but violates the requirement to preserve storefront behavior and marketing functionality.

## Design

- Use the same physical-input event list in `assets/slideshow-component.js` and both deferred loaders in `layout/theme.liquid`.
- Keep autoplay timing, video handling, arrows, dots, reduced-motion behavior, and hover/focus pause unchanged.
- Keep GTM and Podium available immediately after the first genuine input; only programmatic scroll/click will no longer activate them.
- Add `1200` to both slideshow image `widths` lists in `sections/slideshow.liquid` so mobile browsers do not jump from 1100px to 1500px for a roughly 1170-device-pixel target.
- Do not alter Shopify app embeds, `content_for_header`, merchant settings, or visible markup.

## Validation

- Static contracts must reject `scroll` and `click` in deferred interaction arrays and require the four physical-input events.
- Browser regression coverage must prove programmatic scroll remains passive while wheel, pointer, touch, and keyboard input can start autoplay.
- Existing Chromium, Desktop Safari, iPhone Safari, GVM calculator, and static suites must remain green.
- Live smoke coverage will sample homepage, collection, product, search, cart, blog/article when available, and priority landing pages without horizontal overflow or console/page errors.
- Post-deploy mobile Lighthouse will be compared with the captured baseline using the same URL, viewport, and simulated throttling.

## Scope Review

The design contains no placeholders, does not change visual layout, preserves required autoplay, and limits production edits to the three files that own the diagnosed behavior.
