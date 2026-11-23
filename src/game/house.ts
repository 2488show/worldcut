// The player's house (round 16): small outside, bigger inside.
//
// On the island the house is a building — a log cabin to begin with, then a cottage, then two
// storeys, then three with a roof terrace. Its door is walked through, and the player is inside:
// rooms that are a good deal bigger than the house looks from the lane, as in Animal Crossing.
// The rooms are a place of their own, out at sea where nobody sails: each floor on a little plot
// of garden with the sea round it, so the windows look out at grass and water and the day's
// weather, and the rain stays outside. Upstairs floors stand higher, so their windows look down.
//
// Inside, the walls and floors are pressed into the ground there (as the island's own buildings
// are), the front wall is a sill and there is no roof, so the rooms are seen into from the usual
// camera. The stairs are walked up and down; a piece being moved can be carried up them.
//
// The furniture is the player's: the first set comes with the house, more with each size it grows
// to, the rest made at the workbench. In 装修 a tap picks a piece up; it stays the player's until
// it is set down again.

import { blank, type Stamp } from '../engine/stamps'
import { bedWithSleeper } from '../engine/indoor'
import { aquariumModel, plaqueModel, roofColours, winName, WIN_H } from '../engine/furnish'
import { EXTERIORS, EXT_M, exteriorName, homeExterior, bedHD, photoFrame, HD } from '../engine/home'
import { HAIR_COLORS, SKINS } from '../engine/avatar'
import { MAT } from '../engine/materials'
import { FURNITURE, ITEMS, give, type Bag, type IndoorUse, type ItemId } from './data'
import type { Game, Label } from './game'
import { $t } from '../i18n'
import { freeSpot } from './nav'

type Actor = Game['pilot']

/** the ground floor of the house (from the cottage up), in ground pixels, walls not counted */
export const IW = 89
export const IH = 63
const T = 3 // walls are this thick
const FLOOR = 2 // the floor stands a little above the ground (one step up at the door)
const WALL = 17 // the outer walls (and the inner ones are a little lower)
const INNER = 11
const SILL = 2
/** the ground round the rooms, and how much higher each floor up stands */
const GROUND = 2
const LIFT = 14
const WIN_Z = WALL - WIN_H // the sill of a window, above the floor
/** the stairs: 11 across, 16 deep, rising to the back */
const STAIR = { hw: 5.5, hh: 8 }

/** a piece of furniture where it stands: centre in room pixels, quarter turns, and (for things on a wall or on a
 * tabletop) how high above the floor it is. `f`: the floor it is on (0 the ground floor). `lifted`: in the
 * player's hands, being moved (put back on load). `photo`: the album picture in a frame */
export interface Piece { item: ItemId; x: number; y: number; rot: number; z?: number; f?: number; lifted?: boolean; photo?: number; picked?: number }
/** a window in an outer wall: the wall it is in, its middle along that wall (room pixels), half its width */
export interface Win { x: number; y: number; side: 'n' | 'w' | 'e'; half: number }
/** a placing: the spot it settled on, and why (for the little sign by the copy) */
export interface Snap { x: number; y: number; rot: number; z: number; hint: string }
/** a line in the guestbook */
export interface GuestLine { day: number; who: string; text: string }
/** v: the layout the pieces are in (6: the house grows, round 16). tier: 0 the cabin … 3 three storeys */
export interface HomeSave { pieces: Piece[]; hearth?: boolean; ticker?: boolean; box?: Bag; v?: number; tier?: number; book?: GuestLine[]; beacon?: boolean; sky?: string[] }

/** the rooms, for the floors, the wallpaper and the captions */
interface Room { id: string; name: string; x0: number; y0: number; x1: number; y1: number; floor: [string, string]; paper: string }
/** a floor of the house: its size, rooms, inner walls and the doorways in them, windows, the front
 * door (the ground floor only) and the stairs up and down */
interface Plan {
  IW: number; IH: number; rooms: Room[]; walls: [number, number, number, number][]; doorways: [number, number, number, number][]
  windows: Win[]; door?: { x0: number; x1: number }
  /** stairs: up to the floor above, down to the one below (`to` when it is not the next one along) */
  up?: { x: number; y: number; to?: number }; down?: { x: number; y: number; to?: number }
  /** doors in a side wall through to another floor (the wings: the workshop, the greenhouse …) */
  portals?: Portal[]
  /** how many storeys up it stands (its index, unless said) */
  level?: number
}
/** a door in the west or east wall, `half` either side of `y`, through to floor `to` */
interface Portal { side: 'w' | 'e'; y: number; half: number; to: number }
/** the constellations the telescope finds, one a night */
const SKY = [$t('北斗'), $t('织女'), $t('牛郎'), $t('猎户'), $t('天鹅'), $t('天蝎'), $t('仙后'), $t('北冕'), $t('海豚'), $t('天琴'), $t('小熊'), $t('飞马')]
/** what each floor is called (the toast on arriving, the label on its door) */
export const FLOOR_NAMES = [$t('一楼'), $t('二楼'), $t('三楼'), $t('工坊'), $t('温室'), $t('水族馆'), $t('观星塔'), $t('海景露台'), $t('灯塔顶')]

// ───────────────────────────────────────────────────────────── the floors
/** the cabin: one room — the bed under the window, a stove to cook on and one to keep warm, a table */
const HUT: Plan = {
  IW: 53, IH: 39,
  rooms: [{ id: 'hut', name: $t('小屋'), x0: 0, y0: 0, x1: 52, y1: 38, floor: ['floorWood', 'floorWoodLight'], paper: 'wallPaper' }],
  walls: [], doorways: [],
  windows: [{ x: 11, y: 0, side: 'n', half: 9 }, { x: 52, y: 20, side: 'e', half: 6 }],
  door: { x0: 21, x1: 31 },
}
/** the ground floor from the cottage up: five rooms, small and full. Along the back the bedroom (a
 * study once the bedroom is upstairs, with the stairs in it), the bathroom and the kitchen; along
 * the front the living room and, half walled off, the corner where guests are sat down */
function groundPlan(tier: number): Plan {
  const upstairs = tier >= 2
  return {
    IW, IH,
    rooms: [
      upstairs
        ? { id: 'den', name: $t('书房'), x0: 0, y0: 0, x1: 33, y1: 26, floor: ['floorWood', 'floorWoodLight'], paper: 'wallPaper' }
        : { id: 'bed', name: $t('卧室'), x0: 0, y0: 0, x1: 33, y1: 26, floor: ['floorWood', 'floorWoodLight'], paper: 'wallPaperRose' },
      { id: 'bath', name: $t('卫生间'), x0: 37, y0: 0, x1: 57, y1: 26, floor: ['floorTile', 'floorTileBlue'], paper: 'wallPaperBlue' },
      { id: 'kitchen', name: $t('厨房'), x0: 61, y0: 0, x1: 88, y1: 26, floor: ['floorKitchen', 'floorKitchenDark'], paper: 'wallPaperGreen' },
      { id: 'living', name: $t('客厅'), x0: 0, y0: 30, x1: 58, y1: 62, floor: ['floorWoodDark', 'floorWood'], paper: 'wallPaper' },
      { id: 'guest', name: $t('会客区'), x0: 59, y0: 30, x1: 88, y1: 62, floor: ['floorWoodLight', 'floorWood'], paper: 'wallPaper' },
    ],
    walls: [[0, 27, 88, 29], [34, 0, 36, 26], [58, 0, 60, 26], [59, 30, 61, 43]],
    doorways: [[23, 27, 32, 29], [39, 27, 47, 29], [77, 27, 86, 29]],
    windows: [{ x: 11, y: 0, side: 'n', half: 9 }, { x: 72, y: 0, side: 'n', half: 6 }, { x: 0, y: 51, side: 'w', half: 6 }, { x: IW - 1, y: 46, side: 'e', half: 6 }],
    door: { x0: 38, x1: 48 },
    up: upstairs ? { x: 27, y: 9 } : undefined,
    portals: [
      ...(tier >= 4 ? [{ side: 'e', y: 35, half: 3, to: 3 } as Portal] : []),
      ...(tier >= 5 ? [{ side: 'w', y: 39, half: 3, to: 4 } as Portal] : []),
    ],
  }
}
/** upstairs (two storeys and up): the bedroom, its big window to the sea and the stove by it; a
 * sitting room with the stairs */
function secondPlan(tier: number): Plan {
  return {
    IW: 69, IH: 45,
    rooms: [
      { id: 'bed', name: $t('卧室'), x0: 0, y0: 0, x1: 41, y1: 44, floor: ['floorWood', 'floorWoodLight'], paper: 'wallPaperRose' },
      { id: 'lounge', name: $t('起居室'), x0: 45, y0: 0, x1: 68, y1: 44, floor: ['floorWoodLight', 'floorWood'], paper: 'wallPaperGreen' },
    ],
    walls: [[42, 0, 44, 44]], doorways: [[42, 29, 44, 39]],
    windows: [{ x: 20, y: 0, side: 'n', half: 9 }, { x: 0, y: 24, side: 'w', half: 6 }, { x: 68, y: 22, side: 'e', half: 6 }],
    down: { x: 62, y: 9 },
    up: tier >= 3 ? { x: 62, y: 33 } : undefined,
  }
}
/** the top floor (three storeys): an attic under the roof terrace, windows all round */
function atticPlan(tier: number): Plan {
  return {
    IW: 57, IH: 41,
    rooms: [{ id: 'attic', name: $t('阁楼'), x0: 0, y0: 0, x1: 56, y1: 40, floor: ['floorWoodLight', 'floorWood'], paper: 'wallPaperBlue' }],
    walls: [], doorways: [],
    windows: [{ x: 32, y: 0, side: 'n', half: 9 }, { x: 0, y: 26, side: 'w', half: 6 }, { x: 56, y: 20, side: 'e', half: 6 }],
    down: { x: 8, y: 9 },
    up: tier >= 7 ? { x: 48, y: 28, to: 6 } : undefined,
  }
}
/** tier 4: the workshop, through a door in the guests' corner — a bench to make things at home; the
 * stairs down to the aquarium from tier 6 */
function workshopPlan(tier: number): Plan {
  return {
    IW: 61, IH: 41, level: 0,
    rooms: [{ id: 'workshop', name: $t('工坊'), x0: 0, y0: 0, x1: 60, y1: 40, floor: ['floorWoodDark', 'floorWood'], paper: 'wallPaperGreen' }],
    walls: [], doorways: [],
    windows: [{ x: 30, y: 0, side: 'n', half: 12 }, { x: 60, y: 20, side: 'e', half: 6 }],
    portals: [{ side: 'w', y: 20, half: 3, to: 0 }],
    down: tier >= 6 ? { x: 50, y: 30, to: 5 } : undefined,
  }
}
/** tier 5: the greenhouse, through a door in the living room — planters that give something every day;
 * from tier 8 a door on to the sea terrace */
function greenhousePlan(tier: number): Plan {
  return {
    IW: 57, IH: 41, level: 0,
    rooms: [{ id: 'green', name: $t('温室'), x0: 0, y0: 0, x1: 56, y1: 40, floor: ['floorTile', 'floorTileBlue'], paper: 'wallPaperGreen' }],
    walls: [], doorways: [],
    windows: [{ x: 14, y: 0, side: 'n', half: 11 }, { x: 42, y: 0, side: 'n', half: 11 }, { x: 0, y: 12, side: 'w', half: 6 }],
    portals: [{ side: 'e', y: 20, half: 3, to: 0 }, ...(tier >= 8 ? [{ side: 'w', y: 31, half: 3, to: 7 } as Portal] : [])],
  }
}
/** tier 6: the aquarium, down the stairs from the workshop */
const AQUARIUM: Plan = {
  IW: 61, IH: 45, level: 0,
  rooms: [{ id: 'aqua', name: $t('水族馆'), x0: 0, y0: 0, x1: 60, y1: 44, floor: ['floorTileBlue', 'floorTile'], paper: 'wallPaperBlue' }],
  walls: [], doorways: [],
  windows: [{ x: 30, y: 0, side: 'n', half: 14 }],
  up: { x: 50, y: 30, to: 3 },
}
/** tier 7: the star tower, up from the attic; from tier 9 the lantern room above it */
function towerPlan(tier: number): Plan {
  return {
    IW: 41, IH: 41, level: 3,
    rooms: [{ id: 'tower', name: $t('观星室'), x0: 0, y0: 0, x1: 40, y1: 40, floor: ['floorWoodDark', 'floorWood'], paper: 'wallPaperBlue' }],
    walls: [], doorways: [],
    windows: [{ x: 20, y: 0, side: 'n', half: 9 }, { x: 0, y: 26, side: 'w', half: 5 }, { x: 40, y: 26, side: 'e', half: 5 }],
    down: { x: 8, y: 28, to: 2 },
    up: tier >= 9 ? { x: 32, y: 28, to: 8 } : undefined,
  }
}
/** tier 8: the sea terrace and its pool, through the greenhouse */
const TERRACE: Plan = {
  IW: 69, IH: 45, level: 1,
  rooms: [{ id: 'terrace', name: $t('海景露台'), x0: 0, y0: 0, x1: 68, y1: 44, floor: ['floorWoodLight', 'floorWood'], paper: 'wallPaper' }],
  walls: [], doorways: [],
  windows: [{ x: 17, y: 0, side: 'n', half: 14 }, { x: 51, y: 0, side: 'n', half: 14 }, { x: 0, y: 14, side: 'w', half: 8 }],
  portals: [{ side: 'e', y: 31, half: 3, to: 4 }],
}
/** tier 9: the lantern room at the top of the lighthouse */
const LANTERN: Plan = {
  IW: 37, IH: 37, level: 4,
  rooms: [{ id: 'lantern', name: $t('灯室'), x0: 0, y0: 0, x1: 36, y1: 36, floor: ['floorWoodDark', 'floorWood'], paper: 'wallPaperBlue' }],
  walls: [], doorways: [],
  windows: [{ x: 18, y: 0, side: 'n', half: 12 }, { x: 0, y: 14, side: 'w', half: 6 }, { x: 36, y: 14, side: 'e', half: 6 }],
  down: { x: 28, y: 26, to: 6 },
}
/** the floors a house of this tier has, in the order of FLOOR_NAMES (each floor keeps its index as the house grows) */
function plansFor(tier: number): Plan[] {
  if (tier <= 0) return [HUT]
  if (tier === 1) return [groundPlan(1)]
  if (tier === 2) return [groundPlan(2), secondPlan(2)]
  const out = [groundPlan(tier), secondPlan(tier), atticPlan(tier)]
  if (tier >= 4) out.push(workshopPlan(tier))
  if (tier >= 5) out.push(greenhousePlan(tier))
  if (tier >= 6) out.push(AQUARIUM)
  if (tier >= 7) out.push(towerPlan(tier))
  if (tier >= 8) out.push(TERRACE)
  if (tier >= 9) out.push(LANTERN)
  return out
}
/** the highest tier */
export const TOP_TIER = 9
/** the cottage's windows (the ground floor from the cottage up) */
export const WINDOWS: Win[] = groundPlan(1).windows
/** where each floor is: open sea, far from every island, nobody's way — and with nothing to the north
 * for a long way, so no island stands on the horizon behind the back wall */
const SITES = [{ x: 960, y: 1920 }, { x: 1664, y: 1440 }, { x: 528, y: 176 }, { x: 1168, y: 288 }, { x: 1936, y: 1824 }, { x: 1664, y: 208 }, { x: 1984, y: 672 }, { x: 1104, y: 608 }, { x: 640, y: 1904 }]
/** the garden round each floor: north (a strip of sand, then the sea under the bedroom window), south, the sides */
const YARD = { n: 6, s: 26, w: 18, e: 18 }

// ───────────────────────────────────────────────────────────── the first furniture
/** the cabin, as it comes */
const HUT_STARTER: Piece[] = [
  { item: 'bed', x: 9, y: 6, rot: 3 },
  { item: 'nightstand', x: 3, y: 17, rot: 3 },
  { item: 'tableLamp', x: 3, y: 17, rot: 3, z: 7 },
  { item: 'woodStove', x: 25, y: 4, rot: 0 },
  { item: 'stove', x: 39, y: 3, rot: 0 },
  { item: 'fridge', x: 49, y: 12, rot: 1 },
  { item: 'roundTable', x: 38, y: 20, rot: 0 },
  { item: 'chair', x: 38, y: 29, rot: 2 },
  { item: 'chair', x: 29, y: 20, rot: 1 },
  { item: 'desk', x: 4, y: 29, rot: 3 },
  { item: 'computer', x: 4, y: 29, rot: 3, z: 8 },
  { item: 'wardrobe', x: 49, y: 30, rot: 1 },
  { item: 'roundRug', x: 16, y: 19, rot: 0 },
]
/** the cottage: laid out as a home is — beds and cupboards with their backs to a wall, the sofa
 * facing the television across the rug and the coffee table, chairs at the table, the fire where
 * the sofa sees it, the little stove in the bedroom */
