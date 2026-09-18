# ORI custom change inventory

This is a grouped map of the custom work maintained in the ORI Shopify theme. It focuses on current website features and the files a developer is most likely to change.

## GVM calculator

- `sections/ori-gvm-calculator.liquid` contains the Shopify section and merchant settings.
- `assets/ori-gvm-calculator.js` controls the interface and browser behavior.
- `assets/ori-gvm-calculator-engine.js` contains the calculation rules.
- `assets/ori-gvm-calculator-data.json` contains vehicle, stage, and published limit data.
- `assets/ori-gvm-calculator.css` contains responsive ORI styling.
- `templates/page.gvm-calculator.json` assigns the calculator page layout.
- `tests/ori-gvm-calculator-engine.test.cjs` checks calculations and data completeness.
- `tests/ori-gvm-calculator.spec.js` checks the calculator in desktop and mobile browsers.

## GVM product system

- `sections/ori-gvm-product.liquid` renders the GVM product header and specifications.
- `sections/ori-gvm-benefits.liquid` renders package benefits.
- `sections/ori-gvm-included.liquid` renders included parts and images.
- `sections/ori-gvm-steps.liquid` renders the installation process.
- `sections/ori-gvm-weight-chart.liquid` renders vehicle weight information.
- `sections/ori-package-grid.liquid` renders vehicle and stage package cards.
- `sections/gvm-comparison.liquid` renders package specification comparisons.
- `sections/ori-gvm-review-directory.liquid` renders the consolidated product and stage review links.
- `sections/ori-gvm-approved.liquid` reuses the approved installer source on GVM pages.
- `sections/ori-installer-network.liquid` contains the installer presentation and filtering.
- `templates/product.gvm-stage-alt.json` is the alternate GVM product template.
- `templates/product.gvm-stages-template.json` is the client review version with the package directory.
- `templates/product.stage*.json` files contain vehicle-stage page assignments and merchant content.
- `templates/collection.*-gvm.json` and `templates/page.*gvm*.json` contain vehicle and package landing layouts.

## Forms, dealers, warranty, and support

- `sections/contact-form-v2.liquid`, `contact-form-v3.liquid`, and `contact-form-v4.liquid` provide configurable contact and popup forms.
- `sections/gvm-order-form.liquid` provides the GVM enquiry and stage-selection workflow.
- `sections/dealer-locator.liquid` provides state-based dealer filtering.
- `sections/dealer-conversion.liquid` and `dealer-split-content-form.liquid` support dealer campaign pages.
- `sections/warranty-claim-form.liquid` provides the warranty claim workflow.
- `sections/support-ticket-form.liquid` provides the support request workflow.

## B2B portal

- `sections/b2b-catalog-page.liquid` contains catalogue filtering, quantities, cart actions, and customer access handling.
- `templates/page.b2b-catalog.json` assigns the B2B catalogue layout.
- Customer company status, pricing, and permissions remain Shopify Admin data.

## Storefront components

- `assets/brand-guidelines.css` contains shared ORI brand rules used by custom sections.
- `sections/jump-links.liquid` provides responsive in-page navigation.
- `sections/frequently-bought-with.liquid` provides the product recommendation carousel.
- `sections/product-tabs-guidelines.liquid` provides configurable product information tabs.
- `sections/wheel-comparison-grid.liquid` provides wheel comparison tables.
- `sections/split-content-image.liquid` and `sections/why-choose.liquid` provide reusable content layouts.
- Header, search, navigation, product card, collection, cart, and quick-view files also include ORI-specific adjustments.

## Search and apps

- EasySearch provides the homepage vehicle finder.
- Mappy: Store Locator provides the Store Locator page.
- Shopify Search & Discovery provides overall site search and collection filters.
- The `custom.category_type` product metafield was used as a Search & Discovery collection filter.

## Performance work

- Third-party and analytics activity was adjusted to reduce unnecessary early JavaScript work.
- Speculative resource connections were reduced.
- Slideshow images and deferred media were adjusted for faster visual loading.
- Space is reserved for the homepage vehicle finder to reduce layout movement.
- Commerce scripts were intentionally protected; always retest add to cart and checkout after performance work.

## Autoworks Car Care repository

- Website: https://www.autoworkscarcare.com.au/
- Repository: https://github.com/web-offroadindustries/gusto-theme-aaa
- Local folder: `C:\Projects\ORI\gusto-theme-aaa`
- Custom work includes the Enquire Now product flow, configurable enquiry fields, multi-step forms, Frequently Bought With, GVM comparison improvements, and linked vehicle package pages.
- The custom AAA files were cleaned of development-tool references and comments and are ready for the owner's manual push.
