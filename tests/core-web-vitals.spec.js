const { test, expect } = require('@playwright/test');

const FIXTURE_URL = 'http://127.0.0.1:4173/tests/fixtures/slideshow-interaction.html';

async function sliderState(page) {
  return page.locator('#hero').evaluate((hero) => {
    const deferredMedia = hero.querySelector('deferred-media');
    const slider = hero.querySelector('flickity-component').slider.instance;
    const video = deferredMedia.querySelector('video');
    return {
      activateCalls: slider.activateCalls,
      autoPlay: slider.options.autoPlay,
      pauseCalls: slider.pauseCalls,
      selectedIndex: slider.selectedIndex,
      playCalls: slider.playCalls,
      videoLoads: deferredMedia.loadCount,
      videoLoop: video ? video.loop : null,
      videoPlayCalls: video ? video.playCount : 0,
      videoTracked: !!video && hero._currentVideo === video,
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

test('deferred autoplay activates Flickity hover pause exactly once', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new KeyboardEvent('keydown'));
    document.querySelector('flickity-component').dispatchEvent(new Event('mouseenter'));
  });
  await page.waitForTimeout(260);

  await expect.poll(() => sliderState(page)).toMatchObject({
    activateCalls: 1,
    autoPlay: 200,
    pauseCalls: 1,
    selectedIndex: 0,
  });

  await page.locator('flickity-component').dispatchEvent('mouseleave');
  await expect.poll(() => sliderState(page)).toMatchObject({
    activateCalls: 1,
    selectedIndex: 1,
  });
});

test('interaction converts a video-first slide to duration-based advancement', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?videoFirst=1&autoplay=1000`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    videoLoads: 1,
    videoLoop: true,
    videoPlayCalls: 1,
    videoTracked: false,
  });

  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect.poll(() => sliderState(page), { timeout: 500 }).toMatchObject({
    autoPlay: 1000,
    selectedIndex: 0,
    videoLoads: 2,
    videoLoop: false,
    videoPlayCalls: 2,
    videoTracked: true,
  });

  await page.waitForTimeout(1060);
  await expect.poll(() => sliderState(page)).toMatchObject({ selectedIndex: 0 });

  await page.locator('video').dispatchEvent('ended');
  await expect.poll(() => sliderState(page)).toMatchObject({
    selectedIndex: 1,
    videoTracked: false,
  });
});

test('deferred autoplay falls back when Flickity lacks activatePlayer', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyPlayer=1`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect.poll(() => sliderState(page)).toMatchObject({
    activateCalls: 0,
    autoPlay: 200,
    playCalls: 1,
    selectedIndex: 0,
  });

  await expect.poll(() => sliderState(page)).toMatchObject({ selectedIndex: 1 });
});

test('manual navigation works immediately and activates deferred video', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.getByRole('button', { name: 'Next slide' }).click();

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 200,
    selectedIndex: 1,
    videoLoop: false,
    videoTracked: true,
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
