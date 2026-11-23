// Shots for the "next stop" teaser (film B): three real districts stood in the game's sea.
// Concept footage: none of this is in the game yet (docs/DECISIONS.md D155), and every frame of the
// film says so. The districts come from open data (tools/city/convert.py in the promo project).
import './tall'
import { Take, Fmt } from './rig'
import { stageIsland } from './stage'
import { City, loadCity, clearSea, stampCity, cityAt } from './city'

type Shot = (fmt: Fmt) => Promise<void>
export const SHOTS_B: Record<string, Shot> = {}
const STILLS = !!process.env.FILM_STILLS

// a patch of open sea north-east of the home island: the other islands stand on its horizon
const AT = { x: 1750, y: 250 }
const ease = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u) }
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/** film `secs` seconds; `each` sets the world up for second s. With FILM_STILLS=1: three stills instead. */
async function roll(t: Take, secs: number, each: (s: number) => void) {
  // the camera is given its place and left to settle there before a frame is kept (a far camera takes a second to arrive)
  each(0)
  await t.run(1.5)
  if (!STILLS) { const t0 = (t as any).t as number; await t.rec(secs, (tt) => { each(tt - t0) }); return }
  let i = 0
  for (const s of [0, secs * 0.5, secs - 1 / 60]) {
    each(s)
    await t.run(0.05)
    each(s)
    await t.run(1 / 60)
    t.still(`/tmp/probe/b/${t.name}_${t.fmt}_${i++}.png`, 2)
  }
}
function begin(name: string, fmt: Fmt, day: number): Take {
  const t = new Take(name, fmt)
  const g = t.g
  stageIsland(t, 10, { day })
  g.setBase?.({ clouds: 0 })
  return t
}
function city(t: Take, c: City, at = AT, clear = 330) {
  clearSea(t.g, at.x, at.y, clear)
  stampCity(t.g, c, at.x, at.y)
}
/** the level-10 airship, flown by hand: a second one of the player's own, in the air where the shot wants it */
function airship(t: Take) {
  const g = t.g
  g.save.activePlane = 'a1'
  g.syncVehicles()
  const parked = g.vehicleActors.get('a1')
  if (!parked) throw new Error('no airship on the island')
  const a = g.scene.addActor(parked.model, { x: 0, y: 0, z: 60, yaw: 0, scale: parked.scale, shadow: true })
  return (x: number, y: number, z: number, hx: number, hy: number) => { a.x = x; a.y = y; a.z = z; a.yaw = Math.atan2(hx, -hy) }
}
const port = (fmt: Fmt) => fmt !== '16x9'

