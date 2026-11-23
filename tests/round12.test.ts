// Round 12: the house stands on the island — walked into, not teleported to; an old house's
// furniture moves into the new rooms without losing a thing.
import { describe, expect, it } from 'vitest'
import { FURNITURE, type ItemId } from '../src/game/data'
import { IW, IH, STARTER_ITEMS } from '../src/game/house'
import { headless } from './harness'

describe('round 12: the house on the island', () => {
  it('a real building: walls round it, the door open, the inside walked into, out again over the sill', async () => {
    const { g, run } = headless()
    g.close()
    const h = g.house
    expect(h.attached).toBe(true)
    // room pixels and the world agree, both ways, whichever way the house faces
    for (const [x, y] of [[0, 0], [IW - 1, 0], [5, IH - 1], [44, 31]]) {
      const w = h.toWorld(x, y)
      expect(h.toRoom(w.x, w.y)).toEqual({ x, y })
    }
    // the walls block, the floor and the doorway do not
    const wall = h.toWorld(-2, 20)
    expect(g.world.solidAt(Math.round(wall.x), Math.round(wall.y))).toBe(true)
    const inDoor = h.doorInside()
    expect(g.world.solidAt(Math.round(inDoor.x), Math.round(inDoor.y))).toBe(false)
    // walk in from the island: the house opens as the player steps over the sill
    const b = g.here.buildings.find((x) => x.kind === 'house')!
    g.pilot.x = b.door.x; g.pilot.y = b.door.y
    ;(g as unknown as { use: (b: unknown) => void }).use(b)
    await run(20, () => h.active)
    expect(h.active).toBe(true)
    // and out again
    h.exit()
    await run(0.5)
    expect(h.active).toBe(false)
    expect(g.onSurface).toBe(true)
  }, 60000)

  it('an old, bigger house: the starting furniture takes its new places, the rest finds room or waits in the box', () => {
    const { g } = headless()
    g.close()
    const count = () => {
      const n: Record<string, number> = {}
      for (const p of g.house.save.pieces) n[p.item] = (n[p.item] ?? 0) + 1
      for (const [k, v] of Object.entries(g.house.save.box ?? {})) n[k] = (n[k] ?? 0) + (v ?? 0)
      return n
    }
    // a round-11 house: the old rooms (150 × 104), and some things of the player's own
    const old = STARTER_ITEMS.map((item, i) => ({ item, x: 10 + (i % 10) * 13, y: 10 + Math.floor(i / 10) * 30, rot: 0 }))
    const extra: ItemId[] = ['roundTable', 'armchair', 'paintingSea', 'flowerVase', 'bigPlant', 'beanbag', 'longTable']
    g.save.home = { pieces: [...old, ...extra.map((item, i) => ({ item, x: 100 + i, y: 90, rot: 0 }))], hearth: true, ticker: true }
    const before = count()
    g.house.rebuild()
    expect(g.house.save.v).toBe(6)
    // nothing lost (round 14 adds a nightstand, a lamp and a rug by the bed: those may be extra)
    const after = count()
    for (const [k, n] of Object.entries(before)) expect(after[k] ?? 0).toBeGreaterThanOrEqual(n)
    const gifts = Object.entries(after).filter(([k, n]) => n > (before[k] ?? 0)).map(([k]) => k)
    for (const k of gifts) expect(['nightstand', 'tableLamp', 'roundRug']).toContain(k)
    // every piece standing is inside the new rooms
    for (const p of g.house.save.pieces) {
      expect(FURNITURE[p.item]).toBeTruthy()
      expect(p.x >= 0 && p.x < IW && p.y >= 0 && p.y < IH).toBe(true)
    }
    // most of the player's own things found a place
    const placed = extra.filter((it) => g.house.save.pieces.some((p) => p.item === it)).length
    expect(placed).toBeGreaterThanOrEqual(4)
  })
})
