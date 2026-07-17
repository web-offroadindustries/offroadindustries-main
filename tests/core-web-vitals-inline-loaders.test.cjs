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

const approvedEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
const forbiddenEvents = ['scroll', 'click', 'mousemove'];

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
    expectedSrc: 'https://connect.podium.com/widget.js#ORG_TOKEN=211a92b8-ab89-45c7-ba01-acab8089df3d',
  },
]) {
  test(`${scenario.name} honors only approved interaction triggers and never uses a timeout`, () => {
    const script = extractScript(scenario.marker);

    for (const trigger of approvedEvents) {
      const harness = runLoader(script);
      const target = harness[scenario.target];

      assert.equal(harness.inserted.length, 0, `${trigger} starts with no insertion`);
      assert.equal(harness.scheduled.length, 0, `${trigger} starts with no fallback`);
      for (const approvedEvent of approvedEvents) {
        assert.equal(target.listenerCount(approvedEvent), 1, `${approvedEvent} is registered`);
      }

      target.dispatch(trigger);
      assert.equal(harness.inserted.length, 1, `${trigger} inserts exactly once`);
      assert.equal(harness.inserted[0].src, scenario.expectedSrc, `${trigger} inserts the correct URL`);
      assert.equal(harness.scheduled.length, 0, `${trigger} schedules no fallback`);

      for (const subsequentEvent of approvedEvents) target.dispatch(subsequentEvent);
      assert.equal(harness.inserted.length, 1, `${trigger} remains idempotent`);
      assert.equal(harness.scheduled.length, 0, `${trigger} remains timeout-free`);
      for (const approvedEvent of approvedEvents) {
        assert.equal(target.listenerCount(approvedEvent), 0, `${approvedEvent} listener is removed`);
      }
    }

    for (const forbiddenEvent of forbiddenEvents) {
      const harness = runLoader(script);
      const target = harness[scenario.target];

      assert.equal(target.listenerCount(forbiddenEvent), 0, `${forbiddenEvent} is not registered`);
      target.dispatch(forbiddenEvent);
      assert.equal(harness.inserted.length, 0, `${forbiddenEvent} causes no insertion`);
      assert.equal(harness.scheduled.length, 0, `${forbiddenEvent} schedules no fallback`);
    }
  });
}
