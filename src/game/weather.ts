// The weather: each day on an island has its own (the same for everybody, and the TV knows it
// the night before) — clear, rain, a storm, snow, or fog — and over the day it comes and goes in
// spells, never all at once. Everything changes smoothly: how hard it rains, how thick the fog
// is, how much snow lies on the ground. The light of the day itself is the renderer's; this
// only tells it the clock and the weather.

import { weatherFor } from './season'
import type { Game } from './game'
import { $t } from '../i18n'

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow' | 'fog'
export const WEATHER_NAME: Record<WeatherKind, string> = { clear: $t('晴'), rain: $t('雨'), storm: $t('暴风雨'), snow: $t('雪'), fog: $t('雾') }
/** what each kind of day is good for, in a line (the TV, the day's summary) */
export const WEATHER_LINE: Record<WeatherKind, string> = {
  clear: $t('晴——适合出海送货'),
  rain: $t('有雨——庄稼长得快，蜗牛青蛙出来，鱼也多'),
  storm: $t('暴风雨——航线难走，在家听雨最好'),
  snow: $t('下雪——岛上会积一层白，窝在屋里烤火吧'),
  fog: $t('大雾——早上看不远，中午才散'),
}

function dayHash(seed: number, day: number, salt = 0) {
  let n = (seed * 374761393 + day * 668265263 + salt * 1274126177) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  n = n ^ (n >>> 16)
  return (n >>> 0) / 4294967296
}

export interface Sky { rain: number; storm: number; snow: number; fog: number }

export class Weather {
  /** how hard each kind is coming down right now (0..1), eased towards what the day wants */
  now: Sky = { rain: 0, storm: 0, snow: 0, fog: 0 }
  /** snow lying on the ground (0..1): it builds up while it snows and melts after */
  cover = 0
  /** set by hand (the dev menu, tests): this kind, this hard, until then */
  private forced: { kind: WeatherKind; until: number } | null = null
  private pushT = 0
  private flashT = 8
  private flash = 0
  /** the white of lightning now (0–1), for the windows */
  get flashNow(): number { return this.flash }
  private wasWet = false
  private wasSnow = false
  constructor(private g: Game) {}

  /** what kind of day it is on a given day */
  kindOn(day: number): WeatherKind {
    // the first two days are fair: a new islander should see the place in sunshine first
    if (day < 2) return day === 1 && dayHash(this.g.save.island.seed, day) < 0.5 ? 'fog' : 'clear'
    // the rest by season: snow only in winter, spring wet, summer clear with thunderstorms, autumn foggy
    return weatherFor(day, dayHash(this.g.save.island.seed, day))
  }
  get today(): WeatherKind {
    return this.forced && this.g.clock < this.forced.until ? this.forced.kind : this.kindOn(this.g.clockDay)
  }
  get raining(): boolean { return Math.max(this.now.rain, this.now.storm) > 0.25 }
  get snowing(): boolean { return this.now.snow > 0.25 }
  get foggy(): boolean { return this.now.fog > 0.3 }

  /** for the dev menu and the tests */
  force(kind: WeatherKind, secs = 120) {
    this.forced = kind === 'clear' && secs <= 0 ? null : { kind, until: this.g.clock + secs }
    if (kind !== 'clear') { this.now = { rain: 0, storm: 0, snow: 0, fog: 0 }; (this.now as unknown as Record<string, number>)[kind] = 1 }
    else this.now = { rain: 0, storm: 0, snow: 0, fog: 0 }
  }

  /** how hard the day's weather should be at this moment: it comes in spells */
  private want(): Sky {
    const g = this.g
    const t = g.save.day ?? 0
    const kind = this.today
    const out: Sky = { rain: 0, storm: 0, snow: 0, fog: 0 }
    if (this.forced && g.clock < this.forced.until) {
      out[kind === 'clear' ? 'rain' : kind] = kind === 'clear' ? 0 : 1
      return out
    }
    const seed = g.save.island.seed
    const day = g.clockDay
    // two slow waves at the day's own phases: spells of it and lulls between
    const spell = (k: number) => {
      const a = Math.sin((t * 6 + dayHash(seed, day, k) * 6.28) * Math.PI)
      const b = Math.sin((t * 13 + dayHash(seed, day, k + 7) * 6.28) * Math.PI)
      return Math.max(0, Math.min(1, 0.55 + 0.45 * a + 0.25 * b))
    }
    switch (kind) {
      case 'rain': out.rain = spell(1) * 0.9 + 0.1; break
      case 'storm': out.storm = Math.max(0.35, spell(2)); out.rain = out.storm; break
      case 'snow': out.snow = spell(3) * 0.8 + 0.2; break
      // fog lies thick in the morning and lifts towards noon, comes back a little at night
      case 'fog': out.fog = t < 0.32 ? 1 - Math.max(0, (t - 0.18) / 0.14) * 0.85 : t > 0.8 ? 0.45 : 0.15; break
      default:
        // a clear day may still have a passing shower, rarely
        out.rain = dayHash(seed, day, 9) < 0.3 ? Math.max(0, spell(4) - 0.75) * 2 : 0
    }
    return out
  }