const STARTER: Piece[] = [
  { item: 'bed', x: 9, y: 6, rot: 3 },
  { item: 'nightstand', x: 3, y: 17, rot: 3 },
  { item: 'tableLamp', x: 3, y: 17, rot: 3, z: 7 },
  { item: 'wardrobe', x: 27, y: 3, rot: 0 },
  { item: 'woodStove', x: 29, y: 13, rot: 1 },
  { item: 'floorLamp', x: 19, y: 22, rot: 0 },
  { item: 'roundRug', x: 14, y: 19, rot: 0 },
  { item: 'toilet', x: 41, y: 5, rot: 0 },
  { item: 'sink', x: 49, y: 3, rot: 0 },
  { item: 'shower', x: 51, y: 13, rot: 0 },
  { item: 'pottedPlant', x: 54, y: 23, rot: 0 },
  { item: 'counter', x: 66, y: 3, rot: 0 },
  { item: 'stove', x: 77, y: 3, rot: 0 },
  { item: 'fridge', x: 85, y: 13, rot: 1 },
  { item: 'dinnerTable', x: 69, y: 15, rot: 0 },
  { item: 'chair', x: 65, y: 23, rot: 2 },
  { item: 'chair', x: 73, y: 23, rot: 2 },
  { item: 'tv', x: 11, y: 33, rot: 0 },
  { item: 'rug', x: 13, y: 46, rot: 0 },
  { item: 'coffeeTable', x: 11, y: 46, rot: 0 },
  { item: 'sofa', x: 11, y: 57, rot: 2 },
  { item: 'desk', x: 69, y: 34, rot: 0 },
  { item: 'computer', x: 69, y: 34, rot: 0, z: 8 },
  { item: 'fireplace', x: 55, y: 38, rot: 1 },
  { item: 'chair', x: 69, y: 47, rot: 1 },
  { item: 'chair', x: 79, y: 47, rot: 3 },
  { item: 'bookshelf', x: 84, y: 55, rot: 1 },
  { item: 'pottedPlant', x: 63, y: 52, rot: 0 },
]
export const STARTER_ITEMS = STARTER.map((p) => p.item)
export const HUT_ITEMS = HUT_STARTER.map((p) => p.item)
/** a cottage as it comes (for tests, and a house from before round 16 is one) */
export function cottageSave(): HomeSave {
  return { pieces: STARTER.map((p) => ({ ...p })), v: 6, tier: 1, hearth: true, ticker: true }
}
/** upstairs: where the bedroom goes when the house gets a second storey (the bed under the window to
 * the sea, the stove beside it), and what comes with the new floor */
const UPSTAIRS: Piece[] = [
  { item: 'bed', x: 20, y: 7, rot: 3, f: 1 },
  { item: 'nightstand', x: 7, y: 4, rot: 3, f: 1 },
  { item: 'tableLamp', x: 7, y: 4, rot: 3, z: 7, f: 1 },
  { item: 'woodStove', x: 36, y: 5, rot: 0, f: 1 },
  { item: 'wardrobe', x: 38, y: 30, rot: 1, f: 1 },
  { item: 'floorLamp', x: 4, y: 40, rot: 0, f: 1 },
  { item: 'roundRug', x: 20, y: 26, rot: 0, f: 1 },
]
const UPSTAIRS_GIFTS: Piece[] = [
  { item: 'armchair', x: 50, y: 24, rot: 1, f: 1 },
  { item: 'bigPlant', x: 50, y: 5, rot: 0, f: 1 },
  { item: 'guestbook', x: 0, y: 0, rot: 0 }, // (into the box: it goes on a table of the player's choosing)
]
const ATTIC_GIFTS: Piece[] = [
  { item: 'roundRug', x: 30, y: 22, rot: 0, f: 2 },
  { item: 'rockingChair', x: 30, y: 21, rot: 0, f: 2 },
  { item: 'bigPlant', x: 51, y: 5, rot: 0, f: 2 },
  { item: 'photoFrame', x: 0, y: 0, rot: 0 },
]
/** what each new wing comes with (f: the floor; none: into the furniture box) */
const WING_GIFTS: Record<number, Piece[]> = {
  4: [{ item: 'homeBench', x: 30, y: 5, rot: 0, f: 3 }, { item: 'stool', x: 30, y: 15, rot: 2, f: 3 }, { item: 'bookshelf', x: 8, y: 4, rot: 0, f: 3 }, { item: 'wallLamp', x: 16, y: 0, rot: 0, z: 10, f: 3 }, { item: 'runnerRug', x: 30, y: 26, rot: 0, f: 3 }],
  5: [{ item: 'planter', x: 10, y: 4, rot: 0, f: 4 }, { item: 'planter', x: 28, y: 4, rot: 0, f: 4 }, { item: 'planter', x: 46, y: 4, rot: 0, f: 4 }, { item: 'planter', x: 28, y: 34, rot: 2, f: 4 }, { item: 'bigPlant', x: 6, y: 34, rot: 0, f: 4 }, { item: 'roundTable', x: 28, y: 20, rot: 0, f: 4 }],
  6: [{ item: 'aquarium', x: 14, y: 4, rot: 0, f: 5 }, { item: 'aquarium', x: 30, y: 4, rot: 0, f: 5 }, { item: 'aquarium', x: 46, y: 4, rot: 0, f: 5 }, { item: 'sofa', x: 30, y: 30, rot: 0, f: 5 }, { item: 'fishPlaque', x: 0, y: 0, rot: 0 }],
  7: [{ item: 'telescope', x: 20, y: 8, rot: 0, f: 6 }, { item: 'armchair', x: 20, y: 22, rot: 0, f: 6 }, { item: 'globe', x: 0, y: 0, rot: 0 }, { item: 'roundRug', x: 20, y: 20, rot: 0, f: 6 }],
  8: [{ item: 'pool', x: 26, y: 20, rot: 0, f: 7 }, { item: 'deckChair', x: 50, y: 14, rot: 0, f: 7 }, { item: 'deckChair', x: 58, y: 14, rot: 0, f: 7 }, { item: 'bigPlant', x: 62, y: 38, rot: 0, f: 7 }],
  9: [{ item: 'beacon', x: 18, y: 14, rot: 0, f: 8 }, { item: 'chair', x: 8, y: 30, rot: 0, f: 8 }, { item: 'wallClock', x: 30, y: 0, rot: 0, z: 11, f: 8 }],
}
/** what growing the house costs: the island must be this big, and the coins and the materials */
export const HOUSE_UPS: { level: number; coins: number; need: Bag; brings: string }[] = [
  { level: 0, coins: 0, need: {}, brings: '' },
  { level: 2, coins: 300, need: { plank: 20, stone: 15 }, brings: $t('五个房间：卫生间、厨房、客厅、会客区，屋里的家具都配齐') },
  { level: 3, coins: 800, need: { plank: 30, stone: 20, ironIngot: 6 }, brings: $t('二楼：朝海的大卧室（床和小火炉会搬上去）、起居室、阳台；楼下原来的卧室改成书房') },
  { level: 4, coins: 1600, need: { plank: 40, stone: 30, ironIngot: 10, crystal: 2 }, brings: $t('三楼：四面开窗的阁楼，楼顶露台和玻璃花房') },
  { level: 5, coins: 2400, need: { plank: 50, stone: 30, ironIngot: 14 }, brings: $t('工坊：会客区开一扇门过去，家用工作台在家就能做东西') },
  { level: 6, coins: 3200, need: { plank: 30, stone: 40, cloth: 10, crystal: 3 }, brings: $t('温室：客厅开一扇门过去，四个花盆架，每天早上都能摘一点东西') },
  { level: 7, coins: 4200, need: { stone: 60, ironIngot: 20, crystal: 4 }, brings: $t('水族馆：工坊里的楼梯往下，三个大鱼缸摆你钓到的鱼') },
  { level: 8, coins: 5400, need: { stone: 80, ironIngot: 24, goldIngot: 2 }, brings: $t('观星塔：阁楼再往上，一架望远镜，每晚认一个星座') },
  { level: 9, coins: 6800, need: { plank: 60, stone: 40, goldIngot: 3, crystal: 4 }, brings: $t('海景露台：温室开一扇门过去，一池海水和躺椅') },
  { level: 10, coins: 8500, need: { stone: 100, ironIngot: 30, goldIngot: 5, crystal: 6 }, brings: $t('灯塔宅邸：塔楼顶上的灯室，点亮灯塔夜里送货多拿一成') },
]
export const houseName = (tier: number) => EXTERIORS[Math.max(0, Math.min(EXTERIORS.length - 1, tier))].name

/** a house's cosiness as stars, 1–5 (the cottage's first furniture is three; a bathtub, shelves, plants and lamps make four) */
export const COSY_STARS = [0, 70, 95, 115, 140]
export function starsFor(score: number): number {
  let n = 1
  while (n < 5 && score >= COSY_STARS[n]) n++
  return n
}
export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

const inBox = (x: number, y: number, b: [number, number, number, number]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]

/** a floor as it stands: its plan, where it is in the world, its wall map */
class Floor {
  wall: Uint8Array
  ox: number
  oy: number
  /** the floor's height in the world */
  fz: number
  constructor(public n: number, public p: Plan) {
    this.wall = new Uint8Array(p.IW * p.IH)
    for (let y = 0; y < p.IH; y++) for (let x = 0; x < p.IW; x++) this.wall[y * p.IW + x] = this.isWall(x, y) ? 1 : 0
    // the room's (0, 0) in the world: the floor's middle on its site
    this.ox = SITES[n].x - ((p.IW - 1) >> 1)
    this.oy = SITES[n].y - ((p.IH - 1) >> 1)
    this.fz = GROUND + (p.level ?? n) * LIFT + FLOOR
  }
  get IW() { return this.p.IW }
  get IH() { return this.p.IH }
  private isWall(x: number, y: number) {
    for (const d of this.p.doorways) if (inBox(x, y, d)) return false
    for (const w of this.p.walls) if (inBox(x, y, w)) return true
    return false
  }
  roomAt(x: number, y: number): Room | null {
    for (const r of this.p.rooms) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r
    return null
  }
  /** is this cell of an outer wall in a window's opening? */
  inWindow(x: number, y: number) {
    const W = this.p.IW
    return this.p.windows.some((w) => (w.side === 'n' ? y < 0 && Math.abs(x - w.x) <= w.half : w.side === 'w' ? x < 0 && Math.abs(y - w.y) <= w.half : x >= W && Math.abs(y - w.y) <= w.half))
  }
  /** the stairs on this floor, as boxes in room pixels: what they stand on, and the way to them kept clear */
  stairs(): { kind: 'up' | 'down'; x: number; y: number; to: number; box: [number, number, number, number]; clear: [number, number, number, number]; foot: { x: number; y: number } }[] {
    const out: ReturnType<Floor['stairs']> = []
    for (const kind of ['up', 'down'] as const) {
      const s = this.p[kind]
      if (!s) continue
      const box: [number, number, number, number] = [s.x - STAIR.hw, s.y - STAIR.hh, s.x + STAIR.hw - 1, s.y + STAIR.hh - 1]
      const foot = { x: s.x, y: Math.min(this.p.IH - 2, s.y + STAIR.hh + 3) }
      out.push({ kind, x: s.x, y: s.y, to: s.to ?? this.n + (kind === 'up' ? 1 : -1), box, clear: [box[0], box[3], box[2], box[3] + 6], foot })
    }
    return out
  }
  /** is this cell of the west or east wall in a door through to another floor? */
  portalAt(x: number, y: number): Portal | null {
    for (const q of this.p.portals ?? []) if (Math.abs(y - q.y) <= q.half && (q.side === 'w' ? x < 0 : x >= this.p.IW)) return q
    return null
  }
  /** where one comes in through a side door: just inside it */
  portalIn(q: Portal) { return { x: q.side === 'w' ? 4 : this.p.IW - 5, y: q.y } }
  toWorld(x: number, y: number) { return { x: this.ox + x, y: this.oy + y } }
  /** room pixels round about, or null if the point is nowhere near this floor */
  near(px: number, py: number, delta: (a: number, b: number) => number, margin: number) {
    const x = Math.round(delta(px, this.ox)), y = Math.round(delta(py, this.oy))
    if (x < -T - margin || y < -T - margin || x >= this.p.IW + T + margin || y >= this.p.IH + T + margin) return null
    return { x, y }
  }
}

export class House {
  active = false
  /** tap a piece to pick it up (and set it down again) */
  decorating = false
  /** lying in bed, listening to the weather (not asleep) */
  resting = false
  /** the bed last gone to */
  bed: Actor | null = null
  /** standing on the island (only on the player's own island, once it is laid out) */
  attached = false
  private floors: Floor[] = []
  /** the house on the island: its model, the ground it took, where it stands and which way it faces */
  private outside_: Actor | null = null
  private ext = { x: 0, y: 0, gz: 0, hw: 0, hh: 0, bw: 0, bh: 0, fx: 0, fy: 1, R: 0, site: { x: 0, y: 0, hw: 0, hh: 0 } }
  private stamps: unknown[] = []
  private actors: { piece: Piece; a: Actor }[] = []
  private extras: Actor[] = []
  private wasYaw = 0
  get roofActor(): Actor | null { return this.outside_ }
  get tier(): number { return this.save.tier ?? 1 }
  /** the floor the player is on (the ground floor when outside) */
  get cur(): number {
    const p = this.g.pilot
    if (!p || !this.attached) return 0
    for (const f of this.floors) if (f.near(p.x, p.y, this.dl, 4)) return f.n
    return 0
  }
  private get F(): Floor { return this.floors[this.cur] ?? this.floors[0] }
  get floorCount(): number { return this.floors.length }
  /** the floor's height in the world */
  get fz(): number { return this.F?.fz ?? GROUND + FLOOR }
  /** the house's turn, as an angle (the building on the island; inside, rooms are never turned) */
  get theta(): number { return (this.ext.R * Math.PI) / 2 }
  yawOf(rot: number): number { return (rot * Math.PI) / 2 }
  /** the camera's heading indoors: in over the front sill, towards the back wall */
  get viewYaw(): number { return 0 }
  /** the box it does not rain in while the player is indoors: the floor they are on, walls and all */
  dryBox(): { x: number; y: number; c: number; s: number; hw: number; hh: number } | null {
    if (!this.active || !this.F) return null
    const f = this.F
    return { x: f.ox + (f.IW - 1) / 2 + 0.5, y: f.oy + (f.IH - 1) / 2 + 0.5, c: 1, s: 0, hw: f.IW / 2 + T, hh: f.IH / 2 + T }
  }

  constructor(private g: Game) {}
  private dl = (a: number, b: number) => this.g.world.delta(a, b)

  get save(): HomeSave {
    const s = (this.g.save.home ??= { pieces: [] })
    if (!s.pieces.length && !this.g.save.homeFurnished) {
      // a new game: the cabin
      s.pieces = HUT_STARTER.map((p) => ({ ...p }))
      s.v = 6
      s.tier = 0
      s.hearth = true
      s.ticker = true
      this.g.save.homeFurnished = true
    }
    // the hearth came later (round 8): a house furnished before it gets one
    if (!s.hearth) {
      s.hearth = true
      if (!s.pieces.some((p) => p.item === 'fireplace')) s.pieces.push({ ...STARTER.find((p) => p.item === 'fireplace')! })
    }
    // and the stock machine (round 10): a house from before it gets one (round 13 makes it the computer)
    if (!s.ticker) {
      s.ticker = true
      if (!s.pieces.some((p) => p.item === 'stockMachine' || p.item === 'computer')) give((s.box ??= {}), { stockMachine: 1 })
    }
    // a house from before round 16 is the cottage (it had all five rooms)
    if (s.tier === undefined) s.tier = 1
    return s
  }
  roomAt(x: number, y: number): Room | null { return this.F?.roomAt(x, y) ?? null }
  private roomOf(p: Piece): Room | null { return this.floors[p.f ?? 0]?.roomAt(p.x, p.y) ?? null }
  private onFloor = (e: { piece: Piece }, f = this.cur) => (e.piece.f ?? 0) === f

