// The house, round 16: what it looks like from outside at each size it grows to, the stairs
// between its floors, the little stove in the bedroom, things that keep memories (a photo frame,
// the guestbook), and the pieces by the bed drawn twice as fine, for the close shot from bed.
//
// Exterior models face south (+k): the front door is in the k = L − 1 − M face. They are drawn
// once per tier and roof colour, when the island is built.

import type { ModelDef } from './models'
import { V } from './props'
import { $t } from '../i18n'

type RGB = [number, number, number]
const WOOD: RGB = [176, 128, 82], WOOD_D: RGB = [128, 88, 56], WOOD_L: RGB = [212, 168, 116]
const shell = { shell: true }
const dim = (c: RGB, f: number): RGB => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)]

/** the house from outside, by tier: its walls (without the eaves), storeys, and what it is called */
export const EXTERIORS = [
  { name: $t('小木屋'), W: 27, L: 21, storeys: 1, storeyH: 11, roof: 9 },
  { name: $t('砖瓦房'), W: 37, L: 27, storeys: 1, storeyH: 14, roof: 12 },
  { name: $t('两层小楼'), W: 41, L: 31, storeys: 2, storeyH: 13, roof: 13 },
  { name: $t('三层小楼'), W: 45, L: 35, storeys: 3, storeyH: 13, roof: 0 },
  // from here the three-storey house gains wings, a tower and, last, a lighthouse (W: the whole width)
  { name: $t('工坊屋'), W: 61, L: 35, storeys: 3, storeyH: 13, roof: 0 },
  { name: $t('温室屋'), W: 77, L: 35, storeys: 3, storeyH: 13, roof: 0 },
  { name: $t('水族馆屋'), W: 77, L: 35, storeys: 3, storeyH: 13, roof: 0 },
  { name: $t('塔楼屋'), W: 77, L: 35, storeys: 3, storeyH: 13, roof: 0 },
  { name: $t('海景庄园'), W: 77, L: 35, storeys: 3, storeyH: 13, roof: 0 },
  { name: $t('灯塔宅邸'), W: 77, L: 35, storeys: 3, storeyH: 13, roof: 0 },
]
/** the margin round the walls in the model (eaves, the balcony, the step) */
export const EXT_M = 3
export const exteriorName = (tier: number, roof: string) => `homeOut${tier}_${roof}`

/**
 * The house as it stands on the island. Tier 0 is a log cabin with a shingle roof and a stovepipe;
 * 1 a cottage, plaster over a stone plinth, timbered corners, flower boxes and a chimney; 2 two
 * storeys, brick below and plaster above, a balcony over the door; 3 three storeys and a roof
 * terrace with a little glasshouse, ivy up one side.
 */
