// Step navigation is local; only the final submit reaches the existing publishing handler.
(() => {
  const form = document.getElementById('donationForm');
  if (!form) return;
  const panels = [...form.querySelectorAll('.donate-card')];
  const markers = [...form.querySelectorAll('.donation-steps li')];
  const next = document.getElementById('donationNext');
  const back = document.getElementById('donationBack');
  const publish = document.getElementById('publishFoodBtn');
  const error = document.getElementById('donationStepError');
  const f = form.elements;
  let current = 0;
  form.noValidate = true; // Validate the active step, including hidden earlier steps on final submit.
  document.getElementById('donationProgress').hidden = false;
  const showStep = (index, focus = true) => {
    current = index;
    panels.forEach((panel, i) => { panel.hidden = i !== current; });
    markers.forEach((marker, i) => {
      marker.classList.toggle('is-complete', i < current);
      if (i === current) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
    });
    back.hidden = current === 0;
    next.hidden = current === panels.length - 1;
    publish.hidden = current !== panels.length - 1;
    document.getElementById('donationStepStatus').textContent = `Step ${current + 1} of ${panels.length}`;
    error.hidden = true;
    if (focus) {
      const heading = panels[current].querySelector('h2');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      panels[current].scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };
  const fail = (index, control, message) => {
    showStep(index);
    error.textContent = message;
    error.hidden = false;
    const target = control._frssTrigger || control;
    target.focus();
    if (!control._frssTrigger && control.reportValidity) control.reportValidity();
    return false;
  };
  const validate = index => {
    for (const control of panels[index].querySelectorAll('input, select, textarea')) {
      if (!control.checkValidity()) return fail(index, control, control.validationMessage);
      if (control.required && typeof control.value === 'string' && !control.value.trim()) {
        return fail(index, control, 'Please complete all required fields in this step.');
      }
    }
    if (index === 1) {
      const expiry = new Date(`${f.expirationDate.value}T${f.expirationTime.value}`);
      if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
        return fail(index, f.expirationDate, 'Choose an expiration date and time in the future.');
      }
    }
    if (index === 2) {
      const lat = f.latitude.value.trim(), lng = f.longitude.value.trim();
      if (!lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
        return fail(index, document.getElementById('locateMe'), 'Use my location at the pickup spot before continuing.');
      }
      const start = f.pickupAvailableFrom.value ? new Date(f.pickupAvailableFrom.value) : null;
      const end = f.pickupAvailableUntil.value ? new Date(f.pickupAvailableUntil.value) : null;
      const expiry = new Date(`${f.expirationDate.value}T${f.expirationTime.value}`);
      if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime())) || (start && end && start >= end)) {
        return fail(index, f.pickupAvailableFrom, 'The pickup end must be later than the pickup start.');
      }
      if ((start && start >= expiry) || (end && end > expiry)) {
        return fail(index, start && start >= expiry ? f.pickupAvailableFrom : f.pickupAvailableUntil, 'The pickup window must be before the food expires.');
      }
    }
    return true;
  };
  const advance = () => { if (validate(current)) showStep(current + 1); };
  next.addEventListener('click', advance);
  back.addEventListener('click', () => showStep(Math.max(0, current - 1)));
  // Capture runs before the existing Supabase submit listener, even though it is registered earlier.
  form.addEventListener('submit', event => {
    if (publish.disabled) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (current < panels.length - 1) {
      event.preventDefault(); event.stopImmediatePropagation(); advance(); return;
    }
    for (let index = 0; index < panels.length; index++) {
      if (!validate(index)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
  }, true);
  form.addEventListener('input', () => { error.hidden = true; });
  form.addEventListener('reset', () => requestAnimationFrame(() => showStep(0, false)));
  const setDateMinimum = () => {
    const now = new Date();
    const pad = number => String(number).padStart(2, '0');
    f.expirationDate.min = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  };
  setDateMinimum();
  f.expirationDate.addEventListener('focus', setDateMinimum);
  showStep(0, false);
})();
