// A real district stood in the game's sea (concept footage, round 24).
// tools/city/convert.py (in the promo project) turns open building data into a grid: a height and a
// material for every 3 m. Here that grid is pressed into the height map the way the game's own
// buildings are, so the game's renderer draws it: same light, same sea, same haze.
import fs from 'node:fs'
import path from 'node:path'
import { MAT } from '../../src/engine/materials'

export const CITY_DIR = process.env.CITY_DIR || '/home/claude/work/citydata/out'

export interface City {
  name: string
  w: number
  h: number
  /** height of every cell (0 = water), its material (255 = not part of the district), 1 where nobody walks, building number (0 = none) */
  H: Uint8Array
  M: Uint8Array
  S: Uint8Array
  B: Uint16Array
  /** per building (number - 1): centre x, y in cells, height in cells, cells of ground, look */
  rows: [number, number, number, number, number][]
  looks: string[]
  credit: string
}

export function loadCity(name: string): City {
  const meta = JSON.parse(fs.readFileSync(path.join(CITY_DIR, name + '.json'), 'utf8'))
  const buf = fs.readFileSync(path.join(CITY_DIR, name + '.bin'))
  const w = buf.readUInt16LE(0), h = buf.readUInt16LE(2), n = w * h
  const map = (meta.mats as string[]).map((m) => { if (MAT[m] === undefined) throw new Error('no such material: ' + m); return MAT[m] })
  const M = new Uint8Array(n)
  for (let i = 0; i < n; i++) { const v = buf[4 + n + i]; M[i] = v === 255 ? 255 : map[v] }
  const B = new Uint16Array(n)
  for (let i = 0; i < n; i++) B[i] = buf.readUInt16LE(4 + 3 * n + i * 2)
  return { name, w, h, H: new Uint8Array(buf.subarray(4, 4 + n)), M, S: new Uint8Array(buf.subarray(4 + 2 * n, 4 + 3 * n)), B, rows: meta.buildings, looks: meta.looks, credit: meta.credit }
}

/** open sea in a circle, and nothing standing in it */
export function clearSea(g: any, cx: number, cy: number, r: number) {
  const d = 2 * Math.ceil(r) + 1
  const st = { w: d, h: d, rise: new Uint8Array(d * d), mats: new Uint8Array(d * d).fill(255), solid: new Uint8Array(d * d) }
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) if (Math.hypot(x - r, y - r) <= r) st.mats[y * d + x] = MAT.deep
  g.scene.world.place(st, cx, cy, 0)
  const w = g.scene.world
  for (const a of g.scene.actors) if (Math.hypot(w.delta(a.x, cx), w.delta(a.y, cy)) < r + 20 && a !== g.pilot) a.visible = false
}

export interface Stamp {
  /** how much of each building stands, 0..1 (by its number; default all of it) */
  grow?: (bid: number) => number
  /** a building in another look (its number -> look name) */
  look?: Map<number, string>
}

/** the district pressed into the world, centred on (cx, cy). Call again with another `grow` to animate. */
export function stampCity(g: any, c: City, cx: number, cy: number, o: Stamp = {}) {
  const n = c.w * c.h
  const rise = new Uint8Array(n)
  let mats = c.M
  if (o.look && o.look.size) {
    mats = new Uint8Array(c.M)
    const from: Record<number, [string, string]> = {}
    for (const l of c.looks) for (const k of ['Roof', 'Wall', 'Win', 'WinLit']) from[MAT['city' + l + k]] = [l, k]
    for (let i = 0; i < n; i++) {
      const l = o.look.get(c.B[i])
      if (!l) continue
      const f = from[mats[i]]
      // roofs that are tile or plant keep their material; walls and flat roofs take the new look
      if (f) mats[i] = MAT['city' + l + f[1]]
    }
  }
  if (o.grow) {
    const cache = new Map<number, number>()
    for (let i = 0; i < n; i++) {
      const b = c.B[i]
      if (!b) { rise[i] = c.H[i]; continue }
      let k = cache.get(b)
      if (k === undefined) { k = Math.max(0, Math.min(1, o.grow(b))); cache.set(b, k) }
      rise[i] = Math.max(1, Math.round(1 + (c.H[i] - 1) * k))
    }
  } else rise.set(c.H)
  g.scene.world.place({ w: c.w, h: c.h, rise, mats, solid: c.S }, cx, cy, 0)
}

/** world position of a cell of the district */
export const cityAt = (c: City, cx: number, cy: number, x: number, y: number) => ({ x: Math.round(cx - (c.w - 1) / 2) + x, y: Math.round(cy - (c.h - 1) / 2) + y })
