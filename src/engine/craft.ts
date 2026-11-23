// The player's planes and boats, drawn with their own paint: a body colour, an accent colour,
// the colour of the sails or the wing fabric, a stripe, and a picture on the sail (or the top
// of the wing) — and all of it fading as the paint wears. Each model is built with its colours
// in fixed slots, so a paint job is a matter of filling the slots.

import type { ModelDef } from './models'
import { HAIR_COLORS, SKINS, type Look } from './avatar'
import { $t } from '../i18n'

export type RGB = [number, number, number]
export type Stripe = 'none' | 'single' | 'double' | 'checker'
/** the eight colours a picture can use (they are the dyes, in this order) */
export const DESIGN_W = 12
export const DESIGN_H = 8
export const DESIGN_COLOURS: RGB[] = [
  [220, 62, 50], [246, 202, 62], [62, 112, 204], [70, 162, 92], [246, 244, 238], [40, 40, 48], [246, 150, 182], [206, 214, 230],
]
export interface Paint {
  body?: RGB
  accent?: RGB
  cloth?: RGB
  stripe?: Stripe
  /** DESIGN_W × DESIGN_H characters: '0'–'7' a colour, '.' the cloth showing through */
  design?: string
}

// colour slots
const DARK = 1, BODY_D = 2, BODY = 3, BODY_L = 4, ACC_D = 5, ACC = 6, ACC_L = 7, GLASS_D = 8, GLASS = 9, METAL = 10
const BLADE_A = 11, BLADE_B = 12, WOOD_D = 13, WOOD = 14, WOOD_L = 15, CLOTH_D = 16, CLOTH = 17, CRATE = 18, CRATE_D = 19
const SKIN = 20, CAP = 21, SCARF = 22, JACKET = 23, PANTS = 24, HAIR = 25, DES = 30

