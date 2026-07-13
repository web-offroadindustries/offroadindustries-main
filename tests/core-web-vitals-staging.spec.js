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
