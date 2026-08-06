/* ─── Contact form v4: multi-step wizard ──────────────────────────────────
   A generalised version of the wizard that lives inline in the GVM Order
   Form section. Generalised rather than copied because this one has to serve
   any number of Contact form v4 sections on a page, each with its own step
   count, so it keys off data attributes instead of a baked-in section id.

   Progressive enhancement throughout. If this file never loads, every step
   stays visible as a stacked, numbered form and submits in one go. Nothing
   below is required for the form to work, only for it to work one step at a
   time. */
(function () {
  'use strict';

  var ROOT_SELECTOR = '[data-cfv4-wizard]';

  function initWizard(root) {
    if (root.dataset.cfv4WizardReady === '1') return;

    var form = root.querySelector('form');
    var stepsWrap = root.querySelector('[data-cfv4-steps]');
    var footer = root.querySelector('[data-cfv4-footer]');
    if (!form || !stepsWrap || !footer) return;

    var steps = Array.prototype.slice.call(stepsWrap.querySelectorAll('[data-cfv4-step]'));
    // One step is just a form with a heading; the wizard chrome would be noise.
    if (steps.length < 2) return;

    root.dataset.cfv4WizardReady = '1';

    var submitBtn = footer.querySelector('[type="submit"]');
    var submitLabel = submitBtn ? (submitBtn.textContent || 'Send').trim() : 'Send';
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Remember which controls the merchant marked required, then take the
       attribute off. A required control inside a hidden step is invalid and
       cannot be focused, so the browser silently refuses to submit and
       reports nothing the visitor can act on. Only the visible step carries
       `required` at any moment; goTo puts it back as each step opens. */
    Array.prototype.slice.call(form.querySelectorAll('[required]')).forEach(function (control) {
      control.setAttribute('data-cfv4-req', '1');
    });

    var current = 0;
    var furthest = 0;

    var progress = document.createElement('ol');
    progress.className = 'cfv4-progress';

    var items = steps.map(function (step, i) {
      var label = step.getAttribute('data-cfv4-step-label') || 'Step ' + (i + 1);

      var li = document.createElement('li');
      li.className = 'cfv4-pstep';

      var dot = document.createElement('span');
      dot.className = 'cfv4-pdot';
      dot.textContent = String(i + 1);

      var text = document.createElement('span');
      text.className = 'cfv4-plabel';
      text.textContent = label;

      li.appendChild(dot);
      li.appendChild(text);
      // Only back to somewhere already reached, so the rail cannot be used to
      // skip a step whose validation has not run yet.
      li.addEventListener('click', function () {
        if (i <= furthest) goTo(i);
      });

      progress.appendChild(li);
      return { li: li, dot: dot, label: label };
    });

    var caption = document.createElement('p');
    caption.className = 'cfv4-pcaption';

    var nav = document.createElement('div');
    nav.className = 'cfv4-wnav';

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn cfv4-back';
    back.textContent = 'Back';

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn--primary cfv4-next';
    next.textContent = 'Next';

    nav.appendChild(back);
    nav.appendChild(next);

    var note = document.createElement('p');
    note.className = 'cfv4-wnote';
    note.textContent = 'Fields marked * are required.';

    stepsWrap.parentNode.insertBefore(progress, stepsWrap);
    stepsWrap.parentNode.insertBefore(caption, stepsWrap);
    footer.parentNode.insertBefore(nav, footer);
    footer.parentNode.insertBefore(note, footer);

    root.classList.add('cfv4-wizard');

    back.addEventListener('click', function () {
      goTo(current - 1);
    });

    next.addEventListener('click', function () {
      if (!validateStep(steps[current])) return;

      if (current === steps.length - 1) {
        // requestSubmit runs native validation and fires submit handlers;
        // form.submit() would skip both. Kept as the last resort only.
        if (form.requestSubmit) form.requestSubmit(submitBtn || undefined);
        else if (submitBtn) submitBtn.click();
        else form.submit();
        return;
      }

      goTo(current + 1);
    });

    // Enter inside a text field should advance rather than submit a
    // half-filled form from step one.
    form.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      var tag = event.target.tagName;
      if (tag === 'TEXTAREA' || event.target.type === 'submit') return;
      event.preventDefault();
      next.click();
    });

    function validateStep(step) {
      var controls = Array.prototype.slice.call(step.querySelectorAll('input, select, textarea'));
      for (var i = 0; i < controls.length; i++) {
        if (controls[i].willValidate && !controls[i].checkValidity()) {
          controls[i].reportValidity();
          return false;
        }
      }
      return true;
    }

    function goTo(index, initial) {
      if (index < 0 || index >= steps.length) return;

      current = index;
      if (index > furthest) furthest = index;

      steps.forEach(function (step, i) {
        var active = i === index;
        step.classList.toggle('is-active', active);
        Array.prototype.slice.call(step.querySelectorAll('[data-cfv4-req]')).forEach(function (control) {
          if (active) control.setAttribute('required', '');
          else control.removeAttribute('required');
        });
      });

      items.forEach(function (item, i) {
        item.li.classList.toggle('is-active', i === index);
        item.li.classList.toggle('is-done', i < index);
        item.li.classList.toggle('is-clickable', i <= furthest);
        item.dot.textContent = i < index ? '✓' : String(i + 1);
      });

      back.hidden = index === 0;
      next.textContent = index === steps.length - 1 ? submitLabel : 'Next';
      caption.textContent = 'Step ' + (index + 1) + ' of ' + steps.length + ' — ' + items[index].label;

      if (!initial) {
        var first = steps[index].querySelector('input, select, textarea');
        if (first) {
          // preventScroll matters inside the popup: the default would scroll
          // the modal's own container and leave the progress rail off screen.
          try {
            first.focus({ preventScroll: true });
          } catch (e) {
            first.focus();
          }
        }
        try {
          progress.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
        } catch (e) {
          /* older browsers ignore the options object; the jump is acceptable */
        }
      }
    }

    goTo(0, true);
  }

  function initAll() {
    Array.prototype.slice.call(document.querySelectorAll(ROOT_SELECTOR)).forEach(initWizard);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // The theme editor swaps section markup without a page load, so a form
  // added or re-rendered after boot would otherwise never be wired up.
  document.addEventListener('shopify:section:load', initAll);
})();
