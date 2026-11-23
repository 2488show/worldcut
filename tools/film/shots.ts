// The shots of the main film (docs/shotlist.md in the promo folder). Each is a function of the
// format; it leaves footage/<fmt>/<name>/ frames and a <name>.json of what happened when.
import { Take, Fmt, FPS } from './rig'
import { stageIsland, frontYaw, put } from './stage'

export const SHOTS: Record<string, (fmt: Fmt) => Promise<void>> = {}
const WIDE = { '16x9': 0.56, '9x16': 0.3, '1x1': 0.36 }

// 19-21: the island, level 1 to 10, one camera. The land grows at 4 and 7 (the game's own boom).
for (let L = 1; L <= 10; L++) {
  SHOTS[`a19_island_${String(L).padStart(2, '0')}`] = async (fmt) => {
    const t = new Take(`a19_island_${String(L).padStart(2, '0')}`, fmt)
    const lay = stageIsland(t, L, { day: 0.3 })
    const g = t.g
    const yaw0 = frontYaw(g)
    const secs = L === 10 ? 4.6 : L === 1 ? 2.0 : 1.6
    // looking at a point between the island's middle and its village, so the village is never cut off
    const fx = lay.plaza.x - lay.def.x, fy = lay.plaza.y - lay.def.y
    t.cam = (s) => ({ x: lay.def.x + fx * 0.42, y: lay.def.y + fy * 0.42, alt: 0, yaw: yaw0 + (L === 10 ? 0.14 * (s / secs) : 0), zoom: 0.6, mag: fmt === '16x9' ? 1 : 0.6, angle: 33 })
    // the pilot out of the way of the picture's middle: by the house door
    await t.run(2.5)
    // the game's own level-up feel on the first frame: a shake (a big one when the land grows) and sparks
    g.scene.shake(L === 4 || L === 7 || L === 10 ? 7 : 2.5)
    const p = g.pilot
    g.scene.burst({ kind: 'spark', x: p.x, y: p.y, z: p.z + 12, n: L === 10 ? 60 : 24, speed: 30, up: 40, life: 1.2, r: 4 })
    await t.rec(secs)
    t.done()
  }
}


