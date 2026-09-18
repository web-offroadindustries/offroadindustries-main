# ORI website developer handover

Prepared for the next developer responsible for the Offroad Industries and Autoworks Car Care Shopify websites.

## Website and repository access

### Offroad Industries

- Website: https://www.offroadindustries.com.au/
- Current repository: https://github.com/web-offroadindustries/offroadindustries-main
- Previous repository: https://github.com/joffreycraftysimon/Gusto-Theme.git
- Local project folder: `C:\Users\chels\OneDrive\Documents\GitHub\Gusto-Theme`
- The current repository is the ORI-owned handover repository and should be used for future work.
- GitHub access uses the ORI Gmail account through Google sign-in.
- The password is recorded only in the private PDF handover and must not be stored in Git.

### Autoworks Car Care

- Website: https://www.autoworkscarcare.com.au/
- Repository: https://github.com/web-offroadindustries/gusto-theme-aaa
- Local project folder: `C:\Projects\ORI\gusto-theme-aaa`
- The AAA handover cleanup is saved locally and is ready for the final manual push.

## Handover status

- The ORI GVM calculator is complete and is not pending work.
- The calculator payload field is visible and calculates against the payload allowance for the selected vehicle stage.
- Calculator vehicle, stage, payload, GVM, GCM, axle, trailer, accessory, copy-summary, tutorial, error, and responsive behavior have automated coverage.
- The ORI calculator passed 36 code and data checks and 48 browser checks across desktop and mobile test projects.
- The custom AAA files were checked for development-assistant references and none remain.
- Comments were removed from the custom AAA assets, sections, snippets, and GVM templates without changing their storefront behavior.
- There is no open calculator item to carry into the handover.

## ORI custom work

### GVM calculator

The calculator is a custom page section that lets a visitor select an ORI vehicle package and stage, enter trailer and cabin loads, enter a payload to check, add accessories, and review the result against published limits.

Important files:

- `sections/ori-gvm-calculator.liquid`
- `assets/ori-gvm-calculator.js`
- `assets/ori-gvm-calculator-engine.js`
- `assets/ori-gvm-calculator.css`
- `assets/ori-gvm-calculator-data.json`
- `templates/page.gvm-calculator.json`
- `tests/ori-gvm-calculator-engine.test.cjs`
- `tests/ori-gvm-calculator.spec.js`

The vehicle list includes Chevrolet Silverado 1500, Chevrolet Silverado 2500HD, Ford F150, Toyota Tundra, RAM 2500HD 5th Gen, RAM 2500 6th Gen, Silverado 2500 NB1 legal builds, and Silverado 1500 4-inch and 6-inch legal builds.

The payload entry is a separate limit check and does not change the GVM, GCM, axle, trailer, passenger, cargo, or accessory mass calculations.

Vehicle and stage figures are stored in `assets/ori-gvm-calculator-data.json`; update that file when published package specifications change, then run both the code tests and browser tests.

### GVM product and landing pages

- Custom vehicle landing pages were built for Chevrolet, Ford, Toyota, and RAM GVM packages.
- Product stage templates were created for individual stages and vehicle families.
- `product.gvm-stage-alt.json` was used as the starting point for `product.gvm-stages-template.json`.
- The stages template includes a review directory so the client can open package and stage links from one page.
- Custom GVM sections cover the product hero, benefits, included parts, steps, specifications, package cards, comparison tables, approved installers, payload information, and quote forms.
- Product values can use product and variant metafields for GVM, GCM, payload, stage, pricing, and included images.

### Forms and dealer features

- Custom contact forms support configurable fields, required fields, conditional selections, multi-step presentation, and popup use.
- Dealer enquiry and conversion sections were added for campaign pages.
- The dealer locator and approved installer sections provide state filtering and reusable installer information.
- Warranty and support forms include structured fields and file-upload handling.
- The GVM order form supports vehicle and stage selection with an enquiry workflow.

### B2B portal

- A custom B2B catalogue and customer account flow were added for approved wholesale customers.
- The B2B catalogue supports product search, filtering, pricing display, quantity entry, cart actions, and account access.
- Customer permissions and company data still depend on Shopify customer configuration, so test with an approved B2B account after any account or pricing change.

