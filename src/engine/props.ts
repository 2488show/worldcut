// Voxel models for what stands on an island: trees, rocks, plants, the workbench and the other
// facilities, landmarks, people. They are drawn the way the jet is (a stack of slices), so a
// tree has a real crown over a real trunk and can sway, shake and fall, and they are written
// in code — a new prop is a few lines here, not an art pipeline.
//
// Axes as in models.ts: i = across (west → east), k = front to back (0 = north), y = up.
// Buildings face south (their door is on the k = L-1 side), towards the default camera.

import type { ModelDef } from './models'
import { PET_SPECIES, type PetColour } from './petdefs'
import { indoorModels, shovelHeld } from './indoor'
import { furnishModels } from './furnish'
import { homeModels } from './home'
import { estateModels } from './estate'

type RGB = [number, number, number]

/** a small, repeatable scatter: 0..1 from three whole numbers */
function h3(i: number, k: number, y: number): number {
  let n = (i * 374761393 + k * 668265263 + y * 1274126177) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  n = n ^ (n >>> 16)
  return (n >>> 0) / 4294967296
}

export class V {
  d: Uint8Array
  colors: Record<number, RGB> = {}
  private keys = new Map<string, number>()
  constructor(public W: number, public L: number, public H: number) {
    this.d = new Uint8Array(W * L * H)
  }
  /** a colour's index (new colours are added to the palette) */
  c(r: number, g: number, b: number): number {
    const key = `${r},${g},${b}`
    let i = this.keys.get(key)
    if (!i) {
      i = this.keys.size + 1
      if (i > 95) throw new Error('too many colours in one model')
      this.keys.set(key, i)
      this.colors[i] = [r, g, b]
    }
    return i
  }
  set(i: number, k: number, y: number, c: number) {
    i = Math.round(i)
    k = Math.round(k)
    y = Math.round(y)
    if (i < 0 || k < 0 || y < 0 || i >= this.W || k >= this.L || y >= this.H) return
    this.d[(y * this.L + k) * this.W + i] = c
  }
  get(i: number, k: number, y: number) {
    if (i < 0 || k < 0 || y < 0 || i >= this.W || k >= this.L || y >= this.H) return 0
    return this.d[(y * this.L + k) * this.W + i]
  }
  box(i0: number, k0: number, y0: number, i1: number, k1: number, y1: number, c: number) {
    for (let y = y0; y <= y1; y++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) this.set(i, k, y, c)
  }
  /** an ellipsoid; `pick` chooses each voxel's colour (0 leaves a hole), `rough` frays the surface */
  blob(ci: number, ck: number, cy: number, ri: number, rk: number, ry: number, pick: (i: number, k: number, y: number, u: number) => number, rough = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let k = Math.floor(ck - rk); k <= Math.ceil(ck + rk); k++) {
        for (let i = Math.floor(ci - ri); i <= Math.ceil(ci + ri); i++) {
          const u = Math.sqrt(((i - ci) / ri) ** 2 + ((k - ck) / rk) ** 2 + ((y - cy) / ry) ** 2)
          if (u > 1 + (h3(i, k, y) - 0.5) * rough) continue
          const c = pick(i, k, y, u)
          if (c) this.set(i, k, y, c)
        }
      }
    }
  }
  /** an upright cylinder */
  cyl(ci: number, ck: number, y0: number, y1: number, r: number, c: number | ((i: number, k: number, y: number) => number)) {
    for (let y = y0; y <= y1; y++) {
      for (let k = Math.floor(ck - r); k <= Math.ceil(ck + r); k++) {
        for (let i = Math.floor(ci - r); i <= Math.ceil(ci + r); i++) {
          if ((i - ci) ** 2 + (k - ck) ** 2 > r * r + 0.3) continue
          this.set(i, k, y, typeof c === 'number' ? c : c(i, k, y))
        }
      }
    }
  }
  /** takes out the voxels nobody can see (all six neighbours filled): far fewer to draw */
  hollow() {
    const kill: number[] = []
    for (let y = 1; y < this.H - 1; y++) {
      for (let k = 1; k < this.L - 1; k++) {
        for (let i = 1; i < this.W - 1; i++) {
          if (!this.get(i, k, y)) continue
          if (this.get(i - 1, k, y) && this.get(i + 1, k, y) && this.get(i, k - 1, y) && this.get(i, k + 1, y) && this.get(i, k, y - 1) && this.get(i, k, y + 1)) {
            kill.push((y * this.L + k) * this.W + i)
          }
        }
      }
    }
    for (const o of kill) this.d[o] = 0
    return this
  }
  def(name: string, extra: Partial<ModelDef> = {}): ModelDef {
    this.hollow()
    const slices: Uint8Array[] = []
    const n = this.W * this.L
    for (let y = 0; y < this.H; y++) slices.push(this.d.subarray(y * n, (y + 1) * n))
    return { name, W: this.W, L: this.L, H: this.H, pivK: (this.L - 1) / 2, pivY: 0, slices, colors: this.colors, tip: { a: 0, k: 0, y: 0 }, shell: true, ...extra }
  }
}

// ───────────────────────────────────────────────────────────── trees
const BARK: RGB = [120, 84, 52]
const BARK_D: RGB = [88, 60, 40]
const CUT: RGB = [214, 170, 112]
const CUT_D: RGB = [176, 130, 80]

/** a crown of leaves: lighter on top and towards the sun (north-west), with a few highlights */
function crown(v: V, ci: number, ck: number, cy: number, r: number, ry: number, tones: RGB[], fruit?: RGB) {
  const [d, m, l, hi] = tones.map((t) => v.c(...t))
  const fr = fruit ? v.c(...fruit) : 0
  v.blob(ci, ck, cy, r, r, ry, (i, k, y, u) => {
    const sun = (y - cy) / ry + ((ci - i) + (ck - k)) / (r * 2.6)
    const n = h3(i, k, y)
    if (fr && u > 0.72 && n > 0.93) return fr
    if (sun > 0.62) return n > 0.55 ? hi : l
    if (sun > 0.18) return n > 0.8 ? hi : l
    if (sun > -0.3) return n > 0.86 ? d : m
    return n > 0.7 ? m : d
  }, 0.34)
}
const OAK: RGB[] = [[46, 112, 58], [70, 146, 62], [108, 182, 74], [156, 214, 96]]
const PINE: RGB[] = [[24, 76, 60], [34, 100, 70], [54, 128, 84], [92, 160, 104]]
const BIRCH: RGB[] = [[120, 150, 50], [160, 186, 62], [200, 214, 84], [236, 232, 120]]

function oak(name: string, size: number, tones = OAK, fruit?: RGB, bark = BARK, barkD = BARK_D): ModelDef {
  const r = 3 + size * 2 // crown radius: 5, 7, 9
  const W = r * 2 + 3
  const trunk = 4 + size * 2
  const H = trunk + r * 2
  const v = new V(W, W, H)
  const c = (W - 1) / 2
  const b = v.c(...bark)
  const bd = v.c(...barkD)
  const tr = size >= 3 ? 1.6 : size === 2 ? 1.2 : 0.8
  v.cyl(c, c, 0, trunk + 1, tr, (i, k) => (i > c || k > c ? bd : b))
  // roots flare at the foot
  if (size >= 2) for (const [di, dk] of [[-2, 0], [2, 0], [0, 2], [0, -2]]) v.set(c + di, c + dk, 0, bd)
  crown(v, c, c, trunk + r * 0.9, r, r * 0.95, tones, fruit)
  if (size >= 2) {
    crown(v, c - r * 0.5, c + r * 0.25, trunk + r * 0.55, r * 0.62, r * 0.55, tones, fruit)
    crown(v, c + r * 0.5, c - r * 0.2, trunk + r * 0.6, r * 0.6, r * 0.55, tones, fruit)
  }
  return v.def(name)
}

function pine(name: string, size: number): ModelDef {
  const r = 2.6 + size * 1.5
  const W = Math.ceil(r) * 2 + 3
  const tiers = 2 + size
  const H = 4 + tiers * 6 + 2
  const v = new V(W, W, H)
  const c = (W - 1) / 2
  const [d, m, l, hi] = PINE.map((t) => v.c(...t))
  const b = v.c(96, 64, 44)
  v.cyl(c, c, 0, H - 4, size >= 3 ? 1.3 : 0.8, b)
  // skirts of needles, each one narrower than the one below and sagging at its rim
  for (let t = 0; t < tiers; t++) {
    const y0 = 3 + t * 6
    const rt = r * (1 - t / (tiers + 0.6))
    for (let y = y0; y < y0 + 7; y++) {
      const rr = rt * (1 - (y - y0) / 7.5) + 0.4
      for (let k = Math.floor(c - rr); k <= Math.ceil(c + rr); k++) {
        for (let i = Math.floor(c - rr); i <= Math.ceil(c + rr); i++) {
          const dist = Math.hypot(i - c, k - c)
          if (dist > rr + (h3(i, k, y) - 0.5) * 0.9) continue
          const sun = (c - i + (c - k)) / (rr * 2 + 1)
          const n = h3(i, y, k)
          v.set(i, k, y, y === y0 ? d : sun > 0.25 ? (n > 0.7 ? hi : l) : sun > -0.2 ? m : d)
        }
      }
    }
  }
  v.set(c, c, H - 1, l)
  v.set(c, c, H - 2, l)
  return v.def(name)
}

function palm(name: string, size: number): ModelDef {
  const W = 17 + size * 2
  const trunk = 10 + size * 4
  const H = trunk + 6
  const v = new V(W, W, H)
  const c = (W - 1) / 2
  const t = v.c(176, 140, 96)
  const td = v.c(140, 106, 72)
  const f = v.c(70, 150, 64)
  const fl = v.c(120, 190, 80)
  const fh = v.c(170, 220, 100)
  const nut = v.c(104, 70, 46)
  // a trunk that leans, ringed
  const lean = (y: number) => Math.round(((y / trunk) ** 2) * 3)
  for (let y = 0; y <= trunk; y++) {
    const i = c - 1 + lean(y)
    v.set(i, c, y, y % 3 === 0 ? td : t)
    if (y < trunk * 0.6) v.set(i + 1, c, y, td)
  }
  const top = c - 1 + lean(trunk)
  // fronds: arching out and drooping at the tips
  const n = 7
  const reach = 6 + size
  for (let a = 0; a < n; a++) {
    const ang = (a / n) * Math.PI * 2 + 0.3
    for (let s = 0; s <= reach; s++) {
      const u = s / reach
      const y = trunk + 2 + Math.round(Math.sin(u * Math.PI * 0.75) * 2.4 - u * u * 4.2)
      const i = top + Math.cos(ang) * s
      const k = c + Math.sin(ang) * s
      const col = u < 0.3 ? f : (a + s) % 3 === 0 ? fh : fl
      v.set(i, k, y, col)
      if (u > 0.2 && u < 0.85) {
        v.set(i - Math.sin(ang), k + Math.cos(ang), y - 1, f)
        v.set(i + Math.sin(ang), k - Math.cos(ang), y - 1, f)
      }
    }
  }
  v.set(top, c, trunk + 1, fl)
  v.set(top + 1, c, trunk, nut)
  v.set(top - 1, c + 1, trunk, nut)
  return v.def(name)
}

