if (!customElements.get("variant-picker")) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();
    }

    get selectedOptionValues() {
      const options = this.querySelectorAll(
        "select, .variant-picker__field input[type='radio']"
      );
      const selectedValues = new Map();

      options.forEach((field) => {
        const fieldName = field.name || field.dataset.fieldName;

        if (field.tagName.toLowerCase() === "select") {
          const selectedOption = Array.from(field.options).find(
            (opt) => opt.selected && !opt.disabled
          );
          if (selectedOption) {
            selectedValues.set(fieldName, selectedOption.dataset.optionValueId);
          }
        } else if (
          field.tagName.toLowerCase() === "input" &&
          field.type === "radio"
        ) {
          const checkedInput = field.checked ? field : null;
          if (checkedInput) {
            selectedValues.set(fieldName, checkedInput.dataset.optionValueId);
          }
        }
      });

      options.forEach((field) => {
        const fieldName = field.name || field.dataset.fieldName;

        if (!selectedValues.has(fieldName)) {
          if (field.tagName.toLowerCase() === "select") {
            const firstValidOption = Array.from(field.options).find(
              (opt) => !opt.disabled
            );
            if (firstValidOption) {
              selectedValues.set(
                fieldName,
                firstValidOption.dataset.optionValueId
              );
            }
          } else if (
            field.tagName.toLowerCase() === "input" &&
            field.type === "radio"
          ) {
            const firstInput = field;
            if (firstInput) {
              selectedValues.set(fieldName, firstInput.dataset.optionValueId);
            }
          }
        }
      });

      const result = [];
      options.forEach((field) => {
        const fieldName = field.name || field.dataset.fieldName;
        if (selectedValues.has(fieldName)) {
          const optionValueId = selectedValues.get(fieldName);
          if (optionValueId && !result.includes(optionValueId)) {
            result.push(optionValueId);
          }
        }
      });
      return result;
    }

    getInputForEventTarget(target) {
      return target.tagName === "SELECT" ? target.selectedOptions[0] : target;
    }

    connectedCallback() {
      this.addEventListener("change", (event) => {
        const target = this.getInputForEventTarget(event.target);
        window.FoxThemeEvents.emit(PUB_SUB_EVENTS.optionValueSelectionChange, {
          data: {
            event,
            target,
            selectedOptionValues: this.selectedOptionValues,
          },
        });
      });
    }
  }

  customElements.define("variant-picker", VariantPicker);
}
