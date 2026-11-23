// The computer, the stock machine, the news, the mailbox, the weather, the fish book and
// minesweeper, as blocks for the mini game (round 26). Same game calls as the web's pc.tsx,
// stocks.tsx and mailbox.tsx; one window at a time, as on the web's small screen.
import type { Game } from '../game/game'
import { COMPANIES, FEE, SRC_NAME, type Src, type StockId } from '../game/stocks'
import { WEATHER_NAME, type WeatherKind } from '../game/weather'
import { Board, SWEEP, settle, PAID_A_DAY, type SweepLevel } from '../game/sweep'
import { BOOK_FISH, FISH_INFO } from '../game/fishbook'
import type { Letter } from '../game/mail'
import { ITEMS, bagText, type ItemId } from '../game/data'
import { $t } from '../i18n'
import { C, type Block, type Sheet, type UI } from './ui'
import { albumBlocks } from './album'

const RISE = '#d8302a', FALL = '#1f8a3a'
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const tone = (x: number) => (x > 0.0005 ? RISE : x < -0.0005 ? FALL : C.dim)

// ───────────────────────────────────────────── the stock machine
const stk = { open: null as StockId | null, span: 'hours' as 'hours' | 'days' }
export function stockBlocks(game: Game): Block[] {
  const st = game.stocks
  const s = st.save
  const w = st.worth
  const floating = w.value - w.cost
  const out: Block[] = [{
    t: 'custom', h: 40, draw: (ui, x, y, cw) => {
      const cells: [string, string, string][] = [
        [$t('现金'), String(game.save.coins), C.ink], [$t('持仓'), String(w.value), C.ink],
        [$t('浮动'), (floating >= 0 ? '+' : '') + floating, tone(floating)], [$t('已实现'), (s.realised >= 0 ? '+' : '') + Math.round(s.realised), tone(s.realised)],
      ]
      const cw4 = cw / 4
      cells.forEach(([k, v, col], i) => {
        ui.text(k, x + i * cw4 + 2, y + 12, { size: 10, color: C.dim })
        ui.text(v, x + i * cw4 + 2, y + 30, { size: 14, bold: true, color: col })
      })
    },
  }]
  const news = st.news.filter((n) => n.k !== 0 && n.day >= 0).slice(0, 3)
  if (!news.length) out.push({ t: 'p', text: $t('还没有新闻。'), dim: true, small: true })
  for (const n of news) out.push({ t: 'p', text: $t('第 {0} 天 · ', n.day + 1) + SRC_NAME[n.src ?? 'paper'] + ' · ' + n.text, small: true, color: n.k > 0 ? RISE : FALL })
  for (const c of COMPANIES) {
    const p = st.price(c.id)
    const ch = st.change(c.id)
    const h = s.hold[c.id]
    const isOpen = stk.open === c.id
    const mine = h ? Math.round(h.n * p - h.cost) : 0
    const hours = s.hours[c.id].slice(-72)
    out.push({
      t: 'custom', h: 44 + (h ? 14 : 0), draw: (ui, x, y, cw) => {
        ui.bevel(x, y, cw, 40 + (h ? 14 : 0), isOpen, isOpen ? '#ffffff' : '#f0eee8')
        ui.text(c.name, x + 6, y + 17, { size: 13, bold: true })
        if (c.island) ui.text(game.islandName(c.island), x + 6, y + 33, { size: 10, color: C.dim })
        const sx = x + cw * 0.36, sw = cw * 0.28
        if (hours.length > 1) {
          const lo = Math.min(...hours), hi = Math.max(...hours), span = hi - lo || 1
          const cx2 = ui.ctx
          cx2.beginPath()
          hours.forEach((v, i) => { const px = sx + (i / (hours.length - 1)) * sw, py = y + 34 - ((v - lo) / span) * 26; i ? cx2.lineTo(px, py) : cx2.moveTo(px, py) })
          cx2.strokeStyle = hours[hours.length - 1] >= hours[0] ? RISE : FALL; cx2.lineWidth = 1.2; cx2.stroke()
        }
        ui.text(p.toFixed(2), x + cw - 64, y + 17, { size: 13, bold: true, align: 'right' })
        ui.text(pct(ch), x + cw - 6, y + 17, { size: 12, bold: true, align: 'right', color: tone(ch) })
        if (h) ui.text($t('持有 {0} 股 · 成本 {1} · ', h.n, (h.cost / h.n).toFixed(2)) + (mine >= 0 ? $t('赚') : $t('亏')) + ' ' + Math.abs(mine), x + 6, y + 50, { size: 10, color: tone(mine) })
        ui.hit(x, y, cw, 40 + (h ? 14 : 0), () => { stk.open = isOpen ? null : c.id; game.sfx('tap') })
      },
    })
    if (isOpen) {
      const pts = stk.span === 'hours' ? hours : [...s.closes[c.id].slice(-30), p]
      const max = st.maxBuy(c.id)
      out.push(
        { t: 'tabs', items: [
          { label: $t('三天（每小时）'), on: () => { stk.span = 'hours' }, active: stk.span === 'hours' },
          { label: $t('一个月（每天）'), on: () => { stk.span = 'days' }, active: stk.span === 'days' },
        ] },
        { t: 'spark', pts, h: 96, labels: true },
        { t: 'p', text: c.what, dim: true, small: true },
        { t: 'actions', btns: [
          { label: $t('买 1 股'), on: () => st.buy(c.id, 1), disabled: max < 1 },
          { label: $t('买 10 股'), on: () => st.buy(c.id, 10), disabled: max < 10 },
          { label: $t('买满（{0}）', max), on: () => st.buy(c.id, max), disabled: max < 1 },
        ] },
        { t: 'actions', btns: [
          { label: $t('卖 1 股'), on: () => st.sell(c.id, 1), disabled: !h, primary: false },
          { label: $t('卖 10 股'), on: () => st.sell(c.id, 10), disabled: !h || h.n < 10, primary: false },
          { label: $t('全卖'), on: () => st.sell(c.id, h?.n ?? 0), disabled: !h, primary: false },
        ] },
      )
    }
  }
  out.push({ t: 'p', text: $t('每小时（游戏里）跳一次价。买卖各收 {0}% 手续费。给哪座岛送货，哪家就涨一点。每家公司每周有自己的走势，周一的日报会回顾上周。消息在“新闻”里看，小报和传闻不一定是真的。有涨有跌，只投闲钱。', FEE * 100), dim: true, small: true })
  return out
}