class Vox {
  d: Uint8Array
  constructor(public W: number, public L: number, public H: number) {
    this.d = new Uint8Array(W * L * H)
  }
  set(i: number, k: number, y: number, c: number) {
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
  slices() {
    const out: Uint8Array[] = []
    const n = this.W * this.L
    for (let y = 0; y < this.H; y++) out.push(this.d.subarray(y * n, (y + 1) * n))
    return out
  }
}

/** a model's paintable parts: where a stripe can go (two rows, along the body) and where a picture goes (u, v in 0..1) */
interface Built {
  v: Vox
  stripes: { i: number; k: number; y: number; row: 0 | 1; t: number }[]
  canvas: { i: number; k: number; y: number; u: number; v: number }[]
  pivK: number
  pivY: number
  tip: ModelDef['tip']
  spin?: number[]
  defaults: { body: RGB; accent: RGB; cloth: RGB }
}

function rider(v: Vox, i: number, k: number, y: number, seated = true) {
  // the pilot, sitting, facing the bow: legs, a body with shoulders and arms, a head with hair
  // at the back (that is the side seen on the way), and the cap on top
  if (seated) v.box(i - 1, k, y, i + 1, k + 1, y, PANTS)
  v.box(i - 1, k + 1, y + 1, i + 1, k + 2, y + 2, JACKET)
  v.box(i - 2, k + 1, y + 2, i + 2, k + 2, y + 2, JACKET)
  v.set(i - 2, k, y + 1, SKIN); v.set(i + 2, k, y + 1, SKIN)
  v.box(i - 1, k + 1, y + 3, i + 1, k + 2, y + 3, SCARF)
  v.box(i - 1, k, y + 4, i + 1, k + 2, y + 5, SKIN)
  v.box(i - 1, k + 2, y + 4, i + 1, k + 2, y + 5, HAIR)
  v.set(i - 1, k + 1, y + 5, HAIR); v.set(i + 1, k + 1, y + 5, HAIR)
  v.box(i - 1, k, y + 6, i + 1, k + 2, y + 6, CAP)
  v.set(i, k - 1, y + 6, CAP)
}

// ── planes
function kite(manned: boolean): Built {
  const W = 19, L = 15, H = 9, C = 9
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  // the pod: a painted wooden box with a seat in it
  v.box(C - 1, 3, 1, C + 1, 9, 3, BODY)
  v.box(C - 1, 3, 1, C + 1, 9, 1, BODY_D)
  for (let k = 3; k <= 9; k++) { stripes.push({ i: C - 1, k, y: 2, row: 0, t: k }, { i: C + 1, k, y: 2, row: 0, t: k }); stripes.push({ i: C - 1, k, y: 3, row: 1, t: k }, { i: C + 1, k, y: 3, row: 1, t: k }) }
  // a bare beam back to the tail
  v.box(C, 10, 2, C, 13, 2, WOOD)
  // the high wing: fabric on a frame, held up on struts
  for (let i = 0; i < W; i++) for (let k = 4; k <= 7; k++) {
    const edge = i === 0 || i === W - 1 || k === 4
    v.set(i, k, 6, edge ? WOOD : CLOTH)
    if (!edge) canvas.push({ i, k, y: 6, u: i / W, v: (k - 4) / 4 })
  }
  for (const i of [C - 5, C + 5]) { v.set(i, 5, 4, WOOD_D); v.set(i, 5, 5, WOOD_D); v.set(i, 6, 4, WOOD_D) }
  v.box(C, 5, 4, C, 5, 5, WOOD_D)
  // tail: a little fabric plane and an accent fin
  for (let i = C - 3; i <= C + 3; i++) v.set(i, 13, 2, i === C - 3 || i === C + 3 ? ACC : CLOTH_D)
  v.box(C, 12, 3, C, 14, 4, ACC); v.set(C, 13, 5, ACC_L)
  // engine and propeller
  v.box(C - 1, 1, 1, C + 1, 2, 2, METAL); v.set(C, 1, 3, DARK)
  for (let i = C - 3; i <= C + 3; i++) if (i !== C) v.set(i, 0, 2, BLADE_A)
  for (let y = 0; y <= 4; y++) if (y !== 2) v.set(C, 0, y, BLADE_B)
  // wheels
  for (const i of [C - 2, C + 2]) v.set(i, 5, 0, DARK)
  if (manned) { v.box(C - 1, 6, 4, C + 1, 7, 4, SKIN); v.box(C - 1, 6, 5, C + 1, 7, 5, CAP) }
  return { v, stripes, canvas, pivK: 6, pivY: 2, tip: { a: 9, k: 5, y: 6 }, spin: [BLADE_A, BLADE_B], defaults: { body: [176, 128, 84], accent: [232, 96, 60], cloth: [240, 230, 206] } }
}

function sparrow(manned: boolean, mk3: boolean): Built {
  const W = mk3 ? 23 : 21, L = 20, H = 9
  const C = (W - 1) / 2
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  // low wing (the top of it is the picture)
  for (let i = 0; i < W; i++) {
    const off = Math.abs(i - C)
    const k0 = off >= C ? 8 : 7
    const k1 = off >= C - 1 ? 10 : 11
    for (let k = k0; k <= k1; k++) {
      const tipC = off >= C - 2
      v.set(i, k, 3, tipC ? ACC : k === k0 ? BODY : BODY_L)
      if (!tipC && off >= 3) canvas.push({ i, k, y: 3, u: i / W, v: (k - 7) / 5 })
    }
  }
  // fuselage
  for (let k = 2; k <= 18; k++) {
    const hw = k <= 2 ? 1 : k <= 12 ? 2 : k <= 17 ? 1 : 0
    const yb = k <= 12 ? 2 : 2 + Math.round(((k - 12) / 6) * 2)
    const yt = k <= 2 ? 5 : k <= 14 ? 6 : 5
    for (let y = yb; y <= yt; y++) {
      for (let i = C - hw; i <= C + hw; i++) {
        const edge = Math.abs(i - C) === hw
        if (hw >= 2 && edge && (y === yb || y === yt)) continue
        let c = y === yb ? BODY_D : y === yt ? BODY_L : BODY
        if (k <= 3) c = y === yt ? METAL : edge ? ACC_D : ACC
        v.set(i, k, y, c)
        if (edge && k >= 4 && hw >= 1 && (y === 4 || y === 5)) stripes.push({ i, k, y, row: y === 4 ? 0 : 1, t: k })
      }
    }
  }
  // canopy, with the pilot under it
  v.box(C - 1, 5, 7, C + 1, 8, 7, GLASS)
  v.box(C - 1, 4, 6, C + 1, 4, 6, GLASS_D)
  v.box(C - 1, 9, 6, C + 1, 9, 6, GLASS_D)
  if (manned) { v.set(C, 6, 7, SKIN); v.set(C, 7, 7, CAP); v.set(C, 6, 8, CAP); v.set(C, 7, 8, CAP) }
  // tailplane and fin
  for (let i = C - 3; i <= C + 3; i++) for (let k = 16; k <= 18; k++) {
    if (Math.abs(i - C) === 3 && k === 16) continue
    v.set(i, k, 5, Math.abs(i - C) === 3 ? ACC : BODY_L)
  }
  for (let k = 15; k <= 19; k++) {
    const top = k === 15 ? 6 : k === 16 ? 7 : 8
    for (let y = 6; y <= top; y++) v.set(C, k, y, y === top ? ACC_L : ACC)
  }
  if (mk3) {
    // the third level: tip tanks and a pair of exhausts
    for (const i of [0, W - 1]) v.box(i, 7, 2, i, 11, 2, METAL)
    for (const i of [C - 2, C + 2]) v.set(i, 3, 3, DARK)
  }
  v.set(C, 1, 4, DARK)
  for (let i = C - 3; i <= C + 3; i++) if (i !== C) v.set(i, 0, 4, BLADE_A)
  for (let y = 1; y <= 7; y++) if (y !== 4) v.set(C, 0, y, BLADE_B)
  for (const i of [C - 3, C + 3]) { v.set(i, 8, 0, DARK); v.set(i, 8, 1, DARK); v.set(i, 8, 2, DARK) }
  v.set(C, 17, 3, DARK)
  return { v, stripes, canvas, pivK: 9, pivY: 3, tip: { a: C, k: 9, y: 3 }, spin: [BLADE_A, BLADE_B], defaults: { body: [232, 224, 204], accent: [232, 96, 60], cloth: [240, 230, 206] } }
}

function biplane(manned: boolean, mk = 4): Built {
  const W = 25, L = 22, H = 11, C = 12
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  // two wings, struts between; the upper one carries the picture
  for (let i = 0; i < W; i++) for (let k = 7; k <= 11; k++) {
    const tipC = i <= 1 || i >= W - 2
    v.set(i, k, 2, tipC ? ACC : k === 7 ? BODY : BODY_D)
    v.set(i, k - 1, 7, tipC ? ACC : k === 7 ? CLOTH_D : CLOTH)
    if (!tipC) canvas.push({ i, k: k - 1, y: 7, u: i / W, v: (k - 7) / 5 })
  }
  for (const i of [C - 9, C + 9, C - 4, C + 4]) for (let y = 3; y <= 6; y++) v.set(i, 8, y, WOOD_D)
  // a deep fuselage with a cargo bay
  for (let k = 2; k <= 20; k++) {
    const hw = k <= 2 ? 1 : k <= 14 ? 2 : k <= 19 ? 1 : 0
    const yb = k <= 14 ? 1 : 1 + Math.round(((k - 14) / 6) * 3)
    const yt = k <= 3 ? 5 : k <= 15 ? 6 : 5
    for (let y = yb; y <= yt; y++) for (let i = C - hw; i <= C + hw; i++) {
      const edge = Math.abs(i - C) === hw
      if (hw >= 2 && edge && (y === yb || y === yt)) continue
      let c = y === yb ? BODY_D : y === yt ? BODY_L : BODY
      if (k <= 3) c = y === yt ? METAL : edge ? ACC_D : ACC
      v.set(i, k, y, c)
      if (edge && k >= 4 && hw >= 1 && (y === 3 || y === 4)) stripes.push({ i, k, y, row: y === 3 ? 0 : 1, t: k })
    }
  }
  // the open cockpit behind the upper wing
  v.box(C - 1, 12, 6, C + 1, 13, 6, DARK)
  v.box(C - 1, 11, 7, C + 1, 11, 7, GLASS)
  if (manned) { v.box(C - 1, 12, 7, C + 1, 13, 7, SKIN); v.box(C - 1, 12, 8, C + 1, 13, 8, CAP) }
  // tail
  for (let i = C - 4; i <= C + 4; i++) for (let k = 18; k <= 20; k++) v.set(i, k, 5, Math.abs(i - C) === 4 ? ACC : BODY_L)
  for (let k = 17; k <= 21; k++) { const top = k === 17 ? 7 : k === 18 ? 8 : 9; for (let y = 6; y <= top; y++) v.set(C, k, y, y === top ? ACC_L : ACC) }
  // engine, a bigger propeller
  v.set(C, 1, 4, DARK)
  for (let i = C - 4; i <= C + 4; i++) if (i !== C) v.set(i, 0, 4, BLADE_A)
  for (let y = 0; y <= 8; y++) if (y !== 4) v.set(C, 0, y, BLADE_B)
  if (mk >= 5) {
    // the fast mark: a ring cowling round the engine and a cargo pod under the belly
    for (let i = C - 2; i <= C + 2; i++) for (let y = 2; y <= 6; y++) if (Math.abs(i - C) === 2 || y === 2 || y === 6) v.set(i, 1, y, METAL)
    v.box(C - 1, 8, 0, C + 1, 14, 0, ACC_D)
    v.box(C - 2, 9, 0, C + 2, 13, 0, ACC)
  }
  if (mk >= 6) {
    // the sea mark: two floats on struts instead of wheels — it can come down on water
    for (const i of [C - 6, C + 6]) {
      v.box(i - 1, 3, 0, i + 1, 17, 0, BODY_L)
      v.box(i - 1, 2, 0, i + 1, 2, 0, ACC)
      v.set(i, 7, 1, WOOD_D); v.set(i, 12, 1, WOOD_D)
    }
  } else for (const i of [C - 4, C + 4]) { v.set(i, 9, 0, DARK); v.set(i, 9, 1, WOOD_D) }
  return { v, stripes, canvas, pivK: 10, pivY: 3, tip: { a: C, k: 9, y: 7 }, spin: [BLADE_A, BLADE_B], defaults: { body: [236, 226, 200], accent: [60, 120, 190], cloth: [244, 238, 222] } }
}

/** a fuselage drawn as rings: half-width and the bottom and top row at each step along it */
function body(v: Vox, C: number, k0: number, k1: number, ring: (k: number) => [number, number, number], stripes: Built['stripes'], sy: [number, number], nose = 0) {
  for (let k = k0; k <= k1; k++) {
    const [hw, yb, yt] = ring(k)
    for (let y = yb; y <= yt; y++) for (let i = C - hw; i <= C + hw; i++) {
      const edge = Math.abs(i - C) === hw
      if (hw >= 2 && edge && (y === yb || y === yt)) continue
      let c = y === yb ? BODY_D : y === yt ? BODY_L : BODY
      if (k < k0 + nose) c = y === yt ? METAL : edge ? ACC_D : ACC
      v.set(i, k, y, c)
      if (edge && k >= k0 + 2 && hw >= 1 && (y === sy[0] || y === sy[1])) stripes.push({ i, k, y, row: y === sy[0] ? 0 : 1, t: k })
    }
  }
}
/** an engine on the wing: a nacelle and a propeller in front of it */
function nacelle(v: Vox, i: number, k: number, y: number, len: number) {
  v.box(i - 1, k, y - 1, i + 1, k + len, y + 1, METAL)
  v.box(i, k, y - 1, i, k + len, y - 1, DARK)
  v.set(i, k - 1, y, DARK)
  for (let d = -3; d <= 3; d++) if (d) { v.set(i + d, k - 2, y, BLADE_A); v.set(i, k - 2, y + d, BLADE_B) }
}

/**
 * The silver wing (levels 7–9): the third generation, streamlined and all metal. 7 is a low-wing
 * twin with an art-deco twin tail; 8 is longer, with a cargo door in the tail; 9 is the big
 * freighter: a high wing, four engines and a deep belly.
 */
function silver(manned: boolean, mk: number): Built {
  const big = mk >= 9
  const W = big ? 37 : 31, L = big ? 34 : mk >= 8 ? 30 : 26, H = big ? 14 : 11
  const C = (W - 1) / 2
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  const tail = L - 1
  const hwMax = big ? 4 : 3
  body(v, C, 1, tail, (k) => {
    const nose = Math.min(hwMax, 1 + Math.floor(k / 2))
    const aft = tail - k < 7 ? Math.max(1, Math.ceil(((tail - k) / 7) * hwMax)) : hwMax
    const hw = Math.min(nose, aft)
    const yb = tail - k < 7 ? 2 + Math.round(((7 - (tail - k)) / 7) * (big ? 4 : 3)) : big ? 1 : 2
    const yt = k <= 1 ? (big ? 6 : 5) : big ? 9 : 7
    return [hw, yb, yt]
  }, stripes, big ? [5, 6] : [4, 5], 2)
  // windows along the side, the cockpit glass at the nose
  for (let k = 6; k < tail - 6; k += 2) for (const i of [C - hwMax, C + hwMax]) v.set(i, k, big ? 7 : 6, GLASS)
  v.box(C - 1, 2, big ? 8 : 6, C + 1, 3, big ? 8 : 6, GLASS)
  if (manned) { v.set(C, 3, big ? 9 : 7, CAP) }
  // the wing: tapered, its top the picture
  const wy = big ? 9 : 2
  const wk = big ? 11 : 9
  for (let i = 0; i < W; i++) {
    const off = Math.abs(i - C) / C
    const chord = Math.round(6 - off * 3)
    for (let k = wk + Math.round(off * 2); k < wk + Math.round(off * 2) + chord; k++) {
      const tipC = off > 0.9
      v.set(i, k, wy, tipC ? ACC : k === wk + Math.round(off * 2) ? BODY : BODY_L)
      if (!tipC) canvas.push({ i, k, y: wy, u: i / W, v: (k - wk) / 7 })
    }
  }
  // engines
  const eng = big ? [C - 7, C + 7, C - 13, C + 13] : [C - 7, C + 7]
  for (const i of eng) nacelle(v, i, wk - 3, big ? wy - 1 : wy + 1, 6)
  // tail: twin fins for 7 and 8, a tall single fin and a high tailplane for 9
  if (big) {
    for (let k = tail - 5; k <= tail; k++) for (let y = 8; y <= 13; y++) if (y - 8 <= (k - (tail - 5)) + 1) v.set(C, k, y, y === 13 ? ACC_L : ACC)
    for (let i = C - 7; i <= C + 7; i++) for (let k = tail - 2; k <= tail; k++) v.set(i, k, 13, Math.abs(i - C) === 7 ? ACC : BODY_L)
  } else {
    for (let i = C - 5; i <= C + 5; i++) for (let k = tail - 3; k <= tail; k++) v.set(i, k, 6, Math.abs(i - C) === 5 ? ACC : BODY_L)
    for (const i of [C - 5, C + 5]) for (let k = tail - 3; k <= tail; k++) for (let y = 7; y <= 9; y++) if (y - 7 <= k - (tail - 3)) v.set(i, k, y, y === 9 ? ACC_L : ACC)
  }
  if (mk >= 8) {
    // the cargo door under the tail, and the loading ramp's hinge
    for (let i = C - 1; i <= C + 1; i++) for (let k = tail - 8; k <= tail - 6; k++) v.set(i, k, big ? 2 : 3, ACC_D)
  }
  // wheels
  for (const i of [C - 3, C + 3]) { v.set(i, wk + 2, 0, DARK); v.set(i, wk + 2, 1, DARK) }
  v.set(C, 3, 0, DARK)
  return { v, stripes, canvas, pivK: wk + 2, pivY: 3, tip: { a: C, k: wk, y: wy }, spin: [BLADE_A, BLADE_B], defaults: { body: [204, 210, 218], accent: [200, 64, 52], cloth: [236, 238, 242] } }
}

/**
 * The airship (level 10): an envelope with fins and a gondola slung under it. Slow, and it carries
 * the most — and under the gondola a cradle where a small plane rides along.
 */
function airship(manned: boolean): Built {
  const W = 23, L = 46, H = 26, C = 11
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  const cy = 16, ck = 22, rk = 21, rr = 9
  for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) for (let y = 0; y < H; y++) {
    const d = ((k - ck) / rk) ** 2 + ((i - C) / rr) ** 2 + ((y - cy) / rr) ** 2
    if (d > 1) continue
    // only the shell: an inside voxel is never seen
    if (((k - ck) / (rk - 1.2)) ** 2 + ((i - C) / (rr - 1.2)) ** 2 + ((y - cy) / (rr - 1.2)) ** 2 < 1) continue
    const ribs = k % 6 === 0
    v.set(i, k, y, y >= cy + 5 ? CLOTH : ribs ? CLOTH_D : y <= cy - 4 ? BODY_D : BODY)
    if (y >= cy + 5) canvas.push({ i, k, y, u: k / L, v: i / W })
    if (Math.abs(i - C) >= rr - 1 && (y === cy || y === cy + 1)) stripes.push({ i, k, y, row: y === cy ? 0 : 1, t: k })
  }
  // fins at the tail, in a cross
  for (let k = 37; k < L; k++) {
    const r = k - 36
    for (let d = 0; d <= Math.min(5, r); d++) {
      v.set(C, k, cy + rr - 2 + d, ACC); v.set(C, k, cy - rr + 2 - d, ACC)
      v.set(C - rr + 2 - d, k, cy, ACC); v.set(C + rr - 2 + d, k, cy, ACC)
    }
  }
  // the gondola: a long cabin with windows, struts up to the envelope
  v.box(C - 3, 15, 3, C + 3, 30, 6, BODY_L)
  v.box(C - 3, 15, 2, C + 3, 30, 2, BODY_D)
  v.box(C - 2, 14, 3, C + 2, 14, 5, GLASS)
  for (let k = 17; k <= 28; k += 2) for (const i of [C - 3, C + 3]) v.set(i, k, 5, GLASS)
  for (const k of [16, 29]) for (const i of [C - 2, C + 2]) v.box(i, k, 7, i, k, 8, METAL)
  if (manned) { v.set(C, 15, 6, CAP) }
  // engines on outriggers
  for (const i of [C - 7, C + 7]) {
    v.box(Math.min(i, C) + (i < C ? 1 : 3), 26, 5, Math.max(i, C) - (i < C ? 3 : 1), 26, 5, METAL)
    nacelle(v, i, 26, 5, 4)
  }
  // the cradle for a plane, under the gondola
  v.box(C - 4, 19, 0, C + 4, 19, 1, ACC_D)
  v.box(C - 4, 25, 0, C + 4, 25, 1, ACC_D)
  v.box(C, 19, 0, C, 25, 0, ACC)
  return { v, stripes, canvas, pivK: 22, pivY: 6, tip: { a: C, k: 22, y: 25 }, spin: [BLADE_A, BLADE_B], defaults: { body: [222, 214, 196], accent: [176, 52, 48], cloth: [238, 232, 216] } }
}

