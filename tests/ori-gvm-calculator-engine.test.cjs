const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../assets/ori-gvm-calculator-engine.js');

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

test('uses upgrade limits without changing the current load', () => {
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