function stump(name: string, r: number, bark: RGB, barkD: RGB): ModelDef {
  const W = Math.ceil(r) * 2 + 3
  const v = new V(W, W, 3)
  const c = (W - 1) / 2
  const b = v.c(...bark)
  const bd = v.c(...barkD)
  const cut = v.c(...CUT)
  const cutD = v.c(...CUT_D)
  v.cyl(c, c, 0, 1, r + 0.4, (i, k) => (i > c || k > c ? bd : b))
  v.cyl(c, c, 2, 2, r + 0.4, (i, k) => (Math.round(Math.hypot(i - c, k - c)) % 2 === 1 ? cutD : cut))
  return v.def(name)
}

function sapling(): ModelDef {
  const v = new V(5, 5, 6)
  const b = v.c(...BARK)
  const l = v.c(108, 182, 74)
  const hi = v.c(156, 214, 96)
  v.box(2, 2, 0, 2, 2, 3, b)
  v.set(1, 2, 3, l); v.set(3, 2, 4, l); v.set(2, 1, 4, hi); v.set(2, 3, 3, l); v.set(2, 2, 5, hi); v.set(2, 2, 4, l)
  return v.def('sapling')
}

// ───────────────────────────────────────────────────────────── rocks and ores
const ROCK: RGB[] = [[112, 108, 114], [150, 146, 146], [190, 186, 180]]

/** a boulder: half an ellipsoid, faceted, lit from the north-west */
function boulderShape(v: V, ci: number, ck: number, ri: number, rk: number, ry: number, tones: RGB[]) {
  const [d, m, l] = tones.map((t) => v.c(...t))
  v.blob(ci, ck, 0, ri, rk, ry, (i, k, y) => {
    const sun = y / ry + (ci - i + (ck - k)) / (ri + rk)
    // facets: the tone changes in flat patches, not pixel by pixel
    const n = h3(i >> 1, k >> 1, y >> 1)
    return sun + (n - 0.5) * 0.5 > 0.75 ? l : sun + (n - 0.5) * 0.5 > 0.1 ? m : d
  }, 0.25)
}
function boulder(name: string, ri: number, rk: number, ry: number, tones = ROCK): ModelDef {
  const W = Math.ceil(ri) * 2 + 3
  const L = Math.ceil(rk) * 2 + 3
  const v = new V(W, L, Math.ceil(ry) + 2)
  boulderShape(v, (W - 1) / 2, (L - 1) / 2, ri, rk, ry, tones)
  return v.def(name)
}
/**
 * An ore rock: a boulder with lumps of ore standing out of it. Each ore has its own colour AND
 * its own shape of lump, so they can be told apart at a glance (and by the colour-blind):
 * copper = round orange nuggets with green tarnish · iron = rust-red bands · coal = black cubes ·
 * gold = small bright flecks in pale rock · crystal = tall shards.
 */
function oreRock(name: string, kind: 'copper' | 'iron' | 'coal' | 'gold' | 'crystal' | 'moon'): ModelDef {
  const W = 15
  const L = 13
  const H = kind === 'crystal' || kind === 'moon' ? 16 : 11
  const v = new V(W, L, H)
  const ci = 7
  const ck = 6
  const base: Record<string, RGB[]> = {
    copper: ROCK,
    iron: [[92, 62, 62], [128, 84, 76], [164, 112, 96]],
    coal: [[84, 82, 92], [116, 114, 122], [150, 148, 152]],
    gold: [[150, 138, 118], [190, 178, 152], [224, 214, 190]],
    crystal: [[84, 92, 124], [112, 122, 156], [150, 160, 190]],
    moon: [[70, 74, 110], [96, 102, 146], [130, 138, 180]],
  }
  boulderShape(v, ci, ck, 6.2, 5.2, 8, base[kind])
  const top = (i: number, k: number) => {
    for (let y = H - 1; y >= 0; y--) if (v.get(i, k, y)) return y
    return -1
  }
  if (kind === 'copper') {
    const a = v.c(236, 136, 66)
    const b = v.c(255, 190, 116)
    const g = v.c(64, 178, 150)
    for (const [i, k] of [[4, 4], [9, 3], [7, 7], [3, 8], [10, 8], [6, 10]]) {
      const y = top(i, k)
      v.blob(i, k, y, 1.5, 1.5, 1.5, (x, z, yy) => (yy > y ? b : h3(x, z, yy) > 0.7 ? g : a))
    }
  } else if (kind === 'iron') {
    const a = v.c(196, 104, 76)
    const b = v.c(232, 150, 110)
    const m = v.c(214, 206, 204)
    // slanting bands of rust right through the rock
    for (let y = 0; y < H; y++) for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) {
      if (!v.get(i, k, y)) continue
      const band = (i + y * 2 + k) % 7
      if (band === 0) v.set(i, k, y, a)
      else if (band === 1) v.set(i, k, y, h3(i, k, y) > 0.8 ? m : b)
    }
  } else if (kind === 'coal') {
    const a = v.c(34, 32, 42)
    const b = v.c(62, 60, 76)
    const g = v.c(128, 128, 150)
    for (const [i, k] of [[4, 4], [8, 3], [10, 6], [6, 7], [3, 8], [8, 9]]) {
      const y = Math.max(1, top(i, k) - 1)
      v.box(i, k, y, i + 2, k + 2, y + 2, a)
      v.box(i, k, y + 2, i + 2, k, y + 2, b)
      v.set(i, k, y + 2, g)
    }
  } else if (kind === 'gold') {
    const a = v.c(250, 204, 60)
    const b = v.c(255, 240, 160)
    for (let y = 0; y < H; y++) for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) {
      if (!v.get(i, k, y)) continue
      const n = h3(i >> 1, k >> 1, y >> 1)
      if (n > 0.8) v.set(i, k, y, h3(i, k, y) > 0.6 ? b : a)
    }
  } else {
    const moon = kind === 'moon'
    const a = moon ? v.c(170, 190, 255) : v.c(110, 214, 250)
    const b = moon ? v.c(236, 240, 255) : v.c(200, 150, 255)
    const w = v.c(255, 255, 255)
    // shards: slim prisms leaning out of the rock
    for (const [i, k, h, li] of [[6, 5, 9, 0], [9, 6, 7, 0.25], [4, 7, 6, -0.3], [7, 8, 5, 0.1], [10, 3, 4, 0.3]]) {
      const y0 = Math.max(2, top(Math.round(i), Math.round(k)) - 1)
      for (let s = 0; s < h; s++) {
        const x = i + li * s
        const wide = s < h - 2 ? 1 : 0
        for (let dx = 0; dx <= wide; dx++) for (let dz = 0; dz <= wide; dz++) v.set(x + dx, k + dz, y0 + s, s >= h - 2 ? w : dx + dz === 0 ? b : a)
      }
    }
  }
  return v.def(name, kind === 'crystal' || kind === 'moon' ? { glow: [{ idx: v.c(255, 255, 255), alt: kind === 'moon' ? [200, 214, 255] : [190, 240, 255] }] } : {})
}
function rubble(): ModelDef {
  const v = new V(9, 9, 2)
  const a = v.c(...ROCK[0])
  const b = v.c(...ROCK[1])
  for (const [i, k] of [[2, 2], [5, 1], [6, 5], [3, 6], [1, 4], [4, 4]]) {
    v.set(i, k, 0, a)
    if ((i + k) % 2) v.set(i + 1, k, 0, b)
  }
  v.set(4, 4, 1, b)
  return v.def('rubble')
}

// ───────────────────────────────────────────────────────────── plants and things to pick up
function bush(name: string, berry?: RGB): ModelDef {
  const v = new V(9, 9, 6)
  crown(v, 4, 4, 1.5, 3.8, 3.6, OAK, berry)
  return v.def(name)
}
function flax(name: string, cut: boolean): ModelDef {
  const v = new V(9, 9, 9)
  const s = v.c(124, 160, 60)
  const sd = v.c(92, 128, 52)
  const tip = v.c(236, 226, 150)
  const tipL = v.c(255, 246, 196)
  for (let n = 0; n < 12; n++) {
    const i = 1 + Math.floor(h3(n, 1, 7) * 7)
    const k = 1 + Math.floor(h3(n, 2, 9) * 7)
    const h = cut ? 2 : 4 + Math.floor(h3(n, 3, 5) * 4)
    for (let y = 0; y < h; y++) v.set(i, k, y, y < 2 ? sd : s)
    if (!cut) {
      v.set(i, k, h, tip)
      if (n % 3 === 0) v.set(i, k, h + 1, tipL)
    }
  }
  return v.def(name)
}
function flowers(name: string, petals: RGB[]): ModelDef {
  const v = new V(9, 9, 6)
  const st = v.c(84, 150, 62)
  const eye = v.c(250, 206, 70)
  for (let n = 0; n < 7; n++) {
    const i = 1 + Math.floor(h3(n, 4, 3) * 7)
    const k = 1 + Math.floor(h3(n, 5, 8) * 7)
    const h = 2 + Math.floor(h3(n, 6, 2) * 2)
    const p = v.c(...petals[n % petals.length])
    for (let y = 0; y < h; y++) v.set(i, k, y, st)
    v.set(i, k, h + 1, eye)
    for (const [di, dk] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) v.set(i + di, k + dk, h, p)
    v.set(i, k, h, p)
  }
  return v.def(name)
}
function sticks(): ModelDef {
  const v = new V(9, 9, 2)
  const a = v.c(150, 106, 66)
  const b = v.c(112, 78, 50)
  for (let s = 0; s < 7; s++) v.set(1 + s, 2 + Math.round(s * 0.5), 0, s % 3 ? a : b)
  for (let s = 0; s < 6; s++) v.set(6 - s, 2 + s, s === 2 ? 1 : 0, s % 2 ? b : a)
  v.set(2, 6, 0, a); v.set(3, 6, 0, a); v.set(4, 7, 0, b)
  return v.def('stick')
}
function pebbles(): ModelDef {
  const v = new V(9, 9, 3)
  const [d, m, l] = ROCK.map((t) => v.c(...t))
  v.blob(2.5, 3, 0, 1.6, 1.4, 1.6, (_i, _k, y) => (y > 0 ? l : m))
  v.blob(6, 2.5, 0, 1.2, 1.2, 1.2, () => m)
  v.blob(5, 6, 0, 1.8, 1.4, 2, (i, _k, y) => (y > 1 ? l : i > 5 ? d : m))
  return v.def('pebble')
}
function shell(): ModelDef {
  const v = new V(7, 7, 3)
  const a = v.c(250, 214, 200)
  const b = v.c(240, 160, 150)
  const w = v.c(255, 246, 236)
  v.blob(3, 3, 0, 2.4, 2, 2, (i, _k, y) => (y > 1 ? w : i % 2 ? b : a))
  return v.def('shell')
}

// ───────────────────────────────────────────────────────────── facilities
const WOOD: RGB = [176, 126, 76]
const WOOD_L: RGB = [214, 168, 108]
const WOOD_D: RGB = [124, 84, 54]
const STONE: RGB = [150, 146, 150]
const STONE_L: RGB = [188, 184, 184]
const STONE_D: RGB = [108, 104, 112]
const IRON: RGB = [92, 96, 110]
const STEEL: RGB = [176, 184, 196]

