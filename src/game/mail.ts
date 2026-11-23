// The post (晨间信箱). A mailbox stands by the house door, and every morning the gull brings what
// came in the night: thanks from the islanders you delivered to, a note from whoever you fed at
// the restaurant, now and then a chatty letter with a tip, and the week's prize for a cosy home.
// The red flag is up while there is something unread.
//
// Everything that wants to reach the player "by post" goes through post() (now) or later() (the
// next morning). That is also where, online, a friend's note will arrive (the "偷菜留纸条" idea):
// a letter with from = their name.

import type { Game } from './game'
import { ITEMS, bagText, type Bag, type ItemId } from './data'
import { canPlace } from './world'
import { FRIENDS } from './story'
import { WEATHER_NAME } from './weather'
import { starsFor, starText } from './house'
import { $t } from '../i18n'

export interface Letter {
  id: number
  /** the day it came */
  day: number
  /** who it is from (a name), and the island, if it is an islander's */
  from: string
  island?: string
  title: string
  body: string
  gift?: Bag
  coins?: number
  /** a postcard: the picture on it (a data URL) */
  photo?: string
  read?: boolean
  /** the gift has been taken out */
  taken?: boolean
  kind: 'welcome' | 'thanks' | 'guest' | 'chat' | 'cosy' | 'note' | 'postcard' | 'wish'
}
export interface MailSave {
  letters: Letter[]
  /** the last morning the post came */
  day: number
  seq: number
  /** for the morning to come */
  queue: Omit<Letter, 'id' | 'day'>[]
  /** deliveries to each islander when the post last came (a rise is a thank-you) */
  friends: Record<string, number>
}
/** letters kept (the oldest read ones go) */
const KEEP = 30

type Actor = Game['pilot']

export class Mail {
  box: Actor | null = null
  private up = false
  constructor(private g: Game) {}

  get save(): MailSave {
    const s = this.g.save
    return (s.mail ??= { letters: [], day: -1, seq: 0, queue: [], friends: { ...(s.friends ?? {}) } })
  }
  get letters(): Letter[] { return this.save.letters }
  get unread(): number { return this.save.letters.filter((l) => !l.read).length }

  /** a letter now */
  post(l: Omit<Letter, 'id' | 'day'>) {
    const m = this.save
    m.letters.unshift({ ...l, id: ++m.seq, day: this.g.clockDay })
    // only so many: the oldest that have been read and emptied go first
    while (m.letters.length > KEEP) {
      const i = m.letters.map((x) => !x.read || (x.gift && !x.taken)).lastIndexOf(false)
      if (i < 0) break
      m.letters.splice(i, 1)
    }
    this.g.changed()
  }
  /** a letter for tomorrow morning */
  later(l: Omit<Letter, 'id' | 'day'>) {
    this.save.queue.push(l)
  }

  /** each frame: the morning's post, when a new day has begun */
  step() {
    const g = this.g
    const m = this.save
    if (m.day < 0) {
      // the first morning on the island: a note from the gull who brings the post
      m.day = g.clockDay
      this.post({
        kind: 'welcome', from: $t('海鸥邮差'), title: $t('你的信箱'),
        body: $t('你好，新岛民！我是这片海的邮差。每天天亮，我把信送到你家门口这个信箱里：岛主们的感谢、来做客的人的回信，有时还有礼物。\n\n信箱上的小红旗竖起来，就是有新信。\n\n——海鸥邮差（顺便说一句，别在码头上扔鱼骨头）'),
        gift: { berry: 3 },
      })
    }
    if (g.clockDay > m.day) this.morning()
    // the flag: up while something is unread
    const want = this.unread > 0
    if (this.box && want !== this.up) {
      this.up = want
      this.box.model = g.scene.models[want ? 'mailbox_up' : 'mailbox']
      this.box.stretch = 1.15
      g.settle(this.box)
    }
  }

  /** the gull has been: everything that came in the night */
  morning() {
    const g = this.g
    const m = this.save
    m.day = g.clockDay
    let n = 0
    for (const q of m.queue) { this.post(q); n++ }
    m.queue = []
    // thanks from each islander delivered to since the last post
    const now = g.save.friends ?? {}
    for (const id of FRIENDS) {
      const was = m.friends[id] ?? 0
      const is = now[id] ?? 0
      if (is > was && g.layouts[id]) { this.post(this.thanks(id, is - was)); n++ }
    }
    m.friends = { ...now }
    // an islander's small wish for the day (its letter comes with the rest)
    const had = g.save.wish?.day
    g.wishes.morning()
    if (g.save.wish?.day !== had && g.save.wish?.day === g.clockDay) n++
    // once a week: the cosy-home society has been round (from the eighth morning)
    const week = Math.floor(g.clockDay / 7)
    if (g.clockDay >= 7 && week > (g.save.cosyWeek ?? 0)) {
      g.save.cosyWeek = week
      this.post(this.judging())
      n++
    }
    // the lighthouse: what the passing ships paid overnight
    const toll = g.estate.toll()
    if (toll) { this.post({ kind: 'note', from: $t('灯塔'), title: $t('昨夜的过路费：{0} 金币', toll), body: $t('昨夜有船从灯塔下面过。按规矩，过路的船交一点灯油钱。\n\n岛越有名，来的船越多。'), coins: toll }); n++ }
    // and some mornings, if nothing else came, a letter just to say hello
    if (!n && g.clockDay % 2 === 1) {
      const l = this.chat()
      if (l) { this.post(l); n++ }
    }
    if (n) g.toast(n === 1 ? $t('门口信箱里有一封信') : $t('门口信箱里有 {0} 封信', n))
  }

