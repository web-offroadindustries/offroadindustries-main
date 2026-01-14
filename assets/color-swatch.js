if (!customElements.get("color-swatch")) {
  class ColorSwatch extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this.optionNodes = this.querySelectorAll("[data-value]");
      this.init();
    }

    disconnectedCallback() {
      this.optionNodes.forEach((button) =>
        button.removeEventListener("mouseenter", this.onMouseEnter.bind(this))
      );
    }

    init() {
      const productCard = this.closest(".product-card");
      this.mainImage = productCard.querySelector(
        ".product-card__image--main img"
      );
      this.optionNodes.forEach((button) =>
        button.addEventListener("mouseenter", this.onMouseEnter.bind(this))
      );

      this.selected = this.querySelector('a[aria-selected="true"]');

      this.getVariantData();
      this.initOptionSwatches();
    }

    initOptionSwatches() {
      this.optionNodes.forEach((optNode) => {
        let variantImage;
        const { optionPosition, value: optionValue } = optNode.dataset;
        const variant = this.variantData.find(
          (v) =>
            v[`option${optionPosition}`] &&
            v[`option${optionPosition}`].toLowerCase() ===
              optionValue.toLowerCase()
        );
        if (variant) {
          variantImage = variant.featured_image
            ? variant.featured_image.src
            : "";
          optNode.href = `${optNode.href}?variant=${variant.id}`;
          if (variantImage) {
            optNode.setAttribute(
              "data-src",
              getSizedImageUrl(variantImage, "900x")
            );
            optNode.setAttribute("data-srcset", getSrcset(variantImage));
          }
        }
      });
    }

    onMouseEnter(e) {
      const { target } = e;
      this.selected && this.selected.removeAttribute("aria-selected");
      target.setAttribute("aria-selected", true);

      const { src, srcset } = target.dataset;
      if (this.mainImage && srcset) {
        this.mainImage.src = src;
        this.mainImage.srcset = srcset;
      }

      this.selected = target;
    }

    getVariantData() {
      this.variantData =
        this.variantData || JSON.parse(this.nextElementSibling.textContent);
    }
  }
  customElements.define("color-swatch", ColorSwatch);
}
