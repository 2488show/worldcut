// What happens between two islands. A delivery is the high point of an order, so the trip is
// not just distance:
//
//   · weight   the fuller the hold, the slower and heavier on the controls the vehicle is
//   · wind     it shifts every half minute: a tail wind helps, a cross wind pushes the course off
//   · gulls    a flock crosses ahead: fly through it and ride its slipstream for a few seconds
//   · flotsam  a crate adrift, a little off the route: worth a detour
//   · traffic  other islanders' craft pass, and waggle their wings
//   · rain     a squall near the route: slower inside it, quicker to go round
//   · landing  line up with the runway (or the pier) before calling it: a clean approach pays a tip
//   · pirates  on routes marked ☠, once the first few deliveries are behind the player
//
// Pirates never sink anyone. They are sighted first (alarm, the music turns), then they chase:
// near the vehicle they tighten a grip, and if it closes they take part of the cargo — in plain
// sight, with half of it left adrift to be fished back out — and make off. Speed, sharp turns,
// rain, and the waters by an island all shake them. What is left is delivered and paid for.

import { craftModel } from '../engine/craft'
import { ITEMS, UPGRADES, give, type Bag, type ItemId, type UpgradeId } from './data'
import type { Game } from './game'
import type { IslandLayout, Point } from './world'
import { $t } from '../i18n'

type Actor = Game['pilot']

export type Vehicle = import('./game').OwnedVehicle
interface Flock { birds: Actor[]; x: number; y: number; dir: number; scattered: number }
interface Crate { a: Actor; bag: Bag; coins: number; t: number; recover?: { id: string; units: number; item: ItemId } }
interface Passer { a: Actor; dir: number; speed: number; who: string; hailed: boolean; boat: boolean }

export interface VoyageView {
  load: number
  heavy: string
  /** where the wind blows to, relative to the nose (0 = from behind), and what that means */
  wind: number
  windText: string
  slip: number
  /** how well lined up for landing, 0 … 100 (null when too far to matter) */
  approach: number | null
  approachText: string
  /** pirates: null, or how far off, where (relative to the nose), and how tight their grip is */
  pirate: { dist: number; bearing: number; grip: number; phase: string } | null
  rain: boolean
  fog: boolean
  /** smoke bombs on board */
  smoke: number
  danger: number
}

export const PIRATE_FREE_DELIVERIES = 3

export class Voyage {
  private load = 0
  private wind = { dir: 0, speed: 0, t: 0 }
  private flocks: Flock[] = []
  private crates: Crate[] = []
  private passers: Passer[] = []
  private squall: { x: number; y: number; r: number; fog: boolean } | null = null
  private fogT = 0
  inRain = false
  private slip = 0
  private tick = 0
  private flockIn = 6
  private rings: { x: number; y: number; z: number; hit: boolean }[] = []
  private ringScore = 0
  private pirate: { a: Actor; phase: 'sighted' | 'chase' | 'gone'; t: number; grip: number; yaw: number; shaken: number; boat: boolean } | null = null
  private pirateAt = -1
  private start: Point = { x: 0, y: 0 }
  private total = 1
  danger = 0
  /** what the last landing was judged as */
  rating: { score: number; text: string; pct: number } | null = null
  /** what pirates took on this trip */
  robbed: { text: string; units: number } | null = null
  /** what the trip did to the vehicle: storms flown through, whether something chased it */
  squalls = 0
  wasChased = false
  private cough = 0

  constructor(private g: Game) {}

  private has(v: Vehicle, u: UpgradeId) {
    return !!v.up?.includes(u)
  }

