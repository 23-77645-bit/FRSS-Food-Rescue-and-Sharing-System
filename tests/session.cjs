const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
const tokenKey = 'sb-royrqzirzgcufjzgfkea-auth-token';
const rememberKey = tokenKey + '-remember';
function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}
function setup(local = storage(), tab = storage()) {
  let options;
  const window = {
    localStorage: local, sessionStorage: tab,
    supabase: { createClient: (_url, _key, config) => { options = config; return {}; } }
  };
  vm.runInNewContext(source, { window, URL, console });
  return { local, tab, auth: options.auth.storage, remember: window.FRSS_AUTH.setRememberMe };
}
const first = setup();
first.auth.setItem(tokenKey, 'token');
assert.equal(first.local.getItem(tokenKey), null);
assert.equal(setup(first.local, first.tab).auth.getItem(tokenKey), 'token');
assert.equal(setup(first.local).auth.getItem(tokenKey), null);
first.auth.setItem(tokenKey, 'refreshed');
assert.equal(first.tab.getItem(tokenKey), 'refreshed');
assert.equal(first.local.getItem(tokenKey), null);
console.log('PASS tab login survives navigation and refresh; a new tab has no stored session');

first.remember(true);
assert.equal(first.tab.getItem(tokenKey), null);
assert.equal(setup(first.local).auth.getItem(tokenKey), 'refreshed');
first.auth.setItem(tokenKey, 'remembered-refresh');
assert.equal(first.local.getItem(tokenKey), 'remembered-refresh');
console.log('PASS Remember me persists login and refreshed tokens across tab restarts');

first.remember(false);
assert.equal(first.local.getItem(tokenKey), null);
assert.equal(first.tab.getItem(tokenKey), 'remembered-refresh');
assert.equal(setup(first.local).auth.getItem(tokenKey), null);
first.remember(true);
first.auth.removeItem(tokenKey);
assert.equal(first.local.getItem(tokenKey), null);
assert.equal(first.tab.getItem(tokenKey), null);
assert.equal(first.local.getItem(rememberKey), null);
console.log('PASS unchecking Remember me removes persistent tokens; logout clears both stores');

const legacy = storage();
legacy.setItem(tokenKey, 'old-persistent-token');
assert.equal(setup(legacy).auth.getItem(tokenKey), null);
assert.equal(legacy.getItem(tokenKey), null);
console.log('PASS legacy persistent sessions require a fresh login with an explicit preference');