export function homeExterior(tier: number, roofName: string, roofC: RGB, roofL: RGB): ModelDef {
  if (tier >= 4) return grandExterior(tier, roofName, roofC, roofL)
  const t = EXTERIORS[Math.max(0, Math.min(3, tier))]
  const M = EXT_M
  const wallH = t.storeys * t.storeyH
  const W = t.W + M * 2, L = t.L + M * 2
  const H = wallH + (t.roof || 10) + 4
  const v = new V(W, L, H)
  const i0 = M, i1 = W - M - 1, k0 = M, k1 = L - M - 1
  const ci = Math.floor((W - 1) / 2)
  // ── the walls, storey by storey
  const log = v.c(150, 102, 62), logD = v.c(118, 78, 48), logEnd = v.c(214, 170, 112)
  const plaster = v.c(242, 230, 204), plasterD = v.c(222, 206, 176), stone = v.c(156, 150, 144), stoneD = v.c(122, 118, 116)
  const brick = v.c(176, 92, 70), brickD = v.c(146, 74, 58), mortar = v.c(206, 186, 170)
  const timber = v.c(...WOOD_D), timberL = v.c(...WOOD)
  const wallAt = (s: number, i: number, k: number, y: number): number => {
    const corner = (i === i0 || i === i1) && (k === k0 || k === k1)
    if (tier === 0) return corner ? ((y & 1) ? logEnd : logD) : (y % 2 === 0 ? log : logD)
    const ly = y - s * t.storeyH
    if (corner) return timber
    if (ly === t.storeyH - 1) return timberL // the beam along the top of each storey
    if (s === 0 && tier >= 2) {
      // brick, in courses, with mortar
      const course = Math.floor(y / 2)
      if (y % 2 === 1) return mortar
      return ((i + k + (course % 2) * 2) % 4 === 0) ? brickD : brick
    }
    if (s === 0 && ly <= 1) return (i + k) % 3 === 0 ? stoneD : stone
    return ((i * 7 + k * 5 + y * 3) % 23 === 0) ? plasterD : plaster
  }
  for (let s = 0; s < t.storeys; s++) {
    for (let y = s * t.storeyH; y < (s + 1) * t.storeyH; y++) {
      for (let i = i0; i <= i1; i++) { v.set(i, k0, y, wallAt(s, i, k0, y)); v.set(i, k1, y, wallAt(s, i, k1, y)) }
      for (let k = k0; k <= k1; k++) { v.set(i0, k, y, wallAt(s, i0, k, y)); v.set(i1, k, y, wallAt(s, i1, k, y)) }
    }
  }
  // log ends past the corners (the cabin)
  if (tier === 0) for (let y = 0; y < wallH; y += 2) for (const [i, k] of [[i0 - 1, k0], [i1 + 1, k0], [i0 - 1, k1], [i1 + 1, k1], [i0, k0 - 1], [i1, k0 - 1], [i0, k1 + 1], [i1, k1 + 1]]) v.set(i, k, y, logEnd)
  // ── windows: glass (lit at night), a frame, a sill, a box of flowers on the front ones
  const glass = v.c(130, 190, 220), glassL = v.c(200, 230, 245), frame = v.c(250, 246, 236), frameW = v.c(...WOOD_D)
  const box = v.c(196, 84, 64), leaf = v.c(90, 150, 80), fa = v.c(255, 238, 156), fb = v.c(244, 150, 150)
  const fr = tier === 0 ? frameW : frame
  const windowOn = (face: 'front' | 'back' | 'left' | 'right', c: number, y0: number, w: number, h: number, flowers: boolean) => {
    for (let y = y0 - 1; y <= y0 + h; y++) for (let d = -((w >> 1) + 1); d <= (w >> 1) + 1; d++) {
      const edge = y === y0 - 1 || y === y0 + h || Math.abs(d) === (w >> 1) + 1
      const bar = d === 0 || y === y0 + (h >> 1)
      const col = edge || bar ? fr : (d + y) % 5 === 0 ? glassL : glass
      if (face === 'front') v.set(c + d, k1, y, col)
      else if (face === 'back') v.set(c + d, k0, y, col)
      else if (face === 'left') v.set(i0, c + d, y, col)
      else v.set(i1, c + d, y, col)
    }
    if (!flowers) return
    for (let d = -(w >> 1); d <= w >> 1; d++) {
      if (face !== 'front') continue
      v.set(c + d, k1 + 1, y0 - 2, box)
      v.set(c + d, k1 + 1, y0 - 1, (d & 1) ? leaf : d % 4 === 0 ? fa : fb)
    }
  }
  const door = v.c(150, 100, 64), doorD = v.c(112, 72, 46), knob = v.c(230, 200, 110), step = v.c(170, 166, 160)
  const dw = tier === 0 ? 5 : 7, dh = tier === 0 ? 8 : 10
  for (let y = 0; y < dh; y++) for (let d = -(dw >> 1); d <= dw >> 1; d++) {
    const edge = Math.abs(d) === dw >> 1 || y === dh - 1
    v.set(ci + d, k1, y, edge ? doorD : (y % 3 === 0 ? doorD : door))
  }
  v.set(ci + (dw >> 1) - 1, k1 + 1, 4, knob)
  for (let d = -(dw >> 1) - 1; d <= (dw >> 1) + 1; d++) { v.set(ci + d, k1 + 1, 0, step); if (tier > 0) v.set(ci + d, k1 + 2, 0, step) }
  // a little roof over the door
  if (tier >= 1) for (let d = -(dw >> 1) - 1; d <= (dw >> 1) + 1; d++) { v.set(ci + d, k1 + 1, dh, frameW); v.set(ci + d, k1 + 2, dh, frameW); v.set(ci + d, k1 + 1, dh + 1, frameW) }
  const midK = Math.floor((k0 + k1) / 2)
  for (let s = 0; s < t.storeys; s++) {
    const y0 = s * t.storeyH + (tier === 0 ? 4 : 5)
    const wh = tier === 0 ? 4 : 5, ww = tier === 0 ? 5 : 7
    const off = Math.round(t.W / 4) + (tier === 0 ? 1 : 0)
    // the front: either side of the door (upstairs: three across, or the balcony's door in the middle)
    windowOn('front', ci + off, y0, ww, wh, s === 0)
    if (tier > 0 || s > 0) windowOn('front', ci - off, y0, ww, wh, s === 0)
    else windowOn('front', ci - off, y0, ww, wh, true)
    if (s > 0 && tier !== 2) windowOn('front', ci, y0, ww, wh, false)
    windowOn('left', midK, y0, ww, wh, false)
    windowOn('right', midK, y0, ww, wh, false)
    windowOn('back', ci - off, y0, ww, wh, false)
    windowOn('back', ci + off, y0, ww, wh, false)
  }
  // ── the balcony (two storeys and up): over the door, a door of glass onto it, a railing
  if (tier >= 2) {
    const by = t.storeyH
    const bw = 8
    for (let d = -bw; d <= bw; d++) for (let k = k1 + 1; k <= k1 + M; k++) v.set(ci + d, k, by - 1, timberL)
    for (let d = -bw; d <= bw; d++) { v.set(ci + d, k1 + M, by + 3, timber); if (d % 2 === 0) for (let y = by; y <= by + 2; y++) v.set(ci + d, k1 + M, y, timber) }
    for (let k = k1 + 1; k <= k1 + M; k++) for (const d of [-bw, bw]) { v.set(ci + d, k, by + 3, timber); v.set(ci + d, k, by, timber) }
    for (let y = by; y < by + 9; y++) for (let d = -2; d <= 2; d++) v.set(ci + d, k1, y, Math.abs(d) === 2 || y === by + 8 ? frame : d === 0 ? frame : glass)
    // a pot either side
    for (const d of [-bw + 1, bw - 1]) { v.set(ci + d, k1 + 2, by, box); v.set(ci + d, k1 + 2, by + 1, leaf); v.set(ci + d, k1 + 2, by + 2, fb) }
  }
  // ── the roof
  const r = v.c(...roofC), rl = v.c(...roofL), rd = v.c(...dim(roofC, 0.8)), ridge = v.c(...dim(roofC, 0.66))
  const st = v.c(150, 146, 140), sd = v.c(112, 108, 104), pipe = v.c(70, 66, 72)
  if (t.roof) {
    const R = t.roof
    const ka = k0 - 2, kb = k1 + 2, mid = (ka + kb) / 2
    const rise = (k: number) => Math.round(R * (1 - Math.abs(k - mid) / (mid - ka)))
    for (let k = ka; k <= kb; k++) {
      const y = wallH + rise(k)
      for (let i = i0 - 2; i <= i1 + 2; i++) {
        const tile = (i + (y % 2) * 2) % 4 === 0
        const shingle = tier === 0 ? ((i + k) % 3 === 0 ? rd : r) : null
        const c = Math.abs(k - mid) < 1 ? ridge : shingle ?? (k < mid ? (tile ? r : rl) : tile ? rd : r)
        v.set(i, k, y, c)
        if (i === i0 - 2 || i === i1 + 2) v.set(i, k, y - 1, rd)
      }
    }
    // the gables: the wall goes on up under the roof
    for (const i of [i0, i1]) for (let k = k0; k <= k1; k++) for (let y = wallH; y < wallH + rise(k); y++) v.set(i, k, y, tier === 0 ? (y % 2 ? log : logD) : plaster)
    // a round window in each gable
    for (const i of [i0, i1]) { const gy = wallH + Math.round(R * 0.45); v.set(i, Math.round(mid), gy, glass); v.set(i, Math.round(mid) - 1, gy, frame); v.set(i, Math.round(mid) + 1, gy, frame) }
    // the chimney (a stovepipe on the cabin)
    const chI = Math.round(i0 + (i1 - i0) * 0.72), chK = Math.round(mid) - 3
    const base = wallH + rise(chK) - 1
    if (tier === 0) v.box(chI, chK, base, chI + 1, chK + 1, base + 5, pipe)
    else { v.box(chI, chK, base, chI + 3, chK + 3, Math.min(H - 1, wallH + R + 3), st); v.box(chI, chK, Math.min(H - 1, wallH + R + 3), chI + 3, chK + 3, Math.min(H - 1, wallH + R + 3), sd) }
  } else {
    // a flat roof: a parapet round it, a terrace with plants and a little glasshouse at the back
    const tile = v.c(196, 180, 150), tileD = v.c(176, 160, 130)
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) v.set(i, k, wallH, (i + k) % 2 ? tile : tileD)
    for (let i = i0; i <= i1; i++) { v.set(i, k0, wallH + 1, plaster); v.set(i, k1, wallH + 1, plaster); v.set(i, k1, wallH + 2, (i & 1) ? timber : plaster) }
    for (let k = k0; k <= k1; k++) { v.set(i0, k, wallH + 1, plaster); v.set(i1, k, wallH + 1, plaster) }
    const gh = v.c(170, 220, 230), ghF = v.c(240, 240, 236)
    const gi0 = i0 + 4, gi1 = i1 - 10, gk0 = k0 + 2, gk1 = k0 + 11
    for (let y = wallH + 1; y <= wallH + 8; y++) for (let k = gk0; k <= gk1; k++) for (let i = gi0; i <= gi1; i++) {
      const edgeI = i === gi0 || i === gi1, edgeK = k === gk0 || k === gk1
      if (!edgeI && !edgeK && y < wallH + 8) continue
      v.set(i, k, y, (edgeI && edgeK) || y === wallH + 8 && (i - gi0) % 4 === 0 ? ghF : gh)
    }
    for (const [i, k] of [[i1 - 4, k1 - 4], [i0 + 4, k1 - 4], [i1 - 4, k0 + 4], [i1 - 7, k1 - 3]]) {
      v.box(i, k, wallH + 1, i + 1, k + 1, wallH + 2, box)
      v.blob(i + 0.5, k + 0.5, wallH + 4, 1.8, 1.8, 1.6, (a, b, y) => ((a + b + y) % 4 === 0 ? fb : leaf))
    }
    // ivy up the left side
    const ivy = v.c(70, 132, 70), ivyL = v.c(100, 164, 84)
    for (let k = k0; k <= k1; k++) for (let y = 0; y < wallH; y++) if (((k * 13 + y * 7) % 11) < (y < wallH * 0.6 ? 7 : 4) && Math.abs(k - midK) > 4) v.set(i0 - 1, k, y, (k + y) % 3 ? ivy : ivyL)
    v.box(Math.round(i0 + (i1 - i0) * 0.7), k0 + 3, wallH + 1, Math.round(i0 + (i1 - i0) * 0.7) + 3, k0 + 6, wallH + 5, st)
  }
  return v.def(roofName, { lit: [{ idx: glass, rgb: [255, 206, 110] }, { idx: glassL, rgb: [255, 232, 160] }] })
}