  /** a trip begins: weigh the cargo, set the wind, decide what waits on the way */
  begin(v: Vehicle, from: IslandLayout, dest: IslandLayout | null) {
    const g = this.g
    const def = g.vdef(v)
    this.clear()
    // weight: the hold's share that is full
    const units = g.deliveries.filter((d) => d.state === 'loaded').reduce((n, d) => n + d.qty - (d.lost ?? 0), 0)
    this.load = Math.min(1, units / def.cargo)
    const engine = this.has(v, 'engine') ? 1.12 : 1
    const f = def.flight
    g.flightParams = {
      ...f, kind: def.kind,
      speed: f.speed * engine * (1 - 0.16 * this.load),
      boost: 1 + (f.boost - 1) * (1 - 0.3 * this.load),
      agility: f.agility * (1 - 0.38 * this.load),
    }
    g.scene.setParams({ ...g.baseParams, ...g.flightParams })
    this.wind = { dir: g.rnd() * 6.283, speed: 3 + g.rnd() * 6, t: 22 + g.rnd() * 14 }
    this.start = { x: from.def.x, y: from.def.y }
    this.rating = null
    this.robbed = null
    this.squalls = 0
    this.wasChased = false
    this.ringScore = 0
    this.danger = dest ? Math.max(dest.def.danger, from.def.danger) : 0
    if (!dest) return
    const dx = g.world.delta(dest.def.x, from.def.x)
    const dy = g.world.delta(dest.def.y, from.def.y)
    this.total = Math.hypot(dx, dy) || 1
    const ux = dx / this.total
    const uy = dy / this.total
    const boat = def.kind === 'boat'
    const along = (t: number, side: number): Point => ({ x: from.def.x + ux * this.total * t - uy * side, y: from.def.y + uy * this.total * t + ux * side })
    const sea = (p: Point) => g.world.isWater(Math.round(p.x), Math.round(p.y)) && g.world.islandAt(Math.round(p.x), Math.round(p.y)) < 0
    // crates adrift, off to one side or the other
    for (let i = 0; i < 2; i++) {
      const p = along(0.3 + g.rnd() * 0.45, (g.rnd() < 0.5 ? -1 : 1) * (50 + g.rnd() * 90))
      if (sea(p)) this.addCrate(p, this.loot())
    }
    // a squall, sometimes right on the course
    if (g.rnd() < 0.6) {
      const p = along(0.4 + g.rnd() * 0.25, (g.rnd() - 0.5) * 160)
      // rain slows everything in it; a fog bank hides whoever is in it
      this.squall = { x: p.x, y: p.y, r: 80 + g.rnd() * 40, fog: g.rnd() < 0.4 }
    }
    // someone else out on the water or in the air
    for (let i = 0; i < 2; i++) {
      const pb = g.rnd() < 0.5
      const p = along(0.25 + g.rnd() * 0.5, (g.rnd() - 0.5) * 240)
      if (pb && !sea(p)) continue
      const owners = g.def.islands.filter((d) => !d.home && !d.wild)
      let who = owners[Math.floor(g.rnd() * owners.length)].owner
      // online: now and then it is another player, in their own paint
      const cards = g.online ? [...g.online.cards.entries()].filter(([, c]) => c.craft && (c.craft.kind === 'boat') === pb) : []
      let model = pb ? 'skiffGreen' : 'sparrowBlue'
      if (cards.length && g.rnd() < 0.7) {
        const [uid, c] = cards[Math.floor(g.rnd() * cards.length)]
        const name = `pass_${uid}`
        const m = craftModel(c.craft!.model, name, c.craft!.paint, 0, true)
        if (m) { g.scene.registerModel(m); model = name; who = c.name }
      }
      const a = g.scene.addActor(model, { x: p.x, y: p.y, z: pb ? 1 : 70 + g.rnd() * 20, yaw: 0, scale: 1.1, shadow: false, reach: 700 })
      this.passers.push({ a, dir: g.rnd() * 6.283, speed: pb ? 16 : 34, who, hailed: false, boat: pb })
    }
    // the landing: rings on the line of the runway, out over the sea
    if (!boat) {
      const back = dest.runwayStart.yaw + Math.PI
      for (const d of [150, 250]) {
        this.rings.push({ x: dest.runwayEnd.x - Math.sin(back) * d, y: dest.runwayEnd.y + Math.cos(back) * d, z: 30 + d * 0.16, hit: false })
      }
    }
    // pirates: only on a marked route, only once the player has found their feet, and not every time
    this.pirateAt = -1
    // (a sea cleared of sky pirates has none for a few days: boats still meet the sea pirates)
    const clear = !boat && g.combat.cleared(dest.def.id)
    if (!clear && this.danger > 0 && g.save.stats.delivered >= PIRATE_FREE_DELIVERIES && units > 0 && g.rnd() < 0.4 + 0.18 * this.danger) {
      // early in the trip: the open sea is where they hunt, and there is the whole way left to run
      this.pirateAt = 0.12 + g.rnd() * 0.18
    }
  }
  private loot(): { bag: Bag; coins: number } {
    const g = this.g
    const r = g.rnd()
    if (r < 0.3) return { bag: {}, coins: 12 + Math.floor(g.rnd() * 24) }
    if (r < 0.5) return { bag: { plank: 2 }, coins: 0 }
    if (r < 0.66) return { bag: { coal: 2 }, coins: 0 }
    if (r < 0.8) return { bag: { cloth: 1, rope: 1 }, coins: 0 }
    if (r < 0.93) return { bag: { copperOre: 3 }, coins: 0 }
    return { bag: { crystal: 1 }, coins: 0 }
  }
  private addCrate(p: Point, loot: { bag: Bag; coins: number }, recover?: Crate['recover']) {
    const a = this.g.scene.addActor('flotsam', { x: p.x, y: p.y, z: 0.5, yaw: this.g.rnd() * 6.283, shadow: false, reach: 520 })
    this.crates.push({ a, bag: loot.bag, coins: loot.coins, t: this.g.rnd() * 3, recover })
  }
  /** the trip is over (or was never begun): everything that was out there is taken away */
  clear() {
    const g = this.g
    for (const f of this.flocks) for (const b of f.birds) g.scene.removeActor(b)
    for (const c of this.crates) g.scene.removeActor(c.a)
    for (const p of this.passers) g.scene.removeActor(p.a)
    if (this.pirate) g.scene.removeActor(this.pirate.a)
    this.flocks = []
    this.crates = []
    this.passers = []
    this.rings = []
    this.squall = null
    this.pirate = null
    this.inRain = false
    this.slip = 0
    g.scene.setPost({ tint: 0, rain: 0 })
  }
  /** the sky pirate chasing the plane, for an armed plane to shoot at (round 22) */
  get pirateActor(): Actor | null {
    const p = this.pirate
    return p && !p.boat && p.phase !== 'gone' ? p.a : null
  }
  /** shot down by an armed plane: it falls into the sea, and what it had taken goes with it */
  shotDown() {
    const g = this.g
    const p = this.pirate
    if (!p) return
    g.scene.burst({ kind: 'water', x: p.a.x, y: p.a.y, z: 1, n: 24, speed: 26, up: 30, life: 0.8, r: 6 })
    this.addCrate({ x: p.a.x, y: p.a.y }, this.loot())
    g.scene.removeActor(p.a)
    this.pirate = null
    g.save.stats.escaped = (g.save.stats.escaped ?? 0) + 1
    g.celebrate(1, $t('把空盗打下来了！'), $t('它掉进了海里，漂着一只箱子：飞过去捞起来'))
    g.changed()
  }
  get chased(): boolean {
    return !!this.pirate && this.pirate.phase !== 'gone'
  }

