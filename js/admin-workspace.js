(() => {
  const dashboard = document.getElementById('adminDashboard');
  if (!dashboard) return;
  const rail = document.getElementById('adminRail');
  const toggle = document.getElementById('adminDrawerToggle');
  const scrim = document.getElementById('adminRailScrim');
  const center = document.getElementById('adminControlCenter');
  const overview = dashboard.querySelector('.admin-flow-grid');
  const analytics = document.getElementById('adminOverviewAnalytics');
  const sections = {
    overview:['Overview','Monitor food sharing, review activity, and keep the platform running smoothly.'],
    users:['Users & verification','Manage accounts and review identity submissions.'],
    food:['Food moderation','Review listings, reservations, and food safety.'],
    claims:['Claims & pickups','Track requests, handoffs, and completed rescues.'],
    categories:['Categories','View the food categories available to donors.'],
    reports:['Reports & analytics','Review reported listings and platform activity.'],
    cases:['Cases','Investigate disputes, no-shows, and reported issues.'],
    reputation:['Reputation','Review participant ratings and feedback.'],
    content:['Announcements','Manage community messages and pickup locations.'],
    settings:['System settings','Configure moderation, claims, and pickup rules.'],
    audit:['Audit log','Review the history of administrative actions.']
  };
  let initialized = false;
  let current = 'overview';
  const mobile = () => matchMedia('(max-width: 760px)').matches;
  function closeDrawer(restoreFocus = false) {
    rail.classList.remove('is-mobile-open');
    scrim.hidden = true;
    toggle.setAttribute('aria-expanded','false');
    document.body.classList.remove('admin-drawer-open');
    if (restoreFocus) toggle.focus();
  }
  function select(view, updateHash = true) {
    if (!sections[view]) view = 'overview';
    current = view;
    dashboard.dataset.view = view;
    const [title, subtitle] = sections[view];
    document.getElementById('adminWorkspaceTitle').textContent = title;
    document.getElementById('adminWorkspaceSubtitle').textContent = subtitle;
    document.getElementById('adminCurrentSection').textContent = title;
    overview.hidden = view !== 'overview';
    analytics.hidden = !['overview','reports'].includes(view);
    for (const section of dashboard.querySelectorAll(':scope > .admin-section')) {
      section.hidden = section !== center && section.id !== view;
    }
    const panelId = `admin-${view}`;
    const activePanel = center.querySelector(`#${panelId}`);
    center.hidden = !activePanel;
    for (const panel of center.querySelectorAll('.admin-panel')) {
      panel.classList.toggle('active', panel === activePanel);
      panel.hidden = panel !== activePanel;
    }
    center.querySelector('.admin-section-heading h2').textContent = title;
    center.querySelector('.admin-section-heading .admin-muted').textContent = subtitle;
    for (const item of rail.querySelectorAll('[data-admin-view]')) {
      const selected = item.dataset.adminView === view;
      item.classList.toggle('is-active', selected);
      if (selected) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    }
    if (updateHash) history.replaceState(null, '', `#admin/${view}`);
    closeDrawer();
  }
  function init() {
    if (initialized) return;
    initialized = true;
    const reportAnalytics = document.getElementById('adminRescueAnalytics');
    if (reportAnalytics) analytics.append(reportAnalytics);
    for (const item of rail.querySelectorAll('[data-admin-view]')) {
      item.addEventListener('click', () => { select(item.dataset.adminView); window.scrollTo({ top:0, behavior:'instant' }); });
    }
    for (const item of overview.querySelectorAll('a[href^="#"]')) {
      item.addEventListener('click', event => { event.preventDefault(); select(item.getAttribute('href').slice(1)); window.scrollTo({top:0,behavior:'instant'}); });
    }
    rail.addEventListener('pointerenter', () => { if (!mobile()) rail.classList.add('is-expanded'); });
    rail.addEventListener('pointerleave', () => rail.classList.remove('is-expanded'));
    // Keyboard users see labels; a mouse click must not keep the rail expanded.
    rail.addEventListener('focusin', event => { if (!mobile() && event.target.matches(':focus-visible')) rail.classList.add('is-expanded'); });
    rail.addEventListener('focusout', event => { if (!rail.contains(event.relatedTarget) && !rail.matches(':hover')) rail.classList.remove('is-expanded'); });
    toggle.addEventListener('click', () => {
      if (rail.classList.contains('is-mobile-open')) { closeDrawer(); return; }
      rail.classList.add('is-mobile-open'); scrim.hidden = false;
      toggle.setAttribute('aria-expanded','true'); document.body.classList.add('admin-drawer-open');
      rail.querySelector('.is-active')?.focus();
    });
    scrim.addEventListener('click', () => closeDrawer(true));
    document.addEventListener('keydown', event => {
      if (!rail.classList.contains('is-mobile-open')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDrawer(true); }
      if (event.key === 'Tab') {
        const items = [...rail.querySelectorAll('button,a[href]')];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('resize', () => { closeDrawer(); rail.classList.remove('is-expanded'); });
    window.addEventListener('hashchange', () => { if (document.body.classList.contains('admin-workspace')) select(location.hash.replace('#admin/',''), false); });
    select(location.hash.startsWith('#admin/') ? location.hash.slice(7) : 'overview', false);
    if (window.feather) window.feather.replace({width:18,height:18,'stroke-width':1.8});
  }
  window.FRSSAdminWorkspace = { init, select };
})();