/**
 * Tiers 4–9: the three-storey house in the middle, and round it, as it grows: a timber workshop on
 * the right (4), a glasshouse on the left (5), portholes along the stone plinth for the aquarium
 * below (6), a round stone tower at the back corner (7), a pool and parasol on the workshop's flat
 * roof (8), and the tower made a lighthouse — striped, a gallery, a lantern that shines at night (9).
 */
function grandExterior(tier: number, roofName: string, roofC: RGB, roofL: RGB): ModelDef {
  const base = homeExterior(3, roofName + '_core', roofC, roofL)
  const AW = 16
  const W = base.W + AW * 2, L = base.L, H = tier >= 7 ? 78 : base.H
  const v = new V(W, L, H)
  // the core, copied in the middle
  const map = new Map<number, number>()
  const litOf = new Set((base.lit ?? []).map((l) => l.idx))
  const lit: { idx: number; rgb: RGB }[] = []
  base.slices.forEach((sl, y) => {
    for (let k = 0; k < base.L; k++) for (let i = 0; i < base.W; i++) {
      const c = sl[k * base.W + i]
      if (!c) continue
      let n = map.get(c)
      if (!n) {
        n = v.c(...(base.colors[c] as RGB))
        map.set(c, n)
        const l = (base.lit ?? []).find((x) => x.idx === c)
        if (l && litOf.has(c)) lit.push({ idx: n, rgb: l.rgb as RGB })
      }
      v.set(i + AW, k, y, n)
    }
  })
  const M = EXT_M
  const t = EXTERIORS[3]
  const wallH = t.storeys * t.storeyH
  const i0 = AW + M, i1 = AW + M + t.W - 1, k0 = M, k1 = M + t.L - 1
  const ci = Math.floor((W - 1) / 2)
  const glass = v.c(130, 190, 220), glassL = v.c(200, 230, 245), frame = v.c(250, 246, 236)
  lit.push({ idx: glass, rgb: [255, 206, 110] })
  const r = v.c(...roofC), rl = v.c(...roofL), rd = v.c(...dim(roofC, 0.8))
  const leaf = v.c(90, 150, 80), leafL = v.c(130, 190, 96), fa = v.c(255, 238, 156), fb = v.c(244, 150, 150)
  // ── the workshop (right): vertical boards, a big double door, a pitched roof (flat with a pool at 8)
  const aI0 = i1 + 1, aI1 = W - M - 1, aK0 = k0 + 8, aH = 15
  const plank = v.c(...WOOD), plankD = v.c(...WOOD_D), plankL = v.c(...WOOD_L)
  for (let y = 0; y < aH; y++) {
    for (let i = aI0; i <= aI1; i++) { v.set(i, aK0, y, i % 3 ? plank : plankD); v.set(i, k1, y, i % 3 ? plank : plankD) }
    for (let k = aK0; k <= k1; k++) v.set(aI1, k, y, k % 3 ? plank : plankD)
  }
  const dc = Math.round((aI0 + aI1) / 2)
  for (let y = 0; y < 10; y++) for (let d = -4; d <= 4; d++) v.set(dc + d, k1, y, d === 0 || Math.abs(d) === 4 || y === 9 ? plankD : (Math.abs(d) - 1 === Math.round(y * 3 / 9)) ? plankL : plank)
  for (let y = 2; y < 7; y++) v.set(aI1, Math.round((aK0 + k1) / 2), y, glass)
  if (tier >= 8) {
    // the flat roof: a pool, a deck, a rail, a parasol and two chairs
    const deck = v.c(196, 160, 116), water = v.c(70, 170, 210), waterL = v.c(150, 216, 238), rail = v.c(240, 240, 236), shade = v.c(230, 80, 70)
    for (let k = aK0; k <= k1; k++) for (let i = aI0; i <= aI1; i++) v.set(i, k, aH, (i + k) % 2 ? deck : plankL)
    for (let k = aK0 + 3; k <= k1 - 3; k++) for (let i = aI0 + 2; i <= aI1 - 3; i++) v.set(i, k, aH, (i * 3 + k) % 7 === 0 ? waterL : water)
    for (let i = aI0; i <= aI1; i++) { v.set(i, aK0, aH + 1, rail); v.set(i, k1, aH + 2, rail); if (i % 3 === 0) v.set(i, k1, aH + 1, rail) }
    for (let k = aK0; k <= k1; k++) { v.set(aI1, k, aH + 2, rail); if (k % 3 === 0) v.set(aI1, k, aH + 1, rail) }
    v.box(aI1 - 1, k1 - 2, aH + 1, aI1 - 1, k1 - 2, aH + 7, rail)
    v.blob(aI1 - 1, k1 - 2, aH + 7.5, 4, 4, 0.6, (i, k) => ((i + k) % 2 ? shade : frame))
  } else {
    const ka = aK0 - 1, kb = k1 + 1, mid = (ka + kb) / 2
    for (let k = ka; k <= kb; k++) {
      const y = aH + Math.round(6 * (1 - Math.abs(k - mid) / (mid - ka)))
      for (let i = aI0; i <= aI1 + 1; i++) v.set(i, k, y, k < mid ? (i % 4 ? r : rl) : i % 4 ? rd : r)
      for (let yy = aH; yy < y; yy++) v.set(aI1, k, yy, plank)
    }
  }
  // a sign over the door: a saw
  const iron = v.c(140, 144, 156)
  for (let d = -2; d <= 2; d++) v.set(dc + d, k1 + 1, 11, iron)
  if (tier >= 5) {
    // ── the glasshouse (left): a white frame, glass, green things inside, a glass ridge roof
    const gI0 = M, gI1 = i0 - 1, gK0 = k0 + 8, gH = 14
    for (let y = 0; y <= gH; y++) {
      for (let i = gI0; i <= gI1; i++) for (const k of [gK0, k1]) v.set(i, k, y, y === 0 || y === gH || (i - gI0) % 4 === 0 ? frame : y % 5 === 0 ? glassL : glass)
      for (let k = gK0; k <= k1; k++) v.set(gI0, k, y, y === 0 || y === gH || (k - gK0) % 4 === 0 ? frame : y % 5 === 0 ? glassL : glass)
    }
    const ka = gK0, kb = k1, mid = (ka + kb) / 2
    for (let k = ka; k <= kb; k++) {
      const y = gH + Math.round(5 * (1 - Math.abs(k - mid) / (mid - ka)))
      for (let i = gI0; i <= gI1; i++) v.set(i, k, y, (i - gI0) % 4 === 0 || Math.abs(k - mid) < 1 ? frame : glassL)
      for (let yy = gH; yy < y; yy++) v.set(gI0, k, yy, glass)
    }
    // plants inside, seen through the glass
    for (let i = gI0 + 2; i <= gI1 - 1; i += 3) for (let k = gK0 + 2; k <= k1 - 2; k += 4) v.blob(i, k, 3 + ((i + k) % 3), 1.4, 1.4, 2.5, (a, b, y) => ((a + b + y) % 5 === 0 ? ((a + y) % 2 ? fa : fb) : (a + y) % 3 ? leaf : leafL))
  }
  if (tier >= 6) {
    // ── portholes along the plinth: the aquarium is down there
    const brass = v.c(214, 176, 90), sea = v.c(40, 120, 180), fish = v.c(250, 170, 70)
    for (const d of [-17, -11, 11, 17]) {
      const c = ci + d
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) v.set(c + a, k1 + 1, 2 + b, Math.abs(a) + Math.abs(b) === 2 ? 0 : a === 0 && b === 0 ? (d > 0 ? fish : sea) : brass)
      v.set(c - 1, k1 + 1, 1, brass); v.set(c + 1, k1 + 1, 3, brass)
      v.set(c, k1, 2, sea)
    }
  }
  if (tier >= 7) {
    // ── the round tower at the back right corner, up past the roof
    const tc = i1 - 3, tk = k0 + 4, R = 6, top = tier >= 9 ? 62 : 58
    const stone = v.c(176, 168, 156), stoneD = v.c(140, 134, 126), white = v.c(244, 242, 236), red = v.c(200, 56, 48)
    for (let y = 0; y < top; y++) for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2
      const i = Math.round(tc + Math.cos(ang) * R), k = Math.round(tk + Math.sin(ang) * R)
      const band = Math.floor(y / 8) % 2
      const c = tier >= 9 ? (band ? red : white) : (i + k + Math.floor(y / 2)) % 5 === 0 ? stoneD : stone
      v.set(i, k, y, c)
    }
    // windows up the side, facing the front
    for (const y of [44, 51]) for (let d = -1; d <= 1; d++) { v.set(tc + d, tk + R, y, glass); v.set(tc + d, tk + R, y + 1, glass) }
    if (tier >= 9) {
      // the gallery, the lantern and its dome
      const rail = v.c(60, 60, 68), dome = v.c(170, 40, 40), lamp = v.c(255, 236, 150)
      lit.push({ idx: lamp, rgb: [255, 244, 180] })
      for (let a = 0; a < 80; a++) {
        const ang = (a / 80) * Math.PI * 2
        for (const rr of [R + 1, R + 2]) v.set(Math.round(tc + Math.cos(ang) * rr), Math.round(tk + Math.sin(ang) * rr), top, rail)
        if (a % 4 === 0) v.set(Math.round(tc + Math.cos(ang) * (R + 2)), Math.round(tk + Math.sin(ang) * (R + 2)), top + 1, rail)
        v.set(Math.round(tc + Math.cos(ang) * (R + 2)), Math.round(tk + Math.sin(ang) * (R + 2)), top + 2, rail)
      }
      v.blob(tc, tk, top + 5, R - 2, R - 2, 4, (i, k, y) => ((i + k) % 3 === 0 && y > top + 1 ? rail : (y - top) % 4 === 0 ? glass : lamp))
      v.blob(tc, tk, top + 10, R - 1, R - 1, 3, () => dome)
      v.set(tc, tk, top + 14, rail); v.set(tc, tk, top + 15, rail)
    } else {
      // a pointed roof
      for (let y = top; y < top + 12; y++) {
        const rr = (R + 1) * (1 - (y - top) / 12)
        for (let a = 0; a < 64; a++) { const ang = (a / 64) * Math.PI * 2; v.set(Math.round(tc + Math.cos(ang) * rr), Math.round(tk + Math.sin(ang) * rr), y, (y + a) % 4 ? r : rd) }
      }
    }
  }
  return v.def(roofName, { lit, glow: tier >= 9 ? [{ idx: lit[lit.length - 1].idx, alt: [255, 250, 210] }] : undefined })
}

