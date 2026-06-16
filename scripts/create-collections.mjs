/**
 * create-collections.mjs
 * Idempotently creates GVM and GCM smart collections on Shopify.
 *
 * Usage:
 *   SHOPIFY_STORE=offroad-ind.myshopify.com SHOPIFY_TOKEN=xxx node scripts/create-collections.mjs
 *   node scripts/create-collections.mjs --dry-run      (default — prints mutations, sends nothing)
 *
 * Requirements: Node 18+. No npm dependencies (uses native fetch).
 * The token must come from a custom app with write_products + write_collections scope.
 * NEVER hard-code the token here — read from env only.
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: true } },
  strict: false,
});
const DRY_RUN = flags['dry-run'] !== false; // default ON

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_TOKEN;

if (!STORE || !TOKEN) {
  console.error('ERROR: Set SHOPIFY_STORE and SHOPIFY_TOKEN env vars.');
  process.exit(1);
}

const API_URL = `https://${STORE}/admin/api/2024-04/graphql.json`;

const GQL_HEADERS = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': TOKEN,
};

// ── Vehicle config ───────────────────────────────────────────────────────────

const VEHICLES = [
  { label: 'Toyota Tundra',                tag: 'tundra',          handle_suffix: 'toyota-tundra' },
  { label: 'Chevrolet Silverado 1500',      tag: 'silverado-1500',  handle_suffix: 'chevy-silverado-1500' },
  { label: 'Chevrolet Silverado 2500HD',    tag: 'silverado-2500',  handle_suffix: 'chevy-silverado-2500' },
  { label: 'Ford F-150',                   tag: 'f150',            handle_suffix: 'ford-f150' },
  { label: 'RAM 1500',                     tag: 'ram-1500',        handle_suffix: 'ram-1500' },
  { label: 'Ford Ranger (Next-Gen)',        tag: 'ranger',          handle_suffix: 'ford-ranger' },
  { label: 'Toyota HiLux',                 tag: 'hilux',           handle_suffix: 'toyota-hilux' },
];

const UPGRADE_TYPES = [
  { type: 'GVM Package', slug: 'gvm-upgrades', label: 'GVM Upgrades' },
  { type: 'GCM Package', slug: 'gcm-upgrades', label: 'GCM Upgrades' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: GQL_HEADERS,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function collectionExists(handle) {
  const data = await gql(`
    query($handle: String!) {
      collectionByHandle(handle: $handle) { id title }
    }
  `, { handle });
  return data.collectionByHandle;
}

async function createSmartCollection({ handle, title, seoTitle, seoDesc, body, tagVehicle, tagType }) {
  const mutation = `
    mutation collectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle title }
        userErrors { field message }
      }
    }
  `;
  const input = {
    handle,
    title,
    descriptionHtml: body,
    seo: { title: seoTitle, description: seoDesc },
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: 'TAG', relation: 'EQUALS', condition: `vehicle:${tagVehicle}` },
        { column: 'TAG', relation: 'EQUALS', condition: `type:${tagType}` },
      ],
    },
  };
  return gql(mutation, { input });
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n🔧  create-collections.mjs  |  DRY RUN: ${DRY_RUN}\n`);

for (const vehicle of VEHICLES) {
  for (const upgrade of UPGRADE_TYPES) {
    const handle    = `${vehicle.handle_suffix}-${upgrade.slug}`;
    const title     = `${vehicle.label} ${upgrade.label}`;
    const seoTitle  = `${title} Australia | Federally Approved | ORI`;
    const seoDesc   = `Federally approved ${upgrade.type.toLowerCase()} packages for the ${vehicle.label} in Australia. SSM-certified, ADR-tested, Australia-wide installer network. ORI Offroad Industries.`;
    const body      = `<p>ORI Offroad Industries offers federally approved ${upgrade.label.toLowerCase()} for the ${vehicle.label}. All packages are SSM-certified, ADR-tested, and installed by our approved national network.</p>`;
    const tagVehicle = vehicle.tag;
    const tagType    = upgrade.type.toLowerCase().replace(' ', '-'); // e.g. gvm-package

    if (DRY_RUN) {
      console.log('[DRY RUN] Would create collection:');
      console.log(`  Handle:  ${handle}`);
      console.log(`  Title:   ${title}`);
      console.log(`  SEO:     ${seoTitle}`);
      console.log(`  Rules:   vehicle:${tagVehicle} AND type:${tagType}`);
      console.log('');
      continue;
    }

    // Live run — idempotent check first
    const existing = await collectionExists(handle);
    if (existing) {
      console.log(`[SKIP] Already exists: ${handle} (${existing.id})`);
      continue;
    }

    try {
      const result = await createSmartCollection({ handle, title, seoTitle, seoDesc, body, tagVehicle, tagType });
      const col = result.collectionCreate?.collection;
      const errs = result.collectionCreate?.userErrors;
      if (errs?.length) {
        console.error(`[ERROR] ${handle}:`, errs);
      } else {
        console.log(`[CREATED] ${handle} → ${col.id}`);
      }
    } catch (e) {
      console.error(`[EXCEPTION] ${handle}:`, e.message);
    }
  }
}

console.log('\nDone.');
