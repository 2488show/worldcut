// The stock machine (炒股机). Five made-up companies of the islands, priced in the game's coins, as
// Animal Crossing's turnips are a little market of their own. Spare coins can go in; a good week
// can make some; a bad one loses some. Nothing here is real money or a real company.
//
// How a price moves, once each game hour (fifty seconds):
//   - noise: a random step, its size the company's volatility (the spice traders are steady, the
//     shipping line is jumpy). The steps come from a hash of the island's seed and the hour, so the
//     same island always sees the same market;
//   - pull: towards the company's "worth" (fair), a tenth of the way each hour;
//   - the worth itself moves with what happens: the morning's news (the day's weather, the
//     season, a big order, a cave-in) and the player: every delivery to an island lifts its
//     company's worth a little, and every delivery at all lifts the shipping line.
// A trade costs 1% (at least 1 coin), so buying and selling within the hour does not pay.

import type { Game } from './game'
import { DAY_SECONDS } from './body'
import { $t } from '../i18n'

export interface Company { id: StockId; name: string; island?: string; base: number; vol: number; what: string }
export type StockId = 'ore' | 'wood' | 'fish' | 'spice' | 'ship'
export const COMPANIES: Company[] = [
  { id: 'ore', name: $t('石峰矿业'), island: 'peak', base: 40, vol: 0.022, what: $t('铁矿和煤。暴雨天矿洞进水，停工。') },
  { id: 'wood', name: $t('松林木业'), island: 'pine', base: 26, vol: 0.018, what: $t('木材和松脂。下雪天山路难走，运不出来。') },
  { id: 'fish', name: $t('珊瑚渔业'), island: 'reef', base: 32, vol: 0.03, what: $t('鱼和珍珠。晴天出海多，暴雨天全歇。') },
  { id: 'spice', name: $t('沙丘香料'), island: 'dune', base: 55, vol: 0.01, what: $t('香料和布。稳，一年到头都有人买。') },
  { id: 'ship', name: $t('云屿航运'), base: 18, vol: 0.04, what: $t('整片海的货运。送的货越多，它越值钱；海盗多的时候也跌得最狠。') },
]
/** what can happen to each company (the morning paper picks one, now and then) */
const GOOD_NEWS: Record<StockId, string[]> = {
  ore: [$t('发现一条新矿脉'), $t('新打了一口竖井'), $t('远海的船厂订了一大批铁'), $t('新来的矿工手艺好')],
  wood: [$t('接到一笔造船的大订单'), $t('新种的林子成材了'), $t('锯木坊换了新锯子'), $t('岛主说今年要扩建')],
  fish: [$t('渔获丰收'), $t('捞到一船珍珠'), $t('新船下水'), $t('和远海的商人签了长约')],
  spice: [$t('新调的香料卖疯了'), $t('和远海的商人签了长约'), $t('布匹供不应求'), $t('岛主的老配方重新开张')],
  ship: [$t('新航线开通'), $t('新船下水'), $t('海盗少了'), $t('接到全海的运输合同')],
}
const BAD_NEWS: Record<StockId, string[]> = {
  ore: [$t('矿洞塌了一段'), $t('镐子坏了一大批'), $t('工人们闹着要涨工钱'), $t('矿石卖不动')],
  wood: [$t('锯木坊失火'), $t('虫子啃坏了一片林子'), $t('木头堆在码头运不走'), $t('工人们闹着要涨工钱')],
  fish: [$t('渔网被礁石刮破了'), $t('鱼群游走了'), $t('仓库失火'), $t('一船鱼坏在半路')],
  spice: [$t('一批香料受了潮'), $t('账本出了问题'), $t('主顾跑了'), $t('布匹压在仓库里')],
  ship: [$t('一船货被海盗劫了'), $t('两条船搁浅了'), $t('账本出了问题'), $t('码头工人罢工')],
}
const BY_ID = Object.fromEntries(COMPANIES.map((c) => [c.id, c])) as Record<StockId, Company>
/** one tick a game hour */
export const TICK = DAY_SECONDS / 24
/** hourly prices kept (ten days), and daily closes (sixty) */
const KEEP_HOURS = 24 * 10
const KEEP_DAYS = 60
const KEEP_NEWS = 40
export const FEE = 0.01

