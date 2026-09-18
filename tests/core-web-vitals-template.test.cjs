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

test('vehicle finder reserves its measured mobile and desktop height', () => {
  const home = parseShopifyJson('templates/index.json');
  const apps = home.sections['1770092251a8cb32bd'];
  assert.deepEqual(apps.custom_css, [
    '.f-apps-wrapper {min-height: 440px;}',
    '@media (min-width: 768px) {.f-apps-wrapper {min-height: 218px; }}',
  ]);
});

test('Bold connection and preload hints are product-only while runtime includes remain global', () => {
  const theme = read('layout/theme.liquid');
  const productHintBlock = theme.match(
    /{%- if template\.name == 'product' -%}([\s\S]*?){%- endif -%}/,
  );
  assert.ok(productHintBlock, 'product-only hint block exists');
  assert.match(productHintBlock[1], /options\.shopapps\.site/);
  assert.match(productHintBlock[1], /bold-options\.css/);
  assert.match(productHintBlock[1], /bold-options-form-linker\.js/);

  assert.match(theme, /{%- render 'bold-options-hybrid' -%}/);
  assert.match(theme, /{%- render 'bold-common' -%}/);
  assert.match(theme, /{%- render 'sc-includes' -%}/);

  const productBlockRemoved = theme.replace(productHintBlock[0], '');
  assert.doesNotMatch(productBlockRemoved, /rel="preconnect" href="https:\/\/options\.shopapps\.site"/);
  assert.doesNotMatch(productBlockRemoved, /rel="preload" href="https:\/\/options\.shopapps\.site\/js\/options\.js"/);
});

test('slideshow offers a 1200px image candidate for high-density mobile screens', () => {
  const liquid = read('sections/slideshow.liquid');
  const widths = Array.from(liquid.matchAll(/widths: '([^']+)'/g), (match) => match[1]);
  const expected = '375, 550, 750, 1100, 1200, 1500, 1780, 2000, 3000, 3840';

  assert.equal(widths.length, 2, 'desktop and mobile slideshow images define widths');
  assert.deepEqual(widths, [expected, expected]);
});

test('theme caps speculative preconnects at four critical origins', () => {
  const theme = read('layout/theme.liquid');
  const preconnectOrigins = Array.from(
    theme.matchAll(/<link rel="preconnect" href="([^"]+)"/g),
    (match) => match[1],
  );

  assert.ok(
    preconnectOrigins.length <= 4,
    `expected no more than four preconnects, found ${preconnectOrigins.length}: ${preconnectOrigins.join(', ')}`,
  );
  assert.equal(preconnectOrigins.includes('https://cdn.shopify.com'), false);
  assert.equal(preconnectOrigins.includes('https://connect.podium.com'), false);
  assert.equal(preconnectOrigins.includes('https://static.klaviyo.com'), false);
  assert.equal(preconnectOrigins.includes('https://options.shopapps.site'), false);
});

test('PageFly avoids duplicate font preconnects only in the main layout', () => {
  const theme = read('layout/theme.liquid');
  const pageflySnippet = read('snippets/pagefly-app-header.liquid');
  const pageflyLayout = read('layout/theme.pagefly.liquid');
  const passwordLayout = read('layout/password.liquid');

  assert.match(theme, /include 'pagefly-app-header', skip_google_font_preconnects: true/);
  assert.match(pageflySnippet, /unless skip_google_font_preconnects/);
  assert.match(pageflySnippet, /echo '<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">'/);
  assert.match(pageflySnippet, /echo '<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>'/);
  assert.match(pageflyLayout, /include 'pagefly-app-header' %}/);
  assert.match(passwordLayout, /include 'pagefly-app-header' %}/);
});

test('DNS-only app hints preserve the deferred commerce runtimes', () => {
  const theme = read('layout/theme.liquid');

  assert.match(theme, /<link rel="dns-prefetch" href="https:\/\/connect\.podium\.com">/);
  assert.match(theme, /<link rel="dns-prefetch" href="https:\/\/static\.klaviyo\.com">/);
  assert.match(theme, /<link rel="dns-prefetch" href="https:\/\/options\.shopapps\.site">/);
  assert.match(theme, /<script src="\{\{ 'vendor\.js' \| asset_url \}\}" defer="defer"><\/script>/);
  assert.match(theme, /<script src="\{\{ 'product-form\.js' \| asset_url \}\}" defer="defer"><\/script>/);
  assert.match(theme, /\{\{ content_for_header \}\}/);
  assert.match(theme, /\{%- render 'bold-options-hybrid' -%\}/);
  assert.match(theme, /\{%- render 'bold-common' -%\}/);
  assert.match(theme, /\{%- render 'sc-includes' -%\}/);
});
