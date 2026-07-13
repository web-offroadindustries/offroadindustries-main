const { test, expect } = require('@playwright/test');

const FIXTURE_URL = 'http://127.0.0.1:4173/tests/fixtures/slideshow-interaction.html';

async function sliderState(page) {
  return page.locator('#hero').evaluate((hero) => {
    const deferredMedia = hero.querySelector('deferred-media');
    const slider = hero.querySelector('flickity-component').slider.instance;
    return {
      autoPlay: slider.options.autoPlay,
      selectedIndex: slider.selectedIndex,
      playCalls: slider.playCalls,
      videoLoads: deferredMedia.loadCount,
    };
  });
}

test('first interaction starts autoplay without immediately skipping the current slide', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await page.waitForTimeout(260);
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    playCalls: 0,
    videoLoads: 0,
  });

  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 200,
    selectedIndex: 0,
    playCalls: 1,
    videoLoads: 0,
  });

  await page.waitForTimeout(240);
  await expect.poll(() => sliderState(page)).toMatchObject({
    selectedIndex: 1,
    videoLoads: 1,
  });
});

test('manual navigation works immediately and activates deferred video', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole('button', { name: 'Next slide' }).click();

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 200,
    selectedIndex: 1,
    videoLoads: 1,
  });
});

test('reduced motion keeps autoplay off while leaving the slider initialized', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(FIXTURE_URL);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')));
  await page.waitForTimeout(260);

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    playCalls: 0,
    videoLoads: 0,
  });
});

test('failed Flickity initialization stops polling and reveals fallback content', async ({ page }) => {
  await page.clock.install();
  await page.goto(`${FIXTURE_URL}?missing=1`);
  await page.clock.fastForward(10100);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');
});
