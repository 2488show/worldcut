// The first-hour guide: one line at the top of the screen that always says what to do next.
// A step is done when the world says so (not when a button is pressed), and later steps count
// for earlier ones, so a player who goes their own way is never stuck behind the guide.

import type { Game } from './game'
import type { Bag, ItemId } from './data'
import { ITEMS, toolTier } from './data'
import { $t } from '../i18n'

export interface Quest {
  title: string
  hint: string
  done(g: Game): boolean
  progress?(g: Game): string
  /** a present for finishing the step (the basic furniture comes from here) */
  reward?: Bag
}

const got = (g: Game, item: ItemId) => g.save.stats.gathered[item] ?? 0
const made = (g: Game, item: ItemId) => g.save.stats.crafted[item] ?? 0
const hasVehicle = (g: Game) => g.save.vehicles.length > 0
const hasTools = (g: Game) => toolTier(g.save.inv, 'axe') > 0 && toolTier(g.save.inv, 'pick') > 0
const hasPack = (g: Game) => g.capacity() > 8
const bar = (pairs: [ItemId, number, number][]) =>
  pairs.map(([item, have, need]) => `${ITEMS[item].name} ${Math.min(have, need)}/${need}`).join(' · ')

export const QUESTS: Quest[] = [
  {
    title: $t('在地上捡些东西'),
    hint: $t('树下有树枝，草地上有卵石和亚麻丛。点一下，小人就走过去捡——这些不用工具。'),
    done: (g) => (got(g, 'stick') >= 4 && got(g, 'pebble') >= 5 && got(g, 'fiber') >= 2) || hasTools(g),
    progress: (g) => bar([['stick', got(g, 'stick'), 4], ['pebble', got(g, 'pebble'), 5], ['fiber', got(g, 'fiber'), 2]]),
  },
  {
    title: $t('做一把石斧和一把石镐'),
    hint: $t('走到村里的工作台，在“工具”一栏里做。砍树要斧头，挖石头和矿要镐。'),
    done: (g) => hasTools(g) || hasVehicle(g),
    progress: (g) => $t('{0} 石斧 · {1} 石镐', toolTier(g.save.inv, 'axe') > 0 ? '✓' : '○', toolTier(g.save.inv, 'pick') > 0 ? '✓' : '○'),
  },
  {
    title: $t('编一个草编背包'),
    hint: $t('口袋只有快捷栏这 8 格，很快就满。工作台“装备”一栏：纤维 8、树枝 4，背上就多 8 格。用不上的东西放进村里的仓库（木箱堆）。'),
    done: (g) => hasPack(g) || hasVehicle(g),
    progress: (g) => bar([['fiber', g.count('fiber'), 8], ['stick', g.count('stick'), 4]]),
  },
  {
    title: $t('砍树，挖石头'),
    hint: $t('点一棵树，小人会一斧一斧地砍，直到它倒下。大石头要用镐。'),
    done: (g) => (got(g, 'wood') >= 8 && got(g, 'stone') >= 8) || !!g.save.furnace || hasVehicle(g),
    progress: (g) => bar([['wood', got(g, 'wood'), 8], ['stone', got(g, 'stone'), 8]]),
  },
  {
    title: $t('砌一座熔炉'),
    hint: $t('在工作台的“材料”里做熔炉套件，再点“放置熔炉”，把它放在村里的空地上。'),
    done: (g) => !!g.save.furnace || hasVehicle(g),
    reward: { flowerBed: 1 },
  },
  {
    title: $t('下矿洞挖铜矿'),
    hint: $t('沿小路走到山脚的矿洞。里面很黑，带橙色斑点的岩壁就是铜矿。挖开岩石，旁边藏着的矿会露出来。'),
    done: (g) => got(g, 'copperOre') >= 6 || made(g, 'copperIngot') >= 3 || hasVehicle(g),
    progress: (g) => bar([['copperOre', got(g, 'copperOre'), 6]]),
  },
  {
    title: $t('炼三块铜锭'),
    hint: $t('把铜矿石和木材放进熔炉。炼的时候可以去忙别的：锯木板、织帆布。'),
    done: (g) => made(g, 'copperIngot') >= 3 || hasVehicle(g),
    progress: (g) => bar([['copperIngot', made(g, 'copperIngot'), 3]]),
  },
  {
    title: $t('造一架飞机，或一艘船'),
    hint: $t('第一架飞机、第一只筏子都要亲手造。机库里造木架飞机：快，装得少，要铜锭。码头上扎筏子：慢，只要木材和绳子。同一代能原地改装到 3 级。'),
    done: hasVehicle,
    reward: { flag: 1 },
  },
  {
    title: $t('到布告板接一张求购单'),
    hint: $t('别的岛在收东西。☠ 越多的航线海盗越多，报酬也越高——头几单先挑没有 ☠ 的。'),
    done: (g) => g.save.stats.accepted + g.save.stats.posted > 0 || g.save.stats.delivered > 0,
  },
  {
    title: $t('把货亲自送过去'),
    hint: $t('点你的飞机或船，选目的地出发。到了对方岛附近，对准跑道（或码头）降落：落得正，有额外的小费。'),
    done: (g) => g.save.stats.delivered > 0,
    reward: { bench: 1, lampPost: 1 },
  },
  {
    title: $t('自由经营'),
    hint: $t('可做的事：做根钓竿去岸边钓鱼，下潜捕鱼；往矿洞深处挖稀有矿；打家具装扮岛；攒够钱把岛升级。'),
    done: () => false,
  },
]
