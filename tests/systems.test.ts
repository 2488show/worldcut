// The island's own life and the dangers of the trip: rolling the island again, setting out
// furniture, upgrading (and what moves with it), pirates on a marked route, a robbed delivery.
import { describe, expect, it } from 'vitest'
import { Game } from '../src/game/game'
import { give } from '../src/game/data'
import { makeIsland, makeWorldDef } from '../src/game/world'

function headless() {
  let clock = 1000
  let seed = 777
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const g = new Game({ now: () => clock, rnd, seed: 4242 })
  g.scene.resize(427, 267)
  const fx: string[] = []
  g.onFx = (e) => fx.push(e.t === 'sfx' ? e.name : e.t === 'celebrate' ? 'celebrate' + e.level : e.t)
  async function run(sec: number, until?: () => boolean) {
    for (let i = 0; i < Math.ceil(sec * 30); i++) {
      clock += 1 / 30
      g.update(1 / 30)
      g.scene.render() // (the view, and so the heading read-outs, are worked out when a frame is drawn)
      if (i % 15 === 0) await Promise.resolve()
      if (until && until()) return true
    }
    return !until
  }
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
  return { g, run, settle, fx }
}

/** puts a buy order for planks on the board (and the planks in the bag), so a test knows exactly what it carries */
async function order(g: Game, island: string, qty: number) {
  ;(g.backend as never as { addBuy(island: string, item: string, qty: number, now: number): void }).addBuy(island, 'plank', qty, 0)
  give(g.save.inv, { plank: qty })
  await g.refresh()
}

