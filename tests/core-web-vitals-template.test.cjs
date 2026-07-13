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
    '.f-apps-wrapper { min-height: 440px; }',
    '@media (min-width: 768px) { .f-apps-wrapper { min-height: 218px; } }',
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
