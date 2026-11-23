// Other players. The game is asynchronous: nobody has to be online at the same time. What is
// shared is small — each player's island as a card (the seed it grows from, its level, its
// furniture), and the orders players post for each other — and lives in a document store that
// the page is given (see ui/cloud.ts). Everything else stays in the player's own save.
//
//   islands/<uid>            the island card: readable by all, written by its owner only
//   orders/<id>              a buy order one player posts and another delivers
//   data/users/<uid>/save    the player's own save (private): the same game on another device
//
// The store is not a referee: shared data is checked for shape and range when it is read, and
// that is all. It is the right size for people who know each other. A public game needs the
// server described in docs/DESIGN.md.

import type { Game, Save } from './game'
import { FURNITURE, ITEMS, type ItemId } from './data'
import { PAINTABLE, readPaint, type Paint } from '../engine/craft'
import { GUEST_SLOTS, type GuestIsland } from './world'
import { parTime, type Backend, type BackendEvent, type Delivery, type LocalBackend, type Order } from './backend'
import { $t } from '../i18n'

export interface Cloud {
  /** who is playing (an opaque id) */
  uid: string
  /** false: this player may look but not post (their share level is view-only) */
  canWrite: boolean
  get(path: string): Promise<Record<string, unknown> | null>
  set(path: string, data: Record<string, unknown>): Promise<void>
  update(path: string, data: Record<string, unknown>): Promise<void>
  remove(path: string): Promise<void>
  list(collection: string): Promise<{ id: string; data: Record<string, unknown> }[]>
  /** a short exclusive hold on a document; false when someone else has it */
  lock(path: string, ms: number): Promise<boolean>
}

export interface Decor { item: ItemId; dx: number; dy: number; rot?: number }
export interface IslandCard { name: string; seed: number; tier: number; decor: Decor[]; charm: number; delivered: number; at: number
  /** the craft they fly, in its paint: other players meet it on the way */
  craft?: { model: string; kind: 'plane' | 'boat'; paint?: Paint } }
export interface RemoteOrder {
  id: string
  by: string
  /** the name of the island that wants the goods */
  island: string
  item: ItemId
  qty: number
  price: number
  status: 'open' | 'taken' | 'done'
  taker: string | null
  takerName: string
  delivered: number
  created: number
  /** a postcard sent with the goods (a small picture, as a data URL) */
  card?: string
}

export const MAX_OPEN_ORDERS = 3
const SYNC_EVERY = 20 // seconds between looks at the shared store
const SAVE_EVERY = 120 // seconds between copies of the save going up
const STALE_TAKE = 86400 // an order taken and not delivered for a day is anyone's again

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>\n\r\t]/g, '').trim().slice(0, max) : '')

/** an island card as read from the store: nothing in it is trusted */
export function readCard(d: Record<string, unknown>): IslandCard | null {
  if (typeof d.seed !== 'number' || !Number.isFinite(d.seed)) return null
  const decor: Decor[] = []
  if (Array.isArray(d.decor)) {
    for (const x of d.decor.slice(0, 80) as Record<string, unknown>[]) {
      if (!x || typeof x.item !== 'string' || !FURNITURE[x.item as ItemId]) continue
      decor.push({ item: x.item as ItemId, dx: Math.round(num(x.dx, -300, 300, 0)), dy: Math.round(num(x.dy, -300, 300, 0)), rot: Math.round(num(x.rot, 0, 3, 0)) })
    }
  }
  return {
    name: text(d.name, 10) || $t('无名小岛'), seed: Math.floor(num(d.seed, 1, 1e9, 1)), tier: Math.round(num(d.tier, 1, 3, 1)), decor,
    charm: Math.round(num(d.charm, 0, 9999, 0)), delivered: Math.round(num(d.delivered, 0, 1e6, 0)), at: num(d.at, 0, 1e12, 0),
    craft: readCraft(d.craft),
  }
}
function readCraft(v: unknown): IslandCard['craft'] {
  if (!v || typeof v !== 'object') return undefined
  const d = v as Record<string, unknown>
  if (typeof d.model !== 'string' || !PAINTABLE.includes(d.model)) return undefined
  return { model: d.model, kind: d.kind === 'boat' ? 'boat' : 'plane', paint: readPaint(d.paint) }
}
export function readOrder(id: string, d: Record<string, unknown>): RemoteOrder | null {
  if (typeof d.by !== 'string' || typeof d.item !== 'string' || !ITEMS[d.item as ItemId]) return null
  const status = d.status === 'taken' || d.status === 'done' ? d.status : 'open'
  const qty = Math.round(num(d.qty, 1, 40, 0))
  if (qty < 1) return null
  return {
    id, by: d.by, island: text(d.island, 10) || $t('无名小岛'), item: d.item as ItemId, qty, price: Math.round(num(d.price, 0, 50000, 0)), status,
    taker: typeof d.taker === 'string' ? d.taker : null, takerName: text(d.takerName, 10), delivered: Math.round(num(d.delivered, 0, qty, 0)), created: num(d.created, 0, 1e12, 0),
    card: isCard(d.card) ? d.card : undefined,
  }
}
export const guestId = (uid: string) => 'p_' + uid

