// Round 22: fighting the sky pirates. Nobody dies: a plane shot down comes down under a parachute
// and the pilot is taken home (round 23: picked up by the boat). Two ways it happens:
//   · a sortie (空盗清剿): out to one of four seas to bring down a number of sky pirates; won, that
//     sea has none for three days;
//   · on any trip, a plane with the gun mount can fight back at the sky pirate that chases it.
// The feel comes from the fighter prototype: a cannon that finds its own aim a little, a lock box
// that turns red, missiles, and a roll at the right moment to throw off a missile coming in —
// after which a missile fires three.

import type { Game } from './game'
import { FRIENDS } from './story'
import { $t } from '../i18n'

type Actor = Game['pilot']

export type FoeKind = 'skiff' | 'gunboat' | 'boss'
export interface FoeDef { name: string; hp: number; speed: number; turn: number; fire: number; missile: number; scale: number; tint: [number, number, number] | null; coins: number; dodge: number }
export const FOES: Record<FoeKind, FoeDef> = {
  skiff: { name: $t('空盗小艇'), hp: 9, speed: 0.92, turn: 1.6, fire: 3, missile: 0, scale: 1.15, tint: null, coins: 18, dodge: 0 },
  gunboat: { name: $t('空盗炮艇'), hp: 26, speed: 0.85, turn: 1.1, fire: 3.4, missile: 9, scale: 1.55, tint: [70, 76, 92], coins: 45, dodge: 0 },
  boss: { name: $t('空盗头目'), hp: 50, speed: 1.0, turn: 1.7, fire: 2.2, missile: 6.5, scale: 1.85, tint: [40, 30, 34], coins: 140, dodge: 0.4 },
}
/** the four seas, each named for the island it lies off */
export type SeaId = (typeof FRIENDS)[number]
export const SEAS: Record<SeaId, { name: string; stars: 1 | 2 | 3; need: number }> = {
  peak: { name: $t('石峰北海'), stars: 1, need: 6 },
  pine: { name: $t('雾松东海'), stars: 1, need: 6 },
  reef: { name: $t('珊瑚南海'), stars: 2, need: 9 },
  dune: { name: $t('赤砂西海'), stars: 3, need: 12 },
}
/** days a cleared sea stays clear of sky pirates */
export const CLEAR_DAYS = 3
export const ROUNDS = 200
export const MISSILES = 4
const RELOAD = 3
const SHOT_SPEED = 420
const SHOT_LIFE = 0.8
const FIRE_RATE = 11
const AIM_CONE = 0.5 // how far off the nose the cannon still finds its mark
const LOCK_CONE = 0.35
const LOCK_RANGE = 380
const LOCK_TIME = 0.7
const MISSILE_SPEED = 250
const FOE_MISSILE_SPEED = 165
/** the moment to roll: this long before a missile strikes (seconds) */
const DODGE_EARLY = 0.62
const DODGE_LATE = 0.1
const COUNTER = 1.6

interface Foe { a: Actor; kind: FoeKind; hp: number; yaw: number; fireT: number; missileT: number; breakT: number; side: number; burst: number; voyage?: boolean }
interface Shot { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; mine: boolean }
interface Missile { a: Actor; x: number; y: number; z: number; yaw: number; t: number; mine: boolean; target: Foe | null; lost: boolean }
export interface Sortie { sea: SeaId; need: number; downed: number; coins: number; spawned: number; won: boolean; at: { x: number; y: number } }

export class Combat {
  foes: Foe[] = []
  private shots: Shot[] = []
  private missiles: Missile[] = []
  sortie: Sortie | null = null
  hull = 100
  hullMax = 100
  ammo = ROUNDS
  reload = 0
  missilesLeft = MISSILES
  firing = false
  private fireT = 0
  lockT = 0
  lock: Foe | null = null
  private counterUntil = -1
  /** a missile coming in: seconds until it strikes (for the two rings), or null */
  incoming: number | null = null
  private rolling = false
  /** shot down: falling, then home */
  downT = -1
  private clock = 0
  word: { text: string; until: number } | null = null

  constructor(private g: Game) {}