  // ───────────────────────────────────────────────────────────── in and out
  /** the middle of the front door on the island, and the spot just outside it */
  private doorPoint(out: number) {
    const e = this.ext
    const d = e.hh + out
    return { x: e.x + e.fx * d, y: e.y + e.fy * d }
  }
  /** in at the front door (a tap on the house, the morning, a test): straight to just inside it */
  enter() {
    const g = this.g
    if (this.active || !this.attached || g.mine.active || g.dive.active || !g.here.def.home) return
    g.panel = null
    g.stopWalking()
    g.standUp()
    const f = this.floors[0]
    const p = g.pilot
    const d = f.p.door!
    const at = f.toWorld((d.x0 + d.x1) / 2, f.IH - 6)
    p.x = at.x
    p.y = at.y
    p.z = f.fz
    p.yaw = Math.PI
    this.inside()
    g.scene.setCamera({ x: p.x, y: p.y - 6, alt: f.fz, yaw: 0, snap: true })
  }
  /** out of the front door, to just outside it on the island */
  exit() {
    if (!this.active) return
    const g = this.g
    this.getUp()
    g.cancelPlacing(true)
    g.standUp()
    g.stopWalking()
    const p = g.pilot
    const at = this.doorOutside()
    p.x = at.x
    p.y = at.y
    p.z = g.world.heightAt(Math.round(p.x), Math.round(p.y))
    p.yaw = this.theta
    this.outside()
    g.scene.setCamera({ x: p.x, y: p.y, alt: p.z, yaw: g.camYaw, snap: true })
  }
  /** is this spot (world pixels) the house and its garden on the island (and a margin round it)? */
  covers(x: number, y: number, margin = 0): boolean {
    if (!this.attached) return false
    const s = this.ext.site
    return Math.abs(this.g.world.delta(x, s.x)) < s.hw + margin && Math.abs(this.g.world.delta(y, s.y)) < s.hh + margin
  }
  /** is this spot (world pixels) inside the walls of the house on the island? */
  inWalls(x: number, y: number): boolean {
    if (!this.attached) return false
    const e = this.ext
    return Math.abs(this.g.world.delta(x, e.x)) <= e.bw + 1 && Math.abs(this.g.world.delta(y, e.y)) <= e.bh + 1
  }
  /** just outside the front door: where a tap on the house walks the player to */
  doorOutside() { return this.doorPoint(5) }
  /** (kept for callers from before: the way in is the door outside) */
  doorInside() { return this.doorOutside() }
  /** walking about: through the door and in; out of the rooms (flown off, say) and the house is shut */
  watch() {
    const g = this.g
    if (!this.attached || !g.here.def.home || g.mode !== 'island' || g.mine.active || g.dive.active) return
    const p = g.pilot
    const inRoom = this.floors.some((f) => f.near(p.x, p.y, this.dl, 2))
    const was = this.wasWalking
    this.wasWalking = g.walking
    if (inRoom && !this.active) return this.inside()
    if (!inRoom && this.active && !this.resting && !this.sleepIn) return this.outside()
    if (this.active) {
      // out over the front step: out of the door
      const f = this.F
      const r = f.near(p.x, p.y, this.dl, 4)
      const d = f.p.door
      if (r && d && r.y >= f.IH && r.x >= d.x0 && r.x <= d.x1 && !this.moving) this.exit()
      // into a side door: through to the floor it leads to
      const q = r && (r.x <= -2 || r.x >= f.IW + 1) ? f.portalAt(r.x, r.y) : null
      if (q) this.through(q)
      return
    }
    // up to the front door (or somehow in the house's walls on the island: an old save stood there)
    const e = this.ext
    const dx = g.world.delta(p.x, e.x), dy = g.world.delta(p.y, e.y)
    const along = dx * e.fx + dy * e.fy, across = Math.abs(dx * e.fy - dy * e.fx)
    const inWalls = Math.abs(along) < e.hh - 1 && across < e.hw - 1
    const atDoor = along > e.hh - 2 && along < e.hh + 2.5 && across < 3
    // (a walk that ends on the doorstep goes in; one that only passes the door does not)
    const arrived = atDoor && was && !g.walking
    if ((inWalls || arrived) && !g.placingItem) this.enter()
  }
  private wasWalking = false
  /** indoors: the camera turns to look in over the sill, the rain stays outside */
  private inside() {
    const g = this.g
    if (this.active) return
    this.active = true
    this.decorating = false
    this.wasWalking = false
    this.wasYaw = g.camYaw
    g.camYaw = this.viewYaw
    ;(g.pilot as unknown as { dry: boolean }).dry = true
    g.scene.setCamera({ yaw: g.camYaw, haze: 0.5 })
    g.setIndoorLight()
    g.sfx('open', 0.8)
    g.changed()
  }
  private outside() {
    const g = this.g
    if (!this.active) return
    this.getUp()
    g.cancelPlacing(true)
    this.active = false
    this.decorating = false
    this.wasWalking = false
    this.dropCut()
    ;(g.pilot as unknown as { dry: boolean }).dry = false
    g.camYaw = this.wasYaw
    g.scene.setIslandView(g.view3d)
    g.scene.setCamera({ yaw: g.camYaw, zoom: g.islandZoom, angle: null, near: null, mag: null, free: false, haze: 0 })
    g.setIndoorLight()
    g.sfx('close', 0.8)
    g.changed()
  }
  /** up or down the stairs (with whatever is being carried) */
  climb(to: number) {
    const g = this.g
    const f = this.floors[to]
    if (!f) return
    const from = this.cur
    const st = f.stairs().find((s) => s.to === from) ?? f.stairs().find((s) => s.kind === (to > from ? 'down' : 'up'))
    if (!st) return
    g.stopWalking()
    g.standUp()
    const at = f.toWorld(st.foot.x, st.foot.y)
    const p = g.pilot
    p.x = at.x
    p.y = at.y
    p.z = f.fz
    p.yaw = 0
    g.sfx('step', 0.9)
    g.after(0.12, () => g.sfx('step', 1.05))
    g.after(0.24, () => g.sfx('step', 1.2))
    g.scene.setCamera({ x: p.x, y: p.y - 6, alt: f.fz, yaw: 0, snap: true })
    g.toast(FLOOR_NAMES[to] ?? '')
    g.changed()
  }
  /** through a side door to another floor (with whatever is being carried) */
  through(q: Portal) {
    const g = this.g
    const from = this.cur
    const f = this.floors[q.to]
    const back = f?.p.portals?.find((x) => x.to === from)
    if (!f || !back) return
    g.stopWalking()
    g.standUp()
    const at = f.toWorld(f.portalIn(back).x, f.portalIn(back).y)
    const p = g.pilot
    p.x = at.x
    p.y = at.y
    p.z = f.fz
    p.yaw = back.side === 'w' ? Math.PI / 2 : (3 * Math.PI) / 2
    g.sfx('open', 0.9)
    g.scene.setCamera({ x: p.x, y: p.y - 6, alt: f.fz, yaw: 0, snap: true })
    g.toast(FLOOR_NAMES[q.to] ?? '')
    g.changed()
  }
  /** the world was made again (a level up, a reload): the house goes back up where the island has it */
  rebuild() {
    this.actors = []
    this.extras = []
    this.outside_ = null
    this.stamps = []
    this.cut = null
    this.active = false
    this.attach()
  }
  /** morning: up out of bed, standing beside it */
  wakeInBed() {
    const g = this.g
    if (!this.active) return
    this.waking = 2.6
    const bed = (this.bed && this.actors.find((e) => e.a === this.bed)) || this.actors.find((e) => FURNITURE[e.piece.item]?.indoor === 'bed')
    const p = g.pilot
    if (bed) {
      this.bed = bed.a
      const f = this.floors[bed.piece.f ?? 0]
      const { hw } = this.footprint(bed.piece.item, bed.piece.rot)
      const at = f.toWorld(bed.piece.x + hw + 4, bed.piece.y)
      p.x = at.x
      p.y = at.y
      p.z = f.fz
      this.lowCam(true)
    } else p.z = this.fz
    // never wake up inside a piece of furniture: step out to the nearest free floor
    const free = freeSpot(g.world, p.x, p.y)
    if (free && (free.x !== Math.round(p.x) || free.y !== Math.round(p.y))) { p.x = free.x; p.y = free.y }
    p.yaw = Math.PI
  }
  /** a fire going on this floor (for the sound) */
  get hearth(): boolean {
    return this.active && this.actors.some((e) => this.onFloor(e) && FURNITURE[e.piece.item]?.indoor === 'fire')
  }
  private clear() {
    const g = this.g
    for (const e of this.actors) g.scene.removeActor(e.a)
    for (const a of this.extras) g.scene.removeActor(a)
    if (this.outside_) g.scene.removeActor(this.outside_)
    this.hdOff()
    this.actors = []
    this.extras = []
    this.outside_ = null
    this.dropCut()
    this.shot = null
    for (const s of [...this.stamps].reverse()) g.world.remove(s)
    if (this.ext.hw) g.world.block(this.ext.x, this.ext.y, this.ext.bw, this.ext.bh, false)
    this.stamps = []
  }

  /** room pixels → the world, and back (on the floor the player is on, unless told) */
  toWorld(x: number, y: number, f = this.cur) { return (this.floors[f] ?? this.floors[0]).toWorld(x, y) }
  toRoom(x: number, y: number) {
    const f = this.F
    return { x: Math.round(this.g.world.delta(x, f.ox)), y: Math.round(this.g.world.delta(y, f.oy)) }
  }

