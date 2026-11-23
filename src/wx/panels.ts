// The windows of the mini game, as blocks for ui.ts (round 25). Each reads the game the same way the
// web version's panel does and calls the same game methods; only the drawing is different.
import type { Game } from '../game/game'
import { ITEMS, RECIPES, RECIPE_TABS, TOOL_MEND, bagText, type ItemId, type Recipe, type RecipeTab, type VehicleId } from '../game/data'
import { TIER_NAME } from '../game/backend'
import { WEATHER_LINE } from '../game/weather'
import { PIRATE_FREE_DELIVERIES } from '../game/voyage'
import { $t } from '../i18n'
import { C, type Block, type Btn, type Sheet } from './ui'
import { pcSheet, stockBlocks, mailBlocks, mailState, fishBlocks } from './pc'
import { albumBlocks, frameBlocks, albumState } from './album'
import { cookSheet, guestbookSheet, wishSheet, compostSheet, creelSheet, bagSheet, warehouseSheet, visitorSheet, facilitySheet, sellBlocks, askBlocks } from './home'
import { tackleSheet, lookSheet, hullBlocks, paintSheet, notebookSheet, journalSheet, settingsSheet, endingSheet } from './more'

/** what the settings window needs from the screen */
export const ops = { audio: null as any, onTitle: () => {}, onReset: () => {}, persist: () => {}, restartSound: () => {} }

const HANGAR_LINES: VehicleId[] = ['sparrow', 'biplane', 'falcon', 'airship']
const PIER_LINES: VehicleId[] = ['skiff', 'sloop', 'freighter', 'flagship']

/** what the windows remember between frames (the open tab) */
export const tabs: Record<string, string> = {}

const costText = (game: Game, cost: Partial<Record<ItemId, number>>, times = 1) =>
  (Object.keys(cost) as ItemId[]).map((id) => `${ITEMS[id].name} ${Math.min(game.count(id), 999)}/${(cost[id] ?? 0) * times}`).join('  ·  ')

function recipeRow(game: Game, r: Recipe): Block {
  const make = (n: number) => (r.station === 'furnace' ? game.smelt(r.id, n) : game.craft(r.id, n))
  const it = ITEMS[r.out]
  const busy = !!game.craftJob
  const btns: Btn[] = r.once && game.count(r.out) > 0
    ? []
    : r.once
      ? [{ label: $t('做 1'), on: () => make(1), disabled: !game.canCraft(r.id, 1) || busy, primary: true }]
      : [1, 3, 10].map((n) => ({ label: $t('做 {0}', n), on: () => make(n), disabled: !game.canCraft(r.id, n) || busy, primary: n === 1 }))
  const head = [r.time > 0 ? $t('{0} 秒', r.time) : '', !r.once ? $t('现有 {0}', game.count(r.out)) : '', (r.level ?? 1) > game.level ? $t('岛 {0} 级解锁', r.level ?? 1) : ''].filter(Boolean).join(' · ')
  return { t: 'row', icon: r.out, title: it.name, done: r.once && game.count(r.out) > 0, lines: [head, it.desc, costText(game, r.cost)].filter(Boolean), btns }
}

