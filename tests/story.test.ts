// The whole arc after the guide: chapters open and pay out, islanders become friends and hand
// over their pieces of the chart, the far shore appears on the chart, and landing there ends
// the story (and the game goes on).
import { describe, expect, it } from 'vitest'
import { migrate, newSave } from '../src/game/game'
import { give } from '../src/game/data'
import { CHAPTERS, FRIENDS, friendLevel } from '../src/game/story'
import { headless } from './harness'

describe('story', () => {
  it('an old save is brought up to date; a stranger\'s is refused', () => {
    const old = { ...newSave(5), v: 2 } as unknown
    const s = migrate(old)!
    expect(s.v).toBe(3)
    expect(migrate({ v: 1 })).toBeNull()
    expect(migrate(null)).toBeNull()
  })
  it('friendship comes in three steps', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(friendLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })

  it('plays from the end of the guide to the far shore', async () => {
    const { g, run, settle, fx, flyTo } = headless()
    g.close(); g.devGive(); g.close()
    const s = g.save
    // the guide is over once a first delivery has been made
    give(s.inv, { plank: 10, cloth: 6, copperIngot: 6 })
    g.buildVehicle('sparrow')
    await run(3); await settle()
    expect(g.story.view().open).toBe(false)
    s.stats.delivered = 1
    await run(1.2)
    expect(s.story?.ch).toBe(0)
    expect(g.quest().title).toContain('站稳脚跟')

    // ── chapter two
    const coins = s.coins
    s.stats.fished = 3
    g.mine.save.unlocked = 3
    s.decor = [{ item: 'bench', dx: 0, dy: 0 }, { item: 'bench', dx: 8, dy: 0 }, { item: 'bench', dx: 16, dy: 0 }]
    s.level = 2
    await run(1)
    expect(s.story?.ch).toBe(0) // three of four: not yet
    s.stats.delivered = 3
    await run(1.2)
    expect(s.story?.ch).toBe(1)
    expect(s.coins).toBe(coins + CHAPTERS[0].coins)
    expect(s.inv.table).toBe(1)
    expect(fx).toContain('celebrate2')

    // ── chapter three
    s.stats.dived = 1
    s.island.tier = 2
    s.level = 4
    s.visited = { peak: true, pine: true, reef: true, dune: true }
    s.stats.danger = 1
    await run(1.2)
    expect(s.story?.ch).toBe(2)

    // ── chapter four
    s.inv.ironPick = 1
    g.mine.save.unlocked = 7
    s.vehicles.push({ id: 'vf', type: 'falcon', at: 'home' })
    s.decor.push({ item: 'fountain', dx: 30, dy: 0 })
    await run(1.2)
    expect(s.story?.ch).toBe(3)
    expect(g.quest().title).toContain('海的那一边')

    // ── chapter five: the far shore is on nobody's chart
    expect(g.known('far')).toBe(false)
    expect(g.destinations()).not.toContain('far')
    for (const id of FRIENDS) {
      expect(g.story.landed(id, 2, false)?.gift).toBeTruthy() // level 1: a present
      const r = g.story.landed(id, 3, false)! // level 3: their piece of the chart
      expect(r.gift).toEqual({ chartPiece: 1 })
    }
    expect(g.count('chartPiece')).toBe(4)
    g.craft('seaChart')
    await run(3); await settle()
    expect(s.milestones.chart).toBe(true)
    expect(g.known('far')).toBe(true)
    expect(g.destinations()).toContain('far')
    expect((await g.backend.shop('far')).length).toBeGreaterThan(0)

    // ── and there it is
    const plane = s.vehicles.find((v) => v.type === 'sparrow')!
    await flyTo(plane.id, 'far')
    expect(s.here).toBe('far')
    expect(s.visited.far).toBe(true)
    await run(4); await settle()
    expect(s.story?.ended).toBe(true)
    expect((s.inv.keeperLamp ?? 0) + (s.store?.keeperLamp ?? 0)).toBe(1)
    expect(g.panel?.kind).toBe('ending')
    expect(g.quest().title).toBe('自由经营')
    // the game goes on: home is still a flight away
    g.close()
    await flyTo(plane.id, 'home')
    expect(s.here).toBe('home')
  }, 180000)
})
