// Round 14: the windows are real openings in the walls; the bed lies under the bedroom's big
// window and the shot from bed looks across it; an older house's bedroom moves to match.
import { describe, expect, it } from 'vitest'
import { FURNITURE } from '../src/game/data'
import { IW, IH, WINDOWS } from '../src/game/house'
import { headless } from './harness'

type H = { check: (item: string, x: number, y: number, rot: number, z?: number) => { ok: boolean; why: string }; moving: unknown; fz: number }

describe('round 14: real windows and the bed under one', () => {
  it('the house as it comes: every piece stands where a piece may stand', () => {
    const { g } = headless()
    const h = g.house as unknown as H
    const bad: string[] = []
    for (const p of g.house.save.pieces) {
      h.moving = { piece: p, from: {}, riders: [] }
      const r = h.check(p.item, p.x, p.y, p.rot, p.z ?? 0)
      if (!r.ok) bad.push(`${p.item} ${p.x},${p.y} r${p.rot}: ${r.why}`)
    }
    h.moving = null
    expect(bad).toEqual([])
    expect(g.house.save.v).toBe(6)
    // the bed lies along the back wall, under the wide window
    const bed = g.house.save.pieces.find((p) => p.item === 'bed')!
    const big = WINDOWS.find((w) => w.side === 'n' && w.half >= 9)!
    expect(bed.rot).toBe(3)
    expect(Math.abs(bed.x - big.x)).toBeLessThan(6)
    expect(bed.y).toBeLessThan(8)
  })

  it('a window is a gap in the wall: lower than the wall beside it, and still not a way through', () => {
    const { g } = headless()
    const h = g.house
    for (const w of WINDOWS) {
      const mid = h.toWorld(w.side === 'w' ? -2 : w.side === 'e' ? IW + 1 : w.x, w.side === 'n' ? -2 : w.y)
      const beside = h.toWorld(w.side === 'w' ? -2 : w.side === 'e' ? IW + 1 : w.x + w.half + 2, w.side === 'n' ? -2 : w.y + w.half + 2)
      expect(g.world.heightAt(mid.x, mid.y)).toBeLessThan(g.world.heightAt(beside.x, beside.y) - 8)
      expect(g.world.solidAt(mid.x, mid.y)).toBe(true)
    }
  })

  it('a house from before (the bed head-on to the wall, a painting where the window now is) moves over; nothing is lost', () => {
    const { g } = headless()
    const save = JSON.parse(JSON.stringify(g.save))
    const pieces = save.home.pieces.filter((p: { item: string }) => !['bed', 'nightstand', 'tableLamp', 'wardrobe', 'floorLamp', 'roundRug'].includes(p.item))
    save.home = {
      pieces: [...pieces, { item: 'bed', x: 7, y: 10, rot: 0 }, { item: 'floorLamp', x: 17, y: 4, rot: 0 }, { item: 'wardrobe', x: 27, y: 3, rot: 0 }, { item: 'paintingSea', x: 18, y: 0, rot: 0, z: 7 }],
      hearth: true, ticker: true, v: 3,
    }
    const before = save.home.pieces.length
    const { g: g2 } = headless({ save })
    const hs = g2.house.save
    expect(hs.v).toBe(6)
    const bed = hs.pieces.find((p) => p.item === 'bed')!
    expect([bed.x, bed.y, bed.rot]).toEqual([9, 6, 3])
    expect(hs.pieces.some((p) => p.item === 'nightstand')).toBe(true)
    expect(hs.pieces.some((p) => p.item === 'tableLamp' && p.z)).toBe(true)
    // the painting hung where the window now opens: in the box, not gone
    expect(hs.pieces.some((p) => p.item === 'paintingSea')).toBe(false)
    expect(hs.box?.paintingSea).toBe(1)
    const now = hs.pieces.length + Object.values(hs.box ?? {}).reduce((a, n) => a + (n ?? 0), 0)
    expect(now).toBe(before + 3) // the nightstand, the lamp and the rug came with the change
    for (const p of hs.pieces) expect(FURNITURE[p.item] && p.x >= 0 && p.x < IW && p.y >= 0 && p.y < IH).toBeTruthy()
  })

  it('lying down: the wall between the camera and the bed comes down, and goes back up after', async () => {
    const { g, run } = headless()
    g.close()
    const h = g.house
    h.enter()
    const wall = h.toWorld(10, 28) // the wall between the bedroom and the living room
    const up = g.world.heightAt(wall.x, wall.y)
    const bed = (h as unknown as { actors: { piece: { item: string }; a: unknown }[] }).actors.find((e) => e.piece.item === 'bed')!
    ;(h as unknown as { bed: unknown }).bed = bed.a
    h.lieDown()
    await run(0.3)
    expect(h.resting).toBe(true)
    expect(g.world.heightAt(wall.x, wall.y)).toBeLessThan(up - 6)
    expect(g.world.solidAt(wall.x, wall.y)).toBe(true)
    h.getUp()
    await run(2)
    expect(g.world.heightAt(wall.x, wall.y)).toBe(up)
    // and it rains outside the windows, not in the room
    g.weather.force('rain', 120)
    await run(1)
    expect(h.dryBox()).toBeTruthy()
    h.exit()
    await run(0.5)
    expect(h.dryBox()).toBe(null)
  }, 30000)
})

