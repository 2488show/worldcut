// What lives on an island besides the people: crabs on the sand, gulls at the waterline,
// butterflies over the flowers, fireflies at night, snails and frogs in the rain — each one
// catchable with a net and entered in the collection book. And the island's own weather: now and
// then it rains (the crops like it; the butterflies hide).

import type { Game } from './game'
import type { IslandLayout, Biome } from './world'
import { ITEMS, NODES, give, type ItemId } from './data'
import { $t } from '../i18n'

type Where = 'beach' | 'grass' | 'flowers' | 'trees' | 'shore'
type Move = 'scuttle' | 'walk' | 'flutter' | 'crawl' | 'hop' | 'hover'
export interface CritterDef {
  item: ItemId
  model: string
  where: Where
  time: 'day' | 'night' | 'any'
  rain: 'yes' | 'no' | 'any'
  biomes?: Biome[]
  /** how often it turns up, against the others that could */
  weight: number
  /** how close the pilot can come, walking, before it may take fright */
  shy: number
  move: Move
}
export const CRITTERS: CritterDef[] = [
  { item: 'hermitCrab', model: 'c_hermit', where: 'beach', time: 'any', rain: 'any', weight: 8, shy: 10, move: 'scuttle' },
  { item: 'redCrab', model: 'c_crab', where: 'beach', time: 'day', rain: 'any', weight: 6, shy: 16, move: 'scuttle' },
  { item: 'gull', model: 'c_gull', where: 'beach', time: 'day', rain: 'no', weight: 4, shy: 24, move: 'walk' },
  { item: 'whiteButterfly', model: 'c_white', where: 'flowers', time: 'day', rain: 'no', weight: 9, shy: 12, move: 'flutter' },
  { item: 'swallowtail', model: 'c_swallow', where: 'flowers', time: 'day', rain: 'no', weight: 3, shy: 14, move: 'flutter' },
  { item: 'morpho', model: 'c_morpho', where: 'trees', time: 'day', rain: 'no', biomes: ['forest', 'pine'], weight: 1, shy: 16, move: 'flutter' },
  { item: 'ladybug', model: 'c_ladybug', where: 'grass', time: 'day', rain: 'no', weight: 6, shy: 6, move: 'crawl' },
  { item: 'dragonfly', model: 'c_dragonfly', where: 'shore', time: 'day', rain: 'no', weight: 4, shy: 14, move: 'flutter' },
  { item: 'firefly', model: 'c_firefly', where: 'grass', time: 'night', rain: 'no', weight: 8, shy: 8, move: 'hover' },
  { item: 'moonMoth', model: 'c_moth', where: 'trees', time: 'night', rain: 'no', weight: 1, shy: 12, move: 'flutter' },
  { item: 'snail', model: 'c_snail', where: 'grass', time: 'any', rain: 'yes', weight: 6, shy: 0, move: 'crawl' },
  { item: 'frog', model: 'c_frog', where: 'shore', time: 'any', rain: 'yes', weight: 5, shy: 12, move: 'hop' },
]
type Actor = Game['pilot']
export const CRITTER_ITEMS = CRITTERS.map((c) => c.item)

interface Critter {
  def: CritterDef
  a: Actor
  home: { x: number; y: number }
  t: number
  /** fleeing: seconds since it took fright (it is gone after a while) */
  flee: number
  dir: number
  ground: number
}
const MAX = 7
const NEAR = 150

const WINTER_GONE = new Set<ItemId>(['whiteButterfly', 'swallowtail', 'morpho', 'ladybug', 'dragonfly', 'firefly', 'moonMoth'])

export class Life {
  critters: Critter[] = []
  private weatherT = 20
  private spots: Record<Where, { x: number; y: number }[]> | null = null
  private spotsFor = ''
  private spawnT = 0
  private dropT = 0
  /** the net mid-swing (seconds into it), or -1 */
  swing = -1
  constructor(private g: Game) {}

  /** the island changed (a flight, a new world): the creatures there were stay there */
  clear() {
    for (const c of this.critters) this.g.scene.removeActor(c.a)
    this.critters = []
    this.spots = null
  }

