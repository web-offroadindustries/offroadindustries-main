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
      deactivateCalls: slider.deactivateCalls,
      pauseCalls: slider.pauseCalls,
      playerActive: slider.isPlayerActive,
      selectedIndex: slider.selectedIndex,
      playCalls: slider.playCalls,
      videoLoads: deferredMedia.loadCount,
      videoLoop: video ? video.loop : null,
      videoPlayCalls: video ? video.playCount : 0,
      videoTracked: !!video && hero._currentVideo === video,
    };
  });
}

async function reservationState(page) {
  await page.evaluate(() => customElements.whenDefined('slideshow-component'));
  return page.locator('#hero flickity-component').evaluate((flickity) => ({
    aspectRatio: getComputedStyle(flickity).aspectRatio,
    display: getComputedStyle(flickity).display,
    enabled: flickity.classList.contains('flickity-enabled'),
    height: flickity.getBoundingClientRect().height,
    width: flickity.getBoundingClientRect().width,
  }));
}

async function mobileStackTextState(page) {
  await page.evaluate(() => customElements.whenDefined('slideshow-component'));
  return page.locator('#hero').evaluate((hero) => {
    const text = hero.querySelector('.f-slideshow__text');
    const wrappers = Array.from(text.querySelectorAll('.f-slideshow__content-wrapper'));
    const firstContent = wrappers[0].querySelector('.f-slideshow__content');
    const cta = wrappers[0].querySelector('a');
    cta.focus();
    const ctaFocused = document.activeElement === cta;
    cta.blur();
    return {
      contentDisplay: getComputedStyle(firstContent).display,
      ctaFocused,
      firstDisplay: getComputedStyle(wrappers[0]).display,
      firstOpacity: getComputedStyle(wrappers[0]).opacity,
      firstSelected: wrappers[0].classList.contains('selected'),
      firstVisibility: getComputedStyle(wrappers[0]).visibility,
      secondDisplay: getComputedStyle(wrappers[1]).display,
      textHeight: text.getBoundingClientRect().height,
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
  await page.waitForTimeout(250);
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    videoLoads: 0,
  });

  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')));
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
    window.dispatchEvent(new WheelEvent('wheel'));
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
    videoLoads: 0,
    videoLoop: null,
    videoPlayCalls: 0,
    videoTracked: false,
  });

  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')));
  await expect.poll(() => sliderState(page), { timeout: 500 }).toMatchObject({
    autoPlay: 1000,
    selectedIndex: 0,
    videoLoads: 1,
    videoLoop: false,
    videoPlayCalls: 1,
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

test('legacy homepage markup defers autoplay and video until interaction', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&videoFirst=1&autoplay=5000`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await page.waitForTimeout(260);
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    playCalls: 0,
    videoLoads: 0,
    videoPlayCalls: 0,
    videoTracked: false,
  });

  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')));
  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 5000,
    selectedIndex: 0,
    videoLoads: 1,
    videoLoop: false,
    videoPlayCalls: 1,
    videoTracked: true,
  });
});

test('legacy homepage arrows work immediately and start deferred autoplay', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&autoplay=5000`);
  await page.getByRole('button', { name: 'Next slide' }).click();

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 5000,
    selectedIndex: 1,
    videoLoop: false,
    videoTracked: true,
  });
});

test('legacy homepage resets an already-active Flickity player before deferring it', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&autoplay=5000&preActivated=1`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    deactivateCalls: 1,
    playerActive: false,
    playCalls: 0,
  });

  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')));
  await expect.poll(() => sliderState(page)).toMatchObject({
    activateCalls: 1,
    autoPlay: 5000,
    deactivateCalls: 1,
    playerActive: true,
    playCalls: 1,
  });
});

test('legacy homepage respects reduced motion after interaction', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&autoplay=5000`);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')));
  await page.waitForTimeout(260);

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: false,
    selectedIndex: 0,
    playCalls: 0,
    videoLoads: 0,
  });
});

test('legacy homepage markup promotes only the first slide image', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1`);

  const firstImage = page.getByAltText('First slide');
  await expect(firstImage).toHaveAttribute('loading', 'eager');
  await expect(firstImage).toHaveAttribute('fetchpriority', 'high');
  await expect(page.getByAltText('Later slide')).toHaveAttribute('loading', 'lazy');
  await expect(page.getByAltText('Later slide')).toHaveAttribute('fetchpriority', 'low');
});

test('legacy homepage does not promote a later image when the first slide is video-only', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&videoOnlyFirst=1`);

  await expect(page.getByAltText('Later slide')).toHaveAttribute('loading', 'lazy');
  await expect(page.getByAltText('Later slide')).toHaveAttribute('fetchpriority', 'low');
});

