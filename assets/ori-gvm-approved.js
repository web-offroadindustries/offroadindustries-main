/* ORI GVM Approved.
 *
 * Lifts a section out of another page so the installer list has one home.
 * Liquid cannot read another page's section blocks, hence the client-side
 * fetch. Falls back to a plain link if the fetch or the script never lands.
 */
(function () {
  'use strict';

  function samePage(url) {
    try {
      var a = new URL(url, window.location.origin);
      return a.pathname.replace(/\/$/, '') === window.location.pathname.replace(/\/$/, '');
    } catch (e) {
      return false;
    }
  }

  /* innerHTML never executes <script>, and the source section carries an
     inline one that wires up its state filter. Re-creating each tag is what
     makes the injected copy behave like the original. */
  function runScripts(container) {
    var scripts = Array.prototype.slice.call(container.querySelectorAll('script'));
    scripts.forEach(function (old) {
      var fresh = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) {
        var at = old.attributes[i];
        fresh.setAttribute(at.name, at.value);
      }
      fresh.textContent = old.textContent;
      old.parentNode.replaceChild(fresh, old);
    });
  }

  class OriGvmApproved extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready === '1') return;

      this.url = this.getAttribute('data-source-url');
      this.selector = this.getAttribute('data-source-selector');
      this.target = this.querySelector('[data-approved-target]');
      if (!this.url || !this.selector || !this.target) return;

      // Pointing the section at the page it already lives on would fetch the
      // page into itself. Show the fallback instead of recursing.
      if (samePage(this.url)) {
        this.fail('same-page');
        return;
      }

      this.dataset.ready = '1';

      // Usually well below the fold, so the request waits until it is near.
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(
          function (entries) {
            if (!entries.some(function (e) { return e.isIntersecting; })) return;
            io.disconnect();
            this.load();
          }.bind(this),
          { rootMargin: '400px 0px' }
        );
        io.observe(this);
      } else {
        this.load();
      }
    }

    load() {
      this.setAttribute('data-state', 'loading');

      fetch(this.url, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(
          function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var found = doc.querySelector(this.selector);
            if (!found) throw new Error('selector not found on source page');

            /* Data only: take the installer cards but not the source page's
               own heading or backdrop, so the section around them supplies the
               heading, description and background instead. The source section
               carries those as inline styles, which is why they are cleared
               here rather than in the stylesheet. */
            if (this.dataset.dataOnly === '1') {
              var head = found.querySelector(
                '.dealer-locator__header, .ori-installer-network__header'
              );
              if (head) head.parentNode.removeChild(head);

              found.style.background = 'transparent';
              found.style.setProperty('--dl-pt', '0px');
              found.style.setProperty('--dl-pb', '0px');
            }

            this.target.innerHTML = '';
            this.target.appendChild(document.importNode(found, true));
            runScripts(this.target);
            this.setAttribute('data-state', 'loaded');
          }.bind(this)
        )
        .catch(
          function () {
            this.fail('error');
          }.bind(this)
        );
    }

    fail(reason) {
      this.setAttribute('data-state', 'failed');
      this.setAttribute('data-fail-reason', reason || 'error');
    }
  }

  if (!customElements.get('ori-gvm-approved')) {
    customElements.define('ori-gvm-approved', OriGvmApproved);
  }
})();