function workbench(): ModelDef {
  const W = 17, L = 11, H = 13
  const v = new V(W, L, H)
  const w = v.c(...WOOD), wl = v.c(...WOOD_L), wd = v.c(...WOOD_D)
  const ir = v.c(...IRON), st = v.c(...STEEL), red = v.c(214, 80, 60), pl = v.c(236, 204, 150)
  // legs and a shelf
  for (const [i, k] of [[1, 3], [15, 3], [1, 9], [15, 9]]) v.box(i, k, 0, i, k, 4, wd)
  v.box(2, 4, 2, 14, 8, 2, wd)
  // the top: thick planks with a lighter face
  v.box(0, 2, 5, 16, 10, 5, w)
  v.box(0, 2, 6, 16, 10, 6, wl)
  for (let i = 3; i < 16; i += 4) v.box(i, 2, 6, i, 10, 6, w)
  // a tool wall at the back, with a saw, a hammer and a square hung on it
  v.box(0, 0, 0, 0, 1, 12, wd)
  v.box(16, 0, 0, 16, 1, 12, wd)
  v.box(0, 0, 7, 16, 0, 12, w)
  v.box(1, 1, 11, 15, 1, 11, wd)
  v.box(2, 1, 9, 7, 1, 10, st) // saw blade
  v.set(8, 1, 10, red); v.set(8, 1, 9, red)
  v.box(11, 1, 8, 11, 1, 10, wl) // hammer handle
  v.box(10, 1, 10, 12, 1, 10, ir)
  v.box(14, 1, 8, 14, 1, 10, st)
  // on the bench: a vise, a plank half planed, shavings
  v.box(1, 7, 7, 3, 9, 8, ir)
  v.box(2, 8, 9, 2, 8, 9, st)
  v.box(6, 5, 7, 13, 7, 7, pl)
  v.box(6, 5, 8, 9, 7, 8, pl)
  v.set(14, 9, 7, pl); v.set(12, 9, 7, wl); v.set(15, 6, 7, pl)
  return v.def('workbench')
}

function furnace(name: string, lit: boolean): ModelDef {
  const W = 15, L = 15, H = 24
  const v = new V(W, L, H)
  const s = v.c(...STONE), sl = v.c(...STONE_L), sd = v.c(...STONE_D)
  const soot = v.c(58, 54, 62), ir = v.c(...IRON)
  const dark = v.c(30, 26, 34)
  const fire = lit ? v.c(255, 150, 50) : dark
  const fire2 = lit ? v.c(255, 208, 110) : v.c(44, 40, 48)
  const glowTop = lit ? v.c(232, 96, 60) : soot
  const brick = (i: number, k: number, y: number) => {
    const row = y >> 1
    const col = (i + k + (row % 2) * 2) >> 2
    const n = h3(col, row, 3)
    return (y & 1) === 0 && (i + k + (row % 2) * 2) % 4 === 0 ? sd : n > 0.7 ? sl : n < 0.2 ? sd : s
  }
  // a round stone body, drawing in to a dome
  for (let y = 0; y <= 12; y++) {
    const r = y <= 8 ? 6.6 : 6.6 - (y - 8) * 0.9
    v.cyl(7, 8, y, y, r, (i, k) => brick(i, k, y))
  }
  // the stoke hole, on the south face: an arch with the fire inside
  for (let y = 1; y <= 6; y++) {
    const hw = y <= 4 ? 2 : y === 5 ? 1 : 0
    for (let i = 7 - hw; i <= 7 + hw; i++) {
      for (let k = 11; k <= 14; k++) if (v.get(i, k, y)) v.set(i, k, y, k >= 13 ? (y <= 2 ? fire2 : y <= 4 ? fire : dark) : dark)
    }
  }
  for (let i = 4; i <= 10; i++) if (v.get(i, 14, 7)) v.set(i, 14, 7, ir)
  v.box(4, 14, 0, 4, 14, 6, ir); v.box(10, 14, 0, 10, 14, 6, ir)
  // the chimney, at the back, sooty at the lip
  for (let y = 10; y <= 23; y++) v.cyl(7, 5, y, y, 2.4, (i, k) => (y >= 22 ? soot : brick(i, k, y)))
  v.cyl(7, 5, 23, 23, 1.2, glowTop)
  // bellows and a heap of charcoal beside it
  const wd = v.c(...WOOD_D), w = v.c(...WOOD), coal = v.c(40, 38, 48)
  v.box(0, 9, 0, 1, 12, 3, w); v.box(0, 9, 4, 1, 12, 4, wd); v.set(1, 10, 2, ir)
  v.blob(13, 12, 0, 1.8, 1.8, 2.2, (i, k, y) => (h3(i, k, y) > 0.6 ? soot : coal))
  const glow = lit ? [{ idx: fire, alt: [255, 220, 120] as RGB }, { idx: fire2, alt: [255, 130, 50] as RGB }, { idx: glowTop, alt: [255, 170, 80] as RGB }] : undefined
  return v.def(name, glow ? ({ glow }) : {})
}

function board(): ModelDef {
  const W = 19, L = 7, H = 17
  const v = new V(W, L, H)
  const w = v.c(...WOOD), wl = v.c(...WOOD_L), wd = v.c(...WOOD_D)
  const roof = v.c(196, 84, 64), roofL = v.c(228, 116, 88)
  const paper: RGB[] = [[250, 246, 232], [255, 232, 150], [250, 190, 190], [190, 226, 240]]
  v.box(1, 3, 0, 2, 4, 14, wd); v.box(16, 3, 0, 17, 4, 14, wd)
  v.box(2, 3, 5, 16, 4, 13, w)
  v.box(2, 4, 5, 16, 4, 13, wl)
  v.box(2, 4, 5, 16, 4, 5, wd); v.box(2, 4, 13, 16, 4, 13, wd)
  // a little roof over it
  for (let k = 0; k < L; k++) {
    const y = 16 - Math.abs(k - 3)
    v.box(0, k, y, 18, k, y, k < 3 ? roofL : roof)
    v.box(0, k, y - 1, 18, k, y - 1, roof)
  }
  // notices pinned to the front
  const spots = [[3, 10, 3, 2], [7, 9, 2, 3], [10, 10, 3, 2], [14, 9, 2, 3], [4, 6, 2, 2], [8, 6, 3, 2], [12, 6, 3, 2]]
  spots.forEach(([i, y, pw, ph], n) => {
    v.box(i, 5, y, i + pw - 1, 5, y + ph - 1, v.c(...paper[n % paper.length]))
    v.set(i, 5, y + ph - 1, v.c(214, 70, 60)) // the pin
  })
  return v.def('board')
}

function crates(): ModelDef {
  const W = 17, L = 13, H = 13
  const v = new V(W, L, H)
  const w = v.c(196, 150, 96), wl = v.c(228, 186, 126), wd = v.c(140, 100, 62), band = v.c(...IRON)
  const crate = (i: number, k: number, y: number, s: number) => {
    v.box(i, k, y, i + s, k + s, y + s, w)
    v.box(i, k, y + s, i + s, k + s, y + s, wl)
    for (const e of [0, s]) {
      v.box(i + e, k, y, i + e, k, y + s, wd); v.box(i + e, k + s, y, i + e, k + s, y + s, wd)
      v.box(i, k + e, y + s, i + s, k + e, y + s, wd); v.box(i + e, k, y + s, i + e, k + s, y + s, wd)
    }
  }
  crate(0, 1, 0, 6)
  crate(8, 3, 0, 5)
  crate(2, 2, 7, 4)
  // a barrel
  for (let y = 0; y <= 7; y++) v.cyl(13, 9, y, y, y === 0 || y === 7 ? 2 : 2.6, y === 2 || y === 5 ? band : y === 7 ? wl : w)
  // a sack
  v.blob(4, 10, 0, 2.6, 2, 3, (_i, _k, y) => (y > 2 ? v.c(236, 222, 190) : v.c(206, 190, 156)))
  return v.def('crates')
}

function house(name: string, roofC: RGB, roofL: RGB, wall: RGB = [240, 226, 196]): ModelDef {
  const W = 29, L = 23, H = 25
  const v = new V(W, L, H)
  const wa = v.c(...wall), wb = v.c(wall[0] - 28, wall[1] - 30, wall[2] - 30), beam = v.c(...WOOD_D)
  const r = v.c(...roofC), rl = v.c(...roofL), rd = v.c(roofC[0] - 40, roofC[1] - 30, roofC[2] - 24)
  const door = v.c(120, 78, 50), knob = v.c(250, 206, 70), glass = v.c(130, 190, 220), glassL = v.c(200, 230, 245)
  const st = v.c(...STONE), sd = v.c(...STONE_D)
  // stone footing and plastered walls with timber corners
  v.box(2, 3, 0, 26, 20, 1, st)
  v.box(2, 3, 2, 26, 20, 11, wa)
  v.box(2, 3, 2, 26, 3, 11, wb) // the north wall is in shade
  for (const [i, k] of [[2, 3], [26, 3], [2, 20], [26, 20]]) v.box(i, k, 0, i, k, 11, beam)
  v.box(2, 20, 11, 26, 20, 11, beam)
  // hollow it, so the walls are walls
  v.box(3, 4, 0, 25, 19, 11, 0)
  // door and windows on the south face
  v.box(12, 20, 0, 16, 20, 8, beam)
  v.box(13, 20, 0, 15, 20, 7, door)
  v.set(15, 20, 4, knob)
  for (const i0 of [5, 20]) {
    v.box(i0 - 1, 20, 4, i0 + 4, 20, 9, beam)
    v.box(i0, 20, 5, i0 + 3, 20, 8, glass)
    v.set(i0, 20, 8, glassL); v.set(i0 + 1, 20, 8, glassL); v.set(i0, 20, 7, glassL)
    v.box(i0 - 1, 21, 3, i0 + 4, 21, 3, v.c(214, 80, 60)) // a window box of flowers
    v.set(i0, 21, 4, v.c(255, 238, 156)); v.set(i0 + 2, 21, 4, v.c(244, 150, 150)); v.set(i0 + 3, 21, 4, v.c(255, 255, 255))
  }
  // a gable roof, ridge running east–west, overhanging all round
  for (let k = 1; k <= 22; k++) {
    const rise = 11 - Math.abs(k - 11.5)
    const y = 11 + Math.round(rise)
    for (let i = 0; i < W; i++) {
      const tile = (i + (y % 2) * 2) % 4 === 0
      v.set(i, k, y, k < 11.5 ? (tile ? r : rl) : tile ? rd : r)
      if (i === 0 || i === W - 1 || k <= 1 || k >= 22) v.set(i, k, y - 1, k < 11.5 ? r : rd)
    }
  }
  // gable ends filled in
  for (const i of [2, 26]) for (let k = 4; k <= 19; k++) for (let y = 12; y < 11 + Math.round(11 - Math.abs(k - 11.5)) - 1; y++) v.set(i, k, y, i === 2 ? wb : wa)
  // chimney
  v.box(20, 6, 14, 22, 8, 23, st); v.box(20, 6, 23, 22, 8, 23, sd); v.set(21, 7, 24, sd)
  return v.def(name, { lit: [{ idx: glass, rgb: [255, 206, 110] }, { idx: glassL, rgb: [255, 232, 160] }] })
}

