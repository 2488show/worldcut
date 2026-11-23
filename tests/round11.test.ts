// Round 11: nothing is ever lost while decorating; the auto-placing; stacking; resting on furniture.
import { describe, expect, it } from 'vitest'
import { FURNITURE, give, type ItemId } from '../src/game/data'
import { headless } from './harness'

/** every piece of furniture the player has, wherever it is: bag, warehouse, box, the house, the island */
function census(g: ReturnType<typeof headless>['g']) {
  const n: Record<string, number> = {}
  const add = (k: string, v = 1) => { if (FURNITURE[k as ItemId]) n[k] = (n[k] ?? 0) + v }
  for (const [k, v] of Object.entries(g.save.inv)) add(k, v ?? 0)
  for (const [k, v] of Object.entries(g.save.store ?? {})) add(k, v ?? 0)
  for (const [k, v] of Object.entries(g.save.home?.box ?? {})) add(k, v ?? 0)
  for (const p of g.house.save.pieces) add(p.item)
  for (const d of g.save.decor ?? []) add(d.item)
  for (const k of Object.keys(n)) if (!n[k]) delete n[k]
  return n
}
function inside(g: ReturnType<typeof headless>['g']) {
  g.close()
  const h = g.here.buildings.find((b) => b.kind === 'house')!
  g.pilot.x = h.door.x; g.pilot.y = h.door.y
  g.house.enter()
  g.house.decorating = true
}

describe('round 11', () => {
  it('moving furniture: let go of it and it goes back where it was; nothing is ever lost', async () => {
    const { g, run } = headless()
    inside(g)
    give(g.save.inv, { roundTable: 1, flowerVase: 2, cushion: 3 })
    const before = census(g)
    const plant = g.house.save.pieces.find((p) => p.item === 'pottedPlant')!
    const where = { x: plant.x, y: plant.y }
    // pick it up, then let go: back where it stood (not in the bag, not gone)
    g.house.pickUp(plant)
    expect(g.house.moving).toBeTruthy()
    expect(g.placingItem).toBe('pottedPlant')
    g.cancelPlacing()
    expect(g.house.moving).toBeNull()
    expect(plant.lifted).toBeUndefined()
    expect({ x: plant.x, y: plant.y }).toEqual(where)
    expect(census(g)).toEqual(before)
    // pick it up and walk out of the door: back again
    g.house.pickUp(plant)
    g.house.exit()
    expect(census(g)).toEqual(before)
    // pick it up, and the game is saved and loaded meanwhile: back again on load
    inside(g)
    const p2 = g.house.save.pieces.find((p) => p.item === 'pottedPlant')!
    g.house.pickUp(p2)
    const saved = JSON.parse(JSON.stringify(g.save))
    expect(saved.home.pieces.some((p: { item: string; lifted?: boolean }) => p.item === 'pottedPlant' && p.lifted)).toBe(true)
    g.house.exit(); inside(g)
    expect(g.house.save.pieces.every((p) => !p.lifted)).toBe(true)
    expect(census(g)).toEqual(before)
    // a table set down, a vase on it; the table moved: the vase comes along; 撤回 puts all back
    g.startDecor('roundTable')
    g.aimAt(...(Object.values(g.house.toWorld(38, 44)) as [number, number]))
    expect(g.ghost?.ok, JSON.stringify(g.ghost)).toBe(true)
    g.placeHere()
    const table = g.house.save.pieces.find((p) => p.item === 'roundTable')!
    g.startDecor('flowerVase')
    const tw = g.house.toWorld(table.x, table.y)
    g.aimAt(tw.x, tw.y)
    expect(g.ghost?.ok).toBe(true)
    expect(g.ghost?.z).toBe(FURNITURE.roundTable!.top)
    g.placeHere()
    const vase = g.house.save.pieces.find((p) => p.item === 'flowerVase')!
    expect(vase.z).toBe(8)
    g.cancelPlacing()
    g.house.pickUp(table)
    expect(g.house.moving!.riders.length).toBe(1)
    const nw = g.house.toWorld(table.x - 10, table.y)
    g.freePlace = true
    g.aimAt(nw.x, nw.y)
    g.placeHere()
    expect(vase.x).toBe(table.x + (vase.x - table.x))
    expect(Math.abs(vase.x - table.x)).toBeLessThanOrEqual(5)
    expect(g.house.canUndo).toBe(true)
    g.house.undo()
    expect(census(g)).toEqual(before)
    // 收起来: into the bag, or the box when the bag is full — and it shows in the tray
    for (let i = 0; i < 30; i++) give(g.save.inv, { [['stick', 'pebble', 'stone', 'wood', 'fiber', 'berry', 'shell', 'coal'][i % 8]]: 99 })
    g.house.pickUp(table)
    g.house.stash()
    expect(census(g)).toEqual(before)
    expect(g.house.owned().some((o) => o.item === 'roundTable')).toBe(true)
    expect(g.count('roundTable')).toBe(1)
    g.freePlace = false
    await run(0.1)
  }, 20000)

  it('the auto-placing: against the wall, a chair at the table, a rug under it, a picture on the wall', () => {
    const { g } = headless()
    inside(g)
    // a bookshelf dropped near the living room's west wall: flush against it, facing the room
    const s1 = g.house.snap('bookshelf', 7, 44, 2, false)
    expect(s1.hint).toBe('靠墙')
    expect(s1.rot).toBe(3)
    expect(s1.x).toBeLessThan(7)
    // free: exactly where it was put
    const s2 = g.house.snap('bookshelf', 7, 44, 2, true)
    expect([s2.x, s2.y, s2.rot]).toEqual([7, 44, 2])
    // a stool by the coffee table settles beside it (and fits there)
    const t = g.house.save.pieces.find((p) => p.item === 'coffeeTable')!
    const s3 = g.house.snap('stool', t.x + 10, t.y, 0, false)
    expect(['围桌', '对齐', '居中', '对称']).toContain(s3.hint)
    expect(g.house.check('stool', s3.x, s3.y, s3.rot, s3.z).ok).toBe(true)
    // a painting goes on a wall at its height
    const s4 = g.house.snap('paintingSea', 11, 32, 0, false)
    expect(s4.z).toBeGreaterThan(0)
    expect(s4.z + g.scene.models.i_paintSea.H).toBeLessThanOrEqual(11) // (an inner wall: lower than the outer ones)
    expect(g.house.check('paintingSea', s4.x, s4.y, s4.rot, s4.z).ok).toBe(true)
    // curtains only on a window
    const s5 = g.house.snap('curtains', 9, 4, 0, false)
    expect(s5.hint).toBe('挂在窗上')
    expect(g.house.check('curtains', s5.x, s5.y, s5.rot, s5.z).ok).toBe(true)
    expect(g.house.check('curtains', 45, 50, 0, 5).ok).toBe(false)
    // a tabletop thing with no table under it: no
    expect(g.house.check('cactus', 36, 44, 0, 0).ok).toBe(false)
  })

  it('resting on furniture: soft seats, the floor cushion, lying on the sofa, leaning', async () => {
    const { g, run } = headless()
    inside(g)
    g.house.decorating = false
    g.body.tireless = false
    g.save.energy = 20
    const sofa = g.house.save.pieces.find((p) => p.item === 'sofa')!
    const w = g.house.toWorld(sofa.x, sofa.y)
    g.sitOn({ x: w.x, y: w.y, yaw: 0, z: 7 }, false, 'soft')
    await run(5)
    const soft = g.body.energy
    expect(soft).toBeGreaterThan(24)
    g.sitOn({ x: w.x, y: w.y, yaw: 0, z: 7 }, false, 'lie')
    expect(g.pilot.model.name).toBe('pilot_lie')
    g.sitOn({ x: w.x, y: w.y, yaw: 0, z: 1 }, false, 'low')
    expect(g.pilot.model.name).toBe('pilot_low')
    g.sitOn({ x: w.x, y: w.y, yaw: 0, z: 4 }, false, 'lean')
    expect(g.pilot.model.name).toBe('pilot_lean')
    // the windows are there (round 14: real openings, with a frame in each)
    expect(g.scene.models.i_win13).toBeTruthy()
  })
})

