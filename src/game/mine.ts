// The mine. Each island has one, a stack of levels under its hill.
//
// A level is a small grid of rock with a cave eaten into it. The pilot carries the only light.
// Rock is broken a block at a time with a pick; what a block holds only shows once it is
// exposed — break one and the blocks behind it come into view, sometimes with a vein in them.
// The way down is a ladder hidden under one of the blocks (a draught of dust falls from it for
// those who look), except at the level where the rock turns hard: there the ladder is in plain
// sight behind hard rock, and a better pick is the key. A level reached once can be gone
// straight down to from the surface. Levels grow back every quarter of an hour, differently.
//
// The level is built into an empty stretch of sea while the pilot is in it (it is drawn by the
// same renderer as the islands), and the sea is put back on the way out.

import { blank, type Stamp } from '../engine/stamps'
import { MAT } from '../engine/materials'
import { ITEMS, MINE_BANDS, MINE_GATES, ORES, give, toolName, toolTier, type Bag, type ItemId, type OreId } from './data'
import { TIERS, mulberry32 } from './world'
import type { Game, Label } from './game'
import { $t } from '../i18n'

const G = 21 // cells across a level
const CS = 10 // pixels across a cell
const EDGE = 9 // cells of solid rock round the level, so the light never finds the sea
const FLOOR = 4
const WALL = 6
const OPEN = 0
const ROCK = 1
const HARD = 2
const BED = 3
/** game days before new veins run through a level's rock (dug passages and a found ladder stay) */
const REGROW_DAYS = 2

export interface MineSave {
  /** the deepest level that can be gone straight down to */
  unlocked: number
  epoch: number
  /** level → the blocks broken since it last grew back */
  broken: Record<number, number[]>
  /** the rare ores that have had their ceremony */
  found: Partial<Record<OreId, true>>
  /** how many blocks have been broken, ever */
  dug: number
  /** level → the way down has been dug out (it stays found, even when the rock grows back) */
  ladder?: Record<number, true>
  /** level → the game day its rock last grew back, and how many times it has (new veins each time) */
  grown?: Record<number, number>
  growth?: Record<number, number>
}
export function newMineSave(): MineSave {
  return { unlocked: 1, epoch: 0, broken: {}, found: {}, dug: 0 }
}