// ───────────────────────────────────────────── the news
const TRUST: Record<Src, string> = { paper: $t('可信'), weather: $t('可信'), tabloid: $t('真假难辨'), column: $t('三次对两次'), guest: $t('看交情') }
let newsOnly: 'all' | 'sure' | 'maybe' = 'all'
function newsBlocks(game: Game): Block[] {
  const st = game.stocks
  const all = st.news.filter((n) => { const s = n.src ?? 'paper'; if (n.day < 0) return false; return newsOnly === 'all' || (newsOnly === 'sure') === (s === 'paper' || s === 'weather') })
  const days = [...new Set(all.map((n) => n.day))]
  const today = game.clockDay
  const out: Block[] = [{ t: 'tabs', items: [
    { label: $t('全部'), on: () => { newsOnly = 'all' }, active: newsOnly === 'all' },
    { label: $t('日报和气象台'), on: () => { newsOnly = 'sure' }, active: newsOnly === 'sure' },
    { label: $t('小报、专栏和传闻'), on: () => { newsOnly = 'maybe' }, active: newsOnly === 'maybe' },
  ] }]
  if (!all.length) out.push({ t: 'p', text: $t('还没有消息。明天早上再来看。'), dim: true })
  for (const d of days) {
    out.push({ t: 'h', text: d === today ? $t('今天') : d === today - 1 ? $t('昨天') : $t('第 {0} 天', d + 1), small: true })
    for (const n of all.filter((x) => x.day === d)) {
      const src = n.src ?? 'paper'
      out.push({
        t: 'row', title: n.text + (n.outed ? $t('（已被日报更正）') : ''), titleColor: n.outed ? C.dim : C.ink,
        tag: n.k !== 0 && src !== 'column' ? (n.k > 0 ? $t('利好') : $t('利空')) : undefined,
        lines: [SRC_NAME[src] + ' · ' + TRUST[src]], lineColor: n.k > 0 ? RISE : n.k < 0 ? FALL : C.dim,
      })
    }
  }
  out.push({ t: 'p', text: $t('日报和气象台说的都是真的。小报差不多一半是编的：价格会先跳一下，假的当天就跌回去，隔天日报会更正。请客人吃饭，他们会透露听来的消息；交情越深越准。'), dim: true, small: true })
  return out
}

