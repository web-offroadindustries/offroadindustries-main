const { test, expect } = require('@playwright/test');

const FIXTURE_URL = 'http://127.0.0.1:4173/tests/fixtures/ori-gvm-calculator.html';

async function resetTour(page) {
  await page.addInitScript(() => localStorage.removeItem('ori_gvm_tour_seen_v1'));
}

async function selectVehicle(page, vehicleId = 'ford_f150', closeTour = true) {
  const select = page.getByLabel('Select ORI vehicle package');
  await expect(select.locator(`option[value="${vehicleId}"]`)).toHaveCount(1);
  await select.selectOption(vehicleId);

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
  const vehicleSelect = page.getByLabel('Select ORI vehicle package');
  await expect(vehicleSelect).toBeVisible();
  await expect(vehicleSelect.locator('option')).toContainText([
    '-- Select a package --',
    'Chevrolet Silverado 1500',
    'Chevy Silverado 2500HD',
    'Ford F150',
    'Toyota Tundra',
    'RAM 2500HD 5th Gen',
    'RAM 2500 6th Gen',
    'Silverado 2500 NB1 Legal Builds',
    'Silverado 1500 4" & 6" Legal Builds',
  ]);

  await selectVehicle(page);
  await expect(page.getByRole('heading', { name: /Ford F150/i })).toBeVisible();
  await expect(page.getByText('Vehicle total (GVM): 2451 / 3220 kg')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accessories' })).toBeVisible();
  await expect(page.getByText('Accessory selector in progress')).toHaveCount(0);
  await expect(page.getByText('20% complete')).toHaveCount(0);
  await expect(page.getByText('Static preview only')).toHaveCount(0);
  await expect(page.locator('.ori-gvm-calculator__accessory-static-row')).toHaveCount(0);

  const recoveryBoards = page.getByLabel(/Client recovery boards, 18 kg/i);
  await expect(recoveryBoards).toBeVisible();
  await recoveryBoards.check();
  await expect(page.getByText('Vehicle total (GVM): 2469 / 3220 kg')).toBeVisible();
  await recoveryBoards.uncheck();
  await expect(page.getByText('Vehicle total (GVM): 2451 / 3220 kg')).toBeVisible();

  await page.getByRole('spinbutton', { name: 'ATM', exact: true }).fill('3500');
  await page.getByRole('spinbutton', { name: 'TBM', exact: true }).fill('350');
  await page.getByRole('spinbutton', { name: 'Passengers', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'Cargo - rear', exact: true }).fill('500');

  await expect(page.getByText('Vehicle total (GVM): 3601 / 3220 kg')).toBeVisible();
  await expect(page.getByText('Combined mass (GCM): 6751 / 7720 kg')).toBeVisible();
  await expect(page.getByText('Over limit', { exact: true }).first()).toBeVisible();

  await page.getByLabel(/Stage 3: The Heavy Hauler/i).check();
  await expect(page.getByText('Vehicle GVM: 4300 kg')).toBeVisible();
  await expect(page.getByText('Towing capacity: 4500 kg')).toBeVisible();
  await expect(page.getByText('Vehicle total (GVM): 3631 / 4300 kg')).toBeVisible();
});

test('shows landing-page stage specifications inside the selected specification card', async ({
  page,
}) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'chevrolet_silverado_1500');

  await expect(page.getByLabel(/Factory \/ OEM rating/i)).toBeChecked();
  await expect(page.getByLabel(/Stage 4: The Heavy Hauler \(LTZ\)/i)).toBeVisible();
  await expect(page.getByLabel(/Stage 4: The Heavy Hauler \(ZR2\)/i)).toBeVisible();
  await page.getByLabel(/Stage 4: The Heavy Hauler \(LTZ\)/i).check();

  await expect(page.getByText('Vehicle GVM: 4250 kg')).toBeVisible();
  await expect(page.getByText('Combined GCM: 8750 kg')).toBeVisible();
  await expect(page.getByText('Vehicle total (GVM): 2578 / 4250 kg')).toBeVisible();

  await page.getByLabel(/Stage 4: The Heavy Hauler \(ZR2\)/i).check();
  await expect(page.getByText('Combined GCM: 8450 kg')).toBeVisible();
});

