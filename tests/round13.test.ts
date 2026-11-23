// Round 13: the computer on the desk (the stock machine become a computer; minesweeper that pays
// a little, a few times a day) and the tackle box (bait that is taken, lures that last, and what
// each brings to the hook).
import { describe, expect, it } from 'vitest'
import { ROD_FISH } from '../src/game/data'
import { Board, SWEEP, settle, PAID_A_DAY } from '../src/game/sweep'
import { BAITS } from '../src/game/tackle'
import { headless } from './harness'

describe('round 13: the computer', () => {
  it('minesweeper: the first cell is safe, numbers are right, clearing it wins', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const b = new Board('easy', rnd)
    b.reveal(40)
    expect(b.state).toBe('play')
    expect(b.mine[40]).toBe(0)
    expect(b.mine.reduce((a, x) => a + x, 0)).toBe(SWEEP.easy.mines)
    for (let i = 0; i < b.mine.length; i++) {
      const x = i % b.w, y = Math.floor(i / b.w)
      let n = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h && b.mine[ny * b.w + nx]) n++
      }
      expect(b.near[i]).toBe(n)
    }
    for (let i = 0; i < b.mine.length; i++) if (!b.mine[i]) b.reveal(i)
    expect(b.state).toBe('won')
  })
  it('a mine opened loses; flags stop a cell opening', () => {
    let sd = 11
    const b = new Board('easy', () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296))
    b.reveal(0)
    const m = b.mine.findIndex((x) => x === 1)
    b.toggleFlag(m)
    b.reveal(m)
    expect(b.state).toBe('play')
    b.toggleFlag(m)
    b.reveal(m)
    expect(b.state).toBe('lost')
  })
  it('a cleared board pays — the first few a day — and keeps the best time', () => {
    const { g } = headless()
    const c0 = g.save.coins
    for (let i = 0; i < PAID_A_DAY + 2; i++) settle(g, 'mid', 100 - i)
    expect(g.save.coins - c0).toBe(PAID_A_DAY * SWEEP.mid.pay)
    expect(g.save.sweep!.best.mid).toBe(100 - (PAID_A_DAY + 1))
  })
  it('the stock machine of an older house becomes the computer on the desk; a new house has one', () => {
    const { g } = headless()
    g.close()
    expect(g.house.save.pieces.some((p) => p.item === 'computer' && p.z)).toBe(true)
    expect(g.house.save.pieces.some((p) => p.item === 'stockMachine')).toBe(false)
    // a round-12 house, its stock machine standing in the guests' corner
    const pieces = g.house.save.pieces.filter((p) => p.item !== 'computer')
    g.save.home = { pieces: [...pieces, { item: 'stockMachine', x: 85, y: 52, rot: 1 }], hearth: true, ticker: true, v: 2, box: { stockMachine: 1 } }
    g.house.rebuild()
    const hs = g.house.save
    expect(hs.v).toBe(6)
    expect(hs.pieces.filter((p) => p.item === 'computer').length).toBe(1)
    expect(hs.box?.computer).toBe(1)
    expect(hs.pieces.some((p) => p.item === 'stockMachine') || hs.box?.stockMachine).toBeFalsy()
    // and the computer opens the computer
    const e = (g.house as unknown as { actors: { piece: { item: string }; a: unknown }[] }).actors.find((x) => x.piece.item === 'computer')!
    g.house.enter()
    ;(g.house as unknown as { goUse: (e: unknown) => void }).goUse(e)
  })
})

describe('round 13: the tackle box', () => {
  it('bait changes who bites; live bait is taken, a lure is kept', () => {
    const { g } = headless()
    g.save.inv.worm = 2
    g.save.inv.spinner = 1
    g.tackle.use('worm')
    expect(g.tackle.on).toBe('worm')
    expect(g.tackle.quick).toBeLessThan(1)
    g.tackle.taken()
    g.tackle.taken()
    expect(g.count('worm')).toBe(0)
    expect(g.tackle.on).toBe(null)
    g.tackle.use('spinner')
    g.tackle.taken()
    expect(g.count('spinner')).toBe(1)
    expect(g.tackle.like('mackerel')).toBeGreaterThan(2)
    // every bait names only real fish
    for (const d of Object.values(BAITS)) for (const f of Object.keys(d!.likes)) expect(ROD_FISH.some((x) => x.item === f)).toBe(true)
  })
  it('a shovel on flat grass turns up worms (most times)', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv.shovel = 1
    const p = g.pilot
    // find a flat grass spot near the pilot
    let spot: { x: number; y: number } | null = null
    for (let r = 6; r < 80 && !spot; r += 3) for (let a = 0; a < 12 && !spot; a++) {
      const x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r)
      if (g.baitUnder(x, y) === 'worm' && !g.checkShovel(x, y).ok) spot = { x, y }
    }
    expect(spot).toBeTruthy()
    let got = 0
    for (let i = 0; i < 6; i++) {
      const before = g.count('worm')
      g.shovelTap(spot!.x, spot!.y)
      await run(6)
      got += g.count('worm') - before
    }
    expect(got).toBeGreaterThan(0)
  }, 60000)
})

describe('round 13: an older save still opens', () => {
  it('a round-11 house (no layout version) is moved into the new rooms while the game is being made — before there is a player', () => {
    const { g } = headless()
    const save = JSON.parse(JSON.stringify(g.save))
    save.home = {
      pieces: [
        { item: 'bed', x: 12, y: 13, rot: 0 }, { item: 'sofa', x: 30, y: 90, rot: 2 }, { item: 'stockMachine', x: 10, y: 88, rot: 1 },
        { item: 'roundTable', x: 123, y: 64, rot: 0 }, { item: 'armchair', x: 100, y: 60, rot: 0 }, { item: 'paintingSea', x: 50, y: 0, rot: 0, z: 4 },
      ],
      hearth: true, ticker: true,
    }
    const { g: g2 } = headless({ save })
    const hs = g2.house.save
    expect(hs.v).toBe(6)
    const all = [...hs.pieces.map((p) => p.item), ...Object.entries(hs.box ?? {}).flatMap(([k, n]) => Array(n).fill(k))]
    for (const it of ['bed', 'sofa', 'roundTable', 'armchair', 'paintingSea', 'computer']) expect(all).toContain(it)
    expect(all).not.toContain('stockMachine')
  })
})