  // ───────────────────────────────────────────────────────────── each frame of the cruise
  step(dt: number, v: Vehicle, dest: IslandLayout | null) {
    const g = this.g
    const a = g.scene.lead
    if (!a) return
    const def = g.vdef(v)
    const boat = def.kind === 'boat'
    const w = g.world
    const sn = Math.sin(a.yaw)
    const cs = Math.cos(a.yaw)
    // ── wind: it carries the vehicle along with it (less so a boat), and now and then it backs round
    this.wind.t -= dt
    if (this.wind.t <= 0) {
      this.wind = { dir: this.wind.dir + (g.rnd() - 0.5) * 2.6, speed: 3 + g.rnd() * 7, t: 24 + g.rnd() * 16 }
      g.sfx('whoosh', 0.7, 0.6)
      g.toast($t('风向变了：{0}', this.windWord(a.yaw)))
    }
    // a worn-out engine coughs: a lurch and a puff of smoke now and then
    if ((v.wear?.engine ?? 1) < 0.25) {
      this.cough -= dt
      if (this.cough <= 0) {
        this.cough = 5 + g.rnd() * 6
        g.sfx('error', 0.6)
        g.scene.burst({ kind: 'smoke', x: a.x, y: a.y, z: a.z + 2, n: 6, speed: 8, up: 10, life: 1.2 })
        g.scene.shake(0.8)
        if (g.rnd() < 0.3) g.toast(boat ? $t('舵咯吱咯吱响：该修了') : $t('引擎咳了一声：该修了'), true)
      }
    }
    const k = boat ? 0.55 : 1
    let px = Math.sin(this.wind.dir) * this.wind.speed * k
    let py = -Math.cos(this.wind.dir) * this.wind.speed * k
    // ── in a flock's slipstream
    if (this.slip > 0) {
      this.slip -= dt
      px += sn * 12
      py -= cs * 12
    }
    // ── rain
    const sq = this.squall
    const wet = !!sq && Math.hypot(w.delta(sq.x, a.x), w.delta(sq.y, a.y)) < sq.r
    if (wet !== this.inRain) {
      this.inRain = wet
      if (wet) {
        if (!sq!.fog) this.squalls++
        g.sfx('rumble', sq!.fog ? 0.7 : 1.2)
        g.toast(sq!.fog ? $t('钻进了雾里') : $t('钻进了雨云'))
      }
      g.scene.setPost(wet ? (sq!.fog ? { tint: 0.46, tr: 214, tg: 222, tb: 230, rain: 0 } : { tint: 0.28, tr: 70, tg: 80, tb: 100, rain: 1.3 }) : { tint: 0, rain: 0 })
    }
    this.fogT = wet && sq!.fog ? this.fogT + dt : 0
    if (wet && sq!.fog) {
      g.scene.burst({ kind: 'steam', x: a.x, y: a.y, z: a.z, n: 2, speed: 14, up: 4, life: 1.2, mode: 'float', grav: 0, r: 60 })
    } else if (wet) {
      px -= sn * def.flight.speed * 0.16
      py += cs * def.flight.speed * 0.16
      g.scene.burst({ kind: 'water', x: a.x, y: a.y, z: a.z + 26, n: 5, speed: 30, up: -70, life: 0.5, mode: 'float', grav: 60, r: 70 })
      if (g.rnd() < dt * 0.6) g.scene.shake(1.2)
    } else if (sq && Math.hypot(w.delta(sq.x, a.x), w.delta(sq.y, a.y)) < 520) {
      // seen from outside: a grey veil of rain
      if (sq.fog) g.scene.burst({ kind: 'steam', x: sq.x, y: sq.y, z: 14, n: 5, speed: 6, up: 2, life: 1.6, mode: 'float', grav: 0, r: sq.r })
      else g.scene.burst({ kind: 'steam', x: sq.x, y: sq.y, z: 46, n: 4, speed: 4, up: -40, life: 1, mode: 'float', grav: 30, r: sq.r })
    }
    // a boat is not pushed onto the land
    const nx = a.x + px * dt
    const ny = a.y + py * dt
    if (!this.g.anchored && (!boat || w.isWater(Math.round(nx + Math.sign(px) * 8), Math.round(ny + Math.sign(py) * 8)))) { // (the anchor holds against wind and current)
      a.x = nx
      a.y = ny
    }

    this.stepFlocks(dt, a, boat)
    this.stepCrates(dt, a)
    this.stepPassers(dt, a)
    this.stepRings(a)
    this.stepPirate(dt, v, a, dest, boat)
  }
  private windWord(yaw: number): string {
    const rel = Math.atan2(Math.sin(this.wind.dir - yaw), Math.cos(this.wind.dir - yaw))
    const strong = this.wind.speed > 6.5 ? $t('强') : ''
    return Math.abs(rel) < 0.8 ? $t('{0}顺风', strong) : Math.abs(rel) > 2.35 ? $t('{0}逆风', strong) : $t('{0}侧风，向{1}推', strong, rel > 0 ? $t('右') : $t('左'))
  }
  private stepFlocks(dt: number, a: Actor, boat: boolean) {
    const g = this.g
    this.flockIn -= dt
    if (this.flockIn <= 0 && this.flocks.length < 2) {
      this.flockIn = 11 + g.rnd() * 10
      // ahead and to one side, crossing the course
      const side = g.rnd() < 0.5 ? -1 : 1
      const sn = Math.sin(a.yaw)
      const cs = Math.cos(a.yaw)
      const x = a.x + sn * 300 + cs * side * 120
      const y = a.y - cs * 300 + sn * side * 120
      const dir = a.yaw + Math.PI - side * 1.0
      const birds: Actor[] = []
      for (let i = 0; i < 7; i++) {
        const row = Math.ceil(i / 2)
        const sgn = i % 2 ? 1 : -1
        birds.push(g.scene.addActor('gull', { x: x - Math.sin(dir) * row * 9 + Math.cos(dir) * sgn * row * 8, y: y + Math.cos(dir) * row * 9 + Math.sin(dir) * sgn * row * 8, z: boat ? 16 : a.z + 2, yaw: dir, shadow: false, reach: 700 }))
      }
      this.flocks.push({ birds, x, y, dir, scattered: 0 })
    }
    for (const f of this.flocks) {
      const v = 30 * dt
      f.x += Math.sin(f.dir) * v
      f.y -= Math.cos(f.dir) * v
      f.birds.forEach((b, i) => {
        if (f.scattered > 0) {
          const ang = f.dir + (i - 3) * 0.5
          b.x += Math.sin(ang) * 60 * dt
          b.y -= Math.cos(ang) * 60 * dt
          b.z += 14 * dt
          b.yaw = ang
        } else {
          b.x += Math.sin(f.dir) * v
          b.y -= Math.cos(f.dir) * v
        }
        b.roll = Math.sin(g.clock * 9 + i) * 0.5
      })
      const d = Math.hypot(g.world.delta(f.x, a.x), g.world.delta(f.y, a.y))
      if (f.scattered > 0) f.scattered += dt
      else if (d < 34) {
        // through the middle of them: they scatter, and the vehicle rides the air they leave
        f.scattered = 0.01
        this.slip = 4
        g.sfx('gull')
        g.sfx('ring', 1.2)
        g.scene.burst({ kind: 'feather', x: a.x, y: a.y, z: a.z + 2, n: 18, speed: 26, up: 14, life: 1.2, mode: 'float', grav: 18, r: 8 })
        g.toast($t('借着海鸟的气流'))
      } else if (d < 130 && g.rnd() < dt * 0.5) g.sfx('gull', 1, 0.5)
    }
    const far = this.flocks.filter((f) => f.scattered > 3 || Math.hypot(g.world.delta(f.x, a.x), g.world.delta(f.y, a.y)) > 620)
    for (const f of far) for (const b of f.birds) g.scene.removeActor(b)
    if (far.length) this.flocks = this.flocks.filter((f) => !far.includes(f))
  }
  private stepCrates(dt: number, a: Actor) {
    const g = this.g
    for (const c of this.crates) {
      c.t += dt
      c.a.z = 0.5 + Math.sin(c.t * 2) * 0.4
      c.a.roll = Math.sin(c.t * 1.3) * 0.12
      if (c.t % 1.2 < dt) g.scene.burst({ kind: 'star', x: c.a.x, y: c.a.y, z: 8, n: 2, speed: 4, up: 10, life: 0.6, mode: 'float', grav: 0, r: 2 })
      if (Math.hypot(g.world.delta(c.a.x, a.x), g.world.delta(c.a.y, a.y)) > 20) continue
      // hooked (a plane lets down a line as it passes over)
      g.scene.removeActor(c.a)
      this.crates = this.crates.filter((x) => x !== c)
      g.sfx('splash', 1.2, 0.7)
      g.sfx('collect')
      g.scene.burst({ kind: 'water', x: c.a.x, y: c.a.y, z: 1, n: 14, speed: 20, up: 30, life: 0.6, r: 3 })
      if (c.recover) {
        void g.backend.lose(c.recover.id, -c.recover.units).then(() => g.refresh())
        if (this.robbed) this.robbed.units -= c.recover.units
        g.celebrate(1, $t('捞回来了！'), $t('{0}×{1} 回到货舱', ITEMS[c.recover.item].name, c.recover.units), c.recover.item)
      } else {
        g.receive(c.bag)
        g.save.coins += c.coins
        if (c.coins) g.pay(c.coins, a.x, a.y, a.z)
        if (Object.keys(c.bag).length) g.drop(c.bag, a.x, a.y, a.z)
        const what = [c.coins ? $t('{0} 金币', c.coins) : '', ...(Object.keys(c.bag) as ItemId[]).map((k) => `${ITEMS[k].name}×${c.bag[k]}`)].filter(Boolean).join($t('、'))
        g.toast($t('捞到一只漂流箱：{0}', what))
      }
      g.changed()
    }
  }
  private stepPassers(dt: number, a: Actor) {
    const g = this.g
    for (const p of this.passers) {
      const nx = p.a.x + Math.sin(p.dir) * p.speed * dt
      const ny = p.a.y - Math.cos(p.dir) * p.speed * dt
      if (p.boat && !g.world.isWater(Math.round(nx + Math.sin(p.dir) * 30), Math.round(ny - Math.cos(p.dir) * 30))) p.dir += 1.2 * dt * 4
      else {
        p.a.x = nx
        p.a.y = ny
      }
      p.a.yaw = p.dir
      if (!p.boat) p.a.roll = p.hailed && g.clock % 1 < 0.6 ? Math.sin(g.clock * 14) * 0.5 : 0
      if (!p.hailed && Math.hypot(g.world.delta(p.a.x, a.x), g.world.delta(p.a.y, a.y)) < 90) {
        p.hailed = true
        g.sfx('quest', 1.2, 0.6)
        g.toast(p.boat ? $t('{0}的船在远处向你鸣了一声号', p.who) : $t('{0}的飞机向你摇了摇机翼', p.who))
      }
    }
  }
  private stepRings(a: Actor) {
    const g = this.g
    for (const r of this.rings) {
      if (r.hit) continue
      if (g.clock % 0.5 < 0.034) g.scene.burst({ kind: 'coin', x: r.x, y: r.y, z: r.z, n: 6, speed: 16, up: 0, life: 0.5, mode: 'float', grav: 0, r: 2 })
      if (Math.hypot(g.world.delta(r.x, a.x), g.world.delta(r.y, a.y)) < 24) {
        r.hit = true
        this.ringScore += 8
        g.sfx('ring', 1.3)
        g.scene.burst({ kind: 'coin', x: r.x, y: r.y, z: a.z, n: 16, speed: 30, up: 10, life: 0.6, mode: 'spark', grav: 0 })
      }
    }
  }

