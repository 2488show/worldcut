// More for the house (round 11): tables and seats of every kind, cabinets, lamps, rugs, things
// to hang on the walls and things to set on a tabletop, the aquarium and the trophy fish, and the
// windows. Each piece faces south (+k), its back (k = 0) to the wall; wall pieces are a voxel or
// two deep, hung at their height by the house.

import type { ModelDef } from './models'
import { V } from './props'

type RGB = [number, number, number]
const WOOD: RGB = [176, 128, 82], WOOD_D: RGB = [128, 88, 56], WOOD_L: RGB = [212, 168, 116]
const shell = { shell: true }

function tableModel(name: string, W: number, L: number, H: number, round = false): ModelDef {
  const v = new V(W, L, H)
  const w = v.c(...WOOD_L), wd = v.c(...WOOD_D), edge = v.c(...WOOD)
  const ci = (W - 1) / 2, ck = (L - 1) / 2
  if (round) {
    v.box(Math.floor(ci), Math.floor(ck), 0, Math.ceil(ci), Math.ceil(ck), H - 2, wd)
    v.box(Math.floor(ci) - 2, Math.floor(ck) - 2, 0, Math.ceil(ci) + 2, Math.ceil(ck) + 2, 0, wd)
    for (let i = 0; i < W; i++) for (let k = 0; k < L; k++) {
      const d = Math.hypot((i - ci) / (W / 2), (k - ck) / (L / 2))
      if (d <= 1) v.set(i, k, H - 1, d > 0.82 ? edge : w)
    }
  } else {
    for (const [i, k] of [[0, 0], [W - 1, 0], [0, L - 1], [W - 1, L - 1]]) v.box(i, k, 0, i, k, H - 2, wd)
    v.box(0, 0, H - 1, W - 1, L - 1, H - 1, w)
    v.box(0, L - 1, H - 2, W - 1, L - 1, H - 2, edge)
  }
  return v.def(name, shell)
}
function nightstand(): ModelDef {
  const v = new V(7, 6, 7)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), knob = v.c(230, 200, 120)
  v.box(0, 0, 0, 6, 5, 6, w)
  v.box(1, 5, 1, 5, 5, 2, wd); v.box(1, 5, 4, 5, 5, 5, wd)
  v.set(3, 5, 2, knob); v.set(3, 5, 5, knob)
  return v.def('i_nightstand', shell)
}
function armchair(): ModelDef {
  const v = new V(9, 9, 10)
  const c = v.c(110, 150, 120), cd = v.c(80, 116, 92), cl = v.c(150, 190, 156), leg = v.c(...WOOD_D)
  for (const [i, k] of [[1, 1], [7, 1], [1, 7], [7, 7]]) v.set(i, k, 0, leg)
  v.box(0, 0, 1, 8, 8, 3, cd)
  v.box(2, 2, 4, 6, 8, 4, cl)
  v.box(0, 0, 4, 8, 2, 9, c)
  v.box(0, 0, 4, 1, 8, 6, cd); v.box(7, 0, 4, 8, 8, 6, cd)
  return v.def('i_armchair', shell)
}
function stool(): ModelDef {
  const v = new V(5, 5, 5)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D)
  for (const [i, k] of [[0, 0], [4, 0], [0, 4], [4, 4]]) v.box(i, k, 0, i, k, 3, wd)
  v.cyl(2, 2, 4, 4, 2.6, w)
  return v.def('i_stool', shell)
}
function rocker(): ModelDef {
  const v = new V(8, 11, 11)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), cush = v.c(230, 190, 110)
  for (const i of [0, 7]) for (let k = 0; k < 11; k++) v.set(i, k, k === 0 || k === 10 ? 1 : 0, wd) // the rockers
  for (const i of [0, 7]) { v.box(i, 2, 1, i, 2, 4, wd); v.box(i, 8, 1, i, 8, 4, wd) }
  v.box(0, 2, 4, 7, 8, 4, w)
  v.box(1, 3, 5, 6, 8, 5, cush)
  v.box(0, 2, 5, 7, 2, 10, w)
  for (let i = 1; i <= 6; i += 2) v.box(i, 2, 6, i, 2, 9, wd)
  v.box(0, 2, 5, 0, 8, 7, wd); v.box(7, 2, 5, 7, 8, 7, wd)
  return v.def('i_rocker', shell)
}
function cushion(name: string, W: number, L: number, H: number, col: RGB, round = true): ModelDef {
  const v = new V(W, L, H)
  const c = v.c(...col), cd = v.c(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8), cl = v.c(Math.min(255, col[0] + 30), Math.min(255, col[1] + 30), Math.min(255, col[2] + 30))
  const ci = (W - 1) / 2, ck = (L - 1) / 2
  for (let y = 0; y < H; y++) for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) {
    const d = round ? Math.hypot((i - ci) / (W / 2), (k - ck) / (L / 2), (y - H * 0.35) / (H * 0.75)) : Math.max(Math.abs(i - ci) / (W / 2), Math.abs(k - ck) / (L / 2))
    if (d <= 1) v.set(i, k, y, y === H - 1 ? cl : y === 0 ? cd : c)
  }
  if (name === 'i_cushion') v.set(Math.round(ci), Math.round(ck), H - 1, cd) // the button
  return v.def(name, shell)
}
function bed2(): ModelDef {
  const v = new V(19, 19, 9)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), sheet = v.c(246, 242, 232), q = v.c(220, 120, 110), ql = v.c(244, 160, 140), pillow = v.c(255, 255, 250)
  v.box(0, 0, 0, 18, 18, 2, wd)
  v.box(0, 0, 3, 18, 1, 8, w); v.box(1, 0, 8, 17, 0, 8, wd)
  v.box(1, 2, 3, 17, 17, 3, sheet)
  v.box(2, 2, 4, 8, 4, 4, pillow); v.box(10, 2, 4, 16, 4, 4, pillow)
  for (let k = 7; k <= 17; k++) for (let i = 1; i <= 17; i++) v.set(i, k, 4, (i * 3 + k) % 7 === 0 ? ql : q)
  v.box(1, 7, 4, 17, 7, 4, sheet)
  v.box(0, 18, 3, 18, 18, 4, w)
  return v.def('i_bed2', shell)
}
function dresser(): ModelDef {
  const v = new V(12, 6, 10)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), wl = v.c(...WOOD_L), knob = v.c(230, 200, 120)
  v.box(0, 0, 0, 11, 5, 9, w)
  for (const y of [1, 4, 7]) { v.box(1, 5, y, 10, 5, y + 1, wl); v.set(3, 5, y + 1, knob); v.set(8, 5, y + 1, knob) }
  v.box(0, 0, 9, 11, 5, 9, wd)
  return v.def('i_dresser', shell)
}
function cupboard(): ModelDef {
  const v = new V(11, 6, 16)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), glass = v.c(190, 220, 230), plate = v.c(250, 250, 246), blue = v.c(90, 130, 200)
  v.box(0, 0, 0, 10, 5, 15, w)
  v.box(1, 5, 1, 9, 5, 6, wd)
  v.box(1, 5, 8, 9, 5, 14, glass)
  for (const i of [2, 4, 6, 8]) { v.set(i, 4, 9, plate); v.set(i, 4, 12, i % 4 ? blue : plate) }
  v.box(5, 5, 8, 5, 5, 14, wd)
  return v.def('i_cupboard', shell)
}
function shelf(): ModelDef {
  const v = new V(12, 3, 4)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), a = v.c(200, 80, 70), b = v.c(70, 120, 180), pot = v.c(196, 110, 70), g = v.c(80, 160, 90)
  v.box(0, 0, 0, 11, 2, 0, w)
  v.set(1, 0, -0 + 0, wd); v.set(10, 0, 0, wd)
  v.box(1, 1, 1, 1, 1, 3, a); v.box(2, 1, 1, 2, 1, 2, b); v.box(3, 1, 1, 3, 1, 3, a)
  v.set(8, 1, 1, pot); v.set(8, 1, 2, g); v.set(9, 1, 3, g); v.set(7, 1, 3, g)
  return v.def('i_shelf', shell)
}
function tableLamp(): ModelDef {
  const v = new V(4, 4, 6)
  const base = v.c(90, 86, 96), shade = v.c(250, 226, 160), shadeD = v.c(230, 196, 120)
  v.box(1, 1, 0, 2, 2, 0, base); v.box(1, 1, 1, 1, 1, 2, base)
  v.box(0, 0, 3, 3, 3, 5, shade); v.box(0, 0, 3, 3, 3, 3, shadeD)
  return v.def('i_tableLamp', { ...shell, lit: [{ idx: shade, rgb: [255, 236, 160] }, { idx: shadeD, rgb: [255, 214, 130] }] })
}
function wallLamp(): ModelDef {
  const v = new V(3, 2, 4)
  const brass = v.c(200, 160, 80), glow = v.c(250, 230, 170)
  v.box(1, 0, 0, 1, 0, 1, brass); v.set(1, 1, 1, brass)
  v.box(0, 1, 2, 2, 1, 3, glow)
  return v.def('i_wallLamp', { ...shell, lit: [{ idx: glow, rgb: [255, 230, 150] }], glow: [{ idx: glow, alt: [255, 214, 130] }] })
}
function lights(): ModelDef {
  const v = new V(16, 1, 3)
  const wire = v.c(60, 64, 70), a = v.c(255, 200, 90), b = v.c(255, 140, 120), c = v.c(140, 220, 255)
  for (let i = 0; i < 16; i++) v.set(i, 0, i % 5 === 0 || i % 5 === 4 ? 2 : 1, wire)
  for (const [i, col] of [[1, a], [4, b], [7, c], [10, a], [13, b]] as [number, number][]) v.set(i, 0, 0, col)
  return v.def('i_lights', { ...shell, lit: [{ idx: a, rgb: [255, 210, 110] }, { idx: b, rgb: [255, 160, 140] }, { idx: c, rgb: [160, 230, 255] }], glow: [{ idx: a, alt: [255, 170, 60] }, { idx: c, alt: [100, 200, 255] }] })
}
function candle(): ModelDef {
  const v = new V(2, 2, 4)
  const wax = v.c(250, 244, 226), f1 = v.c(255, 200, 80)
  v.box(0, 0, 0, 1, 1, 2, wax); v.set(0, 0, 3, f1)
  return v.def('i_candle', { ...shell, lit: [{ idx: f1, rgb: [255, 210, 100] }], glow: [{ idx: f1, alt: [255, 150, 50] }] })
}
function roundRug(): ModelDef {
  const v = new V(15, 15, 1)
  const a = v.c(110, 150, 200), b = v.c(240, 230, 210), c = v.c(220, 130, 110)
  for (let i = 0; i < 15; i++) for (let k = 0; k < 15; k++) {
    const d = Math.hypot(i - 7, k - 7)
    if (d <= 7.4) v.set(i, k, 0, d > 6.3 ? b : d > 4.6 ? a : d > 3.6 ? c : a)
  }
  return v.def('i_roundRug', { shell: false })
}
function runner(): ModelDef {
  const v = new V(8, 22, 1)
  const a = v.c(150, 90, 70), b = v.c(236, 210, 150)
  for (let i = 0; i < 8; i++) for (let k = 0; k < 22; k++) v.set(i, k, 0, i === 0 || i === 7 || (k + i) % 6 === 0 ? b : a)
  return v.def('i_runner', { shell: false })
}
/** a framed picture: `paint` fills the inside (i across, y up) */
function picture(name: string, W: number, H: number, paint: (v: V, i: number, y: number) => number): ModelDef {
  const v = new V(W, 1, H)
  const frame = v.c(150, 104, 60)
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) v.set(i, 0, y, i === 0 || y === 0 || i === W - 1 || y === H - 1 ? frame : paint(v, i, y))
  return v.def(name, shell)
}
function clock(): ModelDef {
  const v = new V(6, 1, 6)
  const rim = v.c(150, 104, 60), face = v.c(250, 246, 232), hand = v.c(40, 40, 50)
  for (let y = 0; y < 6; y++) for (let i = 0; i < 6; i++) {
    const d = Math.hypot(i - 2.5, y - 2.5)
    if (d <= 3) v.set(i, 0, y, d > 2.2 ? rim : face)
  }
  v.set(2, 0, 3, hand); v.set(2, 0, 4, hand); v.set(3, 0, 3, hand)
  return v.def('i_clock', shell)
}
function curtains(): ModelDef {
  const v = new V(20, 2, 14)
  const rod = v.c(150, 104, 60), a = v.c(236, 200, 150), b = v.c(214, 176, 126), tie = v.c(200, 90, 80)
  v.box(0, 1, 13, 19, 1, 13, rod)
  for (const [i0, i1] of [[0, 4], [15, 19]]) for (let y = 0; y <= 12; y++) for (let i = i0; i <= i1; i++) v.set(i, 1, y, (i + (y >> 1)) % 2 ? a : b)
  v.box(0, 1, 5, 4, 1, 5, tie); v.box(15, 1, 5, 19, 1, 5, tie)
  return v.def('i_curtains', shell)
}
function mirror(): ModelDef {
  const v = new V(6, 1, 10)
  const frame = v.c(200, 160, 80), glass = v.c(196, 222, 236), glint = v.c(240, 250, 255)
  for (let y = 0; y < 10; y++) for (let i = 0; i < 6; i++) v.set(i, 0, y, i === 0 || i === 5 || y === 0 || y === 9 ? frame : (i + y) % 5 === 0 ? glint : glass)
  return v.def('i_mirror', shell)
}
function bigPlant(): ModelDef {
  const v = new V(9, 9, 18)
  const pot = v.c(230, 226, 214), potD = v.c(190, 186, 176), g = v.c(60, 140, 76), gl = v.c(110, 190, 100), stem = v.c(90, 110, 60)
  v.cyl(4, 4, 0, 4, 3, pot); v.cyl(4, 4, 0, 0, 2.6, potD)
  v.box(4, 4, 5, 4, 4, 9, stem)
  v.blob(4, 4, 13, 4, 4, 5, (i, k, y) => ((i * 2 + k + y) % 4 === 0 ? gl : g), 0.35)
  return v.def('i_bigPlant', shell)
}
function cactus(): ModelDef {
  const v = new V(3, 3, 5)
  const pot = v.c(196, 110, 70), g = v.c(80, 150, 80), f = v.c(250, 140, 170)
  v.box(0, 0, 0, 2, 2, 1, pot)
  v.box(1, 1, 2, 1, 1, 4, g); v.set(0, 1, 3, g); v.set(1, 1, 4, f)
  return v.def('i_cactus', shell)
}
function hanging(): ModelDef {
  const v = new V(5, 4, 7)
  const pot = v.c(196, 110, 70), rope = v.c(200, 180, 140), g = v.c(70, 150, 80), gl = v.c(130, 200, 110)
  v.set(2, 0, 6, rope); v.set(2, 1, 5, rope)
  v.box(1, 1, 3, 3, 3, 4, pot)
  for (const [i, k, y] of [[0, 2, 2], [4, 2, 2], [0, 3, 1], [4, 3, 0], [2, 3, 1], [1, 3, 0], [3, 2, 5], [1, 2, 5]]) v.set(i, k, y, (i + y) % 2 ? gl : g)
  return v.def('i_hanging', shell)
}
function vase(): ModelDef {
  const v = new V(3, 3, 6)
  const c = v.c(90, 140, 200), f1 = v.c(250, 120, 120), f2 = v.c(250, 220, 110), g = v.c(80, 160, 90)
  v.box(0, 0, 0, 2, 2, 2, c); v.set(1, 1, 3, c)
  v.set(1, 1, 4, g); v.set(0, 1, 5, f1); v.set(2, 1, 5, f2); v.set(1, 0, 5, f1)
  return v.def('i_vase', shell)
}
function bookStack(): ModelDef {
  const v = new V(4, 3, 3)
  const a = v.c(200, 80, 70), b = v.c(70, 120, 180), c = v.c(230, 190, 90)
  v.box(0, 0, 0, 3, 2, 0, a); v.box(0, 0, 1, 3, 2, 1, b); v.box(1, 0, 2, 3, 2, 2, c)
  return v.def('i_bookStack', shell)
}
function tea(): ModelDef {
  const v = new V(6, 4, 3)
  const pot = v.c(250, 250, 246), blue = v.c(90, 130, 200), tray = v.c(...WOOD)
  v.box(0, 0, 0, 5, 3, 0, tray)
  v.box(1, 1, 1, 2, 2, 2, pot); v.set(0, 1, 2, blue); v.set(1, 1, 2, blue)
  v.set(4, 1, 1, pot); v.set(4, 2, 1, pot)
  return v.def('i_tea', shell)
}
function fishbowl(): ModelDef {
  const v = new V(5, 5, 5)
  const glass = v.c(196, 226, 240), water = v.c(120, 180, 220), fish = v.c(255, 140, 60)
  for (let y = 0; y < 5; y++) for (let k = 0; k < 5; k++) for (let i = 0; i < 5; i++) {
    const d = Math.hypot(i - 2, k - 2, (y - 2) * 1.1)
    if (d <= 2.5) v.set(i, k, y, d > 1.8 || y === 4 ? glass : water)
  }
  v.set(2, 3, 2, fish); v.set(1, 3, 2, fish)
  return v.def('i_fishbowl', { ...shell, glow: [{ idx: fish, alt: [255, 180, 90] }] })
}
function globe(): ModelDef {
  const v = new V(4, 4, 6)
  const base = v.c(...WOOD_D), sea = v.c(80, 150, 210), land = v.c(110, 180, 90)
  v.box(1, 1, 0, 2, 2, 0, base); v.box(1, 1, 1, 1, 1, 1, base)
  v.blob(1.5, 1.5, 3.6, 1.9, 1.9, 1.9, (i, k, y) => ((i + k * 2 + y) % 3 === 0 ? land : sea))
  return v.def('i_globe', shell)
}
/** the aquarium: the fish in it are the kinds the player has caught (up to four), passed in */
export function aquariumModel(fish: RGB[]): ModelDef {
  const v = new V(15, 6, 12)
  const w = v.c(...WOOD_D), glass = v.c(196, 226, 240), water = v.c(90, 160, 210), waterD = v.c(70, 130, 190), sand = v.c(230, 210, 160), weed = v.c(70, 160, 90), bubble = v.c(230, 246, 255)
  v.box(0, 0, 0, 14, 5, 3, w)
  v.box(0, 0, 4, 14, 5, 11, glass)
  v.box(1, 1, 4, 13, 4, 10, water)
  v.box(1, 1, 4, 13, 4, 4, sand)
  for (let y = 5; y <= 9; y++) v.set(2, 2, y, weed)
  for (let y = 5; y <= 7; y++) v.set(11, 2, y, weed)
  for (let i = 1; i <= 13; i++) v.set(i, 1, 10, waterD)
  v.set(9, 3, 9, bubble); v.set(10, 3, 7, bubble)
  const spots: [number, number][] = [[5, 7], [9, 6], [7, 9], [4, 5]]
  fish.slice(0, 4).forEach((c, n) => {
    const f = v.c(...c)
    const [i, y] = spots[n]
    v.set(i, 4, y, f); v.set(i + 1, 4, y, f); v.set(i - 1, 4, y, f)
    v.set(i + 1, 4, y + 1, f)
  })
  v.box(0, 0, 11, 14, 5, 11, w)
  return v.def('i_aquarium', { ...shell, lit: [{ idx: water, rgb: [100, 180, 230] }] })
}
/** the trophy fish on its board */
export function plaqueModel(fish: RGB): ModelDef {
  const v = new V(10, 2, 6)
  const board = v.c(150, 104, 60), boardD = v.c(120, 80, 48), f = v.c(...fish), fd = v.c(fish[0] * 0.75, fish[1] * 0.75, fish[2] * 0.75), eye = v.c(30, 30, 40), brass = v.c(220, 190, 100)
  for (let y = 0; y < 6; y++) for (let i = 0; i < 10; i++) v.set(i, 0, y, (i === 0 || i === 9 || y === 0 || y === 5) ? boardD : board)
  for (const [i, y] of [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [3, 2], [4, 2], [5, 2], [4, 4], [5, 4]]) v.set(i, 1, y, f)
  v.set(7, 1, 2, fd); v.set(7, 1, 4, fd); v.set(8, 1, 3, fd)
  v.set(2, 1, 3, eye)
  v.set(4, 1, 1, brass); v.set(5, 1, 1, brass)
  return v.def('i_plaque', shell)
}

