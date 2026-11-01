import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import pytest
from dotenv import load_dotenv
from appium import webdriver
from appium.options.android import UiAutomator2Options

ROOT = Path(__file__).parent
load_dotenv(ROOT.parents[2] / '.env.mobile')
RESULTS = []

def pytest_configure(config):
    reports = ROOT / 'reports'
    reports.mkdir(exist_ok=True)
    if not config.option.htmlpath:
        config.option.htmlpath = str(reports / 'report.html')
        config.option.self_contained_html = True
    if not config.option.xmlpath:
        config.option.xmlpath = str(reports / 'junit.xml')

@pytest.fixture
def driver():
    udid = os.getenv('ANDROID_UDID', '')
    if not udid or udid.startswith('REPLACE'):
        pytest.fail('Set ANDROID_UDID in .env.mobile to the serial from adb devices -l')
    caps = {'platformName': 'Android', 'browserName': 'Chrome',
            'appium:automationName': 'UiAutomator2', 'appium:udid': udid,
            'appium:deviceName': 'FRSS test device', 'appium:newCommandTimeout': 120}
    for env_name, capability in [('MOBILE_SYSTEM_PORT', 'appium:systemPort'),
                                 ('MOBILE_CHROMEDRIVER_PORT', 'appium:chromedriverPort')]:
        if os.getenv(env_name):
            caps[capability] = int(os.environ[env_name])
    if os.getenv('CHROMEDRIVER_EXECUTABLE'):
        caps['appium:chromedriverExecutable'] = os.environ['CHROMEDRIVER_EXECUTABLE']
    d = webdriver.Remote(os.getenv('APPIUM_URL', 'http://127.0.0.1:4723'),
                         options=UiAutomator2Options().load_capabilities(caps))
    # Clear stored authentication before opening login, which can redirect a
    # previously signed-in Chrome profile away from its form.
    from helpers import open_page
    try:
        d.get(os.getenv('MOBILE_BASE_URL', 'https://frss-food-rescue-and-sharing-system.netlify.app/'))
        d.execute_script('localStorage.clear(); sessionStorage.clear();')
        d.delete_all_cookies()
        open_page(d, 'login.html', '#loginForm')
        yield d
    finally:
        d.quit()

@pytest.fixture
def account():
    email, password = os.getenv('FRSS_EMAIL'), os.getenv('FRSS_PASSWORD')
    if not email or not password:
        pytest.skip('Blocked: configure FRSS_EMAIL and FRSS_PASSWORD for a verified regular test account')
    return email, password

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    result = yield
    rep = result.get_result()
    if rep.when == 'call' or (rep.when == 'setup' and rep.outcome != 'passed'):
        case = getattr(item, 'callspec', None)
        case_id = case.params.get('case', {}).get('TC ID', '') if case else ''
        case_id = case_id or item.name.split('[')[0].replace('test_', '').replace('_', '-').upper()
        status = {'passed': 'Pass', 'failed': 'Fail', 'skipped': 'Blocked'}[rep.outcome]
        detail = str(rep.longrepr) if rep.longrepr else 'All implemented assertions passed.'
        # Avoid storing credentials from tracebacks in the portable CSV.
        for key in ('FRSS_EMAIL', 'FRSS_PASSWORD'):
            secret = os.getenv(key)
            if secret:
                detail = detail.replace(secret, '[REDACTED]')
        RESULTS.append({'TC ID': case_id, 'Status': status, 'Actual Result': detail,
                        'Date Tested': datetime.now(timezone.utc).isoformat(), 'Test': item.nodeid})

def pytest_sessionfinish(session, exitstatus):
    target = ROOT / 'reports'
    target.mkdir(exist_ok=True)
    source_cases = json.loads((ROOT / 'data' / 'cases.json').read_text(encoding='utf-8'))
    expected_instances = {'TC-AUTH-04': 3, 'TC-AUTH-09': 2}
    grouped = {}
    for result in RESULTS:
        grouped.setdefault(result['TC ID'], []).append(result)
    rows = []
    for source in source_cases:
        case_id = source['TC ID']
        results = grouped.get(case_id, [])
        expected = expected_instances.get(case_id, 1)
        if any(result['Status'] == 'Fail' for result in results):
            status = 'Fail'
        elif any(result['Status'] == 'Blocked' for result in results):
            status = 'Blocked'
        elif len(results) >= expected and all(result['Status'] == 'Pass' for result in results):
            status = 'Pass'
        else:
            status = 'Not Run'
        detail = ' | '.join(result['Actual Result'] for result in results)
        if len(results) < expected and results:
            detail = f'{len(results)}/{expected} instances executed. ' + detail
        rows.append({'TC ID': case_id, 'Status': status,
                     'Actual Result': detail, 'Date Tested': results[-1]['Date Tested'] if results else '',
                     'Test': ' | '.join(result['Test'] for result in results)})
    with (target / 'results.csv').open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
