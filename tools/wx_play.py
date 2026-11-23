# Plays the WeChat build by touch in the harness: buttons are found by their labels (ui hits keep
# them), so this checks that the windows really answer taps.   python3 tools/wx_play.py <out-dir>
import sys, os, pathlib
from playwright.sync_api import sync_playwright
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
URL = (pathlib.Path(__file__).resolve().parent.parent / "dist-wx" / "harness.html").as_uri()
errors, fails = [], []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME"), args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--allow-file-access-from-files"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    pg.goto(URL); pg.wait_for_function("window.__game", timeout=30000); pg.wait_for_timeout(1200)
    def ev(js): return pg.evaluate(js)
    def tap(label, nth=0, must=True):
        pg.wait_for_timeout(250)
        box = ev(f"""(() => {{ const h = __wxui.hits.filter((x) => x.label && x.label.includes({label!r})); const b = h[{nth}]; return b ? [b.x + b.w/2, b.y + b.h/2] : null }})()""")
        if not box:
            if must: fails.append("no button: " + label)
            return False
        pg.mouse.click(box[0], box[1]); pg.wait_for_timeout(250); return True
    def check(cond, what):
        if not ev(cond): fails.append("FAILED: " + what)
    tap("开始"); pg.wait_for_timeout(600)
    tap("随机"); tap("就是我了"); pg.wait_for_timeout(400); tap("上岛")
    check("!__game.panel", "start → island")
    ev("__game.devGive(); __game.save.coins += 3000; __game.changed()")
    # the computer: stocks, buy
    ev("__game.open({ kind: 'pc' })"); pg.wait_for_timeout(400)
    ev("(() => { const h = __wxui.hits.find((x) => !x.label && x.w > 80 && x.h > 60); })()")
    # tap the first desktop icon (股市)
    box = ev("(() => { const h = __wxui.hits.filter((x) => !x.label && x.on && x.h >= 70); const b = h[0]; return b ? [b.x + b.w/2, b.y + b.h/2] : null })()")
    if box: pg.mouse.click(*box); pg.wait_for_timeout(400)
    else: fails.append("no desktop icon")
    box = ev("(() => { const h = __wxui.hits.filter((x) => !x.label && x.on && x.h >= 40 && x.h <= 56); const b = h[0]; return b ? [b.x + b.w/2, b.y + b.h/2] : null })()")
    if box: pg.mouse.click(*box); pg.wait_for_timeout(400)
    else: fails.append("no stock row")
    c0 = ev("__game.save.coins")
    tap("买 10 股")
    check(f"__game.save.coins < {c0}", "bought shares")
    pg.screenshot(path=f"{out}/01_stock_bought.png")
    tap("全卖")
    tap("← 桌面")
    # minesweeper: open a cell
    box = ev("(() => { const h = __wxui.hits.filter((x) => !x.label && x.on && x.h >= 70); const b = h[6]; return b ? [b.x + b.w/2, b.y + b.h/2] : null })()")
    pg.mouse.click(*box); pg.wait_for_timeout(400)
    cells = ev("__wxui.hits.filter((x) => !x.label && x.on && x.w > 20 && x.w < 50 && Math.abs(x.w - x.h) < 2).length")
    box = ev("(() => { const h = __wxui.hits.filter((x) => !x.label && x.on && x.w > 20 && x.w < 50 && Math.abs(x.w - x.h) < 2); const b = h[40]; return b ? [b.x + b.w/2, b.y + b.h/2] : null })()")
    if box: pg.mouse.click(*box); pg.wait_for_timeout(400)
    else: fails.append(f"no sweep cell ({cells})")
    pg.screenshot(path=f"{out}/02_sweep.png")
    tap("起身")
    check("!__game.panel", "left the desk")
    # selling on the board
    ev("__game.open({ kind: 'board' })"); tap("我要卖货")
    tap("+10", 0); tap("挂单")
    check("__game.orders.some((o) => o.mine && o.kind === 'sell')", "posted a sell order")
    pg.screenshot(path=f"{out}/03_sell.png")
    tap("撤单")
    ev("__game.close()")
    # the bag: swap two cells
    ev("__game.open({ kind: 'bag' })"); pg.wait_for_timeout(400)
    a = ev("JSON.stringify(__game.slots().slice(0,2))")
    cells = ev("(() => { const hs = __wxui.hits; const k = hs.findIndex((x) => x.w >= innerWidth && x.h >= innerHeight); return hs.slice(k + 1).filter((x) => !x.label && x.on && Math.abs(x.w - x.h) < 2 && x.w > 30).map((b) => [b.x + b.w/2, b.y + b.h/2]) })()")
    pg.mouse.click(*cells[0]); pg.wait_for_timeout(300)
    cells = ev("(() => { const hs = __wxui.hits; const k = hs.findIndex((x) => x.w >= innerWidth && x.h >= innerHeight); return hs.slice(k + 1).filter((x) => !x.label && x.on && Math.abs(x.w - x.h) < 2 && x.w > 30).map((b) => [b.x + b.w/2, b.y + b.h/2]) })()")
    pg.mouse.click(*cells[1]); pg.wait_for_timeout(300)
    bb = ev("JSON.stringify(__game.slots().slice(0,2))")
    if a == bb: fails.append("bag swap did nothing")
    pg.screenshot(path=f"{out}/04_bag.png")
    ev("__game.close()")
    # cooking
    ev("__game.open({ kind: 'cook' })"); tap("做"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/05_cook.png"); ev("__game.close()")
    # scrolling a long window
    ev("__game.open({ kind: 'journal' })"); tap("图鉴")
    pg.wait_for_timeout(300)
    pg.mouse.move(195, 600); pg.mouse.down(); pg.mouse.move(195, 400, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{out}/06_journal_scrolled.png")
    ev("__game.close()")
    # settings: volume step, rename shows a modal (absent in the harness)
    ev("__game.open({ kind: 'settings' })"); v0 = ev("__game.save.settings ? __game.save.settings.music : 0.5")
    tap("+", 0)
    check(f"__game.save.settings && __game.save.settings.music > {v0}", "music louder")
    ev("__game.close()")
    # photo mode: shoot
    tap("拍"); tap("拍下"); check("JSON.parse(localStorage.getItem('wx-album') || '[]').length > 0", "photo kept")
    tap("退出")
    # pinch: zoom
    z0 = ev("__game.islandZoom")
    print("errors:", errors[-10:] or "none")
    print("fails:", fails or "none")
    b.close()
