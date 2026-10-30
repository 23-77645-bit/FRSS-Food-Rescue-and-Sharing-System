// FRSS authentication helpers — Supabase Auth (email/password + Google OAuth
// + password recovery). Requires js/config.js (and the Supabase JS CDN
// script) to be loaded first so window.sb exists.

async function runAuthAction(button, loadingText, action) {
  const label = button?.textContent;
  const markup = button?.innerHTML;
  if (button?.disabled) return { error: new Error('Please wait for the current request.') };
  if (button) { button.disabled = true; button.textContent = loadingText; }
  try {
    if (!window.sb?.auth) throw new Error('Authentication is unavailable. Check your connection and refresh.');
    return await action();
  } catch (error) {
    return { error };
  } finally {
    if (button) {
      button.disabled = false;
      if (markup !== undefined) button.innerHTML = markup;
      else button.textContent = label;
    }
  }
}

function showAuthMessage(message) {
  const status = document.getElementById('authStatus');
  if (!status) { showToast(message); return; }
  status.textContent = message;
  status.hidden = false;
}

function authErrorMessage(error, fallback) {
  if (error?.code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message || '')) {
    return 'Email or password is incorrect. If you have not registered, choose Create an account below. If you already have an account, use Forgot password to reset it.';
  }
  if (error?.code === 'email_not_confirmed') {
    return 'Please open the confirmation link in your email before logging in. Check your spam folder too.';
  }
  if (error?.code === 'over_email_send_rate_limit' || /rate limit|too many requests/i.test(error?.message || '')) {
    return 'Too many email requests were made. Wait a few minutes, then try again.';
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'The account service took too long to respond. Please try again.';
  }
  if (/failed to fetch|fetch failed|network|load failed/i.test(error?.message || '')) {
    return 'Cannot connect to the account service. Check your internet connection and try again. If this continues, contact the site administrator.';
  }
  return error?.message || fallback;
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
  if (btn?.disabled) return;
  showAuthMessage('Logging in…');
  const { error } = await runAuthAction(btn, 'Logging in…', () => window.sb.auth.signInWithPassword({ email, password }));

  if (error) {
    shakeFormFields(form, ['[name="email"]', '[name="password"]']);
    showAuthMessage(authErrorMessage(error, 'Login failed. Check your email and password.'));
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
  if (btn?.disabled) return;

  if (!fullName) {
    shakeFormFields(form, ['[name="fullName"]']);
    showAuthMessage('Please enter your full name.');
    return;
  }

  if (password !== confirmPassword) {
    shakeFormFields(form, ['[name="password"]', '[name="confirmPassword"]']);
    showAuthMessage("Passwords don't match.");
    return;
  }

  if (!termsAccepted) {
    shakeFormFields(form, ['[name="terms"]']);
    showAuthMessage('Please accept the Terms and Conditions.');
    return;
  }
  showAuthMessage('Creating your account…');
  const { data, error } = await runAuthAction(btn, 'Creating account…', () => window.sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: authRedirectBase() + '/pages/dashboard.html' }
  }));

  if (error) {
    shakeFormFields(form, ['[name="email"]', '[name="password"]']);
    showAuthMessage(authErrorMessage(error, 'Could not create account.'));
    return;
  }
  if (data?.session) { window.location.href = 'dashboard.html'; return; }
  showAuthMessage('Check your email for a confirmation link. If you already have an account, log in or reset your password.');
  form.reset();
}

async function handleGoogleSignIn(event) {
  const button = event?.currentTarget;
  if (button?.disabled) return;
  showAuthMessage('Connecting to Google…');
  const { error } = await runAuthAction(button, 'Connecting…', async () => {
    // OAuth otherwise sends disabled-provider errors to a raw API error page.
    const config = window.FRSS_CONFIG;
    const response = await fetch(config.supabaseUrl + '/auth/v1/settings', {
      headers: { apikey: config.supabaseAnonKey },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('The account service is unavailable. Please contact the site administrator.');
    const settings = await response.json();
    if (!settings.external?.google) throw new Error('Google sign-in is not configured yet. Please use email and password.');
    const result = await window.sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectBase() + '/pages/login.html', skipBrowserRedirect: true }
    });
    if (result.error) return result;
    if (!result.data?.url) throw new Error('Google sign-in could not start. Please try again.');
    window.location.href = result.data.url;
    return result;
  });
  if (error) showAuthMessage(authErrorMessage(error, 'Google sign-in failed. Please try again.'));
}

async function completeAuthRedirect() {
  if (!document.getElementById('loginForm')) return;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const error = query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error');
  if (error) {
    // Provider responses can contain authorization codes and server details.
    // Keep those out of the page; the administrator can inspect Auth logs.
    const exchangeFailed = /unable to exchange external code|invalid_client|client secret/i.test(error);
    const denied = /access_denied/i.test(query.get('error') || hash.get('error') || '');
    showAuthMessage(exchangeFailed
      ? 'Google sign-in is temporarily unavailable. Please use email and password or try again later.'
      : denied
        ? 'Google sign-in was cancelled or access was denied. Please try again.'
        : 'Sign-in could not be completed. Please try again.');
    window.history.replaceState(null, '', window.location.pathname);
    return;
  }
  if (!window.sb?.auth) return;

  let redirecting = false;
  const openDashboard = session => {
    if (!session || redirecting) return false;
    redirecting = true;
    showAuthMessage('Signed in. Opening your dashboard…');
    window.location.href = 'dashboard.html';
    return true;
  };

  // OAuth URL tokens are processed asynchronously by supabase-js. Listen for
  // the restored session as well as checking storage immediately so neither a
  // fast nor a slow callback can leave the user on the login page.
  window.sb.auth.onAuthStateChange?.((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
      openDashboard(session);
    }
  });

  if (/access_token=|refresh_token=|code=/.test(window.location.hash + window.location.search)) {
    showAuthMessage('Completing Google sign-in…');
  }
  const result = await runAuthAction(null, '', () => window.sb.auth.getSession());
  if (result.error) showAuthMessage(authErrorMessage(result.error, 'Could not finish sign-in. Please try again.'));
  else openDashboard(result.data?.session);
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('[name="email"]').value.trim();
  const btn = form.querySelector('button[type="submit"]');
  if (btn?.disabled) return;
  showAuthMessage('Requesting a reset link…');
  const { error } = await runAuthAction(btn, 'Sending…', () => window.sb.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectBase() + '/pages/resetpassword.html'
  }));

  if (error) {
    shakeFormFields(form, ['[name="email"]']);
    showAuthMessage(authErrorMessage(error, 'Could not request a reset email. Please try again.'));
    return;
  }
  form.reset();
  showAuthMessage('If an account exists for that email, a reset link has been requested. Check your inbox and spam folder. Delivery may take a few minutes.');
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
  completeAuthRedirect();
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
