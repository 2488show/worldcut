// The rest of the windows on WeChat (round 26): the tackle box, the wardrobe, the paint shop, the
// journal, the settings, the ending, and the full island notebook and hangar cards. Same game calls
// as the web's tackle.tsx, looks.tsx, workshop.tsx, menus.tsx and panels.tsx.
import type { Game, OwnedVehicle } from '../game/game'
import { DYES, FURNITURE, HULLS, ITEMS, ITEM_ORDER, MAX_PLANTS, PLANTS, RARITY_NAME, UPGRADES, VEHICLES, bagText, type Bag, type ItemId, type UpgradeId, type VehicleId } from '../game/data'
import { BAITS, LIVE_BAIT, LURES, goodFor } from '../game/tackle'
import {
  BEARD_NAMES, BOTTOM_NAMES, BUILD_NAMES, CLOTHES, EYE_COLORS, HAIR_COLORS, HAIR_NAMES, HAT_NAMES, SKINS, TOP_NAMES, personModel,
  type Beard, type Bottom, type Build, type Hair, type Hat, type Look, type Top,
} from '../engine/avatar'
import { craftModel, defaultsOf, DESIGN_COLOURS, DESIGN_H, DESIGN_W, canvasOf, type Paint, type RGB, type Stripe } from '../engine/craft'
import type { ModelDef } from '../engine/models'
import { drawVoxels } from '../ui/voxview'
import { LEVELS } from '../game/levels'
import { houseName } from '../game/house'
import { PET_ORDER, PET_SPECIES } from '../engine/petdefs'
import { ISLAND_PETS, PET_RULES, RARITY_STARS, rarityOf } from '../game/pets'
import { QUESTS } from '../game/quests'
import { CHAPTERS, CODEX, FRIENDS, FRIEND_NAME, FRIEND_STEPS, codexItems } from '../game/story'
import { SKILLS, SKILL_KNACK, SKILL_NAME, SKILL_PERK, LEVEL_XP, MAX_LEVEL } from '../game/skills'
import { $t, LANG, LANGS } from '../i18n'
import { C, type Block, type Btn, type Sheet, type UI } from './ui'
import { fishBlocks } from './pc'

const G = globalThis as any
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
const costLine = (game: Game, cost: Partial<Record<ItemId, number>>) =>
  (Object.keys(cost) as ItemId[]).map((id) => `${ITEMS[id].name} ${Math.min(game.count(id), 999)}/${cost[id] ?? 0}`).join('  ·  ')
const st: Record<string, any> = {}
let lastPanel: unknown = null
function fresh(game: Game) { if (game.panel !== lastPanel) { lastPanel = game.panel; for (const k of Object.keys(st)) delete st[k] } }
const chips = <T extends string>(of: Record<T, string>, value: T, set: (v: T) => void): Block =>
  ({ t: 'tabs', items: (Object.keys(of) as T[]).map((k) => ({ label: of[k], on: () => set(k), active: value === k })) })

/** an offscreen canvas for a preview, made once per size */
const previews = new Map<string, any>()
function previewCanvas(key: string, w: number, h: number) {
  let c = previews.get(key)
  if (!c) { c = G.wx.createCanvas(); c.width = w; c.height = h; previews.set(key, c) }
  return c
}