export class Online {
  state: 'connecting' | 'on' | 'readonly' | 'off' = 'connecting'
  cards = new Map<string, IslandCard>()
  orders: RemoteOrder[] = []
  private syncAt = 0
  private saveAt = 0
  private sentCard = ''
  private sentSave = ''
  private busy = false
  private events: BackendEvent[] = []
  /** bumped whenever something the board shows may have changed */
  rev = 0

  constructor(private g: Game, readonly cloud: Cloud) {
    g.online = this
    g.wrapBackend = (local) => new OnlineBackend(local, this, g)
    g.makeBackend()
    if (!cloud.canWrite) this.state = 'readonly'
  }

  status(): string {
    const n = this.g.guests.length
    const others = this.cards.size
    if (this.state === 'connecting') return $t('联机：正在找别的玩家的岛…')
    if (this.state === 'off') return $t('联机断开了：先按单机继续，存档留在这台设备上。')
    const seen = others === 0 ? $t('海上暂时只有你一位玩家——把这个页面分享给朋友，对方的岛会出现在你的海图上') : $t('海图上有 {0} 位玩家的岛{1}', n, others > n ? $t('（共 {0} 位，海图放得下 {1} 座）', others, GUEST_SLOTS.length) : '')
    if (this.state === 'readonly') return $t('联机（只读）：{0}。你的分享权限不能写入，所以挂不了单、也没有云存档。', seen)
    return $t('联机：{0}。存档会同步到云端，换设备可以接着玩。', seen)
  }
  get writable() {
    return this.state === 'on'
  }
  private fail(e: unknown) {
    const code = (e as { code?: string } | null)?.code
    // a write refused for good means a view-only seat; anything else is the line dropping
    if (code === 'invalid_argument' && this.state === 'on') this.state = 'readonly'
    else if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') this.state = 'off'
  }

  /** the card other players see: only what it takes to grow this island again on their chart */
  private card(): Omit<IslandCard, 'at'> {
    const s = this.g.save
    return {
      name: s.name || $t('无名小岛'), seed: s.island.seed, tier: s.island.tier, charm: this.g.charm, delivered: s.stats.delivered,
      decor: (s.decor ?? []).slice(0, 80).map((d) => ({ item: d.item, dx: d.dx, dy: d.dy, rot: d.rot ?? 0 })),
      ...this.craftCard(),
    }
  }
  /** the vehicle they would be seen in: the best-levelled painted one (or just the best) */
  private craftCard(): Pick<IslandCard, 'craft'> {
    const g = this.g
    const vs = [...g.save.vehicles].filter((v) => PAINTABLE.includes(g.vdef(v).model)).sort((a, b) => (b.paint ? 1 : 0) - (a.paint ? 1 : 0) || g.vdef(b).lv - g.vdef(a).lv)
    const v = vs[0]
    if (!v) return {}
    const def = g.vdef(v)
    return { craft: { model: def.model, kind: def.kind, ...(v.paint ? { paint: v.paint } : {}) } }
  }

  /** called from the game's poll, about once a second: does something only when it is due */
  async tick(now: number, force = false): Promise<BackendEvent[]> {
    if (this.state !== 'off' && !this.busy && (force || now >= this.syncAt)) {
      this.busy = true
      this.syncAt = now + SYNC_EVERY
      try {
        await this.sync(now)
      } catch (e) {
        this.fail(e)
      }
      this.busy = false
    }
    const out = this.events
    this.events = []
    return out
  }

