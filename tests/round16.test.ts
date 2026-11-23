// Round 16: small outside, bigger inside. A new game's house is a log cabin; it grows to a cottage,
// then two storeys, then three. The rooms are a place of their own out at sea (a plot of garden,
// the sea round it), the stairs are walked up and down, and furniture can be carried up them. Also:
// the little stove in the bedroom, the day's small wish, the guestbook and the frames on the wall.
import { describe, expect, it } from 'vitest'
import { FURNITURE, type ItemId } from '../src/game/data'
import { HUT_ITEMS, STARTER_ITEMS } from '../src/game/house'
import { DAY_SECONDS } from '../src/game/body'
import { headless } from './harness'

type H = { check: (item: string, x: number, y: number, rot: number, z?: number) => { ok: boolean; why: string }; moving: unknown; floors: { n: number }[]; actors: { piece: { item: string; f?: number }; a: { visible: boolean; scale: number; model: { name: string } } }[]; hdOn: unknown[]; hidden: unknown[] }

/** everything the player has of the house's furniture: set out, and in the box */
function tally(g: ReturnType<typeof headless>['g']) {
  const out: Record<string, number> = {}
  for (const p of g.house.save.pieces) out[p.item] = (out[p.item] ?? 0) + 1
  for (const [k, n] of Object.entries(g.house.save.box ?? {})) out[k] = (out[k] ?? 0) + (n ?? 0)
  return out
}

