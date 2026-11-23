// People, built from parts: a big round head (as in Animal Crossing, so a face reads at this
// size), a body that is slim, plain or broad, arms and legs, and on top of that a hairstyle, a
// beard, a hat, clothes in any colour. The player makes theirs at the start (and changes it at
// the wardrobe); the islanders are made the same way, each with a look of their own.
//
// Axes as everywhere: i across, k front (0, the way they face) to back, y up. A standing person
// is 9 across, 7 deep, 17 tall (a bun or a tall hat reaches the top).

import type { ModelDef } from './models'
import { $t } from '../i18n'

type RGB = [number, number, number]
export type Hair = 'short' | 'buzz' | 'long' | 'ponytail' | 'bun' | 'curly' | 'spiky' | 'bald'
export type Beard = 'none' | 'stubble' | 'mustache' | 'goatee' | 'full'
export type Build = 'slim' | 'plain' | 'strong'
export type Hat = 'none' | 'cap' | 'aviator' | 'beanie' | 'straw'
export type Top = 'tee' | 'sweater' | 'jacket' | 'dress'
export type Bottom = 'trousers' | 'shorts' | 'overalls' | 'skirt'
export interface Look {
  body: 'm' | 'f'
  build: Build
  skin: number
  hair: Hair
  hairColor: number
  beard: Beard
  eyes: number
  hat: Hat
  shirt: RGB
  pants: RGB
  scarf: boolean
  /** the cut of the clothes (round 10): a T-shirt and trousers unless chosen */
  top?: Top
  bottom?: Bottom
  /** worn over everything when it rains outside (not saved: the game puts it on and takes it off) */
  raincoat?: boolean
}

export const SKINS: RGB[] = [[255, 222, 196], [246, 200, 160], [226, 172, 128], [196, 138, 96], [150, 100, 70], [104, 70, 52]]
export const HAIR_COLORS: RGB[] = [[40, 34, 40], [96, 60, 40], [150, 96, 52], [226, 186, 110], [200, 80, 50], [236, 236, 236], [110, 130, 220], [240, 140, 190]]
export const EYE_COLORS: RGB[] = [[34, 30, 40], [70, 110, 170], [70, 130, 90], [130, 80, 50]]
export const CLOTHES: RGB[] = [[232, 96, 60], [70, 110, 170], [60, 130, 90], [240, 200, 80], [150, 100, 170], [244, 244, 236], [50, 52, 64], [240, 150, 170], [84, 178, 190], [150, 104, 60]]
export const HAIR_NAMES: Record<Hair, string> = { short: $t('短发'), buzz: $t('寸头'), long: $t('长发'), ponytail: $t('马尾'), bun: $t('丸子头'), curly: $t('卷发'), spiky: $t('刺头'), bald: $t('光头') }
export const BEARD_NAMES: Record<Beard, string> = { none: $t('无'), stubble: $t('胡茬'), mustache: $t('八字胡'), goatee: $t('山羊胡'), full: $t('络腮胡') }
export const BUILD_NAMES: Record<Build, string> = { slim: $t('偏瘦'), plain: $t('匀称'), strong: $t('健壮') }
export const HAT_NAMES: Record<Hat, string> = { none: $t('不戴'), cap: $t('鸭舌帽'), aviator: $t('飞行帽'), beanie: $t('毛线帽'), straw: $t('草帽') }
export const TOP_NAMES: Record<Top, string> = { tee: $t('T恤'), sweater: $t('毛衣'), jacket: $t('夹克'), dress: $t('连衣裙') }
export const BOTTOM_NAMES: Record<Bottom, string> = { trousers: $t('长裤'), shorts: $t('短裤'), overalls: $t('背带裤'), skirt: $t('短裙') }
export const RAINCOAT: RGB = [250, 206, 60]