// ───────────────────────────────────────────────────────────── the stairs
/** stairs up: eight steps rising to the back (k = 0), a handrail on the right. 11 × 16 */
function stairsUp(): ModelDef {
  const v = new V(11, 16, 22)
  const tread = v.c(...WOOD_L), riser = v.c(...WOOD), side = v.c(...WOOD_D), rail = v.c(120, 84, 56), post = v.c(96, 66, 44)
  for (let s = 0; s < 8; s++) {
    const kA = 15 - s * 2 - 1, kB = 15 - s * 2
    const top = s * 2 + 1
    for (let k = kA; k <= kB; k++) for (let y = 0; y <= top; y++) for (let i = 0; i < 10; i++) v.set(i, k, y, y === top ? tread : k === kB ? riser : side)
  }
  // the landing at the top
  for (let k = 0; k <= 0; k++) for (let y = 0; y <= 16; y++) for (let i = 0; i < 10; i++) v.set(i, k, y, y === 16 ? tread : side)
  // the handrail, on the right-hand side as you go up
  for (let k = 0; k < 16; k++) {
    const s = Math.max(0, Math.min(7, Math.floor((15 - k) / 2)))
    const base = s * 2 + 1
    v.set(10, k, base + 5, rail)
    if (k % 3 === 1) for (let y = 0; y <= base + 4; y++) v.set(10, k, y, post)
    else v.set(10, k, base, side)
  }
  return v.def('i_stairs', shell)
}
/** the top of the stairs on the floor above: a banister round three sides of the stairwell (the
 * open side is the way down) */
