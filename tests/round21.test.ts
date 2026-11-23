// Round 21: the shovel levels a whole building's patch at once; sleep goes by strength, not the
// clock; orders grow with the island; more than one furnace and workbench, each working at once.
import { describe, expect, it } from 'vitest'
import { canPlace } from '../src/game/world'
import { FACILITIES } from '../src/game/estate'
import { give } from '../src/game/data'
import { headless } from './harness'

describe('round 21: levelling a building\'s patch', () => {
  it('a shop kit on sloping ground: one "level this" digs the whole patch flat and sets the shop down', async () => {
    const { g, run } = headless()
    g.close(); g.body.tireless = true
    g.save.level = 7
    give(g.save.inv, { shopKit: 1, shovel: 1 })
    const F = FACILITIES.shop
    const lay = g.layouts.home
    // find a spot where only the slope is wrong
    let spot: { x: number; y: number } | null = null
    for (let dy = -90; dy <= 90 && !spot; dy += 3) for (let dx = -110; dx <= 110 && !spot; dx += 3) {
      const x = Math.round(lay.plaza.x + dx), y = Math.round(lay.plaza.y + dy)
      if (canPlace(g.world, F.hw, F.hh, x, y)) continue
      if (g.checkPad(x, y, F.hw, F.hh).ok) spot = { x, y }
    }
    expect(spot).toBeTruthy()
    g.startDecor('shopKit')
    g.aimAt(spot!.x, spot!.y)
    expect(g.ghost!.ok).toBe(false)
    expect(g.ghost!.level).toBeGreaterThanOrEqual(2)
    const strokes = g.ghost!.level!
    const used = g.toolLife('shovel')?.left ?? 0
    g.levelForPlacing()
    expect(await run(40, () => g.estate.has('shop'))).toBe(true)
    expect(g.count('shopKit')).toBe(0)
    expect(used - (g.toolLife('shovel')?.left ?? 0)).toBe(strokes)
    // and it stays level after a reload of the world
    expect(g.save.terrain!.some((t) => (t.rx ?? 0) > 10)).toBe(true)
  }, 60000)
  it('something in the way is named, not "won\'t fit"', () => {
    const { g } = headless()
    g.close()
    const lay = g.layouts.home
    const tree = lay.nodes.find((n) => n.kind.startsWith('oak') && !n.depleted)!
    const r = g.checkPad(tree.x + 4, tree.y, 12.5, 9.5)
    expect(r.ok).toBe(false)
    expect(r.why).toMatch(/挡着|水|跑道/)
  })
})

import { MIDNIGHT } from '../src/game/body'

describe('round 21: sleep goes by strength', () => {
  it('a nap in the day: two hours on, strength back, the same day', async () => {
    const { g, run } = headless()
    g.close(); g.house.enter(); await run(0.3)
    g.save.day = 0.25; g.body.energy = 30
    const day = g.clockDay, played = g.save.played!
    const bed = g.house['actors'].find((e: { piece: { item: string } }) => e.piece.item === 'bed')!.a
    g.body.goToBed(bed, true)
    await run(3)
    expect(g.clockDay).toBe(day)
    expect(g.body.energy).toBeGreaterThanOrEqual(65) // (and a little more for the moments lying down)
    expect(g.save.played! - played).toBeGreaterThanOrEqual(2 * 1200 / 24 - 1)
    expect(g.panel?.kind).not.toBe('night')
  }, 30000)
  it('staying up: no bedtime, but after midnight strength drains; out on the sea at night is fine until it runs out', async () => {
    const { g, run } = headless()
    g.close()
    g.body.stayAwake = false
    g.save.day = 0.7; g.body.energy = 80 // ten at night: no drain yet
    await run(5)
    expect(g.body.energy).toBeCloseTo(80, 0)
    g.save.day = MIDNIGHT + 0.01
    await run(10)
    expect(g.body.energy).toBeLessThan(79)
    expect(g.panel?.kind).not.toBe('night')
  }, 30000)
})

import { LocalBackend, newLocalState, ORDER_TIERS, tiersFor } from '../src/game/backend'
import type { ItemId } from '../src/game/data'

