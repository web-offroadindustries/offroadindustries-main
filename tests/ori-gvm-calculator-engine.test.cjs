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

function walkFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      walkFiles(fullPath, output);
      continue;
    }

    output.push(fullPath);
  }

  return output;
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

test('carries an optional payload rating without making it required', () => {
  // Payload is a published figure the client types in, not something the
  // maths needs, so a vehicle without one stays valid and reports zero.
  assert.equal(engine.getLimits(vehicle).payload, 0);
  assert.equal(engine.getLimits(vehicle, 'upgrade-4000').payload, 0);
  assert.equal(engine.validateVehicle(vehicle).valid, true);

  const rated = {
    ...vehicle,
    upgrades: [{ ...vehicle.upgrades[0], payload: 1672 }],
  };
  assert.equal(engine.getLimits(rated, 'upgrade-4000').payload, 1672);
  assert.equal(engine.calculate(rated, { selectedUpgradeId: 'upgrade-4000' }).limits.payload, 1672);

  // Junk values collapse to zero so the front end hides the line.
  const junk = {
    ...vehicle,
    upgrades: [{ ...vehicle.upgrades[0], payload: -50 }],
  };
  assert.equal(engine.getLimits(junk, 'upgrade-4000').payload, 0);
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

  assert.equal(data.version, 5);
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
    (upgrade) => upgrade.id === 'chevrolet_silverado_1500_stage_4_ltz'
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

test('uses trim-specific Chevrolet Silverado 1500 GCM ratings for stages 3 to 5', () => {
  const data = require('../assets/ori-gvm-calculator-data.json');
  const silverado1500 = data.vehicles.find((item) => item.id === 'chevrolet_silverado_1500');
  const upgradesById = Object.fromEntries(
    silverado1500.upgrades.map((upgrade) => [upgrade.id, upgrade])
  );

  assert.deepEqual(
    silverado1500.upgrades
      .filter((upgrade) => upgrade.id.startsWith('chevrolet_silverado_1500_stage_'))
      .map((upgrade) => upgrade.id),
    [
      'chevrolet_silverado_1500_stage_1',
      'chevrolet_silverado_1500_stage_2',
      'chevrolet_silverado_1500_stage_3_ltz',
      'chevrolet_silverado_1500_stage_3_zr2',
      'chevrolet_silverado_1500_stage_4_ltz',
      'chevrolet_silverado_1500_stage_4_zr2',
      'chevrolet_silverado_1500_stage_5_ltz',
      'chevrolet_silverado_1500_stage_5_zr2',
    ]
  );

  assert.equal(upgradesById.chevrolet_silverado_1500_stage_3_ltz.gcm, 8350);
  assert.equal(upgradesById.chevrolet_silverado_1500_stage_3_zr2.gcm, 8050);
  assert.equal(upgradesById.chevrolet_silverado_1500_stage_4_ltz.gcm, 8750);
  assert.equal(upgradesById.chevrolet_silverado_1500_stage_4_zr2.gcm, 8450);
  assert.equal(upgradesById.chevrolet_silverado_1500_stage_5_ltz.gcm, 8750);
  assert.equal(upgradesById.chevrolet_silverado_1500_stage_5_zr2.gcm, 8450);

  const zr2Stage4 = engine.calculate(silverado1500, {
    selectedUpgradeId: 'chevrolet_silverado_1500_stage_4_zr2',
  });

  assert.equal(zr2Stage4.limits.gcm, 8450);
  assert.equal(zr2Stage4.limits.gvm, 4250);
  assert.equal(zr2Stage4.baselineMass, 2578);
});

test('keeps accessories enabled on main without static progress copy', () => {
  const template = readJsonWithOptionalHeader('templates/page.gvm-calculator.json');
  const schema = readSectionSchema('sections/ori-gvm-load-calculator.liquid');
  const sectionContent = readText('sections/ori-gvm-load-calculator.liquid');
  const locale = readJsonWithOptionalHeader('locales/en.default.json');
  const settingIds = schema.settings.map((setting) => setting.id).filter(Boolean);

  assert.equal(Object.hasOwn(template.sections.main.settings, 'show_accessories'), false);
  assert.equal(Object.hasOwn(template.sections.main.settings, 'use_default_accessories'), false);
  assert.equal(settingIds.includes('show_accessories'), false);
  assert.equal(settingIds.includes('use_default_accessories'), false);
  assert.equal(template.sections.main.settings.accessory_front_label, 'Front');
  assert.equal(template.sections.main.settings.accessory_middle_label, 'Middle');
  assert.equal(template.sections.main.settings.accessory_rear_label, 'Tub');
  assert.match(sectionContent, /data-show-accessories="true"/);
  assert.match(sectionContent, /data-use-default-accessories="false"/);
  assert.equal(sectionContent.includes('accessories_progress_title'), false);
  assert.equal(Object.hasOwn(locale.gvm_calculator, 'accessories_progress_title'), false);
  assert.equal(Object.hasOwn(locale.gvm_calculator, 'accessories_progress_percent'), false);
});

test('ships requested default accessory blocks', () => {
  const template = readJsonWithOptionalHeader('templates/page.gvm-calculator.json');
  const section = template.sections.main;
  const blocks = section.blocks || {};
  const blockOrder = section.block_order || [];
  const accessories = blockOrder.map((id) => blocks[id]).filter((block) => block.type === 'custom_accessory');

  assert.deepEqual(
    accessories.map((block) => [
      block.settings.zone,
      block.settings.label,
      block.settings.mass_kg,
      block.settings.target,
    ]),
    [
      ['front', 'Bullbar', 60, 'all'],
      ['front', 'Winch', 40, 'all'],
      ['front', 'Lights', 15, 'all'],
      ['middle', 'Under seat battery', 100, 'all'],
      ['rear', 'Roller Shutter', 60, 'all'],
      ['rear', 'Fridge Slide & Fridge', 60, 'all'],
      ['rear', 'Tray Canopy Basic', 600, 'all'],
      ['rear', 'Tray Canopy Touring Edition', 1000, 'all'],
      ['rear', 'Middle Roof rack', 40, 'all'],
      ['rear', 'Bedrack System', 70, 'all'],
      ['rear', 'Roof Top tent', 100, 'all'],
    ]
  );
});

test('enables the selected vehicle package link on the dedicated calculator page template', () => {
  const template = readJsonWithOptionalHeader('templates/page.gvm-calculator.json');
  const schema = readSectionSchema('sections/ori-gvm-load-calculator.liquid');
  const showQuoteSetting = schema.settings.find((setting) => setting.id === 'show_quote_button');
  const fallbackQuoteSetting = schema.settings.find(
    (setting) => setting.id === 'fallback_quote_url'
  );

  assert.equal(template.sections.main.settings.show_quote_button, true);
  assert.equal(showQuoteSetting.default, true);
  assert.match(fallbackQuoteSetting.info, /selected vehicle/i);
});

test('exposes merchant-editable accessory column labels while the accessory selector is parked', () => {
  const schema = readSectionSchema('sections/ori-gvm-load-calculator.liquid');
  const settingIds = schema.settings.map((setting) => setting.id).filter(Boolean);

  assert.ok(settingIds.includes('accessory_front_label'));
  assert.ok(settingIds.includes('accessory_middle_label'));
  assert.ok(settingIds.includes('accessory_rear_label'));

  const defaults = Object.fromEntries(
    schema.settings.filter((setting) => setting.id).map((setting) => [setting.id, setting.default])
  );

  assert.equal(defaults.accessory_front_label, 'Front');
  assert.equal(defaults.accessory_middle_label, 'Middle');
  assert.equal(defaults.accessory_rear_label, 'Tub');
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
      'payload',
      'quote_url',
    ]
  );

  // Payload must stay optional: a default would apply a made-up figure to
  // every specification block already saved in the customizer.
  const payloadSetting = customSpec.settings.find((setting) => setting.id === 'payload');
  assert.equal(payloadSetting.type, 'number');
  assert.equal('default' in payloadSetting, false);
  assert.match(payloadSetting.info, /optional/i);
  assert.deepEqual(
    customAccessory.settings.map((setting) => setting.id).filter(Boolean),
    ['enabled', 'target', 'zone', 'label', 'mass_kg']
  );
  const accessoryWeightSetting = customAccessory.settings.find((setting) => setting.id === 'mass_kg');
  assert.match(accessoryWeightSetting.label, /required/i);
  assert.match(accessoryWeightSetting.info, /0/i);
  assert.match(accessoryWeightSetting.info, /empty/i);

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

test('does not ship common mojibake sequences in theme text files', () => {
  const directories = [
    'assets',
    'sections',
    'snippets',
    'templates',
    'locales',
    'config',
    'layout',
    'docs',
  ];
  const textExtensions = new Set([
    '.css',
    '.js',
    '.json',
    '.liquid',
    '.md',
    '.svg',
    '.txt',
  ]);
  const mojibakePattern = /â€¢|Ã¢|â‚¬|Â¢|â€™|â€œ|â€|â€“|ï¿½|�/;
  const matches = [];

  for (const directory of directories) {
    for (const file of walkFiles(directory)) {
      if (!textExtensions.has(file.slice(file.lastIndexOf('.')))) {
        continue;
      }

      const content = readText(file);
      const lines = content.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (mojibakePattern.test(line)) {
          matches.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(matches, []);
});
