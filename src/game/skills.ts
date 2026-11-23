// Getting better at things (熟练度), as in Stardew Valley: the more of a kind of work you do, the
// better you get at it, and the less it takes out of you. This is what turns the strength bar from
// a limit into a way of growing: a new islander can fell five trees before lunch; one who has
// felled two hundred fells ten and still has the strength to fish in the evening.
//
// Five skills, levels 0–10. Each level takes 5% off the strength that kind of work costs (half at
// ten), and adds a little of something particular to it:
//   伐木 chop  — a chance of an extra log from each tree
//   采矿 mine  — a chance of an extra lump from each rock and seam
//   渔猎 fish  — the line takes the strain more slowly; the harpoon reloads faster
//   种地 farm  — a chance of a bigger harvest
//   厨艺 cook  — a chance of making two at once, and what you cook fills you more
// Levels 5 and 10 each bring a named knack (shown in the journal).

import type { Game } from './game'
import type { EFFORT, ItemId } from './data'
import { $t } from '../i18n'

export type Skill = 'chop' | 'mine' | 'fish' | 'farm' | 'cook'
export const SKILLS: Skill[] = ['chop', 'mine', 'fish', 'farm', 'cook']
export const SKILL_NAME: Record<Skill, string> = { chop: $t('伐木'), mine: $t('采矿'), fish: $t('渔猎'), farm: $t('种地'), cook: $t('厨艺') }
export const SKILL_ICON: Record<Skill, ItemId> = { chop: 'stoneAxe', mine: 'stonePick', fish: 'rod', farm: 'wheatSeed', cook: 'bread' }
/** what each level does, in words, for the journal */
export const SKILL_PERK: Record<Skill, string> = {
  chop: $t('每级：砍树省 5% 体力，多掉一根木头的机会 +3%'),
  mine: $t('每级：挖矿省 5% 体力，多掉一块的机会 +3%'),
  fish: $t('每级：钓鱼和潜水省 5% 体力，鱼线绷紧慢 3%，鱼枪装填快 4%'),
  farm: $t('每级：多收一份的机会 +5%'),
  cook: $t('每级：做菜时多做一份的机会 +4%，吃自己做的菜多回 3% 体力'),
}
/** the knacks at 5 and 10 */
export const SKILL_KNACK: Record<Skill, [string, string]> = {
  chop: [$t('老樵夫：砍倒的树更常掉橡果'), $t('林中人：斧头磨损减半')],
  mine: [$t('矿工的眼：敲碎的石头有时带出煤'), $t('老矿工：镐子磨损减半')],
  fish: [$t('好水性：潜水的气多 10 秒'), $t('老渔人：白天也更容易遇到月光鱼（潜水也能遇到）')],
  farm: [$t('绿手指：收菜一定留下种子'), $t('丰收：下雨时作物熟得更快')],
  cook: [$t('掌勺：请客时客人的好感多 +1'), $t('名厨：请客时岛的魅力多 +2')],
}
/** the experience to reach each level (index = level) */
export const LEVEL_XP = [0, 12, 32, 64, 110, 170, 250, 350, 480, 640, 840]
export const MAX_LEVEL = LEVEL_XP.length - 1

/** which skill a piece of work belongs to */
const OF_WORK: Partial<Record<keyof typeof EFFORT, Skill>> = { chop: 'chop', mine: 'mine', cast: 'fish', harpoon: 'fish' }

export function levelFor(xp: number): number {
  let l = 0
  while (l < MAX_LEVEL && xp >= LEVEL_XP[l + 1]) l++
  return l
}

export class Skills {
  constructor(private g: Game) {}

  private get bag(): Partial<Record<Skill, number>> {
    return (this.g.save.skills ??= {})
  }
  xp(s: Skill): number { return this.bag[s] ?? 0 }
  level(s: Skill): number { return levelFor(this.xp(s)) }
  /** progress to the next level, 0–1 (1 at the top) */
  progress(s: Skill): number {
    const l = this.level(s)
    if (l >= MAX_LEVEL) return 1
    return (this.xp(s) - LEVEL_XP[l]) / (LEVEL_XP[l + 1] - LEVEL_XP[l])
  }
  has(s: Skill, knack: 0 | 1): boolean { return this.level(s) >= (knack ? 10 : 5) }

  /** what a piece of work costs, after practice */
  effort(kind: keyof typeof EFFORT): number {
    const s = OF_WORK[kind]
    return s ? 1 - 0.05 * this.level(s) : 1
  }
  /** a piece of work done: practice for its skill */
  worked(kind: keyof typeof EFFORT) {
    const s = OF_WORK[kind]
    if (s) this.gain(s, kind === 'cast' ? 2 : 1)
  }
  /** the chance of one more of whatever came */
  extra(s: Skill): number {
    const l = this.level(s)
    return s === 'farm' ? 0.05 * l : s === 'cook' ? 0.04 * l : 0.03 * l
  }

  gain(s: Skill, n: number) {
    const g = this.g
    const before = this.level(s)
    this.bag[s] = this.xp(s) + n
    const after = this.level(s)
    if (after > before) {
      const knack = after === 5 ? SKILL_KNACK[s][0] : after === 10 ? SKILL_KNACK[s][1] : ''
      g.sfx('fanfare')
      g.celebrate(after === 5 || after === 10 ? 2 : 1, $t('{0}升到 {1} 级', SKILL_NAME[s], after), knack ? $t('新本事：{0}', knack) : $t('{0}省力 {1}%', SKILL_NAME[s], after * 5), SKILL_ICON[s])
    }
  }
}
