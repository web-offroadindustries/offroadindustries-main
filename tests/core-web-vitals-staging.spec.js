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
    const video = template?.content.querySelector('video');
    const source = video?.querySelector('source[src], source[data-src]');
    const mediaUrl = video?.currentSrc || video?.src || source?.src || source?.dataset.src || '';
    return mediaUrl ? new URL(mediaUrl, document.baseURI).href : '';
  });
  expect(videoUrl, 'The deferred slideshow video must expose an absolute media URL').toMatch(/^https?:\/\//);

  await page.waitForTimeout(6000);
  await expect(hero.locator('.f-slideshow__slide.is-selected')).toHaveAttribute('data-index', firstIndex);
  expect(requests).not.toContain(videoUrl);
  expect(requests.filter((url) => url.includes('gtm.js?id=GTM-PNBCJ3H'))).toHaveLength(0);
  expect(requests.filter((url) => url.includes('connect.podium.com/widget.js'))).toHaveLength(0);

  const initialScrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScrollY);
  await page.waitForTimeout(5400);
  await expect(hero.locator('.f-slideshow__slide.is-selected')).not.toHaveAttribute('data-index', firstIndex);

  await expect.poll(() => requests.filter((url) => url.includes('gtm.js?id=GTM-PNBCJ3H')).length).toBe(1);
  await expect.poll(() => requests.filter((url) => url.includes('connect.podium.com/widget.js')).length).toBe(1);
  await expect.poll(() => requests.includes(videoUrl)).toBe(true);

  await page.waitForTimeout(1000);
  const cls = await page.evaluate(() => window.__coreWebVitalsCls);
  expect(cls).toBeLessThan(0.1);
});

test('homepage omits early Bold hints while product pages retain them', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await expect(page.locator('link[rel="preconnect"][href*="options.shopapps.site"]')).toHaveCount(0);
  await expect(page.locator('link[rel="preload"][href*="options.shopapps.site"]')).toHaveCount(0);

  const homepageOrigin = new URL(page.url()).origin;
  const productHrefs = await page.locator('a[href*="/products/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')).filter(Boolean)
  );
  const productUrl = productHrefs
    .map((href) => new URL(href, page.url()))
    .find((url) => url.origin === homepageOrigin && url.pathname.startsWith('/products/'))
    || new URL('/products/amp-research-powerstep-vision-chevrolet-silverado-2500-1500', homepageOrigin);

  await page.goto(productUrl.href, { waitUntil: 'domcontentloaded' });
  const finalUrl = new URL(page.url());
  expect(finalUrl.origin).toBe(homepageOrigin);
  expect(finalUrl.pathname).toMatch(/\/products\/[^/]+\/?$/);

  await expect(page.locator('link[rel="preconnect"][href="https://options.shopapps.site"]')).toHaveCount(1);
  await expect(page.locator('link[rel="preload"][href*="options.shopapps.site/js/options.js"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => Boolean(window.BOLD?.common))).toBe(true);
});