/** where a piece of news came from. The paper is always true; the tabloid, the column and what a
 * guest says may not be (round 20). */
export type Src = 'paper' | 'weather' | 'tabloid' | 'column' | 'guest'
export const SRC_NAME: Record<Src, string> = { paper: $t('云屿日报'), weather: $t('气象台'), tabloid: $t('海风小报'), column: $t('股评专栏'), guest: $t('听来的') }
export interface News { day: number; text: string; co: StockId | null; k: number; src?: Src; /** it was not true (never shown until the paper corrects it) */ fake?: boolean; outed?: boolean; who?: string }
/** the shape of a company's week (round 20): hidden, but it shows in the chart, and next Monday's paper says what it was */
export type Trend = 'flat' | 'rise' | 'spike' | 'slide'
export const TREND_NAME: Record<Trend, string> = { flat: $t('横盘'), rise: $t('缓涨'), spike: $t('中途暴涨'), slide: $t('阴跌') }
const TREND_SAY: Record<Trend, string> = { flat: $t('没什么动静'), rise: $t('会慢慢往上走'), spike: $t('要有大动作，会猛涨一下'), slide: $t('不太妙，会一路往下') }
const TRENDS: Trend[] = ['flat', 'rise', 'spike', 'slide']
export interface StockSave {
  tick: number
  px: Record<StockId, number>
  fair: Record<StockId, number>
  hours: Record<StockId, number[]>
  closes: Record<StockId, number[]>
  hold: Partial<Record<StockId, { n: number; cost: number }>>
  news: News[]
  /** coins made (or lost) on what has been sold */
  realised: number
  /** deliveries counted already (to each islander, and in all) */
  seen: Record<string, number>
  seenAll: number
  lastDay: number
}