function board(game: Game): Sheet {
  const tab = tabs.board ?? 'buy'
  const set = (t: string) => () => { tabs.board = t; game.sfx('tap') }
  const buys = game.orders.filter((o) => o.kind === 'buy' && o.status === 'open' && !o.mine)
  const shop = game.shop
  const blocks: Block[] = [{ t: 'tabs', items: [
    { label: $t('求购单 {0}', buys.length), on: set('buy'), active: tab === 'buy' },
    { label: $t('我要卖货'), on: set('sell'), active: tab === 'sell' },
    { label: $t('送货单 {0}', game.deliveries.length), on: set('mine'), active: tab === 'mine' },
    ...(shop.length ? [{ label: $t('本地特产'), on: set('shop'), active: tab === 'shop' }] : []),
    ...(game.online ? [{ label: $t('向玩家求购 {0}', game.orders.filter((o) => o.kind === 'buy' && o.mine).length || ''), on: set('ask'), active: tab === 'ask' }] : []),
  ] }]
  if (tab === 'buy') {
    blocks.push({ t: 'p', text: $t('送到才付钱。'), dim: true })
    if (!buys.length) blocks.push({ t: 'p', text: $t('暂时没有新单子，过一会儿再来看看。'), dim: true })
    for (const o of buys) {
      const block = game.orderBlock(o)
      blocks.push({
        t: 'row', icon: o.item, title: `${ITEMS[o.item].name} ×${o.qty}`, tag: o.player ? $t('玩家') : o.tier ? TIER_NAME[o.tier] : undefined, price: o.price,
        lines: [
          $t('{0}{1} · {2} km · 你有 {3}', o.player ? '' : `${o.by} · `, game.islandName(o.island), (game.distanceTo(o.island) / 100).toFixed(1), game.count(o.item)),
          game.fitFor(o.qty),
          o.danger > 0 ? $t('{0} 危险航线 · 报酬 +{1}%', '☠'.repeat(o.danger), Math.round(o.danger * 28)) : '',
          block ? $t('{0}：{1}', $t('装不下'), block) : '',
        ].filter(Boolean),
        btns: block ? [] : [{ label: $t('接单'), on: () => game.acceptOrder(o.id), primary: true }],
      })
    }
  } else if (tab === 'sell') {
    blocks.push(...sellBlocks(game))
  } else if (tab === 'ask') {
    blocks.push(...askBlocks(game))
  } else if (tab === 'mine') {
    if (!game.deliveries.length) blocks.push({ t: 'p', text: $t('手上没有要送的货。'), dim: true })
    for (const d of game.deliveries) blocks.push({
      t: 'row', icon: d.item, title: `${ITEMS[d.item].name} ×${d.qty}`, price: d.reward,
      lines: [$t(' → {0}（{1}）', game.islandName(d.dest), d.to), d.state === 'loaded' ? $t('已装进货舱') : d.source === 'sell' ? $t('已备好，等装货') : $t('等装货 · 你有 {0}', game.count(d.item))],
      btns: [{ label: $t('放弃'), on: () => game.abandon(d.id) }],
    })
    blocks.push({ t: 'p', text: $t('点飞机或船出发。'), dim: true })
  } else {
    blocks.push({ t: 'p', text: $t('{0}岛上的特产，买了自己带走。你有 ', game.here.def.owner) + game.save.coins, dim: true })
    for (const l of shop) blocks.push({
      t: 'row', icon: l.item, title: ITEMS[l.item].name, price: l.price, lines: [$t('存货 {0} · 你有 {1}', l.stock, game.count(l.item))],
      btns: [
        { label: $t('买 1'), on: () => game.shopBuy(l.item, 1), disabled: l.stock < 1 || game.save.coins < l.price, primary: true },
        { label: $t('买 4'), on: () => game.shopBuy(l.item, 4), disabled: l.stock < 4 || game.save.coins < l.price * 4 },
        ...((): Btn[] => { const o = game.barterOffer(l.item); return o ? [{ label: $t('用 {0}×{1} 换', ITEMS[o.pay].name, o.n), on: () => game.barter(l.item) }] : [] })(),
      ],
    })
    blocks.push({ t: 'p', text: $t('以物易物多算两成。'), dim: true, small: true })
  }
  return { title: $t('布告板 · {0}', game.here.def.name), blocks, onClose: () => game.close() }
}

function workbench(game: Game): Sheet {
  const tab = (tabs.bench ?? 'tools') as RecipeTab
  const blocks: Block[] = []
  const c = game.crafting()
  if (c) {
    const r = RECIPES.find((x) => x.id === c.id)!
    blocks.push({ t: 'bar', label: $t('正在做 {0}', ITEMS[r.out].name) + ' · ' + $t('第 {0} / {1} 件', c.total - c.left + 1, c.total), u: c.u })
  } else blocks.push({ t: 'p', text: $t('选一样东西来做。每做一件要敲上几锤。'), dim: true })
  blocks.push({ t: 'tabs', items: RECIPE_TABS.map(([id, name]) => ({ label: name, on: () => { tabs.bench = id; game.sfx('tap') }, active: tab === id })) })
  for (const r of RECIPES.filter((x) => x.station === 'workbench' && x.tab === tab)) blocks.push(recipeRow(game, r))
  if (tab === 'tools') for (const t of game.wornTools) {
    const l = game.toolLife(t)!
    blocks.push({ t: 'row', icon: t, title: $t('修{0}', ITEMS[t].name), lines: [$t('· 耐久 {0}/{1}', l.left, l.max), costText(game, TOOL_MEND[t]!)], btns: [{ label: $t('修'), on: () => game.mendTool(t), disabled: !game.canPay(TOOL_MEND[t]!), primary: true }] })
  }
  if (game.count('furnaceKit') > 0 && !game.save.furnace) blocks.push({ t: 'actions', btns: [{ label: $t('放置熔炉'), on: () => game.startPlacing('furnace') }] })
  return { title: $t('工作台'), blocks, onClose: () => game.close() }
}