  step(dt: number) {
    const g = this.g
    const w = this.want()
    const ease = 1 - Math.exp(-dt / 6) // spells come and go over several seconds
    for (const k of ['rain', 'storm', 'snow', 'fog'] as const) this.now[k] += (w[k] - this.now[k]) * ease
    // snow settles while it snows and melts slowly after
    if (this.now.snow > 0.2) this.cover = Math.min(1, this.cover + dt * this.now.snow / 90)
    else this.cover = Math.max(0, this.cover - dt / 240)
    // a storm's lightning, now and then; the thunder a moment after
    if (this.now.storm > 0.4 && g.mode === 'island') {
      this.flashT -= dt
      if (this.flashT <= 0) {
        this.flashT = 6 + g.rnd() * 12
        this.flash = 1
        g.after(0.4 + g.rnd() * 1.2, () => g.sfx('thunder', 0.8 + g.rnd() * 0.4, g.house.active ? 0.6 : 1))
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5)
    // words when it starts and stops (out in it)
    const wet = this.raining
    const snow = this.snowing
    if (g.mode === 'island' && g.onSurface) {
      if (wet && !this.wasWet) g.toast(this.now.storm > 0.3 ? $t('暴风雨来了。在屋里听雨也不错') : $t('下雨了。菜地长得更快；蝴蝶躲起来了，蜗牛和青蛙出来了'))
      if (!wet && this.wasWet) g.toast($t('雨停了'))
      if (snow && !this.wasSnow) g.toast($t('下雪了'))
    }
    this.wasWet = wet
    this.wasSnow = snow
    // tell the renderer (a few times a second is plenty: it only rebuilds when things have moved)
    this.pushT -= dt
    if (this.pushT <= 0) {
      this.pushT = 0.25
      this.push()
    }
  }
  /** the clock, the sky and the overlays, for where the player is */
  push() {
    const g = this.g
    const s = g.save
    const inside = g.house.active
    const under = g.mine.active || g.dive.active
    const n = this.now
    if (inside) {
      // the lamps: plain light by day, warm lamplight after dark (the weather is outside the window)
      // the light in the room follows the day outside, softened: grey on a wet day, dim and lamplit at night
      const t = s.day ?? 0
      const dark = t > 0.6 && t < 0.97 ? Math.min(1, (t - 0.6) / 0.08, (0.97 - t) / 0.03) : 0
      const soft = t > 0.62 && t < 0.97 ? 0.62 + (0.7 - 0.62) * dark : t
      g.setBase({ clock: soft, weather: { rain: n.rain * 0.6, storm: n.storm * 0.6, snow: n.snow * 0.3, fog: 0 }, snowCover: 0, timeOfDay: g.dayPhase(), season: undefined })
      // it rains and snows outside the walls: on the island seen over them and through the windows, never in the rooms
      const wetIn = Math.max(n.rain, n.storm)
      g.scene.setPost({ rain: wetIn * (n.storm > 0.3 ? 1.6 : 1), snow: n.snow, fog: 0, wind: n.storm > 0.3 ? 1.6 : 0.3, dry: g.house.dryBox(), flash: this.flash * 0.35, tint: 0.04 + dark * 0.16, tr: 255, tg: 176, tb: 96 })
      return
    }
    if (under) {
      g.setBase({ clock: 0.3, weather: undefined, snowCover: 0, timeOfDay: 'day', season: undefined })
      g.scene.setPost({ rain: 0, snow: 0, fog: 0, flash: 0, dry: null })
      return
    }
    const se = g.season
    g.setBase({ clock: s.day ?? 0, weather: { rain: n.rain, storm: n.storm, snow: n.snow, fog: n.fog }, snowCover: this.cover, timeOfDay: g.dayPhase(), season: { autumn: se.autumn, winter: se.winter } })
    const out = g.mode === 'island' || g.mode === 'flight'
    // in a squall on the way the voyage has the say
    if (g.mode === 'flight' && g.voyage.inRain) return
    const wet = Math.max(n.rain, n.storm)
    g.scene.setPost({
      rain: out ? wet * (n.storm > 0.3 ? 1.6 : 1) : 0,
      snow: out ? n.snow : 0,
      fog: out ? n.fog * 0.8 : 0,
      flash: this.flash,
      dry: null,
      wind: n.storm > 0.3 ? 1.6 : 0.3,
      tint: wet > 0.05 ? wet * 0.12 : 0, tr: 70, tg: 82, tb: 104,
    })
  }
}
