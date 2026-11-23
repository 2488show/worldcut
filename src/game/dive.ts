// Diving, seen from the side (as in Dave the Diver): the sea has depth. The shallows by the pier
// are bright, with reef fish and coral; further out the floor drops away into blue, then dark,
// and the fish get bigger, quicker and warier. Each island's waters have their own kinds. Air
// runs out faster the deeper you are; jellyfish sting and, deep down, a shark patrols.
//
// Swim with the keys (or tap where to go), aim at a fish and shoot the harpoon; it flies, hits
// or misses, and comes back on its line — with the fish if it was the last blow. Big fish take
// more than one. Things on the sea bed are picked up by hand. Come up before the air is gone.
//
// This is the simulation only (no drawing): the UI paints it (ui/diveview.ts).

import { DIVE, ITEMS, give, type Bag, type ItemId } from './data'
import { mulberry32, type Biome } from './world'
import type { Game } from './game'
import { landFish, sizeOf } from './fishbook'
import { $t } from '../i18n'

/** the dive site, in its own pixels (the view is 320 × 180 of them); 20 pixels to the metre */
export const SITE_W = 1500
export const PX_PER_M = 20
export const VIEW_W = 320
export const VIEW_H = 180
const RANGE = 130 // how far the harpoon flies
const SHOT_SPEED = 420
const SWIM = 62 // pixels a second

export type FishShape = 'fish' | 'tall' | 'long' | 'flat' | 'octo' | 'squid'
export interface Species {
  item: ItemId
  shape: FishShape
  /** body length and height (pixels), and its colours: back, belly, fin, stripe */
  len: number
  ht: number
  col: [number, number, number][]
  /** where it lives (metres) and in which waters (weights) */
  depth: [number, number]
  seas: Partial<Record<Biome, number>>
  hp: number
  speed: number
  /** how near it lets a diver come before it bolts */
  wary: number
  school?: [number, number]
  /** only after dark */
  night?: boolean
}
export const SPECIES: Species[] = [
  { item: 'sardine', shape: 'fish', len: 6, ht: 2, col: [[90, 130, 170], [220, 232, 240], [150, 180, 210]], depth: [1, 10], seas: { forest: 8, rock: 8, pine: 8, dune: 6, atoll: 4 }, hp: 1, speed: 46, wary: 46, school: [5, 9] },
  { item: 'reefFish', shape: 'fish', len: 8, ht: 4, col: [[250, 210, 60], [255, 238, 150], [250, 180, 40], [40, 40, 50]], depth: [1, 12], seas: { atoll: 10, forest: 5, dune: 5 }, hp: 1, speed: 30, wary: 34, school: [2, 4] },
  { item: 'angelfish', shape: 'tall', len: 8, ht: 9, col: [[240, 240, 236], [255, 255, 255], [250, 200, 60], [30, 30, 40]], depth: [3, 14], seas: { atoll: 6, dune: 4 }, hp: 1, speed: 24, wary: 40 },
  { item: 'bream', shape: 'fish', len: 11, ht: 5, col: [[230, 150, 150], [250, 220, 214], [210, 110, 120]], depth: [4, 16], seas: { forest: 7, pine: 6, rock: 5 }, hp: 1, speed: 30, wary: 44 },
  { item: 'mackerel', shape: 'long', len: 12, ht: 4, col: [[60, 130, 130], [226, 236, 240], [40, 90, 100], [30, 70, 90]], depth: [6, 20], seas: { rock: 7, pine: 7, forest: 4 }, hp: 1, speed: 58, wary: 56, school: [3, 5] },
  { item: 'grouper', shape: 'fish', len: 17, ht: 8, col: [[130, 100, 70], [200, 170, 130], [100, 76, 54], [70, 50, 40]], depth: [10, 28], seas: { forest: 5, rock: 6, atoll: 5, dune: 5 }, hp: 2, speed: 18, wary: 34 },
  { item: 'ray', shape: 'flat', len: 20, ht: 4, col: [[120, 130, 140], [230, 230, 220], [90, 100, 110]], depth: [8, 26], seas: { dune: 6, atoll: 4, forest: 3 }, hp: 2, speed: 22, wary: 40 },
  { item: 'octopus', shape: 'octo', len: 12, ht: 10, col: [[200, 90, 80], [240, 150, 130], [160, 60, 60]], depth: [14, 30], seas: { rock: 5, pine: 4, forest: 4, atoll: 3, dune: 3 }, hp: 2, speed: 16, wary: 46 },
  { item: 'squid', shape: 'squid', len: 13, ht: 6, col: [[240, 190, 200], [255, 230, 236], [220, 150, 170]], depth: [16, 30], seas: { rock: 5, pine: 6 }, hp: 1, speed: 52, wary: 60 },
  { item: 'tuna', shape: 'long', len: 26, ht: 9, col: [[50, 80, 140], [220, 228, 236], [240, 200, 60], [40, 60, 110]], depth: [18, 30], seas: { rock: 3, atoll: 2, dune: 2, forest: 2, pine: 2 }, hp: 3, speed: 66, wary: 70 },
  { item: 'moonfish', shape: 'tall', len: 16, ht: 13, col: [[210, 220, 255], [250, 252, 255], [170, 190, 250], [140, 160, 240]], depth: [22, 30], seas: { forest: 1, rock: 1, pine: 1, atoll: 1, dune: 1 }, hp: 3, speed: 36, wary: 64, night: true },
]
/** lying on the sea bed */
export const FLOOR_THINGS: { item: ItemId; depth: [number, number]; weight: number }[] = [
  { item: 'urchin', depth: [2, 30], weight: 40 },
  { item: 'shell', depth: [1, 14], weight: 30 },
  { item: 'lobster', depth: [12, 30], weight: 14 },
  { item: 'pearl', depth: [18, 30], weight: 5 },
]