function hangar(): ModelDef {
  const W = 41, L = 29, H = 23
  const v = new V(W, L, H)
  const a = v.c(226, 222, 214), b = v.c(214, 84, 62), ad = v.c(176, 172, 170), bd = v.c(160, 60, 50)
  const dark = v.c(44, 42, 54), floor = v.c(96, 96, 108), beam = v.c(...IRON), lamp = v.c(255, 220, 120)
  // a barrel vault of corrugated sheet in red and white bands, open to the south
  for (let k = 0; k < L - 1; k++) {
    for (let i = 0; i < W; i++) {
      const x = (i - 20) / 20
      const top = Math.round(Math.sqrt(Math.max(0, 1 - x * x)) * 21)
      const stripe = Math.floor(k / 4) % 2 === 0
      const prev = Math.round(Math.sqrt(Math.max(0, 1 - ((i - 21) / 20) ** 2)) * 21)
      const next = Math.round(Math.sqrt(Math.max(0, 1 - ((i - 19) / 20) ** 2)) * 21)
      // one sheet thick; where the curve is steep the sheet runs down to meet its neighbour
      for (let y = Math.max(0, Math.min(top, Math.min(prev, next) + 1)); y <= top; y++) v.set(i, k, y, x < -0.1 ? (stripe ? b : a) : stripe ? bd : ad)
      if (k === 0) for (let y = 0; y < top; y++) v.set(i, k, y, ad) // the back wall
    }
  }
  // the mouth: a frame, darkness inside, a lamp over the door
  for (let i = 0; i < W; i++) {
    const x = (i - 20) / 20
    const top = Math.round(Math.sqrt(Math.max(0, 1 - x * x)) * 21)
    for (let y = 0; y <= top; y++) {
      const edge = y >= top - 2 || i <= 2 || i >= W - 3
      v.set(i, L - 1, y, edge ? beam : 0)
      if (!edge) v.set(i, L - 8, y, dark)
    }
  }
  v.box(3, 1, 0, W - 4, L - 2, 0, floor)
  v.box(19, L - 1, 19, 21, L - 1, 20, lamp)
  // a windsock pole on the roof
  v.box(34, 8, 17, 34, 8, 22, beam)
  v.box(35, 8, 21, 38, 8, 22, v.c(250, 150, 60)); v.box(37, 8, 21, 38, 8, 22, v.c(255, 255, 255))
  return v.def('hangar', { glow: [{ idx: lamp, alt: [255, 244, 190] }] })
}

function mineEntrance(): ModelDef {
  const W = 25, L = 19, H = 18
  const v = new V(W, L, H)
  boulderShape(v, 12, 8, 11.5, 8.5, 16, [[104, 98, 104], [140, 134, 134], [180, 174, 166]])
  const dark = v.c(22, 20, 28), deep = v.c(40, 36, 46)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), lamp = v.c(255, 200, 90), rail = v.c(...IRON), tie = v.c(96, 68, 48)
  // the adit: a timbered mouth going back into the dark
  for (let k = 8; k < L; k++) {
    for (let i = 8; i <= 16; i++) for (let y = 0; y <= 9; y++) {
      if (!v.get(i, k, y) && k < 14) continue
      v.set(i, k, y, k >= 15 ? 0 : k >= 12 ? deep : dark)
    }
  }
  for (const i of [7, 17]) v.box(i, 15, 0, i, 16, 10, wd)
  v.box(6, 15, 10, 18, 16, 11, w)
  v.box(6, 16, 11, 18, 16, 11, wd)
  v.set(12, 17, 9, lamp); v.set(12, 17, 10, rail)
  // rails out of the mouth
  for (let k = 12; k < L; k++) {
    v.set(10, k, 0, rail); v.set(14, k, 0, rail)
    if (k % 2 === 0) v.box(9, k, 0, 15, k, 0, tie)
    v.set(10, k, 0, rail); v.set(14, k, 0, rail)
  }
  // moss on the top
  const moss = v.c(96, 150, 70)
  for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) for (let y = H - 1; y > 8; y--) {
    if (v.get(i, k, y) && !v.get(i, k, y + 1)) {
      if (h3(i, k, 1) > 0.55) v.set(i, k, y, moss)
      break
    }
  }
  return v.def('mine', { glow: [{ idx: lamp, alt: [255, 240, 170] }] })
}

// ───────────────────────────────────────────────────────────── landmarks (one per island, seen from far off)
function lighthouse(): ModelDef {
  const W = 15, H = 46
  const v = new V(W, W, H)
  const w = v.c(244, 240, 230), wd = v.c(200, 196, 196), r = v.c(214, 70, 56), rd = v.c(160, 50, 46)
  const ir = v.c(...IRON), lamp = v.c(255, 236, 150), st = v.c(...STONE)
  v.cyl(7, 7, 0, 2, 7, st)
  for (let y = 3; y <= 34; y++) {
    const rad = 5.4 - (y - 3) * 0.075
    const band = Math.floor((y - 3) / 6) % 2 === 1
    v.cyl(7, 7, y, y, rad, (i, k) => (i + k > 15 ? (band ? rd : wd) : band ? r : w))
  }
  v.cyl(7, 7, 35, 35, 4.6, ir) // the gallery
  v.cyl(7, 7, 36, 40, 2.6, lamp)
  for (const [i, k] of [[5, 5], [9, 5], [5, 9], [9, 9]]) v.box(i, k, 36, i, k, 40, ir)
  for (let y = 41; y <= 44; y++) v.cyl(7, 7, y, y, 3.4 - (y - 41) * 0.9, r)
  v.set(7, 7, 45, ir)
  v.box(6, 12, 3, 8, 12, 7, v.c(120, 78, 50)) // door
  return v.def('lighthouse', { glow: [{ idx: lamp, alt: [255, 255, 220] }], lit: [{ idx: lamp, rgb: [255, 236, 150] }] })
}
/** the light on the far shore: taller than any other, white and sea-blue, with a lamp that never goes out */
function beacon(): ModelDef {
  const W = 17, H = 58
  const v = new V(W, W, H)
  const w = v.c(246, 244, 236), wd = v.c(204, 204, 210), b = v.c(70, 120, 176), bd = v.c(50, 88, 136)
  const ir = v.c(...IRON), lamp = v.c(255, 232, 140), st = v.c(...STONE), gold = v.c(240, 196, 80)
  v.cyl(8, 8, 0, 3, 8, st)
  for (let y = 4; y <= 44; y++) {
    const rad = 6.2 - (y - 4) * 0.07
    const band = Math.floor((y - 4) / 8) % 2 === 1
    v.cyl(8, 8, y, y, rad, (i, k) => (i + k > 17 ? (band ? bd : wd) : band ? b : w))
  }
  v.cyl(8, 8, 45, 45, 5.2, ir)
  v.cyl(8, 8, 46, 51, 3, lamp)
  for (const [i, k] of [[5, 5], [11, 5], [5, 11], [11, 11]]) v.box(i, k, 46, i, k, 51, ir)
  for (let y = 52; y <= 55; y++) v.cyl(8, 8, y, y, 3.8 - (y - 52) * 0.9, b)
  v.set(8, 8, 56, gold); v.set(8, 8, 57, gold)
  v.box(7, 14, 4, 9, 14, 9, v.c(120, 78, 50))
  return v.def('beacon', { glow: [{ idx: lamp, alt: [255, 255, 230] }] })
}
/** tools in the hand: the shaft stands up from the grip (the pivot); the head points forward (low k) */
function heldTools(): ModelDef[] {
  const out: ModelDef[] = []
  const wood = [150, 104, 64] as RGB, woodD = [104, 70, 44] as RGB
  for (const [name, head, headL] of [['h_axe', STONE, [190, 186, 180]], ['h_axe2', [200, 120, 70], [236, 170, 110]], ['h_axe3', IRON, [214, 220, 232]]] as [string, RGB, RGB][]) {
    const v = new V(3, 5, 10)
    const w = v.c(...wood), wd = v.c(...woodD), h = v.c(...head), hl = v.c(...headL)
    v.box(1, 3, 0, 1, 3, 9, w); v.set(1, 3, 0, wd)
    // the blade: a wedge in front of the shaft, its edge bright
    v.box(1, 1, 6, 1, 2, 9, h); v.box(1, 0, 6, 1, 0, 9, hl); v.set(1, 2, 5, h)
    out.push(v.def(name, { pivK: 3, shell: false }))
  }
  for (const [name, head, headL] of [['h_pick', STONE, [190, 186, 180]], ['h_pick2', [200, 120, 70], [236, 170, 110]], ['h_pick3', IRON, [214, 220, 232]]] as [string, RGB, RGB][]) {
    const v = new V(3, 7, 10)
    const w = v.c(...wood), wd = v.c(...woodD), h = v.c(...head), hl = v.c(...headL)
    v.box(1, 3, 0, 1, 3, 8, w); v.set(1, 3, 0, wd)
    // the head: across the top, curving down at both points
    v.box(1, 1, 9, 1, 5, 9, h); v.set(1, 0, 8, hl); v.set(1, 6, 8, h); v.set(1, 3, 9, hl)
    out.push(v.def(name, { pivK: 3, shell: false }))
  }
  {
    const v = new V(3, 3, 16)
    const w = v.c(...wood), wd = v.c(...woodD), reel = v.c(70, 72, 84), tip = v.c(232, 96, 60)
    v.box(1, 1, 0, 1, 1, 14, w); v.box(1, 1, 0, 1, 1, 2, wd); v.set(1, 0, 3, reel); v.set(1, 1, 15, tip)
    out.push(v.def('h_rod', { pivK: 1, shell: false }))
  }
  {
    // the watering can: a tin body, the handle behind, the spout up and forward with its rose
    const v = new V(3, 7, 8)
    const t = v.c(110, 150, 170), tl = v.c(150, 190, 206), td = v.c(80, 112, 130), rose = v.c(214, 220, 228)
    v.box(0, 2, 0, 2, 4, 3, t); v.box(0, 2, 3, 2, 4, 3, tl); v.box(1, 2, 0, 1, 4, 0, td)
    v.set(1, 5, 2, td); v.set(1, 6, 3, td); v.set(1, 5, 4, td) // the handle (behind)
    v.set(1, 1, 3, td); v.set(1, 1, 4, t); v.set(1, 0, 5, t); v.set(1, 0, 6, t); v.box(0, 0, 7, 2, 0, 7, rose) // the spout
    out.push(v.def('h_can', { pivK: 3, shell: false }))
  }
  {
    // a sack of fertiliser, open at the top
    const v = new V(3, 3, 6)
    const s = v.c(196, 170, 120), sd = v.c(160, 134, 92), f = v.c(96, 70, 48)
    v.box(0, 0, 0, 2, 2, 4, s); v.box(0, 0, 0, 2, 2, 0, sd); v.set(1, 1, 5, f); v.set(0, 1, 5, f); v.set(1, 0, 5, f)
    out.push(v.def('h_bag', { pivK: 1, shell: false }))
  }
  return out
}
function greatTree(): ModelDef {
  const W = 35, H = 46
  const v = new V(W, W, H)
  const c = 17
  const b = v.c(104, 72, 48), bd = v.c(76, 52, 38)
  for (let y = 0; y <= 22; y++) v.cyl(c, c, y, y, y < 4 ? 4.5 - y * 0.4 : 3, (i, k) => (i > c || k > c ? bd : b))
  for (const [di, dk] of [[-5, 0], [5, 1], [0, 5], [1, -5], [-4, 4], [4, -3]]) v.box(c + di, c + dk, 0, c + di, c + dk, 1, bd)
  const tones: RGB[] = [[40, 100, 60], [62, 134, 64], [100, 172, 76], [150, 208, 100]]
  crown(v, c, c, 31, 13, 12, tones, [255, 190, 210])
  crown(v, c - 8, c + 3, 26, 8, 7, tones, [255, 190, 210])
  crown(v, c + 8, c - 2, 27, 8, 7, tones, [255, 190, 210])
  crown(v, c + 2, c + 8, 24, 7, 6, tones)
  return v.def('greatTree')
}
function spire(): ModelDef {
  const W = 21, H = 44
  const v = new V(W, W, H)
  const tones: RGB[] = [[96, 88, 96], [134, 124, 124], [176, 166, 158]]
  const [d, m, l] = tones.map((t) => v.c(...t))
  const snow = v.c(244, 248, 252)
  for (let y = 0; y < H; y++) {
    const u = y / H
    const rad = 9 * (1 - u) ** 0.8 + 0.6
    const off = Math.sin(u * 5) * 1.6
    for (let k = 0; k < W; k++) for (let i = 0; i < W; i++) {
      const dist = Math.hypot(i - 10 - off, k - 10)
      if (dist > rad + (h3(i >> 1, k >> 1, y >> 2) - 0.5) * 2.4) continue
      const sun = (10 - i + (10 - k)) / 12
      v.set(i, k, y, y > H - 7 ? snow : sun > 0.3 ? l : sun > -0.3 ? m : d)
    }
  }
  return v.def('spire')
}
function wreck(): ModelDef {
  const W = 17, L = 37, H = 20
  const v = new V(W, L, H)
  const w = v.c(132, 94, 62), wd = v.c(92, 64, 46), wl = v.c(170, 128, 86), sail = v.c(226, 214, 190), sd = v.c(190, 176, 150)
  // a hull heeled over, its ribs showing where the planks have gone
  for (let k = 2; k < L - 2; k++) {
    const u = (k - 2) / (L - 5)
    const hw = Math.round(Math.sin(u * Math.PI) ** 0.6 * 6)
    for (let y = 0; y <= 7; y++) {
      const half = Math.round(hw * (0.45 + 0.55 * (y / 7)))
      for (const sgn of [-1, 1]) {
        const i = 8 + sgn * half + Math.round(y * 0.35)
        const gone = sgn > 0 && h3(k >> 1, y >> 1, 5) > 0.55
        if (!gone || k % 4 === 0) v.set(i, k, y, k % 4 === 0 ? wd : y > 5 ? wl : w)
      }
      if (y === 0) for (let i = 8 - half; i <= 8 + half; i++) v.set(i, k, 0, wd)
    }
  }
  // the stump of a mast and a rag of sail
  for (let y = 0; y <= 18; y++) v.set(8 + Math.round(y * 0.35), 16, y, wd)
  for (let y = 9; y <= 16; y++) for (let k = 12; k <= 20; k++) if (h3(k, y, 2) > 0.3) v.set(8 + Math.round(y * 0.35), k, y, (k + y) % 3 ? sail : sd)
  return v.def('wreck')
}
function windmill(): ModelDef {
  const W = 17, H = 34
  const v = new V(W, W, H)
  const wa = v.c(240, 226, 196), wb = v.c(206, 190, 160), r = v.c(120, 84, 60), rl = v.c(156, 112, 76)
  const blade = v.c(250, 246, 232), spar = v.c(...WOOD_D)
  for (let y = 0; y <= 22; y++) v.cyl(8, 8, y, y, 6 - y * 0.12, (i, k) => (i + k > 17 ? wb : wa))
  for (let y = 23; y <= 28; y++) v.cyl(8, 8, y, y, 4.6 - (y - 23) * 0.8, (i) => (i > 8 ? r : rl))
  v.box(7, 14, 0, 9, 14, 6, r)
  // four sails, flat against the south face
  for (let s = 0; s <= 12; s++) {
    for (const [di, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const i = 8 + di * s * 0.7
      const y = 21 + dy * s * 0.7
      v.set(i, 15, y, spar)
      if (s > 3) { v.set(i + di, 15, y, blade); v.set(i, 15, y + dy, blade) }
    }
  }
  return v.def('windmill')
}

// ───────────────────────────────────────────────────────────── small things, furniture
function torch(): ModelDef {
  const v = new V(3, 3, 10)
  const w = v.c(...WOOD_D), f = v.c(255, 170, 60), f2 = v.c(255, 230, 130)
  v.box(1, 1, 0, 1, 1, 6, w)
  v.set(1, 1, 7, f); v.set(1, 1, 8, f2); v.set(0, 1, 7, f); v.set(2, 1, 7, f); v.set(1, 0, 7, f); v.set(1, 2, 7, f)
  return v.def('torch', { glow: [{ idx: f, alt: [255, 220, 110] }, { idx: f2, alt: [255, 150, 60] }] })
}
function ladder(name: string, down: boolean): ModelDef {
  const v = new V(9, 9, down ? 3 : 14)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), dark = v.c(14, 12, 20), rim = v.c(...STONE_D)
  if (down) {
    // a hole with a ladder's head sticking out of it
    v.box(0, 0, 0, 8, 8, 0, rim)
    v.box(1, 1, 0, 7, 7, 0, dark)
    v.box(2, 1, 0, 2, 1, 2, w); v.box(6, 1, 0, 6, 1, 2, w); v.box(2, 1, 1, 6, 1, 1, wd)
  } else {
    for (let y = 0; y < 14; y++) {
      v.set(2, 4, y, w); v.set(6, 4, y, w)
      if (y % 3 === 1) v.box(3, 4, y, 5, 4, y, wd)
    }
  }
  return v.def(name)
}

