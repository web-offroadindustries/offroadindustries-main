/* ─── Contact form v4: linked dropdowns ───────────────────────────────────
   Rebuilds one <select> from another's value. Built for "Which Vehicle" ->
   "What Stage GVM Package", where every vehicle offers a different set of
   packages (Toyota LC300 has two, Chevy 2500HD has eight including half
   stages), so a single shared Stage 1-6 list offered packages that do not
   exist for most vehicles.

   Progressive enhancement. The select is rendered server-side with its full
   static option list, so if this never runs the visitor still gets a working
   field with every option in it. */
(function () {
  'use strict';

  /* The map is authored as one line per parent choice:
       Ford F150 | Stage 1, Stage 2, Stage 3
     Split on the FIRST pipe only, so a parent value containing a pipe would
     still key correctly, and commas inside the option list stay the separator. */
  function parseMap(text) {
    var map = {};
    if (!text) return map;
    text.split(/\r?\n/).forEach(function (line) {
      var cut = line.indexOf('|');
      if (cut < 0) return;
      var key = line.slice(0, cut).trim();
      if (!key) return;
      var values = line
        .slice(cut + 1)
        .split(',')
        .map(function (v) { return v.trim(); })
        .filter(Boolean);
      if (values.length) map[key] = values;
    });
    return map;
  }

  function readMap(select) {
    var node = document.getElementById(select.getAttribute('data-cfv4-map'));
    if (!node) return {};
    try {
      // Liquid's `json` filter writes a quoted JSON string, so this unwraps
      // to the raw authored text before it is parsed into lines.
      return parseMap(JSON.parse(node.textContent));
    } catch (e) {
      return {};
    }
  }

  function initLinked(child) {
    if (child.dataset.cfv4LinkedReady === '1') return;

    var form = child.closest('form');
    if (!form) return;

    var parentName = child.getAttribute('data-cfv4-depends-on');
    if (!parentName) return;

    // Field names are wrapped by Shopify's contact form as contact[Name].
    var parent = form.querySelector('select[name="contact[' + parentName + ']"]');
    if (!parent) return;

    var map = readMap(child);
    if (!Object.keys(map).length) return;

    child.dataset.cfv4LinkedReady = '1';

    // The server-rendered list is the fallback for any parent value with no
    // line in the map, so capture it before the first rebuild wipes it.
    var placeholder = child.querySelector('option[value=""]');
    var placeholderText = placeholder ? placeholder.textContent : '';
    var emptyText = child.getAttribute('data-cfv4-empty-text') || placeholderText;
    var fallback = Array.prototype.slice
      .call(child.querySelectorAll('option'))
      .filter(function (o) { return o.value !== ''; })
      .map(function (o) { return o.value; });

    function rebuild(keepValue) {
      var parentValue = parent.value;
      var options = map[parentValue] || (parentValue ? fallback : []);
      var previous = keepValue ? child.value : '';

      child.innerHTML = '';

      var first = document.createElement('option');
      first.value = '';
      first.disabled = true;
      first.selected = true;
      // Before a vehicle is picked the list is empty, so say why rather than
      // showing an dropdown that opens onto nothing.
      first.textContent = parentValue ? placeholderText : emptyText;
      child.appendChild(first);

      options.forEach(function (value) {
        var opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        child.appendChild(opt);
      });

      // Keep the previous pick only when it is still offered, otherwise a
      // stale package silently survives a change of vehicle.
      if (previous && options.indexOf(previous) !== -1) child.value = previous;

      child.disabled = !parentValue;
    }

    parent.addEventListener('change', function () { rebuild(true); });

    // Initial pass. A reload after a failed submit can come back with the
    // parent already set, so this is not always the empty state.
    rebuild(true);
  }

  function initAll() {
    Array.prototype.slice
      .call(document.querySelectorAll('select[data-cfv4-depends-on]'))
      .forEach(initLinked);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme editor swaps section markup without a page load.
  document.addEventListener('shopify:section:load', initAll);
})();