/**
 * A window in a wall: a wooden frame and sill, and behind it a pane of glass voxels each with a
 * colour of its own, so the house can paint the view into them every frame (the sky, the sea, the
 * rain). Returned with the palette indices of the pane, row by row from the top.
 */
/** a window fills a gap in an outer wall: as deep as the wall, and as high as the wall above its sill */
export const WIN_L = 3
export const WIN_H = 12
/** the widths windows come in (cells along the wall) */
export const WIN_WIDTHS = [11, 13, 17, 19, 23, 25, 29]
export const winName = (W: number, glass: boolean) => `i_win${W}${glass ? 'g' : ''}`
/**
 * A window (round 14): a real opening in the wall. The wall goes on over it as a timber lintel;
 * in the opening a wooden frame with a cross of glazing bars, and a box of flowers outside.
 * Without glass it is what stands there while the player is indoors — the island is seen through
 * it. With glass it is the window as it looks from outside: the panes shut, and lit at night.
 * k = 0 is the outer face of the wall.
 */
function windowFrame(W: number, glass: boolean): ModelDef {
  const L = WIN_L, H = WIN_H
  const v = new V(W, L, H)
  const wood = v.c(150, 104, 68), woodD = v.c(112, 76, 50), woodL = v.c(190, 142, 96)
  const beam = v.c(128, 88, 58), beamT = v.c(222, 210, 186)
  const mid = (L - 1) >> 1
  // the lintel: the wall carried over the opening
  v.box(0, 0, H - 2, W - 1, L - 1, H - 2, beam)
  v.box(0, 0, H - 1, W - 1, L - 1, H - 1, beamT)
  // the frame, in the middle of the wall's thickness
  v.box(0, mid, 0, W - 1, mid, 0, woodL)
  v.box(0, mid, 1, 0, mid, H - 3, wood)
  v.box(W - 1, mid, 1, W - 1, mid, H - 3, wood)
  const ci = (W - 1) >> 1, cy = (H - 2) >> 1
  v.box(ci, mid, 1, ci, mid, H - 3, woodD)
  v.box(1, mid, cy, W - 2, mid, cy, woodD)
  // the sill inside, a board
  v.box(0, L - 1, 0, W - 1, L - 1, 0, woodL)
  if (!glass) return v.def(winName(W, false))
  // seen from outside: a box of flowers under it, and the panes shut
  const box = v.c(196, 84, 64), leaf = v.c(90, 150, 80)
  v.box(1, 0, 0, W - 2, 0, 0, box)
  for (let i = 1; i < W - 1; i++) v.set(i, 0, 1, i % 3 === 0 ? v.c(255, 238, 156) : i % 3 === 1 ? v.c(244, 150, 150) : leaf)
  const g = v.c(130, 190, 220), gl = v.c(200, 230, 245), dark = v.c(60, 70, 90)
  for (let y = 1; y <= H - 3; y++) for (let i = 1; i < W - 1; i++) {
    if (i === ci || y === cy) continue
    v.set(i, mid, y, (i + y) % 7 === 0 ? gl : g)
    v.set(i, L - 1, y, dark)
  }
  return v.def(winName(W, true), { lit: [{ idx: g, rgb: [255, 206, 110] }, { idx: gl, rgb: [255, 232, 160] }] })
}