  private thanks(id: string, times: number): Omit<Letter, 'id' | 'day'> {
    const g = this.g
    const lay = g.layouts[id]
    const who = lay.def.owner
    const spec = lay.def.sells[0] as ItemId | undefined
    const lines = [
      $t('货收到了，{0}准时，一点没少。', times > 1 ? $t('{0} 趟都', times) : ''),
      $t('{0}这几天{1}，你飞过来辛苦了。', g.islandName(id), WEATHER_NAME[g.weather.kindOn(g.clockDay - 1)]),
      spec ? $t('寄一点我们岛上的{0}给你，别嫌少。', ITEMS[spec].name) : $t('下次来，我请你喝茶。'),
    ]
    return { kind: 'thanks', from: who, island: id, title: $t('{0}的感谢信', who), body: lines.join('\n\n') + `\n\n——${who}`, gift: spec ? { [spec]: Math.min(3, 1 + times) } : undefined }
  }

  /** the weekly verdict on the house (as Animal Crossing's Happy Home Academy): stars, what is missing, and a prize */
  judging(): Omit<Letter, 'id' | 'day'> {
    const g = this.g
    const c = g.house.cosiness()
    const stars = starsFor(c.score)
    const first = stars > (g.save.bestStars ?? 0)
    g.save.bestStars = Math.max(g.save.bestStars ?? 0, stars)
    const prizes: ItemId[] = ['bathtub', 'sofa', 'bookshelf', 'fireplace']
    const prize: ItemId | undefined = stars >= 5 ? (g.count('trophy') || g.save.home?.pieces.some((p) => p.item === 'trophy') ? 'crystalLamp' : 'trophy') : stars >= 4 ? prizes[g.clockDay % prizes.length] : undefined
    const coins = [0, 0, 0, 120, 200, 300][stars]
    const missing = c.notes.filter((t) => !t.startsWith('✓')).map((t) => t.replace('· ', ''))
    const body = [
      $t('本周评定：{0}（温馨度 {1}）{2}', starText(stars), c.score, first && stars >= 3 ? $t('——这是你家第一次拿到这个星级！') : ''),
      missing.length ? $t('还可以添的：{0}。', missing.join($t('；'))) : $t('五个房间都配齐了。'),
      stars >= 5 ? $t('这是全海最温馨的屋子之一。请收下奖品。') : stars >= 3 ? $t('再添些家具，下周就能到 {0} 星。浴缸、书架、盆栽和灯都很加分。', stars + 1) : $t('屋子还有些空。家具可以在工作台“家具”页做。'),
      $t('——海岛温馨协会'),
    ]
    return { kind: 'cosy', from: $t('海岛温馨协会'), title: $t('本周的温馨度评定 {0}', starText(stars)), body: body.join('\n\n'), gift: prize ? { [prize]: 1 } : undefined, coins: coins || undefined }
  }

  /** a letter just to talk: from an islander you know, with something useful in it */
  private chat(): Omit<Letter, 'id' | 'day'> | null {
    const g = this.g
    const known = FRIENDS.filter((id) => g.layouts[id] && (g.save.visited?.[id] || (g.save.friends?.[id] ?? 0) > 0))
    const id = known.length ? known[g.clockDay % known.length] : FRIENDS[g.clockDay % FRIENDS.length]
    const lay = g.layouts[id]
    if (!lay) return null
    const who = lay.def.owner
    const tomorrow = g.weather.kindOn(g.clockDay)
    const tips = [
      tomorrow === 'rain' || tomorrow === 'storm' ? $t('我看今天要下雨。下雨天菜长得快，岸边的蜗牛和青蛙也出来了。') : tomorrow === 'snow' ? $t('今天怕是要下雪。雪天在家烤烤火也不错。') : tomorrow === 'fog' ? $t('今天雾大，飞的时候看好仪表。') : $t('今天天气好，适合出海送货。'),
      $t('听说同一种活干多了会越来越省力。我们岛上砍了一辈子树的老人，一斧子下去树就倒。'),
      $t('深水里有大鱼，但也有鲨鱼。气不多了就上来，别贪。'),
      $t('你屋里收拾得怎么样？温馨的屋子住着舒服，海鸥说每周还会带奖品去。'),
      $t('有人来你岛上送货的话，请他吃顿饭吧。吃过饭的人，会记得你的。'),
    ]
    const tip = tips[(g.clockDay + id.length) % tips.length]
    const small: Bag[] = [{ berry: 2 }, { wheatSeed: 2 }, { carrotSeed: 2 }, {}, {}]
    const gift = small[g.clockDay % small.length]
    return { kind: 'chat', from: who, island: id, title: $t('{0}的来信', who), body: $t('最近好吗？\n\n{0}\n\n——{1}', tip, who), gift: Object.keys(gift).length ? gift : undefined }
  }

