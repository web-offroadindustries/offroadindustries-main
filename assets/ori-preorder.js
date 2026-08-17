/* ─── ORI pre-order state ──────────────────────────────────────────────────
   Marks the page as "this product is a pre-order" so the app widgets that sit
   outside the theme's product form can stand down, leaving the customer one
   button instead of an Add to cart and a Pre-order side by side.

   Two things count as a pre-order:

   1. The variant has run out. Liquid already covers this and sets the marker
      server side, but it is recomputed here so the marker follows a variant
      change without waiting on a section re-render.

   2. Timesact has a live campaign on it. That one is invisible to Liquid - the
      app's embed renders nothing at all server side - so it can only be read at
      runtime, after Timesact has hydrated window.ta from its app proxy.

   Everything fails open. Missing product data, Timesact never loading, a
   selector that stops matching: the marker is not set and the page behaves
   exactly as it does today. Nothing in this file can hide a working Add to cart
   on a product that is genuinely in stock. */
(function () {
  'use strict';

  var ATTR = 'data-ori-preorder';

  /* window.ta starts as an empty shell and is filled from localStorage and then
     an app proxy round trip, so it is never ready at load. Watch for a while,
     then give up rather than polling forever. */
  var TIMESACT_WAIT_MS = 5000;
  var TIMESACT_POLL_MS = 250;

  function readJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  var product = readJson('ProductData');
  if (!product || !product.variants) return;

  var variants = {};
  product.variants.forEach(function (v) {
    variants[String(v.id)] = v;
  });

  function currentVariantId() {
    var input = document.querySelector('.main-product-form [name="id"]');
    if (input && input.value) return String(input.value);

    var fromUrl = new URLSearchParams(window.location.search).get('variant');
    if (fromUrl) return String(fromUrl);

    return product.variants[0] ? String(product.variants[0].id) : null;
  }

  /* Same three part rule as snippets/ori-preorder-state.liquid. The policy check
     is what separates a pre-order from a plain sell out: 'continue' means the
     merchant still wants orders past zero, whereas 'deny' at zero is refused by
     Shopify anyway and the product is simply sold out. Untracked variants have a
     meaningless quantity and are never pre-order. */
  function hasRunOut(variant) {
    return (
      !!variant &&
      variant.inventory_management === 'shopify' &&
      typeof variant.inventory_quantity === 'number' &&
      variant.inventory_quantity <= 0 &&
      variant.inventory_policy === 'continue'
    );
  }

  /* Read the per variant status, not the rolled up isPreorder flag. That one is
     computed with every() across all variants, so a campaign covering a single
     variant of a multi variant product reports false. */
  function timesactActive(variantId) {
    var ta = window.ta;
    var entry = ta && ta.products && ta.products[product.id];
    var variant = entry && entry.variants && entry.variants[variantId];
    var status = variant && variant.config && variant.config.status;
    return status === 'ACTIVE' || status === 'NO_STOCK';
  }

  var timesactReady = false;

  function apply() {
    var id = currentVariantId();
    var preorder = hasRunOut(variants[id]) || (timesactReady && timesactActive(id));

    if (preorder) document.body.setAttribute(ATTR, 'true');
    else document.body.removeAttribute(ATTR);
  }

  function watchTimesact() {
    var startedAt = Date.now();
    var timer = setInterval(function () {
      var ta = window.ta;
      if (ta && ta.products && ta.products[product.id]) {
        timesactReady = true;
        clearInterval(timer);
        apply();
        return;
      }
      if (Date.now() - startedAt > TIMESACT_WAIT_MS) clearInterval(timer);
    }, TIMESACT_POLL_MS);
  }

  function start() {
    apply();
    watchTimesact();
    // Fired by product-info.js after every variant swap, carrying the variant it
    // just rendered. Cheaper and more reliable than watching the form.
    document.addEventListener('variant:changed', apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