  /** the plane flying has the gun mount */
  get armed(): boolean {
    const g = this.g
    const f = g.flight
    const v = f ? g.vehicle(f.vehicleId) : null
    return !!v && g.mode === 'flight' && !!v.up?.includes('guns') && g.vdef(v).kind === 'plane'
  }
  get active(): boolean { return this.armed && (this.foes.length > 0 || !!this.sortie) }

  // ───────────────────────────────────────────────────────────── a trip begins and ends
  /** take off: full of rounds and missiles, the hull whole */
  begin() {
    const g = this.g
    const v = g.flight ? g.vehicle(g.flight.vehicleId) : null
    this.clear()
    this.hullMax = v?.up?.includes('armor') ? 130 : 100
    this.hull = this.hullMax
    this.ammo = ROUNDS
    this.reload = 0
    this.missilesLeft = MISSILES
  }
  clear() {
    const g = this.g
    for (const f of this.foes) if (!f.voyage) g.scene.removeActor(f.a)
    for (const m of this.missiles) g.scene.removeActor(m.a)
    this.foes = []
    this.missiles = []
    this.shots = []
    this.lock = null
    this.lockT = 0
    this.incoming = null
    this.firing = false
    this.downT = -1
    this.sortie = null
  }
  /** a sortie: out to a sea to bring down sky pirates */
  startSortie(sea: SeaId) {
    const g = this.g
    const home = g.layouts.home.def
    const isl = g.layouts[sea]?.def
    if (!isl) return
    // the sea lies out between home and that island
    const dx = g.world.delta(isl.x, home.x), dy = g.world.delta(isl.y, home.y)
    // (open water, well clear of both shores)
    const d = Math.hypot(dx, dy) || 1
    // halfway between where home's shore ends and where that island's begins
    const k0 = Math.min(0.45, (home.r + 120) / d), k1 = Math.max(0.55, 1 - (isl.r + 120) / d)
    const k = (k0 + k1) / 2
    const at = { x: home.x + dx * k, y: home.y + dy * k }
    const S = SEAS[sea]
    this.sortie = { sea, need: S.need, downed: 0, coins: 0, spawned: 0, won: false, at }
    g.toast($t('出击：{0}，击落 {1} 架空盗', S.name, S.need))
    g.changed()
  }
  /** is this sea clear of sky pirates today? */
  cleared(sea: string): boolean {
    return (this.g.save.cleared?.[sea] ?? -1) >= this.g.clockDay
  }
  /** the sea a trip to this island crosses */
  seaOf(island: string): SeaId | null {
    return (FRIENDS as readonly string[]).includes(island) ? (island as SeaId) : null
  }

  // ───────────────────────────────────────────────────────────── the controls
  fire(on: boolean) {
    if (!this.armed) return
    this.firing = on
  }
  missile() {
    const g = this.g
    const a = g.scene.lead
    if (!this.armed || !a || this.downT >= 0) return
    if (this.missilesLeft <= 0) { g.warn($t('导弹打完了：回家补')); return }
    this.missilesLeft--
    const counter = this.clock < this.counterUntil
    const targets = counter ? this.foes.slice().sort((p, q) => this.distTo(p) - this.distTo(q)).slice(0, 3) : [this.lock ?? null]
    const n = counter ? 3 : 1
    for (let i = 0; i < n; i++) {
      const t = targets[i % Math.max(1, targets.length)] ?? null
      const side = (i - (n - 1) / 2) * 0.5
      this.launch(a.x, a.y, a.z - 1, a.yaw + side, true, t)
    }
    if (counter) { this.counterUntil = -1; this.say($t('反击！三连发')) }
    g.sfx('whoosh', 1.3)
    g.sfx('boom', 1.8, 0.5)
    g.changed()
  }
  /** the roll the scene just began: a dodge, if a missile is about to strike */
  private rolled() {
    const g = this.g
    const m = this.missiles.find((x) => !x.mine && !x.lost)
    if (!m) return
    const t = this.tti(m)
    if (t <= DODGE_EARLY && t >= DODGE_LATE) {
      m.lost = true
      m.yaw += (Math.random() < 0.5 ? -1 : 1) * 0.9
      this.counterUntil = this.clock + COUNTER
      this.say($t('闪开了！马上打导弹：三连发'))
      g.sfx('whoosh', 1.7)
      g.sfx('ding', 1.4)
      g.save.stats.dodged = (g.save.stats.dodged ?? 0) + 1
    }
  }

