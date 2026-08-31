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

test('gvm stages template preserves gvm-stage-alt and adds the review directory after the hero', () => {
  const source = parseShopifyJson('templates/product.gvm-stage-alt.json');
  const review = parseShopifyJson('templates/product.gvm-stages-template.json');
  const directoryId = 'gvm_review_directory';

  assert.equal(review.sections[directoryId].type, 'ori-gvm-review-directory');
  assert.equal(review.sections[directoryId].settings.collection, 'gvm-upgrades');
  assert.equal(
    review.sections[directoryId].settings.subheading,
    '<p>Open any package or stage below to review its product page.</p>',
  );

  const reviewSectionsWithoutDirectory = structuredClone(review.sections);
  delete reviewSectionsWithoutDirectory[directoryId];
  assert.deepEqual(reviewSectionsWithoutDirectory, source.sections);
  assert.deepEqual(
    review.order.filter((id) => id !== directoryId),
    source.order,
  );
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
