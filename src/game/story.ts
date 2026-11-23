// What the whole game is about, after the first-hour guide (quests.ts) has done its job:
// four more chapters of goals, the islanders becoming friends, the chart to the far shore, the
// ending, and the collection book. Everything is read off the save, so a player who does
// things out of order is never stuck: a goal is done the moment the world says it is.

import type { Game } from './game'
import { ITEMS, ITEM_ORDER, give, toolTier, bagText, type Bag, type ItemId, type ItemKind } from './data'
import { $t } from '../i18n'

export interface Goal {
  text: string
  done(g: Game): boolean
  progress?(g: Game): string
}
export interface Chapter {
  /** 二 … 五 (the guide is chapter one) */
  no: string
  title: string
  /** said once, when the chapter opens */
  intro: string
  goals: Goal[]
  coins: number
  gift: Bag
}

/** the four islanders who can become friends, in the order the journal lists them */
export const FRIENDS = ['peak', 'pine', 'reef', 'dune'] as const
/** deliveries to an islander it takes to reach each level */
export const FRIEND_STEPS = [1, 3, 5]
export const FRIEND_NAME = [$t('还不认识'), $t('认识了'), $t('熟人'), $t('老朋友')]
/** what an islander gives on reaching level 1 and 2 (level 3 is their piece of the chart) */
export const FRIEND_GIFTS: Record<string, [Bag, Bag]> = {
  peak: [{ ironOre: 4 }, { ironIngot: 2 }],
  pine: [{ pine: 6 }, { table: 1 }],
  reef: [{ shell: 5 }, { pearl: 1 }],
  dune: [{ coal: 6 }, { crystal: 1 }],
}
const FRIEND_WORDS: Record<string, [string, string, string]> = {
  peak: [$t('“原来是你在跑这条线。拿着，山里挖的。”'), $t('“石峰岛的门，你不用敲。”'), $t('“我爷爷留下一角旧海图，我看不懂。你飞得远，给你。”')],
  pine: [$t('“雾大的日子，听见你的引擎声就放心了。”'), $t('“给你留了张桌子，松木的。”'), $t('“这片纸一直压在箱底。上面画的海，我们谁也没去过。”')],
  reef: [$t('“礁盘上捡的，不值钱，好看。”'), $t('“这颗珍珠是我在沉船边上摸到的。你留着。”'), $t('“沉船里找到的，只有一角。也许你能凑齐。”')],
  dune: [$t('“敢飞这条线的人不多。”'), $t('“红砂底下的东西，分你一块。”'), $t('“灯塔的老看守留下的。他说，那边还有一座更高的灯。”')],
}

export function friendLevel(points: number): number {
  let l = 0
  while (l < FRIEND_STEPS.length && points >= FRIEND_STEPS[l]) l++
  return l
}

const st = (g: Game) => g.save.stats
const mineDepth = (g: Game) => g.save.mine?.unlocked ?? 1
const visited = (g: Game) => FRIENDS.filter((id) => g.save.visited?.[id]).length
const oldFriends = (g: Game) => FRIENDS.filter((id) => friendLevel(g.save.friends?.[id] ?? 0) >= 3).length
const of = (have: number, need: number) => `${Math.min(have, need)}/${need}`

