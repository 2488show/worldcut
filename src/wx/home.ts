// The house and the yard on WeChat (round 26): the kitchen, the guestbook, the wish, the compost,
// the creel, the warehouse, the visitor, the bag, and the estate's buildings. Same game calls as
// the web's home.tsx, inventory.tsx and estate.tsx.
import type { Game } from '../game/game'
import { COMPOST_PER, compostWorth } from '../game/farm'
import { DISHES, FOOD, HOTBAR, ITEMS, ITEM_ORDER, PACKS, PACK_ROW, RARITY_NAME, stackOf, type ItemId } from '../game/data'
import { COURIER_CUT, EXCHANGE, FACILITIES, courierSlots, type FacilityId } from '../game/estate'
import { DAY_SECONDS } from '../game/body'
import { PET_SPECIES } from '../engine/petdefs'
import type { Pet } from '../game/pets'
import { fairPrice } from '../game/backend'
import { $t } from '../i18n'
import { C, type Block, type Cell, type Sheet } from './ui'

const costLine = (game: Game, cost: Partial<Record<ItemId, number>>) =>
  (Object.keys(cost) as ItemId[]).map((id) => `${ITEMS[id].name} ${Math.min(game.count(id), 999)}/${cost[id] ?? 0}`).join('  ·  ')
/** state the windows keep between frames, reset when another window opens */
const st: Record<string, any> = {}
let lastPanel: unknown = null
function fresh(game: Game) { if (game.panel !== lastPanel) { lastPanel = game.panel; for (const k of Object.keys(st)) delete st[k] } }

