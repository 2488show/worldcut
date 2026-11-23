// The archipelago: which islands exist, what each is like, and — once the land has been
// generated — where its runway, village, pier, mine and landmark go and what grows on it.
//
// An island is a seed and a few numbers. Its outline, hills, riches and layout all follow from
// those, so an island is cheap to store on a server and "blow it up and roll again" is a new seed.
// The layout is read off the land: the runway takes the flattest low strip, the village the
// flat ground beside it, the pier the nearest deep water, the mine the foot of the highest hill.

import { runwayStamp, pierStamp, groundStamp, turned, type Stamp } from '../engine/stamps'
import { NODES, type ItemId, type NodeKind } from './data'
import { $t } from '../i18n'

export type Biome = 'forest' | 'rock' | 'atoll' | 'pine' | 'dune'
export type BuildingKind = 'hangar' | 'workbench' | 'board' | 'crates' | 'house' | 'furnace' | 'pier' | 'mine' | 'landmark' | 'restaurant' | 'ranch' | 'shop' | 'depot' | 'lighthouse' | 'exchange'
export type LandmarkKind = 'lighthouse' | 'greatTree' | 'spire' | 'wreck' | 'windmill' | 'beacon'

export interface Point { x: number; y: number }
export interface Site extends Point { yaw: number }
interface Flat { x: number; y: number; w: number; h: number; blend: number; raise: boolean }

export interface IslandDef {
  id: string
  name: string
  owner: string
  /** which islander model the owner is */
  ownerModel: string
  /** true for the island the player owns */
  home: boolean
  /** an islet with nobody on it: no village, nothing to land on */
  wild?: boolean
  /** another player's island (online): laid out exactly as their own home is */
  guest?: boolean
  /** not on anyone's chart until the player has found the way there */
  hidden?: boolean
  /** where its land's noise is taken from, when not from where it lies (a guest's island: from the middle of a chart) */
  nx?: number
  ny?: number
  x: number
  y: number
  r: number
  biome: Biome
  seed: number
  tier: number
  // the shape (read by the engine's generator)
  relief: number
  sand: number
  trees: number
  scrub: number
  rough: number
  plateau: number
  lagoon: number
  lobes: { k: number; a: number; ph: number }[]
  peaks: { dx: number; dy: number; h: number; w: number }[]
  flats: Flat[]
  // its character
  roof: string
  landmark: LandmarkKind
  /** how rich it is in each thing, 0.8 … 1.25: they always add up to 3, so no island is simply better */
  rich: { wood: number; ore: number; fish: number }
  /** what its shop sells and what its people tend to order */
  sells: ItemId[]
  wants: ItemId[]
  /** how pirate-ridden the way there is, 0 … 3 */
  danger: number
  plan?: Plan
}

/** where things go on an island, decided from the lie of the land before it is levelled */
export interface Plan {
  /** a: where a plane stands and starts its run · b: the far end · ux, uy: the direction a → b */
  runway: { ax: number; ay: number; bx: number; by: number; ux: number; uy: number; ns: boolean }
  /** the village: its centre, and the side of the runway it lies on (unit vector from the runway) */
  plaza: { x: number; y: number; w: number; h: number; vx: number; vy: number }
  hangar: Site
  pier: { x: number; y: number; dx: number; dy: number; shore: number }
  mine: Site | null
  landmark: Point
  paths: { x0: number; y0: number; x1: number; y1: number }[]
  /** the player's own house (home island only): a real building you walk into. Its centre, and
   * which way its front door faces (quarter turns: 0 south, 1 west, 2 north, 3 east) */
  house?: { x: number; y: number; rot: number }
}

export interface NodeInst {
  id: string
  kind: NodeKind
  x: number
  y: number
  yaw: number
  depleted: boolean
  /** the ground it stands on, how tall it is and half its size: where it is on screen, for taps */
  base: number
  rise: number
  hw: number
  hh: number
}
export interface BuildingInst {
  id: string
  kind: BuildingKind
  /** the prop it is drawn as ('' for the pier, which is part of the ground) */
  model: string
  x: number
  y: number
  yaw: number
  /** where the pilot stands to use it */
  door: Point
  /** its footprint (already turned to its yaw) */
  w: number
  h: number
  /** the ground it stands on and how tall it is */
  base: number
  rise: number
}
export interface IslandLayout {
  def: IslandDef
  /** centre of the village */
  plaza: Point
  spawn: Point
  /** the runway: where a plane stands (and its take-off heading), and the far end */
  runwayStart: Site
  runwayEnd: Point
  /** where the pilot stands to board the plane, and where someone waits for a delivery */
  boardAt: Point
  greetAt: Point
  /** where a boat lies at the pier, pointing out to sea; a point in open water straight off it */
  berth: Site
  seaward: Point
  pierEnd: Point
  buildings: BuildingInst[]
  nodes: NodeInst[]
  /** a default spot for the first furnace */
  furnaceSpot: Point
  landmark: Point
}

export const RUNWAY_LEN = 100
const RUNWAY_W = 13
const PLAZA_U = 88 // the village's size along the runway …
const PLAZA_V = 60 // … and away from it

/** how big each prop's footprint is (at yaw 0), and how tall: from the models in engine/props.ts */
/** the player's own house on the home island, walls included (the inside is 89 × 63, see house.ts) */
export const HOME_W = 95
export const HOME_L = 69
export const BUILDING_SIZE: Record<string, [w: number, h: number, rise: number]> = {
  hangar: [41, 29, 22], workbench: [17, 11, 12], board: [19, 7, 16], crates: [17, 13, 12], furnace: [15, 15, 23],
  house: [29, 23, 24], homeHouse: [HOME_W, HOME_L, 26], mine: [25, 19, 17], restaurant: [31, 23, 18], est_ranch: [33, 27, 20], est_shop: [25, 19, 18], est_depot: [35, 25, 20], est_lighthouse: [15, 15, 40], est_exchange: [33, 23, 24],
  lighthouse: [13, 13, 45], beacon: [15, 15, 57], greatTree: [9, 9, 45], spire: [19, 19, 43], wreck: [17, 37, 19], windmill: [15, 15, 33],
}

