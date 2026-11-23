// The farm (round 18, made again): one field beside the village, its plots side by side in rows of
// four. It starts as waste ground. A plot is cleared (the weeds come away as fibre), a seed goes in,
// and then it wants water: once a day, a whole row at a time — a day it is not watered it does not
// grow (it never dies). Rain waters everything. Fertiliser makes a crop quicker and bigger; it
// comes from the compost bin at the field's corner, which turns small fish, spare crops, weeds and
// shells into fertiliser overnight. And the ground remembers being looked after: waste → tilled →
// good earth → rich earth, each a little quicker, the last with one more in every harvest.

import type { Game } from './game'
import { ITEMS, give, type Bag, type ItemId } from './data'
import { DAY_SECONDS } from './body'
import { MAT } from '../engine/materials'
import { $t } from '../i18n'

type Actor = Game['pilot']

/** grow: seconds of watered time to ripen (a day is 1200) */
export interface CropDef { seed: ItemId; crop: ItemId; grow: number; yield: number; model: string }
export const CROPS: CropDef[] = [
  { seed: 'carrotSeed', crop: 'carrot', grow: 500, yield: 3, model: 'carrot' },
  { seed: 'wheatSeed', crop: 'wheat', grow: 450, yield: 3, model: 'wheat' },
  { seed: 'strawberrySeed', crop: 'strawberry', grow: 800, yield: 3, model: 'strawberry' },
  { seed: 'pumpkinSeed', crop: 'pumpkin', grow: 1400, yield: 1, model: 'pumpkin' },
]
export const cropOf = (seed: ItemId) => CROPS.find((c) => c.seed === seed)

/** the old beds (before round 18): kept only to bring their crops over */
export interface Bed { dx: number; dy: number; seed?: ItemId; plantedAt?: number; ripeAt?: number }
/** a plot of the field. s: 0 waste, 1 tilled. care: how well it has been looked after. */
export interface Plot { s: 0 | 1; care: number; seed?: ItemId; grown?: number; wetUntil?: number; wetDay?: number; fert?: boolean }
export interface FieldSave { ax: number; ay: number; plots: Plot[]; t: number; day: number }
export interface CompostSave { pts: number; ready: number }

export const COLS = 4
const PITCH = 8
/** care at which tilled earth becomes good earth, and good earth rich */
export const GOOD = 3, RICH = 8
export const soilName = (p: Plot) => (p.s === 0 ? $t('荒地') : p.care >= RICH ? $t('肥地') : p.care >= GOOD ? $t('好地') : $t('耕地'))
const soilRank = (p: Plot) => (p.care >= RICH ? 2 : p.care >= GOOD ? 1 : 0)
/** how many points of compost make one bag of fertiliser */
export const COMPOST_PER = 4
/** what a thing is worth in the compost bin (0: it does not rot) */
export function compostWorth(item: ItemId): number {
  const it = ITEMS[item]
  if (!it) return 0
  if (item === 'pumpkin') return 3
  if (it.kind === 'fish') return it.value <= 12 ? 2 : 0 // the small fry; a good fish is for eating or showing
  if (it.kind === 'crop') return 1
  return (['fiber', 'stick', 'shell', 'berry', 'flower', 'acorn'] as ItemId[]).includes(item) ? 1 : 0
}

export class Farm {
  private actors: { p: Plot; i: number; soil: Actor; crop: Actor | null; x: number; y: number; z: number }[] = []
  private extras: Actor[] = []
  private bin: Actor | null = null
  constructor(private g: Game) {}

  get field(): FieldSave {
    return (this.g.save.field ??= { ax: 0, ay: 0, plots: [], t: this.g.save.played ?? 0, day: this.g.clockDay })
  }
  /** (the name the rest of the game knows them by) */
  get beds(): Plot[] {
    return this.field.plots
  }
  get compost(): CompostSave {
    return (this.g.save.compost ??= { pts: 0, ready: 0 })
  }
  private get rows() {
    return Math.ceil(this.field.plots.length / COLS)
  }

