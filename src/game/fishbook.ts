// The fish book: every fish there is, how big they come, where and when; and every catch measured.
// A catch is measured when it is landed (rod or harpoon): its length in centimetres, drawn about
// the kind's usual size. The biggest of each kind is kept (the record, shown on the board in the
// house); a first catch of a kind and a new record each get their ceremony. A trophy — a quarter
// bigger than usual or more — is worth two of the ordinary kind.

import type { Game } from './game'
import { ITEMS, type ItemId } from './data'
import { $t } from '../i18n'

export interface FishInfo { cm: [number, number]; how: string; where: string; when?: string }
export const FISH_INFO: Partial<Record<ItemId, FishInfo>> = {
  sardine: { cm: [12, 22], how: $t('竿 / 潜'), where: $t('哪片海都有，成群') },
  reefFish: { cm: [10, 18], how: $t('潜'), where: $t('暖水的浅礁') },
  angelfish: { cm: [14, 24], how: $t('潜'), where: $t('珊瑚环礁、沙丘的浅水') },
  bream: { cm: [24, 42], how: $t('竿 / 潜'), where: $t('近岸常见') },
  mackerel: { cm: [26, 44], how: $t('竿 / 潜'), where: $t('冷一点的海，游得快') },
  grouper: { cm: [45, 90], how: $t('潜'), where: $t('深处的岩缝') },
  ray: { cm: [60, 120], how: $t('潜'), where: $t('沙底') },
  octopus: { cm: [40, 90], how: $t('潜'), where: $t('深处，会喷墨') },
  squid: { cm: [30, 60], how: $t('潜'), where: $t('冷水的深处') },
  tuna: { cm: [90, 180], how: $t('竿 / 潜'), where: $t('外海的深水') },
  moonfish: { cm: [60, 110], how: $t('竿 / 潜'), where: $t('深水'), when: $t('只在夜里') },
  flyingFish: { cm: [18, 34], how: $t('船钓'), where: $t('开船出海，哪里都有') },
  bonito: { cm: [40, 80], how: $t('船钓'), where: $t('离岛远的外海') },
  swordfish: { cm: [150, 320], how: $t('船钓'), where: $t('远海的深水，很少见') },
}
export const BOOK_FISH = Object.keys(FISH_INFO) as ItemId[]

/** a length for a catch: about the middle of the kind's range, now and then a big one */
export function sizeOf(item: ItemId, rnd: () => number, bonus = 0): number {
  const info = FISH_INFO[item]
  if (!info) return 0
  const [a, b] = info.cm
  const u = (rnd() + rnd() + rnd()) / 3 // most near the middle
  let cm = a + (b - a) * u
  if (rnd() < 0.06 + bonus) cm *= 1.15 + rnd() * 0.25 // a big one
  return Math.round(cm)
}
export const isTrophy = (item: ItemId, cm: number) => { const i = FISH_INFO[item]; return !!i && cm >= i.cm[1] * 1.05 }

/** a fish landed: measured, put in the book, its ceremony; returns how many to give (a trophy counts double) */
export function landFish(g: Game, item: ItemId, cm: number, how: string): number {
  const recs = (g.save.records ??= {})
  const was = recs[item]
  const first = !was && !(g.save.stats.gathered[item] ?? 0)
  const record = !!was && cm > was.cm
  if (!was || cm > was.cm) recs[item] = { cm, day: g.clockDay + 1 }
  const trophy = isTrophy(item, cm)
  const name = ITEMS[item].name
  const size = `${cm} cm`
  if (first) {
    g.sfx('rare')
    g.celebrate(2, $t('新的鱼：{0}', name), $t('{0} · 记进了图鉴', size), item)
  } else if (record) {
    g.sfx('fanfare')
    g.celebrate(2, $t('{0}的新纪录！', name), $t('{0}（以前 {1} cm）', size, was!.cm), item)
  } else if (trophy) {
    g.sfx('fanfare')
    g.celebrate(1, $t('好大的{0}！', name), $t('{0} · 算两条', size), item)
  } else {
    g.sfx('done')
    g.float(`${name} ${size}`, g.pilot.x, g.pilot.y, g.pilot.z + 18)
  }
  void how
  return trophy ? 2 : 1
}