export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────────────────────────────────────────────────────── what an island is like
const BIOMES: Record<Biome, { relief: number; sand: number; trees: number; scrub: number; plateau: number; lagoon: number; peaks: [number, number]; peakH: [number, number] }> = {
  forest: { relief: 0.72, sand: 0.035, trees: 1, scrub: 0.5, plateau: 0.74, lagoon: 0, peaks: [1, 2], peakH: [0.22, 0.34] },
  rock: { relief: 1.05, sand: 0.018, trees: 0.3, scrub: 0.4, plateau: 0.8, lagoon: 0, peaks: [2, 3], peakH: [0.3, 0.42] },
  atoll: { relief: 0.36, sand: 0.11, trees: 0.25, scrub: 0.5, plateau: 0.7, lagoon: 0.42, peaks: [0, 1], peakH: [0.1, 0.16] },
  pine: { relief: 0.95, sand: 0.024, trees: 1.5, scrub: 0.6, plateau: 0.76, lagoon: 0, peaks: [2, 2], peakH: [0.26, 0.38] },
  dune: { relief: 0.5, sand: 0.15, trees: 0.12, scrub: 0.3, plateau: 0.72, lagoon: 0, peaks: [1, 2], peakH: [0.2, 0.3] },
}
/** how big the home island is at each level, and what it costs to get there */
export const TIERS = [
  { r: 200, name: $t('小岛'), cost: 0, mine: 6 },
  { r: 250, name: $t('大岛'), cost: 600, mine: 9 },
  { r: 300, name: $t('群峰之岛'), cost: 2200, mine: 12 },
]

interface IslandSpec {
  id: string; name: string; owner: string; ownerModel: string; home?: boolean; wild?: boolean; guest?: boolean; hidden?: boolean
  x: number; y: number; r: number; biome: Biome; seed: number; tier?: number
  roof?: string; landmark?: LandmarkKind; sells?: ItemId[]; wants?: ItemId[]; danger?: number
}

/** an island from its seed: outline, hills, riches. The same seed always gives the same island. */
export function makeIsland(s: IslandSpec): IslandDef {
  const b = BIOMES[s.biome]
  const rnd = mulberry32(s.seed * 2654435761 + 97)
  const tier = s.tier ?? 1
  const between = (a: number, z: number) => a + rnd() * (z - a)
  // headlands and bays
  const lobes = [
    { k: 2, a: between(0.05, 0.15), ph: rnd() * 6.283 },
    { k: 3, a: between(0.04, 0.11), ph: rnd() * 6.283 },
    { k: 5, a: between(0.02, 0.05), ph: rnd() * 6.283 },
  ]
  // hills, set off from the middle; a bigger island has more of them
  const n = Math.round(between(b.peaks[0], b.peaks[1])) + (tier - 1)
  const peaks = []
  const a0 = rnd() * 6.283
  for (let i = 0; i < n; i++) {
    const ang = a0 + (i / Math.max(1, n)) * 6.283 + between(-0.5, 0.5)
    const d = between(0.3, 0.5) * s.r
    peaks.push({ dx: Math.cos(ang) * d, dy: Math.sin(ang) * d, h: between(b.peakH[0], b.peakH[1]), w: between(0.16, 0.24) * s.r })
  }
  // riches: three shares that always add up to 3
  let w = [between(0.8, 1.25), between(0.8, 1.25), between(0.8, 1.25)]
  const sum = w[0] + w[1] + w[2]
  w = w.map((v) => Math.min(1.3, Math.max(0.75, (v * 3) / sum)))
  const marks: LandmarkKind[] = ['lighthouse', 'greatTree', 'windmill', 'wreck']
  return {
    id: s.id, name: s.name, owner: s.owner, ownerModel: s.ownerModel, home: !!s.home, wild: s.wild, guest: s.guest, hidden: s.hidden,
    x: s.x, y: s.y, r: s.r, biome: s.biome, seed: s.seed, tier,
    relief: b.relief, sand: b.sand, trees: b.trees, scrub: b.scrub, rough: between(0.18, 0.28), plateau: b.plateau, lagoon: b.lagoon,
    lobes, peaks, flats: [],
    roof: s.roof ?? ['houseRed', 'houseBlue', 'houseGreen', 'houseSand'][Math.floor(rnd() * 4)],
    landmark: s.landmark ?? marks[Math.floor(rnd() * marks.length)],
    rich: { wood: w[0], ore: w[1], fish: w[2] },
    sells: s.sells ?? [], wants: s.wants ?? [], danger: s.danger ?? 0,
  }
}
/** in a word, what an island's riches are (for the re-roll screen) */
export function richText(def: IslandDef): string {
  const word = (v: number) => (v > 1.12 ? $t('丰富') : v < 0.9 ? $t('偏少') : $t('一般'))
  return $t('林木{0} · 矿藏{1} · 鱼群{2}', word(def.rich.wood), word(def.rich.ore), word(def.rich.fish))
}

export interface WorldDef {
  seed: number
  islands: IslandDef[]
  start: Point
  /** an empty stretch of sea where the mine and the sea bed are built while the player is in them */
  under: Point
  plan(api: PlanApi): void
}
export interface PlanApi {
  N: number
  sea: number
  elev(x: number, y: number): number
  islandAt(x: number, y: number): number
}

/**
 * The slice's sea: the player's island (from their seed, at their level) and four neighbours —
 * stand-ins for other players — at different distances, plus a few bare islets.
 */
/** another player's island, as much of it as is needed to grow it again here */
export interface GuestIsland {
  id: string; name: string; owner: string; seed: number; tier: number
  /** which of the open-water slots it lies in */
  slot?: number
  /** its furniture, relative to the middle of its village */
  decor?: { item: ItemId; dx: number; dy: number; rot?: number }[]
}
/** where other players' islands lie on everyone's chart: open water, clear of everything else */
const HOME_AT = { x: 1024, y: 1024 }
export const GUEST_SLOTS = [{ x: 900, y: 260 }, { x: 1900, y: 1750 }]

