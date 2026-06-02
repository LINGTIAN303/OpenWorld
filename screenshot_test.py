from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto('http://localhost:5175')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    
    page.screenshot(path='d:/本地化AI/DeepSeek_Home/worldsmith/screenshot_initial.png', full_page=False)
    
    theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
    print(f"Current theme: {theme}")
    
    bg_base = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--color-bg-base').trim()")
    content_bg = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--content-bg').trim()")
    print(f"--color-bg-base: {bg_base}")
    print(f"--content-bg: {content_bg}")
    
    notebook_view = page.locator('.notebook-view')
    if notebook_view.count() > 0:
        nb_bg = page.evaluate("getComputedStyle(document.querySelector('.notebook-view')).backgroundColor")
        print(f".notebook-view background: {nb_bg}")
    else:
        print("No .notebook-view found on current page")
    
    view_container = page.locator('.view-container')
    if view_container.count() > 0:
        vc_bg = page.evaluate("getComputedStyle(document.querySelector('.view-container')).backgroundColor")
        print(f".view-container background: {vc_bg}")
    
    sidebar_items = page.locator('.sidebar-item, .sb-item')
    if sidebar_items.count() > 0:
        print(f"Found {sidebar_items.count()} sidebar items")
    
    browser.close()