export interface Fish { id: number; sp: Species; x: number; y: number; vx: number; vy: number; dir: number; hp: number; hurt: number; flee: number; goal: { x: number; y: number }; t: number; ink: number }
export interface Thing { id: number; item: ItemId; x: number; y: number }
export interface Jelly { x: number; y: number; ph: number; vy: number; col: [number, number, number] }
export interface Shark { x: number; y: number; dir: number; charge: number; rest: number; vx: number; vy: number }
export interface Shot { x: number; y: number; vx: number; vy: number; out: number; back: boolean; fish: Fish | null; ox: number; oy: number }
/** what the floor is made of along the way (for drawing): coral, kelp, rocks, anemones */
export interface Decor { x: number; kind: 'coral' | 'kelp' | 'rock' | 'anemone' | 'fan' | 'tube'; size: number; col: [number, number, number]; seed: number }
export interface Bubble { x: number; y: number; r: number; t: number }
/** a crack in the bed breathing air: swim through the bubbles for a gulp (once each) */
export interface Vent { x: number; y: number; used: boolean; t: number }
/** a sunken chest, deep: something in it */
export interface Chest { x: number; y: number; open: boolean }
/** life that is only there to be seen: a turtle going by, lanterns in the deep */
export interface Drifter { kind: 'turtle' | 'lantern' | 'school'; x: number; y: number; vx: number; ph: number }
/** the waters by depth: what each band is called (for the gauge and the first time there) */
export const ZONES: { from: number; name: string }[] = [
  { from: 0, name: $t('浅礁') }, { from: 8, name: $t('海草林') }, { from: 15, name: $t('断崖') }, { from: 23, name: $t('深蓝') },
]

export class Dive {
  active = false
  oxygen = 0
  maxOxygen = 0
  bag: Bag = {}
  count = 0
  /** the diver (pixels of the site; y down from the surface) */
  x = 60
  y = 24
  vx = 0
  vy = 0
  facing = 1
  /** where the harpoon points (radians, 0 = right) */
  aim = 0
  kick = 0
  stun = 0
  hurtT = 0
  sea: Biome = 'forest'
  fish: Fish[] = []
  things: Thing[] = []
  jellies: Jelly[] = []
  shark: Shark | null = null
  shot: Shot | null = null
  decor: Decor[] = []
  bubbles: Bubble[] = []
  /** the floor's depth (pixels) every 10 pixels along */
  floor: number[] = []
  /** an ink cloud left by an octopus (where, how long it lasts) */
  inks: { x: number; y: number; t: number }[] = []
  vents: Vent[] = []
  chest: Chest | null = null
  drifters: Drifter[] = []
  /** the band of water the diver is in now */
  zone = 0
  reload = 0
  private goal: { x: number; y: number } | null = null
  private target: Fish | Thing | null = null
  private uid = 1
  private lastBeep = 99
  private t = 0
  private breath = 1
  constructor(private g: Game) {}

