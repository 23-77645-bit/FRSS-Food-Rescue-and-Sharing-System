/* ===================== FRSS custom date / time pickers =====================
   Lightweight, dependency-free pickers that replace native
   <input type="date">, <input type="time"> and <input type="datetime-local">
   with widgets styled to match the FRSS red/white (and dark-mode) theme.

   Attach by wrapping a hidden input in a container with one of:
     data-datepicker      -> date only.       Hidden value: YYYY-MM-DD
     data-timepicker      -> time only.       Hidden value: HH:MM (24h)
     data-datetimepicker  -> date + time.     Hidden value: YYYY-MM-DDTHH:MM

   Options via data-attributes on the container:
     data-min="today"  -> disallow past dates (default: on for date/datetime)
     data-min="none"   -> allow any date
*/
(function () {
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISODate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
  function formatDateDisplay(y, m, d) { return `${pad(d)}/${pad(m + 1)}/${y}`; }
  function formatTimeDisplay(h12, m, ampm) { return `${pad(h12)}:${pad(m)} ${ampm}`; }

  function to12Hour(h24) {
    const ampm = h24 >= 12 ? 'pm' : 'am';
    let h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return { h12, ampm };
  }
  function to24Hour(h12, ampm) {
    let h = h12 % 12;
    if (ampm === 'pm') h += 12;
    return h;
  }

  const CALENDAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  const CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>';
  const PREV_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  const NEXT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  /* ---------------------------------------------------------------- */
  /* Calendar sub-widget: month/year selects + nav + day grid          */
  /* ---------------------------------------------------------------- */
  class Calendar {
    constructor({ disallowPast, today, onPick }) {
      this.disallowPast = disallowPast;
      this.today = today;
      this.onPick = onPick;
      this.selected = null;
      this.viewYear = today.getFullYear();
      this.viewMonth = today.getMonth();
      this.buildDOM();
    }

    buildDOM() {
      this.el = document.createElement('div');

      const head = document.createElement('div');
      head.className = 'date-popover-head';

      const selects = document.createElement('div');
      selects.className = 'date-popover-selects';

      this.monthSelect = document.createElement('select');
      this.monthSelect.setAttribute('aria-label', 'Month');
      MONTH_NAMES.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = name;
        this.monthSelect.appendChild(opt);
      });

      this.yearSelect = document.createElement('select');
      this.yearSelect.setAttribute('aria-label', 'Year');
      const startYear = this.today.getFullYear() - (this.disallowPast ? 0 : 100);
      const endYear = this.today.getFullYear() + 10;
      for (let y = startYear; y <= endYear; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        this.yearSelect.appendChild(opt);
      }

      selects.appendChild(this.monthSelect);
      selects.appendChild(this.yearSelect);

      const nav = document.createElement('div');
      nav.className = 'date-popover-nav';
      this.prevBtn = document.createElement('button');
      this.prevBtn.type = 'button';
      this.prevBtn.setAttribute('aria-label', 'Previous month');
      this.prevBtn.innerHTML = PREV_ICON;
      this.nextBtn = document.createElement('button');
      this.nextBtn.type = 'button';
      this.nextBtn.setAttribute('aria-label', 'Next month');
      this.nextBtn.innerHTML = NEXT_ICON;
      nav.appendChild(this.prevBtn);
      nav.appendChild(this.nextBtn);

      head.appendChild(selects);
      head.appendChild(nav);

      this.grid = document.createElement('div');
      this.grid.className = 'date-popover-grid';

      this.el.appendChild(head);
      this.el.appendChild(this.grid);

      this.monthSelect.addEventListener('change', () => { this.viewMonth = Number(this.monthSelect.value); this.render(); });
      this.yearSelect.addEventListener('change', () => { this.viewYear = Number(this.yearSelect.value); this.render(); });
      this.prevBtn.addEventListener('click', () => {
        this.viewMonth--; if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
        this.render();
      });
      this.nextBtn.addEventListener('click', () => {
        this.viewMonth++; if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
        this.render();
      });
    }

    setView(y, m) { this.viewYear = y; this.viewMonth = m; }
    setSelected(date) {
      this.selected = date;
      if (date) { this.viewYear = date.getFullYear(); this.viewMonth = date.getMonth(); }
    }

    render() {
      this.monthSelect.value = this.viewMonth;
      this.yearSelect.value = this.viewYear;

      this.grid.innerHTML = '';
      DOW.forEach(d => {
        const el = document.createElement('div');
        el.className = 'dow';
        el.textContent = d;
        this.grid.appendChild(el);
      });

      const firstOfMonth = new Date(this.viewYear, this.viewMonth, 1);
      const startOffset = firstOfMonth.getDay();
      const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(this.viewYear, this.viewMonth, 0).getDate();

      const cells = [];
      for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, muted: true, month: this.viewMonth - 1 });
      for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, muted: false, month: this.viewMonth });
      while (cells.length % 7 !== 0 || cells.length < 42) {
        const nextIndex = cells.length - (startOffset + daysInMonth) + 1;
        cells.push({ day: nextIndex, muted: true, month: this.viewMonth + 1 });
      }

      cells.forEach(cell => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = cell.day;

        const cellDate = new Date(this.viewYear, cell.month, cell.day);
        cellDate.setHours(0, 0, 0, 0);

        if (cell.muted) btn.classList.add('muted');
        if (cellDate.getTime() === this.today.getTime()) btn.classList.add('today');
        if (this.selected) {
          const sel = new Date(this.selected.getFullYear(), this.selected.getMonth(), this.selected.getDate());
          if (cellDate.getTime() === sel.getTime()) btn.classList.add('selected');
        }
        if (this.disallowPast && cellDate.getTime() < this.today.getTime()) btn.disabled = true;

        btn.addEventListener('click', () => {
          if (cell.muted) { this.viewYear = cellDate.getFullYear(); this.viewMonth = cellDate.getMonth(); }
          this.selected = cellDate;
          this.render();
          this.onPick(cellDate);
        });

        this.grid.appendChild(btn);
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* WheelColumn: one Apple-style spinning column (iOS UIPickerView)   */
  /* ---------------------------------------------------------------- */
  const WHEEL_ITEM_H = 36;
  const WHEEL_VISIBLE = 5;
  const WHEEL_PAD = WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2);
  const WHEEL_LOOP_COPIES = 5; // odd number; the wheel starts in the middle copy

  class WheelColumn {
    constructor({ values, labels, onSettle, loop }) {
      this.baseValues = values;
      this.len = values.length;
      this.loop = !!loop;
      this.copies = this.loop ? WHEEL_LOOP_COPIES : 1;
      this.homeOffset = this.loop ? this.len * Math.floor(WHEEL_LOOP_COPIES / 2) : 0;
      this.onSettle = onSettle;
      this.index = null; // position within the (possibly repeated) item list
      this.settleTimer = null;
      this.buildDOM(labels);
      this.el.addEventListener('scroll', () => this.onScroll(), { passive: true });
    }

    buildDOM(labels) {
      this.el = document.createElement('div');
      this.el.className = 'wheel-col';
      this.track = document.createElement('div');
      this.track.className = 'wheel-track';
      this.items = [];
      for (let c = 0; c < this.copies; c++) {
        labels.forEach((label, i) => {
          const pos = c * this.len + i;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wheel-item';
          btn.textContent = label;
          btn.addEventListener('click', () => this.select(pos, true, true));
          this.track.appendChild(btn);
          this.items.push(btn);
        });
      }
      this.el.appendChild(this.track);
      if (this.loop) this.el.scrollTop = this.homeOffset * WHEEL_ITEM_H; // start in the middle copy
    }

    valueAt(pos) { return this.baseValues[((pos % this.len) + this.len) % this.len]; }

    updateClasses() {
      this.items.forEach((btn, i) => {
        const dist = this.index === null ? 99 : Math.abs(i - this.index);
        btn.classList.toggle('selected', dist === 0);
        btn.classList.toggle('near', dist === 1);
      });
    }

    select(pos, animate, settle) {
      this.index = this.loop ? pos : Math.max(0, Math.min(this.items.length - 1, pos));
      this.el.scrollTo({ top: this.index * WHEEL_ITEM_H, behavior: animate ? 'smooth' : 'auto' });
      this.updateClasses();
      if (settle) this.onSettle(this.valueAt(this.index));
    }

    /* Select by underlying value (e.g. hour 7, minute 45) rather than raw
       list position; for looping wheels this lands in the middle copy so
       there is always buffer to keep scrolling in either direction. */
    setValue(value, animate, settle) {
      const baseIdx = this.baseValues.indexOf(value);
      if (baseIdx === -1) return;
      this.select(this.loop ? this.homeOffset + baseIdx : baseIdx, animate, settle);
    }

    onScroll() {
      const i = Math.round(this.el.scrollTop / WHEEL_ITEM_H);
      const clamped = this.loop ? i : Math.max(0, Math.min(this.items.length - 1, i));
      if (clamped !== this.index) { this.index = clamped; this.updateClasses(); }
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        // CSS scroll-snap already aligns the column to the nearest item on
        // its own; calling scrollTo() again here would fight that native
        // snap, so JS only steps in when it needs to silently relocate a
        // looping wheel back toward its middle copy - an instant, unanimated
        // jump between two identical-looking labels, so nothing visibly moves.
        // The safe zone spans a full extra copy of buffer on each side of the
        // middle copy, so landing on an edge value like 11, 12, 00 or 59
        // never sits right on the trigger threshold (which is what caused
        // both the stutter and the wheel refusing to settle on those values).
        if (this.loop) {
          const low = this.len, high = this.len * (WHEEL_LOOP_COPIES - 1) - 1;
          if (this.index < low || this.index > high) {
            this.index = this.homeOffset + (((this.index % this.len) + this.len) % this.len);
            this.el.scrollTop = this.index * WHEEL_ITEM_H;
          }
        }
        this.updateClasses();
        this.onSettle(this.valueAt(this.index));
      }, 120);
    }

    reset() {
      this.index = null;
      this.el.scrollTop = this.loop ? this.homeOffset * WHEEL_ITEM_H : 0;
      this.updateClasses();
    }
  }

  /* ---------------------------------------------------------------- */
  /* TimeColumns sub-widget: Apple-style hour / minute / am-pm wheels  */
  /* ---------------------------------------------------------------- */
  class TimeColumns {
    constructor({ onChange }) {
      this.hour = null;   // 1-12
      this.minute = null; // 0-59
      this.ampm = null;   // 'am' | 'pm'
      this.onChange = onChange;
      this.buildDOM();
    }

    buildDOM() {
      this.el = document.createElement('div');
      this.el.className = 'time-wheel';

      const highlight = document.createElement('div');
      highlight.className = 'wheel-highlight';
      this.el.appendChild(highlight);

      this.hourWheel = new WheelColumn({
        values: Array.from({ length: 12 }, (_, i) => i + 1),
        labels: Array.from({ length: 12 }, (_, i) => pad(i + 1)),
        loop: true,
        onSettle: (v) => { this.hour = v; this.onChange(); }
      });
      this.minuteWheel = new WheelColumn({
        values: Array.from({ length: 60 }, (_, i) => i),
        labels: Array.from({ length: 60 }, (_, i) => pad(i)),
        loop: true,
        onSettle: (v) => { this.minute = v; this.onChange(); }
      });
      this.ampmWheel = new WheelColumn({
        values: ['am', 'pm'],
        labels: ['AM', 'PM'],
        onSettle: (v) => { this.ampm = v; this.onChange(); }
      });

      this.el.appendChild(this.hourWheel.el);
      this.el.appendChild(this.minuteWheel.el);
      this.el.appendChild(this.ampmWheel.el);
    }

    /* Sets values without marking the wheel as having a live user selection. */
    setFrom24(hhmm, animate) {
      if (!hhmm) { this.clear(); return; }
      const [hStr, mStr] = hhmm.split(':');
      const h24 = Number(hStr), m = Number(mStr);
      if (Number.isNaN(h24) || Number.isNaN(m)) { this.clear(); return; }
      const { h12, ampm } = to12Hour(h24);
      this.hour = h12; this.minute = m; this.ampm = ampm;
      this.hourWheel.setValue(h12, !!animate, false);
      this.minuteWheel.setValue(m, !!animate, false);
      this.ampmWheel.setValue(ampm, !!animate, false);
    }

    /* Fills any wheel that has no value yet with the given fallback (defaults to now). */
    ensureDefault(hhmm) {
      const fallback = hhmm || `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
      const { h12, ampm } = (() => {
        const [hStr] = fallback.split(':');
        return to12Hour(Number(hStr));
      })();
      const m = Number(fallback.split(':')[1]);
      if (this.hour === null) this.hourWheel.setValue(h12, false, false);
      if (this.minute === null) this.minuteWheel.setValue(m, false, false);
      if (this.ampm === null) this.ampmWheel.setValue(ampm, false, false);
      if (this.hour === null) this.hour = h12;
      if (this.minute === null) this.minute = m;
      if (this.ampm === null) this.ampm = ampm;
    }

    get24() {
      if (this.hour === null || this.minute === null || !this.ampm) return null;
      return `${pad(to24Hour(this.hour, this.ampm))}:${pad(this.minute)}`;
    }

    clear() {
      this.hour = null; this.minute = null; this.ampm = null;
      this.hourWheel.reset(); this.minuteWheel.reset(); this.ampmWheel.reset();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Shared open/close behaviour for all field types                   */
  /* ---------------------------------------------------------------- */
  function bindFieldChrome(container, textInput, toggleBtn, onOpen) {
    const open = () => {
      document.querySelectorAll('.dt-widget.open').forEach(el => { if (el !== container) el.classList.remove('open'); });
      container.classList.add('open');
      if (onOpen) onOpen();
    };
    const close = () => container.classList.remove('open');
    const toggle = () => (container.classList.contains('open') ? close() : open());

    textInput.addEventListener('click', toggle);
    toggleBtn.addEventListener('click', toggle);
    // Use composedPath (captured at dispatch time) instead of contains(e.target):
    // the calendar grid rebuilds its buttons on click, which detaches the
    // clicked button before this listener runs, making contains() wrongly
    // report "outside" and close the popover right after a day is picked.
    document.addEventListener('click', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.includes(container)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && container.classList.contains('open')) { close(); textInput.blur(); }
    });
    return { open, close, toggle };
  }

  function bindFormReset(container, resetFn) {
    document.addEventListener('reset', (e) => {
      if (e.target && e.target.contains && e.target.contains(container)) resetFn();
    });
  }

  /* ---------------------------------------------------------------- */
  /* DatePicker: date only                                             */
  /* ---------------------------------------------------------------- */
  class DatePicker {
    constructor(container) {
      this.container = container;
      this.hiddenInput = container.querySelector('input[type="hidden"]');
      if (!this.hiddenInput) return;

      this.disallowPast = container.dataset.min !== 'none';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      this.today = today;

      container.classList.add('date-field', 'dt-widget');

      this.textInput = document.createElement('input');
      this.textInput.type = 'text';
      this.textInput.className = 'date-input';
      this.textInput.placeholder = 'dd/mm/yyyy';
      this.textInput.readOnly = true;
      this.textInput.autocomplete = 'off';

      this.toggleBtn = document.createElement('button');
      this.toggleBtn.type = 'button';
      this.toggleBtn.className = 'date-toggle';
      this.toggleBtn.setAttribute('aria-label', 'Choose date');
      this.toggleBtn.innerHTML = CALENDAR_ICON;

      this.popover = document.createElement('div');
      this.popover.className = 'date-popover';

      this.calendar = new Calendar({ disallowPast: this.disallowPast, today: this.today, onPick: (date) => { this.selected = date; this.commit(); this.chrome.close(); } });
      this.popover.appendChild(this.calendar.el);

      const foot = document.createElement('div');
      foot.className = 'date-popover-foot';
      this.clearBtn = document.createElement('button'); this.clearBtn.type = 'button'; this.clearBtn.className = 'clear'; this.clearBtn.textContent = 'Clear';
      this.todayBtn = document.createElement('button'); this.todayBtn.type = 'button'; this.todayBtn.textContent = 'Today';
      foot.appendChild(this.clearBtn); foot.appendChild(this.todayBtn);
      this.popover.appendChild(foot);

      container.insertBefore(this.textInput, this.hiddenInput);
      container.insertBefore(this.toggleBtn, this.hiddenInput);
      container.appendChild(this.popover);

      const initial = this.hiddenInput.value ? new Date(this.hiddenInput.value + 'T00:00:00') : null;
      this.selected = initial && !isNaN(initial) ? initial : null;
      this.calendar.setSelected(this.selected);
      this.calendar.render();
      if (this.selected) this.textInput.value = formatDateDisplay(this.selected.getFullYear(), this.selected.getMonth(), this.selected.getDate());

      this.chrome = bindFieldChrome(container, this.textInput, this.toggleBtn);
      this.clearBtn.addEventListener('click', () => { this.selected = null; this.calendar.setSelected(null); this.calendar.render(); this.commit(); this.chrome.close(); });
      this.todayBtn.addEventListener('click', () => { this.selected = new Date(this.today); this.calendar.setSelected(this.selected); this.calendar.render(); this.commit(); this.chrome.close(); });
      bindFormReset(container, () => { this.selected = null; this.calendar.setSelected(null); this.calendar.render(); this.commit(); });
    }

    commit() {
      if (!this.selected) { this.hiddenInput.value = ''; this.textInput.value = ''; }
      else {
        const y = this.selected.getFullYear(), m = this.selected.getMonth(), d = this.selected.getDate();
        this.hiddenInput.value = toISODate(y, m, d);
        this.textInput.value = formatDateDisplay(y, m, d);
      }
      this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      this.hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------------- */
  /* TimePicker: time only                                             */
  /* ---------------------------------------------------------------- */
  class TimePicker {
    constructor(container) {
      this.container = container;
      this.hiddenInput = container.querySelector('input[type="hidden"]');
      if (!this.hiddenInput) return;

      container.classList.add('time-field', 'dt-widget');

      this.textInput = document.createElement('input');
      this.textInput.type = 'text';
      this.textInput.className = 'time-input';
      this.textInput.placeholder = '--:-- --';
      this.textInput.readOnly = true;
      this.textInput.autocomplete = 'off';

      this.toggleBtn = document.createElement('button');
      this.toggleBtn.type = 'button';
      this.toggleBtn.className = 'time-toggle';
      this.toggleBtn.setAttribute('aria-label', 'Choose time');
      this.toggleBtn.innerHTML = CLOCK_ICON;

      this.popover = document.createElement('div');
      this.popover.className = 'time-popover';

      this.columns = new TimeColumns({ onChange: () => this.commit() });
      this.popover.appendChild(this.columns.el);

      const foot = document.createElement('div');
      foot.className = 'time-popover-foot';
      this.closeBtn = document.createElement('button'); this.closeBtn.type = 'button'; this.closeBtn.className = 'close'; this.closeBtn.textContent = 'Close';
      this.nowBtn = document.createElement('button'); this.nowBtn.type = 'button'; this.nowBtn.textContent = 'Now';
      foot.appendChild(this.closeBtn); foot.appendChild(this.nowBtn);
      this.popover.appendChild(foot);

      container.insertBefore(this.textInput, this.hiddenInput);
      container.insertBefore(this.toggleBtn, this.hiddenInput);
      container.appendChild(this.popover);

      if (this.hiddenInput.value) { this.columns.setFrom24(this.hiddenInput.value); this.syncDisplay(); }

      this.chrome = bindFieldChrome(container, this.textInput, this.toggleBtn);
      this.closeBtn.addEventListener('click', () => this.chrome.close());
      this.nowBtn.addEventListener('click', () => {
        const now = new Date();
        this.columns.setFrom24(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
        this.commit();
        this.chrome.close();
      });
      bindFormReset(container, () => { this.columns.clear(); this.commit(); });
    }

    syncDisplay() {
      const v = this.columns.get24();
      if (!v) { this.textInput.value = ''; return; }
      this.textInput.value = formatTimeDisplay(this.columns.hour, this.columns.minute, this.columns.ampm);
    }

    commit() {
      const v = this.columns.get24();
      this.hiddenInput.value = v || '';
      this.syncDisplay();
      this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      this.hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------------- */
  /* DateTimePicker: calendar + time columns combined                  */
  /* ---------------------------------------------------------------- */
  class DateTimePicker {
    constructor(container) {
      this.container = container;
      this.hiddenInput = container.querySelector('input[type="hidden"]');
      if (!this.hiddenInput) return;

      this.disallowPast = container.dataset.min !== 'none';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      this.today = today;

      container.classList.add('datetime-field', 'dt-widget');

      this.textInput = document.createElement('input');
      this.textInput.type = 'text';
      this.textInput.className = 'datetime-input';
      this.textInput.placeholder = 'dd/mm/yyyy --:-- --';
      this.textInput.readOnly = true;
      this.textInput.autocomplete = 'off';

      this.toggleBtn = document.createElement('button');
      this.toggleBtn.type = 'button';
      this.toggleBtn.className = 'datetime-toggle';
      this.toggleBtn.setAttribute('aria-label', 'Choose date and time');
      this.toggleBtn.innerHTML = CALENDAR_ICON;

      this.popover = document.createElement('div');
      this.popover.className = 'datetime-popover';

      const body = document.createElement('div');
      body.className = 'datetime-popover-body';

      const calWrap = document.createElement('div');
      calWrap.className = 'datetime-cal';
      this.calendar = new Calendar({ disallowPast: this.disallowPast, today: this.today, onPick: (date) => { this.selectedDate = date; this.syncDisplay(); this.updateActionState(); } });
      calWrap.appendChild(this.calendar.el);
      this.calWrap = calWrap;

      const timeWrap = document.createElement('div');
      timeWrap.className = 'datetime-time';

      const timeHead = document.createElement('div');
      timeHead.className = 'datetime-time-head';
      this.backBtn = document.createElement('button');
      this.backBtn.type = 'button';
      this.backBtn.className = 'back';
      this.backBtn.setAttribute('aria-label', 'Back to date');
      this.backBtn.innerHTML = PREV_ICON;
      this.timeHeadLabel = document.createElement('span');
      this.timeHeadLabel.className = 'label';
      timeHead.appendChild(this.backBtn);
      timeHead.appendChild(this.timeHeadLabel);

      this.columns = new TimeColumns({ onChange: () => { this.syncDisplay(); this.updateActionState(); } });
      timeWrap.appendChild(timeHead);
      timeWrap.appendChild(this.columns.el);
      this.timeWrap = timeWrap;

      body.appendChild(calWrap);
      body.appendChild(timeWrap);
      this.popover.appendChild(body);

      const foot = document.createElement('div');
      foot.className = 'datetime-popover-foot';
      this.closeBtn = document.createElement('button'); this.closeBtn.type = 'button'; this.closeBtn.className = 'close'; this.closeBtn.textContent = 'Close';
      this.actionBtn = document.createElement('button'); this.actionBtn.type = 'button'; this.actionBtn.className = 'action';
      foot.appendChild(this.closeBtn); foot.appendChild(this.actionBtn);
      this.popover.appendChild(foot);

      container.insertBefore(this.textInput, this.hiddenInput);
      container.insertBefore(this.toggleBtn, this.hiddenInput);
      container.appendChild(this.popover);

      this.selectedDate = null;
      this.step = 'date';
      if (this.hiddenInput.value) {
        const [dPart, tPart] = this.hiddenInput.value.split('T');
        const d = new Date(dPart + 'T00:00:00');
        if (!isNaN(d)) { this.selectedDate = d; this.calendar.setSelected(d); }
        if (tPart) this.columns.setFrom24(tPart);
      }
      this.calendar.render();
      this.syncDisplay();
      this.setStep('date');

      this.chrome = bindFieldChrome(container, this.textInput, this.toggleBtn, () => this.setStep('date'));
      this.closeBtn.addEventListener('click', () => this.chrome.close());
      this.backBtn.addEventListener('click', () => this.setStep('date'));
      this.actionBtn.addEventListener('click', () => {
        if (this.step === 'date') {
          if (!this.selectedDate) return;
          this.columns.ensureDefault(this.hiddenInput.value ? this.hiddenInput.value.split('T')[1] : null);
          this.syncDisplay();
          this.setStep('time');
        } else {
          this.commit();
          this.chrome.close();
        }
      });
      bindFormReset(container, () => {
        this.selectedDate = null; this.calendar.setSelected(null); this.calendar.render();
        this.columns.clear();
        this.commit();
        this.setStep('date');
      });
    }

    setStep(step) {
      this.step = step;
      this.popover.classList.toggle('step-date', step === 'date');
      this.popover.classList.toggle('step-time', step === 'time');
      if (step === 'time' && this.selectedDate) {
        this.timeHeadLabel.textContent = formatDateDisplay(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate());
      }
      this.actionBtn.textContent = step === 'date' ? 'Next' : 'Set';
      this.updateActionState();
    }

    updateActionState() {
      const enabled = this.step === 'date' ? !!this.selectedDate : this.columns.get24() !== null;
      this.actionBtn.disabled = !enabled;
      this.actionBtn.classList.toggle('disabled', !enabled);
    }

    syncDisplay() {
      const datePart = this.selectedDate ? formatDateDisplay(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), this.selectedDate.getDate()) : '';
      const timePart = this.columns.get24() ? formatTimeDisplay(this.columns.hour, this.columns.minute, this.columns.ampm) : '';
      this.textInput.value = [datePart, timePart].filter(Boolean).join(' ');
    }

    commit() {
      const timeVal = this.columns.get24();
      if (this.selectedDate && timeVal) {
        const y = this.selectedDate.getFullYear(), m = this.selectedDate.getMonth(), d = this.selectedDate.getDate();
        this.hiddenInput.value = `${toISODate(y, m, d)}T${timeVal}`;
      } else {
        this.hiddenInput.value = '';
      }
      this.syncDisplay();
      this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      this.hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Init                                                               */
  /* ---------------------------------------------------------------- */
  function initAll(root) {
    root = root || document;
    root.querySelectorAll('[data-datepicker]').forEach(el => { if (!el.dataset.dpInit) { el.dataset.dpInit = '1'; new DatePicker(el); } });
    root.querySelectorAll('[data-timepicker]').forEach(el => { if (!el.dataset.dpInit) { el.dataset.dpInit = '1'; new TimePicker(el); } });
    root.querySelectorAll('[data-datetimepicker]').forEach(el => { if (!el.dataset.dpInit) { el.dataset.dpInit = '1'; new DateTimePicker(el); } });
  }

  document.addEventListener('DOMContentLoaded', () => initAll());
  window.FRSSDatePicker = { init: initAll };
})();