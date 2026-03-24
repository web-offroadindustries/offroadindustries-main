(function () {
  function getProductInfo(node) {
    return node && (node.matches && node.matches('product-info') ? node : node.closest && node.closest('product-info'));
  }

  function applyFormAttribute(container) {
    if (!container) return;
    var formId = container.getAttribute('data-product-form-id');
    if (!formId) return;
    container.querySelectorAll('input, select, textarea, button').forEach(function (field) {
      if (!field.hasAttribute('form')) field.setAttribute('form', formId);
    });
  }

  function moveBoldOptions(root) {
    var infos = (root || document).querySelectorAll('product-info');
    if (!infos.length && root && root.matches && root.matches('product-info')) infos = [root];
    if (!infos.length && root === document) infos = document.querySelectorAll('product-info');

    infos.forEach(function (info) {
      var slot = info.querySelector('.f-product-form__vehicle-selector');
      if (!slot) return;

      var placeholder = slot.querySelector('.bold_options[data-product-form-id]');
      var productId = (placeholder && placeholder.getAttribute('data-product-id')) || info.getAttribute('data-product-id');
      var formId = (placeholder && placeholder.getAttribute('data-product-form-id')) || '';

      var candidates = Array.from(info.querySelectorAll('.bold_options')).filter(function (el) {
        if (slot.contains(el)) return false;
        var pid = el.getAttribute('data-product-id') || info.getAttribute('data-product-id');
        if (productId && pid && String(productId) !== String(pid)) return false;
        return (el.textContent || '').replace(/\s+/g, '').length > 0;
      });

      if (!candidates.length) return;

      var rendered = candidates[0];
      if (formId) rendered.setAttribute('data-product-form-id', formId);
      if (productId && !rendered.getAttribute('data-product-id')) rendered.setAttribute('data-product-id', productId);
      applyFormAttribute(rendered);

      if (placeholder) placeholder.remove();
      if (rendered.parentNode !== slot) slot.appendChild(rendered);
    });
  }

  function init() {
    moveBoldOptions(document);

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          var info = getProductInfo(node) || document;
          moveBoldOptions(info);
        });
      });
    });

    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();