const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
const pad = (n: number) => String(n).padStart(2, '0')
const give = (g: any, bag: Record<string, number>, where: 'inv' | 'store' = 'inv') => { const b = (g.save[where] ??= {}); for (const k in bag) b[k] = (b[k] ?? 0) + bag[k] }
function steer(g: any, x: number, y: number, boost = false) {
  const a = g.scene.lead
  const dx = g.world.delta(x, a.x), dy = g.world.delta(y, a.y)
  const hh = g.scene.heading
  const b = Math.atan2(dx * Math.cos(hh) - dy * Math.sin(hh), -dx * Math.sin(hh) - dy * Math.cos(hh))
  g.scene.setKeys(Math.max(-1, Math.min(1, b * 2)), 0, boost)
  return Math.hypot(dx, dy)
}
const nearest = (g: any, kinds: string[]) => {
  const p = g.pilot
  return g.layouts.home.nodes.filter((n: any) => kinds.includes(n.kind) && !n.depleted).sort((a: any, b: any) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
}
const nearPilot = (g: any, n: { x: number; y: number }, d: number) => Math.hypot(g.pilot.x - n.x, g.pilot.y - n.y) < d

// 1-2: dawn, the wooden plane takes off from the level-1 island (the game's own flight camera)
SHOTS.a01_takeoff = async (fmt) => {
  const t = new Take('a01_takeoff', fmt)
  const g = t.g
  stageIsland(t, 1, { day: 0.03 })
  await t.run(1)
  await g.depart('p1', 'peak'); await settle()
  g.scene.setView('chase')
  let cruise = false
  await t.rec(9, () => { if (!cruise && g.flight?.phase === 'cruise') { cruise = true; t.mark('cruise') } })
  t.done()
}
// 3: picking up a stick and a pebble
SHOTS.a03_pick = async (fmt) => {
  const t = new Take('a03_pick', fmt)
  const g = t.g
  stageIsland(t, 1, { day: 0.1 })
  const up = fmt === '9x16' ? 0 : 9
  t.cam = () => ({ x: g.pilot.x + Math.sin(g.camYaw) * up, y: g.pilot.y + Math.cos(g.camYaw) * up, alt: g.pilot.z, yaw: g.camYaw, zoom: 3.3, angle: 58 })
  await t.run(1)
  for (const kinds of [['stick'], ['pebble'], ['stick', 'pebble']]) {
    const n = nearest(g, kinds)
    if (!n) continue
    g.goGather(n)
    await t.run(30, () => nearPilot(g, n, 26))
    t.mark('near')
    await t.rec(4, undefined, () => n.depleted)
    await t.rec(0.5)
  }
  t.done()
}
// 4: chopping a tree with the stone axe
SHOTS.a04_chop = async (fmt) => {
  const t = new Take('a04_chop', fmt)
  const g = t.g
  stageIsland(t, 1, { day: 0.12 })
  give(g, { stoneAxe: 1 })
  g.islandZoom = 2.6
  await t.run(1)
  const n = nearest(g, ['oak1', 'oak2', 'birch2', 'apple2'])
  g.goGather(n)
  await t.run(40, () => nearPilot(g, n, 16))
  { const yaw = Math.atan2(g.pilot.x - n.x, g.pilot.y - n.y); const up = fmt === '9x16' ? 0 : 11; const mx = (n.x + g.pilot.x) / 2 + Math.sin(yaw) * up, my = (n.y + g.pilot.y) / 2 + Math.cos(yaw) * up; t.cam = () => ({ x: mx, y: my, alt: g.pilot.z + 4, yaw, zoom: 3.3, angle: 52 }) }
  await t.rec(9, undefined, () => n.depleted)
  await t.rec(1.2)
  t.done()
}
// 5: down the mine, breaking rock to copper
SHOTS.a05_mine = async (fmt) => {
  const t = new Take('a05_mine', fmt)
  const g = t.g
  stageIsland(t, 1, { day: 0.2 })
  give(g, { stonePick: 1 })
  await t.run(0.5)
  g.mine.enter(1)
  await t.run(1)
  const m = g.mine
  t.cam = () => ({ x: g.pilot.x, y: g.pilot.y - 4, alt: 4, yaw: 0, zoom: 3.4 })
  for (let k = 0; k < 4; k++) {
    let best = -1, bd = 1e9
    for (let c = 0; c < m.type.length; c++) {
      if (m.type[c] !== 1 || !m.exposed(c)) continue
      const q = m.centre(c)
      const d = Math.hypot(q.x - g.pilot.x, q.y - g.pilot.y) - (m.ore[c] === 'copper' ? 60 : 0)
      if (d < bd) { bd = d; best = c }
    }
    if (best < 0) break
    const q = m.centre(best)
    const before = m.save.dug
    g.scene.setCamera({ x: g.pilot.x, y: g.pilot.y - 4, alt: 4, yaw: 0, zoom: 3.4, snap: true })
    g.scene.render()
    const sp = g.scene.projectPoint(q.x, q.y, 10)
    if (sp) g.tap(sp.x, sp.y)
    await t.rec(8, undefined, () => m.save.dug > before)
    await t.rec(0.5)
  }
  t.done()
}
// 6: the furnace alight at dusk
SHOTS.a06_furnace = async (fmt) => {
  const t = new Take('a06_furnace', fmt)
  const g = t.g
  stageIsland(t, 1, { day: 0.66 })
  give(g, { copperOre: 12, wood: 12, coal: 4 }, 'store')
  const f = g.save.furnace ?? g.layouts.home.furnaceSpot
  g.walkTo({ x: f.x + 8, y: f.y + 10 }, 2, null)
  await t.run(20, () => nearPilot(g, { x: f.x + 8, y: f.y + 10 }, 4))
  t.cam = () => ({ x: f.x, y: f.y + 2, alt: g.pilot.z, yaw: g.camYaw, zoom: 3.2 })
  await t.run(0.4)
  g.smelt('copperIngot', 3)
  await t.rec(4)
  t.done()
}
// 7: at the workbench, three things made (the hammer blows are logged)
SHOTS.a07_bench = async (fmt) => {
  const t = new Take('a07_bench', fmt)
  const g = t.g
  stageIsland(t, 1, { day: 0.2 })
  give(g, { wood: 30, fiber: 20, stick: 10, pebble: 10 }, 'store')
  g.islandZoom = 2.8
  const b = g.layouts.home.buildings.find((x: any) => x.kind === 'workbench')
  g.walkTo(b.door, 3, null)
  await t.run(40, () => nearPilot(g, b.door, 6))
  { const yaw = Math.atan2(g.pilot.x - b.x, g.pilot.y - b.y); t.cam = () => ({ x: (b.x + g.pilot.x) / 2, y: (b.y + g.pilot.y) / 2, alt: g.pilot.z + 3, yaw, zoom: 3.0 }) }
  await t.run(3)
  g.craft('plank', 3)
  await t.rec(5, undefined, () => !g.craftJob)
  await t.rec(0.6)
  t.done()
}
// 8: the first plane built: it stacks up on the runway
SHOTS.a08_rollout = async (fmt) => {
  const t = new Take('a08_rollout', fmt)
  const g = t.g
  const lay = stageIsland(t, 1, { day: 0.22 })
  g.save.vehicles = []; g.save.activePlane = undefined; g.syncVehicles()
  give(g, { plank: 20, copperIngot: 10, cloth: 8 })
  give(g, { plank: 20, copperIngot: 10, cloth: 8 }, 'store')
  const rs = lay.runwayStart
  g.walkTo({ x: rs.x + 10, y: rs.y + 12 }, 3, null, true)
  await t.run(30, () => nearPilot(g, { x: rs.x + 10, y: rs.y + 12 }, 6))
  t.cam = () => ({ x: rs.x, y: rs.y, alt: g.pilot.z, yaw: g.camYaw, zoom: 2.6 })
  await t.run(0.5)
  await t.rec(0.5)
  g.buildVehicle('sparrow')
  t.mark('built')
  await t.rec(3.5)
  t.done()
}
// 9-12: a delivery flight to Stone Peak: the climb, the approach, the landing, the islander
SHOTS.a09_flight = async (fmt) => {
  const t = new Take('a09_flight', fmt)
  const g = t.g
  stageIsland(t, 2, { day: 0.22 })
  await t.run(1)
  await g.depart('p1', 'peak'); await settle()
  g.scene.setView('chase')
  await t.run(14, () => g.flight?.phase === 'cruise')
  await t.rec(6, () => { steer(g, g.layouts.peak.def.x, g.layouts.peak.def.y) })
  await t.run(400, () => { const h = g.hud(); if (!h) return true; g.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false); return h.dist < 560 })
  t.mark('approach')
  let landing = false
  await t.rec(40, () => {
    const h = g.hud()
    if (g.mode !== 'flight' || !h) return
    g.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false)
    if (!landing && g.flight?.canLand === 'peak' && h.dist < 190) { landing = true; g.scene.setKeys(0, 0, false); g.land(); t.mark('land') }
  }, () => g.mode === 'island')
  t.mark('down')
  await settle()
  const lay = g.here
  if (lay.greetAt) g.walkTo(lay.greetAt, 4, null, true)
  t.cam = () => ({ x: g.pilot.x, y: g.pilot.y, alt: g.pilot.z, yaw: g.camYaw, zoom: 2.8 })
  await t.rec(4)
  t.done()
}
// 13: at anchor out at sea in the golden hour, a line in the water (casts and catches are logged)
SHOTS.a13_fishing = async (fmt) => {
  const t = new Take('a13_fishing', fmt)
  const g = t.g
  stageIsland(t, 4, { day: 0.565 })
  give(g, { rod: 1, creel: 1 })
  await t.run(1)
  await g.depart('b1', 'peak'); await settle()
  g.scene.setView('chase')
  await t.run(30, () => g.flight?.phase === 'cruise')
  await t.run(12, () => { g.scene.setKeys(0, 0, false); return false })
  g.dropAnchor()
  await t.run(3)
  g.save.day = 0.6
  let caught = 0
  for (let n = 0; n < 8 && caught < 2; n++) {
    t.mark('cast')
    g.fishing.castAtSea()
    await t.rec(4, undefined, () => g.fishing.phase === 'wait')
    await t.rec(16, undefined, () => g.fishing.phase === 'bite')
    if (g.fishing.phase !== 'bite') { g.fishing.hold(true); await t.rec(0.3); continue }
    t.mark('bite')
    g.press(true)
    await t.rec(40, () => { const f = g.fishing; if (f.phase === 'reel') f.hold(!f.surging && f.tension < 0.6) }, () => g.fishing.phase !== 'reel')
    t.mark('landed')
    await t.rec(2.2)
    caught = (g.save.creel ?? []).length
  }
  t.done()
}
// 14: flying through a storm
SHOTS.a14_storm = async (fmt) => {
  const t = new Take('a14_storm', fmt)
  const g = t.g
  stageIsland(t, 5, { day: 0.4 })
  await t.run(1)
  await g.depart('p1', 'reef'); await settle()
  g.scene.setView('chase')
  await t.run(14, () => g.flight?.phase === 'cruise')
  g.weather.force('storm', 900)
  await t.run(5, () => { steer(g, g.layouts.reef.def.x, g.layouts.reef.def.y); return false })
  await t.rec(9, () => { steer(g, g.layouts.reef.def.x, g.layouts.reef.def.y) })
  t.done()
}
// 15: a walk across the village with the pets behind
SHOTS.a15_pets = async (fmt) => {
  const t = new Take('a15_pets', fmt)
  const g = t.g
  const lay = stageIsland(t, 6, { day: 0.3 })
  for (const p of g.save.pets) p.follow = true
  await t.run(3)
  const a = lay.plaza
  g.pilot.x = a.x - 30; g.pilot.y = a.y + 4
  await t.run(2.5)
  t.cam = () => ({ x: g.pilot.x + 6, y: g.pilot.y, alt: g.pilot.z, yaw: g.camYaw, zoom: 3.0 })
  g.walkTo({ x: a.x + 34, y: a.y + 6 }, 2, null, true)
  await t.rec(4.5)
  t.done()
}
// 16-17: a sortie against the sky pirates: cannon, a missile to roll away from, the answer in threes
SHOTS.a16_combat = async (fmt) => {
  const t = new Take('a16_combat', fmt)
  const g = t.g
  stageIsland(t, 5, { day: 0.5 })
  const v = g.save.vehicles.find((x: any) => x.id === 'p1')
  v.up = ['guns']
  await t.run(1)
  await g.sortie('p1', 'peak'); await settle()
  g.scene.setView('chase')
  await t.run(14, () => g.flight?.phase === 'cruise')
  const c = g.combat
  let rolled = 0, sent = 0, downed = 0, launched = -1, rollAt = -1
  await t.run(200, () => { const s = c.sortie; steer(g, s.at.x, s.at.y); return c.foes.length > 0 })
  t.mark('foes')
  await t.rec(60, (time) => {
    const s = c.sortie
    if (!s) return
    c.hull = Math.max(c.hull, 60)
    const foe = c.foes[0]
    // once one is down: a missile comes in from behind
    if (downed >= 1 && launched < 0) { const a = g.scene.lead; c.launch(a.x - Math.sin(a.yaw) * 300, a.y + Math.cos(a.yaw) * 300, a.z, a.yaw, false, null); launched = time; t.mark('incoming') }
    if (launched >= 0 && rollAt < 0 && c.incoming !== null && c.incoming < 0.45) { g.scene.startRoll(); rollAt = time; rolled++; t.mark('roll') }
    if (foe) {
      steer(g, foe.a.x, foe.a.y)
      c.fire(true)
      // hold the missiles until the roll: the first one after it goes out in threes
      if (rollAt >= 0 && time - rollAt > 0.9 && c.locked && c.missilesLeft > 0 && time - sent > 3) { c.missile(); sent = time; t.mark('missile') }
    } else { c.fire(false); steer(g, s.at.x, s.at.y) }
    if ((s.downed ?? 0) > downed) { downed = s.downed; t.mark('down' + downed) }
  }, () => !!c.sortie?.won || downed >= 3)
  await t.rec(2)
  console.log('  combat: rolled', rolled, 'downed', downed)
  t.done()
}
// 18: dusk, back before the little cabin
SHOTS.a18_home = async (fmt) => {
  const t = new Take('a18_home', fmt)
  const g = t.g
  const lay = stageIsland(t, 1, { day: 0.655 })
  g.islandZoom = 2.2
  const h = lay.buildings.find((b: any) => b.kind === 'house')
  const d = h.door ?? { x: h.x, y: h.y + 30 }
  const ux = d.x - h.x, uy = d.y - h.y, ul = Math.hypot(ux, uy) || 1
  const yaw = Math.atan2(ux, uy)
  g.pilot.x = d.x + (ux / ul) * 34; g.pilot.y = d.y + (uy / ul) * 34
  await t.run(1)
  g.walkTo({ x: d.x + (ux / ul) * 8, y: d.y + (uy / ul) * 8 }, 2, null, true)
  t.cam = () => ({ x: h.x + ux * 0.6, y: h.y + uy * 0.6, alt: g.pilot.z + 6, yaw, zoom: 2.3 })
  await t.rec(4)
  t.done()
}
// 22-23: the house, tier 1 to 10, on the level-10 island, one camera at the front door
for (let k = 1; k <= 10; k++) {
  SHOTS[`a22_house_${pad(k)}`] = async (fmt) => {
    const t = new Take(`a22_house_${pad(k)}`, fmt)
    const g = t.g
    const lay = stageIsland(t, 10, { day: 0.3, house: k - 1 } as never)
    const h = lay.buildings.find((b: any) => b.kind === 'house')
    const d = h.door ?? { x: h.x, y: h.y + 30 }
    const yaw = Math.atan2(d.x - h.x, d.y - h.y)
    const secs = k === 10 ? 3.4 : 1.4
    // the pilot off to one side, out of the way
    g.pilot.x = lay.plaza.x; g.pilot.y = lay.plaza.y
    t.cam = (s) => ({ x: h.x, y: h.y, alt: (h.base ?? 0) + 4, yaw: yaw + (k === 10 ? 0.12 * (s / secs) : 0), zoom: fmt === '16x9' ? 1.7 : 1.25, angle: 27 })
    await t.run(1.5)
    g.scene.shake(k === 10 ? 6 : 2.5)
    g.scene.burst({ kind: 'spark', x: d.x, y: d.y, z: (h.base ?? 0) + 20, n: k === 10 ? 60 : 22, speed: 34, up: 44, life: 1.1, r: 5 })
    await t.rec(secs)
    t.done()
  }
}
// 24: the plane on the runway, level 1 to 9, one camera
const PLANES: [string, number][] = [['sparrow', 1], ['sparrow', 2], ['sparrow', 3], ['biplane', 4], ['biplane', 5], ['biplane', 6], ['falcon', 7], ['falcon', 8], ['falcon', 9]]
const BOATS: [string, number][] = [['skiff', 1], ['skiff', 2], ['skiff', 3], ['sloop', 4], ['sloop', 5], ['sloop', 6], ['freighter', 7], ['freighter', 8], ['freighter', 9], ['flagship', 10]]
// in the air, in the chase view, so the plane sits in the same place in every take
for (let k = 1; k <= 9; k++) {
  SHOTS[`a24_plane_${pad(k)}`] = async (fmt) => {
    const t = new Take(`a24_plane_${pad(k)}`, fmt)
    const g = t.g
    stageIsland(t, 1, { day: 0.3 })
    g.save.vehicles = [{ id: 'p1', type: PLANES[k - 1][0], at: 'home', lv: PLANES[k - 1][1] }]
    g.save.activePlane = 'p1'
    g.syncVehicles()
    await t.run(0.5)
    await g.depart('p1', 'peak'); await settle()
    g.scene.setView('chase')
    await t.run(20, () => g.flight?.phase === 'cruise')
    await t.run(3, () => { g.scene.setKeys(0, 0, false); return false })
    await t.rec(1.3, () => { g.scene.setKeys(0, 0, false) })
    t.done()
  }
}
for (let k = 1; k <= 10; k++) {
  SHOTS[`a24_boat_${pad(k)}`] = async (fmt) => {
    const t = new Take(`a24_boat_${pad(k)}`, fmt)
    const g = t.g
    stageIsland(t, 1, { day: 0.3 })
    g.save.vehicles = [{ id: 'b1', type: BOATS[k - 1][0], at: 'home', lv: BOATS[k - 1][1] }]
    g.syncVehicles()
    await t.run(0.5)
    await g.depart('b1', 'peak'); await settle()
    g.scene.setView('chase')
    await t.run(30, () => g.flight?.phase === 'cruise')
    await t.run(4, () => { g.scene.setKeys(0, 0, false); return false })
    await t.rec(1.3, () => { g.scene.setKeys(0, 0, false) })
    t.done()
  }
}
// 25 and 30: the airship casts off, and flies away into the clouds
SHOTS.a25_airship = async (fmt) => {
  const t = new Take('a25_airship', fmt)
  const g = t.g
  stageIsland(t, 10, { day: 0.63 })
  g.save.activePlane = 'a1'
  g.syncVehicles()
  await t.run(1)
  await g.depart('a1', 'peak'); await settle()
  g.scene.setView('chase')
  let cruise = false
  await t.rec(9, () => { if (!cruise && g.flight?.phase === 'cruise') { cruise = true; t.mark('cruise') } })
  g.setBase({ clouds: 0.95 })
  t.mark('clouds')
  await t.rec(6, () => { g.scene.setKeys(0, 0, false) })
  t.done()
}
// 26: the village at night, lamps and windows lit
SHOTS.a26_night = async (fmt) => {
  const t = new Take('a26_night', fmt)
  const g = t.g
  const lay = stageIsland(t, 10, { day: 0.8 })
  const pl = lay.plaza
  const yaw = frontYaw(g)
  g.pilot.x = pl.x + 6; g.pilot.y = pl.y + 6
  t.cam = (s) => ({ x: pl.x + s * 4, y: pl.y - 6, alt: 6, yaw: yaw - 0.1 + s * 0.02, zoom: 2.0, angle: 27 })
  await t.run(2)
  await t.rec(4.2)
  t.done()
}
// 27: in bed, rain at the window
SHOTS.a27_bed = async (fmt) => {
  const t = new Take('a27_bed', fmt)
  const g = t.g
  stageIsland(t, 2, { day: 0.8 })
  g.weather.force('rain', 900)
  await t.run(4)
  g.house.enter()
  await t.run(1.5)
  const h: any = g.house
  const bed = h.actors.find((e: any) => e.piece.item === 'bed')
  if (!bed) throw new Error('no bed in the house')
  // walk to the bed, then lie down: the game's own way in
  const f = h.floors[bed.piece.f ?? 0]
  t.mark('walk')
  g.walkTo({ x: bed.a.x + 6, y: bed.a.y + 4 }, 3, null, true)
  await t.rec(1.6)
  h.bed = bed.a
  h.lieDown()
  t.mark('lie')
  await t.rec(4.2)
  t.done()
}
// 28: sunrise over the level-10 island (the end card sits on this)
SHOTS.a28_sunrise = async (fmt) => {
  const t = new Take('a28_sunrise', fmt)
  const g = t.g
  const lay = stageIsland(t, 10, { day: 0.035 })
  const yaw0 = frontYaw(g)
  const fx = (lay.plaza.x - lay.def.x), fy = (lay.plaza.y - lay.def.y)
  // 16:9: the island sits low and to the right; the name goes in the sky, the windows over the sea on the left.
  // (zoom stops at 0.6 in the engine: mag is what makes the picture wider than that)
  const lift = fmt === '16x9' ? 38 : fmt === '1x1' ? 40 : 30, side = fmt === '16x9' ? -125 : 0, mag = fmt === '16x9' ? 0.72 : 0.62
  t.cam = (s) => { const yaw = yaw0 + 0.2 - 0.02 * s; return { x: lay.def.x + fx * 0.45 + Math.cos(yaw) * side, y: lay.def.y + fy * 0.45 - Math.sin(yaw) * side, alt: lift, yaw, zoom: 0.6, mag: mag * (1 + 0.012 * s), angle: 30 } }
  await t.run(2)
  await t.rec(5.2)
  t.done()
}
// 29: two in the morning, still hammering at the workbench
SHOTS.a29_latenight = async (fmt) => {
  const t = new Take('a29_latenight', fmt)
  const g = t.g
  stageIsland(t, 3, { day: 0.9 })
  give(g, { wood: 30, fiber: 20 }, 'store')
  g.islandZoom = 2.8
  const b = g.layouts.home.buildings.find((x: any) => x.kind === 'workbench')
  g.walkTo(b.door, 3, null)
  await t.run(40, () => nearPilot(g, b.door, 6))
  { const yaw = Math.atan2(g.pilot.x - b.x, g.pilot.y - b.y); t.cam = () => ({ x: (b.x + g.pilot.x) / 2, y: (b.y + g.pilot.y) / 2, alt: g.pilot.z + 3, yaw, zoom: 3.0 }) }
  await t.run(3)
  g.craft('plank', 4)
  await t.rec(5)
  t.done()
}

export async function shoot(names: string[], fmt: Fmt) {
  for (const n of names) {
    if (!SHOTS[n]) throw new Error('no shot ' + n)
    try { await SHOTS[n](fmt) } catch (e) { console.log(`!! ${n} failed: ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`) }
  }
}