  // ───────────────────────────────────────────────────────────── the landing
  /** how well the vehicle is lined up, 0 … 100: heading, and how far off the line of the runway (or pier) */
  approach(v: Vehicle, lay: IslandLayout): number {
    const g = this.g
    const a = g.scene.lead
    if (!a) return 0
    const boat = g.vdef(v).kind === 'boat'
    const want = boat ? lay.berth.yaw + Math.PI : lay.runwayStart.yaw + Math.PI
    const to = boat ? lay.berth : lay.runwayEnd
    const err = Math.abs(Math.atan2(Math.sin(a.yaw - want), Math.cos(a.yaw - want)))
    const dx = g.world.delta(a.x, to.x)
    const dy = g.world.delta(a.y, to.y)
    // off the line: the sideways part of where the vehicle is, seen from the threshold
    const off = Math.abs(dx * Math.cos(want) + dy * Math.sin(want))
    let score = 100 - (err * 180 / Math.PI) * 0.8 - off * 0.45
    if (boat && g.scene.boost > 0.4) score -= 25 // charging the pier
    return Math.max(0, Math.min(100, Math.round(score + this.ringScore)))
  }
  /** judge the approach at the moment the landing is called */
  judge(v: Vehicle, lay: IslandLayout) {
    const score = this.approach(v, lay)
    this.g.wearVehicle(v.id, { km: this.total / 100, robbed: !!this.robbed && this.robbed.units > 0, chased: this.wasChased, squall: this.squalls, hard: score < 30 })
    const boat = this.g.vdef(v).kind === 'boat'
    this.rating = score >= 80 ? { score, text: boat ? $t('稳稳靠岸') : $t('完美进场'), pct: 0.2 } : score >= 55 ? { score, text: boat ? $t('靠得不错') : $t('进场不错'), pct: 0.1 } : { score, text: '', pct: 0 }
    if (this.rating.pct > 0) {
      this.g.sfx('ring', 1.5)
      this.g.toast($t('{0}！对得很正（{1} 分），多 {2}% 小费', this.rating.text, score, Math.round(this.rating.pct * 100)))
    }
  }