// ───────────────────────────────────────────── the mailbox
const KIND: Record<Letter['kind'], string> = { welcome: $t('欢迎'), thanks: $t('感谢'), guest: $t('来客'), chat: $t('闲聊'), cosy: $t('评定'), note: $t('通知'), postcard: $t('明信片'), wish: $t('心愿') }
export const mailState = { at: null as number | null }
export function mailBlocks(game: Game): Block[] {
  const letters = game.mail.letters
  const l = mailState.at !== null ? letters.find((x) => x.id === mailState.at) ?? null : null
  if (l) {
    game.mail.read(l)
    const first = l.gift ? (Object.keys(l.gift)[0] as ItemId) : undefined
    const out: Block[] = [
      { t: 'actions', left: true, btns: [{ label: $t('← 收件箱'), on: () => { mailState.at = null }, primary: false }] },
      { t: 'p', text: $t('{0}：{1}', $t('发件人'), l.from), small: true, dim: true },
      { t: 'p', text: $t('{0}：{1}', $t('日期'), $t('第 {0} 天', l.day + 1)), small: true, dim: true },
      { t: 'h', text: l.title },
    ]
    if (l.photo) out.push({ t: 'p', text: '▣ ' + $t('明信片'), dim: true })
    for (const para of l.body.split('\n')) out.push(para ? { t: 'p', text: para } : { t: 'gap' })
    if (l.gift || l.coins) out.push({
      t: 'row', icon: first ?? 'coin', title: $t('{0}：{1}', $t('附件'), [l.gift ? bagText(l.gift) : '', l.coins ? $t('{0} 金币', l.coins) : ''].filter(Boolean).join($t('、'))),
      btns: [{ label: l.taken ? $t('已收下') : $t('收下附件'), on: () => game.mail.take(l), disabled: l.taken, primary: true }],
    })
    return out
  }
  const gifts = letters.filter((x) => (x.gift || x.coins) && !x.taken)
  const out: Block[] = [{ t: 'actions', btns: [{ label: $t('全部收下附件{0}', gifts.length ? $t('（{0}）', gifts.length) : ''), on: () => { for (const x of gifts) game.mail.take(x) }, disabled: !gifts.length }] }]
  if (!letters.length) out.push({ t: 'p', text: $t('还没有信。海鸥每天早上来。'), dim: true })
  for (const x of letters) out.push({
    t: 'row', title: (x.read ? '' : '● ') + x.title, titleColor: x.read ? C.dim : C.ink, tag: (x.gift || x.coins) && !x.taken ? $t('附') : undefined,
    lines: [$t('{0} · 第 {1} 天', x.from, x.day + 1) + ' · ' + KIND[x.kind]], on: () => { mailState.at = x.id; game.sfx('tap') },
  })
  return out
}

// ───────────────────────────────────────────── the weather
const SKY: Record<WeatherKind, string> = { clear: '☀', rain: '☂', storm: '⚡', snow: '❄', fog: '≋' }
function weatherBlocks(game: Game): Block[] {
  const d = game.clockDay
  return [0, 1, 2, 3, 4].map((i) => {
    const k = game.weather.kindOn(d + i)
    return { t: 'h', text: `${SKY[k]}  ${i === 0 ? $t('今天') : i === 1 ? $t('明天') : $t('第 {0} 天', d + i + 1)}`, right: WEATHER_NAME[k], rightColor: C.title1 } as Block
  })
}

// ───────────────────────────────────────────── the fish book
export function fishBlocks(game: Game): Block[] {
  const rec = game.save.records ?? {}
  const got = game.save.stats.gathered
  const have = BOOK_FISH.filter((k) => (got[k] ?? 0) > 0 || rec[k]).length
  const out: Block[] = [{ t: 'h', text: `${have} / ${BOOK_FISH.length}` }]
  for (const k of BOOK_FISH) {
    const info = FISH_INFO[k]!
    const seen = (got[k] ?? 0) > 0 || !!rec[k]
    out.push({
      t: 'row', icon: seen ? k : undefined, title: seen ? ITEMS[k].name : $t('？？？'), titleColor: seen ? C.ink : C.mid,
      tag: seen && rec[k] ? `${rec[k]!.cm} cm` : undefined,
      lines: [(seen ? `×${got[k] ?? 0} · ` : '') + `${info.how} · ${info.where}${info.when ? ` · ${info.when}` : ''}`],
    })
  }
  return out
}

