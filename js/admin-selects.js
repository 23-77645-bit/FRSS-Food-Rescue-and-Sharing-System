// Styled admin menus retain the original select elements and change handlers.
(() => {
  const dashboard = document.getElementById('adminDashboard');
  if (!dashboard) return;
  const widgets = new WeakMap();
  let serial = 0, active = null;
  const names = {
    adminAuditType:'Event type', adminUserStatusFilter:'Account status', adminVerificationFilter:'Verification status',
    adminFoodStatusFilter:'Food status', adminModerationFilter:'Moderation status', adminClaimFilter:'Claim status',
    announcementAudience:'Announcement audience'
  };
  function close(focus = false) {
    if (!active) return;
    const { menu, trigger } = active;
    menu.remove(); trigger.setAttribute('aria-expanded','false'); active = null;
    if (focus && trigger.isConnected) trigger.focus();
  }
  function enhance(select) {
    if (widgets.has(select)) { widgets.get(select).sync(); return; }
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'admin-select-trigger';
    trigger.id = `adminSelectControl${++serial}`;
    trigger.setAttribute('role','combobox'); trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
    const label = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;
    const name = select.getAttribute('aria-label') || names[select.id] || 'Status';
    const text = document.createElement('span'); text.className = 'admin-select-value';
    const arrow = document.createElement('span'); arrow.className = 'admin-select-arrow'; arrow.setAttribute('aria-hidden','true');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 10 5 5 5-5"/></svg>';
    trigger.append(text,arrow);
    select.classList.add('admin-native-select'); select.tabIndex = -1; select.setAttribute('aria-hidden','true');
    select.insertAdjacentElement('afterend',trigger);
    if (label) label.htmlFor = trigger.id;
    const sync = () => {
      const value = select.selectedOptions[0]?.textContent || 'Select an option';
      if (text.textContent !== value) text.textContent = value;
      if (trigger.disabled !== select.disabled) trigger.disabled = select.disabled;
      trigger.setAttribute('aria-label', `${name}: ${value}`);
    };
    function open() {
      if (active?.trigger === trigger) { close(true); return; }
      close(); sync();
      const menu = document.createElement('div'); menu.className = 'admin-select-menu';
      menu.id = `${trigger.id}Menu`; menu.setAttribute('role','listbox'); menu.setAttribute('aria-label',name);
      for (const option of select.options) {
        const item = document.createElement('button'); item.type = 'button'; item.className = 'admin-select-option';
        item.setAttribute('role','option'); item.setAttribute('aria-selected',String(option.selected));
        item.disabled = option.disabled || !!option.parentElement?.disabled; item.title = option.textContent;
        const copy = document.createElement('span'); copy.textContent = option.textContent;
        const check = document.createElement('span'); check.className = 'admin-select-check'; check.textContent = option.selected ? '✓' : ''; check.setAttribute('aria-hidden','true');
        item.append(copy,check);
        item.addEventListener('click', () => {
          select.value = option.value; sync(); close(true);
          select.dispatchEvent(new Event('input',{bubbles:true})); select.dispatchEvent(new Event('change',{bubbles:true}));
        });
        menu.append(item);
      }
      document.body.append(menu);
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width,180),innerWidth-24);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`;
      const height = menu.getBoundingClientRect().height;
      menu.style.top = `${Math.max(12,Math.min(rect.bottom+6,innerHeight-height-12))}px`;
      trigger.setAttribute('aria-controls',menu.id); trigger.setAttribute('aria-expanded','true');
      active = {menu,trigger,select};
      (menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('button:not(:disabled)'))?.focus();
      menu.addEventListener('keydown',event => {
        const items = [...menu.querySelectorAll('button:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault();
          const target = event.key==='Home' ? 0 : event.key==='End' ? items.length-1 : (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
          items[target]?.focus();
        }
        if (event.key==='Escape') { event.preventDefault(); close(true); }
        if (event.key==='Tab') close(true);
      });
    }
    trigger.addEventListener('click',open);
    trigger.addEventListener('keydown',event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); open(); } });
    select.addEventListener('change',sync);
    widgets.set(select,{sync}); sync();
  }
  function scan() {
    if (active && (!active.select.isConnected || active.select.disabled || dashboard.classList.contains('hidden') || active.select.closest('[hidden]'))) close();
    dashboard.querySelectorAll('select').forEach(enhance);
  }
  scan();
  new MutationObserver(scan).observe(dashboard,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','hidden']});
  document.addEventListener('pointerdown',event => { if (active && !active.menu.contains(event.target) && !active.trigger.contains(event.target)) close(); });
  document.addEventListener('keydown',event => { if (active && event.key==='Escape') { event.preventDefault(); close(true); } });
  window.addEventListener('resize',() => close());
  window.addEventListener('scroll',event => { if (active && !active.menu.contains(event.target)) close(); },true);
})();