export function makeWorldDef(home: { seed: number; tier: number }, guests: GuestIsland[] = []): WorldDef {
  const t = TIERS[Math.min(TIERS.length, Math.max(1, home.tier)) - 1]
  const islands: IslandDef[] = [
    makeIsland({ id: 'home', name: $t('你的小岛'), owner: $t('你'), ownerModel: 'pilot', home: true, x: 1024, y: 1024, r: t.r, biome: 'forest', seed: home.seed, tier: home.tier }),
    makeIsland({
      id: 'peak', name: $t('石峰岛'), owner: $t('阿澈'), ownerModel: 'islanderA', x: 1530, y: 740, r: 150, biome: 'rock', seed: 11,
      roof: 'houseBlue', landmark: 'spire', sells: ['ironOre', 'coal', 'stone', 'wheatSeed'], wants: ['plank', 'berry', 'cloth', 'bream', 'bench', 'carrot'], danger: 0,
    }),
    makeIsland({
      id: 'pine', name: $t('雾松岛'), owner: 'Lena', ownerModel: 'islanderC', x: 1380, y: 1800, r: 160, biome: 'pine', seed: 23,
      roof: 'houseGreen', landmark: 'greatTree', sells: ['pine', 'plank', 'berry', 'strawberrySeed'], wants: ['copperIngot', 'stone', 'cloth', 'sardine', 'rope', 'wheat'], danger: 0,
    }),
    makeIsland({
      id: 'reef', name: $t('珊瑚环礁'), owner: 'Mio', ownerModel: 'islanderB', x: 400, y: 1560, r: 165, biome: 'atoll', seed: 37,
      roof: 'houseSand', landmark: 'wreck', sells: ['palm', 'shell', 'cloth', 'reefFish', 'pumpkinSeed'], wants: ['plank', 'copperIngot', 'ironIngot', 'coal', 'flowerBed'], danger: 1,
    }),
    makeIsland({
      id: 'dune', name: $t('赤砂岛'), owner: $t('老周'), ownerModel: 'islanderD', x: 150, y: 270, r: 155, biome: 'dune', seed: 53,
      roof: 'houseRed', landmark: 'lighthouse', sells: ['goldOre', 'crystal', 'coal'], wants: ['ironIngot', 'goldIngot', 'tuna', 'mackerel', 'lampPost', 'plank', 'pumpkin'], danger: 3,
    }),
  ]
  // the far shore: on nobody's chart until the four islanders' pieces of it are put together
  islands.push(makeIsland({
    id: 'far', name: $t('彼岸'), owner: $t('守灯人'), ownerModel: 'islanderA', x: 250, y: 1010, r: 130, biome: 'forest', seed: 71, hidden: true,
    roof: 'houseBlue', landmark: 'beacon', sells: ['moonstone', 'pearl', 'crystal'], wants: ['goldIngot', 'moonfish', 'octopus', 'crystalLamp', 'ironIngot'], danger: 2,
  }))
  // other players' islands (online), grown from their seeds
  guests.slice(0, GUEST_SLOTS.length).forEach((g, n) => {
    const i = Math.min(GUEST_SLOTS.length - 1, Math.max(0, g.slot ?? n))
    const gt = TIERS[Math.min(TIERS.length, Math.max(1, g.tier)) - 1]
    const d = makeIsland({
      id: g.id, name: g.name, owner: g.owner, ownerModel: i ? 'islanderB' : 'islanderC', guest: true,
      x: GUEST_SLOTS[i].x, y: GUEST_SLOTS[i].y, r: gt.r, biome: 'forest', seed: g.seed, tier: g.tier, danger: 0,
    })
    d.nx = HOME_AT.x
    d.ny = HOME_AT.y
    islands.push(d)
  })
  // bare islets: something to see on the way, and somewhere to lose a pursuer
  const islets: [number, number, number, Biome][] = [[1310, 1380, 44, 'rock'], [660, 560, 52, 'forest'], [720, 1250, 38, 'rock'], [1840, 1240, 56, 'pine'], [520, 930, 34, 'dune']]
  islets.forEach(([x, y, r, biome], i) => {
    const d = makeIsland({ id: 'islet' + i, name: $t('无人礁'), owner: '', ownerModel: '', wild: true, x, y, r, biome, seed: 300 + i })
    d.peaks = [{ dx: 0, dy: 0, h: 0.3, w: r * 0.4 }]
    d.plateau = 0.9
    islands.push(d)
  })
  const def: WorldDef = {
    seed: 7,
    islands,
    start: { x: 1024, y: 1024 },
    under: { x: 1810, y: 290 },
    plan(api) {
      islands.forEach((d, i) => {
        if (d.wild) return
        d.plan = planIsland(d, i, api)
      })
    },
  }
  return def
}

