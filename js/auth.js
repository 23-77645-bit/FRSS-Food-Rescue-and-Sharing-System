// FRSS authentication helpers — Supabase Auth (email/password + Google OAuth
// + password recovery). Requires js/config.js (and the Supabase JS CDN
// script) to be loaded first so window.sb exists.

async function runAuthAction(button, loadingText, action) {
  const label = button?.textContent;
  if (button?.disabled) return { error: new Error('Please wait for the current request.') };
  if (button) { button.disabled = true; button.textContent = loadingText; }
  try {
    if (!window.sb?.auth) throw new Error('Authentication is unavailable. Check your connection and refresh.');
    return await action();
  } catch (error) {
    return { error };
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}

function authRedirectBase() {
  // Works whether the site is served from a root domain or a sub-path.
  return window.location.origin + window.location.pathname.replace(/\/pages\/.*$/, '');
}

function shakeField(field) {
  if (!field) return;
  const target = field.matches('input, textarea, select') && field.closest('.password-field')
    ? field.closest('.password-field')
    : field;
  target.classList.remove('shake');
  // Force a reflow so the animation also runs on repeated validation failures.
  void target.offsetWidth;
  target.classList.add('shake');
  clearTimeout(target._shakeTimer);
  target._shakeTimer = setTimeout(() => target.classList.remove('shake'), 450);
}

function shakeFormFields(form, fields) {
  fields.forEach(field => shakeField(typeof field === 'string' ? form.querySelector(field) : field));
}

function setupValidationShake() {
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('invalid', e => {
      shakeField(e.target);
    }, true);
  });
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;
  const btn = form.querySelector('button[type="submit"]');
  const { error } = await runAuthAction(btn, 'Logging in…', () => window.sb.auth.signInWithPassword({ email, password }));

  if (error) {
    shakeFormFields(form, ['[name="email"]', '[name="password"]']);
    showToast(error.message || 'Login failed. Check your email and password.');
    return;
  }
  window.location.href = 'dashboard.html';
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const fullName = form.querySelector('[name="fullName"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;
  const confirmPassword = form.querySelector('[name="confirmPassword"]')?.value || '';
  const termsAccepted = form.querySelector('[name="terms"]')?.checked;
  const btn = form.querySelector('button[type="submit"]');

  if (password !== confirmPassword) {
    shakeFormFields(form, ['[name="password"]', '[name="confirmPassword"]']);
    showToast("Passwords don't match.");
    return;
  }

  if (!termsAccepted) {
    shakeFormFields(form, ['[name="terms"]']);
    showToast('Please accept the Terms and Conditions.');
    return;
  }
  const { data, error } = await runAuthAction(btn, 'Creating account…', () => window.sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: authRedirectBase() + '/pages/dashboard.html' }
  }));

  if (error) {
    shakeFormFields(form, ['[name="email"]', '[name="password"]']);
    showToast(error.message || 'Could not create account.');
    return;
  }
  if (data?.session) { window.location.href = 'dashboard.html'; return; }
  showToast('Check your email to confirm your account.');
  form.reset();
}

async function handleGoogleSignIn() {
  const { error } = await runAuthAction(null, '', () => window.sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectBase() + '/pages/dashboard.html' }
  }));
  if (error) showToast(error.message || 'Google sign-in failed.');
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('[name="email"]').value.trim();
  const btn = form.querySelector('button[type="submit"]');
  const { error } = await runAuthAction(btn, 'Sending…', () => window.sb.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectBase() + '/pages/resetpassword.html'
  }));

  if (error) {
    shakeFormFields(form, ['[name="email"]']);
    showToast(error.message || 'Could not send reset email.');
    return;
  }
  form.reset();
  const msg = document.getElementById('forgotSuccess');
  if (msg) msg.classList.remove('hidden');
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const password = form.querySelector('[name="password"]').value;
  const confirm = form.querySelector('[name="confirmPassword"]').value;

  if (password !== confirm) {
    shakeFormFields(form, ['[name="password"]', '[name="confirmPassword"]']);
    showToast("Passwords don't match.");
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const { error } = await runAuthAction(btn, 'Updating…', () => window.sb.auth.updateUser({ password }));

  if (error) {
    shakeFormFields(form, ['[name="password"]', '[name="confirmPassword"]']);
    showToast(error.message || 'Could not update password. Request a new reset link.');
    return;
  }
  showToast('Password updated. Redirecting to login…');
  setTimeout(() => (window.location.href = 'login.html'), 1500);
}

function ensureLogoutConfirmModal() {
  let modal = document.getElementById('logoutConfirmModal');
  if (modal) return modal;
  document.body.insertAdjacentHTML('beforeend', `<div class="logout-confirm-modal" id="logoutConfirmModal" aria-hidden="true"><div class="logout-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logoutConfirmTitle"><div class="logout-confirm-icon"><i data-feather="log-out"></i></div><h2 id="logoutConfirmTitle">Are you sure you want to log out?</h2><div class="claim-actions"><button class="btn btn-outline" id="logoutConfirmCancel" type="button"><i data-feather="x"></i> Cancel</button><button class="btn btn-primary" id="logoutConfirmYes" type="button"><i data-feather="log-out"></i> Log out</button></div></div></div>`);
  modal = document.getElementById('logoutConfirmModal');
  if (window.feather) window.feather.replace({ width: 16, height: 16, 'stroke-width': 2 });
  const hide = () => { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('claim-modal-open'); };
  document.getElementById('logoutConfirmCancel')?.addEventListener('click', hide);
  modal.addEventListener('click', e => { if (e.target === modal) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show')) hide(); });
  document.getElementById('logoutConfirmYes')?.addEventListener('click', async () => {
    const btn = document.getElementById('logoutConfirmYes');
    const { error } = await runAuthAction(btn, 'Logging out…', () => window.sb.auth.signOut());
    if (error) { showToast(error.message || 'Could not log out. Please try again.'); return; }
    window.location.href = authRedirectBase() + '/index.html';
  });
  return modal;
}

function handleLogout(e) {
  e.preventDefault();
  const modal = ensureLogoutConfirmModal();
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('claim-modal-open');
}

function setupPasswordToggle(inputId, btnId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    const label = showing ? 'Hide password' : 'Show password';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.innerHTML = `<i data-feather="${showing ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`;
    if (window.feather) window.feather.replace({width:18,height:18,'stroke-width':1.8});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegisterSubmit);
  document.getElementById('forgotPasswordForm')?.addEventListener('submit', handleForgotPasswordSubmit);
  document.getElementById('resetPasswordForm')?.addEventListener('submit', handleResetPasswordSubmit);
  setupValidationShake();
  document.querySelectorAll('.google-btn').forEach(b => b.addEventListener('click', handleGoogleSignIn));
  document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', handleLogout));
  setupPasswordToggle('password', 'togglePassword');
  setupPasswordToggle('confirmPassword', 'toggleConfirmPassword');
  setupPasswordToggle('newPassword', 'toggleNewPassword');
  setupPasswordToggle('confirmNewPassword', 'toggleConfirmNewPassword');
  if (window.feather) window.feather.replace({width:18,height:18,'stroke-width':1.8});
});