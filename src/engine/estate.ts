// The island's buildings from level 6 on, each set down from a kit made at the workbench: the
// ranch (pets bred), the shop (sells while you are away), the freight depot (couriers hired), the
// lighthouse (a stop on others' routes) and the exchange (goods bought and sold at a moving price).

import type { ModelDef } from './models'
import { V } from './props'

const shell = { shell: true }

/** the ranch: a red barn with a white-trimmed loft door, a fenced pen in front, hay. 33 × 27 */
function ranch(): ModelDef {
  const v = new V(33, 27, 24)
  const red = v.c(186, 64, 52), redD = v.c(146, 48, 40), trim = v.c(246, 240, 228), roof = v.c(80, 76, 72), roofL = v.c(110, 104, 98)
  const hay = v.c(236, 204, 110), hayD = v.c(200, 166, 80), fence = v.c(214, 190, 150), grass = v.c(110, 160, 80)
  // the barn at the back
  const i0 = 7, i1 = 25, k0 = 1, k1 = 13
  for (let y = 0; y < 13; y++) for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
    if (i !== i0 && i !== i1 && k !== k0 && k !== k1) continue
    v.set(i, k, y, (i === i0 || i === i1) && (k === k0 || k === k1) ? trim : (i + y) % 4 === 0 ? redD : red)
  }
  // the gambrel roof
  const mid = (i0 + i1) / 2
  for (let i = i0 - 1; i <= i1 + 1; i++) {
    const d = Math.abs(i - mid)
    const y = 13 + Math.round(d < 4 ? 8 - d * 0.5 : 6 - (d - 4) * 1.1)
    for (let k = k0 - 1; k <= k1 + 1; k++) v.set(i, k, y, (k + i) % 3 ? roof : roofL)
    for (let yy = 13; yy < y; yy++) { v.set(i, k0, yy, red); v.set(i, k1, yy, red) }
  }
  // the big door with its white cross, and the loft door above
  for (let y = 0; y < 9; y++) for (let d = -3; d <= 3; d++) v.set(16 + d, k1, y, Math.abs(d) === 3 || y === 8 || Math.abs(d) === Math.round(y * 3 / 8) ? trim : redD)
  v.box(14, k1, 15, 18, k1, 18, trim); v.box(15, k1, 16, 17, k1, 17, hay)
  // the pen in front, with hay bales
  for (let i = 1; i <= 31; i++) for (const k of [25]) { v.set(i, k, 2, fence); v.set(i, k, 4, fence); if (i % 3 === 1) v.box(i, k, 0, i, k, 5, fence) }
  for (let k = 14; k <= 25; k++) for (const i of [1, 31]) { v.set(i, k, 2, fence); v.set(i, k, 4, fence); if (k % 3 === 1) v.box(i, k, 0, i, k, 5, fence) }
  for (let i = 2; i <= 30; i++) for (let k = 14; k <= 24; k++) if ((i * 7 + k * 3) % 11 === 0) v.set(i, k, 0, grass)
  for (const [i, k] of [[4, 16], [28, 17]]) { v.box(i - 1, k - 1, 0, i + 1, k + 1, 2, hay); v.box(i - 1, k - 1, 1, i + 1, k - 1, 1, hayD) }
  // a trough
  v.box(22, 20, 0, 27, 21, 1, fence); v.box(23, 20, 1, 26, 21, 1, v.c(90, 150, 200))
  return v.def('est_ranch', shell)
}

