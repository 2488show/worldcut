// A small wish a day (round 16). From the third morning, one of the islanders the player knows
// writes with something small they would love — a fish, a basket of berries, a coil of rope. Send
// it (from the bag or the warehouse, or hand it over on their island) within three days, and they send back a piece of
// furniture you cannot make yet, and like you a little more. Miss it and nothing is lost: the
// next morning there is another.

import { FURNITURE, ITEMS, type Bag, type ItemId } from './data'
import { FRIENDS } from './story'
import type { Game } from './game'
import { $t } from '../i18n'

export interface WishSave { day: number; island: string; who: string; item: ItemId; n: number; done?: boolean; gift?: ItemId }

/** what is wished for: easy to come by on any island, a few at a time */
const WANTS: [ItemId, number][] = [
  ['berry', 4], ['plank', 5], ['stone', 6], ['sardine', 1], ['bream', 1], ['mackerel', 1], ['carrot', 2], ['shell', 3],
  ['cloth', 2], ['rope', 2], ['wheat', 3], ['copperIngot', 2], ['pumpkin', 1], ['stick', 5], ['fiber', 4], ['pebble', 5],
]
/** what comes back: little things for the house, mostly ones the workbench does not make */
const GIFTS: ItemId[] = ['paintingFlower', 'wallClock', 'teaSet', 'globe', 'hangingPlant', 'stringLights', 'fishbowl', 'beanbag', 'candle', 'flowerVase', 'photoFrame', 'guestbook', 'wallLamp', 'bookStack', 'cactus', 'paintingSea', 'mirror', 'bigPillow']
/** what they say, by what they want */
const WHY: Partial<Record<ItemId, string>> = {
  berry: $t('想做一罐果酱，就差几把莓子。'), plank: $t('院子的栅栏坏了几根。'), stone: $t('想在门口砌一圈花坛。'), sardine: $t('家里的猫最近很挑嘴。'),
  bream: $t('明天是我妈生日，想给她炖条鱼。'), mackerel: $t('晚饭想烤条鱼。'), carrot: $t('想给兔子换换口味。'), shell: $t('想串一串风铃挂在窗边。'),
  cloth: $t('窗帘被风吹破了。'), rope: $t('晾衣绳断了。'), wheat: $t('想自己烤一次面包。'), copperIngot: $t('水壶漏了，想找人补一补。'),
  pumpkin: $t('想做南瓜汤，天冷了。'), stick: $t('想给菜地搭个架子。'), fiber: $t('想学着织点东西。'), pebble: $t('想在鱼缸里铺一层小石子。'),
}

export class Wishes {
  constructor(private g: Game) {}
  get save(): WishSave | null { return this.g.save.wish ?? null }
  /** how many days a wish stays open (a trip there and back must not make it lapse) */
  static DAYS = 3
  /** the wish still open, if there is one (a newer one replaces it) */
  get open(): WishSave | null {
    const w = this.save
    return w && !w.done && this.g.clockDay - w.day < Wishes.DAYS ? w : null
  }
  /** a new morning: a new wish (from the third day, when the player knows someone) */
  morning() {
    const g = this.g
    if (g.clockDay < 2) return
    if (this.save?.day === g.clockDay) return
    // one open at a time: a new one only when the last is done or has lapsed
    if (this.open) return
    const known = FRIENDS.filter((id) => g.layouts[id] && (g.save.visited?.[id] || (g.save.friends?.[id] ?? 0) > 0))
    const pool = known.length ? known : FRIENDS.filter((id) => g.layouts[id])
    if (!pool.length) return
    const island = pool[(g.clockDay * 7) % pool.length]
    const wants = WANTS.filter(([id]) => ITEMS[id])
    const [item, n] = wants[(g.clockDay * 5 + island.length) % wants.length]
    const gifts = GIFTS.filter((id) => FURNITURE[id])
    const gift = gifts[(g.clockDay * 3 + 1) % gifts.length]
    const who = g.layouts[island].def.owner
    g.save.wish = { day: g.clockDay, island, who, item, n, gift }
    g.mail.post({
      kind: 'wish', from: who, island, title: $t('{0}的小心愿', who),
      body: $t('{0}\n\n你那儿有没有 {1} 个{2}？三天之内都行，不急。\n\n——{3}\n\n（东西够了，可以在右上角的「心愿」里直接寄出，也可以飞到{4}当面交给我。）', WHY[item] ?? $t('有件小事想拜托你。'), n, ITEMS[item].name, who, g.layouts[island].def.name),
    })
  }
  /** can it be sent now? */
  canSend(): boolean {
    const w = this.open
    return !!w && this.g.count(w.item) >= w.n
  }
  /** send it: the things go, the present comes back (into the bag, or the furniture box) */
  send(): boolean {
    const g = this.g
    const w = this.open
    if (!w) return false
    if (g.count(w.item) < w.n) { g.warn($t('还差 {0} 个{1}', w.n - g.count(w.item), ITEMS[w.item].name)); return false }
    g.spend({ [w.item]: w.n } as Bag)
    w.done = true
    const friends = (g.save.friends ??= {})
    friends[w.island] = (friends[w.island] ?? 0) + 1
    g.save.stats.wishes = (g.save.stats.wishes ?? 0) + 1
    if (w.gift) g.house.toBag(w.gift)
    g.celebrate(1, $t('{0}的心愿实现了', w.who), w.gift ? $t('回礼：{0} · 好感 +1', ITEMS[w.gift].name) : $t('好感 +1'), 'heart')
    g.sfx('fanfare')
    g.changed()
    return true
  }
}