// ── boats
function raft(manned: boolean, sail: boolean): Built {
  const W = 11, L = 18, H = 12
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  // logs side by side (the paint goes on the logs), lashed with rope at both ends
  for (let n = 0; n < 5; n++) {
    const i = 1 + n * 2
    const k0 = n % 2 ? 1 : 0, k1 = n % 2 ? 16 : 17
    v.box(i, k0, 0, i + 1, k1, 0, BODY_D)
    v.box(i, k0, 1, i + 1, k1, 1, n % 2 ? BODY : BODY_L)
    for (let k = k0; k <= k1; k++) if (k % 5 === 2) stripes.push({ i, k, y: 1, row: 0, t: n }, { i: i + 1, k, y: 1, row: 1, t: n })
  }
  for (const k of [3, 14]) v.box(1, k, 2, 9, k, 2, ACC)
  // cargo, and the oar at the back
  v.box(4, 7, 2, 7, 10, 3, CRATE); v.box(4, 8, 2, 7, 8, 3, CRATE_D)
  v.box(9, 15, 2, 9, 17, 2, WOOD); v.set(9, 17, 1, WOOD_D)
  if (sail) {
    v.box(5, 6, 2, 5, 6, 11, WOOD_D)
    for (let i = 1; i <= 9; i++) for (let y = 5; y <= 10; y++) {
      const edge = i === 1 || i === 9 || y === 10
      v.set(i, 5, y, edge ? CLOTH_D : CLOTH)
      canvas.push({ i, k: 5, y, u: (i - 1) / 9, v: (10 - y) / 6 })
    }
    v.set(5, 6, 11, ACC); v.set(5, 7, 11, ACC)
  }
  if (manned) rider(v, 7, 13, 2)
  return { v, stripes, canvas, pivK: 9, pivY: 1, tip: { a: 4, k: 16, y: 1 }, defaults: { body: [150, 104, 64], accent: [214, 176, 112], cloth: [244, 236, 214] } }
}