// ───────────────────────────────────────────── the kitchen
export function cookSheet(game: Game, restaurant: boolean): Sheet {
  fresh(game)
  const ready = (Object.keys(FOOD) as ItemId[]).filter((id) => game.count(id) > 0)
  st.page ??= restaurant && ready.length ? 'eat' : 'cook'
  const a = game.acts
  const eat = (id: ItemId) => { game.close(); game.acts.eat(id) }
  const full = game.body.full >= 98
  const blocks: Block[] = [{ t: 'tabs', items: [
    { label: $t('用餐{0}', ready.length ? $t('（{0}）', ready.length) : ''), on: () => { st.page = 'eat' }, active: st.page === 'eat' },
    { label: $t('后厨'), on: () => { st.page = 'cook' }, active: st.page === 'cook' },
  ] }]
  if (st.page === 'eat') {
    blocks.push({ t: 'p', text: $t('{0}坐着吃，饱腹多一成。{1}', restaurant ? $t('坐到餐厅的桌边吃。') : $t('端到餐桌边坐下吃。'), full ? $t('现在吃不下了。') : ''), dim: true, small: true })
    if (!ready.length) blocks.push({ t: 'p', text: $t('没有能吃的。去“后厨”做一道。'), dim: true })
    for (const id of ready) {
      const f = FOOD[id]!
      blocks.push({ t: 'row', icon: id, title: ITEMS[id].name, lines: [$t('· 体力 +{0} · 饱腹 +{1} · 有 {2} 份', f.energy, Math.round(f.full * 1.1), game.count(id))], btns: [{ label: $t('坐下吃'), on: () => eat(id), disabled: full, primary: true }] })
    }
  } else {
    blocks.push({ t: 'p', text: $t('做熟的更顶饿。'), dim: true, small: true })
    if (a.note) blocks.push({ t: 'p', text: a.note, color: a.bad ? C.bad : C.ok })
    if (a.note && a.made && game.count(a.made) > 0 && !a.is('cook')) blocks.push({ t: 'actions', btns: [{ label: $t('现在吃'), on: () => eat(a.made!), disabled: full }] })
    for (const d of DISHES) {
      const f = FOOD[d.out]!
      blocks.push({
        t: 'row', icon: d.out, title: ITEMS[d.out].name,
        lines: [$t('· 体力 +{0} · 饱腹 +{1}{2}', f.energy, f.full, game.count(d.out) ? $t(' · 有 {0} 份', game.count(d.out)) : ''), costLine(game, d.cost)],
        btns: [{ label: a.is('cook') ? '…' : $t('做'), on: () => a.cook(d.out), disabled: a.is('cook'), primary: !a.cannotCook(d.out) }],
      })
    }
  }
  return { title: restaurant ? $t('餐厅') : $t('灶台'), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── guestbook, wish, compost, creel
export function guestbookSheet(game: Game): Sheet {
  const book = game.house.save.book ?? []
  const blocks: Block[] = []
  if (!book.length) blocks.push({ t: 'p', text: $t('“还没有人写过。请岛主们来家里坐坐吧。”') })
  for (const l of book) blocks.push({ t: 'p', text: `“${l.text}”` }, { t: 'p', text: $t('—— {0} · 第 {1} 天', l.who, l.day + 1), dim: true, small: true }, { t: 'gap' })
  return { title: $t('留言本'), blocks, onClose: () => game.close() }
}

export function wishSheet(game: Game): Sheet {
  const w = game.wishes.open
  if (!w) return { title: $t('小心愿'), blocks: [{ t: 'p', text: game.save.wish?.done && game.save.wish.day === game.clockDay ? $t('“谢谢你！明天见。”') : $t('现在没有人许愿。') }], onClose: () => game.close() }
  const have = game.count(w.item)
  return {
    title: $t('{0}的小心愿', w.who), onClose: () => game.close(), blocks: [
      { t: 'row', icon: w.item, title: `${ITEMS[w.item].name} × ${w.n}`, lines: [$t('（有 {0}）', have)], lineColor: have >= w.n ? C.ok : C.dim },
      { t: 'p', text: $t('还剩 {0} 天：在这里寄出，或者飞去{1}当面交给{2}。{3}', Math.max(1, 3 - (game.clockDay - w.day)), game.islandName(w.island), w.who, w.gift ? $t('回礼会是一件小家具（{0}）。', ITEMS[w.gift].name) : ''), dim: true, small: true },
      { t: 'actions', btns: [{ label: $t('寄出'), on: () => { if (game.wishes.send()) game.close() }, disabled: have < w.n }] },
    ],
  }
}

export function compostSheet(game: Game): Sheet {
  const c = game.farm.compost
  const ids = ([...new Set([...Object.keys(game.save.inv), ...Object.keys(game.save.store ?? {})])] as ItemId[]).filter((i) => compostWorth(i) > 0 && game.count(i) > 0)
  const tomorrow = Math.floor(c.pts / COMPOST_PER)
  const blocks: Block[] = [
    { t: 'row', icon: 'fertilizer', title: $t('沤好的肥料：{0} 袋', c.ready), btns: [{ label: $t('取出'), on: () => game.farm.takeFertilizer(), disabled: !c.ready, primary: true }] },
    { t: 'p', text: $t('箱里有 {0} 份料，明天早上变成 {1} 袋肥料（每 {2} 份一袋{3}）。', c.pts, tomorrow, COMPOST_PER, c.pts % COMPOST_PER ? $t('，还差 {0} 份凑下一袋', COMPOST_PER - (c.pts % COMPOST_PER)) : ''), dim: true, small: true },
    { t: 'h', text: $t('放进去'), small: true },
  ]
  if (!ids.length) blocks.push({ t: 'p', text: $t('手上没有能沤肥的东西。小鱼、多余的菜、纤维、树枝、贝壳、莓子都行。'), dim: true, small: true })
  for (const i of ids) blocks.push({
    t: 'row', icon: i, title: `${ITEMS[i].name} ×${game.count(i)}`, lines: [$t(' · 每个 {0} 份', compostWorth(i))],
    btns: [{ label: $t('放 1 个'), on: () => game.farm.addCompost(i, 1) }, { label: $t('全放'), on: () => game.farm.addCompost(i, game.count(i)), primary: true }],
  })
  blocks.push({ t: 'p', text: $t('肥料撒在种了东西、浇过水的地里：长得更快，收的时候多一个，地也会慢慢变成好地、肥地。'), dim: true, small: true })
  return { title: $t('堆肥箱'), blocks, onClose: () => game.close() }
}

export function creelSheet(game: Game): Sheet {
  const c = game.save.creel ?? []
  const best = game.bestCatch()
  const blocks: Block[] = []
  if (!c.length) blocks.push({ t: 'p', text: $t('筐是空的。背着它去钓鱼，钓上来的先进筐，不占背包。'), dim: true })
  for (const f of c) blocks.push({ t: 'row', icon: f.item, title: `${ITEMS[f.item].name}  ${f.cm} cm`, tag: best && best.item === f.item && best.cm === f.cm ? $t('最大') : undefined })
  blocks.push({ t: 'actions', btns: [{ label: $t('全部收好（背包装不下的进仓库）'), on: () => game.emptyCreel(), disabled: !c.length }] })
  if (best) blocks.push({ t: 'p', text: $t('你钓过最大的：{0} {1} cm（第 {2} 天）。在岛上摆一个晒鱼架，或在屋里挂一块鱼标本，它就展示出来。', ITEMS[best.item].name, best.cm, best.day + 1), dim: true, small: true })
  return { title: $t('鱼筐 · {0} / 20', c.length), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── the bag and the warehouse
const lifeOf = (game: Game, item?: ItemId | null) => { const l = item && game.toolLife(item); return l && l.left < l.max ? l.left / l.max : undefined }
export function bagSheet(game: Game): Sheet {
  fresh(game)
  const slots = game.slots()
  const cap = game.capacity()
  const rows = Math.max(cap, HOTBAR + PACK_ROW * PACKS.length)
  const sel: number | null = st.sel ?? null
  const pick = (i: number) => {
    if (i >= cap) return
    if (sel === null) { if (slots[i]) st.sel = i; game.sfx('tap', 1.2) }
    else if (sel === i) st.sel = null
    else { game.swapSlots(sel, i); st.sel = null }
  }
  const blocks: Block[] = [{ t: 'p', text: $t('点两格互换。第一排是快捷栏。'), dim: true, small: true }]
  for (let r = 0; r * PACK_ROW < rows; r++) {
    const from = r * PACK_ROW
    const locked = from >= cap
    blocks.push({ t: 'h', small: true, text: r === 0 ? $t('快捷栏') : locked ? $t('{0}（还没做）', ITEMS[PACKS[r - 1]].name) : ITEMS[PACKS[r - 1]].name })
    const cells: Cell[] = []
    for (let j = 0; j < PACK_ROW; j++) {
      const c = locked ? null : slots[from + j] ?? null
      cells.push({ item: c?.item, n: c?.n, on: sel === from + j, locked, life: lifeOf(game, c?.item) })
    }
    blocks.push({ t: 'cells', cells, cols: PACK_ROW, tap: (j) => pick(from + j) })
  }
  const s = sel !== null ? slots[sel] : null
  if (s && sel !== null) {
    const f = FOOD[s.item]
    const l = game.toolLife(s.item)
    blocks.push({
      t: 'row', icon: s.item, title: `${ITEMS[s.item].name}  ${RARITY_NAME[ITEMS[s.item].rarity]}`,
      lines: [ITEMS[s.item].desc, $t('身上 {0} · 一格放 {1} 个 · 值 {2} 金币', game.carried(s.item), stackOf(s.item), ITEMS[s.item].value), l ? $t('耐久 {0}/{1}{2}', l.left, l.max, l.left < l.max ? $t(' · 工作台可以修') : '') : '', f ? $t('能吃：体力 +{0} · 饱腹 +{1}', f.energy, f.full) : ''].filter(Boolean),
      btns: [
        ...(f ? [{ label: $t('吃一个'), on: () => { st.sel = null; game.close(); game.acts.eat(s.item) } }] : []),
        sel >= HOTBAR ? { label: $t('放到快捷栏'), on: () => { game.toHotbar(s.item); st.sel = null }, primary: true } : { label: $t('拿在手上'), on: () => { game.hold(sel); st.sel = null; game.close() }, primary: true },
      ],
    })
  }
  const nextPack = PACKS.find((p) => !(game.count(p) > 0))
  if (nextPack) blocks.push({ t: 'p', text: $t('在工作台的“装备”里做{0}，多 {1} 格。{2}', ITEMS[nextPack].name, PACK_ROW, game.isHome ? $t('用不上的东西放进仓库（村子里的木箱堆）。') : ''), dim: true, small: true })
  return { title: $t('背包 · {0}/{1} 格', game.used(), cap), blocks, onClose: () => game.close() }
}

export function warehouseSheet(game: Game): Sheet {
  const slots = game.slots()
  const store = game.save.store ?? {}
  const kept = (Object.keys(store) as ItemId[]).filter((k) => (store[k] ?? 0) > 0).sort((a, b) => (ITEMS[a].kind < ITEMS[b].kind ? -1 : ITEMS[a].kind > ITEMS[b].kind ? 1 : 0))
  const cap = game.capacity()
  const blocks: Block[] = [
    { t: 'h', text: $t('身上 {0}/{1} 格', game.used(), cap), small: true },
    { t: 'actions', btns: [{ label: $t('全部存进去（工具除外）'), on: () => game.depositAll() }] },
    { t: 'p', text: $t('点一下就存/取。做东西会直接用仓库里的。'), dim: true, small: true },
    { t: 'cells', cols: PACK_ROW, cells: slots.slice(0, cap).map((c) => ({ item: c?.item, n: c?.n })), tap: (i) => { const c = slots[i]; if (c) game.deposit(c.item, c.n) } },
    { t: 'h', text: $t('仓库里 {0}', kept.length ? $t('{0} 种', kept.length) : ''), small: true },
  ]
  if (!kept.length) blocks.push({ t: 'p', text: $t('空的。'), dim: true })
  else blocks.push({ t: 'cells', cols: 5, cells: kept.map((k) => ({ item: k, n: store[k], label: `${ITEMS[k].name} ${store[k]}` })), tap: (i) => game.withdraw(kept[i], stackOf(kept[i])) })
  return { title: $t('仓库'), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── the visitor
export function visitorSheet(game: Game): Sheet | null {
  const v = game.visits.v
  if (!v) return null
  const r = game.restaurant
  const dishes = game.visits.dishes
  const gift = Object.entries(v.gift)
  const blocks: Block[] = [{ t: 'p', text: gift.length ? $t('{0}给你带来了 {1}。', v.name, gift.map(([k, n]) => `${ITEMS[k as ItemId].name}×${n}`).join($t('、'))) : $t('{0}来看看你。', v.name) }]
  if (r) {
    if (dishes.length) {
      blocks.push({ t: 'p', text: $t('请{0}到餐厅坐下吃一顿？好感 +2，岛的魅力 +4。', v.name), dim: true, small: true })
      for (const d of dishes) blocks.push({ t: 'row', icon: d, title: $t(' {0}（有 {1}）', ITEMS[d].name, game.count(d)), btns: [{ label: $t('请吃这个'), on: () => game.visits.invite(d), primary: true }] })
    } else blocks.push({ t: 'p', text: $t('手头没有做好的菜。'), dim: true, small: true })
  } else blocks.push({ t: 'p', text: $t('还没有餐厅（工作台能做') + $t('餐厅套件') + $t('）。'), dim: true, small: true })
  blocks.push(
    { t: 'p', text: $t('也可以请{0}到家里坐坐，看看你的屋子。', v.name), dim: true, small: true },
    { t: 'actions', btns: [
      { label: $t('谢谢，慢走'), on: () => { game.close(); game.visits.leave(); game.speak(v.name, v.voice, $t('那我回去啦，再见！')) }, primary: false },
      { label: $t('请到家里坐坐'), on: () => game.visits.home() },
    ] },
  )
  return { title: $t('{0} · 从{1}来', v.name, game.islandName(v.island)), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── the estate (from level 6)
const petName = (game: Game, p: Pet) => $t('{0}色的{1}', game.pets.colour(p.sp, p.col).name, PET_SPECIES[p.sp].name)
function haves(game: Game): ItemId[] {
  const ids = new Set<ItemId>([...Object.keys(game.save.inv), ...Object.keys(game.save.store ?? {})] as ItemId[])
  return [...ids].filter((i) => ITEMS[i] && game.count(i) > 0 && ITEMS[i].kind !== 'tool' && ITEMS[i].kind !== 'part').sort((a, b) => ITEMS[b].value - ITEMS[a].value)
}
const HOUR = DAY_SECONDS / 24
export function facilitySheet(game: Game, kind: FacilityId): Sheet {
  fresh(game)
  const close = () => game.close()
  const title = FACILITIES[kind].name
  if (!game.estate.has(kind)) return { title, blocks: [{ t: 'p', text: FACILITIES[kind].done }], onClose: close }
  const blocks: Block[] = []
  if (kind === 'ranch') {
    const pets = game.save.pets ?? []
    const pair = game.estate.s.pair
    if (pair) {
      const left = Math.max(0, pair.due - (game.save.played ?? 0))
      blocks.push({ t: 'p', text: $t('“{0}和{1}在牧场里。再过 {2} 个钟头来看看。”', petName(game, pets.find((p) => p.id === pair.a)!), petName(game, pets.find((p) => p.id === pair.b)!), Math.ceil(left / HOUR)) })
    } else {
      blocks.push({ t: 'p', text: $t('挑两只同种的宠物住进来，过一天就有一只小的。小的多半随爸爸或妈妈的颜色，偶尔是新颜色。宠物位：{0} / {1}', pets.length, game.petSlots), dim: true, small: true })
      if (!pets.length) blocks.push({ t: 'p', text: $t('你还没有宠物。'), dim: true })
      const pa = pets.find((p) => p.id === st.a)
      for (const p of pets) {
        const why = pa ? game.estate.canPair(pa, p) : ''
        const off = !!pa && p.id !== st.a && !!why
        blocks.push({
          t: 'row', title: petName(game, p), sel: st.a === p.id, titleColor: off ? C.mid : C.ink,
          lines: [st.a === p.id ? $t('已选：再选一只同种的') : pa ? (why || $t('配成一对')) : $t('选它')],
          on: off ? undefined : () => { if (!pa || p.id === st.a) { st.a = p.id === st.a ? null : p.id; return } game.estate.pair(pa, p); st.a = null },
        })
      }
    }
  } else if (kind === 'shop') {
    const sh = game.estate.shop
    blocks.push({ t: 'row', icon: 'coin', title: $t('钱箱：') + sh.till, btns: [{ label: $t('收钱'), on: () => game.estate.takeTill(), disabled: !sh.till, primary: true }] })
    blocks.push({ t: 'h', text: $t('橱窗（{0} / 6）', sh.lines.length), small: true })
    if (!sh.lines.length) blocks.push({ t: 'p', text: $t('还什么都没摆。'), dim: true, small: true })
    for (const l of sh.lines) blocks.push({ t: 'row', icon: l.item, title: `${ITEMS[l.item].name} ×${l.qty}`, price: l.price, lines: [$t('{0}% / 时', Math.round(game.estate.saleChance(l) * 100))], btns: [{ label: $t('收回'), on: () => game.estate.unstock(l.item) }] })
    blocks.push({ t: 'h', text: $t('摆一样上去'), small: true })
    const hv = haves(game).slice(0, 24)
    blocks.push({ t: 'cells', cols: 6, cells: hv.map((i) => ({ item: i, n: game.count(i), on: st.item === i })), tap: (k) => { const i = hv[k]; st.item = i; st.qty = Math.min(5, game.count(i)); st.price = game.estate.fair(i) } })
    const item: ItemId | undefined = st.item
    if (item) {
      const fair = game.estate.fair(item)
      blocks.push(
        { t: 'h', text: ITEMS[item].name, small: true },
        { t: 'stepper', label: $t('数量'), value: '×' + st.qty, minus: () => { st.qty = Math.max(1, st.qty - 1) }, plus: () => { st.qty = Math.min(game.count(item), st.qty + 1) } },
        { t: 'stepper', label: $t('价钱'), value: String(st.price), minus: () => { st.price = Math.max(1, Math.round(st.price * 0.9)) }, plus: () => { st.price = Math.round(st.price * 1.1) + 1 }, note: st.price <= fair ? $t('公道，卖得快') : st.price <= fair * 1.3 ? $t('有点贵') : $t('太贵，没人买') },
        { t: 'actions', btns: [{ label: $t('摆上'), on: () => { game.estate.stock(item, st.qty, st.price); st.item = null } }] },
      )
    }
    blocks.push({ t: 'p', text: $t('你出门时，路过的客人会来买。价钱越公道卖得越快；比值钱多三成就很难卖了。'), dim: true, small: true })
  } else if (kind === 'depot') {
    const slots = courierSlots(game.level)
    const out = game.estate.couriers
    const now = game.save.played ?? 0
    const orders = game.orders.filter((o) => o.kind === 'buy' && o.status === 'open')
    blocks.push({ t: 'p', text: $t('雇来的人只跑安全的航线（危险度 1 以内），拿报酬的 {0}%。货从你的仓库里出。在外面的人：{1} / {2}', Math.round(COURIER_CUT * 100), out.length, slots), dim: true, small: true })
    for (const c of out) blocks.push({ t: 'row', icon: c.item, title: `${ITEMS[c.item].name} ×${c.qty} → ${game.islandName(c.island)}`, lines: [$t('再过 {0} 个钟头回来', Math.max(0, Math.ceil((c.back - now) / HOUR)))] })
    blocks.push({ t: 'h', text: $t('布告板上的单'), small: true })
    if (!orders.length) blocks.push({ t: 'p', text: $t('板上现在没有单。'), dim: true, small: true })
    for (const o of orders) {
      const why = game.estate.courierBlock(o)
      blocks.push({ t: 'row', icon: o.item, title: `${ITEMS[o.item].name} ×${o.qty} → ${game.islandName(o.island)}${o.relay ? $t('（转运）') : ''}`, price: Math.round(o.price * (1 - COURIER_CUT)), lines: why ? [why] : [], btns: why ? [] : [{ label: $t('雇人送'), on: () => game.estate.hire(o.id), primary: true }] })
    }
  } else if (kind === 'lighthouse') {
    blocks.push(
      { t: 'p', text: $t('“夜里有船从下面过。”') },
      { t: 'p', text: $t('每天早上，过路的船交的过路费会寄到信箱：现在大约 ') + $t('{0}，岛越有名越多。', game.estate.toll()) },
      { t: 'p', text: $t('布告板上标着“转运”的单，货在你接单时就交到你手上，你只管送过去，拿的是运费。') },
      { t: 'p', text: $t('已经转运了 {0} 单。', game.save.stats.relayed ?? 0), dim: true, small: true },
    )
  } else {
    st.n ??= 10
    blocks.push(
      { t: 'p', text: $t('价钱每个钟头都在变：买入比中间价高一点，卖出低一点。买得多价钱会往上走，卖得多会往下走。'), dim: true, small: true },
      { t: 'tabs', items: [1, 10, 50].map((x) => ({ label: $t('每次 {0} 件', x), on: () => { st.n = x }, active: st.n === x })) },
    )
    for (const it of EXCHANGE) {
      const p = game.estate.price(it)
      const pct = Math.round((p.k - 1) * 100)
      blocks.push({
        t: 'row', icon: it, title: `${ITEMS[it].name}  ${pct > 0 ? '▲' : pct < 0 ? '▼' : '·'}${Math.abs(pct)}%`, titleColor: pct > 0 ? '#d8302a' : pct < 0 ? '#1f8a3a' : C.ink,
        lines: [$t('有 {0}', game.count(it))],
        btns: [{ label: $t('买 ') + p.buy * st.n, on: () => game.estate.trade(it, st.n, 'buy'), primary: true }, { label: $t('卖 ') + p.sell * st.n, on: () => game.estate.trade(it, st.n, 'sell'), disabled: game.count(it) < st.n }],
      })
    }
  }
  return { title, blocks, onClose: close }
}

// ───────────────────────────────────────────── the board: selling, and asking other players
export function sellBlocks(game: Game): Block[] {
  fresh(game)
  const mySells = game.orders.filter((o) => o.mine && o.kind === 'sell' && o.status === 'open')
  const owned = ITEM_ORDER.filter((id) => game.count(id) > 0)
  const it: ItemId | null = st.sellItem && game.count(st.sellItem) > 0 ? st.sellItem : owned[0] ?? null
  const blocks: Block[] = [{ t: 'p', text: $t('挂到市场上；有人买了，送到才收钱。'), dim: true }]
  if (!it) blocks.push({ t: 'p', text: $t('背包里没有可以卖的东西。'), dim: true })
  else {
    const max = game.count(it)
    const q = Math.max(1, Math.min(st.sellQty ?? 1, max))
    const guide = fairPrice(it, q, 900)
    const ask: number = st.sellPrice ?? guide
    blocks.push(
      { t: 'h', text: $t('{0}：{1}', $t('货物'), ITEMS[it].name), small: true },
      { t: 'cells', cols: 6, cells: owned.slice(0, 36).map((i) => ({ item: i, n: game.count(i), on: i === it })), tap: (k) => { st.sellItem = owned[k]; st.sellQty = 1; st.sellPrice = undefined } },
      { t: 'stepper', label: $t('数量'), value: String(q), minus: () => { st.sellQty = Math.max(1, q - 1); st.sellPrice = undefined }, plus: () => { st.sellQty = Math.min(max, q + 1); st.sellPrice = undefined }, big: [() => { st.sellQty = Math.max(1, q - 10); st.sellPrice = undefined }, () => { st.sellQty = Math.min(max, q + 10); st.sellPrice = undefined }] },
      { t: 'stepper', label: $t('要价'), value: String(ask), minus: () => { st.sellPrice = Math.max(1, ask - 1) }, plus: () => { st.sellPrice = ask + 1 }, big: [() => { st.sellPrice = Math.max(1, ask - 10) }, () => { st.sellPrice = ask + 10 }], note: $t('行情价约 {0}（含运费）。要价高出太多就没人买。', guide) },
      { t: 'actions', btns: [{ label: $t('挂单'), on: () => { void game.postSell(it, q, ask); st.sellPrice = undefined; st.sellQty = 1 } }] },
    )
  }
  if (mySells.length) blocks.push({ t: 'h', text: $t('挂着的单子'), small: true })
  for (const o of mySells) blocks.push({ t: 'row', icon: o.item, title: `${ITEMS[o.item].name} ×${o.qty}`, price: o.price, lines: [$t('等买家…')], btns: [{ label: $t('撤单'), on: () => game.cancelSell(o.id) }] })
  return blocks
}
const ASKABLE = ITEM_ORDER.filter((id) => ['material', 'part', 'fish'].includes(ITEMS[id].kind) && ITEMS[id].value > 0)
export function askBlocks(game: Game): Block[] {
  fresh(game)
  const myBuys = game.orders.filter((o) => o.kind === 'buy' && o.mine)
  const item: ItemId = st.askItem ?? 'plank'
  const qty: number = st.askQty ?? 4
  const guide = fairPrice(item, qty, 800)
  const offer: number = st.askPrice ?? guide
  const blocks: Block[] = [{ t: 'p', text: game.onlineStatus(), dim: true }]
  if (game.online?.writable) blocks.push(
    { t: 'h', text: $t('{0}：{1}', $t('想要'), ITEMS[item].name), small: true },
    { t: 'cells', cols: 6, cells: ASKABLE.map((i) => ({ item: i, on: i === item })), tap: (k) => { st.askItem = ASKABLE[k]; st.askPrice = undefined } },
    { t: 'stepper', label: $t('数量'), value: String(qty), minus: () => { st.askQty = Math.max(1, qty - 1); st.askPrice = undefined }, plus: () => { st.askQty = Math.min(24, qty + 1); st.askPrice = undefined } },
    { t: 'stepper', label: $t('出价'), value: String(offer), minus: () => { st.askPrice = Math.max(1, offer - 1) }, plus: () => { st.askPrice = offer + 1 }, big: [() => { st.askPrice = Math.max(1, offer - 10) }, () => { st.askPrice = offer + 10 }], note: $t('行情价约 {0}。金币现在就押在单子上（你有 ', guide) + $t('{0}），货送到才付给对方；撤单全额退回。', game.save.coins) },
    { t: 'actions', btns: [{ label: $t('发求购单'), on: () => { void game.postBuy(item, qty, offer); st.askPrice = undefined }, disabled: game.save.coins < offer }] },
  )
  if (myBuys.length) blocks.push({ t: 'h', text: $t('你挂的求购单'), small: true })
  for (const o of myBuys) blocks.push({ t: 'row', icon: o.item, title: `${ITEMS[o.item].name} ×${o.qty}`, price: o.price, lines: [o.status === 'open' ? $t('等玩家接单…') : $t('{0}接了，货在路上', o.buyer ?? $t('有人'))], btns: o.status === 'open' ? [{ label: $t('撤单'), on: () => game.cancelBuy(o.id) }] : [] })
  return blocks
}
