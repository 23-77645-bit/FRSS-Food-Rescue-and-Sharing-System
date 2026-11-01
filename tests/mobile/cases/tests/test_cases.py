import json
import os
from pathlib import Path
import pytest
from selenium.webdriver.common.by import By
from helpers import open_page, on_page, visible, fill, click, submit, wait, login, assert_invalid, denied_login

def test_tc_auth_03(driver):
    open_page(driver, 'register.html', '#registerForm')
    fill(driver, 'fullName', 'FRSS QA')
    fill(driver, 'email', 'juan.test01mail')
    fill(driver, 'password', 'Test@1234')
    fill(driver, 'confirmPassword', 'Test@1234')
    click(driver, '[name="terms"]')
    submit(driver, '#registerForm')
    assert_invalid(driver, '[name="email"]', 'typeMismatch')
    assert on_page(driver, 'register.html')

@pytest.mark.parametrize('field', ['fullName', 'email', 'password'])
def test_tc_auth_04(driver, field):
    open_page(driver, 'register.html', '#registerForm')
    for name, value in {'fullName':'FRSS QA','email':'qa@example.com','password':'Test@1234','confirmPassword':'Test@1234'}.items():
        if name != field:
            fill(driver, name, value)
    click(driver, '[name="terms"]')
    submit(driver, '#registerForm')
    assert_invalid(driver, '[name="' + field + '"]', 'valueMissing')

def test_tc_auth_05(driver):
    open_page(driver, 'register.html', '#registerForm')
    for name, value in {'fullName':'FRSS QA','email':'qa@example.com','password':'123','confirmPassword':'123'}.items():
        fill(driver, name, value)
    click(driver, '[name="terms"]')
    submit(driver, '#registerForm')
    assert_invalid(driver, '#password', 'tooShort')

@pytest.mark.account
def test_tc_auth_06(account, driver):
    login(driver, account)
    assert visible(driver, 'a[href="find-food.html"]')
    assert visible(driver, 'a[href="donate.html"]')

@pytest.mark.account
def test_tc_auth_07(account, driver):
    denied_login(driver, account[0], account[1] + 'WRONG')

def test_tc_auth_08(driver):
    email = os.getenv('FRSS_UNKNOWN_EMAIL')
    if not email:
        pytest.skip('Blocked: set FRSS_UNKNOWN_EMAIL to a genuinely unregistered address')
    denied_login(driver, email, 'Wrong@999')

@pytest.mark.parametrize('field', ['email', 'password'])
def test_tc_auth_09(driver, field):
    open_page(driver, 'login.html', '#loginForm')
    fill(driver, 'password' if field == 'email' else 'email', 'Test@1234' if field == 'email' else 'qa@example.com')
    submit(driver, '#loginForm')
    assert_invalid(driver, '[name="' + field + '"]', 'valueMissing')

@pytest.mark.account
def test_tc_auth_11(account, driver):
    login(driver, account)
    click(driver, '[data-logout]')
    click(driver, '#logoutConfirmYes')
    wait(driver).until(lambda d: not on_page(d, 'dashboard.html'))
    driver.back()
    open_page(driver, 'dashboard.html')
    wait(driver).until(lambda d: on_page(d, 'login.html'))
    visible(driver, '#loginForm')

@pytest.mark.account
def test_tc_dash_01(account, driver):
    login(driver, account)
    assert visible(driver, 'a[href="find-food.html"]')
    assert visible(driver, 'a[href="donate.html"]')

@pytest.mark.account
def test_tc_dash_02(account, driver):
    login(driver, account)
    click(driver, 'a[href="find-food.html"]')
    wait(driver).until(lambda d: on_page(d, 'find-food.html'))
    visible(driver, '#foodGrid')

@pytest.mark.account
def test_tc_dash_03(account, driver):
    login(driver, account)
    click(driver, 'a[href="donate.html"]')
    visible(driver, '#donationForm')

def test_tc_dash_05(driver):
    open_page(driver, 'dashboard.html')
    wait(driver).until(lambda d: on_page(d, 'login.html'))
    visible(driver, '#loginForm')

@pytest.mark.account
def test_tc_don_03(account, driver):
    login(driver, account)
    open_page(driver, 'donate.html', '#donationForm')
    submit(driver, '#donationForm')
    for field in ['foodName', 'category', 'quantity', 'expirationDate', 'pickupLocation']:
        assert_invalid(driver, '[name="' + field + '"]', 'valueMissing')

CASES = json.loads((Path(__file__).parents[1] / 'data/cases.json').read_text(encoding='utf-8'))
IMPLEMENTED = {'TC-AUTH-03','TC-AUTH-04','TC-AUTH-05','TC-AUTH-06','TC-AUTH-07','TC-AUTH-08','TC-AUTH-09','TC-AUTH-11','TC-DASH-01','TC-DASH-02','TC-DASH-03','TC-DASH-05','TC-DON-03'}

@pytest.mark.parametrize('case', [c for c in CASES if c['TC ID'] not in IMPLEMENTED], ids=lambda c: c['TC ID'])
def test_remaining_cases(case):
    pytest.skip('Not automated: ' + case['Test Scenario'] + '. Follow source Preconditions, Test Steps and Expected Result in data/cases.json; needs additional fixtures, workflow implementation, API verification or human review.')