### Storefront and performance work

- Shared ORI brand styles were added for headings, colors, buttons, form controls, and custom sections.
- Header, navigation, quick search, mobile drawer, product tabs, collection layouts, and responsive cards were updated.
- Performance work reduced unnecessary speculative connections, deferred selected third-party activity, improved slideshow image priority, reserved widget space, and protected cart behavior.
- Do not delay or remove commerce scripts without testing add to cart, cart updates, discount behavior, and checkout on a theme preview.

## Shopify apps and admin configuration

- EasySearch is installed and is used for the vehicle finder on the homepage.
- Mappy: Store Locator is installed and is used on the Store Locator page.
- Shopify Search & Discovery was updated for the overall website search and collection filtering.
- App blocks and app embeds are configured in Shopify Admin and may not be fully represented by theme files alone.

## Category Type metafield

- The product metafield is named **Category Type**.
- Namespace and key: `custom.category_type`.
- It was used previously as a product filter on collection pages through Shopify Search & Discovery.
- The theme uses Shopify's generic filter rendering, so the metafield name does not need to appear directly in a custom Liquid file.
- Before renaming or removing it, check **Shopify Admin > Settings > Custom data > Products** and the Search & Discovery filter list.
- Standardise duplicate values before bulk editing products because value changes affect existing filter links and product assignments.

## Autoworks Car Care custom work

- Added an Enquire Now product flow using a native Shopify contact form instead of cart submission when enquiry mode is enabled.
- Kept the selected product, variant, SKU, quantity, and product URL synchronized inside the enquiry form.
- Prevented the enquiry-only product form from accidentally adding an item to the cart.
- Removed duplicate or stale enquiry popups after product or theme-editor updates.
- Reopened the enquiry popup after submission so the customer can see success and error messages.
- Added merchant-editable enquiry fields to product sections.
- Added a reusable multi-step contact form with progress, Back, Next, validation, and mobile styling.
- Added a Frequently Bought With section with selected-product or collection sources and duplicate protection.
- Added and linked GVM package pages for Chevrolet Silverado, Ford F150, RAM 2500, Toyota Tundra, and Toyota LC300.
- Added NB1 Chevrolet Silverado 1500 and 2500 package pages.
- Added the RAM 2500 6th Gen package workflow and Toyota LC300 package content.
- Improved GVM comparison tables so long part numbers remain readable and desktop tables can scroll without breaking mobile cards.
- Standardised RAM part numbers and displayed package weights consistently in kilograms.
- Updated the Autoworks contact address and package contact forms.

## Maintenance notes

- Treat Shopify theme-editor synchronization as a real source of changes; review incoming Shopify updates before replacing repository files.
- Keep calculator data changes separate from calculation-engine changes so published figures are easy to audit.
- Test revenue paths after JavaScript or performance changes: variant selection, add to cart, cart drawer/page, discounts, and checkout.
- Test app sections in a Shopify preview because app blocks may not work in a standalone local fixture.
- Keep account credentials in the private handover document or a password manager, never in the repository.

## Verification commands

From the ORI repository root:

```powershell
node --test tests/*.test.cjs
Set-Location tests
npx playwright test -c ori-gvm-playwright.config.js
```

For changed JavaScript files:

```powershell
node --check assets/ori-gvm-calculator-engine.js
node --check assets/ori-gvm-calculator.js
```

## Final handover checklist

- Confirm access to the ORI Gmail account and GitHub organization.
- Confirm the ORI repository opens and the main branch contains the complete theme.
- Confirm the AAA repository opens and manually push the prepared local cleanup.
- Confirm access to Shopify Admin for both websites.
- Confirm EasySearch, Mappy, and Search & Discovery access in Shopify Admin.
- Open the ORI GVM calculator and test one standard package, one NB1 package, and the payload field.
- Test add to cart and checkout using a Shopify theme preview after the next theme change.
- Move the credentials from the private PDF into the company's approved password manager and rotate them after handover.