// ───────────────────────────────────────────────────────────── the sea: fish, and what floats
function fish(name: string, L: number, W: number, H: number, body: RGB, belly: RGB, fin: RGB): ModelDef {
  const v = new V(W + 2, L + 3, H + 2)
  const b = v.c(...body), be = v.c(...belly), f = v.c(...fin), eye = v.c(20, 20, 30)
  const ci = (W + 1) / 2
  v.blob(ci, L / 2, H / 2, W / 2, L / 2, H / 2, (_i, _k, y) => (y < H / 2 - 0.3 ? be : b))
  // tail and back fin
  for (let y = 0; y <= H; y++) if (Math.abs(y - H / 2) <= H / 2) { v.set(ci, L + 1, y, f); if (Math.abs(y - H / 2) > H / 4) v.set(ci, L + 2, y, f) }
  v.set(ci, L, Math.round(H / 2), f)
  for (let k = Math.round(L * 0.3); k <= Math.round(L * 0.6); k++) v.set(ci, k, H + 1, f)
  v.set(ci - Math.ceil(W / 2 - 0.5), 1, Math.round(H / 2) + 1, eye)
  v.set(ci + Math.ceil(W / 2 - 0.5), 1, Math.round(H / 2) + 1, eye)
  return v.def(name)
}
function octopus(): ModelDef {
  const v = new V(11, 11, 8)
  const a = v.c(190, 110, 210), l = v.c(226, 160, 240), d = v.c(140, 76, 170), eye = v.c(20, 20, 30)
  v.blob(5, 5, 5, 3.4, 3.4, 3, (i, k, y) => (y > 5 ? l : i + k > 11 ? d : a))
  for (let t = 0; t < 8; t++) {
    const ang = (t / 8) * 6.283
    for (let s = 2; s <= 5; s++) v.set(5 + Math.cos(ang) * s, 5 + Math.sin(ang) * s, s < 4 ? 2 : 1 - (s - 4), s % 2 ? a : d)
  }
  v.set(3, 3, 5, eye); v.set(7, 3, 5, eye)
  return v.def('octo')
}
function jelly(): ModelDef {
  const v = new V(9, 9, 11)
  const a = v.c(250, 190, 220), l = v.c(255, 236, 246), t = v.c(230, 150, 200)
  v.blob(4, 4, 7, 3.6, 3.6, 3.2, (_i, _k, y) => (y >= 7 ? (y > 8 ? l : a) : 0))
  for (const [i, k] of [[2, 3], [6, 3], [4, 5], [3, 6], [5, 2]]) for (let y = 1; y < 7; y++) v.set(i + ((y >> 1) & 1), k, y, t)
  return v.def('jelly', { glow: [{ idx: l, alt: [255, 200, 240] }] })
}
function seaFloorThing(name: 'urchin' | 'lobster' | 'oyster'): ModelDef {
  if (name === 'urchin') {
    const v = new V(7, 7, 5)
    const a = v.c(44, 36, 70), sp = v.c(110, 80, 160)
    v.blob(3, 3, 1, 2, 2, 2, () => a)
    for (const [i, k, y] of [[0, 3, 1], [6, 3, 1], [3, 0, 1], [3, 6, 1], [3, 3, 4], [1, 1, 2], [5, 5, 2], [1, 5, 2], [5, 1, 2]]) v.set(i, k, y, sp)
    return v.def(name)
  }
  if (name === 'lobster') {
    const v = new V(7, 11, 3)
    const a = v.c(220, 70, 50), l = v.c(250, 120, 90), d = v.c(160, 44, 40)
    v.box(2, 3, 0, 4, 8, 1, a); v.box(3, 3, 1, 3, 8, 1, l); v.box(2, 9, 0, 4, 10, 0, d)
    v.box(0, 0, 0, 1, 2, 0, a); v.box(5, 0, 0, 6, 2, 0, a); v.set(1, 3, 0, d); v.set(5, 3, 0, d)
    for (const k of [5, 6, 7]) { v.set(1, k, 0, d); v.set(5, k, 0, d) }
    return v.def(name)
  }
  const v = new V(9, 7, 4)
  const a = v.c(150, 150, 160), d = v.c(110, 110, 124), p = v.c(255, 250, 240)
  v.blob(4, 3, 0, 3.6, 2.6, 2.6, (i, _k, y) => (y > 1 ? (i % 2 ? a : d) : d))
  v.set(4, 5, 1, p); v.set(4, 5, 2, p)
  return v.def(name, { glow: [{ idx: p, alt: [200, 230, 255] }] })
}
function bobber(): ModelDef {
  const v = new V(3, 3, 5)
  const r = v.c(232, 70, 60), w = v.c(250, 250, 250), k = v.c(60, 60, 70)
  v.box(0, 0, 0, 2, 2, 1, w); v.box(0, 0, 2, 2, 2, 3, r); v.set(1, 1, 4, k)
  return v.def('bobber')
}
/** a missile: grey body, red nose, fins at the back (round 22). Its nose points north (k = 0) */
function missile(): ModelDef {
  const v = new V(3, 9, 3)
  const b = v.c(196, 200, 210), d = v.c(120, 124, 136), r = v.c(230, 60, 50), f = v.c(80, 84, 96)
  v.box(1, 1, 1, 1, 7, 1, b); v.set(1, 0, 1, r); v.set(1, 7, 1, d)
  v.set(0, 7, 1, f); v.set(2, 7, 1, f); v.set(1, 7, 0, f); v.set(1, 7, 2, f)
  return v.def('missile', { glow: [{ idx: r, alt: [255, 120, 80] }] })
}
function bolt(): ModelDef {
  const v = new V(3, 9, 2)
  const st = v.c(...STEEL), ir = v.c(...IRON)
  v.box(1, 1, 0, 1, 8, 0, st); v.set(0, 2, 0, ir); v.set(2, 2, 0, ir); v.set(1, 0, 0, st)
  return v.def('bolt')
}
function fishShadow(name: string, L: number, W: number): ModelDef {
  const v = new V(W + 2, L + 4, 1)
  const d = v.c(18, 52, 100)
  const ci = (W + 1) / 2
  v.blob(ci, L / 2 + 0.5, 0, W / 2, L / 2, 0.6, () => d)
  v.set(ci, L + 1, 0, d); v.set(ci - 1, L + 2, 0, d); v.set(ci + 1, L + 2, 0, d); v.set(ci, L + 2, 0, d)
  return v.def(name)
}
function gull(): ModelDef {
  const v = new V(11, 7, 3)
  const w = v.c(250, 250, 250), g = v.c(200, 206, 220), k = v.c(40, 40, 50), o = v.c(250, 170, 60)
  v.box(5, 1, 1, 5, 5, 1, w); v.set(5, 0, 1, o); v.set(5, 6, 1, g)
  for (let i = 1; i <= 4; i++) { v.set(5 - i, 3 - (i > 2 ? 1 : 0), i > 2 ? 2 : 1, i === 4 ? k : w); v.set(5 + i, 3 - (i > 2 ? 1 : 0), i > 2 ? 2 : 1, i === 4 ? k : w) }
  return v.def('gull')
}
/** the island's small creatures: each a few voxels, recognisable at a glance */
function critters(): ModelDef[] {
  const out: ModelDef[] = []
  const no = { shell: false }
  { // a gull standing on the sand (wings folded)
    const v = new V(5, 7, 6)
    const w = v.c(250, 250, 250), g = v.c(190, 196, 210), k = v.c(40, 40, 50), o = v.c(250, 170, 60)
    v.set(2, 3, 0, o); v.set(2, 4, 0, o)
    v.box(1, 2, 1, 3, 5, 2, w); v.box(1, 3, 2, 1, 5, 2, g); v.box(3, 3, 2, 3, 5, 2, g); v.set(2, 6, 2, k)
    v.box(2, 1, 3, 2, 2, 4, w); v.set(2, 0, 4, o); v.set(2, 1, 5, w)
    out.push(v.def('c_gull', { pivK: 3, ...no }))
  }
  for (const [name, shell, body] of [['c_hermit', [214, 170, 120], [230, 110, 80]], ['c_crab', [214, 64, 50], [240, 110, 80]]] as [string, RGB, RGB][]) {
    const v = new V(7, 5, 4)
    const sh = v.c(...shell), b = v.c(...body), k = v.c(40, 30, 30), d = v.c(shell[0] * 0.7, shell[1] * 0.7, shell[2] * 0.7)
    if (name === 'c_hermit') {
      v.box(2, 1, 1, 4, 3, 2, sh); v.set(3, 2, 3, d); v.set(2, 1, 2, d)
      v.set(1, 0, 0, b); v.set(5, 0, 0, b); v.set(3, 0, 1, b); v.set(3, 0, 2, k)
    } else {
      v.box(1, 1, 0, 5, 3, 1, sh); v.box(2, 2, 2, 4, 2, 2, b)
      v.set(0, 0, 1, b); v.set(6, 0, 1, b); v.set(0, 0, 2, sh); v.set(6, 0, 2, sh)
      v.set(2, 1, 2, k); v.set(4, 1, 2, k)
      for (const i of [1, 5]) { v.set(i, 4, 0, d); v.set(i, 0, 0, d) }
    }
    out.push(v.def(name, { pivK: 2, ...no }))
  }
  // butterflies and moths: two wings either side of a body, held a little up
  for (const [name, wing, edge, glow] of [
    ['c_white', [250, 250, 244], [60, 60, 70], false], ['c_swallow', [255, 206, 70], [40, 40, 50], false],
    ['c_morpho', [70, 140, 240], [20, 40, 90], false], ['c_moth', [200, 214, 255], [140, 150, 220], true],
  ] as [string, RGB, RGB, boolean][]) {
    const v = new V(7, 4, 3)
    const w = v.c(...wing), e = v.c(...edge), b = v.c(50, 40, 40)
    v.box(3, 0, 0, 3, 3, 0, b)
    for (const i of [0, 1, 2, 4, 5, 6]) for (let k = 0; k <= 3; k++) {
      const far = i === 0 || i === 6
      if (far && (k === 0 || k === 3)) continue
      v.set(i, k, i === 2 || i === 4 ? 0 : 1, far || k === 3 ? e : w)
    }
    out.push(v.def(name, { pivK: 1.5, ...no, ...(glow ? { glow: [{ idx: w, alt: [240, 246, 255] }], lit: [{ idx: w, rgb: [214, 226, 255] }] } : {}) }))
  }
  { // ladybird
    const v = new V(3, 3, 2)
    const r = v.c(230, 50, 40), k = v.c(30, 30, 36)
    v.box(0, 0, 0, 2, 2, 0, r); v.set(1, 1, 1, r); v.set(1, 0, 1, k); v.set(0, 2, 0, k); v.set(2, 1, 0, k)
    out.push(v.def('c_ladybug', { pivK: 1, ...no }))
  }
  { // dragonfly
    const v = new V(7, 7, 2)
    const b = v.c(60, 160, 200), w = v.c(210, 236, 246), k = v.c(30, 60, 80)
    v.box(3, 0, 0, 3, 6, 0, b); v.set(3, 0, 1, k)
    for (const i of [0, 1, 2, 4, 5, 6]) { v.set(i, 2, 1, w); v.set(i, 4, 1, w) }
    out.push(v.def('c_dragonfly', { pivK: 2, ...no }))
  }
  { // firefly: a dark speck with a light that comes and goes
    const v = new V(3, 3, 2)
    const b = v.c(50, 50, 40), l = v.c(250, 250, 140)
    v.set(1, 0, 1, b); v.box(1, 1, 0, 1, 2, 0, l)
    out.push(v.def('c_firefly', { pivK: 1, ...no, glow: [{ idx: l, alt: [120, 120, 60] }], lit: [{ idx: l, rgb: [250, 255, 150] }] }))
  }
  { // snail
    const v = new V(3, 6, 4)
    const sh = v.c(190, 130, 80), sd = v.c(140, 90, 60), b = v.c(200, 196, 170)
    v.box(0, 2, 1, 2, 4, 3, sh); v.set(1, 3, 2, sd); v.box(1, 0, 0, 1, 5, 0, b); v.set(1, 0, 1, b)
    out.push(v.def('c_snail', { pivK: 3, ...no }))
  }
  { // frog
    const v = new V(5, 5, 3)
    const g = v.c(90, 180, 80), d = v.c(60, 130, 60), k = v.c(30, 30, 36), y = v.c(230, 230, 160)
    v.box(1, 1, 0, 3, 3, 1, g); v.set(0, 3, 0, d); v.set(4, 3, 0, d); v.set(0, 1, 0, d); v.set(4, 1, 0, d)
    v.set(1, 1, 2, y); v.set(3, 1, 2, y); v.set(1, 0, 2, k); v.set(3, 0, 2, k)
    out.push(v.def('c_frog', { pivK: 2, ...no }))
  }
  { // the net, held like the tools: a hoop on a pole
    const v = new V(3, 7, 15)
    const w = v.c(150, 104, 64), r = v.c(70, 72, 84), m = v.c(236, 236, 226)
    v.box(1, 3, 0, 1, 3, 10, w)
    for (let k = 0; k <= 6; k++) for (let y = 10; y <= 14; y++) {
      const d = Math.hypot(k - 3, (y - 12) * 1.4)
      if (d > 3.3) continue
      v.set(1, k, y, d > 2.4 ? r : m)
    }
    out.push(v.def('h_net', { pivK: 3, shell: false }))
  }
  return out
}
/** the farm: a bed of tilled earth, and what grows in it, from a sprout to a crop ready to pick */
function farm(): ModelDef[] {
  const out: ModelDef[] = []
  // stalks and leaves are thin: drawn with their sides so they are not stripes from a low eye
  const no = { shell: true }
  {
    // a raised bed: a board rim one voxel up, furrows of dark earth inside
    const v = new V(9, 9, 2)
    const e = v.c(120, 84, 56), ed = v.c(92, 62, 42), rim = v.c(170, 128, 84), rimD = v.c(130, 94, 60)
    for (let i = 0; i < 9; i++) for (let k = 0; k < 9; k++) {
      const edge = i === 0 || k === 0 || i === 8 || k === 8
      v.set(i, k, 0, edge ? rimD : k % 2 ? ed : e)
      if (edge) v.set(i, k, 1, rim)
    }
    out.push(v.def('plot', { shell: true }))
  }
  // round 18: the field's plots, side by side with no rim so they join into one piece of ground.
  // waste (weeds and stones); tilled, good and rich earth (each darker), dry or wet (darker still)
  {
    const v = new V(8, 8, 3)
    const d = v.c(150, 128, 86), dd = v.c(128, 108, 72), w = v.c(96, 150, 70), wl = v.c(132, 180, 86), st = v.c(160, 160, 156)
    for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) v.set(i, k, 0, (i * 5 + k * 3) % 7 < 2 ? dd : d)
    for (const [i, k, h] of [[1, 1, 2], [5, 2, 1], [2, 5, 2], [6, 6, 1], [4, 4, 2], [6, 0, 1]]) { for (let y = 1; y <= h; y++) v.set(i, k, y, y === h ? wl : w) }
    v.set(3, 1, 1, st); v.set(0, 6, 1, st); v.set(5, 5, 1, st)
    out.push(v.def('soil_waste', no))
  }
  for (const [rank, e, ed] of [[0, [150, 108, 70], [126, 88, 56]], [1, [124, 86, 54], [100, 68, 42]], [2, [92, 62, 40], [70, 46, 30]]] as [number, RGB, RGB][]) {
    for (const wet of [false, true]) {
      const v = new V(8, 8, 1)
      const k1 = wet ? 0.72 : 1
      const a = v.c(e[0] * k1, e[1] * k1, e[2] * k1 + (wet ? 6 : 0)), b = v.c(ed[0] * k1, ed[1] * k1, ed[2] * k1 + (wet ? 6 : 0))
      for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) v.set(i, k, 0, k % 2 ? b : a)
      out.push(v.def(`soil_${rank}${wet ? 'w' : ''}`, no))
    }
  }
  {
    // the board along the field's edge
    const v = new V(8, 1, 2)
    const r = v.c(170, 128, 84), rd = v.c(130, 94, 60)
    for (let i = 0; i < 8; i++) { v.set(i, 0, 0, rd); v.set(i, 0, 1, i % 4 === 0 ? rd : r) }
    out.push(v.def('field_edge', no))
  }
  {
    // the compost bin: a slatted box, leaves and peelings heaped in it
    const v = new V(9, 9, 9)
    const wd = v.c(150, 110, 70), wdD = v.c(112, 80, 50), heap = v.c(90, 70, 44), g1 = v.c(110, 160, 70), g2 = v.c(200, 170, 80), o = v.c(230, 130, 60)
    for (let y = 0; y < 7; y++) for (let i = 0; i < 9; i++) for (let k = 0; k < 9; k++) {
      const edge = i === 0 || k === 0 || i === 8 || k === 8
      if (!edge) continue
      const corner = (i === 0 || i === 8) && (k === 0 || k === 8)
      if (corner || y % 2 === 0) v.set(i, k, y, corner ? wdD : wd)
    }
    for (let i = 1; i < 8; i++) for (let k = 1; k < 8; k++) { for (let y = 0; y < 5; y++) v.set(i, k, y, heap); v.set(i, k, 5, (i * 3 + k * 5) % 7 === 0 ? o : (i + k) % 3 === 0 ? g2 : (i * k) % 2 ? g1 : heap) }
    v.set(4, 4, 6, g1); v.set(3, 5, 6, g2); v.set(5, 3, 6, heap)
    out.push(v.def('compost_bin', { shell: true }))
  }
  {
    const v = new V(5, 5, 3)
    const g = v.c(110, 190, 80), gl = v.c(150, 220, 110)
    v.set(2, 2, 0, g); v.set(2, 2, 1, g); v.set(1, 2, 2, gl); v.set(3, 2, 2, gl)
    out.push(v.def('cr_sprout', no))
  }
  // [name, leaf, leafLight, fruit, fruitLight, ripe shape]
  const leafy = (name: string, fruit: RGB, fruitL: RGB, kind: 'root' | 'grain' | 'berry' | 'gourd') => {
    for (const ripe of [false, true]) {
      const v = new V(7, 7, kind === 'grain' ? 8 : 6)
      const g = v.c(80, 160, 70), gl = v.c(120, 200, 96)
      const f = v.c(...fruit), fl = v.c(...fruitL)
      if (kind === 'root') {
        for (const [i, k] of [[2, 2], [4, 2], [3, 4], [2, 4], [4, 4]]) { v.set(i, k, 0, ripe ? f : g); v.box(i, k, 1, i, k, ripe ? 3 : 2, g); v.set(i, k, ripe ? 4 : 3, gl) }
        if (ripe) { v.set(3, 3, 0, fl); v.set(2, 2, 1, f) }
      } else if (kind === 'grain') {
        for (const [i, k] of [[1, 1], [3, 1], [5, 1], [2, 3], [4, 3], [1, 5], [3, 5], [5, 5]]) {
          v.box(i, k, 0, i, k, ripe ? 5 : 3, ripe ? v.c(200, 170, 80) : g)
          if (ripe) { v.box(i, k, 6, i, k, 7, f); v.set(i, k, 7, fl) } else v.set(i, k, 4, gl)
        }
      } else if (kind === 'berry') {
        v.blob(3, 3, 1, 2.6, 2.6, 1.4, (i, k, y) => ((i + k + y) % 3 === 0 ? gl : g))
        if (ripe) for (const [i, k, y] of [[1, 2, 1], [4, 1, 2], [5, 4, 1], [2, 5, 2], [3, 3, 3]]) v.set(i, k, y, (i + k) % 2 ? f : fl)
      } else {
        v.box(0, 3, 0, 6, 3, 0, g); v.set(1, 2, 0, gl); v.set(5, 4, 0, gl); v.set(3, 1, 1, gl)
        if (ripe) { v.blob(3, 3, 1.6, 2.4, 2.2, 1.8, (i, k, y) => (i % 2 ? f : fl)); v.set(3, 3, 4, v.c(90, 120, 50)) }
      }
      out.push(v.def(`cr_${name}${ripe ? 2 : 1}`, no))
    }
  }
  leafy('carrot', [240, 130, 50], [255, 170, 90], 'root')
  leafy('wheat', [230, 200, 90], [250, 230, 140], 'grain')
  leafy('strawberry', [230, 50, 60], [255, 110, 110], 'berry')
  leafy('pumpkin', [236, 136, 40], [255, 176, 80], 'gourd')
  return out
}
/** an animal that can become a pet, in one of its colours (walk: the other foot forward) */
function petModel(sp: string, col: PetColour, walk: boolean): ModelDef {
  const { W, L, H, kind } = PET_SPECIES[sp].shape
  const v = new V(W, L, H)
  const m = v.c(...col.main), d = v.c(...col.dark), l = v.c(...col.light)
  const eye = v.c(30, 28, 36), nose = v.c(230, 140, 150), white = v.c(248, 246, 240)
  const ci = (W - 1) / 2
  const leg = (i: number, k: number, h: number, c = d) => v.box(i, k, 0, i, k, h - 1, c)
  const s1 = walk ? 1 : 0
  if (kind === 'chicken') {
    const beak = v.c(250, 170, 50), comb = v.c(230, 50, 50)
    leg(1, 3 + s1, 2, beak); leg(3, 3 - s1, 2, beak)
    v.blob(ci, 3, 3.2, 2, 2.3, 1.4, () => m)
    v.box(0, 2, 3, 0, 4, 3, d); v.box(4, 2, 3, 4, 4, 3, d) // wings
    v.box(1, 5, 4, 3, 5, 5, l) // tail feathers
    v.box(1, 0, 4, 3, 1, 6, m); v.set(1, 0, 5, eye); v.set(3, 0, 5, eye)
    v.set(2, 0, 4, beak); v.set(2, 1, 7 - 1, comb); v.set(2, 0, 6, comb)
    return v.def(petModel_(sp, col.id, walk), { pivK: 3, shell: false })
  }
  const legH = kind === 'sheep' || kind === 'rabbit' ? 2 : 3
  const fk = 2, bk = L - 2
  // diagonal pairs swing together
  leg(1, fk - s1, legH); leg(W - 2, fk + s1, legH); leg(1, bk + s1, legH); leg(W - 2, bk - s1, legH)
  const top = legH + (kind === 'sheep' ? 3 : 2)
  if (kind === 'sheep') {
    v.blob(ci, (L - 1) / 2 + 0.5, legH + 1.6, ci + 0.4, (L - 2) / 2, 1.9, (i, k, y) => ((i + k + y) % 3 === 0 ? l : m))
    const face = v.c(60, 54, 62)
    v.box(ci - 1, 0, legH + 1, ci + 1, 1, legH + 3, face); v.set(ci - 1, 0, legH + 2, white); v.set(ci + 1, 0, legH + 2, white)
    v.set(0, 1, legH + 3, face); v.set(W - 1, 1, legH + 3, face)
  } else {
    v.box(1, 2, legH, W - 2, L - 2, top, m)
    v.box(1, 2, top, W - 2, L - 2, top, l)
    // the head, at the front and up a little
    const hy = top
    v.box(ci - 1, 0, hy - 1, ci + 1, 2, hy + 1, m)
    v.set(ci - 1, 0, hy, eye); v.set(ci + 1, 0, hy, eye); v.set(ci, 0, hy - 1, kind === 'cat' || kind === 'rabbit' ? nose : eye)
    if (kind === 'rabbit') {
      v.box(ci - 1, 1, hy + 2, ci - 1, 1, hy + 4, m); v.box(ci + 1, 1, hy + 2, ci + 1, 1, hy + 4, m)
      v.set(ci - 1, 1, hy + 3, nose); v.set(ci + 1, 1, hy + 3, nose)
      v.set(ci, L - 2, top, white)
    } else if (kind === 'goat') {
      const horn = v.c(200, 190, 170)
      v.set(ci - 1, 2, hy + 2, horn); v.set(ci + 1, 2, hy + 2, horn); v.set(ci - 1, 3, hy + 3, horn); v.set(ci + 1, 3, hy + 3, horn)
      v.set(ci, 0, hy - 2, l) // beard
      v.set(ci, L - 2, top + 1, d)
    } else if (kind === 'dog') {
      v.box(ci - 2, 1, hy - 1, ci - 2, 1, hy + 1, d); v.box(ci + 2, 1, hy - 1, ci + 2, 1, hy + 1, d)
      v.box(ci, L - 1, top, ci, L - 1, top + 2, m)
    } else if (kind === 'cat') {
      v.set(ci - 1, 1, hy + 2, m); v.set(ci + 1, 1, hy + 2, m)
      v.box(ci, L - 1, top, ci, L - 1, top + 3, m); v.set(ci, L - 1, top + 3, d)
    } else if (kind === 'fox') {
      v.set(ci - 1, 1, hy + 2, d); v.set(ci + 1, 1, hy + 2, d)
      v.set(ci, 0, hy - 1, white)
      v.box(ci - 1, L - 1, top - 1, ci + 1, L - 1, top + 1, m); v.box(ci - 1, L - 1, top + 2, ci + 1, L - 1, top + 2, white)
    }
  }
  return v.def(petModel_(sp, col.id, walk), { pivK: (L - 1) / 2, shell: false })
}
const petModel_ = (sp: string, col: string, walk: boolean) => `p_${sp}_${col}${walk ? '_w' : ''}`
function pets(): ModelDef[] {
  const out: ModelDef[] = []
  for (const sp of Object.keys(PET_SPECIES)) for (const col of PET_SPECIES[sp].colours) for (const walk of [false, true]) out.push(petModel(sp, col, walk))
  return out
}
function flotsam(): ModelDef {
  const v = new V(9, 9, 5)
  const w = v.c(196, 150, 96), wl = v.c(228, 186, 126), wd = v.c(140, 100, 62), rope = v.c(236, 222, 190)
  v.box(1, 1, 0, 7, 7, 3, w); v.box(1, 1, 4, 7, 7, 4, wl)
  for (const e of [1, 7]) { v.box(e, 1, 0, e, 7, 4, wd); v.box(1, e, 4, 7, e, 4, wd) }
  v.box(4, 1, 4, 4, 7, 4, rope); v.box(1, 4, 4, 7, 4, 4, rope)
  return v.def('flotsam')
}

