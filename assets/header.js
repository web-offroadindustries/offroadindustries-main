class BasicHeader extends HTMLElement {
  constructor() {
    super();
  }

  get headerSection() {
    return document.querySelector(".f-section-header");
  }

  connectedCallback() {
    // IMPORTANT: make sure this.header exists (StickyHeader uses it)
    this.header = this.closest(".site-header") || this;

    this.classes = {
      active: "f-header__mega-active",
      headerScheme: this.dataset.headerColorScheme,
      dropdownScheme: this.dataset.dropdownColorScheme,
    };

    // Fix level-3 submenu positioning (theme behavior)
    this.grandLinks = this.querySelectorAll(".f-site-nav__sub-item--has-child");
    this.grandLinks &&
      this.grandLinks.forEach((item) => {
        this.handleGrandLinksPosition(item);
      });
  }

  handleMegaItemActive(dropdown) {
    if (!dropdown) return;

    const rect = dropdown.getBoundingClientRect();
    this.style.setProperty("--f-dropdown-height", Math.ceil(rect.height) + "px");

    this.classList.remove(this.classes.headerScheme);
    this.classList.add(this.classes.active, this.classes.dropdownScheme);

    document.documentElement.style.setProperty(
      "--f-header-height",
      this.clientHeight + "px"
    );
  }

  handleMegaItemDeactive() {
    this.classList.remove(this.classes.active, this.classes.dropdownScheme);
    this.classList.add(this.classes.headerScheme);

    document.documentElement.style.setProperty(
      "--f-header-height",
      this.clientHeight + "px"
    );
  }

  handleGrandLinksPosition(target) {
    const dropdownLV3 = target.querySelector(".f-site-nav__dropdown");
    if (!dropdownLV3) return;

    const rect = dropdownLV3.getBoundingClientRect();
    dropdownLV3.classList.remove("f-site-nav__dropdown-reversed");

    // Guard in case FoxThemeSettings isn't available on some pages
    const isRTL = typeof FoxThemeSettings !== "undefined" && FoxThemeSettings.isRTL;

    if (
      (!isRTL && document.documentElement.clientWidth < rect.x + rect.width + 10) ||
      (isRTL && rect.x < 10)
    ) {
      dropdownLV3.classList.add("f-site-nav__dropdown-reversed");
    }
  }
}
customElements.define("basic-header", BasicHeader, { extends: "header" });

class StickyHeader extends BasicHeader {
  constructor() {
    super();
    this.stickyClasses = { pinned: "header-pinned" };
  }

  connectedCallback() {
    super.connectedCallback();

    this.headerSection && this.headerSection.classList.add("header-sticky");
    this.stickyType = this.dataset.stickyType;
    this.currentScrollTop = 0;

    const headerInner = this.headerSection?.querySelector(".header");
    this.headerBounds = headerInner
      ? headerInner.getBoundingClientRect()
      : { top: 0, height: this.clientHeight };

    this.onScrollHandler = this._onScroll.bind(this);
    this._onScroll();
    window.addEventListener("scroll", this.onScrollHandler, false);
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this.onScrollHandler);
  }

  get isAlwaysSticky() {
    return this.stickyType === "always";
  }

  _onScroll() {
    const scrollTop = window.scrollY;
    const headerSection = this.headerSection;
    if (!headerSection) return;

    const headerBoundsTop = this.offsetTop + this.headerBounds.height;
    const headerBoundsBottom =
      this.headerBounds.top + this.headerBounds.height + 100;

    requestAnimationFrame(() => {
      if (scrollTop > headerBoundsTop) {
        headerSection.classList.add("header-scrolled");

        if (this.isAlwaysSticky) {
          document.body.classList.add(this.stickyClasses.pinned);
        } else {
          if (scrollTop < this.currentScrollTop || scrollTop < headerBoundsBottom) {
            document.body.classList.add(this.stickyClasses.pinned);
          } else {
            document.body.classList.remove(this.stickyClasses.pinned);
          }
        }
      } else {
        headerSection.classList.remove("header-scrolled");
        document.body.classList.remove(this.stickyClasses.pinned);
      }

      this.currentScrollTop = scrollTop;
    });
  }

  _closeMenuDisclosure() {
    // this.header is guaranteed by BasicHeader.connectedCallback()
    this.disclosures =
      this.disclosures || this.header.querySelectorAll("header-menu");
    this.disclosures.forEach((disclosure) => disclosure.close());

    this.siteNav = this.siteNav || this.header.querySelector("site-nav");
    this.siteNav && this.siteNav.closeMegaDropdowns();
  }
}
customElements.define("sticky-header", StickyHeader, { extends: "header" });

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
  }

  connectedCallback() {
    this.header = this.closest(".site-header");
    this.classes = { itemActive: "f-menu__item-active" };

    if (this.header) {
      this.header.timeoutEnter = null;
      this.header.timeoutLeave = null;
    }
  }

  onToggle(evt) {
    const { target } = evt;
    const li = target.closest(".f-site-nav__item");
    if (!li || !this.header) return;

    const isOpen = this.mainDetailsToggle.open;
    const isMega = li.classList.contains("f-site-nav__item--mega");

    if (!isOpen) {
      clearTimeout(this.header.timeoutEnter);
      li.classList.remove(this.classes.itemActive);
      this.header.timeoutLeave = setTimeout(() => {
        this.header.handleMegaItemDeactive();
      }, 160);
    } else {
      if (isMega) {
        clearTimeout(this.header.timeoutLeave);
        const dropdown = li.querySelector(".f-site-nav__dropdown");
        this.header.handleMegaItemActive(dropdown);
        this.header.timeoutEnter = setTimeout(() => {
          li.classList.add(this.classes.itemActive);
        }, 160);
      } else {
        li.classList.add(this.classes.itemActive);
      }
    }
  }
}
customElements.define("header-menu", HeaderMenu);

