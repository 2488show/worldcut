// The island's level, 1 to 10. Each level asks for a few things done and some coins, and each
// one opens something that changes how the game is played — not only "a bigger island". The land
// itself grows three times (levels 4 and 7 make it bigger: the tier). All ten are in the game; from
// 6 each level opens a building (estate.ts). With the market server, the shop and the exchange
// will be other players' too.

import type { Game } from './game'
import { $t } from '../i18n'

export interface LevelGoal {
  text: string
  have(g: Game): number
  need: number
}
export interface Level {
  n: number
  name: string
  /** what it costs to reach this level */
  coins: number
  goals: LevelGoal[]
  /** what opens, said in a line */
  opens: string
  /** the land's size from this level on */
  tier: number
  /** not in the game yet: shown, but cannot be reached */
  planned?: boolean
}

const st = (g: Game) => g.save.stats
const delivered: (n: number) => LevelGoal = (n) => ({ text: $t('送到 {0} 单货', n), have: (g) => st(g).delivered, need: n })
const decor: (n: number) => LevelGoal = (n) => ({ text: $t('岛上摆 {0} 件家具', n), have: (g) => g.save.decor?.length ?? 0, need: n })
const harvested: (n: number) => LevelGoal = (n) => ({ text: $t('收获 {0} 次作物', n), have: (g) => st(g).harvested ?? 0, need: n })
const caught: (n: number) => LevelGoal = (n) => ({ text: $t('捉到 {0} 种小动物', n), have: (g) => g.critterKinds(), need: n })
const tamed: (n: number) => LevelGoal = (n) => ({ text: $t('驯服 {0} 只宠物', n), have: (g) => g.save.pets?.length ?? 0, need: n })
const bred: (n: number) => LevelGoal = (n) => ({ text: $t('在牧场养出 {0} 只小宠物', n), have: (g) => st(g).bred ?? 0, need: n })
const house: (t: number) => LevelGoal = (t) => ({ text: $t('房子扩到第 {0} 档', t + 1), have: (g) => g.house.tier + 1, need: t + 1 })
const sold: (n: number) => LevelGoal = (n) => ({ text: $t('小店卖出 {0} 件货', n), have: (g) => st(g).sold ?? 0, need: n })
const vehicle: (lv: number) => LevelGoal = (lv) => ({ text: $t('有一架 {0} 级的飞机或船', lv), have: (g) => Math.max(0, ...g.save.vehicles.map((v) => g.vdef(v).lv)), need: lv })
const hired: (n: number) => LevelGoal = (n) => ({ text: $t('雇人送完 {0} 单', n), have: (g) => st(g).hired ?? 0, need: n })
const relayed: (n: number) => LevelGoal = (n) => ({ text: $t('转运 {0} 单货', n), have: (g) => st(g).relayed ?? 0, need: n })
const topVehicle: LevelGoal = { text: $t('把一架飞机或一艘船改装到 3 级'), have: (g) => Math.max(0, ...g.save.vehicles.map((v) => g.vdef(v).lv)), need: 3 }
const charm: (n: number) => LevelGoal = (n) => ({
  text: $t('岛的魅力 {0}（岛上摆设、屋里家具、请客吃饭都算）', n), have: (g) => g.charm, need: n,
})

export const LEVELS: Level[] = [
  { n: 1, name: $t('荒岛'), coins: 0, goals: [], opens: $t('采集、工作台、熔炉、矿洞、第一架飞机或船'), tier: 1 },
  { n: 2, name: $t('有人住的岛'), coins: 150, goals: [delivered(1), decor(1)], opens: $t('菜地（4 块）和捕虫网'), tier: 1 },
  { n: 3, name: $t('小村'), coins: 400, goals: [delivered(3), harvested(4), caught(4)], opens: $t('宠物：驯服第一只；菜地加到 8 块'), tier: 1 },
  { n: 4, name: $t('大岛'), coins: 900, goals: [delivered(6), tamed(1), charm(20)], opens: $t('岛变大、矿洞 9 层；第二个宠物位；菜地 12 块'), tier: 2 },
  { n: 5, name: $t('港口'), coins: 1500, goals: [delivered(10), topVehicle], opens: $t('第二代载具：双翼货机、单桅帆船（要重新造、重新涂装）'), tier: 2 },
  { n: 6, name: $t('牧场'), coins: 2200, goals: [delivered(15), tamed(2), charm(30)], opens: $t('牧场套件：两只同种的宠物，过一天生一只小的，颜色随爸妈（偶尔是新颜色）；宠物位 3 个；房子能扩成温室屋'), tier: 2 },
  { n: 7, name: $t('群峰之岛'), coins: 3200, goals: [delivered(22), bred(1), house(4)], opens: $t('岛再变大；小店套件：摆货标价，出门时也有人来买；第三代载具'), tier: 3 },
  { n: 8, name: $t('货运站'), coins: 4500, goals: [delivered(30), sold(10), vehicle(6)], opens: $t('货运站套件：雇人跑安全航线（他们拿两成）；宠物位 4 个'), tier: 3 },
  { n: 9, name: $t('灯塔'), coins: 6000, goals: [delivered(40), hired(8), charm(60)], opens: $t('灯塔套件：每天早上收过路费；布告板上出现要你转运的货'), tier: 3 },
  { n: 10, name: $t('海上之城'), coins: 8000, goals: [delivered(55), relayed(8), vehicle(9)], opens: $t('交易所套件：货价一天到晚在变；飞艇和旗舰；宠物位 5 个。之后是第二部分：陆地与海洋'), tier: 3 },
]

/** how many beds the farm has, and how many pets can live on the island, at a level */
export const farmPlots = (level: number) => (level >= 10 ? 24 : level >= 8 ? 20 : level >= 6 ? 16 : level >= 4 ? 12 : level >= 3 ? 8 : level >= 2 ? 4 : 0)
export const petSlots = (level: number) => (level >= 10 ? 5 : level >= 8 ? 4 : level >= 6 ? 3 : level >= 4 ? 2 : level >= 3 ? 1 : 0)

/** the level an old save (from before levels: a land size only) starts at */
export const levelForTier = (tier: number) => (tier >= 3 ? 7 : tier >= 2 ? 4 : 1)