// 2: the skyline rises out of the sea at dusk, from the middle outwards, and its windows come on
SHOTS_B.b02_rise = async (fmt) => {
  const t = begin('b02_rise', fmt, 0.69)
  const c = loadCity('tokyo')
  clearSea(t.g, AT.x, AT.y, 330)
  const mid = (c.w - 1) / 2
  const delay = c.rows.map((r) => (Math.hypot(r[0] - mid, r[1] - mid) / 210) * 1.5)
  await t.run(0.4)
  await roll(t, 3.0, (s) => {
    stampCity(t.g, c, AT.x, AT.y, { grow: (b) => ease((s - 0.25 - delay[b - 1]) / 0.55) })
    t.cam = () => ({ x: AT.x, y: AT.y + 10, alt: lerp(8, 34, ease(s / 3)), yaw: 2.2 + 0.05 * s, zoom: port(fmt) ? 0.8 : 1.0, mag: port(fmt) ? 0.8 : 1, angle: lerp(20, 15, ease(s / 3)) })
  })
  t.done()
}
// 3: Tokyo (Shibuya), dusk: among the towers
SHOTS_B.b03_tokyo = async (fmt) => {
  const t = begin('b03_tokyo', fmt, 0.69)
  const c = loadCity('tokyo')
  city(t, c)
  const fly = airship(t)
  await t.run(0.4)
  await roll(t, 3.0, (s) => {
    const yaw = -0.6 + 0.07 * s
    t.cam = () => ({ x: AT.x + 20, y: AT.y + 10, alt: 14, yaw, zoom: port(fmt) ? 1.5 : 1.8, angle: port(fmt) ? 24 : 30 })
    // the airship crosses in front of the towers, left to right as the camera sees it
    const rx = Math.cos(yaw), ry = -Math.sin(yaw)
    const k = -70 + 50 * s
    fly(AT.x + 20 - rx * k + Math.sin(yaw) * 46, AT.y + 10 - ry * k + Math.cos(yaw) * 46, 58, -rx, -ry)
  })
  t.done()
}
// 4: Berlin (the Spree bend), morning
SHOTS_B.b04_berlin = async (fmt) => {
  const t = begin('b04_berlin', fmt, 0.085)
  const c = loadCity('berlin')
  city(t, c)
  await t.run(0.4)
  await roll(t, 3.0, (s) => {
    t.cam = () => ({ x: AT.x + 14 - 4 * s, y: AT.y + 14, alt: 10, yaw: -0.62 + 0.05 * s, zoom: port(fmt) ? 1.35 : 1.7, angle: 29 })
  })
  t.done()
}
// 5: New York (Lower Manhattan), noon: the skyline from the harbour
SHOTS_B.b05_newyork = async (fmt) => {
  const t = begin('b05_newyork', fmt, 0.3)
  const c = loadCity('nyc')
  city(t, c, AT, 360)
  await t.run(0.4)
  await roll(t, 3.0, (s) => {
    t.cam = () => ({ x: AT.x + 10, y: AT.y + 50 - 8 * s, alt: lerp(34, 46, s / 3), yaw: 0.2 - 0.04 * s, zoom: port(fmt) ? 0.72 : 0.9, angle: 13 })
  })
  t.done()
}
// 6: real streets: the plan of the district from above, then block after block stands up
SHOTS_B.b06_extrude = async (fmt) => {
  const t = begin('b06_extrude', fmt, 0.3)
  const c = loadCity('nyc')
  clearSea(t.g, AT.x, AT.y, 360)
  // blocks of 180 m, standing up one after another from the harbour inland, one every eighth note (0.3 s)
  const order = new Map<number, number>()
  const key = (r: number[]) => Math.floor((c.h - r[1]) / 60) * 100 + Math.floor(r[0] / 60)
  ;[...new Set(c.rows.map(key))].sort((a, b) => a - b).forEach((k, i, all) => order.set(k, i / all.length))
  await t.run(0.4)
  await roll(t, 3.0, (s) => {
    stampCity(t.g, c, AT.x, AT.y, { grow: (b) => ease((s - 0.5 - order.get(key(c.rows[b - 1]))! * 1.7) / 0.4) })
    const u = ease((s - 0.4) / 2.4)
    t.cam = () => ({ x: AT.x, y: AT.y + lerp(0, 30, u), alt: lerp(0, 24, u), yaw: 0.25 + 0.05 * s, zoom: 0.6, mag: port(fmt) ? 0.62 : lerp(0.86, 1.0, u), angle: lerp(64, 30, u) })
  })
  t.done()
}
// 7: arriving with what the island earned: the airship comes up the Spree
SHOTS_B.b07_arrive = async (fmt) => {
  const t = begin('b07_arrive', fmt, 0.2)
  const c = loadCity('berlin')
  city(t, c)
  const fly = airship(t)
  await t.run(0.4)
  // along the river, east to west past the bend (cells of the district; the ship keeps above the roofs)
  const path = [[400, 262], [330, 275], [270, 262], [225, 215], [205, 160]].map(([x, y]) => cityAt(c, AT.x, AT.y, x, y))
  const along = (u: number) => { const f = Math.max(0, Math.min(0.999, u)) * (path.length - 1), i = Math.floor(f), k = f - i; return { x: lerp(path[i].x, path[i + 1].x, k), y: lerp(path[i].y, path[i + 1].y, k), hx: path[i + 1].x - path[i].x, hy: path[i + 1].y - path[i].y } }
  await roll(t, 3.0, (s) => {
    const p = along(0.2 + s * 0.14), q = along(0.2 + s * 0.14 + 0.03)
    fly(p.x, p.y, 34, q.x - p.x || p.hx, q.y - p.y || p.hy)
    t.cam = () => ({ x: p.x + 6, y: p.y + 4, alt: 20, yaw: -0.9 + 0.05 * s, zoom: port(fmt) ? 1.5 : 1.9, angle: 26 })
  })
  t.done()
}
// 8: bought: one ordinary house by the river goes into the player's colours, front by front; then a garden on its roof
SHOTS_B.b08_buy = async (fmt) => {
  const t = begin('b08_buy', fmt, 0.3)
  const c = loadCity('berlin')
  const g = t.g
  // an ordinary block north of the river (never a public building): mid-sized, plaster, near this cell
  const want = { x: 268, y: 172 }
  let best = -1, bd = 1e9
  c.rows.forEach((r, i) => { const d = Math.hypot(r[0] - want.x, r[1] - want.y); if (r[3] >= 140 && r[3] <= 520 && r[2] >= 6 && r[2] <= 9 && d < bd) { bd = d; best = i } })
  if (best < 0) throw new Error('no house to buy')
  const bid = best + 1, row = c.rows[best]
  const at = cityAt(c, AT.x, AT.y, row[0], row[1])
  clearSea(g, AT.x, AT.y, 330)
  // the cells of that house, in the order the paint goes round it
  const cells: number[] = []
  for (let i = 0; i < c.B.length; i++) if (c.B[i] === bid) cells.push(i)
  const ang = (i: number) => Math.atan2((i / c.w | 0) - row[1], (i % c.w) - row[0])
  cells.sort((a, b) => ang(a) - ang(b))
  const base = { M: new Uint8Array(c.M), H: new Uint8Array(c.H) }
  const { MAT } = await import('../../src/engine/materials')
  const swap: Record<number, number> = {}
  for (const l of c.looks) for (const k of ['Roof', 'Wall', 'Win', 'WinLit']) swap[MAT['city' + l + k]] = MAT['cityYours' + k]
  swap[MAT.cityTileRed] = MAT.cityYoursRoof; swap[MAT.cityTileGrey] = MAT.cityYoursRoof
  // how far in from the front each roof cell is: the garden goes in the middle
  const inner = cells.filter((i) => [1, -1, c.w, -c.w].every((d) => c.B[i + d] === bid) && [2, -2, 2 * c.w, -2 * c.w].every((d) => c.B[i + d] === bid))
  await t.run(0.4)
  t.mark('hold')
  await roll(t, 3.6, (s) => {
    // 0.6 s as it was; painted round in 1.8 s (six eighth notes); the garden at 2.4 s
    const done = Math.floor(Math.max(0, Math.min(1, (s - 0.6) / 1.8)) * 6) / 6
    c.M.set(base.M); c.H.set(base.H)
    const n = Math.round(cells.length * done)
    for (let j = 0; j < n; j++) { const i = cells[j]; if (swap[c.M[i]] !== undefined) c.M[i] = swap[c.M[i]] }
    if (s >= 2.4) inner.forEach((i, j) => { c.M[i] = j % 7 === 3 ? MAT.cityTree : j % 5 === 1 ? MAT.grassLight : MAT.grass; if (j % 7 === 3) c.H[i] = base.H[i] + 2 })
    stampCity(g, c, AT.x, AT.y)
    t.cam = () => ({ x: at.x, y: at.y + 2, alt: row[2] * 0.6, yaw: -0.5 + 0.09 * s, zoom: 3, mag: port(fmt) ? 1.5 : 2.0, angle: 36 })
  })
  c.M.set(base.M); c.H.set(base.H)
  t.done()
}
// 11: the archipelago: the player's island, and the three cities around it
SHOTS_B.b11_chart = async (fmt) => {
  const t = begin('b11_chart', fmt, 0.3)
  const g = t.g
  const places: [string, { x: number; y: number }, number][] = [['tokyo', { x: 1024, y: 470 }, 240], ['berlin', { x: 464, y: 1330 }, 240], ['nyc', { x: 1584, y: 1330 }, 270]]
  // the islands and reefs that stand where a city goes are taken out of this picture
  clearSea(g, 400, 1560, 215); clearSea(g, 1840, 1240, 90); clearSea(g, 1310, 1380, 70)
  for (const [n, at, r] of places) { clearSea(g, at.x, at.y, r); stampCity(g, loadCity(n), at.x, at.y) }
  await t.run(0.4)
    // far above and far back (near 12): from there the sea is nearly a chart, every island at the same scale
  const cam = (s: number) => ({ x: 1024, y: port(fmt) ? 980 : 1050, alt: 0, yaw: 0, zoom: 0.6, near: 12, mag: (port(fmt) ? 0.2 : 0.27) * (1 + 0.012 * s), angle: port(fmt) ? 62 : 50 })
  await roll(t, 5.2, (s) => { t.cam = () => cam(s) })
  // where the four places are on the screen, for the routes the film draws (first and last frame)
  for (const [tag, s] of [['a', 0], ['b', 5.2]] as const) {
    g.scene.setCamera({ ...cam(s), snap: true }); g.scene.render()
    for (const [n, at] of [['home', { x: 1024, y: 1024 }], ...places.map(([n, at]) => [n, at])] as [string, { x: number; y: number }][]) {
      const p = g.scene.projectPoint(at.x, at.y, 20)
      if (p) t.events.push({ f: 0, name: `@pt:${tag}:${n}:${p.x.toFixed(1)}:${p.y.toFixed(1)}` })
    }
  }
  t.done()
}

export async function shootB(names: string[], fmt: Fmt) {
  for (const n of names) {
    try { await SHOTS_B[n](fmt) } catch (e) { console.error('!! ' + n + ': ' + (e as Error).message) }
  }
}
