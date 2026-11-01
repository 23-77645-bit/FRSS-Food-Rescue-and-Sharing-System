# FRSS test-case automation

This suite lives inside the existing FRSS project. It uses the same Appium server, Android device and `.env.mobile` as the existing JavaScript smoke tests. Run all commands below from the repository root. The original `npm run test:mobile` still runs the four smoke tests; `npm run test:mobile:cases` runs the Python acceptance-case checks.

## Native Windows / VS Code

Follow the Windows-native USB instructions in [the existing mobile guide](../README.md) to configure Android SDK, Java and the device. Install Python 3.11+ and the VS Code Python/Python Debugger extensions. Open this repository in VS Code, then run:

```powershell
npm.cmd ci
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tests/mobile/cases/requirements.txt
# Only if .env.mobile does not already exist:
Copy-Item .env.mobile.example .env.mobile
adb devices -l
npm.cmd run mobile:doctor
```

Edit `.env.mobile`, preserving any existing values: set `ANDROID_UDID` to your device serial, `MOBILE_BASE_URL` to the deployed site or another URL reachable from the phone, and optionally `FRSS_EMAIL`/`FRSS_PASSWORD` to a dedicated verified regular account. Set `FRSS_UNKNOWN_EMAIL` to a genuinely unregistered email address you control. Existing process environment variables take precedence over the file. Do not use your admin account. Do not commit credentials.

Start Appium in terminal 1:

```powershell
npm.cmd run mobile:server
```

Run tests in terminal 2:

```powershell
npm.cmd run test:mobile:cases:list
npm.cmd run test:mobile:cases -- -v -k tc_auth_03
npm.cmd run test:mobile:cases -- -v
```

The runner automatically selects the root `.venv`; activation is unnecessary. For debugging, select that interpreter in VS Code and use the Testing panel. On Linux, create `.venv` with `python3 -m venv .venv`, install the same requirements and select `.venv/bin/python` instead of the workspace's Windows default.

## Existing Docker workflow

The mobile image now includes an isolated Python environment. Follow the existing wireless pairing instructions. Rebuild **before** connecting ADB; recreation drops its connection. Use your phone's current main Wireless debugging address:

```powershell
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml up -d --build
# Pair first if required; replace this address with your current debugging address.
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile adb connect 192.168.137.101:PORT
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile npm run test:mobile:cases -- -v
```

Compose loads `.env.mobile` into the container. If you change it, recreate before reconnecting, or pass explicit `exec -e` overrides. Do not run native Appium and Docker Appium on port 4723 simultaneously. Reports are mounted back to `tests/mobile/cases/reports` on the host. The existing Docker helper continues running smoke tests; run the case command above after it has connected the device. Linux USB testing uses both Compose files as documented in the parent guide.

## Coverage and reports

All 106 source cases from `C:\Users\Eloisa Joyce\Downloads\FRSS_Test_Cases.xlsx` are preserved in `data/cases.json`; the workbook extraction is in `data/source-sheet.txt`. The 106 imported rows match the workbook’s case sheet across every field. The workbook is the source of truth for the expected results.

13 source case IDs have executable browser checks: TC-AUTH-03/04/05/06/07/08/09/11, TC-DASH-01/02/03/05 and TC-DON-03. Parameterization produces 16 executable instances. The other 93 IDs are explicit skipped placeholders, giving 109 collected test instances. Missing test accounts are Blocked; device/session setup errors are Fail. AUTH-05 checks the current client eight-character minimum pending policy confirmation. Browser validation and redirect assertions do not verify database records or API permissions. No posting, claiming, admin mutation, recovery email or registration request is performed by this suite. The business workflows still require implementation and controlled fixtures.

Reports: `tests/mobile/cases/reports/report.html`, `junit.xml` and `results.csv`. Skipped placeholders map to Blocked, never Pass. For parameterized cases, any failure makes the source case Fail; if none fails but a required instance is blocked, the case is Blocked; Pass requires every required instance to pass. Unselected cases stay Not Run. The CSV always includes all 106 workbook case IDs. Reports are replaced per run. The Google Sheet is never overwritten. Review reports before sharing; HTML/XML failure output may contain account details. The CSV redacts configured credentials. No screenshots are saved.

Tests clear FRSS browser storage and run serially; use a dedicated test browser/device. A local PC URL must be reachable from phone Chrome; localhost on the phone refers to the phone itself. Do not run parallel workers against one device.

Local syntax and collection checks can be verified without a phone. Device tests require a connected Android phone.
