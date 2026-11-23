// The furniture of a house, inside: bed, bathroom, kitchen, living room. Each piece faces south
// (+k, towards the default camera): the side you use it from. Sizes are in ground pixels, and the
// pilot is 7 across and 12 tall, so a bed is a little longer than the pilot.

import type { ModelDef } from './models'
import { V } from './props'

type RGB = [number, number, number]
const WOOD: RGB = [176, 128, 82], WOOD_D: RGB = [128, 88, 56], WOOD_L: RGB = [212, 168, 116]
const WHITE: RGB = [244, 242, 236], WHITE_D: RGB = [206, 204, 200], STEEL: RGB = [168, 176, 188], STEEL_D: RGB = [120, 128, 140]
const shell = { shell: true }

function bed(sleeper?: { skin: RGB; hair: RGB }): ModelDef {
  const v = new V(13, 19, 9)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), sheet = v.c(246, 242, 232), quilt = v.c(96, 140, 200), quiltL = v.c(132, 176, 226), pillow = v.c(255, 255, 250)
  v.box(0, 0, 0, 12, 18, 2, wd) // frame
  v.box(0, 0, 3, 12, 1, 7, w) // headboard
  v.box(1, 0, 7, 11, 0, 7, wd)
  v.box(1, 2, 3, 11, 17, 3, sheet)
  v.box(2, 2, 4, 10, 4, 4, pillow)
  for (let k = 7; k <= 17; k++) for (let i = 1; i <= 11; i++) v.set(i, k, 4, (i + k) % 4 === 0 ? quiltL : quilt)
  v.box(1, 7, 4, 11, 7, 4, sheet) // the turned-down sheet
  v.box(0, 18, 3, 12, 18, 4, w) // foot board
  if (sleeper) {
    // somebody in it: a head on the pillow, the quilt pulled up over a body
    const sk = v.c(...sleeper.skin), hr = v.c(...sleeper.hair)
    v.box(4, 2, 5, 8, 5, 6, sk)
    v.box(4, 2, 7, 8, 4, 7, hr)
    v.box(4, 2, 5, 8, 2, 6, hr)
    v.set(5, 5, 6, v.c(40, 44, 58)); v.set(7, 5, 6, v.c(40, 44, 58)) // eyes, closed
    for (let k = 6; k <= 16; k++) for (let i = 3; i <= 9; i++) if (!(k > 13 && (i === 3 || i === 9))) v.set(i, k, 5, (i + k) % 4 === 0 ? quiltL : quilt)
    v.box(2, 6, 5, 10, 6, 5, sheet)
    return v.def('i_bed_sleep', shell)
  }
  return v.def('i_bed', shell)
}
function wardrobe(): ModelDef {
  const v = new V(13, 6, 18)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), wl = v.c(...WOOD_L), knob = v.c(232, 200, 110)
  v.box(0, 0, 0, 12, 5, 17, w)
  v.box(0, 5, 1, 12, 5, 16, wl)
  v.box(6, 5, 1, 6, 5, 16, wd)
  v.box(0, 0, 17, 12, 5, 17, wd)
  v.set(5, 5, 9, knob); v.set(7, 5, 9, knob)
  return v.def('i_wardrobe', shell)
}
function toilet(): ModelDef {
  const v = new V(7, 9, 9)
  const p = v.c(...WHITE), pd = v.c(...WHITE_D), water = v.c(120, 190, 220), lid = v.c(232, 230, 226)
  v.box(1, 0, 0, 5, 2, 8, p) // tank
  v.box(1, 0, 8, 5, 2, 8, lid)
  v.box(2, 3, 0, 4, 7, 2, pd)
  v.box(1, 3, 3, 5, 8, 4, p)
  v.box(2, 4, 4, 4, 7, 4, water)
  v.set(3, 1, 9, pd)
  return v.def('i_toilet', shell)
}
function sink(): ModelDef {
  const v = new V(9, 6, 16)
  const p = v.c(...WHITE), pd = v.c(...WHITE_D), s = v.c(...STEEL), water = v.c(150, 210, 230), glass = v.c(190, 226, 240), frame = v.c(...WOOD_D)
  v.box(3, 1, 0, 5, 3, 7, pd) // pedestal
  v.box(0, 0, 8, 8, 5, 9, p)
  v.box(1, 1, 9, 7, 4, 9, water)
  v.set(4, 0, 10, s); v.set(4, 1, 11, s)
  v.box(1, 0, 11, 7, 0, 15, frame) // the mirror
  v.box(2, 0, 12, 6, 0, 14, glass)
  return v.def('i_sink', shell)
}
function shower(): ModelDef {
  const v = new V(13, 13, 20)
  const tile = v.c(226, 236, 240), tileD = v.c(190, 208, 216), glass = v.c(170, 220, 236), s = v.c(...STEEL), sd = v.c(...STEEL_D), drain = v.c(80, 90, 100)
  v.box(0, 0, 0, 12, 12, 0, tileD) // tray
  for (let i = 0; i <= 12; i++) for (let k = 0; k <= 12; k++) if ((i + k) % 3 === 0) v.set(i, k, 0, tile)
  v.set(6, 6, 0, drain)
  // two tiled walls (back and left), glass on the front and the right
  v.box(0, 0, 1, 12, 0, 19, tile); v.box(0, 0, 1, 0, 12, 19, tile)
  for (let y = 1; y <= 19; y += 3) { v.box(0, 0, y, 12, 0, y, tileD); v.box(0, 0, y, 0, 12, y, tileD) }
  for (let y = 1; y <= 16; y++) { if (y % 5 !== 0) { v.set(12, 12, y, sd); v.set(12, 1, y, sd) } }
  for (let k = 1; k <= 11; k++) for (let y = 2; y <= 16; y++) if ((k + y) % 7 === 0) v.set(12, k, y, glass)
  v.box(12, 1, 17, 12, 12, 17, sd)
  // the shower head
  v.box(6, 1, 17, 6, 4, 17, s); v.box(5, 4, 16, 7, 6, 16, s)
  return v.def('i_shower', shell)
}
function bathtub(): ModelDef {
  const v = new V(19, 10, 7)
  const p = v.c(...WHITE), pd = v.c(...WHITE_D), water = v.c(120, 190, 226), foam = v.c(250, 250, 255), s = v.c(...STEEL), foot = v.c(232, 200, 110)
  for (const [i, k] of [[1, 1], [17, 1], [1, 8], [17, 8]]) v.set(i, k, 0, foot)
  v.box(0, 0, 1, 18, 9, 5, p)
  v.box(1, 1, 2, 17, 8, 5, 0)
  v.box(1, 1, 1, 17, 8, 1, pd)
  v.box(1, 1, 2, 17, 8, 3, water)
  for (const [i, k] of [[4, 3], [5, 4], [12, 6], [13, 5], [9, 3]]) v.set(i, k, 4, foam)
  v.set(2, 0, 6, s); v.set(2, 1, 6, s)
  return v.def('i_bathtub', shell)
}
function counterLike(name: string, top: 'counter' | 'stove' | 'sink'): ModelDef {
  const v = new V(11, 7, 10)
  const w = v.c(...WOOD_L), wd = v.c(...WOOD_D), top0 = v.c(214, 210, 200), knob = v.c(60, 60, 70)
  v.box(0, 0, 0, 10, 6, 8, w)
  v.box(0, 6, 1, 10, 6, 7, wd)
  v.box(5, 6, 1, 5, 6, 7, w)
  v.box(0, 0, 9, 10, 6, 9, top0)
  if (top === 'stove') {
    const iron = v.c(50, 50, 58), flame = v.c(255, 140, 50), pot = v.c(...STEEL), potD = v.c(...STEEL_D)
    for (const i of [2, 7]) { v.box(i, 2, 9, i + 1, 3, 9, iron); v.set(i, 2, 9, flame) }
    v.box(6, 1, 10, 9, 4, 12, pot); v.box(7, 2, 12, 8, 3, 12, potD)
    for (const i of [2, 4, 6, 8]) v.set(i, 6, 7, knob)
    return v.def(name, { ...shell, glow: [{ idx: flame, alt: [255, 200, 90] }], lit: [{ idx: flame, rgb: [255, 150, 60] }] })
  }
  const board = v.c(222, 186, 132), carrot = v.c(240, 130, 50)
  v.box(2, 1, 10, 6, 4, 10, board); v.set(4, 2, 11, carrot); v.set(5, 2, 11, carrot)
  return v.def(name, shell)
}
function fridge(): ModelDef {
  const v = new V(9, 7, 20)
  const b = v.c(232, 240, 244), bd = v.c(196, 206, 214), h = v.c(...STEEL), mag = v.c(240, 120, 110)
  v.box(0, 0, 0, 8, 6, 19, b)
  v.box(0, 6, 12, 8, 6, 12, bd)
  v.box(7, 6, 6, 7, 6, 10, h); v.box(7, 6, 14, 7, 6, 17, h)
  v.set(3, 6, 16, mag); v.set(4, 6, 15, v.c(110, 180, 230))
  return v.def('i_fridge', shell)
}
function table(name: string, W: number, L: number, H: number, col: RGB, cloth?: RGB): ModelDef {
  const v = new V(W, L, H)
  const w = v.c(...col), wd = v.c(col[0] * 0.72, col[1] * 0.72, col[2] * 0.72)
  for (const [i, k] of [[1, 1], [W - 2, 1], [1, L - 2], [W - 2, L - 2]]) v.box(i, k, 0, i, k, H - 2, wd)
  v.box(0, 0, H - 1, W - 1, L - 1, H - 1, w)
  if (cloth) {
    const c = v.c(...cloth)
    v.box(2, 0, H - 1, W - 3, L - 1, H - 1, c)
  }
  if (name === 'i_dinner') { const plate = v.c(250, 250, 246), food = v.c(240, 150, 60); v.set(3, 2, H, plate); v.set(W - 4, L - 3, H, plate); v.set(3, 2, H, food) }
  if (name === 'i_coffee') { const cup = v.c(250, 250, 246), tea = v.c(150, 100, 60); v.set(3, 2, H, cup); v.set(5, 3, H, cup); v.set(4, 2, H, tea) }
  return v.def(name, shell)
}
function chair(): ModelDef {
  const v = new V(6, 6, 11)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), cushion = v.c(220, 110, 90)
  for (const [i, k] of [[0, 0], [5, 0], [0, 5], [5, 5]]) v.box(i, k, 0, i, k, 3, wd)
  v.box(0, 0, 4, 5, 5, 4, w)
  v.box(1, 1, 5, 4, 4, 5, cushion)
  v.box(0, 0, 5, 5, 0, 10, w)
  v.box(1, 0, 9, 4, 0, 9, wd)
  return v.def('i_chair', shell)
}
function sofa(): ModelDef {
  const v = new V(19, 9, 9)
  const c = v.c(214, 120, 96), cd = v.c(170, 88, 72), cl = v.c(236, 150, 124), leg = v.c(...WOOD_D), pil = v.c(250, 214, 120)
  for (const i of [1, 17]) for (const k of [1, 7]) v.set(i, k, 0, leg)
  v.box(0, 0, 1, 18, 8, 3, cd)
  v.box(2, 2, 4, 16, 8, 4, c)
  for (const i of [2, 7, 12]) v.box(i, 2, 5, i + 4, 8, 5, cl)
  v.box(0, 0, 4, 18, 2, 8, c) // the back
  v.box(0, 0, 4, 1, 8, 6, cd); v.box(17, 0, 4, 18, 8, 6, cd) // arms
  v.box(3, 3, 6, 4, 3, 7, pil); v.box(14, 3, 6, 15, 3, 7, pil)
  return v.def('i_sofa', shell)
}
function tv(): ModelDef {
  const v = new V(17, 6, 16)
  const w = v.c(...WOOD_D), wl = v.c(...WOOD), black = v.c(36, 38, 46), screen = v.c(70, 140, 200), screenL = v.c(140, 210, 240)
  v.box(0, 0, 0, 16, 5, 5, w)
  v.box(1, 5, 1, 7, 5, 4, wl); v.box(9, 5, 1, 15, 5, 4, wl)
  v.box(7, 2, 6, 9, 3, 6, black)
  v.box(2, 2, 7, 14, 2, 15, black)
  for (let i = 3; i <= 13; i++) for (let y = 8; y <= 14; y++) v.set(i, 3, y, (i + y * 2) % 9 === 0 ? screenL : screen)
  return v.def('i_tv', { ...shell, lit: [{ idx: screen, rgb: [90, 170, 230] }, { idx: screenL, rgb: [170, 230, 250] }] })
}
function rug(): ModelDef {
  const v = new V(25, 17, 1)
  const a = v.c(196, 76, 70), b = v.c(236, 200, 120), c = v.c(70, 110, 160)
  for (let i = 0; i < 25; i++) for (let k = 0; k < 17; k++) {
    const e = Math.min(i, k, 24 - i, 16 - k)
    v.set(i, k, 0, e === 0 ? b : e === 2 ? c : (i + k) % 6 === 0 ? b : a)
  }
  return v.def('i_rug', { shell: false })
}
function bookshelf(): ModelDef {
  const v = new V(13, 5, 18)
  const w = v.c(...WOOD_D), wl = v.c(...WOOD)
  const books = [v.c(200, 80, 70), v.c(70, 120, 180), v.c(90, 160, 100), v.c(230, 190, 90), v.c(150, 100, 170)]
  v.box(0, 0, 0, 12, 4, 17, w)
  for (const y0 of [1, 6, 11]) {
    v.box(1, 1, y0, 11, 4, y0 + 3, 0)
    for (let i = 1; i <= 11; i++) {
      if ((i * 7 + y0) % 5 === 0) continue
      const h = 2 + ((i + y0) % 2)
      v.box(i, 2, y0, i, 3, y0 + h - 1, books[(i + y0) % books.length])
    }
    v.box(0, 4, y0 - 1, 12, 4, y0 - 1, wl)
  }
  return v.def('i_books', shell)
}
function plant(): ModelDef {
  const v = new V(7, 7, 13)
  const pot = v.c(196, 110, 70), potD = v.c(150, 80, 54), soil = v.c(90, 64, 44), g = v.c(70, 150, 80), gl = v.c(120, 196, 100)
  v.cyl(3, 3, 0, 3, 2.2, pot); v.cyl(3, 3, 0, 0, 2, potD); v.cyl(3, 3, 3, 3, 1.8, soil)
  v.blob(3, 3, 8, 3, 3, 4, (i, k, y) => ((i + k + y) % 3 === 0 ? gl : g), 0.4)
  return v.def('i_plant', shell)
}
function lamp(): ModelDef {
  const v = new V(7, 7, 20)
  const s = v.c(...STEEL_D), shade = v.c(250, 226, 160), shadeD = v.c(230, 196, 120)
  v.cyl(3, 3, 0, 0, 2.2, s); v.box(3, 3, 1, 3, 3, 14, s)
  v.cyl(3, 3, 15, 18, 3, (i, k, y) => (y === 15 ? shadeD : shade))
  return v.def('i_lamp', { ...shell, lit: [{ idx: shade, rgb: [255, 236, 160] }, { idx: shadeD, rgb: [255, 214, 130] }] })
}
function desk(): ModelDef {
  const v = new V(15, 8, 14)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), paper = v.c(246, 240, 220), globe = v.c(80, 150, 210), land = v.c(110, 180, 90), ink = v.c(40, 40, 60)
  v.box(0, 0, 0, 3, 7, 7, wd); v.box(11, 0, 0, 14, 7, 7, wd)
  v.box(0, 0, 8, 14, 7, 8, w)
  v.box(4, 2, 9, 9, 5, 9, paper); v.set(6, 3, 9, ink); v.set(7, 4, 9, ink)
  v.blob(12, 3, 11.5, 1.6, 1.6, 1.6, (i, k, y) => ((i + k + y) % 3 === 0 ? land : globe)); v.set(12, 3, 9, wd)
  return v.def('i_desk', shell)
}
/** a stone hearth with a fire in it */
function fireplace(): ModelDef {
  const v = new V(15, 6, 14)
  const st = v.c(176, 166, 156), stD = v.c(140, 130, 124), stL = v.c(206, 198, 188), soot = v.c(40, 36, 40)
  const log = v.c(120, 76, 46), f1 = v.c(255, 150, 50), f2 = v.c(255, 220, 110), mantel = v.c(150, 104, 66)
  v.box(0, 0, 0, 14, 5, 11, st)
  for (let y = 0; y <= 11; y++) for (let i = 0; i <= 14; i++) if ((i + (y >> 1) * 3) % 5 === 0) v.set(i, 5, y, stD)
  v.box(3, 3, 1, 11, 5, 8, 0) // the opening
  v.box(3, 2, 1, 11, 2, 8, soot)
  v.box(4, 3, 1, 10, 4, 1, log)
  for (const [i, k, y, c] of [[5, 4, 2, f1], [6, 3, 3, f2], [7, 4, 2, f1], [8, 3, 4, f1], [9, 4, 2, f2], [7, 3, 5, f2], [6, 4, 3, f1], [8, 4, 3, f2]] as [number, number, number, number][]) v.set(i, k, y, c)
  v.box(0, 0, 12, 14, 5, 12, mantel)
  v.box(1, 0, 13, 13, 4, 13, stL)
  const candle = v.c(250, 246, 230)
  v.set(2, 3, 13, candle); v.set(12, 3, 13, candle)
  return v.def('i_fire', { shell: true, glow: [{ idx: f1, alt: [255, 196, 80] }, { idx: f2, alt: [255, 150, 60] }], lit: [{ idx: f1, rgb: [255, 150, 50] }, { idx: f2, rgb: [255, 226, 120] }] })
}
/** the front door, from inside: a mat and a frame on the south wall */
function doorMat(): ModelDef {
  const v = new V(15, 5, 1)
  const a = v.c(150, 110, 70), b = v.c(120, 84, 54)
  for (let i = 0; i < 15; i++) for (let k = 0; k < 5; k++) v.set(i, k, 0, (i + k) % 2 ? a : b)
  return v.def('i_mat', { shell: false })
}

