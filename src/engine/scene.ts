// @ts-nocheck
// Sky Isles engine — a small software renderer.
//
// This file grew out of the "fighter" prototype's scene.ts. Its renderer, camera and flight
// model are kept as they were; what changed is what they are pointed at:
//   · the world is an archipelago of separate islands (one per player) instead of one noise map
//   · buildings, runways, piers and resource nodes are "stamped" into the same height map
//   · anything that moves (planes, boats, the pilot) is a sprite stack like the prototype's jet
//   · the camera has two modes: "flight" (the prototype's) and "island" (zoomed in, resting on
//     the pilot), and slides between them the way it already slid between its views
//   · take-off, landing and docking are flown along smooth scripted paths
//
// Everything is drawn into one low-resolution pixel buffer, the way the technique works:
//   · a model is a stack of horizontal slices drawn 1 px apart, turned to any angle
//   · the islands and the clouds are stacks too (a height per ground pixel)
// The buffer is then shown scaled up with hard pixels.
//
// (Not type-checked yet: it is the prototype's untyped code. Typing it is on the roadmap.)

import { buildModels } from './models'
import { MAT, MAT_TOP, MAT_SIDE, MAT_BAND, MAT_GLOW, NMAT, FIRST_LAND } from './materials'
import { buildCockpit, drawCockpit } from './cockpit.js'
import { buildProps } from './props'
import { JET_PALETTE } from './jet-model.js'

/** ground that snow does not lie on: roads, fires, caves, the sea bed, and the inside of the house */
const NO_SNOW = new Set(Object.entries(MAT).filter(([n]) => /^(asphalt|paint|beacon|ember|soot|cave|vein|sea|coral|kelp|floor|wall|doorway|outside)/.test(n)).map(([, i]) => i))

// the seasons: leaves turn in autumn (oaks, birches, bushes; the pines and palms stay green) and
// the grass yellows; in winter both go dull. p.season = { autumn: 0–1, winter: 0–1 }
const GRASS = new Set(['grass', 'grassDark', 'grassLight'].map((n) => MAT[n]).filter((x) => x !== undefined))
const TURNS = /^(oak|birch|bush|i_plant|f_flowerBed)/
function seasonGrade(c, k, s) {
  if (!s || (!s.autumn && !s.winter)) return c
  const [r, g, b] = c
  // how green it is: only the greens turn
  const green = Math.max(0, Math.min(1, (g - Math.max(r, b)) / 40))
  if (green <= 0) return c
  let out = c
  if (s.autumn) {
    // from leaf green to gold and rust, the darker greens going redder
    const lum = (r + g + b) / 3
    const to = lum > 120 ? [Math.min(255, g * 1.18 + 20), g * 0.82, b * 0.4] : [Math.min(255, g * 1.25 + 30), g * 0.55, b * 0.35]
    out = lerp3(out, to, s.autumn * green * k)
  }
  if (s.winter) {
    const grey = (out[0] + out[1] + out[2]) / 3
    out = lerp3(out, [grey * 1.02 + 6, grey * 0.98, grey * 0.94], s.winter * green * k * 0.6)
  }
  return out
}
export const DEFAULT_PARAMS = {
  // flight — set per vehicle (see game/data.ts); these are the prototype's jet values
  kind: 'plane', // 'plane' | 'boat'
  speed: 92,
  boost: 1.8,
  agility: 1.25,
  altitude: 64,
  ceiling: 300,
  clearance: 7,
  bank: 52,
  // sprite stack
  spread: 1,
  // camera
  cameraFollow: 0.6,
  view: 'top',
  chaseDistance: 2.6,
  chaseAngle: 12,
  chaseSize: 0.19,
  transition: 1.4,
  // world
  timeOfDay: 'day',
  clouds: 0.45,
  // effects
  afterburner: 0.8,
  flameStyle: 'pixel',
  trails: true,
  shadow: true,
  // controls
  followPointer: true,
  invertY: true,
  // jet colours
  bodyColor: '#545969',
  accentColor: '#f0580e',
  canopyColor: '#1e8ca0',
}

// ───────────────────────────────────────────────────────────── constants
const N = 2048 // world size (wraps)
const NM = N - 1
const NSHIFT = 11
const HMAX = 40 // tallest terrain stack, trees and buildings included

const NC = 1024 // cloud map size (wraps)
const NCM = NC - 1
const NCSHIFT = 10
const CK = 8 // cloud stack height
const CLOUD_ALT = 40

const SEA = 0.42 // sea level, on the 0..1 scale the terrain is generated on
const SHELF = 0.3 // how gently the sea bed falls away from a shore (smaller = wider shallows)

const TRAIL_N = 160
const SMOKE_N = 96 // puffs of exhaust smoke kept alive at once
const SMOKE_F = 9 // numbers kept per puff
const NSHADOW = 4 // models that cast a shadow at once

const CLOUD_TOP = CLOUD_ALT + CK
// the tallest thing in the world (terrain with what stands on it). 64 in the game; the film tools ask for
// more when they stand a city's towers in the sea (the concept footage of round 24)
const ZTOP = Math.min(250, Math.max(64, Number((globalThis as any).WORLDCUT_ZTOP) || 64))
const VIEW_DIST = 1500 // how far the chase view sees
const FOG_START = 300
const FOG_STEPS = 10 // shades of haze between here and the horizon
const NSKY = 8 // bands in the sky gradient
const EPS = 1e-5
const HOLD = 0.2 // seconds: shorter is a click (roll), longer is a hold (thrusters)
const COCKPIT_LOOK = 64 // the cockpit view is centred this far ahead of the jet, px
const COCKPIT_EYE = 3 // the pilot's eyes, px above the jet's middle
const FLAME_MAX = 6 // smooth flames: two a jet
const FLAME_F = 16 // numbers kept per smooth flame
const FLAME_GROW = 1.3 // a smooth flame fades out along its length, so it is drawn this much longer

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** colour sets for particles */
const PARTICLE_COLORS = {
  wood: [[206, 160, 104], [160, 110, 66], [232, 200, 150]],
  leaf: [[104, 186, 70], [66, 148, 62], [156, 218, 88]],
  pine: [[40, 110, 70], [28, 84, 56], [70, 140, 90]],
  palm: [[120, 190, 80], [200, 190, 110], [80, 150, 70]],
  rock: [[168, 162, 156], [132, 126, 124], [200, 196, 190]],
  copper: [[240, 144, 72], [255, 190, 120], [168, 162, 156]],
  iron: [[150, 110, 96], [196, 150, 130], [132, 126, 124]],
  coal: [[50, 48, 56], [80, 78, 88], [30, 28, 34]],
  gold: [[255, 214, 80], [255, 240, 170], [230, 170, 50]],
  crystal: [[150, 230, 255], [220, 160, 255], [255, 255, 255]],
  spark: [[255, 240, 170], [255, 190, 90], [255, 255, 255]],
  dust: [[214, 194, 148], [190, 170, 126], [232, 216, 176]],
  smoke: [[120, 116, 122], [160, 156, 160], [90, 86, 94]],
  steam: [[236, 240, 244], [210, 218, 226]],
  fire: [[255, 150, 50], [255, 206, 110], [232, 96, 60]],
  water: [[150, 210, 240], [220, 244, 255], [104, 204, 214]],
  coin: [[250, 210, 90], [255, 240, 160], [230, 170, 50]],
  confetti: [[232, 96, 60], [84, 178, 190], [250, 210, 90], [156, 218, 88], [244, 150, 150], [255, 255, 255]],
  heart: [[244, 110, 130], [255, 170, 180]],
  star: [[255, 255, 255], [255, 244, 170]],
  bubble: [[200, 236, 255], [255, 255, 255]],
  feather: [[250, 250, 250], [220, 226, 236]],
  flower: [[255, 238, 156], [244, 150, 150], [255, 255, 255]],
}

// ───────────────────────────────────────────────────────────── helpers
const pack = (r, g, b) =>
  ((255 << 24) | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r)) >>> 0
// the light that falls into the cockpit
const SUN_DAY = pack(255, 246, 222)
const SUN_SUNSET = pack(255, 170, 92)
const SUN_NIGHT = pack(150, 190, 255)
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

function mulberry32(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash8(o) {
  let h = Math.imul(o ^ (o >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  return (h >>> 24) & 255
}
function wrapAngle(a) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2))
}

export function parseColor(str, fallback) {
  if (!str) return fallback
  let s = String(str).trim()
  if (s[0] === '#') {
    s = s.slice(1)
    if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('')
    if (s.length >= 6) {
      const n = parseInt(s.slice(0, 6), 16)
      if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    return fallback
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(/[ ,/]+/).map(parseFloat)
    if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return [parts[0], parts[1], parts[2]]
  }
  return fallback
}

/** colour grading per time of day (amount 0..1) */
function grade(c, tod, amount) {
  if (tod === 'day' || amount <= 0) return c
  let r, g, b
  if (tod === 'sunset') {
    r = 0.95 * c[0] + 0.1 * c[1] + 12
    g = 0.72 * c[1] + 0.05 * c[0] + 4
    b = 0.7 * c[2] + 0.08 * c[0] + 10
  } else {
    r = 0.22 * c[0] + 2
    g = 0.3 * c[1] + 6
    b = 0.5 * c[2] + 22
  }
  return [c[0] + (r - c[0]) * amount, c[1] + (g - c[1]) * amount, c[2] + (b - c[2]) * amount]
}

// ── the light through the day. A clock (0 = six in the morning … 1) runs through these key
// moments and every colour in the world is graded by the blend of the two either side: dawn,
// a morning that warms into plain day, a golden afternoon, the sunset, a violet dusk, the night,
// and the grey before dawn. Nothing jumps: the palettes are rebuilt a little at a time.
// mul/add grade a colour (c * mul + add); mAmt is how much of that the models take (they stay
// readable at night); night is 0..1 (stars, the moon, lamps); the sky runs skyA (horizon) → skyB.
const DAY_KEYS = [
  { t: 0.0, mul: [0.74, 0.66, 0.76], add: [26, 12, 26], mAmt: 0.4, night: 0.45, skyA: [250, 188, 160], skyM: [176, 140, 186], skyB: [56, 66, 136], hz: [232, 176, 168], out: [40, 30, 56] },
  { t: 0.05, mul: [0.95, 0.88, 0.86], add: [12, 6, 6], mAmt: 0.25, night: 0, skyA: [250, 222, 196], skyM: [168, 200, 232], skyB: [80, 136, 210], hz: [234, 222, 214], out: [20, 18, 30] },
  { t: 0.13, mul: [1, 1, 1], add: [0, 0, 0], mAmt: 0, night: 0, skyA: [198, 232, 250], skyM: [122, 190, 240], skyB: [62, 142, 222], hz: [188, 224, 246], out: [13, 15, 26] },
  { t: 0.5, mul: [1, 1, 1], add: [0, 0, 0], mAmt: 0, night: 0, skyA: [198, 232, 250], skyM: [122, 190, 240], skyB: [62, 142, 222], hz: [188, 224, 246], out: [13, 15, 26] },
  { t: 0.58, mul: [1.0, 0.92, 0.8], add: [12, 6, 0], mAmt: 0.3, night: 0, skyA: [252, 222, 176], skyM: [150, 190, 232], skyB: [70, 130, 210], hz: [244, 214, 176], out: [20, 16, 24] },
  { t: 0.65, mul: [0.95, 0.74, 0.72], add: [14, 6, 12], mAmt: 0.5, night: 0.1, skyA: [255, 198, 132], skyM: [238, 122, 130], skyB: [84, 68, 150], hz: [250, 182, 134], out: [30, 18, 30] },
  { t: 0.71, mul: [0.5, 0.46, 0.66], add: [10, 8, 28], mAmt: 0.3, night: 0.7, skyA: [170, 110, 150], skyM: [84, 66, 126], skyB: [22, 24, 66], hz: [110, 84, 126], out: [36, 40, 80] },
  { t: 0.78, mul: [0.22, 0.3, 0.5], add: [2, 6, 22], mAmt: 0.16, night: 1, skyA: [36, 56, 110], skyM: [18, 28, 70], skyB: [7, 10, 34], hz: [28, 44, 92], out: [44, 64, 118] },
  { t: 0.93, mul: [0.22, 0.3, 0.5], add: [2, 6, 22], mAmt: 0.16, night: 1, skyA: [36, 56, 110], skyM: [18, 28, 70], skyB: [7, 10, 34], hz: [28, 44, 92], out: [44, 64, 118] },
  { t: 0.97, mul: [0.42, 0.42, 0.6], add: [14, 10, 30], mAmt: 0.28, night: 0.8, skyA: [110, 96, 140], skyM: [52, 54, 104], skyB: [14, 18, 52], hz: [80, 76, 116], out: [40, 40, 76] },
]
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
/** the light at a time of day (0..1), the weather laid over it: rain and storm grey it and dim it, fog washes it out, snow cools and brightens it */
function lightAt(t, wx) {
  t = ((t % 1) + 1) % 1
  let a = DAY_KEYS[DAY_KEYS.length - 1]
  let b = { ...DAY_KEYS[0], t: 1 }
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    if (t >= DAY_KEYS[i].t && t < DAY_KEYS[i + 1].t) { a = DAY_KEYS[i]; b = DAY_KEYS[i + 1]; break }
  }
  // eased, so each change starts and ends softly
  let f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  f = f * f * (3 - 2 * f)
  const L = {
    mul: lerp3(a.mul, b.mul, f), add: lerp3(a.add, b.add, f), mAmt: a.mAmt + (b.mAmt - a.mAmt) * f, night: a.night + (b.night - a.night) * f,
    skyA: lerp3(a.skyA, b.skyA, f), skyM: lerp3(a.skyM, b.skyM, f), skyB: lerp3(a.skyB, b.skyB, f), hz: lerp3(a.hz, b.hz, f), out: lerp3(a.out, b.out, f),
    t, ident: false,
  }
  const rain = wx ? Math.max(wx.rain || 0, wx.storm || 0) : 0
  const fog = wx ? wx.fog || 0 : 0
  const snow = wx ? wx.snow || 0 : 0
  if (rain > 0) {
    // the colour goes out of things under a rain cloud, and the sky lowers to grey
    const k = rain * (wx.storm ? 0.42 : 0.3)
    const lum = (L.mul[0] + L.mul[1] + L.mul[2]) / 3
    L.mul = lerp3(L.mul, [lum * 0.82, lum * 0.86, lum * 0.94], k * 1.6 > 1 ? 1 : k * 1.6)
    L.add = lerp3(L.add, [L.add[0] + 6, L.add[1] + 10, L.add[2] + 18], k)
    const g = 1 - L.night * 0.8
    L.skyA = lerp3(L.skyA, [170 * g + 20, 178 * g + 24, 190 * g + 36], rain * 0.85)
    L.skyM = lerp3(L.skyM, [130 * g + 16, 140 * g + 20, 156 * g + 30], rain * 0.85)
    L.skyB = lerp3(L.skyB, [92 * g + 10, 100 * g + 14, 120 * g + 24], rain * 0.85)
    L.hz = lerp3(L.hz, [150 * g + 20, 160 * g + 24, 176 * g + 34], rain * 0.85)
    L.mAmt = Math.max(L.mAmt, 0.3 * rain)
  }
  if (snow > 0) {
    const g = 1 - L.night * 0.75
    L.mul = lerp3(L.mul, [L.mul[0] * 0.92, L.mul[1] * 0.96, L.mul[2] * 1.04], snow)
    L.add = lerp3(L.add, [L.add[0] + 14, L.add[1] + 18, L.add[2] + 26], snow * 0.8)
    L.skyA = lerp3(L.skyA, [226 * g + 10, 230 * g + 12, 238 * g + 24], snow * 0.8)
    L.skyM = lerp3(L.skyM, [196 * g + 8, 204 * g + 12, 220 * g + 20], snow * 0.8)
    L.skyB = lerp3(L.skyB, [160 * g + 6, 172 * g + 10, 196 * g + 20], snow * 0.8)
    L.hz = lerp3(L.hz, [226 * g + 10, 232 * g + 12, 242 * g + 20], snow * 0.8)
    L.mAmt = Math.max(L.mAmt, 0.25 * snow)
  }
  if (fog > 0) {
    const g = 1 - L.night * 0.7
    L.hz = lerp3(L.hz, [214 * g + 20, 220 * g + 22, 226 * g + 30], fog)
    L.skyA = lerp3(L.skyA, L.hz, fog * 0.9)
    L.skyM = lerp3(L.skyM, L.hz, fog * 0.7)
    L.add = lerp3(L.add, [L.add[0] + 10, L.add[1] + 12, L.add[2] + 14], fog * 0.6)
  }
  L.ident = L.mul[0] === 1 && L.mul[1] === 1 && L.mul[2] === 1 && L.add[0] === 0 && L.add[1] === 0 && L.add[2] === 0
  return L
}
/** a colour in a light (amount 0..1: how much of the grading it takes) */
function gradeL(c, L, amount) {
  if (L.ident || amount <= 0) return c
  const r = c[0] * L.mul[0] + L.add[0], g = c[1] * L.mul[1] + L.add[1], b = c[2] * L.mul[2] + L.add[2]
  return [c[0] + (r - c[0]) * amount, c[1] + (g - c[1]) * amount, c[2] + (b - c[2]) * amount]
}
/** where on the clock each of the three old times of day sits (for a caller that only names one) */
const TOD_AT = { day: 0.3, sunset: 0.65, night: 0.85 }

// tileable value noise, one octave added into `field`
function addOctave(field, n, cell, amp, rnd) {
  const P = n / cell
  const lat = new Float32Array(P * P)
  for (let i = 0; i < lat.length; i++) lat[i] = rnd()
  const x0 = new Int32Array(n)
  const x1 = new Int32Array(n)
  const tx = new Float32Array(n)
  for (let x = 0; x < n; x++) {
    const g = x / cell
    const i = Math.floor(g)
    const f = g - i
    x0[x] = i % P
    x1[x] = (i + 1) % P
    tx[x] = f * f * (3 - 2 * f)
  }
  for (let y = 0; y < n; y++) {
    const ra = x0[y] * P
    const rb = x1[y] * P
    const ty = tx[y]
    const row = y * n
    for (let x = 0; x < n; x++) {
      const a0 = lat[ra + x0[x]]
      const b0 = lat[rb + x0[x]]
      const va = a0 + (lat[ra + x1[x]] - a0) * tx[x]
      const vb = b0 + (lat[rb + x1[x]] - b0) * tx[x]
      field[row + x] += amp * (va + (vb - va) * ty)
    }
  }
}
function normalise(field) {
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < field.length; i++) {
    const v = field[i]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const k = 1 / (mx - mn || 1)
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - mn) * k
}

/** the shortest way from b to a on a world that wraps */
const wd = (d) => d - N * Math.round(d / N)
const cell = (x, y) => ((Math.floor(y) & NM) << NSHIFT) | (Math.floor(x) & NM)

