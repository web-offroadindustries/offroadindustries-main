class BasicHeader extends HTMLElement {
  constructor() {
    super();
  }

  get headerSection() {
    return document.querySelector(".f-section-header");
  }

  connectedCallback() {
    this.classes = {
      active: "f-header__mega-active",
      headerScheme: this.dataset.headerColorScheme,
      dropdownScheme: this.dataset.dropdownColorScheme,
    };

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

    // Switch header scheme while dropdown is open
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
    if (dropdownLV3) {
      const rect = dropdownLV3.getBoundingClientRect();
      dropdownLV3.classList.remove("f-site-nav__dropdown-reversed");
      if (
        (!FoxThemeSettings.isRTL &&
          document.documentElement.clientWidth < rect.x + rect.width + 10) ||
        (FoxThemeSettings.isRTL && rect.x < 10)
      ) {
        dropdownLV3.classList.add("f-site-nav__dropdown-reversed");
      }
    }
  }
}
customElements.define("basic-header", BasicHeader, { extends: "header" });

class StickyHeader extends BasicHeader {
  constructor() {
    super();

    this.stickyClasses = {
      pinned: "header-pinned",
    };
  }

  connectedCallback() {
    super.connectedCallback();

    this.headerSection.classList.add("header-sticky");
    this.stickyType = this.dataset.stickyType;
    this.currentScrollTop = 0;

    this.headerBounds = this.headerSection
      .querySelector(".header")
      .getBoundingClientRect();

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
    this.classes = {
      itemActive: "f-menu__item-active",
    };
    this.header.timeoutEnter = null;
    this.header.timeoutLeave = null;
  }

  onToggle(evt) {
    const { target } = evt;
    const li = target.closest(".f-site-nav__item");
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
  }

  connectedCallback() {
    this.header = this.closest(".site-header");
    this.classes = { itemActive: "f-menu__item-active" };

    this.timeoutEnter = null;
    this.timeoutLeave = null;

    this.isHover =
      this.header && this.header.classList.contains("show-dropdown-menu-on-hover");

    // ✅ Run legacy injection multiple times because header-group sections can render AFTER <site-nav>
    const boot = () => {
      this.initLegacyMegaMenus();
      this.megaItems = this.querySelectorAll(".f-site-nav__item--mega");

      if (this.isHover) {
        this.megaItems.forEach((megaItem) => {
          if (megaItem.dataset.megaBound === "1") return;
          megaItem.dataset.megaBound = "1";

          megaItem.addEventListener("mouseenter", (evt) => this.onMenuItemEnter(evt));
          megaItem.addEventListener("mouseleave", (evt) => this.onMenuItemLeave(evt));
        });
      }
    };

    boot();
    requestAnimationFrame(boot);
    setTimeout(boot, 300);
  }

  initLegacyMegaMenus() {
    const sources = document.querySelectorAll(
      ".mega-menu-container[data-mega-menu-parent]:not([data-legacy-moved])"
    );
    if (!sources.length) return;

    const navItems = Array.from(this.querySelectorAll(".f-site-nav__item"));

    sources.forEach((menuEl) => {
      const parent = (menuEl.getAttribute("data-mega-menu-parent") || "").trim();
      if (!parent) return;

      const matchItem = navItems.find((li) => {
        const labelEl =
          li.querySelector("summary") ||
          li.querySelector(".f-site-nav__link") ||
          li.querySelector("a");
        return ((labelEl?.textContent || "").trim() === parent);
      });

      if (!matchItem) return;

      // Mark it as mega so theme hover logic applies
      matchItem.classList.add("f-site-nav__item--mega", "f-site-nav__item--has-child");

      // Ensure the dropdown has the expected class for Gusto behavior
      // (If your snippet wrapper already has f-site-nav__dropdown, this is safe)
      if (!menuEl.classList.contains("f-site-nav__dropdown")) {
        menuEl.classList.add("f-site-nav__dropdown");
      }

      const existing = matchItem.querySelector(
        ".f-site-nav__dropdown.mega-menu-container[data-legacy-moved='true']"
      );
      if (existing) return; // already injected

      // Remove any existing dropdown inside this item (optional; prevents duplicates)
      const existingAny = matchItem.querySelector(".f-site-nav__dropdown");
      if (existingAny && existingAny !== menuEl) existingAny.remove();

      menuEl.setAttribute("data-legacy-moved", "true");

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
  }

  onMenuItemEnter(evt) {
    clearTimeout(this.timeoutLeave);

    const { target } = evt;

    // Close other mega items immediately when entering a new one
    if (!target.classList.contains(this.classes.itemActive)) {
      this.megaItems &&
        this.megaItems.forEach((megaItem) => {
          megaItem.classList.remove(this.classes.itemActive);
        });
    }

    const dropdown = target.querySelector(".f-site-nav__dropdown");

    if (dropdown) {
      this.header.handleMegaItemActive(dropdown);

      // Small delay helps prevent flicker when moving mouse to dropdown content
      this.timeoutEnter = setTimeout(() => {
        target.classList.add(this.classes.itemActive);
      }, 50);
    }
  }

  onMenuItemLeave(evt) {
    const { target } = evt;

    clearTimeout(this.timeoutEnter);

    // Delay close so user can move into dropdown content without it disappearing instantly
    this.timeoutLeave = setTimeout(() => {
      this.header.handleMegaItemDeactive();
      target.classList.remove(this.classes.itemActive);
    }, 200);
  }

  closeMegaDropdowns() {
    clearTimeout(this.timeoutEnter);
    clearTimeout(this.timeoutLeave);

    this.megaItems &&
      this.megaItems.forEach((megaItem) => {
        megaItem.classList.remove(this.classes.itemActive);
      });

    this.header.handleMegaItemDeactive();
  }

  disconnectedCallback() {
    this.megaItems &&
      this.megaItems.forEach((megaItem) => {
        megaItem.removeEventListener("mouseenter", this.onMenuItemEnter);
        megaItem.removeEventListener("mouseleave", this.onMenuItemLeave);
      });
  }
}
customElements.define("site-nav", SiteNav);