export const CHAPTERS: Chapter[] = [
  {
    no: $t('二'), title: $t('站稳脚跟'), intro: $t('岛上的日子开始了。把它过得像个家。'), coins: 150, gift: { table: 1 },
    goals: [
      { text: $t('捕到 3 条鱼（做根钓竿，点岸边的水面）'), done: (g) => (st(g).fished ?? 0) >= 3, progress: (g) => of(st(g).fished ?? 0, 3) },
      { text: $t('下到矿洞第 3 层'), done: (g) => mineDepth(g) >= 3, progress: (g) => of(mineDepth(g), 3) },
      { text: $t('把岛升到 2 级，开出菜地（在小屋里）'), done: (g) => g.level >= 2, progress: (g) => of(g.level, 2) },
      { text: $t('送到 3 单货'), done: (g) => st(g).delivered >= 3, progress: (g) => of(st(g).delivered, 3) },
    ],
  },
  {
    no: $t('三'), title: $t('远航'), intro: $t('四座邻岛，四种海。去认识住在那里的人。'), coins: 300, gift: { chime: 1 },
    goals: [
      { text: $t('从码头下潜一次，带点海产上来'), done: (g) => (st(g).dived ?? 0) >= 1 },
      { text: $t('把岛升到 4 级（在小屋里）'), done: (g) => g.level >= 4, progress: (g) => `${Math.min(g.level, 4)}/4` },
      { text: $t('四座邻岛都去一趟'), done: (g) => visited(g) >= 4, progress: (g) => of(visited(g), 4) },
      { text: $t('在带 ☠ 的航线上送到一单'), done: (g) => (st(g).danger ?? 0) >= 1 },
    ],
  },
  {
    no: $t('四'), title: $t('群峰'), intro: $t('更深的矿，更快的飞机，更像样的岛。'), coins: 600, gift: { goldIngot: 2 },
    goals: [
      { text: $t('打一把铁镐'), done: (g) => toolTier(g.save.inv, 'pick') >= 3 },
      { text: $t('下到矿洞第 7 层'), done: (g) => mineDepth(g) >= 7, progress: (g) => of(mineDepth(g), 7) },
      { text: $t('造出第二代载具：双翼货机或单桅帆船（岛 5 级）'), done: (g) => g.save.vehicles.some((v) => g.vdef(v).lv >= 4) },
      { text: $t('岛的魅力达到 40（多摆家具，稀有的更值）'), done: (g) => g.charm >= 40, progress: (g) => of(g.charm, 40) },
    ],
  },
  {
    no: $t('五'), title: $t('海的那一边'), intro: $t('每位岛主手里都有一角旧海图。把它们凑齐。'), coins: 1000, gift: { keeperLamp: 1 },
    goals: [
      { text: $t('和四位岛主都成为老朋友（各送到 5 单）'), done: (g) => oldFriends(g) >= 4, progress: (g) => of(oldFriends(g), 4) },
      { text: $t('在工作台上把四片残片拼成远海海图'), done: (g) => !!g.save.milestones.chart },
      { text: $t('飞到海图上标的地方'), done: (g) => !!g.save.visited?.far },
    ],
  },
]

/** the collection book: everything that has ever been in the bag, by kind */
export const CODEX: { kind: ItemKind; name: string; coins: number }[] = [
  { kind: 'material', name: $t('采集'), coins: 150 },
  { kind: 'fish', name: $t('鱼与海产'), coins: 300 },
  { kind: 'critter', name: $t('小动物'), coins: 300 },
  { kind: 'crop', name: $t('作物'), coins: 100 },
  { kind: 'part', name: $t('加工品'), coins: 150 },
  { kind: 'tool', name: $t('工具'), coins: 150 },
  { kind: 'gear', name: $t('装备'), coins: 100 },
  { kind: 'furniture', name: $t('家具'), coins: 400 },
]
export const codexItems = (kind: ItemKind) => ITEM_ORDER.filter((i) => ITEMS[i].kind === kind)

export interface StoryView {
  /** the guide is over and the chapters have begun */
  open: boolean
  ended: boolean
  chapter: Chapter | null
  goals: { text: string; done: boolean; progress: string }[]
}

export class Story {
  constructor(private g: Game) {}

  /** the chapter the player is in (null before the guide is over and after the ending) */
  get chapter(): Chapter | null {
    const s = this.g.save.story
    return s && !s.ended ? CHAPTERS[s.ch] ?? null : null
  }
  view(): StoryView {
    const s = this.g.save.story
    const ch = this.chapter
    return {
      open: !!s, ended: !!s?.ended, chapter: ch,
      goals: ch ? ch.goals.map((q) => ({ text: q.text, done: q.done(this.g), progress: q.progress ? q.progress(this.g) : '' })) : [],
    }
  }
  /** the line at the top of the screen once the guide is over */
  line(): { title: string; hint: string; progress: string } {
    const ch = this.chapter
    if (!ch) return { title: $t('自由经营'), hint: $t('海图上的每座岛你都到过了。日志里还有图鉴没填满——或者，就只是飞一会儿。'), progress: '' }
    const goals = ch.goals
    const next = goals.find((q) => !q.done(this.g)) ?? goals[goals.length - 1]
    const n = goals.filter((q) => q.done(this.g)).length
    return { title: $t('第{0}章 · {1}', ch.no, ch.title), hint: next.text, progress: `${n}/${goals.length}${next.progress ? ` · ${next.progress(this.g)}` : ''}` }
  }