import { sizeOf, isTrophy, landFish, FISH_INFO } from '../src/game/fishbook'

describe('round 11: fishing and diving', () => {
  it('every catch is measured: the book keeps the record; a first catch and a record have their ceremony', () => {
    const { g } = headless()
    let seed = 3
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < 200; i++) {
      const cm = sizeOf('bream', rnd)
      expect(cm).toBeGreaterThanOrEqual(FISH_INFO.bream!.cm[0])
      expect(cm).toBeLessThanOrEqual(Math.ceil(FISH_INFO.bream!.cm[1] * 1.4))
    }
    expect(isTrophy('bream', 50)).toBe(true)
    expect(isTrophy('bream', 30)).toBe(false)
    const fx: string[] = []
    g.onFx = (e) => { if (e.t === 'celebrate') fx.push(e.title) }
    expect(landFish(g, 'bream', 30, '竿')).toBe(1)
    expect(fx[0]).toContain('新的鱼')
    expect(g.save.records!.bream!.cm).toBe(30)
    g.save.stats.gathered.bream = 1
    landFish(g, 'bream', 28, '竿')
    expect(g.save.records!.bream!.cm).toBe(30)
    landFish(g, 'bream', 36, '竿')
    expect(fx.some((t) => t.includes('新纪录'))).toBe(true)
    expect(g.save.records!.bream!.cm).toBe(36)
    expect(landFish(g, 'bream', 48, '竿')).toBe(2) // a trophy counts twice
  })

  it('diving: an air vent gives breath once; the chest opens; a new depth band is noted', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.harpoon = 1
    g.dive.enter()
    const d = g.dive
    const v = d.vents[0]
    const air = d.oxygen
    d.x = v.x; d.y = v.y - 10
    await run(0.1)
    expect(v.used).toBe(true)
    expect(d.oxygen).toBeGreaterThan(air + 5)
    const o2 = d.oxygen
    await run(0.1)
    expect(d.oxygen).toBeLessThan(o2) // once only
    const coins = g.save.coins
    d.x = d.chest!.x; d.y = d.chest!.y - 2
    await run(0.1)
    expect(d.chest!.open).toBe(true)
    expect(g.save.coins).toBeGreaterThan(coins)
    expect(g.save.diveZones).toBeGreaterThan(0)
    d.surface()
  })
})
