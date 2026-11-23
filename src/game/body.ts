// The player's body: strength (体力) and how full they are (饱腹), the clock, and the day's end.
//
// As in Stardew Valley: every swing of a tool takes a little strength; when it runs low the
// player slows down, and when it is gone they cannot work at all until they eat or sleep.
// Hunger creeps up all day; hungry, everything takes half as much again out of you. Food gives
// strength back and fills you up — cooked food far more than raw. Sleeping in your own bed fills
// strength up and starts the next morning. Stay up past two in the morning and you fall asleep
// where you stand: someone carries you home, and it costs you.

import type { Game } from './game'

/** twenty minutes from dawn to dawn */
export const DAY_SECONDS = 1200
import { DISHES, EFFORT, FOOD, ITEMS, type ItemId } from './data'
import { WEATHER_LINE, WEATHER_NAME, type WeatherKind } from './weather'
import { $t } from '../i18n'

type Actor = Game['pilot']

export const MAX_ENERGY = 100
/** how full you get, out of 100, and how fast it goes: two meals a day keep you fed (round 15;
 * it used to be empty in two thirds of a day) */
const HUNGER_PER_SEC = 100 / (DAY_SECONDS * 1.5)
/** the clock: 0 is six in the morning */
export const hourOf = (t: number) => (6 + t * 24) % 24
/** midnight, on the day clock (0 = six in the morning). Round 21: from midnight to dawn staying up
 * costs strength (twice what a day of light work does); run out and you fall asleep where you
 * are. The clock no longer sends anyone to bed. */
export const MIDNIGHT = (24 - 6) / 24
/** strength lost a second, staying up after midnight (about 36 by dawn) */
export const NIGHT_DRAIN = 0.12
/** a nap: two hours */
export const NAP_HOURS = 2

export interface DaySummary { weather?: WeatherKind; hungry?: boolean; away?: string; day: number; coins: number; delivered: number; gathered: number; caught: number; harvested: number; cooked: number; passedOut: boolean; fee: number; late: boolean; tomorrowRain: boolean }

export class Body {
  private nagT = -1
  /** for the long playthrough tests: work never tires, and two in the morning never comes */
  tireless = false
  stayAwake = false
  constructor(private g: Game) {}

  get energy(): number {
    return Math.min(this.max, this.g.save.energy ?? MAX_ENERGY)
  }
  set energy(v: number) {
    this.g.save.energy = Math.max(0, Math.min(this.max, v))
  }
  get full(): number {
    return this.g.save.full ?? 80
  }
  set full(v: number) {
    this.g.save.full = Math.max(0, Math.min(100, v))
  }
  /** starving, the most you can have is less */
  get max(): number {
    return (this.g.save.full ?? 80) <= 0 ? 70 : MAX_ENERGY
  }
  get hungry(): boolean { return this.full < 20 }
  get tired(): boolean { return this.energy < 20 }
  /** walking is slower when tired */
  get pace(): number { return this.energy <= 0 ? 0.6 : this.tired ? 0.78 : 1 }
  get hour(): number { return hourOf(this.g.save.day ?? 0) }
  get clockText(): string {
    const h = this.hour
    const hh = Math.floor(h)
    const mm = Math.floor((h - hh) * 6) * 10
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }
  /** is it going to rain much today (the TV says so the night before) */
  rainyOn(day: number): boolean {
    const k = this.g.weather.kindOn(day)
    return k === 'rain' || k === 'storm'
  }

  /** what a piece of work costs now (hunger and skill counted) */
  effortOf(kind: keyof typeof EFFORT): number {
    return EFFORT[kind] * (this.hungry ? 1.5 : 1) * this.g.skills.effort(kind)
  }
  /** a piece of work: takes its strength, or says you cannot. Returns whether it may go ahead. */
  work(kind: keyof typeof EFFORT): boolean {
    const g = this.g
    const cost = this.tireless ? 0 : EFFORT[kind] * (this.hungry ? 1.5 : 1) * g.skills.effort(kind)
    if (this.energy < cost) {
      if (g.clock > this.nagT) {
        this.nagT = g.clock + 2.5
        g.warn(this.hungry ? $t('又累又饿，干不动了：先吃点东西') : $t('累得干不动了：吃点东西，或者回家睡一觉'))
        const p = g.pilot
        g.scene.burst({ kind: 'water', x: p.x, y: p.y, z: p.z + 12, n: 3, speed: 6, up: 6, life: 0.6, r: 1 })
      }
      return false
    }
    const before = this.energy
    this.energy = before - cost
    this.full = this.full - cost * 0.15
    g.skills.worked(kind)
    if (before >= 20 && this.energy < 20) g.toast($t('有点累了'), true)
    if (before > 0 && this.energy <= 0) g.toast($t('一点力气也没有了'), true)
    g.changed()
    return true
  }

