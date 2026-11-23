// Voxel models for everything that moves: aircraft, boats, the pilot.
//
// Like the prototype's jet, each model is a stack of horizontal slices (sprite stacking).
// The jet keeps its original hand-made pixel data (jet-model.js). The new models are
// authored in code with a tiny voxel builder, so a two-person team can add vehicles without
// an art pipeline. Later they can be replaced by MagicaVoxel exports (see docs/ROADMAP.md).
//
// Axes: i = across (0 … W-1), k = along the body (0 = nose … L-1 = tail), y = up (0 = belly).

import { craftModel } from './craft'
import { DEFAULT_LOOK, ISLANDER_LOOKS, personModels } from './avatar'
import {
  JET_W, JET_L, JET_H, JET_PALETTE, decodeJet,
  JET_PIVOT_K, JET_PIVOT_Y, JET_ENGINE_A, JET_ENGINE_Y, JET_ENGINE_R, JET_NOZZLE_K,
  JET_WINGTIP_A, JET_WINGTIP_K, JET_WINGTIP_Y,
} from './jet-model.js'

export interface ModelDef {
  name: string
  W: number
  L: number
  H: number
  /** pivot along the body and pivot slice (the model turns and banks about this point) */
  pivK: number
  pivY: number
  slices: Uint8Array[]
  /** palette: colour index → [r, g, b]; index 0 is empty */
  colors: Record<number, [number, number, number]>
  /** where the trails start (wingtips, or the corners of a boat's stern) */
  tip: { a: number; k: number; y: number }
  /** jet engines, for the afterburner flames (only the jet has them) */
  engine?: { a: number; y: number; r: number; nozzleK: number }
  /** colour indices that blink in turn (a spinning propeller) */
  spin?: number[]
  /** true for the prototype's jet: its palette is recoloured by family */
  jetPalette?: boolean
  /** a hollow prop: each voxel is drawn with its near side as well as its top (see drawActor) */
  shell?: boolean
  /** colours that flicker (a fire, a lamp): each jumps between its own colour and `alt` */
  glow?: { idx: number; alt: [number, number, number] }[]
  /** colours that light up after dark (windows, lamps): painted at full brightness at dusk and at night */
  lit?: { idx: number; rgb: [number, number, number] }[]
}

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

// ───────────────────────────────────────────────────────────── the prototype's jet
function jet(): ModelDef {
  const colors: ModelDef['colors'] = {}
  for (const row of JET_PALETTE) colors[row[0]] = [row[1], row[2], row[3]]
  return {
    name: 'jet',
    W: JET_W, L: JET_L, H: JET_H,
    pivK: JET_PIVOT_K, pivY: JET_PIVOT_Y,
    slices: decodeJet(),
    colors,
    tip: { a: JET_WINGTIP_A, k: JET_WINGTIP_K, y: JET_WINGTIP_Y },
    engine: { a: JET_ENGINE_A, y: JET_ENGINE_Y, r: JET_ENGINE_R, nozzleK: JET_NOZZLE_K },
    jetPalette: true,
  }
}