function stairsDown(): ModelDef {
  const v = new V(11, 16, 8)
  const rail = v.c(120, 84, 56), post = v.c(96, 66, 44), step = v.c(...WOOD), dark = v.c(64, 50, 40)
  // the steps going down, seen through the hole
  for (let k = 3; k < 15; k++) v.set(5, k, 0, (k & 1) ? step : dark)
  for (let i = 1; i < 10; i++) for (let k = 3; k < 15; k += 2) v.set(i, k, 0, step)
  const railAt = (i: number, k: number) => { v.set(i, k, 7, rail); if ((i + k) % 3 === 0) for (let y = 1; y < 7; y++) v.set(i, k, y, post) }
  for (let i = 0; i < 11; i++) railAt(i, 0)
  for (let k = 0; k < 13; k++) { railAt(0, k); railAt(10, k) }
  for (const [i, k] of [[0, 0], [10, 0], [0, 12], [10, 12]]) for (let y = 0; y < 8; y++) v.set(i, k, y, post)
  return v.def('i_stairsDown', shell)
}

// ───────────────────────────────────────────────────────────── the little stove
/** a cast-iron stove, round-bellied, its door glowing, a pipe up the wall. 9 × 8 */
function woodStove(): ModelDef {
  const v = new V(9, 8, 17)
  const iron = v.c(58, 56, 62), ironL = v.c(86, 84, 92), fire = v.c(255, 150, 60), fireL = v.c(255, 210, 110), brass = v.c(210, 170, 90)
  for (const [i, k] of [[1, 1], [7, 1], [1, 6], [7, 6]]) v.set(i, k, 0, iron)
  v.blob(4, 3.5, 5, 3.6, 3.4, 4.2, (i, k, y) => (y === 9 ? ironL : (k + y) % 5 === 0 ? ironL : iron))
  v.box(1, 0, 9, 7, 7, 9, ironL)
  for (let y = 3; y <= 6; y++) for (let i = 3; i <= 5; i++) v.set(i, 7, y, y === 3 || (i + y) % 2 ? fire : fireL)
  v.set(4, 7, 7, brass)
  v.box(3, 1, 10, 4, 2, 16, iron)
  return v.def('i_woodStove', { ...shell, lit: [{ idx: fire, rgb: [255, 160, 70] }, { idx: fireL, rgb: [255, 220, 120] }], glow: [{ idx: fire, alt: [255, 190, 80] }] })
}

// ───────────────────────────────────────────────────────────── memories
/** a frame on the wall with a picture in it: `pix` is the picture, rows from the top (11 × 8);
 * without one, a little drawing of the sea */