export function furnishModels(): ModelDef[] {
  const sea = (v: V, i: number, y: number) => (y > 4 ? v.c(150, 200, 240) : y === 4 ? v.c(250, 240, 200) : (i + y) % 4 === 0 ? v.c(120, 180, 220) : v.c(60, 120, 190))
  const flower = (v: V, i: number, y: number) => ((i === 3 && y >= 2 && y <= 5) ? v.c(80, 150, 80) : (Math.hypot(i - 3, y - 6) < 1.6 ? v.c(240, 110, 120) : (i === 3 && y === 6) ? v.c(250, 220, 100) : v.c(246, 240, 224)))
  const chart = (v: V, i: number, y: number) => ((i * 3 + y * 5) % 11 < 3 && y > 1 && y < 7 ? v.c(170, 150, 100) : (i + y) % 7 === 0 ? v.c(200, 80, 70) : v.c(236, 222, 186))
  return [
    tableModel('i_roundTable', 11, 11, 8, true), tableModel('i_sideTable', 6, 6, 7, true), nightstand(), tableModel('i_longTable', 19, 9, 8),
    armchair(), stool(), rocker(),
    cushion('i_cushion', 6, 6, 2, [220, 120, 100]), cushion('i_pillow', 8, 6, 5, [240, 210, 120]), cushion('i_beanbag', 9, 9, 6, [120, 140, 200]),
    bed2(), dresser(), cupboard(), shelf(),
    tableLamp(), wallLamp(), lights(), candle(),
    roundRug(), runner(),
    picture('i_paintSea', 11, 8, sea), picture('i_paintFlower', 7, 9, flower), picture('i_chart', 13, 9, chart),
    clock(), curtains(), mirror(),
    bigPlant(), cactus(), hanging(), vase(), bookStack(), tea(), fishbowl(), globe(),
    aquariumModel([[255, 140, 60], [90, 170, 240], [250, 220, 90]]), plaqueModel([110, 150, 200]),
    windowOutside(), computer(),
    ...WIN_WIDTHS.flatMap((W) => [windowFrame(W, false), windowFrame(W, true)]),
    ...ROOFS.map(([n, c, l]) => homeRoof(homeRoofName(n), c, l)),
  ]
}

