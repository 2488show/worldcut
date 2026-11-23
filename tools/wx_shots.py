# Screenshots for the WeChat review form: the real game UI on a phone-sized screen, in Chinese.
#   python3 tools/wx_shots.py <out-dir>        (CHROME=/path/to/chrome; run `npm run build` first)
import sys, os, pathlib
from playwright.sync_api import sync_playwright

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
URL = (pathlib.Path(__file__).resolve().parent.parent / "dist" / "index.html").as_uri() + "?lang=zh"
CHROME = os.environ.get("CHROME")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    ev = pg.evaluate
    def shot(name, wait=900):
        pg.wait_for_timeout(wait)
        pg.screenshot(path=f"{out}/{name}.png")
        print("shot", name)
    def tap_text(t):
        loc = pg.get_by_text(t, exact=True).first
        loc.wait_for(timeout=8000); loc.tap()
    pg.goto(URL)
    pg.wait_for_function("window.__game && document.querySelector('.title')", timeout=30000)
    shot("01_title", 2500)
    pg.locator(".title .btn").first.tap()
    pg.wait_for_selector(".lookmaker", timeout=8000)
    tap_text("就是我了")
    tap_text("上岛")
    pg.wait_for_timeout(1500)
    # a player some way in: a level-4 island, coins, a few things bought (all through the game's own calls)
    ev("""(() => { const g = __game; g.save.coins = 12860; g.save.level = 4;
        if (g.save.island.tier < 2) { g.save.island.tier = 2; g.remake(false) }
        g.house.growTo(3); g.save.day = 0.3; g.close(); g.changed && g.changed() })()""")
    shot("02_island", 2500)
    ev("__game.open({ kind: 'board' })"); shot("03_orders", 1200); ev("__game.close()")
    ev("__game.open({ kind: 'workbench' })"); shot("04_workbench", 1200); ev("__game.close()")
    ev("__game.open({ kind: 'pc', app: 'stocks' })"); shot("05_stocks", 1500); ev("__game.close()")
    ev("__game.open({ kind: 'house' })"); shot("07_house_notebook", 1500); ev("__game.close()")
    ev("__game.open({ kind: 'hangar' })"); shot("08_hangar", 1200); ev("__game.close()")
    ev("__game.open({ kind: 'furnace' })"); shot("12_furnace", 1200); ev("__game.close()")
    ev("__game.open({ kind: 'cook' })"); shot("13_cook", 1200); ev("__game.close()")
    ev("__game.house.enter && __game.house.enter()"); shot("09_indoors", 6000)
    b.close()