/** the pilot of the prototype, as near as the new parts come */
export const DEFAULT_LOOK: Look = {
  body: 'm', build: 'plain', skin: 1, hair: 'short', hairColor: 1, beard: 'none', eyes: 0, hat: 'aviator',
  shirt: [232, 96, 60], pants: [58, 84, 140], scarf: true,
}

/** the four islanders: 阿澈 (石峰岛), Mio (珊瑚环礁), Lena (雾松岛), 老周 (赤砂岛) */
export const ISLANDER_LOOKS: Record<'A' | 'B' | 'C' | 'D', Look> = {
  A: { body: 'm', build: 'strong', skin: 2, hair: 'spiky', hairColor: 0, beard: 'stubble', eyes: 0, hat: 'none', shirt: [70, 110, 170], pants: [80, 70, 60], scarf: false, top: 'jacket', bottom: 'trousers' },
  B: { body: 'f', build: 'slim', skin: 0, hair: 'bun', hairColor: 7, beard: 'none', eyes: 1, hat: 'none', shirt: [240, 150, 170], pants: [90, 120, 150], scarf: true, top: 'dress' },
  C: { body: 'f', build: 'plain', skin: 1, hair: 'long', hairColor: 3, beard: 'none', eyes: 2, hat: 'beanie', shirt: [60, 130, 90], pants: [70, 60, 50], scarf: false, top: 'sweater', bottom: 'trousers' },
  D: { body: 'm', build: 'plain', skin: 3, hair: 'short', hairColor: 5, beard: 'full', eyes: 3, hat: 'straw', shirt: [150, 100, 170], pants: [60, 70, 110], scarf: false, top: 'tee', bottom: 'overalls' },
}
/** a look from a number: the islanders, each their own */
export function lookFrom(seed: number): Look {
  let n = seed * 2654435761
  const r = (k: number) => { n = (n ^ (n >>> 15)) * 2246822519 + k; return ((n >>> 0) % 10007) / 10007 }
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r(a.length) * a.length)]
  const body = r(1) < 0.5 ? 'm' : 'f'
  return {
    body, build: pick(['slim', 'plain', 'plain', 'strong'] as const), skin: Math.floor(r(2) * SKINS.length),
    hair: pick(body === 'f' ? (['long', 'ponytail', 'bun', 'curly', 'short'] as const) : (['short', 'buzz', 'curly', 'spiky', 'bald', 'short'] as const)),
    hairColor: Math.floor(r(3) * HAIR_COLORS.length), beard: body === 'm' ? pick(['none', 'none', 'stubble', 'mustache', 'goatee', 'full'] as const) : 'none',
    eyes: Math.floor(r(4) * EYE_COLORS.length), hat: pick(['none', 'none', 'cap', 'beanie', 'straw'] as const),
    shirt: pick(CLOTHES), pants: pick([[58, 84, 140], [80, 70, 60], [60, 70, 110], [90, 120, 150], [50, 52, 64]] as RGB[]), scarf: r(5) < 0.3,
    top: pick(body === 'f' ? (['tee', 'sweater', 'dress', 'jacket'] as const) : (['tee', 'sweater', 'jacket'] as const)), bottom: pick(['trousers', 'shorts', 'overalls'] as const),
  }
}

const W = 9, L = 7, H = 18
// colour slots
const DARK = 1, PANTS = 2, SHIRT = 3, SHIRT_L = 4, SKIN = 5, SKIN_S = 6, HAIR = 7, HAIR_L = 8, HAT = 9, HAT_L = 10, SCARF = 11, EYE = 12, WHITE = 13, MOUTH = 14, BLUSH = 15, SHOE = 16, BEARD = 17, TRIM = 18, COAT = 19, COAT_D = 20

