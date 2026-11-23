// Fishing, two ways (after Dave the Diver).
//
// From the shore, with a rod: tap the water to cast. Dark shapes swim along the coast — cast near
// one and it comes for the float. When the float goes under, strike; then it is a fight: hold to
// wind in, let go when the fish surges, or the line snaps. Slack off too long and it gets away.
//
// Under water, from any pier: the sea bed, built (like the mine) into an empty stretch of sea.
// The air lasts under a minute and goes faster the deeper the diver is. Fish are shot with the
// harpoon gun — the good ones live deep, are wary, and take more than one shot; urchins, shells
// and the odd pearl are picked up by hand; jellyfish cost air. Come up in time and the catch is
// kept; run out and half of it is lost on the way up. Nothing worse than that ever happens.

import { blank } from '../engine/stamps'
import { MAT } from '../engine/materials'
import { sizeOf } from './fishbook'
import { DIVE, DIVE_FISH, DIVE_FLOOR, ITEMS, ROD_FISH, SEA_FISH, give, type Bag, type DiveFishDef, type FishDef, type ItemId } from './data'
import { mulberry32, type Biome, type IslandLayout, type Point } from './world'
import type { Game } from './game'
import { $t } from '../i18n'

type Actor = Game['pilot']

/** each kind of island has its own waters: how much more (or less) of each fish there is */
const WATERS: Record<Biome, Partial<Record<ItemId, number>>> = {
  forest: {},
  rock: { mackerel: 1.7, grouper: 1.8, lobster: 1.8, tuna: 1.3 },
  atoll: { bream: 1.5, reefFish: 1.5, moonfish: 2.2, pearl: 2.4, octopus: 1.6, sardine: 0.7 },
  pine: { mackerel: 1.5, sardine: 1.3, urchin: 1.5 },
  dune: { tuna: 2.4, octopus: 1.5, sardine: 0.6 },
}
function weighted<T extends { weight: number; item: ItemId }>(list: T[], biome: Biome, rich: number, rnd: () => number, extra: (d: T) => number = () => 1): T {
  const w = list.map((d) => d.weight * (WATERS[biome][d.item] ?? 1) * (ITEMS[d.item].rarity >= 1 ? rich : 1) * extra(d))
  let r = rnd() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < list.length; i++) {
    r -= w[i]
    if (r <= 0) return list[i]
  }
  return list[0]
}

// ───────────────────────────────────────────────────────────── the rod
interface Shadow { a: Actor; def: FishDef; home: Point; goal: Point | null; t: number; hidden: number; lured: boolean }

/** how many fish the creel holds */
export const CREEL = 20

export class Angling {
  phase: 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'land' = 'idle'
  /** how long the line has been out with nothing on it */
  get waited(): number { return this.phase === 'wait' ? this.t : 0 }
  /** this cast was made from the boat, at anchor out at sea */
  atSea = false
  /** who holds the rod: the pilot on foot, or the boat at sea */
  private get o(): Actor {
    const g = this.g
    return g.mode === 'flight' && g.scene.lead ? (g.scene.lead as Actor) : g.pilot
  }
  /** a long way from every island: the deep water, where the big ones are */
  farOut(x: number, y: number): boolean {
    const g = this.g
    for (const lay of Object.values(g.layouts)) if (Math.hypot(g.world.delta(x, lay.def.x), g.world.delta(y, lay.def.y)) < lay.def.r + 330) return false
    return true
  }
  private room(): boolean {
    const g = this.g
    return g.carried('creel') > 0 ? (g.save.creel ?? []).length < CREEL : g.fits({ sardine: 1 })
  }
  /** from the boat, at anchor: over the side, ahead and to starboard */
  castAtSea() {
    const g = this.g
    const b = g.scene.lead as Actor | null
    if (!b || this.phase !== 'idle') return
    if (!g.carried('rod')) return g.warn(g.count('rod') ? $t('钓竿放在仓库里了') : $t('要有钓竿才能钓鱼'))
    if (!this.room()) return g.full(g.carried('creel') ? $t('鱼筐满了') : $t('钓上来也装不下'))
    const a = b.yaw + 0.9
    const to = { x: b.x + Math.sin(a) * 44, y: b.y - Math.cos(a) * 44 }
    if (!g.world.isWater(Math.round(to.x), Math.round(to.y))) return g.warn($t('那边是岸：把船开远一点'))
    if (!g.body.work('cast')) return
    this.atSea = true
    this.from = { x: b.x, y: b.y }
    this.to = to
    this.bob = g.scene.addActor('bobber', { x: b.x, y: b.y, z: b.z + 8, yaw: 0, shadow: false })
    this.phase = 'cast'
    this.t = 0
    this.progress = 0
    this.tension = 0
    this.holding = false
    g.sfx('swing')
    g.useTool('rod')
    g.changed()
  }
  progress = 0
  tension = 0
  private bob: Actor | null = null
  /** where the line ends: the float, or the fish coming out of the water on it */
  get lineEnd(): { x: number; y: number; z: number } | null {
    return this.flying ?? this.bob
  }
  private from: Point = { x: 0, y: 0 }
  private to: Point = { x: 0, y: 0 }
  private t = 0
  private wait = 0
  private nibbles: number[] = []
  private fish: FishDef | null = null
  private lure: Shadow | null = null
  private surge = 0
  private surgeIn = 1
  private holding = false
  private tick = 0
  private slack = 0
  private shadows: Shadow[] = []
  private flying: Actor | null = null