// ───────────────────────────────────────────────────────────── furniture
function furniture(): ModelDef[] {
  const out: ModelDef[] = []
  {
    const v = new V(11, 7, 7)
    const w = v.c(...WOOD), wl = v.c(...WOOD_L), wd = v.c(...WOOD_D)
    for (const i of [1, 9]) { v.box(i, 2, 0, i, 2, 6, wd); v.box(i, 5, 0, i, 5, 2, wd) }
    v.box(0, 2, 3, 10, 5, 3, wl); v.box(0, 2, 5, 10, 2, 6, w)
    out.push(v.def('f_bench'))
  }
  {
    const v = new V(11, 11, 6)
    const st = v.c(...STONE), sl = v.c(...STONE_L), soil = v.c(110, 78, 56), g = v.c(84, 150, 62)
    v.cyl(5, 5, 0, 1, 5, (i, k) => ((i + k) % 3 ? st : sl))
    v.cyl(5, 5, 1, 1, 3.6, soil)
    const petals: RGB[] = [[255, 238, 156], [244, 150, 150], [255, 255, 255], [190, 160, 250], [250, 120, 90]]
    for (let n = 0; n < 9; n++) {
      const a = (n / 9) * 6.283
      const r = n % 2 ? 1.4 : 3
      const i = 5 + Math.cos(a) * r, k = 5 + Math.sin(a) * r
      v.set(i, k, 2, g); v.set(i, k, 3, g); v.set(i, k, 4, v.c(...petals[n % 5]))
    }
    out.push(v.def('f_flowerBed'))
  }
  {
    const v = new V(5, 5, 18)
    const ir = v.c(...IRON), lamp = v.c(255, 226, 130), cap = v.c(60, 62, 76)
    v.box(1, 1, 0, 3, 3, 0, ir); v.box(2, 2, 1, 2, 2, 13, ir)
    v.box(1, 1, 14, 3, 3, 16, lamp); v.box(0, 0, 17, 4, 4, 17, cap)
    out.push(v.def('f_lamp', { glow: [{ idx: lamp, alt: [255, 246, 190] }], lit: [{ idx: lamp, rgb: [255, 236, 150] }] }))
  }
  {
    // the keeper's lantern: a stone plinth, a brass cage, a light that never goes out
    const v = new V(7, 7, 16)
    const st = v.c(...STONE), br = v.c(214, 170, 70), lamp = v.c(255, 236, 150), ir = v.c(...IRON)
    v.box(1, 1, 0, 5, 5, 1, st); v.box(2, 2, 2, 4, 4, 4, st)
    v.box(2, 2, 5, 4, 4, 5, br); v.box(2, 2, 6, 4, 4, 10, lamp)
    for (const [i, k] of [[2, 2], [4, 2], [2, 4], [4, 4]]) v.box(i, k, 6, i, k, 10, br)
    v.box(1, 1, 11, 5, 5, 11, br); v.box(2, 2, 12, 4, 4, 12, br); v.box(3, 3, 13, 3, 3, 15, ir)
    out.push(v.def('f_keeper', { glow: [{ idx: lamp, alt: [255, 255, 226] }] }))
  }
  {
    const v = new V(11, 3, 24)
    const pole = v.c(226, 222, 214), r = v.c(232, 96, 60), rl = v.c(255, 140, 90), y = v.c(250, 210, 90)
    v.box(1, 1, 0, 1, 1, 23, pole)
    for (let i = 2; i <= 9; i++) for (let yy = 17; yy <= 22; yy++) v.set(i, 1, yy - (i > 6 ? 1 : 0), (i + yy) % 4 === 0 ? rl : r)
    v.box(4, 1, 19, 5, 1, 20, y)
    out.push(v.def('f_flag'))
  }
  {
    const v = new V(15, 13, 6)
    const w = v.c(200, 160, 110), wd = v.c(140, 104, 70)
    v.box(2, 4, 4, 12, 8, 4, w); for (const [i, k] of [[3, 4], [11, 4], [3, 8], [11, 8]]) v.box(i, k, 0, i, k, 3, wd)
    v.box(2, 1, 2, 12, 2, 2, w); v.box(2, 10, 2, 12, 11, 2, w)
    for (const i of [3, 11]) { v.box(i, 1, 0, i, 2, 1, wd); v.box(i, 10, 0, i, 11, 1, wd) }
    v.box(6, 5, 5, 8, 7, 5, v.c(232, 96, 60))
    out.push(v.def('f_table'))
  }
  {
    const v = new V(9, 3, 16)
    const w = v.c(...WOOD_D), sh: RGB[] = [[250, 214, 200], [255, 246, 236], [240, 160, 150]]
    v.box(0, 1, 0, 0, 1, 15, w); v.box(8, 1, 0, 8, 1, 15, w); v.box(0, 1, 15, 8, 1, 15, w)
    for (let i = 2; i <= 6; i += 2) { const len = 4 + (i % 3) * 2; for (let y = 14; y > 14 - len; y--) v.set(i, 1, y, y === 15 - len ? v.c(...sh[i % 3]) : v.c(236, 222, 190)); v.set(i, 1, 14 - len, v.c(...sh[(i + 1) % 3])) }
    out.push(v.def('f_chime'))
  }
  {
    const v = new V(15, 5, 13)
    const w = v.c(...WOOD_D), wl = v.c(...WOOD), fb = v.c(110, 150, 190), fl = v.c(190, 210, 230)
    for (const i of [0, 14]) v.box(i, 2, 0, i, 2, 12, w)
    v.box(0, 2, 11, 14, 2, 11, wl); v.box(0, 2, 6, 14, 2, 6, wl)
    for (let i = 2; i <= 12; i += 2) { v.box(i, 2, 8, i, 2, 10, i % 4 ? fb : fl); v.box(i, 2, 3, i, 2, 5, i % 4 ? fl : fb) }
    out.push(v.def('f_rack'))
  }
  {
    const v = new V(13, 3, 13)
    const w = v.c(...WOOD), wd = v.c(...WOOD_D), b = v.c(70, 110, 170), be = v.c(200, 210, 220)
    v.box(6, 1, 0, 6, 1, 4, wd); v.box(0, 1, 5, 12, 1, 12, w)
    for (let i = 2; i <= 10; i++) { const h = i < 9 ? 1 + Math.round(Math.sin(((i - 2) / 7) * Math.PI) * 1.6) : 2; for (let y = 8 - h + 1; y <= 8 + h - 1; y++) v.set(i, 2, y, y < 8 ? be : b) }
    out.push(v.def('f_trophy'))
  }
  {
    const v = new V(7, 7, 14)
    const ir = v.c(...IRON), a = v.c(110, 214, 250), b = v.c(200, 150, 255), wv = v.c(255, 255, 255)
    v.cyl(3, 3, 0, 1, 3, ir); v.box(3, 3, 2, 3, 3, 5, ir)
    for (let y = 6; y <= 13; y++) { const r = y < 10 ? (y - 5) * 0.5 : (14 - y) * 0.6; v.cyl(3, 3, y, y, Math.max(0.3, r), (i) => (y > 11 ? wv : i > 3 ? b : a)) }
    out.push(v.def('f_crystal', { glow: [{ idx: wv, alt: [190, 240, 255] }, { idx: a, alt: [150, 230, 255] }] }))
  }
  {
    const v = new V(13, 13, 14)
    const st = v.c(...STONE), sl = v.c(...STONE_L), g = v.c(250, 204, 60), gl = v.c(255, 240, 160), gd = v.c(204, 156, 40)
    v.box(2, 2, 0, 10, 10, 1, st); v.box(3, 3, 2, 9, 9, 3, sl); v.box(6, 6, 4, 6, 6, 8, gd)
    // a little golden plane
    v.box(6, 2, 9, 6, 10, 10, g); v.box(1, 5, 9, 11, 6, 9, g); v.box(4, 10, 9, 8, 10, 9, g); v.set(6, 10, 11, gl); v.set(6, 2, 10, gl); v.box(1, 5, 9, 1, 6, 9, gl)
    out.push(v.def('f_statue', { glow: [{ idx: gl, alt: [255, 255, 220] }] }))
  }
  {
    const v = new V(17, 17, 14)
    const st = v.c(190, 200, 236), sl = v.c(226, 232, 255), wa = v.c(110, 200, 240), wl = v.c(220, 244, 255), mo = v.c(240, 244, 255)
    v.cyl(8, 8, 0, 2, 8, (i, k) => ((i + k) % 3 ? st : sl))
    v.cyl(8, 8, 2, 2, 6.4, wa)
    v.cyl(8, 8, 3, 7, 1.4, st); v.cyl(8, 8, 8, 8, 3.4, sl); v.cyl(8, 8, 9, 9, 2.4, wa)
    v.box(8, 8, 9, 8, 8, 12, st); v.set(8, 8, 13, mo)
    for (let a = 0; a < 6; a++) { const an = (a / 6) * 6.283; v.set(8 + Math.cos(an) * 3.6, 8 + Math.sin(an) * 3.6, 7, wl); v.set(8 + Math.cos(an) * 4.2, 8 + Math.sin(an) * 4.2, 5, wl) }
    out.push(v.def('f_fountain', { glow: [{ idx: wl, alt: [150, 220, 255] }, { idx: mo, alt: [200, 214, 255] }] }))
  }
  return out
}

