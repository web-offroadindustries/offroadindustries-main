# Core Web Vitals Staging Optimization Design

Date: 2026-07-13
Working branch: `optimizing/core-web-vitals-staging`
Base: latest `origin/main` (`6c90d47`)
Deployment target: Shopify staging theme only

## Goal

Improve homepage mobile and desktop Core Web Vitals without changing `main`, removing the client's slideshow autoplay, or breaking product options, analytics, chat, or the vehicle finder.

The work is limited to performance and Core Web Vitals. Accessibility, SEO, and general visual redesign are outside this change.

## Baseline Evidence

The supplied Lighthouse captures reported:

- Mobile: performance 57, FCP 5.3 s, LCP 26.3 s, TBT 100 ms, CLS 0.019.
- Desktop: performance 52, FCP 0.6 s, LCP 3.0 s, TBT 600 ms, CLS 0.

A fresh 2026-07-13 audit of the production homepage reported:

- Mobile: performance 20, FCP 2.3 s, LCP 12.2 s, TBT 4,490 ms, CLS 0.244.
- Desktop: performance 45, FCP 0.8 s, LCP 3.0 s, TBT 830 ms, CLS 0.009.

Single Lighthouse scores vary with network conditions and third-party behavior, so acceptance will use repeat runs plus resource and behavior assertions.

The fresh trace identified these root causes:

1. The homepage carousel advances after five seconds. A later lazy, low-priority slide can then become the LCP candidate.
2. When autoplay reaches the video slide, it downloads a 22 MB 1080p video during the initial passive visit.
3. Theme-owned GTM and Podium loaders have eight-second fallbacks, so both execute even when the visitor has not interacted.
4. The EasySearch vehicle finder renders late and caused the largest mobile layout shift.
5. Bold Product Options receives global high-priority connection and preload hints even on pages where it is not immediately required.
6. Automatic Discount, additional gtag/Facebook pixels, and other app-injected scripts remain significant third-party costs outside direct theme control.

## Approved Behavior

### Homepage slideshow

- Keep arrows and dots usable immediately.
- Keep the client's five-second autoplay interval.
- On the homepage only, arm autoplay after the first meaningful `scroll`, `pointerdown`, `click`, or `keydown` event.
- A visitor's first interaction starts automatic cycling; it does not immediately skip the current slide.
- Keep the first image eager with `fetchpriority="high"`.
- Keep later images lazy with low fetch priority.
- Keep video markup inside `deferred-media` and instantiate it only when its slide becomes active.
- Respect `prefers-reduced-motion: reduce` by leaving autoplay off while preserving manual controls.
- Other slideshow sections retain their existing autoplay behavior unless their new defer setting is explicitly enabled.

### GTM and Podium

- Keep the early `dataLayer` initialization.
- Remove the eight-second automatic network fallbacks.
- Load the theme-owned GTM container and Podium widget once after the first meaningful interaction.
- Remove `mousemove` as a trigger because incidental pointer movement is not meaningful engagement.
- Make both loaders idempotent and remove their remaining listeners after loading.
- Do not attempt to rewrite scripts injected by Shopify's `content_for_header` or app embeds.

### Vehicle finder layout stability

- Reserve responsive space for the homepage apps section containing the heading and EasySearch vehicle finder.
- Derive the mobile and desktop minimum heights from rendered staging measurements, not the screenshot alone.
- Scope the reservation to the homepage section ID so other app sections are unchanged.
- Prefer a small stable blank reservation if the third-party widget fails rather than collapsing the area and creating a late layout shift.

### Bold Product Options

- Preserve the global deferred Bold runtime because collection, search, cart, homepage quick-view, and product flows may depend on it.
- Restrict the `options.shopapps.site` preconnect and Bold script/style preload hints to product templates, where those resources are immediately required.
- Do not edit generated Bold or Shop Circle snippets.

## Component and Data Flow

### Slideshow opt-in

