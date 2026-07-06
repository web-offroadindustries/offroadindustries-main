const { test, expect } = require('@playwright/test');

const FIXTURE_URL = 'http://127.0.0.1:4173/tests/fixtures/ori-gvm-calculator.html';

async function resetTour(page) {
  await page.addInitScript(() => localStorage.removeItem('ori_gvm_tour_seen_v1'));
}

async function selectVehicle(page, vehicleId = 'lc300', closeTour = true) {
  await page.getByLabel('Select your vehicle').selectOption(vehicleId);

  if (closeTour) {
    const dialog = page.getByRole('dialog', { name: /calculator tutorial/i });
    const opened = await dialog
      .waitFor({ state: 'visible', timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      await dialog.getByRole('button', { name: 'Skip' }).click();
    }
  }
}

test.beforeEach(async ({ page }) => {
  await resetTour(page);
});

test('loads a vehicle and recalculates every dependent mass', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.getByLabel('Select your vehicle')).toBeVisible();

  await selectVehicle(page);
  await expect(page.getByRole('heading', { name: /Toyota LandCruiser 300/i })).toBeVisible();
  await expect(page.getByText('Vehicle total (GVM): 2550 / 3280 kg')).toBeVisible();

  await page.getByRole('spinbutton', { name: 'ATM', exact: true }).fill('3500');
  await page.getByRole('spinbutton', { name: 'TBM', exact: true }).fill('350');
  await page.getByRole('spinbutton', { name: 'Passengers', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'Cargo - rear', exact: true }).fill('500');
  await page.getByLabel(/Bull bar, 85 kg/i).check();

  await expect(page.getByText('Vehicle total (GVM): 3785 / 3280 kg')).toBeVisible();
  await expect(page.getByText('Combined mass (GCM): 6935 / 6800 kg')).toBeVisible();
  await expect(page.getByText('Over limit', { exact: true }).first()).toBeVisible();

  await page.getByLabel(/Lovells 4205kg with BTC/i).check();
  await expect(page.getByText('Vehicle GVM: 4205 kg')).toBeVisible();
  await expect(page.getByText('Towing capacity: 4000 kg')).toBeVisible();
  await expect(page.getByText('Vehicle total (GVM): 3785 / 4205 kg')).toBeVisible();
});

test('restores the introduction and clears simulation state', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page);
  await page.getByLabel('Passengers').fill('250');

  await page.getByLabel('Select your vehicle').selectOption('');

  await expect(page.getByRole('heading', { name: 'GVM calculator and load simulator' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Toyota LandCruiser 300/i })).toBeHidden();

  await selectVehicle(page);
  await expect(page.getByLabel('Passengers')).toHaveValue('');
});

test('runs the tutorial once and supports manual replay', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'lc300', false);

  const dialog = page.getByRole('dialog', { name: /calculator tutorial/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Step 1 of 5')).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Step 2 of 5')).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel('Select your vehicle').selectOption('');
  await selectVehicle(page, 'lc300', false);
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'How to use this calculator' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close tutorial' }).click();
  await expect(dialog).toBeHidden();
});

test('shows a retry state and recovers after a data request fails', async ({ page }) => {
  let requests = 0;
  await page.route('**/ori-gvm-calculator-data.json', async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.goto(FIXTURE_URL);
  await expect(page.getByText('Calculator data could not be loaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel('Select your vehicle')).toBeVisible();
  expect(requests).toBe(2);
});

test('isolates an invalid vehicle instead of crashing the calculator', async ({ page }) => {
  await page.route('**/ori-gvm-calculator-data.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.vehicles[0].factory_specs.wheelbase_mm;
    await route.fulfill({ response, json: data });
  });

  await page.goto(FIXTURE_URL);
  await page.getByLabel('Select your vehicle').selectOption('lc300');
  await expect(
    page.getByText('This vehicle does not have enough data to calculate safely.')
  ).toBeVisible();
  await expect(page.getByLabel('Select your vehicle')).toBeVisible();
});

test('uses ORI brand variables and stays responsive without page overflow', async ({ page }, testInfo) => {
  await page.goto(FIXTURE_URL);
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      '--brand-display-font',
      '"Fixture Display", sans-serif'
    );
    document.documentElement.style.setProperty(
      '--brand-body-font',
      '"Fixture Body", sans-serif'
    );
  });
  await selectVehicle(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  const workspace = page.locator('.ori-gvm-calculator__workspace');
  const desktopLayout = await workspace.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      columns: style.gridTemplateColumns,
    };
  });
  expect(desktopLayout.display).toBe('grid');
  expect(desktopLayout.columns.split(' ').length).toBeGreaterThan(1);

  const titleFont = await page
    .locator('.ori-gvm-calculator__vehicle-title')
    .evaluate((node) => getComputedStyle(node).fontFamily);
  const bodyFont = await page
    .locator('.ori-gvm-calculator__select')
    .evaluate((node) => getComputedStyle(node).fontFamily);
  const quoteBackground = await page
    .locator('.ori-gvm-calculator__quote')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(titleFont).toContain('Fixture Display');
  expect(bodyFont).toContain('Fixture Body');
  expect(quoteBackground).toBe('rgb(86, 189, 194)');
  await page.screenshot({
    path: testInfo.outputPath('ori-gvm-calculator-desktop.png'),
    fullPage: true,
  });

  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 390, height: 900 });
  const resultsBox = await page.locator('.ori-gvm-calculator__results').boundingBox();
  const controlsBox = await page.locator('.ori-gvm-calculator__controls').boundingBox();
  expect(resultsBox.y).toBeLessThan(controlsBox.y);
  await page.screenshot({
    path: testInfo.outputPath('ori-gvm-calculator-mobile.png'),
    fullPage: true,
  });
});