  step(dt: number) {
    const g = this.g
    const was = this.full
    this.full = was - dt * HUNGER_PER_SEC
    if (was >= 20 && this.full < 20) g.toast($t('肚子饿了'), true)
    if (was > 0 && this.full <= 0) g.toast($t('饿坏了'), true)
    // a rest on a seat gives a little back (not past six tenths)
    // a rest on a seat gives a little back, more the softer it is (never all the way: that is the bed's)
    if (g.sitting) {
      const [rate, cap] = ({ seat: [0.8, 60], soft: [1, 70], low: [0.9, 65], lie: [1.2, 80], rock: [1, 70], lean: [0.4, 50] } as Record<string, [number, number]>)[g.sitting.kind ?? 'seat']
      if (this.energy < cap) this.energy = Math.min(cap, this.energy + dt * rate)
    }
    // lying in bed: slowly all the way back
    if (g.house.resting) this.energy = this.energy + dt * 0.5
    // after midnight, still up: it wears you down; empty, and you fall asleep where you are
    const t = g.save.day ?? 0
    if (!this.stayAwake && t >= MIDNIGHT && !g.house.resting && g.mode !== 'flight') {
      const was = this.energy
      this.energy = was - dt * NIGHT_DRAIN
      if (was >= 15 && this.energy < 15) g.toast($t('困得睁不开眼了：再不睡就要倒下了'), true)
      if (this.energy <= 0 && g.mode === 'island' && !g.panel) this.sleep(true)
    }
  }

  // ───────────────────────────────────────────────────────────── eating
  canEat(item: ItemId | null): boolean {
    return !!item && !!FOOD[item]
  }
  /** seated: at a table it fills a tenth more. quiet: the caller shows it (an act). Returns the strength gained. */
  eat(item: ItemId, seated = false, quiet = false): number {
    const g = this.g
    const f = FOOD[item]
    if (!f || g.count(item) < 1) return 0
    if (this.full >= 98) { g.warn($t('吃不下了')); return 0 }
    g.spend({ [item]: 1 })
    // what you cooked yourself does you more good the better a cook you are
    const gain = DISHES.some((d) => d.out === item) ? Math.round(f.energy * (1 + 0.03 * g.skills.level('cook'))) : f.energy
    this.energy = this.energy + gain
    this.full = this.full + Math.round(f.full * (seated ? 1.1 : 1))
    if (quiet) { g.changed(); return gain }
    const p = g.pilot
    g.sfx('pop', 1.3)
    g.after(0.15, () => g.sfx('pop', 1.1))
    g.scene.burst({ kind: 'heart', x: p.x, y: p.y, z: p.z + 12, n: 3, speed: 8, up: 16, life: 0.7, mode: 'float', r: 3 })
    p.stretch = 0.85
    g.settle(p)
    g.float($t('{0} · 体力 +{1}', ITEMS[item].name, gain), p.x, p.y, p.z + 14)
    g.changed()
    return gain
  }

  // ───────────────────────────────────────────────────────────── cooking
  cook(out: ItemId) {
    const g = this.g
    const d = DISHES.find((x) => x.out === out)
    if (!d) return
    if (!g.canPay(d.cost)) return g.warn($t('材料不够'))
    if (!g.fits({ [out]: 1 })) return g.full($t('做好的装不下'))
    g.spend(d.cost)
    // a practised cook sometimes gets two out of the same pot
    const two = g.rnd() < g.skills.extra('cook') && g.fits({ [out]: 2 })
    g.receive({ [out]: two ? 2 : 1 })
    if (two) g.after(0.6, () => g.float($t('熟手：多做了一份{0}', ITEMS[out].name), g.pilot.x, g.pilot.y, g.pilot.z + 18))
    g.skills.gain('cook', 3)
    g.save.stats.cooked = (g.save.stats.cooked ?? 0) + 1
    const p = g.pilot
    g.sfx('craft', 0.8)
    g.after(0.25, () => g.sfx('craft', 1.0))
    g.after(0.5, () => g.sfx('done'))
    g.scene.burst({ kind: 'dust', x: p.x, y: p.y - 6, z: p.z + 12, n: 8, speed: 6, up: 14, life: 1, mode: 'smoke', grav: -6, r: 3 })
    g.toast($t('做好了：{0}', ITEMS[out].name))
    g.changed()
  }