`sections/slideshow.liquid` gains an editable checkbox for interaction-deferred autoplay. It emits the requested autoplay delay as data while initializing Flickity with autoplay disabled when the checkbox is on. `templates/index.json` enables the checkbox for the homepage slideshow only.

`assets/slideshow-component.js` listens for the approved interaction events. Once the slider is ready and the first qualifying interaction occurs, it applies the stored delay and starts Flickity's player. The listener state handles either ordering: slider initialization before interaction or interaction before initialization. Disconnect cleanup removes listeners and timers.

Manual selection continues through the existing Flickity change event. When the selected slide contains `deferred-media`, the current `playVideo()` path instantiates and plays that video. No video URL is requested before selection.

### Interaction-owned third parties

The GTM and Podium loaders remain independent because they live in different document regions and have different insertion targets. Each uses its own `loaded` guard but the same meaningful interaction event set. No timeout path remains.

### Layout reservation

The homepage template supplies section-scoped CSS for the vehicle finder reservation. Staging browser measurements at mobile and desktop widths determine the final values before implementation is accepted.

## Failure Handling

- If Flickity initializes after the first interaction, stored interaction state starts autoplay as soon as the slider becomes ready.
- If Flickity never initializes, manual non-JavaScript fallback content remains visible and no polling loop runs indefinitely.
- If a slideshow video fails, the existing video error fallback returns to timed image-slide autoplay.
- Repeated interaction events cannot insert duplicate GTM or Podium scripts.
- A failed GTM or Podium request does not block theme rendering or navigation.
- Third-party vehicle-finder failure leaves a stable reserved region rather than shifting the content below it.

## Verification Strategy

Implementation follows test-first development.

### Static regression tests

Add Node tests that fail before the change and verify:

- The slideshow schema exposes interaction-deferred autoplay.
- The homepage enables it while retaining `autoplay: true` and the five-second interval.
- The first image remains eager/high priority and later images remain lazy/low priority.
- The video remains inside a deferred template.
- GTM and Podium have no timeout fallback and use idempotent interaction loaders.
- Bold preloads are product-template scoped while generated snippets remain unchanged.

### Browser behavior tests

Against the Shopify staging preview, verify mobile and desktop behavior:

- Before interaction, the active slide does not rotate and the video URL is absent from network requests.
- Arrows and dots work before autoplay starts.
- First interaction arms autoplay; the current slide remains for the configured interval and then advances.
- The video request begins only when its slide becomes active.
- GTM and Podium are absent before interaction and requested no more than once afterward.
- Reduced-motion mode preserves manual controls without starting autoplay.
- Product options still initialize on a representative product page, and cart/quick-view flows remain functional.
- The vehicle finder renders without pushing the following section enough to exceed CLS 0.1.

### Performance verification

Run at least three Lighthouse audits for each form factor against the same staging preview and report medians. Targets are:

- Mobile: LCP at or below 4.0 s, TBT at or below 1,000 ms, CLS below 0.1.
- Desktop: LCP at or below 2.5 s, TBT at or below 400 ms, CLS below 0.1.
- No initial 22 MB slideshow video transfer.
- No pre-interaction theme-owned GTM or Podium request.

If an app-injected script prevents a numeric target, the result must identify the responsible URL and quantify its cost rather than applying an unsafe theme workaround.

## Files Expected to Change

- `sections/slideshow.liquid`
- `assets/slideshow-component.js`
- `templates/index.json`
- `layout/theme.liquid`
- A focused static regression test under `tests/`
- A focused Playwright behavior test under `tests/`

No changes will be made to `config/settings_data.json`, generated Bold/Shop Circle snippets, or `main`.

## Rollout

1. Implement and verify on `optimizing/core-web-vitals-staging`.
2. Push only this branch.
3. Deploy or preview it on the Shopify staging theme.
4. Re-run mobile and desktop behavior and Lighthouse checks on staging.
5. Do not promote to `main` without a separate explicit request.
