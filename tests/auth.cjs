const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const status = { hidden: true, textContent: '' };
const window = {
  location: { origin: 'https://example.test', pathname: '/frss/pages/login.html', search: '', hash: '' },
  history: { replaceState() {} },
  FRSS_CONFIG: { supabaseUrl: 'https://project.test', supabaseAnonKey: 'public-key' }
};
const elements = { authStatus: status };
const context = vm.createContext({ window, document: {
  getElementById: id => elements[id], addEventListener() {}
}, URLSearchParams, AbortSignal, setTimeout, clearTimeout, showToast() { throw Error('Unexpected hidden toast'); } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/auth.js'), 'utf8'), context);
let payload, calls = 0;
const button = { disabled: false, textContent: 'Continue with Google', innerHTML: '<svg></svg>Continue with Google' };
const fields = {
  fullName: { value: ' Jane Doe ' }, email: { value: ' jane@example.test ' },
  password: { value: 'password123' }, confirmPassword: { value: 'password123' }, terms: { checked: true }
};
for (const field of Object.values(fields)) {
  field.matches = () => false;
  field.classList = { add() {}, remove() {} };
}
let resets = 0;
const form = { querySelector: selector => selector.includes('submit') ? button : fields[selector.match(/name="([^"]+)"/)[1]], reset() { resets++; } };
const event = { target: form, preventDefault() {} };
(async () => {
  window.sb = { auth: { signUp: async input => { payload = input; return { data: { session: null }, error: null }; } } };
  await context.handleRegisterSubmit(event);
  assert.equal(payload.email, 'jane@example.test');
  assert.equal(payload.options.data.full_name, 'Jane Doe');
  assert.equal(payload.options.emailRedirectTo, 'https://example.test/frss/pages/dashboard.html');
  assert.match(status.textContent, /confirmation link/);
  assert.equal(status.hidden, false);
  assert.equal(resets, 1);
  console.log('PASS registration sends metadata and displays persistent confirmation instructions');

  window.sb.auth.signUp = async () => ({ data: { session: { access_token: 'test' } } });
  await context.handleRegisterSubmit(event);
  assert.equal(window.location.href, 'dashboard.html');
  console.log('PASS registration with a session opens the dashboard');

  window.sb.auth.signUp = async () => { throw Error('Failed to fetch'); };
  await context.handleRegisterSubmit(event);
  assert.match(status.textContent, /Cannot connect/);
  assert.equal(button.disabled, false);
  assert.equal(resets, 1);
  console.log('PASS network failure is visible, retains form data, and allows retry');

  window.location.href = 'login.html';
  window.sb.auth.signInWithPassword = async input => {
    payload = input;
    return { error: { code: 'invalid_credentials', message: 'Invalid login credentials' } };
  };
  await context.handleLoginSubmit(event);
  assert.equal(payload.email, 'jane@example.test');
  assert.equal(payload.password, 'password123');
  assert.match(status.textContent, /Create an account/);
  assert.match(status.textContent, /Forgot password/);
  assert.equal(window.location.href, 'login.html');
  assert.equal(button.disabled, false);
  assert.equal(fields.password.value, 'password123');
  assert.equal(resets, 1);
  assert.match(context.authErrorMessage({ code: 'email_not_confirmed' }), /confirmation link/);
  console.log('PASS invalid credentials keep the login form usable and offer registration or password recovery');

  window.sb.auth.signInWithPassword = async () => ({ data: { session: { access_token: 'test' } }, error: null });
  await context.handleLoginSubmit(event);
  assert.equal(window.location.href, 'dashboard.html');
  console.log('PASS valid email and password still open the dashboard');

  window.location.pathname = '/frss/pages/forgotpassword.html';
  window.sb.auth.resetPasswordForEmail = async (email, options) => {
    payload = { email, options };
    return { data: {}, error: null };
  };
  await context.handleForgotPasswordSubmit(event);
  assert.equal(payload.email, 'jane@example.test');
  assert.equal(payload.options.redirectTo, 'https://example.test/frss/pages/resetpassword.html');
  assert.match(status.textContent, /If an account exists/);
  assert.match(status.textContent, /spam folder/);
  assert.equal(resets, 2);
  console.log('PASS password recovery uses the correct redirect and gives a secure delivery message');

  fields.email.value = 'jane@example.test';
  window.sb.auth.resetPasswordForEmail = async () => ({
    error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }
  });
  await context.handleForgotPasswordSubmit(event);
  assert.match(status.textContent, /Wait a few minutes/);
  assert.equal(button.disabled, false);
  assert.equal(fields.email.value, 'jane@example.test');
  assert.equal(resets, 2);
  console.log('PASS recovery delivery errors are visible and preserve the entered email');

  context.fetch = async () => ({ ok: true, json: async () => ({ external: { google: false } }) });
  window.sb.auth.signInWithOAuth = async input => { calls++; payload = input; return { data: { url: 'https://project.test/auth/v1/authorize?provider=google' } }; };
  await context.handleGoogleSignIn({ currentTarget: button });
  assert.match(status.textContent, /Google sign-in is not configured/);
  assert.equal(calls, 0);
  assert.equal(button.innerHTML, '<svg></svg>Continue with Google');
  console.log('PASS disabled Google provider stays on the form with an explanation and intact icon');

  context.fetch = async () => ({ ok: true, json: async () => ({ external: { google: true } }) });
  await context.handleGoogleSignIn({ currentTarget: button });
  assert.equal(payload.options.redirectTo, 'https://example.test/frss/pages/login.html');
  assert.equal(window.location.href, 'https://project.test/auth/v1/authorize?provider=google');
  button.disabled = true;
  await context.handleGoogleSignIn({ currentTarget: button });
  assert.equal(calls, 1);
  console.log('PASS enabled Google provider navigates to OAuth and blocks duplicate requests');

  window.location.pathname = '/frss/pages/login.html';
  elements.loginForm = {};
  window.location.hash = '#error=access_denied&error_description=Access+denied';
  await context.completeAuthRedirect();
  assert.match(status.textContent, /cancelled or access was denied/);
  let cleanedUrl;
  window.history.replaceState = (_state, _title, url) => { cleanedUrl = url; };
  for (const source of ['hash', 'search']) {
    window.location.hash = '';
    window.location.search = '';
    window.location[source] = (source === 'hash' ? '#' : '?') + 'error=server_error&error_description=' + encodeURIComponent('Unable to exchange external code: 4/0A-private-code');
    await context.completeAuthRedirect();
    assert.match(status.textContent, /Google sign-in is temporarily unavailable/);
    assert.doesNotMatch(status.textContent, /4\/0A|private-code|external code/);
    assert.equal(cleanedUrl, '/frss/pages/login.html');
  }
  console.log('PASS failed provider exchange has a readable message and removes callback details from the URL');
  window.location.search = '';
  window.location.hash = '';
  window.sb.auth.getSession = async () => ({ data: { session: { access_token: 'test' } } });
  await context.completeAuthRedirect();
  assert.equal(window.location.href, 'dashboard.html');
  assert.match(status.textContent, /Opening your dashboard/);
  console.log('PASS OAuth callback shows denial or restores an existing session before dashboard navigation');

  window.location.href = 'login.html';
  window.sb.auth.getSession = async () => ({ data: { session: null }, error: null });
  let authStateCallback;
  window.sb.auth.onAuthStateChange = callback => {
    authStateCallback = callback;
    return { data: { subscription: { unsubscribe() {} } } };
  };
  await context.completeAuthRedirect();
  assert.equal(window.location.href, 'login.html');
  authStateCallback('SIGNED_IN', { access_token: 'google-session' });
  assert.equal(window.location.href, 'dashboard.html');
  assert.match(status.textContent, /Opening your dashboard/);
  console.log('PASS delayed Google session restoration redirects to the dashboard');
})().catch(error => { console.error(error); process.exitCode = 1; });
