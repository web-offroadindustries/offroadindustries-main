(function(){
  function enhance(container){
    if(!container || container.dataset.boldLinked === 'true') return;
    var formId = container.getAttribute('data-product-form-id');
    if(!formId) return;

    function applyFormAttr(){
      container.querySelectorAll('input, select, textarea, button').forEach(function(el){
        if(!el.hasAttribute('form')) el.setAttribute('form', formId);
      });
    }

    applyFormAttr();
    var innerObserver = new MutationObserver(applyFormAttr);
    innerObserver.observe(container, {childList:true, subtree:true});
    container.dataset.boldLinked = 'true';
  }

  function scan(scope){
    (scope || document).querySelectorAll('.bold_options[data-product-form-id]').forEach(enhance);
  }

  function init(){
    scan(document);
    var bodyObserver = new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        mutation.addedNodes.forEach(function(node){
          if(node.nodeType !== 1) return;
          if(node.matches && node.matches('.bold_options[data-product-form-id]')) {
            enhance(node);
          } else if(node.querySelectorAll) {
            scan(node);
          }
        });
      });
    });
    if(document.body) bodyObserver.observe(document.body, {childList:true, subtree:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
