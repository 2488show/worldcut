// The market's server, as the game sees it.
//
// `Backend` is the whole contract between the client and whatever keeps the shared state. In this
// slice it is implemented by LocalBackend, which runs in the page and plays the other islanders
// itself. The online version (see docs/DESIGN.md §联网) implements the same methods on top of
// Postgres functions, and nothing else in the game has to change. Every method is async for
// that reason.

import { ITEMS, type ItemId } from './data'
import { $t } from '../i18n'

/** Round 21: orders grow with the island. What a new island can gather; what a middling one can make;
 * what only a big one has. An island asks first for the things on its own wish list that are of the
 * tier it is asking in, and otherwise for anything of that tier. */
export const ORDER_TIERS: Record<1 | 2 | 3, ItemId[]> = {
  1: ['berry', 'plank', 'stone', 'wood', 'sardine', 'carrot', 'fiber', 'wheat', 'shell', 'coal'],
  2: ['copperIngot', 'ironIngot', 'rope', 'cloth', 'bream', 'mackerel', 'bench', 'bread', 'omelette', 'pumpkin', 'strawberry', 'flowerBed', 'grilledFish', 'carrotSoup'],
  3: ['goldIngot', 'crystal', 'tuna', 'moonfish', 'octopus', 'lampPost', 'crystalLamp', 'seafoodFeast', 'strawberryPie', 'pearl'],
}
export const TIER_NAME: Record<1 | 2 | 3, string> = { 1: $t('小单'), 2: $t('中单'), 3: $t('大单') }
/** which tiers an island of this level is asked for, and how often: [tier, weight] */
export function tiersFor(level: number): [1 | 2 | 3, number][] {
  return level <= 3 ? [[1, 1]] : level <= 6 ? [[1, 0.3], [2, 0.7]] : [[2, 0.4], [3, 0.6]]
}
const tierOfItem = (item: ItemId): 1 | 2 | 3 | 0 => (ORDER_TIERS[1].includes(item) ? 1 : ORDER_TIERS[2].includes(item) ? 2 : ORDER_TIERS[3].includes(item) ? 3 : 0)

export interface Order {
  id: string
  /** buy: someone wants goods brought to their island · sell: someone offers goods they will bring */
  kind: 'buy' | 'sell'
  /** who posted it, and the island they live on */
  by: string
  island: string
  item: ItemId
  qty: number
  /** coins for the whole lot, held in escrow from the moment the order is taken */
  price: number
  status: 'open' | 'taken' | 'done' | 'cancelled'
  mine: boolean
  /** how pirate-ridden the way there is (0 … 3): the pay already includes the danger money */
  danger: number
  /** to forward (the lighthouse): the goods are handed over when it is taken; it pays a commission */
  relay?: boolean
  /** sell orders: the island the buyer lives on, once there is a buyer */
  buyerIsland?: string
  buyer?: string
  created: number
  /** posted by another player (online), not by an islander */
  player?: boolean
  /** how big a job it is (round 21): 1 small (raw goods), 2 middling (made goods), 3 large (the rare and the fine) */
  tier?: 1 | 2 | 3
}

/** goods the player has promised to carry to an island */
export interface Delivery {
  id: string
  orderId: string
  item: ItemId
  qty: number
  /** island the goods must be landed on */
  dest: string
  /** who is waiting for them */
  to: string
  reward: number
  /** buy: the goods come out of the player's stock when loaded · sell: they were set aside when the order was posted */
  source: 'buy' | 'sell'
  state: 'pending' | 'loaded' | 'done'
  /** seconds a prompt delivery takes: beat it for a tip */
  par: number
  loadedAt?: number
  danger: number
  /** units lost on the way (to pirates): the buyer pays for what arrives */
  lost?: number
}

export interface ShopLine { item: ItemId; price: number; stock: number }
export type BackendEvent =
  | { type: 'sold'; order: Order; delivery: Delivery }
  /** another player has brought what this player ordered (online) */
  | { type: 'received'; item: ItemId; qty: number; from: string; refund: number; card?: string }

