// Round 7: placing with a see-through copy, the shovel, the house inside, strength and hunger,
// eating and cooking, sleeping and the end of the day.
import { describe, expect, it } from 'vitest'
import { DAY_SECONDS } from '../src/game/game'
import { give, FOOD } from '../src/game/data'
import { MIDNIGHT } from '../src/game/body'
import { headless } from './harness'

const houseOf = (g: ReturnType<typeof headless>['g']) => g.here.buildings.find((b) => b.kind === 'house')!

describe('home', () => {
  it('placing shows where a thing would go, green or red, and a second tap sets it down', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.bench = 1
    g.toHotbar('bench')
    g.save.held = 5
    g.hold(0)
    expect(g.placingItem).toBe('bench')
    expect(g.ghost).toBeTruthy()
    // a spot that is not flat, and one that is
    const lay = g.here
    let good: { x: number; y: number } | null = null
    let bad: { x: number; y: number } | null = null
    for (let r = 10; r < 80 && (!good || !bad); r += 3) {
      for (let a = 0; a < 6.28 && (!good || !bad); a += 0.4) {
        const x = Math.round(lay.plaza.x + Math.cos(a) * r), y = Math.round(lay.plaza.y + Math.sin(a) * r)
        const c = g.checkPlace('bench', x, y)
        if (c.ok && !good) good = { x, y }
        if (!c.ok && !bad) bad = { x, y }
      }
    }
    expect(good && bad).toBeTruthy()
    g.aimAt(bad!.x, bad!.y)
    expect(g.ghost!.ok).toBe(false)
    expect(g.ghost!.why.length).toBeGreaterThan(0)
    g.placeHere()
    expect(g.save.decor ?? []).toHaveLength(0)
    g.aimAt(good!.x, good!.y)
    expect(g.ghost!.ok).toBe(true)
    g.placeHere()
    expect(g.save.decor).toHaveLength(1)
    expect(g.placingItem).toBeNull()
    await run(0.5)
    // the furnace goes down the same way
    g.save.inv.furnaceKit = 1
    g.startPlacing('furnace')
    expect(g.placingItem).toBe('furnaceKit')
    g.placeAtDefault()
    expect(g.save.furnace).toBeTruthy()
  })

  it('the shovel levels a patch so things fit there, and it stays level', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.shovel = 1
    g.body.tireless = false
    g.save.energy = 100
    g.toHotbar('shovel')
    // find uneven ground near the village that the shovel can do
    const lay = g.here
    let spot: { x: number; y: number } | null = null
    for (let r = 20; r < 140 && !spot; r += 4) {
      for (let a = 0; a < 6.28 && !spot; a += 0.3) {
        const x = Math.round(lay.plaza.x + Math.cos(a) * r), y = Math.round(lay.plaza.y + Math.sin(a) * r)
        if (g.checkShovel(x, y).ok && !g.checkPlace('bench', x, y).ok) spot = { x, y }
      }
    }
    expect(spot).toBeTruthy()
    g.shovelTap(spot!.x, spot!.y)
    await run(12, () => (g.save.terrain?.length ?? 0) > 0)
    expect(g.save.terrain).toHaveLength(1)
    expect(g.body.energy).toBeLessThan(100)
    expect(g.toolLife('shovel')!.left).toBeLessThan(g.toolLife('shovel')!.max)
    g.save.inv.bench = 1
    g.startDecor('bench')
    expect(g.checkPlace('bench', spot!.x, spot!.y).ok).toBe(true)
  })

  it('the house: rooms and furniture inside, sitting, the shower, the stove, decorating', async () => {
    const { g, run } = headless()
    g.close()
    const h = houseOf(g)
    g.walkTo(h.door, 1.6, null)
    await run(20, () => !g.walking)
    // a tap on the house walks the player in at the door; over the sill the house opens up
    ;(g as unknown as { use: (b: unknown) => void }).use(h)
    await run(20, () => g.house.active)
    expect(g.house.active).toBe(true)
    expect(g.onSurface).toBe(false)
    expect(g.save.home!.pieces.map((p) => p.item)).toEqual(expect.arrayContaining(['bed', 'toilet', 'shower', 'stove', 'sofa', 'desk']))
    expect(g.house.cosiness().score).toBeGreaterThan(40)
    // the shower: once a day
    g.save.energy = 50
    const shower = g.save.home!.pieces.find((p) => p.item === 'shower')!
    ;(g.house as unknown as { use: (k: string, e: unknown) => void }).use('shower', { piece: shower, a: { x: 0, y: 0, z: 4 } })
    expect(g.body.energy).toBeGreaterThan(50)
    const after = g.body.energy
    ;(g.house as unknown as { use: (k: string, e: unknown) => void }).use('shower', { piece: shower, a: { x: 0, y: 0, z: 4 } })
    expect(g.body.energy).toBe(after)
    // decorating: pick the plant up (it stays in the house, in hand, until set down); set it down elsewhere
    g.house.decorating = true
    const plant = g.save.home!.pieces.find((p) => p.item === 'pottedPlant')!
    const n = g.save.home!.pieces.length
    g.house.pickUp(plant)
    expect(g.save.home!.pieces.length).toBe(n)
    expect(plant.lifted).toBe(true)
    expect(g.placingItem).toBe('pottedPlant')
    const spot = g.house.toWorld(36, 44)
    g.aimAt(spot.x, spot.y)
    expect(g.ghost!.ok).toBe(true)
    g.placeHere()
    expect(g.save.home!.pieces.length).toBe(n)
    // a wall is no place for it
    g.save.inv.chair = 1
    g.startDecor('chair')
    const wall = g.house.toWorld(60, 20)
    g.freePlace = true // (left alone, the placing helps it off the wall)
    g.aimAt(wall.x, wall.y)
    expect(g.ghost!.ok).toBe(false)
    g.freePlace = false
    g.cancelPlacing()
    // the bench is for outside
    g.save.inv.bench = 1
    g.startDecor('bench')
    expect(g.placingItem).toBeNull()
    // out again
    g.house.exit()
    expect(g.house.active).toBe(false)
    expect(g.onSurface).toBe(true)
    await run(0.5)
  })

  it('work takes strength; hungry it takes more; at nothing you cannot work; food gives it back', async () => {
    const { g } = headless()
    g.close()
    g.body.tireless = false
    g.save.energy = 10
    g.save.full = 80
    expect(g.body.work('chop')).toBe(true)
    expect(g.body.energy).toBe(9)
    g.save.full = 10
    expect(g.body.work('chop')).toBe(true)
    expect(g.body.energy).toBe(7.5)
    g.save.energy = 1
    expect(g.body.work('chop')).toBe(false)
    expect(g.toasts.some((t) => /干不动/.test(t.text))).toBe(true)
    expect(g.body.pace).toBeLessThan(1)
    // eat
    give(g.save.inv, { pumpkin: 1 })
    g.body.eat('pumpkin')
    expect(g.body.energy).toBe(1 + FOOD.pumpkin!.energy)
    expect(g.save.inv.pumpkin).toBe(0)
    // cook (from the warehouse too) and eat
    give(g.save.store!, { wheat: 3 })
    g.body.cook('bread')
    expect(g.count('bread')).toBe(1)
    const e = g.body.energy
    g.body.eat('bread')
    expect(g.body.energy).toBe(e + FOOD.bread!.energy)
  })

  it('a day: hunger creeps up, the bed takes you to morning with a summary, two o\'clock knocks you out', async () => {
    const { g, run } = headless()
    g.close()
    g.body.stayAwake = false
    const full = g.body.full
    await run(4)
    expect(g.body.full).toBeLessThan(full)
    // round 21: never too early for bed
    const bed = { x: g.pilot.x, y: g.pilot.y, z: g.pilot.z }
    // evening: to bed, and the next morning
    const day = g.clockDay
    g.save.day = 0.7
    g.save.coins += 50
    g.body.goToBed(bed as never)
    expect(g.panel?.kind).toBe('night')
    expect(g.clockDay).toBe(day + 1)
    expect(g.save.day).toBe(0)
    expect(g.body.energy).toBe(100)
    expect(g.house.active).toBe(true) // woke up at home, in the house
    g.close()
    // up all night: after midnight it wears you down, and empty you fall asleep where you are
    g.house.exit()
    g.save.played = (g.save.played ?? 0) + DAY_SECONDS * MIDNIGHT
    g.save.day = MIDNIGHT + 0.001
    g.body.energy = 1
    const coins = g.save.coins
    await run(10)
    expect(g.panel?.kind).toBe('night')
    expect((g.panel as { summary: { passedOut: boolean } }).summary.passedOut).toBe(true)
    expect(g.save.coins).toBeLessThan(coins)
    expect(g.body.energy).toBe(60)
  }, 20000)
})