describe('round 16: the house grows', () => {
  it('a new game: a log cabin on the island, a room bigger than it out at sea, every piece where a piece may stand', async () => {
    const { g, run } = headless({}, 1000, 'hut')
    expect(g.house.tier).toBe(0)
    expect(g.house.save.v).toBe(6)
    expect(g.house.save.pieces.map((p) => p.item).sort()).toEqual([...HUT_ITEMS].sort())
    const b = g.layouts.home.buildings.find((x) => x.kind === 'house')!
    // small outside: the building is a cabin a few strides across
    expect(Math.max(b.w, b.h)).toBeLessThan(30)
    const h = g.house as unknown as H
    const bad: string[] = []
    for (const p of g.house.save.pieces) {
      h.moving = { piece: p, from: {}, riders: [] }
      const r = h.check(p.item, p.x, p.y, p.rot, p.z ?? 0)
      if (!r.ok) bad.push(`${p.item}: ${r.why}`)
    }
    h.moving = null
    expect(bad).toEqual([])
    // in at the door: the rooms are somewhere else entirely (the island is far off), and bigger than the building
    const was = { x: g.pilot.x, y: g.pilot.y }
    g.walkTo(g.house.doorOutside(), 2, () => g.house.enter())
    await run(20, () => g.house.active)
    expect(g.house.active).toBe(true)
    expect(Math.hypot(g.world.delta(g.pilot.x, was.x), g.world.delta(g.pilot.y, was.y))).toBeGreaterThan(300)
    const room = g.house.roomAt(26, 19)!
    expect(room.id).toBe('hut')
    expect((room.x1 - room.x0 + 1) * (room.y1 - room.y0 + 1)).toBeGreaterThan(b.w * b.h * 2)
    // the rain stays outside (the room is dry), the garden and the sea round it are not
    expect(g.house.dryBox()).toBeTruthy()
    const yard = g.house.toWorld(26, 39 + 3 + 10)
    expect(g.world.isWater(Math.round(yard.x), Math.round(yard.y))).toBe(false)
    const sea = g.house.toWorld(26, 39 + 3 + 40)
    expect(g.world.isWater(Math.round(sea.x), Math.round(sea.y))).toBe(true)
    // and out of the door again, onto the island
    g.house.exit()
    expect(g.house.active).toBe(false)
    expect(Math.hypot(g.pilot.x - b.door.x, g.pilot.y - b.door.y)).toBeLessThan(8)
  }, 30000)

  it('growing: the island must be big enough and it costs; the cabin\'s furniture moves in, nothing is lost', () => {
    const { g } = headless({}, 1000, 'hut')
    expect(g.house.nextUp()!.ok).toBe(false)
    expect(g.house.grow()).toBe(false)
    g.save.level = 2
    g.save.coins = 1000
    g.save.inv = { ...g.save.inv, plank: 20, stone: 15 }
    expect(g.house.nextUp()!.ok).toBe(true)
    const before = tally(g)
    expect(g.house.grow()).toBe(true)
    expect(g.house.tier).toBe(1)
    expect(g.save.coins).toBe(700)
    expect(g.count('plank')).toBe(0)
    const after = tally(g)
    // all the cabin's pieces are still the player's, and the cottage's own came with it
    for (const [k, n] of Object.entries(before)) expect(after[k] ?? 0, k).toBeGreaterThanOrEqual(n)
    for (const it of STARTER_ITEMS) expect(after[it] ?? 0, it).toBeGreaterThan(0)
    // the building on the island is bigger now
    const b = g.layouts.home.buildings.find((x) => x.kind === 'house')!
    expect(Math.max(b.w, b.h)).toBeGreaterThan(30)
  })

  it('two storeys: the bedroom goes upstairs; the stairs are climbed; a piece is carried up them', async () => {
    const { g, run } = headless()
    g.house.growTo(2)
    expect(g.house.tier).toBe(2)
    expect(g.house.floorCount).toBe(2)
    const bed = g.house.save.pieces.find((p) => p.item === 'bed')!
    expect(bed.f).toBe(1)
    expect(g.house.save.pieces.find((p) => p.item === 'woodStove')!.f).toBe(1)
    // downstairs the bedroom is the study now, with the stairs in it
    g.house.enter()
    expect(g.house.roomAt(10, 10)!.name).toBe('书房')
    // nothing stands where the stairs are (or on the way to them)
    const h = g.house as unknown as H
    expect(g.house.check('pottedPlant', 27, 9, 0).ok).toBe(false)
    expect(g.house.check('pottedPlant', 27, 18, 0).ok).toBe(false)
    // up the stairs: a tap on them walks there and climbs
    g.house.climb(1)
    expect(g.house.cur).toBe(1)
    expect(g.house.roomAt(10, 10)!.id).toBe('bed')
    // the bed lies under the window to the sea: water beyond the north wall, not land
    const north = g.house.toWorld(20, -3 - 12)
    expect(g.world.isWater(Math.round(north.x), Math.round(north.y))).toBe(true)
    // carry the armchair down: pick it up, go down, set it down in the living room
    const chair = g.house.save.pieces.find((p) => p.item === 'armchair')!
    expect(chair.f).toBe(1)
    g.house.decorating = true
    g.house.pickUp(chair)
    g.house.climb(0)
    expect(g.house.cur).toBe(0)
    expect(g.house.moving?.piece).toBe(chair)
    const sn = g.house.snap('armchair', 30, 45, 0, true)
    g.house.dropMove(sn.x, sn.y, sn.rot, sn.z)
    expect(chair.f).toBe(0)
    expect(h.actors.some((e) => e.piece === chair)).toBe(true)
    await run(0.2)
  }, 30000)

  it('three storeys: the attic, with its own furniture; the house as a whole is still five stars of cosy at most', () => {
    const { g } = headless()
    g.house.growTo(3)
    expect(g.house.floorCount).toBe(3)
    expect(g.house.save.pieces.some((p) => p.item === 'rockingChair' && p.f === 2)).toBe(true)
    const notes = g.house.cosiness().notes.join(' ')
    expect(notes).toContain('阁楼')
    expect(notes).toContain('起居室')
  })

  it('a house from before round 16 is the cottage, and gets the little stove in the bedroom (the lamp steps aside)', () => {
    const { g } = headless()
    const save = JSON.parse(JSON.stringify(g.save))
    const pieces = save.home.pieces.filter((p: { item: string }) => !['woodStove', 'floorLamp'].includes(p.item))
    save.home = { pieces: [...pieces, { item: 'floorLamp', x: 30, y: 13, rot: 0 }], hearth: true, ticker: true, v: 5 }
    const n = save.home.pieces.length
    const { g: g2 } = headless({ save })
    const hs = g2.house.save
    expect(hs.v).toBe(6)
    expect(hs.tier).toBe(1)
    expect(hs.pieces.length).toBe(n + 1)
    const stove = hs.pieces.find((p) => p.item === 'woodStove')!
    expect(g2.house.roomAt(stove.x, stove.y)!.id).toBe('bed')
    const lamp = hs.pieces.find((p) => p.item === 'floorLamp')!
    expect([lamp.x, lamp.y]).toEqual([19, 22])
  })

  it('from bed: the pieces by it are drawn finer, and whatever stands in front of the camera steps aside', async () => {
    const { g, run } = headless({}, 1000, 'hut')
    g.house.enter()
    const h = g.house as unknown as H
    const e = h.actors.find((x) => x.piece.item === 'bed')!
    g.house.bed = e.a as never
    g.house.lieDown()
    await run(0.5)
    const fine = h.actors.filter((x) => x.a.scale === 0.5).map((x) => x.piece.item).sort()
    expect(fine).toContain('bed')
    expect(fine).toContain('woodStove')
    expect(e.a.model.name).toBe('i_bed_sleep_hd')
    // the desk with the computer stood between the camera and the bed in the cabin
    const desk = h.actors.find((x) => x.piece.item === 'desk')!
    expect(desk.a.visible).toBe(false)
    g.house.getUp()
    await run(2)
    expect(desk.a.visible).toBe(true)
    expect(h.actors.every((x) => x.a.scale === 1)).toBe(true)
    expect(e.a.model.name).toBe('i_bed')
  }, 30000)
})