/** the shop: a little shop front with a striped awning, a window of goods, a sign. 25 × 19 */
function shop(): ModelDef {
  const v = new V(25, 19, 22)
  const wall = v.c(246, 232, 200), wallD = v.c(214, 196, 160), wood = v.c(140, 98, 64), glass = v.c(150, 206, 230)
  const aw1 = v.c(60, 140, 110), aw2 = v.c(246, 242, 230), roof = v.c(170, 84, 60), roofL = v.c(200, 106, 74), sign = v.c(252, 214, 100)
  const goods = [v.c(220, 80, 70), v.c(250, 200, 80), v.c(110, 170, 220), v.c(120, 180, 100)]
  for (let y = 0; y < 13; y++) for (let i = 2; i <= 22; i++) for (let k = 1; k <= 13; k++) {
    if (i !== 2 && i !== 22 && k !== 1 && k !== 13) continue
    v.set(i, k, y, y === 0 ? wood : (i + k) % 5 === 0 ? wallD : wall)
  }
  // roof
  for (let k = 0; k <= 14; k++) {
    const y = 13 + Math.round(6 * (1 - Math.abs(k - 7) / 7))
    for (let i = 1; i <= 23; i++) v.set(i, k, y, i % 3 ? roof : roofL)
    for (let yy = 13; yy < y; yy++) { v.set(2, k, yy, wall); v.set(22, k, yy, wall) }
  }
  // the window full of goods and the door
  v.box(4, 13, 2, 13, 13, 9, wood); v.box(5, 13, 3, 12, 13, 8, glass)
  for (let i = 5; i <= 12; i += 2) { v.set(i, 13, 3, goods[(i >> 1) % 4]); v.set(i + 1, 13, 5, goods[(i + 1) % 4]) }
  v.box(16, 13, 0, 20, 13, 9, wood); v.box(17, 13, 1, 19, 13, 8, v.c(110, 76, 50)); v.set(19, 13, 4, sign)
  // the awning over the front
  for (let i = 2; i <= 22; i++) for (let k = 14; k <= 17; k++) v.set(i, k, 11 - (k - 14), Math.floor(i / 2) % 2 ? aw1 : aw2)
  // the hanging sign
  v.box(10, 14, 14, 15, 14, 16, sign); v.set(12, 14, 15, wood); v.set(13, 14, 15, wood)
  // crates of goods out front
  v.box(3, 16, 0, 5, 18, 2, wood); v.box(3, 16, 3, 5, 18, 3, goods[0]); v.box(19, 16, 0, 21, 18, 2, wood); v.box(19, 16, 3, 21, 18, 3, goods[1])
  return v.def('est_shop', shell)
}

/** the freight depot: a long shed with a loading bay, crates and a crane. 35 × 25 */
function depot(): ModelDef {
  const v = new V(35, 25, 26)
  const wall = v.c(150, 160, 170), wallD = v.c(120, 128, 138), roof = v.c(80, 98, 120), roofL = v.c(106, 124, 146)
  const crate = v.c(196, 150, 96), crateD = v.c(150, 110, 66), yellow = v.c(240, 196, 60), dark = v.c(60, 60, 68), door = v.c(90, 96, 104)
  for (let y = 0; y < 12; y++) for (let i = 1; i <= 23; i++) for (let k = 1; k <= 15; k++) {
    if (i !== 1 && i !== 23 && k !== 1 && k !== 15) continue
    v.set(i, k, y, k === 15 && i % 2 ? wallD : wall)
  }
  for (let i = 0; i <= 24; i++) for (let k = 0; k <= 16; k++) v.set(i, k, 12 + Math.round(2 * (1 - Math.abs(k - 8) / 8)), k % 2 ? roof : roofL)
  // two roller doors
  for (const c of [7, 17]) v.box(c - 3, 15, 0, c + 3, 15, 8, door)
  for (const c of [7, 17]) for (let y = 1; y <= 8; y += 2) v.box(c - 3, 15, y, c + 3, 15, y, wallD)
  // the loading platform and crates
  v.box(0, 16, 0, 24, 19, 1, v.c(170, 170, 170))
  for (const [i, k, h] of [[3, 17, 2], [9, 18, 3], [20, 17, 2]] as const) { v.box(i - 1, k - 1, 2, i + 1, k + 1, 2 + h, crate); v.box(i - 1, k + 1, 2, i + 1, k + 1, 2 + h, crateD) }
  // the crane on the right: a yellow mast, a jib and a hook
  v.box(29, 10, 0, 31, 12, 1, dark)
  v.box(30, 11, 2, 30, 11, 22, yellow)
  for (let i = 18; i <= 33; i++) v.set(i, 11, 22, yellow)
  v.box(32, 10, 20, 33, 12, 21, dark)
  v.box(22, 11, 15, 22, 11, 21, dark)
  v.box(21, 10, 13, 23, 12, 14, crate)
  return v.def('est_depot', shell)
}