// ───────────────────────────────────────────────────────────── Sparrow: a small prop plane
function sparrow(manned = false): ModelDef {
  const W = 21, L = 20, H = 9
  const C = 10 // centre line
  const v = new Vox(W, L, H)
  const DARK = 1, BELLY = 2, CREAM = 3, LIGHT = 4, ACC_D = 5, ACC = 6, ACC_L = 7, GLASS_D = 8, GLASS = 9, METAL = 10
  const BLADE_A = 11, BLADE_B = 12, WHEEL = 13, SKIN = 14, CAP = 15, SCARF = 16
  // low wing, with rounded accent tips
  for (let i = 0; i < W; i++) {
    const off = Math.abs(i - C)
    const k0 = off >= 9 ? 8 : 7
    const k1 = off >= 10 ? 10 : 11
    for (let k = k0; k <= k1; k++) v.set(i, k, 3, off >= 8 ? ACC : k === k0 ? CREAM : LIGHT)
  }
  for (let i = 0; i < W; i++) if (Math.abs(i - C) >= 3 && Math.abs(i - C) <= 7) v.set(i, 11, 3, ACC_L) // flap line
  // fuselage
  for (let k = 2; k <= 18; k++) {
    const hw = k <= 2 ? 1 : k <= 12 ? 2 : k <= 17 ? 1 : 0
    const yb = k <= 12 ? 2 : 2 + Math.round(((k - 12) / 6) * 2)
    const yt = k <= 2 ? 5 : k <= 14 ? 6 : 5
    for (let y = yb; y <= yt; y++) {
      for (let i = C - hw; i <= C + hw; i++) {
        const edge = Math.abs(i - C) === hw
        // round the corners of the cross-section
        if (hw >= 2 && edge && (y === yb || y === yt)) continue
        let c = y === yb ? BELLY : y === yt ? LIGHT : CREAM
        if (edge && y === 4 && k >= 4) c = ACC
        if (k <= 3) c = y === yt ? METAL : edge ? ACC_D : ACC // engine cowling
        v.set(i, k, y, c)
      }
    }
  }
  // canopy
  v.box(C - 1, 5, 7, C + 1, 8, 7, GLASS)
  v.box(C - 1, 4, 6, C + 1, 4, 6, GLASS_D)
  v.box(C - 1, 9, 6, C + 1, 9, 6, GLASS_D)
  v.set(C, 6, 7, LIGHT)
  if (manned) {
    // the pilot's head under the canopy: cap, face, the scarf
    v.set(C, 6, 7, SKIN); v.set(C, 7, 7, CAP); v.set(C, 6, 8, CAP); v.set(C, 7, 8, CAP)
    v.set(C - 1, 7, 7, SCARF); v.set(C + 1, 7, 7, SCARF)
  }
  // tailplane and fin
  for (let i = C - 3; i <= C + 3; i++) for (let k = 16; k <= 18; k++) {
    if (Math.abs(i - C) === 3 && k === 16) continue
    v.set(i, k, 5, Math.abs(i - C) === 3 ? ACC : LIGHT)
  }
  for (let k = 15; k <= 19; k++) {
    const top = k === 15 ? 6 : k === 16 ? 7 : 8
    for (let y = 6; y <= top; y++) v.set(C, k, y, y === top ? ACC_L : ACC)
  }
  // spinner and propeller (two bars that blink in turn)
  v.set(C, 1, 4, DARK)
  for (let i = C - 3; i <= C + 3; i++) if (i !== C) v.set(i, 0, 4, BLADE_A)
  for (let y = 1; y <= 7; y++) if (y !== 4) v.set(C, 0, y, BLADE_B)
  // landing gear
  for (const i of [C - 3, C + 3]) {
    v.set(i, 8, 0, WHEEL)
    v.set(i, 8, 1, DARK)
    v.set(i, 8, 2, DARK)
  }
  v.set(C, 17, 3, DARK)
  return {
    name: manned ? 'sparrow_m' : 'sparrow',
    W, L, H, pivK: 9, pivY: 3,
    slices: v.slices(),
    colors: {
      [DARK]: [38, 42, 56], [BELLY]: [176, 166, 150], [CREAM]: [232, 224, 204], [LIGHT]: [250, 246, 232],
      [ACC_D]: [176, 62, 44], [ACC]: [232, 96, 60], [ACC_L]: [255, 140, 90],
      [GLASS_D]: [30, 110, 130], [GLASS]: [84, 178, 190], [METAL]: [150, 156, 170],
      [BLADE_A]: [70, 72, 84], [BLADE_B]: [70, 72, 84], [WHEEL]: [26, 28, 36],
      [SKIN]: [246, 200, 160], [CAP]: [250, 246, 232], [SCARF]: [84, 178, 190],
    },
    tip: { a: 10, k: 9, y: 3 },
    spin: [BLADE_A, BLADE_B],
  }
}