describe('round 16: memories and wishes', () => {
  it('a small wish each morning from the third day: sent from the bag, a piece of furniture comes back', () => {
    const { g } = headless()
    g.wishes.morning()
    expect(g.save.wish).toBeUndefined() // (not on the first days)
    g.save.played = 3.2 * DAY_SECONDS
    g.wishes.morning()
    const w = g.wishes.open!
    expect(w).toBeTruthy()
    expect(g.mail.letters.some((l) => l.kind === 'wish')).toBe(true)
    expect(g.wishes.send()).toBe(false) // nothing to send yet
    g.save.inv = { ...g.save.inv, [w.item]: w.n }
    const had = g.count(w.gift as ItemId) + (g.house.save.box?.[w.gift as ItemId] ?? 0)
    expect(g.wishes.send()).toBe(true)
    expect(g.count(w.item)).toBe(0)
    expect(g.count(w.gift as ItemId) + (g.house.save.box?.[w.gift as ItemId] ?? 0)).toBe(had + 1)
    expect(FURNITURE[w.gift as ItemId]).toBeTruthy()
    expect(g.wishes.open).toBeNull()
  })

  it('the guestbook keeps what visitors wrote; a frame on the wall shows a picture from the album', async () => {
    const { g, settle } = headless()
    g.house.sign('阿澈', '茶很好喝，下次还来！')
    g.house.sign('Mio', '你家很温馨。')
    expect(g.house.save.book!.map((l) => l.who)).toEqual(['Mio', '阿澈'])
    // a frame, and a picture for it (the album is on the device: here, a made-up one)
    g.photoPixels = async (_id, w, h) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => [x * 20, y * 30, 120] as [number, number, number]))
    g.house.enter()
    const sn = g.house.snap('photoFrame', 44, 30, 0, false)
    expect(g.house.check('photoFrame', sn.x, sn.y, sn.rot, sn.z).ok).toBe(true)
    g.house.putNew('photoFrame', sn.x, sn.y, sn.rot, sn.z)
    const piece = g.house.save.pieces.find((p) => p.item === 'photoFrame')!
    g.house.setPhoto(piece, 1234)
    await settle()
    expect(piece.photo).toBe(1234)
    expect(g.scene.models.i_photo_1234).toBeTruthy()
    const h = g.house as unknown as H
    expect(h.actors.find((x) => x.piece === (piece as never))!.a.model.name).toBe('i_photo_1234')
  })
})