function skiff(manned: boolean): Built {
  const W = 11, L = 26, H = 12, C = 5
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  const hwAt = (k: number) => (k <= 4 ? k : k <= 21 ? 5 : k <= 24 ? 4 : 3)
  for (let k = 0; k < L; k++) {
    const hw = hwAt(k)
    for (let i = C - hw; i <= C + hw; i++) {
      const off = Math.abs(i - C)
      const rim = off === hw || k === 0 || k === L - 1
      if (off < hw || hw === 0) v.set(i, k, 0, BODY_D)
      v.set(i, k, 1, rim ? BODY_D : k % 3 === 0 ? WOOD : WOOD_L)
      if (rim) {
        v.set(i, k, 2, BODY)
        v.set(i, k, 3, BODY)
        if (off === hw && k >= 2 && k < L - 1) stripes.push({ i, k, y: 3, row: 0, t: k }, { i, k, y: 2, row: 1, t: k })
      }
    }
  }
  v.box(C - 2, 15, 2, C + 2, 20, 3, CRATE)
  v.box(C - 2, 17, 2, C + 2, 17, 3, CRATE_D)
  v.box(C, 9, 2, C, 9, 11, WOOD_D)
  for (let i = 1; i <= 9; i++) for (let y = 5; y <= 10; y++) {
    const edge = i === 1 || i === 9 || y === 5
    v.set(i, 10, y, edge ? CLOTH_D : CLOTH)
    canvas.push({ i, k: 10, y, u: (i - 1) / 9, v: (10 - y) / 6 })
  }
  v.set(C, 10, 11, ACC); v.set(C, 11, 11, ACC)
  v.set(C, L - 1, 3, BODY_D); v.set(C, L - 2, 2, WOOD_D)
  if (manned) rider(v, C, 22, 2)
  return { v, stripes, canvas, pivK: 13, pivY: 1, tip: { a: 4, k: 24, y: 1 }, defaults: { body: [150, 100, 64], accent: [232, 96, 60], cloth: [244, 238, 222] } }
}

