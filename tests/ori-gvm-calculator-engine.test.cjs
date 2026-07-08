const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const engine = require('../assets/ori-gvm-calculator-engine.js');

function readJsonWithOptionalHeader(path) {
  return JSON.parse(
    fs
      .readFileSync(path, 'utf8')
      .replace(/^\/\*[\s\S]*?\*\//, '')
      .trim()
  );
}

function readText(path) {
  return fs.readFileSync(path, 'utf8');
}

function readSectionSchema(path) {
  const content = readText(path);
  const match = content.match(/{% schema %}([\s\S]*?){% endschema %}/);

  assert.ok(match, `${path} has a schema tag`);

  return JSON.parse(match[1]);
}

const vehicle = {
  id: 'test-vehicle',
  name: 'Test vehicle',
  factory_specs: {
    wheelbase_mm: 3000,
    hitch_overhang_mm: 1200,
    baseline_front_kg: 1500,
    baseline_rear_kg: 1000,
    gvm: 3500,
    gcm: 6500,
    front_axle_limit: 1800,
    rear_axle_limit: 2000,
    towing_capacity: 3500,
    tbm_limit: 350,
  },
  upgrades: [
    {
      id: 'upgrade-4000',
      name: 'Upgrade 4000',
      gvm: 4000,
      gcm: 7500,
      front_axle_limit: 2000,
      rear_axle_limit: 2400,
      towing_capacity: 4000,
      tbm_limit: 400,
    },
    {
      id: 'upgrade-4200-heavy',
      name: 'Upgrade 4200 heavy',
      baseline_front_kg: 1600,
      baseline_rear_kg: 1100,
      gvm: 4200,
      gcm: 7800,
      front_axle_limit: 2100,
      rear_axle_limit: 2500,
      towing_capacity: 4200,
      tbm_limit: 420,
    },
  ],
};

const loadedState = {
  selectedUpgradeId: null,
  atm: 3500,
  tbm: 300,
  passengersKg: 200,
  cargoRearKg: 300,
  selectedAccessories: [
    {
      id: 'bullbar',
      mass_kg: 100,
      position_ratio: -0.2,
    },
  ],
};

test('splits a mass across axles using its longitudinal ratio', () => {
  assert.deepEqual(engine.splitMass(100, 0.45), { front: 55, rear: 45 });
  assert.deepEqual(engine.splitMass(100, 1.1), {
    front: -10,
    rear: 110,
  });
});

test('normalizes invalid and negative masses to zero', () => {
  assert.equal(engine.normalizeMass(-2), 0);
  assert.equal(engine.normalizeMass('not-a-number'), 0);
  assert.equal(engine.normalizeMass('42.5'), 42.5);
  assert.equal(engine.normalizeMass(Infinity), 0);
});

test('calculates axle, vehicle, trailer and combined masses', () => {
  const result = engine.calculate(vehicle, loadedState);

  assert.equal(result.frontAxle, 1580);
  assert.equal(result.rearAxle, 1820);
  assert.equal(result.vehicleMass, 3400);
  assert.equal(result.trailerAxleMass, 3200);
  assert.equal(result.combinedMass, 6600);
  assert.equal(result.accessoryMass, 100);
});

test('uses upgrade limits and falls back to the factory baseline when no stage baseline is supplied', () => {
  const factoryResult = engine.calculate(vehicle, loadedState);
  const upgradedResult = engine.calculate(vehicle, {
    ...loadedState,
    selectedUpgradeId: 'upgrade-4000',
  });

  assert.equal(factoryResult.limits.gvm, 3500);
  assert.equal(upgradedResult.limits.gvm, 4000);
  assert.equal(upgradedResult.limits.gcm, 7500);
  assert.equal(upgradedResult.limits.towingCapacity, 4000);
  assert.equal(upgradedResult.limits.tbmLimit, 400);
  assert.equal(upgradedResult.vehicleMass, factoryResult.vehicleMass);
});

test('uses selected stage kerb baseline when the stage supplies one', () => {
  const result = engine.calculate(vehicle, {
    selectedUpgradeId: 'upgrade-4200-heavy',
    selectedAccessories: [],
  });

  assert.equal(result.limits.gvm, 4200);
  assert.equal(result.baselineMass, 2700);
  assert.equal(result.frontAxle, 1600);
  assert.equal(result.rearAxle, 1100);
  assert.equal(result.vehicleMass, 2700);
});

test('falls back to factory limits for unknown upgrades', () => {
  assert.equal(engine.getLimits(vehicle, null).gvm, 3500);
  assert.equal(engine.getLimits(vehicle, 'upgrade-4000').gvm, 4000);
  assert.equal(engine.getLimits(vehicle, 'missing').gvm, 3500);
});

test('classifies values at warning and over-limit boundaries', () => {
  assert.equal(engine.classifyStatus(94.99, 100, 0.95), 'ok');
  assert.equal(engine.classifyStatus(95, 100, 0.95), 'warning');
  assert.equal(engine.classifyStatus(100, 100, 0.95), 'warning');
  assert.equal(engine.classifyStatus(100.01, 100, 0.95), 'danger');
  assert.equal(engine.classifyStatus(100, 0, 0.95), 'unavailable');
});

test('reports uncapped percentages and handles unavailable limits', () => {
  assert.equal(engine.percentage(120, 100), 120);
  assert.equal(engine.percentage(1, 0), 0);
});

test('validates the required vehicle calculation fields', () => {
  assert.equal(engine.validateVehicle(vehicle).valid, true);

  const invalid = engine.validateVehicle({ id: 'bad' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missing.includes('factory_specs'));
});

test('ships a complete versioned reference dataset', () => {
  const data = require('../assets/ori-gvm-calculator-data.json');

  assert.equal(data.version, 4);
  assert.equal(data.source_kind, 'ori_published_landing_page_package_specs');
  assert.equal(data.vehicles.length, 5);
  assert.deepEqual(
    data.vehicles.map((item) => item.id),
    [
      'chevrolet_silverado_1500',
      'chevy_silverado_2500hd',
      'ford_f150',
      'toyota_tundra',
      'ori_ssm_chevy_silverado_2500hd',
    ]
  );

  for (const item of data.vehicles) {
    assert.equal(engine.validateVehicle(item).valid, true, item.id);
    assert.ok(Array.isArray(item.upgrades), item.id);
    assert.ok(item.upgrades.length > 0, item.id);
    assert.ok(item.quote_url.startsWith('/'), item.id);
    assert.ok(item.source_note.includes('ORI'), item.id);

    for (const upgrade of item.upgrades) {
      assert.ok(upgrade.gvm > 0, `${item.id} ${upgrade.id} has GVM`);
      assert.ok(upgrade.gcm > 0, `${item.id} ${upgrade.id} has GCM`);
      assert.ok(upgrade.front_axle_limit > 0, `${item.id} ${upgrade.id} has front axle`);
      assert.ok(upgrade.rear_axle_limit > 0, `${item.id} ${upgrade.id} has rear axle`);
      assert.ok(upgrade.towing_capacity > 0, `${item.id} ${upgrade.id} has tow rating`);
      assert.ok(upgrade.tbm_limit > 0, `${item.id} ${upgrade.id} has TBM limit`);
    }
  }

  const silverado1500 = data.vehicles.find((item) => item.id === 'chevrolet_silverado_1500');
  const silverado1500Stage4 = silverado1500.upgrades.find(
    (upgrade) => upgrade.id === 'chevrolet_silverado_1500_stage_4'
  );
  assert.equal(silverado1500.factory_specs.gvm, 3300);
  assert.equal(silverado1500Stage4.gvm, 4250);
  assert.equal(silverado1500Stage4.gcm, 8750);

  const fordF150 = data.vehicles.find((item) => item.id === 'ford_f150');
  assert.equal(fordF150.upgrades.find((upgrade) => upgrade.id === 'ford_f150_stage_6').gcm, 7800);

  const tundra = data.vehicles.find((item) => item.id === 'toyota_tundra');
  assert.equal(tundra.upgrades.find((upgrade) => upgrade.id === 'toyota_tundra_stage_3').gvm, 4300);

  const ssm = data.vehicles.find((item) => item.id === 'ori_ssm_chevy_silverado_2500hd');
  assert.ok(ssm.source_note.includes('does not expose separate GVM/GCM rows'));

  assert.ok(data.accessory_source_note.includes('ORI product pages'));
  assert.ok(data.accessories.front.length > 0);
  assert.ok(Array.isArray(data.accessories.middle));
  assert.ok(Array.isArray(data.accessories_by_category.rear.Wagon));
  assert.ok(data.accessories_by_category.rear.Ute.length > 0);
  assert.equal(
    data.accessories.front.find((item) => item.id === 'carbon_12k_winch').mass_kg,
    26.65
  );
  assert.equal(
    data.accessories.front.find((item) => item.id === 'stealth_driving_lights_pair').mass_kg,
    4.4
  );
});

test('enables accessories on the dedicated calculator page template', () => {
  const template = readJsonWithOptionalHeader('templates/page.gvm-calculator.json');

  assert.equal(template.sections.main.settings.show_accessories, true);
});

test('exposes merchant-editable calculator data blocks in the section schema', () => {
  const schema = readSectionSchema('sections/ori-gvm-load-calculator.liquid');
  const blocks = schema.blocks || [];
  const blockTypes = new Set(blocks.map((block) => block.type));
  const customSpec = blocks.find((block) => block.type === 'custom_specification');
  const customAccessory = blocks.find((block) => block.type === 'custom_accessory');

  assert.ok(blockTypes.has('custom_specification'));
  assert.ok(blockTypes.has('custom_accessory'));

  assert.deepEqual(
    customSpec.settings.map((setting) => setting.id).filter(Boolean),
    [
      'enabled',
      'vehicle_id',
      'name',
      'description',
      'gvm',
      'gcm',
      'front_axle_limit',
      'rear_axle_limit',
      'towing_capacity',
      'tbm_limit',
      'quote_url',
    ]
  );
  assert.deepEqual(
    customAccessory.settings.map((setting) => setting.id).filter(Boolean),
    ['enabled', 'target', 'zone', 'label', 'mass_kg']
  );

  assert.deepEqual(
    customSpec.settings.find((setting) => setting.id === 'vehicle_id').options.map((option) => option.value),
    [
      'chevrolet_silverado_1500',
      'chevy_silverado_2500hd',
      'ford_f150',
      'toyota_tundra',
      'ori_ssm_chevy_silverado_2500hd',
    ]
  );
  assert.deepEqual(
    customAccessory.settings.find((setting) => setting.id === 'target').options.map((option) => option.value),
    [
      'all',
      'ute',
      'wagon',
      'chevrolet_silverado_1500',
      'chevy_silverado_2500hd',
      'ford_f150',
      'toyota_tundra',
      'ori_ssm_chevy_silverado_2500hd',
    ]
  );
});
