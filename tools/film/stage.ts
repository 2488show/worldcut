// Staged islands for the film: an island as a player would have it at each level 1..10 — the land
// at its size, the house at its tier, the right plane and boat, the level's building, crops in the
// field, a few decorations and pets. Everything goes down through the game's own placing rules.
import { Take } from './rig'
import { LEVELS } from '../../src/game/levels'
import { RICH } from '../../src/game/farm'

const PLANE: [string, number][] = [['sparrow', 1], ['sparrow', 1], ['sparrow', 2], ['sparrow', 3], ['sparrow', 3], ['biplane', 4], ['biplane', 5], ['falcon', 7], ['falcon', 8], ['falcon', 9], ['falcon', 9]]
const BOAT: ([string, number] | null)[] = [null, null, ['skiff', 1], ['skiff', 2], ['skiff', 3], ['sloop', 4], ['sloop', 5], ['freighter', 7], ['freighter', 8], ['freighter', 9], ['flagship', 10]]
const KITS: [number, string][] = [[1, 'furnaceKit'], [4, 'restaurantKit'], [6, 'ranchKit'], [7, 'shopKit'], [8, 'depotKit'], [9, 'lighthouseKit'], [10, 'exchangeKit']]
const DECOR: [number, string][] = [[2, 'bench'], [2, 'flowerBed'], [3, 'lampPost'], [3, 'flag'], [3, 'flowerBed'], [4, 'table'], [4, 'chime'], [4, 'lampPost'], [5, 'fishRack'], [5, 'bench'], [5, 'flowerBed'],
  [6, 'lampPost'], [6, 'flowerBed'], [7, 'trophy'], [7, 'crystalLamp'], [7, 'bench'], [8, 'lampPost'], [8, 'flowerBed'], [8, 'table'], [9, 'goldStatue'], [9, 'crystalLamp'], [10, 'fountain'], [10, 'keeperLamp'], [10, 'flowerBed']]
const PETS: [number, string, string][] = [[3, 'rabbit', 'white'], [4, 'sheep', 'pink'], [6, 'chicken', 'gold'], [8, 'dog', 'blue'], [10, 'cat', 'orange']]
const SEEDS = ['carrotSeed', 'wheatSeed', 'strawberrySeed', 'pumpkinSeed']

/** an item put down at the first spot the game allows, going round and out from (cx, cy) */
export function put(g: any, item: string, cx: number, cy: number, r0 = 14, r1 = 220, step = 5): { x: number; y: number } | null {
  g.save.inv[item] = (g.save.inv[item] ?? 0) + 1
  g.close()
  g.startDecor(item)
  for (let r = r0; r < r1; r += step) for (let a = 0; a < 6.28; a += Math.max(0.08, 5 / r)) {
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r)
    if (g.checkPlace(item, x, y).ok) {
      g.aimAt(x, y)
      g.placeHere()
      return { x, y }
    }
  }
  g.cancelPlacing?.()
  return null
}

export function stageIsland(t: Take, L: number, o: { day?: number; ripe?: number; house?: number } = {}) {
  const g = t.g
  g.save.coins = 99999
  g.save.level = L
  if (LEVELS[L - 1].tier > g.save.island.tier) { g.save.island.tier = LEVELS[L - 1].tier; g.remake(false) }
  g.house.growTo(o.house ?? L - 1)
  // the plane on the runway, the boat at the pier; at 10 the airship too
  const vs: any[] = [{ id: 'p1', type: PLANE[L][0], at: 'home', lv: PLANE[L][1] }]
  if (BOAT[L]) vs.push({ id: 'b1', type: BOAT[L]![0], at: 'home', lv: BOAT[L]![1] })
  if (L >= 10) vs.push({ id: 'a1', type: 'airship', at: 'home', lv: 10 })
  g.save.vehicles = vs
  g.save.activePlane = 'p1'
  g.syncVehicles()
  const lay = g.layouts.home
  const pl = lay.plaza
  const missed: string[] = []
  for (const [lv, kit] of KITS) if (L >= lv && !put(g, kit, pl.x, pl.y, 26, 420, 6)) missed.push(kit)
  // the field: every plot planted, most of the way grown
  if (L >= 2) {
    g.farm.rebuild()
    g.farm.beds.forEach((p: any, i: number) => { p.s = 1; p.care = RICH; p.seed = SEEDS[(i >> 2) % 4]; p.grown = 2000 * (o.ripe ?? 1); p.wetDay = g.clockDay })
    g.farm.rebuild()
  }
  const house = lay.buildings.find((b: any) => b.kind === 'house')
  DECOR.forEach(([lv, item], i) => { if (L >= lv && !put(g, item, i % 2 ? pl.x : house.door?.x ?? house.x, i % 2 ? pl.y : (house.door?.y ?? house.y) + 6, 12, 160, 5)) missed.push(item) })
  g.save.pets = PETS.filter(([lv]) => L >= lv).map(([, sp, col], i) => ({ id: 'pet' + i, sp, col, from: 'peak', giftAt: 9e9, follow: i === 0 }))
  if (o.day !== undefined) g.save.day = o.day
  g.close()
  if (missed.length) console.log(`  (level ${L}: no room for ${missed.join(', ')})`)
  return lay
}

/** the camera yaw that brings the village to the front of the picture, for the island as it now is */
export function frontYaw(g: any): number {
  const lay = g.layouts.home
  return Math.atan2(lay.plaza.x - lay.def.x, lay.plaza.y - lay.def.y)
}
