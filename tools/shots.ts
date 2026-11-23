// Small helpers for looking at the game headless: a Game on a fixed clock, and PNG screenshots.
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { Game } from '../src/game/game'

export function shotTo(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  return (g: Game, name: string, scale = 2) => {
    const bytes = g.scene.render()
    const w = g.scene.width
    const h = g.scene.height
    const png = new PNG({ width: w * scale, height: h * scale })
    for (let y = 0; y < h * scale; y++) {
      for (let x = 0; x < w * scale; x++) {
        const s = (((y / scale) | 0) * w + ((x / scale) | 0)) * 4
        const d = (y * png.width + x) * 4
        png.data[d] = bytes[s]
        png.data[d + 1] = bytes[s + 1]
        png.data[d + 2] = bytes[s + 2]
        png.data[d + 3] = 255
      }
    }
    fs.writeFileSync(`${dir}/${name}.png`, PNG.sync.write(png))
  }
}

export function headless(opts: Record<string, unknown> = {}, w = 427, h = 267) {
  let clock = 1000
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const g = new Game({ now: () => clock, rnd, ...opts })
  g.scene.resize(w, h)
  async function run(sec: number, until?: () => boolean) {
    const n = Math.ceil(sec * 30)
    for (let i = 0; i < n; i++) {
      clock += 1 / 30
      g.update(1 / 30)
      g.scene.render()
      if (i % 15 === 0) await Promise.resolve()
      if (until && until()) return true
    }
    return !until
  }
  return { g, run, advance: (s: number) => { clock += s } }
}
