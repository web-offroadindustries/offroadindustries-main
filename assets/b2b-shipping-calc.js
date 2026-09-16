if (!customElements.get('b2b-shipping-calc')) {
  customElements.define('b2b-shipping-calc', class B2BShippingCalc extends HTMLElement {
    connectedCallback() {
      this.countryEl   = this.querySelector('[data-country]');
      this.provinceEl  = this.querySelector('[data-province]');
      this.provinceWrap = this.querySelector('[data-province-wrapper]');
      this.cityEl      = this.querySelector('[data-city]');
      this.zipEl       = this.querySelector('[data-zip]');
      this.calcBtn     = this.querySelector('[data-calc-btn]');
      this.resultEl    = this.querySelector('[data-result]');
      this.tmpl        = this.querySelector('template');

      this._initCountries();
      this.calcBtn.addEventListener('click', this._handleCalc.bind(this));
      this.countryEl.addEventListener('change', this._handleCountryChange.bind(this));

      /* A quote is only true for the cart it was priced against, so clear the
       * panel on any cart change rather than leave a stale number on screen. */
      /* PUB_SUB_EVENTS is a top-level const in global.js: a global binding but
       * not a property of window. Reach it by name and typeof-guard it. */
      if (window.FoxThemeEvents && typeof PUB_SUB_EVENTS !== 'undefined') {
        window.FoxThemeEvents.subscribe(PUB_SUB_EVENTS.cartUpdate, () => {
          if (this.resultEl) this.resultEl.innerHTML = '';
        });
      }
    }

    _initCountries() {
      if (!this.tmpl) return;
      this.countryEl.innerHTML = this.tmpl.innerHTML;

      const def = this.countryEl.dataset.default;
      if (def) {
        const opt = Array.from(this.countryEl.options).find(o => o.value === def || o.text === def);
        if (opt) { opt.selected = true; this._handleCountryChange(); }
      }
    }

    _handleCountryChange() {
      const sel = this.countryEl.options[this.countryEl.selectedIndex];
      let provinces = [];
      try { provinces = sel && sel.dataset.provinces ? JSON.parse(sel.dataset.provinces) : []; } catch(e) {}

      if (provinces.length) {
        this.provinceEl.innerHTML = provinces.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('');
        this.provinceWrap.style.display = '';
      } else {
        this.provinceEl.innerHTML = '';
        this.provinceWrap.style.display = 'none';
      }
    }

    /* Prices the real cart, and never modifies it. An earlier version added
     * the product, read the rates and removed it again, which mispriced any
     * multi-item cart (/cart/shipping_rates.json prices the whole cart) and
     * could strand an item when the fire-and-forget removal failed. */
    async _handleCalc(e) {
      e.preventDefault();
      const country  = this.countryEl.value;
      const province = this.provinceEl.value || '';
      const city     = this.cityEl ? this.cityEl.value.trim() : '';
      const zip      = this.zipEl.value.trim();

      if (!country || !zip) {
        this.resultEl.innerHTML = '<p class="b2b-calc__error">Please enter a country and postcode.</p>';
        return;
      }

      this.calcBtn.disabled = true;
      this.calcBtn.classList.add('btn--loading');
      this.resultEl.innerHTML = '';

      try {
        const cartResp = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
        const cart = cartResp.ok ? await cartResp.json() : null;

        if (!cart || !cart.item_count) {
          this.resultEl.innerHTML =
            '<p class="b2b-calc__no-rates">Add this product to your cart first, then estimate shipping. '
            + 'Freight is priced on the whole order, so the quote has to be for everything you are buying.</p>';
          return;
        }

        const qs = new URLSearchParams({
          'shipping_address[zip]': zip,
          'shipping_address[city]': city,
          'shipping_address[country]': country,
          'shipping_address[province]': province
        });
        const ratesResp = await fetch(`/cart/shipping_rates.json?${qs}`);
        const ratesData = await ratesResp.json();

        this._showRates(ratesData, cart.item_count);
      } catch (err) {
        this.resultEl.innerHTML = '<p class="b2b-calc__error">Unable to calculate shipping. Please try again.</p>';
      } finally {
        this.calcBtn.disabled = false;
        this.calcBtn.classList.remove('btn--loading');
      }
    }

    _showRates(data, itemCount) {
      /* Printed on every outcome, not just the happy path. The whole point of
       * the line is to stop a freight number being read as the cost of the one
       * product on screen, and the "must be quoted" branch is the easiest one
       * to misread. */
      const scope = `<p class="b2b-calc__scope">For the ${itemCount} item${itemCount === 1 ? '' : 's'} currently in your cart.</p>`;
      if (data.shipping_rates && data.shipping_rates.length > 0) {
        const fmt = window.FoxThemeSettings && window.FoxThemeSettings.money_format;

        // Machship uses $9999 as a sentinel price meaning "contact us for a quote".
        // Filter those out so we only display real calculated rates.
        const realRates = data.shipping_rates.filter(r => parseFloat(r.price) < 9000);

        if (realRates.length > 0) {
          const rows = realRates.map(r => {
            const priceNum = parseFloat(r.price);
            let priceHtml;
            if (priceNum === 0) {
              priceHtml = '<strong>Free</strong>';
            } else {
              /* formatMoney is the theme's own global from assets/global.js and
               * already handles the "22.50" string this endpoint returns.
               * The previous Shopify.formatMoney call could never run: that
               * comes from shopify_common.js, which this theme never loads, so
               * every quote fell through to an unformatted $1240.00. */
              let priceStr;
              if (typeof formatMoney === 'function') {
                priceStr = formatMoney(r.price, fmt);
              } else {
                priceStr = '$' + priceNum.toFixed(2);
              }
              priceHtml = `<strong>${priceStr}</strong>`;
            }
            return `<div class="b2b-calc__rate"><span>${r.name}</span>${priceHtml}</div>`;
          }).join('');
          this.resultEl.innerHTML = `<div class="b2b-calc__rates">${rows}</div>${scope}`;
        } else {
          this.resultEl.innerHTML = '<p class="b2b-calc__no-rates">Shipping for this order must be quoted. Please <a href="/pages/contact-us">contact us</a> for a freight estimate.</p>' + scope;
        }
      } else if (data.shipping_rates) {
        this.resultEl.innerHTML = '<p class="b2b-calc__no-rates">No shipping options available for this address.</p>' + scope;
      } else {
        const msgs = Object.values(data).flat().join(' ');
        this.resultEl.innerHTML = `<p class="b2b-calc__error">${msgs || 'Could not retrieve rates.'}</p>`;
      }
    }
  });
}
