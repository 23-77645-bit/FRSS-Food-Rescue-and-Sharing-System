import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { remote } from 'webdriverio';
import { mobileConfig } from './config.mjs';

const { baseUrl, options } = mobileConfig();
console.log(`Mobile smoke target: ${baseUrl.href}`);
let browser;
before(async () => {
  console.log('Starting Chrome through Appium (the first Chromedriver download may take several minutes)...');
  browser = await remote(options);
  console.log(`Chrome is ready. Opening ${baseUrl.href}`);
  await browser.url(baseUrl.href);
}, { timeout: 660000 });
after(async () => { if (browser) await browser.deleteSession(); }, { timeout: 30000 });

async function openPage(path, selector) {
  await browser.url(new URL(path, baseUrl).href);
  await browser.$(selector).waitForDisplayed({ timeout: 30000 });
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
  const link = await browser.$('a[href="register.html"]');
  await link.scrollIntoView();
  await link.click();
  await browser.$('#registerForm').waitForDisplayed({ timeout: 30000 });
  assert.equal(await browser.$('[name="fullName"]').isDisplayed(), true);
  assert.equal(await browser.$('[name="terms"]').isSelected(), false);
});

test('Forgot password link opens recovery and returns to login', { timeout: 60000 }, async () => {
  await openPage('pages/login.html', '#loginForm');
  const link = await browser.$('a[href="forgotpassword.html"]');
  await link.scrollIntoView();
  await link.click();
  await browser.$('#forgotPasswordForm').waitForDisplayed({ timeout: 30000 });
  assert.equal(await browser.execute(() => document.querySelector('#forgotPasswordForm [name="email"]').required), true);
  await browser.$('a[href="login.html"]').click();
  await browser.$('#loginForm').waitForDisplayed({ timeout: 30000 });
});
