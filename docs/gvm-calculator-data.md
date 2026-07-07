# GVM calculator vehicle data

The calculator vehicle list is maintained in `assets/ori-gvm-calculator-data.json`.
The accessory list is maintained in the same file under `accessories` and `accessories_by_category`.

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

## Editing accessories

Accessories require:

- `id` - unique machine-readable key
- `label` - customer-facing accessory name
- `mass_kg` - accessory mass in kg
- `position_ratio` - estimated fore/aft load position used by the axle calculator

Use only actual item mass values. Do not use spring ratings, load ratings, towing ratings, wheel ratings, or capacity ratings as accessory weights. If the Shopify variant weight looks like a freight placeholder, such as repeated `100000` gram values across unrelated items, do not use it without confirmation.

Current position-ratio conventions:

- `-0.2` - front-mounted accessories ahead of the front axle
- `1.1` - ute tub/cargo items behind the rear axle
- `1.4` - tow-hitch/rear-bar-adjacent items further behind the rear axle

## Current source basis

The current vehicle limits use ORI published GVM package pages and the supplied PDF references for:

- Ford F150 OEM, 3700kg, 4300kg, and 4000kg packages
- Toyota Tundra 3850kg package
- Chevrolet Silverado 2500HD 6000kg package
- Chevrolet Silverado 1500 LTZ 3850kg package

The current accessory weights use explicit weights from ORI product pages or public Shopify product JSON for:

- Carbon 12K winch kit
- Warn EVO 12-S winch
- Stealth 8.5 in driving lights pair
- Baja Designs S8 10 in light bar
- Factor 55 winch and recovery hardware
- Factor 55 recovery bags/kits

The calculator is a planning tool. Final compliance should always be checked against the exact vehicle paperwork and weighbridge measurements.
