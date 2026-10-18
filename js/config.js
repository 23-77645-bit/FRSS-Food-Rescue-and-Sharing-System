// Supabase configuration.
// For local development, replace these values with your project credentials.
window.FRSS_CONFIG = {
  supabaseUrl: 'https://tdesgwnakzqnxfpeuidu.supabase.co',
  supabaseAnonKey: 'sb_publishable_7wZjCj4uucX6ll0nI69h1w_6PuS8SLo'
};

// Requires the Supabase JS UMD build to be loaded on the page BEFORE this
// script, e.g.:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
// <script src="js/config.js"></script>
if (window.supabase) {
  window.sb = window.supabase.createClient(
    window.FRSS_CONFIG.supabaseUrl,
    window.FRSS_CONFIG.supabaseAnonKey
  );
} else {
  console.error('Supabase JS library not loaded — add the CDN <script> tag before config.js.');
}