# FRSS Appium: Windows or Linux + Docker + physical Android phone

This guide runs Appium, Java, the Android SDK and the JavaScript tests inside Docker. Chrome runs on your actual phone and opens the deployed FRSS website. No host Java, Android Studio or Node.js installation is required for the Docker steps.

The shared Docker procedure uses **Wireless debugging on Android 11 or newer**, on Windows or Linux. Your PC and phone must share a trusted Wi-Fi network that permits communication between devices. A USB cable is not required. Linux Docker Engine USB testing and a Windows-native USB alternative are documented below for older phones or networks that block wireless debugging.

| Computer/setup | Wireless Docker procedure | USB procedure |
| --- | --- | --- |
| Windows + Docker Desktop (Linux containers) | Steps 2A and 3–10, PowerShell variants | Windows-native USB section |
| Linux + Docker Engine | Steps 2B and 3–10, Bash variants | Linux Docker USB section |
| Linux + Docker Desktop VM | Shared wireless procedure, using the Desktop engine | USB override below is for native Docker Engine only |

Commands containing only `docker compose ...` work in both shells, even when a block is labelled PowerShell. Environment-variable assignment, status checks and local-network commands have separate examples. All Docker image commands run Linux programs inside the container regardless of your computer's OS. The image targets Intel/AMD x86-64 (`linux/amd64`); native ARM support is not covered.

## 1. Know what the tests cover

The four starter tests check login controls, password visibility, registration navigation and forgot-password navigation. They do not create accounts, send recovery emails or sign into Google. Test Google sign-in and dashboard access separately with a test account.

When `MOBILE_BASE_URL` is unset, the tests target the production site at `https://frss-food-rescue-and-sharing-system.netlify.app/`. The runner prints the resolved target before opening Chrome. Set `MOBILE_BASE_URL` only when you intentionally want to test another deployment or a local server reachable from the phone.

The connection is: **test runner inside Docker → Appium inside Docker → ADB inside Docker → phone over Wi-Fi → Chrome → FRSS**.

The mobile test environment is configured separately from development. Copy `.env.mobile.example` to the ignored `.env.mobile`, replace `ANDROID_UDID` with the phone's current Wireless debugging **IP address & port**, and keep the deployed `MOBILE_BASE_URL` unless you intentionally need another test target. Load it with `--env-file .env.mobile` and use the dedicated Compose project name:

```powershell
Copy-Item .env.mobile.example .env.mobile
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml up -d
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile npm run test:mobile
```

Before the test command, connect ADB inside the container with the same `ANDROID_UDID` address from `.env.mobile`:

```powershell
docker compose --env-file .env.mobile -p frss-mobile-test -f compose.mobile.yml exec mobile adb connect 192.168.1.50:40567
```

Replace the sample address. Compose passes both values from `.env.mobile` into the container for the test command.

On Windows, use the helper below to start the container, wait for Appium,
connect ADB, verify the phone, and run the tests in the correct order:

```powershell
powershell -ExecutionPolicy Bypass -File tests/mobile/run-docker-tests.ps1
```

The helper reads `ANDROID_UDID` from `.env.mobile`. Android may assign a new
debugging port, so you can override the saved value for one run:

```powershell
powershell -ExecutionPolicy Bypass -File tests/mobile/run-docker-tests.ps1 -DeviceAddress '192.168.1.16:34621'
```

Replace `34621` with the digits displayed on the phone. Do not type
`CURRENT_PORT` or `DEBUGGING_PORT` literally. If the saved or supplied value is
a placeholder, the helper asks for the current numeric address interactively.

Do not run `up --force-recreate` after `adb connect`. Recreating or restarting
the container ends its active ADB TCP connection. The Docker volume preserves
the pairing key, but you must run `adb connect` again after a restart using the
current address on Android's main Wireless debugging screen. The pairing-dialog
port is separate and temporary.

Use the root `compose.mobile.yml` for this guide. Include `-f compose.mobile.yml` in every command shown below. The obsolete `docker-compose.yml` setup has been removed because its site mount did not match this repository and its Appium service enabled privileged USB access by default.

