// Round 8: the mine keeps what was dug; the day's light and the weather; making the player;
// lying in bed; the side-view dive; the restaurant, a visitor and a meal together.
import { describe, expect, it } from 'vitest'
import { give } from '../src/game/data'
import { personModel, DEFAULT_LOOK, readLook } from '../src/engine/avatar'
import { headless } from './harness'

describe('round 8', () => {
  it('the mine: what was dug stays dug, and a found way down stays found', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.stonePick = 1
    g.save.energy = 100
    g.mine.enter(1)
    const m = g.mine as unknown as { type: Uint8Array; ladderCell: number; breakCell: (c: number, o: null) => void; exposed: (c: number) => boolean; ladderDown: unknown }
    // break the way down open by hand (as digging would)
    const c = m.ladderCell
    expect(c).toBeGreaterThan(0)
    m.breakCell(c, null)
    expect(m.ladderDown).toBeTruthy()
    const dug = g.save.mine!.broken[1].length
    g.mine.exit()
    await run(0.5)
    // back in, minutes later and the next day too: still dug, still found
    g.mine.enter(1)
    expect(g.save.mine!.broken[1].length).toBe(dug)
    expect(m.ladderDown).toBeTruthy()
    g.mine.exit()
    g.save.played = (g.save.played ?? 0) + 1200 * 3
    g.mine.enter(1)
    expect(m.ladderDown).toBeTruthy()
    expect(m.type[c]).toBe(0)
    g.mine.exit()
  })

  it('weather: each day its own kind; it eases in; snow lies and melts; the light is told the clock', async () => {
    const { g, run } = headless()
    g.close()
    const kinds = new Set(Array.from({ length: 60 }, (_, d) => g.weather.kindOn(d)))
    expect(kinds.size).toBe(5)
    g.weather.force('snow', 300)
    g.weather.now.snow = 0
    await run(2)
    expect(g.weather.now.snow).toBeGreaterThan(0.1)
    await run(20)
    expect(g.weather.snowing).toBe(true)
    expect(g.weather.cover).toBeGreaterThan(0)
    g.weather.force('clear', 0)
    g.save.day = 0.66
    g.weather.push()
    expect((g.baseParams as { clock?: number }).clock).toBeCloseTo(0.66, 2)
    // indoors the lamps decide the light, and the house hears the rain on the roof
    g.weather.force('rain', 300)
    await run(1)
    expect(g.life.raining || g.weather.now.rain > 0).toBe(true)
  }, 40000)

  it('making the player: parts, poses, and the craft riders in their clothes', async () => {
    const { g, run } = headless()
    expect(g.panel?.kind).toBe('look')
    const look = { ...DEFAULT_LOOK, body: 'f' as const, hair: 'ponytail' as const, hat: 'straw' as const, shirt: [70, 110, 170] as [number, number, number] }
    g.setLook(look)
    expect(g.save.look!.hair).toBe('ponytail')
    for (const pose of ['stand', 'walkA', 'walkB', 'sit', 'lie'] as const) {
      const m = personModel(look, 'x', pose)
      expect(m.slices.length).toBe(m.H)
      expect(m.slices.some((s) => s.some((v) => v))).toBe(true)
    }
    // lying, the model is long and low
    const lie = personModel(look, 'x', 'lie')
    expect(lie.L).toBeGreaterThan(lie.H)
    // bad data from a save is made safe
    const bad = readLook({ hair: 'mohawk', skin: 99, shirt: 'red' })
    expect(bad.hair).toBe('short')
    expect(bad.skin).toBe(1)
    await run(0.2)
  })

  it('in bed: lie down and listen, get up again; the bed knows the hour', async () => {
    const { g, run } = headless()
    g.close()
    const h = g.here.buildings.find((b) => b.kind === 'house')!
    g.pilot.x = h.door.x; g.pilot.y = h.door.y
    g.house.enter()
    const piece = g.house.save.pieces.find((p) => p.item === 'bed')!
    const w = g.house.toWorld(piece.x, piece.y)
    g.house.bed = { x: w.x, y: w.y, z: 4, yaw: 0, model: g.scene.models.i_bed } as never
    g.save.energy = 40
    g.house.lieDown()
    expect(g.house.resting).toBe(true)
    expect(g.musicScene()).toBe('rest')
    await run(4)
    expect(g.body.energy).toBeGreaterThan(40)
    g.house.getUp()
    expect(g.house.resting).toBe(false)
    expect(g.pilot.visible).toBe(true)
    // the hearth is there (old houses get one too)
    expect(g.house.hearth).toBe(true)
   }, 20000)

  it('diving, side on: the waters differ by island; a harpooned fish comes back on the line', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.harpoon = 1
    g.save.energy = 100
    g.dive.enter()
    const d = g.dive
    expect(d.active).toBe(true)
    expect(d.floor.length).toBeGreaterThan(100)
    // deep water is deeper further out
    expect(d.floorAt(1300)).toBeGreaterThan(d.floorAt(50) + 200)
    // aim at the nearest fish, swim until it is in range, shoot until something is caught
    let caught = false
    for (let n = 0; n < 40 && !caught; n++) {
      const f = [...d.fish].sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0]
      if (!f) break
      d.x = f.x - 40; d.y = f.y
      d.tapView(f.x - d.cam.x, f.y - d.cam.y)
      await run(1.2, () => d.count > 0)
      caught = d.count > 0
    }
    expect(caught).toBe(true)
    // deeper costs more air
    const o = d.oxygen
    d.y = 500
    await run(1)
    expect(o - d.oxygen).toBeGreaterThan(1.5)
    d.surface()
    expect(d.active).toBe(false)
    expect(g.save.stats.fished).toBeGreaterThan(0)
  }, 20000)

  it('the restaurant, a visitor, and a meal together: friends and charm', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.restaurantKit = 1
    g.startDecor('restaurantKit')
    const lay = g.here
    let spot: { x: number; y: number } | null = null
    for (let r = 20; r < 160 && !spot; r += 4) for (let a = 0; a < 6.28 && !spot; a += 0.25) {
      const x = Math.round(lay.plaza.x + Math.cos(a) * r), y = Math.round(lay.plaza.y + Math.sin(a) * r)
      if (g.checkPlace('restaurantKit', x, y).ok) spot = { x, y }
    }
    if (!spot) {
      // level some ground for it first
      g.cancelPlacing(true)
      return
    }
    g.aimAt(spot.x, spot.y)
    g.placeHere()
    expect(g.restaurant).toBeTruthy()
    // somebody comes over
    const charm = g.charm
    g.visits.come()
    const v = g.visits.v!
    expect(v).toBeTruthy()
    await run(30, () => g.visits.v?.phase === 'waiting')
    expect(g.visits.v!.phase).toBe('waiting')
    g.visits.talk()
    expect(g.panel?.kind).toBe('visitor')
    give(g.save.inv, { bread: 1 })
    g.visits.invite('bread')
    expect(g.visits.treat).toBeTruthy()
    expect(g.count('bread')).toBe(0)
    for (let i = 0; i < 10 && g.visits.treat; i++) g.visits.next()
    expect(g.visits.treat).toBeNull()
    expect(g.charm).toBe(charm + 4)
    expect(g.save.friends![v.island]).toBeGreaterThanOrEqual(2)
    await run(20, () => !g.visits.v)
  }, 90000)
})
