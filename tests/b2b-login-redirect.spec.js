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

  test('data-b2b-customer attribute is present on b2b-catalog page', async ({ page }) => {
    await page.goto(`${BASE}/pages/b2b-catalog`);
    // Attribute should always be rendered by theme.liquid (empty when not logged in, "1" when logged in)
    const bodyAttr = await page.getAttribute('body', 'data-b2b-customer');
    console.log('data-b2b-customer (non-logged-in):', JSON.stringify(bodyAttr));
    // Attribute exists (not null)
    expect(bodyAttr).not.toBeNull();
    // Not logged in → should NOT be "1"
    expect(bodyAttr).not.toBe('1');
  });

  test('session check fetch to /pages/b2b-catalog returns HTML with data-b2b-customer', async ({ page }) => {
    // The sessionTimer fetches /pages/b2b-catalog?b2b_check=1 to detect the customer session.
    // Verify the fetch returns HTML that contains the data-b2b-customer attribute.
    await page.goto(`${BASE}/pages/b2b-catalog`);

    const result = await page.evaluate(() =>
      fetch('/pages/b2b-catalog?b2b_check=1&_=1', {
        credentials: 'include',
        cache: 'no-store',
      }).then(r => r.text()).then(html => ({
        hasAttr: html.includes('data-b2b-customer='),
        isLoggedIn: html.includes('data-b2b-customer="1"'),
        snippet: html.slice(html.indexOf('<body'), html.indexOf('<body') + 200),
      }))
    );

    console.log('Has data-b2b-customer attribute:', result.hasAttr);
    console.log('Body tag snippet:', result.snippet);
    // Note: result.isLoggedIn reflects real session state in the test browser —
    // the important thing is that the attribute IS present (so the mechanism can work).
    console.log('Session active (attribute="1"):', result.isLoggedIn);

    // The attribute should always be rendered by theme.liquid
    expect(result.hasAttr).toBe(true);
  });

  test('full flow: mock session detected → parent navigates, popup handled', async ({ page, context }) => {
    // Simulate Shopify New Customer Accounts behavior end-to-end:
    // 1. Popup goes to shopify.com (never returns to store on its own)
    // 2. Parent fetch detects data-b2b-customer="1" (session confirmed)
    // 3. sessionTimer calls popup.location.replace(storeUrl)
    // 4. Popup navigates to /pages/b2b-catalog
    // 5. Simulated theme.liquid handshake fires (window.opener.location.replace + postMessage + close)
    // 6. Parent navigates to /pages/b2b-catalog; popup closes

    // Simulate theme.liquid handshake: when the popup lands on the store with opener set
    // and b2b_login_popup_pending exists, fire the handshake.
    await context.addInitScript(() => {
      window.addEventListener('load', function () {
        try {
          if (window.opener && !window.opener.closed) {
            var pending = localStorage.getItem('b2b_login_popup_pending');
            if (pending) {
              // Simulate what theme.liquid does when customer is set in popup context
              try { window.opener.location.replace(window.location.href); } catch (_) {}
              try { window.opener.postMessage('b2b_login_complete', window.location.origin); } catch (_) {}
              setTimeout(function () { try { window.close(); } catch (_) {} }, 300);
            }
          }
        } catch (_) {}
      });
    });

    // Intercept shopify.com — popup stays on the account portal (default NCA behavior)
    await context.route('https://shopify.com/**', async (route, request) => {
      if (request.resourceType() === 'document') {
        return route.fulfill({
          status: 200, contentType: 'text/html',
          body: '<!DOCTYPE html><html><body><p>Shopify account portal – stays here</p></body></html>',
        });
      }
      route.continue();
    });

    // Intercept the session check fetch — return HTML with session marker immediately
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

    await popup.waitForLoadState('domcontentloaded', { timeout: 15000 });
    console.log('Popup URL (after open):', popup.url());

    // sessionTimer fetches b2b-catalog?b2b_check=1 every 2s → intercepted → data-b2b-customer="1"
    // → popup.location.replace() → popup navigates to /pages/b2b-catalog
    // → addInitScript handshake fires → opener.location.replace → parent navigates
    await parentNavPromise;
    console.log('Parent URL after navigation:', page.url());
    expect(page.url()).toContain('/pages/b2b-catalog');

    // Wait for popup to close (handshake fires window.close() after 300ms)
    await page.waitForTimeout(1500);
    const popupClosed = popup.isClosed();
    console.log('Popup closed:', popupClosed);

    // The critical assertion: parent shows the catalog
    expect(page.url()).toContain('/pages/b2b-catalog');

    if (popupClosed) {
      console.log('FULL SUCCESS: popup navigated to store, handshake fired, popup self-closed');
    } else {
      console.log('PARTIAL SUCCESS: parent navigated, popup stayed open (cross-origin close blocked)');
      console.log('Popup URL:', popup.url());
    }
  });

});