// ───────────────────────────────────────────── the tackle box
export function tackleSheet(game: Game): Sheet {
  fresh(game)
  const on = game.tackle.on
  st.pick ??= on ?? null
  const seen = (f: ItemId) => (game.save.stats.gathered[f] ?? 0) > 0 || !!game.save.records?.[f]
  const cellsOf = (list: ItemId[]): Block => ({
    t: 'cells', cols: 6, cells: list.map((b) => ({ item: b, n: BAITS[b]!.live ? game.count(b) : undefined, dim: !game.count(b), on: st.pick === b, text: on === b ? '✓' : undefined })),
    tap: (i) => { game.sfx('tap', 1.5); st.pick = list[i] },
  })
  const blocks: Block[] = [
    { t: 'h', text: $t('拟饵'), small: true }, cellsOf(LURES),
    { t: 'h', text: $t('活饵'), small: true }, cellsOf(LIVE_BAIT),
    { t: 'p', text: game.count('rod') ? $t('鱼竿') + ' ✓' : $t('鱼竿') + ' ?', dim: true, small: true },
  ]
  const p: ItemId | null = st.pick
  if (p) {
    const n = game.count(p)
    const likes = goodFor(p).length ? goodFor(p) : (['sardine', 'bream', 'mackerel'] as ItemId[])
    blocks.push(
      { t: 'row', icon: p, title: ITEMS[p].name, tag: on === p ? $t('使用中') : undefined, lines: [n ? (BAITS[p]!.live ? $t('有 {0} 个', n) : $t('用不坏')) : $t('还没有'), ITEMS[p].desc] },
      { t: 'cells', cols: 8, cells: [...likes.map((f) => ({ item: f, dim: !seen(f) })), ...(BAITS[p]!.night ? [{ text: '☾' }] : [])] },
      { t: 'actions', btns: [on === p ? { label: $t('取下'), on: () => game.tackle.use(null), primary: false } : { label: $t('用这个'), on: () => game.tackle.use(p), disabled: !n }] },
    )
  }
  return { title: $t('钓具箱'), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── the wardrobe (and the first look)
const PANTS: RGB[] = [[58, 84, 140], [80, 70, 60], [60, 70, 110], [90, 120, 150], [50, 52, 64], [150, 120, 90], [200, 190, 170], [120, 60, 60]]
const dyeOf = (c: RGB): ItemId | null => { const i = DESIGN_COLOURS.findIndex((d) => d.join() === c.join()); return i >= 0 ? DYES[i] : null }
export function lookSheet(game: Game, first?: boolean): Sheet {
  fresh(game)
  st.l ??= JSON.parse(JSON.stringify(game.look))
  st.yaw ??= 0.5
  const l: Look = st.l
  const set = (patch: Partial<Look>) => { st.l = { ...l, ...patch } }
  st.yaw += 0.03
  const was = game.look
  const need: Bag = {}
  if (!first) for (const [now, before] of [[l.shirt, was.shirt], [l.pants, was.pants]] as [RGB, RGB][]) {
    const d = dyeOf(now)
    if (d && now.join() !== before.join()) need[d] = (need[d] ?? 0) + 1
  }
  const short = (Object.keys(need) as ItemId[]).filter((d) => game.count(d) < (need[d] ?? 0))
  const done = () => {
    if (short.length) return game.warn($t('颜料不够：{0}（在工作台“涂装”页做）', short.map((d) => ITEMS[d].name).join($t('、'))))
    if (Object.keys(need).length) game.spend(need)
    game.setLook(l)
    game.open(first ? { kind: 'welcome' } : null)
  }
  const randomise = () => {
    const r = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
    const body = Math.random() < 0.5 ? 'm' : 'f'
    st.l = {
      body, build: r(['slim', 'plain', 'strong'] as const), skin: Math.floor(Math.random() * SKINS.length), hair: r(Object.keys(HAIR_NAMES) as Hair[]),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length), beard: body === 'm' ? r(Object.keys(BEARD_NAMES) as Beard[]) : 'none',
      eyes: Math.floor(Math.random() * EYE_COLORS.length), hat: r(Object.keys(HAT_NAMES) as Hat[]), shirt: r(CLOTHES), pants: r(PANTS), scarf: Math.random() < 0.5,
      top: r(Object.keys(TOP_NAMES) as Top[]), bottom: r(Object.keys(BOTTOM_NAMES) as Bottom[]),
    }
  }
  const key = JSON.stringify(l)
  const blocks: Block[] = []
  if (first) blocks.push({ t: 'p', text: $t('先捏一个自己。以后在家里的衣柜前随时能改。'), dim: true, small: true })
  blocks.push(
    { t: 'custom', h: 150, draw: (ui: UI, x, y, w) => {
      const c = previewCanvas('look', 100, 120)
      // a new model only when the look changes; the turn is cheap
      if (st.drawnKey !== key + Math.round(st.yaw * 20)) { drawVoxels(c, personModel(l, 'preview', 'stand'), st.yaw); st.drawnKey = key + Math.round(st.yaw * 20) }
      ui.bevel(x + w / 2 - 70, y, 140, 150, true, '#dfe8f0')
      ui.ctx.imageSmoothingEnabled = false
      ui.ctx.drawImage(c, x + w / 2 - 60, y + 3, 120, 144)
    } },
    { t: 'actions', btns: [{ label: $t('转一下'), on: () => { st.yaw += Math.PI / 2 }, primary: false }, { label: $t('随机'), on: randomise, primary: false }] },
    { t: 'h', text: $t('身体'), small: true }, chips({ m: $t('男'), f: $t('女') }, l.body, (v) => set({ body: v, beard: v === 'f' ? 'none' : l.beard })),
    { t: 'h', text: $t('体型'), small: true }, chips(BUILD_NAMES as Record<Build, string>, l.build, (v) => set({ build: v })),
    { t: 'h', text: $t('肤色'), small: true }, { t: 'swatches', colors: SKINS.map(css), picked: (i) => i === l.skin, tap: (i) => set({ skin: i }) },
    { t: 'h', text: $t('发型'), small: true }, chips(HAIR_NAMES, l.hair, (v) => set({ hair: v })),
    { t: 'h', text: $t('发色'), small: true }, { t: 'swatches', colors: HAIR_COLORS.map(css), picked: (i) => i === l.hairColor, tap: (i) => set({ hairColor: i }) },
  )
  if (l.body === 'm') blocks.push({ t: 'h', text: $t('胡子'), small: true }, chips(BEARD_NAMES, l.beard, (v) => set({ beard: v })))
  blocks.push(
    { t: 'h', text: $t('眼睛'), small: true }, { t: 'swatches', colors: EYE_COLORS.map(css), picked: (i) => i === l.eyes, tap: (i) => set({ eyes: i }) },
    { t: 'h', text: $t('帽子'), small: true }, chips(HAT_NAMES, l.hat, (v) => set({ hat: v })),
    { t: 'h', text: $t('上衣'), small: true }, chips(TOP_NAMES, l.top ?? 'tee', (v) => set({ top: v })),
    { t: 'swatches', colors: CLOTHES.map(css), picked: (i) => CLOTHES[i].join() === l.shirt.join(), tap: (i) => set({ shirt: CLOTHES[i] }) },
    { t: 'p', text: $t('颜料色（每染一次用一份对应的颜料{0}）', first ? $t('；第一次免费') : ''), dim: true, small: true },
    { t: 'swatches', colors: DESIGN_COLOURS.map(css), picked: (i) => DESIGN_COLOURS[i].join() === l.shirt.join(), tap: (i) => set({ shirt: DESIGN_COLOURS[i] }) },
  )
  if ((l.top ?? 'tee') !== 'dress') blocks.push({ t: 'h', text: $t('下装'), small: true }, chips(BOTTOM_NAMES, l.bottom ?? 'trousers', (v) => set({ bottom: v })))
  blocks.push(
    { t: 'swatches', colors: PANTS.map(css), picked: (i) => PANTS[i].join() === l.pants.join(), tap: (i) => set({ pants: PANTS[i] }) },
    { t: 'swatches', colors: DESIGN_COLOURS.map(css), picked: (i) => DESIGN_COLOURS[i].join() === l.pants.join(), tap: (i) => set({ pants: DESIGN_COLOURS[i] }) },
    chips({ no: $t('不戴围巾'), yes: $t('围巾') }, l.scarf ? 'yes' : 'no', (v) => set({ scarf: v === 'yes' })),
  )
  if (Object.keys(need).length) blocks.push({ t: 'p', text: $t('染色要用：{0}', (Object.keys(need) as ItemId[]).map((d) => $t('{0}×{1}（有 {2}）', ITEMS[d].name, need[d], game.count(d))).join($t('、'))), small: true, color: short.length ? C.bad : C.dim })
  blocks.push({ t: 'p', text: $t('下雨天出门，小人会自己穿上雨衣。'), dim: true, small: true })
  return {
    title: first ? $t('你是谁？') : $t('衣柜 · 换个样子'), blocks, onClose: first ? undefined : () => game.close(),
    foot: [{ label: first ? $t('就是我了') : $t('换好了'), on: done, disabled: short.length > 0 }],
  }
}

// ───────────────────────────────────────────── the hangar and pier cards
const GEN = ['', $t('第一代'), $t('第二代'), $t('第三代'), $t('第四代')]
const confirmScrap: Record<string, boolean> = {}
export function hullBlocks(game: Game, type: VehicleId): Block[] {
  const h = HULLS[type]
  const mine = game.save.vehicles.filter((v) => v.type === type)
  const first = VEHICLES[type]
  const allPlanned = h.levels.every((l) => l.planned)
  const cur = mine.length ? game.vdef(mine[0]).lv : 0
  const out: Block[] = [{
    t: 'h', text: (mine.length ? game.vdef(mine[0]).name : first.name),
    right: (h.kind === 'boat' ? $t('{0}船', GEN[h.gen]) : $t('{0}飞机', GEN[h.gen])) + (mine.length ? ' · ' + $t('已拥有') : allPlanned ? ' · ' + $t('规划中') : ''), rightColor: C.dim,
  }, {
    t: 'custom', h: 20, draw: (ui, x, y, w) => {
      const n = h.levels.length, cw = w / n
      h.levels.forEach((l, i) => {
        const on = l.lv === cur, done = l.lv < cur
        ui.bevel(x + i * cw, y, cw - 2, 18, on, l.planned ? '#d8d8d8' : on ? '#fff6c9' : done ? '#d8ecd8' : C.win)
        ui.text(String(l.lv), x + i * cw + cw / 2 - 1, y + 13, { size: 10, align: 'center', color: l.planned ? C.mid : C.ink, bold: on })
      })
    },
  }]
  if (!mine.length) {
    const block = game.buildBlock(type)
    out.push({
      t: 'row', title: first.desc, lines: [allPlanned ? '' : $t('速度 {0} · 货舱 {1} 格', Math.round(first.flight.speed), first.cargo), block ?? costLine(game, first.cost)].filter(Boolean),
      price: !block && h.levels[0].coins > 0 ? h.levels[0].coins : undefined,
      btns: block ? [] : [{ label: first.kind === 'boat' ? $t('亲手造一艘') : $t('亲手造一架'), on: () => game.buildVehicle(type), disabled: !game.isHome, primary: true }],
    })
    return out
  }
  for (const v of mine) out.push(...ownedBlocks(game, v))
  out.push({ t: 'gap' })
  return out
}
function ownedBlocks(game: Game, v: OwnedVehicle): Block[] {
  const def = game.vdef(v)
  const here = v.at === game.save.here
  const parked = def.kind === 'boat' || game.save.activePlane === v.id
  const up = game.upgradeVehicleInfo(v.id)
  const fix = here ? game.repairCost(v.id) : null
  const scrap = game.scrapInfo(v.id)
  const plane = def.kind === 'plane'
  const w = v.wear ?? { engine: 1, hull: 1, paint: 1 }
  const out: Block[] = [
    { t: 'p', text: def.desc, small: true },
    { t: 'p', text: $t('速度 {0} · 货舱 {1} 格{2}{3}', Math.round(def.flight.speed), def.cargo, def.armor > 1 ? $t(' · 坚固 ×{0}', def.armor) : '', !here ? $t(' · 停在{0}', game.islandName(v.at)) : ''), dim: true, small: true },
    { t: 'bar', label: plane ? $t('引擎') : $t('舵与缆'), u: w.engine, right: Math.round(w.engine * 100) + '%', color: w.engine < 0.6 ? C.bad : C.ok },
    { t: 'bar', label: plane ? $t('机身') : $t('船体'), u: w.hull, right: Math.round(w.hull * 100) + '%', color: w.hull < 0.6 ? C.bad : C.ok },
    { t: 'bar', label: $t('涂装'), u: w.paint, right: Math.round(w.paint * 100) + '%', color: w.paint < 0.4 ? C.bad : C.title2 },
  ]
  const btns: Btn[] = []
  if (here && !parked) btns.push({ label: $t('推上跑道'), on: () => game.rollOut(v.id), primary: false })
  if (here && game.isHome && def.model !== 'jet') btns.push({ label: $t('涂装'), on: () => game.open({ kind: 'paint', vehicleId: v.id }), primary: false })
  if (here && parked) btns.push({ label: $t('出发'), on: () => game.open({ kind: 'depart', vehicleId: v.id }) })
  if (btns.length) out.push({ t: 'actions', btns })
  if (fix && fix.parts.length) out.push({
    t: 'row', title: $t('修理{0}', fix.parts.map((p) => (p === 'engine' ? (plane ? $t('引擎') : $t('舵和缆绳')) : plane ? $t('机身') : $t('船体'))).join($t('和'))),
    lines: [game.isHome ? $t('在家修，用材料。') : $t('不在家：请这里的人修，只收金币，贵一倍。'), costLine(game, fix.cost)].filter(Boolean), price: fix.coins || undefined,
    btns: [{ label: $t('修理'), on: () => game.repairVehicle(v.id), primary: true }],
  })
  if (here && up) {
    if (up.next) out.push({
      t: 'row', title: $t('改装到 {0} 级：{1}', up.next.lv, up.next.name), lines: [up.next.desc, up.next.planned ? '' : costLine(game, up.next.cost), up.why ?? ''].filter(Boolean), price: up.next.planned ? undefined : up.next.coins,
      btns: [{ label: $t('改装'), on: () => game.upgradeVehicle(v.id), disabled: !up.ok, primary: true }],
    })
    else if (up.why) out.push({ t: 'p', text: up.why, dim: true, small: true })
  }
  if (here && game.isHome) for (const u of Object.keys(UPGRADES) as UpgradeId[]) {
    const has = v.up?.includes(u)
    out.push({
      t: 'row', title: UPGRADES[u].name, done: has, lines: [UPGRADES[u].desc, has ? '' : costLine(game, UPGRADES[u].cost), has ? '' : (game.upgradeBlock(v.id, u) ?? '')].filter(Boolean),
      price: has ? undefined : UPGRADES[u].coins, btns: has ? [] : [{ label: $t('装上'), on: () => game.buyUpgrade(v.id, u), disabled: !game.canUpgrade(v.id, u), primary: true }],
    })
  }
  if (here && game.isHome && scrap.ok) out.push({
    t: 'row', title: $t('拆掉'), lines: [$t('拆回一半的材料：{0}', Object.keys(scrap.back).length ? costLine(game, scrap.back) : $t('（几乎什么也不剩）'))],
    btns: [confirmScrap[v.id] ? { label: $t('确定拆'), on: () => { delete confirmScrap[v.id]; game.scrapVehicle(v.id) }, primary: true } : { label: $t('拆掉'), on: () => { confirmScrap[v.id] = true } }],
  })
  return out
}

// ───────────────────────────────────────────── the paint shop
function drawModel(cv: any, m: ModelDef) {
  const ctx = cv.getContext('2d')!
  const s = Math.max(2, Math.floor(Math.min(cv.width / (m.W + m.L * 0.5 + 2), cv.height / (m.H + m.L * 0.42 + 2))))
  ctx.clearRect(0, 0, cv.width, cv.height)
  const w = (m.W + m.L * 0.5) * s
  const ox = (cv.width - w) / 2 + m.L * 0.5 * s
  const oy = (cv.height - (m.H + m.L * 0.42) * s) / 2 + m.H * s
  const rgb = (c: RGB, f: number) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`
  for (let k = 0; k < m.L; k++) for (let y = 0; y < m.H; y++) {
    const sl = m.slices[y]
    for (let i = 0; i < m.W; i++) {
      const c = sl[k * m.W + i]
      if (!c) continue
      const col = m.colors[c] as RGB | undefined
      if (!col) continue
      const x = ox + i * s - k * s * 0.5
      const yy = oy - y * s + k * s * 0.42
      ctx.fillStyle = rgb(col, 0.78); ctx.fillRect(x, yy, s, s)
      ctx.fillStyle = rgb(col, 1.06); ctx.fillRect(x, yy, s, Math.max(1, s * 0.42))
    }
  }
}
const STRIPES: [Stripe, string][] = [['none', $t('无')], ['single', $t('单条')], ['double', $t('双条')], ['checker', $t('格纹')]]
export function paintSheet(game: Game, vehicleId: string): Sheet | null {
  fresh(game)
  const v = game.vehicle(vehicleId)
  const def = v ? game.vdef(v) : null
  const base = def ? defaultsOf(def.model) : undefined
  if (!v || !def || !base) return null
  st.p ??= JSON.parse(JSON.stringify(v.paint ?? {}))
  st.brush ??= 0
  const p: Paint = st.p
  const back = () => game.open({ kind: def.kind === 'boat' ? 'pier' : 'hangar' })
  const where = canvasOf(def.model)
  const design = p.design ?? '.'.repeat(DESIGN_W * DESIGN_H)
  const cost = game.paintCost(vehicleId, p)
  const ok = game.canPay(cost)
  const key = JSON.stringify(p)
  const swatch = (field: 'body' | 'accent' | 'cloth'): Block => ({
    t: 'swatches', colors: [css(base[field]), ...DESIGN_COLOURS.map(css)],
    picked: (i) => (i === 0 ? !p[field] : !!p[field] && p[field]!.join() === DESIGN_COLOURS[i - 1].join()),
    tap: (i) => { st.p = { ...p, [field]: i === 0 ? undefined : DESIGN_COLOURS[i - 1] } },
  })
  const blocks: Block[] = [{ t: 'custom', h: 130, draw: (ui, x, y, w) => {
    const c = previewCanvas('paint', 176, 128)
    if (st.drawn !== key) { const m = craftModel(def.model, 'preview', p, 0, false); if (m) drawModel(c, m); st.drawn = key }
    ui.bevel(x, y, w, 130, true, '#dfe8f0')
    ui.ctx.imageSmoothingEnabled = false
    ui.ctx.drawImage(c, x + w / 2 - 88, y + 1, 176, 128)
  } }]
  if (where) {
    blocks.push(
      { t: 'h', text: $t('{0}上的图案', where), small: true },
      { t: 'swatches', colors: DESIGN_COLOURS.map(css), picked: (i) => st.brush === i, tap: (i) => { st.brush = i }, extra: [{ label: $t('擦'), on: () => { st.brush = -1 }, primary: st.brush === -1 }, { label: $t('清空'), on: () => { st.p = { ...p, design: undefined } } }] },
      { t: 'custom', h: (w) => Math.floor(w / DESIGN_W) * DESIGN_H, draw: (ui, x, y, w) => {
        const s = Math.floor(w / DESIGN_W)
        for (let i = 0; i < DESIGN_W * DESIGN_H; i++) {
          const ch = design[i]
          const cx = x + (i % DESIGN_W) * s, cy = y + Math.floor(i / DESIGN_W) * s
          ui.fill(cx, cy, s, s, ch >= '0' && ch <= '7' ? css(DESIGN_COLOURS[Number(ch)]) : css(p.cloth ?? base.cloth))
          ui.fill(cx, cy, s, 1, 'rgba(0,0,0,0.12)'); ui.fill(cx, cy, 1, s, 'rgba(0,0,0,0.12)')
          const k = i
          ui.hit(cx, cy, s, s, () => { const put = st.brush < 0 ? '.' : String(st.brush); if (design[k] !== put) st.p = { ...p, design: design.slice(0, k) + put + design.slice(k + 1) } })
        }
      } },
      { t: 'p', text: $t('点格子画。'), dim: true, small: true },
    )
  }
  blocks.push(
    { t: 'h', text: def.kind === 'boat' ? $t('船身') : $t('机身'), small: true }, swatch('body'),
    { t: 'h', text: $t('点缀色（条纹、尾翼）'), small: true }, swatch('accent'),
    { t: 'h', text: def.kind === 'boat' ? $t('帆布') : $t('蒙布'), small: true }, swatch('cloth'),
    { t: 'h', text: $t('条纹'), small: true },
    { t: 'tabs', items: STRIPES.map(([id, name]) => ({ label: name, on: () => { st.p = { ...p, stripe: id } }, active: (p.stripe ?? 'single') === id })) },
    { t: 'p', text: $t('原色不要颜料；每种新颜色一份颜料。'), dim: true, small: true },
    { t: 'p', text: Object.keys(cost).length ? $t('要 ') + costLine(game, cost) : $t('不用颜料'), small: true, color: ok ? C.ink : C.bad },
  )
  return { title: $t('涂装 · {0}', def.name), blocks, onClose: back, foot: [{ label: $t('算了'), on: back, primary: false }, { label: $t('涂上'), on: () => game.paintVehicle(vehicleId, p), disabled: !ok }] }
}

// ───────────────────────────────────────────── the island notebook (all four pages)
const MY_WORDS = [
  $t('先把岛收拾干净，再说别的。'), $t('有了工作台，什么都能自己做了。'), $t('岛大了一圈。想养只小动物。'), $t('码头热闹起来了，邻岛的人常来。'), $t('晚上坐在门口看海，挺好。'),
  $t('屋里该添几样像样的家具了。'), $t('岛上的路，闭着眼也能走。'), $t('想去更远的海看看。'), $t('朋友们都说这里像个家。'), $t('这座岛，是我一点点攒起来的。'),
]
export const notebookTabs = { page: 'isle' }
let rerollSure = false
export function notebookSheet(game: Game): Sheet {
  const tab = notebookTabs.page
  const blocks: Block[] = [{ t: 'tabs', items: [
    { label: $t('小岛'), on: () => { notebookTabs.page = 'isle' }, active: tab === 'isle' },
    { label: houseName(game.house.tier), on: () => { notebookTabs.page = 'home' }, active: tab === 'home' },
    { label: $t('动物 {0}/{1}', game.pets.owned.length, game.petSlots), on: () => { notebookTabs.page = 'pets' }, active: tab === 'pets' },
    { label: $t('院子'), on: () => { notebookTabs.page = 'yard' }, active: tab === 'yard' },
  ] }]
  if (tab === 'isle') {
    const up = game.levelInfo()
    blocks.push(
      { t: 'h', text: `${LEVELS[game.level - 1].name} · ${game.level}/10` },
      { t: 'p', text: `“${MY_WORDS[game.level - 1]}”` },
      { t: 'p', text: $t('矿洞层数') + ' ' + game.mine.depth + ' · ' + $t('菜地') + ' ' + game.farmPlots + ' · ' + $t('宠物位') + ' ' + game.petSlots + ' · ' + $t('魅力') + ' ' + game.charm, small: true },
    )
    const c = game.charmParts()
    blocks.push({ t: 'p', text: $t('魅力 {0} ＝ 岛上摆设 {1} ＋ 屋里家具 {2}（四分之一）＋ 请客 {3}', game.charm, c.outdoor, c.house, c.guests), dim: true, small: true })
    if (up) {
      blocks.push({ t: 'h', text: '→ ' + up.level.name, right: up.level.planned ? undefined : String(up.level.coins) })
      blocks.push({ t: 'p', text: up.level.opens, dim: true, small: true })
      for (const q of up.goals) blocks.push({ t: 'row', title: q.text, done: q.done, lines: q.done ? [] : [`${q.have}/${q.need}`] })
      if (up.level.planned) blocks.push({ t: 'p', text: $t('还在规划中。'), dim: true })
      else blocks.push({ t: 'actions', btns: [{ label: $t('升级'), on: () => game.levelUp(), disabled: !up.ok }] })
    } else blocks.push({ t: 'p', text: $t('已经是最高级了。') })
    blocks.push({ t: 'h', text: $t('全部 10 级'), small: true })
    for (const L of LEVELS) blocks.push({ t: 'p', text: `${L.n} ${L.name}` + $t('：{0}', L.opens), small: true, dim: L.n <= game.level })
    const block = game.rerollBlock()
    blocks.push({
      t: 'row', title: $t('炸岛重开'), lines: [$t('换一座随机的新岛。背包留着；造出第一架飞机前能用，最多 3 次。{0}', block ?? $t('还剩 {0} 次。', game.rerollsLeft))],
      btns: block ? [] : [rerollSure ? { label: $t('确定炸掉！'), on: () => { rerollSure = false; game.rerollIsland() }, primary: true } : { label: $t('炸岛…'), on: () => { rerollSure = true } }],
    })
  } else if (tab === 'home') {
    const c = game.house.cosiness()
    const stars = Math.max(0, Math.min(5, Math.round(c.score / 20)))
    blocks.push(
      { t: 'h', text: '★'.repeat(stars) + '☆'.repeat(5 - stars), rightColor: C.coin, right: $t('温馨度 {0}', c.score) },
      { t: 'p', text: `“${stars >= 4 ? $t('回家的感觉真好。') : stars >= 2 ? $t('再添点东西，会更像个家。') : $t('屋里空荡荡的。')}”` },
      ...c.notes.map((n): Block => ({ t: 'p', text: '· ' + n, small: true })),
    )
    const up = game.house.nextUp()
    if (!up) blocks.push({ t: 'p', text: $t('“房子已经是最大的了。”') })
    else {
      blocks.push({ t: 'h', text: $t('扩建 → {0}', up.name), right: String(up.coins) })
      blocks.push({ t: 'p', text: up.brings, dim: true, small: true })
      blocks.push({ t: 'row', title: $t('小岛 {0} 级', up.level), done: game.level >= up.level })
      for (const [id, n] of Object.entries(up.need) as [ItemId, number][]) blocks.push({ t: 'row', icon: id, title: ITEMS[id].name, done: game.count(id) >= n, lines: [`${Math.min(game.count(id), n)}/${n}`] })
      blocks.push({ t: 'actions', btns: [{ label: up.ok ? $t('扩建') : up.why, on: () => { if (game.house.grow()) game.close() }, disabled: !up.ok }] })
    }
  } else if (tab === 'pets') {
    if (game.petSlots === 0) blocks.push({ t: 'p', text: $t('岛到 3 级就能养。') })
    else if (!game.pets.owned.length) blocks.push({ t: 'p', text: $t('“村边的小家伙，喂它爱吃的，几次就熟了。”') })
    for (const pet of game.pets.owned) {
      const col = game.pets.colour(pet.sp, pet.col)
      blocks.push({
        t: 'row', title: col.name + PET_SPECIES[pet.sp].name, titleColor: `rgb(${col.dark.join(',')})`, lines: [`${RARITY_STARS[rarityOf(col)]} · ${game.islandName(pet.from)}`],
        btns: [{ label: pet.follow ? '♥ ' + $t('跟着') : $t('跟着'), on: () => game.pets.setFollow(pet.id), primary: pet.follow }],
      })
    }
  } else {
    const mine = ITEM_ORDER.filter((id) => ITEMS[id].kind === 'furniture' && game.count(id) > 0 && !FURNITURE[id]?.indoor)
    const out = ITEM_ORDER.filter((id) => ITEMS[id].kind === 'furniture' && (game.save.decor ?? []).some((x) => x.item === id))
    const seeds = (Object.keys(PLANTS) as ItemId[]).filter((id) => game.count(id) > 0)
    if (!mine.length && !out.length && !seeds.length) blocks.push({ t: 'p', text: $t('“院子还空着。工作台能做长椅和灯。”') })
    for (const id of mine) blocks.push({ t: 'row', icon: id, title: `${ITEMS[id].name} ×${game.count(id)}`, btns: [{ label: $t('摆出去'), on: () => game.startDecor(id), primary: true }] })
    for (const id of seeds) blocks.push({ t: 'row', icon: id, title: `${ITEMS[id].name} ×${game.count(id)}`, lines: [`${game.save.planted?.length ?? 0}/${MAX_PLANTS}`], btns: [{ label: $t('种下'), on: () => game.startDecor(id), primary: true }] })
    for (const id of out) blocks.push({ t: 'row', icon: id, title: `${ITEMS[id].name} ×${(game.save.decor ?? []).filter((x) => x.item === id).length}`, btns: [{ label: $t('收回'), on: () => game.pickUpDecor(id) }] })
  }
  return { title: $t('岛务手账'), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── the journal
export const journalTabs = { page: 'goals' }
let codexTip: ItemId | null = null
export function journalSheet(game: Game): Sheet {
  const all = game.story.codexCount()
  const pages: [string, string][] = [['goals', $t('这一程')], ['skills', $t('手艺')], ['friends', $t('岛与岛主')], ['codex', $t('图鉴 {0}/{1}', all.have, all.all)], ['pets', $t('动物')], ['fish', $t('鱼')]]
  const tab = journalTabs.page
  const blocks: Block[] = [{ t: 'tabs', items: pages.map(([k, n]) => ({ label: n, on: () => { journalTabs.page = k; codexTip = null }, active: tab === k })) }]
  if (tab === 'goals') {
    const v = game.story.view()
    const q = game.quest()
    const at = v.open ? (v.ended ? CHAPTERS.length : game.save.story!.ch) : -1
    blocks.push({ t: 'h', text: $t('第一章 · 登岛 {0}', v.open ? '✓' : `${q.index + 1}/${QUESTS.length - 1}`), small: true })
    if (!v.open) blocks.push({ t: 'p', text: q.title + (q.progress ? ' ' + q.progress : '') }, { t: 'p', text: q.hint, dim: true, small: true })
    CHAPTERS.forEach((ch, i) => {
      blocks.push({ t: 'h', small: true, text: $t('第{0}章 · {1} ', ch.no, i <= at ? ch.title : $t('？？？')) + (i < at ? '✓' : ''), rightColor: C.ok })
      if (i === at) {
        blocks.push({ t: 'p', text: ch.intro, dim: true, small: true })
        for (const g of v.goals) blocks.push({ t: 'row', title: g.text, done: g.done, lines: !g.done && g.progress ? [g.progress] : [] })
        blocks.push({ t: 'p', text: $t('完成后：') + ch.coins + ' · ' + bagText(ch.gift), dim: true, small: true })
      }
    })
    if (v.ended) blocks.push({ t: 'p', text: $t('海图上的每座岛你都到过了。订单照旧，图鉴未满。'), dim: true })
  } else if (tab === 'skills') {
    const sk = game.skills
    blocks.push({ t: 'p', text: $t('做得越多，越省力气。') })
    for (const s of SKILLS) {
      const l = sk.level(s)
      const top = l >= MAX_LEVEL
      blocks.push(
        { t: 'bar', label: `${SKILL_NAME[s]} · ${$t('{0} 级', l)}`, u: sk.progress(s), right: top ? $t('满级') : `${sk.xp(s)}/${LEVEL_XP[l + 1]}` },
        { t: 'p', text: SKILL_PERK[s], dim: true, small: true },
        ...SKILL_KNACK[s].map((k, i): Block => ({ t: 'p', text: (i ? $t('10 级') : $t('5 级')) + ' · ' + k, small: true, color: sk.has(s, i as 0 | 1) ? C.ok : C.mid })),
      )
    }
  } else if (tab === 'friends') {
    const ids = [...FRIENDS, ...(game.known('far') ? ['far'] : []), ...game.guests.map((g) => g.id)].filter((id) => game.layouts[id])
    for (const id of ids) {
      const d = game.layouts[id].def
      const f = game.story.friend(id)
      const isFriend = (FRIENDS as readonly string[]).includes(id)
      const lines = [`${d.guest ? $t('玩家的岛') : d.owner} · ${(game.distanceTo(id) / 100).toFixed(1)} km${game.save.visited?.[id] ? '' : $t(' · 还没去过')}${d.danger > 0 ? ' ' + '☠'.repeat(d.danger) : ''}`]
      if (isFriend) lines.push(FRIEND_STEPS.map((_, i) => (i < f.level ? '♥' : '♡')).join('') + ' ' + FRIEND_NAME[f.level] + $t(' · 已送到 {0} 单{1}', f.points, f.next ? $t('，再送 {0} 单成为{1}', f.next - f.points, FRIEND_NAME[f.level + 1]) : ''))
      if (d.sells.length) lines.push($t('出：{0}　缺：{1}', d.sells.map((i) => ITEMS[i].name).join($t('、')), d.wants.map((i) => ITEMS[i].name).join($t('、'))))
      if (d.guest) lines.push($t('{0} · 去看看对方的岛。', d.tier >= 3 ? $t('群峰之岛') : d.tier >= 2 ? $t('大岛') : $t('小岛')))
      blocks.push({ t: 'row', title: d.name, lines })
    }
    if (!game.known('far')) blocks.push({ t: 'p', text: $t('海图的西边还空着一块。'), dim: true })
    if (!game.guests.length) blocks.push({ t: 'p', text: game.onlineStatus(), dim: true, small: true })
  } else if (tab === 'codex') {
    const seen = game.save.seen ?? {}
    if (codexTip) blocks.push({ t: 'row', icon: codexTip, title: `${ITEMS[codexTip].name}  ${RARITY_NAME[ITEMS[codexTip].rarity]}`, lines: [ITEMS[codexTip].desc], sel: true })
    for (const page of CODEX) {
      const items = codexItems(page.kind)
      const have = items.filter((i) => seen[i]).length
      blocks.push({ t: 'h', small: true, text: `${page.name} ${have}/${items.length}`, right: have === items.length ? $t('✓ 集齐') : $t('集齐奖 ') + page.coins, rightColor: have === items.length ? C.ok : C.coin })
      blocks.push({ t: 'cells', cols: 8, cells: items.map((i) => (seen[i] ? { item: i } : { text: '?', dim: true })), tap: (k) => { if (seen[items[k]]) codexTip = items[k] } })
    }
  } else if (tab === 'pets') {
    const seen = game.save.petSeen ?? {}
    const where = (sp: string) => Object.keys(ISLAND_PETS).filter((id) => ISLAND_PETS[id].some((x) => x.sp === sp)).map((id) => game.islandName(id)).join($t('、'))
    blocks.push({ t: 'p', text: $t('喂它爱吃的，几次就跟你回家。实心：养过；空心：见过。'), dim: true, small: true })
    for (const sp of PET_ORDER) {
      const cols = PET_SPECIES[sp].colours
      blocks.push(
        { t: 'row', title: PET_SPECIES[sp].name, lines: [$t('爱吃{0} · 在{1}', ITEMS[PET_RULES[sp].food].name, where(sp))] },
        { t: 'custom', h: Math.ceil(cols.length / 4) * 34, draw: (ui, x, y, w) => {
          const cw = w / 4
          cols.forEach((c, i) => {
            const n = seen[sp + ':' + c.id] ?? 0
            const cx = x + (i % 4) * cw, cy = y + Math.floor(i / 4) * 34
            ui.bevel(cx + 2, cy + 2, 18, 18, true, n === 2 ? `rgb(${c.main.join(',')})` : '#f4f4f4')
            if (n === 1) { ui.ctx.strokeStyle = `rgb(${c.dark.join(',')})`; ui.ctx.lineWidth = 2; ui.ctx.strokeRect(cx + 4, cy + 4, 14, 14) }
            ui.text(n ? c.name + (rarityOf(c) ? ' ' + '★'.repeat(rarityOf(c)) : '') : '?', cx + 24, cy + 16, { size: 10, color: n ? C.ink : C.mid })
          })
        } },
      )
    }
  } else blocks.push(...fishBlocks(game))
  return { title: $t('航海日志'), blocks, onClose: () => game.close() }
}

// ───────────────────────────────────────────── the settings
let resetSure = false
let devOpen = false
export function settingsSheet(game: Game, ops: { audio: any; onTitle: () => void; onReset: () => void; persist: () => void; restartSound: () => void }): Sheet {
  const set = game.save.settings ?? { music: 0.5, sfx: 0.55 }
  const audio = ops.audio
  const vol = (k: 'music' | 'sfx', v: number) => {
    v = Math.max(0, Math.min(1, Math.round(v * 10) / 10))
    game.setVolume(k === 'music' ? v : set.music, k === 'sfx' ? v : set.sfx)
    audio.setVolume(game.save.settings!.music, game.save.settings!.sfx)
    if (k === 'sfx') audio.play('tap')
  }
  const blocks: Block[] = [
    { t: 'stepper', label: $t('音乐'), value: Math.round(set.music * 100) + '%', minus: () => vol('music', set.music - 0.1), plus: () => vol('music', set.music + 0.1) },
    { t: 'stepper', label: $t('音效'), value: Math.round(set.sfx * 100) + '%', minus: () => vol('sfx', set.sfx - 0.1), plus: () => vol('sfx', set.sfx + 0.1) },
    { t: 'tabs', items: [
      { label: audio.muted ? $t('已静音') : $t('有声音'), on: () => { audio.toggleMute(); audio.unlock() }, active: !audio.muted },
    ] },
    { t: 'row', title: $t('声音状态：{0}', soundState(audio)), lineColor: G.__soundErr ? C.bad : C.dim, lines: G.__soundErr ? [String(G.__soundErr)] : [],
      btns: [{ label: $t('试听'), on: () => { audio.unlock(); audio.play('done') } }, { label: $t('重启声音'), on: () => ops.restartSound(), primary: true }] },
    { t: 'h', text: '语言 · Language', small: true },
    { t: 'tabs', items: LANGS.map((l) => ({ label: l.name, on: () => chooseLangWx(l.id, ops.persist), active: l.id === LANG })) },
    { t: 'h', text: $t('视角'), small: true },
    { t: 'actions', left: true, btns: [
      { label: game.view3d ? $t('换成俯视') : $t('换成斜视'), on: () => game.toggleView(), primary: false },
      { label: $t('↶ 左转'), on: () => game.rotateView(-1), disabled: !game.view3d, primary: false },
      { label: $t('右转 ↷'), on: () => game.rotateView(1), disabled: !game.view3d, primary: false },
      { label: game.islandZoom === 2 ? $t('镜头拉近') : $t('镜头拉远'), on: () => game.toggleZoom(), primary: false },
    ] },
    { t: 'row', title: $t('{0}：{1}', $t('岛的名字'), (game.save.name || $t('你的小岛'))), btns: [{ label: $t('改名'), on: () => renameIsland(game) }] },
    { t: 'p', text: game.onlineStatus(), dim: true, small: true },
    { t: 'p', text: $t('操作：点地面走路，点东西使用。两指捏合拉远近、两指拧转镜头。飞行时按住屏幕转向，点一下翻滚。'), dim: true, small: true },
    { t: 'actions', btns: [
      { label: $t('回到标题画面'), on: () => { game.close(); ops.onTitle() }, primary: false },
      resetSure ? { label: $t('确定：清除存档'), on: () => { resetSure = false; ops.onReset() } } : { label: $t('重新开始…'), on: () => { resetSure = true }, primary: false },
      { label: $t('开发者'), on: () => { devOpen = !devOpen }, primary: false },
    ] },
  ]
  if (devOpen) blocks.push({ t: 'actions', btns: [
    { label: $t('补给材料和金币'), on: () => game.devGive() },
    { label: $t('白天'), on: () => game.setClock(0.3), primary: false },
    { label: $t('黄昏'), on: () => game.setClock(0.72), primary: false },
    { label: $t('夜晚'), on: () => game.setClock(0.8), primary: false },
    ...(['clear', 'rain', 'storm', 'snow', 'fog'] as const).map((k) => ({ label: ({ clear: $t('晴'), rain: $t('雨'), storm: $t('暴风雨'), snow: $t('雪'), fog: $t('雾') })[k], on: () => game.weather.force(k, k === 'clear' ? 0 : 240), primary: false })),
  ] })
  return { title: $t('菜单'), blocks, onClose: () => { resetSure = false; game.close() } }
}
function soundState(audio: any): string {
  if (G.__soundErr) return $t('出错了')
  if (!G.AudioContext) return $t('这台手机不支持')
  const c = audio.ctx
  if (!c) return $t('还没启动（点一下屏幕）')
  return c.state === 'running' ? $t('正常') : c.state === 'suspended' ? $t('被暂停') : String(c.state)
}
function renameIsland(game: Game) {
  const wx = G.wx
  if (!wx.showModal) return
  wx.showModal({
    title: $t('岛的名字'), editable: true, placeholderText: $t('你的小岛'), content: game.save.name ?? '',
    success: (r: any) => { if (r.confirm) game.setName(String(r.content ?? '').slice(0, 10)) },
  })
}
/** the language: kept, and the mini game starts again in it (the island is saved first) */
function chooseLangWx(l: string, persist: () => void) {
  if (l === LANG) return
  try { G.localStorage.setItem('skyisle-lang', l) } catch { /* */ }
  persist()
  const wx = G.wx
  if (wx.restartMiniProgram) wx.restartMiniProgram({})
  else wx.showToast?.({ title: $t('重新打开小游戏后生效'), icon: 'none' })
}

// ───────────────────────────────────────────── the ending
export function endingSheet(game: Game): Sheet {
  const s = game.save
  const mins = Math.round((s.played ?? 0) / 60)
  const c = game.story.codexCount()
  return { title: $t('彼岸'), blocks: [
    { t: 'p', text: $t('灯塔下站着守灯人。他说，这盏灯一直亮着，是为了让海那一边的人知道：这里有人。') },
    { t: 'p', text: $t('你回头看。来时的海上，很远很远的地方，也有一点光——那是你家门口的路灯。') },
    { t: 'p', text: $t('他把自己的提灯给了你。带回去，摆在岛上。'), dim: true },
    { t: 'p', text: [$t('送到 ') + s.stats.delivered + $t(' 单'), $t('捕到 ') + (s.stats.fished ?? 0) + $t(' 条鱼'), $t('矿洞最深 ') + (s.mine?.unlocked ?? 1) + $t(' 层'), $t('魅力 ') + game.charm, $t('图鉴 ') + `${c.have}/${c.all}`, mins > 0 ? $t('航行 ') + mins + $t(' 分钟') : ''].filter(Boolean).join(' · '), small: true },
    { t: 'p', text: $t('故事到这里讲完了，日子没有。岛还是你的岛：订单照旧，彼岸的店里有月光石，图鉴还没填满，朋友的岛就在海图上。'), dim: true, small: true },
    { t: 'p', text: $t('云岭航行 · 画面与飞行手感来自 fighter 像素飞行原型 · 音乐与音效为程序化合成'), dim: true, small: true, center: true },
    { t: 'actions', btns: [{ label: $t('回到岛上'), on: () => game.close() }] },
  ] }
}
