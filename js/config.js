// Public Supabase configuration. This static site does not load .env files.
window.FRSS_CONFIG = {
  supabaseUrl: "https://royrqzirzgcufjzgfkea.supabase.co",
  supabaseAnonKey: "sb_publishable_KHFnV6IxzuOwWRkCwCurww_4koOdizA"
};

// Load the Supabase UMD script before this file.
if (window.supabase) {
  const tokenKey = `sb-${new URL(window.FRSS_CONFIG.supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const rememberKey = tokenKey + '-remember';
  const local = window.localStorage;
  const tab = window.sessionStorage;
  const remembered = () => local.getItem(rememberKey) === 'true';
  const selectedStorage = () => remembered() ? local : tab;

  // Older builds persisted logins without an explicit Remember me choice.
  if (!remembered()) local.removeItem(tokenKey);
  local.removeItem(tokenKey + '-last-activity');

  window.FRSS_AUTH = {
    setRememberMe(value) {
      const previous = selectedStorage();
      const session = previous.getItem(tokenKey);
      if (value) local.setItem(rememberKey, 'true');
      else local.removeItem(rememberKey);
      const next = selectedStorage();
      if (previous !== next) {
        previous.removeItem(tokenKey);
        if (session !== null) next.setItem(tokenKey, session);
      }
    }
  };
  const authStorage = {
    getItem: key => selectedStorage().getItem(key),
    setItem(key, value) {
      selectedStorage().setItem(key, value);
      (remembered() ? tab : local).removeItem(key);
    },
    removeItem(key) {
      local.removeItem(key);
      tab.removeItem(key);
      if (key === tokenKey) local.removeItem(rememberKey);
    }
  };
  window.sb = window.supabase.createClient(
    window.FRSS_CONFIG.supabaseUrl,
    window.FRSS_CONFIG.supabaseAnonKey,
    { auth: { storage: authStorage, storageKey: tokenKey, persistSession: true, autoRefreshToken: true } }
  );
} else {
  console.error('Supabase JS library not loaded — add the CDN <script> tag before config.js.');
}