  constructor(private g: Game) {}
  get active() {
    return this.phase !== 'idle'
  }
  get surging() {
    return this.surge > 0
  }
  /** how big the thing on the line feels (its name is only known once it is landed) */
  get feel(): string {
    return !this.fish ? '' : this.fish.size === 3 ? $t('好大的家伙！') : this.fish.size === 2 ? $t('不小') : $t('小鱼')
  }

  /** dark shapes along the coast of the island the pilot is on */
  populate(lay: IslandLayout) {
    const g = this.g
    for (const s of this.shadows) g.scene.removeActor(s.a)
    this.shadows = []
    const rnd = mulberry32(lay.def.seed * 17 + Math.floor(g.now() / 300))
    const n = Math.round(4 * lay.def.rich.fish)
    for (let i = 0; i < n * 6 && this.shadows.length < n; i++) {
      // out from the island until the water is a little way off the beach
      const ang = rnd() * 6.283
      let d = 30
      while (d < lay.def.r * 1.7 && !g.world.isWater(Math.round(lay.def.x + Math.cos(ang) * d), Math.round(lay.def.y + Math.sin(ang) * d))) d += 4
      d += 14 + rnd() * 18
      const home = { x: lay.def.x + Math.cos(ang) * d, y: lay.def.y + Math.sin(ang) * d }
      if (!g.world.isWater(Math.round(home.x), Math.round(home.y))) continue
      const def = weighted(ROD_FISH, lay.def.biome, lay.def.rich.fish, rnd)
      const a = g.scene.addActor('fishShadow' + def.size, { x: home.x, y: home.y, z: 0.4, yaw: rnd() * 6.283, shadow: false, fade: 0.55, reach: 500 })
      this.shadows.push({ a, def, home, goal: null, t: rnd() * 3, hidden: 0, lured: false })
    }
  }

  /** a tap on the water: walk to the nearest bit of shore and cast towards it */
  cast(x: number, y: number) {
    const g = this.g
    if (!g.carried('rod')) return g.warn(g.count('rod') ? $t('钓竿放在仓库里了：去仓库拿出来') : $t('要有钓竿才能钓鱼：在工作台用树枝和绳索做一根'))
    if (!this.room()) return g.full(g.carried('creel') ? $t('鱼筐满了：回去把鱼收好') : $t('钓上来也装不下'))
    g.walkTo({ x, y }, 1, () => this.throw(x, y), true)
  }
  private throw(x: number, y: number) {
    const g = this.g
    const p = this.o
    let dx = x - p.x
    let dy = y - p.y
    const d = Math.hypot(dx, dy) || 1
    const reach = Math.min(d, 66)
    dx = (dx / d) * reach
    dy = (dy / d) * reach
    if (reach < 12 || !g.world.isWater(Math.round(p.x + dx), Math.round(p.y + dy))) return g.warn($t('甩不到水里：走到岸边或码头上，再点水面'))
    if (!g.body.work('cast')) return
    g.face(Math.atan2(dx, -dy), 1)
    this.atSea = false
    this.from = { x: p.x, y: p.y }
    this.to = { x: p.x + dx, y: p.y + dy }
    this.bob = g.scene.addActor('bobber', { x: p.x, y: p.y, z: p.z + 8, yaw: 0, shadow: false })
    this.phase = 'cast'
    this.t = 0
    this.progress = 0
    this.tension = 0
    this.holding = false
    this.o.stretch = 1.2
    g.sfx('swing')
    g.useTool('rod')
    g.changed()
  }
  /** the player presses (or lets go): strike when it bites, wind in during the fight */
  hold(on: boolean) {
    const g = this.g
    if (this.phase === 'bite' && on) {
      this.phase = 'reel'
      this.t = 0
      this.progress = 0.12
      this.tension = 0.25
      this.surge = 0
      this.surgeIn = 0.8
      this.slack = 0
      this.holding = true
      g.sfx('pick', 1.3)
      g.scene.shake(1.4)
      g.toast($t('上钩了！{0} 按住收线，鱼一冲就松手', this.feel))
      g.changed()
      return
    }
    if (this.phase === 'wait' && on) {
      g.toast($t('收竿了'))
      return this.end()
    }
    if (this.phase === 'reel') this.holding = on
  }
  cancel() {
    if (this.phase === 'reel' || this.phase === 'land') return
    if (this.phase !== 'idle') this.end()
  }
  private end() {
    const g = this.g
    if (this.bob) g.scene.removeActor(this.bob)
    this.bob = null
    if (this.lure) {
      this.lure.lured = false
      this.lure.goal = null
    }
    this.lure = null
    this.fish = null
    this.phase = 'idle'
    this.o.stretch = 1
    g.changed()
  }

