const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const theme = fs.readFileSync(
  path.resolve(__dirname, '../layout/theme.liquid'),
  'utf8',
);

function extractScript(startMarker) {
  const markerIndex = theme.indexOf(startMarker);
  assert.notEqual(markerIndex, -1, `found ${startMarker}`);
  const scriptStart = theme.indexOf('<script>', markerIndex) + '<script>'.length;
  const scriptEnd = theme.indexOf('</script>', scriptStart);
  return theme.slice(scriptStart, scriptEnd);
}

function makeEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
    },
    dispatch(name) {
      for (const callback of Array.from(listeners.get(name) || [])) callback();
    },
    listenerCount(name) {
      return listeners.get(name)?.size || 0;
    },
  };
}

function runLoader(script) {
  const windowTarget = makeEventTarget();
  const documentTarget = makeEventTarget();
  const inserted = [];
  const scheduled = [];
  const firstScript = { parentNode: { insertBefore: (node) => inserted.push(node) } };

  const document = {
    ...documentTarget,
    body: { appendChild: (node) => inserted.push(node) },
    createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
    getElementsByTagName: () => [firstScript],
  };
  const window = { ...windowTarget, dataLayer: [] };

  vm.runInNewContext(script, {
    window,
    document,
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
    },
  });

  return { window, document, inserted, scheduled };
}

for (const scenario of [
  {
    name: 'GTM',
    marker: '<!-- Google Tag Manager (interaction-deferred for performance) -->',
    target: 'window',
    expectedSrc: 'https://www.googletagmanager.com/gtm.js?id=GTM-PNBCJ3H',
  },
  {
    name: 'Podium',
    marker: '{% comment %} WebChat',
    target: 'document',
    expectedSrc: 'https://connect.podium.com/widget.js#ORG_TOKEN=',
  },
]) {
  test(`${scenario.name} loads once after meaningful interaction and never from a timeout`, () => {
    const harness = runLoader(extractScript(scenario.marker));
    assert.equal(harness.inserted.length, 0);
    assert.equal(harness.scheduled.length, 0);

    const target = harness[scenario.target];
    target.dispatch('pointerdown');
    assert.equal(harness.inserted.length, 1);
    assert.match(harness.inserted[0].src, new RegExp(scenario.expectedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    target.dispatch('scroll');
    target.dispatch('click');
    target.dispatch('keydown');
    assert.equal(harness.inserted.length, 1);
    assert.equal(target.listenerCount('mousemove'), 0);
  });
}