  private async sync(now: number) {
    const { cloud, g } = this
    const me = cloud.uid
    // ── read: who is out there, and what is on the board
    const [islands, orders] = await Promise.all([cloud.list('islands'), cloud.list('orders')])
    this.cards.clear()
    for (const d of islands) {
      if (d.id === me) continue
      const c = readCard(d.data)
      if (c) this.cards.set(d.id, c)
    }
    this.orders = orders.map((d) => readOrder(d.id, d.data)).filter((o): o is RemoteOrder => !!o)
    if (this.state === 'connecting') this.state = cloud.canWrite ? 'on' : 'readonly'
    this.rev++

    // ── which of them are on this player's chart: a slot, once given, is kept
    const slots = (g.save.guestSlots ??= [])
    for (let i = 0; i < GUEST_SLOTS.length; i++) if (slots[i] && !this.cards.has(slots[i]!)) slots[i] = null
    const recent = [...this.cards.entries()].sort((a, b) => b[1].at - a[1].at).map(([id]) => id)
    for (const id of recent) {
      if (slots.includes(id)) continue
      const free = [...Array(GUEST_SLOTS.length).keys()].find((i) => !slots[i])
      if (free === undefined) break
      slots[free] = id
    }
    const guests: (GuestIsland | null)[] = []
    for (let i = 0; i < GUEST_SLOTS.length; i++) {
      const id = slots[i]
      const c = id ? this.cards.get(id) : null
      guests.push(id && c ? { id: guestId(id), name: c.name, owner: c.name, seed: c.seed, tier: c.tier, decor: c.decor, slot: i } : null)
    }
    g.setGuests(guests.filter((x): x is GuestIsland => !!x))

    if (!this.writable) return
    // ── goods other players have brought: into the bag, and the order comes off the board
    for (const o of this.orders) {
      if (o.by !== me || o.status !== 'done') continue
      await cloud.remove('orders/' + o.id)
      const refund = Math.round((o.price * (o.qty - o.delivered)) / o.qty)
      this.events.push({ type: 'received', item: o.item, qty: o.delivered, from: o.takerName || $t('一位玩家'), refund, card: o.card })
    }
    this.orders = this.orders.filter((o) => !(o.by === me && o.status === 'done'))

    // ── write: the card when it has changed, the save now and then
    const card = this.card()
    const cj = JSON.stringify(card)
    if (cj !== this.sentCard) {
      await cloud.set('islands/' + me, { ...card, at: Math.round(now) })
      this.sentCard = cj
      g.onlineDirty = false
    }
    await this.backup(now, false)
  }
  /** a copy of the save goes up when it has changed (not more often than every two minutes, unless asked) */
  async backup(now: number, force: boolean) {
    if (!this.writable || (!force && now < this.saveAt)) return
    const s = this.g.save
    // (the clock fields change every frame: leave them out of "has anything happened?")
    const json = JSON.stringify(s)
    const key = JSON.stringify({ ...s, played: 0, day: 0, at: 0 })
    if (key === this.sentSave || json.length > 230000) return // (a document holds 256 KiB at most)
    this.saveAt = now + SAVE_EVERY
    try {
      await this.cloud.set(savePath(this.cloud.uid), { json, at: Math.round(now), v: s.v })
      this.sentSave = key
    } catch (e) {
      this.fail(e)
    }
  }