  rebuild() {
    this.clear()
    this.build()
  }
  private clear() {
    const sc = this.g.scene
    for (const e of this.actors) { sc.removeActor(e.soil); if (e.crop) sc.removeActor(e.crop) }
    for (const a of this.extras) sc.removeActor(a)
    if (this.bin) { sc.removeActor(this.bin); this.g.world.block(this.bin.x, this.bin.y, 4, 4, false) }
    this.actors = []
    this.extras = []
    this.bin = null
  }
  /** everything drawn again (a new world, or back home) */
  build() {
    const g = this.g
    this.actors = []
    this.extras = []
    this.bin = null
    const lay = g.layouts.home
    if (!lay) return
    const f = this.field
    // the old separate beds: what grew in them grows on in the field
    const old = (g.save.farm ?? []) as Bed[]
    if (old.length) {
      for (const b of old) {
        const c = b.seed ? cropOf(b.seed) : undefined
        const u = c && b.ripeAt !== undefined && b.plantedAt !== undefined ? Math.min(1, Math.max(0, (g.now() - b.plantedAt) / Math.max(1, b.ripeAt - b.plantedAt))) : 0
        f.plots.push({ s: 1, care: 1, seed: c ? b.seed : undefined, grown: c ? u * c.grow : undefined })
      }
      g.save.farm = []
    }
    // more plots for a new level: waste ground, a row at a time
    while (f.plots.length < g.farmPlots) f.plots.push({ s: 0, care: 0 })
    if (!f.plots.length) return
    // a watering can comes with the field
    if (!g.count('wateringCan')) give((g.save.store ??= {}), { wateringCan: 1 })
    const rows = this.rows
    // room for the plots and the bin — and clear of the house's own ground (its yard, the letter box, the way to the door)
    const home = lay.buildings.find((b) => b.kind === 'house')
    // Where: gently sloping open ground (the field levels it), clear of water, buildings, the
    // runway — and of the house's own ground: the whole yard if the island has room, less on a small one.
    const HW = COLS * 4 + 8, HH = rows * 4 + 4
    const centre = (ax: number, ay: number) => ({ cx: Math.round(lay.plaza.x + ax + (COLS - 1) * 4 + 5), cy: Math.round(lay.plaza.y + ay + (rows - 1) * 4) })
    const fitsAt = (mx: number, my: number) => (ax: number, ay: number) => {
      const { cx, cy } = centre(ax, ay)
      if (home && Math.abs(g.world.delta(cx, home.x)) < mx + HW && Math.abs(g.world.delta(cy, home.y)) < my + HH) return false
      let lo = 999, hi = -999
      for (let y = cy - HH - 2; y <= cy + HH + 2; y += 2) for (let x = cx - HW - 2; x <= cx + HW + 2; x += 2) {
        if (g.world.isWater(x, y) || g.world.solidAt(x, y)) return false
        const m = g.world.matAt(x, y)
        if (m >= 17 && m <= 24) return false
        const h = g.world.heightAt(x, y)
        if (h < lo) lo = h
        if (h > hi) hi = h
        if (hi - lo > 4) return false
      }
      return true
    }
    if (!(f.ax || f.ay) || !fitsAt(22, 18)(f.ax, f.ay)) {
      const at = this.findSpot(fitsAt(50, 38)) ?? this.findSpot(fitsAt(34, 26)) ?? this.findSpot(fitsAt(22, 18))
      if (!at) return
      f.ax = at.x
      f.ay = at.y
    }
    const x0 = lay.plaza.x + f.ax, y0 = lay.plaza.y + f.ay
    // level the patch (to the height at its middle), as the shovel does
    {
      const { cx, cy } = centre(f.ax, f.ay)
      const w = HW * 2 + 1, h = HH * 2 + 1
      const st = { name: 'field', w, h, rise: new Uint8Array(w * h), mats: new Uint8Array(w * h).fill(255), solid: new Uint8Array(w * h) }
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const wx = cx - HW + xx, wy = cy - HH + yy
        if (g.world.isWater(wx, wy) || g.world.solidAt(wx, wy)) continue
        const m = g.world.matAt(wx, wy)
        if (m >= 17 && m <= 24) continue
        st.mats[yy * w + xx] = m === MAT.treeTop || m === MAT.tree || m === MAT.treeEdge ? MAT.grass : m
      }
      g.world.place(st, cx, cy, g.world.heightAt(cx, cy))
    }
    f.plots.forEach((p, i) => {
      const x = x0 + (i % COLS) * PITCH, y = y0 + Math.floor(i / COLS) * PITCH
      const z = g.world.heightAt(Math.round(x), Math.round(y))
      const soil = g.scene.addActor(this.soilModel(p), { x, y, z, yaw: 0, shadow: false, reach: 500 })
      const e = { p, i, soil, crop: null as Actor | null, x, y, z }
      this.actors.push(e)
      this.show(e)
    })
    // a low board round it, and the compost bin at the corner
    const zc = g.world.heightAt(Math.round(x0), Math.round(y0))
    const w = COLS * PITCH, h = rows * PITCH
    const cx = x0 + (COLS - 1) * 4, cy = y0 + (rows - 1) * 4
    for (let i = 0; i < COLS; i++) for (const y of [cy - h / 2 - 0.5, cy + h / 2 + 0.5]) this.extras.push(g.scene.addActor('field_edge', { x: x0 + i * PITCH, y, z: zc, yaw: 0, shadow: false, reach: 500 }))
    for (let r = 0; r < rows; r++) for (const x of [cx - w / 2 - 0.5, cx + w / 2 + 0.5]) this.extras.push(g.scene.addActor('field_edge', { x, y: y0 + r * PITCH, z: zc, yaw: Math.PI / 2, shadow: false, reach: 500 }))
    const bx = Math.round(x0 + COLS * PITCH + 3), by = Math.round(y0)
    this.bin = g.scene.addActor('compost_bin', { x: bx, y: by, z: g.world.heightAt(bx, by), yaw: 0, reach: 500 })
    g.world.block(bx, by, 4, 4, true)
  }
  /** room for the whole field near the village */
  private findSpot(fits: (ax: number, ay: number) => boolean): { x: number; y: number } | null {
    const anchors = [[-56, 30], [34, 30], [-12, 46], [-56, -50], [34, -50]]
    for (let ring = 0; ring < 22; ring++) {
      for (const [ax, ay] of anchors) {
        for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
          if (fits(ax + dx * 6, ay + dy * 6)) return { x: ax + dx * 6, y: ay + dy * 6 }
        }
      }
    }
    return null
  }

  // ── what a plot looks like
  isWet(p: Plot): boolean {
    return (p.wetUntil ?? 0) > (this.g.save.played ?? 0)
  }
  private soilModel(p: Plot): string {
    return p.s === 0 ? 'soil_waste' : `soil_${soilRank(p)}${this.isWet(p) ? 'w' : ''}`
  }
  private cropModel(p: Plot): string | null {
    if (!p.seed) return null
    const c = cropOf(p.seed)!
    const u = this.progress(p)
    return u >= 1 ? `cr_${c.model}2` : u >= 0.45 ? `cr_${c.model}1` : 'cr_sprout'
  }
  private show(e: Farm['actors'][number]) {
    const g = this.g
    const soil = this.soilModel(e.p)
    if (e.soil.model.name !== soil) e.soil.model = g.scene.models[soil]
    const want = this.cropModel(e.p)
    if (e.crop && (!want || e.crop.model.name !== want)) {
      g.scene.removeActor(e.crop)
      e.crop = null
    }
    if (want && !e.crop) {
      e.crop = g.scene.addActor(want, { x: e.x, y: e.y, z: e.z + 1, yaw: 0, shadow: false, reach: 500 })
      e.crop.stretch = 0.3
      g.settling.push(e.crop)
    }
  }
  /** how long this crop takes in this plot: good earth, rich earth and fertiliser each make it quicker */
  need(p: Plot): number {
    const c = p.seed ? cropOf(p.seed) : undefined
    if (!c) return 1
    return c.grow * (p.fert ? 0.75 : 1) * [1, 0.9, 0.8][soilRank(p)] * (this.g.skills.has('farm', 1) ? 0.9 : 1)
  }
  /** how far along, 0..1 */
  progress(p: Plot): number {
    if (!p.seed) return 0
    return Math.min(1, (p.grown ?? 0) / this.need(p))
  }

  // ── time
  step(_dt: number) {
    const g = this.g
    const f = this.field
    const now = g.save.played ?? 0
    const day = g.clockDay
    const endOfDay = (day + 1) * DAY_SECONDS
    // rain waters every tilled plot for the rest of the day
    if (g.life.raining) for (const p of f.plots) if (p.s === 1 && (p.wetUntil ?? 0) < endOfDay) p.wetUntil = endOfDay
    // growth: only the time a plot was wet counts (a night slept through counts up to the morning it dried)
    if (now > f.t) {
      for (const p of f.plots) {
        if (!p.seed) continue
        const wet = Math.min(now, p.wetUntil ?? 0) - f.t
        if (wet > 0) p.grown = (p.grown ?? 0) + wet
      }
    }
    f.t = now
    // a new morning: the compost has rotted down; the ranch's animals add a little of their own
    if (day > f.day) {
      f.day = day
      const c = this.compost
      const made = Math.floor(c.pts / COMPOST_PER) + (g.estate.has('ranch') ? Math.floor((g.save.pets?.length ?? 0) / 2) : 0)
      if (made) { c.pts %= COMPOST_PER; c.ready += made }
    }
    if (g.save.here !== 'home') return
    for (const e of this.actors) {
      const was = e.crop?.model.name ?? null
      const want = this.cropModel(e.p)
      if (was !== want || e.soil.model.name !== this.soilModel(e.p)) {
        const ripe = !!want?.endsWith('2') && was !== want
        this.show(e)
        if (ripe && g.onSurface && g.mode === 'island') g.scene.burst({ kind: 'star', x: e.x, y: e.y, z: e.z + 5, n: 6, speed: 8, up: 10, life: 0.6, mode: 'float', grav: 0 })
      }
      // a ripe crop sways a little
      if (e.crop && want?.endsWith('2')) e.crop.yaw = Math.sin(g.clock * 1.6 + e.i) * 0.12
    }
  }

  taps(test: (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias?: number) => void) {
    const g = this.g
    if (g.save.here !== 'home') return
    for (const e of this.actors) test(e.x, e.y, 4, 4, e.z, e.crop ? 5 : 1, () => g.walkTo({ x: e.x, y: e.y }, 7, () => this.use(e.p)), 2)
    const b = this.bin
    if (b) test(b.x, b.y, 4.5, 4.5, b.z, 8, () => g.walkTo({ x: b.x, y: b.y + 7 }, 4, () => g.open({ kind: 'compost' })))
  }
  labels(put: (key: string, text: string, x: number, y: number, z: number, kind: 'float' | 'building') => void) {
    const g = this.g
    if (g.save.here !== 'home' || !this.actors.length) return
    let ripe = 0, dry = 0
    for (const e of this.actors) {
      if (e.p.seed && this.progress(e.p) >= 1) ripe++
      else if (e.p.seed && !this.isWet(e.p)) dry++
    }
    const a = this.actors[Math.min(this.actors.length - 1, 1)]
    put('farm', ripe ? $t('菜地 · {0} 块熟了', ripe) : dry ? $t('菜地 · {0} 块要浇水', dry) : $t('菜地'), a.x + 4, a.y - 4, a.z + 9, 'float')
    if (this.bin) put('compost', this.compost.ready ? $t('堆肥箱 · 肥料 {0}', this.compost.ready) : $t('堆肥箱'), this.bin.x, this.bin.y, this.bin.z + 11, 'building')
  }

  // ── what the player does
  /** water a plot and the rest of its row (whatever is tilled and dry) */
  private water(p: Plot): number {
    const spots: { x: number; y: number; z: number }[] = []
    const g = this.g
    const f = this.field
    const row = Math.floor(f.plots.indexOf(p) / COLS)
    const until = (g.clockDay + 1) * DAY_SECONDS
    let n = 0
    f.plots.forEach((q, i) => {
      if (Math.floor(i / COLS) !== row || q.s !== 1 || this.isWet(q)) return
      q.wetUntil = until
      if (q.wetDay !== g.clockDay) { q.wetDay = g.clockDay; q.care++ }
      n++
      const e = this.actors.find((x) => x.p === q)
      if (e) { this.show(e); spots.push({ x: e.x, y: e.y, z: e.z }) }
    })
    // nearest first: the can works along the row away from the pilot
    const me = g.pilot
    spots.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))
    g.acts.water(spots)
    return n
  }
  /** a plot tapped: whatever it needs next — clear it, pick it, plant it, water it, feed it; or say how it is doing */
  use(p: Plot) {
    const g = this.g
    const e = this.actors.find((x) => x.p === p)
    if (!e) return
    g.face(Math.atan2(e.x - g.pilot.x, -(e.y - g.pilot.y)), 1)
    const say = (t: string) => g.float(t, e.x, e.y, e.z + 10)
    // waste ground: cleared by hand (the weeds are fibre, good for rope or the compost)
    if (p.s === 0) {
      if (!g.body.work('shovel')) return
      const got: Bag = { fiber: 1 }
      p.s = 1
      g.receive(got)
      g.sfx('dig')
      g.scene.burst({ kind: 'dust', x: e.x, y: e.y, z: e.z + 1, n: 10, speed: 12, up: 12, life: 0.6, mode: 'smoke', r: 3 })
      g.scene.burst({ kind: 'leaf', x: e.x, y: e.y, z: e.z + 2, n: 6, speed: 10, up: 14, life: 0.6, r: 2 })
      this.show(e)
      say($t('开垦好了：可以播种'))
      g.skills.gain('farm', 1)
      return g.changed()
    }
    if (p.seed) {
      const c = cropOf(p.seed)!
      if (this.progress(p) >= 1) {
        // ripe: up it comes. Fertiliser and rich earth each add one; practice now and then another
        const n = c.yield + (p.fert ? 1 : 0) + (soilRank(p) === 2 ? 1 : 0) + (g.rnd() < g.skills.extra('farm') ? 1 : 0)
        const got: Bag = { [c.crop]: n }
        if (g.skills.has('farm', 0) || g.rnd() < 0.35) got[c.seed] = 1
        if (!g.fits(got)) return g.full($t('收的菜装不下'))
        const was = soilName(p)
        p.seed = undefined
        p.grown = undefined
        p.fert = false
        p.care++
        g.receive(got)
        give(g.save.stats.gathered, got)
        g.save.stats.harvested = (g.save.stats.harvested ?? 0) + 1
        g.skills.gain('farm', 4)
        g.sfx('pick')
        g.sfx('pop', 1.2)
        g.scene.burst({ kind: 'dust', x: e.x, y: e.y, z: e.z + 1, n: 10, speed: 12, up: 18, life: 0.6, r: 3 })
        g.scene.burst({ kind: 'leaf', x: e.x, y: e.y, z: e.z + 3, n: 8, speed: 12, up: 20, life: 0.7, r: 3 })
        g.drop(got, e.x, e.y, e.z + 4)
        say(`+${n} ${ITEMS[c.crop].name}${soilName(p) !== was ? $t(' · 这块地成了{0}', soilName(p)) : ''}`)
        this.show(e)
        if (g.milestone('harvest', $t('第一次收获！'), $t('{0}×{1}：宠物爱吃，别的岛也收', ITEMS[c.crop].name, n), c.crop)) { /* the first */ }
        return g.changed()
      }
      if (!this.isWet(p)) {
        if (!g.count('wateringCan')) return g.warn($t('要一把水壶（仓库里有一把；工作台也能做）'))
        if (!g.body.work('hand')) return
        const was = soilName(p)
        const n = this.water(p)
        say(n > 1 ? $t('浇了这一排 {0} 块', n) : $t('浇过水了'))
        if (soilName(p) !== was) g.float($t('这块地成了{0}', soilName(p)), e.x, e.y, e.z + 16)
        return g.changed()
      }
      if (!p.fert && g.count('fertilizer') > 0) {
        g.spend({ fertilizer: 1 })
        p.fert = true
        p.care += 2
        g.acts.feed({ x: e.x, y: e.y, z: e.z })
        this.show(e)
        say($t('施了肥：长得更快，多收一个'))
        return g.changed()
      }
      g.sfx('tap')
      const left = Math.max(0, this.need(p) - (p.grown ?? 0))
      return say(`${ITEMS[c.crop].name} ${Math.round(this.progress(p) * 100)}% · ${soilName(p)}${p.fert ? $t(' · 施过肥') : ''} · ${left > DAY_SECONDS * 0.6 ? $t('明天还要浇') : $t('今天能熟')}`)
    }
    // empty and tilled: a seed from the hand, or the first one carried
    const held = g.heldItem()
    const seed = held && cropOf(held) ? held : CROPS.map((c) => c.seed).find((s) => g.carried(s) > 0)
    if (!seed) return g.warn($t('空着的{0}。带上种子再来（别的岛卖；收菜时也会掉）', soilName(p)))
    g.spend({ [seed]: 1 })
    p.seed = seed
    p.grown = 0
    p.fert = false
    g.skills.gain('farm', 1)
    g.sfx('place', 1.3)
    g.scene.burst({ kind: 'dust', x: e.x, y: e.y, z: e.z + 1, n: 6, speed: 8, up: 8, life: 0.5, mode: 'smoke', r: 2 })
    this.show(e)
    say($t('种下{0}{1}', ITEMS[seed].name, this.isWet(p) ? '' : $t('：再点一下浇水')))
    g.changed()
  }

  // ── the compost bin
  /** put n of something in the bin */
  addCompost(item: ItemId, n: number) {
    const g = this.g
    const w = compostWorth(item)
    n = Math.min(n, g.count(item))
    if (!w || n < 1) return
    g.spend({ [item]: n })
    this.compost.pts += w * n
    g.sfx('place', 0.8)
    g.changed()
  }
  takeFertilizer() {
    const g = this.g
    const c = this.compost
    if (!c.ready) return
    const got: Bag = { fertilizer: c.ready }
    if (!g.fits(got)) return g.full($t('肥料装不下'))
    g.receive(got)
    c.ready = 0
    g.sfx('pick')
    g.changed()
  }
}