## 2A. Windows: install and start Docker Desktop

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) and complete its Windows/WSL requirements.
2. Start Docker Desktop and wait for its engine to run. Use Linux containers with the WSL 2 backend. This image targets `linux/amd64` for an Intel/AMD Windows PC.
3. Open the FRSS project in VS Code, select **Terminal → New Terminal**, and use PowerShell.
4. Run commands from the repository root, where `compose.mobile.yml` and `package.json` are located:

```powershell
docker version
docker compose version
```

Checkpoint: `docker version` displays both Client and Server. If it cannot connect to the engine, start Docker Desktop before continuing. The image installs npm dependencies itself; you do not need to run `npm install` on Windows for this procedure.

## 2B. Linux: install and start Docker Engine

1. Install [Docker Engine for your Linux distribution](https://docs.docker.com/engine/install/). On Ubuntu, follow the [official Ubuntu installation steps](https://docs.docker.com/engine/install/ubuntu/) to add Docker's repository and install Engine, CLI, Buildx and the Compose plugin.
2. Install the [Compose plugin](https://docs.docker.com/compose/install/linux/) if `docker compose` is unavailable. This guide uses `docker compose`, not the older standalone `docker-compose` command.
3. On a systemd host, start/check the daemon:

```bash
sudo systemctl start docker
sudo systemctl status docker --no-pager7
```

4. Configure access through Docker's [Linux post-installation instructions](https://docs.docker.com/engine/install/linux-postinstall/), then log out/in if group membership changed. Membership in the `docker` group grants root-level host privileges; use the access method appropriate to your machine.
5. Open this repository in VS Code and start a Bash terminal in the project root. Verify:

```bash
docker version
docker compose version
docker run --rm hello-world
```

Checkpoint: Docker shows Server details and the hello-world container runs. The remaining examples assume your user can run `docker` directly. If your system requires `sudo`, supply the device/base URL explicitly, for example `sudo docker compose -f compose.mobile.yml exec -e ANDROID_UDID=192.168.1.50:40567 mobile npm run test:mobile`; `sudo` may drop exported environment variables.

Continue at step 3. Linux does not need a Windows USB driver or WSL. For wireless testing, host Android tools are not required. If you choose Docker Desktop on Linux, start Desktop and select its engine; use native Docker Engine for the Linux USB override described below.

## 3. Prepare your phone

1. Connect your phone and PC to the same Wi-Fi. Avoid guest networks or VPNs that block local devices.
2. Update Chrome and open it once to finish welcome screens.
3. Check that Chrome can open `https://frss-food-rescue-and-sharing-system.netlify.app/pages/login.html`.
4. Sign out of FRSS if already logged in. These tests expect the anonymous login page.
5. Enable Developer options: find **Settings → About phone → Build number**, and tap it seven times. Some phones place it under Software information.
6. Open **Developer options → Wireless debugging**, enable it and allow your current network. USB debugging is not required for these wireless steps.
7. Keep the phone unlocked while testing. Approve Appium helper app installation if prompted during the first session.

## 4. Build and start Appium

In your VS Code terminal (PowerShell on Windows or Bash on Linux):

```powershell
docker compose -f compose.mobile.yml build
docker compose -f compose.mobile.yml up -d
docker compose -f compose.mobile.yml ps
```

The initial build downloads Node.js, Java, Android tools and the project's pinned Appium dependencies. It requires internet access and can take several minutes. The build accepts Android SDK licenses to install SDK packages; review the [Android SDK terms](https://developer.android.com/studio/terms) before building.

Checkpoint: `mobile` is running and eventually reports `healthy`. Read the startup logs:

```powershell
docker compose -f compose.mobile.yml logs --tail 80 mobile
```

Expect Appium 3.9.0, UiAutomator2 8.7.3 and an HTTP listener on port 4723. Docker publishes this port only to your PC's `127.0.0.1`. Stop any native Windows Appium server using the same port.

Confirm the Appium server responds:

```powershell
(Invoke-RestMethod 'http://127.0.0.1:4723/status').value.ready
```

Expected result: `True`. This confirms server readiness; the phone is connected next.

Linux Bash status check:

```bash
curl --fail http://127.0.0.1:4723/status
```

Look for `"ready":true` in the JSON response. You can also use `docker compose -f compose.mobile.yml ps` to check container health if curl is unavailable.

## 5. Pair your phone with ADB inside Docker

On the phone, choose **Wireless debugging → Pair device with pairing code**. Leave the dialog open. Note its **IP address and pairing port** and its six-digit pairing code.

For example, if that dialog shows `192.168.1.50:37123`, run the command below, replacing the sample address with yours:

```powershell
docker compose -f compose.mobile.yml exec mobile adb pair 192.168.1.50:37123
```

Enter the pairing code when prompted and press Enter. Checkpoint: ADB prints `Successfully paired`. If the pairing dialog expires, reopen it and use its new code/port.

The `mobile-adb-keys` Docker volume saves the container's ADB identity so you do not need to pair on every restart. Deleting that volume or forgetting the paired device on Android requires pairing again.

## 6. Connect with the debugging port

Return to the main **Wireless debugging** screen. Note its **IP address & port**. This is usually a different port from the pairing dialog.

For example, if the main screen shows `192.168.1.50:40567`:

```powershell
docker compose -f compose.mobile.yml exec mobile adb connect 192.168.1.50:40567
docker compose -f compose.mobile.yml exec mobile adb devices -l
```

Expected output resembles:

```text
List of devices attached
192.168.1.50:40567 device product:... model:... transport_id:1
```

Use the exact first-column identifier in your output as `ANDROID_UDID`. Explicit `adb connect` avoids relying on automatic Wi-Fi discovery through Docker networking. Do not continue if the list is empty or the phone is `offline`/`unauthorized`.

## 7. Run the four mobile tests

Set your actual device identifier in PowerShell, then run:

```powershell
$env:ANDROID_UDID = '192.168.1.50:40567'
docker compose -f compose.mobile.yml exec -e ANDROID_UDID mobile npm run test:mobile
```

Replace the sample identifier. The `-e ANDROID_UDID` passes your current PowerShell value into the running container; changing a Windows variable alone does not change an existing container's environment.

On Linux Bash, use:

```bash
export ANDROID_UDID='192.168.1.50:40567'
docker compose -f compose.mobile.yml exec -e ANDROID_UDID mobile npm run test:mobile
```

Replace the sample identifier with your `adb devices -l` result. Export the variable in the terminal where you run Compose. Opening a new terminal requires exporting it again.

During the first run, Appium may install Android helper apps and download a Chromedriver matching the phone's Chrome version. Approve phone prompts and allow the container internet access.

Chrome should visit FRSS pages and toggle password visibility. The terminal should eventually report four passing tests and zero failures. The runner closes its Appium session afterward. These are expected results, not a claim that tests already passed on your phone.

The image enables UiAutomator2's Chromedriver download feature. It does not need a Google Client Secret, Supabase secret key or the project's `.env`. The Dockerfile-specific ignore file limits the build context to package manifests and mobile test files.

## 8. Inspect results and troubleshoot

Chrome opens after Appium creates its browser session. The first session may
take several minutes while Appium downloads a Chromedriver matching the phone's
Chrome version. The client allows up to ten minutes for session creation. Once
Chrome is ready, the runner opens `MOBILE_BASE_URL`, then runs the page checks.
Docker saves downloaded drivers in the `mobile-chromedrivers` volume for reuse.
If startup still fails, inspect the Appium logs for download/network errors;
an ADB connection alone does not confirm that the Chrome session is ready.

The Windows helper builds updated test files before connecting ADB, so rerunning
it applies changes without requiring a separate recreation after connection.

Immediately after the test command, inspect its exit code:

```powershell
$LASTEXITCODE
```

Linux Bash equivalent, immediately after the test command:

```bash
echo $?
```

`0` means success. Inspect Appium logs with:

```powershell
docker compose -f compose.mobile.yml logs --tail 150 mobile
```

To follow logs live in a second terminal:

```powershell
docker compose -f compose.mobile.yml logs -f mobile
```

Ctrl+C stops following logs without stopping the detached container.

| Problem | Action |
| --- | --- |
| Docker engine unavailable | Windows: start Docker Desktop. Linux Engine: check `sudo systemctl status docker`. |
| Docker socket permission denied on Linux | Follow Docker's Linux access instructions or use `sudo` with explicit `-e NAME=value` parameters. |
| Port 4723 already allocated | Stop the native Appium server or other container using it. |
| Pairing failed | Keep the pairing dialog open and use its current pairing port/code. |
| Paired but device list empty | Run `adb connect` with the main Wireless debugging connection port. |
| Phone connection timed out/refused | Check current phone IP/port, same Wi-Fi, Wireless debugging, VPN/firewall and guest-network isolation. |
| ANDROID_UDID missing | Set `$env:ANDROID_UDID` in PowerShell or `export ANDROID_UDID=...` in Bash, and include `exec -e ANDROID_UDID`. |
| Unauthorized/offline device | Unlock phone, reconnect, or forget the pairing on Android and pair again. |
| Chromedriver failure | Update Chrome, verify container internet access and inspect server logs. |
| Helper APK installation blocked | Approve installation on the phone; some manufacturers require an extra developer option. |
| Login page becomes dashboard | Sign out of FRSS in the test browser before rerunning. |

Run diagnostics inside Docker if needed:

```powershell
docker compose -f compose.mobile.yml exec mobile npm run mobile:doctor
```

Java, Android SDK and ADB should be available inside the image. The image intentionally omits an emulator; a doctor warning about its executable is not relevant to physical-phone testing. Optional bundletool, FFmpeg and GStreamer checks are not needed for these smoke tests. The final validation is a successful session with your phone.

## 9. Optional: test local changes instead of Netlify

1. Start VS Code Live Server on your computer's port 5500.
2. Find its Wi-Fi IPv4 address: Windows `ipconfig`; Linux `ip -4 addr`. Choose the Wi-Fi interface address, not a Docker bridge or loopback address.
3. Open `http://YOUR_PC_WIFI_IP:5500/` in phone Chrome. Live Server must listen on that network interface, and your host firewall must allow the port on your trusted network. Verify this manually before running tests.
4. Set that reachable address and run:

```powershell
$env:MOBILE_BASE_URL = 'http://192.168.1.20:5500/'
docker compose -f compose.mobile.yml exec -e ANDROID_UDID -e MOBILE_BASE_URL mobile npm run test:mobile
```

Linux Bash version:

```bash
export MOBILE_BASE_URL='http://192.168.1.20:5500/'
docker compose -f compose.mobile.yml exec -e ANDROID_UDID -e MOBILE_BASE_URL mobile npm run test:mobile
```

Replace the sample PC address. The URL must be reachable from your phone. `127.0.0.1` on the phone refers to the phone. `adb reverse` inside this container would forward to the container, not your host; it is unnecessary with the PC Wi-Fi address.

These smoke tests do not submit authentication requests. Actual OAuth tests on a new origin also need the appropriate authentication redirect configuration.

Restore the deployed target with:

```powershell
$env:MOBILE_BASE_URL = 'https://frss-food-rescue-and-sharing-system.netlify.app/'
docker compose -f compose.mobile.yml exec -e ANDROID_UDID -e MOBILE_BASE_URL mobile npm run test:mobile
```

Linux Bash version:

```bash
export MOBILE_BASE_URL='https://frss-food-rescue-and-sharing-system.netlify.app/'
docker compose -f compose.mobile.yml exec -e ANDROID_UDID -e MOBILE_BASE_URL mobile npm run test:mobile
```

## 10. Stop and restart later

Stop this setup while preserving the pairing volume:

```powershell
docker compose -f compose.mobile.yml down
```

Turn off Wireless debugging when finished. Next time, start your Docker engine, enable Wireless debugging, run `up -d`, and repeat steps 6–7 using the phone's current connection address. Pair again only if needed.

The image copies test files during the build. After changing tests or package dependencies, rebuild and recreate it:

```powershell
docker compose -f compose.mobile.yml up -d --build
```

## Linux USB alternative: Appium inside Docker Engine

This option requires native, rootful Docker Engine on Linux and a USB data cable. It does not apply to Windows, WSL or a Docker Desktop VM. It uses the same test image with the provided `compose.mobile.linux-usb.yml` override. Wireless debugging and Wi-Fi pairing are not required; the phone still needs internet access to open FRSS.

The override grants the container privileged host access and mounts `/dev/bus/usb`. Use it only on your own test machine with this trusted image. The wireless setup does not need these permissions.

1. Enable **Developer options → USB debugging**, connect the data cable and keep the phone unlocked.
2. Verify the Linux host sees a USB bus with `ls /dev/bus/usb`. If a host ADB server is running, stop it with `adb kill-server` before letting container ADB claim the device. Close other Android tools that might restart host ADB. Skip that command if host `adb` is not installed.
3. From the repository root, start the service with both files:

```bash
docker compose -f compose.mobile.yml -f compose.mobile.linux-usb.yml up -d --build
docker compose -f compose.mobile.yml -f compose.mobile.linux-usb.yml exec mobile adb devices -l
```

4. Accept the USB debugging RSA authorization prompt on the phone, then repeat `adb devices -l`. It must show `device` rather than `unauthorized`. If no device appears, check the data cable, phone USB settings and host access; replug and retry.
5. Set the first-column USB serial and run:

```bash
export ANDROID_UDID='YOUR_USB_PHONE_SERIAL'
docker compose -f compose.mobile.yml -f compose.mobile.linux-usb.yml exec -e ANDROID_UDID mobile npm run test:mobile
```

6. Read logs and stop the setup using the same two-file combination:

```bash
docker compose -f compose.mobile.yml -f compose.mobile.linux-usb.yml logs --tail 150 mobile
docker compose -f compose.mobile.yml -f compose.mobile.linux-usb.yml down
```

Keep both `-f` arguments on Linux USB commands, including rebuilds and diagnostics. To switch back to wireless, bring down the USB setup first, then start with only `compose.mobile.yml` and follow the wireless pairing steps.

## Windows USB alternative: Appium directly on Windows

Use this alternative for phones without Wireless debugging or networks that block it. It runs Appium on Windows, with a USB data cable.

1. Install Android Studio and use SDK Manager to install Platform-Tools, an SDK Platform and Build-Tools.
2. Set Windows user variable `ANDROID_HOME` to the SDK path, usually `C:\Users\YOUR_NAME\AppData\Local\Android\Sdk`. Add `%ANDROID_HOME%\platform-tools` to user Path.
3. Set `JAVA_HOME` to a JDK installation. Android Studio's bundled `C:\Program Files\Android\Android Studio\jbr` is an option if `bin\java.exe` exists. Add `%JAVA_HOME%\bin` to Path.
4. Restart VS Code so its terminals receive these variables.
5. Enable Developer options and **USB debugging**. Connect a USB data cable, unlock the phone and accept the debugging prompt. Install its manufacturer's Windows USB driver if the phone is not detected.
6. Stop Docker's Appium container with `docker compose -f compose.mobile.yml down` to free port 4723.
7. Run from the repository root:

```powershell
npm.cmd ci
npm.cmd run mobile:doctor
adb devices -l
npm.cmd run mobile:server
```

8. In a second terminal, use the exact USB serial from `adb devices -l`:

```powershell
$env:ANDROID_UDID = 'YOUR_USB_PHONE_SERIAL'
npm.cmd run test:mobile
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`. Stop Appium with Ctrl+C. Fully containerized USB access on Windows requires additional USB/IP or remote-ADB configuration beyond this guide.

## References and verification limits

- [Android Wireless debugging and ADB pairing](https://developer.android.com/tools/adb#wireless)
- [Appium Android prerequisites](https://appium.github.io/appium-uiautomator2-driver/latest/getting-started/)
- [UiAutomator2 capabilities and Chromedriver setup](https://github.com/appium/appium-uiautomator2-driver)
- [Docker Desktop USB limitations](https://docs.docker.com/desktop/troubleshoot-and-support/faqs/general/)
- [Docker Engine installation on Linux](https://docs.docker.com/engine/install/)
- [Appium Docker Android USB examples](https://github.com/appium/appium-docker-android)

The native Windows Appium server and driver were verified to start during initial setup. Compose configuration validation is separate from building the image or running device tests. Windows/Linux Docker runtime and Linux USB tests still require a running engine, a connected phone and network access; they have not been verified on a physical device during this setup.
