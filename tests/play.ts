// Plays the game headless from an empty island, the way a player would: pick things up, make
// tools, fell a tree, dig, go down the mine, smelt, build a plane, take an order, fly it there,
// land, get paid; then fish, dive, build a boat and deliver by sea. Along the way it checks that
// every action answers with feedback (sound, things flying to the bag, a banner, a ceremony).
// Used by the test suite (tests/slice.test.ts) and by `npm run play`, which also saves screenshots.
import { Game } from '../src/game/game'
import { NODES, give, type ItemId, type NodeKind } from '../src/game/data'

export async function playSlice(
  takeShot: (g: Game, name: string) => void = () => {},
  log: (msg: string) => void = () => {},
): Promise<Game> {
  let clock = 1000
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const t0 = performance.now()
  const g = new Game({ now: () => clock, rnd, seed: 4242 })
  // strength, bedtime and visitors have tests of their own; this one is the long road
  g.body.tireless = true
  g.body.stayAwake = true
  g.visits.enabled = false
  log('game ready in ' + Math.round(performance.now() - t0) + ' ms')
  g.scene.resize(427, 267)
  const shot = (name: string) => takeShot(g, name)

  async function run(sec: number, until?: () => boolean) {
    const n = Math.ceil(sec * 30)
    for (let i = 0; i < n; i++) {
      clock += 1 / 30
      g.update(1 / 30)
      g.scene.render()
      if (i % 15 === 0) await Promise.resolve()
      if (until && until()) return true
    }
    return !until
  }
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
  function tapWorld(x: number, y: number, z: number) {
    const s = g.scene.projectPoint(x, y, z)
    if (!s) throw new Error('point not on screen')
    g.tap(s.x, s.y)
  }
  const inv = () => JSON.stringify(g.save.inv)
  function assert(ok: unknown, msg: string) {
    if (!ok) throw new Error('slice failed: ' + msg)
    log(' ✓ ' + msg)
  }
  // every piece of feedback the game sends, so each action can be checked for having some
  const fx: { t: string; name?: string; level?: number; icon?: string }[] = []
  g.onFx = (e) => fx.push(e as never)
  let mark = 0
  /** what was sent since the last call, as short names: 'sfx:chop', 'fly:wood', 'celebrate:2' … */
  function fxSince(): string[] {
    const out = fx.slice(mark).map((e) => (e.t === 'sfx' ? 'sfx:' + e.name : e.t === 'fly' ? 'fly:' + e.icon : e.t === 'celebrate' ? 'celebrate:' + e.level : e.t))
    mark = fx.length
    return out
  }
  function feedback(what: string, ...need: string[]) {
    const got = fxSince()
    for (const n of need) assert(got.includes(n), `${what} gives feedback "${n}" (got ${[...new Set(got)].join(' ')})`)
  }
  const home = () => g.layouts.home
  const count = (id: ItemId) => g.count(id)
  /** gather nodes of these kinds, nearest first, until the bag holds `want` of `item` */
  async function gather(kinds: NodeKind[], item: ItemId, want: number) {
    for (let tries = 0; tries < 40 && count(item) < want; tries++) {
      const p = g.pilot
      const n = home().nodes.filter((x) => kinds.includes(x.kind) && !x.depleted).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
      if (!n) break
      g.goGather(n)
      await run(90, () => n.depleted)
      await run(0.4)
    }
  }
  async function craft(id: string, n = 1) {
    g.craft(id, n)
    await run(n * 1.2 + 1, () => !g.craftJob)
  }
  async function walkToBuilding(kind: string) {
    const b = g.here.buildings.find((x) => x.kind === kind)!
    g.walkTo(b.door, 3, null)
    await run(80, () => Math.hypot(g.pilot.x - b.door.x, g.pilot.y - b.door.y) < 6)
    return b
  }
  /** tap a building (walking close first, so it is on screen) and wait for its panel */
  async function use(kind: string, panel: string) {
    const b = await walkToBuilding(kind)
    await run(0.4)
    // (a stray cat or a butterfly may be in front of it: then the tap goes to them — try again)
    for (let i = 0; i < 4 && g.panel?.kind !== panel; i++) {
      if (i) { g.close(); await walkToBuilding(kind); await run(1.5) }
      // (on a retry, lower down and nearer the front: whatever stands behind it is clear of that)
      tapWorld(b.x + (i ? (i % 2 ? -2 : 2) : 0), b.y + i * 2, b.base + (i ? 1 : Math.min(6, b.rise * 0.5)))
      await run(8, () => g.panel?.kind === panel)
    }
    assert(g.panel?.kind === panel, `tapping the ${kind} opens its panel`)
  }

  async function main() {
    // a new game first makes the player, then welcomes them
    assert(g.panel?.kind === 'look', 'starts by making the player')
    g.setLook(g.look)
    g.open({ kind: 'welcome' })
    assert(g.panel?.kind === 'welcome', 'then the welcome panel')
    g.close()
    await run(1.5)
    shot('01-home')
    assert(g.view3d && g.scene.islandTilted, 'the island opens in the tilted view')
    log(`island: ${home().nodes.length} nodes, ${home().buildings.length} buildings, riches ${JSON.stringify(home().def.rich)}`)
    assert(home().nodes.length >= 60, 'the island has plenty on it')
    assert(!!home().buildings.find((b) => b.kind === 'mine') && !!home().buildings.find((b) => b.kind === 'landmark'), 'the island has a mine and a landmark')

    // ── by hand: sticks, pebbles, fibre
    fxSince()
    await gather(['stick'], 'stick', 4)
    await gather(['pebble'], 'pebble', 5)
    await gather(['flax'], 'fiber', 2)
    assert(count('stick') >= 4 && count('pebble') >= 5 && count('fiber') >= 2, 'picked up sticks, pebbles and fibre by hand ' + inv())
    feedback('picking things up', 'sfx:pick', 'fly:stick', 'fly:pebble', 'sfx:step')
    // a tree will not come down without an axe
    const tree = home().nodes.find((n) => NODES[n.kind].tool === 'axe')!
    g.goGather(tree)
    feedback('trying to chop bare-handed', 'sfx:error')
    assert(g.quest().index === 1, 'the guide moved on to making tools: ' + g.quest().title)

    // ── tools at the workbench
    await use('workbench', 'workbench')
    feedback('opening a panel', 'sfx:tap', 'sfx:open')
    g.craft('stoneAxe')
    assert(count('stoneAxe') === 0 && !!g.craftJob, 'crafting takes time')
    await run(3, () => !g.craftJob)
    await craft('stonePick')
    assert(count('stoneAxe') === 1 && count('stonePick') === 1, 'made a stone axe and a stone pick')
    feedback('making a tool', 'sfx:saw', 'sfx:craft', 'sfx:done', 'fly:stoneAxe', 'celebrate:1')
    g.craft('stoneAxe')
    feedback('a refusal', 'sfx:error')
    // a backpack: eight more slots
    await gather(['flax'], 'fiber', 8)
    await gather(['stick'], 'stick', 4)
    await use('workbench', 'workbench')
    await craft('pack1')
    assert(g.capacity() === 16, 'the backpack adds a row of slots: ' + g.capacity())
    g.close()
    shot('02-tools')

    // ── an axe for trees, a pick for stone
    fxSince()
    await gather(['oak1', 'oak2', 'apple2', 'birch2'], 'wood', 6)
    assert(count('wood') >= 6, 'felled trees ' + inv())
    feedback('felling a tree', 'sfx:chop', 'sfx:creak', 'sfx:treefall', 'fly:wood')
    const old = home().nodes.find((n) => n.kind === 'oak3')
    if (old) {
      g.goGather(old)
      feedback('an old oak and a stone axe', 'sfx:error')
    }
    await gather(['boulderS', 'boulder'], 'stone', 8)
    assert(count('stone') >= 8, 'broke boulders ' + inv())
    feedback('breaking a boulder', 'sfx:mine', 'sfx:rockbreak', 'fly:stone')
    shot('03-gathered')
    // (the rest of the grind is skipped: the mechanics are proven, the bag is topped up)
    give(g.save.store!, { wood: 40, fiber: 24, stone: 12 })
    // the pockets go into the warehouse (the workbench takes from there too)
    await use('crates', 'crates')
    g.depositAll()
    g.close()
    assert(g.used() <= 3, 'emptied the pockets into the warehouse, all but the tools: ' + g.used())

    // ── the furnace
    await use('workbench', 'workbench')
    await craft('furnaceKit')
    fxSince()
    g.startPlacing('furnace')
    g.placeAtDefault()
    assert(!!g.save.furnace, 'furnace placed')
    feedback('placing the furnace', 'sfx:place', 'celebrate:1')
    await run(0.5)

    // ── down the mine for copper
    await use('mine', 'mine')
    g.mine.enter(1)
    assert(g.mine.active && g.musicScene() === 'mine', 'in the mine, with its own music')
    await run(0.5)
    shot('04-mine')
    fxSince()
    const m = g.mine as unknown as { type: Uint8Array; exposed(c: number): boolean; centre(c: number): { x: number; y: number }; ore: string[]; shown: Uint8Array }
    let revealed = 0
    for (let n = 0; n < 70 && count('copperOre') < 6; n++) {
      // the nearest block that shows copper; failing that, the nearest block of any kind
      let best = -1
      let bd = 1e9
      for (let c = 0; c < m.type.length; c++) {
        if (m.type[c] !== 1 || !m.exposed(c)) continue
        const q = m.centre(c)
        const d = Math.hypot(q.x - g.pilot.x, q.y - g.pilot.y) - (m.ore[c] === 'copper' ? 60 : m.ore[c] === 'iron' ? -200 : 0)
        if (d < bd) { bd = d; best = c }
      }
      if (best < 0) break
      const q = m.centre(best)
      const before = g.mine.save.dug
      g.scene.setCamera({ x: q.x, y: q.y, alt: 4, yaw: 0, zoom: 2, snap: true })
      g.scene.render()
      tapWorld(q.x, q.y, 10)
      await run(12, () => g.mine.save.dug > before)
      if (fx.slice(mark).some((e) => e.name === 'reveal' || e.name === 'rare')) revealed++
    }
    assert(count('copperOre') >= 6, `dug copper out of the mine (${g.mine.save.dug} blocks) ` + inv())
    feedback('digging', 'sfx:mine', 'sfx:rockbreak', 'fly:copperOre') // (plain rock gives stone too, when one is dug on the way)
    assert(revealed > 0, 'breaking rock brought hidden veins into view')
    shot('05-mine-dug')
    g.mine.exit()
    assert(g.onSurface && g.musicScene() === 'island', 'back in the daylight')

    // ── smelt, saw, weave, build
    await use('furnace', 'furnace')
    fxSince()
    g.smelt('copperIngot', 3); g.close()
    assert(g.furnaceLit(), 'the furnace is lit')
    await use('workbench', 'workbench')
    await craft('plank', 10); await craft('cloth', 5); await craft('rope', 3)
    g.close()
    await run(17, () => count('copperIngot') >= 3)
    assert(count('copperIngot') === 3, 'smelted 3 copper ingots ' + inv())
    feedback('smelting', 'sfx:whoosh', 'sfx:ding', 'fly:copperIngot', 'celebrate:1')
    await use('hangar', 'hangar')
    fxSince()
    g.buildVehicle('sparrow')
    assert(g.owns('sparrow'), 'built the Sparrow ' + inv())
    await run(0.5); shot('06-plane-stacking')
    await run(2.2); shot('07-plane-built')
    feedback('building the first plane', 'sfx:stack', 'sfx:place', 'celebrate:2')

    // ── the market
    await use('board', 'board')
    await settle()
    const order = g.orders.find((o) => o.island === 'peak' && o.kind === 'buy')!
    assert(!!order && order.item === 'plank' && order.danger === 0, `the nearest island wants planks: ${order?.qty}`)
    assert(g.orders.every((o) => o.danger === 0), 'a new island is sent only on the safe runs (round 21)')
    fxSince()
    await g.acceptOrder(order.id)
    assert(g.deliveries.length === 1, 'accepted the plank order')
    feedback('taking an order', 'sfx:stamp')
    await g.postSell('berry', Math.max(1, count('berry')), 30)
    g.close()

    // ── fly it there
    const plane = g.save.vehicles.find((v) => v.type === 'sparrow')!
    fxSince()
    g.depart(plane.id, 'peak')
    await settle()
    assert(g.mode === 'flight', 'took off')
    assert(g.musicScene() === 'flight' && g.engineSound().kind === 'plane', 'the music and the engine follow the flight')
    await run(1.2); shot('08-takeoff')
    await run(8, () => g.flight?.phase === 'cruise')
    assert(g.flight?.phase === 'cruise', 'cruising; cargo ' + g.cargoText())
    feedback('taking off', 'sfx:whoosh', 'sfx:ring')
    await fly('09-cruise')
    shot('10-approach')
    g.land()
    await run(30, () => g.mode === 'island')
    await settle(); await run(0.3); await settle()
    shot('11-delivered')
    assert(g.save.here === 'peak' && g.save.stats.delivered === 1 && g.save.coins > 0, `delivered: coins ${g.save.coins}, panel ${JSON.stringify(g.panel?.kind)}`)
    feedback('landing and handing over', 'sfx:land', 'fly:coin', 'celebrate:2')
    g.close()
    await use('board', 'board')
    await settle()
    const coins = g.save.coins
    await g.shopBuy('coal', 2)
    assert(count('coal') >= 2 && g.save.coins < coins, 'bought coal at the island shop')
    feedback('buying at a shop', 'sfx:buy', 'fly:coal')
    g.close()
    // home again
    g.depart(plane.id, 'home')
    await settle()
    await run(8, () => g.flight?.phase === 'cruise')
    await fly()
    g.land()
    await run(30, () => g.mode === 'island')
    await settle()
    assert(g.save.here === 'home', 'flew home')
    g.close()

    // ── a rod, and a fish
    give(g.save.inv, { stick: 3 })
    await use('workbench', 'workbench')
    await craft('rod')
    assert(count('rod') === 1, 'made a fishing rod')
    g.close()
    const pier = await walkToBuilding('pier')
    fxSince()
    let landed = 0
    for (let n = 0; n < 5 && landed < 1; n++) {
      g.fishing.cast(pier.door.x + (pier.door.x - pier.x) * 1.4, pier.door.y + (pier.door.y - pier.y) * 1.4)
      if (!(await run(4, () => g.fishing.phase === 'wait'))) continue
      if (n === 0) { await run(0.2); shot('12-fishing') }
      await run(16, () => g.fishing.phase === 'bite')
      if (g.fishing.phase !== 'bite') { g.fishing.hold(true); continue }
      g.press(true)
      await run(60, () => {
        const f = g.fishing
        if (f.phase !== 'reel') return true
        f.hold(!f.surging && f.tension < 0.62)
        return false
      })
      await run(2, () => !g.fishing.active)
      landed = g.save.stats.fished ?? 0
    }
    assert(landed >= 1, 'caught a fish on the rod ' + inv())
    feedback('fishing', 'sfx:swing', 'sfx:plop', 'sfx:bite', 'sfx:reel', 'sfx:splash')

    // ── under water
    await use('pier', 'pier')
    g.save.inv.harpoon = 1
    g.dive.enter()
    assert(g.dive.active && g.musicScene() === 'water', 'under water, with its own music')
    await run(1); shot('13-dive')
    fxSince()
    const d = g.dive
    for (let n = 0; n < 12 && d.active && d.oxygen > 14 && d.count < 3; n++) {
      const things: { x: number; y: number }[] = [...d.fish, ...d.things].sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))
      const a = things[0]
      if (!a) break
      const before = d.count
      let tick = 0
      await run(9, () => {
        if (!d.shot && tick++ % 6 === 0) d.tapView(a.x - d.cam.x, a.y - d.cam.y)
        return d.count > before || d.oxygen < 14
      })
    }
    const took = g.dive.count
    g.dive.surface()
    await run(0.5)
    assert(took >= 1 && g.onSurface, `came up from a dive with ${took} things ` + inv())
    feedback('diving', 'sfx:bubble', 'sfx:collect', 'sfx:splash')

    // ── a boat, and a delivery by sea
    await use('pier', 'pier')
    give(g.save.inv, { plank: 8, cloth: 3, rope: 2 })
    fxSince()
    g.buildVehicle('skiff')
    assert(g.owns('skiff'), 'built the skiff')
    await run(2.5)
    feedback('building the first boat', 'sfx:stack', 'sfx:splash', 'celebrate:2')
    await use('board', 'board')
    await settle()
    const bulk = g.orders.find((o) => o.island === 'pine' && o.kind === 'buy')!
    assert(!!bulk, 'the pine island wants something: ' + bulk?.item)
    give(g.save.inv, { [bulk.item]: bulk.qty })
    await g.acceptOrder(bulk.id)
    g.close()
    const boat = g.save.vehicles.find((v) => v.type === 'skiff')!
    g.depart(boat.id, 'pine')
    await settle()
    assert(g.musicScene() === 'sail' && g.engineSound().kind === 'boat', 'at sea, with its own music')
    await run(10, () => g.flight?.phase === 'cruise')
    await sail('pine')
    shot('14-sailing')
    g.land()
    await run(40, () => g.mode === 'island')
    await settle(); await run(0.3); await settle()
    shot('15-docked')
    assert(g.save.here === 'pine' && g.save.stats.delivered >= 2, `docked at Pine; delivered ${g.save.stats.delivered}; coins ${g.save.coins}`)
    log('quest: ' + g.quest().title)
    log('ALL OK')
  }

  /** steer the plane toward its destination until a landing is possible */
  async function fly(shotName?: string) {
    let n = 0
    await run(160, () => {
      const h = g.hud()!
      g.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false)
      if (shotName && ++n === 150) shot(shotName)
      return !!g.flight?.canLand && g.flight.canLand === g.flight.dest && h.dist < 190
    })
    g.scene.setKeys(0, 0, false)
  }
  /** sail to an island: make for the water off its pier, giving land a wide berth */
  async function sail(dest: string) {
    const lay = g.layouts[dest]
    const ok = await run(600, () => {
      const a = g.scene.lead
      const dx = g.world.delta(lay.seaward.x, a.x)
      const dy = g.world.delta(lay.seaward.y, a.y)
      const h = g.scene.heading
      const bearing = Math.atan2(dx * Math.cos(h) - dy * Math.sin(h), -dx * Math.sin(h) - dy * Math.cos(h))
      const clear = (ang: number, far: number) => {
        for (let t = 14; t <= far; t += 8) if (!g.world.isWater(Math.round(a.x + Math.sin(ang) * t), Math.round(a.y - Math.cos(ang) * t))) return false
        return true
      }
      let steer = Math.max(-1, Math.min(1, bearing * 2))
      if (!clear(a.yaw, 70)) steer = clear(a.yaw + 0.8, 70) ? 1 : -1
      else if (steer > 0.2 && !clear(a.yaw + 0.6, 60)) steer = 0
      else if (steer < -0.2 && !clear(a.yaw - 0.6, 60)) steer = 0
      g.scene.setKeys(steer, 0, Math.hypot(dx, dy) > 160 && Math.abs(bearing) < 0.5)
      return g.flight?.canLand === dest && Math.hypot(dx, dy) < 60
    })
    g.scene.setKeys(0, 0, false)
    if (!ok) throw new Error('slice failed: the boat never reached ' + dest)
  }

  await main()
  return g
}
