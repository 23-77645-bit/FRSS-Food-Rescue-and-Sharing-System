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

## Audit and validation

See `BUGFIX-NOTES.md` for the corrected issues, database instructions, test results, limitations, and the remaining live checks.

```bash
python tests/check_project.py
node tests/regression.cjs
node tests/verification.cjs
```

Photo sources are listed in `PHOTO-CREDITS.md`.