function furnace(game: Game): Sheet {
  const left = game.furnaceLeft()
  const spots = game.furnaceSpots().length
  const blocks: Block[] = spots > 1
    ? game.furnaceSpots().map((_, k): Block => { const q = game.save.jobs.filter((j) => (j.f ?? 0) === k); return { t: 'h', small: true, text: $t('熔炉 {0}', k + 1), right: q.length ? $t('{0} 炉 · 约 {1} 秒', q.length, Math.ceil(game.furnaceLeftOf(k))) : $t('空着'), rightColor: q.length ? C.coin : C.dim } })
    : [{ t: 'p', text: game.save.jobs.length ? $t('炉里还有 {0} 炉，约 {1} 秒后全部出炉。你可以先去忙别的。', game.save.jobs.length, Math.ceil(left)) : $t('炉子空着。'), dim: true }]
  blocks.push({ t: 'p', text: (spots > 1 ? $t('{0} 座熔炉同时烧：放进去的分到最快空出来的那座。', spots) : '') + (game.furnaceFull() ? '' : $t(' 还能再砌一座熔炉（工作台做套件）。')), dim: true, small: true })
  for (const r of RECIPES.filter((x) => x.station === 'furnace')) blocks.push(recipeRow(game, r))
  return { title: $t('熔炉'), blocks, onClose: () => game.close() }
}

function depart(game: Game, vehicleId: string): Sheet | null {
  const v = game.vehicle(vehicleId)
  if (!v) return null
  const def = game.vdef(v)
  const blocks: Block[] = [{ t: 'p', text: $t('货舱 {0} 格 · 现在装着：{1}。装得越满，飞得越慢、转得越笨。', def.cargo, game.cargoText()), dim: true }]
  if (game.save.stats.delivered < PIRATE_FREE_DELIVERIES) blocks.push({ t: 'p', text: $t('头 {0} 单是新手期：哪条航线都不会遇到海盗。', PIRATE_FREE_DELIVERIES), dim: true, small: true })
  for (const id of game.destinations()) {
    const plan = game.loadPlan(vehicleId, id)
    const danger = Math.max(game.layouts[id].def.danger, game.here.def.danger)
    blocks.push({
      t: 'row', title: game.islandName(id) + (danger ? ' ' + '☠'.repeat(danger) : ''),
      lines: [`${game.layouts[id].def.home ? $t('回家') : game.layouts[id].def.owner} · ${(game.distanceTo(id) / 100).toFixed(1)} km`, ...(plan.length ? plan.map((l) => `${l.ok ? '✓' : '✗'} ${ITEMS[l.d.item].name} ×${l.d.qty} ${l.why}`) : [$t('没有要送到这里的货。')])],
      btns: [{ label: def.kind === 'boat' ? $t('起航') : $t('起飞'), on: () => void game.depart(vehicleId, id), primary: true }],
    })
  }
  return { title: $t('{0} · 去哪儿？', def.name), blocks, onClose: () => game.close() }
}