// ───────────────────────────────────────────────────────────── everything
export function buildProps(): Record<string, ModelDef> {
  const out: Record<string, ModelDef> = {}
  const add = (m: ModelDef) => { out[m.name] = m }
  for (const s of [1, 2, 3]) {
    add(oak('oak' + s, s))
    add(oak('apple' + s, s, OAK, [232, 70, 60]))
    add(oak('birch' + s, s, BIRCH, undefined, [226, 222, 210], [150, 146, 140]))
    add(pine('pine' + s, s))
  }
  add(palm('palm1', 1)); add(palm('palm2', 2))
  add(stump('stump1', 0.8, BARK, BARK_D)); add(stump('stump2', 1.2, BARK, BARK_D)); add(stump('stump3', 1.6, BARK, BARK_D))
  add(stump('stumpPalm', 0.8, [176, 140, 96], [140, 106, 72]))
  add(sapling())
  add(boulder('boulder', 5.4, 4.4, 6.5)); add(boulder('boulderS', 3.6, 3, 4.2))
  for (const k of ['copper', 'iron', 'coal', 'gold', 'crystal', 'moon'] as const) add(oreRock('ore_' + k, k))
  add(rubble())
  add(bush('bushBerry', [232, 70, 110])); add(bush('bushBare'))
  add(flax('flax', false)); add(flax('flaxCut', true))
  add(flowers('flower', [[255, 238, 156], [244, 150, 150], [255, 255, 255], [190, 160, 250]]))
  add(sticks()); add(pebbles()); add(shell())
  add(workbench()); add(furnace('furnace', false)); add(furnace('furnaceLit', true)); add(board()); add(crates())
  add(house('houseRed', [196, 84, 64], [228, 116, 88]))
  add(house('houseBlue', [70, 110, 170], [104, 146, 204]))
  add(house('houseGreen', [70, 136, 90], [104, 170, 116]))
  add(house('houseSand', [200, 150, 90], [230, 186, 120], [250, 240, 220]))
  add(hangar()); add(mineEntrance())
  add(lighthouse()); add(beacon()); add(greatTree()); for (const m of heldTools()) add(m); for (const m of critters()) add(m); for (const m of farm()) add(m); for (const m of pets()) add(m); add(spire()); add(wreck()); add(windmill())
  add(torch()); add(ladder('ladderDown', true)); add(ladder('ladderUp', false))
  add(fish('fishS', 6, 3, 3, [250, 150, 60], [255, 226, 150], [232, 96, 60]))
  add(fish('fishM', 8, 3, 4, [240, 130, 140], [255, 214, 214], [200, 84, 100]))
  add(fish('fishL', 11, 5, 5, [150, 110, 80], [220, 196, 160], [110, 76, 60]))
  add(fish('fishXL', 15, 5, 6, [60, 100, 170], [210, 220, 232], [40, 70, 130]))
  add(octopus()); add(jelly()); add(seaFloorThing('urchin')); add(seaFloorThing('lobster')); add(seaFloorThing('oyster'))
  add(bobber()); add(missile()); add(bolt()); add(gull()); add(flotsam())
  add(fishShadow('fishShadow1', 8, 3)); add(fishShadow('fishShadow2', 11, 4)); add(fishShadow('fishShadow3', 15, 5))
  for (const f of furniture()) add(f)
  for (const m of indoorModels()) add(m)
  for (const m of furnishModels()) add(m)
  for (const m of homeModels()) add(m)
  for (const m of estateModels()) add(m)
  add(shovelHeld())
  return out
}

/** the same model in other colours (the islanders are the pilot in different clothes) */
export function recolor(def: ModelDef, name: string, map: Record<number, RGB>): ModelDef {
  return { ...def, name, colors: { ...def.colors, ...map } }
}
