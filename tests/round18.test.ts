import { describe, expect, it } from 'vitest'
import { headless } from './harness'
import { FURNITURE } from '../src/game/data'

describe('round 18: up off any seat', () => {
  it('after sitting on each seat in the house the pilot can walk away', async () => {
    const { g, run } = headless()
    g.close(); g.house.enter(); await run(0.5)
    const h = g.house as unknown as { actors: { piece: { item: string }; a: unknown }[]; use(k: string, e: unknown): void; floors: { toWorld(x: number, y: number): { x: number; y: number } }[] }
    let n = 0
    for (const e of h.actors) {
      const use = (FURNITURE as Record<string, { indoor?: string }>)[e.piece.item]?.indoor
      if (!use || !['seat', 'rock', 'low', 'lean'].includes(use)) continue
      h.use(use, e); await run(0.3)
      expect(g.sitting).toBeTruthy()
      const to = h.floors[0].toWorld(44, 50)
      g.walkTo(to, 2, null); await run(5)
      expect(Math.hypot(g.pilot.x - to.x, g.pilot.y - to.y)).toBeLessThan(4)
      n++
    }
    expect(n).toBeGreaterThan(3)
  }, 120000)
})

import { COLS, COMPOST_PER, soilName } from '../src/game/farm'
import { DAY_SECONDS } from '../src/game/body'

describe('round 18: the field', () => {
  it('is one piece of ground: plots side by side in rows of four', () => {
    const { g } = headless()
    g.save.level = 4; g.farm.rebuild()
    const f = g.farm as unknown as { actors: { x: number; y: number; i: number }[] }
    expect(f.actors.length).toBe(12)
    for (const a of f.actors) {
      const right = f.actors.find((b) => b.i === a.i + 1 && b.i % COLS !== 0)
      if (right) { expect(right.x - a.x).toBe(8); expect(right.y).toBe(a.y) }
      const below = f.actors.find((b) => b.i === a.i + COLS)
      if (below) { expect(below.y - a.y).toBe(8); expect(below.x).toBe(a.x) }
    }
  })
  it('water a row at a time, once a day; no water, no growth; rain waters all', async () => {
    const { g, run } = headless()
    g.save.level = 3; g.farm.rebuild()
    g.body.tireless = true
    g.save.inv.carrotSeed = 8
    const plots = g.farm.beds
    for (const p of plots.slice(0, 5)) { g.farm.use(p); g.farm.use(p) } // cleared and planted: a row and one more
    g.farm.use(plots[0]) // water: the first row
    expect(plots.slice(0, 4).every((p) => g.farm.isWet(p))).toBe(true)
    expect(g.farm.isWet(plots[4])).toBe(false)
    g.save.played = (g.save.played ?? 0) + 200; await run(0.3)
    expect(g.farm.progress(plots[0])).toBeGreaterThan(0)
    expect(g.farm.progress(plots[4])).toBe(0)
    // the next day it is dry again
    g.save.played = (g.clockDay + 1) * DAY_SECONDS + 10; await run(0.3)
    expect(g.farm.isWet(plots[0])).toBe(false)
    g.life.setRain(true, 60); await run(0.3)
    expect(g.farm.isWet(plots[4])).toBe(true)
  })
  it('compost: what rots goes in, fertiliser the next morning; fed and cared-for ground gets better', async () => {
    const { g, run } = headless()
    g.save.level = 2; g.farm.rebuild()
    g.body.tireless = true
    g.save.inv.fiber = COMPOST_PER * 2 + 1
    g.farm.addCompost('fiber', COMPOST_PER * 2 + 1)
    expect(g.farm.compost.ready).toBe(0)
    g.save.played = (g.clockDay + 1) * DAY_SECONDS + 5; await run(0.3)
    expect(g.farm.compost.ready).toBe(2)
    expect(g.farm.compost.pts).toBe(1)
    g.farm.takeFertilizer()
    expect(g.count('fertilizer')).toBe(2)
    g.save.inv.carrotSeed = 4
    const p = g.farm.beds[0]
    g.farm.use(p); g.farm.use(p); g.farm.use(p) // clear, plant, water
    expect(soilName(p)).toBe('耕地')
    g.farm.use(p) // fertilise
    expect(p.fert).toBe(true)
    expect(soilName(p)).toBe('好地')
    g.save.played! += 500; await run(0.3)
    expect(g.farm.progress(p)).toBe(1)
    const before = g.count('carrot')
    g.farm.use(p)
    expect(g.count('carrot') - before).toBeGreaterThanOrEqual(4) // three and one for the fertiliser
  })
})

import { give, SEA_FISH } from '../src/game/data'

describe('round 18: fishing from the boat', () => {
  it('anchor at sea, cast over the side, the catch goes into the creel with its length', async () => {
    const { g, run, settle } = headless()
    g.close(); g.body.tireless = true
    give(g.save.inv, { wood: 20, rope: 6, rod: 1, creel: 1 })
    g.buildVehicle('skiff'); await run(4)
    const boat = g.save.vehicles.find((v) => v.type === 'skiff')!
    await g.depart(boat.id, 'peak'); await settle()
    await run(20, () => g.flight?.phase === 'cruise')
    await run(6)
    expect(g.canAnchor()).toBe(true)
    g.dropAnchor(); await run(3)
    const at = { x: g.scene.lead.x, y: g.scene.lead.y }
    await run(2)
    expect(Math.hypot(g.scene.lead.x - at.x, g.scene.lead.y - at.y)).toBeLessThan(3) // lying at anchor
    let caught = 0
    for (let n = 0; n < 10 && !caught; n++) {
      g.fishing.castAtSea()
      if (!(await run(4, () => g.fishing.phase === 'wait'))) continue
      await run(16, () => g.fishing.phase === 'bite')
      if (g.fishing.phase !== 'bite') { g.fishing.hold(true); await run(0.3); continue }
      g.press(true)
      await run(40, () => {
        const f = g.fishing
        if (f.phase !== 'reel') return true
        f.hold(!f.surging && f.tension < 0.6)
        return false
      })
      await run(2, () => !g.fishing.active)
      caught = (g.save.creel ?? []).length
    }
    expect(caught).toBe(1)
    const c = g.save.creel![0]
    expect(SEA_FISH.some((d) => d.item === c.item)).toBe(true)
    expect(c.cm).toBeGreaterThan(0)
    expect(g.count(c.item)).toBe(0) // in the creel, not the bag
    expect(g.save.stats.seaFished).toBe(1)
    g.weighAnchor(); await run(4)
    expect(Math.hypot(g.scene.lead.x - at.x, g.scene.lead.y - at.y)).toBeGreaterThan(20) // under way again
    g.emptyCreel()
    expect(g.count(c.item)).toBe(1)
    expect(g.bestCatch()?.item).toBe(c.item)
  }, 240000)
  it('far from every island the big fish are commoner', () => {
    const near = SEA_FISH.filter((d) => d.size === 3).reduce((n, d) => n + d.weight, 0) / SEA_FISH.reduce((n, d) => n + d.weight, 0)
    const far = SEA_FISH.filter((d) => d.size === 3).reduce((n, d) => n + d.weight * d.far, 0) / SEA_FISH.reduce((n, d) => n + d.weight * d.far, 0)
    expect(far).toBeGreaterThan(near * 2)
  })
})
