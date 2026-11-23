# Opens every window and every HUD of the WeChat build in the harness, takes a screenshot of each and
# reports page errors.   python3 tools/wx_all.py <out-dir>   (node tools/wx-build.mjs first)
import sys, os, pathlib, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
URL = (pathlib.Path(__file__).resolve().parent.parent / "dist-wx" / "harness.html").as_uri()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME"), args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.type + ": " + m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.__game", timeout=30000)
    pg.wait_for_timeout(1500)
    n = [0]
    def shot(name, w=700):
        pg.wait_for_timeout(w)
        n[0] += 1
        pg.screenshot(path=f"{out}/{n[0]:02d}_{name}.png")
    def ev(js):
        try: return pg.evaluate(js)
        except Exception as e: errors.append(f"EVAL {js[:60]}: {e}"); return None
    def tap(x, y): pg.mouse.click(x, y)
    def tap_label(text):
        """tap the button whose label matches (the ui keeps no labels: find by the game's call)"""
        pass
    shot("title", 1500)
    tap(195, 0.62 * 844 + 22)
    shot("look_first", 1200)
    # finish the look and the welcome by the game
    ev("(() => { const g = __game; g.setLook(g.look); g.open({ kind: 'welcome' }) })()"); shot("welcome")
    ev("__game.close()")
    ev("__game.devGive(); __game.devGive(); __game.save.coins += 5000; __game.changed()")
    shot("island", 1500)
    kinds = ["board", "workbench", "furnace", "hangar", "pier", "house", "bag", "crates", "mine", "journal", "settings", "ending",
             "tackle", "fishbook", "album", "guestbook", "wish", "compost", "creel", "cook", "stocks", "mail", "bed",
             "ranch", "shop", "depot", "lighthouse", "exchange"]
    for k in kinds:
        ev(f"__game.open({{ kind: '{k}' }})")
        shot("panel_" + k)
        ev("__game.close()")
    # tabs of the board
    ev("__game.open({ kind: 'board' })")
    for t in ["sell", "mine", "shop"]:
        ev(f"window.__wxtabs && (window.__wxtabs.board = '{t}')")
    ev("__game.close()")
    ev("__game.open({ kind: 'look' })"); shot("wardrobe"); ev("__game.close()")
    ev("__game.open({ kind: 'cook', restaurant: true })"); shot("restaurant"); ev("__game.close()")
    for app in ["stocks", "news", "mail", "weather", "fish", "album", "sweep", "bin"]:
        ev(f"__game.open({{ kind: 'pc', app: '{app}' }})"); shot("pc_" + app); ev("__game.close()")
    ev("__game.open({ kind: 'pc' })"); shot("pc_desk"); ev("__game.close()")
    # a vehicle: build one, then its depart and paint windows
    vid = ev("(() => { const g = __game; g.buildVehicle('sparrow'); const v = g.save.vehicles[0]; return v && v.id })()")
    if vid:
        ev(f"__game.open({{ kind: 'hangar' }})"); shot("hangar_owned"); ev("__game.close()")
        ev(f"__game.open({{ kind: 'depart', vehicleId: '{vid}' }})"); shot("depart"); ev("__game.close()")
        ev(f"__game.open({{ kind: 'paint', vehicleId: '{vid}' }})"); shot("paint"); ev("__game.close()")
    # photo mode, a photo, the album
    ev("__game.photoMode = true; __game.changed()"); shot("photo")
    ev("(() => { const g = __game; g.takePhoto() })()"); shot("photo_taken")
    ev("__game.photoMode = false; __game.open({ kind: 'album' })"); shot("album_one"); ev("__game.close()")
    # the house, decorating
    ev("__game.house.enter()"); shot("house", 1500)
    ev("__game.house.decorating = true; __game.changed()"); shot("decorating")
    ev("__game.house.decorating = false; __game.house.exit()"); shot("outside", 1500)
    # placing something
    ev("(() => { const g = __game; const id = Object.keys(g.save.inv).find((k) => g.save.inv[k] > 0 && ['bench','lamp','fence'].some((x) => k.toLowerCase().includes(x))); if (id) g.startDecor(id) })()"); shot("placing")
    ev("__game.cancelPlacing()")
    # the dive
    ev("__game.dive.enter()"); shot("dive", 1500)
    ev("__game.dive.surface()"); shot("after_dive", 1200)
    # a celebration
    ev("__game.celebrate(2, '测试里程碑', '副标题', 'plank')"); shot("ceremony", 500)
    pg.wait_for_timeout(3500)
    ev("__game.celebrate(1, '一小步', '副标题', 'plank')"); shot("banner", 400)
    # flight
    if vid:
        r = ev(f"(async () => {{ const g = __game; g.rollOut && g.rollOut('{vid}'); await g.depart('{vid}', g.destinations()[0]); return g.mode }})()")
        shot("flight", 3000)
        shot("flight2", 3000)
    print("audio ctx:", ev("!!(__audio && __audio.ctx)"))
    print("\n".join(errors[-30:]) or "no errors")
    b.close()
