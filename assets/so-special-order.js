(function () {
  const modal = document.getElementById('so-modal');
  if (!modal) return;

  const titleEl = modal.querySelector('#so-modal-title');
  const closeEls = modal.querySelectorAll('[data-so-close]');

  const inOrderType = modal.querySelector('#so_order_type');
  const inProduct = modal.querySelector('#so_product');
  const inVariant = modal.querySelector('#so_variant');
  const inUrl = modal.querySelector('#so_product_url');
  const message = modal.querySelector('#so_message');

  function openModal(payload) {
    const isPre = payload.orderType === 'pre';
    const heading = isPre ? 'Pre-Order' : 'Special Order';

    titleEl.textContent = heading;

    inOrderType.value = heading;
    inProduct.value = payload.productTitle || '';
    inVariant.value = payload.variantTitle || '';
    inUrl.value = payload.productUrl || '';

    const lines = [
      `${heading} request`,
      `Product: ${payload.productTitle || ''}`,
      payload.variantTitle ? `Variant: ${payload.variantTitle}` : '',
      payload.productUrl ? `URL: ${payload.productUrl}` : '',
      '',
      'Message:'
    ].filter(Boolean);

    message.value = lines.join('\n');

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
  }

  // Close handlers
  closeEls.forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // Open handlers (delegated)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-so-trigger]');
    if (!trigger) return;

    e.preventDefault();

    // Try to pull variant title from button dataset (and fallback)
    const productForm = trigger.closest('form');
    let variantTitle = trigger.dataset.variantTitle || '';

    // If theme has selects, build a readable variant title
    if (!variantTitle && productForm) {
      const optionSelects = productForm.querySelectorAll('select[name^="options["], input[name^="options["]:checked');
      if (optionSelects.length) {
        const parts = [];
        optionSelects.forEach(el => {
          if (el.tagName === 'SELECT') parts.push(el.options[el.selectedIndex]?.text || '');
          else parts.push(el.value || '');
        });
        variantTitle = parts.filter(Boolean).join(' / ');
      }
    }

    openModal({
      orderType: trigger.dataset.orderType || 'special',
      productTitle: trigger.dataset.productTitle || '',
      productUrl: trigger.dataset.productUrl || window.location.href,
      variantTitle
    });
  });
})();