function sloop(manned: boolean): Built {
  const W = 15, L = 34, H = 22, C = 7
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  const hwAt = (k: number) => (k <= 6 ? Math.round(k * 1.1) : k <= 27 ? 7 : k <= 31 ? 6 : 5)
  for (let k = 0; k < L; k++) {
    const hw = hwAt(k)
    for (let i = C - hw; i <= C + hw; i++) {
      const off = Math.abs(i - C)
      const rim = off === hw || k === 0 || k === L - 1
      if (off < hw || hw === 0) { v.set(i, k, 0, BODY_D); v.set(i, k, 1, BODY_D) }
      v.set(i, k, 2, rim ? BODY : k % 3 === 0 ? WOOD : WOOD_L)
      if (rim) {
        for (let y = 3; y <= 4; y++) v.set(i, k, y, BODY)
        v.set(i, k, 5, BODY_L)
        if (off === hw && k >= 3 && k < L - 1) stripes.push({ i, k, y: 4, row: 0, t: k }, { i, k, y: 3, row: 1, t: k })
      }
    }
  }
  // a cabin aft, with windows
  v.box(C - 4, 22, 3, C + 4, 28, 6, BODY_L)
  v.box(C - 4, 22, 7, C + 4, 28, 7, ACC)
  for (const i of [C - 4, C + 4]) for (const k of [24, 26]) v.set(i, k, 5, GLASS)
  // the mast, a big square sail and a topsail (both across the boat, so they show from behind)
  v.box(C, 12, 3, C, 12, 21, WOOD_D)
  for (let i = 0; i < W; i++) for (let y = 7; y <= 16; y++) {
    const edge = i === 0 || i === W - 1 || y === 16
    v.set(i, 13, y, edge ? CLOTH_D : CLOTH)
    if (!edge) canvas.push({ i, k: 13, y, u: i / W, v: (16 - y) / 10 })
  }
  for (let i = 3; i <= W - 4; i++) for (let y = 17; y <= 20; y++) v.set(i, 13, y, y === 20 ? CLOTH_D : CLOTH)
  v.set(C, 12, 21, ACC); v.set(C, 13, 21, ACC); v.set(C, 14, 21, ACC)
  // cargo forward of the mast
  v.box(C - 3, 5, 3, C + 3, 10, 4, CRATE); v.box(C - 3, 7, 3, C + 3, 7, 4, CRATE_D)
  if (manned) rider(v, C, 29, 3)
  return { v, stripes, canvas, pivK: 17, pivY: 1, tip: { a: 6, k: 31, y: 2 }, defaults: { body: [52, 82, 132], accent: [240, 236, 226], cloth: [244, 238, 222] } }
}