describe('round 21: orders grow with the island', () => {
  const nb = [
    { id: 'a', owner: '阿岩', dist: 300, danger: 0, wants: ['plank', 'ironIngot', 'goldIngot'] as ItemId[], sells: [] as ItemId[] },
    { id: 'b', owner: '阿松', dist: 500, danger: 0, wants: ['stone', 'cloth', 'tuna'] as ItemId[], sells: [] as ItemId[] },
    { id: 'c', owner: '阿礁', dist: 700, danger: 2, wants: ['copperIngot', 'crystal'] as ItemId[], sells: [] as ItemId[] },
  ]
  const board = (level: number, hold: number) => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const be = new LocalBackend(newLocalState(), nb as never, rnd, () => hold, () => level)
    const seen: { item: ItemId; qty: number; island: string; tier?: number }[] = []
    for (let t = 1; t < 400; t++) {
      // (orders taken off the board to make room)
      for (const o of be.s.orders) if (o.status === 'open') { seen.push(o); o.status = 'done' }
      ;(be as unknown as { spawn: (n: number) => void }).spawn(t)
    }
    return seen
  }
  it('a new island is asked for raw goods, on the safe runs, in loads its first plane carries', () => {
    const s = board(2, 6)
    expect(s.length).toBeGreaterThan(30)
    expect(s.every((o) => ORDER_TIERS[1].includes(o.item))).toBe(true)
    expect(s.every((o) => o.island !== 'c')).toBe(true)
    expect(s.every((o) => o.qty <= 6)).toBe(true)
  })
  it('a middling island mostly made goods; a big one the rare and fine, in big loads', () => {
    const m = board(5, 20)
    const share2 = m.filter((o) => o.tier === 2).length / m.length
    expect(share2).toBeGreaterThan(0.5)
    expect(m.some((o) => o.tier === 3)).toBe(false)
    const b = board(9, 80)
    expect(b.filter((o) => o.tier === 3).length / b.length).toBeGreaterThan(0.45)
    expect(b.some((o) => o.tier === 1)).toBe(false)
    expect(Math.max(...b.map((o) => o.qty))).toBeGreaterThan(20)
  })
  it('the tiers by level', () => {
    expect(tiersFor(1).map(([t]) => t)).toEqual([1])
    expect(tiersFor(6).map(([t]) => t)).toEqual([1, 2])
    expect(tiersFor(10).map(([t]) => t)).toEqual([2, 3])
  })
})

import { furnaceCap, FURNACE_QUEUE } from '../src/game/game'
import { RECIPES } from '../src/game/data'

describe('round 21: more furnaces, burning at once', () => {
  it('one at first, two at level 4, three at level 7; a batch is spread over them so it is done in a third of the time', async () => {
    const { g, run, tick } = headless()
    g.close(); g.body.tireless = true
    expect([1, 3, 4, 6, 7, 10].map(furnaceCap)).toEqual([1, 1, 2, 2, 3, 3])
    g.save.level = 7
    give(g.save.inv, { furnaceKit: 3, shovel: 1 })
    const lay = g.layouts.home
    let placed = 0
    for (let dy = -90; dy <= 90 && placed < 3; dy += 6) for (let dx = -110; dx <= 110 && placed < 3; dx += 6) {
      if (g.furnaceFull()) break
      g.startDecor('furnaceKit')
      g.aimAt(Math.round(lay.plaza.x + dx), Math.round(lay.plaza.y + dy))
      if (g.ghost?.ok) { g.placeHere(); placed = g.furnaceSpots().length }
    }
    expect(g.furnaceSpots().length).toBe(3)
    expect(g.furnaceFull()).toBe('已经有三座熔炉了')
    const r = RECIPES.find((x) => x.station === 'furnace' && x.out === 'copperIngot')!
    give(g.save.inv, Object.fromEntries(Object.entries(r.cost).map(([k, v]) => [k, (v ?? 0) * 6])))
    const had = g.count('copperIngot')
    g.smelt(r.id, 6)
    expect(new Set(g.save.jobs.map((j) => j.f)).size).toBe(3)
    expect(g.furnaceLeft()).toBeLessThanOrEqual(r.time * 2 + 1)
    tick(r.time * 2 + 2)
    await run(0.5)
    expect(g.count('copperIngot') - had).toBe(6 * r.qty)
    expect(g.save.jobs.length).toBe(0)
    expect(FURNACE_QUEUE).toBe(8)
  }, 60000)
})