export interface Backend {
  orders(): Promise<Order[]>
  deliveries(): Promise<Delivery[]>
  /** take a buy order: the player commits to deliver it */
  accept(orderId: string): Promise<Delivery>
  /** offer goods for sale (the caller has already set the goods aside) */
  postSell(item: ItemId, qty: number, price: number): Promise<Order>
  cancelSell(orderId: string): Promise<void>
  /** give a delivery up; the order goes back on the board */
  abandon(deliveryId: string): Promise<Delivery>
  markLoaded(deliveryId: string, now: number): Promise<void>
  /** some of a loaded delivery was taken on the way */
  lose(deliveryId: string, units: number): Promise<void>
  /** the goods have been landed on the island: pays for what arrived, and a tip if all of it came promptly */
  complete(deliveryId: string, now: number, card?: string): Promise<{ reward: number; tip: number; delivered: number }>
  /** what an island's own shop sells to visitors */
  shop(island: string): Promise<ShopLine[]>
  buy(island: string, item: ItemId, qty: number): Promise<number>
  /** things that happened since the last call (a real server would push these) */
  poll(now: number): Promise<BackendEvent[]>
  /** online only: ask other players for goods, and take the request back (resolves to the coins returned) */
  postBuy?(item: ItemId, qty: number, price: number, now: number): Promise<void>
  cancelBuy?(orderId: string): Promise<number>
}

// ───────────────────────────────────────────────────────────── the local stand-in

export interface Neighbour { id: string; owner: string; dist: number; sells: ItemId[]; wants: ItemId[]; danger: number }
export interface LocalState {
  seq: number
  orders: Order[]
  deliveries: Delivery[]
  nextSpawn: number
  shops: Record<string, ShopLine[]>
  /** sell orders waiting for a (pretend) buyer: order id → when one turns up */
  pending: Record<string, number>
}

/** the going rate for a lot delivered to the door: goods at a premium, plus freight for the distance */
export function fairPrice(item: ItemId, qty: number, dist: number, danger = 0): number {
  return Math.round((qty * ITEMS[item].value * 1.5 + 20 + dist * 0.03) * (1 + DANGER_PAY * danger))
}
/** each level of danger on a route adds this much to the pay */
export const DANGER_PAY = 0.28
/** seconds a prompt delivery over this distance takes */
export function parTime(dist: number): number {
  return Math.round(30 + dist / 22)
}

/** an islander's order nobody takes is taken down after this many seconds, so the board turns over */
export const ORDER_LIFE = 480
/** how many open orders the board holds */
export const BOARD_SIZE = 6

export function newLocalState(): LocalState {
  return { seq: 1, orders: [], deliveries: [], nextSpawn: 0, shops: {}, pending: {} }
}

export class LocalBackend implements Backend {
  private events: BackendEvent[] = []
  constructor(
    public s: LocalState,
    private neighbours: Neighbour[],
    private rnd: () => number = Math.random,
    /** the most the player's best vehicle carries: new orders are sized to fit it */
    public hold: () => number = () => 20,
    /** the player's island level: what is asked for grows with it (round 21) */
    public level: () => number = () => 1,
  ) {
    // each island's shop sells its specialities, at a mark-up, a few dozen coins' worth at a time
    for (const n of this.neighbours) {
      this.s.shops[n.id] ??= n.sells.map((item) => ({ item, price: Math.max(2, Math.round(ITEMS[item].value * 1.4)), stock: Math.max(3, Math.min(40, Math.round(150 / ITEMS[item].value))) }))
    }
    if (!this.s.orders.length) this.seed()
  }