  // ───────────────────────────────────────────────────────────── pirates
  private stepPirate(dt: number, v: Vehicle, a: Actor, dest: IslandLayout | null, boat: boolean) {
    const g = this.g
    const w = g.world
    const def = g.vdef(v)
    if (!this.pirate) {
      if (this.pirateAt < 0 || !dest) return
      const done = Math.hypot(w.delta(a.x, this.start.x), w.delta(a.y, this.start.y)) / this.total
      if (done < this.pirateAt) return
      this.pirateAt = -1
      // sighted: off the beam or the quarter, a good way off — it has to catch up, which leaves time to act
      const side = g.rnd() < 0.5 ? -1 : 1
      const ang = a.yaw + side * (1.7 + g.rnd() * 0.7)
      let x = a.x + Math.sin(ang) * 230
      let y = a.y - Math.cos(ang) * 230
      if (boat && !w.isWater(Math.round(x), Math.round(y))) { x = a.x - Math.sin(a.yaw) * 240; y = a.y + Math.cos(a.yaw) * 240 }
      const p = g.scene.addActor(boat ? 'pirateSloop' : 'raider', { x, y, z: boat ? 1 : a.z, yaw: ang + Math.PI, scale: 1.25, shadow: false, reach: 900 })
      p.trails = !boat
      this.pirate = { a: p, phase: 'sighted', t: 0, grip: 0, yaw: ang + Math.PI, shaken: 0, boat }
      g.sfx('alarm')
      g.scene.shake(1.5)
      g.celebrate(1, boat ? $t('⚠ 海盗！') : $t('⚠ 空盗！'), $t('加速、急转弯甩开它；靠近岛屿它就不敢追了'))
      g.changed()
      return
    }
    const p = this.pirate
    const pa = p.a
    p.t += dt
    const dx = w.delta(a.x, pa.x)
    const dy = w.delta(a.y, pa.y)
    const dist = Math.hypot(dx, dy)
    if (p.phase === 'gone') {
      // making off
      pa.x += Math.sin(p.yaw) * def.flight.speed * 1.5 * dt
      pa.y -= Math.cos(p.yaw) * def.flight.speed * 1.5 * dt
      pa.yaw = p.yaw
      if (p.t > 6) {
        g.scene.removeActor(pa)
        this.pirate = null
        g.changed()
      }
      return
    }
    // it steers for the vehicle, but it cannot turn as sharply
    const want = Math.atan2(dx, -dy)
    const diff = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw))
    if (p.shaken <= 2) p.yaw += Math.max(-0.95 * dt, Math.min(0.95 * dt, diff)) // (in smoke it flies on blind)
    // Faster than a laden vehicle even with its thrusters on, slower than a light one: a full
    // hold has to out-turn them (or pay), a light one can simply run.
    let speed = def.flight.speed * (p.phase === 'sighted' ? 0.9 : 1.45)
    // pirates keep off the shoals and out of the rain, and lose the scent after a sharp turn
    if (boat && !w.isWater(Math.round(pa.x + Math.sin(p.yaw) * 46), Math.round(pa.y - Math.cos(p.yaw) * 46))) { speed *= 0.3; p.yaw += 1.4 * dt }
    if (this.inRain) speed *= 0.7
    if (p.shaken > 0) { speed *= p.shaken > 2 ? 0.35 : 0.6; p.shaken -= dt }
    else if (p.phase === 'chase' && dist < 110 && Math.abs(diff) > 1.75) {
      p.shaken = 2
      p.grip = Math.max(0, p.grip - 0.3)
      g.sfx('whoosh', 1.4)
      g.float($t('甩开了一截！'), a.x, a.y, a.z + 12)
    }
    pa.x += Math.sin(p.yaw) * speed * dt
    pa.y -= Math.cos(p.yaw) * speed * dt
    pa.yaw = p.yaw
    pa.roll = boat ? 0 : Math.max(-0.6, Math.min(0.6, diff * 1.2))
    if (!boat) pa.z += (a.z - pa.z) * Math.min(1, dt * 2)
    if (p.phase === 'sighted') {
      if (p.t > 3) { p.phase = 'chase'; p.t = 0; this.wasChased = true }
      return
    }
    // the grip: it tightens while they are close, and eases when they are not
    const armor = this.has(v, 'armor') ? 1.5 : 1
    if (dist < 62) p.grip += dt / (2.8 * armor)
    else if (dist > 95) p.grip = Math.max(0, p.grip - dt * 0.25)
    this.tick -= dt
    if (this.tick <= 0) {
      this.tick = 0.45
      if (dist < 62) { g.sfx('beep', 0.7 + p.grip); g.scene.shake(0.6 + p.grip) }
    }
    // they give up: outrun, out-lasted, or too near an island's lookout
    const nearIsland = !!dest && Math.hypot(w.delta(dest.def.x, a.x), w.delta(dest.def.y, a.y)) < dest.def.r + 70
    const fogged = this.fogT > 2.5
    if (dist > 330 || p.t > 30 || nearIsland || fogged) {
      p.phase = 'gone'
      p.t = 0
      p.yaw += Math.PI
      g.sfx('escape')
      g.save.stats.escaped = (g.save.stats.escaped ?? 0) + 1
      g.celebrate(1, $t('甩掉了！'), nearIsland ? $t('岛上的了望塔吓退了它') : fogged ? $t('雾里，它跟丢了') : $t('货一件没少'))
      g.changed()
      return
    }
    if (p.grip >= 1) this.rob(v, a, p)
  }
  /** a smoke bomb: the pursuer flies on blind for a few seconds and its grip is gone (one is used up) */
  smoke() {
    const g = this.g
    const p = this.pirate
    const a = g.scene.lead
    if (!p || p.phase === 'gone' || !a) return
    if ((g.save.inv.smoke ?? 0) < 1) return g.warn($t('没有烟幕弹了（工作台的“装备”里做）'))
    if (p.shaken > 2) return
    g.save.inv.smoke = (g.save.inv.smoke ?? 0) - 1
    p.shaken = 7 // five seconds blind, then two finding its bearings
    p.grip = 0
    p.t += 8 // … and it has less patience left for the chase
    if (p.phase === 'sighted') { p.phase = 'chase'; p.t = 0; this.wasChased = true }
    g.sfx('rumble', 1.5)
    g.sfx('whoosh', 0.7)
    g.scene.shake(2)
    g.scene.burst({ kind: 'steam', x: a.x - Math.sin(a.yaw) * 10, y: a.y + Math.cos(a.yaw) * 10, z: a.z, n: 46, speed: 26, up: 8, life: 2.4, mode: 'smoke', grav: 0, r: 16 })
    g.float($t('烟幕！'), a.x, a.y, a.z + 12)
    g.changed()
  }
  /** they take part of the cargo, in plain sight, and leave some of it adrift */
  private rob(v: Vehicle, a: Actor, p: NonNullable<Voyage['pirate']>) {
    const g = this.g
    const loaded = g.deliveries.filter((d) => d.state === 'loaded' && d.qty - (d.lost ?? 0) > 1).sort((x, y) => (y.qty - (y.lost ?? 0)) - (x.qty - (x.lost ?? 0)))
    const total = g.deliveries.filter((d) => d.state === 'loaded').reduce((n, d) => n + d.qty - (d.lost ?? 0), 0)
    let take = Math.max(1, Math.round(total * (this.has(v, 'lock') ? 0.15 : 0.3)))
    const lines: string[] = []
    let units = 0
    for (const d of loaded) {
      if (take <= 0) break
      const n = Math.min(take, d.qty - (d.lost ?? 0) - 1)
      if (n <= 0) continue
      take -= n
      units += n
      d.lost = (d.lost ?? 0) + n
      void g.backend.lose(d.id, n)
      lines.push(`${ITEMS[d.item].name}×${n}`)
      // half of it goes over the side in the scramble: it can be fished back out
      // (from a very small load even one piece is more than the 40% they are allowed: then all of it can be got back)
      const back = n / Math.max(1, total) > 0.4 ? n : Math.floor(n / 2)
      if (back > 0) {
        const at = { x: a.x - Math.sin(a.yaw) * 40 + (g.rnd() - 0.5) * 30, y: a.y + Math.cos(a.yaw) * 40 + (g.rnd() - 0.5) * 30 }
        this.addCrate(at, { bag: {}, coins: 0 }, { id: d.id, units: back, item: d.item })
      }
      g.float(`−${n} ${ITEMS[d.item].name}`, a.x, a.y, a.z + 10 + lines.length * 5)
    }
    g.hitStop = 0.14
    g.scene.shake(4.5)
    g.sfx('cannon')
    g.sfx('robbed')
    // the crates go across, from one to the other
    const dir = Math.atan2(p.a.x - a.x, -(p.a.y - a.y))
    g.scene.burst({ kind: 'wood', x: a.x, y: a.y, z: a.z + 2, n: 30, speed: 60, up: 30, life: 0.8, dir, cone: 0.7 })
    g.scene.burst({ kind: 'smoke', x: a.x, y: a.y, z: a.z + 2, n: 14, speed: 14, up: 16, life: 1, mode: 'smoke', size: 2, r: 4 })
    this.robbed = { text: lines.join($t('、')), units }
    if (units > 0) g.warn($t('被抢走：{0}。掉进海里的一半能捞回来；剩下的照常送达', lines.join($t('、'))))
    else g.toast($t('扑了个空'))
    p.phase = 'gone'
    p.t = 0
    p.yaw = dir
    this.load = Math.max(0, this.load - units / g.vdef(v).cargo)
    g.changed()
  }

  view(v: Vehicle, dest: IslandLayout | null): VoyageView {
    const g = this.g
    const a = g.scene.lead
    const yaw = a ? a.yaw : 0
    const rel = Math.atan2(Math.sin(this.wind.dir - yaw), Math.cos(this.wind.dir - yaw))
    let approach: number | null = null
    if (a && dest) {
      const to = g.vdef(v).kind === 'boat' ? dest.berth : dest.runwayEnd
      if (Math.hypot(g.world.delta(to.x, a.x), g.world.delta(to.y, a.y)) < 330) approach = this.approach(v, dest)
    }
    let pirate: VoyageView['pirate'] = null
    if (this.pirate && a) {
      const dx = g.world.delta(this.pirate.a.x, a.x)
      const dy = g.world.delta(this.pirate.a.y, a.y)
      const h = g.scene.heading
      pirate = { dist: Math.hypot(dx, dy), bearing: Math.atan2(dx * Math.cos(h) - dy * Math.sin(h), -dx * Math.sin(h) - dy * Math.cos(h)), grip: this.pirate.grip, phase: this.pirate.phase }
    }
    return {
      load: this.load,
      heavy: this.load > 0.75 ? $t('满载：很笨重') : this.load > 0.4 ? $t('半载：有点沉') : this.load > 0 ? $t('轻载') : $t('空舱'),
      wind: rel, windText: this.windWord(yaw), slip: this.slip,
      approach, approachText: approach === null ? '' : approach >= 80 ? $t('对正了') : approach >= 55 ? $t('还行') : $t('没对正'),
      pirate, rain: this.inRain, fog: this.inRain && !!this.squall?.fog, smoke: g.save.inv.smoke ?? 0, danger: this.danger,
    }
  }
}
export { UPGRADES }
