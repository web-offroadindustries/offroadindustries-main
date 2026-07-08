# GVM calculator vehicle and editor data

The calculator vehicle list is maintained in `assets/ori-gvm-calculator-data.json`.
The accessory list is maintained in the same file under `accessories` and `accessories_by_category`.

## Client editing in Shopify

The calculator section also supports Shopify Theme Editor blocks for common client updates. This is the recommended path when the client wants to add an extra selectable specification or accessory without editing theme files.

In Shopify Admin:

1. Go to **Online Store** > **Themes** > **Customize**.
2. Open the GVM calculator page template.
3. Select the **ORI GVM calculator** section.
4. To rename the accessory columns, edit **First accessory column label**, **Second accessory column label**, and **Third accessory column label**.
5. To let the client fully manage the accessory list from the customizer, keep **Show preloaded accessory items** switched off.
6. Use **Add block**.
7. Choose either **Custom specification** or **Custom accessory**.

### Custom specification block

Use this when the client wants another option inside the **Selected specification** card for an existing dropdown vehicle.

Required fields:

- Vehicle/package - which dropdown vehicle the specification belongs to
- Specification name - customer-facing option label
- Short description - optional helper text shown with the ratings
- GVM (kg)
- GCM (kg)
- Front axle limit (kg)
- Rear axle limit (kg)
- Towing capacity (kg)
- TBM limit (kg)
- Quote/product page URL - optional

The block does not change the vehicle dropdown. It adds another selectable rating option after the vehicle is selected.

### Custom accessory block

Use this when the client wants another checkbox under **Accessories**.

Required fields:

- Show for - all vehicles, all ute vehicles, all wagon vehicles, or one specific vehicle
- Accessory position - First column, Second column, or Third column
- Accessory name
- Weight (kg)

The client should enter actual item mass only. Do not enter spring ratings, payload ratings, tow ratings, or vague capacity values.

The calculator assigns the axle position internally:

- First column - uses the front-mounted accessory axle position by default
- Second column - uses the cabin/mid-vehicle accessory axle position by default
- Third column - uses the tub, tray, canopy, recovery gear, or rear-mounted accessory axle position by default

## Editing a vehicle

Each dropdown option is one object in the `vehicles` array. The base/OEM rating is stored under `factory_specs`; landing-page stage ratings are stored under that vehicle's `upgrades` array.

To update the base/OEM rating, edit the values under `factory_specs`:

- `gvm` - Gross Vehicle Mass limit in kg
- `gcm` - Gross Combined Mass limit in kg
- `front_axle_limit` - front axle rating in kg
- `rear_axle_limit` - rear axle rating in kg
- `towing_capacity` - braked towing capacity in kg
- `tbm_limit` - tow ball mass limit in kg
- `baseline_front_kg` and `baseline_rear_kg` - estimated unloaded axle weights used by the calculator

Keep `baseline_front_kg + baseline_rear_kg` equal to the published kerb weight for that package. If exact unloaded axle weights are available from a weighbridge, use those instead of the estimated split.

To update a landing-page stage option, edit that stage object under `upgrades`. Stage objects use the same rating fields as `factory_specs`, and may also include `baseline_front_kg` and `baseline_rear_kg` when the landing-page table lists a different kerb weight for that stage.

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

- Chevrolet Silverado 1500 OEM and Stage 1-5 landing-page specifications
- Chevy Silverado 2500HD OEM and Stage 1-6.5 landing-page specifications
- Ford F150 OEM and Stage 1-6 landing-page specifications
- Toyota Tundra Factory and Stage 1-4 landing-page specifications
- ORI SSM Chevy Silverado 2500HD Stage 1-6 landing-page specifications, with the SSM page note that it does not expose separate GVM/GCM rows

The current accessory weights use explicit weights from ORI product pages or public Shopify product JSON for:

- Carbon 12K winch kit
- Warn EVO 12-S winch
- Stealth 8.5 in driving lights pair
- Baja Designs S8 10 in light bar
- Factor 55 winch and recovery hardware
- Factor 55 recovery bags/kits

The calculator is a planning tool. Final compliance should always be checked against the exact vehicle paperwork and weighbridge measurements.
