/**
 * create-products.mjs
 * Creates GVM/GCM stage product packages in DRAFT status on Shopify.
 *
 * Usage:
 *   SHOPIFY_STORE=offroad-ind.myshopify.com SHOPIFY_TOKEN=xxx node scripts/create-products.mjs
 *   node scripts/create-products.mjs --dry-run      (default — prints mutations, sends nothing)
 *
 * Fill in STAGE_CONFIGS below with real GVM/payload figures from the client.
 * All products are created as DRAFT — review and publish manually after verification.
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: true } },
  strict: false,
});
const DRY_RUN = flags['dry-run'] !== false;

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

// ── Stage config — fill real figures from client ──────────────────────────────
// Each entry: { vehicle, stage, handle, tags[], metafields{} }

const STAGE_CONFIGS = [
  // Toyota Tundra
  {
    vehicle: 'Toyota Tundra',
    stage: 1,
    handle: 'toyota-tundra-stage-1-gvm-upgrade',
    tags: ['vehicle:tundra', 'type:gvm-upgrade', 'type:GVM Package', 'stage:1'],
    metafields: {
      original_gvm:        'TBC kg — request from client',
      upgraded_gvm:        'TBC kg — request from client',
      payload_gain:        'TBC kg — request from client',
      ssm_approval:        'VTA-XXXXX — request from client',
      nb_category:         'NB2',
      lift_height:         'TBC mm — request from client',
    },
  },
  {
    vehicle: 'Toyota Tundra',
    stage: 2,
    handle: 'toyota-tundra-stage-2-gvm-upgrade',
    tags: ['vehicle:tundra', 'type:gvm-upgrade', 'type:GVM Package', 'stage:2'],
    metafields: {
      original_gvm: 'TBC kg',
      upgraded_gvm: 'TBC kg',
      payload_gain: 'TBC kg',
      ssm_approval: 'VTA-XXXXX',
      nb_category:  'NB2',
    },
  },
  // Chevrolet Silverado 1500
  {
    vehicle: 'Chevrolet Silverado 1500',
    stage: 1,
    handle: 'chevy-silverado-1500-stage-1-gvm-upgrade',
    tags: ['vehicle:silverado-1500', 'type:gvm-upgrade', 'type:GVM Package', 'stage:1'],
    metafields: {
      original_gvm: 'TBC kg',
      upgraded_gvm: 'TBC kg',
      payload_gain: 'TBC kg',
      ssm_approval: 'VTA-XXXXX',
      nb_category:  'NB2',
    },
  },
  {
    vehicle: 'Chevrolet Silverado 1500',
    stage: 2,
    handle: 'chevy-silverado-1500-stage-2-gvm-upgrade',
    tags: ['vehicle:silverado-1500', 'type:gvm-upgrade', 'type:GVM Package', 'stage:2'],
    metafields: {
      original_gvm: 'TBC kg',
      upgraded_gvm: 'TBC kg',
      payload_gain: 'TBC kg',
      ssm_approval: 'VTA-XXXXX',
      nb_category:  'NB2',
    },
  },
  // Ford F-150
  {
    vehicle: 'Ford F-150',
    stage: 1,
    handle: 'ford-f150-stage-1-gvm-upgrade',
    tags: ['vehicle:f150', 'type:gvm-upgrade', 'type:GVM Package', 'stage:1'],
    metafields: {
      original_gvm: 'TBC kg',
      upgraded_gvm: 'TBC kg',
      payload_gain: 'TBC kg',
      ssm_approval: 'VTA-XXXXX',
      nb_category:  'NB2',
    },
  },
  // RAM 1500
  {
    vehicle: 'RAM 1500',
    stage: 1,
    handle: 'ram-1500-stage-1-gvm-upgrade',
    tags: ['vehicle:ram-1500', 'type:gvm-upgrade', 'type:GVM Package', 'stage:1'],
    metafields: {
      original_gvm: 'TBC kg',
      upgraded_gvm: 'TBC kg',
      payload_gain: 'TBC kg',
      ssm_approval: 'VTA-XXXXX',
      nb_category:  'NB2',
    },
  },
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

async function productExists(handle) {
  const data = await gql(`
    query($handle: String!) {
      productByHandle(handle: $handle) { id title status }
    }
  `, { handle });
  return data.productByHandle;
}

function buildMetafieldInput(mf) {
  return Object.entries(mf).map(([key, value]) => ({
    namespace: 'ori',
    key,
    value: String(value),
    type: 'single_line_text_field',
  }));
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n🔧  create-products.mjs  |  DRY RUN: ${DRY_RUN}\n`);

const CREATE_MUTATION = `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id handle status }
      userErrors { field message }
    }
  }
`;

for (const cfg of STAGE_CONFIGS) {
  const title = `${cfg.vehicle} Stage ${cfg.stage} GVM Upgrade`;
  const desc  = `<p>Federally approved Stage ${cfg.stage} GVM upgrade package for the ${cfg.vehicle}. SSM-certified, ADR-tested, and installed by ORI's national network of approved specialists.</p>`;

  if (DRY_RUN) {
    console.log('[DRY RUN] Would create product:');
    console.log(`  Title:  ${title}`);
    console.log(`  Handle: ${cfg.handle}`);
    console.log(`  Tags:   ${cfg.tags.join(', ')}`);
    console.log(`  Type:   GVM Package`);
    console.log(`  Status: DRAFT`);
    console.log(`  Metafields: ${JSON.stringify(cfg.metafields)}`);
    console.log('');
    continue;
  }

  const existing = await productExists(cfg.handle);
  if (existing) {
    console.log(`[SKIP] Already exists: ${cfg.handle} (${existing.id}, ${existing.status})`);
    continue;
  }

  const input = {
    title,
    handle:      cfg.handle,
    productType: 'GVM Package',
    tags:        cfg.tags,
    descriptionHtml: desc,
    status:      'DRAFT',
    metafields:  buildMetafieldInput(cfg.metafields),
  };

  try {
    const result = await gql(CREATE_MUTATION, { input });
    const prod  = result.productCreate?.product;
    const errs  = result.productCreate?.userErrors;
    if (errs?.length) {
      console.error(`[ERROR] ${cfg.handle}:`, errs);
    } else {
      console.log(`[CREATED] ${prod.handle} → ${prod.id} (${prod.status})`);
    }
  } catch (e) {
    console.error(`[EXCEPTION] ${cfg.handle}:`, e.message);
  }
}

console.log('\nDone. All products created as DRAFT — review and publish manually.');
