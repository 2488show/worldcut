// Minesweeper, on the computer at home (round 13). The board is the classic one: the first cell
// opened is never a mine (nor are its neighbours), numbers count the mines around, a flag marks
// one, opening a number whose flags are all down opens the rest around it. A cleared board is paid
// for — the first few of each day only, so it is a pastime and not a trade.
import type { Game } from './game'
import { $t } from '../i18n'

export type SweepLevel = 'easy' | 'mid' | 'hard'
export const SWEEP: Record<SweepLevel, { w: number; h: number; mines: number; pay: number; name: string }> = {
  easy: { w: 9, h: 9, mines: 10, pay: 15, name: $t('初级') },
  mid: { w: 12, h: 12, mines: 24, pay: 40, name: $t('中级') },
  hard: { w: 16, h: 14, mines: 40, pay: 90, name: $t('高级') },
}
/** wins that pay, a day */
export const PAID_A_DAY = 3

export class Board {
  readonly w: number
  readonly h: number
  readonly mines: number
  /** per cell: a mine; opened; flagged; how many mines are next to it */
  mine: Uint8Array
  open: Uint8Array
  flag: Uint8Array
  near: Uint8Array
  state: 'ready' | 'play' | 'won' | 'lost' = 'ready'
  /** the mine that went off */
  boom = -1
  constructor(public level: SweepLevel, private rnd: () => number = Math.random) {
    const L = SWEEP[level]
    this.w = L.w
    this.h = L.h
    this.mines = L.mines
    const n = L.w * L.h
    this.mine = new Uint8Array(n)
    this.open = new Uint8Array(n)
    this.flag = new Uint8Array(n)
    this.near = new Uint8Array(n)
  }
  private around(i: number): number[] {
    const x = i % this.w, y = Math.floor(i / this.w)
    const out: number[] = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h) out.push(ny * this.w + nx)
    }
    return out
  }
  /** lay the mines, away from the first cell opened */
  private lay(first: number) {
    const keep = new Set([first, ...this.around(first)])
    let left = this.mines
    for (let tries = 0; left > 0 && tries < 20000; tries++) {
      const i = Math.floor(this.rnd() * this.w * this.h)
      if (keep.has(i) || this.mine[i]) continue
      this.mine[i] = 1
      left--
    }
    // (a stuck random source: the rest go in order)
    for (let i = 0; left > 0 && i < this.mine.length; i++) if (!keep.has(i) && !this.mine[i]) { this.mine[i] = 1; left-- }
    for (let i = 0; i < this.mine.length; i++) this.near[i] = this.around(i).filter((j) => this.mine[j]).length
  }
  get flags() { return this.flag.reduce((a, b) => a + b, 0) }
  /** open a cell (an opened number with all its flags down opens the rest round it) */
  reveal(i: number) {
    if (this.state === 'won' || this.state === 'lost' || this.flag[i]) return
    if (this.state === 'ready') { this.lay(i); this.state = 'play' }
    if (this.open[i]) {
      const ar = this.around(i)
      if (this.near[i] && ar.filter((j) => this.flag[j]).length === this.near[i]) for (const j of ar) if (!this.open[j] && !this.flag[j]) this.openOne(j)
    } else this.openOne(i)
    this.check()
  }
  private openOne(i: number) {
    if (this.state === 'lost') return
    if (this.mine[i]) { this.state = 'lost'; this.boom = i; return }
    const todo = [i]
    while (todo.length) {
      const k = todo.pop()!
      if (this.open[k] || this.flag[k]) continue
      this.open[k] = 1
      if (!this.near[k]) for (const j of this.around(k)) if (!this.open[j] && !this.mine[j]) todo.push(j)
    }
  }
  toggleFlag(i: number) {
    if (this.state !== 'play' && this.state !== 'ready') return
    if (this.open[i]) return
    this.flag[i] = this.flag[i] ? 0 : 1
  }
  private check() {
    if (this.state !== 'play') return
    let shut = 0
    for (let i = 0; i < this.open.length; i++) if (!this.open[i]) shut++
    if (shut === this.mines) {
      this.state = 'won'
      for (let i = 0; i < this.mine.length; i++) if (this.mine[i]) this.flag[i] = 1
    }
  }
}

/** a board cleared: the best time kept, and (the first few times a day) a little money */
export function settle(g: Game, level: SweepLevel, secs: number): { coins: number; best: boolean; left: number } {
  const s = (g.save.sweep ??= { best: {}, paidDay: -1, paid: 0 })
  if (s.paidDay !== g.clockDay) { s.paidDay = g.clockDay; s.paid = 0 }
  const was = s.best[level]
  const best = was === undefined || secs < was
  if (best) s.best[level] = secs
  let coins = 0
  if (s.paid < PAID_A_DAY) {
    coins = SWEEP[level].pay
    s.paid++
    g.save.coins += coins
    g.sfx('buy')
  } else g.sfx('done')
  g.changed()
  return { coins, best, left: Math.max(0, PAID_A_DAY - s.paid) }
}