/** the island's lighthouse: striped, a gallery, a lantern lit at night. 15 × 15 */
function lighthouse(): ModelDef {
  const v = new V(15, 15, 46)
  const white = v.c(244, 242, 236), red = v.c(200, 56, 48), rail = v.c(60, 60, 68), dome = v.c(170, 40, 40), lamp = v.c(255, 236, 150), glass = v.c(200, 236, 250), stone = v.c(150, 146, 140), door = v.c(110, 76, 50)
  v.blob(7, 7, 1, 7, 7, 1.5, () => stone)
  for (let y = 2; y < 34; y++) {
    const r = 5.6 - y * 0.06
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2
      v.set(Math.round(7 + Math.cos(ang) * r), Math.round(7 + Math.sin(ang) * r), y, Math.floor(y / 6) % 2 ? red : white)
    }
  }
  v.box(6, 12, 2, 8, 12, 6, door)
  for (let a = 0; a < 56; a++) {
    const ang = (a / 56) * Math.PI * 2
    for (const rr of [5, 6]) v.set(Math.round(7 + Math.cos(ang) * rr), Math.round(7 + Math.sin(ang) * rr), 34, rail)
    v.set(Math.round(7 + Math.cos(ang) * 6), Math.round(7 + Math.sin(ang) * 6), 36, rail)
  }
  v.blob(7, 7, 38.5, 3.2, 3.2, 3, (i, k, y) => ((i + k) % 3 === 0 ? glass : lamp))
  v.blob(7, 7, 42.5, 4, 4, 2, () => dome)
  v.set(7, 7, 45, rail)
  return v.def('est_lighthouse', { lit: [{ idx: lamp, rgb: [255, 244, 180] }], glow: [{ idx: lamp, alt: [255, 250, 210] }] })
}

/** the exchange: a stone hall with columns, steps, a clock in the pediment and a board of prices. 33 × 23 */
function exchange(): ModelDef {
  const v = new V(33, 23, 28)
  const stone = v.c(226, 220, 206), stoneD = v.c(190, 184, 170), roof = v.c(96, 120, 140), gold = v.c(230, 190, 80), board = v.c(40, 50, 60), up = v.c(220, 80, 70), down = v.c(90, 190, 110), glass = v.c(150, 200, 226)
  // the steps
  for (let s = 0; s < 3; s++) v.box(1 + s, 17 + s, 0, 31 - s, 22 - s, 2 - s, s % 2 ? stoneD : stone)
  // the hall
  for (let y = 3; y < 17; y++) for (let i = 3; i <= 29; i++) for (let k = 2; k <= 12; k++) {
    if (i !== 3 && i !== 29 && k !== 2 && k !== 12) continue
    v.set(i, k, y, (y % 4 === 0) ? stoneD : stone)
  }
  for (let i = 6; i <= 26; i += 4) for (let y = 4; y < 14; y++) v.set(i, 12, y, glass)
  // columns in front
  for (let i = 4; i <= 28; i += 4) { v.box(i, 15, 3, i + 1, 16, 16, stone); v.box(i - 1, 14, 16, i + 2, 17, 16, stoneD) }
  // the entablature and a triangular pediment with a clock
  v.box(2, 1, 17, 30, 17, 18, stoneD)
  for (let i = 2; i <= 30; i++) { const h = Math.round(7 * (1 - Math.abs(i - 16) / 14)); for (let y = 19; y <= 19 + h; y++) v.set(i, 17, y, stone); for (let k = 1; k <= 16; k++) v.set(i, k, 19 + h, roof) }
  v.blob(16, 17, 22, 2.2, 0.6, 2.2, () => gold)
  v.set(16, 17, 22, board); v.set(16, 17, 23, board)
  // the price board by the door: red and green ticks
  v.box(12, 13, 6, 20, 13, 11, board)
  for (let i = 13; i <= 19; i++) v.set(i, 13, 7 + ((i * 3) % 4), i % 2 ? up : down)
  return v.def('est_exchange', shell)
}

export function estateModels(): ModelDef[] {
  return [ranch(), shop(), depot(), lighthouse(), exchange()]
}