test('links the quote button to the selected vehicle landing page', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'chevrolet_silverado_1500');

  const vehicleSelect = page.getByLabel('Select ORI vehicle package');
  const quoteLink = page.getByRole('link', { name: /view ori gvm package/i });
  await expect(quoteLink).toHaveAttribute('href', '/pages/chevrolet-silverado-1500-gvm-package');

  await vehicleSelect.selectOption('toyota_tundra');
  await expect(quoteLink).toHaveAttribute('href', '/pages/toyota-tundra');

  await vehicleSelect.selectOption('ram_2500hd_5th_gen');
  await expect(quoteLink).toHaveAttribute('href', '/pages/ram-2500hd-5th-gen-gvm');

  await vehicleSelect.selectOption('ram_2500_6th_gen');
  await expect(quoteLink).toHaveAttribute('href', '/pages/ram-2500-6th-gen-gvm');

  await vehicleSelect.selectOption('ori_ssm_chevy_silverado_2500hd');
  await expect(quoteLink).toHaveAttribute('href', '/pages/ssm-legal-nb1-chevy-2500hd');

  await vehicleSelect.selectOption('ori_ssm_chevy_silverado_1500');
  await expect(quoteLink).toHaveAttribute('href', '/pages/ssm-legal-nb1-chevy-1500');
});

test('shows functional merchant-editable accessories without static progress copy', async ({
  page,
}) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page);

  await expect(page.getByRole('heading', { name: 'Accessories' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recovery gear' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cabin storage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tray setup' })).toBeVisible();
  await expect(page.getByText('Accessory selector in progress')).toHaveCount(0);
  await expect(page.getByText('20% complete')).toHaveCount(0);
  await expect(page.getByText('Static preview only')).toHaveCount(0);
  await expect(page.locator('.ori-gvm-calculator__accessory-static-row')).toHaveCount(0);
  await expect(page.locator('.ori-gvm-calculator__accessory-progress-fill')).toHaveCount(0);
  await expect(page.locator('.ori-gvm-calculator__accessories input[type="checkbox"]')).toHaveCount(3);

  await expect(page.getByLabel(/Client recovery boards, 18 kg/i)).toBeVisible();
  await expect(page.getByLabel(/Client fridge, 30 kg/i)).toBeVisible();
  await expect(page.getByLabel(/Client zero-weight item, 0 kg/i)).toBeVisible();
  await expect(page.getByLabel(/Client empty-weight item/i)).toHaveCount(0);

  await expect(page.getByText('Vehicle total (GVM): 2451 / 3220 kg')).toBeVisible();
  await page.getByLabel(/Client zero-weight item, 0 kg/i).check();
  await expect(page.getByText('Vehicle total (GVM): 2451 / 3220 kg')).toBeVisible();
});

test('copies the selected vehicle load summary for quoting support', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copiedText = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedText = text;
        },
      },
    });
  });

  await page.goto(FIXTURE_URL);
  await selectVehicle(page);

  await page.getByLabel(/Client recovery boards, 18 kg/i).check();
  await page.getByRole('spinbutton', { name: 'ATM', exact: true }).fill('3500');
  await page.getByRole('spinbutton', { name: 'TBM', exact: true }).fill('350');
  await page.getByRole('spinbutton', { name: 'Passengers', exact: true }).fill('300');
  await page.getByRole('spinbutton', { name: 'Cargo - rear', exact: true }).fill('500');
  await page.getByLabel(/Stage 3: The Heavy Hauler/i).check();

  await page.getByRole('button', { name: 'Copy load summary' }).click();

  await expect(page.getByText('Load summary copied')).toBeVisible();
  const copiedText = await page.evaluate(() => window.__copiedText);
  expect(copiedText).toContain('ORI GVM load summary');
  expect(copiedText).toContain('Vehicle: Ford F150');
  expect(copiedText).toContain('Specification: Stage 3: The Heavy Hauler');
  expect(copiedText).toContain('ATM: 3500 kg');
  expect(copiedText).toContain('TBM: 350 kg');
  expect(copiedText).toContain('Passengers: 300 kg');
  expect(copiedText).toContain('Cargo - rear: 500 kg');
  expect(copiedText).toContain('- Client recovery boards: 18 kg');
  expect(copiedText).toContain('Vehicle total (GVM): 3649 / 4300 kg (Within limit)');
  expect(copiedText).toContain('Combined mass (GCM): 6799 / 8800 kg (Within limit)');
});