export function photoFrame(name: string, pix?: RGB[][]): ModelDef {
  const v = new V(13, 1, 10)
  const fr = v.c(...WOOD_D), frL = v.c(...WOOD_L)
  for (let y = 0; y < 10; y++) for (let i = 0; i < 13; i++) {
    const edge = i === 0 || i === 12 || y === 0 || y === 9
    if (edge) { v.set(i, 0, y, (i + y) % 4 === 0 ? frL : fr); continue }
    const row = 8 - y, col = i - 1 // the picture's top row is at the top
    const p = pix?.[row]?.[col]
    if (p) {
      // into the model's palette: a colour close to one already in it is shared (95 at most)
      const q: RGB = [p[0] & 0xf0, p[1] & 0xf0, p[2] & 0xf0]
      let idx: number
      try { idx = v.c(...q) } catch { idx = v.c(...([[96, 144, 192], [240, 220, 170], [90, 150, 80]][(i + y) % 3] as RGB)) }
      v.set(i, 0, y, idx)
    } else v.set(i, 0, y, y > 5 ? v.c(150, 200, 240) : y === 5 ? v.c(250, 240, 200) : (i + y) % 4 === 0 ? v.c(120, 180, 220) : v.c(60, 120, 190))
  }
  return v.def(name, shell)
}
/** the guestbook: an open book with a ribbon and a pen, on a tabletop */
function guestbook(): ModelDef {
  const v = new V(7, 5, 3)
  const cover = v.c(150, 70, 60), page = v.c(250, 244, 226), line = v.c(170, 160, 150), ribbon = v.c(220, 60, 70), pen = v.c(40, 44, 60)
  v.box(0, 0, 0, 6, 4, 0, cover)
  v.box(0, 0, 1, 2, 4, 1, page); v.box(4, 0, 1, 6, 4, 1, page)
  v.box(3, 0, 1, 3, 4, 1, cover)
  for (const k of [1, 3]) { v.set(1, k, 1, line); v.set(5, k, 1, line) }
  v.set(3, 4, 2, ribbon); v.set(3, 3, 1, ribbon)
  v.set(6, 1, 2, pen); v.set(5, 2, 2, pen)
  return v.def('i_guestbook', shell)
}

// ───────────────────────────────────────────────────────────── close up (half-size voxels)
/** the bed, twice as fine: a patchwork quilt with piping, a plumped pillow, a carved headboard.
 * 26 × 38 voxels drawn at half size (the same 13 × 19 on the floor) */