/** a number from the hash of a few integers, 0–1 */
function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h + 0.5) / 4294967296
}
/** roughly normal, from two hashes */
function gauss(a: number, b: number, c: number): number {
  const u = hash01(a, b, c), v = hash01(a + 7, b * 3 + 1, c + 11)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const round2 = (x: number) => Math.round(x * 100) / 100

export class Stocks {
  constructor(private g: Game) {}

  get save(): StockSave {
    const g = this.g
    if (!g.save.stocks) {
      const px = {} as Record<StockId, number>, fair = {} as Record<StockId, number>, hours = {} as Record<StockId, number[]>, closes = {} as Record<StockId, number[]>
      for (const c of COMPANIES) {
        px[c.id] = c.base; fair[c.id] = c.base; hours[c.id] = []; closes[c.id] = []
      }
      g.save.stocks = { tick: this.nowTick() - 24 * 5, px, fair, hours, closes, hold: {}, news: [], realised: 0, seen: { ...(g.save.friends ?? {}) }, seenAll: g.save.stats.delivered, lastDay: -99 }
      // five days of history before the first look, so the charts are not empty
      this.catchUp(true)
    }
    return g.save.stocks
  }
  private nowTick(): number {
    return Math.floor((this.g.save.played ?? 0) / TICK)
  }
  price(id: StockId): number { return round2(this.save.px[id]) }
  /** the change since yesterday's close, as a fraction */
  change(id: StockId): number {
    const c = this.save.closes[id]
    const prev = c.length ? c[c.length - 1] : BY_ID[id].base
    return this.save.px[id] / prev - 1
  }
  held(id: StockId): number { return this.save.hold[id]?.n ?? 0 }
  /** what is held is worth now, and what it cost */
  get worth(): { value: number; cost: number } {
    let value = 0, cost = 0
    for (const c of COMPANIES) { const h = this.save.hold[c.id]; if (h) { value += h.n * this.price(c.id); cost += h.cost } }
    return { value: Math.round(value), cost: Math.round(cost) }
  }

  // ───────────────────────────────────────────────────────────── the week's shape
  /** this company's week: flat, a slow rise, one sharp jump in the middle, or a slow slide */
  trendOf(id: StockId, week: number): Trend {
    const r = hash01(this.g.save.island.seed, week * 31 + COMPANIES.findIndex((c) => c.id === id), 23)
    return r < 0.3 ? 'flat' : r < 0.55 ? 'rise' : r < 0.75 ? 'spike' : 'slide'
  }
  /** the day of the week (2–4) a spike week jumps on */
  spikeDay(id: StockId, week: number): number {
    return 2 + Math.floor(hash01(this.g.save.island.seed, week * 31 + COMPANIES.findIndex((c) => c.id === id), 41) * 3)
  }
  /** how the week's shape moves the worth this hour (a factor) */
  private drift(id: StockId, day: number): number {
    const week = Math.floor(day / 7), wd = ((day % 7) + 7) % 7
    const tr = this.trendOf(id, week)
    if (tr === 'rise') return Math.exp(0.14 / 168)
    if (tr === 'slide') return Math.exp(-0.12 / 168)
    if (tr === 'spike') return wd === this.spikeDay(id, week) ? Math.exp(0.28 / 24) : Math.exp(-0.03 / 168)
    return 1
  }
  /** something a guest lets slip over a meal: about a company's week. The better the friend, the likelier it is true. */
  rumour(who: string, friend: number): string {
    const g = this.g
    const s = this.save
    const day = g.clockDay
    const wd = day % 7
    const next = wd >= 5 // late in the week: it is about next week
    const week = Math.floor(day / 7) + (next ? 1 : 0)
    const c = COMPANIES[Math.floor(g.rnd() * COMPANIES.length)]
    const truth = this.trendOf(c.id, week)
    const sure = Math.min(0.9, 0.55 + 0.05 * friend)
    const told = g.rnd() < sure ? truth : TRENDS.filter((t) => t !== truth)[Math.floor(g.rnd() * 3)]
    const text = next ? $t('{0}下周{1}', c.name, TREND_SAY[told]) : $t('{0}这周{1}', c.name, TREND_SAY[told])
    s.news.unshift({ day, text: $t('{0}说：{1}', who, text), co: c.id, k: 0, src: 'guest', who, fake: told !== truth })
    if (s.news.length > KEEP_NEWS) s.news.pop()
    return text
  }

  // ───────────────────────────────────────────────────────────── trading
  /** what buying n would cost, fee included */
  costOf(id: StockId, n: number): number {
    const v = this.price(id) * n
    return Math.ceil(v + Math.max(1, v * FEE))
  }
  /** the most that can be bought with the coins in hand */
  maxBuy(id: StockId): number {
    let n = Math.floor(this.g.save.coins / (this.price(id) * (1 + FEE)))
    while (n > 0 && this.costOf(id, n) > this.g.save.coins) n--
    return Math.max(0, n)
  }
  buy(id: StockId, n: number): boolean {
    const g = this.g
    n = Math.floor(n)
    if (n <= 0) return false
    const cost = this.costOf(id, n)
    if (cost > g.save.coins) { g.warn($t('金币不够')); return false }
    g.save.coins -= cost
    const h = (this.save.hold[id] ??= { n: 0, cost: 0 })
    h.n += n
    h.cost += cost
    g.sfx('buy')
    g.toast($t('买进 {0} {1} 股，花了 {2} 金币', BY_ID[id].name, n, cost))
    g.changed()
    return true
  }
  sell(id: StockId, n: number): boolean {
    const g = this.g
    const h = this.save.hold[id]
    n = Math.min(Math.floor(n), h?.n ?? 0)
    if (!h || n <= 0) return false
    const v = this.price(id) * n
    const got = Math.floor(v - Math.max(1, v * FEE))
    const basis = (h.cost * n) / h.n
    h.n -= n
    h.cost -= basis
    if (h.n <= 0) delete this.save.hold[id]
    g.save.coins += got
    this.save.realised += got - basis
    g.pay(got, g.pilot.x, g.pilot.y, g.pilot.z + 10)
    g.sfx(got >= basis ? 'coin' : 'tap')
    g.toast($t('卖出 {0} {1} 股，收回 {2} 金币（{3} {4}）', BY_ID[id].name, n, got, got >= basis ? $t('赚') : $t('亏'), Math.abs(Math.round(got - basis))))
    g.changed()
    return true
  }

  // ───────────────────────────────────────────────────────────── the market moving
  step() {
    if (this.nowTick() > this.save.tick) this.catchUp(false)
  }
  /** every hour since the last look (after a night's sleep, a day's worth at once) */
  private catchUp(quiet: boolean) {
    const s = this.save
    const to = this.nowTick()
    // more than a week away (a very old save): start the week before
    if (to - s.tick > 24 * 7) s.tick = to - 24 * 7
    while (s.tick < to) {
      s.tick++
      this.hour(s.tick, quiet || s.tick < to)
    }
    if (!quiet) this.g.changed()
  }
  private hour(t: number, quiet: boolean) {
    const g = this.g
    const s = this.save
    const seed = g.save.island.seed
    const day = Math.floor(t / 24)
    if (day !== s.lastDay) {
      // the close of the day before, and the morning's news
      if (s.lastDay > -99) for (const c of COMPANIES) { s.closes[c.id].push(round2(s.px[c.id])); if (s.closes[c.id].length > KEEP_DAYS) s.closes[c.id].shift() }
      s.lastDay = day
      this.morning(day, quiet)
    }
    // what the player has done since: deliveries lift the companies they help
    const friends = g.save.friends ?? {}
    for (const c of COMPANIES) {
      if (!c.island) continue
      const d = (friends[c.island] ?? 0) - (s.seen[c.island] ?? 0)
      if (d > 0) s.fair[c.id] *= 1 + 0.03 * Math.min(d, 5)
    }
    s.seen = { ...friends }
    const all = g.save.stats.delivered - s.seenAll
    if (all > 0) s.fair.ship *= 1 + 0.02 * Math.min(all, 5)
    s.seenAll = g.save.stats.delivered
    for (const c of COMPANIES) {
      const i = COMPANIES.indexOf(c)
      // the worth drifts back towards where it belongs (a little growth over time) …
      const home = c.base * (1 + 0.002 * day)
      s.fair[c.id] += (home - s.fair[c.id]) * 0.01
      s.fair[c.id] *= this.drift(c.id, day)
      // … and the price follows the worth, with the hour's noise
      const z = gauss(seed, i * 100003 + 17, t)
      const pull = 0.1 * Math.log(s.fair[c.id] / s.px[c.id])
      s.px[c.id] = Math.max(1, s.px[c.id] * Math.exp(c.vol * z + pull))
      const h = s.hours[c.id]
      h.push(round2(s.px[c.id]))
      if (h.length > KEEP_HOURS) h.shift()
    }
  }
  /** the morning paper: the weather's say, and now and then something that happened to a company */
  private morning(day: number, quiet: boolean) {
    const g = this.g
    const s = this.save
    const seed = g.save.island.seed
    const post = (n: News) => { s.news.unshift(n); if (s.news.length > KEEP_NEWS) s.news.pop() }
    const say = (co: StockId | null, k: number, text: string) => {
      if (co) s.fair[co] *= 1 + k
      else for (const c of COMPANIES) s.fair[c.id] *= 1 + k
      post({ day, text, co, k, src: 'paper' })
    }
    // the paper puts right what the tabloid got wrong yesterday
    for (const n of s.news) if (n.src === 'tabloid' && n.fake && !n.outed && n.day < day) { n.outed = true; post({ day, text: $t('更正：海风小报前些天说的“{0}”不实', n.text), co: n.co, k: 0, src: 'paper' }) }
    // Monday: what last week's shapes were (so they can be learnt)
    if (day > 0 && day % 7 === 0) post({ day, text: $t('上周回顾：{0}', COMPANIES.map((c) => $t('{0}{1}', c.name, TREND_NAME[this.trendOf(c.id, day / 7 - 1)])).join($t('，'))), co: null, k: 0, src: 'paper' })
    const wx = g.weather.kindOn(day)
    if (wx === 'storm') { say('fish', -0.08, $t('暴雨：珊瑚渔业船队全部停航')); say('ore', -0.04, $t('暴雨：石峰矿洞进水停工')) }
    else if (wx === 'snow') say('wood', -0.06, $t('大雪封山：松林木业运不出木头'))
    else if (wx === 'clear' && hash01(seed, day, 3) < 0.4) say('fish', 0.04, $t('晴天出海，珊瑚渔业渔获丰收'))
    else if (wx === 'fog') say('ship', -0.03, $t('大雾：航线延误，云屿航运承压'))
    const season = g.season
    if (season && day % 7 === 0) {
      if (season.id === 'winter') say('spice', 0.05, $t('入冬，沙丘香料的暖身香料卖得好'))
      if (season.id === 'summer') say('fish', 0.05, $t('夏季渔汛开始'))
      if (season.id === 'autumn') say('wood', 0.05, $t('秋天到了，大家都在囤柴火'))
    }
    // and one day in three, a piece of company news
    const r = hash01(seed, day, 7)
    if (r < 0.33) {
      const c = COMPANIES[Math.floor(hash01(seed, day, 9) * COMPANIES.length)]
      const good = hash01(seed, day, 11) < 0.55
      const big = hash01(seed, day, 13) < 0.25
      const k = (good ? 1 : -1) * (big ? 0.15 : 0.07)
      const pickOne = (xs: string[]) => xs[Math.floor(hash01(seed, day, 17) * xs.length)]
      const text = $t('{0}{1}{2}', c.name, pickOne((good ? GOOD_NEWS : BAD_NEWS)[c.id]), big ? $t('（大消息）') : '')
      say(c.id, k, text)
    }
    // the weather office: tomorrow's weather, a day early
    const wx1 = g.weather.kindOn(day + 1)
    if (wx1 === 'storm') post({ day, text: $t('明天有暴雨：渔船和矿洞多半要停'), co: 'fish', k: 0, src: 'weather' })
    else if (wx1 === 'snow') post({ day, text: $t('明天下大雪：山路要封'), co: 'wood', k: 0, src: 'weather' })
    else if (wx1 === 'fog') post({ day, text: $t('明天有大雾：航线会延误'), co: 'ship', k: 0, src: 'weather' })
    // the tabloid: loud, and wrong nearly half the time. The market jumps on it either way; if it
    // was not true the price comes back within the day
    if (hash01(seed, day, 29) < 0.45) {
      const c = COMPANIES[Math.floor(hash01(seed, day, 31) * COMPANIES.length)]
      const good = hash01(seed, day, 33) < 0.5
      const fake = hash01(seed, day, 37) < 0.45
      const k = good ? 0.08 : -0.08
      const xs = (good ? GOOD_NEWS : BAD_NEWS)[c.id]
      s.px[c.id] = Math.max(1, s.px[c.id] * (1 + k * 0.7))
      if (!fake) s.fair[c.id] *= 1 + k
      post({ day, text: $t('有人看见{0}{1}', c.name, xs[Math.floor(hash01(seed, day, 39) * xs.length)]), co: c.id, k, src: 'tabloid', fake })
    }
    // the column, midweek: a guess at one company's week (right two times in three)
    if (day % 7 === 2) {
      const c = COMPANIES[Math.floor(hash01(seed, day, 43) * COMPANIES.length)]
      const truth = this.trendOf(c.id, Math.floor(day / 7))
      const right = hash01(seed, day, 47) < 0.66
      const told = right ? truth : TRENDS.filter((t) => t !== truth)[Math.floor(hash01(seed, day, 49) * 3)]
      post({ day, text: $t('看图说话：{0}这周像是“{1}”', c.name, TREND_NAME[told]), co: c.id, k: told === 'slide' ? -0.01 : told === 'flat' ? 0 : 0.01, src: 'column', fake: !right })
    }
    const top = s.news.find((n) => n.day === day && (n.src ?? 'paper') === 'paper' && n.k !== 0)
    if (!quiet && top) g.toast($t('股市早报：{0}', top.text))
  }
  /** for the panel: the news of the last few days */
  get news(): News[] { return this.save.news }
}