// ───────────────────────────────────────────── minesweeper
const sw = { level: 'easy' as SweepLevel, board: new Board('easy'), flag: false, t0: 0, secs: 0, result: null as ReturnType<typeof settle> | null, menu: 'none' as 'none' | 'level' | 'ranks' }
function fresh(l: SweepLevel) { sw.level = l; sw.board = new Board(l); sw.result = null; sw.secs = 0; sw.menu = 'none' }
const NUM = ['', '#1c3cd8', '#1f8a3a', '#d8302a', '#10207a', '#7a1010', '#108080', '#101010', '#707070']
function sweepBlocks(game: Game): Block[] {
  const b = sw.board
  if (b.state === 'play') sw.secs = Math.floor((Date.now() - sw.t0) / 1000)
  const L = SWEEP[sw.level]
  const best = game.save.sweep?.best ?? {}
  const after = () => {
    if (b.state === 'won' && !sw.result) { sw.secs = Math.max(1, Math.round((Date.now() - sw.t0) / 1000)); sw.result = settle(game, sw.level, sw.secs) }
    else if (b.state === 'lost') game.sfx('error')
  }
  const tapCell = (i: number) => {
    if (b.state === 'won' || b.state === 'lost') return
    if (sw.flag) { if (!b.open[i]) { b.toggleFlag(i); game.sfx('tap', 1.1) } return }
    if (b.flag[i]) return
    if (b.state === 'ready') sw.t0 = Date.now()
    b.reveal(i); game.sfx('tap', 1.6); after()
  }
  const face = b.state === 'won' ? '(^_^)v' : b.state === 'lost' ? '(x_x)' : '(^_^)'
  const out: Block[] = [
    { t: 'custom', h: 34, draw: (ui, x, y, w) => {
      const led = (v: number, lx: number) => { ui.bevel(lx, y + 2, 44, 28, true, '#200000'); ui.text(String(Math.max(0, Math.min(999, v))).padStart(3, '0'), lx + 22, y + 22, { size: 16, align: 'center', color: '#ff3020', bold: true }) }
      led(b.mines - b.flags, x)
      ui.button(x + w / 2 - 34, y + 2, 68, 28, face, () => fresh(sw.level), { size: 12 })
      led(sw.secs, x + w - 44 - 48 - 6)
      ui.button(x + w - 48, y + 2, 48, 28, sw.flag ? $t('⚑ 插旗') : $t('挖开'), () => { sw.flag = !sw.flag; game.sfx('tap') }, { size: 11, primary: sw.flag })
    } },
    { t: 'tabs', items: [
      ...(Object.keys(SWEEP) as SweepLevel[]).map((l) => ({ label: SWEEP[l].name, on: () => fresh(l), active: l === sw.level })),
      { label: $t('排行榜'), on: () => { sw.menu = sw.menu === 'ranks' ? 'none' : 'ranks' }, active: sw.menu === 'ranks' },
    ] },
  ]
  if (sw.menu === 'ranks') for (const l of Object.keys(SWEEP) as SweepLevel[]) out.push({ t: 'h', text: SWEEP[l].name, right: best[l] !== undefined ? $t('{0} 秒', best[l]) : '—', small: true })
  out.push({ t: 'p', text: $t('{0} · {1}×{2} · {3} 雷', L.name, L.w, L.h, L.mines) + ' · ' + (sw.flag ? $t('现在点格子是插旗') : $t('现在点格子是挖开')), dim: true, small: true })
  // the grid: as wide as the window, square cells
  out.push({ t: 'custom', h: (w: number) => Math.floor(w / L.w) * L.h, draw: (ui: UI, x: number, y: number, w: number) => {
    const s = Math.floor(w / L.w)
    for (let i = 0; i < L.w * L.h; i++) {
      const cx = x + (i % L.w) * s, cy = y + Math.floor(i / L.w) * s
      const o = b.open[i], f = b.flag[i], m = b.mine[i]
      const show = o || (b.state === 'lost' && m)
      if (show) {
        ui.fill(cx, cy, s, s, b.boom === i ? '#ff6050' : '#bdbdbd')
        ui.fill(cx, cy, s, 1, '#7b7b7b'); ui.fill(cx, cy, 1, s, '#7b7b7b')
        if (m) ui.text('✸', cx + s / 2, cy + s * 0.72, { size: s * 0.6, align: 'center', color: '#000' })
        else if (b.near[i]) ui.text(String(b.near[i]), cx + s / 2, cy + s * 0.74, { size: s * 0.62, align: 'center', bold: true, color: NUM[b.near[i]] })
      } else {
        ui.bevel(cx, cy, s, s)
        if (f) ui.text('⚑', cx + s / 2, cy + s * 0.74, { size: s * 0.6, align: 'center', color: C.bad })
      }
      const k = i
      ui.hit(cx, cy, s, s, () => tapCell(k))
    }
  } })
  if (sw.result) out.push(
    { t: 'h', text: $t('结算'), small: true },
    { t: 'p', text: $t('用时 {0} 秒{1}', sw.secs, sw.result.best ? $t(' · 新纪录！') : '') },
    { t: 'p', text: sw.result.coins ? $t('+{0} 金币（今天还能领 {1} 次）', sw.result.coins, sw.result.left) : $t('今天的 {0} 次奖励领完了', PAID_A_DAY) },
    { t: 'actions', btns: [{ label: $t('再来一局'), on: () => fresh(sw.level) }] },
  )
  if (b.state === 'lost') out.push({ t: 'h', text: $t('踩雷了'), small: true }, { t: 'actions', btns: [{ label: $t('再来一局'), on: () => fresh(sw.level) }] })
  return out
}

