(function (root, factory) {
  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ORIGvmCalculatorEngine = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var REQUIRED_FACTORY_FIELDS = [
    'wheelbase_mm',
    'hitch_overhang_mm',
    'baseline_front_kg',
    'baseline_rear_kg',
    'gvm',
    'gcm',
    'front_axle_limit',
    'rear_axle_limit',
    'towing_capacity',
    'tbm_limit',
  ];

  function normalizeMass(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function normalizeRatio(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function roundResult(value) {
    return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
  }

  function splitMass(mass, ratio) {
    var normalizedMass = normalizeMass(mass);
    var normalizedRatio = normalizeRatio(ratio, 0.5);

    return {
      front: roundResult(normalizedMass * (1 - normalizedRatio)),
      rear: roundResult(normalizedMass * normalizedRatio),
    };
  }

  function validateVehicle(vehicle) {
    var missing = [];

    if (!vehicle || typeof vehicle !== 'object') {
      return { valid: false, missing: ['vehicle'] };
    }

    if (!vehicle.factory_specs || typeof vehicle.factory_specs !== 'object') {
      return { valid: false, missing: ['factory_specs'] };
    }

    REQUIRED_FACTORY_FIELDS.forEach(function (field) {
      if (normalizeMass(vehicle.factory_specs[field]) === 0) {
        missing.push(field);
      }
    });

    return {
      valid: missing.length === 0,
      missing: missing,
    };
  }

  function mapLimits(source) {
    return {
      gvm: normalizeMass(source.gvm),
      gcm: normalizeMass(source.gcm),
      frontAxleLimit: normalizeMass(source.front_axle_limit),
      rearAxleLimit: normalizeMass(source.rear_axle_limit),
      towingCapacity: normalizeMass(source.towing_capacity),
      tbmLimit: normalizeMass(source.tbm_limit),
    };
  }

  function getLimits(vehicle, upgradeId) {
    var factorySpecs = vehicle && vehicle.factory_specs ? vehicle.factory_specs : {};
    var upgrades = vehicle && Array.isArray(vehicle.upgrades) ? vehicle.upgrades : [];
    var selected = null;

    if (upgradeId) {
      selected = upgrades.find(function (upgrade) {
        return upgrade && String(upgrade.id) === String(upgradeId);
      });
    }

    return mapLimits(selected || factorySpecs);
  }

  function calculate(vehicle, state) {
    var safeState = state || {};
    var factorySpecs = vehicle && vehicle.factory_specs ? vehicle.factory_specs : {};
    var limits = getLimits(vehicle, safeState.selectedUpgradeId);
    var frontAxle = normalizeMass(factorySpecs.baseline_front_kg);
    var rearAxle = normalizeMass(factorySpecs.baseline_rear_kg);
    var passengersKg = normalizeMass(safeState.passengersKg);
    var cargoRearKg = normalizeMass(safeState.cargoRearKg);
    var atm = normalizeMass(safeState.atm);
    var tbm = normalizeMass(safeState.tbm);
    var selectedAccessories = Array.isArray(safeState.selectedAccessories)
      ? safeState.selectedAccessories
      : [];
    var accessoryMass = 0;
    var split = splitMass(passengersKg, 0.45);

    frontAxle += split.front;
    rearAxle += split.rear;

    split = splitMass(cargoRearKg, 1.1);
    frontAxle += split.front;
    rearAxle += split.rear;

    selectedAccessories.forEach(function (accessory) {
      var mass = normalizeMass(accessory && accessory.mass_kg);
      var ratio = normalizeRatio(accessory && accessory.position_ratio, 0.5);
      var accessorySplit = splitMass(mass, ratio);

      accessoryMass += mass;
      frontAxle += accessorySplit.front;
      rearAxle += accessorySplit.rear;
    });

    var wheelbase = normalizeMass(factorySpecs.wheelbase_mm);
    var hitchOverhang = normalizeMass(factorySpecs.hitch_overhang_mm);
    var leverRatio = wheelbase > 0 ? hitchOverhang / wheelbase : 0;

    frontAxle -= tbm * leverRatio;
    rearAxle += tbm * (1 + leverRatio);

    var baselineMass =
      normalizeMass(factorySpecs.baseline_front_kg) +
      normalizeMass(factorySpecs.baseline_rear_kg);
    var vehicleMass = baselineMass + passengersKg + cargoRearKg + accessoryMass + tbm;
    var trailerAxleMass = Math.max(0, atm - tbm);
    var combinedMass = vehicleMass + trailerAxleMass;

    return {
      limits: limits,
      frontAxle: roundResult(frontAxle),
      rearAxle: roundResult(rearAxle),
      baselineMass: roundResult(baselineMass),
      passengerMass: roundResult(passengersKg),
      cargoMass: roundResult(cargoRearKg),
      accessoryMass: roundResult(accessoryMass),
      atm: roundResult(atm),
      tbm: roundResult(tbm),
      vehicleMass: roundResult(vehicleMass),
      trailerAxleMass: roundResult(trailerAxleMass),
      combinedMass: roundResult(combinedMass),
    };
  }

  function classifyStatus(value, limit, warningThreshold) {
    var normalizedValue = normalizeMass(value);
    var normalizedLimit = normalizeMass(limit);
    var threshold = Number(warningThreshold);

    if (normalizedLimit === 0) {
      return 'unavailable';
    }

    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      threshold = 0.95;
    }

    if (normalizedValue < normalizedLimit * threshold) {
      return 'ok';
    }

    return normalizedValue <= normalizedLimit ? 'warning' : 'danger';
  }

  function percentage(value, limit) {
    var normalizedLimit = normalizeMass(limit);

    if (normalizedLimit === 0) {
      return 0;
    }

    return roundResult((normalizeMass(value) / normalizedLimit) * 100);
  }

  return {
    normalizeMass: normalizeMass,
    splitMass: splitMass,
    validateVehicle: validateVehicle,
    getLimits: getLimits,
    calculate: calculate,
    classifyStatus: classifyStatus,
    percentage: percentage,
  };
});