class Vox {
  d = new Uint8Array(W * L * H)
  set(i: number, k: number, y: number, c: number) {
    if (i < 0 || k < 0 || y < 0 || i >= W || k >= L || y >= H) return
    this.d[(y * L + k) * W + i] = c
  }
  get(i: number, k: number, y: number) {
    if (i < 0 || k < 0 || y < 0 || i >= W || k >= L || y >= H) return 0
    return this.d[(y * L + k) * W + i]
  }
  box(i0: number, k0: number, y0: number, i1: number, k1: number, y1: number, c: number) {
    for (let y = y0; y <= y1; y++) for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) this.set(i, k, y, c)
  }
}

export type Pose = 'stand' | 'walkA' | 'walkB' | 'sit' | 'lie' | 'sitLow' | 'lean'

/** one person, in one pose */
export function personModel(look: Look, name: string, pose: Pose): ModelDef {
  const v = new Vox()
  const C = 4 // the middle, across
  const stride = pose === 'walkA' ? 1 : pose === 'walkB' ? -1 : 0
  const sit = pose === 'sit' || pose === 'sitLow'
  const wide = look.build === 'strong' ? 1 : 0
  const f = look.body === 'f'
  const coat = !!look.raincoat
  const cut: Top = look.top ?? 'tee'
  const bottom: Bottom = cut === 'dress' ? 'skirt' : look.bottom ?? 'trousers'
  // what shows of the legs: shorts and skirts leave the shins bare; a dress or a raincoat comes down to the knee
  const bare = !coat && (bottom === 'shorts' || bottom === 'skirt')
  const legTop = coat ? COAT : cut === 'dress' ? SHIRT : PANTS
  // ── legs and shoes
  for (const side of [-1, 1]) {
    const i = C + side * (look.build === 'slim' ? 1 : 1)
    const ii = side < 0 ? i - 1 : i
    if (sit) {
      // thighs forward on the seat, shins over the edge
      v.box(ii, 1, 3, ii + 1, 3, 3, legTop)
      v.box(ii, 0, 1, ii + 1, 0, 2, bare ? SKIN : PANTS)
      v.box(ii, 0, 0, ii + 1, 0, 0, SHOE)
      continue
    }
    const k = 3 - (side < 0 ? stride : -stride)
    v.box(ii, k - 1, 0, ii + 1, k, 0, SHOE)
    v.box(ii, Math.round((k + 3) / 2), 1, ii + 1, Math.round((k + 3) / 2), 2, bare ? SKIN : PANTS)
    v.box(ii, 3, 3, ii + 1, 3, 3, legTop)
  }
  // ── hips and body
  const hw = (f ? 2 : 2) + wide // half width of the shoulders
  v.box(C - 2 - (f ? 0 : 0), 2, 4, C + 2, 4, 4, PANTS)
  v.box(C - 2, 2, 5, C + 2, 4, 6, SHIRT)
  v.box(C - hw, 2, 7, C + hw, 4, 7, SHIRT)
  v.box(C - hw, 2, 8, C + hw, 4, 8, SHIRT_L)
  if (f) v.box(C - 1, 1, 7, C + 1, 1, 7, SHIRT) // a little more at the front
  if (look.build === 'strong') v.box(C - 2, 1, 8, C + 2, 1, 8, SHIRT_L) // a broad chest
  // the cut of the clothes
  if (cut === 'sweater') { for (let i = C - hw; i <= C + hw; i++) for (let k = 2; k <= 4; k++) v.set(i, k, 6, SHIRT_L); v.box(C - 2, 2, 5, C + 2, 2, 5, SHIRT_L) }
  if (cut === 'jacket') { v.box(C, 2, 5, C, 2, 8, TRIM); v.set(C - 1, 2, 8, TRIM); v.set(C + 1, 2, 8, TRIM); v.box(C - 2, 2, 4, C + 2, 4, 4, SHIRT) }
  if (cut === 'dress') { v.box(C - 2, 2, 4, C + 2, 4, 4, SHIRT); v.box(C - 3, 1, 3, C + 3, 5, 3, SHIRT); v.set(C - 3, 1, 3, 0); v.set(C + 3, 1, 3, 0); v.set(C - 3, 5, 3, 0); v.set(C + 3, 5, 3, 0); v.box(C - 2, 2, 7, C + 2, 2, 7, SHIRT_L) }
  if (bottom === 'skirt' && cut !== 'dress') { v.box(C - 3, 1, 3, C + 3, 5, 3, PANTS); v.set(C - 3, 1, 3, 0); v.set(C + 3, 1, 3, 0); v.set(C - 3, 5, 3, 0); v.set(C + 3, 5, 3, 0) }
  if (bottom === 'overalls' && cut !== 'dress') { v.box(C - 1, 2, 5, C + 1, 2, 7, PANTS); for (const s of [-2, 2]) { v.set(C + s, 2, 8, PANTS); v.set(C + s, 4, 8, PANTS) } v.set(C - 1, 2, 7, TRIM); v.set(C + 1, 2, 7, TRIM) }
  // a raincoat over everything, down to the knee, buttoned, with a hood (below)
  if (coat) {
    v.box(C - 2, 2, 3, C + 2, 4, 6, COAT)
    v.box(C - hw, 2, 7, C + hw, 4, 8, COAT)
    v.box(C - 2, 1, 3, C + 2, 1, 4, COAT_D)
    for (const y of [4, 6, 8]) v.set(C, 1 + (y > 6 ? 1 : 0), y, TRIM)
  }
  // ── arms (swinging against the legs), hands
  for (const side of [-1, 1]) {
    const i = C + side * (hw + 1)
    const sw = side < 0 ? stride : -stride
    const thick = look.build === 'strong'
    const top = 8
    const sleeve = coat ? COAT : SHIRT_L
    const long = coat || cut === 'sweater' || cut === 'jacket'
    v.box(i, 3, top - 1, i, 3, top, sleeve)
    v.set(i, 3 + sw, top - 2, long ? (coat ? COAT : SHIRT) : thick ? SHIRT : SKIN)
    v.set(i, 3 + sw, top - 3, SKIN)
    if (thick) { v.set(i + side, 3, top - 1, SHIRT); v.set(i + side, 3, top, SHIRT_L) }
    if (sit) v.set(i, 2, top - 3, SKIN)
  }
  // ── scarf
  if (look.scarf) { v.box(C - 2, 2, 9, C + 2, 4, 9, SCARF); v.set(C + 1, 5, 8, SCARF); v.set(C + 1, 5, 7, SCARF) }
  else v.box(C - 1, 3, 9, C + 1, 3, 9, SKIN_S)
  // ── head: a rounded block, seven across, six deep, six tall
  const y0 = 10, y1 = 15
  for (let y = y0; y <= y1; y++) for (let k = 0; k <= 5; k++) for (let i = C - 3; i <= C + 3; i++) {
    const ci = Math.abs(i - C) === 3, ck = k === 0 || k === 5, cy = y === y0 || y === y1
    if ((ci && ck) || (ci && cy) || (ck && cy)) continue
    v.set(i, k, y, y === y0 ? SKIN_S : SKIN)
  }
  // the face, on the front
  for (const s of [-1, 1]) {
    v.set(C + s * 2, 0, 12, EYE)
    v.set(C + s * 2, 0, 13, f ? DARK : EYE)
    if (f) v.set(C + s * 3, 1, 13, DARK) // lashes
    v.set(C + s * 3, 1, 11, BLUSH)
  }
  v.set(C, 0, 11, MOUTH)
  // ── hair
  const H1 = HAIR, H2 = HAIR_L
  const cap = (yTop: number, back: number, sides: number) => {
    for (let k = 0; k <= 6; k++) for (let i = C - 3; i <= C + 3; i++) {
      if (k <= 5 && !v.get(i, k, yTop - 1) && !(k === 0 && Math.abs(i - C) < 3)) continue
      if (k === 6) continue
      v.set(i, k, yTop, (i + k) % 3 ? H1 : H2)
    }
    // the back of the head down to `back`, the sides down to `sides`
    for (let y = back; y < yTop; y++) for (let i = C - 3; i <= C + 3; i++) if (v.get(i, 5, y) || v.get(i, 4, y)) v.set(i, 5, y, H1)
    for (let y = sides; y < yTop; y++) for (const s of [-3, 3]) for (let k = 1; k <= 5; k++) if (v.get(C + s, k, y)) v.set(C + s, k, y, (y + k) % 3 ? H1 : H2)
    // a fringe over the brow
    for (let i = C - 3; i <= C + 3; i++) if (v.get(i, 0, yTop - 1)) v.set(i, 0, yTop - 1, H1)
  }
  switch (look.hair) {
    case 'short': cap(16, 11, 13); break
    case 'buzz': cap(16, 12, 14); for (let i = C - 2; i <= C + 2; i++) v.set(i, 0, 15, SKIN); break
    case 'long': cap(16, 4, 9); for (let y = 5; y <= 11; y++) for (let i = C - 3; i <= C + 3; i++) v.set(i, 6, y, H1); break
    case 'ponytail': cap(16, 11, 13); for (let y = 8; y <= 14; y++) v.set(C, 6, y, y % 2 ? H1 : H2); v.set(C, 6, 15, HAT); break
    case 'bun': cap(16, 11, 13); v.box(C - 1, 2, 17, C + 1, 4, 17, H1); v.set(C, 3, 17, H2); break
    case 'curly':
      cap(16, 10, 11)
      for (let y = 12; y <= 16; y++) for (const s of [-4, 4]) for (let k = 1; k <= 5; k++) if ((y + k) % 2 === 0) v.set(C + s, k, y, H1)
      for (let i = C - 3; i <= C + 3; i += 2) v.set(i, 2, 17, H2)
      break
    case 'spiky':
      cap(16, 11, 13)
      for (const [i, k] of [[C - 2, 1], [C, 2], [C + 2, 1], [C - 1, 4], [C + 1, 4], [C, 0]]) v.set(i, k, 17, (i + k) % 2 ? H1 : H2)
      break
    case 'bald': break
  }
  // ── beard
  const B = BEARD
  switch (look.beard) {
    case 'stubble': for (let i = C - 2; i <= C + 2; i++) if ((i + C) % 2 === 0) v.set(i, 0, 10, SKIN_S); v.set(C - 1, 0, 11, SKIN_S); v.set(C + 1, 0, 11, SKIN_S); break
    case 'mustache': v.set(C - 1, 0, 11, B); v.set(C + 1, 0, 11, B); v.set(C, 0, 12, SKIN); break
    case 'goatee': v.box(C - 1, 0, 9, C + 1, 0, 10, B); v.set(C, 0, 11, MOUTH); break
    case 'full':
      for (let i = C - 3; i <= C + 3; i++) { v.set(i, 0, 10, B); v.set(i, 1, 10, B); if (Math.abs(i - C) >= 2) v.set(i, 0, 11, B) }
      v.box(C - 2, 0, 9, C + 2, 1, 9, B); v.set(C - 1, 0, 11, B); v.set(C + 1, 0, 11, B)
      for (const s of [-3, 3]) for (let y = 10; y <= 12; y++) v.set(C + s, 2, y, B)
      break
    default: break
  }
  // ── hat (or, in the rain, the raincoat's hood over the hair)
  if (coat) {
    for (let k = 0; k <= 6; k++) for (let i = C - 4; i <= C + 4; i++) for (let y = 11; y <= 17; y++) {
      const inside = Math.abs(i - C) <= 3 && k <= 5 && y <= 16
      const shell = Math.hypot((i - C) / 4.2, (k - 3) / 3.6, (y - 13.5) / 3.8) <= 1
      if (!shell || (inside && v.get(i, k, y) && v.get(i, k, y) !== HAIR && v.get(i, k, y) !== HAIR_L)) continue
      if (k === 0 && y <= 15 && Math.abs(i - C) <= 2) continue // the face shows
      v.set(i, k, y, y >= 16 ? COAT : (i + y) % 4 ? COAT : COAT_D)
    }
  } else switch (look.hat) {
    case 'cap':
      for (let k = 0; k <= 5; k++) for (let i = C - 3; i <= C + 3; i++) if (v.get(i, k, 15) || v.get(i, k, 16)) v.set(i, k, 16, k <= 3 ? HAT : HAT_L)
      v.box(C - 2, -1 + 1, 15, C + 2, 0, 15, HAT); v.box(C - 2, 0, 15, C + 2, 0, 15, HAT_L)
      for (let i = C - 2; i <= C + 2; i++) v.set(i, 0, 14, HAT_L)
      break
    case 'aviator':
      for (let k = 0; k <= 5; k++) for (let i = C - 3; i <= C + 3; i++) if (v.get(i, k, 15)) { v.set(i, k, 16, HAT); if (k >= 1) v.set(i, k, 15, HAT) }
      for (const s of [-3, 3]) { v.set(C + s, 2, 13, HAT_L); v.set(C + s, 2, 12, HAT_L) } // ear flaps
      v.set(C - 1, 0, 15, HAT_L); v.set(C + 1, 0, 15, HAT_L) // goggles
      break
    case 'beanie':
      for (let k = 0; k <= 5; k++) for (let i = C - 3; i <= C + 3; i++) if (v.get(i, k, 15) || v.get(i, k, 16)) { v.set(i, k, 16, (i + k) % 2 ? HAT : HAT_L); v.set(i, k, 15, HAT) }
      v.set(C, 3, 17, HAT_L)
      break
    case 'straw':
      for (let k = -1; k <= 6; k++) for (let i = C - 4; i <= C + 4; i++) if (Math.hypot(i - C, (k - 2.5) * 1.15) < 4.6) v.set(i, Math.max(0, Math.min(6, k)), 16, HAT)
      v.box(C - 2, 1, 17, C + 2, 4, 17, HAT_L)
      break
    default: break
  }
  const skin = SKINS[look.skin] ?? SKINS[1]
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[1]
  const hatCol: RGB = look.hat === 'aviator' ? [120, 84, 56] : look.hat === 'straw' ? [236, 206, 120] : look.hat === 'beanie' ? [look.shirt[2], look.shirt[0], look.shirt[1]] : [250, 246, 232]
  const lighter = (c: RGB, k = 1.12, a = 14): RGB => [Math.min(255, c[0] * k + a), Math.min(255, c[1] * k + a), Math.min(255, c[2] * k + a)]
  const colors: Record<number, RGB> = {
    [DARK]: [40, 44, 58], [PANTS]: look.pants, [SHIRT]: look.shirt, [SHIRT_L]: lighter(look.shirt),
    [SKIN]: skin, [SKIN_S]: [skin[0] * 0.88, skin[1] * 0.84, skin[2] * 0.82], [HAIR]: hair, [HAIR_L]: lighter(hair, 1.1, 10),
    [HAT]: hatCol, [HAT_L]: lighter(hatCol, 0.9, 0), [SCARF]: [84, 178, 190], [EYE]: EYE_COLORS[look.eyes] ?? EYE_COLORS[0], [WHITE]: [250, 250, 250],
    [MOUTH]: [200, 90, 90], [BLUSH]: [255, 160, 150], [SHOE]: coat ? [70, 120, 70] : [70, 54, 44], [BEARD]: [hair[0] * 0.85, hair[1] * 0.85, hair[2] * 0.85],
    [TRIM]: cut === 'jacket' ? [244, 240, 228] : [60, 56, 66], [COAT]: RAINCOAT, [COAT_D]: [RAINCOAT[0] * 0.86, RAINCOAT[1] * 0.82, RAINCOAT[2] * 0.7],
  }
  // on the floor (a cushion): the shins folded away, the feet flat in front
  if (pose === 'sitLow') {
    for (let y = 0; y < 3; y++) for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) v.set(i, k, y, 0)
    for (const side of [-1, 1]) { const i = C + side; const ii = side < 0 ? i - 1 : i; v.box(ii, 0, 3, ii + 1, 0, 3, SHOE) }
  }
  // leaning back against something: everything from the hips up a voxel further back
  if (pose === 'lean') {
    for (let y = H - 1; y >= 5; y--) for (let k = L - 1; k >= 0; k--) for (let i = 0; i < W; i++) { v.set(i, k + 1, y, v.get(i, k, y)); if (k === 0) v.set(i, 0, y, 0) }
  }
  let slices: Uint8Array[]
  let dims = { W, L, H }
  if (pose === 'lie') {
    // on the back, the head at the far end (k = 0, where the pillow is), the face up
    const Lw = H, Hw = L
    const out = new Uint8Array(W * Lw * Hw)
    for (let y = 0; y < H; y++) for (let k = 0; k < L; k++) for (let i = 0; i < W; i++) {
      const c = v.d[(y * L + k) * W + i]
      if (!c) continue
      const k2 = H - 1 - y
      const y2 = L - 1 - k
      out[(y2 * Lw + k2) * W + i] = c
    }
    slices = []
    for (let y = 0; y < Hw; y++) slices.push(out.subarray(y * W * Lw, (y + 1) * W * Lw))
    dims = { W, L: Lw, H: Hw }
  } else {
    slices = []
    for (let y = 0; y < H; y++) slices.push(v.d.subarray(y * W * L, (y + 1) * W * L))
  }
  return { name, W: dims.W, L: dims.L, H: dims.H, pivK: pose === 'lie' ? dims.L / 2 : 3, pivY: 0, slices, colors, tip: { a: 0, k: 3, y: 0 }, shell: true }
}

