// What the island grows into from level 6: five buildings, each set down from a kit made at the
// workbench, each a way to play that was not there before (D135).
//   6 the ranch — two pets of a kind, a day later a young one; its colour from one parent or the
//     other, now and then a new one.
//   7 the shop — set out goods at a price; visitors buy while you are away, the till fills.
//   8 the freight depot — couriers take safe orders you have the goods for, and keep a fifth.
//   9 the lighthouse — ships passing pay a toll every morning; and orders to forward turn up on
//     the board, the goods handed over at your pier.
//  10 the exchange — goods bought and sold at a price that moves through the day.
// All of it is single-player for now; with the market server the shop and the exchange are other
// players' too.

import type { Game } from './game'
import { ITEMS, type ItemId } from './data'
import { DAY_SECONDS } from './body'
import { PET_SPECIES } from '../engine/petdefs'
import type { Pet } from './pets'
import { $t } from '../i18n'

export type FacilityId = 'ranch' | 'shop' | 'depot' | 'lighthouse' | 'exchange'
export interface Facility { name: string; kit: ItemId; model: string; level: number; hw: number; hh: number; done: string }
export const FACILITIES: Record<FacilityId, Facility> = {
  ranch: { name: $t('牧场'), kit: 'ranchKit', model: 'est_ranch', level: 6, hw: 16.5, hh: 13.5, done: $t('把两只同种的宠物带进来，过一天就有小的') },
  shop: { name: $t('小店'), kit: 'shopKit', model: 'est_shop', level: 7, hw: 12.5, hh: 9.5, done: $t('摆上货、标好价，你出门时也会有人来买') },
  depot: { name: $t('货运站'), kit: 'depotKit', model: 'est_depot', level: 8, hw: 17.5, hh: 12.5, done: $t('雇人替你跑安全航线，他们拿两成') },
  lighthouse: { name: $t('灯塔'), kit: 'lighthouseKit', model: 'est_lighthouse', level: 9, hw: 7.5, hh: 7.5, done: $t('过往的船每天早上交过路费；布告板上会有要你转运的货') },
  exchange: { name: $t('交易所'), kit: 'exchangeKit', model: 'est_exchange', level: 10, hw: 16.5, hh: 11.5, done: $t('各种货的价钱一天到晚在变：低买高卖') },
}
export const FACILITY_IDS = Object.keys(FACILITIES) as FacilityId[]
export const facilityOfKit = (item: ItemId) => FACILITY_IDS.find((f) => FACILITIES[f].kit === item) ?? null

/** a line in the shop window */
export interface ShopLine { item: ItemId; qty: number; price: number }
/** a courier on the road: the delivery they carry and when they will be back */
export interface Courier { id: string; island: string; item: ItemId; qty: number; back: number }
/** what the exchange trades, and round what price each settles */
export const EXCHANGE: ItemId[] = ['plank', 'stone', 'coal', 'copperIngot', 'ironIngot', 'cloth', 'sardine', 'wheat']

export interface EstateSave {
  built: Partial<Record<FacilityId, { x: number; y: number }>>
  /** the pair in the ranch, and when their young one comes */
  pair?: { a: string; b: string; due: number }
  shop?: { lines: ShopLine[]; till: number; t: number }
  couriers?: Courier[]
  /** price as a fraction of an item's value, and when it last moved */
  market?: { k: Record<string, number>; t: number }
}

/** a game hour */
const HOUR = DAY_SECONDS / 24
/** what a courier keeps */
export const COURIER_CUT = 0.2
/** how many can be on the road at once, by the island's level */
export const courierSlots = (level: number) => (level >= 10 ? 3 : level >= 9 ? 2 : level >= 8 ? 1 : 0)
/** the spread the exchange takes: it buys this much under the price and sells this much over */
export const SPREAD = 0.04

export class Estate {
  constructor(private g: Game) {}

  get s(): EstateSave {
    return (this.g.save.estate ??= { built: {} })
  }
  has(f: FacilityId) {
    return !!this.s.built[f]
  }
  private get clock() {
    return this.g.save.played ?? 0
  }