/** a hull: the bottom, the deck, the sides up to `side` rows, the rim a shade lighter */
function hull(v: Vox, C: number, L: number, hwAt: (k: number) => number, side: number, stripes: Built['stripes'], plank = true) {
  for (let k = 0; k < L; k++) {
    const hw = hwAt(k)
    for (let i = C - hw; i <= C + hw; i++) {
      const off = Math.abs(i - C)
      const rim = off === hw || k === 0 || k === L - 1
      if (off < hw || hw === 0) { v.set(i, k, 0, BODY_D); v.set(i, k, 1, BODY_D) }
      v.set(i, k, 2, rim ? BODY : !plank ? METAL : k % 3 === 0 ? WOOD : WOOD_L)
      if (rim) {
        for (let y = 3; y < side; y++) v.set(i, k, y, BODY)
        v.set(i, k, side, BODY_L)
        if (off === hw && k >= 3 && k < L - 1) stripes.push({ i, k, y: side - 1, row: 0, t: k }, { i, k, y: side - 2, row: 1, t: k })
      }
    }
  }
}
/** a square-rigged mast across the boat: the sails are the picture */
function mast(v: Vox, C: number, k: number, top: number, half: number, low: number, canvas: Built['canvas'], paint = true) {
  v.box(C, k - 1, 3, C, k - 1, top, WOOD_D)
  for (let i = C - half; i <= C + half; i++) for (let y = low; y <= top - 4; y++) {
    const edge = Math.abs(i - C) === half || y === top - 4
    v.set(i, k, y, edge ? CLOTH_D : CLOTH)
    if (paint && !edge) canvas.push({ i, k, y, u: (i - C + half) / (half * 2 + 1), v: (top - 4 - y) / (top - 4 - low) })
  }
  for (let i = C - half + 2; i <= C + half - 2; i++) for (let y = top - 3; y <= top - 1; y++) v.set(i, k, y, y === top - 1 ? CLOTH_D : CLOTH)
  v.set(C, k - 1, top, ACC); v.set(C, k, top, ACC)
}
/** a funnel: dark at the top, a painted band */
function funnel(v: Vox, i: number, k: number, y0: number, h: number) {
  v.box(i - 1, k - 1, y0, i + 1, k + 1, y0 + h, BODY_L)
  v.box(i - 1, k - 1, y0 + h - 3, i + 1, k + 1, y0 + h - 2, ACC)
  v.box(i - 1, k - 1, y0 + h, i + 1, k + 1, y0 + h, DARK)
}
/** a deckhouse with a row of windows */
function house(v: Vox, C: number, hw: number, k0: number, k1: number, y0: number, y1: number) {
  v.box(C - hw, k0, y0, C + hw, k1, y1, BODY_L)
  v.box(C - hw, k0, y1 + 1, C + hw, k1, y1 + 1, ACC)
  for (let k = k0 + 1; k < k1; k += 2) for (const i of [C - hw, C + hw]) v.set(i, k, y1 - 1, GLASS)
  for (let i = C - hw + 1; i < C + hw; i += 2) v.set(i, k0, y1 - 1, GLASS)
}
const crates = (v: Vox, C: number, hw: number, k0: number, k1: number, y0: number, y1: number) => {
  v.box(C - hw, k0, y0, C + hw, k1, y1, CRATE)
  for (let k = k0 + 2; k < k1; k += 3) v.box(C - hw, k, y0, C + hw, k, y1, CRATE_D)
}