// ───────────────────────────────────────────────────────────── reading the land
function planIsland(def: IslandDef, index: number, api: PlanApi): Plan {
  const beach = api.sea + def.sand
  const rnd = mulberry32(def.seed * 7919 + 3)
  /** how unwelcome a spot is to build on: sea is out, high ground is costly, low land is free */
  const cost = (x: number, y: number) => {
    const e = api.elev(x, y)
    if (e >= api.sea && api.islandAt(x, y) !== index) return 9
    if (e < api.sea - 0.015) return 7
    if (e < beach) return 1.5
    const h = (e - beach) / 0.14
    return h * h
  }
  const rect = (cx: number, cy: number, w: number, h: number, nx = 9, ny = 4) => {
    let sum = 0
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sum += cost(cx - w / 2 + (w * (i + 0.5)) / nx, cy - h / 2 + (h * (j + 0.5)) / ny)
    return sum / (nx * ny)
  }

  // the runway: the flattest low strip, east–west or north–south, with the village beside it
  let best = { s: 1e9, cx: def.x, cy: def.y, ns: false, side: 1, shift: 0 }
  const span = def.r * 0.62
  for (const ns of [false, true]) {
    for (let cy = def.y - span; cy <= def.y + span; cy += 12) {
      for (let cx = def.x - span; cx <= def.x + span; cx += 12) {
        if (Math.hypot(cx - def.x, cy - def.y) > span) continue
        const L = RUNWAY_LEN + 24
        const s0 = ns ? rect(cx, cy, 30, L, 3, 9) : rect(cx, cy, L, 30, 9, 3)
        if (s0 > best.s) continue
        for (const side of [-1, 1]) {
          for (const shift of [-16, 0, 16]) {
            const off = RUNWAY_W / 2 + 8 + PLAZA_V / 2
            const px = ns ? cx + side * off : cx + shift
            const py = ns ? cy + shift : cy + side * off
            const s1 = ns ? rect(px, py, PLAZA_V, PLAZA_U, 4, 7) : rect(px, py, PLAZA_U, PLAZA_V, 7, 4)
            // the hangar stands across the runway from the village
            const hx = ns ? cx - side * 34 : cx
            const hy = ns ? cy : cy - side * 34
            const s2 = rect(hx, hy, ns ? 34 : RUNWAY_LEN, ns ? RUNWAY_LEN : 34, 5, 5)
            const s = s0 * 1.4 + s1 + s2 * 0.5 + (Math.hypot(px - def.x, py - def.y) / def.r) * 0.2
            if (s < best.s) best = { s, cx, cy, ns, side, shift }
          }
        }
      }
    }
  }
  const { cx, cy, ns, side, shift } = best
  // a plane takes off towards whichever end has the lower ground beyond it (out over the sea)
  const half = RUNWAY_LEN / 2 - 10
  const beyond = (sgn: number) => (ns ? rect(cx, cy + sgn * (half + 70), 30, 80, 3, 4) : rect(cx + sgn * (half + 70), cy, 80, 30, 4, 3))
  const e1 = api.elev(ns ? cx : cx + half + 90, ns ? cy + half + 90 : cy)
  const e2 = api.elev(ns ? cx : cx - half - 90, ns ? cy - half - 90 : cy)
  const dir = Math.abs(e1 - e2) > 0.02 ? (e1 < e2 ? 1 : -1) : beyond(1) > beyond(-1) ? 1 : -1
  const ux = ns ? 0 : dir
  const uy = ns ? dir : 0
  const vx = ns ? side : 0
  const vy = ns ? 0 : side
  const runway = { ax: cx - ux * half, ay: cy - uy * half, bx: cx + ux * half, by: cy + uy * half, ux, uy, ns }
  const off = RUNWAY_W / 2 + 8 + PLAZA_V / 2
  const plaza = {
    x: Math.round(cx + vx * off + (ns ? 0 : shift)), y: Math.round(cy + vy * off + (ns ? shift : 0)),
    w: ns ? PLAZA_V : PLAZA_U, h: ns ? PLAZA_U : PLAZA_V, vx, vy,
  }
  // the hangar: across the runway, by the end the plane starts from, its mouth to the strip
  const hd = RUNWAY_W / 2 + 5 + 15
  const hangar: Site = {
    x: Math.round(runway.ax + ux * 14 - vx * hd), y: Math.round(runway.ay + uy * 14 - vy * hd),
    yaw: Math.atan2(-vx, vy),
  }

  // the pier: from the village straight out (N, E, S or W) to the nearest water deep enough for a boat
  let pier = { x: plaza.x, y: plaza.y + plaza.h / 2, dx: 0, dy: 1, shore: 0 }
  let pBest = 1e9
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    if (dx === -vx && dy === -vy) continue // not across the runway
    let d = (dx ? plaza.w : plaza.h) / 2
    while (d < def.r * 1.6 && api.elev(plaza.x + dx * d, plaza.y + dy * d) >= api.sea - 0.004) d++
    const deep = api.elev(plaza.x + dx * (d + 44), plaza.y + dy * (d + 44)) < api.sea - 0.03 && api.elev(plaza.x + dx * (d + 90), plaza.y + dy * (d + 90)) < api.sea - 0.03
    // the lane to it must not climb a hill
    let climb = 0
    for (let t = 0; t < d; t += 8) climb = Math.max(climb, cost(plaza.x + dx * t, plaza.y + dy * t))
    const s = d + (deep ? 0 : 400) + Math.min(6, climb) * 30
    if (s < pBest) {
      pBest = s
      pier = { x: plaza.x + dx * d, y: plaza.y + dy * d, dx, dy, shore: d }
    }
  }
  const paths = [{ x0: plaza.x, y0: plaza.y, x1: pier.x, y1: pier.y }]

  // the player's own house (home island): a real building, big enough to walk about in. Beside the
  // village, clear of the runway, the hangar and the lane to the pier, on the flattest ground, its
  // door towards the square.
  let house: Plan['house']
  if (def.home) {
    const rcx = cx, rcy = cy
    const pierBox = { x: (plaza.x + pier.x) / 2, y: (plaza.y + pier.y) / 2, hw: Math.abs(pier.x - plaza.x) / 2 + 14, hh: Math.abs(pier.y - plaza.y) / 2 + 14 }
    let hb = 1e9
    const far = def.r * 1.1
    for (let b = -far; b <= far; b += 8) {
      for (let a = -far; a <= far; a += 8) {
        const hx = Math.round(plaza.x + a), hy = Math.round(plaza.y + b)
        for (let rot = 0; rot < 4; rot++) {
          const w = (rot % 2 ? HOME_L : HOME_W) + 6, h = (rot % 2 ? HOME_W : HOME_L) + 6
          const over = (x: number, y: number, hw: number, hh: number) => Math.abs(hx - x) < w / 2 + hw && Math.abs(hy - y) < h / 2 + hh
          if (over(plaza.x, plaza.y, plaza.w / 2 + 4, plaza.h / 2 + 4)) continue
          if (over(rcx, rcy, (ns ? RUNWAY_W : RUNWAY_LEN) / 2 + 16, (ns ? RUNWAY_LEN : RUNWAY_W) / 2 + 16)) continue
          if (over(hangar.x, hangar.y, 30, 30)) continue
          if (over(pierBox.x, pierBox.y, pierBox.hw, pierBox.hh)) continue
          // all of it on the island, none of it in the sea or up a hill
          let worst = 0
          for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) worst = Math.max(worst, cost(hx - w / 2 + (w * (i + 0.5)) / 7, hy - h / 2 + (h * (j + 0.5)) / 6))
          if (worst >= 6.5) continue // in the sea
          const c = rect(hx, hy, w, h, 7, 6)
          // the front door: on the side the house faces; it should look towards the square
          const fx = rot === 1 ? -1 : rot === 3 ? 1 : 0, fy = rot === 0 ? 1 : rot === 2 ? -1 : 0
          const dx = hx + fx * (w / 2 + 6), dy = hy + fy * (h / 2 + 6)
          const toward = (plaza.x - dx) * fx + (plaza.y - dy) * fy
          const gap = Math.max(0, Math.abs(dx - plaza.x) - plaza.w / 2) + Math.max(0, Math.abs(dy - plaza.y) - plaza.h / 2)
          const s = c * 30 + worst * 6 + gap * 0.25 + (toward < -10 ? 40 : 0) + (rot === 0 ? 0 : 3)
          if (s < hb) { hb = s; house = { x: hx, y: hy, rot } }
        }
      }
    }
    if (house) {
      const h = house
      const w = (h.rot % 2 ? HOME_L : HOME_W), hh = (h.rot % 2 ? HOME_W : HOME_L)
      const fx = h.rot === 1 ? -1 : h.rot === 3 ? 1 : 0, fy = h.rot === 0 ? 1 : h.rot === 2 ? -1 : 0
      const door = { x: Math.round(h.x + fx * (w / 2 + 2)), y: Math.round(h.y + fy * (hh / 2 + 2)) }
      // a lane from the door to the square: straight out of the door first, then across
      const out = { x: door.x + fx * 8, y: door.y + fy * 8 }
      if (fx) paths.push({ x0: door.x, y0: door.y, x1: plaza.x, y1: door.y }, { x0: plaza.x, y0: door.y, x1: plaza.x, y1: plaza.y })
      else paths.push({ x0: door.x, y0: door.y, x1: door.x, y1: plaza.y }, { x0: door.x, y0: plaza.y, x1: plaza.x, y1: plaza.y })
      void out
    }
  }

  // the highest hill, the furthest headland
  let peak = { x: def.x, y: def.y, e: 0 }
  let cape = { x: def.x, y: def.y, d: 0 }
  for (let a = 0; a < 48; a++) {
    const ang = (a / 48) * Math.PI * 2
    for (let d = 20; d < def.r * 1.5; d += 6) {
      const x = def.x + Math.cos(ang) * d
      const y = def.y + Math.sin(ang) * d
      const e = api.elev(x, y)
      if (e > peak.e && api.islandAt(x, y) === index) peak = { x, y, e }
      if (e > beach + 0.02 && d > cape.d && api.islandAt(x, y) === index && Math.hypot(x - plaza.x, y - plaza.y) > 70) cape = { x, y, d }
    }
  }
  // the mine: at the foot of a hill, a short walk from the village, clear of the runway and the pier
  let mine: Site | null = null
  {
    const rcx = (runway.ax + runway.bx) / 2
    const rcy = (runway.ay + runway.by) / 2
    const clear = (x: number, y: number) =>
      !(Math.abs(x - rcx) < (ns ? 34 : RUNWAY_LEN / 2 + 34) && Math.abs(y - rcy) < (ns ? RUNWAY_LEN / 2 + 34 : 34)) &&
      Math.hypot(x - hangar.x, y - hangar.y) > 48 &&
      !(Math.abs(x - plaza.x) < plaza.w / 2 + 26 && Math.abs(y - plaza.y) < plaza.h / 2 + 26) &&
      !(Math.abs(x - (plaza.x + pier.x) / 2) < Math.abs(pier.x - plaza.x) / 2 + 22 && Math.abs(y - (plaza.y + pier.y) / 2) < Math.abs(pier.y - plaza.y) / 2 + 22) &&
      !(house && Math.abs(x - house.x) < HOME_W / 2 + 26 && Math.abs(y - house.y) < HOME_W / 2 + 26)
    let bestS = -1e9
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2
      for (let d = 50; d < def.r * 0.95; d += 10) {
        const x = Math.round(plaza.x + Math.cos(ang) * d)
        const y = Math.round(plaza.y + Math.sin(ang) * d)
        if (api.islandAt(x, y) !== index || !clear(x, y)) continue
        const e = api.elev(x, y)
        if (e < beach + 0.01) continue
        // the lane to it comes straight in along one axis: the hill should rise behind the mouth
        const viaX = Math.abs(x - plaza.x) >= Math.abs(y - plaza.y)
        const fx = viaX ? Math.sign(plaza.x - x) : 0
        const fy = viaX ? 0 : Math.sign(plaza.y - y)
        const behind = api.elev(x - fx * 22, y - fy * 22)
        if (behind < api.sea) continue
        // both legs of the lane must stay on land
        const kx = viaX ? plaza.x : x
        const ky = viaX ? y : plaza.y
        if (cost(kx, ky) > 6 || cost((kx + x) / 2, (ky + y) / 2) > 6 || cost((kx + plaza.x) / 2, (ky + plaza.y) / 2) > 6) continue
        if (!clear(kx, ky) && Math.hypot(kx - plaza.x, ky - plaza.y) > 40) continue
        const s = (behind - e) * 60 + behind * 8 - d * 0.02 - Math.abs(e - beach - 0.05) * 20
        if (s > bestS) {
          bestS = s
          mine = { x, y, yaw: Math.atan2(-fx, fy) }
        }
      }
    }
    if (mine) {
      const m: Site = mine
      const viaX = Math.abs(m.x - plaza.x) >= Math.abs(m.y - plaza.y)
      if (viaX) paths.push({ x0: plaza.x, y0: plaza.y, x1: plaza.x, y1: m.y }, { x0: plaza.x, y0: m.y, x1: m.x + Math.sign(plaza.x - m.x) * 12, y1: m.y })
      else paths.push({ x0: plaza.x, y0: plaza.y, x1: m.x, y1: plaza.y }, { x0: m.x, y0: plaza.y, x1: m.x, y1: m.y + Math.sign(plaza.y - m.y) * 12 })
    }
  }
  // the landmark
  let landmark: Point = { x: Math.round(cape.x), y: Math.round(cape.y) }
  if (def.landmark === 'spire') landmark = { x: Math.round(peak.x), y: Math.round(peak.y) }
  else if (def.landmark === 'greatTree' || def.landmark === 'windmill') {
    // inland, on the far side of the island from the village
    const ax = def.x - (plaza.x - def.x) * 0.9 + (rnd() - 0.5) * 30
    const ay = def.y - (plaza.y - def.y) * 0.9 + (rnd() - 0.5) * 30
    if (cost(ax, ay) < 6) landmark = { x: Math.round(ax), y: Math.round(ay) }
  } else if (def.landmark === 'wreck') {
    // on the beach, away from the pier
    let d = 10
    const dx = -pier.dx || vx
    const dy = -pier.dy || vy
    while (d < def.r * 1.5 && api.elev(def.x + dx * d, def.y + dy * d) > api.sea + 0.004) d += 2
    landmark = { x: Math.round(def.x + dx * (d - 6)), y: Math.round(def.y + dy * (d - 6)) }
  }

  // nothing stands in front of the house: a landmark that fell on or by it moves round the island
  if (house) {
    const h = house
    const near = (p: Point) => Math.abs(p.x - h.x) < HOME_W / 2 + 34 && Math.abs(p.y - h.y) < HOME_W / 2 + 34
    if (near(landmark)) {
      for (let k = 1; k < 24; k++) {
        const ang = Math.atan2(landmark.y - def.y, landmark.x - def.x) + (k * Math.PI) / 12
        let d = def.r * 0.62
        if (def.landmark === 'wreck') {
          // a wreck lies on the beach: out along this way to the water's edge
          d = 10
          while (d < def.r * 1.5 && api.elev(def.x + Math.cos(ang) * d, def.y + Math.sin(ang) * d) > api.sea + 0.004) d += 2
          d -= 6
        }
        const p = { x: Math.round(def.x + Math.cos(ang) * d), y: Math.round(def.y + Math.sin(ang) * d) }
        if (near(p) || cost(p.x, p.y) > 6) continue
        if (Math.abs(p.x - plaza.x) < plaza.w / 2 + 20 && Math.abs(p.y - plaza.y) < plaza.h / 2 + 20) continue
        landmark = p
        break
      }
    }
  }
  // level the ground for all of it
  const flat = (x: number, y: number, w: number, h: number, blend: number, raise: boolean) => def.flats.push({ x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h, blend, raise })
  def.flats.length = 0
  flat(cx, cy, ns ? RUNWAY_W + 10 : RUNWAY_LEN + 14, ns ? RUNWAY_LEN + 14 : RUNWAY_W + 10, 18, true)
  flat(plaza.x, plaza.y, plaza.w, plaza.h, 20, true)
  const hw = Math.abs(Math.sin(hangar.yaw)) > 0.5 ? 31 : 45
  flat(hangar.x, hangar.y, hw, hw === 31 ? 45 : 31, 12, true)
  for (const p of paths) flat((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, Math.abs(p.x1 - p.x0) + 9, Math.abs(p.y1 - p.y0) + 9, 7, false)
  if (mine) flat(mine.x, mine.y, 34, 34, 10, false)
  if (house) flat(house.x, house.y, (house.rot % 2 ? HOME_L : HOME_W) + 12, (house.rot % 2 ? HOME_W : HOME_L) + 12, 14, true)
  return { runway, plaza, hangar, pier, mine, landmark, paths, house }
}