  // ───────────────────────────────────────────────────────────── the bathroom, the TV
  wash(kind: 'shower' | 'bathtub', a: Actor) {
    const g = this.g
    const p = g.pilot
    if (g.save.washed === g.clockDay) return g.float($t('今天已经洗过了'), p.x, p.y, p.z + 14)
    g.save.washed = g.clockDay
    const add = kind === 'bathtub' ? 20 : 12
    this.energy = this.energy + add
    g.sfx('splash', 1.2)
    g.after(0.3, () => g.sfx('splash', 1.5))
    for (let i = 0; i < 4; i++) g.after(i * 0.2, () => g.scene.burst({ kind: 'dust', x: a.x, y: a.y, z: a.z + 10, n: 5, speed: 6, up: 16, life: 1.2, mode: 'smoke', grav: -8, r: 3 }))
    g.float($t('{0} · 体力 +{1}', kind === 'bathtub' ? $t('泡了个澡') : $t('冲了个热水澡'), add), p.x, p.y, p.z + 14)
    g.changed()
  }
  watchTv() {
    const g = this.g
    const today = g.weather.today
    const next = g.weather.kindOn(g.clockDay + 1)
    g.sfx('open', 1.4)
    g.toast($t('天气预报：今天{0}；明天{1}。', WEATHER_NAME[today], WEATHER_LINE[next]))
  }

  // ───────────────────────────────────────────────────────────── the end of the day
  /** the bed will always have you (round 21) */
  get canSleep(): boolean { return true }
  /** a nap (in the day): two hours on, strength back for them; the day does not end */
  get canNap(): boolean {
    const t = this.g.save.day ?? 0
    return t + NAP_HOURS / 24 < 1 // not past dawn: that is a night's sleep
  }
  nap() {
    const g = this.g
    const s = g.save
    if (!this.canNap) return this.sleep(false)
    s.played = (s.played ?? 0) + (DAY_SECONDS * NAP_HOURS) / 24
    s.day = (s.day ?? 0) + NAP_HOURS / 24
    this.energy = Math.min(MAX_ENERGY, this.energy + 35)
    this.full = this.full - 6
    g.house.wakeInBed()
    g.float($t('睡了一觉 · 体力 +35'), g.pilot.x, g.pilot.y, g.pilot.z + 14)
    g.changed()
  }
  goToBed(a: Actor, napping = false) {
    const g = this.g
    // at home in the house: lie down, the eyes close, and the night passes (a moment later)
    if (g.house.active) {
      // the bed actor itself (a caller may pass only where it is): the nearest bed in the house
      g.house.bed = g.house.bedNear(a)
      return g.house.fallAsleep(napping)
    }
    if (napping) return this.nap()
    const p = g.pilot
    p.x = a.x
    p.y = a.y
    p.z = a.z + 4
    p.model = g.scene.models.pilot_sit
    this.sleep(false)
  }
  /** the day ends: at home in bed, or where you fell */
  sleep(passedOut: boolean) {
    const g = this.g
    const s = g.save
    const t = s.day ?? 0
    const late = t > (24 - 6) / 24 // after midnight
    // the night: the time runs on to six the next morning
    s.played = (g.clockDay + 1) * DAY_SECONDS
    s.day = 0
    let fee = 0
    if (passedOut) {
      fee = Math.min(200, Math.floor(s.coins * 0.05))
      s.coins -= fee
      this.energy = MAX_ENERGY * 0.6
    } else this.energy = late ? MAX_ENERGY * 0.85 : MAX_ENERGY
    this.full = this.full - 15
    const sum = this.summary(passedOut, fee, late)
    if (g.save.here !== 'home') sum.away = g.here.def.owner
    sum.hungry = this.full < 30
    sum.weather = g.weather.kindOn(g.clockDay)
    s.dayStart = this.snapshot()
    g.house.getUp()
    g.wakeUp(passedOut)
    g.open({ kind: 'night', summary: sum })
    g.changed()
  }
  /** what the day comes to, against how it started */
  private snapshot() {
    const s = this.g.save
    const st = s.stats
    const gathered = Object.values(st.gathered).reduce((n, v) => n + (v ?? 0), 0)
    return { coins: s.coins, delivered: st.delivered, gathered, caught: st.caught ?? 0, harvested: st.harvested ?? 0, cooked: st.cooked ?? 0 }
  }
  private summary(passedOut: boolean, fee: number, late: boolean): DaySummary {
    const g = this.g
    const a = g.save.dayStart ?? this.snapshot()
    const b = this.snapshot()
    return {
      day: g.clockDay, coins: b.coins - a.coins, delivered: b.delivered - a.delivered, gathered: b.gathered - a.gathered, caught: b.caught - a.caught,
      harvested: b.harvested - a.harvested, cooked: b.cooked - a.cooked, passedOut, fee, late, tomorrowRain: this.rainyOn(g.clockDay),
    }
  }
  /** the morning after a new game or an old save: today starts now */
  start() {
    this.g.save.dayStart ??= this.snapshot()
  }
}
