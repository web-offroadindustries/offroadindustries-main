# GVM calculator vehicle data

The calculator vehicle list is maintained in `assets/ori-gvm-calculator-data.json`.

## Editing a vehicle

Each dropdown option is one object in the `vehicles` array. To update a rating, edit the values under `factory_specs`:

- `gvm` - Gross Vehicle Mass limit in kg
- `gcm` - Gross Combined Mass limit in kg
- `front_axle_limit` - front axle rating in kg
- `rear_axle_limit` - rear axle rating in kg
- `towing_capacity` - braked towing capacity in kg
- `tbm_limit` - tow ball mass limit in kg
- `baseline_front_kg` and `baseline_rear_kg` - estimated unloaded axle weights used by the calculator

Keep `baseline_front_kg + baseline_rear_kg` equal to the published kerb weight for that package. If exact unloaded axle weights are available from a weighbridge, use those instead of the estimated split.

## Adding a dropdown option

Copy an existing vehicle object, give it a unique `id`, update `name`, `quote_url`, `source_note`, and all `factory_specs` values, then run from the theme root:

```powershell
node --test tests/ori-gvm-calculator-engine.test.cjs
Push-Location tests
npx playwright test -c ori-gvm-playwright.config.js --timeout=15000
Pop-Location
```

## Current source basis

The current vehicle limits use ORI published GVM package pages and the supplied PDF references for:

- Ford F150 OEM, 3700kg, 4300kg, and 4000kg packages
- Toyota Tundra 3850kg package
- Chevrolet Silverado 2500HD 6000kg package
- Chevrolet Silverado 1500 LTZ 3850kg package

The calculator is a planning tool. Final compliance should always be checked against the exact vehicle paperwork and weighbridge measurements.
