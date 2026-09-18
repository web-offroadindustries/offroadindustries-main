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

function parseSectionSchema(relativePath) {
  const source = read(relativePath);
  const match = source.match(/{% schema %}([\s\S]*?){% endschema %}/);
  assert.ok(match, `${relativePath} has a Shopify section schema`);
  return JSON.parse(match[1]);
}

test('gvm stages template adds the review directory after the product hero', () => {
  const source = parseShopifyJson('templates/product.gvm-stage-alt.json');
  const review = parseShopifyJson('templates/product.gvm-stages-template.json');
  const directoryId = 'gvm_review_directory';

  assert.equal(review.sections.main.type, source.sections.main.type);
  assert.equal(review.sections[directoryId].type, 'ori-gvm-review-directory');
  assert.equal(review.sections[directoryId].settings.collection, 'ram-2500-gvm-upgrades');
  assert.equal(
    review.sections[directoryId].settings.subheading,
    '<p>Open any package or stage below to review its product page.</p>',
  );

  assert.equal(review.order[0], 'main');
  assert.equal(review.order[1], directoryId);
});

test('gvm review directory can list product and stage links from a selected collection', () => {
  const liquid = read('sections/ori-gvm-review-directory.liquid');
  const schema = parseSectionSchema('sections/ori-gvm-review-directory.liquid');
  const settings = new Map(schema.settings.map((setting) => [setting.id, setting]));

  assert.equal(settings.get('collection').type, 'collection');
  assert.equal(settings.get('show_stage_links').default, true);
  assert.equal(settings.get('show_skus').default, true);
  assert.equal(settings.get('products_limit').default, 50);

  assert.match(liquid, /assign directory_collection = collections\['gvm-upgrades'\]/);
  assert.match(liquid, /for directory_product in directory_collection\.products limit: products_limit/);
  assert.match(liquid, /href="{{ directory_product\.url }}"/);
  assert.match(liquid, /\?variant={{ variant\.id }}/);
  assert.match(liquid, /{{ directory_product\.title \| escape }}/);
  assert.match(liquid, /{{ variant\.title \| escape }}/);
  assert.match(liquid, /{{ variant\.sku \| escape }}/);
  assert.match(liquid, /elsif request\.design_mode/);
  assert.match(liquid, /directory_collection\.products_count > products_limit/);
  assert.doesNotMatch(liquid, /<(?:ol|ul)[^>]*role="list"/);
});

test('gvm stage links use a professional responsive card hierarchy', () => {
  const liquid = read('sections/ori-gvm-review-directory.liquid');

  assert.match(liquid, /class="ori-gvm-directory__stage-name"/);
  assert.match(
    liquid,
    /\.ori-gvm-directory__stages\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\);/s
  );
  assert.match(
    liquid,
    /\.ori-gvm-directory__stages a\s*\{[^}]*flex-direction:\s*column;[^}]*padding:\s*12px 14px;[^}]*border:\s*1px solid var\(--gvm-directory-line\);[^}]*border-radius:\s*8px;/s
  );
  assert.match(liquid, /\.ori-gvm-directory__stages li\s*\{[^}]*display:\s*flex;[^}]*\}/s);
  assert.match(liquid, /\.ori-gvm-directory__stages a\s*\{[^}]*flex:\s*1;[^}]*\}/s);
  assert.match(
    liquid,
    /\.ori-gvm-directory__review-link\s*\{[^}]*padding:\s*0 14px;[^}]*border:\s*1px solid var\(--gvm-directory-line\);[^}]*border-radius:\s*999px;/s
  );
  assert.match(
    liquid,
    /@media \(max-width:\s*639px\)[\s\S]*\.ori-gvm-directory__stages\s*\{[^}]*grid-template-columns:\s*1fr;/
  );
  assert.match(
    liquid,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition:\s*none;[\s\S]*transform:\s*none;/
  );
});