let mailOpened: unknown = null
let albumOpened: unknown = null
/** the window for the panel the game has open (null: none, or one not ported yet) */
export function sheetFor(game: Game): Sheet | null {
  const p = game.panel
  if (!p) return null
  const close = () => game.close()
  switch (p.kind) {
    case 'look': return lookSheet(game, p.first)
    case 'welcome':
      return { title: $t('云岭航行'), blocks: [
        { t: 'p', text: $t('“这是我的小岛。先捡些树枝石头，做把斧头和镐。”') },
        { t: 'p', text: '· ' + $t('做工具、造飞机') },
        { t: 'p', text: '· ' + $t('接单，亲自把货送到别的岛') },
        { t: 'p', text: '· ' + $t('累了吃点东西，晚上回屋睡觉') },
        { t: 'p', text: $t('点哪儿走到哪儿，便签上写着下一步。'), dim: true, small: true },
        { t: 'actions', btns: [{ label: $t('上岛'), on: close }] },
      ] }
    case 'board': return board(game)
    case 'workbench': return workbench(game)
    case 'furnace': return furnace(game)
    case 'hangar': return { title: $t('机库'), blocks: [{ t: 'p', text: $t('每代最多改三级。飞久了会旧，回家修一修。'), dim: true, small: true }, ...HANGAR_LINES.filter((t) => game.isHome || game.owns(t)).flatMap((t) => hullBlocks(game, t))], onClose: close }
    case 'pier': return { title: $t('码头'), blocks: [...PIER_LINES.filter((t) => game.here.def.home || game.save.vehicles.some((v) => v.type === t && v.at === game.save.here)).flatMap((t) => hullBlocks(game, t)), { t: 'p', text: $t('任何岸边都能钓：点水面，对着黑影下竿。'), dim: true, small: true }], onClose: close }
    case 'depart': return depart(game, p.vehicleId)
    case 'house': return notebookSheet(game)
    case 'bed': {
      const nap = game.body.canNap && game.dayPhase() !== 'night'
      const go = (napping: boolean) => { game.close(); if (game.house.bed) game.body.goToBed(game.house.bed, napping) }
      return { title: $t('床'), blocks: [
        { t: 'actions', btns: [
          { label: $t('躺一会儿'), on: () => { game.close(); game.house.lieDown() } },
          ...(nap ? [{ label: $t('睡个午觉'), on: () => go(true) }] : []),
          { label: nap ? $t('睡到明早') : $t('睡到天亮'), on: () => go(false), primary: true },
        ] },
        ...(nap ? [{ t: 'p' as const, text: $t('两小时 · 体力 +35'), dim: true, small: true }] : []),
        { t: 'p', text: $t('什么时候都能睡。过了半夜还不睡，体力会一点点往下掉，掉光了就地睡着。'), dim: true, small: true },
      ], onClose: close }
    }
    case 'bag': return bagSheet(game)
    case 'pc': return pcSheet(game, p.app)
    case 'stocks': return { title: $t('炒股机'), blocks: stockBlocks(game), onClose: close }
    case 'mail': {
      if (mailOpened !== p) { mailOpened = p; mailState.at = p.open ?? null }
      return { title: $t('云屿邮局 - 收件箱{0}', game.mail.unread ? $t('（{0} 封未读）', game.mail.unread) : ''), blocks: mailBlocks(game), onClose: close }
    }
    case 'album': {
      if (albumOpened !== p) { albumOpened = p; albumState.at = null }
      return { title: $t('相册'), blocks: albumBlocks(game), onClose: close }
    }
    case 'frame': return { title: $t('相框：放哪张照片？'), blocks: frameBlocks(game, p.piece), onClose: close }
    case 'fishbook': return { title: $t('鱼的图鉴'), blocks: fishBlocks(game), onClose: close }
    case 'tackle': return tackleSheet(game)
    case 'cook': return cookSheet(game, !!p.restaurant)
    case 'guestbook': return guestbookSheet(game)
    case 'wish': return wishSheet(game)
    case 'compost': return compostSheet(game)
    case 'creel': return creelSheet(game)
    case 'crates': return warehouseSheet(game)
    case 'visitor': return visitorSheet(game)
    case 'ranch': case 'shop': case 'depot': case 'lighthouse': case 'exchange': return facilitySheet(game, p.kind)
    case 'paint': return paintSheet(game, p.vehicleId)
    case 'journal': return journalSheet(game)
    case 'settings': return settingsSheet(game, ops)
    case 'ending': return endingSheet(game)
    case 'night': {
      const s = p.summary
      return { title: $t('第 {0} 天结束了', s.day), blocks: [
        { t: 'p', text: s.passedOut ? $t('你熬到半夜两点，累倒在地上。') : s.late ? $t('睡得有点晚，体力没有完全恢复。') : $t('一夜好眠，体力回满了。') },
        { t: 'h', text: $t('今天的净收入'), right: (s.coins >= 0 ? '+' : '') + s.coins },
        { t: 'p', text: $t('今天的天气：{0}。{1}', WEATHER_LINE[s.weather ?? 'clear'], s.hungry ? $t('肚子空空的：早上先吃点东西。') : ''), dim: true },
        { t: 'actions', btns: [{ label: $t('起床'), on: close }] },
      ] }
    }
    case 'arrived': {
      const total = p.lines.reduce((s, l) => s + l.reward + l.tip, 0) + (p.bonus?.coins ?? 0)
      return { title: $t('货送到了 · {0}', game.islandName(p.island)), blocks: [
        ...(p.robbed ? [{ t: 'p' as const, text: $t('☠ 路上被抢走了 {0}。按实际送到的数量结算。', p.robbed), color: '#b8302a' }] : []),
        ...p.lines.map((l) => ({ t: 'row' as const, title: l.text, price: l.reward + l.tip })),
        ...(p.bonus ? [{ t: 'row' as const, title: '★ ' + p.bonus.text, price: p.bonus.coins }] : []),
        { t: 'h', text: $t('到手'), right: String(total) },
        ...(p.friend ? [{ t: 'p' as const, text: '♥ ' + p.friend.text + (p.friend.gift ? ' ' + $t('送你：{0}', bagText(p.friend.gift)) : '') }] : []),
        { t: 'actions', btns: [{ label: $t('好'), on: close }] },
      ] }
    }
    case 'mine': {
      const m = game.mine
      const blocks: Block[] = [{ t: 'p', text: $t('很黑。挖开岩石找矿脉；落细尘的地方藏着往下的梯子。越深越稀有。'), dim: true }]
      for (let l = 1; l <= m.depth; l++) blocks.push({ t: 'row', title: $t('第 {0} 层', l), lines: [m.describe(l), l <= m.save.unlocked ? '' : $t('还没挖到')].filter(Boolean), btns: l <= m.save.unlocked ? [{ label: $t('下去'), on: () => m.enter(l), primary: true }] : [] })
      if (m.depth < 12) blocks.push({ t: 'p', text: $t('岛升级后，矿洞会更深。'), dim: true, small: true })
      return { title: $t('矿洞'), blocks, onClose: close }
    }
    default:
      return null
  }
}
