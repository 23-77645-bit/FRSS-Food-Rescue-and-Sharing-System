import os
from urllib.parse import urljoin
from urllib.parse import urlparse
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def wait(d):
    return WebDriverWait(d, 30)

def visible(d, selector):
    return wait(d).until(lambda browser: next((e for e in browser.find_elements(By.CSS_SELECTOR, selector) if e.is_displayed()), False))

def open_page(d, page, selector=None):
    base = os.getenv('MOBILE_BASE_URL', 'https://frss-food-rescue-and-sharing-system.netlify.app/').rstrip('/') + '/'
    d.get(urljoin(base, 'pages/' + page))
    if selector:
        return visible(d, selector)

def on_page(d, page):
    return urlparse(d.current_url).path.removesuffix('.html').endswith('/pages/' + page.removesuffix('.html'))

def fill(d, name, value):
    el = visible(d, '[name="' + name + '"]')
    el.clear()
    el.send_keys(value)

def click(d, selector):
    el = visible(d, selector)
    d.execute_script('arguments[0].scrollIntoView({block:"center"})', el)
    wait(d).until(lambda _: el.is_enabled())
    el.click()

def submit(d, form):
    click(d, form + ' button[type="submit"]')

def login(d, account):
    open_page(d, 'login.html', '#loginForm')
    fill(d, 'email', account[0])
    fill(d, 'password', account[1])
    submit(d, '#loginForm')
    wait(d).until(lambda x: on_page(x, 'dashboard.html'))
    visible(d, 'body')

def assert_invalid(d, selector, flag):
    state = d.execute_script('const e=document.querySelector(arguments[0]); return {valid:e.validity.valid,flag:e.validity[arguments[1]],message:e.validationMessage}', selector, flag)
    assert state['valid'] is False and state['flag'] is True, state
    assert state['message'], 'Browser must show a validation message'

def denied_login(d, email, password):
    open_page(d, 'login.html', '#loginForm')
    fill(d, 'email', email)
    fill(d, 'password', password)
    submit(d, '#loginForm')
    # Exact semantic error prevents network/rate-limit errors from passing.
    wait(d).until(lambda x: 'Email or password is incorrect' in x.find_element(By.ID, 'authStatus').text)
    assert on_page(d, 'login.html')
    session = d.execute_async_script('const done=arguments[arguments.length-1]; window.sb.auth.getSession().then(r=>done(!!r.data.session)).catch(()=>done("ERROR"));')
    assert session is False
