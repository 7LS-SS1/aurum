(() => {
  const root = document.querySelector('.aurum-ads-admin');
  if (!root) return;
  const filters = root.querySelector('.aa-filters');
  const slots = [...root.querySelectorAll('[data-aa-state]')];
  if (!filters || !slots.length) return;
  filters.hidden = false;
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-aa-filter]');
    if (!button) return;
    filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    slots.forEach(slot => { slot.hidden = button.dataset.aaFilter !== 'all' && slot.dataset.aaState !== button.dataset.aaFilter; });
    root.querySelector('.aa-filter-empty').hidden = slots.some(slot => !slot.hidden);
  });
})();
