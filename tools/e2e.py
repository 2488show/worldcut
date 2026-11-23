# End-to-end run of the built page in headless Chrome: real clicks and key presses.
#   python3 tools/e2e.py <out-dir> [desktop|phone]        (CHROME=/path/to/chrome to use an installed browser)
import sys, json, time, os, pathlib
from playwright.sync_api import sync_playwright

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/e2e"
profile = sys.argv[2] if len(sys.argv) > 2 else "desktop"
URL = (pathlib.Path(__file__).resolve().parent.parent / "dist" / "index.html").as_uri() + "?lang=zh"  # run `npm run build` first; the checks read the Chinese text
CHROME = os.environ.get("CHROME")  # path to a Chrome binary; unset = Playwright's own Chromium

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        if profile == "phone":
            ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        else:
            ctx = b.new_context(viewport={"width": 1280, "height": 800})
        pg = ctx.new_page()
        cdp = ctx.new_cdp_session(pg)
        logs = []
        pg.on("console", lambda m: logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)))
        pg.goto(URL)
        pg.wait_for_function("window.__game && document.querySelector('.title')", timeout=20000)
        n = [0]
        def shot(name):
            n[0] += 1
            pg.screenshot(path=f"{out}/{profile}-{n[0]:02d}-{name}.png")
        def ev(js):
            return pg.evaluate(js)
        def ok(cond, msg):
            print(("  ok: " if cond else "FAIL: ") + msg)
            if not cond:
                shot("FAIL"); print("\n".join(logs[-10:])); sys.exit(1)
        def tap(x, y):
            if profile == "phone": pg.touchscreen.tap(x, y)
            else: pg.mouse.click(x, y)
        def tap_world(x, y, z):
            pos = ev(f"""(() => {{ const g = window.__game; const s = g.scene.projectPoint({x}, {y}, {z});
                const c = document.querySelector('.stage-canvas'); const r = c.getBoundingClientRect(); const k = r.width / c.width;
                return s ? [r.left + s.x * k, r.top + s.y * k] : null }})()""")
            assert pos, "point not on screen"
            tap(pos[0], pos[1])
        def near(x, y, dy=18):
            # walk the pilot to just south of a thing, so it is in the middle of the screen and clear of the HUD
            ev(f"__game.walkTo({{x: {x}, y: {y} + {dy}}}, 2, null)")
            pg.wait_for_function("!__game.path", timeout=40000)
            pg.wait_for_timeout(700)
        def click_text(text, nth=0):
            loc = pg.get_by_text(text, exact=True).nth(nth)
            loc.wait_for(timeout=8000)
            if profile == "phone": loc.tap()
            else: loc.click()
        def wait(js, timeout=30000):
            try:
                pg.wait_for_function(js, timeout=timeout)
            except Exception:
                # say what the game was doing, so a failure can be read without re-running
                print("  STUCK waiting for:", js)
                print("  state:", ev("(() => { const g = __game; return { mode: g.mode, panel: g.panel && g.panel.kind, gather: g.gather && { hits: g.gather.hits, need: g.gather.need, kind: g.gather.node.kind }, path: !!g.path, toasts: g.toasts.map((t) => t.text), quest: g.quest().title, placing: g.placingItem, day: g.dayPhase(), used: g.used(), cap: g.capacity(), inv: g.save.inv, mine: g.mine.active } })()"))
                raise

        def gone(sel, timeout=9000):
            pg.wait_for_selector(sel, state="detached", timeout=timeout)
        def use(kind, panel):
            b = ev(f"(() => {{ const b = __game.here.buildings.find((x) => x.kind === '{kind}'); return [b.door.x, b.door.y, b.x, b.y, b.base, b.rise] }})()")
            ev(f"__game.walkTo({{x: {b[0]}, y: {b[1]}}}, 3, null)")
            wait("!__game.path", 60000)
            pg.wait_for_timeout(500)
            # (a cat or a butterfly may wander in front and take the tap: then tap again)
            for i in range(3):
                tap_world(b[2], b[3], b[4] + min(6, b[5] * 0.5))
                try:
                    pg.wait_for_function(f"__game.panel && __game.panel.kind === '{panel}'", timeout=8000)
                    return
                except Exception:
                    ev("__game.close()")
                    ev(f"__game.walkTo({{x: {b[0]}, y: {b[1]}}}, 3, null)"); wait("!__game.path", 60000); pg.wait_for_timeout(1200)
            wait(f"__game.panel && __game.panel.kind === '{panel}'", 15000)

        pg.wait_for_selector(".title .btn", timeout=20000)
        shot("title")
        (pg.locator(".title .btn").first.tap() if profile == "phone" else pg.locator(".title .btn").first.click())
        gone(".title")
        # a new game starts by making the player
        pg.wait_for_selector(".lookmaker", timeout=8000)
        click_text("长发")
        click_text("草帽")
        pg.wait_for_timeout(300); shot("lookmaker")
        click_text("就是我了")
        ok(ev("__game.save.look && __game.save.look.hair") == "long" and ev("__game.scene.models.pilot.H") >= 15, "made the player: long hair, a straw hat")
        shot("welcome")
        click_text("上岛")
        pg.wait_for_timeout(1800)
        shot("island-tilted")
        # the journal and the menu open and close
        hit = (lambda sel: pg.locator(sel).first.tap()) if profile == "phone" else (lambda sel: pg.locator(sel).first.click())
        # round 15: the island's level by its name opens the island notebook
        hit(".isle-lv"); wait("__game.panel && __game.panel.kind === 'house'", 3000)
        ok(pg.locator(".book.notebook").count() == 1, "the island level button opens the island notebook")
        hit(".book-x"); wait("!__game.panel")
        hit("[data-fx=journal]")
        wait("__game.panel && __game.panel.kind === 'journal'")
        ok("第一章" in pg.locator(".book .page").inner_text(), "the journal is a diary; its first page is the first chapter")
        shot("journal")
        hit(".book-marks .mark[title=岛与岛主]"); pg.wait_for_timeout(500); shot("journal-islands")
        ok("石峰岛" in pg.locator(".book .page").inner_text() and "彼岸" not in pg.locator(".book .page").inner_text(), "the islanders are listed; the far shore is not on the chart yet")
        hit(".book-marks .mark:nth-child(4)"); pg.wait_for_timeout(500); shot("journal-codex")
        hit(".book .corner[aria-label=上一页]"); pg.wait_for_timeout(200); hit(".book .corner[aria-label=上一页]"); pg.wait_for_timeout(500); shot("journal-skills")
        ok(pg.locator(".skill").count() == 5, "round 9: the journal lists the five skills (turned back with the corner arrow)")
        hit(".book-marks .mark[title=鱼]"); pg.wait_for_timeout(500)
        ok(pg.locator(".fb-card").count() == 14, "round 11: the fish book is the diary's last page")
        hit(".book-x"); wait("!__game.panel")
        hit(".hud-menu .btn[title=菜单]")
        wait("__game.panel && __game.panel.kind === 'settings'")
        ok("单机" in pg.locator(".sheet").inner_text(), "the menu says the game is single-player here")
        shot("menu")
        hit(".sheet .x"); wait("!__game.panel")
        # round 9: the first letter is waiting in the mailbox by the door
        ok(pg.locator(".mail-btn").count() == 1, "a letter waiting: the badge on the HUD")
        mb = ev("[__game.mail.box.x, __game.mail.box.y, __game.mail.box.z]")
        # stand by the mailbox on the side away from the house (south of it may be indoors now)
        def near_box():
            ev(f"(() => {{ const g = __game; for (const [dx, dy] of [[0, 18], [18, 0], [-18, 0], [0, -18]]) {{ const x = {mb[0]} + dx, y = {mb[1]} + dy; if (!g.house.inWalls(x, y) && !g.world.solidAt(x, y)) {{ g.walkTo({{ x, y }}, 2, null); return }} }} }})()")
            pg.wait_for_function("!__game.path", timeout=40000)
            pg.wait_for_timeout(700)
        near_box()
        for i in range(3):
            tap_world(mb[0], mb[1], mb[2] + 8)
            try:
                pg.wait_for_function("__game.panel && __game.panel.kind === 'mail'", timeout=8000)
                break
            except Exception:
                ev("__game.close()"); near_box()
        wait("__game.panel && __game.panel.kind === 'mail'", 8000)
        shot("mailbox")
        hit(".mail-row")
        pg.wait_for_selector(".mail-read", timeout=3000); shot("letter")
        berries = ev("__game.count('berry')")
        hit(".mail-attach button")
        ok(ev("__game.count('berry')") == berries + 3 and ev("__game.mail.unread") == 0, "opened the letter and took the berries that came with it")
        hit(".sheet .x"); wait("!__game.panel")
        pg.wait_for_timeout(300)
        ok(pg.locator(".mail-btn").count() == 0 and ev("__game.mail.box.model.name") == "mailbox", "all read: the badge goes, the flag comes down")
        shot("mailbox-read")

        fps = ev("new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 1500 ? requestAnimationFrame(f) : r(n / 1.5) }; requestAnimationFrame(f) })")
        print("  fps", round(fps), " frame", ev("[__game.scene.width, __game.scene.height]"))
        ok(fps > 25, "the island draws at a playable rate (%d fps under software rendering)" % fps)

        # the view: Space on a keyboard, the button on a phone
        ok(ev("__game.view3d") is True, "the island opens in the tilted view")
        if profile == "phone":  # round 18: the view lives in the settings window
            hit(".btn.round[title=菜单]"); pg.wait_for_timeout(300); click_text("换成俯视"); ev("__game.close()")
        else: pg.keyboard.press("Space")
        pg.wait_for_timeout(1300)
        ok(ev("__game.view3d") is False, "the view key switches to the overhead view")
        shot("island-overhead")
        if profile == "phone":
            hit(".btn.round[title=菜单]"); pg.wait_for_timeout(300); click_text("换成斜视"); ev("__game.close()")
        else: pg.keyboard.press("Space")
        pg.wait_for_timeout(900)
        if profile != "phone":
            pg.keyboard.press("e"); pg.wait_for_timeout(900)
            ok(abs(ev("__game.camYaw")) > 0.5, "E turns the camera")
            shot("island-turned")
            pg.keyboard.press("q"); pg.wait_for_timeout(1500)

        # pick something up with a real tap: the nearest stick or pebble
        n0 = ev("(() => { const g = __game, p = g.pilot; const n = g.here.nodes.filter((x) => (x.kind === 'stick' || x.kind === 'pebble' || x.kind === 'flax') && !x.depleted).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return [n.x, n.y, n.base] })()")
        ev(f"__game.walkTo({{x: {n0[0]}, y: {n0[1]} + 14}}, 2, null)")
        wait("!__game.path", 60000); pg.wait_for_timeout(500)
        for attempt in range(4):
            tap_world(n0[0], n0[1], n0[2] + 1)
            try:
                wait("Object.values(__game.save.inv).some((v) => v > 0)", 7000); break
            except Exception:
                if attempt == 3: raise
                pg.wait_for_timeout(600)
        ok(True, "tapped something on the ground and picked it up: " + json.dumps(ev("__game.save.inv")))
        # the bag: hover (or a long press) names the thing
        slot = pg.locator(".slot").first
        if profile == "phone":
            box = slot.bounding_box()
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": box["x"] + 10, "y": box["y"] + 10}]})
            pg.wait_for_timeout(600)
            pg.wait_for_selector(".tip", timeout=3000)
            shot("tooltip")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        else:
            slot.hover(); pg.wait_for_selector(".tip", timeout=3000); shot("tooltip"); pg.mouse.move(600, 300)
        ok(True, "the bag names its things: " + pg.locator(".tip b").first.inner_text() if pg.locator(".tip b").count() else "tooltip shown")

        # tools at the workbench, with real taps on the building and the buttons
        ev("__game.devGive(); __game.close(); __game.save.inv.pack2 = 1; __game.save.inv.stoneAxe = 0; __game.save.inv.stonePick = 0; __game.save.inv.stick = 6; __game.save.inv.pebble = 6")
        pg.wait_for_timeout(1200)
        use("workbench", "workbench")
        click_text("做 1", 0)
        pg.wait_for_timeout(350); shot("crafting")
        wait("__game.count('stoneAxe') === 1", 8000)
        ok(True, "made a stone axe at the workbench (a few hammer blows)")
        click_text("做 1", 0)
        wait("__game.count('stonePick') === 1", 8000)
        st = ev("__audio.ctx && __audio.ctx.state")
        loud = 0
        for _ in range(12):
            loud = max(loud, ev("__audio.level()")); pg.wait_for_timeout(120)
        ok(st == "running" and loud > 0.002, "audio is running and audible (state %s, level %.3f, scene %s)" % (st, loud, ev("__audio.currentScene")))
        click_text("家具"); pg.wait_for_timeout(200); shot("workbench-furniture")
        ev("__game.close()")

        # fell a tree with real taps
        t0 = ev("(() => { const g = __game, p = g.pilot; const n = g.here.nodes.filter((x) => ['oak1','oak2','apple2','birch2'].includes(x.kind) && !x.depleted).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return [n.x, n.y, n.base, n.id] })()")
        ev(f"__game.walkTo({{x: {t0[0]}, y: {t0[1]} + 16}}, 2, null)")
        wait("!__game.path", 60000); pg.wait_for_timeout(500)
        wood = ev("__game.count('wood')")
        # (a stick lying under the tree may be what the first tap picks up: then tap the tree again)
        for attempt in range(4):
            tap_world(t0[0], t0[1], t0[2] + 12)
            try:
                wait("__game.gather && __game.gather.hits >= 2 && __game.gather.need > 2", 9000); break
            except Exception:
                if attempt == 3: raise
        shot("chopping")
        wait(f"__game.count('wood') > {wood}", 30000)
        pg.wait_for_timeout(300); shot("felled")
        ok(True, "felled a tree: blows, the fall, logs to the bag")

        # the mine
        ev("__game.mine.enter(1)")
        pg.wait_for_timeout(900); shot("mine")
        ok(ev("__audio.currentScene") == "mine", "the music follows the pilot down the mine")
        c = ev("(() => { const m = __game.mine; let best = -1, bd = 1e9; for (let c = 0; c < m.type.length; c++) { if (m.type[c] !== 1 || !m.exposed(c)) continue; const q = m.centre(c); const d = Math.hypot(q.x - __game.pilot.x, q.y - __game.pilot.y); if (d < bd) { bd = d; best = c } } const q = m.centre(best); return [q.x, q.y] })()")
        tap_world(c[0], c[1], 10)
        wait("__game.mine.save.dug > 0", 20000)
        pg.wait_for_timeout(300); shot("mine-dug")
        ok(True, "dug a block out of the mine with a tap")
        (pg.locator(".banner .btn").first.tap() if profile == "phone" else pg.locator(".banner .btn").first.click())
        wait("__game.onSurface", 5000)

        # a line in the water
        pier = ev("(() => { const b = __game.here.buildings.find((x) => x.kind === 'pier'); return [b.door.x, b.door.y, b.x, b.y] })()")
        ev(f"__game.walkTo({{x: {pier[0]}, y: {pier[1]}}}, 2, null)")
        wait("!__game.path", 60000); pg.wait_for_timeout(400)
        # round 13: the tackle box — a worm on the hook before casting
        ev("(() => { const g = __game; g.save.inv.worm = 3; g.changed(); for (let i = 0; i < 8; i++) { if (g.heldItem() === 'rod') break; g.hold(i) } })()")
        pg.wait_for_selector(".tackle-btn", timeout=3000)
        hit(".tackle-btn"); pg.wait_for_selector(".tackle", timeout=3000)
        pg.locator(".tb-cell[aria-label=蚯蚓]").click(); pg.locator("button", has_text="用这个").click()
        pg.wait_for_timeout(200); shot("tackle-box")
        ok(ev("__game.tackle.on") == "worm", "the tackle box: a worm on the hook")
        hit(".tb-x"); wait("!__game.panel", 3000)
        ev(f"__game.fishing.cast({pier[0]} + ({pier[0]} - {pier[2]}) * 1.4, {pier[1]} + ({pier[1]} - {pier[3]}) * 1.4)")
        wait("__game.fishing.phase === 'wait'", 8000)
        pg.wait_for_selector(".gauge-panel", timeout=3000); shot("fishing-wait")
        # the strike has to come within a second of the bite: press the button the moment it appears
        hooked = ev("new Promise(r => { const t = setInterval(() => { const b = document.querySelector('.gauge-panel.bite .big-btn'); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); clearInterval(t); r(true) } else if (!__game.fishing.active) { clearInterval(t); r(false) } }, 30) })")
        ok(hooked and ev("__game.fishing.phase") == "reel", "cast, got a bite, struck with the button: the fight is on")
        pg.wait_for_timeout(250); shot("fishing-reel")
        ev("window.__reel = setInterval(() => { const f = __game.fishing; if (f.phase === 'reel') f.hold(!f.surging && f.tension < 0.6) }, 50)")
        wait("!__game.fishing.active", 90000); ev("clearInterval(window.__reel)")
        print("  fished:", ev("__game.save.stats.fished || 0"))

        # under water
        ev("__game.dive.enter()")
        pg.wait_for_timeout(1200); shot("dive")
        ok(pg.locator(".gauge-panel").count() == 1 and ev("__audio.currentScene") == "water", "under water: the air gauge shows, the music changes")
        ok(pg.locator("canvas.diveview").count() == 1 and pg.locator(".dive-depth").count() == 1, "the dive is side-on, with the depth band shown")
        # aim at the nearest fish and shoot, with a real tap on the view
        fish = ev("(() => { const d = __game.dive; const c = d.cam; const f = d.fish.slice().sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0]; return f ? [f.x - c.x, f.y - c.y] : null })()")
        if fish:
            box = pg.locator("canvas.diveview").bounding_box()
            sc = max(box["width"] / 320, box["height"] / 180)
            ox = (box["width"] - 320 * sc) / 2; oy = (box["height"] - 180 * sc) / 2
            pg.mouse.click(box["x"] + ox + fish[0] * sc, box["y"] + oy + fish[1] * sc)
            pg.wait_for_timeout(500); shot("dive-shot")
            print("  dive catch:", ev("__game.dive.count"))
        click_text("上浮")
        wait("__game.onSurface", 5000)

        # the house: the island itself
        ev("__game.open({ kind: 'house' })"); pg.wait_for_timeout(300); shot("house")
        ok(pg.get_by_text("炸岛重开").count() == 1, "the house's desk offers the island's upgrade and the re-roll")
        ev("__game.close()")

        # round 16: a new game's house is the log cabin, one room: in through its door, then grown to the cottage
        ok(ev("__game.house.tier") == 0 and ev("__game.save.home.pieces.some((p) => p.item === 'woodStove')"), "a new game starts in the log cabin, with its little stove")
        ev("(() => { const g = __game; const h = g.here.buildings.find((b) => b.kind === 'house'); g.pilot.x = h.door.x; g.pilot.y = h.door.y + 0; g.use(h) })()")
        wait("__game.house.active", 6000)
        pg.wait_for_timeout(700); shot("cabin")
        ok(pg.get_by_text("小屋").count() >= 1 and ev("(() => { const h = __game.house; const w = h.toWorld(26, 19); return Math.hypot(__game.pilot.x - w.x, __game.pilot.y - w.y) < 40 })()"), "inside the cabin: the rooms are a place of their own")
        ev("__game.house.exit(); __game.house.growTo(1); __game.close()")
        pg.wait_for_timeout(500); shot("cottage-outside")
        # round 7: inside the house — rooms, decorating, the stove, eating, a night's sleep
        ev("(() => { const g = __game; const h = g.here.buildings.find((b) => b.kind === 'house'); g.pilot.x = h.door.x; g.pilot.y = h.door.y; g.use(h) })()")
        wait("__game.house.active", 6000)
        pg.wait_for_timeout(700); shot("inside")
        ok(ev("__game.save.home.pieces.length") >= 15 and pg.get_by_text("卫生间").count() >= 1, "inside the house: five rooms, furnished")
        # round 14: whichever way the island turned the house, the camera looks in over the front sill; the windows are gaps
        ok(ev("(() => { const g = __game, h = g.house; const f = h.toWorld(44, 62), b = h.toWorld(44, 0); const d = Math.hypot(b.x - f.x, b.y - f.y); return Math.abs(-Math.sin(g.camYaw) - (b.x - f.x) / d) < 1e-3 && Math.abs(-Math.cos(g.camYaw) - (b.y - f.y) / d) < 1e-3 })()"), "indoors the camera looks in over the front sill, at the back wall")
        ok(ev("(() => { const g = __game, h = g.house; const w = h.toWorld(11, -2), s = h.toWorld(26, -2); return g.world.heightAt(w.x, w.y) < g.world.heightAt(s.x, s.y) - 8 })()"), "the bedroom window is a real opening in the wall")
        pg.locator(".housebar button", has_text="装修").click()
        ok(pg.locator(".tray .tray-cell").count() >= 1 or pg.locator(".tray-empty").count() == 1, "decorating: the tray of furniture replaces the hotbar")
        # the round-11 bug: pick a piece up, change your mind — it must go back where it was, not vanish
        n0 = ev("__game.save.home.pieces.length")
        ev("__game.house.pickUp(__game.save.home.pieces.find((p) => p.item === 'pottedPlant'))")
        pg.locator(".placebar button[title=放回原处]").click()
        ok(ev("__game.save.home.pieces.length") == n0 and ev("__game.placingItem") is None and ev("!__game.save.home.pieces.some((p) => p.lifted)"), "picked up and cancelled: the piece is back in its place")
        ev("__game.house.pickUp(__game.save.home.pieces.find((p) => p.item === 'pottedPlant'))")
        ev("(() => { const g = __game; g.freePlace = true; const w = g.house.toWorld(36, 44); g.aimAt(w.x, w.y) })()")
        pg.wait_for_timeout(300); shot("decorating")
        ok(ev("__game.ghost && __game.ghost.ok") and pg.locator(".placebar.ok").count() == 1, "decorating: a piece picked up shows green where it fits")
        if profile == "phone":
            click_text("放这里")
        else:
            ev("__game.placeHere()")
        ok(ev("__game.placingItem") is None and ev("__game.save.home.pieces.some((p) => p.item === 'pottedPlant' && p.y === 44)"), "set down again where it was aimed")
        ev("__game.freePlace = false")
        pg.locator(".housebar button", has_text="完成").click()
        ev("Object.assign(__game.save.store, { wheat: 3 }); __game.open({ kind: 'cook' })")
        pg.wait_for_timeout(300); shot("cook")
        pg.locator(".row.recipe", has_text="面包").locator("button").click()
        pg.wait_for_function("__game.count('bread') == 1", timeout=5000)  # round 19: a moment in the pan
        ok(ev("__game.count('bread')") == 1, "cooked bread at the stove")
        ev("__game.close(); __game.save.energy = 30; __game.toHotbar('bread')")
        pg.wait_for_timeout(200)
        click_text("吃面包")
        pg.wait_for_function("__game.count('bread') == 0", timeout=20000)  # round 19: walks to the table and sits down to it
        ok(ev("!!__game.sitting"), "sat down at the table to eat")
        pg.wait_for_timeout(600); shot("meal")
        pg.wait_for_function("!__game.acts.active", timeout=8000)
        ok(ev("__game.body.energy") > 30 and ev("__game.count('bread')") == 0, "ate it: strength back (%d)" % ev("Math.round(__game.body.energy)"))
        ev("(() => { const g = __game; g.save.day = 0.72; const bed = g.house.toWorld(9, 6); g.body.goToBed({ x: bed.x, y: bed.y, z: 4 }) })()")
        wait("__game.panel && __game.panel.kind === 'night'", 6000)
        pg.wait_for_timeout(400); shot("night")
        ok(pg.get_by_text("起床").count() == 1, "to bed: the day's summary")
        click_text("起床")
        ok(ev("__game.save.day") < 0.05 and ev("Math.round(__game.body.energy)") == 100, "the next morning, rested")
        # round 8: lie on the bed while it rains — the window, the rain on the roof, the fire
        ev("__game.weather.force('rain', 120)")
        ev("(() => { const h = __game.house; const e = h.actors.find((x) => x.piece.item === 'bed'); h.goUse(e) })()")
        wait("__game.panel && __game.panel.kind === 'bed'", 8000)
        pg.locator("button", has_text="躺一会儿").first.click()
        wait("__game.house.resting", 3000)
        pg.wait_for_timeout(3500); shot("rest-rain")
        ok(ev("__audio.currentScene") == "rest" and pg.locator(".rest").count() == 1, "lying down in the rain: the low camera toward the window, and the resting music")
        ok(ev("(() => { const g = __game, h = g.house; const w = h.toWorld(10, 28); return g.world.heightAt(w.x, w.y) <= h.fz + 0.5 && !!h.dryBox() })()"), "in bed: the wall before the camera is let down, and the rain stays outside the house")
        pg.locator(".rest button", has_text="起来").click()
        wait("!__game.house.resting", 3000)
        # round 13: the computer on the desk — its desktop, the stock market in a window
        ev("(() => { const h = __game.house; const e = h.actors.find((x) => x.piece.item === 'computer'); h.goUse(e) })()")
        wait("__game.panel && __game.panel.kind === 'pc'", 8000)
        pg.wait_for_selector(".pc-icon", timeout=4000); pg.wait_for_timeout(300); shot("computer")
        ok(pg.locator(".pc-icon").count() == 9, "the computer: nine icons on its desktop (round 20: the news)")
        pg.locator(".pc-icon", has_text="新闻").click(); pg.wait_for_timeout(400); shot("news")
        ok(pg.locator(".news-item").count() > 0, "the news app lists the morning's news")
        pg.locator(".pc-title .x").click(); pg.wait_for_timeout(200)
        pg.locator(".pc-icon", has_text="扫雷").click(); pg.wait_for_timeout(200)
        pg.locator(".sw-c").nth(30).click(); pg.wait_for_timeout(200); shot("minesweeper")
        ok(pg.locator(".sw-c.o").count() > 0, "minesweeper: the first tap opens the board")
        pg.locator(".pc-title .x").click()
        pg.locator(".pc-icon", has_text="股市").click()
        pg.wait_for_timeout(300); shot("stocks")
        coins_before = ev("__game.save.coins"); ev("__game.save.coins = Math.max(__game.save.coins, 500)")
        pg.locator(".stk-row").first.click(); pg.wait_for_timeout(200)
        pg.locator("button", has_text="买 10 股").first.click()
        pg.wait_for_timeout(200); shot("stocks-bought")
        ok(ev("__game.stocks.held('ore')") == 10, "bought ten shares at the stock machine")
        pg.locator("button", has_text="全卖").first.click(); pg.wait_for_timeout(200)
        ok(ev("__game.stocks.held('ore')") == 0, "and sold them again")
        pg.locator(".pc-leave").click(); wait("!__game.panel", 3000)
        ev(f"__game.save.coins = {coins_before}")
        pg.locator(".housebar button", has_text="出门").click()
        wait("!__game.house.active && __game.onSurface", 4000)
        # round 16: two storeys — the bedroom upstairs, its window to the sea; up the stairs and back down
        ev("__game.house.growTo(2); __game.close()")
        ok(ev("__game.save.home.pieces.some((p) => p.item === 'bed' && p.f === 1)"), "two storeys: the bed has moved upstairs")
        ev("(() => { const g = __game; const h = g.here.buildings.find((b) => b.kind === 'house'); g.pilot.x = h.door.x; g.pilot.y = h.door.y; g.use(h) })()")
        wait("__game.house.active", 6000)
        pg.wait_for_timeout(500)
        tap_world(*ev("(() => { const h = __game.house; const w = h.toWorld(27, 9); return [w.x, w.y, h.fz + 8] })()"))
        wait("__game.house.cur === 1", 15000)
        pg.wait_for_timeout(900); shot("upstairs")
        ok(pg.get_by_text("卧室").count() >= 1 and pg.get_by_text("下楼").count() >= 1, "upstairs: the bedroom, and the way down")
        ev("__game.house.climb(0)"); wait("__game.house.cur === 0", 3000)
        pg.locator(".housebar button", has_text="出门").click()
        wait("!__game.house.active && __game.onSurface", 4000)

        # round 10: a photo, kept in the album, chosen as the postcard for the next delivery
        hit(".hud-menu .btn[title=照相]")
        wait("__game.photoMode", 3000)
        pg.wait_for_timeout(300)
        pg.locator(".photo-bar .shoot").click()
        pg.wait_for_timeout(500); shot("photo-mode")
        pg.locator(".photo-top button", has_text="相册").click()
        wait("__game.panel && __game.panel.kind === 'album'", 3000)
        pg.wait_for_timeout(300); shot("album")
        hit(".album-cell")
        pg.locator("button", has_text="下次送货时寄出这张明信片").click()
        ok(ev("!!__game.postcard"), "took a photo and chose it as the next postcard")
        hit(".sheet .x"); wait("!__game.panel")

        # round 8: somebody comes over, and gets a meal at the restaurant
        ev("(() => { const g = __game; g.save.inv.restaurantKit = 1; g.startDecor('restaurantKit'); const l = g.here; for (let r = 20; r < 200; r += 4) for (let a = 0; a < 6.28; a += 0.25) { const x = Math.round(l.plaza.x + Math.cos(a) * r), y = Math.round(l.plaza.y + Math.sin(a) * r); if (g.checkPlace('restaurantKit', x, y).ok) { g.aimAt(x, y); g.placeHere(); return } } g.cancelPlacing(true) })()")
        if ev("!!__game.restaurant"):
            ev("__game.visits.come()")
            wait("__game.visits.v && __game.visits.v.phase === 'waiting'", 40000)
            ev("__game.visits.talk()"); pg.wait_for_timeout(300); shot("visitor")
            ev("Object.assign(__game.save.inv, { bread: (__game.save.inv.bread || 0) + 1 })")
            ev("__game.visits.invite('bread')")
            pg.wait_for_timeout(900); shot("treat")
            ok(pg.locator(".treat").count() == 1, "a meal together: the cutscene, with letterbox bars")
            for _ in range(10):
                if pg.locator(".treat").count() == 0: break
                pg.locator(".treat").click(); pg.wait_for_timeout(150)
            ok(pg.locator(".treat").count() == 0 and ev("__game.save.stats.treated || 0") >= 1, "the guest went home happy")
            wait("!__game.visits.v", 60000)
            # round 9: another visitor, asked into the house: the guests' corner, and stars for the house
            ev("__game.save.visitDay = -1; __game.visits.come()")
            wait("__game.visits.v && __game.visits.v.phase === 'waiting'", 40000)
            ev("__game.visits.talk()"); pg.wait_for_timeout(300)
            pg.locator("button", has_text="请到家里坐坐").first.click()
            wait("__game.house.active && __game.visits.treat", 4000)
            pg.wait_for_timeout(900); shot("parlour")
            for _ in range(10):
                if pg.locator(".treat").count() == 0: break
                pg.locator(".treat").click(); pg.wait_for_timeout(150)
            ok(ev("__game.save.stats.hosted || 0") == 1, "a visitor in the house: sat in the guests' corner and gave it %d stars" % ev("__game.save.bestStars"))
            pg.wait_for_timeout(600); shot("parlour-after")
            pg.locator(".housebar button", has_text="出门").click()
            wait("!__game.house.active && __game.onSurface", 4000)
            wait("!__game.visits.v", 60000)
        else:
            print("  (no flat ground for the restaurant near the plaza)")

        # a plane, an order, a flight
        use("hangar", "hangar")
        pg.wait_for_timeout(300); shot("hangar")
        ok(pg.locator(".ladder").count() >= 2, "the hangar shows each line of hull with its ladder of levels")
        click_text("亲手造一架", 0)
        pg.wait_for_selector(".fx-ceremony", timeout=8000); pg.wait_for_timeout(700); shot("ceremony")
        ok(ev("__game.owns('sparrow')") and ev("__game.vdef(__game.save.vehicles[0]).name") == "木架飞机", "built the first plane by hand (the kite), with its ceremony")
        gone(".fx-ceremony")
        # the paint shop: a colour, a stripe, a picture on the wing
        ev("Object.assign(__game.save.inv, { dyeRed: 2, dyeBlue: 2, dyeYellow: 2 }); __game.open({ kind: 'paint', vehicleId: __game.save.vehicles[0].id })")
        pg.wait_for_selector(".paintshop canvas.preview", timeout=5000)
        # (the first row of swatches is the picture's brush; the second the body's colour: blue)
        sw = pg.locator(".swatches").nth(1).locator("button").nth(3)
        sw.tap() if profile == "phone" else sw.click()
        click_text("双条")
        for i in (14, 15, 26, 27, 38, 39):
            cell = pg.locator(".design i").nth(i)
            cell.dispatch_event("pointerdown"); cell.dispatch_event("pointerup")
        pg.wait_for_timeout(300); shot("paintshop")
        click_text("涂上")
        pg.wait_for_timeout(300)
        ok(ev("__game.save.vehicles[0].paint && __game.save.vehicles[0].paint.stripe") == "double", "painted the plane: dyes spent, the model redrawn (%s)" % ev("__game.craftModel(__game.save.vehicles[0], false)"))
        ev("__game.close()"); pg.wait_for_timeout(900); shot("painted")
        use("board", "board")
        pg.wait_for_timeout(400); shot("board")
        ok(pg.locator(".skulls").count() == 0, "a new island's board: only the safe runs (round 21)")
        ok(pg.locator(".tag.tier").count() > 0, "each order says how big a job it is")
        click_text("接单", 0)
        wait("__game.deliveries.length === 1", 5000)
        dest = ev("__game.deliveries[0].dest")
        ev(f"(() => {{ const d = __game.deliveries[0]; __game.save.inv[d.item] = Math.max(__game.save.inv[d.item] || 0, d.qty) }})()")
        ev(f"__game.close(); __game.depart(__game.save.vehicles[0].id, '{dest}')")
        wait("__game.mode === 'flight'", 5000)
        pg.wait_for_timeout(1500); shot("takeoff")
        wait("__game.flight && __game.flight.phase === 'cruise'", 20000)
        ok(pg.locator(".chip.wind").count() == 1, "in flight: the wind and the load are on the HUD")
        if profile != "phone":
            pg.keyboard.press("Space"); pg.wait_for_timeout(1400); shot("flight-chase")
            pg.keyboard.down("Shift"); pg.wait_for_timeout(900)
            ok(ev("__game.scene.boost") > 0.5, "Shift is the thrusters now (Space changes the view)")
            pg.keyboard.up("Shift"); pg.keyboard.press("Space"); pg.keyboard.press("Space")
        else:
            click_text("视角"); pg.wait_for_timeout(1400); shot("flight-chase"); click_text("视角"); click_text("视角")
        ev("window.__auto = setInterval(() => { const h = __game.hud(); if (h && h.phase === 'cruise') __game.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false) }, 60)")
        pg.wait_for_timeout(3500); shot("flight")
        wait(f"__game.flight && __game.flight.canLand === '{dest}' && __game.hud().dist < 190", 120000)
        ev("clearInterval(window.__auto); __game.scene.setKeys(0, 0, false)")
        shot("approach")
        ok(pg.locator(".approach").count() == 1, "near the island the approach gauge shows")
        if profile == "phone": pg.locator(".btn.land").tap(force=True)
        else: pg.keyboard.press("l")
        wait("__game.mode === 'island' && __game.panel && __game.panel.kind === 'arrived'", 60000)
        pg.wait_for_timeout(700); shot("delivered")
        ok(ev("__game.save.stats.delivered") == 1 and ev("__game.save.coins") > 300, "landed, handed over, paid: %d coins" % ev("__game.save.coins"))
        ok(ev("__game.save.stats.postcards || 0") == 1 and ev("__game.postcard") is None, "the postcard went with the goods")
        gone(".fx-ceremony")
        click_text("好")

        # round 22: a sortie against the sky pirates, with the gun mount
        ev("__game.close(); __game.save.level = 5; const v = __game.save.vehicles[0]; (v.up ??= []).push('guns')")
        ev("void __game.sortie(__game.save.vehicles[0].id, 'peak')")
        wait("__game.flight && __game.flight.phase === 'cruise'", 20000)
        ok(pg.locator(".combat").count() == 1 and pg.locator(".btn.fire").count() == 1, "an armed plane: the hull, rounds and missiles, and the fire button")
        ev("window.__auto = setInterval(() => { const c = __game.combat, a = __game.scene.lead; if (!a || !c.sortie) return; const f = c.foes[0]; const t = f ? f.a : c.sortie.at; const dx = __game.world.delta(t.x, a.x), dy = __game.world.delta(t.y, a.y), h = __game.scene.heading; const b = Math.atan2(dx * Math.cos(h) - dy * Math.sin(h), -dx * Math.sin(h) - dy * Math.cos(h)); __game.scene.setKeys(Math.max(-1, Math.min(1, b * 2)), 0, false); c.fire(!!f); c.hull = Math.max(c.hull, 50) }, 60)")
        wait("__game.combat.foes.length > 0", 60000)
        pg.wait_for_timeout(2500); shot("dogfight")
        wait("__game.combat.sortie && __game.combat.sortie.downed >= 1", 60000)
        ok(pg.locator(".chip.sortie").count() == 1, "the sortie's tally is on the HUD (%s)" % pg.locator(".chip.sortie").inner_text())
        ev("clearInterval(window.__auto); __game.scene.setKeys(0, 0, false); __game.combat.clear(); void __game.comeHome('home')")
        wait("__game.mode === 'island'", 20000)
        pg.wait_for_timeout(500); ev("__game.close()")

        # the save survives a reload
        coins = ev("__game.save.coins")
        pg.reload()
        pg.wait_for_function("window.__game", timeout=20000)
        ok(ev("__game.save.coins") == coins and ev("__game.save.stats.delivered") == 1, "the save survives a reload")
        pg.wait_for_selector(".title .btn", timeout=20000)
        ok("继续" in pg.locator(".title").inner_text(), "the title offers to continue")
        pg.wait_for_timeout(800); shot("title-continue")
        (pg.locator(".title .btn").first.tap() if profile == "phone" else pg.locator(".title .btn").first.click())
        gone(".title")
        ok(ev("__game.quest().title").startswith("第二章"), "after the first delivery the second chapter is open: " + ev("__game.quest().title"))
        pg.wait_for_timeout(1500); shot("reloaded")

        bad = [l for l in logs if "AudioContext" not in l]
        ok(len(bad) == 0, "console is clean" + ("" if not bad else ": " + " | ".join(bad[:3])))
        print("ALL OK", profile)
        b.close()

main()