// ───────────────────────────────────────────────────────────── Skiff: a small cargo boat with a square sail
function skiff(manned = false): ModelDef {
  const W = 11, L = 26, H = 12
  const C = 5
  const v = new Vox(W, L, H)
  const HULL_D = 1, HULL = 2, DECK = 3, DECK_L = 4, SAIL_S = 5, SAIL = 6, ACC = 7, MAST = 8, CRATE = 9, CRATE_D = 10
  const JACKET = 11, SKIN = 12, CAP = 13, PANTS = 14, SCARF = 15
  const hwAt = (k: number) => (k <= 4 ? k : k <= 21 ? 5 : k <= 24 ? 4 : 3)
  for (let k = 0; k < L; k++) {
    const hw = hwAt(k)
    for (let i = C - hw; i <= C + hw; i++) {
      const off = Math.abs(i - C)
      const rim = off === hw || k === 0 || k === L - 1
      // keel row is one narrower
      if (off < hw || hw === 0) v.set(i, k, 0, HULL_D)
      v.set(i, k, 1, rim ? HULL_D : k % 3 === 0 ? DECK : DECK_L)
      if (rim) {
        v.set(i, k, 2, HULL)
        v.set(i, k, 3, HULL)
      }
    }
  }
  // accent stripe along the gunwale
  for (let k = 2; k < L - 1; k++) {
    const hw = hwAt(k)
    v.set(C - hw, k, 3, ACC)
    v.set(C + hw, k, 3, ACC)
  }
  // cargo
  v.box(C - 2, 15, 2, C + 2, 20, 3, CRATE)
  v.box(C - 2, 17, 2, C + 2, 17, 3, CRATE_D)
  v.box(C - 1, 16, 4, C + 1, 19, 4, CRATE)
  v.box(C, 16, 4, C, 19, 4, CRATE_D)
  // mast, square sail and pennant
  v.box(C, 9, 2, C, 9, 11, MAST)
  for (let i = 1; i <= 9; i++) for (let y = 5; y <= 10; y++) {
    v.set(i, 10, y, y === 8 ? ACC : i === 1 || i === 9 || y === 5 ? SAIL_S : SAIL)
  }
  v.set(C, 10, 11, ACC)
  v.set(C, 11, 11, ACC)
  // tiller
  v.set(C, L - 1, 3, HULL_D)
  v.set(C, L - 2, 2, MAST)
  if (manned) {
    // the pilot, sitting aft with a hand on the tiller, facing the bow
    v.box(C - 1, 22, 2, C + 1, 23, 2, PANTS)
    v.box(C - 1, 22, 3, C + 1, 22, 5, JACKET)
    v.set(C - 2, 22, 4, JACKET); v.set(C + 2, 22, 4, JACKET); v.set(C + 2, 23, 3, SKIN)
    v.box(C - 1, 22, 6, C + 1, 22, 6, SCARF)
    v.box(C - 1, 21, 7, C + 1, 23, 8, SKIN)
    v.box(C - 1, 21, 9, C + 1, 23, 9, CAP); v.set(C, 20, 8, CAP)
  }
  return {
    name: manned ? 'skiff_m' : 'skiff',
    W, L, H, pivK: 13, pivY: 1,
    slices: v.slices(),
    colors: {
      [HULL_D]: [92, 60, 44], [HULL]: [150, 100, 64], [DECK]: [198, 156, 104], [DECK_L]: [222, 186, 132],
      [SAIL_S]: [214, 204, 180], [SAIL]: [244, 238, 222], [ACC]: [232, 96, 60], [MAST]: [70, 50, 40],
      [CRATE]: [214, 170, 104], [CRATE_D]: [150, 104, 60],
      [JACKET]: [232, 96, 60], [SKIN]: [246, 200, 160], [CAP]: [250, 246, 232], [PANTS]: [58, 84, 140], [SCARF]: [84, 178, 190],
    },
    tip: { a: 4, k: 24, y: 1 },
  }
}

