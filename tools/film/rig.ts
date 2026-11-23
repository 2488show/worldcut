// Film rig (promo, round 24): the game run headless on a fixed clock, every frame kept.
// A take is a Game at film size (480x270, shown x4 = 1920x1080; 270x480 upright; 270x270 square),
// stepped at 60 frames a second. rec() keeps frames, run() only lets time pass. The camera can be
// taken over (cam), game time can run faster or slower than film time (speed), and what the game
// plays as sound is logged with the frame it happened on (events), so cuts can be put on the beat.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { Game } from '../../src/game/game'

export const FPS = 60
export const SIZE = { '16x9': [480, 270], '9x16': [270, 480], '1x1': [270, 270] } as const
export type Fmt = keyof typeof SIZE
export const OUT = process.env.FILM_OUT || '/home/claude/work/promo/footage'
export type Cam = { x?: number; y?: number; alt?: number; yaw?: number; zoom?: number; angle?: number | null; near?: number | null; mag?: number | null; free?: boolean; haze?: number }

export class Take {
  g: any
  w: number
  h: number
  frames = 0
  events: { f: number; name: string }[] = []
  /** the camera for film frame n of this take (or null: the game's own) */
  cam: ((t: number, n: number) => Cam | null) | null = null
  speed = 1
  private clock = 1000
  private fd = -1
  private t = 0
  constructor(public name: string, public fmt: Fmt, opts: Record<string, unknown> = {}, private dir = OUT) {
    let seed = (opts.rseed as number) ?? 777
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    this.g = new Game({ now: () => this.clock, rnd, seed: 4242, ...opts } as never)
    ;[this.w, this.h] = SIZE[fmt]
    const g = this.g
    g.scene.resize(this.w, this.h)
    g.body.tireless = true
    g.body.stayAwake = true
    g.visits.enabled = false
    g.save.welcomed = true
    g.close?.()
    g.onFx = (e: any) => { if (e.t === 'sfx') this.events.push({ f: this.frames, name: e.name }); else if (e.t === 'celebrate' || e.t === 'fly' || e.t === 'float') this.events.push({ f: this.frames, name: e.t + ':' + (e.title ?? e.icon ?? e.text ?? '') }) }
  }
  private step(keep: boolean) {
    const dt = this.speed / FPS
    this.clock += dt
    this.g.update(dt)
    const c = this.cam ? this.cam(this.t, this.frames) : null
    if (c) this.g.scene.setCamera({ ...c, snap: true })
    const bytes: Uint8ClampedArray = this.g.scene.render()
    if (keep) {
      if (this.fd < 0) {
        fs.mkdirSync(path.join(this.dir, this.fmt), { recursive: true })
        this.fd = fs.openSync(this.raw, 'w')
      }
      fs.writeSync(this.fd, bytes)
      this.frames++
      this.t += 1 / FPS
    }
  }
  private get raw() { return path.join(this.dir, this.fmt, this.name + '.rgba') }
  /** time passes, nothing is kept */
  async run(sec: number, until?: () => boolean) {
    for (let i = 0; i < Math.ceil(sec * FPS / this.speed); i++) {
      this.step(false)
      if (i % 30 === 0) await Promise.resolve()
      if (until && until()) return true
    }
    return !until
  }
  /** keep sec seconds of film (each: before every frame, with the film time since the take began) */
  async rec(sec: number, each?: (t: number, n: number) => void | boolean, until?: () => boolean) {
    for (let i = 0; i < Math.round(sec * FPS); i++) {
      if (each && each(this.t, this.frames) === false) break
      this.step(true)
      if (i % 30 === 0) await Promise.resolve()
      if (until && until()) return true
    }
    return !until
  }
  mark(name: string) { this.events.push({ f: this.frames, name: '@' + name }) }
  /** one frame as a PNG (for looking at), x4 */
  still(file: string, scale = 4) {
    const bytes: Uint8ClampedArray = this.g.scene.render()
    const tmp = file + '.rgba'
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, bytes)
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb0', '-s', `${this.w}x${this.h}`, '-i', tmp, '-vf', `scale=iw*${scale}:ih*${scale}:flags=neighbor`, '-frames:v', '1', file])
    fs.rmSync(tmp)
  }
  /** the kept frames become footage/<fmt>/<name>/00000.png … and <name>.json says what happened when */
  done() {
    if (this.fd < 0) return
    fs.closeSync(this.fd)
    const dir = path.join(this.dir, this.fmt, this.name)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb0', '-s', `${this.w}x${this.h}`, '-r', String(FPS), '-i', this.raw, '-start_number', '0', path.join(dir, '%05d.png')], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('ffmpeg failed for ' + this.name)
    fs.rmSync(this.raw)
    fs.writeFileSync(path.join(this.dir, this.fmt, this.name + '.json'), JSON.stringify({ name: this.name, fmt: this.fmt, frames: this.frames, events: this.events }))
    console.log(`${this.fmt}/${this.name}: ${this.frames} frames (${(this.frames / FPS).toFixed(2)} s)`)
  }
}
