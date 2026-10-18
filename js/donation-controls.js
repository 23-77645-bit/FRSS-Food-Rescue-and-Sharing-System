// Custom donation controls keep the original form names and database values.
(() => {
  const form = document.getElementById('donationForm');
  if (!form) return;
  const pad = value => String(value).padStart(2, '0');
  const dateValue = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
  const timeLabel = value => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${pad(minute)} ${hour >= 12 ? 'PM' : 'AM'}`;
  };
  const icon = name => name === 'calendar'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4m10-4v4M3 11h18"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, action) {
    const node = el('button', className, text);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  let active = null;
  function close(restoreFocus = true) {
    if (!active) return;
    const { overlay, trigger } = active;
    overlay.remove();
    trigger.setAttribute('aria-expanded', 'false');
    active = null;
    if (restoreFocus) trigger.focus({ preventScroll:true });
  }
  function open(trigger, title, subtitle, build, kind = 'dialog') {
    close(false);
    const overlay = el('div', 'frss-control-overlay');
    const panel = el('div', `frss-control-panel ${kind === 'listbox' ? 'frss-select-panel' : ''}`);
    panel.id = `${trigger.id}Panel`;
    panel.setAttribute('role', kind);
    if (kind === 'dialog') panel.setAttribute('aria-modal', 'true');
    const head = el('div', 'frss-control-heading');
    const copy = el('div', 'frss-control-copy');
    const heading = el('strong', '', title);
    heading.id = `${panel.id}Title`;
    panel.setAttribute('aria-labelledby', heading.id);
    copy.append(heading, el('small', '', subtitle));
    const dismiss = button('×', 'frss-control-dismiss', () => close());
    dismiss.setAttribute('aria-label', 'Close picker');
    head.append(copy, dismiss);
    panel.append(head);
    build(panel);
    overlay.append(panel);
    document.body.append(overlay);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', panel.id);
    active = { overlay, panel, trigger };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    if (!window.matchMedia('(max-width: 600px)').matches) {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(kind === 'listbox' ? Math.max(rect.width, 260) : 360, innerWidth - 24);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
      const height = panel.getBoundingClientRect().height;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - height - 12))}px`;
    }
    (panel.querySelector('[aria-selected="true"]:not(:disabled), .frss-day.is-selected:not(:disabled), button:not(:disabled), input') || panel).focus();
  }
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') {
      const focusable = [...active.panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('resize', () => close(false));
  form.addEventListener('reset', () => { close(false); requestAnimationFrame(() => controls.forEach(control => control.reset ? control.reset() : control.sync())); });
  function chrome(input, name, symbol) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    const trigger = button('', 'frss-control-trigger');
    trigger.id = `${input.id}Control`;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    if (input.required) trigger.setAttribute('aria-required', 'true');
    if (input.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', input.getAttribute('aria-describedby'));
    const text = el('span', 'frss-control-value');
    const visual = el('span', 'frss-control-icon');
    visual.innerHTML = symbol;
    visual.setAttribute('aria-hidden', 'true');
    trigger.append(text, visual);
    input.insertAdjacentElement('afterend', trigger);
    input._frssTrigger = trigger;
    if (label) { label.htmlFor = trigger.id; label.id ||= `${input.id}Label`; trigger.setAttribute('aria-labelledby', `${label.id} ${trigger.id}Value`); }
    text.id = `${trigger.id}Value`;
    return { trigger, text, name };
  }
  const controls = [];
  for (const select of form.querySelectorAll('select')) {
    select.classList.add('frss-original-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const name = select.id === 'unit' ? 'Choose a unit' : 'Choose a category';
    const { trigger, text } = chrome(select, name, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 10 5 5 5-5"/></svg>');
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    const sync = () => { text.textContent = select.selectedOptions[0]?.textContent || 'Choose an option'; trigger.disabled = select.disabled; };
    const launch = () => open(trigger, name, select.id === 'unit' ? 'How your food is counted' : 'Find the best match for your food', panel => {
      const list = el('div', 'frss-option-list');
      [...select.options].forEach(option => {
        const item = button('', 'frss-option', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('input', { bubbles:true }));
          select.dispatchEvent(new Event('change', { bubbles:true }));
          sync(); close();
        });
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.disabled = option.disabled;
        item.append(el('span', '', option.textContent), el('span', 'frss-option-check', option.selected ? '✓' : ''));
        list.append(item);
      });
      list.addEventListener('keydown', event => {
        const items = [...list.querySelectorAll('button:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault();
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[target]?.focus();
        }
      });
      panel.append(list);
    }, 'listbox');
    trigger.addEventListener('click', launch);
    trigger.addEventListener('keydown', event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); launch(); } });
    select.addEventListener('change', sync);
    new MutationObserver(sync).observe(select, { childList:true, subtree:true, attributes:true });
    sync(); controls.push({ sync });
  }
  for (const input of form.querySelectorAll('input[type="date"], input[type="time"], input[type="datetime-local"]')) {
    const type = input.type;
    const initialValue = input.value;
    const name = input.id === 'expirationDate' ? 'Expiration date' : input.id === 'expirationTime' ? 'Expiration time' : input.id === 'pickupAvailableFrom' ? 'Pickup starts' : 'Pickup ends';
    input.type = 'hidden';
    const { trigger, text } = chrome(input, name, icon(type === 'time' ? 'time' : 'calendar'));
    const sync = () => {
      const [date, time] = input.value.split('T');
      text.textContent = input.value ? type === 'date' ? dateLabel(date) : type === 'time' ? timeLabel(input.value) : `${dateLabel(date)} · ${timeLabel(time)}` : type === 'date' ? 'Choose a date' : type === 'time' ? 'Choose a time' : 'Choose date & time';
      trigger.classList.toggle('is-placeholder', !input.value);
    };
    const commit = value => { input.value = value; sync(); input.dispatchEvent(new Event('input', { bubbles:true })); input.dispatchEvent(new Event('change', { bubbles:true })); close(); };
    trigger.addEventListener('click', () => {
      let selectedDate = type === 'time' ? '' : input.value.split('T')[0];
      let selectedTime = type === 'date' ? '' : type === 'time' ? input.value : input.value.split('T')[1];
      const now = new Date();
      const view = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
      view.setDate(1);
      open(trigger, name, type === 'time' ? 'Set a time in your local timezone' : 'Plan a fresh, safe food handoff', panel => {
        const content = el('div', 'frss-picker-content');
        const foot = el('div', 'frss-control-footer');
        const clear = button('Clear', 'frss-picker-clear', () => commit(''));
        const done = button('Done', 'frss-picker-done');
        foot.append(clear, done);
        panel.append(content, foot);
        const buildTime = () => {
          content.replaceChildren();
          let [h24, minute] = (selectedTime || `${pad(now.getHours())}:${pad(now.getMinutes())}`).split(':').map(Number);
          let period = h24 >= 12 ? 'PM' : 'AM';
          let hour = h24 % 12 || 12;
          if (type === 'datetime-local') content.append(button(`‹ ${dateLabel(selectedDate)}`, 'frss-time-date', buildCalendar));
          const preview = el('div', 'frss-time-preview');
          const columns = el('div', 'frss-time-columns');
          const hourInput = el('input', 'frss-time-number');
          const minuteInput = el('input', 'frss-time-number');
          const refresh = () => {
            hourInput.value = pad(hour); minuteInput.value = pad(minute);
            selectedTime = `${pad(hour % 12 + (period === 'PM' ? 12 : 0))}:${pad(minute)}`;
            preview.textContent = timeLabel(selectedTime);
          };
          const read = () => {
            const h = Number(hourInput.value), m = Number(minuteInput.value);
            const valid = /^\d{1,2}$/.test(hourInput.value) && /^\d{1,2}$/.test(minuteInput.value) && h >= 1 && h <= 12 && m >= 0 && m <= 59;
            hourInput.setAttribute('aria-invalid', String(!valid)); minuteInput.setAttribute('aria-invalid', String(!valid));
            if (!valid) { preview.textContent = 'Enter an hour 1–12 and a minute 00–59'; hourInput.focus(); return false; }
            hour = h; minute = m; refresh(); return true;
          };
          [[hourInput, 'Hour', () => { hour = hour % 12 + 1; refresh(); }, () => { hour = (hour + 10) % 12 + 1; refresh(); }], [minuteInput, 'Minute', () => { minute = (minute + 1) % 60; refresh(); }, () => { minute = (minute + 59) % 60; refresh(); }]].forEach(([field, label, up, down]) => {
            field.type = 'text'; field.inputMode = 'numeric'; field.maxLength = 2; field.setAttribute('aria-label', label); field.autocomplete = 'off';
            const column = el('div', 'frss-time-column');
            const plus = button('+', 'frss-time-adjust', () => { if (read()) up(); }), minus = button('−', 'frss-time-adjust', () => { if (read()) down(); });
            plus.setAttribute('aria-label', `Increase ${label.toLowerCase()}`); minus.setAttribute('aria-label', `Decrease ${label.toLowerCase()}`);
            column.append(el('small', '', label), plus, field, minus); columns.append(column);
          });
          const segment = el('div', 'frss-time-period');
          ['AM','PM'].forEach(value => {
            const item = button(value, 'frss-period', () => { if (!read()) return; period = value; refresh(); [...segment.children].forEach(child => child.setAttribute('aria-pressed', String(child === item))); });
            item.setAttribute('aria-pressed', String(period === value)); segment.append(item);
          });
          content.append(preview, columns, segment, el('p', 'frss-picker-note', 'Your device’s local timezone'));
          refresh(); done.disabled = false; done.textContent = 'Done';
          requestAnimationFrame(() => { if (active?.panel === panel) hourInput.focus(); });
          done.onclick = () => { if (read()) commit(type === 'time' ? selectedTime : `${selectedDate}T${selectedTime}`); };
        };
        const buildCalendar = () => {
          content.replaceChildren();
          const nav = el('div', 'frss-calendar-nav');
          const move = delta => { view.setMonth(view.getMonth() + delta); buildCalendar(); };
          const previous = button('‹', 'frss-month-arrow', () => move(-1)); previous.setAttribute('aria-label', 'Previous month');
          const next = button('›', 'frss-month-arrow', () => move(1)); next.setAttribute('aria-label', 'Next month');
          nav.append(previous, el('strong', '', view.toLocaleDateString([], { month:'long', year:'numeric' })), next);
          const weekdays = el('div', 'frss-weekdays');
          ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(day => weekdays.append(el('span', '', day)));
          const grid = el('div', 'frss-calendar-grid');
          const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
          const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
          const minimum = input.min && input.min > dateValue(now) ? input.min : dateValue(now);
          for (let i = 0; i < first; i++) grid.append(el('span', 'frss-day-blank'));
          for (let day = 1; day <= count; day++) {
            const value = dateValue(new Date(view.getFullYear(), view.getMonth(), day));
            const item = button(String(day), 'frss-day', () => { selectedDate = value; if (type === 'date') commit(value); else buildTime(); });
            item.disabled = value < minimum;
            item.classList.toggle('is-selected', value === selectedDate);
            item.classList.toggle('is-today', value === dateValue(now));
            item.setAttribute('aria-label', dateLabel(value));
            if (value === dateValue(now)) item.setAttribute('aria-current', 'date');
            grid.append(item);
          }
          grid.addEventListener('keydown', event => {
            const items = [...grid.querySelectorAll('button')];
            const index = items.indexOf(document.activeElement);
            const offset = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 }[event.key];
            if (offset !== undefined) { event.preventDefault(); const target = items[Math.max(0, Math.min(items.length - 1, index + offset))]; if (!target.disabled) target.focus(); }
          });
          content.append(nav, weekdays, grid, button('Today', 'frss-calendar-today', () => { selectedDate = dateValue(now); if (type === 'date') commit(selectedDate); else buildTime(); }));
          done.disabled = !selectedDate || selectedDate < minimum;
          done.textContent = type === 'date' ? 'Done' : 'Choose time';
          done.onclick = () => { if (selectedDate) { if (type === 'date') commit(selectedDate); else buildTime(); } };
        };
        if (type === 'time') buildTime(); else buildCalendar();
      });
    });
    input.addEventListener('change', sync);
    sync(); controls.push({ sync, reset:() => { input.value = initialValue; sync(); } });
  }
})();