  /** called now and then: opens chapters, closes them, fills in the collection book */
  tick(guideDone: boolean) {
    const g = this.g
    const s = g.save
    this.collect()
    if (!guideDone) return
    if (!s.story) {
      s.story = { ch: 0 }
      this.announce(CHAPTERS[0])
      g.changed()
      return
    }
    if (s.story.ended) return
    const ch = CHAPTERS[s.story.ch]
    if (!ch || !ch.goals.every((q) => q.done(g))) return
    // the chapter is done: its reward, and the next one opens
    s.coins += ch.coins
    g.receive(ch.gift, true)
    const p = g.pilot
    g.after(0.6, () => {
      g.pay(ch.coins, p.x, p.y, p.z + 12)
      g.drop(ch.gift, p.x, p.y, p.z + 12)
    })
    const last = s.story.ch >= CHAPTERS.length - 1
    g.celebrate(2, last ? $t('海的那一边') : $t('第{0}章完成 · {1}', ch.no, ch.title), $t('+{0} 金币 · {1}', ch.coins, bagText(ch.gift)), last ? 'keeperLamp' : 'coin')
    if (last) {
      s.story.ended = true
      g.after(2.6, () => g.open({ kind: 'ending' }))
    } else {
      s.story.ch++
      const next = CHAPTERS[s.story.ch]
      g.after(3.2, () => this.announce(next))
    }
    g.changed()
  }
  private announce(ch: Chapter) {
    this.g.celebrate(1, $t('第{0}章 · {1}', ch.no, ch.title), ch.intro)
  }

  /** everything in the bag is entered in the book; a finished page pays out once */
  private collect() {
    const s = this.g.save
    const seen = (s.seen ??= {})
    let fresh = false
    for (const k in s.inv) {
      if ((s.inv[k as ItemId] ?? 0) > 0 && !seen[k as ItemId]) {
        seen[k as ItemId] = true
        fresh = true
      }
    }
    if (!fresh) return
    for (const page of CODEX) {
      const key = 'codex_' + page.kind
      if (s.milestones[key]) continue
      if (!codexItems(page.kind).every((i) => seen[i])) continue
      s.milestones[key] = true
      s.coins += page.coins
      const p = this.g.pilot
      this.g.pay(page.coins, p.x, p.y, p.z + 12)
      this.g.celebrate(1, $t('图鉴 · {0} 集齐了', page.name), $t('+{0} 金币', page.coins), 'coin')
    }
  }
  codexCount(kind?: ItemKind): { have: number; all: number } {
    const seen = this.g.save.seen ?? {}
    const list = kind ? codexItems(kind) : ITEM_ORDER
    return { have: list.filter((i) => seen[i]).length, all: list.length }
  }

  /**
   * The pilot has landed on an island with `lines` deliveries for it (maybe none). Returns what
   * the islander has to say or give beyond the thanks, to be shown with the receipt.
   */
  landed(island: string, lines: number, danger: boolean): { text: string; gift: Bag | null } | null {
    const g = this.g
    const s = g.save
    ;(s.visited ??= {})[island] = true
    if (lines > 0 && danger) s.stats.danger = (s.stats.danger ?? 0) + lines
    if (!(FRIENDS as readonly string[]).includes(island) || lines <= 0) return null
    const f = (s.friends ??= {})
    const before = friendLevel(f[island] ?? 0)
    f[island] = (f[island] ?? 0) + lines
    const after = friendLevel(f[island])
    if (after <= before) return null
    const owner = g.layouts[island].def.owner
    const gift: Bag = after >= 3 ? { chartPiece: 1 } : FRIEND_GIFTS[island][after - 1]
    g.receive(gift, true)
    return { text: $t('{0}和你成了{1}：{2}', owner, FRIEND_NAME[after], FRIEND_WORDS[island][after - 1]), gift }
  }
  friend(island: string): { points: number; level: number; next: number | null } {
    const points = this.g.save.friends?.[island] ?? 0
    const level = friendLevel(points)
    return { points, level, next: level < FRIEND_STEPS.length ? FRIEND_STEPS[level] : null }
  }
}
