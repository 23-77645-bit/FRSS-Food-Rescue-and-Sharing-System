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

Login uses tab-scoped `sessionStorage` by default: navigation and refresh keep
the login, while closing the tab normally clears it. Checking “Remember me” on
the login page uses `localStorage` to preserve login across browser restarts,
including Google sign-in. There is no inactivity timeout. Browser restore or
duplicate-tab features can restore/copy session storage, so this is a browser
storage policy, not server-side token revocation. Previously persisted logins
without an explicit Remember me preference require a fresh login after this
update. Redeploy the updated files to Netlify to apply it.

If Google sign-in returns `Unable to exchange external code`, inspect Supabase Auth logs. An `invalid_client` error with `The provided client secret is invalid` means the Google provider's saved secret must be replaced with an active secret belonging to the same Google Cloud Web application OAuth client as its Client ID. Save both in Supabase's Google provider settings, then start a fresh sign-in from the website; reloading an old callback cannot retry the code exchange. Keep the Google client secret out of `.env` and browser JavaScript for this static site. Setup: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

## Automated tests

Run the desktop/static checks from the repository root:

```bash
node tests/auth.cjs
node tests/session.cjs
node tests/regression.cjs
node tests/verification.cjs
node tests/admin-navigation.cjs
python tests/check_project.py
```

- `tests/auth.cjs` covers mocked registration, login, password recovery, OAuth callbacks, and dashboard redirects.
- `tests/session.cjs` covers tab-scoped login, remembered login, token refresh, storage switching, and logout cleanup.
- `tests/regression.cjs` covers mocked food, claim, notification, location, and UI regression cases.
- `tests/verification.cjs` covers mocked identity-upload cleanup and duplicate-submission protection.
- `tests/admin-navigation.cjs` covers all admin views and sidebar pointer behavior.
- `tests/check_project.py` combines each page's local and inline JavaScript and runs Node syntax checks across the static site.

Run `npm run test:mobile` for the read-only Appium smoke tests. They require a physical Android device with Chrome, a running Appium server, and `ANDROID_UDID` set to the device serial shown by `adb devices -l`. The Docker and native setup steps are in [tests/mobile/README.md](tests/mobile/README.md).

### Windows wireless ADB quick start

If `adb connect` reports `Connection refused`, first check the **IP address & port on the main Wireless debugging screen**. The port under **Pair device with pairing code** is temporary and is only for `adb pair`. Android can change either port after Wireless debugging restarts.

The PC and phone must be able to reach each other locally. Being on the same Wi-Fi band or SSID does not guarantee this: guest networks or router client isolation can block device-to-device traffic. In the verified Windows setup, the Converge Wi-Fi path could not reach the phone even though both devices used the same SSID. Connecting the phone to the PC's **Windows Mobile hotspot** fixed the network path. After changing networks, reopen Wireless debugging and use its new addresses.

From PowerShell in the repository root, create `.env.mobile` from `.env.mobile.example` if needed, then set `ANDROID_UDID` in `.env.mobile` to the **main-screen** address. Keep the phone unlocked and the pairing dialog open while pairing:

```powershell
if (!(Test-Path .env.mobile)) { Copy-Item .env.mobile.example .env.mobile }
notepad .env.mobile
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml up -d --build
$pairAddress = Read-Host 'Pairing-dialog IP address and port'
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile adb pair $pairAddress
$debugAddress = Read-Host 'Main Wireless debugging IP address and port'
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile adb connect $debugAddress
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile adb devices -l
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec -e "ANDROID_UDID=$debugAddress" mobile npm run test:mobile
```

Enter the six-digit code when `adb pair` prompts. Continue only when `adb devices -l` shows the phone as `device`. A container rebuild ends its active ADB connection, so repeat `adb connect` afterward; the `mobile-adb-keys` volume keeps the pairing files. If the phone rejects a reconnect after a rebuild, reopen the pairing dialog and pair again.

If pairing or connecting still fails, test the current phone address from **Windows PowerShell** before retrying Docker:

```powershell
$debugAddress = Read-Host 'Current main Wireless debugging IP address and port'
$phoneIp, $phonePort = $debugAddress.Split(':')
Test-NetConnection -ComputerName $phoneIp -Port ([int]$phonePort)
```

Use the phone's **current main-screen** values. `TcpTestSucceeded : False` means Windows cannot open that port; check the current address, phone Wi-Fi, guest-network/client-isolation settings, or use Windows Mobile hotspot. Check `TcpTestSucceeded` even if the ping result is false. When `TcpTestSucceeded : True` but `adb connect` fails, confirm the container was paired using the current pairing-dialog port and code. See the [full mobile guide](tests/mobile/README.md) for Linux, USB, and additional troubleshooting.

### Parallel Android testing

For two or more phones on the same reachable hotspot, pair and connect each phone inside the `mobile` container, confirm they all appear as `device` in `adb devices -l`, then run:

```powershell
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile npm run test:mobile:parallel
```

The runner starts a separate Appium session per phone with unique UiAutomator2 and ChromeDriver ports. See [multi-phone setup](tests/mobile/README.md#run-on-multiple-phones-simultaneously) for pairing commands and device selection.

### Acceptance cases from FRSS_Integrated_Appium

The imported Python Appium suite keeps the 106 source case IDs and runs the 13 implemented browser checks (16 test instances). The other cases are explicitly skipped; they are not counted as passed. It uses the same Docker Appium server and connected Android phone as the smoke tests. After connecting the phone, run:

```powershell
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile npm run test:mobile:cases -- -v
```

Tests requiring a real account need `FRSS_EMAIL` and `FRSS_PASSWORD` for a dedicated verified regular test account in `.env.mobile`; `FRSS_UNKNOWN_EMAIL` enables the unregistered-email check. Recreate the container after changing that file, then reconnect the phone. Reports appear in `tests/mobile/cases/reports`. See the [acceptance suite guide](tests/mobile/cases/README.md) for setup and case coverage. Run acceptance cases on one phone at a time; `test:mobile:parallel` runs the separate smoke suite across multiple phones.

## Audit and validation

Android Chrome automation on a physical phone is documented step by step in [tests/mobile/README.md](tests/mobile/README.md). Windows Docker Desktop and Linux Docker Engine use `compose.mobile.yml` for Wireless debugging, with PowerShell and Bash examples for pairing, tests, logs and troubleshooting. Native Linux Docker USB testing uses the additional `compose.mobile.linux-usb.yml` override. The guide also includes a Windows-native USB alternative using `npm.cmd run mobile:server` and `npm.cmd run test:mobile`.

See `BUGFIX-NOTES.md` for the corrected issues, database instructions, test results, limitations, and the remaining live checks.

Photo sources are listed in `PHOTO-CREDITS.md`.