export interface WorldApi {
  N: number
  heightAt(x: number, y: number): number
  matAt(x: number, y: number): number
  isWater(x: number, y: number): boolean
  solidAt(x: number, y: number): boolean
  islandAt(x: number, y: number): number
  delta(a: number, b: number): number
  norm(v: number): number
  place(st: Stamp, cx: number, cy: number, base?: number): unknown
  remove(saved: unknown): void
  block(cx: number, cy: number, hw: number, hh: number, on: boolean): void
}

// ───────────────────────────────────────────────────────────── building on the land
/** a prop's footprint once it is turned to its yaw (quarter turns swap its sides) */
function footprint(model: string, yaw: number): [number, number, number] {
  const s = BUILDING_SIZE[model.startsWith('house') ? 'house' : model.startsWith('furnace') ? 'furnace' : model] ?? [9, 9, 8]
  return Math.abs(Math.sin(yaw)) > 0.5 ? [s[1], s[0], s[2]] : [s[0], s[1], s[2]]
}

export function placeBuilding(world: WorldApi, lay: IslandLayout, kind: BuildingKind, model: string, x: number, y: number, yaw = 0, id?: string, size?: string): BuildingInst {
  const [w, h, rise] = footprint(size ?? model, yaw)
  const base = world.heightAt(x, y)
  // the door is on the model's south side when it is not turned
  const fx = -Math.sin(yaw)
  const fy = Math.cos(yaw)
  const reach = (Math.abs(fx) > 0.5 ? w : h) / 2 + 4
  const b: BuildingInst = {
    id: id ?? `${kind}-${lay.buildings.length}`, kind, model, x, y, yaw, w, h, base, rise,
    door: { x: Math.round(x + fx * reach), y: Math.round(y + fy * reach) },
  }
  // what blocks the way is a little smaller than what is drawn, so the pilot can brush past (the
  // player's house is walked into: its walls are part of the ground, and block on their own)
  if (size !== 'homeHouse') world.block(x, y, Math.max(1, w / 2 - 2), Math.max(1, h / 2 - 2), true)
  lay.buildings.push(b)
  return b
}
export function removeBuilding(world: WorldApi, lay: IslandLayout, b: BuildingInst) {
  if (b.model === '' && b.kind === 'house') { lay.buildings = lay.buildings.filter((x) => x !== b); return }
  world.block(b.x, b.y, Math.max(1, b.w / 2 - 2), Math.max(1, b.h / 2 - 2), false)
  lay.buildings = lay.buildings.filter((x) => x !== b)
}