/** turns a model's slices into lists of voxels, ready to draw */
function prepareModel(def) {
  const { W, L, H, pivK, slices } = def
  const sliceA = []
  const sliceB = []
  const sliceC = []
  const shadowMask = new Uint8Array(W * L)
  let firstSlice = H
  for (let y = 0; y < H; y++) {
    const s = slices[y]
    let n = 0
    for (let o = 0; o < s.length; o++) if (s[o]) n++
    const a = new Float32Array(n)
    const b = new Float32Array(n)
    const c = new Uint8Array(n)
    let j = 0
    for (let k = 0; k < L; k++) {
      for (let i = 0; i < W; i++) {
        const v = s[k * W + i]
        if (!v) continue
        a[j] = i - (W - 1) / 2
        b[j] = pivK - k
        c[j] = v
        j++
        shadowMask[k * W + i] = 1
      }
    }
    if (n && y < firstSlice) firstSlice = y
    sliceA.push(a)
    sliceB.push(b)
    sliceC.push(c)
  }
  // the model from above, for the cockpit's status screen: 0 empty, 1 body, 2 paint, 3 glass
  const top = { w: W, h: L, cells: new Uint8Array(W * L) }
  for (let y = H - 1; y >= 0; y--) {
    for (let o = 0; o < W * L; o++) {
      const v = slices[y][o]
      if (v && top.cells[o] === 0) top.cells[o] = 1 + Math.min(2, (v - 1) >> 4)
    }
  }
  return {
    ...def, sliceA, sliceB, sliceC, shadowMask, firstSlice, top,
    pal: new Uint32Array(256), // rebuilt when colours or the time of day change
    palLit: new Uint32Array(256), // one tone up, for surfaces turned to the sun
    palDim: new Uint32Array(256), // one tone down, for surfaces turned away
    spinning: false,
  }
}

function makeActor(model, x, y, z, yaw) {
  return {
    model, x, y, z, yaw, yawRate: 0, roll: 0, pitch: 0, stunt: -1, stuntDir: 1, stuntDelay: 0, vx: 0, vy: 0,
    scale: 1, stretch: 1, visible: true, shadow: true, trails: false, flames: false, fade: 1, introT: 99,
    trail: [new Float32Array(TRAIL_N * 4), new Float32Array(TRAIL_N * 4)],
    trailHead: 0, trailLen: 0, g: 0, lastTrailX: x, lastTrailY: y,
  }
}