export function bedHD(sleeper?: { skin: RGB; hair: RGB }): ModelDef {
  const v = new V(26, 38, 18)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), wl = v.c(...WOOD_L)
  const sheet = v.c(246, 242, 232), sheetD = v.c(226, 220, 206)
  const pil = v.c(255, 255, 250), pilD = v.c(232, 230, 222)
  const q = [v.c(96, 140, 200), v.c(132, 176, 226), v.c(230, 196, 120), v.c(214, 120, 110), v.c(240, 232, 214)]
  const pipe = v.c(70, 104, 160)
  v.box(0, 0, 0, 25, 37, 4, wd) // the frame
  v.box(1, 1, 5, 24, 36, 5, wd)
  // the headboard: posts, a top rail, slats
  v.box(0, 0, 5, 1, 2, 17, w); v.box(24, 0, 5, 25, 2, 17, w)
  v.box(0, 0, 15, 25, 2, 16, w); v.box(2, 1, 17, 23, 1, 17, wl)
  for (let i = 3; i <= 22; i += 3) v.box(i, 1, 6, i + 1, 1, 14, wl)
  // the mattress and the sheet
  v.box(1, 3, 6, 24, 36, 7, sheet)
  for (let i = 1; i <= 24; i++) v.set(i, 36, 6, sheetD)
  // the pillow: plump, with a crease
  for (let i = 4; i <= 21; i++) for (let k = 4; k <= 9; k++) {
    const d = Math.abs(k - 6.5) / 3.5 + Math.abs(i - 12.5) / 12
    const top = 8 + (d < 0.8 ? 2 : 1)
    for (let y = 8; y <= top; y++) v.set(i, k, y, i === 12 || i === 13 ? pilD : pil)
  }
  // the quilt: squares of four colours, piped round the edge, folded back at the top
  for (let k = 13; k <= 37; k++) for (let i = 0; i <= 25; i++) {
    const edge = i === 0 || i === 25 || k === 37
    const sq = q[((Math.floor(i / 6) + Math.floor((k - 13) / 6)) % 4 + 4) % 4]
    v.set(i, k, 8, edge ? pipe : ((i % 6 === 0 || (k - 13) % 6 === 0) ? q[4] : sq))
    if (i === 0 || i === 25) for (let y = 5; y <= 7; y++) v.set(i, k, y, (k + y) % 2 ? pipe : sq)
    if (k === 37) for (let y = 5; y <= 7; y++) v.set(i, k, y, (i + y) % 2 ? pipe : sq)
  }
  for (let i = 1; i <= 24; i++) { v.set(i, 12, 8, sheet); v.set(i, 13, 9, sheet); v.set(i, 14, 9, q[4]) }
  // the foot board
  v.box(0, 37, 5, 25, 37, 9, w); v.box(0, 37, 10, 25, 37, 10, wl)
  if (sleeper) {
    const sk = v.c(...sleeper.skin), hr = v.c(...sleeper.hair), skD = v.c(...dim(sleeper.skin, 0.86)), lash = v.c(40, 44, 58), blush = v.c(240, 150, 140)
    // the head on the pillow, turned up; hair spread on the pillow
    v.blob(12.5, 7.5, 11.5, 4.6, 3.8, 3.2, (i, k, y) => (k < 6 || y > 13 ? hr : (k === 11 && y <= 11) ? skD : sk))
    for (let i = 7; i <= 18; i++) for (let k = 4; k <= 7; k++) if (Math.hypot(i - 12.5, k - 5.5) < 6) v.set(i, k, 11, hr)
    v.set(10, 11, 12, lash); v.set(11, 11, 12, lash); v.set(14, 11, 12, lash); v.set(15, 11, 12, lash)
    v.set(9, 11, 11, blush); v.set(16, 11, 11, blush)
    // the body under the quilt: a long hump, the quilt pulled to the chin
    for (let k = 12; k <= 33; k++) for (let i = 5; i <= 20; i++) {
      const hump = Math.round(3 * Math.sqrt(Math.max(0, 1 - ((i - 12.5) / 8) ** 2)) * (k > 29 ? 0.6 : 1))
      if (hump <= 0) continue
      const sq = q[((Math.floor(i / 6) + Math.floor((k - 13) / 6)) % 4 + 4) % 4]
      for (let y = 9; y <= 8 + hump; y++) v.set(i, k, y, y === 8 + hump ? ((i % 6 === 0 || (k - 13) % 6 === 0) ? q[4] : sq) : sq)
    }
    for (let i = 6; i <= 19; i++) v.set(i, 12, 11, sheet)
    return v.def('i_bed_sleep_hd', shell)
  }
  return v.def('i_bed_hd', shell)
}
/** the bedside table, twice as fine: two drawers with brass knobs, a book on the shelf */
function nightstandHD(): ModelDef {
  const v = new V(14, 12, 14)
  const w = v.c(...WOOD), wd = v.c(...WOOD_D), wl = v.c(...WOOD_L), knob = v.c(230, 200, 120), book = v.c(120, 150, 200)
  v.box(0, 0, 0, 13, 11, 13, w)
  v.box(0, 0, 13, 13, 11, 13, wl)
  for (const [y0, y1] of [[2, 5], [7, 10]]) { v.box(1, 11, y0, 12, 11, y1, wd); v.box(2, 11, y0 + 1, 11, 11, y1 - 1, w); v.set(6, 11, (y0 + y1) >> 1, knob); v.set(7, 11, (y0 + y1) >> 1, knob) }
  for (const [i, k] of [[0, 11], [13, 11], [0, 0], [13, 0]]) v.set(i, k, 0, wd)
  v.box(9, 2, 14 - 1, 12, 6, 13, book)
  return v.def('i_nightstand_hd', shell)
}
/** the table lamp, twice as fine: a turned base and a pleated shade */
function tableLampHD(): ModelDef {
  const v = new V(8, 8, 12)
  const base = v.c(90, 86, 96), baseL = v.c(130, 126, 136), shade = v.c(250, 226, 160), shadeD = v.c(230, 196, 120), bulb = v.c(255, 246, 210)
  v.cyl(3.5, 3.5, 0, 0, 2.6, base); v.cyl(3.5, 3.5, 1, 1, 1.6, baseL)
  v.box(3, 3, 2, 4, 4, 5, base)
  v.set(3, 3, 6, bulb); v.set(4, 4, 6, bulb)
  for (let y = 6; y <= 11; y++) {
    const r = 3.8 - (y - 6) * 0.3
    for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) {
      const d = Math.hypot(i - 3.5, k - 3.5)
      if (d > r || d < r - 1.2) continue
      v.set(i, k, y, (Math.round(Math.atan2(k - 3.5, i - 3.5) * 4) & 1) || y === 6 ? shadeD : shade)
    }
  }
  return v.def('i_tableLamp_hd', { ...shell, lit: [{ idx: shade, rgb: [255, 236, 160] }, { idx: shadeD, rgb: [255, 214, 130] }, { idx: bulb, rgb: [255, 250, 220] }] })
}
/** the stove, twice as fine */
function woodStoveHD(): ModelDef {
  const v = new V(18, 16, 34)
  const iron = v.c(58, 56, 62), ironL = v.c(92, 90, 98), ironD = v.c(40, 38, 44), fire = v.c(255, 150, 60), fireL = v.c(255, 214, 120), ember = v.c(200, 70, 40), brass = v.c(214, 176, 96)
  for (const [i, k] of [[2, 2], [15, 2], [2, 13], [15, 13]]) v.box(i, k, 0, i, k, 2, ironD)
  v.blob(8.5, 7.5, 10, 7.4, 6.8, 8.2, (i, k, y) => (y >= 18 ? ironL : (y % 4 === 0) ? ironL : iron))
  v.box(2, 1, 18, 15, 14, 19, ironL)
  for (let i = 3; i <= 14; i++) v.set(i, 1, 19, brass)
  // the door: a little arched window onto the fire
  for (let y = 5; y <= 13; y++) for (let i = 5; i <= 12; i++) {
    const arch = y > 11 && Math.abs(i - 8.5) > 2.5
    if (arch) continue
    const edge = i === 5 || i === 12 || y === 5 || (y === 13 || (y > 11 && Math.abs(i - 8.5) > 1.5))
    v.set(i, 15, y, edge ? brass : y < 7 ? ember : (i + y) % 3 === 0 ? fireL : fire)
  }
  v.set(13, 15, 9, brass)
  v.box(7, 3, 20, 9, 5, 33, iron); v.box(7, 3, 26, 9, 5, 26, ironL)
  return v.def('i_woodStove_hd', { ...shell, lit: [{ idx: fire, rgb: [255, 160, 70] }, { idx: fireL, rgb: [255, 224, 130] }, { idx: ember, rgb: [230, 90, 50] }], glow: [{ idx: fire, alt: [255, 190, 80] }] })
}