/** can something with this footprint stand here? flat dry land, clear of everything else */
export function canPlace(world: WorldApi, hw: number, hh: number, x: number, y: number): boolean {
  const base = world.heightAt(x, y)
  for (let yy = Math.round(y - hh) - 2; yy <= Math.round(y + hh) + 2; yy++) {
    for (let xx = Math.round(x - hw) - 2; xx <= Math.round(x + hw) + 2; xx++) {
      if (world.isWater(xx, yy) || world.solidAt(xx, yy)) return false
      if (Math.abs(world.heightAt(xx, yy) - base) > 0) return false
      const m = world.matAt(xx, yy)
      if (m === 17 || m === 18 || m === 21 || m === 22 || m === 24) return false // runway and pier: keep clear
    }
  }
  return true
}

/** how many of each thing grows on an island of this kind (before its riches are applied) */
const GROWS: Record<Biome, Partial<Record<NodeKind, number>>> = {
  forest: { oak1: 8, oak2: 9, apple2: 5, birch2: 3, oak3: 1, boulderS: 5, boulder: 3, oreCopper: 2, oreCoal: 1, bushBerry: 6, flax: 9, flower: 7, stick: 11, pebble: 9, shell: 5 },
  rock: { pine1: 4, pine2: 3, boulderS: 8, boulder: 7, oreIron: 4, oreCoal: 3, oreCopper: 2, flax: 3, pebble: 8, flower: 3 },
  atoll: { palm1: 7, palm2: 8, bushBerry: 4, flax: 6, shell: 12, boulderS: 3, flower: 6, stick: 4 },
  pine: { pine1: 8, pine2: 10, pine3: 4, birch2: 5, boulderS: 4, boulder: 2, bushBerry: 5, flax: 4, flower: 5, stick: 8 },
  dune: { palm1: 4, palm2: 3, boulderS: 6, boulder: 5, oreCoal: 2, flax: 2, shell: 6, pebble: 8 },
}
function isTree(k: NodeKind) { return !!NODES[k].tall }
function isRock(k: NodeKind) { return NODES[k].tool === 'pick' }