export function createScene(initial, worldDef) {
  let p = { ...DEFAULT_PARAMS, ...initial }

  // ── the models, each slice as lists of voxels
  const models = {}
  {
    const defs = { ...buildModels(), ...buildProps() }
    for (const name in defs) models[name] = prepareModel(defs[name])
  }
  const jetModel = models.jet

  // ── palettes (rebuilt when colours or the time of day change)
  const jetPal = jetModel.pal
  const jetPalLit = jetModel.palLit
  const jetPalDim = jetModel.palDim
  let outlineCol = 0
  const topLit = new Uint32Array(NMAT)
  const topShade = new Uint32Array(NMAT)
  const sideLit = new Uint32Array(NMAT)
  const sideShade = new Uint32Array(NMAT)
  // walls that show their floors (a city's buildings): the colour of the window rows, and which materials have them
  const bandLit = new Uint32Array(NMAT)
  const bandShade = new Uint32Array(NMAT)
  const hasBand = new Uint8Array(NMAT)
  const cloudTop = new Uint32Array(CK)
  const cloudSide = new Uint32Array(CK)
  const flamePal = new Uint32Array(6)
  const trailPal = new Uint32Array(3)
  const skyPal = new Uint32Array(NSKY)
  let hazeCol = 0
  let cloudUnder = 0
  let sunCol = 0
  let sunGlow = 0
  let sparkA = 0
  let sparkB = 0
  let foamCol = 0
  let sunX = 0.45
  let sunY = 0.3
  /** a model's three palettes (plain, sunlit, shaded) for a time of day */
  function paintModel(m, L, amount) {
    if (typeof L === 'string') L = lightAt(TOD_AT[L] ?? 0.3)
    const turns = m.name && TURNS.test(m.name) ? 1 : 0
    for (const key in m.colors) {
      const idx = +key
      const c = gradeL(turns ? seasonGrade(m.colors[key], 1, p.season) : m.colors[key], L, amount)
      m.pal[idx] = pack(c[0], c[1], c[2])
      m.palLit[idx] = pack(c[0] * 1.1 + 10, c[1] * 1.1 + 10, c[2] * 1.1 + 8)
      m.palDim[idx] = pack(c[0] * 0.8, c[1] * 0.8, c[2] * 0.86)
    }
    // lights on after dark: these colours keep their full brightness
    if (m.lit && L.night > 0.25) {
      for (const l of m.lit) {
        const c = l.rgb
        m.pal[l.idx] = m.palLit[l.idx] = pack(c[0], c[1], c[2])
        m.palDim[l.idx] = pack(c[0] * 0.9, c[1] * 0.9, c[2] * 0.9)
      }
    }
    if (m.spin) m.spinBase = m.spin.map((idx) => [m.pal[idx], m.palLit[idx], m.palDim[idx]])
    // colours that flicker (a fire, a lamp): the other colour each one jumps to
    if (m.glow) {
      m.glowBase = m.glow.map((g) => m.pal[g.idx])
      m.glowAlt = m.glow.map((g) => {
        const c = gradeL(g.alt, L, 0)
        return pack(c[0], c[1], c[2])
      })
    }
  }
  /** the light now: the clock if the game gives one, else the named time of day; the weather over it */
  function currentLight() {
    const t = typeof p.clock === 'number' ? p.clock : TOD_AT[p.timeOfDay] ?? 0.3
    return lightAt(t, p.weather)
  }
  function rebuildPalettes() {
    const tod = p.timeOfDay
    const L = currentLight()
    const snowCover = clamp(p.snowCover || 0, 0, 1)
    // jet: recolour each family from its key tone
    const keys = {
      0: { key: 4, col: parseColor(p.bodyColor, [84, 89, 105]), def: [84, 89, 105] },
      1: { key: 3, col: parseColor(p.accentColor, [240, 88, 14]), def: [240, 88, 14] },
      2: { key: 3, col: parseColor(p.canopyColor, [30, 140, 160]), def: [30, 140, 160] },
    }
    const keyLum = {}
    for (const row of JET_PALETTE) {
      const fam = row[4]
      if (fam < 3 && ((row[0] - 1) & 15) === keys[fam].key) keyLum[fam] = lum([row[1], row[2], row[3]])
    }
    const jetAmount = L.mAmt
    for (const row of JET_PALETTE) {
      const idx = row[0]
      const fam = row[4]
      let c = [row[1], row[2], row[3]]
      if (fam < 3) {
        const k = keys[fam]
        const same = k.col[0] === k.def[0] && k.col[1] === k.def[1] && k.col[2] === k.def[2]
        if (!same) {
          const l = lum(c)
          const kl = keyLum[fam] || 100
          if (l <= kl) {
            const f = l / kl
            c = [k.col[0] * f, k.col[1] * f, k.col[2] * f]
          } else {
            const f = (l - kl) / (255 - kl)
            c = [k.col[0] + (255 - k.col[0]) * f, k.col[1] + (255 - k.col[1]) * f, k.col[2] + (255 - k.col[2]) * f]
          }
        }
        c = gradeL(c, L, jetAmount)
      }
      jetPal[idx] = pack(c[0], c[1], c[2])
    }
    for (const row of JET_PALETTE) {
      const idx = row[0]
      const fam = row[4]
      jetPalLit[idx] = fam < 3 && jetPal[idx + 1] ? jetPal[idx + 1] : jetPal[idx]
      jetPalDim[idx] = fam < 3 && ((idx - 1) & 15) > 0 ? jetPal[idx - 1] : jetPal[idx]
    }
    cockpit = null // repainted in the new colours shortly
    cockpitDue = 0.3
    const oc = L.out
    outlineCol = pack(oc[0], oc[1], oc[2])
    // world (and snow lying on the land, whitening the tops of things)
    for (let m = 0; m < NMAT; m++) {
      let top = MAT_TOP[m]
      if (GRASS.has(m)) top = seasonGrade(top, 0.45, p.season)
      if (snowCover > 0 && m >= FIRST_LAND && !NO_SNOW.has(m)) top = lerp3(top, [238, 244, 252], snowCover * 0.82)
      const t = gradeL(top, L, 1)
      const s = gradeL(GRASS.has(m) ? seasonGrade(MAT_SIDE[m], 0.45, p.season) : MAT_SIDE[m], L, 1)
      topLit[m] = pack(t[0], t[1], t[2])
      sideLit[m] = pack(s[0], s[1], s[2])
      topShade[m] = pack(t[0] * 0.62, t[1] * 0.67, t[2] * 0.8)
      sideShade[m] = pack(s[0] * 0.62, s[1] * 0.67, s[2] * 0.8)
      const bd = MAT_BAND[m]
      if (bd) {
        // windows: glass by day; after dark the lit ones are lamps and keep their colour
        const gl = MAT_GLOW[m]
        const lamp = gl && L.night > 0.3
        const bc = lamp ? gl : gradeL(bd, L, 1)
        bandLit[m] = pack(bc[0], bc[1], bc[2])
        bandShade[m] = lamp ? bandLit[m] : pack(bc[0] * 0.62, bc[1] * 0.67, bc[2] * 0.8)
        hasBand[m] = 1
      }
    }
    for (let k = 0; k < CK; k++) {
      const f = k / (CK - 1)
      const ft = Math.min(1, k / 2)
      const ca = 1 - 0.28 * L.night
      const t = gradeL([218 + 37 * ft, 230 + 25 * ft, 247 + 8 * ft], L, ca)
      const s = gradeL([158 + 44 * f, 182 + 36 * f, 222 + 18 * f], L, ca)
      cloudTop[k] = pack(t[0], t[1], t[2])
      cloudSide[k] = pack(s[0], s[1], s[2])
    }
    const sa = tod === 'sunset' ? [255, 170, 110] : tod === 'night' ? [70, 110, 190] : [120, 190, 236]
    const sb = tod === 'sunset' ? [255, 226, 170] : tod === 'night' ? [170, 200, 240] : [236, 250, 255]
    const fm = tod === 'sunset' ? [255, 226, 214] : tod === 'night' ? [110, 140, 200] : [240, 252, 255]
    sparkA = pack(sa[0], sa[1], sa[2])
    sparkB = pack(sb[0], sb[1], sb[2])
    foamCol = pack(fm[0], fm[1], fm[2])
    const flames = [[255, 252, 224], [255, 224, 120], [255, 164, 44], [246, 96, 20], [176, 48, 26], [96, 34, 40]]
    for (let i = 0; i < 6; i++) flamePal[i] = pack(flames[i][0], flames[i][1], flames[i][2])
    const tr = [gradeL([255, 255, 255], L, 0.8), gradeL([214, 232, 250], L, 0.8), gradeL([170, 204, 240], L, 0.8)]
    for (let i = 0; i < 3; i++) trailPal[i] = pack(tr[i][0], tr[i][1], tr[i][2])
    // sky: from the horizon up
    const skyA = L.skyA
    const skyM = L.skyM
    const skyB = L.skyB
    for (let i = 0; i < NSKY; i++) {
      const f = i / (NSKY - 1)
      const a = f < 0.5 ? skyA : skyM
      const b = f < 0.5 ? skyM : skyB
      const g = f < 0.5 ? f * 2 : f * 2 - 1
      skyPal[i] = pack(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g)
    }
    const hz = L.hz
    hazeCol = pack(hz[0], hz[1], hz[2])
    const cu = gradeL([138, 160, 200], L, 1 - 0.28 * L.night)
    cloudUnder = pack(cu[0], cu[1], cu[2])
    const sc2 = tod === 'night' ? [232, 238, 255] : [255, 244, 200]
    const sg = tod === 'night' ? [70, 96, 160] : [255, 222, 150]
    sunCol = pack(sc2[0], sc2[1], sc2[2])
    sunGlow = pack(sg[0], sg[1], sg[2])
    if (tod === 'sunset') { sunX = 0.95; sunY = 0.5 } else if (tod === 'night') { sunX = 0.3; sunY = 0.42 } else { sunX = 0.5; sunY = 0.32 }
    // the other models: plain palettes with a lighter and a darker tone for the two sides
    for (const name in models) {
      const m = models[name]
      if (m.jetPalette) continue
      paintModel(m, L, jetAmount)
    }
    const mk = gradeL([255, 214, 80], L, 0.3)
    markCol = pack(mk[0], mk[1], mk[2])
    markLit = pack(mk[0], mk[1] + 26, mk[2] + 90)
    emberA = topLit[MAT.ember]
    emberB = pack(255, 206, 110)
    palTod = L
    palAmt = jetAmount
    lightNow = { clock: p.clock, rain: p.weather?.rain || 0, snow: p.weather?.snow || 0, fog: p.weather?.fog || 0, storm: p.weather?.storm || 0, cover: snowCover, tod, autumn: p.season?.autumn || 0, winter: p.season?.winter || 0 }
    for (const name in PARTICLE_COLORS) {
      ptPal[name] = PARTICLE_COLORS[name].map((c) => {
        const g = gradeL(c, L, 0.35)
        return pack(g[0], g[1], g[2])
      })
    }
  }

  // ── the world: a height and a material per ground pixel
  const heightMap = new Uint8Array(N * N)
  const matMap = new Uint8Array(N * N)
  const solidMap = new Uint8Array(N * N) // 1 where the pilot cannot walk (trees, rocks, buildings)
  const islandMap = new Uint8Array(N * N) // which island a pixel belongs to (its index + 1); 0 is open sea
  const cloudN = new Uint8Array(NC * NC)
  const nz = new Uint8Array(256 * 256)

  // The sea is empty except where an island is. Each island is a soft round mask times the
  // prototype's noise, so coasts are irregular but an island never runs into its neighbour.
  // worldDef.islands: [{ x, y, r, relief, sand, trees, flats: [{ x, y, w, h, blend, raise }] }]
  function buildWorld() {
    const rnd = mulberry32((worldDef.seed | 0) * 7919 + 13)
    for (let i = 0; i < nz.length; i++) nz[i] = (rnd() * 256) | 0

    const E = new Float32Array(N * N)
    addOctave(E, N, 256, 0.5, rnd)
    addOctave(E, N, 128, 1, rnd)
    addOctave(E, N, 64, 0.6, rnd)
    addOctave(E, N, 32, 0.3, rnd)
    addOctave(E, N, 16, 0.12, rnd)
    normalise(E)

    const M = new Float32Array(N * N) // island mask, then the finished elevation
    const F = new Uint8Array(N * N) // how firmly a pixel is flattened (for runways and plazas)
    const FR = new Uint8Array(N * N) // … and whether it may be raised out of the sea to get there
    islandMap.fill(0)
    solidMap.fill(0)
    // An island may be told to take its noise from somewhere else (isl.nx, isl.ny): another
    // player's island is grown here exactly as it grows at the middle of their own chart.
    const moved = worldDef.islands.some((isl) => isl.nx !== undefined)
    const SRC = moved ? new Int32Array(N * N).fill(-1) : null
    // Each island's outline: a radius that swells and pinches with the bearing (headlands and
    // bays), roughened by the noise (a ragged coast), with hills of its own and, for an atoll,
    // a lagoon let into the middle.
    worldDef.islands.forEach((isl, n) => {
      const lobes = isl.lobes || []
      let swell = 1
      for (const l of lobes) swell += Math.abs(l.a)
      const R = Math.ceil(isl.r * swell * 1.2)
      const peaks = isl.peaks || []
      const lagoon = isl.lagoon || 0
      const shift = isl.nx !== undefined
      for (let dy = -R; dy <= R; dy++) {
        const row = ((isl.y + dy) & NM) << NSHIFT
        const srow = shift ? ((isl.ny + dy) & NM) << NSHIFT : row
        for (let dx = -R; dx <= R; dx++) {
          const o = row | ((isl.x + dx) & NM)
          const os = shift ? srow | ((isl.nx + dx) & NM) : o
          if (shift && islandMap[o] === 0) SRC[o] = os
          let rr = 1
          if (lobes.length) {
            const ang = Math.atan2(dy, dx)
            for (const l of lobes) rr += l.a * Math.cos(l.k * ang + l.ph)
          }
          const rough = (E[(os + 733331) & (N * N - 1)] - 0.5) * (isl.rough === undefined ? 0.22 : isl.rough)
          const d = Math.sqrt(dx * dx + dy * dy) / (isl.r * rr) + rough
          if (d >= 1.15) continue
          const t = d <= 0.2 ? 0 : (d - 0.2) / 0.95
          let m = 1 - t * t * (3 - 2 * t)
          // inland the dome is pressed nearly flat (a coastal plain), and the hills stand on that
          if (isl.plateau !== undefined && m > isl.plateau) m = isl.plateau + (m - isl.plateau) * 0.3
          for (const pk of peaks) {
            const ex = dx - pk.dx
            const ey = dy - pk.dy
            m += pk.h * Math.exp(-(ex * ex + ey * ey) / (2 * pk.w * pk.w)) * Math.min(1, m * 2.2)
          }
          if (lagoon > 0) m -= lagoon * Math.exp(-(d * d) / 0.07)
          if (m > M[o]) {
            M[o] = m
            islandMap[o] = n + 1
            if (SRC) SRC[o] = shift ? os : -1
          }
        }
      }
    })
    // the raw elevation, before anything is levelled
    for (let o = 0; o < N * N; o++) {
      const m = M[o]
      const e = SRC && SRC[o] >= 0 ? E[SRC[o]] : E[o]
      M[o] = m <= 0 ? e * 0.38 * 0.35 : Math.min(1.25, m) * 0.62 + e * 0.38 * (0.35 + 0.65 * Math.min(1, m))
    }
    // The game looks at the land and decides where the runway, the village and the paths go
    // (worldDef.plan may add to each island's `flats`).
    if (worldDef.plan) {
      worldDef.plan({
        N,
        sea: SEA,
        /** raw elevation, 0..1; the sea is below `sea`, the beach ends at sea + island.sand */
        elev: (x, y) => M[cell(x, y)],
        islandAt: (x, y) => islandMap[cell(x, y)] - 1,
      })
    }
    worldDef.islands.forEach((isl) => {
      for (const f of isl.flats || []) {
        const b = f.blend || 12
        for (let y = Math.floor(f.y - b); y <= f.y + f.h + b; y++) {
          for (let x = Math.floor(f.x - b); x <= f.x + f.w + b; x++) {
            const ox = x < f.x ? f.x - x : x > f.x + f.w ? x - f.x - f.w : 0
            const oy = y < f.y ? f.y - y : y > f.y + f.h ? y - f.y - f.h : 0
            const dist = Math.sqrt(ox * ox + oy * oy)
            if (dist >= b) continue
            const t = 1 - dist / b
            const w = Math.round(t * t * (3 - 2 * t) * 255)
            const o = ((y & NM) << NSHIFT) | (x & NM)
            if (w > F[o]) {
              F[o] = w
              FR[o] = f.raise ? 1 : 0
            }
          }
        }
      }
    })

    // elevation: mask × noise, pulled to the lowest terrace where the ground is flattened
    for (let o = 0; o < N * N; o++) {
      let e = M[o]
      if (F[o]) {
        const def = worldDef.islands[islandMap[o] - 1]
        if (def) {
          const flat = SEA + def.sand + (0.03 * (1 - SEA - def.sand)) / def.relief
          if (FR[o] || e > flat) e += (flat - e) * (F[o] / 255)
        }
      }
      M[o] = e
    }

    for (let y = 0; y < N; y++) {
      const row = y << NSHIFT
      const rowNW = ((y - 2) & NM) << NSHIFT
      const rowSE = ((y + 2) & NM) << NSHIFT
      for (let x = 0; x < N; x++) {
        const o = row | x
        const e = M[o]
        const hs = hash8(o)
        const d = e - SEA
        if (d < 0) {
          const dd = -d * SHELF + (hs - 128) * 0.00004
          matMap[o] = dd > 0.07 ? 0 : dd > 0.03 ? 1 : dd > 0.008 ? 2 : 3
          heightMap[o] = 0
          continue
        }
        const def = worldDef.islands[islandMap[o] - 1]
        const sand = def ? def.sand : 0.02
        if (d < sand) {
          matMap[o] = hs < 34 ? 5 : 4
          heightMap[o] = 0
          continue
        }
        const span = Math.max(0.05, 1 - SEA - sand)
        const hr = Math.min(0.999, ((d - sand) / span) * (def ? def.relief : 1))
        // terraces: 8 grass levels (2 px each), 4 rock levels and the snow cap (3 px each)
        let lv = hr < 0.5 ? 1 + ((hr * 16) | 0) : hr < 0.78 ? 9 + (((hr - 0.5) / 0.07) | 0) : 13 + (((hr - 0.78) / 0.09) | 0)
        if (lv > 15) lv = 15
        heightMap[o] = lv <= 8 ? lv * 2 : 16 + (lv - 8) * 3
        const g = M[rowNW | ((x - 2) & NM)] - M[rowSE | ((x + 2) & NM)]
        const lit = g < -0.016
        const shaded = g > 0.016
        if (lv >= 13) matMap[o] = shaded ? 16 : 15
        else if (lv >= 9) matMap[o] = lit ? 14 : shaded ? 13 : hs < 26 ? 13 : 12
        else matMap[o] = lit ? 8 : shaded ? 7 : hs < 22 ? 7 : hs > 240 ? 8 : 6
      }
    }

    // forests: little cones of leaves (they are scenery; the trees you can harvest are stamps)
    const STEP = 5
    for (let gy = 0; gy < N; gy += STEP) {
      for (let gx = 0; gx < N; gx += STEP) {
        const hs = hash8(gy * 977 + gx * 131 + 7)
        const cx = (gx + (hs & 3)) & NM
        const cy = (gy + ((hs >> 2) & 3)) & NM
        const o = (cy << NSHIFT) | cx
        const m = matMap[o]
        if (m < 6 || m > 8 || F[o]) continue
        const def = worldDef.islands[islandMap[o] - 1]
        if (!def) continue
        const h0 = heightMap[o]
        if (h0 > 14) continue
        const f = E[(((cy + 613) & NM) << NSHIFT) | ((N - 1 - cx + 911) & NM)]
        const pr = (f - 0.5) * 5 * def.trees * (def.scrub === undefined ? 1 : def.scrub)
        if (pr <= 0 || pr * 255 < hash8(o + 99)) continue
        const r = 2 + ((hs >> 4) & 1)
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > r + 0.3) continue
            const oo = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
            if (matMap[oo] < 4 || F[oo]) continue
            const nh = h0 + 1 + Math.round((1 - dist / (r + 0.5)) * (r + 1))
            if (nh > heightMap[oo]) {
              heightMap[oo] = nh
              matMap[oo] = dist < 1.1 ? 9 : dist < r - 0.5 ? 10 : 11
              if (dist < r - 0.4) solidMap[oo] = 1
            }
          }
        }
      }
    }

    // clouds: clusters of round puffs. Each cell holds (rank << 4) | thickness; a cloud shows
    // when its rank is under the cover setting, so the cover adds and removes whole clouds.
    cloudN.fill(0)
    for (let i = 0; i < 200; i++) {
      const rank = i & 15
      const cx = rnd() * NC
      const cy = rnd() * NC
      const sc = 0.6 + rnd() * rnd() * 1.25
      const ang = 0.35 + (rnd() - 0.5) * 1.3
      const len = (12 + rnd() * 24) * sc
      const puffs = 4 + ((rnd() * 7) | 0)
      for (let q = 0; q < puffs; q++) {
        const t = (q / (puffs - 1)) * 2 - 1
        const pxc = cx + Math.cos(ang) * t * len + (rnd() - 0.5) * 9 * sc
        const pyc = cy + Math.sin(ang) * t * len + (rnd() - 0.5) * 9 * sc
        const r = (6 + rnd() * 8) * sc * (1 - 0.45 * Math.abs(t))
        const maxT = clamp(Math.round(r * 0.6), 2, CK)
        const ri = Math.ceil(r)
        for (let dy = -ri; dy <= ri; dy++) {
          for (let dx = -ri; dx <= ri; dx++) {
            const d2 = (dx * dx + dy * dy) / (r * r)
            if (d2 > 1) continue
            const tk = Math.max(1, Math.round(Math.sqrt(1 - d2) * maxT))
            const xx = (Math.round(pxc) + dx) & NCM
            const yy = (Math.round(pyc) + dy) & NCM
            const oo = (yy << NCSHIFT) | xx
            if (tk > (cloudN[oo] & 15)) cloudN[oo] = (rank << 4) | tk
          }
        }
      }
    }
  }

  // What the game may ask of the world, and how it changes it. Positions wrap.
  const world = {
    N,
    heightAt: (x, y) => heightMap[cell(x, y)],
    matAt: (x, y) => matMap[cell(x, y)],
    isWater: (x, y) => matMap[cell(x, y)] < FIRST_LAND,
    solidAt: (x, y) => solidMap[cell(x, y)] === 1,
    /** index of the island a point is on (its land and its shallows), or -1 for open sea */
    islandAt: (x, y) => islandMap[cell(x, y)] - 1,
    /** the shortest signed distance from b to a along one axis */
    delta: (a, b) => wd(a - b),
    norm: (v) => v - Math.floor(v / N) * N,
    /**
     * Presses a stamp into the ground, centred on (cx, cy), standing on `base` (the ground height
     * there unless given). Returns what was there before, for remove().
     */
    place(st, cx, cy, base) {
      const x0 = Math.round(cx - (st.w - 1) / 2)
      const y0 = Math.round(cy - (st.h - 1) / 2)
      const b = base === undefined ? heightMap[cell(cx, cy)] : base
      const saved = { x0, y0, w: st.w, h: st.h, H: new Uint8Array(st.w * st.h), M: new Uint8Array(st.w * st.h), S: new Uint8Array(st.w * st.h) }
      for (let y = 0; y < st.h; y++) {
        for (let x = 0; x < st.w; x++) {
          const c = y * st.w + x
          const o = cell(x0 + x, y0 + y)
          saved.H[c] = heightMap[o]
          saved.M[c] = matMap[o]
          saved.S[c] = solidMap[o]
          if (st.mats[c] === 255) continue
          heightMap[o] = Math.min(ZTOP - 2, b + st.rise[c])
          matMap[o] = st.mats[c]
          solidMap[o] = st.solid[c]
        }
      }
      return saved
    },
    /** marks (or clears) a patch of ground as somewhere the pilot cannot walk: a prop's footprint */
    block(cx, cy, hw, hh, on) {
      for (let y = Math.round(cy - hh); y <= Math.round(cy + hh); y++) {
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) solidMap[cell(x, y)] = on ? 1 : 0
      }
    },
    /** puts back what a stamp covered */
    remove(saved) {
      for (let y = 0; y < saved.h; y++) {
        for (let x = 0; x < saved.w; x++) {
          const c = y * saved.w + x
          const o = cell(saved.x0 + x, saved.y0 + y)
          heightMap[o] = saved.H[c]
          matMap[o] = saved.M[c]
          solidMap[o] = saved.S[c]
        }
      }
    },
  }
  // ── state
  let W = 0
  let H = 0
  let fb = new Uint32Array(0)
  let bytes = new Uint8ClampedArray(0)
  let jetMask = new Uint8Array(0)
  let time = 0
  let introT = 0
  let spreadNow = p.spread
  let holding = false
  let holdT = 0
  let pointerOn = false
  let pointerX = 0
  let pointerY = 0
  let pointerIdle = 99
  let burn = 0 // afterburner, eased in after the intro
  let boost = 0 // 0..1: how hard the thrusters are being pushed (hold)
  let boostKey = false
  let keyTurn = 0 // flying with the keys: −1 left … +1 right
  let keyClimb = 0 // −1 dive … +1 climb
  let keyMode = false // the keys fly the jet until the pointer moves again
  let altGoal = p.altitude // the height the jet is heading for
  let climbV = 0 // how fast it is climbing, px per second (smoothed)
  let climbTilt = 0 // the jet's climb angle, which the chase camera leans with
  const cam = { x: 0, y: 0, yaw: 0, alt: p.altitude } // what the view is centred on (yaw: the overhead heading)
  const follow = { x: 0, y: 0, alt: p.altitude } // the same point as it trails the jet; the cockpit locks on instead
  let colY = new Int32Array(0) // per screen column: the highest row the ground has reached
  let zbuf = new Float32Array(0) // per pixel: how deep into the view the world is, so it can hide a jet behind it
  let dryMk = new Uint8Array(0) // per pixel: drawn by something that stands indoors (it does not rain on it)
  // the cockpit view is drawn on a larger square sheet and then turned (the horizon rolls)
  let sheetSide = 0
  let sheet = new Uint32Array(0)
  let sheetMask = new Uint8Array(0)
  let sheetColY = new Int32Array(0)
  let sheetZ = new Float32Array(0)
  let pivotY = 0 // the screen row the cockpit view rolls about
  let cockpit = null
  let cockpitDue = 0.3 // seconds until the cockpit is (re)painted; it is done ahead of time, never mid-move
  let colLo = 0 // the columns and rows being drawn (all of them, except on the sheet)
  let colHi = 0
  let rowLo = 0
  let rowHi = 0
  let frameH = 0 // height of the frame on screen (H is the sheet's while the world is drawn on it)
  let backdrop = new Uint32Array(0) // what was behind a jet, kept while it fades in or out
  let sheetBackdrop = new Uint32Array(0)

  // the view: 0 = overhead, 1 = behind the jet, 2 = in the cockpit, and anywhere between while it moves
  const viewIndex = (v) => (v === 'cockpit' ? 2 : v === 'chase' ? 1 : 0)
  let viewTarget = viewIndex(p.view)
  // How much of each view the camera is in. Each weight glides to its goal through three soft
  // stages, so a change starts and ends gently, goes straight from any view to any other, and
  // can be redirected half-way without a jolt.
  const wChase = [0, 0, 0]
  const wCock = [0, 0, 0]
  wChase.fill(viewTarget === 1 ? 1 : 0)
  wCock.fill(viewTarget === 2 ? 1 : 0)
  let vC = wChase[2] // chase
  let vK = wCock[2] // cockpit (what is left over is the overhead view)
  let jetFade = 1 // how solid the leader is drawn: it fades out as the camera moves into it
  let camSpin = 0 // 1 while the camera is going round with a roll that began in the cockpit
  let chaseYaw = 0 // heading of the chase camera (lags the jet a little in turns)
  let yawDiff = 0 // how far the chase heading is from the overhead one, kept continuous
  let vQ = 0 // 1 / camera distance: 0 is the flat sprite-stack view
  let vTan = 1 // how steeply the camera looks down
  let vS = 1 // scale at the jet
  let vCx = 0 // where the jet sits on screen
  let vCy = 0
  let vCos = 1
  let vSin = 0
  let vYaw = 0
  let vIn = 0 // 0..1: how far into the cockpit the camera is
  const smoke = new Float32Array(SMOKE_N * SMOKE_F) // x, y, z, born, size, push x, push y, strength, life
  let smokeHead = 0
  let smokeClock = 0
  let vRoll = 0 // the camera's roll (cockpit only)
  let vSteerY = 0 // the screen row that means "hold this height" when pointing to climb or dive
  let vLean = 1 // how steeply the chase camera would look down if nothing were in its way
  let camFix = 0 // how far the chase camera is moved up or down to stay clear of hills and clouds, px
  let camFloor = 0 // the lowest the chase camera may sit right now, px
  let floorS = 0 // the lowest the jet may fly right now (the ground ahead plus clearance), smoothed
  let speedNow = p.speed
  // the pilot's head, swaying with the flying (design pixels; right and down are positive)
  let headX = 0
  let headY = 0
  let headVX = 0
  let headVY = 0
  // Smooth flames are not drawn into the picture: the fire layer over it draws them. For each:
  // nozzle x y, a point straight behind it x y, tip x y (frame px), radius at the nozzle,
  // how much larger things are at the tip, thrust 0..1, strength 0..1, how much of the nozzle,
  // middle and tip can be seen, which flame it is, the afterburner setting, and its true
  // length in nozzle radii.
  const flameData = new Float32Array(FLAME_MAX * FLAME_F)
  const flameOut = { count: 0, data: flameData }
  const flameSeen = new Float32Array(FLAME_MAX * 3).fill(1)
  const flameV = [0, 0, 0]
  let actors = [] // everything drawn as a sprite stack
  let lead = null // the vehicle being flown (or parked, on an island)
  let mode = 'island' // 'island': the camera rests on a point · 'flight': it follows the lead
  let zoomNow = 2 // how much the overhead view is magnified (1 in flight, 2 on an island)
  let zoomGoal = 2
  let cloudNow = 0 // cloud cover: the sky clears over an island you are standing on
  let script = null // a path the lead is flying by itself (take-off, landing, docking)
  let boatWay = 1 // 0..1: a boat loses way when it runs up against a shore
  let anchored = false // the anchor is down (round 18: fishing from the boat)
  const camTarget = { x: 0, y: 0, alt: 0, yaw: 0 } // where the island camera rests
  const markers = [] // { x, y, z, on }: a floating marker over a destination
  const lines = [] // { ax, ay, az, bx, by, bz, sag, col: 0xAABBGGRR }: a thin line hanging between two points (a fishing line)
  let markCol = 0
  let markLit = 0
  let emberA = 0
  let emberB = 0
  // effects: particles, screen shake, and what is laid over the finished frame
  const NP = 900
  const PF = 10 // numbers kept per particle: x y z · vx vy vz · life, span, size, gravity
  const pt = new Float32Array(NP * PF)
  const ptCol = new Uint32Array(NP)
  const ptMode = new Uint8Array(NP) // 0 chip (falls, bounces) · 1 smoke (rises, swells, thins) · 2 spark · 3 float
  let ptHead = 0
  let ptLive = 0
  const ptPal = {} // name → packed colours, rebuilt with the palettes
  let shakeAmt = 0
  // on an island: 0 looks straight down the 45° overhead view, 1 is the tilted view with depth
  let islandTilt = 0
  let islandMix = 1 // 1 on an island, 0 in flight (eased)
  const ISLAND_VIEW = { dist: 150, zoom: 2.35, angle: 27, cy: 0.1 }
  /** the island camera's angle can be lowered for a moment (lying in bed: a low look across the room) */
  let angleNow = ISLAND_VIEW.angle
  let angleGoal = ISLAND_VIEW.angle
  /** and brought in close (a fraction of the usual distance): in bed, the camera at the pillow */
  let nearNow = 1
  // a close-up: the island camera's picture magnified (1: as usual), eased like the rest
  let magNow = 1
  let magGoal = 1
  // the camera may sit down among walls taller than itself (a shot from inside a room)
  let camFree = false
  /** a haze over the distance, 0–1 (indoors: the far islands fade, the sea and the sky stay) */
  let camHaze = 0
  let nearGoal = 1
  let palTod = lightAt(0.3)
  let palAmt = 0
  /** what the palettes were last built for (to rebuild when it has moved on enough) */
  let lightNow = { clock: undefined, rain: 0, snow: 0, fog: 0, storm: 0, cover: 0, tod: 'day' }
  const post = { dark: 0, r0: 26, r1: 70, x: 0, y: 0, z: 0, tint: 0, tr: 16, tg: 70, tb: 120, rain: 0, snow: 0, fog: 0, flash: 0, wind: 0.3, dry: null }
  /** post.dry: a patch of the world it does not rain (or snow) in — a turned box { x, y, c, s, hw, hh }.
   * A pixel whose ground lies in it is left dry: indoors, the rain falls outside the windows. */
  function isDry(o, px) {
    const d = post.dry
    if (!d) return false
    if (dryMk[o] === 1) return true
    const v = zbuf[o]
    if (v > 1e8) return false
    const inv = (1 + vQ * v) / vS
    const wx = wd(cam.x + (px - vCx) * vCos * inv - v * vSin - d.x)
    const wy = wd(cam.y - (px - vCx) * vSin * inv - v * vCos - d.y)
    return Math.abs(wx * d.c + wy * d.s) <= d.hw && Math.abs(-wx * d.s + wy * d.c) <= d.hh
  }

  /** 0..1: how far the cockpit has slid into place round the camera */
  function cockpitIn() {
    const u = clamp((vK - 0.16) / 0.84, 0, 1)
    return u * u * u * (u * (u * 6 - 15) + 10)
  }

  function updateView() {
    const sc = lead ? lead.scale : 1
    const top = 1 - vC - vK
    vCx = W >> 1
    vIn = vK
    cam.x = follow.x
    cam.y = follow.y
    cam.alt = follow.alt
    if (vC === 0 && vK === 0) {
      // the plain overhead view, exactly
      vQ = 0
      vTan = 1
      vLean = 1
      vS = zoomNow
      vCy = H >> 1
      vSteerY = vCy
      vRoll = 0
      jetFade = 1
      vYaw = cam.yaw
    } else {
      // Each view is a camera pose; the frame shows a blend of the three.
      // chase: behind the jet (under boost it closes in a little, which widens the view). On an
      // island the same pose stands behind the pilot, further back the further the zoom is out.
      const im = lead ? islandMix : 1
      const zi = clamp(zoomNow, 0.6, 3) / 2
      let dist = (ISLAND_VIEW.dist / zi) * nearNow
      let zoom = ISLAND_VIEW.zoom * zi * magNow
      let angleC = angleNow
      let cyK = ISLAND_VIEW.cy
      if (lead) {
        const dJ = clamp(p.chaseDistance, 1, 8) * lead.model.L * sc * (1 - 0.16 * boost)
        const zJ = Math.max(1, (clamp(p.chaseSize, 0.05, 0.6) * W) / (lead.model.W * sc))
        dist = dJ + (dist - dJ) * im
        zoom = Math.exp(Math.log(zJ) + (Math.log(zoom) - Math.log(zJ)) * im)
        angleC = clamp(p.chaseAngle, 2, 40) + (angleC - clamp(p.chaseAngle, 2, 40)) * im
        cyK = 0.14 - 0.03 * boost + (cyK - (0.14 - 0.03 * boost)) * im
      }
      const lYaw = lead ? lead.yaw : 0
      const lPitch = lead ? lead.pitch : 0
      const lRoll = lead ? lead.roll : 0
      const lZ = lead ? lead.z : follow.alt
      // cockpit: at the pilot's eyes, looking at a point ahead of the nose
      const focalIn = W * 0.6 * (1 - 0.1 * boost)
      const ahead = COCKPIT_LOOK * vK
      const sn = Math.sin(lYaw)
      const cs = Math.cos(lYaw)
      cam.x += (follow.x + (lead ? lead.x - follow.x : 0) + sn * ahead - follow.x) * vK
      cam.y += (follow.y + (lead ? lead.y - follow.y : 0) - cs * ahead - follow.y) * vK
      cam.alt += (lZ + COCKPIT_EYE * sc - follow.alt) * vK
      vQ = vC / dist + vK / COCKPIT_LOOK
      vS = Math.exp(top * Math.log(zoomNow) + vC * Math.log(zoom) + vK * Math.log(focalIn / COCKPIT_LOOK))
      // how steeply it looks down: 45° overhead, the chase angle behind, level in the cockpit.
      // The chase camera drops behind the jet as it climbs and rises over it as it dives, and
      // camFix lifts or lowers it to stay clear of the hills and out of the cloud layer.
      const angle = (45 * top + angleC * vC) * (Math.PI / 180)
      vLean = Math.tan(angle) - 0.5 * climbTilt * vC
      const free = 1 - vK
      vTan = Math.max(vLean + camFix * vQ * free, (camFloor - cam.alt) * vQ * free, (2 - cam.alt) * vQ)
      // where the jet (or, in the cockpit, the horizon) sits in the frame; a climb drops the horizon
      const focal = vS / vQ
      const cyChase = (H >> 1) + H * cyK
      const cyIn = pivotY + focal * Math.tan(clamp(lPitch * 0.8, -0.6, 0.6))
      vCy = top * (H >> 1) + vC * cyChase + vK * cyIn
      vSteerY = top * (H >> 1) + vC * cyChase + vK * H * 0.34
      // in the cockpit the view rolls and turns exactly with the jet
      // (a full roll is followed either all the way round or not at all, so it always ends level)
      vRoll = lRoll * vK + (lead ? spinOf(lead) : 0) * camSpin
      const behind = cam.yaw + yawDiff
      vYaw = cam.yaw + yawDiff * (vC + vK) + wrapAngle(-lYaw - behind) * vK
      // the jet fades away as the camera moves into it
      const f = clamp((vK - 0.12) / 0.4, 0, 1)
      jetFade = 1 - f * f * (3 - 2 * f)
    }
    vCos = Math.cos(vYaw)
    vSin = Math.sin(vYaw)
  }

  /** how long the afterburner flames are, in jet pixels (before the flicker) */
  function flameLength() {
    return (0.07 + 0.17 * p.afterburner) * jetModel.L * burn * clamp(1.6 - spreadNow * 0.6, 0, 1) * (1 + 1.6 * boost)
  }
  /** how far the flames bend: the exhaust trails round the inside of a turn */
  function flameBend() {
    return lead ? clamp(lead.yawRate / Math.max(0.1, p.agility), -1, 1) * 0.36 : 0
  }
  /** how far through a full roll a jet is, as an angle (0 when it is not rolling) */
  function spinOf(j) {
    if (j.stunt < 0 || j.stuntDelay > 0) return 0
    const t = j.stunt
    return j.stuntDir * Math.PI * 2 * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  }
  /** a jet's bank angle, including any roll it is half-way through */
  function rollOf(j) {
    return j.roll + spinOf(j)
  }
  const groundAt = (x, y) => heightMap[(((y | 0) & NM) << NSHIFT) | ((x | 0) & NM)]
  /** the tallest ground under a jet and along the next stretch of its path */
  function groundAhead(j, speed) {
    const sn = Math.sin(j.yaw)
    const cs = Math.cos(j.yaw)
    let top = 0
    for (let i = 0; i <= 4; i++) {
      const d = speed * 0.16 * i
      for (let side = -1; side <= 1; side++) {
        const h = groundAt(j.x + sn * d + cs * side * 7, j.y - cs * d + sn * side * 7)
        if (h > top) top = h
      }
    }
    return top
  }

  rebuildPalettes()
  buildWorld()
  {
    const s = worldDef.start || { x: N / 2, y: N / 2 }
    cam.x = follow.x = camTarget.x = s.x
    cam.y = follow.y = camTarget.y = s.y
    cam.alt = follow.alt = camTarget.alt = heightMap[cell(s.x, s.y)]
  }

  function setParams(next) {
    const prev = p
    p = { ...DEFAULT_PARAMS, ...next }
    const moved = (a, b, d) => Math.abs((a || 0) - (b || 0)) > d
    const wx = p.weather || {}
    if (
      prev.timeOfDay !== p.timeOfDay || prev.bodyColor !== p.bodyColor ||
      prev.accentColor !== p.accentColor || prev.canopyColor !== p.canopyColor ||
      (typeof p.clock === 'number' && (typeof lightNow.clock !== 'number' || Math.abs(((p.clock - lightNow.clock + 1.5) % 1) - 0.5) > 0.0015)) ||
      moved(wx.rain, lightNow.rain, 0.03) || moved(wx.snow, lightNow.snow, 0.03) || moved(wx.fog, lightNow.fog, 0.03) || moved(wx.storm, lightNow.storm, 0.03) ||
      moved(p.snowCover, lightNow.cover, 0.03) ||
      moved(p.season?.autumn, lightNow.autumn, 0.02) || moved(p.season?.winter, lightNow.winter, 0.02)
    ) rebuildPalettes()
    if (prev.view !== p.view) viewTarget = viewIndex(p.view)
  }


  // ── actors: anything drawn as a sprite stack
  function addActor(modelName, props) {
    const m = typeof modelName === 'string' ? models[modelName] : modelName
    if (!m) throw new Error('no such model: ' + modelName)
    const a = makeActor(m, 0, 0, 0, 0)
    Object.assign(a, props)
    a.lastTrailX = a.x
    a.lastTrailY = a.y
    actors.push(a)
    return a
  }
  function removeActor(a) {
    const i = actors.indexOf(a)
    if (i >= 0) actors.splice(i, 1)
    if (lead === a) lead = null
  }

  // ── modes
  /** which actor the flight controls and the flight camera belong to */
  function setLead(a) {
    lead = a
  }
  function setMode(next) {
    if (next === mode) return
    mode = next
    script = null
    if (mode === 'flight' && lead) {
      lead.yaw = wrapAngle(lead.yaw)
      lead.yawRate = 0
      cam.yaw = wrapAngle(cam.yaw)
      chaseYaw = -lead.yaw
      yawDiff = wrapAngle(chaseYaw - cam.yaw)
      altGoal = lead.z
      floorS = 0
      climbV = 0
      climbTilt = 0
      boost = 0
      boatWay = 1
      holding = false
      keyMode = false
      pointerOn = false
      zoomGoal = 1
    } else {
      viewTarget = 0
      boostKey = false
      holding = false
    }
  }
  /** where the island camera rests: { x, y, alt, yaw, zoom }; snap: true jumps there */
  function setCamera(c) {
    // a NaN would stick in the eased values for good: never let one in
    const ok = (v) => v !== undefined && (v === null || Number.isFinite(v))
    if (ok(c.x) && c.x !== null) camTarget.x = c.x
    if (ok(c.y) && c.y !== null) camTarget.y = c.y
    if (ok(c.alt) && c.alt !== null) camTarget.alt = c.alt
    if (ok(c.yaw) && c.yaw !== null) camTarget.yaw = c.yaw
    if (ok(c.zoom) && c.zoom !== null) zoomGoal = c.zoom
    if (ok(c.angle)) angleGoal = c.angle === null ? ISLAND_VIEW.angle : c.angle
    if (ok(c.near)) nearGoal = c.near === null ? 1 : c.near
    if (ok(c.mag)) magGoal = c.mag === null ? 1 : c.mag
    if (c.free !== undefined) camFree = !!c.free
    if (c.haze !== undefined) camHaze = c.haze || 0
    if (c.snap) {
      cam.x = follow.x = camTarget.x
      cam.y = follow.y = camTarget.y
      cam.alt = follow.alt = camTarget.alt
      cam.yaw = camTarget.yaw
      zoomNow = zoomGoal
      angleNow = angleGoal
      nearNow = nearGoal
      magNow = magGoal
      cloudNow = mode === 'flight' ? p.clouds : 0
    }
  }

  /**
   * Flies the lead by itself along a smooth curve from where it is to (x1, y1) heading yaw1,
   * ending at height z1. { duration, ease: 'in' | 'out' | 'linear', level, zFrom, zTo, tangent,
   * thenAlt, onDone }. With kind: 'turn' it turns on the spot to yaw1 instead.
   */
  function runPath(s) {
    if (!lead) return
    const dx = wd(s.x1 - lead.x)
    const dy = wd(s.y1 - lead.y)
    const dist = Math.hypot(dx, dy)
    const k = s.tangent !== undefined ? s.tangent : Math.max(24, dist * 0.9)
    script = {
      ...s,
      t: 0,
      x0: lead.x, y0: lead.y, z0: lead.z, yaw0: lead.yaw,
      x1: lead.x + dx, y1: lead.y + dy,
      m0x: Math.sin(lead.yaw) * k, m0y: -Math.cos(lead.yaw) * k,
      m1x: Math.sin(s.yaw1) * k, m1y: -Math.cos(s.yaw1) * k,
      dyaw: wrapAngle(s.yaw1 - lead.yaw),
    }
    // a path that eases in or out starts or ends at rest, so at cruising speed it takes twice as long
    if (!(script.duration > 0)) script.duration = (Math.max(0.4, pathLength(script) / Math.max(10, p.speed))) * (s.ease === 'in' || s.ease === 'out' ? 2 : 1)
    return script.duration
  }
  function pathPoint(s, u, out) {
    const u2 = u * u
    const u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1
    const h10 = u3 - 2 * u2 + u
    const h01 = -2 * u3 + 3 * u2
    const h11 = u3 - u2
    out.x = h00 * s.x0 + h10 * s.m0x + h01 * s.x1 + h11 * s.m1x
    out.y = h00 * s.y0 + h10 * s.m0y + h01 * s.y1 + h11 * s.m1y
    return out
  }
  const ptA = { x: 0, y: 0 }
  const ptB = { x: 0, y: 0 }
  function pathLength(s) {
    let len = 0
    pathPoint(s, 0, ptA)
    for (let i = 1; i <= 24; i++) {
      pathPoint(s, i / 24, ptB)
      len += Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y)
      ptA.x = ptB.x
      ptA.y = ptB.y
    }
    return len
  }
  /** would a path from the lead to (x1, y1, yaw1) stay over water? (for boats coming in to dock) */
  function pathOverWater(x1, y1, yaw1, tangent) {
    if (!lead) return false
    const dx = wd(x1 - lead.x)
    const dy = wd(y1 - lead.y)
    const k = tangent !== undefined ? tangent : Math.max(24, Math.hypot(dx, dy) * 0.9)
    const s = {
      x0: lead.x, y0: lead.y, x1: lead.x + dx, y1: lead.y + dy,
      m0x: Math.sin(lead.yaw) * k, m0y: -Math.cos(lead.yaw) * k,
      m1x: Math.sin(yaw1) * k, m1y: -Math.cos(yaw1) * k,
    }
    for (let i = 1; i < 32; i++) {
      pathPoint(s, i / 32, ptA)
      if (matMap[cell(ptA.x, ptA.y)] >= FIRST_LAND) return false
    }
    return true
  }

  function resize(w, h) {
    W = Math.max(8, w | 0)
    H = Math.max(8, h | 0)
    const buf = new ArrayBuffer(W * H * 4)
    fb = new Uint32Array(buf)
    bytes = new Uint8ClampedArray(buf)
    jetMask = new Uint8Array(W * H)
    colY = new Int32Array(W)
    zbuf = new Float32Array(W * H)
    dryMk = new Uint8Array(W * H)
    // the square sheet reaches every corner of the frame however far the view is rolled
    pivotY = Math.round(H * 0.34)
    cockpit = null
    cockpitDue = 0.3
    const tall = Math.max(pivotY, H - pivotY)
    sheetSide = (Math.ceil(Math.sqrt((W / 2) * (W / 2) + tall * tall)) + 2) * 2
    sheet = new Uint32Array(sheetSide * sheetSide)
    sheetMask = new Uint8Array(sheetSide * sheetSide)
    sheetColY = new Int32Array(sheetSide)
    sheetZ = new Float32Array(sheetSide * sheetSide)
    backdrop = new Uint32Array(W * H)
    sheetBackdrop = new Uint32Array(sheetSide * sheetSide)
    updateView()
  }

  function pointerMove(x, y) {
    keyMode = false
    pointerOn = true
    pointerX = x
    pointerY = y
    pointerIdle = 0
  }
  function pointerLeave() {
    pointerOn = false
    holding = false
  }
  function press() {
    holding = true
    holdT = 0
  }
  function release() {
    if (holding && holdT < HOLD) startRoll() // a click rolls; a hold was the thrusters
    holding = false
  }
  /** arrow keys / WASD: turn −1..1, climb −1..1 (chase view), and whether the boost key is down */
  function setKeys(turn, climb, boostHeld) {
    keyTurn = clamp(turn, -1, 1)
    keyClimb = clamp(climb, -1, 1)
    boostKey = boostHeld
    if (keyTurn !== 0 || keyClimb !== 0) keyMode = true
  }
  function startRoll() {
    if (mode !== 'flight' || !lead || script || p.kind === 'boat') return
    if (lead.stunt >= 0) return
    lead.stuntDir = lead.yawRate >= 0 ? 1 : -1
    camSpin = vK > 0.5 ? 1 : 0
    lead.stunt = 0
    lead.stuntDelay = 0
  }
  /** on to the next view: overhead → behind → (the jet only) cockpit → overhead */
  function toggleView() {
    if (mode !== 'flight' || !lead) return
    viewTarget = (viewTarget + 1) % (lead.model.jetPalette ? 3 : 2)
  }

  // ── simulation
  function step(dtRaw) {
    const dt = clamp(dtRaw, 0, 0.05)
    time += dt
    pointerIdle += dt
    if (holding) holdT += dt
    let flying = mode === 'flight' && !!lead
    if (!cockpit && W > 0 && flying && lead.model.jetPalette) {
      cockpitDue -= dt
      if (cockpitDue <= 0) cockpitArt()
    }
    zoomNow += (zoomGoal - zoomNow) * (1 - Math.exp(-dt * 2.4))
    angleNow += (angleGoal - angleNow) * (1 - Math.exp(-dt * 1.6))
    nearNow += (nearGoal - nearNow) * (1 - Math.exp(-dt * 1.6))
    magNow += (magGoal - magNow) * (1 - Math.exp(-dt * 1.6))
    if (Math.abs(zoomGoal - zoomNow) < 0.004) zoomNow = zoomGoal
    cloudNow += ((flying ? p.clouds : 0) - cloudNow) * (1 - Math.exp(-dt * 1.1))
    spreadNow += (p.spread - spreadNow) * (1 - Math.exp(-dt * 11))
    for (const a of actors) a.introT += dt
    stepFx(dt)
    burn += ((flying && lead.flames && !(script && script.idle) ? 1 : 0) - burn) * (1 - Math.exp(-dt * 5))
    for (const name in models) models[name].spinning = false
    if (flying) lead.model.spinning = true

    const maxRate = Math.max(0.1, p.agility)
    if (flying) stepFlight(dt, maxRate)
    else {
      boost += (0 - boost) * (1 - Math.exp(-dt * 2.4))
      speedNow = 0
    }
    // the end of a scripted path may have landed the vehicle and handed over to the island
    flying = mode === 'flight' && !!lead

    for (const j of actors) {
      const mine = flying && j === lead
      let gNow = 0
      if (mine) {
        gNow = clamp(Math.abs(lead.yawRate) / maxRate + (j.stunt >= 0 ? 0.7 : 0) + boost * 0.9 + Math.abs(climbTilt), 0, 1)
        if (p.kind === 'boat') gNow = Math.max(gNow, 0.6) // a boat always leaves a wake
      }
      j.g += (gNow - j.g) * (1 - Math.exp(-dt * 2.5))
      if (j.stunt >= 0) {
        if (j.stuntDelay > 0) j.stuntDelay -= dt
        else {
          j.stunt += dt / 0.85
          if (j.stunt >= 1) j.stunt = -1
        }
      }
      // wingtip trails (a boat's wake is the same thing, at the waterline)
      if (!mine || !j.trails || (script && script.level)) continue
      const ddx = j.x - j.lastTrailX
      const ddy = j.y - j.lastTrailY
      if (ddx * ddx + ddy * ddy > 6.25) {
        j.lastTrailX = j.x
        j.lastTrailY = j.y
        const ax = axes(j)
        const tip = j.model.tip
        const sc = j.scale
        for (let w = 0; w < 2; w++) {
          const a = (w === 0 ? -tip.a : tip.a) * sc
          const b = (j.model.pivK - tip.k) * sc
          const hy = (tip.y - j.model.pivY) * sc
          const o = j.trailHead * 4
          j.trail[w][o] = j.x + a * ax.rx + b * ax.fx + hy * ax.ux
          j.trail[w][o + 1] = j.y + a * ax.ry + b * ax.fy + hy * ax.uy
          j.trail[w][o + 2] = j.z + a * ax.rz + b * ax.fz + hy * ax.uz
          j.trail[w][o + 3] = time
        }
        j.trailHead = (j.trailHead + 1) % TRAIL_N
        if (j.trailLen < TRAIL_N) j.trailLen++
      }
    }

    // a little dark smoke off the end of each flame, left hanging in the air behind the jet
    if (flying && lead.flames && lead.model.engine) {
      smokeClock += dt
      const every = 0.034 - 0.012 * boost
      if (smokeClock >= every && burn > 0.6 && p.afterburner > 0.05 && spreadNow < 2) {
        smokeClock = 0
        const len = flameLength()
        const sc = lead.scale
        const eng = lead.model.engine
        const ax = axes(lead)
        const side = smokeHead & 1 ? 1 : -1
        const t = len * 0.78
        const a = (side * eng.a + flameBend() * ((t * t) / Math.max(1, len))) * sc
        const b = (lead.model.pivK - eng.nozzleK - t) * sc
        const hy = (eng.y - lead.model.pivY) * sc
        const o = smokeHead * SMOKE_F
        smoke[o] = lead.x + a * ax.rx + b * ax.fx + hy * ax.ux
        smoke[o + 1] = lead.y + a * ax.ry + b * ax.fy + hy * ax.uy
        smoke[o + 2] = lead.z + a * ax.rz + b * ax.fz + hy * ax.uz
        smoke[o + 3] = time
        smoke[o + 4] = (1.3 + (hash8(smokeHead * 31 + 7) / 255) * 1.2) * sc
        smoke[o + 5] = -lead.vx * 0.3 + (hash8(smokeHead * 17 + 3) - 128) * 0.05
        smoke[o + 6] = -lead.vy * 0.3 + (hash8(smokeHead * 13 + 5) - 128) * 0.05
        smoke[o + 7] = (0.46 + 0.36 * boost) * clamp(p.afterburner * 1.4, 0, 1)
        smoke[o + 8] = 0.75 + 0.5 * boost + (hash8(smokeHead * 5) / 255) * 0.3
        smokeHead = (smokeHead + 1) % SMOKE_N
      }
    }

    // the view weights glide to their goals (three soft stages each)
    const goC = flying ? (viewTarget === 1 ? 1 : 0) : islandTilt
    islandMix += ((flying ? 0 : 1) - islandMix) * (1 - Math.exp(-dt * 2.6))
    if (Math.abs((flying ? 0 : 1) - islandMix) < 0.002) islandMix = flying ? 0 : 1
    const goK = flying && viewTarget === 2 && lead.model.jetPalette ? 1 : 0
    const ease = 1 - Math.exp((-dt * 7.6) / clamp(p.transition, 0.2, 8))
    let settled = true
    for (let i = 0; i < 3; i++) {
      wChase[i] += ((i === 0 ? goC : wChase[i - 1]) - wChase[i]) * ease
      wCock[i] += ((i === 0 ? goK : wCock[i - 1]) - wCock[i]) * ease
      if (Math.abs(wChase[i] - goC) > 0.0004 || Math.abs(wCock[i] - goK) > 0.0004) settled = false
    }
    if (settled) {
      wChase.fill(goC)
      wCock.fill(goK)
    }
    vC = wChase[2]
    vK = wCock[2]

    if (flying) {
      // camera: ahead of the leader, turning part of the way with it
      const look = (22 + 16 * boost) * (1 - vC - vK) * clamp(speedNow / 40, 0, 1)
      const tx = lead.x + Math.sin(lead.yaw) * look
      const ty = lead.y - Math.cos(lead.yaw) * look
      const kc = 1 - Math.exp(-dt * 3.5)
      follow.x += lead.vx * dt + wd(tx - (follow.x + lead.vx * dt)) * kc
      follow.y += lead.vy * dt + wd(ty - (follow.y + lead.vy * dt)) * kc
      cam.yaw += (-lead.yaw * clamp(p.cameraFollow, 0, 1) - cam.yaw) * (1 - Math.exp(-dt * 1.6))
      follow.alt += (lead.z - follow.alt) * (1 - Math.exp(-dt * 3))
      // the chase camera keeps clear of the hills behind the jet, and stays out of the cloud
      // layer: under it while the jet is low, over it otherwise
      let fix = 0
      camFloor = 0
      if (vC > 0.3 && vQ > 1e-4) {
        const back = 1 / vQ
        const gx = cam.x + vSin * back
        const gy = cam.y + vCos * back
        let top = 0
        for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) top = Math.max(top, groundAt(gx + ix * 9, gy + iy * 9))
        camFloor = top + 5
        const nominal = follow.alt + vLean * back
        let want = Math.max(nominal, camFloor)
        if (want > CLOUD_ALT - 3 && want < CLOUD_TOP + 3) want = lead.z < CLOUD_ALT - 8 ? Math.max(camFloor, CLOUD_ALT - 3) : CLOUD_TOP + 3
        fix = want - nominal
      }
      camFix += (fix - camFix) * (1 - Math.exp(-dt * 7))
      // the chase camera sits behind the jet and swings round a beat late in turns
      chaseYaw += (-lead.yaw - chaseYaw) * (1 - Math.exp(-dt * 3.4))
      const raw = chaseYaw - cam.yaw
      if (vC === 0 && vK === 0) yawDiff = wrapAngle(raw)
      else yawDiff += wrapAngle(raw - yawDiff)
    } else {
      // on an island the camera rests on a point (the pilot), north up
      const kc = 1 - Math.exp(-dt * 4)
      follow.x += wd(camTarget.x - follow.x) * kc
      follow.y += wd(camTarget.y - follow.y) * kc
      follow.alt += (camTarget.alt - follow.alt) * (1 - Math.exp(-dt * 3))
      cam.yaw += wrapAngle(camTarget.yaw - cam.yaw) * (1 - Math.exp(-dt * 3.5))
      yawDiff += (0 - yawDiff) * (1 - Math.exp(-dt * 4))
      // the tilted camera stays clear of a hill behind the pilot
      let fix = 0
      camFloor = 0
      if (vC > 0.3 && vQ > 1e-4 && !camFree) {
        const back = 1 / vQ
        const gx = cam.x + vSin * back
        const gy = cam.y + vCos * back
        let top = 0
        for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) top = Math.max(top, groundAt(gx + ix * 9, gy + iy * 9))
        camFloor = top + 8
        const nominal = follow.alt + vLean * back
        fix = Math.max(nominal, camFloor) - nominal
      }
      camFix += (fix - camFix) * (1 - Math.exp(-dt * 5))
    }
    updateView()
  }

  // Flying the lead: the prototype's handling, unchanged — it eases into turns, banks with them,
  // skims whatever ground is ahead and never hits it. A vehicle is a set of numbers (speed, turn
  // rate, bank, cruising height …), so a new aircraft handles like this one, only different.
  function stepFlight(dt, maxRate) {
    const boat = p.kind === 'boat'
    const pushing = !script && ((holding && holdT >= HOLD) || boostKey)
    boost += ((pushing ? 1 : 0) - boost) * (1 - Math.exp(-dt * (pushing ? 5 : 2.4)))
    if (boost < 0.0005 && !pushing) boost = 0
    const speed = p.speed * (1 + (clamp(p.boost, 1, 4) - 1) * boost)
    const bankMax = (p.bank * Math.PI) / 180
    const clearance = clamp(p.clearance, 2, 60)
    const ox = lead.x
    const oy = lead.y
    const oz = lead.z
    let level = false // wings level: rolling along a runway, or turning on the spot

    if (script) {
      const s = script
      s.t += dt
      const raw = clamp(s.t / s.duration, 0, 1)
      const u = s.ease === 'in' ? raw * raw : s.ease === 'out' ? 1 - (1 - raw) * (1 - raw) : raw
      level = !!s.level
      if (s.kind === 'turn') {
        lead.yaw = s.yaw0 + s.dyaw * (u * u * (3 - 2 * u))
        lead.yawRate = 0
      } else {
        pathPoint(s, u, ptA)
        lead.x = ptA.x
        lead.y = ptA.y
        const u2 = u * u
        const d00 = 6 * u2 - 6 * u
        const d10 = 3 * u2 - 4 * u + 1
        const d01 = -6 * u2 + 6 * u
        const d11 = 3 * u2 - 2 * u
        const tx = d00 * s.x0 + d10 * s.m0x + d01 * s.x1 + d11 * s.m1x
        const ty = d00 * s.y0 + d10 * s.m0y + d01 * s.y1 + d11 * s.m1y
        if (tx * tx + ty * ty > 1e-3) {
          const turn = wrapAngle(Math.atan2(tx, -ty) - lead.yaw)
          const rate = clamp(turn / Math.max(dt, 1e-4), -maxRate * 2, maxRate * 2)
          lead.yawRate += (rate - lead.yawRate) * (1 - Math.exp(-dt * 8))
          lead.yaw += turn
        }
        const z0 = s.zFrom || 0
        const z1 = s.zTo === undefined ? 1 : s.zTo
        const zu = clamp((u - z0) / Math.max(1e-3, z1 - z0), 0, 1)
        lead.z = s.z0 + (s.z1 - s.z0) * (zu * zu * (3 - 2 * zu))
        // an approach never sinks into a hill on the way down
        if (!level) lead.z = Math.max(lead.z, groundAt(lead.x, lead.y) + lead.model.pivY * lead.scale)
      }
      altGoal = lead.z
      floorS = 0
      if (raw >= 1) {
        script = null
        lead.yaw += wrapAngle(s.yaw1 - lead.yaw)
        if (s.thenAlt !== undefined) altGoal = s.thenAlt
        if (s.onDone) s.onDone()
        if (!lead || mode !== 'flight') return // it has landed: the game took the vehicle over
      }
    } else {
      // how low and how high it may fly: it skims whatever ground lies ahead, with a little
      // room to spare, so it can get close but never hit anything; the ceiling is a setting
      const floorNow = boat ? 0 : groundAhead(lead, speed) + clearance
      if (floorS === 0) floorS = floorNow
      floorS += (floorNow - floorS) * (1 - Math.exp(-dt * (floorNow > floorS ? 9 : 3)))
      const altLo = floorS
      const altHi = Math.max(altLo, p.altitude, clamp(p.ceiling, 20, 900))
      const climbMax = speed * 0.55
      const chase = vC + vK > 0.5 // flying from behind or from the seat

      // where to turn and, from behind, how high to fly
      let want = 0
      let flown = false // true while the player is choosing the height
      const stick = p.invertY ? -1 : 1 // like a flight stick, down climbs and up dives
      if (keyMode) {
        want = keyTurn * maxRate
        altGoal += keyClimb * stick * climbMax * dt
        flown = true
      } else if (p.followPointer && pointerOn && (chase || project(lead.x, lead.y, lead.z))) {
        const vx = pointerX - prX
        const vy = pointerY - prY
        if (chase) {
          // from behind: point left or right of the jet to turn, above or below it to climb or dive
          const t = clamp((pointerX - vCx) / (W * 0.26), -1, 1)
          if (Math.abs(t) > 0.06) want = t * maxRate
          const raw = pointerY < vSteerY ? (vSteerY - pointerY) / Math.max(1, vSteerY) : -(pointerY - vSteerY) / Math.max(1, H - vSteerY)
          const up = stick * Math.sign(raw) * Math.max(0, Math.abs(raw) - 0.08) / 0.92
          altGoal = up >= 0 ? p.altitude + up * (altHi - p.altitude) : p.altitude + up * (p.altitude - altLo)
          flown = true
        } else {
          flown = true // overhead: keep the height it was flown to
          if (vx * vx + vy * vy > 18 * 18) {
            const fx = vx * vCos + vy * vSin
            const fy = -vx * vSin + vy * vCos
            const err = wrapAngle(Math.atan2(fx, -fy) - lead.yaw)
            want = clamp(err * 2.6, -maxRate, maxRate)
          }
        }
      }
      // (with no hand on the controls it flies straight and level: a delivery is not an air show)
      lead.yawRate += (want - lead.yawRate) * (1 - Math.exp(-dt * 2.6))
      lead.yaw += lead.yawRate * dt
      let vx = Math.sin(lead.yaw) * speed
      let vy = -Math.cos(lead.yaw) * speed
      if (boat) {
        // a boat cannot leave the water: it loses way against a shore and can only turn away
        const sn = Math.sin(lead.yaw)
        const cs = Math.cos(lead.yaw)
        const bow = lead.model.pivK * lead.scale + 3
        const land = (d, side) => matMap[cell(lead.x + sn * d + cs * side, lead.y - cs * d + sn * side)] >= FIRST_LAND
        const blocked = land(bow, 0) || land(bow * 0.6, -4) || land(bow * 0.6, 4)
        boatWay += ((blocked || anchored ? 0 : 1) - boatWay) * (1 - Math.exp(-dt * (blocked ? 9 : anchored ? 2.4 : 1.6)))
        vx *= boatWay
        vy *= boatWay
        if (matMap[cell(lead.x + vx * dt, lead.y + vy * dt)] >= FIRST_LAND) {
          vx = 0
          vy = 0
        }
        lead.x += vx * dt
        lead.y += vy * dt
        lead.z = lead.model.pivY * lead.scale + Math.sin(time * 1.9) * 0.35
        altGoal = lead.z
      } else {
        lead.x += vx * dt
        lead.y += vy * dt
        // height: left alone it drifts back to cruising; it climbs and dives at a limited rate
        if (!flown) altGoal += (p.altitude - altGoal) * (1 - Math.exp(-dt * 0.9))
        altGoal = clamp(altGoal, altLo, altHi)
        let dz = (altGoal + Math.sin(time * 0.9) * 1.5 - lead.z) * (1 - Math.exp(-dt * 3))
        dz = clamp(dz, -climbMax * dt, climbMax * dt)
        lead.z += dz
        // last resort: never closer to what is right underneath than most of the clearance
        const hard = groundAt(lead.x, lead.y) + clearance * 0.7
        if (lead.z < hard) lead.z += (hard - lead.z) * (1 - Math.exp(-dt * 22))
      }
    }

    const span = Math.max(dt, 1e-4)
    lead.vx = (lead.x - ox) / span
    lead.vy = (lead.y - oy) / span
    speedNow = Math.hypot(lead.vx, lead.vy)
    const rollTarget = level ? 0 : clamp(lead.yawRate / maxRate, -1, 1) * bankMax
    lead.roll += (rollTarget - lead.roll) * (1 - Math.exp(-dt * 5))
    climbV += ((lead.z - oz) / span - climbV) * (1 - Math.exp(-dt * 6))
    // nose up in a climb, down in a dive (the gentle cruise bob does not count)
    const climbing = Math.sign(climbV) * Math.max(0, Math.abs(climbV) - 3)
    climbTilt = boat ? 0 : clamp((climbing / Math.max(20, speed)) * 1.25, -0.5, 0.5)
    const pitchTarget = (level || boat ? 0 : Math.abs(lead.yawRate / maxRate) * 0.1) + climbTilt
    lead.pitch += (pitchTarget - lead.pitch) * (1 - Math.exp(-dt * 4))
    // the pilot's head: it leans into a turn, sinks in a climb and under thrust, lifts in a
    // dive, and is never quite still. On a soft spring, so it overshoots a little and settles.
    const hxGoal = clamp(lead.yawRate / maxRate, -1, 1) * 6.4 + Math.sin(time * 0.53) * 0.3
    const hyGoal = clamp(climbTilt / 0.5, -1, 1) * 3.4 + boost * 1.6 + Math.sin(time * 0.71 + 1) * 0.25
    headVX += ((hxGoal - headX) * 64 - headVX * 11) * dt
    headVY += ((hyGoal - headY) * 64 - headVY * 11) * dt
    headX = clamp(headX + headVX * dt, -8, 8)
    headY = clamp(headY + headVY * dt, -5, 5)
  }

  // the jet's own axes in the world (x right, y down the map, z up)
  function axes(j) {
    const cs = Math.cos(j.yaw)
    const sn = Math.sin(j.yaw)
    const roll = rollOf(j)
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    // right wing dips for a positive roll
    const rx = cs * cr
    const ry = sn * cr
    const rz = -sr
    const u2x = cs * sr
    const u2y = sn * sr
    const u2z = cr
    const cp = Math.cos(j.pitch)
    const sp = Math.sin(j.pitch)
    const fx = sn * cp + u2x * sp
    const fy = -cs * cp + u2y * sp
    const fz = u2z * sp
    const ux = u2x * cp - sn * sp
    const uy = u2y * cp + cs * sp
    const uz = u2z * cp
    return { rx, ry, rz, fx, fy, fz, ux, uy, uz, cr }
  }

  // ── drawing
  //
  // One camera covers both views. A world point lands on screen at
  //   scale = S / (1 + q·depth)     x = Cx + scale·across     y = Cy − scale·(height + slope·depth)
  // With q = 0 this is the flat sprite-stack view: every layer is drawn one pixel above the last.
  // Raising q brings the camera in behind the jet: far things shrink and a horizon appears.
  // Switching views only slides q, the slope, the scale and the heading, so there is no cut.
  const sjx = new Float64Array(NSHADOW)
  const sjy = new Float64Array(NSHADOW)
  const srx = new Float64Array(NSHADOW)
  const sry = new Float64Array(NSHADOW)
  const sfx = new Float64Array(NSHADOW)
  const sfy = new Float64Array(NSHADOW)
  const sic = new Float64Array(NSHADOW)
  const sisc = new Float64Array(NSHADOW)
  const sreach = new Float64Array(NSHADOW)
  const smdl = new Array(NSHADOW)
  const rowNow = new Int32Array(ZTOP + 8) // screen row of every height at this depth step
  const rowPrev = new Int32Array(ZTOP + 8) // … and at the step before
  const offX = new Float32Array(128) // (one entry per slice of the tallest model: the lighthouse is 78)
  const offY = new Float32Array(128)
  const edgeIdx = new Int32Array(16)
  const sliceOrder = new Int32Array(128)
  const sliceKey = new Float64Array(128)
  let prX = 0
  let prY = 0
  let prM = 0
  let prV = 0

  /** world point → screen (prX, prY) and its scale (prM); false when it is behind the camera */
  function project(x, y, z) {
    const dx = wd(x - cam.x)
    const dy = wd(y - cam.y)
    const depth = -(dx * vSin + dy * vCos)
    const den = 1 + vQ * depth
    if (den < 0.12) return false
    prV = depth
    prM = vS / den
    prX = vCx + prM * (dx * vCos - dy * vSin)
    prY = vCy - prM * (z - cam.alt + vTan * depth)
    return true
  }

  // The islands and clouds, drawn from the nearest ground to the farthest. Every ground pixel
  // is a column of stacked layers: its top is drawn where the column ends and its wall where it
  // starts, and a pixel that is already taken stays taken (nearer things win).
  function drawWorld() {
    const _fb = fb
    const _zb = zbuf
    if (rowLo === 0 && rowHi === H && colLo === 0 && colHi === W) {
      _fb.fill(0)
      _zb.fill(1e9)
    } else {
      for (let y = rowLo; y < rowHi; y++) {
        _fb.fill(0, y * W + colLo, y * W + colHi)
        _zb.fill(1e9, y * W + colLo, y * W + colHi)
      }
    }
    if (post.dry && dryMk.length === W * H) dryMk.fill(0)
    colY.fill(rowHi)
    const c = vCos
    const s = vSin
    const q = vQ
    const S = vS
    const tn = vTan
    const Cx = vCx
    const Cy = vCy
    const A = cam.alt
    const bx = cam.x - Math.floor(cam.x / N) * N + N * 2
    const by = cam.y - Math.floor(cam.y / N) * N + N * 2
    const rankMax = Math.round(clamp(cloudNow, 0, 1) * 16)
    const cloudsOn = rankMax > 0
    const cdx = (time * 7) % NC
    const cdy = (time * 3) % NC
    const csx = sunX * CLOUD_ALT - cdx + NC
    const csy = sunY * CLOUD_ALT - cdy + NC
    const tW1 = ((time * 6) | 0) & 1023
    const tW2 = ((time * 4) | 0) & 1023
    const tF = (time * 36) | 0
    const sx = sunX
    const sy = sunY
    let nShadow = 0
    if (p.shadow) {
      for (let i = 0; i < actors.length && nShadow < NSHADOW; i++) {
        const a = actors[i]
        if (!a.visible || !a.shadow || a.introT < 0.3) continue
        const ddx = wd(a.x - cam.x)
        const ddy = wd(a.y - cam.y)
        if (Math.abs(ddx) + Math.abs(ddy) > 700) continue
        const ax = axes(a)
        const j = nShadow
        sjx[j] = bx + ddx + sx * a.z
        sjy[j] = by + ddy + sy * a.z
        const cs = Math.cos(a.yaw)
        const sn = Math.sin(a.yaw)
        srx[j] = cs
        sry[j] = sn
        sfx[j] = sn
        sfy[j] = -cs
        sic[j] = 1 / (Math.max(0.3, Math.abs(ax.cr)) * a.scale)
        sisc[j] = 1 / a.scale
        sreach[j] = a.model.L * 0.75 * a.scale + 3
        smdl[j] = a.model
        nShadow++
      }
    }
    const _h = heightMap
    const _m = matMap
    const _cn = cloudN
    const _nz = nz
    const _cy = colY
    const hzR = hazeCol & 255
    const hzG = (hazeCol >> 8) & 255
    const hzB = (hazeCol >> 16) & 255
    const mixHaze = (col, keep, fog) =>
      ((255 << 24) |
        (((((col >> 16) & 255) * keep + hzB * fog) >> 8) << 16) |
        (((((col >> 8) & 255) * keep + hzG * fog) >> 8) << 8) |
        (((col & 255) * keep + hzR * fog) >> 8)) >>> 0

    // start where the tallest thing sits on the bottom row; stop when the sea leaves the top
    // of the frame, or at the view distance once there is a horizon
    // (a camera down among the hills and clouds starts right in front of itself instead)
    const below = rowHi - Cy
    const nearest = q > 0 ? -0.85 / q : -1e9
    const camHigh = q > 0 ? A + tn / q : 1e9
    const dn = S * tn + q * below
    let v = camHigh > ZTOP + 1 && dn > 1e-6 ? Math.max(nearest, (S * (A - ZTOP) - below) / dn - 2) : nearest
    // from higher up it sees further, and the haze starts further out
    const viewDist = (VIEW_DIST + 3 * A) * (1 - 0.5 * camHaze)
    // in a fog the haze comes right in
    const fogStart = (FOG_START + 2 * A) * (1 - 0.8 * clamp(Math.max(p.weather?.fog || 0, camHaze), 0, 1))
    const above = Cy - rowLo + 2
    let vEnd = viewDist
    if (S * tn > q * above) vEnd = Math.min(viewDist, (S * A + above) / (S * tn - q * above))
    let den = 1 + q * v
    let m = S / den
    let R = Cy - m * (tn * v - A) + EPS
    for (let z = 0; z <= ZTOP; z++) rowNow[z] = Math.floor(R - m * z)
    const rowsK = S * (tn + q * A)
    for (let guard = 0; v < vEnd && guard < 4000; guard++) {
      // one step deeper: about one screen row of sea, never coarser than a few pixels across
      let dv = (den * den) / rowsK
      const cap = (2.5 * den) / S
      if (dv > cap) dv = cap
      if (dv < 0.5) dv = 0.5
      // (a wall stands at the step before this one: where its rows of height fall on the screen)
      const Rp = R
      const imp = 1 / m
      v += dv
      den = 1 + q * v
      m = S / den
      R = Cy - m * (tn * v - A) + EPS
      for (let z = 0; z <= ZTOP; z++) {
        rowPrev[z] = rowNow[z]
        rowNow[z] = Math.floor(R - m * z)
      }
      const inv = den / S
      const ax = c * inv
      const ay = -s * inv
      let wx = bx - Cx * ax - v * s
      let wy = by - Cx * ay - v * c
      // distance haze: colours step towards the horizon colour, a few shades at a time
      let fog = 0
      if (q > 0 && v > fogStart) {
        const f = (v - fogStart) / (viewDist - fogStart)
        fog = Math.min(256, ((Math.sqrt(f) * FOG_STEPS + 0.5) | 0) * (256 / FOG_STEPS)) | 0
      }
      const keep = 256 - fog
      const fine = inv < 1.8
      wx += ax * colLo
      wy += ay * colLo
      for (let px = colLo; px < colHi; px++, wx += ax, wy += ay) {
        // clouds: a stack of up to CK layers floating at CLOUD_ALT
        if (cloudsOn) {
          const cv = _cn[((((wy - cdy + NC) | 0) & NCM) << NCSHIFT) | (((wx - cdx + NC) | 0) & NCM)]
          if (cv !== 0 && cv >> 4 < rankMax) {
            const tk = cv & 15
            const zt = CLOUD_ALT + tk - 1
            let y0 = rowNow[zt]
            let y1 = rowPrev[zt]
            if (y0 < rowLo) y0 = rowLo
            if (y1 > rowHi) y1 = rowHi
            if (y0 < y1) {
              let col = cloudTop[tk - 1]
              if (fog > 0) col = mixHaze(col, keep, fog)
              for (let y = y0, o = y0 * W + px; y < y1; y++, o += W) {
                // the thinnest rim is a checker, so the cloud edge is soft
                if (_fb[o] !== 0 || (tk === 1 && ((px + y) & 1) === 0)) continue
                _fb[o] = col
                _zb[o] = v
              }
            }
            // its underside, when the camera is below the clouds
            let u0 = rowPrev[CLOUD_ALT]
            let u1 = rowNow[CLOUD_ALT]
            if (u0 < u1) {
              if (u0 < rowLo) u0 = rowLo
              if (u1 > rowHi) u1 = rowHi
              const col = fog > 0 ? mixHaze(cloudUnder, keep, fog) : cloudUnder
              for (let y = u0, o = u0 * W + px; y < u1; y++, o += W) {
                if (_fb[o] !== 0 || (tk === 1 && ((px + y) & 1) === 0)) continue
                _fb[o] = col
                _zb[o] = v
              }
            }
            for (let k = tk - 2; k >= 0; k--) {
              let ya = rowPrev[CLOUD_ALT + k + 1]
              let yb = rowPrev[CLOUD_ALT + k]
              if (ya < rowLo) ya = rowLo
              if (yb > rowHi) yb = rowHi
              if (ya >= yb) continue
              let col = cloudSide[k]
              if (fog > 0) col = mixHaze(col, keep, fog)
              for (let y = ya, o = ya * W + px; y < yb; y++, o += W) {
                if (_fb[o] === 0) { _fb[o] = col; _zb[o] = v }
              }
            }
          }
        }
        // terrain
        const gx = wx | 0
        const gy = wy | 0
        const idx = ((gy & NM) << NSHIFT) | (gx & NM)
        const h = _h[idx]
        let cY = _cy[px]
        const yT = rowNow[h]
        let yR = rowPrev[h]
        if (yT >= cY && yR >= cY) continue
        const mat = _m[idx]
        // shadows: clouds, then the jets
        let shade = 0
        if (cloudsOn) {
          const sv = _cn[((((gy + csy) | 0) & NCM) << NCSHIFT) | (((gx + csx) | 0) & NCM)]
          if ((sv & 15) > 1 && sv >> 4 < rankMax) shade = 1
        }
        if (shade === 0 && nShadow > 0) {
          for (let j = 0; j < nShadow; j++) {
            const dx = gx - sjx[j] + sx * h
            const dy = gy - sjy[j] + sy * h
            const reach = sreach[j]
            if (dx > -reach && dx < reach && dy > -reach && dy < reach) {
              const md = smdl[j]
              const a = (dx * srx[j] + dy * sry[j]) * sic[j]
              const b = (dx * sfx[j] + dy * sfy[j]) * sisc[j]
              const i = Math.floor(a + md.W / 2)
              const k = Math.floor(md.pivK - b + 0.5)
              if (i >= 0 && i < md.W && k >= 0 && k < md.L && md.shadowMask[k * md.W + i] === 1) { shade = 1; break }
            }
          }
        }
        let top
        let side
        if (mat < 4) {
          top = shade ? topShade[mat] : topLit[mat]
          if (mat === 3) {
            if (((_nz[((gy & 255) << 8) | (gx & 255)] + tF) & 255) < 120) top = shade ? topShade[2] : foamCol
          } else if (shade === 0 && fine) {
            const n1 = _nz[((gy & 255) << 8) | (((gx + tW1) >> 2) & 255)]
            if (n1 > 243) {
              const n2 = _nz[(((gy + 91) & 255) << 8) | (((gx + 1024 - tW2) >> 2) & 255)]
              if (n2 > 128) top = n1 > 252 ? sparkB : sparkA
            }
          }
          side = top
        } else {
          top = shade ? topShade[mat] : topLit[mat]
          side = shade ? sideShade[mat] : sideLit[mat]
        }
        if (fog > 0) {
          top = mixHaze(top, keep, fog)
          side = mixHaze(side, keep, fog)
        }
        // the wall of this column, where it starts …
        if (yR < cY) {
          if (yR < rowLo) yR = rowLo
          if (hasBand[mat] !== 0) {
            // a wall with floors: two rows of windows, then one of wall
            let bc = shade ? bandShade[mat] : bandLit[mat]
            if (fog > 0) bc = mixHaze(bc, keep, fog)
            for (let y = yR, o = yR * W + px; y < cY; y++, o += W) {
              if (_fb[o] === 0) { _fb[o] = (((Rp - y) * imp) | 0) % 3 === 0 ? side : bc; _zb[o] = v }
            }
          } else {
            for (let y = yR, o = yR * W + px; y < cY; y++, o += W) {
              if (_fb[o] === 0) { _fb[o] = side; _zb[o] = v }
            }
          }
          cY = yR
        }
        // … and its top, up to where it ends (unless the camera is below it)
        if (yT < cY) {
          const y0 = yT < rowLo ? rowLo : yT
          for (let y = y0, o = y0 * W + px; y < cY; y++, o += W) {
            if (_fb[o] === 0) { _fb[o] = top; _zb[o] = v }
          }
          cY = yT
        }
        _cy[px] = cY
      }
    }
  }

  // whatever the ground left empty: sky above the horizon, haze below it
  function drawSky() {
    if (vC === 0 && vK === 0) return
    const _fb = fb
    const q = vQ
    const horizon = q > 1e-7 ? vCy - (vS * vTan) / q : -1e9
    const hz = horizon > H ? H : Math.floor(horizon)
    const focal = q > 1e-7 ? vS / q : 1e9
    const tod = p.timeOfDay
    // sun or moon, low over the horizon, opposite the shadows
    if (hz > 0 && tod !== 'day') {
      const sl = Math.sqrt(sunX * sunX + sunY * sunY) || 1
      const dx = -sunX / sl
      const dy = -sunY / sl
      const du = dx * vCos - dy * vSin
      const dv = -(dx * vSin + dy * vCos)
      if (dv > 0.2) {
        const rad = tod === 'sunset' ? W * 0.05 : W * 0.022
        const cxs = vCx + (focal * du) / dv
        const cys = horizon - (focal * (tod === 'sunset' ? 0.12 : 0.3)) / dv
        const reach = rad * 1.9
        const xa = Math.max(0, Math.floor(cxs - reach))
        const xb = Math.min(W - 1, Math.ceil(cxs + reach))
        const ya = Math.max(0, Math.floor(cys - reach))
        const yb = Math.min(hz - 1, Math.ceil(cys + reach))
        for (let y = ya; y <= yb; y++) {
          for (let x = xa; x <= xb; x++) {
            const o = y * W + x
            if (_fb[o] !== 0) continue
            const d = Math.sqrt((x - cxs) * (x - cxs) + (y - cys) * (y - cys)) / rad
            if (d < 1) _fb[o] = sunCol
            else if (d < 1.9 && (1.9 - d) * 14 > BAYER[((y & 3) << 2) | (x & 3)]) _fb[o] = sunGlow
          }
        }
      }
    }
    const span = frameH * 0.75
    const starOff = ((vYaw * focal) | 0) & 4095
    const stars = tod === 'night'
    for (let y = rowLo; y < rowHi; y++) {
      let o = y * W
      o += colLo
      if (y < hz) {
        const t = ((hz - y) / span) * (NSKY - 1)
        for (let x = colLo; x < colHi; x++, o++) {
          if (_fb[o] !== 0) continue
          let b = t | 0
          const edge = (t - b - 0.7) * 3.4
          if (edge > 0 && edge * 16 > BAYER[((y & 3) << 2) | (x & 3)]) b++
          if (b >= NSKY) b = NSKY - 1
          _fb[o] = stars && b > 1 && hash8(((x + starOff) & 4095) * 73 + y * 9973) < 2 ? sunCol : skyPal[b]
        }
      } else {
        for (let x = colLo; x < colHi; x++, o++) if (_fb[o] === 0) _fb[o] = hazeCol
      }
    }
  }

  function drawTrails() {
    if (!p.trails) return
    const LIFE = 2.6
    const _fb = fb
    const _zb = zbuf
    for (const j of actors) {
      if (!j.trailLen || !j.visible) continue
      if (j === lead && jetFade < 0.5) continue
      const g = j.g
      for (let w = 0; w < 2; w++) {
        const tr = j.trail[w]
        let prevX = 0
        let prevY = 0
        let has = false
        for (let n = 0; n < j.trailLen; n++) {
          const o = ((j.trailHead - 1 - n + TRAIL_N * 2) % TRAIL_N) * 4
          const age = (time - tr[o + 3]) / (LIFE * (0.3 + 0.7 * g))
          if (age >= 1) break
          if (!project(tr[o], tr[o + 1], tr[o + 2])) { has = false; continue }
          const sxp = prX
          const syp = prY
          if (has) {
            // short line from the previous point, thicker when it is close to the camera
            const span = Math.max(Math.abs(sxp - prevX), Math.abs(syp - prevY))
            if (span < 600) {
              const steps = Math.max(1, Math.ceil(span))
              const alpha = age < 0.5 ? 1 : (1 - age) * 2
              const col = age < 0.25 ? trailPal[0] : age < 0.6 ? trailPal[1] : trailPal[2]
              const thick = prM > 2.4 ? 2 : 1
              for (let k = 0; k < steps; k++) {
                const x0 = Math.round(prevX + ((sxp - prevX) * k) / steps)
                const y0 = Math.round(prevY + ((syp - prevY) * k) / steps)
                for (let yy = y0; yy < y0 + thick; yy++) {
                  for (let xx = x0; xx < x0 + thick; xx++) {
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                    if (_zb[yy * W + xx] < prV - 1) continue // behind a hill or a cloud
                    if (alpha * 16 > BAYER[((yy & 3) << 2) | (xx & 3)]) _fb[yy * W + xx] = col
                  }
                }
              }
            }
          }
          prevX = sxp
          prevY = syp
          has = true
        }
      }
    }
  }

  // dark exhaust smoke: soft round puffs that swell, pale and thin out as they hang in the air
  function drawSmoke() {
    const _fb = fb
    const _zb = zbuf
    const night = p.timeOfDay === 'night' ? 0.55 : 1
    for (let i = 0; i < SMOKE_N; i++) {
      const o = i * SMOKE_F
      const life = smoke[o + 8]
      if (life <= 0) continue
      const age = time - smoke[o + 3]
      if (age < 0 || age >= life) continue
      const u = age / life
      // the exhaust shoves it backwards at first; then it just hangs and rises a little
      const push = (1 - Math.exp(-age * 5)) / 5
      if (!project(smoke[o] + smoke[o + 5] * push, smoke[o + 1] + smoke[o + 6] * push, smoke[o + 2] + age * 2.5)) continue
      const rad = Math.max(0.8, smoke[o + 4] * (1 + 2.4 * u) * prM)
      if (rad > 60) continue
      const alpha = smoke[o + 7] * (1 - u) * (1 - u) * (u < 0.08 ? u / 0.08 : 1) * night
      const shade = 26 + 70 * u
      const cr = shade
      const cg = shade + 1
      const cb = shade + 7
      const x0 = Math.max(0, Math.floor(prX - rad))
      const x1 = Math.min(W - 1, Math.ceil(prX + rad))
      const y0 = Math.max(0, Math.floor(prY - rad))
      const y1 = Math.min(H - 1, Math.ceil(prY + rad))
      const inv = 1 / (rad * rad)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d2 = ((x - prX) * (x - prX) + (y - prY) * (y - prY)) * inv
          if (d2 > 1) continue
          const at = y * W + x
          if (_zb[at] < prV - 1) continue
          const k = (alpha * (1 - d2 * 0.7) * 256) | 0
          const bg = _fb[at]
          const r = ((bg & 255) * (256 - k) + cr * k) >> 8
          const g = (((bg >> 8) & 255) * (256 - k) + cg * k) >> 8
          const b = (((bg >> 16) & 255) * (256 - k) + cb * k) >> 8
          _fb[at] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
        }
      }
    }
  }

  // Any model, drawn the way the prototype drew its jet: slice by slice, a few samples a voxel.
  function drawActor(j) {
    if (!j.visible) return
    const mdl = j.model
    const stretch = j.stretch || 1 // squash and stretch: the slices sit closer or further apart
    const JET_W = mdl.W
    const JET_L = mdl.L
    const JET_H = mdl.H
    const PIV_K = mdl.pivK
    const PIV_Y = mdl.pivY
    const sliceA = mdl.sliceA
    const sliceB = mdl.sliceB
    const sliceC = mdl.sliceC
    const firstSlice = mdl.firstSlice
    const jetPal = mdl.pal
    const jetPalLit = mdl.palLit
    const jetPalDim = mdl.palDim
    const eng = mdl.engine
    const ENGINE_A = eng ? eng.a : 0
    const ENGINE_Y = eng ? eng.y : 0
    const ENGINE_R = eng ? eng.r : 1
    const NOZZLE_K = eng ? eng.nozzleK : 0
    const c = vCos
    const s = vSin
    const q = vQ
    const S = vS
    const tn = vTan
    const ax = axes(j)
    const sc = j.scale
    // the jet's own axes in view space, per voxel: across the screen (U), into it (V), up (W)
    const rU = (ax.rx * c - ax.ry * s) * sc
    const rV = -(ax.rx * s + ax.ry * c) * sc
    const rW = ax.rz * sc
    const fU = (ax.fx * c - ax.fy * s) * sc
    const fV = -(ax.fx * s + ax.fy * c) * sc
    const fW = ax.fz * sc
    const uU = (ax.ux * c - ax.uy * s) * sc
    const uV = -(ax.ux * s + ax.uy * c) * sc
    const uW = ax.uz * sc
    const dx = wd(j.x - cam.x)
    const dy = wd(j.y - cam.y)
    const cU = dx * c - dy * s
    const cV = -(dx * s + dy * c)
    const cW = j.z - cam.alt
    // going into the cockpit, the camera moves into the leader, which fades away
    const fade = (j === lead ? jetFade : 1) * j.fade
    if (fade < 0.004) return
    const fading = fade < 1
    const _bg = backdrop
    const den0 = 1 + q * cV
    if (den0 < 0.2) return
    const m0 = S / den0
    const cx = vCx + m0 * cU
    const cy = vCy - m0 * (cW + tn * cV)
    const far = JET_L * sc * m0 + 40
    if (cx < -far || cy < -far - H || cx > W + far || cy > H + far) return
    // screen steps for one voxel along the wing and along the fuselage, at the jet's centre
    const prx = m0 * rU
    const pry = -m0 * (rW + tn * rV)
    const pfx = m0 * fU
    const pfy = -m0 * (fW + tn * fV)
    const _fb = fb
    const _mk = jetMask
    const _zb = zbuf
    // light: which way each half of the jet faces the sun
    const lx = -sunX
    const ly = -sunY
    const lz = 1.1
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz)
    const night = p.timeOfDay === 'night'
    const litAt = night ? 0.74 : 0.9
    const dimAt = night ? 0.4 : 0.66
    const lit = (side) => {
      const nx = ax.ux + side * 0.4 * ax.rx
      const ny = ax.uy + side * 0.4 * ax.ry
      const nz2 = ax.uz + side * 0.4 * ax.rz
      const b = (nx * lx + ny * ly + nz2 * lz) / (ll * Math.sqrt(nx * nx + ny * ny + nz2 * nz2))
      return b > litAt ? jetPalLit : b < dimAt ? jetPalDim : jetPal
    }
    const palL = lit(-1)
    const palR = lit(1)
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    // several samples per voxel, more the larger it is drawn, so a turned slice has no pin-holes
    const big = (sc * S) / Math.max(0.2, den0 - q * JET_L * 0.6 * sc)
    // A prop is a hollow shell (far fewer voxels), so each of its voxels is drawn as a little
    // column: its top, and below that its near side, down to where the slice beneath begins.
    // Without the sides, a shell seen from a low angle would be a stack of separate stripes.
    const shell = !!mdl.shell
    const ns = shell ? clamp(Math.ceil(big * 1.5), 2, 6) : clamp(Math.ceil(big * 2 - 0.24), 2, 8)
    // drawn very close (a boat from just behind), a voxel is many pixels across: each sample is
    // then a little square, not a dot, so the faces stay solid instead of a comb of points
    const dot = Math.max(1, Math.ceil(big / ns + 0.15))
    for (let i = 0; i < ns; i++) {
      for (let k = 0; k < ns; k++) {
        const oi = (i + 0.5) / ns - 0.5
        const ok = (k + 0.5) / ns - 0.5
        offX[i * ns + k] = oi * prx + ok * pfx
        offY[i * ns + k] = oi * pry + ok * pfy
      }
    }
    const nOff = ns * ns
    let sideN = 0 // how many pixels the side runs, and along which way on screen
    let sideX = 0
    let sideY = 0
    let nEdge = 0
    if (shell) {
      const sp = spreadNow * stretch
      const gx = -m0 * uU * sp
      const gy = m0 * (uW + tn * uV) * sp
      const len = Math.hypot(gx, gy)
      sideN = Math.min(dot > 1 ? 60 : 7, Math.round(len))
      if (sideN > 0) {
        sideX = gx / len
        sideY = gy / len
        // only the samples along the two edges of the voxel that lead the way need to run
        const ei = prx * sideX + pry * sideY > 0 ? ns - 1 : 0
        const ek = pfx * sideX + pfy * sideY > 0 ? ns - 1 : 0
        for (let i = 0; i < ns; i++) edgeIdx[nEdge++] = i * ns + ek
        for (let k = 0; k < ns; k++) if (k !== ek) edgeIdx[nEdge++] = ei * ns + k
      }
    }
    const palSide = mdl.palDim
    // slices are drawn from the one farthest from eye level to the nearest, so nearer ones cover
    let eye
    if (q < 1e-6) eye = tn * uW - uV >= 0 ? 1e9 : -1e9
    else eye = (-cU * uU + (-1 / q - cV) * uV + (tn / q - cW) * uW) / (sc * sc)
    for (let y = 0; y < JET_H; y++) {
      sliceOrder[y] = y
      sliceKey[y] = Math.abs((y - PIV_Y) * spreadNow * stretch - eye)
    }
    for (let i = 1; i < JET_H; i++) {
      const y = sliceOrder[i]
      const key = sliceKey[y]
      let k = i - 1
      while (k >= 0 && sliceKey[sliceOrder[k]] < key) { sliceOrder[k + 1] = sliceOrder[k]; k-- }
      sliceOrder[k + 1] = y
    }
    const it = j.introT
    const flameOn = !!eng && j.flames && burn > 0.02 && p.afterburner > 0.01 && spreadNow < 2.6
    const flick = 0.82 + 0.18 * Math.sin(time * 47) * Math.sin(time * 31)
    const flameLen = flameLength() * flick
    const flameWide = 1.15 * (1 + 0.22 * boost)
    const behind = vC + vK > 0.5 // seen from behind, the flames sit in front of the whole tail
    const bend = flameBend()
    const arch = climbTilt * 0.35
    const smooth = p.flameStyle === 'realistic'
    const dropOf = (y) => {
      // the intro: slices fall in from the top one after another and land on the stack
      if (it >= 2) return 0
      const tt = (it - (y - firstSlice) * 0.07) / 0.36
      if (tt <= 0) return NaN
      return tt < 1 ? -(1 - tt * tt) * ((H >> 1) + 44) : 0
    }
    // afterburner, sliced the same way so it stacks with the jet
    const flames = (y, bU, bV, bW, drop) => {
      const dyv = (y + 0.5 - ENGINE_Y) / (ENGINE_R * 1.25)
      if (dyv <= -1 || dyv >= 1 || flameLen <= 0.5) return
      const prof = Math.sqrt(1 - dyv * dyv)
      for (let e = -1; e <= 1; e += 2) {
        for (let t = 0; t < flameLen; t += 0.5) {
          const u = t / flameLen
          const rad = ENGINE_R * flameWide * Math.pow(1 - u, 0.75) * prof * (0.9 + 0.2 * Math.sin(t * 1.9 - time * 40 + e))
          if (rad < 0.2) continue
          const b = PIV_K - NOZZLE_K - t
          // the plume trails round the inside of a turn, and along the arc of a climb or dive
          const curl = (t * t) / flameLen
          const swing = bend * curl
          const lift = arch * curl
          for (let a = -rad; a <= rad; a += 0.5) {
            const aa = e * ENGINE_A + a + swing
            const V = bV + aa * rV + b * fV + lift * uV
            const den = 1 + q * V
            if (den < 0.2) continue
            const m = S / den
            const heat = u * 0.9 + (Math.abs(a) / (rad + 0.01)) * 0.55 + Math.abs(dyv) * 0.3 - 0.16 * boost
            const col = flamePal[heat < 0.28 ? 0 : heat < 0.5 ? 1 : heat < 0.75 ? 2 : heat < 1.0 ? 3 : heat < 1.25 ? 4 : 5]
            const fx = Math.round(vCx + m * (bU + aa * rU + b * fU + lift * uU))
            const fy = Math.round(vCy - m * (bW + aa * rW + b * fW + lift * uW + tn * V) + drop)
            const size = Math.max(1, Math.ceil(m * sc * 0.55))
            for (let yy = fy; yy < fy + size; yy++) {
              for (let xx = fx; xx < fx + size; xx++) {
                if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                const at = yy * W + xx
                if (_zb[at] < V - 1) continue
                if (fading && _mk[at] === 0) _bg[at] = _fb[at]
                _fb[at] = col
                _mk[at] = 2 // flame: never outlined
              }
            }
            if (fx < x0) x0 = fx
            if (fx + size > x1) x1 = fx + size
            if (fy < y0) y0 = fy
            if (fy + size > y1) y1 = fy + size
          }
        }
      }
    }
    // a smooth flame is only measured here: where its nozzle, a point straight behind it and its
    // tip (which swings out in a turn) fall in the frame, and how much of it the world hides
    const smoothFlames = () => {
      // (the fire flickers by itself, so its length is held much steadier than the pixel flames')
      const L = flameLength() * (0.94 + 0.3 * (flick - 0.82)) * FLAME_GROW
      const wide = ENGINE_R * (1 + 0.12 * boost) * 1.5
      const show = fade * (1 - cockpitIn())
      if (L <= 0.6 || show < 0.01) return
      const hgt = (ENGINE_Y - 0.5 - PIV_Y) * spreadNow * stretch
      const bU = cU + hgt * uU
      const bV = cV + hgt * uV
      const bW = cW + hgt * uW
      for (let e = -1; e <= 1; e += 2) {
        if (flameOut.count >= FLAME_MAX) return
        const o = flameOut.count * FLAME_F
        let inView = true
        let mA = 0
        let mC = 0
        for (let n = 0; n < 3; n++) {
          const curl = n === 2 ? L : 0
          const aa = e * ENGINE_A + bend * curl
          const b = PIV_K - NOZZLE_K - n * 0.5 * L
          const lift = arch * curl
          const V = bV + aa * rV + b * fV + lift * uV
          const den = 1 + q * V
          if (den < 0.2) { inView = false; break }
          const m = S / den
          flameData[o + n * 2] = vCx + m * (bU + aa * rU + b * fU + lift * uU)
          flameData[o + n * 2 + 1] = vCy - m * (bW + aa * rW + b * fW + lift * uW + tn * V)
          flameV[n] = V
          if (n === 0) mA = m
          else if (n === 2) mC = m
        }
        if (!inView) continue
        const rad = wide * sc * mA
        const slot = e > 0 ? 1 : 0
        for (let n = 0; n < 3; n++) {
          const mid = n === 1
          const px = mid ? 0.25 * flameData[o] + 0.5 * flameData[o + 2] + 0.25 * flameData[o + 4] : flameData[o + n * 2]
          const py = mid ? 0.25 * flameData[o + 1] + 0.5 * flameData[o + 3] + 0.25 * flameData[o + 5] : flameData[o + n * 2 + 1]
          const V = mid ? 0.25 * flameV[0] + 0.5 * flameV[1] + 0.25 * flameV[2] : flameV[n]
          let open = 0
          for (let k = 0; k < 5; k++) {
            const xx = Math.round(px + (k === 1 ? -rad : k === 2 ? rad : 0))
            const yy = Math.round(py + (k === 3 ? -rad : k === 4 ? rad : 0))
            if (xx < 0 || yy < 0 || xx >= W || yy >= H || _zb[yy * W + xx] >= V - 1) open++
          }
          // eased, so a flame slips behind a cloud rather than blinking out
          const at = slot * 3 + n
          flameSeen[at] += (open / 5 - flameSeen[at]) * 0.3
          flameData[o + 10 + n] = flameSeen[at]
        }
        flameData[o + 6] = rad
        flameData[o + 7] = mC / mA
        flameData[o + 8] = boost
        flameData[o + 9] = show
        flameData[o + 13] = slot
        flameData[o + 14] = clamp(p.afterburner, 0, 1)
        flameData[o + 15] = L / wide
        flameOut.count++
      }
    }
    for (let n = 0; n < JET_H; n++) {
      const y = sliceOrder[n]
      const cnt = sliceC[y].length
      if (cnt === 0) continue
      const drop = dropOf(y)
      if (drop !== drop) continue
      const hgt = (y - PIV_Y) * spreadNow * stretch
      const bU = cU + hgt * uU
      const bV = cV + hgt * uV
      const bW = cW + hgt * uW
      const A = sliceA[y]
      const B = sliceB[y]
      const C = sliceC[y]
      if (sideN > 0) {
        // the sides first, so the tops of this slice are drawn over them
        for (let v = 0; v < cnt; v++) {
          const a = A[v]
          const b = B[v]
          const V = bV + a * rV + b * fV
          const den = 1 + q * V
          if (den < 0.2) continue
          const m = S / den
          const col = palSide[C[v]]
          if (col === 0) continue
          const px = vCx + m * (bU + a * rU + b * fU)
          const py = vCy - m * (bW + a * rW + b * fW + tn * V) + drop
          const k = m / m0
          for (let e = 0; e < nEdge; e++) {
            const o = edgeIdx[e]
            const ex = px + offX[o] * k
            const ey = py + offY[o] * k
            for (let t = 1; t <= sideN; t++) {
              const x = Math.round(ex + sideX * t)
              const yy = Math.round(ey + sideY * t)
              for (let dy = 0; dy < dot; dy++) {
                for (let dx = 0; dx < dot; dx++) {
                  const xx = x + dx - (dot >> 1)
                  const y2 = yy + dy - (dot >> 1)
                  if (xx < 0 || y2 < 0 || xx >= W || y2 >= H) continue
                  const at = y2 * W + xx
                  if (_zb[at] < V - 1) continue
                  if (fading && _mk[at] === 0) _bg[at] = _fb[at]
                  _fb[at] = col
                  _mk[at] = 1
                }
              }
            }
          }
        }
      }
      for (let v = 0; v < cnt; v++) {
        const a = A[v]
        const b = B[v]
        const V = bV + a * rV + b * fV
        const den = 1 + q * V
        if (den < 0.2) continue
        const m = S / den
        const col = a < 0 ? palL[C[v]] : palR[C[v]]
        if (col === 0) continue // a propeller blade that is out of sight this frame
        const px = vCx + m * (bU + a * rU + b * fU)
        const py = vCy - m * (bW + a * rW + b * fW + tn * V) + drop
        const k = m / m0
        let x = 0
        let yy = 0
        for (let o = 0; o < nOff; o++) {
          x = Math.round(px + offX[o] * k)
          yy = Math.round(py + offY[o] * k)
          if (dot > 1) {
            for (let dy = 0; dy < dot; dy++) {
              for (let dx = 0; dx < dot; dx++) {
                const xx = x + dx - (dot >> 1)
                const y2 = yy + dy - (dot >> 1)
                if (xx < 0 || y2 < 0 || xx >= W || y2 >= H) continue
                const at = y2 * W + xx
                if (_zb[at] < V - 1) continue
                if (fading && _mk[at] === 0) _bg[at] = _fb[at]
                _fb[at] = col
                _mk[at] = 1
              }
            }
            continue
          }
          if (x < 0 || yy < 0 || x >= W || yy >= H) continue
          const at = yy * W + x
          if (_zb[at] < V - 1) continue // a hill or a cloud is in front
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
        }
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (yy < y0) y0 = yy
        if (yy > y1) y1 = yy
      }
      if (flameOn && !smooth && !behind) flames(y, bU, bV, bW, drop)
    }
    if (flameOn && smooth) smoothFlames()
    if (flameOn && !smooth && behind) {
      for (let y = 0; y < JET_H; y++) {
        const drop = dropOf(y)
        if (drop !== drop) continue
        const hgt = (y - PIV_Y) * spreadNow * stretch
        flames(y, cU + hgt * uU, cV + hgt * uV, cW + hgt * uW, drop)
      }
    }
    // a dark 1 px outline around the whole stack, so it reads over any ground
    x0 = Math.max(1, x0 - 4 - sideN - dot)
    y0 = Math.max(1, y0 - 4 - sideN - dot)
    x1 = Math.min(W - 2, x1 + 4 + sideN + dot)
    y1 = Math.min(H - 2, y1 + 4 + sideN + dot)
    for (let yy = y0; yy <= y1; yy++) {
      let o = yy * W + x0
      for (let x = x0; x <= x1; x++, o++) {
        if (fading) {
          // let what was behind show through
          if (_mk[o] !== 0) {
            const bg = _bg[o]
            const fg = _fb[o]
            const k = (fade * 256) | 0
            const r = ((bg & 255) * (256 - k) + (fg & 255) * k) >> 8
            const g = (((bg >> 8) & 255) * (256 - k) + ((fg >> 8) & 255) * k) >> 8
            const b = (((bg >> 16) & 255) * (256 - k) + ((fg >> 16) & 255) * k) >> 8
            _fb[o] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
          }
        } else if (_mk[o] === 0 && ((_mk[o - 1] | _mk[o + 1] | _mk[o - W] | _mk[o + W]) & 1) === 1 && _zb[o] >= cV - 2) {
          _fb[o] = outlineCol
        }
      }
    }
    // a thing that stands indoors keeps the rain off the pixels it is drawn on
    if (post.dry && j.dry && dryMk.length === W * H) {
      for (let yy = y0; yy <= y1; yy++) {
        let o = yy * W + x0
        for (let x = x0; x <= x1; x++, o++) if (_mk[o] !== 0) dryMk[o] = 1
      }
    }
    for (let yy = y0 - 1; yy <= y1 + 1; yy++) _mk.fill(0, yy * W + x0 - 1, yy * W + x1 + 2)
  }

  // ── the cockpit view
  //
  // The world is drawn on a larger square sheet and then turned, so the horizon tilts as the
  // jet banks. On top of that come the head-up display, the canopy frame and the instruments.

  /** turn the square sheet by the camera's roll into the frame */
  function turnSheet() {
    const c = Math.cos(vRoll)
    const s = Math.sin(vRoll)
    const half = sheetSide >> 1
    const cx = W >> 1
    const _fb = fb
    const _sh = sheet
    const side = sheetSide
    for (let y = 0; y < H; y++) {
      const dy = y - pivotY
      let sx = half - c * cx - s * dy + 0.5
      let sy = half - s * cx + c * dy + 0.5
      let o = y * W
      for (let x = 0; x < W; x++, o++, sx += c, sy += s) _fb[o] = _sh[(sy | 0) * side + (sx | 0)]
    }
  }

  // the cockpit's fixed metalwork is painted once per size and colour scheme
  function cockpitArt() {
    if (!cockpit || cockpit.W !== W || cockpit.H !== H) {
      const body = []
      const hot = []
      for (let t = 0; t < 9; t++) body.push(jetPal[1 + t])
      for (let t = 0; t < 6; t++) hot.push(jetPal[17 + t])
      cockpit = buildCockpit(W, H, { body, hot })
    }
    return cockpit
  }
  const radarLand = (right, ahead) => {
    const sn = Math.sin(lead.yaw)
    const cs = Math.cos(lead.yaw)
    const m = matMap[((((lead.y + right * sn - ahead * cs) | 0) & NM) << NSHIFT) | (((lead.x + right * cs + ahead * sn) | 0) & NM)]
    return m >= 12 ? 3 : m >= 4 ? 2 : m >= 2 ? 1 : 0
  }
  const blips = []
  function drawCockpitView() {
    // the panel and the hoop slide into place over the later part of the move
    const inPlace = cockpitIn()
    if (inPlace <= 0) return
    const h = clamp((vK - 0.72) / 0.28, 0, 1)
    const sn = Math.sin(lead.yaw)
    const cs = Math.cos(lead.yaw)
    blips.length = 0
    // where the sun is from the seat: to one side or the other, ahead or behind
    const tod = p.timeOfDay
    const sl = Math.sqrt(sunX * sunX + sunY * sunY) || 1
    const sunFront = (-sunX * sn + sunY * cs) / sl
    const sunSide = (-sunX * cs - sunY * sn) / sl
    drawCockpit(fb, cockpitArt(), {
      time,
      inPlace,
      hud: h * h * (3 - 2 * h),
      roll: vRoll,
      pitch: lead.pitch,
      heading: lead.yaw,
      speed: speedNow,
      speedMax: p.speed * clamp(p.boost, 1, 4) * 1.08,
      alt: lead.z,
      altMax: Math.max(p.altitude, clamp(p.ceiling, 20, 900)),
      climb: clamp(climbTilt / 0.5, -1, 1),
      turn: clamp(lead.yawRate / Math.max(0.1, p.agility), -1, 1),
      boost,
      pivotY,
      horizonY: vCy,
      focal: vS / vQ,
      // the head sways with the flying, and shudders while the thrusters are open
      headX,
      headY: headY + (boost > 0.2 ? ((((time * 30) | 0) & 1) - 0.5) * 1.5 * boost : 0),
      // light pours over the pilot's shoulder with the sun behind; the hood shades the panel with it ahead
      sunSide,
      sunReach: 0.72 - 0.28 * sunFront,
      sunColor: tod === 'sunset' ? SUN_SUNSET : tod === 'night' ? SUN_NIGHT : SUN_DAY,
      sunPower: tod === 'sunset' ? 1.1 : tod === 'night' ? 0.45 : 1,
      land: radarLand,
      blips,
      jet: jetModel.top,
    })
  }

  function render() {
    if (W === 0) return bytes
    updateView()
    if (shakeAmt > 0.25) {
      vCx += Math.round((Math.random() - 0.5) * 2 * shakeAmt)
      vCy += Math.round((Math.random() - 0.5) * 2 * shakeAmt)
    }
    animatePalettes()
    frameH = H
    flameOut.count = 0
    // in the cockpit the view rolls with the jet, so the world goes onto the square sheet first
    const rolled = vK > 0 || vRoll !== 0
    const w0 = W
    const h0 = H
    const f0 = fb
    const c0 = colY
    const m0 = jetMask
    const z0 = zbuf
    const b0 = backdrop
    const y0 = vCy
    if (rolled) {
      W = sheetSide
      H = sheetSide
      fb = sheet
      colY = sheetColY
      jetMask = sheetMask
      zbuf = sheetZ
      backdrop = sheetBackdrop
      const half = sheetSide >> 1
      vCx = half
      vCy = half + (y0 - pivotY)
      // only the part of the sheet the turned frame can see is drawn
      const c = Math.abs(Math.cos(vRoll))
      const s = Math.abs(Math.sin(vRoll))
      colLo = Math.max(0, half - Math.ceil(c * (w0 / 2) + s * Math.max(pivotY, h0 - pivotY)) - 2)
      colHi = Math.min(sheetSide, half + Math.ceil(c * (w0 / 2) + s * Math.max(pivotY, h0 - pivotY)) + 2)
      rowLo = Math.max(0, half - Math.ceil(c * pivotY + s * (w0 / 2)) - 2)
      rowHi = Math.min(sheetSide, half + Math.ceil(c * (h0 - pivotY) + s * (w0 / 2)) + 2)
    } else {
      colLo = 0
      colHi = W
      rowLo = 0
      rowHi = H
    }
    drawWorld()
    drawSky()
    drawTrails()
    drawSmoke()
    // far jets first
    const order = []
    for (const j of actors) {
      if (!j.visible) continue
      const ddx = wd(j.x - cam.x)
      const ddy = wd(j.y - cam.y)
      if (Math.abs(ddx) + Math.abs(ddy) > (j.reach || 2600)) continue
      order.push({ j, d: ddx * vSin + ddy * vCos })
    }
    order.sort((a, b) => a.d - b.d)
    for (const e of order) drawActor(e.j)
    drawParticles()
    drawLines()
    drawMarkers()
    if (!rolled) applyPost()
    if (rolled) {
      W = w0
      H = h0
      fb = f0
      colY = c0
      jetMask = m0
      zbuf = z0
      backdrop = b0
      vCx = W >> 1
      vCy = y0
      turnSheet()
      // the smooth flames were placed on the sheet: turn them with it
      const half = sheetSide >> 1
      const rc = Math.cos(vRoll)
      const rs = Math.sin(vRoll)
      for (let i = 0; i < flameOut.count; i++) {
        for (let n = 0; n < 3; n++) {
          const o = i * FLAME_F + n * 2
          const dx = flameData[o] - half
          const dy = flameData[o + 1] - half
          flameData[o] = (W >> 1) + rc * dx + rs * dy
          flameData[o + 1] = pivotY - rs * dx + rc * dy
        }
      }
      drawCockpitView()
    }
    return bytes
  }

  // ── effects
  /**
   * Throws out particles: { kind (a colour set), x, y, z, n, mode: 'chip' | 'smoke' | 'spark' | 'float',
   * speed, up, life, size, grav, r (how far from the point they start), dir + cone (aim them) }
   */
  function burst(o) {
    const cols = ptPal[o.kind] || ptPal.dust
    const n = o.n || 8
    const mode = o.mode === 'smoke' ? 1 : o.mode === 'spark' ? 2 : o.mode === 'float' ? 3 : 0
    const speed = o.speed === undefined ? 22 : o.speed
    const up = o.up === undefined ? 34 : o.up
    const life = o.life || 0.7
    const r = o.r === undefined ? 2 : o.r
    for (let i = 0; i < n; i++) {
      const k = ptHead * PF
      const a = o.dir === undefined ? Math.random() * Math.PI * 2 : o.dir + (Math.random() - 0.5) * (o.cone === undefined ? 1.2 : o.cone)
      const sp = speed * (0.35 + Math.random() * 0.9)
      pt[k] = o.x + (Math.random() - 0.5) * 2 * r
      pt[k + 1] = o.y + (Math.random() - 0.5) * 2 * r
      pt[k + 2] = o.z + Math.random() * (o.h || 0)
      pt[k + 3] = Math.sin(a) * sp
      pt[k + 4] = -Math.cos(a) * sp
      pt[k + 5] = up * (0.5 + Math.random() * 0.8)
      pt[k + 6] = pt[k + 7] = life * (0.6 + Math.random() * 0.7)
      pt[k + 8] = o.size || 1
      pt[k + 9] = o.grav === undefined ? (mode === 0 ? 150 : mode === 2 ? 60 : 0) : o.grav
      ptCol[ptHead] = cols[(Math.random() * cols.length) | 0]
      ptMode[ptHead] = mode
      ptHead = (ptHead + 1) % NP
    }
    ptLive = NP
  }
  function shake(amount) {
    if (amount > shakeAmt) shakeAmt = Math.min(7, amount)
  }
  function stepFx(dt) {
    shakeAmt *= Math.exp(-dt * 11)
    if (ptLive === 0) return
    let live = 0
    for (let i = 0; i < NP; i++) {
      const k = i * PF
      if (pt[k + 6] <= 0) continue
      pt[k + 6] -= dt
      live++
      const mode = ptMode[i]
      pt[k] += pt[k + 3] * dt
      pt[k + 1] += pt[k + 4] * dt
      pt[k + 2] += pt[k + 5] * dt
      pt[k + 5] -= pt[k + 9] * dt
      if (mode === 1 || mode === 3) {
        const drag = Math.exp(-dt * 1.6)
        pt[k + 3] *= drag
        pt[k + 4] *= drag
      } else if (mode === 0 && pt[k + 5] < 0) {
        const g = heightMap[cell(pt[k], pt[k + 1])]
        if (pt[k + 2] < g) {
          pt[k + 2] = g
          pt[k + 5] *= -0.35
          pt[k + 3] *= 0.5
          pt[k + 4] *= 0.5
        }
      }
    }
    ptLive = live
  }
  function drawParticles() {
    if (ptLive === 0) return
    const _fb = fb
    const _zb = zbuf
    for (let i = 0; i < NP; i++) {
      const k = i * PF
      if (pt[k + 6] <= 0) continue
      if (!project(pt[k], pt[k + 1], pt[k + 2])) continue
      const age = 1 - pt[k + 6] / pt[k + 7]
      const mode = ptMode[i]
      let size = pt[k + 8] * prM * (mode === 1 ? 1 + age * 2.2 : 1)
      const s = size < 1.5 ? 1 : size < 2.5 ? 2 : size < 3.5 ? 3 : 4
      const x0 = Math.round(prX - s / 2)
      const y0 = Math.round(prY - s / 2)
      const thin = mode === 1 ? age * 15 : mode === 3 ? (age - 0.5) * 30 : (age - 0.75) * 60 // thins out as it ages
      for (let yy = 0; yy < s; yy++) {
        const y = y0 + yy
        if (y < 0 || y >= H) continue
        for (let xx = 0; xx < s; xx++) {
          const x = x0 + xx
          if (x < 0 || x >= W) continue
          const at = y * W + x
          if (_zb[at] < prV - 2) continue
          if (thin > 0 && BAYER[((y & 3) << 2) | (x & 3)] < thin) continue
          _fb[at] = ptCol[i]
        }
      }
    }
  }
  /** what is laid over the frame: darkness round a light (a mine), and a wash of colour (under water) */
  function setPost(o) {
    Object.assign(post, o)
  }
  function applyPost() {
    const _fb = fb
    if (post.dark > 0.01) {
      let cx = W / 2
      let cy = H / 2
      let m = vS
      if (project(post.x, post.y, post.z)) {
        cx = prX
        cy = prY
        m = prM
      }
      const r0 = post.r0 * m
      const r1 = post.r1 * m
      const low = Math.round((1 - post.dark) * 4) // how bright the dark is, in quarters
      const flick = 1 + Math.sin(time * 13) * 0.02 + Math.sin(time * 7.3) * 0.02
      for (let y = 0; y < H; y++) {
        const dy = y - cy
        let o = y * W
        for (let x = 0; x < W; x++, o++) {
          const dx = x - cx
          const d = Math.sqrt(dx * dx + dy * dy) * flick
          let q = 4
          if (d > r0) {
            const f = d >= r1 ? 0 : 1 - (d - r0) / (r1 - r0)
            q = Math.floor(low + f * (4 - low) + BAYER[((y & 3) << 2) | (x & 3)] / 16)
            if (q > 4) q = 4
          }
          if (q === 4) continue
          const c = _fb[o]
          _fb[o] = q === 3 ? (c - ((c >>> 2) & 0x3f3f3f)) | 0xff000000
            : q === 2 ? ((c >>> 1) & 0x7f7f7f) | 0xff000000
            : q === 1 ? ((c >>> 2) & 0x3f3f3f) | 0xff000000
            : 0xff000000
        }
      }
    }
    if (post.tint > 0.01) {
      const k = Math.round(clamp(post.tint, 0, 1) * 256)
      const tr = post.tr * k
      const tg = post.tg * k
      const tb = post.tb * k
      const ik = 256 - k
      for (let o = 0; o < W * H; o++) {
        const c = _fb[o]
        const r = ((c & 255) * ik + tr) >> 8
        const g = (((c >> 8) & 255) * ik + tg) >> 8
        const b = (((c >> 16) & 255) * ik + tb) >> 8
        _fb[o] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
      }
    }
    if (post.fog > 0.01) {
      // fog: the whole picture washed towards the haze, more in slow drifting bands
      const hr = hazeCol & 255, hg = (hazeCol >> 8) & 255, hb = (hazeCol >> 16) & 255
      for (let y = 0; y < H; y++) {
        const band = 0.55 + 0.45 * Math.sin(y * 0.045 + time * 0.25) * Math.sin(y * 0.013 - time * 0.11)
        const k = Math.round(clamp(post.fog * (0.26 + 0.2 * band), 0, 0.7) * 256)
        if (k <= 0) continue
        const ik = 256 - k
        let o = y * W
        for (let x = 0; x < W; x++, o++) {
          const c = _fb[o]
          _fb[o] = (0xff000000 | ((((c >> 16) & 255) * ik + hb * k) >> 8 << 16) | ((((c >> 8) & 255) * ik + hg * k) >> 8 << 8) | (((c & 255) * ik + hr * k) >> 8)) >>> 0
        }
      }
    }
    if (post.snow > 0.01) {
      // snow: soft flakes drifting down and sideways, some near (bigger) and most far
      const n = Math.round(W * H * 0.0016 * post.snow)
      const white = pack(248, 250, 255)
      for (let i = 0; i < n; i++) {
        const h1 = (Math.imul(i + 3, 2654435761) >>> 0) / 4294967296
        const h2 = (Math.imul(i + 11, 2246822519) >>> 0) / 4294967296
        const near = h2 > 0.8
        const sp = near ? 0.32 : 0.14 + h1 * 0.08
        const y = Math.floor((h2 * H * 4 + time * H * sp) % (H + 4)) - 2
        const x = Math.floor((((h1 * W + Math.sin(time * (0.6 + h2) + i) * (near ? 9 : 4) + time * W * 0.03 * post.wind) % W) + W) % W)
        const sz = near ? 2 : 1
        for (let dy = 0; dy < sz; dy++) {
          for (let dx = 0; dx < sz; dx++) {
            const xx = x + dx, yy = y + dy
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
            const o = yy * W + xx
            if (isDry(o, xx)) continue
            const c = _fb[o]
            _fb[o] = near ? white : (0xff000000 | (((((c >> 16) & 255) + 2 * ((white >> 16) & 255)) / 3 | 0) << 16) | (((((c >> 8) & 255) + 2 * ((white >> 8) & 255)) / 3 | 0) << 8) | ((((c & 255) + 2 * (white & 255)) / 3) | 0)) >>> 0
          }
        }
      }
    }
    if (post.flash > 0.01) {
      // lightning: the picture goes white for a moment
      const k = Math.round(clamp(post.flash, 0, 1) * 200)
      const ik = 256 - k
      for (let o = 0; o < W * H; o++) {
        const c = _fb[o]
        _fb[o] = (0xff000000 | ((((c >> 16) & 255) * ik + 255 * k) >> 8 << 16) | ((((c >> 8) & 255) * ik + 250 * k) >> 8 << 8) | (((c & 255) * ik + 245 * k) >> 8)) >>> 0
      }
    }
    if (post.rain > 0.01) {
      // rain: short slanting streaks across the picture, falling; each streak a fixed lane, so it reads as rain and not noise
      const n = Math.round(W * H * 0.003 * post.rain)
      const col = pack(200, 216, 236)
      const len = Math.max(4, Math.round(H / 45))
      for (let i = 0; i < n; i++) {
        const h1 = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296
        const h2 = (Math.imul(i + 7, 2246822519) >>> 0) / 4294967296
        const sp = 0.8 + h2 * 0.6
        const y0 = Math.floor(((h2 * H * 3 + time * H * 1.6 * sp) % (H + len)) - len)
        const x0 = Math.floor(h1 * (W + H * 0.3) - y0 * 0.3)
        for (let j = 0; j < len; j++) {
          const y = y0 + j
          const x = x0 - Math.round(j * 0.3)
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          const o = y * W + x
          if (isDry(o, x)) continue
          const c = _fb[o]
          // half over what is there
          _fb[o] = (0xff000000 | ((((c >> 16) & 255) + ((col >> 16) & 255)) >> 1 << 16) | ((((c >> 8) & 255) + ((col >> 8) & 255)) >> 1 << 8) | (((c & 255) + (col & 255)) >> 1)) >>> 0
        }
      }
    }
  }
  /**
   * A model made from a stamp (a tree, a rock): a column of voxels per cell. It lets a thing that
   * is part of the ground come loose and move — a felled tree tipping over.
   */
  function stampModel(st) {
    let top = 1
    for (let c = 0; c < st.rise.length; c++) if (st.mats[c] !== 255 && st.rise[c] > top) top = st.rise[c]
    const slices = []
    for (let y = 0; y < top; y++) slices.push(new Uint8Array(st.w * st.h))
    const seen = []
    const colors = {}
    for (let c = 0; c < st.rise.length; c++) {
      const mat = st.mats[c]
      if (mat === 255 || st.rise[c] === 0) continue
      let mi = seen.indexOf(mat)
      if (mi < 0) {
        if (seen.length >= 46) continue
        mi = seen.length
        seen.push(mat)
        colors[1 + mi * 2] = MAT_TOP[mat]
        colors[2 + mi * 2] = MAT_SIDE[mat]
      }
      for (let y = 0; y < st.rise[c]; y++) slices[y][c] = y === st.rise[c] - 1 ? 1 + mi * 2 : 2 + mi * 2
    }
    const m = prepareModel({ name: st.name, W: st.w, L: st.h, H: top, pivK: (st.h - 1) / 2, pivY: 0, slices, colors, tip: { a: 0, k: 0, y: 0 } })
    paintModel(m, palTod, palAmt)
    return m
  }

  // a floating marker over each destination: a little diamond on a dotted line
  function drawLines() {
    const _fb = fb
    for (const l of lines) {
      let px = 0
      let py = 0
      let have = false
      const n = 20
      for (let i = 0; i <= n; i++) {
        const t = i / n
        // a line slack between its ends hangs in a curve
        const z = l.az + (l.bz - l.az) * t - (l.sag || 0) * 4 * t * (1 - t)
        if (!project(l.ax + wd(l.bx - l.ax) * t, l.ay + wd(l.by - l.ay) * t, z)) {
          have = false
          continue
        }
        const x = prX
        const y = prY
        if (have) {
          const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x - px), Math.abs(y - py))))
          for (let k = 0; k <= steps; k++) {
            const xx = Math.round(px + ((x - px) * k) / steps)
            const yy = Math.round(py + ((y - py) * k) / steps)
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) _fb[yy * W + xx] = l.col
          }
        }
        px = x
        py = y
        have = true
      }
    }
  }
  function drawMarkers() {
    const _fb = fb
    for (const m of markers) {
      if (!m.on) continue
      if (!project(m.x, m.y, m.z + 12 + Math.sin(time * 3) * 1.5)) continue
      const cx = Math.round(prX)
      const cy = Math.round(prY)
      const r = 4
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.abs(dx) + Math.abs(dy)
          if (d > r) continue
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          _fb[y * W + x] = d === r ? outlineCol : dy < 0 ? markLit : markCol
        }
      }
      if (!project(m.x, m.y, m.z)) continue
      const gy = Math.round(prY)
      for (let y = cy + r + 2; y < gy; y += 2) {
        if (cx >= 0 && cx < W && y >= 0 && y < H) _fb[y * W + cx] = markCol
      }
    }
  }

  // things that change colour by themselves: a turning propeller, a glowing furnace
  function animatePalettes() {
    for (const name in models) {
      const m = models[name]
      if (!m.spin || !m.spinBase) continue
      const on = m.spinning ? ((time * 22) | 0) % m.spin.length : 0
      for (let i = 0; i < m.spin.length; i++) {
        const idx = m.spin[i]
        const show = i === on
        m.pal[idx] = show ? m.spinBase[i][0] : 0
        m.palLit[idx] = show ? m.spinBase[i][1] : 0
        m.palDim[idx] = show ? m.spinBase[i][2] : 0
      }
    }
    for (const name in models) {
      const m = models[name]
      if (!m.glow) continue
      for (let i = 0; i < m.glow.length; i++) {
        const on = Math.sin(time * (9 + i * 2.3) + i * 1.7) * Math.sin(time * (5.3 + i)) > 0.1
        const c = on ? m.glowAlt[i] : m.glowBase[i]
        const idx = m.glow[i].idx
        m.pal[idx] = m.palLit[idx] = m.palDim[idx] = c
      }
    }
    topLit[MAT.ember] = Math.sin(time * 9) * Math.sin(time * 5.3) > 0.2 ? emberB : emberA
  }

  /** the ground under a pixel of the frame (after a render), or null for sky */
  function pick(sx, sy) {
    const x = Math.floor(sx)
    const y = Math.floor(sy)
    if (x < 0 || y < 0 || x >= W || y >= H || vK > 0) return null
    const v = zbuf[y * W + x]
    if (v > 1e8) return null
    const inv = (1 + vQ * v) / vS
    return {
      x: cam.x + (x - vCx) * vCos * inv - v * vSin,
      y: cam.y - (x - vCx) * vSin * inv - v * vCos,
    }
  }
  /** where a world point is in the frame: { x, y, scale }, or null when it is behind the camera */
  function projectPoint(x, y, z) {
    if (!project(x, y, z)) return null
    return { x: prX, y: prY, scale: prM }
  }

  return {
    setParams,
    resize,
    step,
    render,
    // flying
    pointerMove,
    pointerLeave,
    setAnchor: (on) => { anchored = !!on },
    press,
    release,
    setKeys,
    startRoll,
    toggleView,
    setView(v) { viewTarget = viewIndex(v) },
    /** on an island: the tilted view with depth (true) or the plain overhead one (false) */
    setIslandView(tilted) { islandTilt = tilted ? 1 : 0 },
    get islandTilted() { return islandTilt === 1 },
    /** which way the camera looks (0 = north up), for turning key presses into directions */
    get viewYaw() { return vYaw },
    models,
    runPath,
    pathOverWater,
    // the world and what is in it
    world,
    /** everything drawn as a sprite stack (for tools: the film rig clears a patch of sea with it) */
    get actors() { return actors },
    addActor,
    removeActor,
    setLead,
    setMode,
    setCamera,
    markers,
    lines,
    pick,
    projectPoint,
    /** a model made at run time (a vehicle in its own paint): prepared, coloured for the light, and kept under its name */
    registerModel(def) {
      const m = prepareModel(def)
      paintModel(m, palTod, palAmt)
      models[def.name] = m
      return m
    },
    /** a model in another light: every colour mixed towards `rgb` by `k` (a see-through copy for placing). Returns its name. */
    /** paint colours straight into a model's palette (each [index, r, g, b]): every face the same, unlit (a window's view) */
    paintColors(name, list) {
      const m = models[name]
      if (!m) return
      for (const [idx, r, g, b] of list) m.pal[idx] = m.palLit[idx] = m.palDim[idx] = pack(r, g, b)
    },
    tinted(name, rgb, k) {
      const key = `${name}~${rgb.join(',')}`
      if (models[key]) return key
      const src = models[name]
      if (!src) return name
      const colors = {}
      for (const c in src.colors) {
        const o = src.colors[c]
        colors[c] = [o[0] + (rgb[0] - o[0]) * k, o[1] + (rgb[1] - o[1]) * k, o[2] + (rgb[2] - o[2]) * k]
      }
      const m = prepareModel({ name: key, W: src.W, L: src.L, H: src.H, pivK: src.pivK, pivY: src.pivY, slices: src.slices, colors, tip: src.tip, shell: src.shell })
      paintModel(m, palTod, palAmt)
      models[key] = m
      return key
    },
    /** a different world (the island was re-rolled or upgraded): the land is made again, and everything that stood on it is gone */
    setWorld(def) {
      worldDef = def
      actors.length = 0
      lead = null
      markers.length = 0
      lines.length = 0
      ptLive = 0
      pt.fill(0)
      buildWorld()
    },
    burst,
    shake,
    setPost,
    stampModel,
    /** replays the prototype's intro on an actor: its slices drop in one after another */
    stackUp(a) { a.introT = 0 },
    get mode() { return mode },
    get lead() { return lead },
    get time() { return time },
    get speed() { return speedNow },
    get boost() { return boost },
    get scripted() { return !!script },
    get zoom() { return zoomNow },
    get heading() { return vYaw },
    get width() { return W },
    get height() { return H },
    /** the smooth flames to lay over this frame (none while the flames are drawn in pixels) */
    get flames() { return flameOut },
    /** the view the camera is in, or heading for */
    get view() { return viewTarget === 2 ? 'cockpit' : viewTarget === 1 ? 'chase' : 'top' },
  }
}