/** all the poses of one person, named prefix, prefix_wa, prefix_wb, prefix_sit, prefix_lie */
export function personModels(look: Look, prefix: string): ModelDef[] {
  return [
    personModel(look, prefix, 'stand'), personModel(look, prefix + '_wa', 'walkA'), personModel(look, prefix + '_wb', 'walkB'),
    personModel(look, prefix + '_sit', 'sit'), personModel(look, prefix + '_lie', 'lie'),
    personModel(look, prefix + '_low', 'sitLow'), personModel(look, prefix + '_lean', 'lean'),
  ]
}
/** a sanitised look (from a save, or from another player's card) */
export function readLook(x: unknown): Look {
  const d = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const one = <T extends string>(v: unknown, of: Record<T, string>, def: T): T => (typeof v === 'string' && v in of ? (v as T) : def)
  const idx = (v: unknown, n: number, def: number) => (typeof v === 'number' && v >= 0 && v < n ? Math.floor(v) : def)
  const rgb = (v: unknown, def: RGB): RGB => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number') ? (v.map((n) => Math.max(0, Math.min(255, Math.round(n)))) as RGB) : def)
  return {
    body: d.body === 'f' ? 'f' : 'm', build: one(d.build, BUILD_NAMES, 'plain'), skin: idx(d.skin, SKINS.length, 1), hair: one(d.hair, HAIR_NAMES, 'short'),
    hairColor: idx(d.hairColor, HAIR_COLORS.length, 1), beard: one(d.beard, BEARD_NAMES, 'none'), eyes: idx(d.eyes, EYE_COLORS.length, 0),
    hat: one(d.hat, HAT_NAMES, 'aviator'), shirt: rgb(d.shirt, DEFAULT_LOOK.shirt), pants: rgb(d.pants, DEFAULT_LOOK.pants), scarf: d.scarf !== false,
    top: one(d.top, TOP_NAMES, 'tee'), bottom: one(d.bottom, BOTTOM_NAMES, 'trousers'),
  }
}
