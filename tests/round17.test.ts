import { describe, expect, it } from 'vitest'
import { LocalBackend, newLocalState, ORDER_LIFE } from '../src/game/backend'
import { headless } from './harness'

const NB = [
  { id: 'near', owner: 'A', dist: 300, sells: [], wants: ['plank', 'stone', 'coal'], danger: 0 },
  { id: 'risky', owner: 'B', dist: 900, sells: [], wants: ['plank', 'ironIngot', 'coal', 'stone'], danger: 3 },
  { id: 'reef', owner: 'C', dist: 700, sells: [], wants: ['coal', 'plank'], danger: 1 },
] as never

describe('round 17: the board turns over', () => {
  it('sizes new orders to the biggest hold, and keeps something safe that fits on the board', async () => {
    let seed = 5
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const b = new LocalBackend(newLocalState(), NB, rnd, () => 6)
    let took = 0
    for (let t = 0; t <= 3600; t += 5) {
      await b.poll(t)
      const open = (await b.orders()).filter((o) => o.status === 'open')
      for (const o of open) if (o.created > 0) expect(o.qty).toBeLessThanOrEqual(6)
      if (t % 60 === 0) {
        const ok = open.filter((o) => o.danger === 0 && o.qty <= 6)
        if (ok.length) { await b.accept(ok[0].id); took++ }
      }
    }
    // a careful new player (safe routes only, a 6-slot plane) finds work most minutes, not three times an hour
    expect(took).toBeGreaterThan(25)
  })
  it('takes down orders nobody wanted', async () => {
    const b = new LocalBackend(newLocalState(), NB, () => 0.5, () => 20)
    const first = (await b.orders()).map((o) => o.id)
    await b.poll(10)
    await b.poll(10 + ORDER_LIFE + 1)
    const still = (await b.orders()).map((o) => o.id)
    for (const id of first) expect(still).not.toContain(id)
  })
  it('will not let the player take an order no vehicle could carry', async () => {
    const { g, settle } = headless()
    g.save.vehicles = [{ id: 'v9', type: 'sparrow', lv: 1, at: 'home' } as never]
    expect(g.maxHold()).toBe(6)
    const big = { id: 'big', kind: 'buy', by: 'x', island: 'peak', item: 'plank', qty: 9, price: 10, status: 'open', mine: false, created: 0, danger: 0 } as const
    g.orders = [big]
    await g.acceptOrder('big'); await settle()
    expect(g.deliveries.length).toBe(0)
    expect(g.orderBlock(big)).toContain('6')
  })
  it('lets the restaurant go down beside the furnace', () => {
    const { g } = headless()
    g.save.furnace = { x: 1, y: 1 } as never
    g.save.inv.restaurantKit = 1
    g.startDecor('restaurantKit')
    expect(g.placingItem).toBe('restaurantKit')
  })
})

import { HULLS, VEHICLE_ORDER, give } from '../src/game/data'
import { craftModel } from '../src/engine/craft'