  // ── the ranch
  /** pets that could be paired: two of a kind, neither already in the pen */
  canPair(a: Pet, b: Pet): string {
    if (!this.has('ranch')) return $t('先在岛上搭一座牧场')
    if (a.id === b.id) return $t('要两只')
    if (a.sp !== b.sp) return $t('要同一种的两只')
    if (this.s.pair) return $t('牧场里已经有一对了')
    if (this.g.save.pets!.length >= this.g.petSlots) return $t('宠物位满了（{0} 个）：小的没地方住', this.g.petSlots)
    return ''
  }
  pair(a: Pet, b: Pet) {
    const why = this.canPair(a, b)
    if (why) return this.g.warn(why)
    this.s.pair = { a: a.id, b: b.id, due: this.clock + DAY_SECONDS }
    this.g.sfx('pop')
    this.g.toast($t('{0}住进了牧场：明天这时候来看看', PET_SPECIES[a.sp].name))
    this.g.changed()
  }
  /** the colour of the young: one parent's or the other's, or (one time in eight) a colour of its own */
  colourOf(a: Pet, b: Pet, r: number, r2: number): string {
    if (r < 0.875) return r < 0.4375 ? a.col : b.col
    const cols = PET_SPECIES[a.sp].colours
    const total = cols.reduce((s, c) => s + c.weight, 0)
    let x = r2 * total
    for (const c of cols) if ((x -= c.weight) < 0) return c.id
    return cols[0].id
  }
  private born() {
    const g = this.g
    const p = this.s.pair!
    const pets = g.save.pets ?? []
    const a = pets.find((x) => x.id === p.a), b = pets.find((x) => x.id === p.b)
    this.s.pair = undefined
    if (!a || !b) return
    if (pets.length >= g.petSlots) { g.toast($t('牧场里的小家伙没地方住：宠物位满了')); return }
    const col = this.colourOf(a, b, g.rnd(), g.rnd())
    const young: Pet = { id: 'p' + Math.round(g.now()).toString(36) + Math.floor(g.rnd() * 1e4).toString(36), sp: a.sp, col, from: 'home', giftAt: g.now() + 200 }
    pets.push(young)
    g.pets.mark(a.sp, col, 2)
    g.save.stats.bred = (g.save.stats.bred ?? 0) + 1
    const c = g.pets.colour(a.sp, col)
    const fresh = col !== a.col && col !== b.col
    g.celebrate(fresh ? 2 : 1, $t('牧场里多了一只{0}色的小{1}！', c.name, PET_SPECIES[a.sp].name), fresh ? $t('和爸爸妈妈都不一样的颜色') : $t('跟爸爸或妈妈一个颜色'), 'heart')
    g.pets.clear()
    g.changed()
  }

  // ── the shop
  get shop() {
    return (this.s.shop ??= { lines: [], till: 0, t: this.clock })
  }
  /** what a visitor is willing to pay for one: a little over what it is worth */
  fair(item: ItemId) {
    return Math.max(1, Math.round(ITEMS[item].value * 1.3))
  }
  stock(item: ItemId, qty: number, price: number) {
    const g = this.g
    if (!this.has('shop')) return g.warn($t('先在岛上搭一间小店'))
    if (qty < 1 || g.count(item) < qty) return g.warn($t('存货不够'))
    const sh = this.shop
    const line = sh.lines.find((l) => l.item === item)
    if (!line && sh.lines.length >= 6) return g.warn($t('橱窗满了：最多摆 6 样'))
    g.spend({ [item]: qty })
    if (line) { line.qty += qty; line.price = Math.max(1, Math.round(price)) } else sh.lines.push({ item, qty, price: Math.max(1, Math.round(price)) })
    g.sfx('place')
    g.changed()
  }
  unstock(item: ItemId) {
    const sh = this.shop
    const line = sh.lines.find((l) => l.item === item)
    if (!line) return
    sh.lines = sh.lines.filter((l) => l !== line)
    this.g.receive({ [item]: line.qty })
    this.g.changed()
  }
  /** the chance in an hour that a line sells one: high when the price is fair, none at three times */
  saleChance(line: ShopLine) {
    const r = line.price / this.fair(line.item)
    return Math.max(0, Math.min(0.6, 0.6 * (1.6 - r) / 0.9))
  }
  private shopHour() {
    const sh = this.shop
    for (const line of sh.lines) {
      // a few visitors an hour; each line has its chance with each
      for (let v = 0; v < 2 && line.qty > 0; v++) if (this.g.rnd() < this.saleChance(line)) {
        line.qty--
        sh.till += line.price
        this.g.save.stats.sold = (this.g.save.stats.sold ?? 0) + 1
      }
    }
    sh.lines = sh.lines.filter((l) => l.qty > 0)
  }
  takeTill() {
    const sh = this.shop
    if (!sh.till) return
    this.g.save.coins += sh.till
    this.g.toast($t('收了店里的钱：{0} 金币', sh.till))
    this.g.sfx('coin')
    sh.till = 0
    this.g.changed()
  }

