// Accessible horizontal tabs. Arrow keys move and activate; Tab exits the tab list.
export function setupTabs(tabs, getPanel, onActivate = () => {}) {
  if (!Array.isArray(tabs) || tabs.length === 0) return;
  function activate(tab, focus = false) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      item.classList.toggle('active', selected);
      const panel = getPanel(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    }
    if (focus) tab.focus();
    onActivate(tab);
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const current = tabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[next], true);
    });
  }
  const initial = tabs.find(tab => tab.getAttribute('aria-selected') === 'true') ?? tabs[0];
  activate(initial);
}
