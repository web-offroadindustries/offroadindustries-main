// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'https://www.offroadindustries.com.au';
const ORIGIN = new URL(BASE).origin;

test.describe('B2B catalog login redirect', () => {

  test('shows login gate for non-logged-in user', async ({ page }) => {
    await page.goto(`${BASE}/pages/b2b-catalog`);
    const gate = page.locator('.b2b-pending');
    await expect(gate).toBeVisible({ timeout: 10000 });
    const btn = gate.locator('.btn--primary');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/log in/i);
  });

  test('login button opens a popup', async ({ page, context }) => {
    await page.goto(`${BASE}/pages/b2b-catalog`);
    const btn = page.locator('.b2b-pending .btn--primary');
    await expect(btn).toBeVisible({ timeout: 10000 });

    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 10000 }),
      btn.click(),
    ]);

    await expect(popup).toBeTruthy();
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    const popupUrl = popup.url();
    expect(popupUrl).toMatch(/account|shopify\.com/i);
    await popup.close();
  });

  test('data-b2b-customer attribute is absent for non-logged-in visitor', async ({ page }) => {
    await page.goto(`${BASE}/pages/b2b-catalog`);
    // theme.liquid renders data-b2b-customer="1" only when customer is set.
    // For an anonymous visitor it should be absent or empty.
    const bodyAttr = await page.getAttribute('body', 'data-b2b-customer');
    console.log('data-b2b-customer (non-logged-in):', JSON.stringify(bodyAttr));
    expect(bodyAttr).not.toBe('1');
  });

  test('session check fetch returns HTML with data-b2b-customer attribute', async ({ page }) => {
    // Verifies the mechanism the sessionTimer relies on: fetch /?b2b_check=1 returns
    // the store homepage HTML, which theme.liquid stamps with data-b2b-customer.
    // When not logged in, attribute should be absent/"" — never "1".
    await page.goto(`${BASE}/pages/b2b-catalog`);

    const html = await page.evaluate(() =>
      fetch('/?b2b_check=1&_=1', { credentials: 'include', cache: 'no-store' }).then(r => r.text())
    );

    const hasAttr = html.includes('data-b2b-customer=');
    const isLoggedIn = html.includes('data-b2b-customer="1"');
    console.log('HTML has data-b2b-customer attribute:', hasAttr);
    console.log('Customer appears logged in:', isLoggedIn);

    // The attribute should be rendered by theme.liquid (always present, value varies)
    expect(hasAttr).toBe(true);
    // Not logged in → should NOT be "1"
    expect(isLoggedIn).toBe(false);
  });

  test('full flow: mock session detected → parent navigates, popup handled', async ({ page, context }) => {
    // Simulate Shopify New Customer Accounts behavior:
    // 1. Popup goes to shopify.com (never returns to store on its own)
    // 2. Parent fetch /?b2b_check=1 returns data-b2b-customer="1" (session confirmed)
    // 3. sessionTimer calls popup.location.replace(storeUrl)
    //    → If cross-origin navigation succeeds: popup goes to store, theme.liquid
    //      fires handshake (opener.location.replace + window.close), popup closes
    //    → If cross-origin navigation fails: catch fires cleanup()+finish() which
    //      reloads the parent — still shows the catalog
    // 4. Either way, parent ends up at /pages/b2b-catalog

    // Serve mock HTML at shopify.com (simulates user landing on account portal)
    await context.route('https://shopify.com/**', async (route, request) => {
      if (request.resourceType() === 'document') {
        return route.fulfill({
          status: 200, contentType: 'text/html',
          body: '<!DOCTYPE html><html><body><p>Shopify account portal</p></body></html>',
        });
      }
      route.continue();
    });

    // Intercept the session check fetch from the parent to confirm customer is logged in
    await context.route(`${BASE}/**`, async (route, request) => {
      const url = new URL(request.url());
      if (url.searchParams.has('b2b_check') && request.resourceType() === 'fetch') {
        return route.fulfill({
          status: 200, contentType: 'text/html',
          body: `<!DOCTYPE html><html><body data-b2b-customer="1"></body></html>`,
        });
      }
      route.continue();
    });

    await page.goto(`${BASE}/pages/b2b-catalog`);
    const btn = page.locator('.b2b-pending .btn--primary');
    await expect(btn).toBeVisible({ timeout: 10000 });

    const parentNavPromise = page.waitForNavigation({
      waitUntil: 'domcontentloaded', timeout: 20000,
    });

    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 10000 }),
      btn.click(),
    ]);

    await popup.waitForLoadState('domcontentloaded', { timeout: 8000 });
    console.log('Popup URL (simulated account portal):', popup.url());

    // sessionTimer fetches /?b2b_check=1 every 2s → gets mock → detects session
    // → tries popup.location.replace() → parent reloads (either via handshake or catch)
    await parentNavPromise;
    console.log('Parent URL after session detection:', page.url());
    expect(page.url()).toContain('/pages/b2b-catalog');

    // Check whether the popup navigated to the store (full handshake path)
    // or stayed on shopify.com (fallback path — parent reloaded itself)
    await page.waitForTimeout(1000);
    const popupClosed = popup.isClosed();
    const popupUrl = popupClosed ? '(closed)' : popup.url();
    console.log('Popup closed:', popupClosed, '| URL:', popupUrl);

    if (popupClosed) {
      console.log('SUCCESS: Full flow — popup navigated to store, theme.liquid fired, popup self-closed');
    } else {
      console.log('FALLBACK: popup.location.replace() failed cross-origin; parent reloaded via catch. ' +
        'Popup stays open — user must close manually. This is still a working UX improvement.');
    }

    // Either path is acceptable — the critical requirement is the PARENT shows the catalog
    expect(page.url()).toContain('/pages/b2b-catalog');
  });

});