describe('round 14: whichever way the house faces', () => {
  it('indoors the camera looks in over the front sill at the back wall — for all four turns of the house', async () => {
    for (let R = 0; R < 4; R++) {
      const { g, run } = headless()
      g.close()
      const b = g.layouts.home.buildings.find((x) => x.kind === 'house')!
      b.yaw = (R * Math.PI) / 2
      ;(g.house as unknown as { clear: () => void }).clear()
      g.house.rebuild()
      g.house.enter()
      await run(0.2)
      expect(g.house.active).toBe(true)
      const front = g.house.toWorld(44, IH - 1), back = g.house.toWorld(44, 0)
      const d = Math.hypot(back.x - front.x, back.y - front.y)
      const want = [(back.x - front.x) / d, (back.y - front.y) / d]
      const got = [-Math.sin(g.camYaw), -Math.cos(g.camYaw)]
      expect(got[0]).toBeCloseTo(want[0], 5)
      expect(got[1]).toBeCloseTo(want[1], 5)
      // and the shot from bed looks from the room's side of the bed at the wall the bed lies along
      const h = g.house as unknown as { actors: { piece: { item: string }; a: { x: number; y: number } }[]; bed: unknown; bedShot: (b: unknown) => { x: number; y: number; yaw: number } }
      const bed = h.actors.find((e) => e.piece.item === 'bed')!
      const v = h.bedShot(bed.a)
      const wallSide = g.house.toWorld(9, -2), roomSide = g.house.toWorld(9, 20)
      const dd = Math.hypot(wallSide.x - roomSide.x, wallSide.y - roomSide.y)
      expect(-Math.sin(v.yaw)).toBeCloseTo((wallSide.x - roomSide.x) / dd, 5)
      expect(-Math.cos(v.yaw)).toBeCloseTo((wallSide.y - roomSide.y) / dd, 5)
    }
  }, 60000)
})

describe('round 14: the mailbox', () => {
  it('stands outside the house, whichever way the island turned it', () => {
    const turns = new Set<number>()
    for (let s = 1; s <= 10; s++) {
      const { g } = headless({ seed: s * 97 })
      const b = g.layouts.home.buildings.find((x) => x.kind === 'house')!
      turns.add(Math.round(b.yaw / (Math.PI / 2)) & 3)
      const box = (g.mail as unknown as { box: { x: number; y: number } | null }).box
      expect(box).toBeTruthy()
      expect(g.house.inWalls(box!.x, box!.y)).toBe(false)
      // and near the door (round 16: the house is smaller than its plot)
      expect(Math.hypot(box!.x - b.door.x, box!.y - b.door.y)).toBeLessThan(40)
    }
    expect(turns.size).toBeGreaterThan(1) // (the islands tried do turn their houses different ways)
  }, 60000)
})