test('loads merchant-editable custom specifications and accessories', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'chevrolet_silverado_1500');

  await expect(page.getByLabel(/Client-added 4200kg spec/i)).toBeVisible();
  await page.getByLabel(/Client-added 4200kg spec/i).check();
  await expect(page.getByText('Vehicle GVM: 4200 kg')).toBeVisible();
  await expect(page.getByText('Combined GCM: 9000 kg')).toBeVisible();

  await expect(page.getByLabel(/Client fridge, 30 kg/i)).toBeVisible();
  await expect(page.getByLabel(/Client canopy, 120 kg/i)).toBeVisible();
  await expect(page.getByText('Vehicle total (GVM): 2543 / 4200 kg')).toBeVisible();
  await page.getByLabel(/Client fridge, 30 kg/i).check();
  await expect(page.getByText('Vehicle total (GVM): 2573 / 4200 kg')).toBeVisible();
  await page.getByLabel(/Client canopy, 120 kg/i).check();
  await expect(page.getByText('Vehicle total (GVM): 2693 / 4200 kg')).toBeVisible();
});

test('updates the published payload when the selected stage changes', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'ram_2500_6th_gen');

  await expect(page.getByText('Payload: 785 kg')).toBeVisible();
  await page.getByLabel(/Stage 1: The Weekender/i).check();
  await expect(page.getByText('Payload: 1740 kg')).toBeVisible();
  await page.getByLabel(/Stage 2: Apex Series/i).check();
  await expect(page.getByText('Payload: 2120 kg')).toBeVisible();
  await page.getByLabel(/Stage 6: The Six Inch Build/i).check();
  await expect(page.getByText('Payload: 2060 kg')).toBeVisible();
});

test('hides an optional payload when a specification does not provide one', async ({ page }) => {
  await page.route('**/assets/ori-gvm-calculator-data.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.vehicles[0].factory_specs.payload;
    await route.fulfill({ response, json: data });
  });

  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'chevrolet_silverado_1500');
  await expect(page.getByText('Payload: —')).toBeVisible();
});

test('keeps every RAM 5th Gen stage at the published towing limit', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'ram_2500hd_5th_gen');

  for (const stageName of [
    /Stage 1: 2" Lift/i,
    /Stage 2: 2" Lift/i,
    /Stage 3: 3" BDS/i,
  ]) {
    await page.getByLabel(stageName).check();
    await expect(page.getByText('Towing capacity: 4500 kg')).toBeVisible();
    await expect(page.getByText('TBM limit: 450 kg')).toBeVisible();
  }
});