/** 5 two masts, 6 a broad cargo sailer with goods on deck */
function brig(manned: boolean, mk: number): Built {
  const wide = mk >= 6
  const W = wide ? 19 : 15, L = wide ? 40 : 38, H = 26, C = (W - 1) / 2
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  const hwMax = (W - 1) / 2
  hull(v, C, L, (k) => (k <= 6 ? Math.min(hwMax, Math.round(k * (hwMax / 6))) : k <= L - 7 ? hwMax : hwMax - Math.ceil((k - (L - 7)) / 2)), 5, stripes)
  v.box(C, 0, 3, C, 1, 5, WOOD_D)
  house(v, C, wide ? 5 : 4, L - 10, L - 4, 3, 6)
  mast(v, C, 11, 24, hwMax, 8, canvas)
  mast(v, C, 22, 21, hwMax - 1, 7, canvas, false)
  if (wide) { crates(v, C, 4, 4, 8, 3, 5); crates(v, C, 5, 14, 19, 3, 6); crates(v, C, 4, 24, 27, 3, 4) }
  else crates(v, C, 3, 14, 19, 3, 4)
  if (manned) rider(v, C, L - 3, 3)
  return { v, stripes, canvas, pivK: Math.round(L / 2), pivY: 1, tip: { a: C, k: L - 3, y: 2 }, defaults: { body: [64, 96, 70], accent: [236, 214, 150], cloth: [244, 238, 222] } }
}

/** 7 the paddle steamer, 8 the ocean freighter, 9 the steam cargo liner */
function steamer(manned: boolean, mk: number): Built {
  const W = mk >= 9 ? 21 : mk >= 8 ? 19 : 17, L = mk >= 9 ? 48 : mk >= 8 ? 44 : 38, H = mk >= 9 ? 20 : 18, C = (W - 1) / 2
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  const paddle = mk === 7
  const hwMax = paddle ? C - 2 : C
  hull(v, C, L, (k) => (k <= 7 ? Math.min(hwMax, Math.round(k * (hwMax / 7))) : k <= L - 5 ? hwMax : hwMax - (k - (L - 5))), paddle ? 4 : 6, stripes, paddle)
  if (paddle) {
    // the wheels on either side, in their boxes, and the long deckhouse with one tall funnel
    for (const s of [-1, 1]) {
      const i0 = C + s * (hwMax + 1)
      for (let k = 16; k <= 23; k++) for (let y = 1; y <= 8; y++) {
        const r = Math.hypot(k - 19.5, y - 4.5)
        if (r > 4) continue
        v.set(i0, k, y, r > 3 ? ACC : (k + y) % 2 ? WOOD_D : DARK)
        v.set(i0 + s, k, y, r > 3 ? ACC_D : WOOD_D)
      }
    }
    house(v, C, hwMax - 2, 10, 30, 3, 7)
    funnel(v, C, 18, 9, 8)
    v.box(C - 2, 31, 3, C + 2, 34, 4, CRATE)
    // a sail too, forward, as steamers had: the picture
    mast(v, C, 6, 17, 4, 7, canvas)
  } else {
    // a steel ship: hatches and derricks forward, the bridge aft, one funnel (two on the liner)
    for (let k = 6; k <= L - 18; k += 7) { crates(v, C, C - 3, k, k + 4, 3, mk >= 9 ? 6 : 5); v.box(C, k + 5, 3, C, k + 5, 12, METAL); v.box(C, k + 5, 11, C, k + 1, 11, METAL) }
    house(v, C, C - 2, L - 14, L - 5, 3, 9)
    v.box(C - (C - 1), L - 13, 10, C + (C - 1), L - 11, 11, BODY_L)
    v.box(C - (C - 1), L - 13, 11, C + (C - 1), L - 13, 11, GLASS)
    if (mk >= 9) { funnel(v, C, L - 8, 10, 8); funnel(v, C, L - 18, 6, 9) } else funnel(v, C, L - 8, 10, 7)
    // the flag at the stern is the picture
    for (let i = C - 2; i <= C + 2; i++) for (let y = 7; y <= 10; y++) { v.set(i, L - 1, y, CLOTH); canvas.push({ i, k: L - 1, y, u: (i - C + 2) / 5, v: (10 - y) / 4 }) }
  }
  if (manned) rider(v, C, L - 3, paddle ? 3 : 4)
  return { v, stripes, canvas, pivK: Math.round(L / 2), pivY: 1, tip: { a: C, k: L - 3, y: 2 }, defaults: paddle ? { body: [236, 230, 214], accent: [200, 60, 52], cloth: [244, 238, 222] } : { body: [46, 58, 82], accent: [214, 76, 56], cloth: [244, 238, 222] } }
}

/** level 10: the flagship — a steel hull under three masts of sail, the player's to paint */
function flagship(manned: boolean): Built {
  const W = 23, L = 50, H = 32, C = 11
  const v = new Vox(W, L, H)
  const stripes: Built['stripes'] = [], canvas: Built['canvas'] = []
  hull(v, C, L, (k) => (k <= 8 ? Math.min(C, Math.round(k * (C / 8))) : k <= L - 6 ? C : C - (k - (L - 6))), 7, stripes)
  v.box(C, 0, 3, C, 1, 7, WOOD_D)
  house(v, C, C - 3, L - 13, L - 4, 3, 9)
  v.box(C - (C - 2), L - 12, 10, C + (C - 2), L - 9, 11, ACC)
  mast(v, C, 9, 26, C, 10, canvas)
  mast(v, C, 21, 30, C, 11, canvas)
  mast(v, C, 32, 25, C - 2, 10, canvas)
  crates(v, C, 4, 13, 17, 3, 5); crates(v, C, 4, 25, 29, 3, 5)
  if (manned) rider(v, C, L - 3, 3)
  return { v, stripes, canvas, pivK: 25, pivY: 1, tip: { a: C, k: L - 3, y: 2 }, defaults: { body: [30, 40, 66], accent: [214, 176, 80], cloth: [246, 242, 230] } }
}

