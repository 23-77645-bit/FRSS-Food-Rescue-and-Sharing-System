import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function onlineDevices() {
  let output;
  try {
    output = execFileSync('adb', ['devices', '-l'], { encoding: 'utf8' });
  } catch (error) {
    fail(`Cannot list ADB devices: ${error.message}`);
  }
  return output.split(/\r?\n/).flatMap((line) => {
    const match = /^(\S+)\s+device(?:\s|$)/.exec(line);
    return match ? [match[1]] : [];
  });
}

const online = onlineDevices();
const requested = process.argv.slice(2);
const devices = requested.length ? requested : online;

if (!devices.length) {
  fail('No online Android devices. Pair and connect each phone, then check adb devices -l.');
}
if (devices.length < 2) {
  fail('Parallel mobile tests require at least two online Android devices. Use npm run test:mobile for one phone.');
}
if (new Set(devices).size !== devices.length) {
  fail('Each device may be listed only once.');
}
for (const device of devices) {
  if (!online.includes(device)) {
    fail(`${device} is not online in adb devices -l.`);
  }
}

const testFile = fileURLToPath(new URL('./smoke.test.mjs', import.meta.url));
const children = [];

function prefixLines(stream, destination, device) {
  createInterface({ input: stream }).on('line', (line) => {
    destination.write(`[${device}] ${line}\n`);
  });
}

console.log(`Running mobile smoke tests on ${devices.length} device(s) simultaneously.`);
const results = devices.map((device, index) => {
  const systemPort = 8200 + index;
  const chromedriverPort = 11000 + index;
  console.log(`${device}: UiAutomator2 port ${systemPort}, ChromeDriver port ${chromedriverPort}`);

  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', testFile], {
    env: {
      ...process.env,
      ANDROID_UDID: device,
      MOBILE_SYSTEM_PORT: String(systemPort),
      MOBILE_CHROMEDRIVER_PORT: String(chromedriverPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  prefixLines(child.stdout, process.stdout, device);
  prefixLines(child.stderr, process.stderr, device);

  return new Promise((resolve) => {
    let startError;
    child.once('error', (error) => { startError = error; });
    child.once('close', (code, signal) => {
      resolve({ device, code: startError ? 1 : code ?? 1, signal, startError });
    });
  });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}

const completed = await Promise.all(results);
for (const result of completed) {
  if (result.startError) console.error(`${result.device}: ${result.startError.message}`);
  console.log(`${result.device}: ${result.code === 0 ? 'PASS' : 'FAIL'}${result.signal ? ` (${result.signal})` : ''}`);
}
process.exitCode = completed.every(({ code }) => code === 0) ? 0 : 1;