// ───────────────────────────────────────────── the computer
type App = 'stocks' | 'news' | 'mail' | 'weather' | 'fish' | 'album' | 'sweep' | 'bin' | 'isle'
const APPS: { id: App; name: string; icon: ItemId | null; glyph: string }[] = [
  { id: 'stocks', name: $t('股市'), icon: null, glyph: '📈' },
  { id: 'news', name: $t('新闻'), icon: null, glyph: '📰' },
  { id: 'mail', name: $t('信箱'), icon: null, glyph: '✉' },
  { id: 'weather', name: $t('天气'), icon: null, glyph: '☀' },
  { id: 'fish', name: $t('鱼类图鉴'), icon: null, glyph: '🐟' },
  { id: 'album', name: $t('相册'), icon: null, glyph: '▣' },
  { id: 'sweep', name: $t('扫雷'), icon: null, glyph: '✸' },
  { id: 'isle', name: $t('岛务'), icon: null, glyph: '⌂' },
  { id: 'bin', name: $t('回收站'), icon: null, glyph: '♲' },
]
export const pcState = { app: null as App | null, opened: null as unknown }

export function pcSheet(game: Game, start?: string): Sheet {
  // a fresh visit to the desk: start where asked (or at the desktop)
  if (pcState.opened !== game.panel) { pcState.opened = game.panel; pcState.app = (start as App) ?? null; mailState.at = null; game.sfx('beep', 0.8) }
  const app = pcState.app
  const name = app ? APPS.find((a) => a.id === app)!.name : ''
  const close = () => game.close()
  const toDesk: Block = { t: 'actions', left: true, btns: [{ label: $t('← 桌面'), on: () => { pcState.app = null }, primary: false }] }
  if (!app) {
    const unread = game.mail.unread
    return {
      title: $t('云屿 95'), onClose: close, foot: [{ label: $t('起身 ↓'), on: close, primary: false }],
      blocks: [
        { t: 'custom', h: Math.ceil(APPS.length / 3) * 78, draw: (ui, x, y, w) => {
          const cw = w / 3
          ui.fill(x - 4, y - 4, w + 8, Math.ceil(APPS.length / 3) * 78 + 4, '#3a8c8c')
          APPS.forEach((a, i) => {
            const ax = x + (i % 3) * cw, ay = y + Math.floor(i / 3) * 78
            ui.bevel(ax + cw / 2 - 22, ay + 6, 44, 40, false, '#e8e4dc')
            ui.text(a.glyph, ax + cw / 2, ay + 35, { size: 22, align: 'center' })
            ui.text(a.name, ax + cw / 2, ay + 64, { size: 12, align: 'center', color: '#ffffff', bold: true, shadow: true })
            if (a.id === 'mail' && unread > 0) { ui.fill(ax + cw / 2 + 14, ay + 2, 16, 16, C.bad); ui.text(String(unread), ax + cw / 2 + 22, ay + 14, { size: 10, align: 'center', color: '#fff', bold: true }) }
            ui.hit(ax, ay, cw, 76, () => { game.sfx('key', 1.1); if (a.id === 'isle') return game.open({ kind: 'house' }); pcState.app = a.id })
          })
        } },
        { t: 'p', text: $t('云屿 95 · {0}', game.body.clockText), dim: true, small: true, center: true },
      ],
    }
  }
  let blocks: Block[]
  switch (app) {
    case 'stocks': blocks = stockBlocks(game); break
    case 'news': blocks = newsBlocks(game); break
    case 'mail': blocks = mailBlocks(game); break
    case 'weather': blocks = weatherBlocks(game); break
    case 'fish': blocks = fishBlocks(game); break
    case 'album': blocks = albumBlocks(game); break
    case 'sweep': blocks = sweepBlocks(game); break
    default: blocks = [{ t: 'p', text: $t('回收站是空的。'), dim: true }]
  }
  return { title: name, onClose: close, foot: [{ label: $t('起身 ↓'), on: close, primary: false }], blocks: [toDesk, ...blocks] }
}