  get metres(): number { return Math.max(0, Math.round(this.y / PX_PER_M)) }
  get depth(): number { return Math.min(1, this.y / (30 * PX_PER_M)) }
  /** the floor's depth (pixels) under a point along the site */
  floorAt(x: number): number {
    const i = Math.max(0, Math.min(this.floor.length - 2, x / 10))
    const a = Math.floor(i)
    return this.floor[a] + (this.floor[a + 1] - this.floor[a]) * (i - a)
  }
  /** the camera: centred on the diver, kept inside the site */
  get cam(): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(SITE_W - VIEW_W, this.x - VIEW_W / 2)),
      y: Math.max(-30, Math.min(30 * PX_PER_M + 40 - VIEW_H, this.y - VIEW_H / 2)),
    }
  }

  enter() {
    const g = this.g
    if (this.active) return
    g.panel = null
    g.stopWalking()
    g.cancelPlacing(true)
    this.sea = g.here.def.biome
    this.build()
    this.active = true
    this.maxOxygen = this.oxygen = (g.count('tank') ? DIVE.oxygenTank : DIVE.oxygen) + (g.skills.has('fish', 0) ? 10 : 0)
    this.bag = {}
    this.count = 0
    this.x = 60
    this.y = 26
    this.vx = this.vy = 0
    this.goal = this.target = null
    this.shot = null
    this.reload = 0
    this.lastBeep = 99
    this.stun = this.hurtT = 0
    g.sfx('splash')
    g.sfx('bubble', 0.6)
    g.toast(g.count('harpoon') ? $t('点哪儿游到哪儿，点鱼就射') : $t('没带鱼枪，只能捡东西'))
    g.changed()
  }
  /** the site: a shelf by the pier, a drop-off, the deep; what grows and swims there */
  private build() {
    const g = this.g
    const rnd = mulberry32(g.here.def.seed * 53 + g.clockDay * 7919)
    // the floor: shallow near the pier, then down a slope, with rocks and gullies
    this.floor = []
    for (let i = 0; i <= SITE_W / 10; i++) {
      const x = i * 10
      const base = x < 260 ? 150 + x * 0.12 : x < 900 ? 181 + (x - 260) * 0.62 : 578 + Math.sin(x * 0.01) * 10
      const bump = Math.sin(x * 0.031 + 1.7) * 14 + Math.sin(x * 0.083) * 6 + (rnd() - 0.5) * 4
      this.floor.push(Math.min(30 * PX_PER_M, Math.max(90, base + bump)))
    }
    // what grows: coral on the shelf, kelp and fans further out, rocks everywhere
    const warm = this.sea === 'atoll' || this.sea === 'dune'
    const cold = this.sea === 'pine' || this.sea === 'rock'
    const corals: [number, number, number][] = warm ? [[244, 124, 136], [252, 164, 92], [190, 120, 230], [250, 210, 120], [110, 200, 210]] : [[200, 110, 120], [230, 150, 100], [150, 120, 190]]
    this.decor = []
    for (let x = 4; x < SITE_W; x += 6 + rnd() * 16) {
      const d = this.floorAt(x) / PX_PER_M
      const r = rnd()
      const kind: Decor['kind'] = d < 12 && r < (warm ? 0.5 : 0.25) ? (rnd() < 0.5 ? 'coral' : rnd() < 0.5 ? 'fan' : 'tube')
        : r < (cold ? 0.45 : 0.25) ? 'kelp' : r < 0.7 ? 'rock' : 'anemone'
      this.decor.push({ x, kind, size: 0.6 + rnd() * 0.9, col: corals[Math.floor(rnd() * corals.length)], seed: Math.floor(rnd() * 1e6) })
    }
    // the fish of these waters, more of them the deeper the water they like
    this.fish = []
    const night = g.dayPhase() === 'night'
    const pool = SPECIES.filter((s) => (s.seas[this.sea] ?? 0) > 0 && (!s.night || night || g.skills.has('fish', 1)))
    const total = pool.reduce((n, s) => n + (s.seas[this.sea] ?? 0), 0)
    const pick = () => {
      let r = rnd() * total
      for (const s of pool) { r -= s.seas[this.sea] ?? 0; if (r <= 0) return s }
      return pool[0]
    }
    for (let n = 0; n < 26; n++) {
      const sp = pick()
      const groups = sp.school ? sp.school[0] + Math.floor(rnd() * (sp.school[1] - sp.school[0] + 1)) : 1
      const y0 = (sp.depth[0] + rnd() * (sp.depth[1] - sp.depth[0])) * PX_PER_M
      // where the floor is deep enough for it
      let x0 = 0
      for (let tries = 0; tries < 30; tries++) {
        x0 = 30 + rnd() * (SITE_W - 60)
        if (this.floorAt(x0) > y0 + 10) break
      }
      for (let k = 0; k < groups; k++) {
        const x = x0 + (rnd() - 0.5) * 30, y = Math.min(this.floorAt(x0) - 6, y0 + (rnd() - 0.5) * 16)
        this.fish.push({ id: this.uid++, sp, x, y, vx: 0, vy: 0, dir: rnd() < 0.5 ? -1 : 1, hp: sp.hp, hurt: 0, flee: 0, goal: { x, y }, t: rnd() * 5, ink: 0 })
      }
    }
    // on the bed
    this.things = []
    for (let n = 0; n < 16; n++) {
      const x = 40 + rnd() * (SITE_W - 80)
      const d = this.floorAt(x) / PX_PER_M
      const ok = FLOOR_THINGS.filter((f) => d >= f.depth[0] && d <= f.depth[1])
      if (!ok.length) continue
      const tot = ok.reduce((a, f) => a + f.weight, 0)
      let r = rnd() * tot
      const f = ok.find((q) => (r -= q.weight) <= 0) ?? ok[0]
      this.things.push({ id: this.uid++, item: f.item, x, y: this.floorAt(x) - 2 })
    }
    // jellyfish drifting in the middle water, and in the deep a shark
    const jc: [number, number, number][] = [[230, 140, 230], [150, 200, 250], [250, 190, 140]]
    this.jellies = []
    for (let n = 0; n < 7; n++) {
      const x = 200 + rnd() * (SITE_W - 240)
      this.jellies.push({ x, y: 120 + rnd() * (this.floorAt(x) - 160), ph: rnd() * 6, vy: 0, col: jc[Math.floor(rnd() * jc.length)] })
    }
    this.shark = { x: 1100 + rnd() * 300, y: 22 * PX_PER_M, dir: -1, charge: 0, rest: 4, vx: 0, vy: 0 }
    this.bubbles = []
    this.inks = []
    // air vents: on the slope and in the deep, a reason to go further
    this.vents = []
    for (const at of [380 + rnd() * 160, 760 + rnd() * 200, 1180 + rnd() * 200]) this.vents.push({ x: at, y: this.floorAt(at) - 2, used: false, t: rnd() * 3 })
    // a chest in the deep
    const cx = 1050 + rnd() * 380
    this.chest = { x: cx, y: this.floorAt(cx) - 3, open: false }
    // a turtle going by in the middle water, lanterns down deep, a shoal of little silver fish
    this.drifters = [
      { kind: 'turtle', x: rnd() * SITE_W, y: 7 * PX_PER_M + rnd() * 6 * PX_PER_M, vx: (rnd() < 0.5 ? -1 : 1) * 9, ph: 0 },
      { kind: 'school', x: 300 + rnd() * 600, y: 5 * PX_PER_M + rnd() * 4 * PX_PER_M, vx: (rnd() < 0.5 ? -1 : 1) * 16, ph: 0 },
    ]
    for (let n = 0; n < 9; n++) { const x = 900 + rnd() * (SITE_W - 920); this.drifters.push({ kind: 'lantern', x, y: 22 * PX_PER_M + rnd() * Math.max(10, this.floorAt(x) - 22 * PX_PER_M - 8), vx: (rnd() - 0.5) * 6, ph: rnd() * 6 }) }
  }

  // ───────────────────────────────────────────────────────────── the player
  /** a tap on the view (its own pixels): a fish → aim and shoot (or swim nearer); a thing → fetch; water → swim there */
  tapView(vx: number, vy: number) {
    const c = this.cam
    const x = c.x + vx, y = c.y + vy
    const g = this.g
    // a fish under the finger (generously)
    let best: Fish | null = null
    let bd = 1e9
    for (const f of this.fish) {
      const d = Math.hypot(f.x - x, f.y - y) - f.sp.len * 0.5
      if (d < 12 && d < bd) { bd = d; best = f }
    }
    if (best) {
      if (!g.count('harpoon')) return g.warn($t('没有鱼枪：鱼抓不住（在工作台的“装备”里做一把）'))
      this.aimAt(best.x, best.y)
      if (Math.hypot(best.x - this.x, best.y - this.y) < RANGE) this.fire()
      else { this.target = best; this.goal = null }
      return
    }
    for (const t of this.things) {
      if (Math.hypot(t.x - x, t.y - y) < 10) {
        this.target = t
        this.goal = null
        g.sfx('tap')
        return
      }
    }
    this.goal = { x, y: Math.max(8, y) }
    this.target = null
  }
  /** the pointer over the water: the harpoon follows it */
  pointAt(vx: number, vy: number) {
    const c = this.cam
    this.aimAt(c.x + vx, c.y + vy)
  }
  private aimAt(x: number, y: number) {
    this.aim = Math.atan2(y - this.y, x - this.x)
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1
  }
  /** shoot where the harpoon points */
  fire() {
    const g = this.g
    if (!g.count('harpoon')) return g.warn($t('没有鱼枪'))
    if (this.shot || this.reload > 0 || this.stun > 0) return
    if (!g.body.work('harpoon')) return
    g.useTool('harpoon')
    const cs = Math.cos(this.aim), sn = Math.sin(this.aim)
    this.shot = { x: this.x + cs * 8, y: this.y + sn * 8, vx: cs * SHOT_SPEED, vy: sn * SHOT_SPEED, out: 0, back: false, fish: null, ox: this.x, oy: this.y }
    this.reload = DIVE.reload * (1 - 0.04 * g.skills.level('fish'))
    g.sfx('harpoon')
    this.puff(this.x + cs * 10, this.y + sn * 10, 3)
  }

  // ───────────────────────────────────────────────────────────── each frame
  step(dt: number) {
    const g = this.g
    this.t += dt
    // air: faster the deeper
    this.oxygen -= dt * (1 + this.metres / 18)
    if (this.oxygen <= 0) return this.blackout()
    if (this.oxygen < 10 && Math.floor(this.oxygen) !== this.lastBeep) {
      this.lastBeep = Math.floor(this.oxygen)
      g.sfx('beep')
    }
    this.reload = Math.max(0, this.reload - dt)
    this.stun = Math.max(0, this.stun - dt)
    this.hurtT = Math.max(0, this.hurtT - dt)
    // where to swim: the keys, or the spot tapped, or what was tapped
    let ax = 0, ay = 0
    const kx = g.keyX, ky = g.keyY
    if (kx || ky) { ax = kx; ay = ky; this.goal = null; this.target = null }
    else {
      const to = this.target ? { x: this.target.x, y: this.target.y } : this.goal
      if (to) {
        const dx = to.x - this.x, dy = to.y - this.y
        const d = Math.hypot(dx, dy)
        const near = this.target && 'sp' in this.target ? RANGE * 0.8 : this.target ? 6 : 3
        if (d <= near) {
          if (this.target && 'sp' in this.target) { this.aimAt(this.target.x, this.target.y); this.fire(); this.target = null }
          else if (this.target) { this.pickUp(this.target as Thing); this.target = null }
          else this.goal = null
        } else { ax = dx / d; ay = dy / d }
      }
    }
    const l = Math.hypot(ax, ay)
    if (l > 0) { ax /= l; ay /= l }
    const sp = this.stun > 0 ? 0 : SWIM
    this.vx += (ax * sp - this.vx) * Math.min(1, dt * 3)
    this.vy += (ay * sp - this.vy) * Math.min(1, dt * 3)
    this.x = Math.max(8, Math.min(SITE_W - 8, this.x + this.vx * dt))
    this.y = Math.max(6, Math.min(this.floorAt(this.x) - 6, this.y + this.vy * dt))
    if (Math.abs(this.vx) > 4 && !this.shot) this.facing = this.vx > 0 ? 1 : -1
    if (!this.shot && l === 0 && !this.target) this.aim = this.facing > 0 ? 0 : Math.PI
    else if (!this.shot && l > 0 && !(this.target && 'sp' in this.target)) this.aim = this.facing > 0 ? 0 : Math.PI
    this.kick += dt * (l > 0 ? 9 : 3)
    // breath: a stream of bubbles
    if (Math.random() < dt * 3) this.bubbles.push({ x: this.x + this.facing * 4, y: this.y - 5, r: 1 + Math.random() * 1.5, t: 0 })
    // and the sound of breathing out, every few seconds
    this.breath -= dt
    if (this.breath <= 0) { this.breath = 2.5 + Math.random() * 1.5; g.sfx('bubble', 0.7 + Math.random() * 0.3, 0.6) }
    for (const b of this.bubbles) { b.t += dt; b.y -= dt * (18 + b.r * 6); b.x += Math.sin(b.t * 6 + b.r) * dt * 6 }
    this.bubbles = this.bubbles.filter((b) => b.y > -4 && b.t < 8)
    this.stepShot(dt)
    this.stepFish(dt)
    this.stepWorld(dt)
    this.stepDanger(dt)
    for (const k of this.inks) k.t -= dt
    this.inks = this.inks.filter((k) => k.t > 0)
  }
  private stepShot(dt: number) {
    const s = this.shot
    if (!s) return
    const g = this.g
    if (!s.back) {
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.out += SHOT_SPEED * dt
      // a fish in its way
      for (const f of this.fish) {
        if (Math.abs(f.x - s.x) < f.sp.len * 0.55 + 2 && Math.abs(f.y - s.y) < f.sp.ht * 0.6 + 2) {
          f.hp--
          f.hurt = 0.4
          this.puff(f.x, f.y, 6)
          if (f.hp <= 0) {
            s.fish = f
            this.fish = this.fish.filter((o) => o !== f)
            g.sfx('collect', 1.2)
          } else {
            // hurt, not caught: it bolts (an octopus leaves its ink)
            f.flee = 2.5
            if (f.sp.shape === 'octo') { this.inks.push({ x: f.x, y: f.y, t: 3 }); f.ink = 1 }
            g.sfx('snap', 1.4)
          }
          s.back = true
          break
        }
      }
      if (s.out >= RANGE || s.y >= this.floorAt(s.x) - 1 || s.y < 0) s.back = true
    } else {
      // reeled back in on its line
      const dx = this.x - s.x, dy = this.y - s.y
      const d = Math.hypot(dx, dy)
      if (d < 8) {
        this.shot = null
        if (s.fish) this.take(s.fish.sp.item, s.fish.x, s.fish.y, true)
        return
      }
      const v = SHOT_SPEED * 0.8
      s.x += (dx / d) * v * dt
      s.y += (dy / d) * v * dt
      if (s.fish) { s.fish.x = s.x; s.fish.y = s.y }
    }
  }
  private stepFish(dt: number) {
    for (const f of this.fish) {
      f.t += dt
      f.hurt = Math.max(0, f.hurt - dt)
      const dx = f.x - this.x, dy = f.y - this.y
      const d = Math.hypot(dx, dy)
      // bolt when the diver comes too near (or after a miss); otherwise drift about its home water
      if (d < f.sp.wary && f.flee <= 0 && Math.random() < dt * 3) f.flee = 1.2 + Math.random()
      let tx: number, ty: number, sp: number
      if (f.flee > 0) {
        f.flee -= dt
        const away = d > 0.1 ? { x: dx / d, y: dy / d } : { x: f.dir, y: 0 }
        tx = f.x + away.x * 40
        ty = f.y + away.y * 20
        sp = f.sp.speed * 1.6
      } else {
        if (Math.hypot(f.goal.x - f.x, f.goal.y - f.y) < 6 || Math.random() < dt * 0.2) {
          f.goal = { x: f.x + (Math.random() - 0.5) * 120, y: Math.max(f.sp.depth[0] * PX_PER_M, Math.min(f.sp.depth[1] * PX_PER_M, f.y + (Math.random() - 0.5) * 40)) }
        }
        tx = f.goal.x
        ty = f.goal.y
        sp = f.sp.speed * 0.45
      }
      const gx = tx - f.x, gy = ty - f.y
      const gl = Math.hypot(gx, gy) || 1
      f.vx += ((gx / gl) * sp - f.vx) * Math.min(1, dt * 2)
      f.vy += ((gy / gl) * sp * 0.5 - f.vy) * Math.min(1, dt * 2)
      f.x = Math.max(4, Math.min(SITE_W - 4, f.x + f.vx * dt))
      const floor = this.floorAt(f.x)
      // bottom dwellers keep to the bed
      const bed = f.sp.shape === 'octo' || f.sp.shape === 'flat'
      f.y = Math.max(6, Math.min(floor - f.sp.ht * 0.5 - 1, f.y + f.vy * dt))
      if (bed && f.flee <= 0) f.y += (floor - f.sp.ht * 0.5 - 2 - f.y) * Math.min(1, dt * 0.8)
      if (Math.abs(f.vx) > 2) f.dir = f.vx > 0 ? 1 : -1
    }
  }
  private stepDanger(dt: number) {
    const g = this.g
    // jellyfish: drift with a slow pulse; a touch stings
    for (const j of this.jellies) {
      j.ph += dt
      j.y += Math.sin(j.ph * 1.6) * dt * 6 - dt * 1.2
      if (j.y < 60) j.y = this.floorAt(j.x) - 30
      if (this.hurtT <= 0 && Math.hypot(j.x - this.x, j.y - this.y) < 8) {
        this.hurtT = 1.5
        this.stun = 0.6
        this.oxygen -= 6
        this.vx = (this.x - j.x) * 6
        this.vy = (this.y - j.y) * 6
        g.sfx('error', 1.3)
        g.toast($t('被水母蜇了 −6 秒'), true)
      }
    }
    // the shark: patrols the deep; comes for a diver who strays down there
    const s = this.shark
    if (!s) return
    s.rest = Math.max(0, s.rest - dt)
    const dx = this.x - s.x, dy = this.y - s.y
    const d = Math.hypot(dx, dy)
    let tx = s.x + s.dir * 50, ty = 22 * PX_PER_M + Math.sin(this.t * 0.4) * 30
    let sp = 26
    if (s.rest <= 0 && this.metres >= 15 && d < 120) { tx = this.x; ty = this.y; sp = 74; s.charge = 1 } else s.charge = 0
    if (s.x < 760) s.dir = 1
    if (s.x > SITE_W - 40) s.dir = -1
    const gx = tx - s.x, gy = ty - s.y
    const gl = Math.hypot(gx, gy) || 1
    s.vx += ((gx / gl) * sp - s.vx) * Math.min(1, dt * 1.5)
    s.vy += ((gy / gl) * sp * 0.6 - s.vy) * Math.min(1, dt * 1.5)
    s.x += s.vx * dt
    s.y = Math.max(14 * PX_PER_M, Math.min(this.floorAt(s.x) - 10, s.y + s.vy * dt))
    if (Math.abs(s.vx) > 3) s.dir = s.vx > 0 ? 1 : -1
    if (s.charge && d < 14 && this.hurtT <= 0) {
      // a bite at the catch bag: a fish lost, and a fright
      this.hurtT = 2
      this.stun = 0.8
      this.oxygen -= 10
      s.rest = 6
      this.vx = Math.sign(dx || 1) * 120
      this.vy = -60
      const items = (Object.keys(this.bag) as ItemId[]).filter((k) => (this.bag[k] ?? 0) > 0)
      const lost = items.length ? items[Math.floor(Math.random() * items.length)] : null
      if (lost) { this.bag[lost]! -= 1; this.count-- }
      g.sfx('robbed')
      g.toast(lost ? $t('鲨鱼！抢走了一条{0}，还少了 10 秒气', ITEMS[lost].name) : $t('鲨鱼！吓了一跳，少了 10 秒气'), true)
    }
  }
  /** the vents, the chest, the band of water, the life passing by */
  private stepWorld(dt: number) {
    const g = this.g
    for (const v of this.vents) {
      v.t += dt
      if (!v.used && Math.random() < dt * 8) this.bubbles.push({ x: v.x + (Math.random() - 0.5) * 4, y: v.y, r: 1 + Math.random() * 2, t: 0 })
      if (!v.used && Math.abs(this.x - v.x) < 10 && this.y > v.y - 60) {
        v.used = true
        this.oxygen = Math.min(this.maxOxygen + 10, this.oxygen + 10)
        this.puff(this.x, this.y, 14)
        g.sfx('bubble', 0.5)
        g.sfx('done', 1.4)
        g.float($t('+10 秒气'), g.pilot.x, g.pilot.y, g.pilot.z + 16)
        g.toast($t('一大口气：+10 秒'))
      }
    }
    const c = this.chest
    if (c && !c.open && Math.hypot(this.x - c.x, this.y - c.y) < 14) {
      c.open = true
      const coins = 60 + Math.floor(g.rnd() * 90)
      g.save.coins += coins
      g.pay(coins, g.pilot.x, g.pilot.y, g.pilot.z + 10)
      if (g.rnd() < 0.5 && this.count < DIVE.bag) { give(this.bag, { pearl: 1 }); this.count++ }
      this.puff(c.x, c.y - 4, 18)
      g.sfx('fanfare')
      g.celebrate(1, $t('沉船的箱子'), $t('{0} 金币{1}', coins, this.bag.pearl ? $t(' · 还有一颗珍珠') : ''), 'pearl')
    }
    // the band of water: the first time down to each, a word about it
    let z = 0
    for (let i = 0; i < ZONES.length; i++) if (this.metres >= ZONES[i].from) z = i
    if (z !== this.zone) {
      this.zone = z
      const seen = (g.save.diveZones ??= 0)
      if (z > seen) {
        g.save.diveZones = z
        g.sfx('rare')
        g.celebrate(1, $t('第一次到了{0}', ZONES[z].name), $t('{0} 米', ZONES[z].from), 'harpoon')
      }
    }
    for (const d of this.drifters) {
      d.ph += dt
      d.x += d.vx * dt
      if (d.kind === 'lantern') d.y += Math.sin(d.ph * 0.7) * dt * 3
      if (d.x < -40) d.x = SITE_W + 30
      if (d.x > SITE_W + 40) d.x = -30
    }
  }
  private puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.bubbles.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, r: 0.8 + Math.random() * 1.6, t: 0 })
  }

  // ───────────────────────────────────────────────────────────── the catch
  private pickUp(t: Thing) {
    const g = this.g
    this.things = this.things.filter((o) => o !== t)
    this.take(t.item, t.x, t.y)
    g.sfx('pick')
  }
  private take(item: ItemId, x: number, y: number, fish = false) {
    const g = this.g
    if (this.count >= DIVE.bag) { g.warn($t('渔获袋满了（{0} 样）：上浮吧', DIVE.bag)); return }
    // a fish is measured as it is taken (a trophy counts as two, if the bag has room)
    const n = fish ? Math.min(DIVE.bag - this.count, landFish(g, item, sizeOf(item, g.rnd, g.skills.level('fish') * 0.01), $t('潜'))) : 1
    give(this.bag, { [item]: n })
    this.count += n
    g.skills.gain('fish', 2)
    this.puff(x, y, 5)
    g.sfx('collect')
    if (!fish) g.toast(`+1 ${ITEMS[item].name}`)
    g.changed()
  }
  /** come up with the catch */
  surface() {
    if (!this.active) return
    const g = this.g
    const bag = this.bag
    this.leave()
    const p = g.pilot
    if (this.count === 0) {
      g.sfx('splash', 0.8)
      return g.toast($t('空着手上来了'))
    }
    g.receive(bag)
    give(g.save.stats.gathered, bag)
    g.save.stats.fished = (g.save.stats.fished ?? 0) + this.count
    g.save.stats.dived = (g.save.stats.dived ?? 0) + 1
    g.sfx('splash')
    g.drop(bag, p.x, p.y, p.z + 8)
    let best: ItemId | null = null
    for (const k of Object.keys(bag) as ItemId[]) if (!best || ITEMS[k].rarity > ITEMS[best].rarity || (ITEMS[k].rarity === ITEMS[best].rarity && ITEMS[k].value > ITEMS[best].value)) best = k
    if (best) g.catchFx(best, $t('带上来 {0} 样：', this.count))
  }
  /** the air ran out: half the catch is lost on the way up */
  private blackout() {
    const g = this.g
    const keep: Bag = {}
    let lost = 0
    let i = 0
    for (const k of Object.keys(this.bag) as ItemId[]) {
      for (let n = 0; n < (this.bag[k] ?? 0); n++) {
        if (i++ % 2 === 0) keep[k] = (keep[k] ?? 0) + 1
        else lost++
      }
    }
    this.leave()
    g.receive(keep)
    give(g.save.stats.gathered, keep)
    g.sfx('robbed')
    g.scene.shake(3)
    g.warn(lost ? $t('气用完了！被拉回码头，丢了 {0} 样渔获', lost) : $t('气用完了！被拉回了码头'))
  }
  private leave() {
    const g = this.g
    this.active = false
    this.shot = null
    this.goal = this.target = null
    g.weather.push()
    g.changed()
  }
}