/** the restaurant: an open-air place under a striped awning — a counter with a stove at the back, a table for two in front */
function restaurant(): ModelDef {
  const v = new V(31, 23, 18)
  const deck = v.c(196, 150, 100), deckD = v.c(160, 118, 76), post = v.c(120, 84, 56)
  const aw1 = v.c(232, 96, 60), aw2 = v.c(250, 244, 230), ctr = v.c(214, 170, 118), ctrD = v.c(150, 104, 66)
  const stove = v.c(60, 60, 70), fire = v.c(255, 150, 50), pot = v.c(170, 176, 188), tableC = v.c(244, 238, 220), lamp = v.c(255, 214, 120)
  const board = v.c(70, 60, 54), chalk = v.c(240, 240, 230), plant = v.c(90, 170, 90), potC = v.c(196, 110, 70)
  // the deck
  for (let i = 0; i < 31; i++) for (let k = 0; k < 23; k++) v.set(i, k, 0, k % 3 === 0 ? deckD : deck)
  // posts and the awning, striped, sloping down to the front
  for (const [i, k] of [[1, 1], [29, 1], [1, 21], [29, 21]]) v.box(i, k, 1, i, k, 13, post)
  for (let i = 0; i < 31; i++) for (let k = 0; k < 23; k++) {
    const y = 15 - Math.floor(k / 6)
    v.set(i, k, y, Math.floor(i / 3) % 2 ? aw2 : aw1)
  }
  for (let i = 0; i < 31; i += 2) v.set(i, 22, 11, Math.floor(i / 3) % 2 ? aw2 : aw1) // the scalloped edge
  // the counter at the back, with the stove and a pot on it
  v.box(3, 2, 1, 27, 5, 6, ctr)
  v.box(3, 5, 1, 27, 5, 5, ctrD)
  v.box(18, 2, 7, 25, 5, 7, stove)
  v.set(20, 3, 7, fire); v.set(23, 4, 7, fire)
  v.box(19, 2, 8, 22, 4, 10, pot)
  v.box(5, 3, 7, 8, 4, 7, v.c(250, 250, 246)) // plates waiting
  // a menu board on the left
  v.box(1, 9, 1, 1, 9, 9, post); v.box(1, 7, 5, 1, 11, 9, board)
  for (const [k, y] of [[8, 8], [9, 8], [10, 7], [8, 6], [9, 6]]) v.set(1, k, y, chalk)
  // the table for two (and its stools) in front
  v.box(14, 13, 1, 14, 13, 4, post); v.box(11, 11, 5, 17, 15, 5, tableC)
  for (const i of [9, 19]) { v.box(i, 13, 1, i, 13, 2, post); v.box(i - 1, 12, 3, i + 1, 14, 3, deckD) }
  // lanterns under the awning, a potted plant at the corner
  for (const i of [6, 24]) { v.set(i, 8, 12, post); v.set(i, 8, 11, lamp) }
  v.box(27, 18, 1, 28, 19, 2, potC); v.box(26, 17, 3, 29, 20, 5, plant)
  return v.def('restaurant', { shell: true, glow: [{ idx: fire, alt: [255, 200, 90] }], lit: [{ idx: lamp, rgb: [255, 220, 130] }, { idx: fire, rgb: [255, 150, 60] }] })
}
/** a plate with something good on it (the colour is the dish's) */
export function plateModel(name: string, food: RGB, empty = false): ModelDef {
  const v = new V(5, 5, 3)
  const p = v.c(250, 250, 246), f = v.c(...food), fl = v.c(Math.min(255, food[0] + 30), Math.min(255, food[1] + 30), Math.min(255, food[2] + 30))
  for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) if (!((i === 0 || i === 4) && (k === 0 || k === 4))) v.set(i, k, 0, p)
  if (!empty) { v.box(1, 1, 1, 3, 3, 1, f); v.set(2, 2, 2, fl) } else v.set(3, 1, 1, f) // (a crumb left)
  return v.def(name, { shell: true })
}
/** the patch the shovel would level: a frame on the ground */
function pad(): ModelDef {
  const v = new V(11, 11, 1)
  const a = v.c(250, 250, 250), b = v.c(200, 200, 200)
  for (let i = 0; i < 11; i++) for (let k = 0; k < 11; k++) {
    const e = i === 0 || k === 0 || i === 10 || k === 10
    if (e) v.set(i, k, 0, (i + k) % 2 ? a : b)
    else if ((i + k) % 4 === 0) v.set(i, k, 0, b)
  }
  return v.def('g_pad', { shell: false })
}

