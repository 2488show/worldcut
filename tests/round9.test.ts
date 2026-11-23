// Round 9: practice (熟练度); the morning post; a visitor in the house, judging it; the weekly cosiness prize.
import { describe, expect, it } from 'vitest'
import { give } from '../src/game/data'
import { LEVEL_XP, levelFor } from '../src/game/skills'
import { starsFor } from '../src/game/house'
import { headless } from './harness'

describe('round 9', () => {
  it('practice: work done is experience, and each level makes that work cheaper', async () => {
    const { g } = headless()
    g.close()
    g.body.tireless = false
    expect(g.skills.level('chop')).toBe(0)
    expect(levelFor(LEVEL_XP[3])).toBe(3)
    // a swing of the axe is practice
    g.save.energy = 100
    expect(g.body.work('chop')).toBe(true)
    expect(g.body.energy).toBe(99)
    expect(g.skills.xp('chop')).toBe(1)
    // ten levels' practice: half the strength
    const fx: string[] = []
    g.onFx = (e) => fx.push(e.t === 'celebrate' ? e.title : e.t)
    g.skills.gain('chop', LEVEL_XP[10])
    expect(g.skills.level('chop')).toBe(10)
    expect(fx.some((t) => t.includes('伐木升到 10 级'))).toBe(true)
    g.save.energy = 100
    g.body.work('chop')
    expect(g.body.energy).toBe(99.5)
    expect(g.skills.has('chop', 1)).toBe(true)
    // the other kinds of work are not helped by chopping
    expect(g.skills.effort('mine')).toBe(1)
    expect(g.skills.extra('chop')).toBeCloseTo(0.3)
  })

  it('practice: a practised cook sometimes makes two; fishing and farming learn too', async () => {
    const { g } = headless()
    g.close()
    g.skills.gain('cook', LEVEL_XP[10])
    let two = 0
    for (let i = 0; i < 30; i++) {
      give(g.save.store!, { wheat: 3 })
      const before = g.count('bread')
      g.body.cook('bread')
      if (g.count('bread') - before === 2) two++
      g.save.inv.bread = 0
    }
    expect(two).toBeGreaterThan(3)
    expect(g.skills.xp('cook')).toBeGreaterThan(LEVEL_XP[10])
    g.skills.gain('fish', 1)
    expect(g.skills.xp('fish')).toBe(1)
  })

  it('the post: a first letter, thanks after a delivery, the flag up while unread', async () => {
    const { g, run } = headless()
    g.close()
    await run(0.2)
    // the first morning: a letter from the gull
    expect(g.mail.letters.length).toBe(1)
    expect(g.mail.letters[0].kind).toBe('welcome')
    expect(g.mail.unread).toBe(1)
    expect(g.mail.box).toBeTruthy()
    expect(g.mail.box!.model.name).toBe('mailbox_up')
    // read it, take what came with it: the flag comes down
    const l = g.mail.letters[0]
    g.mail.read(l)
    const berries = g.count('berry')
    g.mail.take(l)
    expect(g.count('berry')).toBe(berries + 3)
    g.mail.take(l)
    expect(g.count('berry')).toBe(berries + 3)
    await run(0.2)
    expect(g.mail.box!.model.name).toBe('mailbox')
    // a delivery to an islander: the next morning, their thanks
    const id = 'peak'
    g.save.friends = { ...(g.save.friends ?? {}), [id]: (g.save.friends?.[id] ?? 0) + 1 }
    g.save.played = (g.clockDay + 1) * 1200 + 10
    await run(0.2)
    const thanks = g.mail.letters.find((x) => x.kind === 'thanks')
    expect(thanks).toBeTruthy()
    expect(thanks!.island).toBe(id)
    expect(thanks!.gift).toBeTruthy()
    expect(g.mail.unread).toBeGreaterThan(0)
  })

  it('a visitor in the house: they sit in the guests corner and give it stars; a letter the next morning', async () => {
    const { g, run } = headless()
    g.close()
    await run(0.2)
    g.visits.come()
    await run(30, () => g.visits.v?.phase === 'waiting')
    const v = g.visits.v!
    g.visits.talk()
    expect(g.panel?.kind).toBe('visitor')
    const friends = g.save.friends?.[v.island] ?? 0
    g.visits.home()
    expect(g.house.active).toBe(true)
    expect(g.visits.treat?.kind).toBe('parlour')
    const stars = g.visits.treat!.stars!
    expect(stars).toBe(starsFor(g.house.cosiness().score))
    expect(stars).toBe(3) // the furniture the house starts with
    for (let i = 0; i < 10 && g.visits.treat; i++) g.visits.next()
    expect(g.visits.treat).toBeNull()
    expect(g.save.friends![v.island]).toBe(friends + 1)
    expect(g.save.stats.hosted).toBe(1)
    // they let themselves out and go
    await run(40, () => !g.visits.v)
    expect(g.visits.v).toBeNull()
    // the next morning, their letter
    g.save.played = (g.clockDay + 1) * 1200 + 10
    await run(0.2)
    expect(g.mail.letters.some((l) => l.kind === 'guest' && l.from === v.name)).toBe(true)
  }, 30000)

  it('the weekly judging: stars from cosiness, and a prize for four', async () => {
    const { g, run } = headless()
    g.close()
    await run(0.2)
    expect(starsFor(50)).toBe(1)
    expect(starsFor(97)).toBe(3)
    expect(starsFor(140)).toBe(5)
    // more furniture: a bathtub, shelves, plants and lamps take the house to four stars
    const pieces = g.house.save.pieces
    pieces.push({ item: 'bathtub', x: 80, y: 30, rot: 0 }, { item: 'bookshelf', x: 20, y: 52, rot: 0 }, { item: 'pottedPlant', x: 100, y: 54, rot: 0 }, { item: 'pottedPlant', x: 4, y: 40, rot: 0 }, { item: 'floorLamp', x: 4, y: 96, rot: 0 }, { item: 'floorLamp', x: 145, y: 96, rot: 0 }, { item: 'rug', x: 120, y: 90, rot: 0 })
    expect(starsFor(g.house.cosiness().score)).toBe(4)
    g.save.played = 7 * 1200 + 10
    await run(0.2)
    const j = g.mail.letters.find((l) => l.kind === 'cosy')
    expect(j).toBeTruthy()
    expect(j!.title).toContain('★★★★☆')
    expect(j!.gift).toBeTruthy()
    expect(j!.coins).toBe(200)
    const coins = g.save.coins
    g.mail.take(j!)
    expect(g.save.coins).toBe(coins + 200)
    // not again until next week
    const n = g.mail.letters.filter((l) => l.kind === 'cosy').length
    g.save.played = 8 * 1200 + 10
    await run(0.2)
    expect(g.mail.letters.filter((l) => l.kind === 'cosy').length).toBe(n)
  })
})