// ───────────────────────────────────────────────────────────── the house as a building (round 12)
/** the roof colours of the island houses, by the model the island's def names */
const ROOFS: [string, RGB, RGB][] = [
  ['houseRed', [196, 84, 64], [228, 116, 88]], ['houseBlue', [70, 110, 170], [104, 146, 204]],
  ['houseGreen', [70, 136, 90], [104, 170, 116]], ['houseSand', [200, 150, 90], [230, 186, 120]],
]
/** a roof colour and its light tone, by the island's roof name */
export const roofColours = (roof: string): [RGB, RGB, string] => { const r = ROOFS.find((x) => x[0] === roof) ?? ROOFS[0]; return [r[1], r[2], r[0]] }
export const homeRoofName = (roof: string) => 'homeRoof_' + (ROOFS.some((r) => r[0] === roof) ? roof : 'houseRed')
/**
 * The player's house's roof: a tiled gable over the whole house (89 × 63 inside, walls 3 thick),
 * overhanging a little, ridge along its length, gable ends plastered, a chimney over the living
 * room's fire. It sits on the walls and comes off when the player walks in.
 */
function homeRoof(name: string, roofC: RGB, roofL: RGB): ModelDef {
  const W = 89 + 6 + 4, L = 63 + 6 + 4, H = 20
  const v = new V(W, L, H)
  const r = v.c(...roofC), rl = v.c(...roofL), rd = v.c(roofC[0] - 40, roofC[1] - 30, roofC[2] - 24)
  const ridge = v.c(roofC[0] - 60, roofC[1] - 46, roofC[2] - 36)
  const wall = v.c(240, 226, 196), wallD = v.c(212, 196, 166), beam = v.c(...WOOD_D)
  const st = v.c(150, 146, 140), sd = v.c(112, 108, 104)
  const mid = (L - 1) / 2
  const rise = (k: number) => Math.round((H - 5) * (1 - Math.abs(k - mid) / mid))
  for (let k = 0; k < L; k++) {
    const y = rise(k)
    for (let i = 0; i < W; i++) {
      const tile = (i + (y % 2) * 2) % 4 === 0
      const c = Math.abs(k - mid) < 1 ? ridge : k < mid ? (tile ? r : rl) : tile ? rd : r
      v.set(i, k, y, c)
      // the eaves: a lip all round
      if (i === 0 || i === W - 1 || k === 0 || k === L - 1) v.set(i, k, Math.max(0, y - 1), k < mid ? r : rd)
    }
  }
  // the gable ends, plastered, with a timber edge
  for (const i of [2, W - 3]) {
    for (let k = 2; k < L - 2; k++) {
      const top = rise(k) - 1
      for (let y = 0; y <= top; y++) v.set(i, k, y, y === top ? beam : i === 2 ? wallD : wall)
    }
  }
  // a chimney (over the living room's fire, a little back from the ridge)
  const cx = Math.round(W * 0.62), ck = Math.round(mid + 8)
  const base = rise(ck) - 2
  v.box(cx, ck, base, cx + 3, ck + 3, H - 1, st)
  v.box(cx, ck, H - 1, cx + 3, ck + 3, H - 1, sd)
  return v.def(name)
}
/** a window as it is seen from outside: a frame, the glass (lit at night) and a box of flowers */
function windowOutside(): ModelDef {
  const v = new V(13, 2, 10)
  const frame = v.c(...WOOD_D), glass = v.c(130, 190, 220), glassL = v.c(200, 230, 245)
  const box = v.c(214, 80, 60), leaf = v.c(90, 150, 80)
  v.box(0, 0, 0, 12, 0, 9, frame)
  v.box(1, 0, 1, 11, 0, 8, glass)
  v.box(6, 0, 1, 6, 0, 8, frame); v.box(1, 0, 5, 11, 0, 5, frame)
  v.set(2, 0, 8, glassL); v.set(3, 0, 8, glassL); v.set(2, 0, 7, glassL); v.set(8, 0, 8, glassL)
  v.box(0, 1, 0, 12, 1, 0, box)
  for (let i = 1; i < 12; i++) v.set(i, 1, 1, i % 3 === 0 ? v.c(255, 238, 156) : i % 3 === 1 ? v.c(244, 150, 150) : leaf)
  return v.def('i_winOut', { lit: [{ idx: glass, rgb: [255, 206, 110] }, { idx: glassL, rgb: [255, 232, 160] }] })
}