test('keeps card headings inside containers and uses the requested ORI teal accents', async ({
  page,
}) => {
  await page.goto(FIXTURE_URL);
  await page.setViewportSize({ width: 1280, height: 900 });
  await selectVehicle(page);

  const misplacedHeadings = await page.evaluate(() => {
    const pairs = [
      ...Array.from(document.querySelectorAll('.ori-gvm-calculator__card')).map((card) => ({
        container: card,
        title: card.querySelector(':scope > .ori-gvm-calculator__card-title'),
      })),
      ...Array.from(document.querySelectorAll('.ori-gvm-calculator__accessory-group')).map(
        (group) => ({
          container: group,
          title: group.querySelector(':scope > .ori-gvm-calculator__accessory-title'),
        })
      ),
    ];

    return pairs
      .filter(({ container, title }) => container && title)
      .map(({ container, title }) => ({
        text: title.textContent.trim(),
        containerTop: container.getBoundingClientRect().top,
        titleTop: title.getBoundingClientRect().top,
      }))
      .filter(({ containerTop, titleTop }) => titleTop < containerTop + 8);
  });

  expect(misplacedHeadings).toEqual([]);

  const colors = await page.evaluate(() => ({
    cardTitle: getComputedStyle(document.querySelector('.ori-gvm-calculator__card-title')).color,
    ringStroke: getComputedStyle(document.querySelector('.ori-gvm-calculator__ring-fill')).stroke,
    barFill: getComputedStyle(document.querySelector('.ori-gvm-calculator__bar-fill'))
      .backgroundColor,
    accessoryCheckbox: getComputedStyle(
      document.querySelector('.ori-gvm-calculator__checkbox')
    ).accentColor,
  }));

  expect(colors.cardTitle).toBe('rgb(0, 143, 175)');
  expect(colors.ringStroke).toBe('rgb(0, 143, 175)');
  expect(colors.barFill).toBe('rgb(0, 143, 175)');
  expect(colors.accessoryCheckbox).toBe('rgb(0, 143, 175)');
});

test('restores the introduction and clears simulation state', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await selectVehicle(page);
  await page.getByLabel('Passengers').fill('250');

  await page.getByLabel('Select ORI vehicle package').selectOption('');

  await expect(page.getByRole('heading', { name: 'ORI GVM load calculator' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ford F150/i })).toBeHidden();

  await selectVehicle(page);
  await expect(page.getByLabel('Passengers')).toHaveValue('');
});

test('runs the tutorial once and supports manual replay', async ({ page }) => {
  await page.setViewportSize({ width: 1748, height: 682 });
  await page.goto(FIXTURE_URL);
  await selectVehicle(page, 'ford_f150', false);

  const dialog = page.getByRole('dialog', { name: /calculator tutorial/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Step 1 of 5')).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Step 2 of 5')).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Step 3 of 5')).toBeVisible();
  await page.waitForTimeout(600);
  const stepThreeOverlapsAccessories = await page.evaluate(() => {
    const dialogRect = document
      .querySelector('.ori-gvm-calculator__tour-dialog')
      .getBoundingClientRect();
    const accessoriesRect = document
      .querySelector('[data-tour="accessories"]')
      .getBoundingClientRect();

    return !(
      dialogRect.right <= accessoriesRect.left ||
      dialogRect.left >= accessoriesRect.right ||
      dialogRect.bottom <= accessoriesRect.top ||
      dialogRect.top >= accessoriesRect.bottom
    );
  });
  expect(stepThreeOverlapsAccessories).toBe(false);
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel('Select ORI vehicle package').selectOption('');
  await selectVehicle(page, 'ford_f150', false);
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
  await expect(page.getByLabel('Select ORI vehicle package')).toBeVisible();
  expect(requests).toBe(2);
});

test('isolates an invalid vehicle instead of crashing the calculator', async ({ page }) => {
  await page.route('**/ori-gvm-calculator-data.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const ford = data.vehicles.find((vehicle) => vehicle.id === 'ford_f150');
    delete ford.factory_specs.wheelbase_mm;
    await route.fulfill({ response, json: data });
  });

  await page.goto(FIXTURE_URL);
  await page.getByLabel('Select ORI vehicle package').selectOption('ford_f150');
  await expect(
    page.getByText('This vehicle does not have enough data to calculate safely.')
  ).toBeVisible();
  await expect(page.getByLabel('Select ORI vehicle package')).toBeVisible();
});

test('uses ORI brand variables and stays responsive without page overflow', async ({ page }, testInfo) => {
  await page.goto(`${FIXTURE_URL}?fixtureFonts=1`);
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
  const selectedRatingBorder = await page
    .locator('.ori-gvm-calculator__upgrade-option')
    .first()
    .evaluate((node) => getComputedStyle(node).borderColor);
  expect(titleFont).toContain('Fixture Display');
  expect(bodyFont).toContain('Fixture Body');
  expect(selectedRatingBorder).toBe('rgb(0, 143, 175)');
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