class SiteNav extends HTMLElement {
  constructor() {
    super();
    this._boundEnter = this.onMenuItemEnter.bind(this);
    this._boundLeave = this.onMenuItemLeave.bind(this);
  }

  connectedCallback() {
    this.header =
      this.closest("header.site-header") ||
      this.closest(".site-header") ||
      null;

    this.classes = { itemActive: "f-menu__item-active" };
    this.timeoutEnter = null;
    this.timeoutLeave = null;

    this.isHover =
      this.header && this.header.classList.contains("show-dropdown-menu-on-hover");

    // Run now + run again shortly after (theme editor + async sections can render late)
    this.initLegacyMegaMenus();
    requestAnimationFrame(() => this.initLegacyMegaMenus());
    setTimeout(() => this.initLegacyMegaMenus(), 300);

    // Bind hover behavior
    this.bindMegaItems();
  }

  normalizeText(str) {
    return (str || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  initLegacyMegaMenus() {
    const sources = document.querySelectorAll(
      ".mega-menu-container[data-mega-menu-parent]:not([data-legacy-moved])"
    );
    if (!sources.length) return;

    const navItems = Array.from(this.querySelectorAll(".f-site-nav__item"));

    sources.forEach((menuEl) => {
      const parentRaw = (menuEl.getAttribute("data-mega-menu-parent") || "").trim();
      const parent = this.normalizeText(parentRaw);
      if (!parent) return;

      const matchItem = navItems.find((li) => {
        const labelEl =
          li.querySelector("summary") ||
          li.querySelector(".f-site-nav__link") ||
          li.querySelector("a");
        return this.normalizeText(labelEl?.textContent) === parent;
      });

      if (!matchItem) return;

      // Ensure the legacy mega menu behaves like a dropdown in Gusto
      matchItem.classList.add("f-site-nav__item--mega", "f-site-nav__item--has-child");

      // Remove normal dropdown if it exists (prevents overlapping dropdowns)
      const existing = matchItem.querySelector(".f-site-nav__dropdown");
      if (existing && existing !== menuEl) existing.remove();

      // Make sure it can be measured and styled
      menuEl.style.display = "block";
      menuEl.setAttribute("tabindex", "-1");
      menuEl.setAttribute("data-legacy-moved", "true");

      // Insert directly after the clickable label so it's a true descendant
      const details = matchItem.querySelector("details");
      if (details) {
        const summary = details.querySelector("summary");
        if (summary) summary.insertAdjacentElement("afterend", menuEl);
        else details.appendChild(menuEl);
      } else {
        const linkEl =
          matchItem.querySelector(".f-site-nav__link") || matchItem.querySelector("a");
        if (linkEl) linkEl.insertAdjacentElement("afterend", menuEl);
        else matchItem.appendChild(menuEl);
      }
    });

    // Re-bind after moving (important)
    this.bindMegaItems();
  }

  bindMegaItems() {
    if (!this.isHover) return;

    this.megaItems = Array.from(this.querySelectorAll(".f-site-nav__item--mega"));

    this.megaItems.forEach((li) => {
      if (li.dataset.megaBound === "1") return;
      li.dataset.megaBound = "1";

      li.addEventListener("mouseenter", this._boundEnter);
      li.addEventListener("mouseleave", this._boundLeave);

      // Prevent close when hovering inside dropdown
      const dropdown = li.querySelector(".mega-menu-container");
      if (dropdown && dropdown.dataset.dropdownBound !== "1") {
        dropdown.dataset.dropdownBound = "1";

        dropdown.addEventListener("mouseenter", () => {
          clearTimeout(this.timeoutLeave);
        });

        dropdown.addEventListener("mouseleave", () => {
          this.scheduleClose(li);
        });
      }
    });
  }

  onMenuItemEnter(evt) {
    clearTimeout(this.timeoutLeave);

    const li = evt.currentTarget;
    if (!li) return;

    // Close other mega items
    this.megaItems.forEach((item) => item.classList.remove(this.classes.itemActive));

    const dropdown = li.querySelector(".mega-menu-container");
    if (!dropdown) return;

    // Activate header backdrop if available
    if (this.header && typeof this.header.handleMegaItemActive === "function") {
      this.header.handleMegaItemActive(dropdown);
    }

    this.timeoutEnter = setTimeout(() => {
      li.classList.add(this.classes.itemActive);
    }, 10);
  }

  scheduleClose(li) {
    if (!li) return;

    clearTimeout(this.timeoutEnter);

    this.timeoutLeave = setTimeout(() => {
      li.classList.remove(this.classes.itemActive);

      if (this.header && typeof this.header.handleMegaItemDeactive === "function") {
        this.header.handleMegaItemDeactive();
      }
    }, 180);
  }

  onMenuItemLeave(evt) {
    const li = evt.currentTarget;
    this.scheduleClose(li);
  }

  closeMegaDropdowns() {
    clearTimeout(this.timeoutEnter);
    clearTimeout(this.timeoutLeave);

    this.megaItems &&
      this.megaItems.forEach((li) => li.classList.remove(this.classes.itemActive));

    if (this.header && typeof this.header.handleMegaItemDeactive === "function") {
      this.header.handleMegaItemDeactive();
    }
  }

  disconnectedCallback() {
    if (!this.megaItems) return;

    this.megaItems.forEach((li) => {
      li.removeEventListener("mouseenter", this._boundEnter);
      li.removeEventListener("mouseleave", this._boundLeave);
      li.dataset.megaBound = "";
    });
  }
}
customElements.define("site-nav", SiteNav);

(function () {
  if (window.__legacyMegaMobileInit) return;
  window.__legacyMegaMobileInit = true;

  function normalizeText(str) {
    return (str || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function inject() {
    const drawer =
      document.querySelector("#Drawer-MobileNav") ||
      document.querySelector(".f-drawer-mobile-nav") ||
      document.querySelector("[data-drawer='mobile-nav']");

    if (!drawer) return;

    // Mobile nav container (your screenshot shows .f-mobile-nav__link inside)
    const mobileNav =
      drawer.querySelector("#Mobile-Nav") ||
      drawer.querySelector(".f-mobile-nav") ||
      drawer;

    if (!mobileNav) return;

    // Clone from existing mega menus (these already exist because desktop injection moved them)
    const sources = document.querySelectorAll(".mega-menu-container[data-mega-menu-parent]");
    if (!sources.length) return;

    const mobileItems = Array.from(mobileNav.querySelectorAll(".f-mobile-nav__item"));
    if (!mobileItems.length) return;

    sources.forEach((src) => {
      const parent = normalizeText(src.getAttribute("data-mega-menu-parent"));
      if (!parent) return;

      // Match by mobile menu text
      const li = mobileItems.find((item) => {
        const a = item.querySelector(".f-mobile-nav__link");
        return normalizeText(a && a.textContent) === parent;
      });
      if (!li) return;
      if (li.dataset.mobileMegaInjected === "1") return;

      // Find existing dropdown area in the drawer item
      // (some themes already output .f-mobile-nav__dropdown when it has children)
      let dropdown =
        li.querySelector(".f-mobile-nav__dropdown") ||
        li.querySelector("[data-content]");

      // If dropdown does not exist, create it (minimal, won’t break your + toggle)
      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "f-mobile-nav__dropdown";
        li.appendChild(dropdown);
      }

      // Clone + mark as moved so desktop binder won’t re-grab it
      const clone = src.cloneNode(true);
      clone.classList.add("mega-menu-container--mobile");
      clone.setAttribute("data-legacy-moved", "true");
      clone.style.display = "block";

      // OPTIONAL: if you want the mobile look like your reference (stacked + accordion),
      // we can transform the structure here later. For now it will show the same content.

      dropdown.innerHTML = "";
      dropdown.appendChild(clone);

      li.dataset.mobileMegaInjected = "1";
    });
  }

  // Run on load
  document.addEventListener("DOMContentLoaded", () => {
    inject();
    setTimeout(inject, 300);
  });

  // Also run when the drawer opens (some themes render drawer content lazily)
  const obsTarget =
    document.querySelector("#Drawer-MobileNav") ||
    document.querySelector(".f-drawer-mobile-nav");

  if (obsTarget) {
    const mo = new MutationObserver(() => inject());
    mo.observe(obsTarget, { attributes: true, childList: true, subtree: true });
  }
})();