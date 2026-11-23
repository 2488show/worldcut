// Plays the slice headless and saves screenshots along the way.
//   npm run play -- <out-dir>        (default /tmp/play)
import fs from 'node:fs'
import { PNG } from 'pngjs'
import type { Game } from '../src/game/game'
import { playSlice } from '../tests/play'

const outDir = process.argv[2] || '/tmp/play'
fs.mkdirSync(outDir, { recursive: true })

function shot(g: Game, name: string, scale = 2) {
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
  fs.writeFileSync(`${outDir}/${name}.png`, PNG.sync.write(png))
}

playSlice(shot, (m) => console.log(m))
  .then(() => console.log('screenshots in', outDir))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