  // ── the board
  /** players' orders as the board shows them: the open ones for islands on this chart, and the player's own */
  board(): Order[] {
    const me = this.cloud.uid
    const out: Order[] = []
    for (const o of this.orders) {
      const mine = o.by === me
      const island = mine ? 'home' : guestId(o.by)
      if (!mine && (o.status !== 'open' || !this.g.layouts[island])) continue
      if (mine && o.status === 'done') continue
      out.push({
        id: 'r:' + o.id, kind: 'buy', by: mine ? $t('你') : o.island, island, item: o.item, qty: o.qty, price: o.price,
        status: o.status === 'open' ? 'open' : 'taken', mine, danger: 0, created: o.created, player: true, buyer: o.takerName || undefined,
      })
    }
    return out
  }
  myOpen(): number {
    return this.orders.filter((o) => o.by === this.cloud.uid && o.status !== 'done').length
  }
  /** post a buy order: another player brings the goods to this island */
  async post(item: ItemId, qty: number, price: number, now: number): Promise<void> {
    if (!this.writable) throw new Error($t('现在不能挂单：联机是只读的'))
    if (this.myOpen() >= MAX_OPEN_ORDERS) throw new Error($t('最多同时挂 {0} 张求购单', MAX_OPEN_ORDERS))
    const id = 'o' + Math.round(now).toString(36) + Math.floor(this.g.rnd() * 1e6).toString(36)
    const o: RemoteOrder = { id, by: this.cloud.uid, island: this.g.save.name || $t('无名小岛'), item, qty, price, status: 'open', taker: null, takerName: '', delivered: 0, created: Math.round(now) }
    const { id: _id, ...body } = o
    await this.cloud.set('orders/' + id, body)
    this.orders.push(o)
    this.rev++
  }
  /** take an order back off the board; resolves to the coins that come back */
  async cancel(orderId: string): Promise<number> {
    const id = orderId.slice(2)
    const fresh = await this.cloud.get('orders/' + id)
    const o = fresh ? readOrder(id, fresh) : null
    if (!o || o.by !== this.cloud.uid) throw new Error($t('这张单子已经不在了'))
    if (o.status !== 'open') throw new Error($t('已经有人接了这张单，货在路上'))
    await this.cloud.remove('orders/' + id)
    this.orders = this.orders.filter((x) => x.id !== id)
    this.rev++
    return o.price
  }
  /** claim an order for delivery (two players reaching for the same one: only one gets it) */
  async take(orderId: string, now: number): Promise<RemoteOrder> {
    if (!this.writable) throw new Error($t('现在不能接玩家的单：联机是只读的'))
    const id = orderId.slice(2)
    const path = 'orders/' + id
    if (!(await this.cloud.lock(path, 5000))) throw new Error($t('有人正在接这张单'))
    const fresh = await this.cloud.get(path)
    const o = fresh ? readOrder(id, fresh) : null
    const stale = o && o.status === 'taken' && now - num(fresh!.takenAt, 0, 1e12, 0) > STALE_TAKE
    if (!o || (o.status !== 'open' && !stale)) throw new Error($t('这张单子已经被接走了'))
    await this.cloud.update(path, { status: 'taken', taker: this.cloud.uid, takerName: this.g.save.name || $t('一位玩家'), takenAt: Math.round(now) })
    o.status = 'taken'
    o.taker = this.cloud.uid
    this.orders = this.orders.map((x) => (x.id === id ? o : x))
    this.rev++
    return o
  }
  async release(orderId: string) {
    const id = orderId.slice(2)
    try {
      await this.cloud.update('orders/' + id, { status: 'open', taker: null, takerName: '' })
    } catch (e) {
      this.fail(e) // (the order has gone: nothing to give back)
    }
    this.syncAt = 0
  }
  async finish(orderId: string, delivered: number, card?: string) {
    const id = orderId.slice(2)
    try {
      await this.cloud.update('orders/' + id, isCard(card) ? { status: 'done', delivered, card } : { status: 'done', delivered })
    } catch (e) {
      this.fail(e)
    }
    this.orders = this.orders.filter((x) => x.id !== id)
    this.syncAt = 0
  }
}

/** a postcard from another player: only a small picture, as a JPEG or PNG data URL */
export function isCard(x: unknown): x is string {
  return typeof x === 'string' && x.length < 60000 && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(x)
}

export const savePath = (uid: string) => `data/users/${uid}/save`

/** the newer of the save on this device and the one in the cloud (null: neither) */
export async function pickSave(cloud: Cloud, local: Save | null, parse: (raw: unknown) => Save | null): Promise<Save | null> {
  try {
    const d = await cloud.get(savePath(cloud.uid))
    if (!d || typeof d.json !== 'string') return local
    const remote = parse(JSON.parse(d.json))
    if (!remote) return local
    return !local || (remote.at ?? 0) > (local.at ?? 0) + 5 ? remote : local
  } catch {
    return local
  }
}