describe('round 17: ten levels of planes and boats', () => {
  it('has every level in the game, each with its own model', () => {
    for (const kind of ['plane', 'boat'] as const) {
      const lv = Object.values(HULLS).filter((h) => h.kind === kind).flatMap((h) => h.levels)
      expect(lv.map((l) => l.lv).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(lv.some((l) => l.planned)).toBe(false)
      // the hold only grows (the cargo line's whole point)
      const holds = [...lv].sort((a, b) => a.lv - b.lv).map((l) => l.cargo)
      for (let i = 1; i < holds.length; i++) expect(holds[i]).toBeGreaterThan(holds[i - 1])
      for (const l of lv) expect(craftModel(l.model, 'x', undefined, 0, true) ?? l.model === 'sparrow').toBeTruthy()
    }
    expect(VEHICLE_ORDER.length).toBe(8)
  })
  it('the airship takes a plane along in its cradle', async () => {
    const { g, run, flyTo } = headless()
    g.save.level = 10
    give(g.save.inv, { cloth: 60, rope: 30, ironIngot: 40, goldIngot: 10, crystal: 10, plank: 20, copperIngot: 10 })
    g.save.coins = 99999
    g.buildVehicle('sparrow'); await run(3)
    g.buildVehicle('airship'); await run(3)
    const ship = g.save.vehicles.find((v) => v.type === 'airship')!
    const plane = g.save.vehicles.find((v) => v.type === 'sparrow')!
    expect(g.cradleFor(ship)?.id).toBe(plane.id)
    await flyTo(ship.id, 'peak')
    expect(ship.at).toBe('peak')
    expect(plane.at).toBe('peak')
  }, 120000)
})

describe('round 17: the house to tier 10', () => {
  it('grows wing by wing, every floor reachable, nothing lost', async () => {
    const { g, run } = headless()
    g.save.level = 10
    const before = g.save.home!.pieces.length + Object.values(g.save.home!.box ?? {}).reduce((a, b) => a + b, 0)
    g.house.growTo(9)
    expect(g.house.tier).toBe(9)
    expect(g.house.floorCount).toBe(9)
    const after = g.save.home!.pieces.length + Object.values(g.save.home!.box ?? {}).reduce((a, b) => a + b, 0)
    // the gifts of six tiers came in on top of what was there (stairs and attic gifts too)
    expect(after).toBeGreaterThan(before + 20)
    const on = (item: string) => g.save.home!.pieces.find((p) => p.item === item)
    expect(on('homeBench')?.f).toBe(3)
    expect(on('telescope')?.f).toBe(6)
    expect(on('beacon')?.f).toBe(8)
    expect(on('pool')?.f).toBe(7)
    g.house.enter(); await run(0.5)
    // walk through the guests' corner door to the workshop: by walking, as a player would
    const h = g.house as unknown as { floors: { n: number; toWorld(x: number, y: number): { x: number; y: number }; IW: number; p: { portals?: { side: string; y: number; to: number }[] } }[] }
    const f0 = h.floors[0]
    const east = f0.p.portals!.find((q) => q.to === 3)!
    const inside = f0.toWorld(f0.IW - 6, east.y)
    g.pilot.x = inside.x; g.pilot.y = inside.y
    g.walkTo(f0.toWorld(f0.IW + 3, east.y), 1, null)
    await run(4, () => g.house.cur === 3)
    expect(g.house.cur).toBe(3)
    // down to the aquarium and up again; the attic, the tower, the lantern room
    g.house.climb(5); expect(g.house.cur).toBe(5)
    g.house.climb(3); expect(g.house.cur).toBe(3)
    g.house.climb(2); g.house.climb(6); expect(g.house.cur).toBe(6)
    g.house.climb(8); expect(g.house.cur).toBe(8)
    g.house.climb(6); g.house.climb(2); expect(g.house.cur).toBe(2)
    // and back through the greenhouse to the terrace
    const f4 = h.floors[4]
    const q4 = f4.p.portals!.find((q) => q.to === 7)!
    ;(g.house as unknown as { through(q: unknown): void }).through({ ...q4, to: 4 })
  }, 120000)
  it('the new furniture does something', async () => {
    const { g, run } = headless()
    g.save.level = 10
    g.house.growTo(9)
    const use = (item: string) => {
      const h = g.house as unknown as { actors: { piece: { item: string }; a: unknown }[]; use(k: string, e: unknown): void }
      const e = h.actors.find((x) => x.piece.item === item)!
      h.use(({ planter: 'planter', beacon: 'beacon', telescope: 'stars', pool: 'swim', homeBench: 'craft' } as Record<string, string>)[item], e)
    }
    const n0 = g.count('carrot') + g.count('strawberry') + g.count('flower') + g.count('wheat')
    use('planter')
    const n1 = g.count('carrot') + g.count('strawberry') + g.count('flower') + g.count('wheat')
    expect(n1).toBe(n0 + 2)
    use('planter') // the same day: nothing more from the same shelf
    expect(g.count('carrot') + g.count('strawberry') + g.count('flower') + g.count('wheat')).toBe(n1)
    use('homeBench')
    expect(g.panel?.kind).toBe('workbench')
    g.close()
    g.setClock(0.95) // night
    const was = g.charmBonus
    use('beacon')
    expect(g.save.home!.beacon).toBe(true)
    expect(g.charmBonus).toBeCloseTo(was + 0.1)
    use('telescope')
    expect(g.save.home!.sky?.length).toBe(1)
    await run(0.2)
  }, 120000)
})

import { LEVELS } from '../src/game/levels'
import { FACILITIES, COURIER_CUT } from '../src/game/estate'
import { DAY_SECONDS } from '../src/game/body'

describe('round 17: island levels 6–10', () => {
  it('every level is in the game, each with goals, each from 6 opening a building', () => {
    expect(LEVELS.some((l) => l.planned)).toBe(false)
    for (const l of LEVELS.slice(1)) expect(l.goals.length).toBeGreaterThan(0)
    for (const f of Object.values(FACILITIES)) expect(LEVELS[f.level - 1].opens).toContain(f.name.slice(0, 2))
  })
  it('a facility goes down from its kit, and comes back as a kit when the land grows', async () => {
    const { g, run } = headless()
    g.close(); g.save.level = 6
    g.save.inv.ranchKit = 1
    g.startDecor('ranchKit')
    const lay = g.here
    let spot: { x: number; y: number } | null = null
    for (let r = 20; r < 200 && !spot; r += 4) for (let a = 0; a < 6.28 && !spot; a += 0.2) {
      const x = Math.round(lay.plaza.x + Math.cos(a) * r), y = Math.round(lay.plaza.y + Math.sin(a) * r)
      if (g.checkPlace('ranchKit', x, y).ok) spot = { x, y }
    }
    expect(spot).toBeTruthy()
    g.aimAt(spot!.x, spot!.y); g.placeHere()
    expect(g.estate.has('ranch')).toBe(true)
    expect(g.layouts.home.buildings.some((b) => b.kind === 'ranch')).toBe(true)
    // a tap on it opens its panel
    ;(g as unknown as { use(b: unknown): void }).use(g.layouts.home.buildings.find((b) => b.kind === 'ranch')!)
    expect(g.panel?.kind).toBe('ranch')
    g.close()
    // to level 7: the island grows, the ranch is a kit again
    g.save.coins = 99999
    g.save.stats.delivered = 99; g.save.stats.bred = 1; g.house.growTo(4)
    expect(g.levelInfo()!.ok).toBe(true)
    g.levelUp(); await run(0.5)
    expect(g.level).toBe(7)
    expect(g.estate.has('ranch')).toBe(false)
    expect(g.count('ranchKit')).toBe(1)
  }, 120000)
  it('the ranch: a pair, a day, a young one in one parent’s colour or (sometimes) a new one', async () => {
    const { g, run } = headless()
    g.save.level = 8 // (four pet places: three pets and room for a young one)
    g.estate.s.built.ranch = { x: 0, y: 0 }
    g.save.pets = [
      { id: 'a', sp: 'sheep', col: 'black', from: 'peak', giftAt: 9e9 },
      { id: 'b', sp: 'sheep', col: 'white', from: 'peak', giftAt: 9e9 },
      { id: 'c', sp: 'cat', col: 'white', from: 'reef', giftAt: 9e9 },
    ]
    expect(g.estate.canPair(g.save.pets[0], g.save.pets[2])).toMatch(/同一种/)
    g.estate.pair(g.save.pets[0], g.save.pets[1])
    expect(g.estate.s.pair).toBeTruthy()
    g.save.played = (g.save.played ?? 0) + DAY_SECONDS + 1
    g.estate.update(); await run(0.1)
    expect(g.save.pets.length).toBe(4)
    expect(g.save.pets[3].sp).toBe('sheep')
    expect(g.save.stats.bred).toBe(1)
    // the colour rule
    const [a, b] = g.save.pets
    const n = { a: 0, b: 0, other: 0 }
    for (let i = 0; i < 2000; i++) { const c = g.estate.colourOf(a, b, Math.random(), Math.random()); if (c === a.col) n.a++; else if (c === b.col) n.b++; else n.other++ }
    expect(n.a).toBeGreaterThan(800); expect(n.b).toBeGreaterThan(800); expect(n.other).toBeGreaterThan(30)
  })
  it('the shop sells while you are away, faster at a fair price', () => {
    const { g } = headless()
    g.save.level = 7
    g.estate.s.built.shop = { x: 0, y: 0 }
    g.save.inv.plank = 40
    g.estate.stock('plank', 20, g.estate.fair('plank'))
    g.save.inv.stone = 40
    g.estate.stock('stone', 20, g.estate.fair('stone') * 3)
    expect(g.count('plank')).toBe(20)
    g.save.played = (g.save.played ?? 0) + DAY_SECONDS
    g.estate.update()
    const sh = g.estate.shop
    const plank = sh.lines.find((l) => l.item === 'plank')?.qty ?? 0
    const stone = sh.lines.find((l) => l.item === 'stone')?.qty ?? 0
    expect(plank).toBeLessThan(20)
    expect(stone).toBe(20) // three times the fair price: nobody buys
    expect(sh.till).toBeGreaterThan(0)
    const c = g.save.coins
    g.estate.takeTill()
    expect(g.save.coins).toBeGreaterThan(c)
    expect(g.save.stats.sold).toBe(20 - plank)
  })
  it('the depot: a courier takes a safe order and brings back four fifths of the pay', async () => {
    const { g, run, settle } = headless()
    g.save.level = 8
    g.estate.s.built.depot = { x: 0, y: 0 }
    await g.refresh()
    const o = g.orders.find((x) => x.kind === 'buy' && x.status === 'open' && x.danger <= 1)!
    g.save.inv[o.item] = o.qty
    const c0 = g.save.coins
    await g.estate.hire(o.id); await settle()
    expect(g.count(o.item)).toBe(0)
    expect(g.estate.couriers.length).toBe(1)
    // the courier's delivery is not the player's to carry
    expect(g.deliveries.some((d) => d.orderId === o.id)).toBe(false)
    g.save.played = (g.save.played ?? 0) + DAY_SECONDS
    g.estate.update(); await run(0.2); await settle()
    expect(g.estate.couriers.length).toBe(0)
    // (the pay, a tip for promptness perhaps, less the courier's fifth)
    expect(g.save.coins - c0).toBeGreaterThanOrEqual(Math.round(o.price * (1 - COURIER_CUT)))
    expect(g.save.coins - c0).toBeLessThanOrEqual(Math.round(o.price * 1.15 * (1 - COURIER_CUT)) + 1)
    expect(g.save.stats.hired).toBe(1)
  })
  it('the lighthouse: a toll in the morning post, and goods to forward on the board', async () => {
    const { g, run } = headless()
    g.save.level = 9
    g.estate.s.built.lighthouse = { x: 0, y: 0 }
    g.estate.update()
    expect(g.local.relayOn).toBe(true)
    // run the board for a while: some orders are to forward
    for (let t = 0; t < 40; t++) await g.local.poll(2000 + t * 40)
    await g.refresh()
    const relay = g.orders.find((o) => o.relay && o.status === 'open')
    expect(relay).toBeTruthy()
    g.save.vehicles = [{ id: 'v1', type: 'skiff', lv: 3, at: 'home' } as never]
    const had = g.count(relay!.item)
    await g.acceptOrder(relay!.id); await run(0.1)
    expect(g.count(relay!.item)).toBe(had + relay!.qty)
    expect(g.save.stats.relayed).toBe(1)
    const n = g.save.mail?.letters.length ?? 0
    g.mail.morning()
    expect(g.save.mail!.letters.some((l) => l.coins === g.estate.toll())).toBe(true)
    expect(g.save.mail!.letters.length).toBeGreaterThan(n)
  })
  it('the exchange: buy dear, sell cheap, the price moves', () => {
    const { g } = headless()
    g.save.level = 10
    g.estate.s.built.exchange = { x: 0, y: 0 }
    g.save.coins = 10000
    const p = g.estate.price('ironIngot')
    expect(p.buy).toBeGreaterThan(p.sell)
    g.estate.trade('ironIngot', 10, 'buy')
    expect(g.count('ironIngot')).toBeGreaterThanOrEqual(10)
    expect(g.save.coins).toBe(10000 - p.buy * 10)
    expect(g.estate.price('ironIngot').k).toBeGreaterThan(p.k)
    const k0 = { ...g.estate.market.k }
    g.save.played = (g.save.played ?? 0) + DAY_SECONDS / 2
    g.estate.update()
    expect(Object.keys(k0).some((k) => g.estate.market.k[k] !== k0[k])).toBe(true)
  })
})

describe('round 17: the wish can be handed over in person, and lasts three days', () => {
  it('copper ingots, carried to the islander who asked', () => {
    const { g } = headless()
    g.save.wish = { day: g.clockDay, island: 'peak', who: g.layouts.peak.def.owner, item: 'copperIngot', n: 2, gift: 'globe' }
    const talk = (g as unknown as { talk(l: unknown): void }).talk.bind(g)
    talk(g.layouts.peak)
    expect(g.save.wish!.done).toBeFalsy() // nothing in hand yet: they say what is missing
    g.save.inv.copperIngot = 2
    // the next day it is still open
    g.save.wish!.day = g.clockDay - 1
    expect(g.wishes.open).toBeTruthy()
    talk(g.layouts.peak)
    expect(g.save.wish!.done).toBe(true)
    expect(g.count('copperIngot')).toBe(0)
    expect(g.save.stats.wishes).toBe(1)
  })
})

describe('round 17: island charm counts the house', () => {
  it('a quarter of the furniture in the house adds to the island’s charm', () => {
    const { g } = headless()
    const c = g.charmParts()
    expect(c.house).toBeGreaterThan(10) // the five-room cottage alone
    expect(g.charm).toBe(c.outdoor + c.house + c.guests)
  })
})