test('legacy homepage promotes every responsive image in the first slide', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&responsiveFirst=1`);

  await expect(page.getByAltText('First slide', { exact: true })).toHaveAttribute('loading', 'eager');
  await expect(page.getByAltText('First slide', { exact: true })).toHaveAttribute('fetchpriority', 'high');
  await expect(page.getByAltText('First slide mobile')).toHaveAttribute('loading', 'eager');
  await expect(page.getByAltText('First slide mobile')).toHaveAttribute('fetchpriority', 'high');
  await expect(page.getByAltText('Later slide')).toHaveAttribute('loading', 'lazy');
  await expect(page.getByAltText('Later slide')).toHaveAttribute('fetchpriority', 'low');
});

test('legacy adapt homepage reserves the desktop CSS ratio before Flickity initializes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&responsiveFirst=1&missing=1`);

  const state = await reservationState(page);
  expect(state.display).toBe('block');
  expect(state.enabled).toBe(false);
  expect(state.width).toBeCloseTo(1280, 0);
  expect(state.height).toBeCloseTo(640, 0);
  expect(state.width / state.height).toBeCloseTo(2, 2);
});

test('legacy adapt homepage reserves the mobile CSS ratio before Flickity initializes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&responsiveFirst=1&missing=1`);

  const state = await reservationState(page);
  expect(state.display).toBe('block');
  expect(state.enabled).toBe(false);
  expect(state.width).toBeCloseTo(390, 0);
  expect(state.height).toBeCloseTo(312, 0);
  expect(state.width / state.height).toBeCloseTo(1.25, 2);
});

test('CSS reservation is scoped away from non-homepage, non-adapt, and explicit markup', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&nonHomepage=1&responsiveFirst=1&missing=1`);
  expect((await reservationState(page)).aspectRatio).toBe('auto');

  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&nonAdapt=1&responsiveFirst=1&missing=1`);
  expect((await reservationState(page)).aspectRatio).toBe('auto');

  await page.goto(`${FIXTURE_URL}?homepage=1&responsiveFirst=1&missing=1`);
  expect((await reservationState(page)).aspectRatio).toBe('auto');
});

test('legacy homepage CSS reservation stops after Flickity initializes', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&responsiveFirst=1`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  const state = await reservationState(page);
  expect(state.enabled).toBe(true);
  expect(state.aspectRatio).toBe('auto');
});

test('legacy mobile-stack homepage reserves first-slide text height through initialization', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&mobileStack=1&missing=1`);

  const before = await mobileStackTextState(page);
  expect(before.contentDisplay).toBe('block');
  expect(before.ctaFocused).toBe(false);
  expect(before.firstDisplay).toBe('block');
  expect(before.firstSelected).toBe(false);
  expect(before.firstVisibility).toBe('hidden');
  expect(before.secondDisplay).toBe('none');
  expect(before.textHeight).toBeGreaterThan(50);

  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&mobileStack=1`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');
  const after = await mobileStackTextState(page);
  expect(after.contentDisplay).toBe('block');
  expect(after.firstDisplay).toBe('block');
  expect(after.firstSelected).toBe(true);
  expect(after.firstVisibility).toBe('visible');
  expect(after.secondDisplay).toBe('none');
  expect(after.textHeight).toBeCloseTo(before.textHeight, 0);
});

test('mobile-stack text reservation excludes non-homepage, non-adapt, and explicit markup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&nonHomepage=1&mobileStack=1&missing=1`);
  expect((await mobileStackTextState(page)).textHeight).toBe(0);

  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&nonAdapt=1&mobileStack=1&missing=1`);
  expect((await mobileStackTextState(page)).textHeight).toBe(0);

  await page.goto(`${FIXTURE_URL}?homepage=1&mobileStack=1&missing=1`);
  expect((await mobileStackTextState(page)).textHeight).toBe(0);
});

test('legacy slideshow markup outside the homepage keeps its configured behavior', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyMarkup=1&nonHomepage=1&autoplay=200`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await expect.poll(() => sliderState(page)).toMatchObject({
    autoPlay: 200,
    videoLoads: 0,
  });
  await expect(page.getByAltText('First slide')).toHaveAttribute('loading', 'lazy');
  await expect(page.getByAltText('First slide')).toHaveAttribute('fetchpriority', 'low');
});

test('deferred autoplay falls back when Flickity lacks activatePlayer', async ({ page }) => {
  await page.goto(`${FIXTURE_URL}?legacyPlayer=1`);
  await expect(page.locator('#hero')).not.toHaveAttribute('data-media-loading', '');

  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')));
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