/** the bed with the player asleep in it, in their own colours */
/** the mailbox by the house door: a wooden post, a rounded blue box, and a red flag that is up when there is post */
function mailbox(flag: boolean): ModelDef {
  const v = new V(9, 7, 17)
  const post = v.c(...WOOD_D), box = v.c(70, 120, 190), boxD = v.c(50, 90, 150), boxL = v.c(110, 160, 220), slot = v.c(30, 34, 50)
  const red = v.c(220, 60, 50), redD = v.c(170, 40, 36), steel = v.c(...STEEL)
  v.box(3, 2, 0, 4, 3, 9, post)
  v.box(0, 0, 10, 7, 5, 13, box)
  v.box(1, 0, 14, 6, 5, 14, box)
  v.box(2, 0, 15, 5, 5, 15, boxL)
  for (let k = 0; k <= 5; k++) { v.set(0, k, 13, boxD); v.set(7, k, 13, boxD) }
  v.box(2, 5, 11, 5, 5, 12, slot)
  v.set(3, 5, 13, steel); v.set(4, 5, 13, steel)
  // the flag on the side: up, it stands by the box; down, it lies along it
  v.set(8, 3, 11, steel)
  if (flag) { v.box(8, 3, 12, 8, 3, 16, steel); v.box(8, 3, 14, 8, 5, 16, red); v.set(8, 5, 14, redD) }
  else { v.box(8, 0, 11, 8, 3, 11, steel); v.box(8, 0, 12, 8, 1, 13, red) }
  return v.def(flag ? 'mailbox_up' : 'mailbox', shell)
}

