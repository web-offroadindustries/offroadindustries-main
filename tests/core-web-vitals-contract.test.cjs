const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseShopifyJson(relativePath) {
  return JSON.parse(read(relativePath).replace(/^\/\*[\s\S]*?\*\//, '').trim());
}

function readSectionSchema(relativePath) {
  const source = read(relativePath);
  const match = source.match(/{% schema %}([\s\S]*?){% endschema %}/);
  assert.ok(match, `${relativePath} contains a schema block`);
  return JSON.parse(match[1]);
}

test('homepage keeps five-second autoplay and supports deferred interaction start', () => {
  const schema = readSectionSchema('sections/slideshow.liquid');
  const deferSetting = schema.settings.find(
    (setting) => setting.id === 'defer_autoplay_until_interaction',
  );

  assert.deepEqual(deferSetting, {
    type: 'checkbox',
    id: 'defer_autoplay_until_interaction',
    label: 'Start autoplay after first visitor interaction',
    default: false,
    visible_if: '{{ section.settings.autoplay == true }}',
  });

  const home = parseShopifyJson('templates/index.json');
  const hero = home.sections['1653903038c126b831'];
  assert.equal(hero.type, 'slideshow');
  assert.equal(hero.settings.autoplay, true);
  assert.equal(hero.settings.autorotate_speed, 5);
  assert.equal(hero.settings.defer_autoplay_until_interaction, false);

  const liquid = read('sections/slideshow.liquid');
  assert.match(liquid, /data-autoplay-after-interaction="{{ autoplay_after_interaction }}"/);

  const javascript = read('assets/slideshow-component.js');
  assert.match(javascript, /_watchForAutoplayInteraction\(\)/);
  assert.match(javascript, /_startDeferredAutoplay\(\)/);
  assert.match(
    javascript,
    /_autoplayInteractionEvents = \['wheel', 'pointerdown', 'touchstart', 'keydown'\]/,
  );
  assert.doesNotMatch(javascript, /_autoplayInteractionEvents = \[[^\]]*'scroll'/);
  assert.doesNotMatch(javascript, /_autoplayInteractionEvents = \[[^\]]*'click'/);
});

test('slideshow keeps only the initially visible image eager and high priority', () => {
  const liquid = read('sections/slideshow.liquid');
  assert.match(liquid, /assign loading = 'lazy'/);
  assert.match(liquid, /assign fetchpriority = 'low'/);
  assert.match(liquid, /if is_hero_slide[\s\S]*assign loading = 'eager'[\s\S]*assign fetchpriority = 'high'/);
  assert.match(liquid, /<deferred-media[\s\S]*<template>[\s\S]*<video/);
});

test('cart goal tolerates themes that omit the optional amount message', () => {
  const javascript = read('assets/cart-goal.js');

  assert.match(
    javascript,
    /const leftToSpend = this\.querySelector\(this\.selectors\.leftToSpend\);/,
  );
  assert.match(javascript, /if \(leftToSpend\) \{/);
});