const BUILDERS: Record<string, (manned: boolean) => Built> = {
  biplane5: (m) => biplane(m, 5), biplane6: (m) => biplane(m, 6),
  silver7: (m) => silver(m, 7), silver8: (m) => silver(m, 8), silver9: (m) => silver(m, 9), airship,
  brig: (m) => brig(m, 5), cargosail: (m) => brig(m, 6),
  paddle: (m) => steamer(m, 7), steelship: (m) => steamer(m, 8), liner: (m) => steamer(m, 9), flagship,
  kite, sparrow: (m) => sparrow(m, false), sparrow3: (m) => sparrow(m, true), biplane,
  raft: (m) => raft(m, false), sailraft: (m) => raft(m, true), skiff, sloop,
}
export const PAINTABLE = Object.keys(BUILDERS)
const CANVAS: Record<string, string> = { kite: $t('机翼'), sailraft: $t('帆面'), skiff: $t('帆面'), sloop: $t('帆面'), brig: $t('帆面'), cargosail: $t('帆面'), paddle: $t('帆面'), flagship: $t('帆面'), steelship: $t('船尾旗'), liner: $t('船尾旗'), airship: $t('气囊顶上') }
export const canvasOf = (model: string) => model === 'raft' ? null : CANVAS[model] ?? $t('机翼')
export const defaultsOf = (model: string) => BUILDERS[model]?.(false).defaults

/** a paint job as read from another player's card: nothing in it is trusted */
export function readPaint(v: unknown): Paint | undefined {
  if (!v || typeof v !== 'object') return undefined
  const d = v as Record<string, unknown>
  const rgb = (x: unknown): RGB | undefined => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (x.map((n) => Math.max(0, Math.min(255, Math.round(n)))) as RGB) : undefined
  const stripe = (['none', 'single', 'double', 'checker'] as const).find((s) => s === d.stripe)
  const design = typeof d.design === 'string' && d.design.length === DESIGN_W * DESIGN_H && /^[0-7.]+$/.test(d.design) ? d.design : undefined
  return { body: rgb(d.body), accent: rgb(d.accent), cloth: rgb(d.cloth), stripe, design }
}

const shade = (c: RGB, f: number, add = 0): RGB => [Math.min(255, c[0] * f + add), Math.min(255, c[1] * f + add), Math.min(255, c[2] * f + add)]
/** worn paint: towards a dull grey, and paler */
const worn = (c: RGB, fade: number): RGB => {
  const k = Math.min(1, Math.max(0, fade)) * 0.55
  return [c[0] + (158 - c[0]) * k, c[1] + (154 - c[1]) * k, c[2] + (148 - c[2]) * k]
}

/**
 * One craft, painted: the model `name` is registered under. `fade` is how far the paint has worn
 * (0 new … 1 gone grey). Returns null for a model that cannot be painted (the prototype's jet).
 */
export function craftModel(model: string, name: string, paint: Paint | undefined, fade: number, manned: boolean, look?: Look): ModelDef | null {
  const make = BUILDERS[model]
  if (!make) return null
  const b = make(manned)
  const p = paint ?? {}
  const body = p.body ?? b.defaults.body
  const accent = p.accent ?? b.defaults.accent
  const cloth = p.cloth ?? b.defaults.cloth
  // the stripe: chosen rows of the stripe cells in the accent colour, the rest in the body's
  const stripe = p.stripe ?? 'single'
  for (const s of b.stripes) {
    const on = stripe === 'single' ? s.row === 0 : stripe === 'double' ? true : stripe === 'checker' ? s.row === 0 && s.t % 2 === 0 : false
    b.v.set(s.i, s.k, s.y, on ? ACC : BODY)
  }
  // the picture
  if (p.design && p.design.length === DESIGN_W * DESIGN_H) {
    for (const c of b.canvas) {
      const x = Math.min(DESIGN_W - 1, Math.floor(c.u * DESIGN_W))
      const y = Math.min(DESIGN_H - 1, Math.floor(c.v * DESIGN_H))
      const ch = p.design[y * DESIGN_W + x]
      if (ch >= '0' && ch <= '7') b.v.set(c.i, c.k, c.y, DES + Number(ch))
    }
  }
  const f = fade
  const colors: Record<number, RGB> = {
    [DARK]: [38, 42, 56], [BODY_D]: worn(shade(body, 0.72), f), [BODY]: worn(body, f), [BODY_L]: worn(shade(body, 1.1, 12), f),
    [ACC_D]: worn(shade(accent, 0.72), f), [ACC]: worn(accent, f), [ACC_L]: worn(shade(accent, 1.1, 14), f),
    [GLASS_D]: [30, 110, 130], [GLASS]: [84, 178, 190], [METAL]: [150, 156, 170],
    [BLADE_A]: [70, 72, 84], [BLADE_B]: [70, 72, 84],
    [WOOD_D]: [92, 62, 44], [WOOD]: [176, 134, 88], [WOOD_L]: [214, 172, 120],
    [CLOTH_D]: worn(shade(cloth, 0.84), f), [CLOTH]: worn(cloth, f), [CRATE]: [214, 170, 104], [CRATE_D]: [150, 104, 60],
    [SKIN]: look ? SKINS[look.skin] ?? SKINS[1] : [246, 200, 160], [HAIR]: look ? HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[1] : [92, 60, 44],
    [CAP]: look && look.hat === 'none' ? HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[1] : [250, 246, 232], [SCARF]: look && !look.scarf ? look.shirt : [84, 178, 190],
    [JACKET]: look ? look.shirt : [232, 96, 60], [PANTS]: look ? look.pants : [58, 84, 140],
  }
  DESIGN_COLOURS.forEach((c, i) => { colors[DES + i] = worn(c, f) })
  // drawn with the sides of each voxel, so a thin thing (the rider, a mast) is solid from a low eye
  return { name, W: b.v.W, L: b.v.L, H: b.v.H, pivK: b.pivK, pivY: b.pivY, slices: b.v.slices(), colors, tip: b.tip, spin: b.spin, shell: true }
}