/** the market with players in it: the islanders' orders (local) and the players' (shared) on one board */
export class OnlineBackend implements Backend {
  constructor(private local: LocalBackend, private on: Online, private g: Game) {}
  async orders() {
    return [...(await this.local.orders()), ...this.on.board()]
  }
  deliveries() {
    return this.local.deliveries()
  }
  async accept(orderId: string) {
    if (!orderId.startsWith('r:')) return this.local.accept(orderId)
    const now = this.g.now()
    const o = await this.on.take(orderId, now)
    const dest = guestId(o.by)
    if (!this.g.layouts[dest]) {
      await this.on.release(orderId)
      throw new Error($t('那座岛不在你的海图上'))
    }
    const d: Delivery = {
      id: 'd' + this.local.s.seq++, orderId, item: o.item, qty: o.qty, dest, to: o.island, reward: o.price,
      source: 'buy', state: 'pending', par: parTime(this.g.distanceTo(dest)), danger: 0,
    }
    this.local.s.deliveries.push(d)
    return d
  }
  postSell(item: ItemId, qty: number, price: number) {
    return this.local.postSell(item, qty, price)
  }
  cancelSell(orderId: string) {
    return this.local.cancelSell(orderId)
  }
  async abandon(deliveryId: string) {
    const d = await this.local.abandon(deliveryId)
    if (d.orderId.startsWith('r:')) await this.on.release(d.orderId)
    return d
  }
  markLoaded(deliveryId: string, now: number) {
    return this.local.markLoaded(deliveryId, now)
  }
  lose(deliveryId: string, units: number) {
    return this.local.lose(deliveryId, units)
  }
  async complete(deliveryId: string, now: number, card?: string) {
    const d = this.local.s.deliveries.find((x) => x.id === deliveryId)
    const r = await this.local.complete(deliveryId, now)
    if (d && d.orderId.startsWith('r:')) await this.on.finish(d.orderId, r.delivered, card)
    return r
  }
  shop(island: string) {
    return this.local.shop(island)
  }
  buy(island: string, item: ItemId, qty: number) {
    return this.local.buy(island, item, qty)
  }
  async poll(now: number) {
    const a = await this.local.poll(now)
    const b = await this.on.tick(now)
    return [...a, ...b]
  }
  postBuy(item: ItemId, qty: number, price: number, now: number) {
    return this.on.post(item, qty, price, now)
  }
  cancelBuy(orderId: string) {
    return this.on.cancel(orderId)
  }
}

// ───────────────────────────────────────────────────────────── a store in memory (tests, and nothing else)
export class MemoryStore {
  docs = new Map<string, Record<string, unknown>>()
  locks = new Map<string, { holder: string; until: number }>()
  clock = 0
  client(uid: string, canWrite = true): Cloud {
    const refuse = () => Promise.reject({ code: 'invalid_argument', message: 'view only' })
    const own = (path: string) => !path.startsWith('islands/') || path === 'islands/' + uid
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
    return {
      uid, canWrite,
      get: async (path) => {
        if (path.startsWith('data/users/') && !path.startsWith(`data/users/${uid}/`)) return null
        const d = this.docs.get(path)
        return d ? clone(d) : null
      },
      set: async (path, data) => {
        if (!canWrite || !own(path)) return refuse()
        this.docs.set(path, clone(data))
      },
      update: async (path, data) => {
        if (!canWrite || !own(path) || !this.docs.has(path)) return refuse()
        this.docs.set(path, { ...this.docs.get(path), ...clone(data) })
      },
      remove: async (path) => {
        if (!canWrite || !own(path)) return refuse()
        this.docs.delete(path)
      },
      list: async (col) => {
        const out: { id: string; data: Record<string, unknown> }[] = []
        for (const [path, d] of this.docs) {
          const cut = path.lastIndexOf('/')
          if (path.slice(0, cut) === col) out.push({ id: path.slice(cut + 1), data: clone(d) })
        }
        return out.sort((a, b) => (a.id < b.id ? -1 : 1))
      },
      lock: async (path, ms) => {
        const l = this.locks.get(path)
        if (l && l.holder !== uid && l.until > this.clock) return false
        this.locks.set(path, { holder: uid, until: this.clock + ms })
        return true
      },
    }
  }
}