  // ───────────────────────────────────────────────────────────── each frame
  step(dt: number) {
    const g = this.g
    const a = g.scene.lead
    this.clock += dt
    if (!a || g.mode !== 'flight' || !g.flight || g.flight.phase !== 'cruise') return
    // the voyage's sky pirate: a target too, for an armed plane
    const vp = g.voyage.pirateActor
    if (this.armed && vp && !this.foes.some((f) => f.voyage)) this.foes.push({ a: vp, kind: 'skiff', hp: 7, yaw: vp.yaw, fireT: 99, missileT: 99, breakT: 0, side: 1, burst: 0, voyage: true })
    if (!vp) this.foes = this.foes.filter((f) => !f.voyage)
    if (!this.armed && !this.foes.length) return
    if (this.downT >= 0) return this.stepDown(dt, a)
    // a roll started: a dodge?
    const rolling = (a as Actor & { stunt?: number }).stunt !== undefined && (a as Actor & { stunt: number }).stunt >= 0
    if (rolling && !this.rolling) this.rolled()
    this.rolling = rolling
    if (this.sortie) this.stepSortie(a)
    this.stepGun(dt, a)
    this.stepLock(dt, a)
    for (const f of this.foes) if (!f.voyage) this.stepFoe(dt, f, a)
    this.stepShots(dt, a)
    this.stepMissiles(dt, a)
    this.draw()
    if (this.word && this.clock > this.word.until) this.word = null
  }
  private stepSortie(a: Actor) {
    const g = this.g
    const s = this.sortie!
    if (s.won) return
    const d = Math.hypot(g.world.delta(s.at.x, a.x), g.world.delta(s.at.y, a.y))
    const live = this.foes.filter((f) => !f.voyage).length
    // in the sea, they come at you a few at a time; the toughest last
    if (d < 360 && live < (SEAS[s.sea].stars >= 3 ? 3 : 2) && s.spawned < s.need) {
      const left = s.need - s.spawned
      const stars = SEAS[s.sea].stars
      const kind: FoeKind = stars === 3 && left === 1 ? 'boss' : (stars >= 2 && s.spawned % 3 === 2) || (stars === 1 && left === 1) ? 'gunboat' : 'skiff'
      this.spawn(kind, a)
      s.spawned++
    }
  }
  private spawn(kind: FoeKind, a: Actor) {
    const g = this.g
    const D = FOES[kind]
    const ang = a.yaw + (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.2)
    const x = a.x + Math.sin(ang) * 260, y = a.y - Math.cos(ang) * 260
    const model = D.tint ? g.scene.tinted('raider', D.tint, 0.55) : 'raider'
    const fa = g.scene.addActor(model, { x, y, z: a.z + (Math.random() - 0.5) * 10, yaw: ang + Math.PI, scale: D.scale, shadow: false, reach: 900 })
    fa.trails = true
    this.foes.push({ a: fa, kind, hp: D.hp, yaw: ang + Math.PI, fireT: 2 + Math.random() * 2, missileT: D.missile ? D.missile * 0.6 : 99, breakT: 0, side: Math.random() < 0.5 ? -1 : 1, burst: 0 })
    if (kind === 'boss') { g.sfx('alarm'); this.say($t('空盗头目来了！它会躲导弹')) }
    else g.sfx('beep', 0.6)
  }
  private stepFoe(dt: number, f: Foe, a: Actor) {
    const g = this.g
    const w = g.world
    const D = FOES[f.kind]
    const dx = w.delta(a.x, f.a.x), dy = w.delta(a.y, f.a.y)
    const dist = Math.hypot(dx, dy)
    // lead the target a little; break off when too close, come round again
    const sp = g.scene.speed || 50
    const lead = Math.min(1.2, dist / SHOT_SPEED)
    const px = dx + Math.sin(a.yaw) * sp * lead, py = dy - Math.cos(a.yaw) * sp * lead
    let want = Math.atan2(px, -py)
    if (f.breakT > 0) { f.breakT -= dt; want = Math.atan2(dx, -dy) + Math.PI + f.side * 0.8 }
    else if (dist < 42) { f.breakT = 1.4; f.side = -f.side }
    const diff = Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw))
    f.yaw += Math.max(-D.turn * dt, Math.min(D.turn * dt, diff))
    const speed = (g.flightParams?.speed ?? sp) * D.speed * (dist > 300 ? 1.3 : 1)
    f.a.x += Math.sin(f.yaw) * speed * dt
    f.a.y -= Math.cos(f.yaw) * speed * dt
    f.a.yaw = f.yaw
    f.a.roll = Math.max(-0.7, Math.min(0.7, diff * 1.4))
    f.a.z += (a.z - f.a.z) * Math.min(1, dt * 1.5)
    // the guns: bursts of three when the nose is on you
    f.fireT -= dt
    if (f.fireT <= 0 && dist < 240 && Math.abs(diff) < 0.3 && f.breakT <= 0) { f.burst = 3; f.fireT = D.fire }
    if (f.burst > 0 && (f.fireT * 10) % 1 < dt * 10) {
      f.burst--
      const k = 1 / Math.max(1, Math.hypot(px, py))
      const spread = (Math.random() - 0.5) * 0.3
      const ux = px * k * Math.cos(spread) - (-py * k) * Math.sin(spread), uy = py * k
      this.shots.push({ x: f.a.x, y: f.a.y, z: f.a.z, vx: ux * SHOT_SPEED * 0.8, vy: uy * SHOT_SPEED * 0.8, vz: (a.z - f.a.z) / Math.max(0.3, dist / SHOT_SPEED), t: 0, mine: false })
      g.sfx('tap', 0.5, 0.4)
    }
    // missiles, from the gunboats and the boss
    if (D.missile) {
      f.missileT -= dt
      if (f.missileT <= 0 && dist < 320 && !this.missiles.some((m) => !m.mine && !m.lost)) {
        f.missileT = D.missile
        this.launch(f.a.x, f.a.y, f.a.z, Math.atan2(dx, -dy), false, null)
        g.sfx('alarm', 1.4, 0.6)
        this.say($t('导弹来了！两个圈重合时翻滚'))
      }
    }
  }
  private stepGun(dt: number, a: Actor) {
    const g = this.g
    if (this.reload > 0) {
      this.reload -= dt
      if (this.reload <= 0) { this.ammo = ROUNDS; g.sfx('stack', 1.2) }
      return
    }
    if (!this.firing || !this.armed) return
    this.fireT -= dt
    while (this.fireT <= 0 && this.ammo > 0) {
      this.fireT += 1 / FIRE_RATE
      this.ammo--
      // the cannon finds its own aim on whatever is near the nose
      const t = this.aimTarget(a, AIM_CONE, 330)
      let yaw = a.yaw, vz = 0
      if (t) {
        const dx = this.g.world.delta(t.a.x, a.x), dy = this.g.world.delta(t.a.y, a.y), d = Math.hypot(dx, dy)
        const time = d / SHOT_SPEED
        const tx = dx + Math.sin(t.yaw) * 50 * time, ty = dy - Math.cos(t.yaw) * 50 * time
        yaw = Math.atan2(tx, -ty)
        vz = (t.a.z - a.z) / Math.max(0.1, time)
      }
      yaw += (Math.random() - 0.5) * 0.09
      const side = this.ammo % 2 ? 1 : -1
      const ox = Math.cos(a.yaw) * 3 * side, oy = Math.sin(a.yaw) * 3 * side
      this.shots.push({ x: a.x + ox, y: a.y + oy, z: a.z - 0.5, vx: Math.sin(yaw) * SHOT_SPEED, vy: -Math.cos(yaw) * SHOT_SPEED, vz, t: 0, mine: true })
      if (this.ammo % 2) g.sfx('tap', 1.9 + Math.random() * 0.2, 0.5)
    }
    if (this.ammo <= 0) { this.reload = RELOAD; this.firing = false; g.sfx('beep', 0.8); this.say($t('机炮装填中…')) }
  }
  private stepLock(dt: number, a: Actor) {
    const t = this.aimTarget(a, LOCK_CONE, LOCK_RANGE)
    if (t && t === this.lock) this.lockT = Math.min(LOCK_TIME, this.lockT + dt)
    else if (t) { this.lock = t; this.lockT = 0 }
    else { this.lockT = Math.max(0, this.lockT - dt * 2); if (this.lockT <= 0) this.lock = null }
    if (this.lock && this.lockT >= LOCK_TIME && !(this.lock as Foe & { beeped?: boolean }).beeped) {
      ;(this.lock as Foe & { beeped?: boolean }).beeped = true
      this.g.sfx('ding', 1.8, 0.5)
    }
  }
  get locked(): boolean { return !!this.lock && this.lockT >= LOCK_TIME }
  private aimTarget(a: Actor, cone: number, range: number): Foe | null {
    let best: Foe | null = null, score = Infinity
    for (const f of this.foes) {
      const dx = this.g.world.delta(f.a.x, a.x), dy = this.g.world.delta(f.a.y, a.y)
      const d = Math.hypot(dx, dy)
      if (d > range) continue
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, -dy) - a.yaw), Math.cos(Math.atan2(dx, -dy) - a.yaw)))
      if (off > cone) continue
      const s = d * (1 + off * 2)
      if (s < score) { score = s; best = f }
    }
    return best
  }
  private distTo(f: Foe) {
    const a = this.g.scene.lead!
    return Math.hypot(this.g.world.delta(f.a.x, a.x), this.g.world.delta(f.a.y, a.y))
  }
  private stepShots(dt: number, a: Actor) {
    const g = this.g
    const w = g.world
    const keep: Shot[] = []
    for (const s of this.shots) {
      s.t += dt
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt
      let hit = false
      if (s.mine) {
        for (const f of this.foes) {
          if (Math.hypot(w.delta(f.a.x, s.x), w.delta(f.a.y, s.y)) < 6 * FOES[f.kind].scale && Math.abs(f.a.z - s.z) < 8) { this.damage(f, 1, s.x, s.y, s.z); hit = true; break }
        }
      } else if (Math.hypot(w.delta(a.x, s.x), w.delta(a.y, s.y)) < 4.5 && Math.abs(a.z - s.z) < 6) {
        this.hurt(1.3, s.x, s.y, s.z)
        hit = true
      }
      if (!hit && s.t < SHOT_LIFE) keep.push(s)
    }
    this.shots = keep
  }
  private launch(x: number, y: number, z: number, yaw: number, mine: boolean, target: Foe | null) {
    const ma = this.g.scene.addActor('missile', { x, y, z, yaw, shadow: false, reach: 900, scale: mine ? 1 : 1.2 })
    ma.trails = true
    this.missiles.push({ a: ma, x, y, z, yaw, t: 0, mine, target, lost: false })
  }
  /** seconds until a missile meets the plane, near enough */
  private tti(m: Missile): number {
    const a = this.g.scene.lead!
    return Math.hypot(this.g.world.delta(a.x, m.x), this.g.world.delta(a.y, m.y)) / Math.max(1, FOE_MISSILE_SPEED - (this.g.scene.speed || 0) * 0.4)
  }
  private stepMissiles(dt: number, a: Actor) {
    const g = this.g
    const w = g.world
    const keep: Missile[] = []
    let incoming: number | null = null
    for (const m of this.missiles) {
      m.t += dt
      const target = m.mine ? (m.target && this.foes.includes(m.target) ? m.target.a : null) : m.lost ? null : a
      if (target) {
        const dx = w.delta(target.x, m.x), dy = w.delta(target.y, m.y)
        const want = Math.atan2(dx, -dy)
        const diff = Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw))
        const turn = m.mine ? 3.2 : 1.9
        m.yaw += Math.max(-turn * dt, Math.min(turn * dt, diff))
        m.z += (target.z - m.z) * Math.min(1, dt * 3)
      }
      const sp = m.mine ? MISSILE_SPEED : FOE_MISSILE_SPEED
      m.x += Math.sin(m.yaw) * sp * dt
      m.y -= Math.cos(m.yaw) * sp * dt
      m.a.x = m.x; m.a.y = m.y; m.a.z = m.z; m.a.yaw = m.yaw
      if (Math.random() < 0.6) g.scene.burst({ kind: 'smoke', x: m.x - Math.sin(m.yaw) * 4, y: m.y + Math.cos(m.yaw) * 4, z: m.z, n: 1, speed: 2, up: 2, life: 0.7, mode: 'smoke', r: 0.6 })
      let gone = m.t > 5
      if (m.mine) {
        for (const f of this.foes) {
          if (Math.hypot(w.delta(f.a.x, m.x), w.delta(f.a.y, m.y)) < 8 * FOES[f.kind].scale) {
            // the boss throws flares: some missiles go after them instead
            if (FOES[f.kind].dodge && Math.random() < FOES[f.kind].dodge && !(m as Missile & { tried?: boolean }).tried) {
              ;(m as Missile & { tried?: boolean }).tried = true
              m.target = null
              m.yaw += 1.2
              g.scene.burst({ kind: 'fire', x: f.a.x, y: f.a.y, z: f.a.z, n: 10, speed: 20, up: 6, life: 0.8, mode: 'spark', grav: 10 })
              this.say($t('它放了干扰弹！'))
              continue
            }
            this.damage(f, 9, m.x, m.y, m.z)
            gone = true
            break
          }
        }
      } else if (!m.lost) {
        const t = this.tti(m)
        if (incoming === null || t < incoming) incoming = t
        if (Math.hypot(w.delta(a.x, m.x), w.delta(a.y, m.y)) < 7) { this.hurt(18, m.x, m.y, m.z); gone = true }
      }
      if (gone) { g.scene.removeActor(m.a); continue }
      keep.push(m)
    }
    this.missiles = keep
    this.incoming = incoming !== null && incoming < 1.3 ? incoming : null
  }
  private damage(f: Foe, n: number, x: number, y: number, z: number) {
    const g = this.g
    f.hp -= n
    g.scene.burst({ kind: 'spark', x, y, z, n: n > 3 ? 14 : 4, speed: 24, up: 12, life: 0.35, mode: 'spark' })
    if (n > 3) { g.sfx('boom', 1.3); g.scene.shake(1) }
    else if (Math.random() < 0.4) g.sfx('tap', 2.4, 0.5)
    if (f.hp > 0) return
    // down: in flames, into the sea
    this.foes = this.foes.filter((x) => x !== f)
    if (this.lock === f) { this.lock = null; this.lockT = 0 }
    const D = FOES[f.kind]
    g.scene.burst({ kind: 'fire', x: f.a.x, y: f.a.y, z: f.a.z, n: 30, speed: 34, up: 20, life: 0.9, mode: 'spark', grav: 30 })
    g.scene.burst({ kind: 'smoke', x: f.a.x, y: f.a.y, z: f.a.z, n: 20, speed: 14, up: 10, life: 1.6, mode: 'smoke', r: 4 })
    g.sfx('boom', 0.9)
    g.sfx('rockbreak', 0.7)
    g.scene.shake(1.6)
    g.save.stats.downed = (g.save.stats.downed ?? 0) + 1
    if (f.voyage) {
      g.voyage.shotDown()
      this.say($t('打下来了！它抢的东西掉进了海里'))
      return
    }
    g.scene.removeActor(f.a)
    const s = this.sortie
    if (s) {
      s.downed++
      s.coins += D.coins
      g.pay(D.coins, f.a.x, f.a.y, f.a.z)
      this.say($t('击落{0} · {1} / {2}', D.name, s.downed, s.need))
      if (s.downed >= s.need) this.win()
    }
    g.changed()
  }
  private win() {
    const g = this.g
    const s = this.sortie!
    s.won = true
    const S = SEAS[s.sea]
    const bonus = 80 * S.stars
    s.coins += bonus
    g.pay(bonus, g.pilot.x, g.pilot.y, g.pilot.z)
    ;(g.save.cleared ??= {})[s.sea] = g.clockDay + CLEAR_DAYS
    g.save.stats.sorties = (g.save.stats.sorties ?? 0) + 1
    g.sfx('bigfanfare')
    g.celebrate(2, $t('{0}清剿完了！', S.name), $t('{0} 天里这片海没有空盗 · 共得 {1} 金币。飞回家降落吧', CLEAR_DAYS, s.coins), 'coin')
    // whatever is left makes off
    for (const f of this.foes.filter((x) => !x.voyage)) g.scene.removeActor(f.a)
    this.foes = this.foes.filter((x) => x.voyage)
    g.flight!.dest = g.flight!.from
    g.setMarker(g.flight!.from)
    g.changed()
  }
  /** a hit taken: the hull; empty, and the plane goes down (nobody is hurt) */
  private hurt(n: number, x: number, y: number, z: number) {
    const g = this.g
    this.hull = Math.max(0, this.hull - n)
    g.scene.burst({ kind: 'spark', x, y, z, n: n > 10 ? 18 : 5, speed: 20, up: 10, life: 0.35, mode: 'spark' })
    g.scene.shake(n > 10 ? 3 : 0.8)
    g.sfx(n > 10 ? 'boom' : 'tap', n > 10 ? 1.1 : 0.7, n > 10 ? 1 : 0.6)
    if (this.hull <= 0 && this.downT < 0) {
      this.downT = 0
      this.firing = false
      g.sfx('alarm')
      this.say($t('被击落了！跳伞！'))
    }
    g.changed()
  }
  /** going down: smoke, the pilot out on a parachute, and home (round 23: the boat picks them up) */
  private stepDown(dt: number, a: Actor) {
    const g = this.g
    this.downT += dt
    a.roll = (a.roll ?? 0) + dt * 3
    a.z = Math.max(2, a.z - dt * 18)
    if (Math.random() < 0.8) g.scene.burst({ kind: 'smoke', x: a.x, y: a.y, z: a.z + 2, n: 2, speed: 4, up: 8, life: 1.4, mode: 'smoke', r: 2 })
    if (this.downT > 0.9 && !(this as unknown as { chute?: boolean }).chute) {
      ;(this as unknown as { chute?: boolean }).chute = true
      g.sfx('whoosh', 0.6)
      g.sfx('pop', 0.8)
      g.float($t('跳伞！'), a.x, a.y, a.z + 14)
    }
    if (this.downT < 3) return
    ;(this as unknown as { chute?: boolean }).chute = false
    const s = this.sortie
    const f = g.flight!
    g.wearVehicle(f.vehicleId, { km: 20, chased: true, hard: true })
    this.clear()
    g.celebrate(1, $t('被击落了，人没事'), $t('{0}飞机受了伤，回家修一修', s ? $t('这次击落 {0} 架，得了 {1} 金币。', s.downed, s.coins) : ''), 'coin')
    void g.comeHome(f.from)
  }
  private say(text: string) {
    this.word = { text, until: this.clock + 2.2 }
    this.g.changed()
  }
  /** tracers: a short line for each round in the air */
  private draw() {
    const lines = this.g.scene.lines
    for (const s of this.shots) {
      lines.push({ ax: s.x, ay: s.y, az: s.z, bx: s.x - s.vx * 0.025, by: s.y - s.vy * 0.025, bz: s.z - s.vz * 0.025, sag: 0, col: s.mine ? 0xff60e0ff : 0xff5070ff })
    }
  }
  /** labels: a box round the target, red once locked; each foe's hull */
  labels(put: (key: string, text: string, x: number, y: number, z: number, kind: 'lock' | 'foe' | 'progress', value?: number) => void) {
    if (!this.armed) return
    for (const f of this.foes) {
      if (FOES[f.kind].hp > 6 || f.voyage) put('foe-' + this.foes.indexOf(f), '', f.a.x, f.a.y, f.a.z + 10, 'progress', f.hp / (f.voyage ? 7 : FOES[f.kind].hp))
    }
    if (this.lock) put('lock', this.locked ? $t('锁定') : '', this.lock.a.x, this.lock.a.y, this.lock.a.z + 4, 'lock')
  }
  /** for the HUD */
  view() {
    const s = this.sortie
    const a = this.g.scene.lead
    let bearing = 0, dist = 0
    if (s && a && !s.won) {
      const dx = this.g.world.delta(s.at.x, a.x), dy = this.g.world.delta(s.at.y, a.y)
      dist = Math.hypot(dx, dy)
      const h = this.g.scene.heading
      bearing = Math.atan2(dx * Math.cos(h) - dy * Math.sin(h), -dx * Math.sin(h) - dy * Math.cos(h))
    }
    return {
      hull: this.hull / this.hullMax, ammo: this.ammo, reload: this.reload > 0 ? 1 - this.reload / RELOAD : 0, missiles: this.missilesLeft,
      locked: this.locked, counter: this.clock < this.counterUntil, incoming: this.incoming, word: this.word?.text ?? null,
      sortie: s ? { name: SEAS[s.sea].name, downed: s.downed, need: s.need, won: s.won, bearing, dist } : null,
      down: this.downT >= 0,
    }
  }
}
