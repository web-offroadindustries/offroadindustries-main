/**
 * Frequently Bought With
 * Lightweight, section-scoped carousel. No third-party dependencies.
 *
 * - Each arrow click moves exactly one product card.
 * - Never moves automatically (no autoplay).
 * - Prev/next disable at the start/end; controls hide when everything fits.
 * - Recalculates on resize (ResizeObserver) and on Theme Editor section reloads
 *   (the custom element re-runs connectedCallback whenever it is inserted).
 * - Scoped to each element instance, so multiple widgets never conflict.
 */
(function () {
  'use strict';

  if (!('customElements' in window) || customElements.get('frequently-bought-with')) {
    return;
  }

  var TOLERANCE = 2; // px, absorbs sub-pixel/floating-point scroll values

  function reducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  class FrequentlyBoughtWith extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-fbw-track]');
      this.prevBtn = this.querySelector('[data-fbw-prev]');
      this.nextBtn = this.querySelector('[data-fbw-next]');

      if (!this.track || this._initialised) return;
      this._initialised = true;

      this._onPrev = this.move.bind(this, -1);
      this._onNext = this.move.bind(this, 1);
      this._onScroll = this.onScroll.bind(this);
      this._onResize = this.onResize.bind(this);
      this._scrollFrame = null;
      this._resizeFrame = null;
      this._raf = null;

      if (this.prevBtn) this.prevBtn.addEventListener('click', this._onPrev);
      if (this.nextBtn) this.nextBtn.addEventListener('click', this._onNext);
      this.track.addEventListener('scroll', this._onScroll, { passive: true });

      if ('ResizeObserver' in window) {
        this._resizeObserver = new ResizeObserver(this._onResize);
        this._resizeObserver.observe(this.track);
      } else {
        window.addEventListener('resize', this._onResize);
      }

      this.classList.add('fbw--ready');
      this.refresh();

      // Second pass once fonts/layout settle, so overflow detection is accurate.
      this._raf = requestAnimationFrame(() => this.refresh());
    }

    disconnectedCallback() {
      if (!this._initialised) return;
      this._initialised = false;

      if (this.prevBtn) this.prevBtn.removeEventListener('click', this._onPrev);
      if (this.nextBtn) this.nextBtn.removeEventListener('click', this._onNext);
      if (this.track) this.track.removeEventListener('scroll', this._onScroll);

      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      } else {
        window.removeEventListener('resize', this._onResize);
      }

      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._scrollFrame) cancelAnimationFrame(this._scrollFrame);
      if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    }

    isRTL() {
      return getComputedStyle(this).direction === 'rtl';
    }

    // Width of one card plus the gap between cards.
    step() {
      const slide = this.track.querySelector('.fbw__slide');
      if (!slide) return this.track.clientWidth;
      const styles = getComputedStyle(this.track);
      let gap = parseFloat(styles.columnGap || styles.gap || '0');
      if (isNaN(gap)) gap = 0;
      return slide.getBoundingClientRect().width + gap;
    }

    // direction: 1 = next (forward), -1 = previous (back)
    move(direction) {
      const sign = this.isRTL() ? -1 : 1;
      this.track.scrollBy({
        left: this.step() * direction * sign,
        behavior: reducedMotion() ? 'auto' : 'smooth'
      });
    }

    onScroll() {
      if (this._scrollFrame) return;
      this._scrollFrame = requestAnimationFrame(() => {
        this._scrollFrame = null;
        this.updateButtons();
      });
    }

    onResize() {
      if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = requestAnimationFrame(() => {
        this._resizeFrame = null;
        this.refresh();
      });
    }

    setDisabled(btn, disabled) {
      if (!btn) return;
      btn.disabled = disabled;
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    updateButtons() {
      const maxScroll = this.track.scrollWidth - this.track.clientWidth;
      const pos = Math.abs(this.track.scrollLeft);
      this.setDisabled(this.prevBtn, pos <= TOLERANCE);
      this.setDisabled(this.nextBtn, pos >= maxScroll - TOLERANCE);
    }

    // Show controls only when the track actually overflows its viewport.
    refresh() {
      const overflows = this.track.scrollWidth - this.track.clientWidth > TOLERANCE;
      this.classList.toggle('fbw--no-controls', !overflows);
      this.updateButtons();
    }
  }

  customElements.define('frequently-bought-with', FrequentlyBoughtWith);
})();
