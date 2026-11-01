function optionalPort(env, name) {
  if (!env[name]) return undefined;
  const port = Number(env[name]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a TCP port from 1 to 65535.`);
  }
  return port;
}

export function mobileConfig(env = process.env) {
  const baseUrl = new URL(env.MOBILE_BASE_URL || 'https://frss-food-rescue-and-sharing-system.netlify.app/');
  const systemPort = optionalPort(env, 'MOBILE_SYSTEM_PORT');
  const chromedriverPort = optionalPort(env, 'MOBILE_CHROMEDRIVER_PORT');
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('MOBILE_BASE_URL must use HTTP or HTTPS.');
  if (!env.ANDROID_UDID) throw new Error('Set ANDROID_UDID to the serial shown by adb devices -l.');
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
  return {
    baseUrl,
    options: {
      hostname: '127.0.0.1', port: 4723, path: '/',
      logLevel: 'error', connectionRetryCount: 0, connectionRetryTimeout: 600000,
      capabilities: {
        // UiAutomator2 does not implement BiDi browsingContext.navigate.
        'wdio:enforceWebDriverClassic': true,
        platformName: 'Android', browserName: 'Chrome',
        'appium:automationName': 'UiAutomator2',
        'appium:udid': env.ANDROID_UDID,
        'appium:deviceName': 'FRSS Android phone',
        'appium:newCommandTimeout': 120,
        ...(systemPort ? { 'appium:systemPort': systemPort } : {}),
        ...(chromedriverPort ? { 'appium:chromedriverPort': chromedriverPort } : {}),
        ...(env.CHROMEDRIVER_CACHE_DIR ? {
          'appium:chromedriverExecutableDir': env.CHROMEDRIVER_CACHE_DIR,
        } : {}),
      },
    },
  };
}