// ───────────────────────────────────────────────────────────── the pilot (the player's character)
/** stride: 0 standing, 1 left foot forward, -1 right foot forward (the two frames of a walk) */
function pilot(stride = 0, sit = false): ModelDef {
  const W = 7, L = 7, H = 12
  const v = new Vox(W, L, H)
  const DARK = 1, PANTS = 2, JACKET = 3, JACKET_L = 4, SKIN = 5, SKIN_S = 6, HAIR = 7, CAP = 8, PACK = 9, SCARF = 10
  // legs (on a stride, one foot reaches forward and the other trails)
  for (const i of [2, 4]) {
    if (sit) {
      // thighs forward on the seat, shins hanging over its edge
      v.box(i, 1, 2, i, 3, 2, PANTS)
      v.set(i, 0, 1, PANTS)
      v.set(i, 0, 0, DARK)
      continue
    }
    const k = 3 - (i === 2 ? stride : -stride)
    v.set(i, k, 0, DARK)
    v.set(i, Math.round((k + 3) / 2), 1, PANTS)
    v.set(i, 3, 2, PANTS)
  }
  // body, arms, backpack
  v.box(1, 2, 3, 5, 4, 5, JACKET)
  v.box(1, 2, 6, 5, 4, 6, JACKET_L)
  for (const i of [0, 6]) {
    // arms swing against the legs
    v.set(i, 3 + (i === 0 ? stride : -stride), 3, SKIN)
    v.set(i, 3, 4, JACKET)
    v.set(i, 3, 5, JACKET)
    v.set(i, 3, 6, JACKET_L)
  }
  v.box(2, 5, 4, 4, 5, 6, PACK)
  // scarf
  v.box(1, 2, 7, 5, 4, 7, SCARF)
  // head: a rounded block, eyes on the front (k = 1)
  for (let y = 8; y <= 10; y++) for (let k = 1; k <= 5; k++) for (let i = 1; i <= 5; i++) {
    const corner = (i === 1 || i === 5) && (k === 1 || k === 5)
    if (corner) continue
    v.set(i, k, y, k === 5 ? HAIR : y === 8 ? SKIN_S : SKIN)
  }
  v.set(2, 1, 9, DARK)
  v.set(4, 1, 9, DARK)
  // cap with a brim that points the way the pilot faces
  for (let k = 1; k <= 5; k++) for (let i = 1; i <= 5; i++) {
    const corner = (i === 1 || i === 5) && (k === 1 || k === 5)
    if (!corner) v.set(i, k, 11, k >= 4 ? HAIR : CAP)
  }
  v.box(2, 0, 10, 4, 0, 10, CAP)
  return {
    name: sit ? 'pilot_sit' : stride ? (stride > 0 ? 'pilot_wa' : 'pilot_wb') : 'pilot',
    W, L, H, pivK: 3, pivY: 0,
    slices: v.slices(),
    colors: {
      [DARK]: [40, 44, 58], [PANTS]: [58, 84, 140], [JACKET]: [232, 96, 60], [JACKET_L]: [255, 140, 90],
      [SKIN]: [246, 200, 160], [SKIN_S]: [220, 168, 130], [HAIR]: [96, 60, 40], [CAP]: [250, 246, 232],
      [PACK]: [150, 104, 60], [SCARF]: [84, 178, 190],
    },
    tip: { a: 0, k: 3, y: 0 },
  }
}

/** the same model in other colours */
function dressed(def: ModelDef, name: string, map: Record<number, [number, number, number]>): ModelDef {
  return { ...def, name, colors: { ...def.colors, ...map } }
}

export function buildModels(): Record<string, ModelDef> {
  // the player's craft at each level, in their own colours (painted copies are made at run time)
  const crafts: Record<string, ModelDef> = {}
  for (const m of ['kite', 'sparrow3', 'raft', 'sailraft', 'biplane', 'sloop', 'biplane5', 'biplane6', 'silver7', 'silver8', 'silver9', 'airship', 'brig', 'cargosail', 'paddle', 'steelship', 'liner', 'flagship']) {
    crafts[m] = craftModel(m, m, undefined, 0, false)!
    crafts[m + '_m'] = craftModel(m, m + '_m', undefined, 0, true)!
  }
  // people are built from parts now (avatar.ts): the player (remade from their own look when the game starts) and the islanders
  const people: Record<string, ModelDef> = {}
  for (const m of personModels(DEFAULT_LOOK, 'pilot')) people[m.name] = m
  for (const k of ['A', 'B', 'C', 'D'] as const) for (const m of personModels(ISLANDER_LOOKS[k], 'islander' + k)) people[m.name] = m
  const sp = sparrow()
  const sk = skiff()
  const spm = sparrow(true)
  const skm = skiff(true)
  return {
    ...crafts,
    ...people,
    jet: jet(), sparrow: sp, skiff: sk,
    // with somebody aboard: the player's craft on the way, and everyone else's
    sparrow_m: spm, skiff_m: skm,
    // the islanders: the pilot in other clothes (3 jacket, 4 its light side, 7 hair, 8 cap, 9 pack, 10 scarf, 2 trousers)
    // pirates: the same boat under a black sail, the same plane in black and red; and other
    // islanders' craft, seen on the way
    pirateSloop: dressed(skm, 'pirateSloop', { 1: [30, 26, 34], 2: [62, 50, 54], 5: [34, 32, 44], 6: [52, 50, 64], 7: [214, 50, 50], 9: [90, 70, 60], 10: [60, 46, 40] }),
    raider: dressed(spm, 'raider', { 2: [40, 38, 50], 3: [58, 56, 70], 4: [84, 82, 98], 5: [130, 30, 34], 6: [200, 44, 44], 7: [240, 90, 80], 8: [120, 30, 30], 9: [230, 80, 60] }),
    sparrowBlue: dressed(spm, 'sparrowBlue', { 5: [40, 90, 150], 6: [70, 130, 200], 7: [120, 170, 230] }),
    skiffGreen: dressed(skm, 'skiffGreen', { 7: [70, 150, 100], 5: [200, 214, 190], 6: [232, 244, 226] }),
  }
}