  step(dt: number) {
    const g = this.g
    this.stepShadows(dt)
    if (this.phase === 'land') {
      // out of the water in an arc and into the pilot's hands
      this.t += dt
      const f = this.flying!
      const u = Math.min(1, this.t / 0.55)
      f.x = this.to.x + (this.o.x - this.to.x) * u
      f.y = this.to.y + (this.o.y - this.to.y) * u
      f.z = 1 + Math.sin(u * Math.PI) * 22 + this.o.z * u
      f.roll = u * 7
      if (u >= 1) this.landed()
      return
    }
    const b = this.bob
    if (this.phase === 'idle' || !b) return
    const lay = g.here
    this.t += dt
    if (this.phase === 'cast') {
      const u = Math.min(1, this.t / 0.5)
      b.x = this.from.x + (this.to.x - this.from.x) * u
      b.y = this.from.y + (this.to.y - this.from.y) * u
      b.z = this.o.z + 8 * (1 - u) + Math.sin(u * Math.PI) * 16 + 0.6 * u
      if (u < 1) return
      b.z = 0.6
      g.sfx('plop')
      g.scene.burst({ kind: 'water', x: b.x, y: b.y, z: 1, n: 10, speed: 14, up: 22, life: 0.5, r: 1 })
      this.phase = 'wait'
      this.t = 0
      // a shape nearby comes for it; otherwise whatever happens to be passing
      if (this.atSea) {
        // open water: its own fish; far from any island, more of the big ones
        const far = this.farOut(b.x, b.y)
        const w = SEA_FISH.map((d) => d.weight * (far ? d.far : 1) * (d.item === 'moonfish' && g.dayPhase() !== 'night' ? 0.2 : 1) * g.tackle.like(d.item))
        let r = g.rnd() * w.reduce((x, y) => x + y, 0)
        this.fish = SEA_FISH[SEA_FISH.length - 1]
        for (let i = 0; i < SEA_FISH.length; i++) if ((r -= w[i]) <= 0) { this.fish = SEA_FISH[i]; break }
        this.lure = null
        this.wait = (2.5 + g.rnd() * 4) * g.tackle.quick
        this.nibbles = [0.5 + g.rnd() * 0.8, 1.6 + g.rnd()]
        return
      }
      const near = this.shadows.filter((s) => !s.hidden && Math.hypot(s.a.x - b.x, s.a.y - b.y) < 34).sort((p, q) => Math.hypot(p.a.x - b.x, p.a.y - b.y) - Math.hypot(q.a.x - b.x, q.a.y - b.y))[0]
      if (near) {
        this.lure = near
        near.lured = true
        near.goal = { x: b.x, y: b.y }
        this.fish = near.def
        this.wait = 99 // it bites when it gets there
      } else {
        const deep = g.world.matAt(Math.round(b.x), Math.round(b.y)) < 2
        // what is on the hook changes who comes (and how soon)
        this.fish = weighted(ROD_FISH, lay.def.biome, lay.def.rich.fish, g.rnd, (d) => (d.size === 3 ? (deep ? 1.6 : 0.5) : 1) * (d.item === 'moonfish' ? (g.dayPhase() === 'night' ? 6 : g.skills.has('fish', 1) ? 2.5 : 1) : 1) * g.tackle.like(d.item))
        this.wait = (2 + g.rnd() * 4.5) * g.tackle.quick
      }
      this.nibbles = [0.5 + g.rnd() * 0.8, 1.6 + g.rnd()]
      return
    }
    if (this.phase === 'wait') {
      b.z = 0.6 + Math.sin(this.t * 3) * 0.25
      b.stretch = 1 + ((b.stretch || 1) - 1) * Math.exp(-dt * 8)
      if (this.nibbles.length && this.t > this.nibbles[0] && this.t < this.wait - 0.5) {
        // a nibble: the float dips, but it is not time yet
        this.nibbles.shift()
        b.stretch = 0.5
        g.sfx('bubble', 1.2)
        g.scene.burst({ kind: 'water', x: b.x, y: b.y, z: 1, n: 3, speed: 6, up: 8, life: 0.4, r: 1 })
      }
      if (this.lure && Math.hypot(this.lure.a.x - b.x, this.lure.a.y - b.y) < 5 && this.wait > 90) this.wait = this.t + 0.35
      if (this.t >= this.wait) {
        this.phase = 'bite'
        g.tackle.taken() // the fish has the bait
        this.t = 0
        b.z = -1.2
        g.sfx('bite')
        g.scene.shake(1.2)
        g.scene.burst({ kind: 'water', x: b.x, y: b.y, z: 1, n: 16, speed: 22, up: 30, life: 0.6, r: 2 })
        g.float($t('！'), this.o.x, this.o.y, this.o.z + 16)
        g.changed()
      }
      return
    }
    if (this.phase === 'bite') {
      if (this.t > 1.2) {
        g.sfx('plop', 0.7)
        g.warn($t('鱼跑了——浮标一沉就要点一下提竿'))
        this.hideLure()
        this.end()
      }
      return
    }
    if (this.phase === 'reel') return this.fight(dt)
  }
  private fight(dt: number) {
    const g = this.g
    const f = this.fish!
    const b = this.bob!
    // the fish's surges
    if (this.surge > 0) this.surge -= dt
    else {
      this.surgeIn -= dt
      if (this.surgeIn <= 0) {
        this.surgeIn = 0.8 + g.rnd() * 1.5
        if (g.rnd() < 0.35 + f.dart * 0.6) {
          this.surge = 0.5 + g.rnd() * 0.7
          g.sfx('splash', 1.3, 0.6)
          g.scene.shake(1 + f.pull)
        }
      }
    }
    const pull = f.pull * (this.surge > 0 ? 2.3 : 1)
    if (this.holding) {
      this.progress += (0.34 - 0.13 * f.pull) * (this.surge > 0 ? 0.3 : 1) * dt
      this.tension += (0.3 + 0.55 * pull) * (1 - 0.03 * g.skills.level('fish')) * dt
      this.slack = 0
    } else {
      this.progress -= (0.04 + 0.1 * pull) * dt
      this.tension -= 0.8 * dt
      this.slack += dt
    }
    this.tension = Math.max(0, this.tension)
    // where the fish is: nearer as it is wound in, thrashing sideways when it surges
    const u = Math.max(0, Math.min(1, this.progress))
    const dx = this.to.x - this.from.x
    const dy = this.to.y - this.from.y
    const len = Math.hypot(dx, dy) || 1
    const side = this.surge > 0 ? Math.sin(this.t * 22) * 5 : Math.sin(this.t * 5) * 1.5
    b.x = this.from.x + dx * (1 - u * 0.72) + (-dy / len) * side
    b.y = this.from.y + dy * (1 - u * 0.72) + (dx / len) * side
    b.z = this.surge > 0 ? -0.8 : 0.3
    this.o.stretch = 1 - 0.12 * this.tension
    this.tick -= dt
    if (this.tick <= 0) {
      this.tick = this.holding ? 0.09 : 0.3
      if (this.holding) g.sfx('reel', 0.8 + this.tension * 0.7)
      if (this.tension > 0.72) g.sfx('strain', 1 + (this.tension - 0.72) * 2)
      g.scene.burst({ kind: 'water', x: b.x, y: b.y, z: 1, n: this.surge > 0 ? 5 : 1, speed: this.surge > 0 ? 18 : 6, up: 16, life: 0.4, r: 2 })
    }
    if (this.tension >= 1) {
      g.sfx('snap')
      g.scene.shake(3)
      g.warn($t('线绷断了！鱼冲的时候要松手'))
      this.hideLure()
      return this.end()
    }
    if (this.progress <= -0.1 || this.slack > 3.2) {
      g.sfx('plop', 0.7)
      g.warn($t('脱钩了——线松得太久'))
      this.hideLure()
      return this.end()
    }
    if (this.progress >= 1) {
      this.phase = 'land'
      this.t = 0
      this.to = { x: b.x, y: b.y }
      g.scene.removeActor(b)
      this.bob = null
      this.flying = g.scene.addActor(f.size === 3 ? 'fishXL' : f.size === 2 ? 'fishM' : 'fishS', { x: this.to.x, y: this.to.y, z: 1, yaw: 0, shadow: false })
      g.sfx('splash')
      g.scene.burst({ kind: 'water', x: this.to.x, y: this.to.y, z: 1, n: 24, speed: 26, up: 40, life: 0.7, r: 3 })
      g.hitStop = 0.08
      g.changed()
    }
  }
  private hideLure() {
    if (this.lure) this.lure.hidden = 14
  }
  private landed() {
    const g = this.g
    const f = this.fish!
    const item = f.item
    if (this.flying) g.scene.removeActor(this.flying)
    this.flying = null
    this.bob = null
    if (this.lure) this.lure.hidden = 30
    const cm = sizeOf(item, Math.random, this.atSea && this.farOut(this.to.x, this.to.y) ? 0.08 : 0)
    // into the creel, if one is carried (it does not take up the bag)
    const inCreel = g.carried('creel') > 0 && (g.save.creel ?? []).length < CREEL
    if (inCreel) { (g.save.creel ??= []).push({ item, cm, day: g.clockDay }); g.sfx('creel') } else g.receive({ [item]: 1 })
    give(g.save.stats.gathered, { [item]: 1 })
    g.save.stats.fished = (g.save.stats.fished ?? 0) + 1
    if (this.atSea) g.save.stats.seaFished = (g.save.stats.seaFished ?? 0) + 1
    g.skills.gain('fish', 3)
    const p = this.o
    g.drop({ [item]: 1 }, p.x, p.y, p.z + 10)
    // measured, quietly, for the fish book (the fishing itself is round 10's, as the player preferred)
    const recs = (g.save.records ??= {})
    const record = !recs[item] || cm > recs[item]!.cm
    if (record) recs[item] = { cm, day: g.clockDay }
    g.float(`${ITEMS[item].name} ${cm} cm${record && g.save.stats.fished! > 1 ? $t(' · 新纪录！') : ''}`, p.x, p.y, p.z + 18)
    if (f.size === 3) g.sfx('bigfish')
    g.catchFx(item, $t('钓到了'))
    this.end()
  }
  private stepShadows(dt: number) {
    const g = this.g
    for (const s of this.shadows) {
      if (s.hidden > 0) {
        s.hidden -= dt
        s.a.visible = false
        if (s.hidden <= 0) {
          s.a.visible = true
          s.a.x = s.home.x
          s.a.y = s.home.y
          s.lured = false
          s.goal = null
        }
        continue
      }
      s.t -= dt
      if (!s.goal && s.t <= 0) {
        s.t = 2 + g.rnd() * 4
        const ang = g.rnd() * 6.283
        const q = { x: s.home.x + Math.cos(ang) * 26, y: s.home.y + Math.sin(ang) * 26 }
        if (g.world.isWater(Math.round(q.x), Math.round(q.y)) && g.world.matAt(Math.round(q.x), Math.round(q.y)) < 3) s.goal = q
      }
      if (!s.goal) continue
      const dx = s.goal.x - s.a.x
      const dy = s.goal.y - s.a.y
      const d = Math.hypot(dx, dy)
      if (d < 2) {
        if (!s.lured) s.goal = null
        continue
      }
      const v = (s.lured ? 20 : 7) * dt
      s.a.x += (dx / d) * Math.min(v, d)
      s.a.y += (dy / d) * Math.min(v, d)
      const want = Math.atan2(dx, -dy)
      s.a.yaw += Math.atan2(Math.sin(want - s.a.yaw), Math.cos(want - s.a.yaw)) * Math.min(1, dt * 5)
    }
  }
}
