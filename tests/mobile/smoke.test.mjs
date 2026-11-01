import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { remote } from 'webdriverio';
import { mobileConfig } from './config.mjs';

const { baseUrl, options } = mobileConfig();
console.log(`Mobile smoke target: ${baseUrl.href}`);
let browser;

function pagePath(url) {
  return new URL(url, baseUrl).pathname.replace(/\.html$/, '');
}
before(async () => {
  console.log('Starting Chrome through Appium (the first Chromedriver download may take several minutes)...');
  browser = await remote(options);
  console.log(`Chrome is ready. Opening ${baseUrl.href}`);
  await browser.url(baseUrl.href);
}, { timeout: 660000 });
after(async () => { if (browser) await browser.deleteSession(); }, { timeout: 30000 });

async function openPage(path, selector) {
  // A restored Supabase session can redirect the login page after its form appears.
  // Clear only auth tokens in this test browser before each independent scenario.
  await browser.url(baseUrl.href);
  await browser.execute(() => {
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) storage.removeItem(key);
      }
    }
  });
  await browser.url(new URL(path, baseUrl).href);
  await browser.$(selector).waitForDisplayed({ timeout: 30000 });
  assert.equal(pagePath(await browser.getUrl()), pagePath(path));
}

async function followLink(label, destination, form) {
  const link = await browser.$(`=${label}`);
  await link.waitForClickable({ timeout: 30000 });
  await link.click();
  await browser.$(form).waitForDisplayed({ timeout: 30000 });
  assert.equal(pagePath(await browser.getUrl()), pagePath(destination));
}

test('Login page displays email, password and Google sign-in', { timeout: 60000 }, async () => {
  await openPage('pages/login.html', '#loginForm');
  assert.equal(await browser.$('#loginForm [name="email"]').isDisplayed(), true);
  assert.equal(await browser.$('#password').getAttribute('type'), 'password');
  assert.equal(await browser.$('.google-btn').getAttribute('type'), 'button');
  assert.match(await browser.$('.google-btn').getText(), /Continue with Google/);
});

test('Password visibility can be toggled without submitting', { timeout: 60000 }, async () => {
  await openPage('pages/login.html', '#loginForm');
  await browser.$('#togglePassword').click();
  assert.equal(await browser.$('#password').getAttribute('type'), 'text');
  await browser.$('#togglePassword').click();
  assert.equal(await browser.$('#password').getAttribute('type'), 'password');
});

test('Create account link opens the registration form', { timeout: 60000 }, async () => {
  await openPage('pages/login.html', '#loginForm');
  await followLink('Create an account', 'pages/register.html', '#registerForm');
  assert.equal(await browser.$('#registerForm [name="fullName"]').isDisplayed(), true);
  assert.equal(await browser.$('#registerForm [name="terms"]').isSelected(), false);
});

test('Forgot password link opens recovery and returns to login', { timeout: 60000 }, async () => {
  await openPage('pages/login.html', '#loginForm');
  await followLink('Forgot password?', 'pages/forgotpassword.html', '#forgotPasswordForm');
  assert.equal(await browser.execute(() => document.querySelector('#forgotPasswordForm [name="email"]').required), true);
  await followLink('Back to log in', 'pages/login.html', '#loginForm');
});