describe('islands', () => {
  it('the same seed gives the same island; riches always add up to the same', () => {
    const a = makeIsland({ id: 'a', name: '', owner: '', ownerModel: '', x: 0, y: 0, r: 200, biome: 'forest', seed: 99 })
    const b = makeIsland({ id: 'a', name: '', owner: '', ownerModel: '', x: 0, y: 0, r: 200, biome: 'forest', seed: 99 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (let s = 1; s < 40; s++) {
      const d = makeIsland({ id: 'a', name: '', owner: '', ownerModel: '', x: 0, y: 0, r: 200, biome: 'forest', seed: s })
      const sum = d.rich.wood + d.rich.ore + d.rich.fish
      expect(sum).toBeGreaterThan(2.9)
      expect(sum).toBeLessThan(3.1)
      for (const v of Object.values(d.rich)) { expect(v).toBeGreaterThanOrEqual(0.75); expect(v).toBeLessThanOrEqual(1.3) }
    }
  })
  it('the neighbours are at different distances and some routes are dangerous', () => {
    const def = makeWorldDef({ seed: 1, tier: 1 })
    const home = def.islands[0]
    const wrap = (v: number) => Math.min(Math.abs(v), 2048 - Math.abs(v))
    const far = def.islands.filter((d) => !d.home && !d.wild).map((d) => Math.hypot(wrap(d.x - home.x), wrap(d.y - home.y)))
    expect(Math.max(...far) / Math.min(...far)).toBeGreaterThan(1.7)
    expect(def.islands.some((d) => d.danger >= 2)).toBe(true)
    expect(def.islands.some((d) => !d.home && !d.wild && d.danger === 0)).toBe(true)
  })
})

describe('the island game', () => {
  it('re-rolls a newcomer\'s island (three times at most), sets out furniture, upgrades, and survives pirates', async () => {
    const { g, run, settle, fx } = headless()
    g.close()
    // ── blow it up and roll again
    const before = JSON.stringify(g.layouts.home.def.lobes)
    g.rerollIsland()
    expect(JSON.stringify(g.layouts.home.def.lobes)).not.toBe(before)
    expect(fx).toContain('boom')
    expect(fx).toContain('celebrate2')
    expect(g.layouts.home.nodes.length).toBeGreaterThan(50)
    g.rerollIsland(); g.rerollIsland()
    expect(g.rerollBlock()).toBeTruthy()
    const seed = g.save.island.seed
    g.rerollIsland()
    expect(g.save.island.seed).toBe(seed)

    // ── furniture and the furnace, then a bigger island
    g.devGive(); g.close()
    give(g.save.inv, { furnaceKit: 1, bench: 1, crystalLamp: 1 })
    g.startPlacing('furnace'); g.placeAtDefault()
    const lay = g.layouts.home
    // set each piece down on the first open spot in the village
    const put = (item: 'bench' | 'crystalLamp') => {
      const n = g.save.decor?.length ?? 0
      g.startDecor(item)
      for (let dy = -24; dy <= 24 && (g.save.decor?.length ?? 0) === n; dy += 6) {
        for (let dx = -36; dx <= 36 && (g.save.decor?.length ?? 0) === n; dx += 6) {
          ;(g as never as { placeFurniture(i: string, x: number, y: number): void }).placeFurniture(item, lay.plaza.x + dx, lay.plaza.y + dy)
        }
      }
    }
    put('bench'); put('crystalLamp')
    expect(g.save.decor?.length).toBe(2)
    expect(g.charmParts().outdoor).toBe(20) // (and the house adds a quarter of its own on top)
    expect(g.charm).toBe(20 + g.charmParts().house)
    expect(g.charmBonus).toBeGreaterThan(0)
    expect(g.count('bench')).toBe(0)
    expect(g.levelInfo()?.ok).toBe(false)
    g.levelUp()
    expect(g.level).toBe(1)
    // the ladder: levels 2 and 3 open the farm and pets; 4 makes the land bigger
    g.save.coins = 5000
    g.save.stats.delivered = 6
    g.levelUp()
    expect(g.level).toBe(2)
    expect(g.save.field?.plots.length).toBe(4)
    expect(g.levelInfo()?.ok).toBe(false) // harvests and creatures still to do
    g.save.stats.harvested = 4
    for (const k of ['hermitCrab', 'redCrab', 'ladybug', 'snail'] as const) (g.save.seen ??= {})[k] = true
    g.levelUp()
    expect(g.level).toBe(3)
    expect(g.save.field?.plots.length).toBe(8)
    expect(g.petSlots).toBe(1)
    g.save.pets = [{ id: 'x', sp: 'rabbit', col: 'white', from: 'home', giftAt: 0 }]
    const nodes = g.layouts.home.nodes.length
    g.levelUp()
    await run(1)
    expect(g.level).toBe(4)
    expect(g.save.island.tier).toBe(2)
    expect(g.save.coins).toBe(5000 - 150 - 400 - 900)
    expect(g.save.field?.plots.length).toBe(12)
    expect(g.layouts.home.def.r).toBe(250)
    expect(g.layouts.home.nodes.length).toBeGreaterThan(nodes * 1.3)
    expect(g.mine.depth).toBe(9)
    expect(!!g.save.furnace && g.layouts.home.buildings.some((b) => b.kind === 'furnace')).toBe(true)
    expect(g.save.decor?.length).toBe(2)
    expect(g.rerollBlock()).toBeTruthy()

    // ── a load for the far, dangerous island; the pilot does nothing about the pirates
    give(g.save.inv, { plank: 10, cloth: 4, copperIngot: 6 })
    g.buildVehicle('sparrow')
    await run(3); await settle()
    await order(g, 'dune', 6)
    const o = g.orders.find((x) => x.island === 'dune' && x.item === 'plank' && x.qty === 6)!
    expect(o.danger).toBe(3)
    await g.acceptOrder(o.id)
    const plane = g.save.vehicles[0]
    await g.depart(plane.id, 'dune'); await settle()
    await run(10, () => g.flight?.phase === 'cruise')
    ;(g.voyage as never as { pirateAt: number }).pirateAt = 0.12
    const hud = g.hud()!
    expect(hud.voyage.danger).toBe(3)
    expect(hud.voyage.load).toBeGreaterThan(0.5)
    let chased = false
    await run(220, () => {
      const h = g.hud()!
      g.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false)
      if (g.musicScene() === 'pirate') chased = true
      return !!g.flight?.canLand && g.flight.canLand === 'dune' && h.dist < 190
    })
    expect(chased).toBe(true)
    expect(fx).toContain('alarm')
    const robbed = g.voyage.robbed
    expect(robbed?.units ?? 0).toBeGreaterThan(0)
    expect(robbed!.units).toBeLessThanOrEqual(3) // 30% of six, give or take rounding: never the lot
    expect(fx).toContain('cannon')
    const coins = g.save.coins
    g.land()
    await run(40, () => g.mode === 'island'); await settle(); await run(0.3); await settle()
    expect(g.save.here).toBe('dune')
    expect(g.panel?.kind).toBe('arrived')
    // paid for what arrived: less than the full price, more than nothing
    const got = g.save.coins - coins
    expect(got).toBeGreaterThan(0)
    expect(got).toBeLessThan(o.price * 1.3)
    expect(g.save.stats.delivered).toBe(7)
  }, 120000)

  it('with a better engine a pursuer is simply outrun, and nothing is lost', async () => {
    const { g, run, settle, fx } = headless()
    g.close(); g.devGive(); g.close()
    g.save.stats.delivered = 5
    give(g.save.inv, { plank: 10, cloth: 4, copperIngot: 6 })
    g.buildVehicle('sparrow')
    await run(3); await settle()
    await order(g, 'reef', 4)
    const o = g.orders.find((x) => x.island === 'reef' && x.item === 'plank' && x.qty === 4)!
    await g.acceptOrder(o.id)
    // a supercharged engine: fast enough, even half laden, to leave them behind
    give(g.save.inv, { copperIngot: 3, ironIngot: 1 })
    g.save.coins += 200
    g.buyUpgrade(g.save.vehicles[0].id, 'engine')
    expect(g.save.vehicles[0].up).toContain('engine')
    await g.depart(g.save.vehicles[0].id, 'reef'); await settle()
    await run(10, () => g.flight?.phase === 'cruise')
    ;(g.voyage as never as { pirateAt: number }).pirateAt = 0.2
    let t = 0
    await run(240, () => {
      const h = g.hud()!
      t += 1 / 30
      const p = h.voyage.pirate
      // with a pirate about: turn tail on it and open the throttle; once it gives up, back on course
      const chased = !!p && p.phase !== 'gone'
      // where the pirate is from the plane's own nose (the read-out is relative to the screen)
      let rel = 0
      if (chased) {
        const a = g.scene.lead
        const pa = (g.voyage as never as { pirate: { a: { x: number; y: number } } }).pirate.a
        const dx = g.world.delta(pa.x, a.x)
        const dy = g.world.delta(pa.y, a.y)
        rel = Math.atan2(dx * Math.cos(a.yaw) + dy * Math.sin(a.yaw), dx * Math.sin(a.yaw) - dy * Math.cos(a.yaw))
      }
      const steer = chased ? -Math.sign(rel) * Math.min(1, (Math.PI - Math.abs(rel)) * 1.2) : Math.max(-1, Math.min(1, h.bearing * 2))
      g.scene.setKeys(steer, 0, chased)
      return !!g.flight?.canLand && g.flight.canLand === 'reef' && h.dist < 190 && !chased
    })
    expect(fx).toContain('alarm')
    expect(fx).toContain('escape')
    expect(g.voyage.robbed).toBeNull()
  }, 120000)
})
