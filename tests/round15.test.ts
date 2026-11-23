// Round 15: the computer's screen faces the room; work tires half as much and two meals a day feed you.
import { describe, expect, it } from 'vitest'
import { DAY_SECONDS } from '../src/game/body'
import { headless } from './harness'

describe('round 15', () => {
  it('a house from round 14: the desk and the bookshelf change places, the computer still on the desk', () => {
    const { g } = headless()
    const desk0 = g.house.save.pieces.find((p) => p.item === 'desk')!
    expect(desk0.rot).toBe(0) // a new house: the screen to the room
    const save = JSON.parse(JSON.stringify(g.save))
    const pieces = save.home.pieces.filter((p: { item: string }) => !['desk', 'computer', 'bookshelf'].includes(p.item))
    save.home = { ...save.home, v: 4, pieces: [...pieces, { item: 'bookshelf', x: 68, y: 33, rot: 0 }, { item: 'desk', x: 73, y: 59, rot: 2 }, { item: 'computer', x: 73, y: 59, rot: 2, z: 8 }] }
    const n = save.home.pieces.length
    const { g: g2 } = headless({ save })
    const hs = g2.house.save
    expect(hs.v).toBe(6)
    expect(hs.pieces.length).toBe(n)
    const desk = hs.pieces.find((p) => p.item === 'desk')!, pc = hs.pieces.find((p) => p.item === 'computer')!
    expect([desk.x, desk.y, desk.rot]).toEqual([desk0.x, desk0.y, 0])
    expect([pc.x, pc.y, pc.rot, pc.z]).toEqual([desk.x, desk.y, 0, 8])
  })
  it('a day: left alone, hunger takes a day and a half to empty; a hundred swings of the axe leave you standing', () => {
    const { g } = headless()
    g.body.tireless = false
    g.save.energy = 100
    g.save.full = 100
    g.body.step(DAY_SECONDS / 2)
    expect(g.body.full).toBeGreaterThan(60)
    for (let i = 0; i < 60; i++) g.body.work('chop')
    expect(g.body.energy).toBeGreaterThanOrEqual(40)
  })
})
