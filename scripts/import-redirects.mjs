/**
 * import-redirects.mjs
 * Reads redirects.csv and applies them via Shopify Admin API urlRedirectCreate.
 *
 * Usage:
 *   SHOPIFY_STORE=offroad-ind.myshopify.com SHOPIFY_TOKEN=xxx node scripts/import-redirects.mjs
 *   node scripts/import-redirects.mjs --dry-run      (default — prints, sends nothing)
 *   node scripts/import-redirects.mjs --csv=scripts/redirects.csv
 *
 * CSV format: two columns, no header row — from,to
 * e.g.  /pages/ori-gvm-upgrades,/collections/gvm-upgrades
 */

import { parseArgs }  from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve }    from 'node:path';

const { values: flags } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: true },
    'csv':     { type: 'string',  default: 'scripts/redirects.csv' },
  },
  strict: false,
});
const DRY_RUN  = flags['dry-run'] !== false;
const CSV_PATH = resolve(flags.csv);

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

// ── Parse CSV ────────────────────────────────────────────────────────────────

let rows;
try {
  rows = readFileSync(CSV_PATH, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const [from, to] = l.split(',').map(s => s.trim());
      return { from, to };
    })
    .filter(r => r.from && r.to);
} catch (e) {
  console.error(`Could not read CSV at ${CSV_PATH}: ${e.message}`);
  process.exit(1);
}

console.log(`\n🔧  import-redirects.mjs  |  DRY RUN: ${DRY_RUN}  |  ${rows.length} rows\n`);

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

// ── Main ─────────────────────────────────────────────────────────────────────

const MUTATION = `
  mutation urlRedirectCreate($redirect: UrlRedirectInput!) {
    urlRedirectCreate(redirect: $redirect) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;

for (const { from, to } of rows) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] ${from}  →  ${to}`);
    continue;
  }

  try {
    const result = await gql(MUTATION, { redirect: { path: from, target: to } });
    const r    = result.urlRedirectCreate?.urlRedirect;
    const errs = result.urlRedirectCreate?.userErrors;
    if (errs?.length) {
      console.error(`[ERROR] ${from}:`, errs);
    } else {
      console.log(`[CREATED] ${r.path}  →  ${r.target}  (${r.id})`);
    }
  } catch (e) {
    console.error(`[EXCEPTION] ${from}:`, e.message);
  }
}

console.log('\nDone.');