  // ───────────────────────────────────────────────────────────── building it
  /** put the house up: the building on the island, and the rooms out at sea */
  attach() {
    const g = this.g
    this.clear()
    this.active = false
    this.attached = false
    const lay = g.layouts.home
    const b = lay?.buildings.find((x) => x.kind === 'house' && x.model === '')
    if (!b) return
    const hs = this.save
    const tier = hs.tier ?? 1
    // ── on the island: the building, set back on its plot, its door to the lane
    const site = ((b as unknown as { site?: { x: number; y: number; w: number; h: number } }).site ??= { x: b.x, y: b.y, w: b.w, h: b.h })
    const R = Math.round(b.yaw / (Math.PI / 2)) & 3
    const t = EXTERIORS[Math.max(0, Math.min(EXTERIORS.length - 1, tier))]
    const fx = [0, -1, 0, 1][R], fy = [1, 0, -1, 0][R]
    const along = R % 2 ? site.w : site.h // the plot's depth, door to back
    const back = Math.max(0, Math.min(10, (along - t.L) / 2 - 6))
    const ex = Math.round(site.x - fx * back), ey = Math.round(site.y - fy * back)
    const gz = g.world.heightAt(site.x, site.y)
    const bw = (R % 2 ? t.L : t.W) / 2 - 1, bh = (R % 2 ? t.W : t.L) / 2 - 1
    this.ext = { x: ex, y: ey, gz, hw: t.W / 2, hh: t.L / 2, fx, fy, R, bw, bh, site: { x: site.x, y: site.y, hw: site.w / 2, hh: site.h / 2 } }
    const [rc, rl, roof] = roofColours(lay.def.roof)
    const name = exteriorName(tier, roof)
    if (!g.scene.models[name]) g.scene.registerModel(homeExterior(tier, name, rc, rl))
    this.outside_ = g.scene.addActor(name, { x: ex, y: ey, z: gz, yaw: this.theta, shadow: true, reach: 1100 })
    g.world.block(ex, ey, bw, bh, true)
    // the building on the plot, for taps, the mailbox and the visitors
    b.x = ex; b.y = ey; b.w = R % 2 ? t.L : t.W; b.h = R % 2 ? t.W : t.L; b.rise = t.storeys * t.storeyH + (t.roof || 8)
    const door = this.doorPoint(2)
    b.door = { x: Math.round(door.x), y: Math.round(door.y) }
    // a path from the door to the lane, flowers either side of it as the house grows
    this.yard(tier)
    // ── the rooms
    this.floors = plansFor(tier).map((p, n) => new Floor(n, p))
    for (const f of this.floors) this.raise(f)
    this.attached = true
    // the furniture (anything still in the player's hands from before goes back where it was; anything
    // that is not furniture any more goes into the box, never lost)
    this.moving = null
    for (const piece of [...hs.pieces]) {
      delete piece.lifted
      if (!FURNITURE[piece.item]) { hs.pieces = hs.pieces.filter((x) => x !== piece); give((hs.box ??= {}), { [piece.item]: 1 }) }
      else if ((piece.f ?? 0) >= this.floors.length) piece.f = 0
    }
    this.refreshModels()
    if ((hs.v ?? 1) < 2) this.relayout()
    else for (const piece of hs.pieces) this.addPiece(piece)
    if ((hs.v ?? 1) < 3) this.computerize()
    if ((hs.v ?? 1) < 4) this.rewindow()
    if ((hs.v ?? 1) < 5) this.turnDesk()
    if ((hs.v ?? 1) < 6) this.addStove()
  }
  /** the island side of the plot: a path from the door down to the lane, flower beds by it */
  private yard(tier: number) {
    const g = this.g
    const e = this.ext
    const from = this.doorPoint(1)
    const to = { x: e.site.x + e.fx * (e.R % 2 ? e.site.hw : e.site.hh), y: e.site.y + e.fy * (e.R % 2 ? e.site.hw : e.site.hh) }
    const len = Math.round(Math.hypot(to.x - from.x, to.y - from.y))
    if (len > 1) {
      const w = Math.abs(e.fx) ? len : 5, h = Math.abs(e.fy) ? len : 5
      const st: Stamp = blank('home-path', w, h)
      for (let o = 0; o < w * h; o++) { st.rise[o] = 0; st.mats[o] = (o * 7) % 11 === 0 ? MAT.plazaSpeck : MAT.path; st.solid[o] = 0 }
      const cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2
      this.stamps.push(g.world.place(st, Math.round(cx), Math.round(cy), e.gz))
    }
    const beds = tier >= 3 ? [6, 14] : tier >= 1 ? [7] : []
    for (const d of beds) for (const side of [-1, 1]) {
      const sx = e.fy * side, sy = -e.fx * side
      const at = this.doorPoint(d)
      const x = Math.round(at.x + sx * 8), y = Math.round(at.y + sy * 8)
      this.extras.push(g.scene.addActor('f_flowerBed', { x, y, z: g.world.heightAt(x, y), yaw: this.theta, shadow: false, reach: 700 }))
    }
  }
  /** a floor of the rooms: its plot of garden in the sea, its walls and floor, the window frames,
   * the stairs, the doormat */
  private raise(f: Floor) {
    const g = this.g
    const p = f.p
    const lift = (p.level ?? f.n) * LIFT
    const x0 = -T - YARD.w, x1 = p.IW + T + YARD.e - 1, y0 = -T - YARD.n, y1 = p.IH + T + YARD.s - 1
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const st: Stamp = blank('house-' + f.n, w, h)
    const stairCells = f.stairs()
    for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
      const o = sy * w + sx
      const x = x0 + sx, y = y0 + sy
      st.solid[o] = 0
      if (x < -T || y < -T || x >= p.IW + T || y >= p.IH + T) {
        // the garden: sand at its edge, grass, a path from the front door
        const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y)
        st.rise[o] = GROUND
        const path = f.n === 0 && p.door && x >= p.door.x0 + 2 && x <= p.door.x1 - 2 && y >= p.IH
        st.mats[o] = edge < 3 ? ((x * 3 + y * 5) % 7 === 0 ? MAT.sandSpeck : MAT.sand) : path ? ((x + y) % 9 === 0 ? MAT.plazaSpeck : MAT.path) : ((x * 7 + y * 13) % 17 === 0 ? MAT.grassLight : (x * 5 + y * 3) % 23 === 0 ? MAT.grassDark : MAT.grass)
        // nobody walks off into the sea
        if (edge < 1) st.solid[o] = 1
        // beyond a side door: a landing, at the floor's height (one is through before reaching its end)
        const pq = y >= 0 && y < p.IH ? f.portalAt(x, y) : null
        if (pq && Math.abs(x < 0 ? x + T : x - (p.IW + T - 1)) < 4) { st.rise[o] = GROUND + lift + FLOOR; st.mats[o] = MAT.doorway; st.solid[o] = 0 }
        continue
      }
      if (x < 0 || y < 0 || x >= p.IW || y >= p.IH) {
        // the outer walls, all round; the front one is a sill (the camera looks in over it), with the
        // door in it on the ground floor
        const front = y >= p.IH
        st.solid[o] = 1
        if (front) {
          if (p.door && x >= p.door.x0 && x <= p.door.x1) { st.rise[o] = GROUND + FLOOR; st.mats[o] = MAT.doorway; st.solid[o] = 0; continue }
          st.rise[o] = GROUND + lift + FLOOR + SILL
          st.mats[o] = MAT.wallTrim
          continue
        }
        if (f.inWindow(x, y)) { st.rise[o] = GROUND + lift + FLOOR + WIN_Z; st.mats[o] = MAT.wallTrim; continue }
        if (f.portalAt(x, y) && y >= 0) { st.rise[o] = GROUND + lift + FLOOR; st.mats[o] = MAT.doorway; st.solid[o] = 0; continue }
        st.rise[o] = GROUND + lift + FLOOR + WALL
        const skin = x === -T || y === -T || x === p.IW + T - 1
        const inner = x === -1 || x === p.IW || y === -1
        const room = f.roomAt(Math.min(p.IW - 1, Math.max(0, x)), Math.min(p.IH - 1, Math.max(0, y)))
        st.mats[o] = skin ? MAT.wallOutside : inner && room ? MAT[room.paper] : MAT.wallCap
        continue
      }
      if (f.wall[y * p.IW + x]) {
        // an inner wall: each face takes the paper of the room it faces
        st.rise[o] = GROUND + lift + FLOOR + INNER
        const near = [[x, y + 1], [x, y - 1], [x + 1, y], [x - 1, y]].map(([a, b2]) => (a >= 0 && b2 >= 0 && a < p.IW && b2 < p.IH && !f.wall[b2 * p.IW + a] ? f.roomAt(a, b2) : null)).find(Boolean)
        st.mats[o] = near ? MAT[near.paper] : MAT.wallCap
        st.solid[o] = 1
        continue
      }
      const door = p.doorways.some((d) => inBox(x, y, [d[0], d[1] - 1, d[2], d[3] + 1]))
      const room = f.roomAt(x, y)
      st.rise[o] = GROUND + lift + FLOOR
      // the stairwell going down: a hole in the floor
      if (stairCells.some((s) => s.kind === 'down' && inBox(x, y, s.box))) { st.rise[o] = GROUND + lift + FLOOR - 2; st.mats[o] = MAT.soot; st.solid[o] = 1; continue }
      if (door || !room) { st.mats[o] = MAT.doorway; continue }
      // floors: planks run across in wood rooms, tiles are a checker
      const tiled = room.id === 'bath' || room.id === 'kitchen'
      const alt = tiled ? ((x >> 2) + (y >> 2)) % 2 === 1 : y % 4 === 3 || ((x + (y >> 2) * 13) % 23 === 0)
      st.mats[o] = MAT[alt ? room.floor[1] : room.floor[0]]
    }
    const cx = f.ox + x0 + (w - 1) / 2, cy = f.oy + y0 + (h - 1) / 2
    this.stamps.push(g.world.place(st, cx, cy, 0))
    // the windows: each an open frame in its gap (a ground cell n covers n … n+1, so the middle of a gap is at +0.5)
    for (const win of p.windows) {
      const at = f.toWorld(win.side === 'w' ? -2 : win.side === 'e' ? p.IW + 1 : win.x, win.side === 'n' ? -2 : win.y)
      const W = win.half * 2 + 1
      this.extras.push(g.scene.addActor(winName(W, false), { x: at.x + 0.5, y: at.y + 0.5, z: f.fz + WIN_Z, yaw: win.side === 'n' ? 0 : win.side === 'w' ? (3 * Math.PI) / 2 : Math.PI / 2, shadow: false, dry: true }))
    }
    // the stairs
    for (const s of stairCells) {
      const at = f.toWorld(s.x, s.y)
      this.extras.push(g.scene.addActor(s.kind === 'up' ? 'i_stairs' : 'i_stairsDown', { x: at.x, y: at.y, z: f.fz - (s.kind === 'down' ? 2 : 0), yaw: 0, shadow: false, dry: true }))
      if (s.kind === 'up') g.world.block(at.x, at.y, STAIR.hw - 0.6, STAIR.hh - 0.6, true)
    }
    // the doormat inside the front door
    if (p.door) {
      const mat = f.toWorld((p.door.x0 + p.door.x1) / 2, p.IH - 3)
      this.extras.push(g.scene.addActor('i_mat', { x: mat.x, y: mat.y, z: f.fz, yaw: 0, shadow: false, dry: true }))
    }
    // the garden round it: a few trees at the sides, flowers along the front
    const trees: [string, number, number][] = [['oak2', x0 + 7, p.IH * 0.25], ['birch2', x0 + 9, p.IH * 0.7], ['apple2', x1 - 8, p.IH * 0.3], ['pine2', x1 - 7, p.IH * 0.75]]
    for (const [m, tx, ty] of trees) {
      if (!g.scene.models[m]) continue
      const at = f.toWorld(tx, Math.round(ty))
      this.extras.push(g.scene.addActor(m, { x: at.x, y: at.y, z: GROUND, yaw: (tx * 7) % 6, shadow: true, reach: 600 }))
      g.world.block(at.x, at.y, 2, 2, true)
    }
    for (let x = 4; x < p.IW - 4; x += 16) {
      if (p.door && x >= p.door.x0 - 6 && x <= p.door.x1 + 4) continue
      const at = f.toWorld(x + 4, p.IH + T + 6)
      this.extras.push(g.scene.addActor('f_flowerBed', { x: at.x, y: at.y, z: GROUND, yaw: 0, shadow: false, reach: 600 }))
    }
  }

  // ───────────────────────────────────────────────────────────── growing
  /** can the house grow now? what it would be, and what is still missing */
  nextUp(): { tier: number; name: string; coins: number; need: Bag; brings: string; level: number; ok: boolean; why: string } | null {
    const t = this.tier
    if (t >= TOP_TIER) return null
    const up = HOUSE_UPS[t + 1]
    const g = this.g
    let why = ''
    if (g.level < up.level) why = $t('小岛到 {0} 级才能扩建', up.level)
    else if (g.save.coins < up.coins) why = $t('金币不够')
    else for (const [id, n] of Object.entries(up.need) as [ItemId, number][]) if (g.count(id) < n) { why = $t('还差{0} {1}', ITEMS[id].name, n - g.count(id)); break }
    return { tier: t + 1, name: houseName(t + 1), coins: up.coins, need: up.need, brings: up.brings, level: up.level, ok: !why, why }
  }
  /** build the next size of house: paid for, the building on the island changes, the rooms grow,
   * the furniture is moved in */
  grow(free = false): boolean {
    const g = this.g
    const up = this.nextUp()
    if (!up || (!up.ok && !free)) { if (up) g.warn(up.why); return false }
    if (this.active) this.exit()
    if (!free) {
      g.save.coins -= up.coins
      g.spend(up.need)
    }
    const hs = this.save
    const from = hs.tier ?? 1
    hs.tier = up.tier
    this.clear()
    // the new floors, then the furniture into them
    this.attach()
    if (from === 0) this.fromCabin()
    if (up.tier === 2) this.upstairs()
    if (up.tier === 3) this.attic()
    if (up.tier >= 4) {
      // a new door in a wall (or new stairs): whatever stood in the way finds another spot
      for (let f = 0; f < this.floors.length; f++) this.clearStairs(f)
      this.gifts(WING_GIFTS[up.tier] ?? [])
    }
    g.mail.build()
    g.celebrate(1, $t('房子扩建好了：{0}', up.name), up.brings, 'house')
    g.sfx('fanfare')
    g.changed()
    return true
  }
  /** (tests, and the end-to-end run) grow the house to a size, without paying */
  growTo(tier: number) {
    while (this.tier < tier && this.grow(true)) { /* one size at a time, as a player would */ }
  }
  /** a piece set down where the house has it, if the spot is free (else nothing, and false) */
  private settleAt(p: Piece): boolean {
    const f = p.f ?? 0
    const was = this.cur
    void was
    if (!this.checkOn(f, p.item, p.x, p.y, p.rot, p.z ?? 0).ok) return false
    this.addPiece(p)
    return true
  }
  /** a piece wherever it fits on a floor, or the furniture box */
  private findSpot(p: Piece, f: number) {
    const hs = this.save
    const plan = this.floors[f].p
    for (let y = 2; y < plan.IH - 2; y += 3) for (let x = 2; x < plan.IW - 2; x += 3) {
      const sn = this.snapOn(f, p.item, x, y, 0, false)
      if (!this.checkOn(f, p.item, sn.x, sn.y, sn.rot, sn.z).ok) continue
      Object.assign(p, { x: sn.x, y: sn.y, rot: sn.rot, f })
      if (sn.z) p.z = sn.z; else delete p.z
      this.addPiece(p)
      return true
    }
    hs.pieces = hs.pieces.filter((q) => q !== p)
    give((hs.box ??= {}), { [p.item]: 1 })
    return false
  }
  /** the cabin's furniture into the cottage: what the cottage has a place for goes there, the rest
   * where it fits; and the cottage's own first furniture comes with it */
  private fromCabin() {
    const hs = this.save
    for (const p of hs.pieces) this.removeActor(p)
    const pool = STARTER.map((p) => ({ ...p }))
    const keep: Piece[] = [], rest: Piece[] = []
    for (const p of hs.pieces) {
      const i = pool.findIndex((q) => q.item === p.item)
      if (i >= 0) { const q = pool.splice(i, 1)[0]; Object.assign(p, { x: q.x, y: q.y, rot: q.rot, f: 0 }); if (q.z) p.z = q.z; else delete p.z; delete p.photo; keep.push(p) } else rest.push(p)
    }
    // the rest of the cottage's furniture: a house-warming
    for (const q of pool) keep.push({ ...q })
    hs.pieces = keep
    for (const p of keep) if (!this.settleAt(p)) { hs.pieces = hs.pieces.filter((x) => x !== p); give((hs.box ??= {}), { [p.item]: 1 }) }
    // what the cottage has no place for waits in the furniture box (set it out where you like)
    for (const p of rest) give((hs.box ??= {}), { [p.item]: 1 })
    if (rest.length) this.g.after(2.5, () => this.g.toast($t('{0}收进了家具箱', [...new Set(rest.map((p) => ITEMS[p.item].name))].join($t('、')))))
  }
  /** a second storey: the bedroom moves up (whatever still stands where the cottage had it), the
   * stairs go in where the bed was, and the new floor comes with a little furniture */
  private upstairs() {
    const hs = this.save
    for (const q of UPSTAIRS) {
      const was = STARTER.find((s) => s.item === q.item)!
      const p = hs.pieces.find((x) => x.item === q.item && (x.f ?? 0) === 0 && x.x === was.x && x.y === was.y && x.rot === was.rot)
      if (!p) continue
      this.removeActor(p)
      Object.assign(p, { x: q.x, y: q.y, rot: q.rot, f: 1 })
      if (q.z) p.z = q.z; else delete p.z
      if (!this.settleAt(p)) this.findSpot(p, 1)
    }
    this.clearStairs(0)
    this.gifts(UPSTAIRS_GIFTS)
  }
  private attic() {
    this.clearStairs(1)
    this.gifts(ATTIC_GIFTS)
  }
  /** anything standing where new stairs go finds another spot */
  private clearStairs(f: number) {
    const hs = this.save
    for (const p of [...hs.pieces]) {
      if ((p.f ?? 0) !== f) continue
      const pl = FURNITURE[p.item]?.place
      if (pl === 'wall' || pl === 'top') continue
      this.removeActor(p)
      if (this.checkOn(f, p.item, p.x, p.y, p.rot, p.z ?? 0).ok) { this.addPiece(p); continue }
      // with what was on it
      const riders = hs.pieces.filter((q) => (q.f ?? 0) === f && FURNITURE[q.item]?.place === 'top' && Math.abs(q.x - p.x) < 9 && Math.abs(q.y - p.y) < 9)
      for (const r of riders) { this.removeActor(r); hs.pieces = hs.pieces.filter((x) => x !== r); give((hs.box ??= {}), { [r.item]: 1 }) }
      this.findSpot(p, f)
    }
  }
  private gifts(list: Piece[]) {
    const hs = this.save
    for (const q of list) {
      const p: Piece = { ...q }
      if (!q.f) { give((hs.box ??= {}), { [q.item]: 1 }); continue }
      hs.pieces.push(p)
      if (!this.settleAt(p)) this.findSpot(p, q.f)
    }
  }

  // ───────────────────────────────────────────────────────────── old houses
  /**
   * Round 16: the little stove in the bedroom. If the standing lamp is where the house came with it,
   * it steps aside and the stove goes against the wall there; if that spot is taken, the stove waits
   * in the furniture box.
   */
  private addStove() {
    const hs = this.save
    hs.v = 6
    if ((hs.tier ?? 1) !== 1 || hs.pieces.some((p) => p.item === 'woodStove')) return
    const lamp = hs.pieces.find((p) => p.item === 'floorLamp' && p.x === 30 && p.y === 13 && (p.f ?? 0) === 0)
    const to = STARTER.find((p) => p.item === 'floorLamp')!
    if (lamp) {
      this.removeActor(lamp)
      if (this.checkOn(0, 'floorLamp', to.x, to.y, 0, 0).ok) { lamp.x = to.x; lamp.y = to.y }
      this.addPiece(lamp)
    }
    const s: Piece = { ...STARTER.find((p) => p.item === 'woodStove')! }
    if (this.checkOn(0, s.item, s.x, s.y, s.rot, 0).ok) { hs.pieces.push(s); this.addPiece(s) } else give((hs.box ??= {}), { woodStove: 1 })
  }
  /**
   * Round 13: the stock machine is now the computer on the desk. Each stock machine the player
   * had becomes a computer — the first sits on the desk (if the desk is there and clear), any
   * other waits in the furniture box.
   */
  private computerize() {
    const hs = this.save
    const box = (hs.box ??= {})
    let n = 0
    for (const p of hs.pieces.filter((x) => x.item === 'stockMachine')) {
      this.removeActor(p)
      hs.pieces = hs.pieces.filter((x) => x !== p)
      n++
    }
    if (box.stockMachine) { n += box.stockMachine; delete box.stockMachine }
    for (let i = 0; i < n; i++) {
      const desk = hs.pieces.find((p) => p.item === 'desk')
      const z = FURNITURE.desk!.top ?? 8
      if (i === 0 && desk && this.checkOn(desk.f ?? 0, 'computer', desk.x, desk.y, desk.rot, z).ok) {
        const piece: Piece = { item: 'computer', x: desk.x, y: desk.y, rot: desk.rot, z, f: desk.f }
        hs.pieces.push(piece)
        this.addPiece(piece)
      } else give(box, { computer: 1 })
    }
    hs.v = 3
  }
  /**
   * Round 15: the computer's screen faces the room. If the desk (with the computer on it) and the
   * bookshelf still stand where the house came with them, they change places: the desk to the
   * back wall, the bookshelf to the side. If either new spot is taken, both stay where they are.
   */
  private turnDesk() {
    const hs = this.save
    hs.v = 5
    const desk = hs.pieces.find((p) => p.item === 'desk' && p.x === 73 && p.y === 59 && p.rot === 2)
    const pc = hs.pieces.find((p) => p.item === 'computer' && p.x === 73 && p.y === 59)
    const shelf = hs.pieces.find((p) => p.item === 'bookshelf' && p.x === 68 && p.y === 33 && p.rot === 0)
    if (!desk || !pc || !shelf) return
    if (hs.pieces.some((p) => p !== pc && p !== desk && FURNITURE[p.item]?.place === 'top' && Math.abs(p.x - 73) < 9 && Math.abs(p.y - 59) < 6)) return
    const D = STARTER.find((q) => q.item === 'desk')!, B = STARTER.find((q) => q.item === 'bookshelf')!
    const was = [desk, pc, shelf].map((p) => ({ p, x: p.x, y: p.y, rot: p.rot }))
    for (const p of [pc, desk, shelf]) this.removeActor(p)
    const ok = this.checkOn(0, 'desk', D.x, D.y, D.rot, 0).ok && this.checkOn(0, 'bookshelf', B.x, B.y, B.rot, 0).ok
    if (ok) {
      Object.assign(desk, { x: D.x, y: D.y, rot: D.rot })
      Object.assign(pc, { x: D.x, y: D.y, rot: D.rot })
      Object.assign(shelf, { x: B.x, y: B.y, rot: B.rot })
    } else for (const w of was) Object.assign(w.p, { x: w.x, y: w.y, rot: w.rot })
    for (const p of [desk, shelf, pc]) this.addPiece(p)
  }
  /**
   * Round 14: the windows are real openings now, and the bed lies under the bedroom's. The
   * bedroom's first furniture, if it still stands where the house came with it, moves to its new
   * places — and a nightstand with a lamp, and a rug, come with the change. Anything hung where
   * a window now opens waits in the furniture box. Nothing is lost.
   */
  private rewindow() {
    const hs = this.save
    const box = (hs.box ??= {})
    for (const p of hs.pieces.filter((q) => FURNITURE[q.item]?.place === 'wall')) {
      this.removeActor(p)
      if (this.checkOn(p.f ?? 0, p.item, p.x, p.y, p.rot, p.z ?? 0).ok) this.addPiece(p)
      else { hs.pieces = hs.pieces.filter((q) => q !== p); give(box, { [p.item]: 1 }) }
    }
    const OLD: Piece[] = [{ item: 'bed', x: 7, y: 10, rot: 0 }, { item: 'floorLamp', x: 17, y: 4, rot: 0 }, { item: 'wardrobe', x: 27, y: 3, rot: 0 }]
    const R14: Record<string, Piece> = { bed: { item: 'bed', x: 9, y: 6, rot: 3 }, floorLamp: { item: 'floorLamp', x: 30, y: 13, rot: 0 }, wardrobe: { item: 'wardrobe', x: 27, y: 3, rot: 0 } }
    const found = OLD.map((o) => hs.pieces.find((p) => p.item === o.item && p.x === o.x && p.y === o.y && p.rot === o.rot))
    if (found[0]) {
      const movers = found.filter(Boolean) as Piece[]
      for (const p of movers) this.removeActor(p)
      for (const p of movers) {
        const to = R14[p.item]
        if (this.checkOn(0, p.item, to.x, to.y, to.rot, 0).ok) { p.x = to.x; p.y = to.y; p.rot = to.rot }
        else if (!this.checkOn(0, p.item, p.x, p.y, p.rot, 0).ok) { hs.pieces = hs.pieces.filter((q) => q !== p); give(box, { [p.item]: 1 }); continue }
        this.addPiece(p)
      }
    }
    const b0 = R14.bed
    if (hs.pieces.some((p) => p.item === 'bed' && p.x === b0.x && p.y === b0.y && p.rot === b0.rot)) {
      for (const gift of STARTER.filter((q) => q.item === 'nightstand' || q.item === 'tableLamp' || q.item === 'roundRug')) {
        if (!this.checkOn(0, gift.item, gift.x, gift.y, gift.rot, gift.z ?? 0).ok) continue
        const piece: Piece = { ...gift }
        hs.pieces.push(piece)
        this.addPiece(piece)
      }
    }
    hs.v = 4
  }
  /**
   * A house furnished before the house stood on the island (its rooms were bigger then): the
   * starting furniture goes where it stands in the new rooms, and everything else the player had
   * set out finds a free spot of its kind — or, if none, waits in the furniture box. Nothing is lost.
   */
  private relayout() {
    const hs = this.save
    // (as the house was in round 12: the lamp and the bed where they stood then; later rounds move them on)
    const R12: Record<string, Partial<Piece>> = { bed: { x: 7, y: 10, rot: 0 }, floorLamp: { x: 17, y: 4, rot: 0 } }
    const pool = STARTER.filter((p) => !['nightstand', 'tableLamp', 'roundRug', 'woodStove'].includes(p.item)).map((p) => ({ ...p, ...R12[p.item] }))
    const keep: Piece[] = []
    const rest: ItemId[] = []
    for (const p of hs.pieces) {
      const i = pool.findIndex((q) => q.item === p.item)
      if (i >= 0) keep.push(pool.splice(i, 1)[0])
      else rest.push(p.item)
    }
    hs.pieces = keep
    for (const p of keep) this.addPiece(p)
    const size = (it: ItemId) => { const m = this.g.scene.models[FURNITURE[it]!.model]; return (m?.W ?? 4) * (m?.L ?? 4) }
    rest.sort((a, b) => size(b) - size(a))
    for (const item of rest) {
      const piece: Piece = { item, x: 0, y: 0, rot: 0 }
      hs.pieces.push(piece)
      this.findSpot(piece, 0)
    }
    hs.v = 2
  }

  /** a piece's footprint (half sizes, turned with it) */
  footprint(item: ItemId, rot: number): { hw: number; hh: number } {
    const m = this.g.scene.models[FURNITURE[item]!.model]
    const W = m?.W ?? 8
    const L = m?.L ?? 8
    return rot % 2 ? { hw: L / 2, hh: W / 2 } : { hw: W / 2, hh: L / 2 }
  }
  private addPiece(piece: Piece) {
    const g = this.g
    const f = FURNITURE[piece.item]
    if (!f) return
    if (piece.lifted) return
    const fl = this.floors[piece.f ?? 0] ?? this.floors[0]
    if (!fl) return
    const w = fl.toWorld(piece.x, piece.y)
    const model = piece.item === 'photoFrame' && piece.photo !== undefined && g.scene.models['i_photo_' + piece.photo] ? 'i_photo_' + piece.photo : f.model
    const a = g.scene.addActor(model, { x: w.x, y: w.y, z: fl.fz + (piece.z ?? 0), yaw: this.yawOf(piece.rot), shadow: false, dry: true })
    this.actors.push({ piece, a })
    if (f.place !== 'rug' && f.place !== 'wall' && f.place !== 'top' && f.indoor !== 'rug') {
      const { hw, hh } = this.footprint(piece.item, piece.rot)
      g.world.block(w.x, w.y, hw - 0.6, hh - 0.6, true)
    }
    return a
  }

  /** can this piece be set down here (room pixels, on the floor the player is on)? and why not */
  check(item: ItemId, x: number, y: number, rot: number, z = 0): { ok: boolean; why: string } {
    return this.checkOn(this.cur, item, x, y, rot, z)
  }
  private checkOn(fn: number, item: ItemId, x: number, y: number, rot: number, z = 0): { ok: boolean; why: string } {
    const f = FURNITURE[item]
    const fl = this.floors[fn]
    if (!f || !fl) return { ok: false, why: $t('这个摆不了') }
    const P = fl.p
    const place = f.place ?? (f.indoor === 'rug' ? 'rug' : 'floor')
    const { hw, hh } = this.footprint(item, rot)
    const x0 = Math.round(x - hw), x1 = Math.round(x + hw) - 1, y0 = Math.round(y - hh), y1 = Math.round(y + hh) - 1
    const mine = (e: { piece: Piece }) => e.piece === this.moving?.piece || !!this.moving?.riders.some((r) => r.piece === e.piece)
    const here = this.actors.filter((e) => this.onFloor(e, fn))
    if (place === 'top') {
      if (!z) return { ok: false, why: $t('要放在桌子或柜子上') }
      for (const e of here) {
        if (mine(e) || FURNITURE[e.piece.item]?.place !== 'top' || (e.piece.z ?? 0) !== z) continue
        const o = this.footprint(e.piece.item, e.piece.rot)
        if (Math.abs(e.piece.x - x) < o.hw + hw - 0.5 && Math.abs(e.piece.y - y) < o.hh + hh - 0.5) return { ok: false, why: $t('和{0}挤在一起了', ITEMS[e.piece.item].name) }
      }
      return { ok: true, why: '' }
    }
    if (place === 'wall') {
      const m = this.g.scene.models[f.model]
      const zTop = z + (m?.H ?? 6)
      const across = rot % 2 ? [y - hh, y + hh] : [x - hw, x + hw]
      let onWindow = false
      for (const w of P.windows) {
        const sameWall = (w.side === 'n') === (rot % 2 === 0) && (w.side === 'n' ? Math.abs(y - hh) < 3 : w.side === 'w' ? x < 6 : x > P.IW - 6)
        if (!sameWall) continue
        const c = w.side === 'n' ? w.x : w.y
        const overlaps = across[1] > c - w.half - 1 && across[0] < c + w.half + 1 && zTop > WIN_Z && z < WALL
        if (item === 'curtains') { if (Math.abs((across[0] + across[1]) / 2 - c) < 3) onWindow = true } else if (overlaps) return { ok: false, why: $t('会挡住窗户') }
      }
      if (item === 'curtains' && !onWindow) return { ok: false, why: $t('窗帘要挂在窗户上') }
      for (const e of here) {
        if (mine(e) || FURNITURE[e.piece.item]?.place !== 'wall') continue
        const o = this.footprint(e.piece.item, e.piece.rot)
        const om = this.g.scene.models[FURNITURE[e.piece.item]!.model]
        const oz = e.piece.z ?? 0
        if (Math.abs(e.piece.x - x) < o.hw + hw - 0.5 && Math.abs(e.piece.y - y) < o.hh + hh - 0.5 && zTop > oz && z < oz + (om?.H ?? 6)) return { ok: false, why: $t('和{0}挂在一起了', ITEMS[e.piece.item].name) }
      }
      return { ok: true, why: '' }
    }
    if (x0 < 0 || y0 < 0 || x1 >= P.IW || y1 >= P.IH) return { ok: false, why: $t('靠墙太近了') }
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (fl.wall[yy * P.IW + xx]) return { ok: false, why: $t('会挡在墙上') }
    if (P.door && y1 >= P.IH - 12 && x1 >= P.door.x0 - 2 && x0 <= P.door.x1 + 2) return { ok: false, why: $t('会挡住大门') }
    for (const d of P.doorways) if (x1 >= d[0] && x0 <= d[2] && y1 >= d[1] - 7 && y0 <= d[3] + 7) return { ok: false, why: $t('会挡住门口') }
    for (const q of P.portals ?? []) if ((q.side === 'w' ? x0 <= 9 : x1 >= P.IW - 10) && y1 >= q.y - q.half - 3 && y0 <= q.y + q.half + 3) return { ok: false, why: $t('会挡住门口') }
    const flat = place === 'rug'
    for (const s of fl.stairs()) {
      const b = s.box, c = s.clear
      if ((x1 >= b[0] && x0 <= b[2] && y1 >= b[1] && y0 <= b[3]) || (!flat && x1 >= c[0] && x0 <= c[2] && y1 >= c[1] && y0 <= c[3])) return { ok: false, why: $t('会挡住楼梯') }
    }
    for (const e of here) {
      if (mine(e)) continue
      const other = FURNITURE[e.piece.item]
      if (other?.place === 'wall' || other?.place === 'top') continue
      if (flat !== (other?.indoor === 'rug' || other?.place === 'rug')) continue
      const o = this.footprint(e.piece.item, e.piece.rot)
      if (Math.abs(e.piece.x - x) < o.hw + hw - 0.5 && Math.abs(e.piece.y - y) < o.hh + hh - 0.5) return { ok: false, why: $t('和{0}挤在一起了', ITEMS[e.piece.item].name) }
    }
    // the player must not be shut in (when the player is on this floor)
    const pl = this.g.pilot
    if (pl && this.active && this.cur === fn) {
      const p = this.toRoom(pl.x, pl.y)
      if (!flat && Math.abs(p.x - x) < hw + 2 && Math.abs(p.y - y) < hh + 2) return { ok: false, why: $t('你正站在那儿') }
    }
    return { ok: true, why: '' }
  }
  /** set a piece down (already checked and paid for) */
  put(item: ItemId, x: number, y: number, rot: number) {
    const piece: Piece = { item, x: Math.round(x), y: Math.round(y), rot, f: this.cur }
    this.save.pieces.push(piece)
    const a = this.addPiece(piece)
    if (a) {
      a.stretch = 0.3
      this.g.settle(a)
    }
    return a
  }
  // ───────────────────────────────────────────────────────────── moving things about
  /**
   * The piece in the player's hands. It stays in the save (marked lifted) the whole time, so
   * nothing can be lost: put down, it stands in its new place (on whichever floor the player has
   * carried it to); let go of (收起, a tap on another slot, out of the door, a reload), it goes back
   * exactly where it was. Only 收进箱子 takes it out of the room — into the bag, or the furniture box.
   */
  moving: { piece: Piece; from: { x: number; y: number; rot: number; z?: number; f?: number }; riders: { piece: Piece; dx: number; dy: number }[] } | null = null
  /** the last thing done, for 撤回 (a few seconds after) */
  last: { kind: 'new'; piece: Piece; at: number } | { kind: 'move'; piece: Piece; from: { x: number; y: number; rot: number; z?: number; f?: number }; riders: { piece: Piece; dx: number; dy: number }[]; at: number } | null = null
  /** pick a piece up to move it (in 装修) */
  pickUp(piece: Piece) {
    const g = this.g
    if (this.moving) this.cancelMove()
    if (!this.actors.some((e) => e.piece === piece)) return
    const f = FURNITURE[piece.item]!
    const riders: { piece: Piece; dx: number; dy: number }[] = []
    if (f.top) {
      const { hw, hh } = this.footprint(piece.item, piece.rot)
      for (const e of this.actors) {
        const q = e.piece
        if (q === piece || FURNITURE[q.item]?.place !== 'top' || (q.f ?? 0) !== (piece.f ?? 0)) continue
        if (Math.abs(q.x - piece.x) <= hw && Math.abs(q.y - piece.y) <= hh && (q.z ?? 0) === f.top) riders.push({ piece: q, dx: q.x - piece.x, dy: q.y - piece.y })
      }
    }
    this.moving = { piece, from: { x: piece.x, y: piece.y, rot: piece.rot, z: piece.z, f: piece.f }, riders }
    for (const q of [piece, ...riders.map((r) => r.piece)]) { this.removeActor(q); q.lifted = true }
    g.sfx('pick')
    g.placingRot = piece.rot
    g.startMove(piece.item)
    g.changed()
  }
  /** let go of what is being moved: it goes back where it was */
  cancelMove() {
    const m = this.moving
    if (!m) return
    this.moving = null
    for (const q of [m.piece, ...m.riders.map((r) => r.piece)]) { delete q.lifted; this.addPiece(q) }
    this.g.changed()
  }
  /** set what is being moved down (room pixels, on the floor the player is on) */
  dropMove(x: number, y: number, rot: number, z: number) {
    const m = this.moving
    if (!m) return
    this.moving = null
    const p = m.piece
    const fl = this.cur
    const turn = (rot - p.rot + 4) % 4
    p.x = Math.round(x); p.y = Math.round(y); p.rot = rot; p.f = fl
    if (z) p.z = z; else delete p.z
    delete p.lifted
    const a = this.addPiece(p)
    if (a) { a.stretch = 0.4; this.g.settle(a) }
    const top = FURNITURE[p.item]?.top ?? 0
    for (const r of m.riders) {
      let dx = r.dx, dy = r.dy
      for (let t = 0; t < turn; t++) { const ox = dx; dx = dy; dy = -ox }
      r.piece.x = Math.round(p.x + dx); r.piece.y = Math.round(p.y + dy); r.piece.z = top; r.piece.f = fl
      r.piece.rot = (r.piece.rot + turn) % 4
      delete r.piece.lifted
      this.addPiece(r.piece)
    }
    this.last = { kind: 'move', piece: p, from: m.from, riders: m.riders.map((r) => ({ ...r })), at: this.g.clock }
  }
  /** what is being moved goes into the bag (or the furniture box), with whatever stood on it */
  stash() {
    const m = this.moving
    if (!m) return
    this.moving = null
    const g = this.g
    for (const q of [m.piece, ...m.riders.map((r) => r.piece)]) {
      this.save.pieces = this.save.pieces.filter((x) => x !== q)
      this.toBag(q.item)
    }
    g.cancelPlacing(true)
    g.sfx('pop')
    g.changed()
  }
  /** into the bag if there is room, else the furniture box (shown in the tray while decorating) */
  toBag(item: ItemId) {
    const g = this.g
    if (g.fits({ [item]: 1 })) g.receive({ [item]: 1 })
    else give((this.save.box ??= {}), { [item]: 1 })
  }
  /** a new piece set down (room pixels, on the floor the player is on) */
  putNew(item: ItemId, x: number, y: number, rot: number, z: number) {
    const piece: Piece = { item, x: Math.round(x), y: Math.round(y), rot, f: this.cur }
    if (z) piece.z = z
    this.save.pieces.push(piece)
    const a = this.addPiece(piece)
    if (a) { a.stretch = 0.3; this.g.settle(a) }
    this.last = { kind: 'new', piece, at: this.g.clock }
    // a new frame: straight to the album to choose its picture
    if (item === 'photoFrame') this.g.after(0.4, () => this.g.open({ kind: 'frame', piece }))
    return a
  }
  /** 撤回: take back the last thing done, within a little while */
  get canUndo(): boolean {
    return !!this.last && this.g.clock - this.last.at < 12 && this.save.pieces.includes(this.last.piece)
  }
  undo() {
    const l = this.last
    if (!l || !this.canUndo) return
    this.last = null
    const g = this.g
    if (l.kind === 'new') {
      this.removeActor(l.piece)
      this.save.pieces = this.save.pieces.filter((x) => x !== l.piece)
      this.toBag(l.piece.item)
    } else {
      const ps = [l.piece, ...l.riders.map((r) => r.piece)]
      for (const q of ps) this.removeActor(q)
      l.piece.x = l.from.x; l.piece.y = l.from.y; l.piece.rot = l.from.rot; l.piece.f = l.from.f
      if (l.from.z) l.piece.z = l.from.z; else delete l.piece.z
      this.addPiece(l.piece)
      for (const r of l.riders) { r.piece.x = l.piece.x + r.dx; r.piece.y = l.piece.y + r.dy; r.piece.f = l.from.f; this.addPiece(r.piece) }
    }
    g.sfx('pop', 0.8)
    g.changed()
  }
  private removeActor(piece: Piece) {
    const g = this.g
    const i = this.actors.findIndex((e) => e.piece === piece)
    if (i < 0) return
    const { a } = this.actors[i]
    const f = FURNITURE[piece.item]
    if (f && f.place !== 'rug' && f.place !== 'wall' && f.place !== 'top' && f.indoor !== 'rug') {
      const fl = this.floors[piece.f ?? 0] ?? this.floors[0]
      const w = fl.toWorld(piece.x, piece.y)
      const { hw, hh } = this.footprint(piece.item, piece.rot)
      g.world.block(w.x, w.y, hw - 0.6, hh - 0.6, false)
    }
    g.scene.removeActor(a)
    this.actors.splice(i, 1)
  }
  /** all the furniture the player has and has not set out: bag, warehouse, box (for the tray) */
  owned(): { item: ItemId; n: number }[] {
    const g = this.g
    const box = this.save.box ?? {}
    const out: { item: ItemId; n: number }[] = []
    for (const id of Object.keys(FURNITURE) as ItemId[]) {
      const n = (g.save.inv[id] ?? 0) + (g.save.store?.[id] ?? 0) + (box[id] ?? 0)
      if (n > 0 && FURNITURE[id]!.indoor) out.push({ item: id, n })
    }
    return out
  }
  /** the models that show what the player has done: the aquarium's fish, the biggest fish on its
   * board, the pictures in the frames */
  refreshModels() {
    const g = this.g
    const caught = (['tuna', 'grouper', 'angelfish', 'mackerel', 'bream', 'sardine', 'reefFish', 'moonfish', 'ray', 'squid'] as ItemId[]).filter((k) => (g.save.stats.gathered[k] ?? 0) > 0)
    const COL: Partial<Record<ItemId, [number, number, number]>> = { tuna: [70, 100, 160], grouper: [150, 110, 80], angelfish: [250, 210, 80], mackerel: [80, 150, 170], bream: [230, 140, 120], sardine: [170, 190, 210], reefFish: [255, 140, 60], moonfish: [210, 220, 255], ray: [110, 110, 130], squid: [240, 180, 190] }
    const cols = caught.map((k) => COL[k]!).filter(Boolean)
    g.scene.registerModel(aquariumModel(cols.length ? cols : [[255, 140, 60]]))
    const best = g.save.records ? Object.entries(g.save.records).sort((a, b) => (b[1]?.cm ?? 0) - (a[1]?.cm ?? 0))[0] : null
    g.scene.registerModel(plaqueModel((best && COL[best[0] as ItemId]) || [110, 150, 200]))
    for (const p of this.save.pieces) if (p.item === 'photoFrame' && p.photo !== undefined) this.framePicture(p)
  }
  /** the picture in a frame: read from the album (on this device) and drawn into the frame's model */
  framePicture(p: Piece) {
    const g = this.g
    const id = p.photo
    if (id === undefined) return
    const name = 'i_photo_' + id
    const show = () => {
      const e = this.actors.find((x) => x.piece === p)
      if (e && g.scene.models[name]) e.a.model = g.scene.models[name]
    }
    if (g.scene.models[name]) return show()
    void g.photoPixels(id, 11, 8).then((pix) => {
      if (!pix) return
      g.scene.registerModel(photoFrame(name, pix))
      show()
    })
  }
  /** a picture chosen for a frame */
  setPhoto(p: Piece, id: number) {
    p.photo = id
    this.framePicture(p)
    this.g.sfx('pop', 1.2)
    this.g.changed()
  }

  // ───────────────────────────────────────────────────────────── where a thing goes
  /** the wall faces a room has: which side, the line it runs along, and the span */
  private faces(fl: Floor, room: Room): { side: 'n' | 's' | 'w' | 'e'; at: number; from: number; to: number }[] {
    const out: { side: 'n' | 's' | 'w' | 'e'; at: number; from: number; to: number }[] = []
    const P = fl.p
    const isWallAt = (x: number, y: number) => x < 0 || y < 0 || x >= P.IW || (y < P.IH && fl.wall[y * P.IW + x] === 1)
    const run = (side: 'n' | 's' | 'w' | 'e', fixed: number, from: number, to: number, probe: (t: number) => boolean) => {
      let a = -1
      for (let t = from; t <= to + 1; t++) {
        const on = t <= to && probe(t)
        if (on && a < 0) a = t
        if (!on && a >= 0) { if (t - a >= 6) out.push({ side, at: fixed, from: a, to: t - 1 }); a = -1 }
      }
    }
    run('n', room.y0, room.x0, room.x1, (x) => isWallAt(x, room.y0 - 1))
    run('s', room.y1, room.x0, room.x1, (x) => room.y1 + 1 < P.IH && isWallAt(x, room.y1 + 1))
    run('w', room.x0, room.y0, room.y1, (y) => isWallAt(room.x0 - 1, y))
    run('e', room.x1, room.y0, room.y1, (y) => isWallAt(room.x1 + 1, y))
    return out
  }
  /**
   * Where a thing dropped near (x, y) settles. On the floor: flush against a wall it is near,
   * turned to face the room (beds, shelves, sofas); lined up with the things around it; in the
   * middle of the room or across from its twin; a chair to the side of a table, a rug under a
   * table or sofa, a bedside table beside the bed, a plant into a corner. On a wall: hung at its
   * height, lined up over the furniture below or in the middle of the wall; curtains on a window.
   * On a tabletop: on the nearest surface. `free`: no help, just where the finger is.
   */
  snap(item: ItemId, x: number, y: number, rot: number, free: boolean): Snap {
    return this.snapOn(this.cur, item, x, y, rot, free)
  }
  private snapOn(fn: number, item: ItemId, x: number, y: number, rot: number, free: boolean): Snap {
    const f = FURNITURE[item]!
    const fl = this.floors[fn]
    const P = fl.p
    const place = f.place ?? (f.indoor === 'rug' ? 'rug' : 'floor')
    x = Math.round(x); y = Math.round(y)
    const room = fl.roomAt(Math.max(0, Math.min(P.IW - 1, x)), Math.max(0, Math.min(P.IH - 1, y)))
    if (place === 'top') return this.snapTop(fn, item, x, y, rot, free)
    if (place === 'wall') return this.snapWall(fn, item, x, y, rot, free)
    const raw: Snap = { x, y, rot, z: 0, hint: '' }
    if (free || !room) return raw
    const cands: (Snap & { cost: number })[] = [{ ...raw, cost: 0 }]
    const add = (c: Snap, bonus: number) => {
      const d = Math.hypot(c.x - x, c.y - y)
      if (d <= 16) cands.push({ ...c, x: Math.round(c.x), y: Math.round(c.y), cost: d - bonus })
    }
    const others = this.actors.filter((e) => this.onFloor(e, fn) && e.piece !== this.moving?.piece && FURNITURE[e.piece.item]?.place !== 'wall' && FURNITURE[e.piece.item]?.place !== 'top')
    for (const fc of this.faces(fl, room)) {
      const r = fc.side === 'n' ? 0 : fc.side === 's' ? 2 : fc.side === 'w' ? 3 : 1
      const rr = f.back ? r : rot
      const { hw, hh } = this.footprint(item, rr)
      if (fc.side === 'n' || fc.side === 's') {
        const cy = fc.side === 'n' ? fc.at + hh : fc.at + 1 - hh
        const cx = Math.max(fc.from + hw, Math.min(fc.to + 1 - hw, x))
        if (Math.abs(cy - y) < 12) add({ x: cx, y: cy, rot: rr, z: 0, hint: $t('靠墙') }, f.back ? 9 : 3)
      } else {
        const cx = fc.side === 'w' ? fc.at + hw : fc.at + 1 - hw
        const cy = Math.max(fc.from + hh, Math.min(fc.to + 1 - hh, y))
        if (Math.abs(cx - x) < 12) add({ x: cx, y: cy, rot: rr, z: 0, hint: $t('靠墙') }, f.back ? 9 : 3)
      }
    }
    const mx = (room.x0 + room.x1 + 1) / 2, my = (room.y0 + room.y1 + 1) / 2
    if (Math.abs(x - mx) < 7) add({ x: mx, y, rot, z: 0, hint: $t('居中') }, 4)
    if (Math.abs(y - my) < 7 && !f.back) add({ x, y: my, rot, z: 0, hint: $t('居中') }, 3)
    for (const e of others) {
      const q = e.piece
      if (fl.roomAt(q.x, q.y) !== room) continue
      if (Math.abs(q.x - x) < 5) add({ x: q.x, y, rot, z: 0, hint: $t('对齐') }, 3)
      if (Math.abs(q.y - y) < 5) add({ x, y: q.y, rot, z: 0, hint: $t('对齐') }, 3)
      if (q.item === item) add({ x: 2 * mx - q.x, y: q.y, rot: (4 - q.rot) % 4 === 0 ? q.rot : (q.rot + 2) % 4, z: 0, hint: $t('对称') }, 6)
      const qf = FURNITURE[q.item]!
      const qs = this.footprint(q.item, q.rot)
      const me = this.footprint(item, rot)
      if (f.indoor === 'seat' && qf.indoor === 'table') {
        for (const [sx, sy, r] of [[0, 1, 2], [0, -1, 0], [1, 0, 1], [-1, 0, 3]] as [number, number, number][]) {
          const ms = this.footprint(item, r)
          add({ x: q.x + sx * (qs.hw + ms.hw + 1), y: q.y + sy * (qs.hh + ms.hh + 1), rot: r, z: 0, hint: $t('围桌') }, 8)
        }
      }
      if (place === 'rug' && (qf.indoor === 'table' || qf.indoor === 'seat' || qf.indoor === 'bed')) add({ x: q.x, y: q.y + (qf.indoor === 'table' ? 0 : qs.hh), rot, z: 0, hint: $t('垫在下面') }, 8)
      if (item === 'nightstand' && qf.indoor === 'bed') {
        for (const s of [-1, 1]) add({ x: q.x + s * (qs.hw + me.hw + 1), y: q.y - qs.hh + me.hh, rot: q.rot, z: 0, hint: $t('床边') }, 8)
      }
    }
    if (f.indoor === 'deco') {
      const { hw, hh } = this.footprint(item, rot)
      for (const [cx, cy] of [[room.x0 + hw + 1, room.y0 + hh + 1], [room.x1 - hw, room.y0 + hh + 1], [room.x0 + hw + 1, room.y1 - hh], [room.x1 - hw, room.y1 - hh]]) add({ x: cx, y: cy, rot, z: 0, hint: $t('墙角') }, 6)
    }
    cands.sort((a, b) => a.cost - b.cost)
    for (const c of cands) if (this.checkOn(fn, item, c.x, c.y, c.rot, 0).ok) return { x: c.x, y: c.y, rot: c.rot, z: 0, hint: c.hint }
    return raw
  }
  private snapWall(fn: number, item: ItemId, x: number, y: number, rot: number, free: boolean): Snap {
    const f = FURNITURE[item]!
    const fl = this.floors[fn]
    const P = fl.p
    const z = f.wallZ ?? 8
    let best: { x: number; y: number; rot: number; d: number; along: 'x' | 'y'; from: number; to: number } | null = null
    for (const room of P.rooms) for (const fc of this.faces(fl, room)) {
      if (fc.side === 's') continue // the front sill: nothing hangs there
      const r = fc.side === 'n' ? 0 : fc.side === 'w' ? 3 : 1
      const { hw, hh } = this.footprint(item, r)
      let cx: number, cy: number
      if (fc.side === 'n') { cy = fc.at + hh - 0.5; cx = Math.max(fc.from + hw, Math.min(fc.to + 1 - hw, x)) } else { cx = fc.side === 'w' ? fc.at + hw - 0.5 : fc.at + 1.5 - hw; cy = Math.max(fc.from + hh, Math.min(fc.to + 1 - hh, y)) }
      const d = Math.hypot(cx - x, cy - y)
      if (!best || d < best.d) best = { x: cx, y: cy, rot: r, d, along: fc.side === 'n' ? 'x' : 'y', from: fc.from, to: fc.to }
    }
    if (!best) return { x, y, rot, z: f.wallZ ?? 8, hint: '' }
    const outer = best.along === 'x' ? best.y < 6 : best.x < 6 || best.x > P.IW - 6
    const H = this.g.scene.models[f.model]?.H ?? 6
    const zz = Math.max(1, Math.min(z, (outer ? WALL : INNER) - H))
    let hint = $t('挂墙')
    let { x: bx, y: by } = best
    if (!free) {
      const wins = P.windows.map((w) => ({ x: w.side === 'w' ? 0 : w.side === 'e' ? P.IW - 1 : w.x, y: w.side === 'n' ? 0 : w.y, side: w.side, half: w.half }))
      const along = best.along === 'x' ? bx : by
      const targets: { v: number; hint: string; w: number }[] = [{ v: (best.from + best.to + 1) / 2, hint: $t('居中'), w: 4 }]
      for (const w of wins) {
        if ((best.along === 'x') !== (w.side === 'n')) continue
        const v = best.along === 'x' ? w.x : w.y
        if (item === 'curtains') targets.push({ v, hint: $t('挂在窗上'), w: 30 })
        else targets.push({ v: v + w.half + 6, hint: $t('窗边'), w: 3 }, { v: v - w.half - 6, hint: $t('窗边'), w: 3 })
      }
      for (const e of this.actors) {
        if (!this.onFloor(e, fn)) continue
        const q = e.piece
        const qf = FURNITURE[q.item]!
        if (qf.place === 'wall' || qf.place === 'top') continue
        const near = best.along === 'x' ? Math.abs(q.y - by) < 16 : Math.abs(q.x - bx) < 16
        if (near) targets.push({ v: best.along === 'x' ? q.x : q.y, hint: $t('挂在{0}上方', ITEMS[q.item].name), w: 6 })
      }
      let pick: { v: number; hint: string } | null = null
      let cost = 99
      for (const t of targets) {
        const c = Math.abs(t.v - along) - t.w
        if (Math.abs(t.v - along) < (item === 'curtains' ? 40 : 10) && c < cost && this.checkOn(fn, item, best.along === 'x' ? t.v : bx, best.along === 'x' ? by : t.v, best.rot, zz).ok) { cost = c; pick = t }
      }
      if (pick) { if (best.along === 'x') bx = pick.v; else by = pick.v; hint = pick.hint }
    }
    return { x: Math.round(bx), y: Math.round(by), rot: best.rot, z: zz, hint }
  }
  private snapTop(fn: number, item: ItemId, x: number, y: number, rot: number, free: boolean): Snap {
    let best: { e: { piece: Piece; a: Actor }; d: number } | null = null
    for (const e of this.actors) {
      if (!this.onFloor(e, fn)) continue
      const qf = FURNITURE[e.piece.item]!
      if (!qf.top || e.piece === this.moving?.piece) continue
      const { hw, hh } = this.footprint(e.piece.item, e.piece.rot)
      const dx = Math.max(0, Math.abs(x - e.piece.x) - hw), dy = Math.max(0, Math.abs(y - e.piece.y) - hh)
      const d = Math.hypot(dx, dy)
      if (d < 10 && (!best || d < best.d)) best = { e, d }
    }
    if (!best) return { x, y, rot, z: 0, hint: $t('要放在桌上') }
    const q = best.e.piece
    const top = FURNITURE[q.item]!.top!
    const { hw, hh } = this.footprint(q.item, q.rot)
    const me = this.footprint(item, rot)
    const cx = Math.max(q.x - hw + me.hw, Math.min(q.x + hw - me.hw, x))
    const cy = Math.max(q.y - hh + me.hh, Math.min(q.y + hh - me.hh, y))
    if (free) return { x: Math.round(cx), y: Math.round(cy), rot, z: top, hint: $t('放在{0}上', ITEMS[q.item].name) }
    const spots = [[q.x, q.y], [q.x - hw / 2, q.y], [q.x + hw / 2, q.y], [q.x, q.y - hh / 2], [q.x, q.y + hh / 2], [cx, cy]].map(([a, b]) => ({ x: Math.round(a), y: Math.round(b) }))
    spots.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
    for (const sp of spots) if (this.checkOn(fn, item, sp.x, sp.y, rot, top).ok) return { x: sp.x, y: sp.y, rot, z: top, hint: $t('放在{0}上', ITEMS[q.item].name) }
    return { x: Math.round(cx), y: Math.round(cy), rot, z: top, hint: $t('放在{0}上', ITEMS[q.item].name) }
  }

  // ───────────────────────────────────────────────────────────── taps
  /** the pieces, the stairs and the door on this floor, for the tap test (as on the island) */
  taps(test: (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias?: number) => void) {
    const g = this.g
    const fl = this.F
    for (const e of this.actors) {
      if (!this.onFloor(e)) continue
      const f = FURNITURE[e.piece.item]!
      const m = g.scene.models[f.model]
      const { hw, hh } = this.footprint(e.piece.item, e.piece.rot)
      if (f.indoor === 'rug' && !this.decorating) continue
      const lift = e.piece.z ?? 0
      const small = f.place === 'top' || f.place === 'wall'
      test(e.a.x, e.a.y, Math.max(hw, small ? 3 : 0), Math.max(hh, small ? 3 : 0), fl.fz + lift, m?.H ?? 6, () => (this.decorating ? this.pickUp(e.piece) : this.goUse(e)), f.indoor === 'rug' ? 6 : small ? -3 : 0)
    }
    // the stairs (walked to, then climbed — with whatever is being carried, in 装修 too)
    for (const s of fl.stairs()) {
      const at = fl.toWorld(s.x, s.y)
      const to = s.to
      const foot = fl.toWorld(s.foot.x, s.foot.y)
      test(at.x, at.y, STAIR.hw, STAIR.hh, fl.fz, s.kind === 'up' ? 16 : 7, () => g.walkTo(foot, 3, () => this.climb(to)), 2)
    }
    // the side doors (walked through)
    for (const q of fl.p.portals ?? []) {
      const at = fl.toWorld(q.side === 'w' ? -2 : fl.IW + 1, q.y)
      const go = fl.toWorld(q.side === 'w' ? -4 : fl.IW + 3, q.y)
      test(at.x, at.y, 3, q.half + 1, fl.fz, 10, () => g.walkTo(go, 1.5, null), -2)
    }
    if (fl.p.door && !this.decorating) {
      const d = fl.p.door
      const at = fl.toWorld((d.x0 + d.x1) / 2, fl.IH)
      test(at.x, at.y, 8, 3, fl.fz, 4, () => g.walkTo(fl.toWorld((d.x0 + d.x1) / 2, fl.IH - 4), 3, () => this.exit()), -4)
    }
  }
  /** walk round to the side it is used from, then use it */
  /** sat down indoors: the furniture between the camera and the pilot goes see-through (and comes back after) */
  clearView(sn: number, cs: number, reach: number, k: number) {
    const g = this.g
    const p = g.pilot
    for (const e of this.actors) {
      let goal = 1
      const dx = e.a.x - p.x, dy = e.a.y - p.y
      if (g.sitting && (Math.abs(dx) > 1 || Math.abs(dy) > 1) && FURNITURE[e.piece.item]?.place !== 'rug') {
        const { hw, hh } = this.footprint(e.piece.item, e.piece.rot)
        const half = Math.max(hw, hh)
        const rise = (e.piece.z ?? 0) + (e.a.model?.H ?? 8)
        const toCam = dx * sn + dy * cs
        const side = Math.abs(dx * cs - dy * sn)
        if (rise > 9 && toCam > 1 && toCam < rise * reach * 0.7 + half && side < half + 1) goal = 0.3
      }
      if (e.a.fade !== goal) e.a.fade = Math.abs((e.a.fade ?? 1) - goal) < 0.02 ? goal : (e.a.fade ?? 1) + (goal - (e.a.fade ?? 1)) * k
    }
  }
  /** the nearest chair to eat at (one drawn up to a table first): walk to it, sit, then eat. False: none near. */
  sitToEat(then: () => void): boolean {
    const g = this.g
    const p = g.pilot
    let best: { piece: Piece; a: Actor } | null = null, score = 90
    for (const e of this.actors) {
      if (!['chair', 'stool', 'armchair'].includes(e.piece.item)) continue
      const yaw = e.a.yaw + Math.PI
      const d = Math.hypot(e.a.x - p.x, e.a.y - p.y) - (this.tableTop(e.a.x + Math.sin(yaw) * 7, e.a.y - Math.cos(yaw) * 7) != null ? 45 : 0)
      if (d < score) { score = d; best = e }
    }
    if (!best) return false
    this.goUse(best, then)
    return true
  }
  /** the top of the table standing at this spot (world height), if one does */
  tableTop(x: number, y: number): number | null {
    for (const e of this.actors) {
      const f = FURNITURE[e.piece.item]
      if (f?.indoor !== 'table' && f?.indoor !== 'desk' && f?.indoor !== 'counter') continue
      const { hw, hh } = this.footprint(e.piece.item, e.piece.rot)
      if (Math.hypot(e.a.x - x, e.a.y - y) <= Math.max(hw, hh) + 2) return this.fz + (f.top ?? 8)
    }
    return null
  }
  private goUse(e: { piece: Piece; a: Actor }, then?: () => void) {
    const g = this.g
    const f = FURNITURE[e.piece.item]!
    const { hh, hw } = this.footprint(e.piece.item, e.piece.rot)
    const r = e.piece.rot
    const fx = -Math.round(Math.sin((r * Math.PI) / 2))
    const fy = Math.round(Math.cos((r * Math.PI) / 2))
    const reach = (fx ? hw : hh) + 4
    let front = this.toWorld(e.piece.x + fx * reach, e.piece.y + fy * reach)
    const free = (p: { x: number; y: number }) => !g.world.solidAt(Math.round(p.x), Math.round(p.y))
    if (!free(front)) {
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const q = this.toWorld(e.piece.x + dx * (hw + 4), e.piece.y + dy * (hh + 4))
        if (free(q)) { front = q; break }
      }
    }
    g.walkTo(front, 2.5, () => {
      g.face(Math.atan2(e.a.x - g.pilot.x, -(e.a.y - g.pilot.y)), 1)
      this.use(f.indoor!, e)
      then?.()
    })
  }
  private use(kind: IndoorUse, e: { piece: Piece; a: Actor }) {
    const g = this.g
    const p = g.pilot
    const fz = this.fz
    switch (kind) {
      case 'bed': this.bed = e.a; return g.open({ kind: 'bed' })
      case 'shower': case 'bathtub': return g.body.wash(kind, e.a)
      case 'stove': case 'counter': return g.open({ kind: 'cook' })
      case 'fridge': return g.open({ kind: 'crates' })
      case 'desk': return g.open({ kind: 'house' })
      case 'stocks': return e.piece.item === 'computer' ? g.acts.sitAtPc() : g.open({ kind: 'pc' })
      case 'books': return g.open({ kind: 'journal' })
      case 'tv': return g.body.watchTv()
      case 'photo': return g.open({ kind: 'frame', piece: e.piece })
      case 'guestbook': return g.open({ kind: 'guestbook' })
      case 'craft': return g.open({ kind: 'workbench' })
      case 'planter': {
        const day = g.clockDay
        if (e.piece.picked === day) { g.sfx('tap', 0.8); return g.float($t('明天再来'), e.a.x, e.a.y, fz + 12) }
        e.piece.picked = day
        const pick: ItemId = (['carrot', 'strawberry', 'flower', 'wheat', 'flower'] as ItemId[])[(day + Math.round(e.piece.x)) % 5]
        const got = g.receive({ [pick]: 2 })
        g.sfx('pick')
        g.drop(got, e.a.x, e.a.y, fz + 8)
        g.changed()
        return
      }
      case 'stars': {
        if (g.dayPhase() === 'day') { g.sfx('tap', 0.8); return g.float($t('天黑了再看'), e.a.x, e.a.y, fz + 14) }
        const sky = (this.save.sky ??= [])
        const next = SKY.find((c) => !sky.includes(c))
        if (!next || g.clock - this.gazed < 600) { g.sfx('pop', 1.4); return g.float($t('✦ 满天星'), e.a.x, e.a.y, fz + 14) }
        this.gazed = g.clock
        sky.push(next)
        g.celebrate(1, $t('认出了一个星座：{0}', next), $t('已经认出 {0} / {1} 个', sky.length, SKY.length), 'telescope')
        g.changed()
        return
      }
      case 'swim': {
        g.sfx('splash', 1.1)
        g.scene.burst({ kind: 'water', x: p.x, y: p.y, z: fz + 2, n: 12, speed: 16, up: 20, life: 0.6, r: 3 })
        if (g.clock - this.swum > 120) {
          this.swum = g.clock
          g.body.energy = Math.min(g.body.max, g.body.energy + 8)
          return g.float($t('舒服 +8'), p.x, p.y, p.z + 14)
        }
        return g.float($t('舒服'), p.x, p.y, p.z + 14)
      }
      case 'beacon': {
        const on = (this.save.beacon = !this.save.beacon)
        g.sfx(on ? 'ding' : 'tap')
        g.scene.burst({ kind: 'spark', x: e.a.x, y: e.a.y, z: fz + 16, n: on ? 24 : 4, speed: 20, up: 20, life: 0.8, mode: 'float', grav: 0, r: 4 })
        return g.toast(on ? $t('灯塔亮了：夜里送货多拿一成') : $t('灯塔熄了'))
      }
      case 'fire':
        g.sfx('crackle', 0.8)
        g.scene.burst({ kind: 'spark', x: e.a.x, y: e.a.y + 2, z: fz + 5, n: 6, speed: 8, up: 18, life: 0.7, mode: 'float', grav: -10, r: 3 })
        // warming your hands at it on a cold or wet day: a little strength back, once in a while
        if ((g.weather.today === 'rain' || g.weather.today === 'storm' || g.weather.today === 'snow') && g.clock - this.warmed > 120) {
          this.warmed = g.clock
          g.body.energy = Math.min(g.body.max, g.body.energy + 5)
          return g.float($t('暖和 +5'), p.x, p.y, p.z + 14)
        }
        return g.float($t('暖和'), p.x, p.y, p.z + 14)
      case 'seat': {
        const on = g.sitting && Math.hypot(g.sitting.x - e.a.x, g.sitting.y - e.a.y) < 1
        if (e.piece.item === 'sofa' && on && g.sitting?.kind !== 'lie') return g.sitOn({ x: e.a.x, y: e.a.y, yaw: e.a.yaw + Math.PI / 2, z: fz + 3 }, false, 'lie')
        const soft = e.piece.item === 'sofa' || e.piece.item === 'armchair'
        return g.sitOn({ x: e.a.x, y: e.a.y, yaw: e.a.yaw + Math.PI, z: fz + (e.piece.item === 'stool' ? 3 : e.piece.item === 'armchair' ? 2 : 3) }, false, soft ? 'soft' : 'seat')
      }
      case 'rock': return g.sitOn({ x: e.a.x, y: e.a.y, yaw: e.a.yaw + Math.PI, z: fz + 3 }, false, 'rock')
      case 'low': {
        const m = g.scene.models[FURNITURE[e.piece.item]!.model]
        return g.sitOn({ x: e.a.x, y: e.a.y, yaw: e.a.yaw + Math.PI, z: fz + (m?.H ?? 2) - 4 }, false, 'low')
      }
      case 'lean': {
        const yaw = e.a.yaw + Math.PI
        const { hh } = this.footprint(e.piece.item, 0)
        return g.sitOn({ x: e.a.x - Math.sin(e.a.yaw) * (hh + 3), y: e.a.y + Math.cos(e.a.yaw) * (hh + 3), yaw, z: fz }, false, 'lean')
      }
      case 'lamp': {
        g.sfx('tap', 1.6)
        g.scene.burst({ kind: 'spark', x: e.a.x, y: e.a.y, z: fz + (e.piece.z ?? 0) + 4, n: 4, speed: 4, up: 6, life: 0.5, mode: 'float', grav: 0, r: 2 })
        return g.float('✦', e.a.x, e.a.y, fz + (e.piece.z ?? 0) + 8)
      }
      case 'look': g.sfx('pop', 1.3); return g.float('♡', e.a.x, e.a.y, fz + (e.piece.z ?? 0) + 10)
      case 'mirror': g.sfx('pop', 1.5); return g.float('✧', p.x, p.y, p.z + 14)
      case 'clock': g.sfx('tap', 0.9); g.after(0.3, () => g.sfx('tap', 0.9)); return g.float(g.body.clockText, e.a.x, e.a.y, fz + (e.piece.z ?? 0) + 8)
      case 'curtain': g.sfx('whoosh', 1.4, 0.5); return g.float($t('～'), e.a.x, e.a.y, fz + 12)
      case 'tea': {
        g.sfx('splash', 1.8, 0.5)
        g.body.energy = Math.min(g.body.max, g.body.energy + 3)
        g.scene.burst({ kind: 'dust', x: e.a.x, y: e.a.y, z: fz + (e.piece.z ?? 0) + 3, n: 5, speed: 3, up: 10, life: 1, mode: 'smoke', grav: -8, r: 2 })
        return g.float('☕ +3', p.x, p.y, p.z + 14)
      }
      case 'fish': return g.open({ kind: 'fishbook' })
      case 'toilet':
        g.sfx('splash', 1.4)
        g.scene.burst({ kind: 'water', x: e.a.x, y: e.a.y, z: fz + 6, n: 6, speed: 8, up: 12, life: 0.5, r: 2 })
        return g.float($t('哗——'), p.x, p.y, p.z + 14)
      case 'sink':
        g.sfx('splash', 1.8)
        return g.float($t('洗了洗手'), p.x, p.y, p.z + 14)
      case 'wardrobe': return g.open({ kind: 'look' })
      case 'table': g.sfx('tap', 1.1); return g.float('♪', p.x, p.y, p.z + 14)
      default: return
    }
  }
  private warmed = -999
  private gazed = -9999
  private swum = -999

  /** lie down on the bed and listen: the rain on the roof, the fire, the music */
  lieDown() {
    const g = this.g
    const b = this.bed
    if (!b) return
    g.panel = null
    g.stopWalking()
    const look = g.look
    const hair = look.hair === 'bald' ? SKINS[look.skin] : HAIR_COLORS[look.hairColor]
    const e = this.actors.find((x) => x.a === b)
    const bz = this.floors[e?.piece.f ?? 0]?.fz ?? this.fz
    if (b.model?.name === 'i_bed' || b.model?.name === 'i_bed_hd') {
      const sk = SKINS[look.skin] ?? SKINS[1], hr = hair ?? HAIR_COLORS[1]
      g.scene.registerModel(bedWithSleeper(sk, hr))
      g.scene.registerModel(bedHD({ skin: sk, hair: hr }))
      b.model = g.scene.models.i_bed_sleep
      b.scale = 1
      g.pilot.visible = false
    } else {
      const p = g.pilot
      p.x = b.x; p.y = b.y; p.z = bz + 5; p.yaw = b.yaw
      p.model = g.scene.models.pilot_lie
    }
    this.resting = true
    this.lowCam(true)
    g.sfx('pop', 0.6)
    g.changed()
  }
  getUp() {
    if (!this.resting) return
    const g = this.g
    this.resting = false
    this.hdOff()
    const p = g.pilot
    p.model = g.scene.models.pilot
    p.visible = true
    const e = this.bed ? this.actors.find((x) => x.a === this.bed) : null
    const fl = this.floors[e?.piece.f ?? this.cur] ?? this.F
    p.z = fl.fz
    if (this.bed && (this.bed.model?.name === 'i_bed_sleep' || this.bed.model?.name === 'i_bed_sleep_hd')) { this.bed.model = g.scene.models.i_bed; this.bed.scale = 1 }
    if (!this.waking) this.lowCam(false)
    if (this.bed) {
      const { at, f, across, along, ey } = this.bedSides(this.bed)
      const spots = [[ey[0] * (across + 4), ey[1] * (across + 4)], [f[0] * (along + 4), f[1] * (along + 4)], [-ey[0] * (across + 4), -ey[1] * (across + 4)]]
      for (let k = -6; k <= 6; k += 3) spots.push([ey[0] * (across + 4) + f[0] * k, ey[1] * (across + 4) + f[1] * k])
      for (const [dx, dy] of spots) {
        const rx = at.x + dx, ry = at.y + dy
        const w = fl.toWorld(rx, ry)
        if (rx < 1 || ry < 1 || rx > fl.IW - 2 || ry > fl.IH - 2 || g.world.solidAt(Math.round(w.x), Math.round(w.y))) continue
        p.x = w.x
        p.y = w.y
        break
      }
    }
    g.sfx('pop', 0.9)
    g.changed()
  }
  private phase = ''
  /** falling asleep (seconds to go before the night passes), and waking (the camera rising from the pillow) */
  sleepIn = 0
  waking = 0
  private viewWas: boolean | null = null
  /** the camera down low beside the bed (or back up) */
  private lowCam(on: boolean) {
    const g = this.g
    if (on) {
      if (this.viewWas === null) this.viewWas = g.view3d
      g.scene.setIslandView(true)
      this.cutOff = 0
    } else {
      this.hdOff()
      g.scene.setCamera({ angle: null, near: null, mag: null, free: false, yaw: g.camYaw })
      if (this.viewWas !== null) g.scene.setIslandView(this.viewWas)
      this.viewWas = null
      this.shot = null
      if (this.cut) this.cutOff = 1.4
    }
  }
  /** the inner walls let down while the camera is by the bed (so it can stand back from it), and
   * the time left before they go back up */
  private cut: unknown = null
  private cutOff = 0
  private dropCut() {
    if (this.cut) this.g.world.remove(this.cut)
    this.cut = null
    this.cutOff = 0
  }
  /** the pieces by the bed drawn finer for the close shot (and what they were) */
  private hdOn: { a: Actor; model: Actor['model']; scale: number }[] = []
  private hdUp(bed: Actor) {
    const g = this.g
    if (this.hdOn.length) return
    for (const e of this.actors) {
      const name = e.a.model?.name
      if (!name || !HD[name] || Math.hypot(e.a.x - bed.x, e.a.y - bed.y) > 40) continue
      const hd = g.scene.models[HD[name]]
      if (!hd) continue
      this.hdOn.push({ a: e.a, model: e.a.model, scale: e.a.scale })
      e.a.model = hd
      e.a.scale = 0.5
    }
  }
  private hidden: Actor[] = []
  private unhide() {
    for (const a of this.hidden) a.visible = true
    this.hidden = []
  }
  private hdOff() {
    this.unhide()
    for (const h of this.hdOn) {
      // (the bed may have changed under it: someone in it, or not)
      const name = h.a.model?.name
      h.a.model = name === 'i_bed_sleep_hd' ? this.g.scene.models.i_bed_sleep : name === 'i_bed_hd' && h.model?.name === 'i_bed_sleep' ? this.g.scene.models.i_bed : h.model
      if (!this.resting && h.a.model?.name === 'i_bed_sleep') h.a.model = this.g.scene.models.i_bed
      h.a.scale = h.scale
    }
    this.hdOn = []
  }
  /** a bed, in the room's own terms: where it is, which way it lies (head → foot), half its size
   * across and along, and the side of it the room is on (the sleeper's right if there is room to
   * stand back there, else the left): the camera's side, and the side to get out on */
  private bedSides(bed: Actor) {
    const e = this.actors.find((q) => q.a === bed)
    const fl = this.floors[e?.piece.f ?? 0] ?? this.F
    const at = e ? { x: e.piece.x, y: e.piece.y } : { x: Math.round(this.g.world.delta(bed.x, fl.ox)), y: Math.round(this.g.world.delta(bed.y, fl.oy)) }
    const rot = e ? e.piece.rot & 3 : 0
    const fp = this.footprint(e?.piece.item ?? 'bed', rot)
    const f = [[0, 1], [-1, 0], [0, -1], [1, 0]][rot]
    const r = [-f[1], f[0]]
    const across = Math.abs(r[0]) * fp.hw + Math.abs(r[1]) * fp.hh
    const along = Math.abs(f[0]) * fp.hw + Math.abs(f[1]) * fp.hh
    const room = (d: number[]) => (d[0] > 0 ? fl.IW - 1 - at.x : d[0] < 0 ? at.x : d[1] > 0 ? fl.IH - 1 - at.y : at.y) - across
    const side = room(r) >= 18 || room(r) >= room([-r[0], -r[1]]) ? 1 : -1
    const ey = [r[0] * side, r[1] * side]
    return { at, f, across, along, ey, fl, room: () => room(ey) }
  }
  private shot: { bed: Actor; w: number; h: number; x: number; y: number; alt: number; yaw: number; angle: number; near: number; mag: number } | null = null
  /**
   * The shot from bed (round 14): the camera low at the sleeper's right-hand side, close, looking
   * across the bed at the wall beyond it — in the bedroom the house comes with, the big window,
   * and the sea and the weather through it. The top of that wall is the top of the picture and
   * the horizon lies in the window. Inner walls between the camera and the bed are let down for it.
   */
  private bedShot(bed: Actor) {
    const g = this.g
    const sc = g.scene as unknown as { width: number; height: number }
    const Wf = sc.width || 427, Hf = sc.height || 267
    if (this.shot && this.shot.bed === bed && this.shot.w === Wf && this.shot.h === Hf) return this.shot
    const { at, f, across, along, ey, room, fl } = this.bedSides(bed)
    const D = Math.max(16, Math.min(34, room() + across * 2 - 2))
    const S = Math.min(Hf / 33, (0.95 * Wf * (1 - across / D)) / (along * 2))
    const ALT = WALL - (0.6 * Hf + 8) / S, EYE = 11
    const mag = Math.max(1, Math.min(5, S / (2.35 * 1.3)))
    const t = 2
    const T2 = { x: at.x - ey[0] * (across + 0.5) + f[0] * t, y: at.y - ey[1] * (across + 0.5) + f[1] * t }
    const w = fl.toWorld(T2.x, T2.y)
    const vx = -ey[0], vy = -ey[1]
    // inner walls between the camera and the bed come down
    this.dropCut()
    const P = fl.p
    const cells = new Set<number>()
    for (let y = 0; y < P.IH; y++) for (let x = 0; x < P.IW; x++) {
      if (!fl.wall[y * P.IW + x]) continue
      const dd = (x - T2.x) * ey[0] + (y - T2.y) * ey[1]
      const ll = Math.abs((x - T2.x) * ey[1] - (y - T2.y) * ey[0])
      if (dd > across * 2 + 1 && dd < D + 3 && ll <= 30) cells.add(y * P.IW + x)
    }
    if (cells.size) {
      const st: Stamp = blank('house-cut', P.IW, P.IH)
      for (let y = 0; y < P.IH; y++) for (let x = 0; x < P.IW; x++) {
        const o = y * P.IW + x
        st.mats[o] = 255
        if (!cells.has(o)) continue
        st.rise[o] = fl.fz
        st.mats[o] = MAT.doorway
        st.solid[o] = 1
      }
      this.cut = g.world.place(st, fl.ox + (P.IW - 1) / 2, fl.oy + (P.IH - 1) / 2, 0)
    }
    // and the furniture there stands aside (hidden) while the camera is down by the bed
    this.unhide()
    for (const e of this.actors) {
      if ((e.piece.f ?? 0) !== fl.n || e.a === bed) continue
      const ff = FURNITURE[e.piece.item]
      if (ff?.indoor === 'rug' || ff?.place === 'rug') continue
      const fp = this.footprint(e.piece.item, e.piece.rot)
      const dd = (e.piece.x - T2.x) * ey[0] + (e.piece.y - T2.y) * ey[1]
      const ll = Math.abs((e.piece.x - T2.x) * ey[1] - (e.piece.y - T2.y) * ey[0])
      const reach = Math.abs(ey[0]) * fp.hw + Math.abs(ey[1]) * fp.hh
      if (dd + reach > across * 2 + 2 && dd - reach < D + 8 && ll < 34 && e.a.visible) { e.a.visible = false; this.hidden.push(e.a) }
    }
    this.shot = {
      bed, w: Wf, h: Hf, x: w.x + 0.5, y: w.y + 0.5, alt: fl.fz + ALT, yaw: Math.atan2(-vx, -vy),
      angle: (Math.atan2(EYE - ALT, D) * 180) / Math.PI, near: D / (150 / 1.3), mag,
    }
    return this.shot
  }
  /** the bed actor nearest a point (goToBed may be given just a position) */
  bedNear(at: { x: number; y: number }): Actor {
    const beds = this.actors.filter((e) => FURNITURE[e.piece.item]?.indoor === 'bed')
    let best: Actor | null = null, bd = 1e9
    for (const e of beds) { const d = Math.hypot(e.a.x - at.x, e.a.y - at.y); if (d < bd) { bd = d; best = e.a } }
    return best ?? (at as Actor)
  }
  /** to sleep: lie down, the eyes close, and then the night */
  /** napping: a couple of hours, not the night */
  napping = false
  fallAsleep(nap = false) {
    if (!this.resting) this.lieDown()
    this.napping = nap
    this.sleepIn = 2.4
    this.g.changed()
  }
  /** how closed the eyes are, 0 (open) – 1 (shut): for the overlay */
  get eyes(): number {
    const g = this.g
    if (this.sleepIn > 0) return Math.min(1, Math.max(0, 1 - (this.sleepIn - 0.4) / 2))
    if (g.panel?.kind === 'night') return 1
    if (this.waking > 0) return Math.min(1, Math.max(0, (this.waking - 1.4) / 1))
    return 0
  }
  step(dt: number) {
    const g = this.g
    if (this.sleepIn > 0) {
      this.sleepIn -= dt
      if (this.sleepIn <= 0) { this.sleepIn = 0; if (this.napping) { this.napping = false; g.body.nap() } else g.body.sleep(false) }
    }
    if (this.waking > 0 && g.panel?.kind !== 'night') {
      this.waking -= dt
      if (this.waking <= 1.2 && this.viewWas !== null) this.lowCam(false)
      if (this.waking <= 0) this.waking = 0
    }
    if (this.cutOff > 0) {
      this.cutOff -= dt
      if (this.cutOff <= 0) this.dropCut()
    }
    const ph = g.dayPhase()
    if (ph !== this.phase) {
      this.phase = ph
      g.setIndoorLight()
    }
    const p = g.pilot
    const bed = this.bed
    if ((this.resting || (this.waking > 1.2 && g.panel?.kind !== 'night') || g.panel?.kind === 'night') && bed) {
      const v = this.bedShot(bed)
      this.hdUp(bed)
      if (this.resting && bed.model?.name === 'i_bed_hd' && g.scene.models.i_bed_sleep_hd) bed.model = g.scene.models.i_bed_sleep_hd
      g.scene.setCamera({ x: v.x, y: v.y, alt: v.alt, yaw: v.yaw, zoom: 2.6, angle: v.angle, near: v.near, mag: v.mag, free: true })
      return
    }
    // the camera stays on the house: it follows the player, but not far past the walls
    const fl = this.F
    const c = fl.toWorld(fl.IW / 2, fl.IH / 2)
    const lx = p.x - c.x, ly = p.y - c.y
    const ux = Math.max(-fl.IW * 0.3, Math.min(fl.IW * 0.3, lx)), uy = Math.max(-fl.IH * 0.3, Math.min(fl.IH * 0.3, ly)) - 6
    const sc = g.scene as unknown as { width: number; height: number }
    const narrow = sc.width && sc.height ? Math.min(1, (sc.width / sc.height) / 1.25) : 1
    // a small floor is seen a little closer
    const small = fl.IW < 70 ? 1.15 : 1
    const zoom = (g.islandZoom === 2 ? (g.view3d ? 2.6 : 2.1) : 1.6) * Math.max(0.82, narrow) * small
    g.scene.setCamera({ x: c.x + ux, y: c.y + uy, alt: fl.fz, yaw: g.camYaw, zoom })
  }

  labels(put: (id: string, text: string, x: number, y: number, z: number, cls: Label['kind']) => void) {
    if (this.resting || this.sleepIn > 0 || this.waking > 0) return // nothing written over the view from bed
    const fl = this.F
    for (const r of fl.p.rooms) {
      const w = fl.toWorld((r.x0 + r.x1) / 2, r.y0 + 2)
      put('room-' + r.id, r.name, w.x, w.y, fl.fz + INNER + 2, 'building')
    }
    for (const s of fl.stairs()) {
      const w = fl.toWorld(s.x, s.y + 4)
      put('room-stairs-' + s.kind, (s.kind === 'up' ? $t('上楼 · ') : $t('下楼 · ')) + FLOOR_NAMES[s.to], w.x, w.y, fl.fz + (s.kind === 'up' ? 18 : 9), 'building')
    }
    for (const q of fl.p.portals ?? []) {
      const w = fl.toWorld(q.side === 'w' ? 1 : fl.IW - 2, q.y)
      put('room-portal-' + q.to, $t('去{0}', FLOOR_NAMES[q.to]), w.x, w.y, fl.fz + 14, 'building')
    }
    if (fl.p.door) {
      const d = fl.toWorld((fl.p.door.x0 + fl.p.door.x1) / 2, fl.IH + 1)
      put('room-door', $t('出门'), d.x, d.y, fl.fz + 6, 'building')
    }
  }

  /** where a guest and their host sit downstairs (the guests' corner first, then any seat): world points */
  guestSeats(): { x: number; y: number; z: number; yaw: number }[] {
    const fl = this.floors[0]
    const seats = this.actors.filter((e) => (e.piece.f ?? 0) === 0 && FURNITURE[e.piece.item]?.indoor === 'seat')
    seats.sort((a, b) => (fl.roomAt(b.piece.x, b.piece.y)?.id === 'guest' ? 1 : 0) - (fl.roomAt(a.piece.x, a.piece.y)?.id === 'guest' ? 1 : 0))
    const out = seats.map((e) => ({ x: e.a.x, y: e.a.y, z: fl.fz + 3, yaw: e.a.yaw + Math.PI }))
    const mid = fl.toWorld(fl.IW / 2, fl.IH - 14)
    if (out.length < 1) out.push({ x: mid.x - 8, y: mid.y, z: fl.fz, yaw: Math.PI / 2 })
    if (out.length < 2) out.push({ x: mid.x + 8, y: mid.y, z: fl.fz, yaw: -Math.PI / 2 })
    return out
  }
  /** the piece a visitor likes best: the most charming thing in the house */
  favourite(): ItemId | null {
    let best: ItemId | null = null
    for (const p of this.save.pieces) if (!best || (FURNITURE[p.item]?.charm ?? 0) > (FURNITURE[best]?.charm ?? 0)) best = p.item
    return best
  }
  /** how homely the house is: what is in it, and whether each room has what it needs */
  cosiness(): { score: number; notes: string[]; gaps: { room: string; list: string }[] } {
    const have = (it: ItemId, room: string) => this.save.pieces.some((p) => p.item === it && this.roomOf(p)?.id === room)
    const notes: string[] = []
    const gaps: { room: string; list: string }[] = []
    let score = 0
    for (const p of this.save.pieces) score += FURNITURE[p.item]?.charm ?? 0
    const tier = this.tier
    const sets: [string, ItemId[], [string, string]][] = tier === 0
      ? [['hut', ['bed', 'stove', 'roundTable', 'woodStove'], [$t('小屋'), $t('床、灶台、小圆桌、小火炉')]]]
      : [
          ['bed', ['bed', 'wardrobe', 'floorLamp'], tier >= 2 ? [$t('二楼卧室'), $t('床、衣柜、落地灯')] : [$t('卧室'), $t('床、衣柜、落地灯')]],
          ['bath', ['toilet', 'sink', 'shower'], [$t('卫生间'), $t('马桶、洗手台、淋浴')]],
          ['kitchen', ['stove', 'fridge', 'dinnerTable'], [$t('厨房'), $t('灶台、冰箱、餐桌')]],
          ['living', ['sofa', 'tv', 'coffeeTable', 'rug'], [$t('客厅'), $t('沙发、电视、茶几、地毯')]],
          ['guest', ['chair', 'pottedPlant'], [$t('会客区'), $t('椅子、盆栽')]],
          ...(tier >= 2 ? [['lounge', ['armchair', 'bigPlant'], [$t('起居室'), $t('扶手椅、大盆栽')]] as [string, ItemId[], [string, string]]] : []),
          ...(tier >= 3 ? [['attic', ['rockingChair', 'bigPlant'], [$t('阁楼'), $t('摇椅、大盆栽')]] as [string, ItemId[], [string, string]]] : []),
        ]
    for (const [room, items, [label, list]] of sets) {
      const text = $t('{0}：{1}', label, list)
      if (items.every((i) => have(i, room))) { score += 10; notes.push('✓ ' + text) }
      else {
        notes.push('· ' + text)
        gaps.push({ room: label, list })
      }
    }
    return { score, notes, gaps }
  }
  /** a line in the guestbook (the newest first; the book keeps 30) */
  sign(who: string, text: string) {
    const book = (this.save.book ??= [])
    book.unshift({ day: this.g.clockDay, who, text })
    if (book.length > 30) book.length = 30
  }
  /** is there a guestbook out in the house? */
  get hasBook(): boolean { return this.save.pieces.some((p) => p.item === 'guestbook') }
}
