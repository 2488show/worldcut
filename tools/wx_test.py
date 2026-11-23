# Runs the WeChat bundle in the harness on a phone-sized screen: taps through the start, opens the
# windows, takes screenshots.   python3 tools/wx_test.py <out-dir>   (CHROME=...; node tools/wx-build.mjs first)
import sys, os, pathlib
from playwright.sync_api import sync_playwright
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
URL = (pathlib.Path(__file__).resolve().parent.parent / "dist-wx" / "harness.html").as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME"), args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--allow-file-access-from-files"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    logs = []
    pg.on("console", lambda m: logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.__game", timeout=30000)
    def shot(n, w=900):
        pg.wait_for_timeout(w); pg.screenshot(path=f"{out}/{n}.png"); print("shot", n)
    def tap(x, y):
        pg.mouse.click(x, y)
    def hits():
        return pg.evaluate("0")
    shot("01_title", 2500)
    tap(195, 0.62 * 844 + 22)              # 开始
    shot("02_look", 1200)
    # the first window's button: find it by the game's panel
    for i in range(4):
        k = pg.evaluate("__game.panel && __game.panel.kind")
        print("panel", k)
        if not k: break
        # the button sits at the bottom right of the sheet's actions: tap the last hit box with an action
        box = pg.evaluate("""(() => { const h = window.__wxui.hits.filter((x) => x.on && x.w > 50 && x.w < 300); const b = h[h.length - 1]; return b ? [b.x + b.w/2, b.y + b.h/2] : null })()""")
        if not box: break
        tap(box[0], box[1]); pg.wait_for_timeout(600)
    shot("03_island", 2500)
    for kind in ["board", "workbench", "furnace", "hangar", "house", "bag"]:
        pg.evaluate(f"__game.open({{ kind: '{kind}' }})"); shot("04_" + kind, 900); pg.evaluate("__game.close()")
    # walk: tap the ground below the pilot
    tap(195, 600); shot("05_walk", 2500)
    print("\n".join(logs[-20:]))
    b.close()