const hash = (a: number, b: number, c: number) => {
  let n = (a * 374761393 + b * 668265263 + c * 1274126177) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

export class Mine {
  active = false
  level = 0
  private type = new Uint8Array(G * G)
  private ore: OreId[] = []
  private shown = new Uint8Array(G * G)
  private crack = new Float32Array(G * G)
  private saved: unknown = null
  private x0 = 0
  private y0 = 0
  private start = 0
  private ladderCell = -1
  private ladderDown: { x: number; y: number } | null = null
  private props: unknown[] = []
  private back = { x: 0, y: 0 }
  private wasTilted = true
  private wasYaw = 0
  private job: { c: number; hits: number; need: number; t: number; struck: boolean } | null = null
  /** how far through a swing of the pick (null: not digging) */
  get swing(): number | null {
    return this.job ? this.job.t / 0.44 : null
  }
  private hintT = 0
  private cell = blank('cell', CS, CS)
  private glow = 0

  constructor(private g: Game) {}

  get save(): MineSave {
    return (this.g.save.mine ??= newMineSave())
  }
  /** how many levels this island's mine has */
  get depth(): number {
    return TIERS[this.g.save.island.tier - 1].mine
  }
  /** what a level is like, for the list at the mouth of the mine */
  describe(level: number): string {
    const band = MINE_BANDS.find((b) => level <= b.upTo)!
    const names = (Object.keys(band.ore) as OreId[]).filter((o) => o !== 'stone').map((o) => ORES[o].name)
    const gate = MINE_GATES[level]
    return `${level <= 3 ? $t('浅层') : level <= 6 ? $t('中层') : $t('深层')} · ${names.join($t('、'))}${gate ? $t(' · 往下要{0}', toolName('pick', gate)) : ''}`
  }

  // ───────────────────────────────────────────────────────────── in and out
  enter(level: number) {
    const g = this.g
    if (level < 1 || level > Math.min(this.save.unlocked, this.depth)) return g.warn($t('还没挖到那一层'))
    if (!this.active) {
      this.back = { x: g.pilot.x, y: g.pilot.y }
      this.wasTilted = g.view3d
      this.wasYaw = g.camYaw
      g.view3d = false
      g.camYaw = 0
      g.scene.setIslandView(false)
    }
    g.panel = null
    g.stopWalking()
    this.build(level)
    this.active = true
    g.sfx('rumble')
    g.sfx('open', 0.6)
    g.toast($t('矿洞 第 {0} 层 · {1}', level, this.describe(level)))
    g.changed()
  }
  /** back up the ladder to the daylight */
  exit() {
    if (!this.active) return
    const g = this.g
    this.clear()
    this.active = false
    this.level = 0
    g.view3d = this.wasTilted
    g.camYaw = this.wasYaw
    g.scene.setIslandView(g.view3d)
    g.scene.setPost({ dark: 0 })
    g.stopWalking()
    const p = g.pilot
    p.x = this.back.x
    p.y = this.back.y
    p.z = g.world.heightAt(Math.round(p.x), Math.round(p.y))
    p.stretch = 1
    g.scene.setCamera({ x: p.x, y: p.y, alt: p.z, yaw: g.camYaw, zoom: g.islandZoom, snap: true })
    g.sfx('close', 0.7)
    g.sfx('done')
    g.changed()
  }
  private clear() {
    const g = this.g
    for (const a of this.props) g.scene.removeActor(a)
    this.props = []
    if (this.saved) g.world.remove(this.saved)
    this.saved = null
    this.job = null
    this.ladderDown = null
  }

  // ───────────────────────────────────────────────────────────── making a level
  private build(level: number) {
    const g = this.g
    this.clear()
    const s = this.save
    // The cave's shape and the way down are the level's own and never change, and what was dug
    // stays dug. Every couple of days new veins run through the rock that is left.
    const grown = (s.grown ??= {})
    const growth = (s.growth ??= {})
    if (grown[level] === undefined) grown[level] = g.clockDay
    if (g.clockDay - grown[level] >= REGROW_DAYS) {
      grown[level] = g.clockDay
      growth[level] = (growth[level] ?? 0) + 1
      g.after(0.6, () => g.toast($t('矿洞第 {0} 层的岩壁里长出了新的矿脉', level)))
    }
    this.level = level
    const rnd = mulberry32(g.save.island.seed * 131 + level * 7919)
    const oreRnd = mulberry32(g.save.island.seed * 977 + level * 104729 + (growth[level] ?? 0) * 7919)
    const type = this.type.fill(ROCK)
    const at = (x: number, y: number) => y * G + x
    const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < G - 1 && y < G - 1
    for (let i = 0; i < G; i++) type[at(i, 0)] = type[at(i, G - 1)] = type[at(0, i)] = type[at(G - 1, i)] = BED
    const carve = (x: number, y: number) => { if (inside(x, y)) type[at(x, y)] = OPEN }
    const room = (x: number, y: number, r: number) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) carve(x + i, y + j) }
    // the cave: a chamber at the foot of the ladder, and a few passages wandering off from it
    const sx = 10
    const sy = 16
    this.start = at(sx, sy)
    room(sx, sy, 1)
    const walkers = 4 + (level % 3)
    for (let w = 0; w < walkers; w++) {
      let x = sx
      let y = sy
      let dir = Math.floor(rnd() * 4)
      const steps = 9 + Math.floor(rnd() * 16)
      for (let n = 0; n < steps; n++) {
        if (rnd() < 0.32) dir = Math.floor(rnd() * 4)
        const nx = x + [1, -1, 0, 0][dir]
        const ny = y + [0, 0, 1, -1][dir]
        if (!inside(nx, ny) || nx < 2 || ny < 2 || nx > G - 3 || ny > G - 3) { dir = (dir + 1) % 4; continue }
        x = nx
        y = ny
        carve(x, y)
        if (rnd() < 0.07) room(x, y, 1)
      }
    }
    // how far each open cell is from the ladder, on foot
    const dist = new Int16Array(G * G).fill(-1)
    const queue = [this.start]
    dist[this.start] = 0
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q]
      for (const d of [1, -1, G, -G]) {
        const n = c + d
        if (type[n] === OPEN && dist[n] < 0) { dist[n] = dist[c] + 1; queue.push(n) }
      }
    }
    // the way down
    this.ladderCell = -1
    let pocket = -1
    if (level < this.depth) {
      const gate = MINE_GATES[level]
      if (gate) {
        // behind hard rock, in plain sight: off the end of the passage furthest from the ladder
        let best = -1
        for (const c of [...queue].reverse()) {
          const x = c % G
          const y = (c / G) | 0
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const px = x + dx * 2
            const py = y + dy * 2
            if (px < 2 || py < 2 || px > G - 3 || py > G - 3) continue
            let free = true
            for (let j = -1; j <= 1 && free; j++) for (let i = -1; i <= 1; i++) if (type[at(px + i, py + j)] !== ROCK) { free = false; break }
            if (free) { best = at(px, py); break }
          }
          if (best >= 0) break
        }
        if (best >= 0) {
          const px = best % G
          const py = (best / G) | 0
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) type[at(px + i, py + j)] = HARD
          type[best] = OPEN
          pocket = best
        }
      }
      if (pocket < 0) {
        // under a block at the edge of the cave, a fair walk from the ladder
        const cand: number[] = []
        for (const c of queue) {
          if (dist[c] < 6) continue
          for (const d of [1, -1, G, -G]) if (type[c + d] === ROCK) cand.push(c + d)
        }
        if (!cand.length) for (const c of queue) for (const d of [1, -1, G, -G]) if (type[c + d] === ROCK) cand.push(c + d)
        this.ladderCell = cand[Math.floor(rnd() * cand.length)] ?? -1
      }
    }
    // what each block holds: by depth and by how rich the island is, in clumps
    const band = MINE_BANDS.find((b) => level <= b.upTo)!
    const rich = g.layouts.home.def.rich.ore
    const table = (Object.keys(band.ore) as OreId[]).map((o) => [o, (band.ore[o] ?? 0) * (o === 'stone' ? 1 : rich)] as [OreId, number])
    const total = table.reduce((n, t) => n + t[1], 0)
    const pickOre = (): OreId => {
      let r = oreRnd() * total
      for (const [o, w] of table) { r -= w; if (r <= 0) return o }
      return 'stone'
    }
    this.ore = []
    for (let c = 0; c < G * G; c++) this.ore[c] = pickOre()
    for (let c = G + 1; c < G * G - G - 1; c++) if (this.ore[c] === 'stone' && oreRnd() < 0.3) this.ore[c] = this.ore[c + [1, -1, G, -G][Math.floor(oreRnd() * 4)]]
    if (this.ladderCell >= 0) this.ore[this.ladderCell] = 'stone'
    // what was dug out since the level last grew back stays dug out
    let found = pocket >= 0
    for (const c of s.broken[level] ?? []) {
      if (type[c] === ROCK || type[c] === HARD) type[c] = OPEN
      if (c === this.ladderCell) found = true
    }
    this.crack.fill(0)
    for (let c = 0; c < G * G; c++) this.shown[c] = this.exposed(c) ? 1 : 0

    // into the world: one big stamp over an empty stretch of sea
    const size = (G + EDGE * 2) * CS
    const st = blank('mine', size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = Math.floor(x / CS) - EDGE
        const cy = Math.floor(y / CS) - EDGE
        const o = y * size + x
        if (cx < 0 || cy < 0 || cx >= G || cy >= G) {
          st.rise[o] = FLOOR + WALL + 1
          st.mats[o] = MAT.caveDark
          st.solid[o] = 1
        } else this.pixel(st, o, at(cx, cy), x % CS, y % CS)
      }
    }
    const u = g.def.under
    this.saved = g.world.place(st, u.x, u.y, 0)
    this.x0 = Math.round(u.x - (size - 1) / 2) + EDGE * CS
    this.y0 = Math.round(u.y - (size - 1) / 2) + EDGE * CS

    // the ladder up, a torch beside it, and the pilot at its foot
    const sc = this.centre(this.start)
    const up = this.centre(this.start - G)
    this.props.push(g.scene.addActor('ladderUp', { x: up.x, y: up.y - 2, z: FLOOR, yaw: 0, shadow: false }))
    this.props.push(g.scene.addActor('torch', { x: up.x - 12, y: up.y - 3, z: FLOOR, yaw: 0, shadow: false }))
    this.props.push(g.scene.addActor('torch', { x: up.x + 12, y: up.y - 3, z: FLOOR, yaw: 0, shadow: false }))
    if (found) this.showLadder(pocket >= 0 ? pocket : this.ladderCell, false)
    const p = g.pilot
    p.x = sc.x
    p.y = sc.y
    p.z = FLOOR
    g.scene.setCamera({ x: p.x, y: p.y, alt: FLOOR, yaw: 0, zoom: 2, snap: true })
    this.light()
  }
  private centre(c: number) {
    return { x: this.x0 + (c % G) * CS + CS / 2 - 0.5, y: this.y0 + ((c / G) | 0) * CS + CS / 2 - 0.5 }
  }
  private exposed(c: number): boolean {
    const t = this.type
    return t[c] !== OPEN && (t[c + 1] === OPEN || t[c - 1] === OPEN || t[c + G] === OPEN || t[c - G] === OPEN)
  }
  /** one pixel of a cell: floor, plain rock, or rock with its vein and cracks showing */
  private pixel(st: Stamp, o: number, c: number, lx: number, ly: number) {
    const t = this.type[c]
    const h = hash(c, lx, ly)
    if (t === OPEN) {
      st.rise[o] = FLOOR
      st.mats[o] = h > 0.9 ? MAT.caveRubble : h > 0.7 ? MAT.caveFloorSpeck : MAT.caveFloor
      st.solid[o] = 0
      return
    }
    st.solid[o] = 1
    if (t === BED) {
      st.rise[o] = FLOOR + WALL + 1
      st.mats[o] = MAT.caveDark
      return
    }
    st.rise[o] = FLOOR + WALL
    if (t === HARD) {
      st.mats[o] = (lx + ly * 2) % 5 === 0 || h > 0.86 ? MAT.caveHardLight : MAT.caveHard
      return
    }
    let mat = h > 0.8 ? MAT.caveRockLight : MAT.caveRock
    const ore = this.ore[c]
    if (this.shown[c] && ore !== 'stone') {
      // the vein: each ore has its own colour and its own pattern (blobs, bands, flecks, shards)
      const v = hash(c, lx >> 1, ly >> 1)
      if (ore === 'copper' && v > 0.62) mat = h > 0.75 ? MAT.veinCopperGreen : MAT.veinCopper
      else if (ore === 'coal' && v > 0.6) mat = h > 0.85 ? MAT.veinCoalShine : MAT.veinCoal
      else if (ore === 'iron' && (lx + ly * 2 + c) % 6 < 2) mat = h > 0.7 ? MAT.veinIronLight : MAT.veinIron
      else if (ore === 'gold' && h > 0.7) mat = h > 0.9 ? MAT.veinGoldLight : MAT.veinGold
      else if (ore === 'crystal' && Math.abs(lx - 2 - ((c * 7) % 5)) <= (ly > 2 ? 1 : 0) && ly < 9) mat = ly < 4 ? MAT.veinCrystalLight : MAT.veinCrystal
      else if (ore === 'moon' && Math.hypot(lx - 4.5, ly - 4.5) < 3.4) mat = h > 0.6 ? MAT.veinMoonLight : MAT.veinMoon
    }
    // cracks spread from the middle as the block is worked
    const k = this.crack[c]
    if (k > 0) {
      const ang = Math.atan2(ly - 4.5, lx - 4.5)
      const spoke = Math.abs(((ang * 3) / Math.PI + hash(c, 1, 2) * 6) % 2 - 1)
      if (spoke < 0.22 && Math.hypot(lx - 4.5, ly - 4.5) < k * 7.5) mat = MAT.caveCrack
    }
    st.mats[o] = mat
  }
  /** redraws one cell where it stands */
  private paint(c: number) {
    const st = this.cell
    for (let ly = 0; ly < CS; ly++) for (let lx = 0; lx < CS; lx++) this.pixel(st, ly * CS + lx, c, lx, ly)
    const p = this.centre(c)
    this.g.world.place(st, p.x, p.y, 0)
  }
  private showLadder(c: number, fanfare: boolean) {
    const g = this.g
    const p = this.centre(c)
    this.ladderDown = p
    this.props.push(g.scene.addActor('ladderDown', { x: p.x, y: p.y, z: FLOOR, yaw: 0, shadow: false }))
    if (!fanfare) return
    g.sfx('reveal')
    g.scene.burst({ kind: 'star', x: p.x, y: p.y, z: FLOOR + 3, n: 18, speed: 20, up: 30, life: 0.8, mode: 'float', grav: -10 })
    g.celebrate(1, $t('找到了往下的梯子！'), $t('第 {0} 层：{1}', this.level + 1, this.describe(this.level + 1)))
  }

  // ───────────────────────────────────────────────────────────── each frame
  private light() {
    const g = this.g
    const p = g.pilot
    const far = g.count('lantern') > 0
    g.scene.setPost({ dark: 0.93, r0: far ? 46 : 30, r1: far ? 104 : 72, x: p.x, y: p.y, z: p.z + 6 })
  }
  step(dt: number) {
    const g = this.g
    this.light()
    // a thread of dust falls where the hidden ladder is
    this.hintT -= dt
    if (this.hintT <= 0 && this.ladderCell >= 0 && !this.ladderDown) {
      this.hintT = 0.5
      const p = this.centre(this.ladderCell)
      g.scene.burst({ kind: 'dust', x: p.x, y: p.y, z: FLOOR + WALL + 7, n: 1, speed: 2, up: -6, life: 0.9, mode: 'float', grav: 8, r: 3 })
    }
    // veins glint now and then
    this.glow -= dt
    if (this.glow <= 0) {
      this.glow = 0.35
      const c = Math.floor(g.rnd() * G * G)
      const ore = this.ore[c]
      if (this.type[c] === ROCK && this.shown[c] && ore !== 'stone' && ore !== 'coal') {
        const p = this.centre(c)
        g.scene.burst({ kind: ORES[ore].chips === 'crystal' ? 'crystal' : 'spark', x: p.x, y: p.y, z: FLOOR + WALL + 1, n: 1, speed: 3, up: 8, life: 0.5, mode: 'float', grav: 0, r: 3 })
      }
    }
    const j = this.job
    if (!j) return
    // the pilot: wind up, strike, recover (as on the surface)
    const swing = 0.44
    j.t += dt
    const ph = j.t / swing
    g.pilot.stretch = ph < 0.45 ? 1 + 0.14 * (ph / 0.45) : 1 - 0.16 * Math.max(0, 1 - (ph - 0.45) / 0.35)
    if (!j.struck && ph >= 0.45) {
      j.struck = true
      this.strike(j)
    }
    if (ph >= 1) {
      j.t = 0
      j.struck = false
    }
  }
  stop() {
    this.job = null
  }

  // ───────────────────────────────────────────────────────────── taps
  tap(bx: number, by: number) {
    const g = this.g
    const hit = g.scene.pick(bx, by)
    if (!hit) return
    const u = g.def.under
    const x = u.x + g.world.delta(hit.x, u.x)
    const y = u.y + g.world.delta(hit.y, u.y)
    const near = (p: { x: number; y: number } | null, r: number) => !!p && Math.hypot(x - p.x, y - p.y) < r
    const up = this.centre(this.start - G)
    if (near(up, 8)) {
      g.sfx('tap')
      return g.walkTo(this.centre(this.start), 3, () => this.exit())
    }
    if (near(this.ladderDown, 7)) {
      g.sfx('tap')
      return g.walkTo(this.ladderDown!, 9, () => this.descend())
    }
    const cx = Math.floor((x - this.x0) / CS)
    const cy = Math.floor((y - this.y0) / CS)
    if (cx < 0 || cy < 0 || cx >= G || cy >= G) return g.warn($t('这边是实心的山体'))
    const c = cy * G + cx
    const t = this.type[c]
    if (t === OPEN) return g.tapGround(x, y)
    g.sfx('tap')
    if (t === BED) return g.warn($t('这边是实心的山体'))
    if (!this.exposed(c)) return g.warn($t('够不着：先把挡在前面的岩石挖开'))
    const tier = toolTier(g.save.inv, 'pick')
    if (tier === 0) return g.warn($t('要有镐才挖得动。回地面，在工作台用树枝和卵石做一把'))
    if (t === HARD && tier < (MINE_GATES[this.level] ?? 2)) return g.warn($t('这是硬岩，{0}凿不开，要{1}', toolName('pick', tier), toolName('pick', MINE_GATES[this.level] ?? 2)))
    const ore = ORES[this.ore[c]]
    if (t === ROCK && tier < ore.tier) return g.warn($t('{0}挖不动{1}，要{2}', toolName('pick', tier), ore.name, toolName('pick', ore.tier)))
    if (this.job?.c === c) return
    if (!g.fits({ [ore.item]: 1 })) return g.full($t('挖出来的装不下'))
    const p = this.centre(c)
    g.walkTo(p, CS / 2 + 4.6, () => {
      g.face(Math.atan2(p.x - g.pilot.x, -(p.y - g.pilot.y)), 1)
      const hp = t === HARD ? 9 : ore.hp + Math.floor(this.level / 4)
      this.job = { c, hits: 0, need: Math.max(1, Math.ceil(hp / tier)), t: 0, struck: false }
    })
  }
  private descend() {
    const g = this.g
    const next = this.level + 1
    if (next > this.depth) return g.warn($t('再往下是实心的岩层'))
    if (next > this.save.unlocked) {
      this.save.unlocked = next
      g.celebrate(1, $t('矿洞第 {0} 层', next), $t('以后可以从洞口直接下到这一层'))
    }
    this.enter(next)
  }
  private strike(j: NonNullable<Mine['job']>) {
    const g = this.g
    const c = j.c
    const hard = this.type[c] === HARD
    const ore = this.ore[c]
    const def = ORES[hard ? 'stone' : ore]
    const p = this.centre(c)
    const pl = g.pilot
    if (!g.body.work('mine')) { this.job = null; g.pilot.stretch = 1; return }
    j.hits++
    if (!(g.skills.has('mine', 1) && g.rnd() < 0.5)) g.useTool(g.toolInHand('pick'))
    const last = j.hits >= j.need
    const d = Math.hypot(p.x - pl.x, p.y - pl.y) || 1
    const hx = p.x - ((p.x - pl.x) / d) * (CS / 2)
    const hy = p.y - ((p.y - pl.y) / d) * (CS / 2)
    const back = Math.atan2(pl.x - p.x, -(pl.y - p.y))
    g.sfx('mine', 0.85 + 0.25 * (j.hits / j.need) + (hard ? -0.2 : 0))
    g.scene.burst({ kind: this.shown[c] ? def.chips : 'rock', x: hx, y: hy, z: FLOOR + 4, n: last ? 18 : 6, speed: last ? 34 : 22, up: 34, life: 0.7, dir: back, cone: 2.2 })
    g.scene.burst({ kind: 'spark', x: hx, y: hy, z: FLOOR + 4, n: 4, speed: 30, up: 28, life: 0.22, mode: 'spark' })
    g.scene.shake(last ? 2.8 : 0.8 + 0.8 * (j.hits / j.need))
    if (!last) {
      // the block cracks a little further with every blow
      this.crack[c] = j.hits / j.need
      this.paint(c)
      return
    }
    g.hitStop = 0.09
    g.pilot.stretch = 1
    this.job = null
    this.breakCell(c, hard ? null : ore)
  }
  private breakCell(c: number, ore: OreId | null) {
    const g = this.g
    const s = this.save
    const p = this.centre(c)
    this.type[c] = OPEN
    this.crack[c] = 0
    this.paint(c)
    ;(s.broken[this.level] ??= []).push(c)
    s.dug++
    g.sfx('rockbreak')
    g.scene.burst({ kind: 'dust', x: p.x, y: p.y, z: FLOOR + 2, n: 9, speed: 12, up: 8, life: 0.7, mode: 'smoke', r: 4 })
    // what came out of it
    const got: Bag = {}
    if (ore) {
      const def = ORES[ore]
      const n = def.n[0] + Math.floor(g.rnd() * (def.n[1] - def.n[0] + 1))
      got[def.item] = n
      if (ore !== 'stone' && g.rnd() < 0.5) got.stone = 1
      // luck: now and then a block of plain stone has a geode in it — the deeper, the likelier
      if (ore === 'stone' && g.rnd() < 0.008 * this.level) {
        const gem: ItemId = this.level >= 4 ? 'crystal' : 'coal'
        got[gem] = (got[gem] ?? 0) + (gem === 'coal' ? 2 : 1)
        if (gem === 'crystal') this.rare('crystal', p)
        else g.toast($t('石头里夹着一窝煤！'))
      }
    } else got.stone = 2
    g.receive(got)
    give(g.save.stats.gathered, got)
    g.drop(got, p.x, p.y, FLOOR + 5)
    let i = 0
    for (const k of Object.keys(got) as ItemId[]) g.float(`+${got[k]} ${ITEMS[k].name}`, p.x, p.y - i++ * 5, FLOOR + 12)
    if (ore === 'gold' || ore === 'crystal' || ore === 'moon') this.rare(ore, p)
    // what the gap brings into view
    let news: OreId | null = null
    for (const d of [1, -1, G, -G]) {
      const n = c + d
      if (this.type[n] !== ROCK || this.shown[n]) continue
      this.shown[n] = 1
      this.paint(n)
      const o = this.ore[n]
      if (o === 'stone') continue
      const q = this.centre(n)
      g.scene.burst({ kind: ORES[o].chips === 'crystal' ? 'crystal' : 'spark', x: q.x, y: q.y, z: FLOOR + WALL + 1, n: 8, speed: 10, up: 14, life: 0.6, mode: 'float', grav: 0, r: 4 })
      if (!news || ORES[o].tier > ORES[news].tier) news = o
    }
    if (news) {
      g.sfx(ORES[news].tier >= 3 ? 'rare' : 'reveal')
      if (ORES[news].tier >= 3) g.toast($t('岩壁后面露出了{0}！', ORES[news].name))
    }
    if (c === this.ladderCell) this.showLadder(c, true)
    g.changed()
  }
  /** something rare: the big moment the first time, a flourish every time */
  private rare(ore: OreId, p: { x: number; y: number }) {
    const g = this.g
    const def = ORES[ore]
    g.sfx('rare')
    g.scene.burst({ kind: def.chips === 'gold' ? 'gold' : 'crystal', x: p.x, y: p.y, z: FLOOR + 4, n: 26, speed: 26, up: 50, life: 1, mode: 'spark', grav: 50 })
    if (!this.save.found[ore]) {
      this.save.found[ore] = true
      g.celebrate(2, $t('挖到了{0}！', def.name), ITEMS[def.item].desc, def.item)
    }
  }

  labels(put: (id: string, text: string, x: number, y: number, z: number, cls: Label['kind']) => void) {
    const up = this.centre(this.start - G)
    put('m-up', $t('回地面'), up.x, up.y - 2, FLOOR + 17, 'building')
    if (this.ladderDown) put('m-down', this.level >= this.depth ? '' : $t('下到第 {0} 层', this.level + 1), this.ladderDown.x, this.ladderDown.y, FLOOR + 8, 'building')
  }
}
export type { Label }
