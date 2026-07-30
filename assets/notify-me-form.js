if (!customElements.get('notify-me-form')) {
  customElements.define(
    'notify-me-form',
    class NotifyMeForm extends HTMLElement {
      optionChangeUnsubscriber = undefined;
      variantChangeUnsubscriber = undefined;

      connectedCallback() {
        this.triggerButton = this.querySelector('.notify-me-form__trigger');
        this.form = this.querySelector('.notify-me-form__form');
        this.errorMsg = this.querySelector('.notify-me-form__error');
        this.successMsg = this.querySelector('.notify-me-form__success');
        this.fieldsWrapper = this.querySelector('.notify-me-form__fields');
        this.submitButton = this.querySelector('.notify-me-form__submit');

        this.form?.addEventListener('submit', this.handleSubmit.bind(this));

        this.optionChangeUnsubscriber = window.FoxThemeEvents.subscribe(
          PUB_SUB_EVENTS.optionValueSelectionChange,
          this.handleOptionChange.bind(this)
        );

        this.variantChangeUnsubscriber = window.FoxThemeEvents.subscribe(
          PUB_SUB_EVENTS.variantChange,
          this.handleVariantChange.bind(this)
        );
      }

      disconnectedCallback() {
        this.optionChangeUnsubscriber?.();
        this.variantChangeUnsubscriber?.();
      }

      handleOptionChange({ data: { event } }) {
        const productInfo = this.closest('product-info');
        if (!productInfo || !productInfo.contains(event.target)) return;
        this.hideTrigger();
      }

      handleVariantChange({ data: { variant, sectionId } }) {
        if (sectionId !== this.dataset.section) return;
        if (variant && variant.available === false) {
          this.dataset.variantId = variant.id;
          this.showTrigger();
        } else {
          this.hideTrigger();
        }
      }

      async handleSubmit(event) {
        event.preventDefault();

        const email = this.form.querySelector('input[name="email"]').value.trim();
        const variantId = this.dataset.variantId;
        const klaviyoKey = this.dataset.klaviyoKey;
        const listId = this.dataset.listId;

        if (!email || !variantId || !klaviyoKey) return;

        this.setLoading(true);
        this.hideMessages();

        try {
          // Run both API calls in parallel:
          // 1. Subscribe to Back in Stock (triggers the Back In Stock Flow)
          // 2. Add profile to the "Back in stock" list (Ym6NHk)
          const [bisResponse] = await Promise.all([
            fetch(
              `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${klaviyoKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'revision': '2024-10-15'
                },
                body: JSON.stringify({
                  data: {
                    type: 'back-in-stock-subscription',
                    attributes: {
                      channels: ['EMAIL'],
                      profile: {
                        data: {
                          type: 'profile',
                          attributes: { email }
                        }
                      }
                    },
                    relationships: {
                      variant: {
                        data: {
                          type: 'catalog-variant',
                          id: `$shopify:::$default:::${variantId}`
                        }
                      }
                    }
                  }
                })
              }
            ),
            listId
              ? fetch(
                  `https://a.klaviyo.com/client/subscriptions/?company_id=${klaviyoKey}`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'revision': '2024-10-15'
                    },
                    body: JSON.stringify({
                      data: {
                        type: 'subscription',
                        attributes: {
                          custom_source: 'Back in Stock Form',
                          list_id: listId,
                          channels: {
                            email: { fields: ['email'] }
                          },
                          profile: {
                            data: {
                              type: 'profile',
                              attributes: { email }
                            }
                          }
                        }
                      }
                    })
                  }
                )
              : Promise.resolve({ ok: true })
          ]);

          if (bisResponse.ok || bisResponse.status === 202) {
            this.showSuccess();
          } else {
            this.showError();
          }
        } catch {
          this.showError();
        } finally {
          this.setLoading(false);
        }
      }

      showTrigger() {
        if (this.triggerButton) this.triggerButton.style.display = '';
      }

      hideTrigger() {
        if (this.triggerButton) this.triggerButton.style.display = 'none';
      }

      showSuccess() {
        if (this.fieldsWrapper) this.fieldsWrapper.style.display = 'none';
        if (this.successMsg) this.successMsg.style.display = '';
      }

      showError() {
        if (this.errorMsg) this.errorMsg.style.display = '';
      }

      hideMessages() {
        if (this.errorMsg) this.errorMsg.style.display = 'none';
        if (this.successMsg) this.successMsg.style.display = 'none';
      }

      setLoading(loading) {
        if (!this.submitButton) return;
        this.submitButton.disabled = loading;
        this.submitButton.setAttribute('aria-busy', loading);
      }
    }
  );
}