/** the old computer that sits on a desk (round 13): a beige box of a monitor with a teal screen
 * (it glows at night), a keyboard in front of it */
function computer(): ModelDef {
  const v = new V(11, 8, 10)
  const beige = v.c(222, 214, 196), beigeD = v.c(186, 178, 160), dark = v.c(70, 66, 72)
  const scr = v.c(70, 150, 150), scrL = v.c(130, 200, 196), key = v.c(236, 230, 214), keyD = v.c(170, 162, 146)
  // the monitor: deep at the back, the screen at its face
  v.box(1, 0, 1, 9, 4, 9, beige)
  v.box(2, 0, 2, 8, 1, 8, beigeD)
  v.box(4, 2, 0, 6, 3, 0, beigeD) // the stand
  v.box(2, 5, 2, 8, 5, 8, beige) // the bezel
  v.box(3, 5, 3, 7, 5, 7, scr)
  v.set(3, 5, 7, scrL); v.set(4, 5, 7, scrL); v.set(3, 5, 6, scrL)
  v.set(8, 5, 2, v.c(120, 210, 120)) // the power light
  // the keyboard
  v.box(1, 6, 0, 9, 7, 0, keyD)
  for (let i = 1; i <= 9; i++) for (let k = 6; k <= 7; k++) if ((i + k) % 2 === 0) v.set(i, k, 1, key)
  v.set(10, 7, 0, dark) // the mouse
  return v.def('i_computer', { lit: [{ idx: scr, rgb: [110, 220, 210] }, { idx: scrL, rgb: [190, 250, 240] }] })
}