  // ───────────────────────────────────────────────────────────── reading
  read(l: Letter) {
    if (l.read) return
    l.read = true
    this.g.changed()
  }
  /** take what came with it into the bag (or the coins into the purse) */
  take(l: Letter) {
    const g = this.g
    if (l.taken || (!l.gift && !l.coins)) return
    if (l.gift && !g.fits(l.gift)) return g.full($t('口袋装不下附带的礼物'))
    l.taken = true
    if (l.gift) g.receive(l.gift)
    if (l.coins) { g.save.coins += l.coins; g.pay(l.coins, g.pilot.x, g.pilot.y, g.pilot.z + 10) }
    g.sfx('collect')
    g.toast($t('收下了：{0}', [l.gift ? bagText(l.gift) : '', l.coins ? $t('{0} 金币', l.coins) : ''].filter(Boolean).join($t('、'))))
    g.changed()
  }
  /** a tap on the mailbox */
  open() {
    this.g.open({ kind: 'mail' })
  }

  // ───────────────────────────────────────────────────────────── the mailbox
  /** set it up by the house door (on building the home island) */
  build() {
    const g = this.g
    // (built again when the house grows: the old one goes first)
    if (this.box) { g.scene.removeActor(this.box); g.world.block(this.box.x, this.box.y, 2, 2, false) }
    this.box = null
    const lay = g.layouts.home
    const h = lay?.buildings.find((b) => b.kind === 'house')
    if (!lay || !h) return
    // beside the door, out in front of the house: the first spot that is free ground. (In the
    // door's own directions — the house may face any way — and never inside the house's walls.)
    const ox = h.door.x - h.x, oy = h.door.y - h.y
    const out: [number, number] = Math.abs(ox) > Math.abs(oy) ? [Math.sign(ox), 0] : [0, Math.sign(oy) || 1]
    const side: [number, number] = [out[1], -out[0]]
    const indoors = (x: number, y: number) => Math.abs(x - h.x) < h.w / 2 + 3 && Math.abs(y - h.y) < h.h / 2 + 3
    const spots: [number, number][] = []
    // (beside the front of the house, not in front of the door: start past the corner)
    const half = (out[0] ? h.h : h.w) / 2
    for (let r = Math.max(12, half + 4); r <= Math.max(30, half + 22); r += 3) for (const [sx, sy] of [[1, 0.2], [-1, 0.2], [1, 0.5], [-1, 0.5], [0.8, 0.8], [-0.8, 0.8]]) spots.push([side[0] * sx * r + out[0] * sy * 10, side[1] * sx * r + out[1] * sy * 10])
    // a crowded door: look further round
    for (let r = 14; r <= 60; r += 4) for (let a = 0; a < 16; a++) spots.push([Math.cos(a / 16 * Math.PI * 2) * r, Math.sin(a / 16 * Math.PI * 2) * r])
    this.up = this.unread > 0
    for (const [dx, dy] of spots) {
      const x = Math.round(h.door.x + dx), y = Math.round(h.door.y + dy)
      if (indoors(x, y) || g.world.isWater(x, y) || !canPlace(g.world, 2, 2, x, y)) continue
      this.box = g.scene.addActor(this.up ? 'mailbox_up' : 'mailbox', { x, y, z: g.world.heightAt(x, y), yaw: 0, shadow: false, reach: 500, scale: 0.7 })
      g.world.block(x, y, 2, 2, true)
      return
    }
    // nowhere free at all: it stands out in front of the door anyway (the letters must have somewhere to go)
    const x = Math.round(h.door.x + side[0] * 12 + out[0] * 6), y = Math.round(h.door.y + side[1] * 12 + out[1] * 6)
    this.box = g.scene.addActor(this.up ? 'mailbox_up' : 'mailbox', { x, y, z: g.world.heightAt(x, y), yaw: 0, shadow: false, reach: 500, scale: 0.7 })
  }
  taps(test: (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias?: number) => void) {
    const b = this.box
    if (!b) return
    test(b.x, b.y, 4, 3, b.z, 13, () => this.g.walkTo({ x: b.x, y: b.y + 6 }, 4, () => this.open()))
  }
}