/**
 * Lays an island out on the finished land: ground works (runway, village square, lanes, pier),
 * where each building stands, and what grows where. `reach(x, y)` says whether the pilot can
 * walk to a cell. Nothing is drawn here: the game makes a prop for each building and node.
 */
export function layoutIsland(
  world: WorldApi, def: IslandDef,
  opts: { furnace?: Point | null; furnaces2?: Point[]; restaurant?: Point | null; estate?: Partial<Record<'ranch' | 'shop' | 'depot' | 'lighthouse' | 'exchange', Point>>; reach?: (lay: IslandLayout) => (x: number, y: number) => boolean } = {},
): IslandLayout {
  const plan = def.plan!
  const { runway, plaza, pier } = plan
  const base = world.heightAt(plaza.x, plaza.y)
  const along = (u: number, v: number): Point => ({ x: Math.round(plaza.x + runway.ux * u + plaza.vx * v), y: Math.round(plaza.y + runway.uy * u + plaza.vy * v) })
  const yawOut = Math.atan2(runway.ux, -runway.uy)
  const lay: IslandLayout = {
    def,
    plaza: { x: plaza.x, y: plaza.y },
    spawn: along(0, 2),
    runwayStart: { x: Math.round(runway.ax), y: Math.round(runway.ay), yaw: yawOut },
    runwayEnd: { x: Math.round(runway.bx), y: Math.round(runway.by) },
    boardAt: { x: Math.round(runway.ax + runway.ux * 2 + plaza.vx * 10), y: Math.round(runway.ay + runway.uy * 2 + plaza.vy * 10) },
    greetAt: { x: Math.round(runway.ax + runway.ux * 16 + plaza.vx * 11), y: Math.round(runway.ay + runway.uy * 16 + plaza.vy * 11) },
    berth: { x: 0, y: 0, yaw: 0 },
    seaward: { x: 0, y: 0 },
    pierEnd: { x: 0, y: 0 },
    buildings: [],
    nodes: [],
    furnaceSpot: along(-28, 14),
    landmark: plan.landmark,
  }

  // the village square and the runway
  world.place(groundStamp('plaza', plaza.w - 8, plaza.h - 8, 'plaza', 'plazaSpeck'), plaza.x, plaza.y, base)
  const strip = runwayStamp(RUNWAY_LEN, RUNWAY_W)
  world.place(runway.ns ? turned(strip) : strip, (runway.ax + runway.bx) / 2, (runway.ay + runway.by) / 2, base)
  // lanes: to the pier, to the mine
  const dirt = groundStamp('path', 1, 1, 'path')
  for (const p of plan.paths) {
    const n = Math.max(Math.abs(p.x1 - p.x0), Math.abs(p.y1 - p.y0))
    const horiz = Math.abs(p.x1 - p.x0) >= Math.abs(p.y1 - p.y0)
    for (let i = 0; i <= n; i++) {
      const x = Math.round(p.x0 + ((p.x1 - p.x0) * i) / Math.max(1, n))
      const y = Math.round(p.y0 + ((p.y1 - p.y0) * i) / Math.max(1, n))
      for (let s = -2; s <= 2; s++) {
        const xx = horiz ? x : x + s
        const yy = horiz ? y + s : y
        const m = world.matAt(xx, yy)
        if (world.isWater(xx, yy) || (m >= 17 && m <= 22)) continue
        world.place(dirt, xx, yy, world.heightAt(xx, yy))
      }
    }
  }
  // the pier, out over the water from where the lane meets the shore
  const pierLen = 34
  const st = pierStamp(pierLen)
  const mid = { x: pier.x + pier.dx * (pierLen / 2 - 5), y: pier.y + pier.dy * (pierLen / 2 - 5) }
  world.place(pier.dx ? turned(st) : st, mid.x, mid.y, 2)
  const end = { x: pier.x + pier.dx * (pierLen - 9), y: pier.y + pier.dy * (pierLen - 9) }
  // the boat lies along the pier's right-hand side (seen walking out), bow to the sea
  const rx = -pier.dy
  const ry = pier.dx
  lay.pierEnd = { x: Math.round(end.x), y: Math.round(end.y) }
  lay.berth = { x: Math.round(end.x + rx * 11 - pier.dx * 4), y: Math.round(end.y + ry * 11 - pier.dy * 4), yaw: Math.atan2(pier.dx, -pier.dy) }
  lay.seaward = { x: Math.round(lay.berth.x + pier.dx * 60), y: Math.round(lay.berth.y + pier.dy * 60) }
  lay.buildings.push({
    id: 'pier', kind: 'pier', model: '', x: Math.round(mid.x), y: Math.round(mid.y), yaw: 0,
    door: { x: Math.round(end.x), y: Math.round(end.y) }, w: pier.dx ? pierLen : 5, h: pier.dx ? 5 : pierLen, base: 0, rise: 2,
  })

  // the buildings. Which side of the square each stands on differs from island to island.
  const rnd = mulberry32(def.seed * 31 + 5)
  const flip = rnd() < 0.5 ? 1 : -1
  const hg = placeBuilding(world, lay, 'hangar', 'hangar', plan.hangar.x, plan.hangar.y, plan.hangar.yaw, 'hangar')
  // the hangar is used from beside the parked plane's nose, on its own side of the strip
  hg.door = { x: Math.round(runway.ax + runway.ux * 20 - plaza.vx * 9), y: Math.round(runway.ay + runway.uy * 20 - plaza.vy * 9) }
  const put = (kind: BuildingKind, model: string, u: number, v: number) => {
    const p = along(u * flip, v)
    return placeBuilding(world, lay, kind, model, p.x, p.y, 0, kind)
  }
  put('workbench', 'workbench', -27, -10)
  put('board', 'board', 0, -14)
  put('crates', 'crates', 28, -11)
  if (def.home && plan.house) {
    // the player's own house: walls and floor are pressed into the ground by the house itself (house.ts)
    const hs = plan.house
    placeBuilding(world, lay, 'house', '', hs.x, hs.y, (hs.rot * Math.PI) / 2, 'house', 'homeHouse')
  } else put('house', def.roof, 26, 13)
  lay.furnaceSpot = along(-28 * flip, 14)
  if (opts.furnace) placeBuilding(world, lay, 'furnace', 'furnace', opts.furnace.x, opts.furnace.y, 0, 'furnace')
  else if (!def.home) placeBuilding(world, lay, 'furnace', 'furnaceLit', lay.furnaceSpot.x, lay.furnaceSpot.y, 0, 'furnace')
  // the second and third furnaces (round 21)
  for (const [i, f] of (opts.furnaces2 ?? []).entries()) placeBuilding(world, lay, 'furnace', 'furnace', f.x, f.y, 0, `furnace${i + 2}`)
  if (opts.restaurant) placeBuilding(world, lay, 'restaurant', 'restaurant', opts.restaurant.x, opts.restaurant.y, 0, 'restaurant')
  for (const [k, at] of Object.entries(opts.estate ?? {})) if (at) placeBuilding(world, lay, k as BuildingKind, 'est_' + k, at.x, at.y, 0, k)
  if (plan.mine) {
    world.place(groundStamp('apron', 15, 15, 'path'), plan.mine.x, plan.mine.y + 0, world.heightAt(plan.mine.x, plan.mine.y))
    placeBuilding(world, lay, 'mine', 'mine', plan.mine.x, plan.mine.y, plan.mine.yaw, 'mine')
  }
  {
    const m = placeBuilding(world, lay, 'landmark', def.landmark, plan.landmark.x, plan.landmark.y, def.landmark === 'wreck' ? 0.6 : 0, 'landmark')
    m.door = { x: m.x, y: m.y + m.h / 2 + 4 }
  }

  // what grows here: scattered where the pilot can walk to it, clear of the village and the lanes
  const reachable = opts.reach ? opts.reach(lay) : () => true
  const grows = GROWS[def.biome]
  const own = def.home || !!def.guest // a player's island: as rich as a home is
  const scale = (def.r / 200) ** 2 * (own ? 1 : 0.8)
  const want: NodeKind[] = []
  for (const k of Object.keys(grows) as NodeKind[]) {
    const rich = isTree(k) ? def.rich.wood : isRock(k) ? def.rich.ore : 1
    let n = Math.round((grows[k] ?? 0) * scale * rich)
    if (own && def.tier >= 2 && k === 'oak3') n += 2
    for (let i = 0; i < n; i++) want.push(k)
  }
  if (own && def.tier >= 2) want.push('oreIron')
  // big things first, so the small ones fill the gaps around them
  want.sort((a, b) => NODES[b].solid - NODES[a].solid || (isTree(b) ? 1 : 0) - (isTree(a) ? 1 : 0))
  const taken: { x: number; y: number; r: number }[] = lay.buildings.map((b) => ({ x: b.x, y: b.y, r: Math.max(b.w, b.h) / 2 + 6 }))
  const groves: Point[] = []
  let tries = 0
  let wi = 0
  while (wi < want.length && tries++ < 30000) {
    const kind = want[wi]
    const nd = NODES[kind]
    let x: number
    let y: number
    if (isTree(kind) && groves.length && rnd() < 0.65) {
      // trees stand in groves
      const g = groves[Math.floor(rnd() * groves.length)]
      const a = rnd() * 6.283
      const d = 12 + rnd() * 26
      x = Math.round(g.x + Math.cos(a) * d)
      y = Math.round(g.y + Math.sin(a) * d)
    } else {
      const a = rnd() * 6.283
      const d = (0.1 + rnd() * 0.85) * def.r
      x = Math.round(def.x + Math.cos(a) * d)
      y = Math.round(def.y + Math.sin(a) * d)
    }
    if (tries > 3000 * (wi + 1)) { wi++; continue } // nowhere left for this one
    const m = world.matAt(x, y)
    if (world.isWater(x, y) || world.solidAt(x, y)) continue
    const sandy = m === 4 || m === 5
    const grassy = m >= 6 && m <= 8
    const rocky = m >= 12
    if (kind === 'shell' ? !sandy : kind.startsWith('palm') ? !(sandy || grassy) : isRock(kind) || kind === 'pebble' ? !(grassy || rocky || sandy) : !grassy) continue
    if (isRock(kind) && !rocky && world.heightAt(x, y) < 6 && rnd() < 0.6) continue // rocks like the hills
    if (kind === 'stick' && !lay.nodes.some((n) => isTree(n.kind) && Math.hypot(n.x - x, n.y - y) < 16)) { if (rnd() < 0.9) continue }
    const h0 = world.heightAt(x, y)
    const sp = Math.max(2, nd.solid)
    if (Math.abs(world.heightAt(x - sp, y) - h0) + Math.abs(world.heightAt(x + sp, y) - h0) + Math.abs(world.heightAt(x, y - sp) - h0) + Math.abs(world.heightAt(x, y + sp) - h0) > 2) continue
    const need = isTree(kind) ? 11 : nd.solid + 6
    if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + need)) continue
    // keep the village, the runway and the lanes clear
    if (Math.abs(x - plaza.x) < plaza.w / 2 + 6 && Math.abs(y - plaza.y) < plaza.h / 2 + 6) continue
    const rcx = (runway.ax + runway.bx) / 2
    const rcy = (runway.ay + runway.by) / 2
    if (Math.abs(x - rcx) < (runway.ns ? 22 : RUNWAY_LEN / 2 + 30) && Math.abs(y - rcy) < (runway.ns ? RUNWAY_LEN / 2 + 30 : 22)) continue
    if (m === 23 || plan.paths.some((p) => x >= Math.min(p.x0, p.x1) - 8 && x <= Math.max(p.x0, p.x1) + 8 && y >= Math.min(p.y0, p.y1) - 8 && y <= Math.max(p.y0, p.y1) + 8)) continue
    const gap = nd.solid + 4
    if (!reachable(x, y + gap) && !reachable(x - gap, y) && !reachable(x + gap, y) && !reachable(x, y - gap)) continue
    const node: NodeInst = {
      id: `${def.id}-n${lay.nodes.length}`, kind, x, y, yaw: isTree(kind) || nd.tool === 'pick' ? rnd() * 6.283 : 0, depleted: false,
      base: h0, rise: 8, hw: Math.max(4, nd.solid + 2), hh: Math.max(4, nd.solid + 2),
    }
    if (nd.solid > 0) world.block(x, y, nd.solid, nd.solid, true)
    lay.nodes.push(node)
    taken.push({ x, y, r: nd.solid })
    if (isTree(kind) && groves.length < 7 && rnd() < 0.5) groves.push({ x, y })
    wi++
  }
  return lay
}