  // ── the depot
  get couriers() {
    return (this.s.couriers ??= [])
  }
  isCourier(deliveryId: string) {
    return this.couriers.some((c) => c.id === deliveryId)
  }
  /** an order a courier could take: safe enough, and the goods are here */
  courierBlock(o: { kind: string; status: string; danger: number; item: ItemId; qty: number; relay?: boolean }): string {
    if (!this.has('depot')) return $t('先在岛上搭一座货运站')
    if (o.kind !== 'buy' || o.status !== 'open') return $t('这张单已经没了')
    if (o.danger > 1) return $t('这条航线太危险，雇来的人不肯去')
    if (this.couriers.length >= courierSlots(this.g.level)) return $t('人都派出去了')
    if (!o.relay && this.g.count(o.item) < o.qty) return $t('你的{0}不够', ITEMS[o.item].name)
    return ''
  }
  async hire(orderId: string) {
    const g = this.g
    const o = g.orders.find((x) => x.id === orderId)
    if (!o) return
    const why = this.courierBlock(o)
    if (why) return g.warn(why)
    const d = await g.backend.accept(orderId)
    if (!o.relay) g.spend({ [o.item]: o.qty })
    await g.backend.markLoaded(d.id, g.now())
    const h = g.layouts.home?.def, to = g.layouts[o.island]?.def
    const dist = h && to ? Math.hypot(g.world.delta(to.x, h.x), g.world.delta(to.y, h.y)) : 600
    this.couriers.push({ id: d.id, island: o.island, item: o.item, qty: o.qty, back: this.clock + Math.max(HOUR * 2, (dist / 600) * HOUR * 4) })
    g.save.stats.hired = (g.save.stats.hired ?? 0) + 1
    if (o.relay) g.save.stats.relayed = (g.save.stats.relayed ?? 0) + 1
    g.sfx('stamp')
    g.toast($t('雇人把 {0}×{1} 送去{2}', ITEMS[o.item].name, o.qty, g.islandName(o.island)))
    await g.refresh()
  }
  private busy = false
  private async couriersHome() {
    const g = this.g
    const due = this.couriers.filter((c) => this.clock >= c.back)
    if (!due.length || this.busy) return
    this.busy = true
    try {
      for (const c of due) {
        this.s.couriers = this.couriers.filter((x) => x !== c)
        try {
          const r = await g.backend.complete(c.id, g.now())
          const pay = Math.round((r.reward + r.tip) * (1 - COURIER_CUT))
          g.save.coins += pay
          g.save.stats.delivered++
          g.toast($t('雇的人从{0}回来了：{1} 金币（他拿了两成）', g.islandName(c.island), pay))
          g.sfx('coin')
        } catch { /* the order went away meanwhile: nothing to pay */ }
      }
      await g.refresh()
    } finally { this.busy = false }
  }

  // ── the lighthouse: a toll each morning
  /** what the passing ships pay in a morning */
  toll() {
    return this.has('lighthouse') ? 60 + Math.round(this.g.charm * 1.2) : 0
  }

  // ── the exchange
  get market() {
    const m = (this.s.market ??= { k: {}, t: this.clock })
    for (const it of EXCHANGE) m.k[it] ??= 1
    return m
  }
  /** what it costs to buy one here, and what one fetches sold here */
  price(item: ItemId) {
    const mid = ITEMS[item].value * this.market.k[item]
    // (cheap goods still have a coin between buying and selling, or they could be bought and sold back for nothing lost)
    const buy = Math.max(2, Math.ceil(mid * (1 + SPREAD)))
    return { buy, sell: Math.max(1, Math.min(buy - 1, Math.floor(mid * (1 - SPREAD)))), k: this.market.k[item] }
  }
  private marketHour() {
    const m = this.market
    for (const it of EXCHANGE) {
      // back toward the value, a shove each hour, now and then a jump
      const k = m.k[it]
      const shock = this.g.rnd() < 0.04 ? (this.g.rnd() - 0.5) * 0.5 : 0
      m.k[it] = Math.max(0.5, Math.min(1.8, k + (1 - k) * 0.08 + (this.g.rnd() - 0.5) * 0.12 + shock))
    }
  }
  trade(item: ItemId, qty: number, side: 'buy' | 'sell') {
    const g = this.g
    if (!this.has('exchange')) return g.warn($t('先在岛上盖一座交易所'))
    const p = this.price(item)
    if (side === 'buy') {
      const cost = p.buy * qty
      if (g.save.coins < cost) return g.warn($t('金币不够'))
      g.save.coins -= cost
      g.receive({ [item]: qty })
      // buying lifts the price a little, selling lowers it
      this.market.k[item] = Math.min(1.8, this.market.k[item] * (1 + 0.004 * qty))
    } else {
      if (g.count(item) < qty) return g.warn($t('存货不够'))
      g.spend({ [item]: qty })
      g.save.coins += p.sell * qty
      this.market.k[item] = Math.max(0.5, this.market.k[item] * (1 - 0.004 * qty))
    }
    g.save.stats.traded = (g.save.stats.traded ?? 0) + qty
    g.sfx('coin')
    g.changed()
  }

  // ── time
  update() {
    const t = this.clock
    if (this.g.local) this.g.local.relayOn = this.has('lighthouse')
    if (this.s.pair && t >= this.s.pair.due) this.born()
    if (this.has('shop')) {
      const sh = this.shop
      // (catch up on hours missed, a day at most)
      let n = 0
      while (t - sh.t >= HOUR && n++ < 24) { sh.t += HOUR; this.shopHour() }
      if (t - sh.t >= HOUR) sh.t = t
    }
    if (this.has('exchange')) {
      const m = this.market
      let n = 0
      while (t - m.t >= HOUR && n++ < 24) { m.t += HOUR; this.marketHour() }
      if (t - m.t >= HOUR) m.t = t
    }
    if (this.couriers.length) void this.couriersHome()
  }
}