/** the stock machine (炒股机): an old green-screen terminal on a little cabinet, a ticker tape curling out of it */
function stockMachine(): ModelDef {
  const v = new V(11, 7, 16)
  const w = v.c(...WOOD_D), wl = v.c(...WOOD), case_ = v.c(214, 206, 186), caseD = v.c(176, 168, 150), scr = v.c(20, 46, 30)
  const up = v.c(90, 230, 120), dn = v.c(240, 90, 80), tape = v.c(246, 240, 220), key = v.c(90, 86, 96)
  v.box(0, 0, 0, 10, 6, 6, w); v.box(1, 6, 1, 9, 6, 5, wl)
  v.box(1, 0, 7, 9, 5, 15, case_)
  v.box(1, 5, 7, 9, 6, 8, caseD)
  for (let i = 2; i <= 8; i++) v.set(i, 6, 7, key)
  v.box(2, 5, 9, 8, 5, 14, scr)
  // a little chart on the screen: up, down, up
  for (const [i, y, c] of [[3, 10, up], [4, 11, up], [5, 12, up], [6, 11, dn], [7, 12, up], [8, 13, up]] as [number, number, number][]) v.set(i, 5, y, c)
  v.box(10, 2, 11, 10, 3, 13, tape); v.set(10, 4, 10, tape); v.set(10, 5, 9, tape)
  return v.def('i_stocks', { shell: true, glow: [{ idx: up, alt: [140, 255, 160] }], lit: [{ idx: scr, rgb: [40, 90, 60] }, { idx: up, rgb: [120, 255, 150] }] })
}

export function bedWithSleeper(skin: RGB, hair: RGB): ModelDef {
  return bed({ skin, hair })
}

export function indoorModels(): ModelDef[] {
  return [
    bed(), wardrobe(), toilet(), sink(), shower(), bathtub(), counterLike('i_stove', 'stove'), counterLike('i_counter', 'counter'), fridge(),
    table('i_dinner', 15, 11, 9, WOOD_L, [240, 236, 220]), table('i_coffee', 11, 7, 5, WOOD), chair(), sofa(), tv(), rug(), bookshelf(), plant(), lamp(), desk(), doorMat(), pad(), fireplace(), restaurant(), mailbox(true), mailbox(false), stockMachine(),
  ]
}

/** a held shovel (as the tools are held: the handle along y) */
export function shovelHeld(): ModelDef {
  const v = new V(3, 3, 14)
  const w = v.c(...WOOD), s = v.c(...STEEL), sd = v.c(...STEEL_D)
  v.box(1, 1, 4, 1, 1, 13, w)
  v.box(0, 1, 0, 2, 1, 4, s); v.set(1, 1, 0, sd)
  return v.def('h_shovel', { pivK: 1, shell: false })
}