// ───────────────────────────────────────────────────────────── the bigger house (round 17)
/** the workshop's bench: a thick top, a vice, tools on a board behind, drawers under. 19 × 8 */
function homeBench(): ModelDef {
  const v = new V(19, 8, 18)
  const top = v.c(196, 150, 96), topD = v.c(160, 116, 72), leg = v.c(...WOOD_D), board = v.c(150, 112, 72), iron = v.c(90, 90, 100), red = v.c(196, 70, 54), knob = v.c(220, 190, 110)
  for (const [i, k] of [[1, 2], [17, 2], [1, 6], [17, 6]]) v.box(i, k, 0, i, k, 7, leg)
  v.box(2, 2, 2, 16, 6, 2, topD)
  v.box(0, 1, 8, 18, 7, 9, top); v.box(0, 7, 8, 18, 7, 8, topD)
  for (const i of [4, 9, 14]) { v.box(i - 2, 7, 4, i + 2, 7, 6, board); v.set(i, 7, 5, knob) }
  // the board behind with tools hung on it
  v.box(0, 0, 10, 18, 0, 17, board)
  v.box(2, 0, 12, 2, 0, 16, leg); v.box(1, 0, 16, 3, 0, 16, iron)
  v.box(6, 0, 11, 6, 0, 15, leg); v.box(5, 0, 14, 7, 0, 15, red)
  v.box(10, 0, 12, 13, 0, 12, iron); v.set(10, 0, 13, iron); v.set(13, 0, 13, iron)
  v.box(15, 0, 11, 16, 0, 15, iron)
  // a vice at the front corner
  v.box(15, 6, 10, 17, 7, 11, iron); v.set(16, 7, 12, red)
  return v.def('i_homeBench', shell)
}
/** a planter shelf: two tiers of boxes with things growing in them. 16 × 6 */
function planter(): ModelDef {
  const v = new V(16, 6, 13)
  const wood = v.c(...WOOD), woodD = v.c(...WOOD_D), soil = v.c(96, 66, 46), leaf = v.c(86, 156, 78), leafL = v.c(130, 192, 96), red = v.c(220, 72, 60), yel = v.c(250, 214, 90), pink = v.c(240, 150, 170)
  for (const i of [0, 15]) v.box(i, 0, 0, i, 5, 9, woodD)
  v.box(1, 0, 2, 14, 5, 3, wood); v.box(1, 1, 3, 14, 4, 3, soil)
  v.box(1, 0, 7, 14, 2, 8, wood); v.box(1, 1, 8, 14, 1, 8, soil)
  for (let i = 2; i <= 13; i += 2) {
    v.box(i, 2, 4, i, 3, 5 + (i % 4 ? 1 : 0), i % 4 ? leaf : leafL)
    v.set(i, 2, 6 + (i % 4 ? 1 : 0), [red, yel, pink][(i >> 1) % 3])
    v.box(i, 1, 9, i, 1, 10, leafL); v.set(i, 1, 11, i % 4 ? yel : red)
  }
  return v.def('i_planter', shell)
}
/** a brass telescope on a tripod, pointed up at the sky. 9 × 9 */
function telescope(): ModelDef {
  const v = new V(9, 9, 18)
  const brass = v.c(214, 176, 90), brassD = v.c(166, 128, 60), leg = v.c(...WOOD_D), glass = v.c(140, 200, 230)
  for (const [i, k] of [[0, 8], [8, 8], [4, 0]]) for (let y = 0; y <= 8; y++) v.set(Math.round(i + (4 - i) * y / 8), Math.round(k + (4.5 - k) * y / 8), y, leg)
  v.box(3, 4, 8, 5, 5, 9, brassD)
  for (let t = 0; t <= 9; t++) { const k = 6 - Math.round(t * 0.6), y = 9 + t; v.box(3, k, y, 5, k + 1, y, t === 9 ? glass : t % 3 === 0 ? brassD : brass) }
  return v.def('i_telescope', shell)
}
/** a pool sunk in the floor: a tiled rim and the water, set out as a rug is. 29 × 19 */
function pool(): ModelDef {
  const v = new V(29, 19, 2)
  const tile = v.c(236, 236, 228), tileD = v.c(206, 214, 216), water = v.c(70, 170, 210), waterL = v.c(140, 214, 236), waterD = v.c(46, 132, 186)
  for (let k = 0; k < 19; k++) for (let i = 0; i < 29; i++) {
    const rim = i < 2 || i > 26 || k < 2 || k > 16
    v.set(i, k, 0, rim ? ((i + k) % 2 ? tile : tileD) : (i * 3 + k * 5) % 11 === 0 ? waterL : k < 5 ? waterD : water)
    if (rim) v.set(i, k, 1, (i + k) % 2 ? tile : tileD)
  }
  // the ladder at one end
  for (const i of [5, 8]) v.set(i, 2, 1, v.c(200, 204, 210))
  return v.def('i_pool', shell)
}
/** a canvas deck chair, lying back. 7 × 14 */
function deckChair(): ModelDef {
  const v = new V(7, 14, 7)
  const wood = v.c(...WOOD_L), woodD = v.c(...WOOD_D), cloth = v.c(70, 140, 200), clothL = v.c(246, 242, 232)
  for (const i of [0, 6]) { v.box(i, 0, 0, i, 13, 0, woodD); v.box(i, 0, 1, i, 1, 6, wood) }
  for (let k = 2; k <= 13; k++) for (let i = 1; i <= 5; i++) v.set(i, k, 2, (i % 2) ? cloth : clothL)
  for (let k = 0; k <= 2; k++) for (let i = 1; i <= 5; i++) v.set(i, k, 3 + (2 - k) * 1.5, (i % 2) ? cloth : clothL)
  return v.def('i_deckChair', shell)
}
/** the lighthouse lamp: a brass stand, a great lens round a light. 15 × 15 */
function beacon(): ModelDef {
  const v = new V(15, 15, 22)
  const brass = v.c(214, 176, 90), brassD = v.c(160, 124, 60), lens = v.c(200, 236, 250), lensD = v.c(150, 206, 230), light = v.c(255, 236, 150), red = v.c(196, 60, 52)
  v.blob(7, 7, 1, 6.5, 6.5, 1.5, () => brassD)
  v.box(5, 5, 2, 9, 9, 6, brass)
  v.blob(7, 7, 13, 5.8, 5.8, 7, (i, k, y) => (y % 3 === 0 ? brass : (i + k) % 2 ? lens : lensD))
  v.blob(7, 7, 13, 2.6, 2.6, 3.4, () => light)
  v.blob(7, 7, 20.5, 4, 4, 1.5, () => red)
  return v.def('i_beacon', { ...shell, lit: [{ idx: light, rgb: [255, 240, 170] }, { idx: lens, rgb: [255, 246, 210] }], glow: [{ idx: light, alt: [255, 250, 200] }] })
}

/** the house's own models (the exteriors are drawn when the island is) */
export function homeModels(): ModelDef[] {
  return [homeBench(), planter(), telescope(), pool(), deckChair(), beacon(), stairsUp(), stairsDown(), woodStove(), photoFrame('i_photo'), guestbook(), bedHD(), nightstandHD(), tableLampHD(), woodStoveHD()]
}
/** the close-up stand-in for a model by the bed (half-size voxels), if it has one */
export const HD: Record<string, string> = { i_bed: 'i_bed_hd', i_bed_sleep: 'i_bed_sleep_hd', i_nightstand: 'i_nightstand_hd', i_tableLamp: 'i_tableLamp_hd', i_woodStove: 'i_woodStove_hd' }