  private id(prefix: string) {
    return prefix + this.s.seq++
  }
  private nb(island: string) {
    const n = this.neighbours.find((x) => x.id === island)
    if (!n) throw new Error('unknown island ' + island)
    return n
  }
  private addBuy(island: string, item: ItemId, qty: number, now: number, relay = false) {
    const n = this.nb(island)
    const price = fairPrice(item, qty, n.dist, n.danger)
    const tier = tierOfItem(item) || undefined
    this.s.orders.push({
      id: this.id('o'), kind: 'buy', by: n.owner, island, item, qty, ...(tier ? { tier } : {}),
      // to forward, the goods are not yours: what is paid is the carrying (the goods' worth taken off)
      price: relay ? Math.max(20, Math.round(price - ITEMS[item].value * qty * 0.85)) : price,
      status: 'open', mine: false, created: now, danger: n.danger, ...(relay ? { relay } : {}),
    })
  }
  /** the lighthouse stands: some of the orders that turn up are goods to forward */
  public relayOn = false
  /** how many of a thing make a sensible lot: 40–110 coins' worth, never more than a boat-load */
  private lot(item: ItemId): number {
    // a bigger hold is offered bigger lots (and so bigger pay): up to ten times the first plane's,
    // so the airship and the big ships (60–160) still get more than the level-9 freighter (44)
    const hold = this.hold()
    const tier = tierOfItem(item) || 2
    // small jobs stay small (a trip in the first plane); large ones are worth the big hold
    const base = tier === 1 ? 30 + this.rnd() * 45 : tier === 2 ? 40 + this.rnd() * 70 : 60 + this.rnd() * 110
    const worth = base * Math.min(10, Math.max(1, hold / 6))
    return Math.max(1, Math.min(100, hold, Math.round(worth / ITEMS[item].value)))
  }
  /** this island's next ask, at a tier the player's island is ready for */
  private pick(n: Neighbour): ItemId | null {
    const tiers = tiersFor(this.level())
    let r = this.rnd() * tiers.reduce((a, [, w]) => a + w, 0)
    let tier = tiers[tiers.length - 1][0]
    for (const [t, w] of tiers) if ((r -= w) < 0) { tier = t; break }
    const own = n.wants.filter((i) => tierOfItem(i) === tier)
    const pool = own.length && this.rnd() < 0.7 ? own : ORDER_TIERS[tier]
    return pool[(this.rnd() * pool.length) | 0] ?? null
  }
  /** the board a new player finds: a small order from each neighbour, the nearest one first */
  private seed() {
    const near = [...this.neighbours].sort((a, b) => a.dist - b.dist)
    near.filter((n) => n.danger === 0).forEach((n, i) => {
      // the nearest neighbour asks for the first thing on its list a new island can have (a known first job)
      const first = i === 0 && this.level() <= 3 ? n.wants.find((w) => tierOfItem(w) === 1) : undefined
      const item = first ?? this.pick(n)
      if (item) this.addBuy(n.id, item, i === 0 ? Math.min(4, this.lot(item)) : this.lot(item), 0)
    })
  }
  private spawn(now: number) {
    const open = this.s.orders.filter((o) => o.kind === 'buy' && o.status === 'open')
    if (open.length >= BOARD_SIZE) return
    // the safe islands post more; and while the board has nothing safe that fits, the next one is safe
    const fits = (o: Order) => o.danger === 0 && o.qty <= this.hold()
    let pool = this.neighbours
    // a new island is sent only on the safe runs
    if (this.level() <= 3 && pool.some((n) => n.danger === 0)) pool = pool.filter((n) => n.danger === 0)
    if (!pool.length) return
    const safe = pool.filter((n) => n.danger === 0)
    let cand = pool
    if (safe.length && !open.some(fits)) cand = safe
    const w = cand.map((n) => (n.danger === 0 ? 3 : n.danger === 1 ? 2 : 1))
    let r = this.rnd() * w.reduce((a, b) => a + b, 0)
    let n = cand[cand.length - 1]
    for (let i = 0; i < cand.length; i++) if ((r -= w[i]) < 0) { n = cand[i]; break }
    const item = this.pick(n)
    if (!item || open.some((o) => o.island === n.id && o.item === item)) return
    this.addBuy(n.id, item, this.lot(item), now, this.relayOn && this.rnd() < 0.35)
  }
  /** islanders' orders that have hung there too long, or that no vehicle the player has could carry, come down */
  private expire(now: number) {
    for (const o of this.s.orders) {
      if (o.kind !== 'buy' || o.status !== 'open' || o.player || o.mine) continue
      // (the first board is made before the clock is known: its orders start counting now)
      if (!o.created) { o.created = now; continue }
      if (now - o.created > ORDER_LIFE || (o.qty > this.hold() && now - o.created > 60)) o.status = 'cancelled'
    }
  }
  async orders() {
    return this.s.orders.filter((o) => o.status === 'open' || (o.mine && o.status === 'taken'))
  }
  async deliveries() {
    return this.s.deliveries.filter((d) => d.state !== 'done')
  }
  async accept(orderId: string) {
    const o = this.s.orders.find((x) => x.id === orderId)
    if (!o || o.kind !== 'buy' || o.status !== 'open') throw new Error($t('这张单子已经被接走了'))
    o.status = 'taken'
    const n = this.nb(o.island)
    const d: Delivery = {
      id: this.id('d'), orderId: o.id, item: o.item, qty: o.qty, dest: o.island, to: o.by,
      reward: o.price, source: 'buy', state: 'pending', par: parTime(n.dist), danger: n.danger,
    }
    this.s.deliveries.push(d)
    return d
  }
  async postSell(item: ItemId, qty: number, price: number) {
    const o: Order = { id: this.id('o'), kind: 'sell', by: $t('你'), island: 'home', item, qty, price, status: 'open', mine: true, created: 0, danger: 0 }
    this.s.orders.push(o)
    this.s.pending[o.id] = -1 // decided at the next poll, which knows the time
    return o
  }
  async cancelSell(orderId: string) {
    const o = this.s.orders.find((x) => x.id === orderId)
    if (!o || !o.mine || o.status !== 'open') throw new Error($t('这张单子不能撤了'))
    o.status = 'cancelled'
    delete this.s.pending[orderId]
  }
  async abandon(deliveryId: string) {
    const i = this.s.deliveries.findIndex((x) => x.id === deliveryId)
    if (i < 0) throw new Error($t('没有这张送货单'))
    const d = this.s.deliveries[i]
    this.s.deliveries.splice(i, 1)
    const o = this.s.orders.find((x) => x.id === d.orderId)
    if (o) o.status = o.kind === 'buy' ? 'open' : 'cancelled'
    return d
  }
  async markLoaded(deliveryId: string, now: number) {
    const d = this.s.deliveries.find((x) => x.id === deliveryId)
    if (!d) return
    d.state = 'loaded'
    if (d.loadedAt === undefined) d.loadedAt = now
  }
  async lose(deliveryId: string, units: number) {
    const d = this.s.deliveries.find((x) => x.id === deliveryId)
    if (d && d.state === 'loaded') d.lost = Math.min(d.qty - 1, (d.lost ?? 0) + units)
  }
  async complete(deliveryId: string, now: number) {
    const d = this.s.deliveries.find((x) => x.id === deliveryId)
    if (!d || d.state !== 'loaded') throw new Error($t('货还没装上'))
    d.state = 'done'
    const o = this.s.orders.find((x) => x.id === d.orderId)
    if (o) o.status = 'done'
    const delivered = d.qty - (d.lost ?? 0)
    const prompt = d.loadedAt !== undefined && now - d.loadedAt <= d.par
    const reward = Math.round((d.reward * delivered) / d.qty)
    return { reward, tip: prompt && delivered === d.qty ? Math.round(d.reward * 0.15) : 0, delivered }
  }
  async shop(island: string) {
    return this.s.shops[island] ?? []
  }
  async buy(island: string, item: ItemId, qty: number) {
    const line = (this.s.shops[island] ?? []).find((l) => l.item === item)
    if (!line || line.stock < qty) throw new Error($t('存货不够'))
    line.stock -= qty
    return line.price * qty
  }
  async poll(now: number) {
    // what is finished is forgotten (the save stays small however long the game goes on)
    if (this.s.orders.length > 40) this.s.orders = this.s.orders.filter((o) => o.status === 'open' || o.status === 'taken')
    if (this.s.deliveries.length > 20) this.s.deliveries = this.s.deliveries.filter((d) => d.state !== 'done')
    this.expire(now)
    // other islanders post what they need
    if (now >= this.s.nextSpawn) {
      this.spawn(now)
      this.s.nextSpawn = now + 25 + this.rnd() * 20
    }
    // and buy what the player offers, when the price is fair
    for (const id of Object.keys(this.s.pending)) {
      const o = this.s.orders.find((x) => x.id === id)
      if (!o || o.status !== 'open') {
        delete this.s.pending[id]
        continue
      }
      if (this.s.pending[id] < 0) {
        const n = this.neighbours[(this.rnd() * this.neighbours.length) | 0]
        if (o.price <= fairPrice(o.item, o.qty, n.dist, n.danger) * 1.15) {
          o.buyerIsland = n.id
          o.buyer = n.owner
          this.s.pending[id] = now + 5 + this.rnd() * 6
        } else delete this.s.pending[id] // too dear: it just sits on the board
        continue
      }
      if (now < this.s.pending[id]) continue
      delete this.s.pending[id]
      o.status = 'taken'
      const n = this.nb(o.buyerIsland!)
      const d: Delivery = {
        id: this.id('d'), orderId: o.id, item: o.item, qty: o.qty, dest: n.id, to: n.owner,
        reward: o.price, source: 'sell', state: 'pending', par: parTime(n.dist), danger: n.danger,
      }
      this.s.deliveries.push(d)
      this.events.push({ type: 'sold', order: o, delivery: d })
    }
    const out = this.events
    this.events = []
    return out
  }
}
