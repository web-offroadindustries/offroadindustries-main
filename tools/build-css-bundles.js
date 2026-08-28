/*
  Regenerates the two render-blocking CSS bundles.

  WHY THIS EXISTS
  PageSpeed flagged eight render-blocking stylesheets on the storefront. They
  are small, 35 KiB compressed between them, so the cost is eight round trips
  rather than bytes. Every one of them is above the fold, so deferring any
  would trade a faster paint for a visible flash of unstyled content and a
  layout shift, which scores worse than the problem it fixes. Combining them
  keeps the same bytes and the same cascade, and just asks for them in fewer
  requests.

  THE TRAP THIS SCRIPT EXISTS TO PREVENT
  The four framework files belong to the FoxEcom Zest theme. A theme update
  overwrites them, and the bundle would then silently serve the OLD css while
  the source files hold the new. Nothing would error. The site would just be
  styled from a stale copy.

  So: after ANY change to a source file listed below, and after ANY Zest theme
  update, run this:

      node tools/build-css-bundles.js

  It prints a warning and exits non-zero if a bundle is already out of date,
  so it can also be used as a check:

      node tools/build-css-bundles.js --check

  Plain node, no dependencies, no package.json. The theme still has no build
  step for anything else.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const CHECK = process.argv.includes('--check');

// Order is the cascade. Do not reorder these without checking the rendered
// page, since later files are expected to be able to override earlier ones.
const BUNDLES = {
  'critical-bundle.css': ['theme.css', 'base.css', 'grid.css', 'components.css'],
  'header-bundle.css': ['header.css', 'site-nav.css'],
};

function build(sources) {
  // A single @charset, first line, once. Any @charset inside a source file is
  // dropped: it is only valid at the very start of a stylesheet, so leaving
  // them mid-bundle makes them dead text at best.
  const parts = ['@charset "UTF-8";'];
  for (const name of sources) {
    const file = path.join(ASSETS, name);
    if (!fs.existsSync(file)) throw new Error('missing source asset: ' + name);
    const css = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/@charset\s+["'][^"']*["']\s*;/gi, '');
    parts.push('\n/* ==== ' + name + ' ==== */\n' + css.trim() + '\n');
  }
  return parts.join('\n');
}

let stale = 0;
for (const [out, sources] of Object.entries(BUNDLES)) {
  const banner =
    '/* GENERATED FILE. DO NOT EDIT.\n' +
    '   Built from: ' + sources.join(' + ') + '\n' +
    '   Edit those files, then run: node tools/build-css-bundles.js\n' +
    '   Editing this file directly will be lost on the next build. */\n';
  const body = banner + build(sources);
  const dest = path.join(ASSETS, out);
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;

  if (current === body) {
    console.log('  ok      ' + out.padEnd(24) + 'up to date');
    continue;
  }
  if (CHECK) {
    console.log('  STALE   ' + out.padEnd(24) + 'run: node tools/build-css-bundles.js');
    stale++;
    continue;
  }
  fs.writeFileSync(dest, body);
  console.log('  built   ' + out.padEnd(24) + sources.length + ' files, '
    + Math.round(Buffer.byteLength(body) / 1024) + ' KB  <- ' + sources.join(' + '));
}

if (CHECK && stale) {
  console.log('\n' + stale + ' bundle(s) out of date');
  process.exit(1);
}
