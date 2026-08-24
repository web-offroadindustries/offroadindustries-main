if (!customElements.get('b2b-shipping-calc')) {
  customElements.define('b2b-shipping-calc', class B2BShippingCalc extends HTMLElement {
    connectedCallback() {
      this.variantId   = this.dataset.variantId;
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

      let itemKey = null;
      try {
        if (this.variantId) {
          const addResp = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: parseInt(this.variantId), quantity: 1 })
          });
          if (addResp.ok) {
            const addData = await addResp.json();
            if (addData.key) itemKey = addData.key;
          }
        }

        const qs = new URLSearchParams({
          'shipping_address[zip]': zip,
          'shipping_address[city]': city,
          'shipping_address[country]': country,
          'shipping_address[province]': province
        });
        const ratesResp = await fetch(`/cart/shipping_rates.json?${qs}`);
        const ratesData = await ratesResp.json();

        if (itemKey) {
          await fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: itemKey, quantity: 0 })
          }).catch(() => {});
        }

        this._showRates(ratesData);
      } catch(err) {
        this.resultEl.innerHTML = '<p class="b2b-calc__error">Unable to calculate shipping. Please try again.</p>';
        if (itemKey) {
          fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: itemKey, quantity: 0 })
          }).catch(() => {});
        }
      } finally {
        this.calcBtn.disabled = false;
        this.calcBtn.classList.remove('btn--loading');
      }
    }

    _showRates(data) {
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
              let priceStr;
              if (typeof Shopify !== 'undefined' && Shopify.formatMoney && fmt) {
                priceStr = Shopify.formatMoney(Math.round(priceNum * 100), fmt);
              } else {
                priceStr = '$' + priceNum.toFixed(2);
              }
              priceHtml = `<strong>${priceStr}</strong>`;
            }
            return `<div class="b2b-calc__rate"><span>${r.name}</span>${priceHtml}</div>`;
          }).join('');
          this.resultEl.innerHTML = `<div class="b2b-calc__rates">${rows}</div>`;
        } else {
          this.resultEl.innerHTML = '<p class="b2b-calc__no-rates">Shipping for this product must be quoted. Please <a href="/pages/contact-us">contact us</a> for a freight estimate.</p>';
        }
      } else if (data.shipping_rates) {
        this.resultEl.innerHTML = '<p class="b2b-calc__no-rates">No shipping options available for this address.</p>';
      } else {
        const msgs = Object.values(data).flat().join(' ');
        this.resultEl.innerHTML = `<p class="b2b-calc__error">${msgs || 'Could not retrieve rates.'}</p>`;
      }
    }
  });
}