  private where(lay: IslandLayout) {
    if (this.spots && this.spotsFor === lay.def.id + ':' + lay.def.r) return this.spots
    const g = this.g
    const w = g.world
    const out: Record<Where, { x: number; y: number }[]> = { beach: [], grass: [], flowers: [], trees: [], shore: [] }
    const cx = lay.def.x
    const cy = lay.def.y
    let seed = lay.def.seed * 7 + 3
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * lay.def.r * 1.05
      const x = Math.round(cx + Math.cos(a) * r)
      const y = Math.round(cy + Math.sin(a) * r)
      if (w.isWater(x, y) || w.solidAt(x, y) || this.g.house.covers(x, y, 8)) continue
      const h = w.heightAt(x, y)
      let wet = false
      for (const [ox, oy] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) if (w.isWater(x + ox, y + oy)) wet = true
      if (wet && h <= 5) (out.beach.length < 60 ? out.beach : out.shore).push({ x, y })
      else if (wet) out.shore.push({ x, y })
      else if (out.grass.length < 80) out.grass.push({ x, y })
    }
    for (const n of lay.nodes) {
      const d = NODES[n.kind]
      if (n.kind === 'flower' || n.kind === 'bushBerry' || n.kind === 'flax') out.flowers.push({ x: n.x + 4, y: n.y + 3 })
      else if (d.tall) out.trees.push({ x: n.x, y: n.y + n.hh + 3 })
    }
    if (!out.shore.length) out.shore = out.beach.slice()
    if (!out.flowers.length) out.flowers = out.grass.slice(0, 20)
    this.spots = out
    this.spotsFor = lay.def.id + ':' + lay.def.r
    return out
  }

  /** a creature that could turn up here, now */
  private pick(lay: IslandLayout): CritterDef | null {
    const g = this.g
    const ph = g.dayPhase()
    const night = ph === 'night'
    const ok = CRITTERS.filter((c) =>
      (c.time === 'any' || (c.time === 'night') === night) &&
      (c.rain === 'any' || (c.rain === 'yes') === this.raining) &&
      (!c.biomes || c.biomes.includes(lay.def.biome)) &&
      // winter: the butterflies, dragonflies, ladybirds and fireflies are gone till spring
      !(g.season.id === 'winter' && WINTER_GONE.has(c.item)))
    let sum = 0
    for (const c of ok) sum += c.weight
    let r = g.rnd() * sum
    for (const c of ok) if ((r -= c.weight) <= 0) return c
    return ok[0] ?? null
  }

  step(dt: number) {
    const g = this.g
    this.stepWeather(dt)
    const on = g.mode === 'island' && g.onSurface && !g.mine.active && !g.dive.active
    if (!on) return
    const lay = g.here
    const p = g.pilot
    const spots = this.where(lay)
    // come and go: a few near the pilot at any time
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = 1.2
      for (const c of this.critters) {
        if (Math.hypot(c.a.x - p.x, c.a.y - p.y) > NEAR * 1.4) c.flee = 99
      }
      if (this.critters.length < MAX) {
        const def = this.pick(lay)
        const list = def ? spots[def.where] : []
        const near = list.filter((s) => { const d = Math.hypot(s.x - p.x, s.y - p.y); return d > 30 && d < NEAR })
        if (def && near.length) {
          const s = near[Math.floor(g.rnd() * near.length)]
          const ground = g.world.heightAt(s.x, s.y)
          const air = def.move === 'flutter' || def.move === 'hover'
          const a = g.scene.addActor(def.model, { x: s.x, y: s.y, z: ground + (air ? 6 : 0), yaw: g.rnd() * 6.28, shadow: false, reach: 400 })
          a.stretch = 0.2
          g.settling.push(a)
          this.critters.push({ def, a, home: { ...s }, t: g.rnd() * 10, flee: -1, dir: g.rnd() * 6.28, ground })
        }
      }
    }
    // each one going about its business
    const moving = g.walking
    for (const c of this.critters) this.move(c, dt, moving)
    const gone = this.critters.filter((c) => c.flee > 3)
    for (const c of gone) g.scene.removeActor(c.a)
    if (gone.length) this.critters = this.critters.filter((c) => c.flee <= 3)
    if (this.swing >= 0) {
      this.swing += dt
      if (this.swing > 0.45) this.swing = -1
    }
  }

  private move(c: Critter, dt: number, pilotMoving: boolean) {
    const g = this.g
    const a = c.a
    const p = g.pilot
    c.t += dt
    const d = Math.hypot(a.x - p.x, a.y - p.y)
    // the pilot coming on at a walk may frighten it; standing still never does
    if (c.flee < 0 && c.def.shy > 0 && d < c.def.shy && pilotMoving && g.rnd() < dt * 0.9) {
      c.flee = 0
      c.dir = Math.atan2(a.x - p.x, -(a.y - p.y))
      if (c.def.move === 'walk') g.sfx('flap', 1.1)
    }
    const fx = Math.sin(c.dir)
    const fy = -Math.cos(c.dir)
    if (c.flee >= 0) {
      c.flee += dt
      const air = c.def.move === 'flutter' || c.def.move === 'hover' || c.def.move === 'walk' || c.def.item === 'ladybug'
      const sp = air ? 34 : 26
      a.x += fx * sp * dt
      a.y += fy * sp * dt
      a.yaw = c.dir
      if (air) a.z += 16 * dt
      else {
        // into the sand: sinks and is gone
        a.stretch = Math.max(0.05, 1 - c.flee * 0.6)
        if (c.flee > 1.2 && c.flee < 1.3) g.scene.burst({ kind: 'dust', x: a.x, y: a.y, z: c.ground + 0.5, n: 6, speed: 8, up: 6, life: 0.5, mode: 'smoke', r: 2 })
      }
      a.fade = Math.max(0, 1 - Math.max(0, c.flee - 2))
      return
    }
    switch (c.def.move) {
      case 'scuttle': {
        // sideways, in little bursts
        const go = Math.sin(c.t * 1.3) > 0.6
        if (go) {
          a.x += Math.cos(a.yaw) * Math.sin(c.t * 9) * 6 * dt
          a.y += Math.sin(a.yaw) * Math.sin(c.t * 9) * 6 * dt
        }
        break
      }
      case 'walk': {
        // a few steps, a look round, a peck
        if (Math.sin(c.t * 0.7) > 0.3) {
          a.x += Math.sin(a.yaw) * 4 * dt
          a.y -= Math.cos(a.yaw) * 4 * dt
        } else if (g.rnd() < dt * 0.6) a.yaw += (g.rnd() - 0.5) * 2
        a.pitch = Math.sin(c.t * 5) > 0.92 ? 0.5 : 0
        break
      }
      case 'flutter': {
        const r = 7
        a.x = c.home.x + Math.sin(c.t * 0.9) * r + Math.sin(c.t * 2.3) * 2
        a.y = c.home.y + Math.cos(c.t * 0.7) * r * 0.7
        a.z = c.ground + 5 + Math.abs(Math.sin(c.t * 7)) * 2.5 + Math.sin(c.t * 0.8) * 1.5
        a.yaw = c.t * 0.9 + Math.PI / 2
        a.roll = Math.sin(c.t * 22) * 0.8 // the wings beat
        break
      }
      case 'hover': {
        a.x = c.home.x + Math.sin(c.t * 0.4) * 9
        a.y = c.home.y + Math.cos(c.t * 0.33) * 6
        a.z = c.ground + 4 + Math.sin(c.t * 1.1) * 2
        break
      }
      case 'crawl': {
        a.x += Math.sin(a.yaw) * 1.4 * dt
        a.y -= Math.cos(a.yaw) * 1.4 * dt
        if (g.rnd() < dt * 0.3) a.yaw += (g.rnd() - 0.5) * 1.5
        break
      }
      case 'hop': {
        const ph = (c.t * 0.8) % 1
        if (ph < 0.25) {
          a.x += Math.sin(a.yaw) * 14 * dt
          a.y -= Math.cos(a.yaw) * 14 * dt
          a.z = c.ground + Math.sin((ph / 0.25) * Math.PI) * 3
        } else {
          a.z = c.ground
          if (g.rnd() < dt * 0.5) a.yaw += (g.rnd() - 0.5) * 2.5
        }
        break
      }
    }
    // stays near where it lives
    if (Math.hypot(a.x - c.home.x, a.y - c.home.y) > 16) a.yaw = Math.atan2(c.home.x - a.x, -(c.home.y - a.y))
    if (c.def.move === 'scuttle' || c.def.move === 'walk' || c.def.move === 'crawl') {
      const h = g.world.heightAt(Math.round(a.x), Math.round(a.y))
      if (g.world.isWater(Math.round(a.x), Math.round(a.y))) a.yaw += Math.PI
      a.z = h
    }
  }

  /** things to tap: each creature */
  taps(test: (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias?: number) => void) {
    for (const c of this.critters) {
      if (c.flee >= 0) continue
      test(c.a.x, c.a.y, 3, 3, c.a.z - 1, 4, () => this.go(c), -10)
    }
  }
  /** walk up to it and swing the net */
  private go(c: Critter) {
    const g = this.g
    if (!g.carried('net')) {
      if (g.count('net')) return g.warn($t('捕虫网放在仓库里了：去仓库拿出来'))
      return g.warn(g.level >= 2 ? $t('要用捕虫网才能捉{0}：在工作台做一个', ITEMS[c.def.item].name) : $t('想捉{0}？岛升到 2 级就能做捕虫网', ITEMS[c.def.item].name))
    }
    if (!g.fits({ [c.def.item]: 1 })) return g.full($t('捉到了也装不下'))
    g.walkTo({ x: c.a.x, y: c.a.y }, 8, () => this.swingAt(c))
  }
  private swingAt(c: Critter) {
    const g = this.g
    const a = c.a
    const p = g.pilot
    g.face(Math.atan2(a.x - p.x, -(a.y - p.y)), 1)
    if (!g.body.work('net')) return
    this.swing = 0
    g.sfx('whoosh', 1.6)
    g.useTool('net')
    g.after(0.22, () => {
      const d = Math.hypot(a.x - p.x, a.y - p.y)
      if (c.flee >= 0 || d > 13 || !this.critters.includes(c)) {
        g.sfx('error')
        return g.float($t('跑了……'), p.x, p.y, p.z + 14)
      }
      // caught
      g.scene.removeActor(a)
      this.critters = this.critters.filter((x) => x !== c)
      const item = c.def.item
      const first = !g.save.seen?.[item]
      g.receive({ [item]: 1 })
      give(g.save.stats.gathered, { [item]: 1 })
      g.save.stats.caught = (g.save.stats.caught ?? 0) + 1
      g.drop({ [item]: 1 }, a.x, a.y, a.z + 2)
      g.scene.burst({ kind: 'star', x: a.x, y: a.y, z: a.z + 3, n: 10, speed: 14, up: 16, life: 0.6, mode: 'float', grav: 0 })
      const it = ITEMS[item]
      if (it.rarity >= 2) {
        g.sfx('rare')
        if (!g.milestone('critter:' + item, $t('捉到了{0}！', it.name), it.desc, item)) g.celebrate(1, $t('捉到了{0}！', it.name), it.desc, item)
      } else if (first) g.celebrate(1, $t('新的：{0}', it.name), it.desc, item)
      else {
        g.sfx('done')
        g.float($t('捉到 {0}', it.name), a.x, a.y, a.z + 8)
      }
      g.changed()
    })
  }

  // ── the weather on the islands (the Weather decides it; here, only the splashes it makes)
  private stepWeather(dt: number) {
    const g = this.g
    const out = g.mode === 'island' && g.onSurface
    if (!out || !this.raining) return
    this.dropT -= dt
    if (this.dropT <= 0) {
      this.dropT = 0.08
      const p = g.pilot
      g.scene.burst({ kind: 'water', x: p.x, y: p.y, z: p.z + 1, n: 2, speed: 4, up: 8, life: 0.25, r: 60 })
    }
  }
  /** to set the rain going (or stop it) by hand: tests, and the developer menu */
  setRain(on: boolean, secs = 90) {
    this.g.weather.force(on ? 'rain' : 'clear', on ? secs : 0)
  }
  get raining(): boolean {
    return this.g.weather.raining
  }
}
