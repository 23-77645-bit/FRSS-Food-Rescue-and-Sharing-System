# Food Rescue & Sharing System (FRSS)

A responsive food donation and sharing website built with HTML, CSS, vanilla JavaScript, and Supabase.

Features include food listings and nearby search, step-by-step donations with photos, donor-approved claims, pickup codes, identity verification, user activity and notifications, and an admin control center. The homepage includes a ten-photo carousel; the interface supports dark mode.

## Run locally

From this project folder:

```bash
python -m http.server 5500
```

Open `http://localhost:5500/`. Use HTTPS when deployed for camera, geolocation, and other browser features.

## Supabase setup

The included `js/config.js` contains the original project's Supabase URL and publishable key. Preserve your deployment configuration when replacing website files. Use only a public/publishable key in browser code.

- New FRSS database: run `supabase-all-in-one.sql` in Supabase SQL Editor.
- Existing database that already ran the original all-in-one schema: run `supabase-bug-fixes.sql` once to apply this update. Do not replay the older all-in-one migrations for this update.
- The bug-fix patch includes missing identity-verification setup. Older databases without the other core FRSS migrations still need those migrations first.

The schema creates profiles, categories, food posts, claims, reports, notifications, audit records, admin controls, settings, reputation ratings, identity verification, and image storage policies. Posting and claiming require an active, verified account. Identity documents use a private storage bucket and signed review URLs.

Create your first account, then assign its admin role in Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR-AUTH-USER-UUID';
```

Configure Supabase Auth's site URL and redirect allowlist for your deployment's dashboard and password-reset pages. Google sign-in also requires the Google provider setup.

For registration and Google sign-in:

- Copy the URL and publishable key from your active Supabase project's Connect dialog into `js/config.js`. `.env.example` is documentation; this static site does not load environment files.
- Enable email sign-up in Authentication. When email confirmation is enabled, users must open their confirmation email before logging in.
- Enable Google under Authentication > Sign In / Providers and save your Google OAuth client ID and secret there. Keep the secret out of website files. In Google Cloud, add `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` as an authorized redirect URI.
- Under Authentication > URL Configuration, allow `/pages/login.html` (Google return), `/pages/dashboard.html` (email confirmation), and `/pages/resetpassword.html` on each site origin. For Live Server, include both `http://127.0.0.1:5500` and `http://localhost:5500` if you use both. Preserve any deployment subdirectory in these URLs.

The login and registration pages display persistent status messages for connection errors, disabled Google sign-in, and email confirmation. Google sign-in returns to the login page, which waits for Supabase to restore the session before opening the dashboard.

If Google sign-in returns `Unable to exchange external code`, inspect Supabase Auth logs. An `invalid_client` error with `The provided client secret is invalid` means the Google provider's saved secret must be replaced with an active secret belonging to the same Google Cloud Web application OAuth client as its Client ID. Save both in Supabase's Google provider settings, then start a fresh sign-in from the website; reloading an old callback cannot retry the code exchange. Keep the Google client secret out of `.env` and browser JavaScript for this static site. Setup: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

## Audit and validation

Android Chrome automation on a physical phone is documented step by step in [tests/mobile/README.md](tests/mobile/README.md). Windows Docker Desktop and Linux Docker Engine use `compose.mobile.yml` for Wireless debugging, with PowerShell and Bash examples for pairing, tests, logs and troubleshooting. Native Linux Docker USB testing uses the additional `compose.mobile.linux-usb.yml` override. The guide also includes a Windows-native USB alternative using `npm.cmd run mobile:server` and `npm.cmd run test:mobile`.

See `BUGFIX-NOTES.md` for the corrected issues, database instructions, test results, limitations, and the remaining live checks.

```bash
python tests/check_project.py
node tests/regression.cjs
node tests/verification.cjs
```

Photo sources are listed in `PHOTO-CREDITS.md`.
