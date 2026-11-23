import { describe, expect, it } from 'vitest'
import { findPath, floodReach, slide } from '../src/game/nav'
import type { WorldApi } from '../src/game/world'

/** a tiny world drawn in text: '.' ground, '#' solid, '~' water, digits = height */
function world(rows: string[]): WorldApi {
  const at = (x: number, y: number) => rows[Math.round(y)]?.[Math.round(x)] ?? '~'
  return {
    N: 64,
    heightAt: (x, y) => { const c = at(x, y); return c >= '0' && c <= '9' ? +c : 0 },
    matAt: () => 6,
    isWater: (x, y) => at(x, y) === '~',
    solidAt: (x, y) => at(x, y) === '#',
    islandAt: () => 0,
    block: () => {},
    delta: (a, b) => a - b,
    norm: (v) => v,
    place: () => null,
    remove: () => {},
  }
}

describe('walking', () => {
  it('goes straight across open ground', () => {
    const w = world(['..........', '..........', '..........'])
    const path = findPath(w, { x: 0, y: 1 }, { x: 9, y: 1 })!
    expect(path).toEqual([{ x: 9, y: 1 }])
  })

  it('walks round a wall', () => {
    const w = world([
      '..........',
      '....#.....',
      '....#.....',
      '....#.....',
      '..........',
    ])
    const path = findPath(w, { x: 1, y: 2 }, { x: 8, y: 2 })!
    expect(path[path.length - 1]).toEqual({ x: 8, y: 2 })
    expect(path.length).toBeGreaterThan(1)
    for (const p of path) expect(w.solidAt(p.x, p.y)).toBe(false)
  })

  it('stops as close as it can get to something it cannot reach', () => {
    const w = world([
      '.....~....',
      '.....~....',
      '.....~....',
    ])
    const path = findPath(w, { x: 0, y: 1 }, { x: 9, y: 1 })!
    expect(path[path.length - 1]).toEqual({ x: 4, y: 1 })
  })

  it('stops beside a tree, not in it', () => {
    const w = world([
      '..........',
      '......###.',
      '......###.',
      '......###.',
      '..........',
    ])
    const path = findPath(w, { x: 0, y: 2 }, { x: 7, y: 2 }, 2.2)!
    const end = path[path.length - 1]
    expect(w.solidAt(end.x, end.y)).toBe(false)
    expect(Math.hypot(end.x - 7, end.y - 2)).toBeLessThanOrEqual(2.2)
  })

  it('hops up a terrace but not up a cliff', () => {
    const terrace = world(['0000444444'])
    expect(findPath(terrace, { x: 0, y: 0 }, { x: 9, y: 0 })).toEqual([{ x: 9, y: 0 }])
    const cliff = world(['0000999999'])
    expect(findPath(cliff, { x: 0, y: 0 }, { x: 9, y: 0 })![0]).toEqual({ x: 3, y: 0 })
  })

  it('knows what can be reached', () => {
    const w = world([
      '....~.....',
      '....~.....',
      '....~.....',
    ])
    const reach = floodReach(w, 1, 1, 12)
    expect(reach(3, 2)).toBe(true)
    expect(reach(6, 1)).toBe(false)
  })

  it('slides along a wall when walking with the keys', () => {
    const w = world([
      '.....#....',
      '.....#....',
      '.....#....',
    ])
    expect(slide(w, { x: 4, y: 1 }, 1, 0)).toEqual({ x: 4, y: 1 }) // straight into it: stays put
    expect(slide(w, { x: 4, y: 1 }, 1, 1)).toEqual({ x: 4, y: 2 }) // at an angle: slides along it
  })
})
