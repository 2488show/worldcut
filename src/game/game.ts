// The game itself: the pilot on an island, gathering, crafting, building vehicles, the market,
// and flying goods to another island. It has no DOM in it — the UI only reads its state and
// calls its methods — so the whole loop can be played (and is tested) headless in Node.

import { Tackle } from './tackle'
import { createScene } from '../engine/scene'
import { MAT } from '../engine/materials'
import {
  makeWorldDef, layoutIsland, placeBuilding, canPlace, TIERS,
  type GuestIsland, type IslandLayout, type NodeInst, type BuildingInst, type BuildingKind, type Point, type WorldApi, type WorldDef,
} from './world'
import {
  ITEMS, NODES, RECIPES, VEHICLES, HULLS, vehicleDef, nextLevel, NEW_WEAR, type Wear, UPGRADES, FURNITURE, PLANTS, MAX_PLANTS, HOTBAR, PACKS, PACK_ROW, TOOL_USES, TOOL_MEND, DYES, TOOLS, FOOD, stackOf, slotsFor, supersedes, betterThan, has, take, give, bagText, toolTier, toolName,
  type Bag, type ItemId, type VehicleId, type UpgradeId,
} from './data'
import { findPath, floodReach, freeSpot, slide, walkable } from './nav'
import {
  LocalBackend, newLocalState, type Backend, type Delivery, type LocalState, type Order, type ShopLine,
} from './backend'
import { QUESTS } from './quests'
import { Mine, type MineSave } from './mine'
import { Acts } from './act'
import { Combat, type SeaId } from './combat'
import { Angling } from './sea'
import { Dive } from './dive'
import { Voyage, PIRATE_FREE_DELIVERIES, type VoyageView } from './voyage'
import { Story, FRIENDS, FRIEND_NAME } from './story'
import { LEVELS, levelForTier, farmPlots, petSlots } from './levels'
import { Life, CRITTER_ITEMS } from './life'
import { Farm, type Bed, type CompostSave, type FieldSave } from './farm'
import { Pets, type Pet } from './pets'
import { craftModel, DESIGN_COLOURS, type Paint } from '../engine/craft'
import type { Online } from './online'
import { House, type HomeSave, type Piece } from './house'
import { Wishes, type WishSave } from './wish'
import { Estate, FACILITIES, facilityOfKit, type EstateSave, type FacilityId } from './estate'
import { Body, DAY_SECONDS, type DaySummary } from './body'
import { Weather } from './weather'
import { Visits } from './visit'
import { Skills, type Skill } from './skills'
import { Mail, type MailSave } from './mail'
import { seasonAt, type Season } from './season'
import { Stocks, type StockSave } from './stocks'
import { plateModel } from '../engine/indoor'
import { DEFAULT_LOOK, personModels, readLook, type Look } from '../engine/avatar'
import { $t } from '../i18n'

/**
 * Feedback the game asks the screen for. The game has no sound or DOM of its own: it says what
 * happened and the UI plays it. (Particles and screen shake are the engine's, so those it does
 * itself.) Every action the player takes must send at least one of these — a test checks that.
 */
export type Fx =
  | { t: 'sfx'; name: string; pitch?: number; vol?: number }
  /** someone says something, in the islands' tongue (a voice: 1 is middling, higher is higher) */
  | { t: 'say'; text: string; voice: number }
  /** things fly from a place in the world into the bag, or coins into the purse */
  | { t: 'fly'; icon: string; n: number; x: number; y: number; z: number; to: 'bag' | 'coins' }
  /** 1: a banner for an everyday step · 2: a milestone, with the full ceremony */
  | { t: 'celebrate'; level: 1 | 2; title: string; sub?: string; icon?: string }
  | { t: 'toast'; bad: boolean }
  /** a buzz of the phone (the bite, the line straining) */
  | { t: 'rumble'; ms: number }
export type MusicScene = 'island' | 'mine' | 'water' | 'flight' | 'sail' | 'pirate' | 'home' | 'rest' | 'fishing'

export interface OwnedVehicle {
  id: string; type: VehicleId; at: string; up?: UpgradeId[]
  /** its level within the hull's generation (missing: the generation's first) */
  lv?: number
  /** how worn its engine, its hull and its paint are (1 = new) */
  wear?: Wear
  /** how it is painted (missing: the hull's own colours) */
  paint?: Paint
}
/** a batch in a furnace. f: which furnace (0 the first; round 21: up to three, each burning at once) */
export interface Job { out: ItemId; qty: number; doneAt: number; f?: number }
/** how many furnaces an island of this level may have (round 21) */
export const furnaceCap = (level: number) => (level >= 7 ? 3 : level >= 4 ? 2 : 1)
/** how many batches one furnace holds */
export const FURNACE_QUEUE = 8
export interface Stats { downed?: number; dodged?: number; sorties?: number; seaFished?: number; bred?: number; sold?: number; hired?: number; relayed?: number; traded?: number; wishes?: number; treated?: number; hosted?: number; postcards?: number; photos?: number; cooked?: number; gathered: Bag; crafted: Bag; built: number; accepted: number; posted: number; delivered: number; fished?: number; dived?: number; harvested?: number; caught?: number; danger?: number; escaped?: number; received?: number; painted?: number; broken?: number; repaired?: number }
/** the big moments that have already had their ceremony (each happens once) */
export type Milestone = 'plane' | 'boat' | 'delivery' | 'furnace' | 'ingot'
export interface Save {
  estate?: EstateSave
  v: 3
  /** the player's island: the seed it grew from, its level, and how often it has been re-rolled */
  island: { seed: number; tier: number; rolls: number }
  coins: number
  inv: Bag
  vehicles: OwnedVehicle[]
  /** the plane standing on the runway (others wait in the hangar) */
  activePlane: string | null
  furnace: Point | null
  jobs: Job[]
  /** the second and third furnaces (round 21); the first is `furnace` */
  furnaces2?: { x: number; y: number }[]
  /** node id → the time it has grown back */
  nodes: Record<string, number>
  /** the island the pilot is on */
  here: string
  questSeen: number
  stats: Stats
  backend: LocalState
  seq: number
  welcomed: boolean
  milestones: Partial<Record<string, true>>
  mine?: MineSave
  /** furniture set out on the island: where each piece stands, relative to the middle of the village */
  decor?: { item: ItemId; dx: number; dy: number; rot?: number }[]
  /** what the player calls their island (shown to other players) */
  name?: string
  /** the chapters after the guide: which one is open, and whether the far shore has been reached */
  story?: { ch: number; ended?: boolean }
  /** deliveries made to each islander: what friendship is counted in */
  friends?: Record<string, number>
  visited?: Record<string, true>
  /** the collection book: everything that has ever been in the bag */
  seen?: Partial<Record<ItemId, true>>
  /** things planted on the island: what, where (relative to the village), and when it is grown */
  planted?: { kind: string; dx: number; dy: number; at: number }[]
  settings?: { music: number; sfx: number }
  /** seconds played, and the time of day (0 dawn … 1) */
  played?: number
  day?: number
  /** the island's level, 1–10 (the land's size is island.tier, which follows it) */
  level?: number
  /** the farm's beds (before round 18; now the field) */
  farm?: Bed[]
  field?: FieldSave
  /** the creel: fish caught with it on the back, each with its length */
  creel?: { item: ItemId; cm: number; day: number }[]
  compost?: CompostSave
  /** pets, and every species and colour ever seen (1) or owned (2) */
  pets?: Pet[]
  petSeen?: Record<string, 1 | 2>
  /** the warehouse at home: as much as anyone likes, but only at home */
  store?: Bag
  /** uses left in each tool (a tool not listed is new) */
  tools?: Partial<Record<ItemId, number>>
  /** strength and how full the player is (out of 100) */
  energy?: number
  full?: number
  /** the day the shower was last used (once a day) */
  washed?: number
  /** how things stood when the day began (for the evening's summary) */
  dayStart?: { coins: number; delivered: number; gathered: number; caught: number; harvested: number; cooked: number }
  /** the furniture inside the house */
  home?: HomeSave
  /** what the player looks like (made at the start, changed at the wardrobe) */
  look?: Look
  /** the restaurant, if one has been built (where) */
  restaurant?: Point | null
  /** the day a visitor last came, and the good name earned by feeding them (adds to charm) */
  visitDay?: number
  hospitality?: number
  homeFurnished?: boolean
  /** ground the shovel has levelled: where (from the village) and at what height */
  terrain?: { dx: number; dy: number; h: number; rx?: number; ry?: number }[]
  /** the order things sit in the slots (the first eight are the hotbar) */
  order?: ItemId[]
  /** the hotbar slot in hand */
  held?: number
  /** online: which player's island lies in each of the chart's open slots */
  guestSlots?: (string | null)[]
  /** practice at each kind of work (熟练度): experience points */
  skills?: Partial<Record<Skill, number>>
  /** the post: letters in the mailbox */
  mail?: MailSave
  /** the most stars a visitor or the weekly judging has given the house, and the last week judged */
  bestStars?: number
  /** the biggest of each fish ever landed: its length, and the day */
  records?: Partial<Record<ItemId, { cm: number; day: number }>>
  /** the seas cleared of sky pirates, and the last day each stays clear (round 22) */
  cleared?: Record<string, number>
  /** the deepest band of water dived to so far (0 the shallows …) */
  diveZones?: number
  /** the stock machine: prices, history, what is held */
  stocks?: StockSave
  /** round 13: what is on the hook */
  bait?: ItemId
  /** round 13: the computer's minesweeper — best times, and how many paid wins today */
  sweep?: { best: Partial<Record<string, number>>; paidDay: number; paid: number }
  cosyWeek?: number
  /** round 16: today's small wish from an islander */
  wish?: WishSave
  /** when this save was last written (to tell which of two copies is newer) */
  at?: number
}

/** brings an older save up to date (v2 was the second slice: same world, fewer things in it) */
export function migrate(raw: unknown): Save | null {
  const s = raw as Save | null
  if (!s || typeof s !== 'object' || ((s.v as number) !== 2 && s.v !== 3) || !s.island || !s.stats) return null
  s.v = 3
  s.store ??= {}
  s.level ??= levelForTier(s.island.tier)
  // vehicles from before the ten levels: the plane was the second level of its line, the boat the third, the jet the seventh
  for (const v of s.vehicles ?? []) {
    v.lv ??= v.type === 'sparrow' ? 2 : v.type === 'skiff' ? 3 : v.type === 'falcon' ? 7 : undefined
    v.wear ??= { engine: 1, hull: 1, paint: 1 }
  }
  // whoever has delivered already has been somewhere: count the islands their vehicles stand on
  s.visited ??= {}
  for (const v of s.vehicles ?? []) if (v.at !== 'home') s.visited[v.at] = true
  return s
}

export function newSave(seed?: number): Save {
  return {
    v: 3, island: { seed: seed ?? 1 + Math.floor(Math.random() * 1e6), tier: 1, rolls: 0 }, coins: 0, inv: {}, vehicles: [], activePlane: null, furnace: null, jobs: [], nodes: {}, here: 'home',
    questSeen: 0, stats: { gathered: {}, crafted: {}, built: 0, accepted: 0, posted: 0, delivered: 0 },
    backend: newLocalState(), seq: 1, welcomed: false, milestones: {},
  }
}

export type Panel =
  | { kind: 'welcome' }
  | { kind: 'workbench' } | { kind: 'furnace' } | { kind: 'hangar' } | { kind: 'pier' } | { kind: 'crates' } | { kind: 'house' } | { kind: 'mine' }
  | { kind: 'board' }
  | { kind: 'depart'; vehicleId: string }
  | { kind: 'paint'; vehicleId: string }
  | { kind: 'cook'; restaurant?: boolean }
  | { kind: 'visitor' }
  | { kind: 'bed' }
  | { kind: 'mail'; open?: number }
  | { kind: 'stocks' }
  | { kind: 'pc'; app?: string }
  | { kind: 'tackle' }
  | { kind: 'compost' }
  | { kind: 'creel' }
  | { kind: FacilityId }
  | { kind: 'frame'; piece: Piece }
  | { kind: 'guestbook' }
  | { kind: 'wish' }
  | { kind: 'album' }
  | { kind: 'fishbook' }
  | { kind: 'look'; first?: boolean }
  | { kind: 'night'; summary: DaySummary }
  | { kind: 'arrived'; island: string; lines: { text: string; reward: number; tip: number }[]; bonus: { text: string; coins: number } | null; robbed: string | null; friend?: { text: string; gift: Bag | null } | null }
  | { kind: 'journal' } | { kind: 'ending' } | { kind: 'settings' } | { kind: 'bag' }

export interface Toast { id: number; text: string; left: number; bad?: boolean }
export interface Floater { id: number; text: string; x: number; y: number; z: number; age: number }
export interface Label { key: string; text: string; x: number; y: number; kind: 'building' | 'vehicle' | 'float' | 'progress' | 'speech' | 'lock'; value?: number }
export interface FlightHud {
  vehicle: string
  dest: string | null
  /** distance to the destination in px, and its bearing on screen (0 = up, clockwise, radians) */
  dist: number
  bearing: number
  /** island that can be landed on right now */
  canLand: string | null
  phase: 'takeoff' | 'cruise' | 'landing'
  cargo: string
  seconds: number
  voyage: VoyageView
}

export interface GameOptions {
  save?: Save | null
  /** the seed of a new game's island (random when not given) */
  seed?: number
  now?: () => number
  rnd?: () => number
  persist?: (s: Save) => void
  params?: Record<string, unknown>
  /** other players' islands to put on the chart (online) */
  guests?: GuestIsland[]
}

const WALK = 46 // px/s
/** people are built bigger than they are drawn (see avatar.ts) */
export const PERSON_SCALE = 0.76
/** the shovel levels a patch this many pixels each way from where it digs */
const SHOVEL_R = 5
const REROLLS = 3 // how often a newcomer may roll the island again
const word = (v: number) => (v > 1.1 ? $t('丰富') : v < 0.92 ? $t('偏少') : $t('一般'))
const richLine = (d: IslandLayout['def']) => $t('林木{0} 矿藏{1} 鱼群{2}', word(d.rich.wood), word(d.rich.ore), word(d.rich.fish))
export { DAY_SECONDS }
const plantKey = (p: { dx: number; dy: number }) => `${Math.round(p.dx)}_${Math.round(p.dy)}`
const CRAFT_TIME = 0.8 // seconds at the workbench per item
const PLANE_RANGE = 250 // how close to a runway a landing can start
const BOAT_RANGE = 120
const EAST = Math.PI / 2
const WEST = -Math.PI / 2
const SOUTH = Math.PI
const THANKS = [$t('谢谢！正缺这个'), $t('来得正好！'), $t('辛苦了，路上顺利吗？'), $t('太好了，等了好久')]
const BUILDING_NAME: Record<BuildingKind, string> = { hangar: $t('机库'), workbench: $t('工作台'), furnace: $t('熔炉'), crates: $t('仓库'), house: $t('小屋'), board: $t('布告板'), pier: $t('码头'), mine: $t('矿洞'), landmark: '', restaurant: $t('餐厅'), ranch: $t('牧场'), shop: $t('小店'), depot: $t('货运站'), lighthouse: $t('灯塔'), exchange: $t('交易所') }
const LANDMARK_NAME: Record<string, string> = { beacon: $t('彼岸的灯塔'), lighthouse: $t('灯塔'), greatTree: $t('千年古树'), spire: $t('石峰'), wreck: $t('沉船'), windmill: $t('风车') }
const LANDMARK_TEXT: Record<string, string> = {
  beacon: $t('海的那一边的灯塔。它比别的都高，灯从来不灭——你在家门口见过的那点光，就是它。'),
  lighthouse: $t('灯塔。夜里，很远的海上都看得见它。'),
  greatTree: $t('千年古树。树冠里开着粉色的花，据说岛还没人住的时候它就在了。'),
  spire: $t('石峰。山尖上常年有雪。'),
  wreck: $t('一艘搁浅的旧船。不知道它从海的哪一边来。'),
  windmill: $t('风车。风大的日子它转得很快。'),
}

/** the engine (scene.ts is the prototype's untyped JavaScript): its models by name, and what a prop is */
type Scene = Omit<ReturnType<typeof createScene>, 'models'> & { models: Record<string, any> }
type Actor = ReturnType<ReturnType<typeof createScene>['addActor']> & { sv?: number; reach?: number }

export class Game {
  scene!: Scene
  world!: WorldApi
  layouts: Record<string, IslandLayout> = {}
  save: Save
  backend!: Backend
  /** the islanders' side of the market (always runs in the page) */
  local!: LocalBackend
  /** online: puts the shared market in front of the local one */
  wrapBackend: ((local: LocalBackend) => Backend) | null = null
  /** the online layer, when there is one */
  online: Online | null = null
  private pendingGuests: GuestIsland[] | null = null
  /** quarter turns the piece being set out has been given */
  placingRot = 0
  /** something other players can see has changed (name, decor, level) */
  onlineDirty = true
  orders: Order[] = []
  deliveries: Delivery[] = []
  shop: ShopLine[] = []

  def!: WorldDef
  /** on an island: the tilted view with depth (true) or the plain overhead one */
  view3d = true
  /** which way the island camera looks: 0 = north up, in eighths of a turn */
  camYaw = 0
  rnd: () => number
  /** the prop for each node and each building ("island:id") */
  private nodeProp = new Map<string, Actor>()
  private buildingProp = new Map<string, Actor>()
  settling: Actor[] = []
  mine = new Mine(this)
  fishing = new Angling(this)
  dive = new Dive(this)
  voyage = new Voyage(this)
  story = new Story(this)
  life = new Life(this)
  farm = new Farm(this)
  pets = new Pets(this)
  house = new House(this)
  body = new Body(this)
  weather = new Weather(this)
  visits = new Visits(this)
  skills = new Skills(this)
  mail = new Mail(this)
  stocks = new Stocks(this)
  tackle = new Tackle(this)
  wishes = new Wishes(this)
  estate = new Estate(this)
  /** other players' islands in this world (online) */
  guests: GuestIsland[] = []
  /** the islanders, one on each neighbouring island */
  private owners: Record<string, Actor> = {}
  private decorProps: Actor[] = []
  /** benches to sit on: where, and which way they face */
  benches: { x: number; y: number; yaw: number }[] = []
  /** sitting on a bench (until the pilot sets off again) */
  sitting: { x: number; y: number; kind?: 'seat' | 'soft' | 'low' | 'lie' | 'rock' | 'lean'; t?: number; base?: number } | null = null
  /** seedlings that have not grown up yet, by where they stand */
  private saplings = new Map<string, Actor>()
  /** on foot on an island, in the open air (not down the mine, not under water) */
  /** which day it is (the wild animals change from day to day) */
  get clockDay(): number {
    return Math.floor((this.save.played ?? 0) / DAY_SECONDS)
  }
  /** the season now (and how far the leaves have turned) */
  get season(): Season {
    return seasonAt((this.save.played ?? 0) / DAY_SECONDS)
  }
  /** the pilot is on the move (to somewhere tapped, or by the keys) */
  get walking(): boolean {
    return !!this.path || this.keyX !== 0 || this.keyY !== 0
  }
  get onSurface(): boolean {
    return this.mode === 'island' && !this.mine.active && !this.dive.active && !this.house?.active
  }
  mode: 'island' | 'flight' = 'island'
  panel: Panel | null = null
  /** a piece of furniture from the bag, being set down */
  placingItem: ItemId | null = null
  /** how close the island camera is: 2 (near) or 1 (the whole island) */
  islandZoom = 2
  toasts: Toast[] = []
  floaters: Floater[] = []
  flight: { vehicleId: string; from: string; dest: string | null; phase: FlightHud['phase']; t: number; canLand: string | null; carry?: string } | null = null

  now: () => number
  private persistFn?: (s: Save) => void
  baseParams: Record<string, unknown>
  private listeners = new Set<() => void>()
  pilot!: Actor
  private path: Point[] | null = null
  private pathI = 0
  private afterWalk: (() => void) | null = null
  private thenAt: Point | null = null
  private thenAnyway = false
  private thenNear = 0
  /** the node being worked on: it stands as a prop (so it can shake and fall) until it is done */
  gather: { node: NodeInst; prop: Actor; hits: number; need: number; t: number; struck: boolean; wob: number; wobV: number; fall: number } | null = null
  /** the item being made at the workbench, and how many are still to come */
  craftJob: { id: string; left: number; total: number; t: number; hits: number } | null = null
  /** the little acts: a meal at the table, sitting at the computer, a pan on the stove (round 19) */
  acts = new Acts(this)
  /** fighting the sky pirates (round 22) */
  combat = new Combat(this)
  onFx: ((e: Fx) => void) | null = null
  /** a picture from the album as w × h colours, rows from the top (set by the screen: the album lives on the device) */
  /** a picture of what is on the screen now, into the album (set by the screen) */
  takePhoto: ((where: string) => boolean) | null = null
  photoPixels: (id: number, w: number, h: number) => Promise<[number, number, number][][] | null> = async () => null
  /** how many pieces of feedback have been sent (the tests watch this move) */
  fxCount = 0
  hitStop = 0
  private timers: { at: number; fn: () => void }[] = []
  clock = 0
  fading: Actor[] = []
  private stepT = 0
  private smokeT = 0
  private dustT = 0
  private wasBoosting = false
  private wasRolling = false
  keyX = 0
  keyY = 0
  private walkT = 0
  vehicleActors = new Map<string, Actor>()
  /** what an islander is saying, over their head, until when */
  speech: { island: string; text: string; until: number } | null = null
  /** the islanders getting on with their day: where each is heading, and how long they stand about */
  private wander = new Map<string, { home: Point; to: Point | null; wait: number; hold: number; greeted: boolean }>()
  /** the tool in the pilot's hand (its own little model, swung with the arm) */
  inHand!: Actor
  private pollT = 0
  private checkT = 0
  private saveT = 0
  private dirty = false
  private uid = 1
  private busy = false

  constructor(opts: GameOptions = {}) {
    this.now = opts.now ?? (() => Date.now() / 1000)
    this.rnd = opts.rnd ?? Math.random
    this.persistFn = opts.persist
    this.save = opts.save ?? newSave(opts.seed)
    this.settleBag()
    this.guests = opts.guests ?? []
    this.baseParams = { clouds: 0.45, ...opts.params, timeOfDay: this.dayPhase() }
    this.build()
    this.applyLook()
    if (!this.save.welcomed) this.panel = this.save.look ? { kind: 'welcome' } : { kind: 'look', first: true }
    void this.refresh()
  }

  /** makes the world from the save: the sea, the islands, what stands on them (also after a re-roll or an upgrade) */
  private build() {
    const def = makeWorldDef(this.save.island, this.guests)
    this.def = def
    if (!this.scene) this.scene = createScene(this.baseParams, def) as Scene
    else this.scene.setWorld(def)
    this.world = this.scene.world as WorldApi
    this.layouts = {}
    this.gather = null
    this.path = null
    this.fading = []
    this.settling = []
    this.owners = {}
    this.decorProps = []
    this.benches = []
    this.sitting = null
    this.saplings.clear()
    this.nodeProp.clear()
    this.buildingProp.clear()
    this.vehicleActors.clear()
    this.life?.clear()
    this.pets?.clear()
    for (const d of def.islands) {
      if (d.wild) continue
      const lay = layoutIsland(this.world, d, {
        furnace: d.home ? this.save.furnace : null,
        furnaces2: d.home ? this.save.furnaces2 : undefined,
        restaurant: d.home ? this.save.restaurant : null,
        estate: d.home ? (this.save.estate?.built as Record<string, { x: number; y: number }>) : undefined,
        reach: (l) => floodReach(this.world, l.spawn.x, l.spawn.y, Math.round(d.r * 1.45)),
      })
      this.layouts[d.id] = lay
      // everything on the island is a prop: a model that stands on the ground
      for (const b of lay.buildings) if (b.model) this.addBuildingProp(lay, b)
      for (const n of lay.nodes) {
        const model = this.scene.models[NODES[n.kind].model]
        const a = this.scene.addActor(model, { x: n.x, y: n.y, z: n.base, yaw: n.yaw, shadow: false, reach: 620 })
        n.rise = model.H
        n.hw = n.hh = Math.max(4, model.W * 0.36)
        this.nodeProp.set(n.id, a)
      }
    }
    // the islanders stand outside their houses (and come down to the runway when a delivery is due)
    for (const id in this.layouts) {
      const lay = this.layouts[id]
      if (lay.def.home) continue
      const at = this.ownerSpot(lay)
      this.owners[id] = this.scene.addActor(lay.def.ownerModel, { x: at.x, y: at.y, z: this.world.heightAt(at.x, at.y), yaw: SOUTH, shadow: false, reach: 700, scale: PERSON_SCALE })
    }
    this.applyTerrain()
    // the player's house stands on the island (its walls and floor pressed into the ground)
    // (a house that will not go up must never stop the game opening: it is left down, and said)
    try {
      this.house.rebuild()
    } catch (e) {
      console.error('house', e)
    }
    this.placeDecor()
    this.placePlants()
    this.farm.build()
    this.mail.build()
    // other players' furniture, where they set it out (as near as the ground here allows)
    for (const gi of this.guests) {
      const lay = this.layouts[gi.id]
      if (!lay) continue
      for (const d of gi.decor ?? []) {
        const f = FURNITURE[d.item]
        const x = Math.round(lay.plaza.x + d.dx)
        const y = Math.round(lay.plaza.y + d.dy)
        if (f && canPlace(this.world, f.solid, f.solid, x, y)) this.addDecor(d.item, x, y, d.rot)
      }
    }
    if (!this.layouts[this.save.here]) this.save.here = 'home'
    for (const v of this.save.vehicles) if (!this.layouts[v.at]) v.at = 'home'
    // nodes that were harvested and have not grown back yet
    const t = this.now()
    for (const n of this.layouts.home.nodes) {
      if ((this.save.nodes[n.id] ?? 0) > t) this.setDepleted(n, true)
    }
    this.makeBackend()

    const lay = this.here
    // people are drawn a little smaller than their voxels: the big heads stay friendly, the island stays big
    this.pilot = this.scene.addActor('pilot', { x: lay.spawn.x, y: lay.spawn.y, z: this.world.heightAt(lay.spawn.x, lay.spawn.y), yaw: SOUTH, scale: PERSON_SCALE })
    this.inHand = this.scene.addActor('h_axe', { x: this.pilot.x, y: this.pilot.y, z: this.pilot.z, yaw: 0, shadow: false, scale: 0.72 })
    this.inHand.visible = false
    this.syncVehicles()
    this.scene.setIslandView(this.view3d)
    this.scene.setCamera({ x: this.pilot.x, y: this.pilot.y, alt: this.pilot.z, yaw: this.camYaw, zoom: this.islandZoom, snap: true })
    this.fishing = new Angling(this)
    this.fishing.populate(lay)
    this.ghostActor = null
    this.ghost = null
    this.visits?.clear()
    this.body?.start()
  }
  /** the market, as it stands: the islanders on the chart trade; the far shore joins once it is found */
  makeBackend() {
    const home = this.layouts.home
    const neighbours = this.def.islands.filter((d) => !d.home && !d.wild && !d.guest && this.known(d.id)).map((d) => ({
      id: d.id, owner: d.owner, sells: d.sells, wants: d.wants, danger: d.danger,
      dist: Math.hypot(this.world.delta(d.x, home.def.x), this.world.delta(d.y, home.def.y)),
    }))
    this.local = new LocalBackend(this.save.backend, neighbours, this.marketRnd(), () => this.maxHold(), () => this.level)
    this.backend = this.wrapBackend ? this.wrapBackend(this.local) : this.local
  }
  /** the market's own dice (round 21): what the islanders post does not shift what happens at sea */
  private marketRnd(): () => number {
    if (this.rnd === Math.random) return Math.random
    let st = ((this.save.island.seed ?? 1) * 2654435761) >>> 0 || 1
    return () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296)
  }
  /** is the island on the player's chart? (the far shore is not, until the chart is pieced together) */
  known(id: string): boolean {
    const d = this.layouts[id]?.def
    return !!d && (!d.hidden || !!this.save.milestones.chart)
  }
  /** where a vehicle can be sent from here, nearest first */
  destinations(): string[] {
    return Object.keys(this.layouts).filter((id) => id !== this.save.here && this.known(id)).sort((a, b) => this.distanceTo(a) - this.distanceTo(b))
  }
  private ownerSpot(lay: IslandLayout): Point {
    const h = lay.buildings.find((b) => b.kind === 'house')!
    return { x: h.door.x + 5, y: h.door.y + 2 }
  }
  private addBuildingProp(lay: IslandLayout, b: BuildingInst) {
    const far = b.kind === 'landmark' ? 2200 : b.kind === 'hangar' || b.kind === 'house' ? 1100 : 760
    const a = this.scene.addActor(b.model, { x: b.x, y: b.y, z: b.base, yaw: b.yaw, shadow: false, reach: far })
    this.buildingProp.set(lay.def.id + ':' + b.id, a)
    return a
  }
  /** a node's prop shows it whole, or what is left once it has been taken */
  private setDepleted(n: NodeInst, on: boolean) {
    n.depleted = on
    const a = this.nodeProp.get(n.id)
    if (!a) return
    const def = NODES[n.kind]
    const model = on ? def.empty : def.model
    a.visible = !!model
    if (model) a.model = this.scene.models[model]
    a.roll = 0
    a.stretch = 1
  }

  // ───────────────────────────────────────────────────────────── plumbing
  get here(): IslandLayout {
    return this.layouts[this.save.here]
  }
  get isHome(): boolean {
    return this.here.def.home
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  changed() {
    this.dirty = true
    for (const fn of this.listeners) fn()
  }
  toast(text: string, bad = false) {
    this.toasts.push({ id: this.uid++, text, left: 3.2, bad })
    if (this.toasts.length > 4) this.toasts.shift()
    this.emit({ t: 'toast', bad })
    if (bad) this.sfx('error')
    this.changed()
  }
  /** something could not be done: say why, with the "no" sound */
  warn(text: string) {
    this.toast(text, true)
  }
  // ── feedback
  emit(e: Fx) {
    this.fxCount++
    this.onFx?.(e)
  }
  sfx(name: string, pitch = 1, vol = 1) {
    this.emit({ t: 'sfx', name, pitch, vol })
  }
  /** items pop out of a place in the world and fly into the bag */
  drop(bag: Bag, x: number, y: number, z: number) {
    for (const k of Object.keys(bag) as ItemId[]) this.emit({ t: 'fly', icon: k, n: bag[k] ?? 1, x, y, z, to: 'bag' })
  }
  /** coins fly into the purse */
  pay(amount: number, x: number, y: number, z: number) {
    if (amount > 0) this.emit({ t: 'fly', icon: 'coin', n: Math.max(1, Math.min(10, Math.round(amount / 8))), x, y, z, to: 'coins' })
  }
  celebrate(level: 1 | 2, title: string, sub?: string, icon?: string) {
    this.emit({ t: 'celebrate', level, title, sub, icon })
    const p = this.mode === 'island' ? this.pilot : this.scene.lead
    if (p) this.scene.burst({ kind: 'confetti', x: p.x, y: p.y, z: p.z + 10, n: level === 2 ? 70 : 16, speed: level === 2 ? 46 : 26, up: 70, life: 1.6, grav: 90, r: 3 })
    if (level === 2) this.scene.shake(1.5)
  }
  /** a milestone gets its ceremony the first time only; returns whether this was that time */
  milestone(m: string, title: string, sub: string, icon?: string): boolean {
    if (this.save.milestones[m]) return false
    this.save.milestones[m] = true
    this.celebrate(2, title, sub, icon)
    return true
  }
  after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.clock + seconds, fn })
  }
  /** which variation of the music fits where the player is */
  musicScene(): MusicScene {
    if (this.mode === 'flight' && this.flight) {
      if (this.voyage.chased || this.combat.foes.length) return 'pirate'
      if (this.anchored) return 'fishing'
      const v = this.vehicle(this.flight.vehicleId)
      return v && this.vdef(v).kind === 'boat' ? 'sail' : 'flight'
    }
    if (this.mine.active) return 'mine'
    if (this.dive.active) return 'water'
    if (this.fishing.active) return 'fishing'
    if (this.house.active) return this.house.resting ? 'rest' : 'home'
    return 'island'
  }
  /** what the vehicle's engine should sound like right now */
  engineSound(): { kind: 'plane' | 'jet' | 'boat' | null; speed: number; boost: number } {
    const f = this.flight
    const v = f ? this.vehicle(f.vehicleId) : undefined
    if (!f || !v) return { kind: null, speed: 0, boost: 0 }
    const def = this.vdef(v)
    const top = def.flight.speed * def.flight.boost
    return { kind: def.kind === 'boat' ? 'boat' : def.flames ? 'jet' : 'plane', speed: Math.min(1, this.scene.speed / top + 0.15), boost: this.scene.boost }
  }
  /** the furnace is lit and the player is there to hear it */
  furnaceLit(): boolean {
    return this.save.jobs.length > 0 && this.save.here === 'home' && this.onSurface
  }
  float(text: string, x: number, y: number, z: number) {
    this.floaters.push({ id: this.uid++, text, x, y, z, age: 0 })
  }
  async refresh() {
    this.orders = await this.backend.orders()
    this.deliveries = (await this.backend.deliveries()).filter((d) => !this.estate.isCourier(d.id))
    this.shop = this.isHome ? [] : await this.backend.shop(this.save.here)
    this.changed()
  }
  /** runs one market action at a time; a failure becomes a toast */
  private async act(fn: () => Promise<void>) {
    if (this.busy) return
    this.busy = true
    try {
      await fn()
    } catch (e) {
      this.warn(e instanceof Error ? e.message : String(e))
    } finally {
      this.busy = false
    }
    await this.refresh()
  }
  /** how many there are to hand: what is carried, and at home what is in the warehouse too */
  count(item: ItemId): number {
    return (this.save.inv[item] ?? 0) + (this.atHome ? (this.save.store?.[item] ?? 0) + (this.save.home?.box?.[item] ?? 0) : 0)
  }
  carried(item: ItemId): number {
    return this.save.inv[item] ?? 0
  }
  stored(item: ItemId): number {
    return this.save.store?.[item] ?? 0
  }
  /** on the home island (where the warehouse is) */
  get atHome(): boolean {
    return this.save.here === 'home' && this.mode === 'island'
  }

  // ── what the pilot carries: slots, a hotbar, and the warehouse at home
  /** slots in all: the hotbar, and a row for each backpack */
  capacity(): number {
    let rows = 0
    PACKS.forEach((p, i) => { if ((this.save.inv[p] ?? 0) > 0 || (this.save.store?.[p] ?? 0) > 0) rows = i + 1 })
    return HOTBAR + rows * PACK_ROW
  }
  used(): number {
    return slotsFor(this.save.inv)
  }
  /** would these fit in the slots as well as what is there? */
  fits(add: Bag): boolean {
    const all: Bag = { ...this.save.inv }
    give(all, add)
    return slotsFor(all) <= this.capacity()
  }
  /** the slots, in order: each a stack of one thing (or empty) */
  slots(): ({ item: ItemId; n: number } | null)[] {
    const s = this.save
    const order = (s.order ??= [])
    // keep the order: what has gone leaves it, what is new goes at the end
    for (let i = order.length - 1; i >= 0; i--) if (!((s.inv[order[i]] ?? 0) > 0) || PACKS.includes(order[i])) order.splice(i, 1)
    for (const k of Object.keys(s.inv) as ItemId[]) if ((s.inv[k] ?? 0) > 0 && !order.includes(k) && !PACKS.includes(k)) order.push(k)
    const out: ({ item: ItemId; n: number } | null)[] = []
    for (const item of order) {
      let left = s.inv[item] ?? 0
      const st = stackOf(item)
      while (left > 0) {
        out.push({ item, n: Math.min(st, left) })
        left -= st
      }
    }
    const cap = this.capacity()
    while (out.length < cap) out.push(null)
    return out
  }
  /** what is in the hand: the hotbar slot chosen */
  heldItem(): ItemId | null {
    const i = this.save.held ?? 0
    return this.slots()[i]?.item ?? null
  }
  /** pick a hotbar slot (tapping it again lets go) */
  hold(i: number) {
    this.save.held = this.save.held === i ? -1 : i
    const it = this.heldItem()
    this.sfx(it ? 'pick' : 'tap', 1.2)
    if (it && this.placeKindOf(it) && (this.isHome || this.house.active)) this.startDecor(it)
    else if (this.placingItem) this.cancelPlacing(true)
    if (it !== 'shovel' && !this.placingItem && this.ghostActor) this.clearGhost()
    this.changed()
  }
  /** move a thing to the front of the slots (so it is on the hotbar) */
  toHotbar(item: ItemId) {
    const order = (this.save.order ??= [])
    const i = order.indexOf(item)
    if (i >= 0) order.splice(i, 1)
    order.unshift(item)
    this.save.held = 0
    this.sfx('pick')
    this.changed()
  }
  /** swap two slots' things (dragging one onto another) */
  swapSlots(a: number, b: number) {
    const sl = this.slots()
    const ia = sl[a]?.item
    const ib = sl[b]?.item
    const order = this.save.order!
    if (!ia || ia === ib) return
    const oa = order.indexOf(ia)
    if (!ib) {
      // onto an empty slot: to the end
      order.splice(oa, 1)
      order.push(ia)
    } else {
      const ob = order.indexOf(ib)
      order[oa] = ib
      order[ob] = ia
    }
    if (this.save.held === a) this.save.held = b
    this.sfx('tap', 1.1)
    this.changed()
  }
  /**
   * Things coming to the pilot: into the slots as far as they go. What does not fit goes into
   * the warehouse at home (it is "sent home"), with a word about it. Returns what was sent.
   */
  receive(add: Bag, quiet = false): Bag {
    const s = this.save
    const sent: Bag = {}
    const cap = this.capacity()
    for (const k of Object.keys(add) as ItemId[]) {
      let n = add[k] ?? 0
      if (n <= 0) continue
      if (PACKS.includes(k)) {
        give(s.inv, { [k]: n })
        continue
      }
      const st = stackOf(k)
      const have = s.inv[k] ?? 0
      const partial = have % st === 0 ? 0 : st - (have % st)
      const free = Math.max(0, cap - slotsFor(s.inv))
      const fit = Math.min(n, partial + free * st)
      if (fit > 0) give(s.inv, { [k]: fit })
      n -= fit
      if (n > 0) sent[k] = n
    }
    if (Object.keys(sent).length) {
      give((s.store ??= {}), sent)
      if (!quiet) this.toast($t('口袋满了：{0} 送回了家里的仓库', bagText(sent)))
    }
    return sent
  }
  /** what something costs, from the slots first and then (at home) the warehouse */
  canPay(cost: Bag, times = 1): boolean {
    for (const k in cost) if (this.count(k as ItemId) < (cost[k as ItemId] ?? 0) * times) return false
    return true
  }
  spend(cost: Bag, times = 1) {
    const s = this.save
    for (const k of Object.keys(cost) as ItemId[]) {
      let n = (cost[k] ?? 0) * times
      const a = Math.min(n, s.inv[k] ?? 0)
      s.inv[k] = (s.inv[k] ?? 0) - a
      n -= a
      // then the furniture box, then the warehouse
      const box = s.home?.box
      if (n > 0 && box && (box[k] ?? 0) > 0) { const t = Math.min(n, box[k] ?? 0); box[k] = (box[k] ?? 0) - t; n -= t; if (!box[k]) delete box[k] }
      if (n > 0 && s.store) s.store[k] = (s.store[k] ?? 0) - n
    }
  }
  /** at the warehouse: put things away, take them out */
  deposit(item: ItemId, n = Infinity) {
    const k = Math.min(n, this.carried(item))
    if (k <= 0 || !this.atHome) return
    this.save.inv[item] = (this.save.inv[item] ?? 0) - k
    give((this.save.store ??= {}), { [item]: k })
    this.sfx('pop', 0.9)
    this.changed()
  }
  /** everything but the tools and the things in hand */
  depositAll() {
    if (!this.atHome) return
    let n = 0
    for (const k of Object.keys(this.save.inv) as ItemId[]) {
      const kind = ITEMS[k].kind
      if (kind === 'tool' || PACKS.includes(k) || k === 'harpoon' || k === 'tank' || k === 'lantern' || k === 'smoke') continue
      if ((this.save.inv[k] ?? 0) > 0) {
        n += this.save.inv[k]!
        this.deposit(k)
      }
    }
    if (n) {
      this.sfx('stack')
      this.toast($t('放进仓库 {0} 件', n))
    }
  }
  withdraw(item: ItemId, n = Infinity) {
    const k = Math.min(n, this.stored(item))
    if (k <= 0 || !this.atHome) return
    const st = stackOf(item)
    const have = this.carried(item)
    const partial = have % st === 0 ? 0 : st - (have % st)
    const room = partial + Math.max(0, this.capacity() - this.used()) * st
    const take = Math.min(k, room)
    if (take <= 0) return this.warn($t('口袋满了'))
    this.save.store![item] = (this.save.store![item] ?? 0) - take
    give(this.save.inv, { [item]: take })
    this.sfx('pick')
    this.changed()
  }
  /** a save from before the slots: what does not fit is waiting in the warehouse */
  private settleBag() {
    const s = this.save
    s.store ??= {}
    if (slotsFor(s.inv) <= this.capacity()) return
    const keep: Bag = {}
    const all = { ...s.inv }
    // tools first, then everything else in the order it was
    const order = (Object.keys(all) as ItemId[]).sort((a, b) => (ITEMS[a].kind === 'tool' ? 0 : 1) - (ITEMS[b].kind === 'tool' ? 0 : 1))
    for (const k of order) {
      const n = all[k] ?? 0
      if (n <= 0) continue
      const st = stackOf(k)
      const free = (this.capacity() - slotsFor(keep)) * st
      const t = PACKS.includes(k) ? n : Math.min(n, free)
      if (t > 0) keep[k] = t
      if (n - t > 0) give(s.store, { [k]: n - t })
    }
    s.inv = keep
  }
  /** the tool in the hand, and how it is held: swung while chopping or digging, out over the water while fishing */
  private stepHand() {
    const h = this.inHand
    const p = this.pilot
    if (!h) return
    let model: string | null = null
    let pitch = -0.9 // carried: pointing forward and down
    // raised over the shoulder, brought down hard, eased back
    const swingPose = (ph: number) => (ph < 0.45 ? -0.9 + 1.4 * (ph / 0.45) : ph < 0.6 ? 0.5 - 2.0 * ((ph - 0.45) / 0.15) : -1.5 + 0.6 * ((ph - 0.6) / 0.4))
    const tierOf = (kind: 'axe' | 'pick') => toolTier(this.save.inv, kind)
    const name = (kind: 'axe' | 'pick', t: number) => `h_${kind}${t > 1 ? t : ''}`
    if (this.mode === 'island' && p.visible && !this.dive.active) {
      const g = this.gather
      const def = g ? NODES[g.node.kind] : null
      if (g && def && def.tool !== 'hand') {
        model = name(def.tool, tierOf(def.tool))
        pitch = g.fall >= 0 ? -1.4 : swingPose(g.t / def.swing)
      } else if (this.mine.active) {
        const sw = this.mine.swing
        if (tierOf('pick') > 0) {
          model = name('pick', tierOf('pick'))
          if (sw !== null) pitch = swingPose(sw)
        }
      } else if (this.life.swing >= 0) {
        model = 'h_net'
        pitch = this.life.swing < 0.12 ? 0.6 : -1.3 + 0.4 * Math.min(1, (this.life.swing - 0.12) / 0.3)
      } else if (this.acts.is('water')) {
        // the can tipped forward over the row, and back upright at the end
        const t = this.acts.cur!.t
        model = 'h_can'
        pitch = -0.2 - 1.0 * Math.min(1, t / 0.2) * Math.min(1, Math.max(0, (this.acts.cur!.dur - t) / 0.2))
      } else if (this.acts.is('feed')) {
        model = 'h_bag'
        pitch = -1.5 + Math.sin(this.acts.cur!.t * 22) * 0.25 // shaken out
      } else if (this.fishing.active) {
        model = 'h_rod'
        pitch = this.fishing.phase === 'reel' ? -0.5 - 0.25 * this.fishing.tension : -0.85
      } else if (!g && !this.craftJob) {
        const it = this.heldItem()
        if (it === 'net') {
          model = 'h_net'
          pitch = 0.4
        } else if (it === 'shovel') {
          model = 'h_shovel'
          const sw = this.digSwing
          pitch = sw === null ? 0.4 : sw < 0.5 ? -0.3 - 1.2 * (sw / 0.5) : -1.5 + 1.2 * ((sw - 0.5) / 0.5)
        } else if (it === 'rod') {
          model = 'h_rod'
          pitch = 0.4 // over the shoulder
        }
        else if (it && /Axe$/.test(it)) model = name('axe', tierOf('axe'))
        else if (it && /Pick$/.test(it)) model = name('pick', tierOf('pick'))
      }
    }
    const lines = this.scene.lines
    lines.length = 0
    if (!model) {
      h.visible = false
      return
    }
    if (h.model.name !== model) h.model = this.scene.models[model]
    h.visible = true
    // in the right hand, at the end of the arm
    const sc = p.scale ?? 1
    const cs = Math.cos(p.yaw)
    const sn = Math.sin(p.yaw)
    h.x = p.x + cs * 3.2 * sc + sn * 0.6 * sc
    h.y = p.y + sn * 3.2 * sc - cs * 0.6 * sc
    h.z = p.z + 3.4 * sc * (p.stretch || 1)
    h.yaw = p.yaw
    h.pitch = pitch
    h.fade = p.fade
    // the fishing line, from the tip of the rod to the float (slack while waiting, taut on a fish)
    const end = model === 'h_rod' && this.fishing.active ? this.fishing.lineEnd : null
    if (end) {
      const len = 15 * h.scale
      const sp = Math.sin(pitch)
      const tx = h.x - sn * sp * len
      const ty = h.y + cs * sp * len
      const tz = h.z + Math.cos(pitch) * len
      const taut = this.fishing.phase === 'reel' || this.fishing.phase === 'land'
      lines.push({ ax: tx, ay: ty, az: tz, bx: end.x, by: end.y, bz: end.z + 0.6, sag: taut ? 0.5 : 5, col: 0xffe8f0f4 })
    }
  }
  /** how many kinds of creature have ever been caught */
  critterKinds(): number {
    return CRITTER_ITEMS.filter((k) => this.save.seen?.[k] || (this.save.stats.gathered[k] ?? 0) > 0).length
  }
  /** a better one of the same line is already owned */
  supersededBy(item: ItemId): boolean {
    return betterThan(item).some((k) => this.count(k) > 0)
  }
  /** can't carry it: says why, and what to do about it */
  full(what: string) {
    const next = PACKS.find((p) => !(this.count(p) > 0))
    this.warn($t('口袋满了，{0}。{1}{2}', what, this.isHome ? $t('去仓库放点东西') : $t('回家放进仓库'), next ? $t('，或者在工作台做个{0}', ITEMS[next].name) : ''))
  }
  vehicle(id: string): OwnedVehicle | undefined {
    return this.save.vehicles.find((v) => v.id === id)
  }
  islandName(id: string): string {
    return this.layouts[id]?.def.name ?? id
  }
  private dist(a: Point, b: Point): number {
    return Math.hypot(this.world.delta(a.x, b.x), this.world.delta(a.y, b.y))
  }
  distanceTo(island: string): number {
    return this.dist(this.here.def, this.layouts[island].def)
  }

  // ───────────────────────────────────────────────────────────── the frame
  update(dt: number) {
    // a heavy blow holds the whole picture still for a moment
    if (this.hitStop > 0) {
      this.hitStop -= dt
      this.scene.step(0)
      return
    }
    this.clock += dt
    this.stepDay(dt)
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.clock)
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.clock)
        for (const t of due) t.fn()
      }
    }
    if (this.settling.length) {
      // a prop that was squashed springs back, a little past its shape and home again
      for (const a of this.settling) {
        a.sv = (a.sv ?? 0) + ((1 - a.stretch) * 220 - (a.sv ?? 0) * 14) * dt
        a.stretch += a.sv * dt
      }
      this.settling = this.settling.filter((a) => Math.abs(a.stretch - 1) > 0.01 || Math.abs(a.sv ?? 0) > 0.05)
    }
    for (const a of this.fading) a.fade -= dt * 3.2
    if (this.fading.length && this.fading[0].fade <= 0) {
      for (const a of this.fading) if (a.fade <= 0) this.scene.removeActor(a)
      this.fading = this.fading.filter((a) => a.fade > 0)
    }
    const now = this.now()
    this.pollT -= dt
    if (this.pollT <= 0) {
      this.pollT = 1
      void this.poll(now)
    }
    this.tickJobs(now)
    this.stepFurnace(dt)
    if (this.mode === 'island') {
      this.house.watch()
      if (this.dive.active) this.dive.step(dt)
      else {
        this.stepCraft(dt)
        this.stepPilot(dt)
        if (this.mine.active) this.mine.step(dt)
        else if (this.house.active) this.house.step(dt)
        else this.fishing.step(dt)
      this.body.step(dt)
      }
    } else {
      this.stepFlight(dt)
      // at anchor the rod is out over the side
      if (this.anchored || this.fishing.active) this.fishing.step(dt)
      if (this.anchored && (this.voyage.chased || this.flight?.phase !== 'cruise')) this.weighAnchor()
    }
    this.acts.step(dt)
    this.weather.step(dt)
    this.visits.step(dt)
    this.mail.step()
    this.stepCoat()
    if (this.save.stocks) this.stocks.step()
    this.life.step(dt)
    this.farm.step(dt)
    this.pets.step(dt)
    this.estate.update()
    this.stepHand()
    this.combat.step(dt) // (after the hand: it draws its tracers on the lines the hand has cleared)
    if (this.mode === 'island') this.stepIslanders(dt)

    for (const t of this.toasts) t.left -= dt
    if (this.toasts.length && this.toasts[0].left <= 0) {
      this.toasts = this.toasts.filter((t) => t.left > 0)
      this.changed()
    }
    for (const f of this.floaters) f.age += dt
    if (this.floaters.length && this.floaters[0].age > 1.3) this.floaters = this.floaters.filter((f) => f.age <= 1.3)

    this.checkT -= dt
    if (this.checkT <= 0) {
      this.checkT = 0.5
      this.tickNodes(now)
      this.checkQuest()
    }
    this.saveT -= dt
    if (this.dirty && this.saveT <= 0) {
      this.saveT = 2
      this.dirty = false
      this.persistFn?.(this.save)
    }
    this.scene.step(dt)
  }

  private async poll(now: number) {
    const events = await this.backend.poll(now)
    for (const e of events) {
      if (e.type === 'sold') this.toast($t('{0} 买下了你的 {1}×{2}，等你送到{3}', e.order.buyer, ITEMS[e.order.item].name, e.order.qty, this.islandName(e.delivery.dest)))
      if (e.type === 'received') {
        // another player has flown it over: into the bag, with a fanfare; what did not arrive is refunded
        if (e.qty > 0) this.receive({ [e.item]: e.qty }, true)
        this.save.coins += e.refund
        this.save.stats.received = (this.save.stats.received ?? 0) + 1
        const p = this.pilot
        if (e.qty > 0) this.drop({ [e.item]: e.qty }, p.x, p.y, p.z + 12)
        if (e.refund > 0) this.pay(e.refund, p.x, p.y, p.z + 12)
        this.visits.come({ name: e.from, gift: {} })
        this.mail.post({ kind: e.card ? 'postcard' : 'note', photo: e.card, from: e.from, title: e.card ? $t('{0}寄来的明信片', e.from) : $t('{0}的留言', e.from), body: $t('{0}×{1} 给你送到了{2}。\n\n有空也来我的岛上转转！\n\n——{3}', ITEMS[e.item].name, e.qty, e.refund > 0 ? $t('（路上丢了一些，退你 {0} 金币）', e.refund) : '', e.from) })
        this.celebrate(1, $t('{0} 送货来了', e.from), `${ITEMS[e.item].name}×${e.qty}${e.refund > 0 ? $t(' · 没到的部分退回 {0} 金币', e.refund) : ''}`, e.item)
        this.dirty = true
      }
    }
    this.orders = await this.backend.orders()
    this.deliveries = (await this.backend.deliveries()).filter((d) => !this.estate.isCourier(d.id))
    if (events.length || (this.online && this.online.rev !== this.onlineRev)) {
      this.onlineRev = this.online?.rev ?? 0
      this.changed()
    }
    this.applyGuests()
  }
  private onlineRev = 0
  /** online: the islands other players have (a new one, a bigger one, new furniture). Drawn in when nothing is going on. */
  setGuests(list: GuestIsland[]) {
    if (JSON.stringify(list) === JSON.stringify(this.guests)) {
      this.pendingGuests = null
      return
    }
    this.pendingGuests = list
    this.applyGuests()
  }
  private applyGuests() {
    const list = this.pendingGuests
    if (!list) return
    const idle = this.mode === 'island' && this.save.here === 'home' && this.onSurface && !this.gather && !this.craftJob && !this.fishing.active && !this.placing && !this.placingItem && !this.panel
    if (!idle) return
    this.pendingGuests = null
    const fresh = list.filter((x) => !this.guests.some((y) => y.id === x.id))
    const p = { x: this.pilot.x, y: this.pilot.y, yaw: this.pilot.yaw }
    this.guests = list
    this.stopWalking()
    this.build()
    this.pilot.x = p.x
    this.pilot.y = p.y
    this.pilot.z = this.world.heightAt(p.x, p.y)
    this.pilot.yaw = p.yaw
    this.scene.setCamera({ x: p.x, y: p.y, alt: this.pilot.z, yaw: this.camYaw, zoom: this.islandZoom, snap: true })
    if (fresh.length) this.celebrate(1, $t('海图更新了'), $t('{0} 出现在海图上', fresh.map((x) => x.name).join($t('、'))), 'seaChart')
    void this.refresh()
  }

  // ───────────────────────────────────────────────────────────── on foot
  private stepPilot(dt: number) {
    const p = this.pilot
    let moving = false
    if (this.sitting) {
      // up again the moment the pilot is sent somewhere
      if (!this.path && this.keyX === 0 && this.keyY === 0) {
        // a rocking chair rocks; anyone sat down breathes a little
        const st = this.sitting
        st.t = (st.t ?? 0) + dt
        if (st.kind === 'rock') { p.z = (st.base ?? p.z) + Math.sin(st.t * 2.2) * 0.45; p.stretch = 1 + Math.sin(st.t * 2.2) * 0.04 }
        if (Math.floor(st.t / 7) !== Math.floor((st.t - dt) / 7)) this.float(st.kind === 'lie' ? 'z z' : st.kind === 'rock' ? '♪' : $t('～'), p.x, p.y, p.z + 14)
        if (this.house.active) { this.seeThrough(dt); return } // (whatever hides the seat goes see-through)
        this.scene.setCamera({ x: p.x, y: p.y, alt: p.z, yaw: this.camYaw, zoom: this.islandZoom })
        this.seeThrough(dt)
        return
      }
      // (off the seat onto open ground first: a chair at a table sits half inside it, and the keys
      // cannot walk a pilot out of something solid)
      this.standUp()
    }
    if (this.digJob) this.stepDig(dt)
    if (this.gather) {
      this.stepGather(dt)
    } else if (this.path) {
      let left = WALK * this.body.pace * dt
      while (left > 0 && this.path && this.pathI < this.path.length) {
        const to = this.path[this.pathI]
        const dx = to.x - p.x
        const dy = to.y - p.y
        const d = Math.hypot(dx, dy)
        if (d <= left) {
          p.x = to.x
          p.y = to.y
          left -= d
          this.pathI++
        } else {
          p.x += (dx / d) * left
          p.y += (dy / d) * left
          this.face(Math.atan2(dx, -dy), dt)
          left = 0
        }
        moving = true
      }
      if (this.path && this.pathI >= this.path.length) this.arrived()
    } else if ((this.keyX || this.keyY) && !(this.fishing.phase === 'reel' || this.fishing.phase === 'bite')) {
      // (in a fight on the line the keys pull the rod, they do not walk)
      // the keys are read against the screen: "up" is away from the camera, whichever way it looks
      const l = Math.hypot(this.keyX, this.keyY)
      const cs = Math.cos(this.scene.viewYaw)
      const sn = Math.sin(this.scene.viewYaw)
      const mx = (this.keyX * cs + this.keyY * sn) / l
      const my = (-this.keyX * sn + this.keyY * cs) / l
      const next = slide(this.world, p, mx * WALK * this.body.pace * dt, my * WALK * this.body.pace * dt)
      if (next.x !== p.x || next.y !== p.y) {
        this.face(Math.atan2(next.x - p.x, -(next.y - p.y)), dt)
        p.x = next.x
        p.y = next.y
        moving = true
      }
    }
    // sat down on arriving (a chair walked to): the seat has placed the pilot; leave them be
    if (this.sitting) return
    this.walkT = moving ? this.walkT + dt : 0
    const ground = this.world.heightAt(Math.round(p.x), Math.round(p.y))
    const hop = moving ? Math.abs(Math.sin(this.walkT * 15)) * 0.9 : 0
    if (moving) {
      // footsteps: a soft tap and a puff of dust on every other stride
      this.stepT += dt
      if (this.stepT > 0.27) {
        this.stepT = 0
        this.sfx('step', 1, this.world.matAt(Math.round(p.x), Math.round(p.y)) < 6 ? 0.7 : 1)
        this.scene.burst({ kind: 'dust', x: p.x, y: p.y, z: ground + 0.5, n: 2, speed: 5, up: 7, life: 0.4, grav: 20 })
      }
    } else this.stepT = 0.2
    if (!this.gather && !this.craftJob) p.stretch = 1 + ((p.stretch || 1) - 1) * Math.exp(-dt * 14)
    // the walk: two strides, in time with the hop
    // a long wait with the line out: down on the bank until something bites
    const resting = !moving && this.fishing.waited > 2.5 && !this.fishing.atSea
    const frame = moving ? (Math.sin(this.walkT * 15) > 0 ? 'pilot_wa' : 'pilot_wb') : resting ? 'pilot_low' : 'pilot'
    if (p.model.name !== frame) { p.model = this.scene.models[frame]; if (frame === 'pilot_low') this.sfx('place', 0.5) }
    p.z += (ground + hop - (resting ? 3 : 0) - p.z) * (1 - Math.exp(-dt * 18))
    this.scene.setCamera({ x: p.x, y: p.y, alt: ground, yaw: this.camYaw, zoom: this.islandZoom })
    this.seeThrough(dt)
  }
  /** a line said aloud: a speech bubble over whoever said it, and the sound of their voice */
  bubble: { who: Actor; text: string; until: number } | null = null
  speak(name: string, voice: number, text: string) {
    const who = name === $t('你') ? this.pilot : this.visits.v?.who ?? this.pilot
    this.bubble = { who, text, until: this.clock + Math.max(2.4, text.length * 0.16) }
    this.emit({ t: 'say', text, voice })
    this.changed()
  }
  get personScale() {
    return PERSON_SCALE
  }
  /** the restaurant on the home island, if one has been built */
  get restaurant(): BuildingInst | null {
    return this.layouts.home?.buildings.find((b) => b.kind === 'restaurant') ?? null
  }
  /** a plate with a dish on it (the model, made the first time) */
  plateFor(dish: ItemId): string {
    const name = 'plate_' + dish
    if (!this.scene.models[name]) {
      const col: Record<string, [number, number, number]> = { grilledFish: [210, 150, 80], fishSoup: [240, 230, 200], carrotSoup: [240, 140, 60], bread: [214, 170, 110], omelette: [250, 220, 90], pumpkinSoup: [240, 160, 50], berryJam: [200, 50, 90], strawberryPie: [230, 70, 80], seafoodFeast: [230, 90, 70], grilledSquid: [220, 170, 150], sashimi: [240, 110, 110] }
      this.scene.registerModel(plateModel(name, col[dish] ?? [220, 180, 120], !dish))
    }
    return name
  }
  /** the player's look, made into their models (all the poses) */
  get look(): Look {
    return this.save.look ?? DEFAULT_LOOK
  }
  /** the postcard to go with the next delivery (a small picture; the album in the UI sets it) */
  postcard: string | null = null
  /** taking a picture: the interface is put away, the camera can still be turned */
  photoMode = false
  /** in the raincoat (out in the rain) */
  private coat = false
  /** what the player has on now: their clothes, or the raincoat over them */
  get wornLook(): Look {
    return this.coat ? { ...this.look, raincoat: true } : this.look
  }
  /** each frame: the raincoat goes on when it rains outside, and comes off indoors or when it stops */
  private stepCoat() {
    // (only on an island: in flight the rider stays as they set off)
    if (this.mode !== 'island') return
    const want = !this.house.active && !this.mine.active && !this.dive.active && this.weather.raining
    if (want === this.coat) return
    this.coat = want
    this.applyLook()
    if (want) this.float($t('穿上雨衣'), this.pilot.x, this.pilot.y, this.pilot.z + 16)
  }
  applyLook() {
    for (const m of personModels(this.wornLook, 'pilot')) this.scene.registerModel(m)
    const p = this.pilot
    if (p) p.model = this.scene.models[p.model?.name && this.scene.models[p.model.name] ? p.model.name : 'pilot']
    // the craft are drawn with the rider in their clothes
    this.craftKeys.clear()
    if (this.vehicleActors) this.syncVehicles()
  }
  setLook(look: Look) {
    this.save.look = readLook(look)
    this.applyLook()
    this.onlineDirty = true
    const p = this.pilot
    this.scene.stackUp(p)
    this.scene.burst({ kind: 'star', x: p.x, y: p.y, z: p.z + 10, n: 14, speed: 16, up: 24, life: 0.8, mode: 'float', grav: 0 })
    this.sfx('stack')
    this.changed()
  }
  /** up off a seat, a step forward onto open ground */
  standUp() {
    if (!this.sitting) return
    const p = this.pilot
    this.sitting = null
    p.model = this.scene.models.pilot
    // onto the nearest open ground: ahead if it is free (a chair at a table faces the table, so often it is not)
    const open = (x: number, y: number) => !this.world.solidAt(Math.round(x), Math.round(y)) && !this.world.isWater(Math.round(x), Math.round(y))
    let best: Point | null = null
    for (let r = 6; r <= 40 && !best; r += 2) {
      for (let k = 0; k < 16 && !best; k++) {
        // ahead first, then fanning out to either side, behind last
        const a = p.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8)
        const x = p.x + Math.sin(a) * r, y = p.y - Math.cos(a) * r
        if (open(x, y) && open(x + 1, y) && open(x - 1, y) && open(x, y + 1) && open(x, y - 1)) best = { x, y }
      }
    }
    if (best) { p.x = best.x; p.y = best.y }
    if (this.house.active) p.z = this.world.heightAt(Math.round(p.x), Math.round(p.y))
  }
  /** a piece that has just been set down settles with a little bounce */
  settle(a: Actor) {
    this.settling.push(a)
  }
  /** sit on a seat that is not a bench outside (a chair, the sofa) */
  sitOn(s: { x: number; y: number; yaw: number; z: number }, quiet = false, kind: NonNullable<Game['sitting']>['kind'] = 'seat') {
    const p = this.pilot
    this.stopWalking()
    p.x = s.x
    p.y = s.y
    p.yaw = s.yaw
    p.z = s.z
    p.model = this.scene.models[kind === 'low' ? 'pilot_low' : kind === 'lie' ? 'pilot_lie' : kind === 'lean' ? 'pilot_lean' : 'pilot_sit'] ?? this.scene.models.pilot_sit
    this.sitting = { x: s.x, y: s.y, kind, t: 0, base: s.z }
    // each way of resting has its own sound and its own little sign (no words)
    const say: Record<string, [string, number, string]> = { seat: ['pop', 0.8, $t('～')], soft: ['place', 0.6, '♪'], low: ['place', 0.5, '♪'], lie: ['place', 0.45, 'z z'], rock: ['creak', 1.4, '♪'], lean: ['tap', 0.7, '…'] }
    const [snd, pitch, sign] = say[kind ?? 'seat']
    this.sfx(snd, pitch)
    p.stretch = kind === 'low' || kind === 'soft' || kind === 'lie' ? 0.82 : 0.9
    this.settle(p)
    if (kind === 'low' || kind === 'soft') this.scene.burst({ kind: 'dust', x: p.x, y: p.y, z: s.z, n: 6, speed: 8, up: 4, life: 0.5, mode: 'smoke', r: 2 })
    if (!quiet) this.float(sign, p.x, p.y, p.z + 14)
    this.changed()
  }
  /** indoors the light is the lamp's: warm at night, plain by day; outside, the sky's */
  setIndoorLight() {
    this.weather.push()
  }
  /** the next morning: in bed at home (wherever the night caught you) */
  wakeUp(passedOut: boolean) {
    this.cancelPlacing(true)
    this.stopWalking()
    this.sitting = null
    this.pilot.model = this.scene.models.pilot
    // at home, in your own bed; away, the islander put you up for the night
    if (this.save.here === 'home' && !this.house.active && this.mode === 'island') this.house.enter()
    this.house.wakeInBed()
    this.setIndoorLight()
    if (passedOut) this.sfx('error', 0.6)
    this.sfx('done', 0.9)
  }
  face(yaw: number, dt: number) {
    let d = yaw - this.pilot.yaw
    d = d - Math.PI * 2 * Math.round(d / (Math.PI * 2))
    this.pilot.yaw += d * (1 - Math.exp(-dt * 16))
  }
  stopWalking() {
    this.path = null
    this.afterWalk = null
    this.thenAt = null
    this.cancelGather()
    this.digJob = null
    this.mine.stop()
    this.fishing.cancel()
    if (this.craftJob) this.craftJob = null
  }
  /** walk to within `near` px of a point, then do something */
  walkTo(to: Point, near: number, then: (() => void) | null, anyway = false) {
    this.standUp()
    this.stopWalking()
    this.thenAnyway = anyway
    const p = this.pilot
    if (Math.hypot(to.x - p.x, to.y - p.y) <= near + 0.5) {
      then?.()
      return
    }
    // standing somewhere solid (put there by a wake-up, a move of the furniture…): out to free ground first
    if (!walkable(this.world, Math.round(p.x), Math.round(p.y))) {
      const free = freeSpot(this.world, p.x, p.y)
      if (free) { p.x = free.x; p.y = free.y }
    }
    const path = findPath(this.world, { x: p.x, y: p.y }, to, near)
    if (!path) {
      if (then) this.warn($t('走不过去'))
      return
    }
    this.path = path
    this.pathI = 0
    this.afterWalk = then
    this.thenAt = to
    this.thenNear = near
  }
  private arrived() {
    const then = this.afterWalk
    const at = this.thenAt
    const near = this.thenNear
    this.path = null
    this.afterWalk = null
    this.thenAt = null
    if (!then || !at) return
    if (this.thenAnyway || Math.hypot(at.x - this.pilot.x, at.y - this.pilot.y) <= near + 2.5) then()
    else this.warn($t('走不过去'))
  }
  toggleZoom() {
    this.islandZoom = this.islandZoom === 2 ? 1 : 2
    this.sfx('tap', this.islandZoom === 2 ? 1.15 : 0.85)
    this.changed()
  }
  /** whatever stands between the camera and the pilot goes see-through, so the pilot is never lost */
  private seeThrough(dt: number) {
    const p = this.pilot
    const lay = this.here
    const sn = Math.sin(this.scene.viewYaw)
    const cs = Math.cos(this.scene.viewYaw)
    const reach = this.view3d ? 2.1 : 1.05 // how far a thing's height hides the ground behind it
    const k = 1 - Math.exp(-dt * 10)
    if (this.house.active) this.house.clearView(sn, cs, reach, k)
    const test = (a: Actor | undefined, x: number, y: number, hw: number, rise: number) => {
      if (!a) return
      const dx = x - p.x
      const dy = y - p.y
      let goal = 1
      if (Math.abs(dx) < 80 && Math.abs(dy) < 80) {
        const toCam = dx * sn + dy * cs // how far it is towards the camera
        const side = Math.abs(dx * cs - dy * sn)
        if (toCam > 1 && toCam < rise * reach + hw && side < hw + 3) goal = 0.38
      }
      if (a.fade !== goal) a.fade = Math.abs(a.fade - goal) < 0.02 ? goal : a.fade + (goal - a.fade) * k
    }
    for (const b of lay.buildings) if (b.model) test(this.buildingProp.get(lay.def.id + ':' + b.id), b.x, b.y, Math.max(b.w, b.h) / 2, b.rise)
    // the player's house: its roof goes see-through when the player is behind it
    if (lay.def.home && this.house.roofActor) { const hb = lay.buildings.find((b) => b.kind === 'house' && !b.model); if (hb) test(this.house.roofActor, hb.x, hb.y, Math.max(hb.w, hb.h) / 2, 34) }
    for (const n of lay.nodes) {
      if (this.gather?.node === n) {
        // the tree being cut stands solid: it is what the player is looking at
        const a = this.nodeProp.get(n.id)
        if (a && a.fade < 1) a.fade = Math.min(1, a.fade + k)
        continue
      }
      if (n.rise <= 10 || n.depleted) continue
      const a = this.nodeProp.get(n.id)
      test(a, n.x, n.y, n.hw / 0.36 / 2, n.rise)
      // and the trees stir in the wind
      if (a && Math.abs(n.x - p.x) < 170 && Math.abs(n.y - p.y) < 170) a.roll = Math.sin(this.clock * 1.3 + n.x * 0.37 + n.y * 0.21) * 0.035
    }
  }
  /** the view key: on an island it tilts the camera or stands it overhead; in flight it steps through the prototype's views */
  switchView() {
    if (this.mode === 'island') this.toggleView()
    else {
      this.sfx('whoosh', 1.5, 0.5)
      this.scene.toggleView()
      this.changed()
    }
  }
  /** on an island: between the tilted view with depth and the plain overhead one */
  toggleView() {
    this.view3d = !this.view3d
    this.scene.setIslandView(this.view3d)
    this.sfx('whoosh', this.view3d ? 1.5 : 1.1, 0.5)
    this.changed()
  }
  /** turn the island camera an eighth of a turn: dir +1 clockwise, −1 the other way */
  rotateView(dir: number) {
    if (this.house.active) return // in the house the camera looks in over the sill
    this.camYaw += (dir * Math.PI) / 4
    this.sfx('tap', 1.2)
    this.changed()
  }
  /** arrow keys / WASD on foot: −1..1 on each axis */
  setWalkKeys(x: number, y: number) {
    if ((x || y) && (this.path || this.gather)) this.stopWalking()
    this.keyX = x
    this.keyY = y
  }

  /** where a box standing on the ground is on screen: its bounds in frame pixels, or null if out of sight */
  screenBox(x: number, y: number, hw: number, hh: number, base: number, rise: number) {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let c = 0; c < 8; c++) {
      const s = this.scene.projectPoint(x + (c & 1 ? hw : -hw), y + (c & 2 ? hh : -hh), base + (c & 4 ? rise : 0))
      if (!s) return null
      if (s.x < x0) x0 = s.x
      if (s.x > x1) x1 = s.x
      if (s.y < y0) y0 = s.y
      if (s.y > y1) y1 = s.y
    }
    return { x0, y0, x1, y1 }
  }
  /** a tap on the frame, in frame pixels */
  tap(bx: number, by: number) {
    if (this.mode !== 'island' || this.panel || this.house.resting || this.photoMode) return
    // at the table with a guest: a tap is the next line
    if (this.visits.treat) return this.visits.next()
    if (this.mine.active) return this.mine.tap(bx, by)
    if (this.dive.active) return // the dive has its own picture, and takes its own taps
    // something in hand to set down: a tap aims it (a mouse sets it down at once where it fits)
    if (this.placingItem) {
      const hit = this.scene.pick(bx, by)
      if (!hit) return
      const at = this.toLocal(hit.x, hit.y)
      const g = this.ghost
      const again = g && Math.hypot(g.x - at.x, g.y - at.y) < 5
      if (this.pointerKind === 'mouse' || again) {
        this.aimAt(at.x, at.y)
        return this.placeHere()
      }
      this.aimAt(at.x, at.y)
      this.sfx('tap', 1.3)
      if (this.ghost && !this.ghost.ok) this.warn(this.ghost.why)
      return
    }
    if (this.fishing.active) return // the line is out: presses wind it in (see press)
    const lay = this.here
    {
      // Anything drawn counts, with a little to spare, so a finger does not have to find the
      // exact pixel; of the things under the tap, the one whose middle is nearest wins.
      const pad = 1.5 * this.scene.zoom
      let bestD = Infinity
      let go: (() => void) | null = null
      const test = (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias = 0) => {
        const b = this.screenBox(x, y, hw, hh, base, rise)
        if (!b || bx < b.x0 - pad || bx > b.x1 + pad || by < b.y0 - pad || by > b.y1 + pad) return
        const d = Math.hypot(bx - (b.x0 + b.x1) / 2, by - (b.y0 + b.y1) / 2) + bias
        if (d < bestD) {
          bestD = d
          go = then
        }
      }
      for (const [id, a] of this.vehicleActors) test(a.x, a.y, 9, 9, a.z - 3, 8, () => this.goBoard(id), -6)
      const who = this.owners[lay.def.id]
      if (who) test(who.x, who.y, 4, 4, who.z, 12, () => this.walkTo({ x: who.x, y: who.y }, 9, () => this.talk(lay)), -8)
      for (const n of lay.nodes) {
        if (n.depleted && !NODES[n.kind].empty) continue
        test(n.x, n.y, n.hw, n.hh, n.base, n.depleted ? 3 : n.rise, () => this.goGather(n))
      }
      for (const q of lay.buildings) {
        if (q.kind === 'house' && !q.model) {
          // the player's own house: from outside it is a building to walk into (but anything standing
          // in front of it, the mailbox say, comes first); from inside it is the rooms, not a target
          if (!this.house.active) test(q.x, q.y, q.w / 2, q.h / 2, q.base, q.rise, () => this.goUse(q), 30)
          continue
        }
        test(q.x, q.y, q.w / 2, q.h / 2, q.base, q.rise, () => this.goUse(q))
      }
      this.life.taps(test)
      if (this.house.active) this.house.taps(test)
      else {
        this.farm.taps(test)
        this.pets.taps(test)
        this.visits.taps(test)
        this.mail.taps(test)
      }
      for (const b of this.benches) {
        if (this.sitting && this.sitting.x === b.x && this.sitting.y === b.y) continue
        test(b.x, b.y, 5, 3, this.world.heightAt(Math.round(b.x), Math.round(b.y)), 6, () => this.walkTo(b, 7, () => this.sit(b), true), -2)
      }
      if (go) {
        this.sfx('tap')
        ;(go as () => void)()
        return
      }
    }
    const hit = this.scene.pick(bx, by)
    if (!hit) return
    // into the island's own coordinates (the world wraps)
    const x = lay.plaza.x + this.world.delta(hit.x, lay.plaza.x)
    const y = lay.plaza.y + this.world.delta(hit.y, lay.plaza.y)
    if (this.house.active) {
      const at = this.toLocal(hit.x, hit.y)
      return this.tapGround(at.x, at.y)
    }
    if (this.heldItem() === 'shovel' && !this.world.isWater(Math.round(x), Math.round(y)) && (this.here.def.home || this.baitUnder(x, y))) return this.shovelTap(x, y)
    // a tap on the sea is a cast
    if (this.world.isWater(Math.round(x), Math.round(y))) return this.fishing.cast(x, y)
    this.tapGround(x, y)
  }
  /** a press and its release anywhere on the picture: with a line out, that is the reel */
  press(on: boolean) {
    if (this.mode === 'flight' && this.combat.armed && !this.fishing.active && !this.anchored) return this.combat.fire(on)
    if ((this.mode === 'island' || this.mode === 'flight') && this.fishing.active && !this.panel) this.fishing.hold(on)
  }
  walkKeys() {
    return { x: this.keyX, y: this.keyY }
  }
  /** something came out of the sea: a nod for a common fish, a banner for a good one, the ceremony for the first rare one */
  /** shake the phone a little (where it can) */
  rumble(ms: number) {
    this.emit({ t: 'rumble', ms: Math.round(ms) })
  }
  catchFx(item: ItemId, lead: string) {
    const it = ITEMS[item]
    if (it.rarity >= 2) {
      this.sfx('rare')
      if (!this.milestone('fish:' + item, $t('{0}{1}！', lead, it.name), it.desc, item)) this.celebrate(1, $t('{0}{1}！', lead, it.name), it.desc, item)
    } else if (it.rarity === 1) this.celebrate(1, `${lead}${it.name}`, it.desc, item)
    else this.sfx('done')
  }
  /** a tap on bare ground (or water): walk there */
  tapGround(x: number, y: number) {
    // a tick, and a ring of sparkles where the pilot is headed
    this.sfx('go')
    this.scene.burst({ kind: 'star', x, y, z: this.world.heightAt(Math.round(x), Math.round(y)) + 1, n: 5, speed: 9, up: 4, life: 0.35, mode: 'float', grav: 0 })
    this.walkTo({ x: Math.round(x), y: Math.round(y) }, 0.8, null)
  }

  // ── gathering
  //
  // The rules are Minecraft's: a tree needs an axe, stone and ore need a pick, and what the tool
  // is made of decides how many blows it takes and what it can break at all. Bushes, flowers and
  // what lies on the ground are taken by hand. Each blow rocks the thing; the last brings it down.
  goGather(node: NodeInst) {
    const lay = this.here
    if (!lay.def.home) {
      this.warn($t('这是{0}的岛，这里的东西不能采', lay.def.owner))
      return
    }
    if (this.gather?.node === node) return
    const def = NODES[node.kind]
    if (node.depleted) {
      this.warn(def.tall ? $t('只剩树桩了，过一阵会再长出来') : $t('还没长回来，过一会儿再来'))
      return
    }
    if (def.tool !== 'hand') {
      const tier = toolTier(this.save.inv, def.tool)
      const tool = def.tool === 'axe' ? $t('斧头') : $t('镐')
      if (tier === 0 && toolTier(this.save.store ?? {}, def.tool) > 0) return this.warn($t('{0}放在仓库里了：去仓库拿出来', tool))
      if (tier === 0) return this.warn($t('{0}{1}要用{2}。在工作台用树枝和卵石做一把', def.verb, def.name, tool))
      if (tier < def.tier) return this.warn($t('{0}对付不了{1}，要{2}', toolName(def.tool, tier), def.name, toolName(def.tool, def.tier)))
    }
    if (!this.fits(def.yield)) return this.full($t('{0}的东西装不下', def.name))
    this.walkTo(node, def.solid + 5.4, () => this.startGather(node))
  }
  private startGather(node: NodeInst) {
    const p = this.pilot
    const def = NODES[node.kind]
    const dx = node.x - p.x
    const dy = node.y - p.y
    this.face(Math.atan2(dx, -dy), 1)
    const prop = this.nodeProp.get(node.id)!
    // a tree leans (and later falls) away from the pilot: its "right" is turned that way
    if (def.tall) prop.yaw = Math.atan2(dy, dx)
    const tier = def.tool === 'hand' ? 1 : Math.max(1, toolTier(this.save.inv, def.tool))
    this.gather = { node, prop, hits: 0, need: Math.max(1, Math.ceil(def.hp / tier)), t: 0, struck: false, wob: 0, wobV: 0, fall: -1 }
  }
  /** walking off before the job is done: the thing stands as it was */
  private cancelGather() {
    const g = this.gather
    if (!g) return
    this.gather = null
    this.pilot.stretch = 1
    if (g.fall >= 0) {
      this.finishGather(g)
      return
    }
    g.prop.roll = 0
    g.prop.stretch = 1
  }
  private stepGather(dt: number) {
    const g = this.gather!
    const def = NODES[g.node.kind]
    if (g.fall >= 0) {
      // timber: slowly at first, then all at once
      g.fall += dt
      const u = Math.min(1, g.fall / 0.9)
      g.prop.roll = (Math.PI / 2) * (0.06 * u + 0.94 * u * u * u)
      if (u >= 1) {
        this.gather = null
        this.finishGather(g)
      }
      return
    }
    // the thing rocks back upright on a spring
    g.wobV += (-g.wob * 150 - g.wobV * 7) * dt
    g.wob += g.wobV * dt
    g.prop.roll = def.tall ? g.wob : g.wob * 0.25
    g.prop.stretch = 1 + ((g.prop.stretch || 1) - 1) * Math.exp(-dt * 12)
    // the pilot: wind up, strike, recover
    g.t += dt
    const ph = g.t / def.swing
    this.pilot.stretch = ph < 0.45 ? 1 + 0.14 * (ph / 0.45) : 1 - 0.16 * Math.max(0, 1 - (ph - 0.45) / 0.35)
    if (!g.struck && ph >= 0.45) {
      g.struck = true
      this.strike(g)
    }
    if (ph >= 1) {
      g.t = 0
      g.struck = false
    }
  }
  /** one blow lands */
  private strike(g: NonNullable<Game['gather']>) {
    const n = g.node
    const def = NODES[n.kind]
    const p = this.pilot
    if (!this.body.work(def.tool === 'axe' ? 'chop' : def.tool === 'pick' ? 'mine' : 'hand')) {
      this.cancelGather()
      p.stretch = 1
      return
    }
    g.hits++
    // (the knack at ten: the tool wears half as fast)
    if (def.tool !== 'hand' && !(this.skills.has(def.tool === 'axe' ? 'chop' : 'mine', 1) && this.rnd() < 0.5)) this.useTool(this.toolInHand(def.tool))
    const last = g.hits >= g.need
    const d = Math.hypot(n.x - p.x, n.y - p.y) || 1
    // where the tool meets it: on the near side, at hand height
    const cx = n.x - ((n.x - p.x) / d) * Math.min(def.solid + 1, 3)
    const cy = n.y - ((n.y - p.y) / d) * Math.min(def.solid + 1, 3)
    const away = Math.atan2(n.x - p.x, -(n.y - p.y))
    const hand = def.tool === 'hand'
    this.sfx(def.sound, 0.88 + 0.2 * (g.hits / g.need))
    this.scene.burst({ kind: def.chips, x: cx, y: cy, z: n.base + (hand ? 2 : 4), n: last ? 16 : 7, speed: last ? 34 : 24, up: 36, life: 0.7, dir: away + Math.PI, cone: 2.4 })
    if (def.sound === 'mine') this.scene.burst({ kind: 'spark', x: cx, y: cy, z: n.base + 4, n: 4, speed: 30, up: 30, life: 0.25, mode: 'spark' })
    if (def.tall) {
      // leaves shaken loose drift down from the crown; the deeper the cut, the harder it rocks
      this.scene.burst({ kind: n.kind.startsWith('pine') ? 'pine' : n.kind.startsWith('palm') ? 'palm' : 'leaf', x: n.x, y: n.y, z: n.base + n.rise * 0.75, n: last ? 14 : 6, speed: 12, up: 6, life: 1.4, mode: 'float', grav: 24, r: n.hw })
      g.wobV += 1.6 + 2.4 * (g.hits / g.need)
    } else {
      g.prop.stretch = hand ? 0.7 : 0.84
      g.wobV += 1.2
    }
    this.scene.shake(hand ? 0.5 : last ? 2.6 : 0.8 + 0.9 * (g.hits / g.need))
    if (!last) return
    this.pilot.stretch = 1
    if (!hand) this.hitStop = 0.09
    if (def.tall) {
      g.fall = 0
      this.sfx('creak')
    } else {
      this.gather = null
      this.finishGather(g)
    }
  }
  /** it is down (or broken, or picked): the noise, the debris, and what it gives */
  private finishGather(g: NonNullable<Game['gather']>) {
    const node = g.node
    const def = NODES[node.kind]
    const tall = !!def.tall
    const prop = g.prop
    // where the drops appear: beside a felled tree's trunk, on the spot otherwise
    let ox = node.x
    let oy = node.y
    if (tall) {
      const cs = Math.cos(prop.yaw)
      const sn = Math.sin(prop.yaw)
      const lx = node.x + cs * node.rise * 0.7
      const ly = node.y + sn * node.rise * 0.7
      ox = node.x + cs * 8
      oy = node.y + sn * 8
      this.sfx('treefall')
      this.scene.shake(3.4)
      this.scene.burst({ kind: node.kind.startsWith('pine') ? 'pine' : node.kind.startsWith('palm') ? 'palm' : 'leaf', x: lx, y: ly, z: node.base + 2, n: 26, speed: 26, up: 30, life: 1.1, r: node.hw })
      this.scene.burst({ kind: 'dust', x: (lx + node.x) / 2, y: (ly + node.y) / 2, z: node.base + 1, n: 16, speed: 16, up: 10, life: 0.8, mode: 'smoke', r: 6 })
      // the fallen trunk lies there for a moment and fades; the stump stays
      const ghost = this.scene.addActor(prop.model, { x: prop.x, y: prop.y, z: prop.z, yaw: prop.yaw, roll: Math.PI / 2, shadow: false, fade: 0.999 })
      this.fading.push(ghost)
    } else if (def.tool === 'pick') {
      this.sfx('rockbreak')
      this.scene.shake(2.8)
      this.scene.burst({ kind: def.chips, x: node.x, y: node.y, z: node.base + 3, n: 26, speed: 32, up: 46, life: 0.9, r: 3 })
      this.scene.burst({ kind: 'dust', x: node.x, y: node.y, z: node.base + 1, n: 9, speed: 12, up: 8, life: 0.7, mode: 'smoke', r: 4 })
    } else {
      this.scene.burst({ kind: def.chips, x: node.x, y: node.y, z: node.base + 2, n: 8, speed: 16, up: 26, life: 0.6, r: 2 })
    }
    this.setDepleted(node, true)
    const got: Bag = { ...def.yield }
    for (const [item, chance] of def.bonus ?? []) if (this.rnd() < chance) got[item] = (got[item] ?? 0) + 1
    // practice: a practised hand gets a little more out of a tree or a rock
    const skill: Skill | null = def.tool === 'axe' ? 'chop' : def.tool === 'pick' ? 'mine' : null
    if (skill) {
      const main = Object.keys(def.yield)[0] as ItemId | undefined
      if (main && this.rnd() < this.skills.extra(skill)) got[main] = (got[main] ?? 0) + 1
      if (skill === 'chop' && tall && this.skills.has('chop', 0) && this.rnd() < 0.25) got.acorn = (got.acorn ?? 0) + 1
      if (skill === 'mine' && this.skills.has('mine', 0) && this.rnd() < 0.2) got.coal = (got.coal ?? 0) + 1
      this.skills.gain(skill, 2)
    }
    this.receive(got)
    give(this.save.stats.gathered, got)
    this.save.nodes[node.id] = this.now() + def.regrow
    const z = node.base + 5
    this.after(tall ? 0.12 : 0, () => this.drop(got, ox, oy, z))
    let i = 0
    for (const k of Object.keys(got) as ItemId[]) {
      this.float(`+${got[k]} ${ITEMS[k].name}`, node.x, node.y - i * 5, z + 6)
      i++
    }
    this.changed()
  }
  private tickNodes(now: number) {
    if (this.saplings.size) for (const p of this.save.planted ?? []) if (p.at <= now && this.saplings.has(plantKey(p))) this.grow(p, true)
    for (const n of this.layouts.home.nodes) {
      if (!n.depleted || this.gather?.node === n) continue
      if ((this.save.nodes[n.id] ?? 0) > now) continue
      // not while the pilot is standing on it
      if (this.save.here === 'home' && Math.hypot(this.pilot.x - n.x, this.pilot.y - n.y) < 6) continue
      this.setDepleted(n, false)
      delete this.save.nodes[n.id]
      if (this.save.here === 'home' && this.onSurface) {
        // it grows back with a little pop, if the player is there to see it
        const a = this.nodeProp.get(n.id)
        if (a) {
          a.stretch = 0.3
          this.settling.push(a)
        }
        this.sfx('pop', 0.8 + Math.random() * 0.4, 0.5)
        this.scene.burst({ kind: NODES[n.kind].tall ? 'leaf' : NODES[n.kind].chips, x: n.x, y: n.y, z: n.base + n.rise * 0.6, n: 8, speed: 14, up: 16, life: 0.6, r: n.hw })
      }
    }
  }

  // ── buildings
  private goUse(b: BuildingInst) {
    this.walkTo(b.door, 1.6, () => this.use(b))
  }
  private use(b: BuildingInst) {
    const lay = this.here
    if (b.kind === 'board') return this.open({ kind: 'board' })
    if (b.kind === 'pier') {
      return this.open({ kind: 'pier' })
    }
    if (b.kind === 'landmark') return this.toast(LANDMARK_TEXT[lay.def.landmark] ?? '')
    if (b.kind === 'mine') return this.useMine(lay)
    if (b.kind === 'restaurant') return this.open({ kind: 'cook', restaurant: true })
    if (FACILITIES[b.kind as FacilityId]) return this.open({ kind: b.kind as FacilityId })
    if (b.kind === 'house') {
      // the player's own house: walk in at the door (the house opens up as you step over the sill)
      if (lay.def.home) return this.house.active ? undefined : this.walkTo(this.house.doorOutside(), 2, () => this.house.enter())
      return this.toast($t('{0}的家。窗台上摆着花。', lay.def.owner))
    }
    if (!lay.def.home) return this.warn($t('这是{0}的{1}', lay.def.owner, BUILDING_NAME[b.kind]))
    this.open({ kind: b.kind as 'workbench' | 'furnace' | 'hangar' | 'crates' })
  }
  /** a word with the islander */
  private talk(lay: IslandLayout) {
    const d = lay.def
    const who = this.owners[d.id]
    if (who) {
      who.stretch = 0.75
      this.settling.push(who)
      who.yaw = Math.atan2(this.pilot.x - who.x, -(this.pilot.y - who.y))
    }
    this.sfx('pop', 1.1)
    const sells = d.sells.map((i) => ITEMS[i].name).join($t('、'))
    const wants = d.wants.slice(0, 3).map((i) => ITEMS[i].name).join($t('、'))
    if (d.guest) return this.toast($t('{0}。岛主不在家', d.name))
    // their wish: handed over in person, if the things are in the bag or the warehouse
    const wish = this.wishes.open
    if (wish && wish.island === d.id) {
      if (this.wishes.canSend()) { this.say(d.id, $t('{0}：“真的帮我带来了？太谢谢你了！”', d.owner)); this.wishes.send(); return }
      return this.say(d.id, $t('{0}：“我还在等那 {1} 个{2}呢——你手上还差 {3} 个。”', d.owner, wish.n, ITEMS[wish.item].name, wish.n - this.count(wish.item)))
    }
    const fr = this.story.friend(d.id)
    const bond = (FRIENDS as readonly string[]).includes(d.id) ? $t('（{0}{1}）', FRIEND_NAME[fr.level], fr.next ? $t('，再送 {0} 单更熟', fr.next - fr.points) : '') : ''
    this.say(d.id, $t('{0}{1}：我们{2}出{3}。眼下最缺{4}——布告板上有单子。', d.owner, bond, d.name, sells, wants))
  }
  /** an islander says something: a bubble over their head for a few seconds */
  say(island: string, text: string, secs = 5) {
    this.speech = { island, text, until: this.clock + secs }
    const w = this.wander.get(island)
    if (w) w.hold = this.clock + secs + 1
    // in their own voice: the words after the name, as the islands' babble
    const model = this.layouts[island]?.def.ownerModel ?? ''
    const voice = ({ islanderA: 0.82, islanderB: 1.32, islanderC: 1.18, islanderD: 0.72 } as Record<string, number>)[model] ?? 1
    this.emit({ t: 'say', text: text.replace(/^[^：]*：/, ''), voice })
  }
  /** the islander of the island the pilot is on: strolls about the village, turns to look at the pilot, says hello */
  private stepIslanders(dt: number) {
    const lay = this.here
    const id = lay.def.id
    const who = this.owners[id]
    if (!who || this.mine.active || this.dive.active) return
    let w = this.wander.get(id)
    if (!w) {
      w = { home: { x: who.x, y: who.y }, to: null, wait: 2, hold: 0, greeted: false }
      this.wander.set(id, w)
    }
    const p = this.pilot
    const near = Math.hypot(p.x - who.x, p.y - who.y)
    let moving = false
    if (near < 34 || this.clock < w.hold) {
      // someone to look at
      const yaw = Math.atan2(p.x - who.x, -(p.y - who.y))
      let d = yaw - who.yaw
      d -= Math.PI * 2 * Math.round(d / (Math.PI * 2))
      who.yaw += d * (1 - Math.exp(-dt * 6))
      w.to = null
      if (!w.greeted && near < 34 && !lay.def.guest) {
        w.greeted = true
        const fr = this.story.friend(id)
        const hello = [$t('“哟，来了。”'), $t('“今天风不错。”'), $t('“又见面了！”'), $t('“你来得正好！”')][Math.min(3, fr.level)]
        this.say(id, $t('{0}：{1}', lay.def.owner, hello), 3)
      }
    } else {
      if (near > 90) w.greeted = false
      if (!w.to) {
        w.wait -= dt
        if (w.wait <= 0) {
          // somewhere nearby on open ground
          for (let tries = 0; tries < 8 && !w.to; tries++) {
            const a = this.rnd() * Math.PI * 2
            const r = 6 + this.rnd() * 22
            const x = Math.round(w.home.x + Math.cos(a) * r)
            const y = Math.round(w.home.y + Math.sin(a) * r)
            if (canPlace(this.world, 2, 2, x, y)) w.to = { x, y }
          }
          w.wait = 2 + this.rnd() * 4
        }
      } else {
        const dx = w.to.x - who.x
        const dy = w.to.y - who.y
        const dd = Math.hypot(dx, dy)
        if (dd < 1) w.to = null
        else {
          const step = Math.min(dd, 13 * dt)
          who.x += (dx / dd) * step
          who.y += (dy / dd) * step
          who.yaw = Math.atan2(dx, -dy)
          who.z = this.world.heightAt(Math.round(who.x), Math.round(who.y))
          moving = true
        }
      }
    }
    const base = lay.def.ownerModel
    const frame = moving ? base + (Math.sin(this.clock * 13) > 0 ? '_wa' : '_wb') : base
    if (who.model.name !== frame && this.scene.models[frame]) who.model = this.scene.models[frame]
  }

  // ── the island itself: rolling it again, and making it bigger
  /** why the island cannot be re-rolled, or null if it can */
  rerollBlock(): string | null {
    if (this.save.stats.delivered > 0 || this.save.vehicles.length > 0) return $t('造出第一架飞机或第一艘船之后，岛就定下来了')
    if (this.save.island.rolls >= REROLLS) return $t('{0} 次机会都用掉了', REROLLS)
    return null
  }
  get rerollsLeft(): number {
    return Math.max(0, REROLLS - this.save.island.rolls)
  }
  /**
   * "Blow it up and start again": a new island from a new seed. Only for a newcomer (before the
   * first vehicle), and only a few times, so it cannot be used to farm a perfect island. The bag
   * is kept; what was built on the old island comes back as its kit.
   */
  rerollIsland() {
    const why = this.rerollBlock()
    if (why) return this.warn(why)
    const s = this.save
    s.island.rolls++
    s.island.seed = 1 + Math.floor(this.rnd() * 1e6)
    this.sfx('boom')
    this.scene.shake(7)
    this.remake(true)
    const d = this.layouts.home.def
    this.celebrate(2, $t('轰——新的小岛！'), $t('{0} · 还能重来 {1} 次', richLine(d), this.rerollsLeft), 'stone')
  }
  /** the next size up, what it costs, and whether it can be afforded yet */
  get level(): number {
    return this.save.level ?? 1
  }
  get farmPlots(): number {
    return farmPlots(this.level)
  }
  get petSlots(): number {
    return petSlots(this.level)
  }
  /** the next level: what it asks for, how far along, and whether it can be had now */
  levelInfo() {
    const next = LEVELS[this.level]
    if (!next) return null
    const goals = next.goals.map((q) => ({ text: q.text, have: Math.min(q.have(this), q.need), need: q.need, done: q.have(this) >= q.need }))
    const short = this.save.coins < next.coins
    const left = goals.filter((q) => !q.done)
    const why = next.planned ? $t('还在规划中') : left.length ? $t('还差：{0}', left.map((q) => $t('{0}（{1}/{2}）', q.text, q.have, q.need)).join($t('、'))) : short ? $t('还差 {0} 金币', next.coins - this.save.coins) : ''
    return { level: next, goals, ok: !next.planned && !left.length && !short, why }
  }
  /**
   * The island goes up a level. At levels 4 and 7 the land grows too: the same island (same seed),
   * a size bigger — more hills, more of everything, a deeper mine. Buildings and vehicles move to
   * their places on the new land, the furnace and the furniture are set down again where they
   * stood, and everything that grows starts fresh.
   */
  levelUp() {
    const info = this.levelInfo()
    if (!info) return this.warn($t('已经是最高级了'))
    if (!info.ok) return this.warn(info.why)
    const L = info.level
    this.save.coins -= L.coins
    this.save.level = L.n
    // the first beds come with something to put in them
    if (L.n === 2) give((this.save.store ??= {}), { carrotSeed: 6, wheatSeed: 6 })
    this.onlineDirty = true
    if (L.tier > this.save.island.tier) {
      this.save.island.tier = L.tier
      this.sfx('boom')
      this.sfx('rumble')
      this.scene.shake(7)
      this.remake(false)
      // step back to take it all in, then come close again
      this.islandZoom = 1
      this.after(4.5, () => { this.islandZoom = 2 })
      const d = this.layouts.home.def
      this.celebrate(2, $t('岛屿升到 {0} 级：{1}！', L.n, L.name), `${L.opens} · ${richLine(d)}`, 'goldIngot')
    } else {
      this.farm.rebuild()
      this.sfx('fanfare')
      this.scene.shake(2)
      const p = this.pilot
      this.scene.burst({ kind: 'spark', x: p.x, y: p.y, z: p.z + 12, n: 30, speed: 30, up: 40, life: 1.2, r: 4 })
      this.celebrate(2, $t('岛屿升到 {0} 级：{1}！', L.n, L.name), L.opens, 'coin')
    }
    this.changed()
  }
  /** the land is made again from the save, and what stood on it is put back */
  private remake(fresh: boolean) {
    const s = this.save
    const old = this.layouts.home
    const hadFurnace = !!s.furnace
    const furnaceOff = s.furnace ? { dx: s.furnace.x - old.plaza.x, dy: s.furnace.y - old.plaza.y } : null
    s.nodes = {}
    s.furnace = null
    // the restaurant is folded up into its kit and put away; it goes up again where it is wanted
    if (s.restaurant) { give((s.store ??= {}), { restaurantKit: 1 }); s.restaurant = null }
    // and so are the buildings from level 6 on (what was in the shop window goes to storage)
    if (s.estate) {
      for (const f of Object.keys(s.estate.built) as FacilityId[]) give((s.store ??= {}), { [FACILITIES[f].kit]: 1 })
      s.estate.built = {}
      for (const l of s.estate.shop?.lines ?? []) give((s.store ??= {}), { [l.item]: l.qty })
      if (s.estate.shop) s.estate.shop.lines = []
    }
    if (fresh) {
      // a different island: the furnace comes back as its kit, what was in it as its ingots, the furniture as itself
      if (hadFurnace) give((s.store ??= {}), { furnaceKit: 1 + (s.furnaces2?.length ?? 0) })
      s.furnaces2 = []
      for (const j of s.jobs) give((s.store ??= {}), { [j.out]: j.qty })
      s.jobs = []
      for (const d of s.decor ?? []) give((s.store ??= {}), { [d.item]: 1 })
      s.decor = []
      for (const p of s.planted ?? []) give((s.store ??= {}), { [p.kind]: 1 })
      s.planted = []
      // the beds are dug again on the new island; what was in them comes back as seed
      for (const b of [...(s.farm ?? []), ...(s.field?.plots ?? [])]) if (b.seed) give((s.store ??= {}), { [b.seed]: 1 })
      s.farm = []
      if (s.field) { s.field.plots = []; s.field.ax = s.field.ay = 0 }
      if (s.mine) { s.mine.broken = {}; s.mine.unlocked = 1 }
    }
    this.panel = null
    this.cancelPlacing(true)
    this.stopWalking()
    this.build()
    const lay = this.layouts.home
    if (!fresh && furnaceOff) {
      // the furnace, where it stood from the middle of the village — or the default spot
      let at = { x: lay.plaza.x + furnaceOff.dx, y: lay.plaza.y + furnaceOff.dy }
      if (!canPlace(this.world, 7.5, 7.5, at.x, at.y)) at = lay.furnaceSpot
      const b = placeBuilding(this.world, lay, 'furnace', 'furnace', at.x, at.y, 0, 'furnace')
      this.addBuildingProp(lay, b)
      s.furnace = { x: at.x, y: at.y }
    }
    this.persistFn?.(s)
    this.changed()
  }

  // ── bolting things on to a vehicle
  /** why an upgrade cannot go on this vehicle, or '' */
  upgradeBlock(vehicleId: string, up: UpgradeId): string {
    const v = this.vehicle(vehicleId)
    if (up !== 'guns' || !v) return ''
    if (this.vdef(v).kind !== 'plane') return $t('船装不了武器')
    return this.level < 5 ? $t('岛 5 级解锁') : ''
  }
  canUpgrade(vehicleId: string, up: UpgradeId): boolean {
    const v = this.vehicle(vehicleId)
    const u = UPGRADES[up]
    return !!v && !this.upgradeBlock(vehicleId, up) && !v.up?.includes(up) && this.save.coins >= u.coins && this.canPay(u.cost)
  }
  buyUpgrade(vehicleId: string, up: UpgradeId) {
    const v = this.vehicle(vehicleId)
    if (!v) return
    const u = UPGRADES[up]
    if (v.up?.includes(up)) return this.warn($t('已经装上了'))
    if (this.upgradeBlock(vehicleId, up)) return this.warn(this.upgradeBlock(vehicleId, up))
    if (this.save.coins < u.coins || !this.canPay(u.cost)) return this.warn($t('钱或材料不够'))
    this.save.coins -= u.coins
    this.spend(u.cost)
    ;(v.up ??= []).push(up)
    const a = this.vehicleActors.get(vehicleId)
    this.sfx('craft')
    this.after(0.15, () => this.sfx('craft', 1.2))
    this.after(0.3, () => this.sfx('stack', 1.3))
    if (a) {
      this.scene.burst({ kind: 'spark', x: a.x, y: a.y, z: a.z + 2, n: 24, speed: 30, up: 30, life: 0.5, mode: 'spark', r: 6 })
      a.stretch = 0.8
      this.settling.push(a)
    }
    this.celebrate(1, $t('{0}装上了{1}', this.vdef(v).name, u.name), u.desc)
    this.changed()
  }

  // ── furniture: set out on the island to make it one's own
  /** how charming the island is: every piece of furniture adds to it, the rare ones much more */
  /** the island's charm and where it comes from: what stands outside, a quarter of what is in the
   * house (round 17: a home made cosy counts too), and the guests fed at the restaurant */
  charmParts(): { outdoor: number; house: number; guests: number } {
    const outdoor = (this.save.decor ?? []).reduce((n, d) => n + (FURNITURE[d.item]?.charm ?? 0), 0)
    const inside = (this.save.home?.pieces ?? []).reduce((n, p) => n + (FURNITURE[p.item]?.charm ?? 0), 0)
    return { outdoor, house: Math.floor(inside / 4), guests: this.save.hospitality ?? 0 }
  }
  get charm(): number {
    const c = this.charmParts()
    return c.outdoor + c.house + c.guests
  }
  /** what the island's charm earns: a little more on every delivery */
  get charmBonus(): number {
    // (and the lighthouse's lamp, lit at night: a tenth more)
    const beacon = this.save.home?.beacon && this.dayPhase() !== 'day' ? 0.1 : 0
    return Math.min(0.25, Math.floor(this.charm / 10) * 0.02) + beacon
  }
  private placeDecor() {
    const lay = this.layouts.home
    const keep: NonNullable<Save['decor']> = []
    for (const d of this.save.decor ?? []) {
      const f = FURNITURE[d.item]
      // where it stood — or, if the island has changed under it, the nearest open ground
      let at: Point | null = null
      for (let r = 0; f && r <= 36 && !at; r += 6) {
        for (let k = 0; k < (r ? 8 : 1) && !at; k++) {
          const x = Math.round(lay.plaza.x + d.dx + Math.cos((k * Math.PI) / 4) * r)
          const y = Math.round(lay.plaza.y + d.dy + Math.sin((k * Math.PI) / 4) * r)
          if (canPlace(this.world, f.solid, f.solid, x, y)) at = { x, y }
        }
      }
      if (!f || !at) {
        // nowhere near will do: back in the bag
        give((this.save.store ??= {}), { [d.item]: 1 })
        continue
      }
      d.dx = at.x - lay.plaza.x
      d.dy = at.y - lay.plaza.y
      keep.push(d)
      this.addDecor(d.item, at.x, at.y, d.rot)
    }
    this.save.decor = keep
  }
  private addDecor(item: ItemId, x: number, y: number, rot = 0): Actor {
    const f = FURNITURE[item]!
    const a = this.scene.addActor(f.model, { x, y, z: this.world.heightAt(x, y), yaw: (rot * Math.PI) / 2, shadow: false, reach: 620 })
    this.world.block(x, y, f.solid, f.solid, true)
    this.decorProps.push(a)
    if (item === 'bench') this.benches.push({ x, y, yaw: a.yaw })
    return a
  }
  /** sit down on a bench: a breath, and the island goes on around you */
  private sit(b: { x: number; y: number; yaw: number }) {
    const p = this.pilot
    this.stopWalking()
    p.x = b.x
    p.y = b.y
    p.yaw = b.yaw + Math.PI
    p.z = this.world.heightAt(Math.round(b.x), Math.round(b.y)) + 2
    p.model = this.scene.models.pilot_sit
    this.sitting = { x: b.x, y: b.y }
    this.sfx('pop', 0.8)
    this.float(this.dayPhase() === 'night' ? $t('坐着看星星') : $t('坐一会儿'), p.x, p.y, p.z + 14)
    this.changed()
  }
  private placeFurniture(item: ItemId, x: number, y: number) {
    const f = FURNITURE[item]!
    const lay = this.here
    if (!lay.def.home) return this.warn($t('只能摆在自己的岛上'))
    if (!canPlace(this.world, f.solid, f.solid, x, y)) return this.warn($t('这里放不下：要一块平整的空地'))
    if (this.count(item) < 1) return
    this.spend({ [item]: 1 })
    ;(this.save.decor ??= []).push({ item, dx: x - lay.plaza.x, dy: y - lay.plaza.y, rot: this.placingRot })
    const a = this.addDecor(item, x, y, this.placingRot)
    this.onlineDirty = true
    a.stretch = 0.3
    this.settling.push(a)
    const rare = ITEMS[item].rarity
    this.sfx('place', 1.2)
    this.scene.shake(1 + rare)
    this.scene.burst({ kind: rare >= 2 ? 'star' : 'dust', x, y, z: a.z + 1, n: 14 + rare * 8, speed: 18, up: 10 + rare * 10, life: 0.8, mode: rare >= 2 ? 'float' : 'smoke', grav: 0, r: 3 })
    if (rare >= 2) this.sfx('rare')
    this.celebrate(1, $t('摆好了：{0}', ITEMS[item].name), $t('岛的魅力 {0}{1}', this.charm, this.charmBonus ? $t(' · 送货收入 +{0}%', Math.round(this.charmBonus * 100)) : ''), item)
    if (this.count(item) < 1) this.placingItem = null
    this.changed()
  }
  // ── planting: a seed in the ground becomes, in a few minutes, a tree or a bush like any other
  private plantAt(p: { dx: number; dy: number }): Point {
    const lay = this.layouts.home
    return { x: Math.round(lay.plaza.x + p.dx), y: Math.round(lay.plaza.y + p.dy) }
  }
  private placePlants() {
    const now = this.now()
    const keep: NonNullable<Save['planted']> = []
    for (const p of this.save.planted ?? []) {
      const at = this.plantAt(p)
      if (!PLANTS[p.kind as ItemId] || !canPlace(this.world, 3, 3, at.x, at.y)) {
        // the ground has changed under it (a bigger island): the seed comes back
        if (PLANTS[p.kind as ItemId]) give((this.save.store ??= {}), { [p.kind]: 1 })
        continue
      }
      keep.push(p)
      if (p.at <= now) this.grow(p, false)
      else {
        this.saplings.set(plantKey(p), this.scene.addActor('sapling', { x: at.x, y: at.y, z: this.world.heightAt(at.x, at.y), yaw: 0, shadow: false, reach: 620 }))
        this.world.block(at.x, at.y, 2, 2, true)
      }
    }
    this.save.planted = keep
  }
  /** the seedling has had its time: it is a tree (or a bush) now, to be harvested like the rest */
  private grow(p: NonNullable<Save['planted']>[number], show: boolean) {
    const def = PLANTS[p.kind as ItemId]!
    const at = this.plantAt(p)
    const lay = this.layouts.home
    const old = this.saplings.get(plantKey(p))
    if (old) {
      this.scene.removeActor(old)
      this.saplings.delete(plantKey(p))
    }
    const model = this.scene.models[NODES[def.node].model]
    const base = this.world.heightAt(at.x, at.y)
    const n: NodeInst = { id: 'pl' + plantKey(p), kind: def.node, x: at.x, y: at.y, yaw: 0, depleted: false, base, rise: model.H, hw: Math.max(4, model.W * 0.36), hh: Math.max(4, model.W * 0.36) }
    lay.nodes.push(n)
    const a = this.scene.addActor(model, { x: n.x, y: n.y, z: base, yaw: 0, shadow: false, reach: 620 })
    this.nodeProp.set(n.id, a)
    const solid = NODES[def.node].solid || 2
    this.world.block(at.x, at.y, solid, solid, true)
    if (!show) return
    a.stretch = 0.2
    this.settling.push(a)
    if (this.save.here === 'home' && this.onSurface) {
      this.sfx('pop', 0.9)
      this.scene.burst({ kind: 'leaf', x: n.x, y: n.y, z: base + 6, n: 14, speed: 16, up: 22, life: 0.8, r: 4 })
      this.float($t('{0}长成了', NODES[def.node].name), n.x, n.y, base + n.rise)
    }
  }
  private plant(item: ItemId, x: number, y: number) {
    const def = PLANTS[item]!
    if (!this.here.def.home) return this.warn($t('只能种在自己的岛上'))
    if ((this.save.planted?.length ?? 0) >= MAX_PLANTS) return this.warn($t('岛上最多种 {0} 棵', MAX_PLANTS))
    if (!canPlace(this.world, 3, 3, x, y)) return this.warn($t('这里种不下：要一小块平整的空地'))
    if (this.count(item) < 1) return
    this.spend({ [item]: 1 })
    const lay = this.layouts.home
    const p = { kind: item as string, dx: x - lay.plaza.x, dy: y - lay.plaza.y, at: this.now() + def.grow }
    ;(this.save.planted ??= []).push(p)
    const a = this.scene.addActor('sapling', { x, y, z: this.world.heightAt(x, y), yaw: 0, shadow: false, reach: 620 })
    a.stretch = 0.3
    this.settling.push(a)
    this.saplings.set(plantKey(p), a)
    this.world.block(x, y, 2, 2, true)
    this.sfx('place', 1.4)
    this.scene.burst({ kind: 'dust', x, y, z: a.z + 1, n: 10, speed: 12, up: 8, life: 0.7, mode: 'smoke', r: 2 })
    this.celebrate(1, $t('种下了：{0}', ITEMS[item].name), $t('大约 {0} 分钟后长成{1}', Math.round(def.grow / 60), NODES[def.node].name), item)
    if (this.count(item) < 1) this.placingItem = null
    this.changed()
  }
  /** take a piece of furniture back into the bag (the last one set down of that kind) */
  pickUpDecor(item: ItemId) {
    const list = this.save.decor ?? []
    const i = list.map((d) => d.item).lastIndexOf(item)
    if (i < 0) return
    const d = list[i]
    const lay = this.layouts.home
    const x = lay.plaza.x + d.dx
    const y = lay.plaza.y + d.dy
    const f = FURNITURE[item]!
    const a = this.decorProps.find((p) => Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5)
    if (a) {
      this.scene.removeActor(a)
      this.decorProps = this.decorProps.filter((p) => p !== a)
    }
    this.world.block(x, y, f.solid, f.solid, false)
    list.splice(i, 1)
    this.onlineDirty = true
    this.receive({ [item]: 1 })
    this.sfx('pop')
    this.drop({ [item]: 1 }, x, y, this.world.heightAt(x, y) + 4)
    this.changed()
  }

  private useMine(lay: IslandLayout) {
    if (!lay.def.home) return this.warn($t('{0}的矿洞。别人的矿不能挖。', lay.def.owner))
    this.open({ kind: 'mine' })
  }
  open(panel: Panel | null) {
    this.panel = panel
    this.sfx(panel ? (panel.kind === 'board' ? 'paper' : 'open') : 'close')
    if (panel?.kind === 'board') void this.refresh()
    this.changed()
  }
  close() {
    if (this.panel?.kind === 'welcome') this.save.welcomed = true
    if (this.panel) this.sfx('close')
    const was = this.panel?.kind
    this.craftJob = null
    this.panel = null
    if (was === 'pc') this.acts.leavePc()
    if (was === 'cook') { this.acts.stop(); this.acts.note = ''; this.acts.made = null }
    this.changed()
  }

  // ── crafting
  canCraft(id: string, n = 1): boolean {
    const r = RECIPES.find((x) => x.id === id)
    return !!r && (r.level ?? 1) <= this.level && this.canPay(r.cost, n) && !(r.once && (n > 1 || this.count(r.out) > 0 || this.supersededBy(r.out)))
  }
  /** start making n of something at the workbench: each one takes a few blows of the hammer */
  craft(id: string, n = 1) {
    const r = RECIPES.find((x) => x.id === id)
    if (!r || r.station !== 'workbench') return
    if (r.once && (this.count(r.out) > 0 || this.supersededBy(r.out))) return this.warn($t('已经有{0}（或更好的）了', ITEMS[r.out].name))
    if ((r.level ?? 1) > this.level) return this.warn($t('岛升到 {0} 级才能做', r.level))
    if (r.once) n = 1
    if (!this.canPay(r.cost, n)) return this.warn($t('材料不够'))
    this.craftJob = { id, left: n, total: n, t: 0, hits: 0 }
    this.sfx('saw')
    this.changed()
  }
  /** how far along the workbench job is: which item, how many left, and 0..1 through this one */
  crafting(): { id: string; left: number; total: number; u: number } | null {
    const j = this.craftJob
    return j ? { id: j.id, left: j.left, total: j.total, u: Math.min(1, j.t / CRAFT_TIME) } : null
  }
  private stepCraft(dt: number) {
    const j = this.craftJob
    if (!j) return
    const r = RECIPES.find((x) => x.id === j.id)!
    const bench = this.here.buildings.find((b) => b.kind === 'workbench')
    const at = bench ? { x: bench.x, y: bench.y + 1, base: bench.base, rise: 7 } : { x: this.pilot.x, y: this.pilot.y - 4, base: this.pilot.z, rise: 4 }
    j.t += dt
    // three blows, then it is done
    const beat = Math.floor((j.t / CRAFT_TIME) * 3.3)
    this.pilot.stretch = 1 + 0.1 * Math.sin((j.t / CRAFT_TIME) * Math.PI * 6.6)
    if (beat > j.hits && j.hits < 3) {
      j.hits++
      this.sfx('craft', 0.9 + 0.1 * j.hits)
      this.scene.burst({ kind: r.out === 'cloth' || r.out === 'rope' ? 'feather' : r.out === 'furnaceKit' || r.out.startsWith('stone') ? 'rock' : r.out.startsWith('copper') || r.out.startsWith('iron') ? 'spark' : 'wood', x: at.x, y: at.y, z: at.base + at.rise + 1, n: 5, speed: 18, up: 30, life: 0.5 })
      this.scene.burst({ kind: 'spark', x: at.x, y: at.y, z: at.base + at.rise + 1, n: 2, speed: 22, up: 26, life: 0.2, mode: 'spark' })
      this.scene.shake(0.5)
    }
    if (j.t < CRAFT_TIME) return
    if (!this.canPay(r.cost)) {
      this.craftJob = null
      return this.warn($t('材料不够'))
    }
    this.spend(r.cost)
    // a better tool (or backpack) retires the old one
    const old = supersedes(r.out).filter((k) => this.count(k) > 0)
    for (const k of old) {
      this.save.inv[k] = 0
      if (this.save.store) this.save.store[k] = 0
    }
    this.receive({ [r.out]: r.qty })
    give(this.save.stats.crafted, { [r.out]: r.qty })
    if (PACKS.includes(r.out)) {
      this.celebrate(2, $t('背上了{0}', ITEMS[r.out].name), $t('现在能带 {0} 格东西了', this.capacity()), r.out)
    } else if (ITEMS[r.out].kind === 'tool') {
      // the new tool goes straight into the hand
      const i = this.slots().findIndex((x) => x?.item === r.out)
      if (i >= 0 && i < HOTBAR) this.save.held = i
    }
    this.sfx('done')
    this.drop({ [r.out]: r.qty }, at.x, at.y, at.base + at.rise + 2)
    if ((ITEMS[r.out].kind === 'tool' || ITEMS[r.out].kind === 'gear') && !PACKS.includes(r.out)) this.celebrate(1, $t('做好了：{0}', ITEMS[r.out].name), ITEMS[r.out].desc, r.out)
    j.left--
    j.t = 0
    j.hits = 0
    if (j.left <= 0) this.craftJob = null
    this.changed()
  }
  smelt(id: string, n = 1) {
    const r = RECIPES.find((x) => x.id === id)
    if (!r || r.station !== 'furnace') return
    const spots = this.furnaceSpots()
    if (!spots.length) return this.warn($t('还没有熔炉'))
    if (this.save.jobs.length + n > FURNACE_QUEUE * spots.length) return this.warn($t('炉子里排满了（每座最多 {0} 炉）', FURNACE_QUEUE))
    if (!this.canPay(r.cost, n)) return this.warn($t('材料不够'))
    this.spend(r.cost, n)
    // each batch goes to whichever furnace will be free first: with several, they burn at once
    const used = new Set<number>()
    for (let i = 0; i < n; i++) {
      let best = 0, end = Infinity
      for (let k = 0; k < spots.length; k++) {
        const q = this.save.jobs.filter((j) => (j.f ?? 0) === k)
        if (q.length >= FURNACE_QUEUE) continue
        const e = Math.max(this.now(), ...q.map((j) => j.doneAt))
        if (e < end) { end = e; best = k }
      }
      this.save.jobs.push({ out: r.out, qty: r.qty, doneAt: end + r.time, f: best })
      used.add(best)
    }
    // the ore goes in: a whoosh of flame at each door it went in at
    this.sfx('whoosh', 0.8)
    for (const k of used) {
      const f = spots[k]
      this.scene.burst({ kind: 'fire', x: f.x, y: f.y + 8, z: this.world.heightAt(f.x, f.y + 9) + 3, n: 14, speed: 12, up: 26, life: 0.5, mode: 'spark', grav: -20 })
    }
    this.changed()
  }
  /** while the furnace burns: smoke from the chimney, sparks at the door */
  private stepFurnace(dt: number) {
    // each furnace is one model cold and another alight (its fire flickers by itself)
    const spots = this.furnaceSpots()
    spots.forEach((_, k) => {
      const prop = this.buildingProp.get(k ? `home:furnace${k + 1}` : 'home:furnace')
      const lit = this.save.jobs.some((j) => (j.f ?? 0) === k)
      if (prop && (prop.model.name === 'furnaceLit') !== lit) prop.model = this.scene.models[lit ? 'furnaceLit' : 'furnace']
    })
    if (!this.furnaceLit()) return
    this.smokeT -= dt
    if (this.smokeT > 0) return
    this.smokeT = 0.1
    spots.forEach((f, k) => {
      if (!this.save.jobs.some((j) => (j.f ?? 0) === k)) return
      const g = this.world.heightAt(f.x, f.y)
      this.scene.burst({ kind: 'smoke', x: f.x, y: f.y - 2, z: g + 24, n: 1, speed: 3, up: 14, life: 2, mode: 'smoke', size: 1.5, r: 0.8 })
      if (Math.random() < 0.35) this.scene.burst({ kind: 'fire', x: f.x, y: f.y + 8, z: g + 3, n: 1, speed: 7, up: 20, life: 0.45, mode: 'spark', grav: -10 })
    })
  }
  /** where the furnaces stand (the first, then any more) */
  furnaceSpots(): { x: number; y: number }[] {
    return this.save.furnace ? [this.save.furnace, ...(this.save.furnaces2 ?? [])] : []
  }
  /** why another furnace cannot be built, or '' */
  furnaceFull(): string {
    const n = this.furnaceSpots().length, cap = furnaceCap(this.level)
    if (n < cap) return ''
    return cap >= 3 ? $t('已经有三座熔炉了') : $t('岛升到 {0} 级才能再砌一座熔炉', cap === 1 ? 4 : 7)
  }
  /** seconds until this furnace is empty */
  furnaceLeftOf(k: number): number {
    const q = this.save.jobs.filter((j) => (j.f ?? 0) === k)
    return q.length ? Math.max(0, Math.max(...q.map((j) => j.doneAt)) - this.now()) : 0
  }
  private tickJobs(now: number) {
    let done = false
    // (several furnaces: what is done may be anywhere in the list)
    const ready = this.save.jobs.filter((j) => j.doneAt <= now).sort((a, b) => a.doneAt - b.doneAt)
    if (ready.length) this.save.jobs = this.save.jobs.filter((j) => j.doneAt > now)
    for (const j of ready) {
      // out of the furnace: into the pocket if the pilot is at home with room, the warehouse otherwise
      if (this.atHome) this.receive({ [j.out]: j.qty }, true)
      else give((this.save.store ??= {}), { [j.out]: j.qty })
      give(this.save.stats.crafted, { [j.out]: j.qty })
      const f = this.furnaceSpots()[j.f ?? 0] ?? this.save.furnace
      if (f && this.save.here === 'home' && this.onSurface) {
        // "ding": it comes out glowing and flies to the bag
        const z = this.world.heightAt(f.x, f.y) + 4
        this.sfx('ding')
        this.scene.burst({ kind: 'spark', x: f.x, y: f.y + 8, z, n: 16, speed: 30, up: 40, life: 0.5, mode: 'spark' })
        this.drop({ [j.out]: j.qty }, f.x, f.y + 8, z)
        this.float(`+${j.qty} ${ITEMS[j.out].name}`, f.x, f.y, z + 4)
      } else this.toast($t('熔炉炼好了：{0}×{1}', ITEMS[j.out].name, j.qty))
      if (!this.save.milestones.ingot) {
        this.save.milestones.ingot = true
        this.celebrate(1, $t('第一块金属！'), $t('{0}：飞机和船的骨架要用它', ITEMS[j.out].name), j.out)
      }
      done = true
    }
    if (done) this.changed()
  }
  /** seconds until the furnace is empty */
  furnaceLeft(): number {
    const j = this.save.jobs
    return j.length ? Math.max(0, Math.max(...j.map((x) => x.doneAt)) - this.now()) : 0
  }

  // ── placing: one way to set anything down — a piece of furniture (outside or in the house), a
  // seed, the furnace. While something is in hand to set down, a see-through copy of it stands
  // where it would go, green where it fits and red where it does not. With a mouse it follows the
  // pointer and a click sets it down; with a finger a tap moves it there, and a second tap on the
  // same spot (or 放这里) sets it down.
  /** how a thing is set down: as a building, a piece of furniture, a seed — or not at all */
  placeKindOf(item: ItemId | null): 'building' | 'furniture' | 'plant' | null {
    if (!item) return null
    if (item === 'furnaceKit' || item === 'restaurantKit' || facilityOfKit(item)) return 'building'
    if (FURNITURE[item]) return 'furniture'
    if (PLANTS[item]) return 'plant'
    return null
  }
  /** the furnace kit as a placing (kept for the workbench's button) */
  get placing(): BuildingKind | null {
    return this.placingItem === 'furnaceKit' ? 'furnace' : null
  }
  startPlacing(kind: BuildingKind) {
    if (kind !== 'furnace') return
    if (this.furnaceFull()) return this.warn(this.furnaceFull())
    if (this.count('furnaceKit') < 1) return this.warn($t('先在工作台做一个熔炉套件'))
    this.startDecor('furnaceKit')
  }
  /** take a thing out of the bag to set it down */
  startDecor(item: ItemId) {
    const kind = this.placeKindOf(item)
    if (!kind || this.count(item) < 1) return
    if (this.house.active) {
      if (kind !== 'furniture' || !FURNITURE[item]!.indoor) return this.warn($t('{0}只能放在屋外', ITEMS[item].name))
    } else {
      if (!this.here.def.home) return this.warn($t('只能摆在自己的岛上'))
      if (kind === 'furniture' && FURNITURE[item]!.indoor) return this.warn($t('{0}是屋里用的：进屋再摆', ITEMS[item].name))
      if (item === 'furnaceKit' && this.furnaceFull()) return this.warn(this.furnaceFull())
    }
    if (this.placingItem !== item) this.ghost = null
    this.placingItem = item
    this.panel = null
    this.stopWalking()
    this.sfx('open')
    // the copy starts in front of the player, so there is something to see at once
    const p = this.pilot
    this.aimAt(p.x + Math.sin(p.yaw) * 16, p.y - Math.cos(p.yaw) * 16)
    this.changed()
  }
  /** move a piece already in the house (it is in the player's hands, not the bag) */
  startMove(item: ItemId) {
    if (this.placingItem !== item) this.ghost = null
    this.placingItem = item
    this.panel = null
    this.stopWalking()
    const p = this.pilot
    this.aimAt(p.x + Math.sin(p.yaw) * 16, p.y - Math.cos(p.yaw) * 16)
    this.changed()
  }
  /** placing without the help (the auto-snap off): just where the finger is, nudged a pixel at a time */
  freePlace = false
  /** nudge the copy a pixel (fine-tuning: turns the help off) */
  nudge(dx: number, dy: number) {
    const gh = this.ghost
    if (!gh) return
    this.freePlace = true
    this.aimAt(gh.x + dx, gh.y + dy)
    this.sfx('tap', 1.5)
  }
  /** where the copy stands, and whether the thing fits there (and indoors: its height, its turn, and why it settled there) */
  ghost: { x: number; y: number; ok: boolean; why: string; z?: number; rot?: number; hint?: string; /** only the slope is wrong: the shovel can level the whole patch (round 21) */ level?: number } | null = null
  private ghostActor: Actor | null = null
  /** the last pointer was a mouse (hover to aim, click to set down) or a finger */
  pointerKind: 'mouse' | 'touch' = 'touch'
  /** turn the piece about to be set down a quarter turn */
  rotatePlacing() {
    this.placingRot = (this.placingRot + 1) % 4
    this.sfx('tap', 1.2)
    if (this.ghost) this.aimAt(this.ghost.x, this.ghost.y)
    this.changed()
  }
  /** take the see-through copy away (the shovel put down, say) */
  clearGhost() {
    if (this.ghostActor) this.scene.removeActor(this.ghostActor)
    this.ghostActor = null
    this.shovelAim = null
  }
  cancelPlacing(quiet = false) {
    if (this.house.moving) this.house.cancelMove()
    if (!this.placingItem && !this.ghostActor) return
    this.placingItem = null
    this.ghost = null
    if (this.ghostActor) this.scene.removeActor(this.ghostActor)
    this.ghostActor = null
    if (!quiet) this.sfx('close')
    this.changed()
  }
  placeAtDefault() {
    if (this.placingItem !== 'furnaceKit') this.startPlacing('furnace')
    const s = this.here.furnaceSpot
    this.aimAt(s.x, s.y)
    this.placeHere()
  }
  /** would the thing in hand fit here? (world pixels) */
  checkPlace(item: ItemId, x: number, y: number): { ok: boolean; why: string } {
    const kind = this.placeKindOf(item)
    if (this.house.active) {
      const r = this.house.toRoom(x, y)
      return this.house.check(item, r.x, r.y, this.placingRot)
    }
    if (!this.here.def.home) return { ok: false, why: $t('只能放在自己的岛上') }
    if (this.world.isWater(x, y)) return { ok: false, why: $t('这里是水') }
    const flat = (hw: number) => canPlace(this.world, hw, hw, x, y)
    const why = (hw: number) => this.whyNot(x, y, hw)
    // a building: either it fits, or what is in the way is named, or only the slope is wrong and the
    // shovel can level the whole patch for it (round 21)
    const pad = (hw: number, hh: number): { ok: boolean; why: string; level?: number } => {
      if (canPlace(this.world, hw, hh, x, y)) return { ok: true, why: '' }
      const p = this.checkPad(x, y, hw, hh)
      return p.ok ? { ok: false, why: $t('地不平'), level: p.strokes } : { ok: false, why: p.why }
    }
    const fac = facilityOfKit(item)
    if (fac) { const F = FACILITIES[fac]; return this.estate.has(fac) ? { ok: false, why: $t('已经有一座{0}了', F.name) } : pad(F.hw, F.hh) }
    if (kind === 'building' && item === 'restaurantKit') return this.save.restaurant ? { ok: false, why: $t('已经有一座餐厅了') } : pad(15.5, 11.5)
    if (kind === 'building') return this.furnaceFull() ? { ok: false, why: this.furnaceFull() } : pad(7.5, 7.5)
    if (kind === 'plant') {
      if ((this.save.planted?.length ?? 0) >= MAX_PLANTS) return { ok: false, why: $t('岛上最多种 {0} 棵', MAX_PLANTS) }
      return flat(3) ? { ok: true, why: '' } : { ok: false, why: why(3) }
    }
    const f = FURNITURE[item]
    if (!f) return { ok: false, why: $t('这个摆不了') }
    return flat(f.solid) ? { ok: true, why: '' } : { ok: false, why: why(f.solid) }
  }
  /** what is in the way, in words */
  private whyNot(x: number, y: number, hw: number): string {
    const base = this.world.heightAt(x, y)
    let slope = false
    for (let yy = Math.round(y - hw) - 2; yy <= Math.round(y + hw) + 2; yy++) {
      for (let xx = Math.round(x - hw) - 2; xx <= Math.round(x + hw) + 2; xx++) {
        if (this.world.isWater(xx, yy)) return $t('挨着水了')
        if (this.world.solidAt(xx, yy)) return this.blockerAt(xx, yy)
        const m = this.world.matAt(xx, yy)
        if (m === 17 || m === 18 || m === 21 || m === 22 || m === 24) return $t('跑道和码头上不能放')
        if (this.world.heightAt(xx, yy) !== base) slope = true
      }
    }
    return slope ? $t('地不平：用铲子铲平') : $t('放不下')
  }
  /** move the copy to a spot (world pixels) and say whether it fits */
  aimAt(x: number, y: number) {
    const item = this.placingItem
    if (!item) return
    x = Math.round(x)
    y = Math.round(y)
    let r: { ok: boolean; why: string }
    let z = 0, rot = this.placingRot, hint = ''
    if (this.house.active) {
      // indoors the thing settles where it looks right (against the wall, lined up, on the table)
      const room = this.house.toRoom(x, y)
      const sn = this.house.snap(item, room.x, room.y, this.placingRot, this.freePlace)
      const w = this.house.toWorld(sn.x, sn.y)
      x = w.x; y = w.y; z = sn.z; rot = sn.rot; hint = sn.hint
      r = this.house.check(item, sn.x, sn.y, sn.rot, sn.z)
    } else r = this.checkPlace(item, x, y)
    const was = this.ghost
    this.ghost = { x, y, ok: r.ok, why: r.why, z, rot, hint, level: (r as { level?: number }).level }
    const news = !was || was.ok !== r.ok || was.why !== r.why || was.hint !== hint
    const kind = this.placeKindOf(item)
    const base = kind === 'building' ? (facilityOfKit(item) ? FACILITIES[facilityOfKit(item)!].model : (item === 'restaurantKit' ? 'restaurant' : 'furnace')) : kind === 'plant' ? 'sapling' : FURNITURE[item]!.model
    const name = this.scene.tinted(base, r.ok ? [90, 230, 120] : [240, 70, 60], 0.55)
    if (!this.ghostActor) this.ghostActor = this.scene.addActor(name, { x, y, z: 0, yaw: 0, shadow: false, fade: 0.72 })
    const a = this.ghostActor
    a.model = this.scene.models[name]
    a.x = x
    a.y = y
    a.z = this.house.active ? this.house.fz + z : this.world.heightAt(x, y)
    a.yaw = kind === 'furniture' ? (this.house.active ? this.house.yawOf(rot) : (rot * Math.PI) / 2) : 0
    a.visible = true
    if (news) this.changed()
  }
  /** a mouse over the picture while something is in hand to set down (or the shovel is) */
  hover(bx: number, by: number) {
    if (!this.placingItem && this.heldItem() !== 'shovel') return
    const hit = this.scene.pick(bx, by)
    if (!hit) return
    const at = this.toLocal(hit.x, hit.y)
    if (this.placingItem) this.aimAt(at.x, at.y)
    else this.aimShovel(at.x, at.y)
  }
  /** world pixels from a picked point (the world wraps: near the island the player is on) */
  private toLocal(hx: number, hy: number) {
    const o = this.mine.active ? this.def.under : this.here.plaza
    return { x: o.x + this.world.delta(hx, o.x), y: o.y + this.world.delta(hy, o.y) }
  }
  /** set the thing down where the copy stands */
  placeHere() {
    const item = this.placingItem
    const gh = this.ghost
    if (!item || !gh) return
    if (!gh.ok) return this.warn(gh.why || $t('这里放不下'))
    if (this.house.active && this.house.moving) {
      // a piece moved within the house: down in its new place
      const r = this.house.toRoom(gh.x, gh.y)
      this.house.dropMove(r.x, r.y, gh.rot ?? this.placingRot, gh.z ?? 0)
      this.sfx('place', 1.2)
      this.scene.burst({ kind: 'dust', x: gh.x, y: gh.y, z: 5 + (gh.z ?? 0), n: 8, speed: 12, up: 8, life: 0.5, mode: 'smoke', r: 3 })
      this.placingItem = null
      this.cancelPlacing(true)
      this.changed()
      return
    }
    if (this.count(item) < 1) return this.cancelPlacing()
    const kind = this.placeKindOf(item)
    if (this.house.active) {
      const r = this.house.toRoom(gh.x, gh.y)
      this.spend({ [item]: 1 })
      this.house.putNew(item, r.x, r.y, gh.rot ?? this.placingRot, gh.z ?? 0)
      this.sfx('place', 1.2)
      this.scene.burst({ kind: 'dust', x: gh.x, y: gh.y, z: 5 + (gh.z ?? 0), n: 10, speed: 14, up: 8, life: 0.6, mode: 'smoke', r: 3 })
    } else if (facilityOfKit(item)) this.buildFacility(facilityOfKit(item)!, gh.x, gh.y)
    else if (kind === 'building' && item === 'restaurantKit') this.buildRestaurant(gh.x, gh.y)
    else if (kind === 'building') this.placeAt(gh.x, gh.y)
    else if (kind === 'plant') this.plant(item, gh.x, gh.y)
    else this.placeFurniture(item, gh.x, gh.y)
    if (this.count(item) < 1 || !this.placingItem) this.cancelPlacing(true)
    else this.aimAt(gh.x, gh.y) // the spot is taken now: the copy turns red
    this.changed()
  }
  private buildFacility(f: FacilityId, x: number, y: number) {
    const lay = this.here
    if (!lay.def.home || this.estate.has(f)) return
    const F = FACILITIES[f]
    const b = placeBuilding(this.world, lay, f, F.model, x, y, 0, f)
    const prop = this.addBuildingProp(lay, b)
    prop.stretch = 0.4
    this.settling.push(prop)
    this.spend({ [F.kit]: 1 })
    this.estate.s.built[f] = { x, y }
    this.cancelPlacing(true)
    if (this.world.solidAt(Math.round(this.pilot.x), Math.round(this.pilot.y))) { this.pilot.x = b.door.x; this.pilot.y = b.door.y }
    this.sfx('place')
    this.scene.shake(2.4)
    this.scene.burst({ kind: 'dust', x, y, z: b.base + 1, n: 30, speed: 30, up: 8, life: 0.8, mode: 'smoke', r: 6 })
    this.celebrate(2, $t('{0}盖好了！', F.name), F.done, F.kit)
    this.changed()
  }
  private buildRestaurant(x: number, y: number) {
    const lay = this.here
    if (!lay.def.home || this.save.restaurant) return
    const b = placeBuilding(this.world, lay, 'restaurant', 'restaurant', x, y, 0, 'restaurant')
    const prop = this.addBuildingProp(lay, b)
    prop.stretch = 0.4
    this.settling.push(prop)
    this.spend({ restaurantKit: 1 })
    this.save.restaurant = { x, y }
    this.cancelPlacing(true)
    if (this.world.solidAt(Math.round(this.pilot.x), Math.round(this.pilot.y))) { this.pilot.x = b.door.x; this.pilot.y = b.door.y }
    this.sfx('place')
    this.scene.shake(2.4)
    this.scene.burst({ kind: 'dust', x, y, z: b.base + 1, n: 30, speed: 30, up: 8, life: 0.8, mode: 'smoke', r: 6 })
    this.celebrate(2, $t('餐厅开张了！'), $t('在这儿做饭；有人来送货，请他坐下吃一顿'), 'restaurantKit')
    this.changed()
  }
  private placeAt(x: number, y: number) {
    const lay = this.here
    if (!lay.def.home) return
    if (!canPlace(this.world, 7.5, 7.5, x, y)) {
      this.warn($t('这里放不下：要一块平整的空地'))
      return
    }
    const n = this.furnaceSpots().length
    const b = placeBuilding(this.world, lay, 'furnace', 'furnace', x, y, 0, n ? `furnace${n + 1}` : 'furnace')
    const prop = this.addBuildingProp(lay, b)
    prop.stretch = 0.4
    this.settling.push(prop)
    this.spend({ furnaceKit: 1 })
    if (!n) this.save.furnace = { x, y }
    else (this.save.furnaces2 ??= []).push({ x, y })
    this.cancelPlacing(true)
    // step out of the way if the pilot was standing there
    if (this.world.solidAt(Math.round(this.pilot.x), Math.round(this.pilot.y))) {
      this.pilot.x = b.door.x
      this.pilot.y = b.door.y
    }
    // it lands with a thump, in a ring of dust
    this.sfx('place')
    this.scene.shake(2.4)
    this.scene.burst({ kind: 'dust', x, y, z: b.base + 1, n: 26, speed: 26, up: 8, life: 0.8, mode: 'smoke', r: 4 })
    this.scene.burst({ kind: 'rock', x, y, z: b.base + 2, n: 12, speed: 30, up: 40, life: 0.7, r: 3 })
    if (n) this.celebrate(1, $t('第 {0} 座熔炉砌好了！', n + 1), $t('几座熔炉同时烧：放进去的会分到最快空出来的那座'), 'furnaceKit')
    else this.celebrate(1, $t('熔炉砌好了！'), $t('放进矿石和木材，就能炼出金属锭'), 'furnaceKit')
    this.changed()
  }

  // ── the shovel: level a patch of ground (and clear the twigs and pebbles off it)
  /** where the shovel would dig, and whether it can */
  shovelAim: { x: number; y: number; ok: boolean; why: string } | null = null
  private digJob: { x: number; y: number; t: number; strokes: number; bait?: ItemId; pad?: { rx: number; ry: number; h: number; n: number } } | null = null
  /** the shovel's swing, 0..1, while digging */
  get digSwing(): number | null {
    return this.digJob ? (this.digJob.t % 0.5) / 0.5 : null
  }
  /** can this patch be levelled? */
  checkShovel(x: number, y: number): { ok: boolean; why: string; h: number } {
    const R = SHOVEL_R
    if (!this.here.def.home || this.house.active || !this.onSurface) return { ok: false, why: $t('只能在自己岛上铲'), h: 0 }
    const hs: number[] = []
    for (let yy = y - R; yy <= y + R; yy++) {
      for (let xx = x - R; xx <= x + R; xx++) {
        if (this.world.isWater(xx, yy)) return { ok: false, why: $t('挨着水了'), h: 0 }
        const m = this.world.matAt(xx, yy)
        if (m >= 17 && m <= 24) return { ok: false, why: $t('路面、跑道和码头不用铲'), h: 0 }
        if (this.world.solidAt(xx, yy)) {
          if (this.smallThingAt(xx, yy)) continue
          return { ok: false, why: $t('有树、石头或别的东西挡着'), h: 0 }
        }
        hs.push(this.world.heightAt(xx, yy))
      }
    }
    if (!hs.length) return { ok: false, why: '', h: 0 }
    hs.sort((a, b) => a - b)
    if (hs[hs.length - 1] - hs[0] > 9) return { ok: false, why: $t('坡太陡了，铲不平'), h: 0 }
    if (hs[0] === hs[hs.length - 1]) return { ok: false, why: $t('这里已经是平的了'), h: hs[0] }
    return { ok: true, why: '', h: hs[Math.floor(hs.length / 2)] }
  }
  /** what a shovel turns up here, if anything: worms under grass, shrimp in wet sand by the water */
  baitUnder(x: number, y: number): ItemId | null {
    x = Math.round(x)
    y = Math.round(y)
    if (this.house.active || !this.onSurface || this.world.solidAt(x, y) || this.world.isWater(x, y)) return null
    const m = this.world.matAt(x, y)
    if (m === MAT.grass || m === MAT.grassDark || m === MAT.grassLight) return 'worm'
    if (m === MAT.sand || m === MAT.sandSpeck) return 'shrimp'
    return null
  }
  private smallThingAt(x: number, y: number) {
    return this.here.nodes.some((n) => !n.depleted && NODES[n.kind].tool === 'hand' && !NODES[n.kind].tall && Math.abs(n.x - x) <= 3 && Math.abs(n.y - y) <= 3)
  }
  aimShovel(x: number, y: number) {
    x = Math.round(x)
    y = Math.round(y)
    const r = this.checkShovel(x, y)
    const was = this.shovelAim
    this.shovelAim = { x, y, ok: r.ok, why: r.why }
    if (!was || was.ok !== r.ok || was.why !== r.why) this.changed()
    const name = this.scene.tinted('g_pad', r.ok ? [90, 230, 120] : [240, 70, 60], 0.6)
    if (!this.ghostActor) this.ghostActor = this.scene.addActor(name, { x, y, z: 0, yaw: 0, shadow: false, fade: 0.75 })
    const a = this.ghostActor
    a.model = this.scene.models[name]
    a.x = x
    a.y = y
    a.z = this.world.heightAt(x, y) + 0.5
    a.yaw = 0
    a.visible = true
  }
  /** a tap with the shovel in hand */
  shovelTap(x: number, y: number) {
    x = Math.round(x)
    y = Math.round(y)
    const r = this.checkShovel(x, y)
    this.aimShovel(x, y)
    // nothing to flatten: dig for bait instead (worms in the grass, shrimp in the sand)
    const bait = !r.ok ? this.baitUnder(x, y) : null
    if (bait) {
      return this.walkTo({ x, y: y + 4 }, 4, () => {
        this.face(Math.atan2(x - this.pilot.x, -(y - this.pilot.y)), 1)
        this.digJob = { x, y, t: 0, strokes: 0, bait }
      })
    }
    if (!r.ok) return this.warn(r.why)
    this.walkTo({ x, y: y + SHOVEL_R + 3 }, 4, () => {
      this.face(Math.atan2(x - this.pilot.x, -(y - this.pilot.y)), 1)
      this.digJob = { x, y, t: 0, strokes: 0 }
    })
  }
  private stepDig(dt: number) {
    const j = this.digJob
    if (!j) return
    const before = Math.floor(j.t / 0.5)
    j.t += dt
    this.pilot.stretch = 1 + 0.12 * Math.sin((j.t / 0.5) * Math.PI * 2)
    if (Math.floor(j.t / 0.5) > before) {
      if (!this.body.work('shovel')) { this.digJob = null; return }
      this.useTool('shovel')
      j.strokes++
      this.sfx('place', 1.7)
      this.scene.burst({ kind: 'dust', x: j.x, y: j.y, z: this.world.heightAt(j.x, j.y) + 2, n: 10, speed: 18, up: 16, life: 0.6, mode: 'smoke', r: 4 })
      if (j.bait && j.strokes >= 2) {
        // a little hole: three times in four there is something in it
        this.digJob = null
        this.pilot.stretch = 1
        if (this.rnd() < 0.75) {
          const n = 1 + (this.rnd() < 0.35 ? 1 : 0)
          this.receive({ [j.bait]: n })
          this.sfx('pick')
          this.float(`${ITEMS[j.bait].name} +${n}`, j.x, j.y, this.world.heightAt(j.x, j.y) + 10)
        } else this.float($t('什么也没有'), j.x, j.y, this.world.heightAt(j.x, j.y) + 10)
        return
      }
      if (j.pad) {
        // a big patch: dust over all of it, a stroke at a time, then level and set the thing down
        const { rx, ry } = j.pad
        this.scene.burst({ kind: 'dust', x: j.x - rx + this.rnd() * rx * 2, y: j.y - ry + this.rnd() * ry * 2, z: this.world.heightAt(j.x, j.y) + 2, n: 8, speed: 16, up: 14, life: 0.6, mode: 'smoke', r: 4 })
        if (j.strokes < j.pad.n) return
        this.digJob = null
        this.pilot.stretch = 1
        this.levelArea(j.x, j.y, rx, ry, j.pad.h)
        if (this.placingItem) { this.aimAt(j.x, j.y); if (this.ghost?.ok) this.placeHere() }
        this.changed()
        return
      }
      if (j.strokes >= 3) {
        this.digJob = null
        this.pilot.stretch = 1
        this.levelGround(j.x, j.y, true)
      }
    }
  }
  /** flatten the patch (and remember it, so it stays flat) */
  private levelGround(x: number, y: number, now: boolean) {
    const r = this.checkShovel(x, y)
    if (!r.ok && now) return this.warn(r.why)
    const h = r.h
    this.flatten(x, y, h)
    const lay = this.layouts.home
    ;(this.save.terrain ??= []).push({ dx: x - lay.plaza.x, dy: y - lay.plaza.y, h })
    // the twigs and pebbles on it come up with the earth
    const got: Bag = {}
    for (const n of lay.nodes) {
      const d = NODES[n.kind]
      if (n.depleted || d.tool !== 'hand' || d.tall || Math.abs(n.x - x) > SHOVEL_R + 2 || Math.abs(n.y - y) > SHOVEL_R + 2) continue
      this.setDepleted(n, true)
      this.save.nodes[n.id] = this.now() + d.regrow
      give(got, d.yield)
    }
    if (Object.keys(got).length) {
      this.receive(got)
      give(this.save.stats.gathered, got)
      this.float('+ ' + bagText(got), x, y, this.world.heightAt(x, y) + 10)
    }
    this.sfx('place', 1.3)
    this.scene.shake(1)
    this.float($t('铲平了'), x, y, this.world.heightAt(x, y) + 14)
    this.aimShovel(x, y)
    this.changed()
  }
  private flatten(x: number, y: number, h: number, rx = SHOVEL_R, ry = SHOVEL_R) {
    const W = rx * 2 + 1, H = ry * 2 + 1
    const st = { name: 'level', w: W, h: H, rise: new Uint8Array(W * H), mats: new Uint8Array(W * H).fill(255), solid: new Uint8Array(W * H) }
    for (let yy = 0; yy < H; yy++) {
      for (let xx = 0; xx < W; xx++) {
        const wx = x - rx + xx, wy = y - ry + yy
        if (this.world.isWater(wx, wy) || this.world.solidAt(wx, wy)) continue
        const m = this.world.matAt(wx, wy)
        if (m >= 17 && m <= 24) continue
        const o = yy * W + xx
        st.mats[o] = m === MAT.treeTop || m === MAT.tree || m === MAT.treeEdge ? MAT.grass : m
      }
    }
    this.world.place(st, x, y, h)
  }
  // ── levelling a whole building's patch (round 21)
  /** what stands at this cell, in words: a tree, a rock, a building */
  private blockerAt(x: number, y: number): string {
    const n = this.here.nodes.find((q) => !q.depleted && Math.abs(q.x - x) <= Math.max(3, q.hw / 0.36 / 2) && Math.abs(q.y - y) <= Math.max(3, q.hw / 0.36 / 2))
    if (n) { const d = NODES[n.kind]; return $t('有{0}挡着：先{1}掉', d.name, d.verb) }
    return $t('挨着别的建筑或摆设了')
  }
  /** can the shovel level the whole patch (hw × hh, with its border) for a building here? */
  checkPad(x: number, y: number, hw: number, hh: number): { ok: boolean; why: string; h: number; strokes: number } {
    x = Math.round(x); y = Math.round(y)
    const rx = Math.ceil(hw) + 2, ry = Math.ceil(hh) + 2
    const hs: number[] = []
    for (let yy = y - ry; yy <= y + ry; yy++) {
      for (let xx = x - rx; xx <= x + rx; xx++) {
        if (this.world.isWater(xx, yy)) return { ok: false, why: $t('挨着水了'), h: 0, strokes: 0 }
        const m = this.world.matAt(xx, yy)
        if (m === 17 || m === 18 || m === 21 || m === 22 || m === 24) return { ok: false, why: $t('跑道和码头上不能放'), h: 0, strokes: 0 }
        if (this.world.solidAt(xx, yy)) {
          if (this.smallThingAt(xx, yy)) continue
          return { ok: false, why: this.blockerAt(xx, yy), h: 0, strokes: 0 }
        }
        hs.push(this.world.heightAt(xx, yy))
      }
    }
    if (!hs.length) return { ok: false, why: $t('放不下'), h: 0, strokes: 0 }
    hs.sort((a, b) => a - b)
    if (hs[hs.length - 1] - hs[0] > 14) return { ok: false, why: $t('坡太陡了：换块平一点的地方'), h: 0, strokes: 0 }
    // a stroke of the shovel levels about one ordinary patch (11 × 11)
    const strokes = Math.max(1, Math.min(12, Math.ceil(((rx * 2 + 1) * (ry * 2 + 1)) / 121)))
    return { ok: true, why: '', h: hs[Math.floor(hs.length / 2)], strokes }
  }
  /** "铲平这块": walk over, dig the whole patch level (a stroke per ordinary patch), then set the thing down */
  levelForPlacing() {
    const item = this.placingItem
    const gh = this.ghost
    if (!item || !gh || !gh.level) return
    if (!this.count('shovel')) return this.warn($t('要一把铲子（工作台能做）'))
    const fp = this.footprintOf(item)
    if (!fp) return
    const p = this.checkPad(gh.x, gh.y, fp.hw, fp.hh)
    if (!p.ok) return this.warn(p.why)
    const need = p.strokes * this.body.effortOf('shovel')
    if (!this.body.tireless && this.body.energy < need) return this.warn($t('铲平这一大块要 {0} 体力，现在不够：先吃点东西', Math.ceil(need)))
    const { x, y } = gh
    this.walkTo({ x, y: y + fp.hh + 5 }, 6, () => {
      this.face(Math.atan2(x - this.pilot.x, -(y - this.pilot.y)), 1)
      this.digJob = { x, y, t: 0, strokes: 0, pad: { rx: Math.ceil(fp.hw) + 2, ry: Math.ceil(fp.hh) + 2, h: p.h, n: p.strokes } }
    }, true)
  }
  /** how much ground the thing in hand stands on, outdoors (null: it is not a building) */
  footprintOf(item: ItemId): { hw: number; hh: number } | null {
    const fac = facilityOfKit(item)
    if (fac) return { hw: FACILITIES[fac].hw, hh: FACILITIES[fac].hh }
    if (item === 'restaurantKit') return { hw: 15.5, hh: 11.5 }
    if (this.placeKindOf(item) === 'building') return { hw: 7.5, hh: 7.5 }
    return null
  }
  /** the whole patch levelled at once, remembered so it stays level */
  private levelArea(x: number, y: number, rx: number, ry: number, h: number) {
    this.flatten(x, y, h, rx, ry)
    const lay = this.layouts.home
    ;(this.save.terrain ??= []).push({ dx: x - lay.plaza.x, dy: y - lay.plaza.y, h, rx, ry })
    const got: Bag = {}
    for (const n of lay.nodes) {
      const d = NODES[n.kind]
      if (n.depleted || d.tool !== 'hand' || d.tall || Math.abs(n.x - x) > rx + 2 || Math.abs(n.y - y) > ry + 2) continue
      this.setDepleted(n, true)
      this.save.nodes[n.id] = this.now() + d.regrow
      give(got, d.yield)
    }
    if (Object.keys(got).length) { this.receive(got); give(this.save.stats.gathered, got) }
    this.sfx('place', 1.1)
    this.scene.shake(2)
    for (let i = 0; i < 6; i++) this.scene.burst({ kind: 'dust', x: x - rx + this.rnd() * rx * 2, y: y - ry + this.rnd() * ry * 2, z: h + 2, n: 6, speed: 14, up: 12, life: 0.7, mode: 'smoke', r: 4 })
    this.float($t('铲平了{0}', Object.keys(got).length ? ' · + ' + bagText(got) : ''), x, y, h + 18)
  }
  /** the ground the shovel has levelled, levelled again after the world is made */
  private applyTerrain() {
    const lay = this.layouts.home
    if (!lay) return
    const keep: NonNullable<Save['terrain']> = []
    for (const t of this.save.terrain ?? []) {
      const x = Math.round(lay.plaza.x + t.dx), y = Math.round(lay.plaza.y + t.dy)
      if (this.world.isWater(x, y)) continue
      this.flatten(x, y, t.h, t.rx ?? SHOVEL_R, t.ry ?? SHOVEL_R)
      keep.push(t)
    }
    this.save.terrain = keep.slice(-120)
  }

  // ── vehicles
  owns(type: VehicleId): boolean {
    return this.save.vehicles.some((v) => v.type === type)
  }
  /** how a vehicle flies, at its level and with its wear */
  vdef(v: { type: VehicleId; lv?: number; wear?: Wear }) {
    return vehicleDef(v.type, v.lv, v.wear)
  }
  /** can this hull be built here and now? (the reason if not) */
  buildBlock(type: VehicleId): string | null {
    const def = VEHICLES[type]
    if (def.planned) return $t('还在规划中')
    if (def.island > this.level) return $t('岛升到 {0} 级才造得了（更大的{1}）', def.island, def.kind === 'boat' ? $t('船坞') : $t('机库'))
    if (this.owns(type)) return def.kind === 'boat' ? $t('已经有一艘船了：在原来的基础上升级') : $t('已经有一架飞机了：在原来的基础上升级')
    return null
  }
  buildVehicle(type: VehicleId) {
    const def = VEHICLES[type]
    if (!this.isHome) return
    const block = this.buildBlock(type)
    if (block) return this.warn(block)
    if (!this.canPay(def.cost) || this.save.coins < HULLS[type].levels[0].coins) return this.warn($t('材料不够'))
    this.spend(def.cost)
    this.save.coins -= HULLS[type].levels[0].coins
    const v: OwnedVehicle = { id: 'v' + this.save.seq++, type, at: 'home', lv: def.lv, wear: { ...NEW_WEAR } }
    this.save.vehicles.push(v)
    if (def.kind === 'plane') this.save.activePlane = v.id
    this.save.stats.built++
    this.syncVehicles()
    const a = this.vehicleActors.get(v.id)
    this.panel = null
    if (a) {
      // it is put together in front of the player: the slices drop into place one by one (the
      // prototype's intro), each with a knock and a few sparks, and then the fanfare
      this.scene.stackUp(a)
      const beats = 9
      for (let i = 0; i < beats; i++) {
        this.after(0.12 + i * 0.13, () => {
          this.sfx('stack', 0.8 + i * 0.06)
          this.scene.burst({ kind: 'spark', x: a.x, y: a.y, z: a.z + 2 + i * 0.6, n: 4, speed: 26, up: 24, life: 0.3, mode: 'spark', r: 5 })
          this.scene.shake(0.6)
        })
      }
      this.after(0.12 + beats * 0.13 + 0.1, () => {
        const boat = def.kind === 'boat'
        this.sfx(boat ? 'splash' : 'place')
        this.scene.shake(2)
        this.scene.burst({ kind: boat ? 'water' : 'dust', x: a.x, y: a.y, z: boat ? 1 : a.z - def.rest + 1, n: 24, speed: 30, up: boat ? 40 : 8, life: 0.8, mode: boat ? 'chip' : 'smoke', r: 6 })
        const first = this.milestone(boat ? 'boat' : 'plane', boat ? $t('第一艘船：{0}！', def.name) : $t('第一架飞机：{0}！', def.name), $t('海的那一边，现在去得了了。点它就能出发'), boat ? 'cloth' : 'copperIngot')
        if (!first) this.celebrate(1, $t('{0} 造好了！', def.name), $t('点它就能出发'))
      })
    }
    this.changed()
  }
  /** what the next level up costs, and whether it can be had (null at the generation's end) */
  upgradeVehicleInfo(id: string) {
    const v = this.vehicle(id)
    if (!v) return null
    const cur = this.vdef(v)
    const next = nextLevel(v.type, cur.lv)
    if (!next) return { next: null, ok: false, why: $t('{0}是这一代能做到的最好了：再往上要造下一代的{1}', cur.name, cur.kind === 'boat' ? $t('船') : $t('飞机')) }
    const why = next.planned ? $t('还在规划中') : next.island > this.level ? $t('岛升到 {0} 级才行', next.island) : v.at !== this.save.here || !this.isHome ? $t('回家才能改装') : !this.canPay(next.cost) || this.save.coins < next.coins ? $t('材料或金币不够') : ''
    return { next, ok: !why, why }
  }
  /** a level up, in place: the same vehicle, rebuilt better (its paint and its wear come along; it is serviced while at it) */
  upgradeVehicle(id: string) {
    const info = this.upgradeVehicleInfo(id)
    const v = this.vehicle(id)
    if (!info || !v || !info.next) return this.warn(info?.why ?? '')
    if (!info.ok) return this.warn(info.why)
    const n = info.next
    this.spend(n.cost)
    this.save.coins -= n.coins
    v.lv = n.lv
    this.onlineDirty = true
    v.wear = { ...(v.wear ?? NEW_WEAR), engine: 1, hull: 1 }
    this.syncVehicles()
    const a = this.vehicleActors.get(id)
    this.panel = null
    if (a) {
      this.scene.stackUp(a)
      for (let i = 0; i < 6; i++) this.after(0.12 + i * 0.13, () => { this.sfx('stack', 0.9 + i * 0.06); this.scene.burst({ kind: 'spark', x: a.x, y: a.y, z: a.z + 3, n: 4, speed: 24, up: 24, life: 0.3, mode: 'spark', r: 5 }) })
    }
    this.after(1, () => this.celebrate(2, $t('改装好了：{0}（{1} 级）', n.name, n.lv), n.desc, 'copperIngot'))
    this.changed()
  }
  // ───────────────────────────────────────────────────────────── wear and repair
  /** what fixing a vehicle costs: engine and hull from materials at home, paint touched up with white */
  repairCost(id: string, abroad = !this.here.def.home): { cost: Bag; coins: number; parts: ('engine' | 'hull')[] } | null {
    const v = this.vehicle(id)
    if (!v) return null
    const w = v.wear ?? NEW_WEAR
    const def = this.vdef(v)
    const parts: ('engine' | 'hull')[] = []
    const cost: Bag = {}
    let coins = 0
    const lv = def.lv
    const metal: ItemId = lv >= 4 ? 'ironIngot' : 'copperIngot'
    const eng = 1 - w.engine, hull = 1 - w.hull
    if (eng > 0.04) {
      parts.push('engine')
      if (def.kind === 'plane') cost[metal] = (cost[metal] ?? 0) + Math.max(1, Math.round(eng * (1 + lv)))
      else cost.rope = (cost.rope ?? 0) + Math.max(1, Math.round(eng * (1 + lv)))
      coins += Math.round(eng * 30 * lv)
    }
    if (hull > 0.04) {
      parts.push('hull')
      cost.plank = (cost.plank ?? 0) + Math.max(1, Math.round(hull * (2 + lv * 1.5)))
      if (hull > 0.3) cost.cloth = (cost.cloth ?? 0) + Math.max(1, Math.round(hull * lv))
      coins += Math.round(hull * 40 * lv)
    }
    if (!parts.length) return { cost: {}, coins: 0, parts }
    // away from home there is no workshop of your own: the islanders do it, for coins only, dearer
    if (abroad) {
      let worth = coins
      for (const k in cost) worth += ITEMS[k as ItemId].value * (cost[k as ItemId] ?? 0)
      return { cost: {}, coins: Math.round(worth * 2), parts }
    }
    return { cost, coins, parts }
  }
  repairVehicle(id: string) {
    const v = this.vehicle(id)
    const r = this.repairCost(id)
    if (!v || !r || !r.parts.length) return
    if (this.save.coins < r.coins) return this.warn($t('修理要 {0} 金币', r.coins))
    if (!this.canPay(r.cost)) return this.warn($t('修理的材料不够：{0}', bagText(r.cost)))
    this.spend(r.cost)
    this.save.coins -= r.coins
    v.wear = { ...(v.wear ?? NEW_WEAR), engine: 1, hull: 1 }
    const a = this.vehicleActors.get(id)
    if (a) for (let i = 0; i < 4; i++) this.after(0.1 + i * 0.16, () => { this.sfx('craft', 0.9 + i * 0.05); this.scene.burst({ kind: i % 2 ? 'spark' : 'wood', x: a.x, y: a.y, z: a.z + 3, n: 5, speed: 22, up: 26, life: 0.4, mode: i % 2 ? 'spark' : undefined, r: 5 }) })
    this.toast($t('{0}修好了：引擎和船体都是新的', this.vdef(v).name))
    this.changed()
  }
  /** how the vehicle wears on a trip: km flown, and what happened on the way */
  wearVehicle(id: string, how: { km?: number; robbed?: boolean; chased?: boolean; squall?: number; hard?: boolean }) {
    const v = this.vehicle(id)
    if (!v) return
    const w = (v.wear ??= { ...NEW_WEAR })
    const def = this.vdef(v)
    const km = how.km ?? 0
    w.engine = Math.max(0, w.engine - km * 0.012 * (def.kind === 'boat' ? 0.7 : 1))
    let hull = 0
    if (how.robbed) hull += 0.3
    if (how.chased) hull += 0.08
    if (how.hard) hull += 0.05
    hull += (how.squall ?? 0) * 0.04
    // a sturdier hull (higher levels) takes the same knocks less hard
    w.hull = Math.max(0, w.hull - hull / Math.max(1, def.armor ?? 1))
    w.paint = Math.max(0, w.paint - 0.03 - (how.squall ?? 0) * 0.02 - (how.robbed ? 0.06 : 0))
  }
  /** a word after landing when something needs fixing */
  wearNote(id: string): string | null {
    const v = this.vehicle(id)
    if (!v?.wear) return null
    const w = v.wear
    const bits: string[] = []
    if (w.engine < 0.6) bits.push(this.vdef(v).kind === 'plane' ? $t('引擎旧了，飞不快') : $t('舵和缆绳松了，走不快'))
    if (w.hull < 0.6) bits.push(this.vdef(v).kind === 'plane' ? $t('机身有破洞，货舱装得少了') : $t('船体漏水，装得少了'))
    if (w.paint < 0.4) bits.push($t('漆掉得厉害'))
    return bits.length ? $t('{0}：回家修一修（机库 / 码头）', bits.join($t('，'))) : null
  }

  // ───────────────────────────────────────────────────────────── paint
  /** paint a vehicle: one dye for each colour the new paint uses that the old didn't; repainting also renews it */
  paintCost(id: string, p: Paint): Bag {
    const v = this.vehicle(id)
    const cost: Bag = {}
    if (!v) return cost
    const now = this.coloursIn(v.paint)
    const want = this.coloursIn(p)
    for (const i of want) if (!now.has(i) || (v.wear?.paint ?? 1) < 0.7) cost[DYES[i]] = (cost[DYES[i]] ?? 0) + 1
    // freshening the same paint takes a white to prime
    if (!Object.keys(cost).length && (v.wear?.paint ?? 1) < 0.95) cost.dyeWhite = 1
    return cost
  }
  private coloursIn(p?: Paint): Set<number> {
    const out = new Set<number>()
    if (!p) return out
    const near = (c?: [number, number, number]) => {
      if (!c) return
      let best = 0, bd = 1e9
      DESIGN_COLOURS.forEach((d, i) => { const e = (d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2 + (d[2] - c[2]) ** 2; if (e < bd) { bd = e; best = i } })
      out.add(best)
    }
    near(p.body); near(p.accent); near(p.cloth)
    for (const ch of p.design ?? '') if (ch >= '0' && ch <= '7') out.add(Number(ch))
    return out
  }
  paintVehicle(id: string, p: Paint) {
    const v = this.vehicle(id)
    if (!v) return
    if (!this.here.def.home) return this.warn($t('涂装只能在自己岛上的机库 / 码头做'))
    const cost = this.paintCost(id, p)
    if (!this.canPay(cost)) return this.warn($t('颜料不够：{0}（工作台的“颜料”页）', bagText(cost)))
    this.spend(cost)
    v.paint = JSON.parse(JSON.stringify(p))
    this.onlineDirty = true
    v.wear = { ...(v.wear ?? NEW_WEAR), paint: 1 }
    this.syncVehicles()
    const a = this.vehicleActors.get(id)
    if (a) {
      this.scene.stackUp(a)
      this.scene.burst({ kind: 'heart', x: a.x, y: a.y, z: a.z + 8, n: 6, speed: 16, up: 30, life: 0.9, r: 6 })
    }
    this.sfx('stack')
    this.toast($t('{0}换了新涂装', this.vdef(v).name))
    this.save.stats.painted = (this.save.stats.painted ?? 0) + 1
    this.changed()
  }

  // ───────────────────────────────────────────────────────────── tools wear out
  /** uses left in a tool, and how many it had new */
  toolLife(id: ItemId): { left: number; max: number } | null {
    const max = TOOL_USES[id]
    if (!max) return null
    return { left: Math.min(max, this.save.tools?.[id] ?? max), max }
  }
  /** the tool of a kind the player is using now (the best one carried) */
  toolInHand(kind: 'axe' | 'pick'): ItemId | null {
    const t = toolTier(this.save.inv, kind)
    return t ? TOOLS[kind][t - 1] : null
  }
  /** one use of a tool: it gets a little more worn, and in the end it breaks */
  useTool(id: ItemId | null) {
    if (!id) return
    const life = this.toolLife(id)
    if (!life) return
    const left = life.left - 1
    const tools = (this.save.tools ??= {})
    if (left > 0) {
      tools[id] = left
      if (left === Math.ceil(life.max * 0.12)) this.toast($t('{0}快坏了', ITEMS[id].name), true)
      return
    }
    // broken
    delete tools[id]
    if ((this.save.inv[id] ?? 0) > 0) this.save.inv[id]! -= 1
    else if ((this.save.store?.[id] ?? 0) > 0) this.save.store![id]! -= 1
    const p = this.pilot
    this.sfx('error')
    this.scene.burst({ kind: /Pick|Axe/.test(id) && !id.startsWith('stone') ? 'spark' : 'wood', x: p.x, y: p.y, z: p.z + 8, n: 10, speed: 26, up: 30, life: 0.6 })
    this.scene.shake(1.4)
    this.toast($t('{0}坏了', ITEMS[id].name), true)
    this.save.stats.broken = (this.save.stats.broken ?? 0) + 1
    this.changed()
  }
  /** mend a tool at the workbench */
  mendTool(id: ItemId) {
    const cost = TOOL_MEND[id]
    const life = this.toolLife(id)
    if (!cost || !life || life.left >= life.max) return
    if (!this.canPay(cost)) return this.warn($t('修理的材料不够：{0}', bagText(cost)))
    this.spend(cost)
    delete this.save.tools![id]
    this.sfx('craft')
    this.toast($t('{0}修好了', ITEMS[id].name))
    this.changed()
  }
  /** the tools that could do with mending */
  get wornTools(): ItemId[] {
    return (Object.keys(TOOL_USES) as ItemId[]).filter((t) => this.count(t) > 0 && (this.toolLife(t)!.left < this.toolLife(t)!.max))
  }

  /** take an old vehicle apart: half of what its first level cost comes back (the market for whole craft comes with level 10) */
  scrapInfo(id: string): { ok: boolean; why: string; back: Bag } {
    const v = this.vehicle(id)
    if (!v) return { ok: false, why: '', back: {} }
    const def = this.vdef(v)
    const back: Bag = {}
    for (const [k, n] of Object.entries(HULLS[v.type].levels[0].cost)) back[k as ItemId] = Math.floor((n ?? 0) / 2)
    const others = this.save.vehicles.filter((o) => o.id !== v.id && this.vdef(o).kind === def.kind)
    const why = !this.isHome || v.at !== this.save.here ? $t('回家才能拆') : !others.length ? $t('这是你唯一的一{0}', def.kind === 'boat' ? $t('艘船') : $t('架飞机')) : ''
    return { ok: !why, why, back }
  }
  scrapVehicle(id: string) {
    const info = this.scrapInfo(id)
    const v = this.vehicle(id)
    if (!v || !info.ok) return this.warn(info.why)
    const name = this.vdef(v).name
    this.save.vehicles = this.save.vehicles.filter((o) => o.id !== id)
    if (this.save.activePlane === id) this.save.activePlane = this.save.vehicles.find((o) => this.vdef(o).kind === 'plane')?.id ?? null
    give((this.save.store ??= {}), info.back)
    this.syncVehicles()
    this.sfx('craft', 0.7)
    this.toast($t('拆了{0}：{1} 放进了仓库', name, bagText(info.back)))
    this.changed()
  }

  /** roll another plane out of the hangar onto the runway */
  rollOut(id: string) {
    const v = this.vehicle(id)
    if (!v || this.vdef(v).kind !== 'plane' || v.at !== this.save.here) return
    this.save.activePlane = id
    this.syncVehicles()
    this.sfx('stack')
    this.changed()
  }
  /** the actors for the vehicles parked on this island */
  /**
   * The model a vehicle is drawn with: its hull at its level, in its own paint, as worn as the
   * paint is (made when any of that changes, and kept). Returns the model's name.
   */
  craftModel(v: OwnedVehicle, manned: boolean): string {
    const def = this.vdef(v)
    const fade = Math.round((1 - (v.wear?.paint ?? 1)) * 10) / 10
    const name = `veh_${v.id}${manned ? '_m' : ''}`
    const key = def.model + JSON.stringify(v.paint ?? {}) + fade + (manned ? JSON.stringify(this.save.look ?? '') : '')
    if (this.craftKeys.get(name) === key && this.scene.models[name]) return name
    const m = craftModel(def.model, name, v.paint, fade, manned, this.save.look)
    if (!m) return this.scene.models[def.model + (manned ? '_m' : '')] ? def.model + (manned ? '_m' : '') : def.model
    this.scene.registerModel(m)
    this.craftKeys.set(name, key)
    return name
  }
  private craftKeys = new Map<string, string>()
  syncVehicles() {
    for (const a of this.vehicleActors.values()) this.scene.removeActor(a)
    this.vehicleActors.clear()
    const lay = this.here
    for (const v of this.save.vehicles) {
      if (v.at !== lay.def.id) continue
      const def = this.vdef(v)
      if (def.kind === 'plane' && this.save.activePlane !== v.id) continue
      const site = def.kind === 'plane' ? lay.runwayStart : lay.berth
      const ground = def.kind === 'plane' ? this.world.heightAt(site.x, site.y) : 0
      const a = this.scene.addActor(this.craftModel(v, false), { x: site.x, y: site.y, z: ground + def.rest * def.scale, yaw: site.yaw, scale: def.scale })
      this.vehicleActors.set(v.id, a)
    }
  }
  private goBoard(id: string) {
    const v = this.vehicle(id)
    const a = this.vehicleActors.get(id)
    if (!v || !a) return
    const lay = this.here
    const to = this.vdef(v).kind === 'plane' ? lay.boardAt : lay.buildings.find((b) => b.kind === 'pier')!.door
    this.walkTo(to, 2, () => this.open({ kind: 'depart', vehicleId: id }))
  }

  // ───────────────────────────────────────────────────────────── the market
  /** the plane the airship would take along from where it stands: the one last flown, else the biggest */
  cradleFor(ship: OwnedVehicle): OwnedVehicle | undefined {
    const here = this.save.vehicles.filter((x) => x.id !== ship.id && x.at === ship.at && x.type !== 'airship' && this.vdef(x).kind === 'plane')
    return here.find((x) => x.id === this.save.activePlane) ?? here.sort((a, b) => this.vdef(b).cargo - this.vdef(a).cargo)[0]
  }
  /** the most any vehicle the player owns can carry, sound (6 before there is one: the first plane's hold) */
  maxHold(): number {
    const vs = this.save.vehicles ?? []
    if (!vs.length) return 6
    return Math.max(...vs.map((v) => this.vdef({ type: v.type, lv: v.lv }).cargo))
  }
  /** which of your vehicles would carry this much (the smallest that does), or what it would take */
  fitFor(qty: number): string {
    const vs = (this.save.vehicles ?? []).map((v) => ({ v, d: this.vdef({ type: v.type, lv: v.lv }) })).filter((x) => x.d.cargo >= qty).sort((a, b) => a.d.cargo - b.d.cargo)
    return vs.length ? $t('用{0}（货舱 {1}）一趟送完', vs[0].d.name, vs[0].d.cargo) : $t('要货舱 {0} 格以上的载具', qty)
  }
  /** why an order cannot be taken, or '' */
  orderBlock(o: { qty: number }): string {
    const hold = this.maxHold()
    return o.qty > hold ? $t('装不下：你最大的货舱只有 {0} 格', hold) : ''
  }
  acceptOrder(id: string) {
    const o = this.orders.find((x) => x.id === id)
    const why = o ? this.orderBlock(o) : ''
    if (why) return Promise.resolve(this.warn(why))
    return this.act(async () => {
      const d = await this.backend.accept(id)
      this.save.stats.accepted++
      // an order to forward: the goods are handed over at your pier
      if (o?.relay) { this.receive({ [d.item]: d.qty }); this.save.stats.relayed = (this.save.stats.relayed ?? 0) + 1 }
      this.sfx('stamp')
      this.toast($t('接单：把 {0}×{1} 送到{2}', ITEMS[d.item].name, d.qty, this.islandName(d.dest)))
    })
  }
  postSell(item: ItemId, qty: number, price: number) {
    return this.act(async () => {
      if (qty < 1 || this.count(item) < qty) throw new Error($t('存货不够'))
      this.spend({ [item]: qty }) // set aside until it is delivered
      await this.backend.postSell(item, qty, Math.max(1, Math.round(price)))
      this.save.stats.posted++
      this.sfx('paper')
      this.toast($t('挂单：{0}×{1}，要价 {2}', ITEMS[item].name, qty, Math.round(price)))
    })
  }
  /** online: ask other players for goods. The price is set aside now and paid when they arrive. */
  postBuy(item: ItemId, qty: number, price: number) {
    return this.act(async () => {
      price = Math.max(1, Math.round(price))
      if (!this.backend.postBuy) throw new Error($t('单机时没有别的玩家可以接单'))
      if (qty < 1) throw new Error($t('至少要一件'))
      if (this.save.coins < price) throw new Error($t('金币不够付这张单'))
      await this.backend.postBuy(item, qty, price, this.now())
      this.save.coins -= price
      this.save.stats.posted++
      this.sfx('paper')
      this.toast($t('求购：{0}×{1}', ITEMS[item].name, qty))
    })
  }
  cancelBuy(id: string) {
    return this.act(async () => {
      if (!this.backend.cancelBuy) return
      const back = await this.backend.cancelBuy(id)
      this.save.coins += back
      this.sfx('paper', 0.8)
      this.toast($t('撤单：退回 {0} 金币', back))
    })
  }
  cancelSell(id: string) {
    return this.act(async () => {
      const o = this.orders.find((x) => x.id === id)
      await this.backend.cancelSell(id)
      if (o) this.receive({ [o.item]: o.qty })
      this.sfx('paper', 0.8)
    })
  }
  abandon(id: string) {
    return this.act(async () => {
      const d = await this.backend.abandon(id)
      // goods that were on board, or set aside for a sale, go back into stock
      if (d.state === 'loaded' || d.source === 'sell') this.receive({ [d.item]: d.qty })
      this.sfx('paper', 0.7)
      this.toast($t('已放弃这张送货单'))
    })
  }
  /**
   * Barter with an islander: their specialty for something they want, no coins. They value what
   * they want a quarter above what it is worth (they need it), so a fair swap is a good one.
   */
  barterOffer(item: ItemId): { pay: ItemId; n: number } | null {
    const line = this.shop.find((l) => l.item === item)
    if (!line || line.stock < 1) return null
    let best: { pay: ItemId; n: number } | null = null
    for (const w of this.here.def.wants) {
      if (!ITEMS[w] || ITEMS[w].kind === 'furniture') continue
      const n = Math.max(1, Math.ceil(line.price / (ITEMS[w].value * 1.25)))
      if (this.count(w) < n) continue
      if (!best || n * ITEMS[w].value < best.n * ITEMS[best.pay].value) best = { pay: w, n }
    }
    return best
  }
  barter(item: ItemId) {
    return this.act(async () => {
      const o = this.barterOffer(item)
      if (!o) throw new Error($t('没有对方想要的东西可换'))
      if (!this.fits({ [item]: 1 })) throw new Error($t('口袋装不下'))
      await this.backend.buy(this.save.here, item, 1)
      this.spend({ [o.pay]: o.n })
      this.receive({ [item]: 1 })
      this.sfx('buy')
      const who = this.owners[this.save.here]
      if (who) {
        who.stretch = 0.7
        this.settling.push(who)
      }
      this.toast($t('以物易物：{0}×{1} 换 {2}×1', ITEMS[o.pay].name, o.n, ITEMS[item].name))
      const b = this.here.buildings.find((x) => x.kind === 'board')
      if (b) this.drop({ [item]: 1 }, b.x, b.y, b.base + b.rise)
    })
  }
  shopBuy(item: ItemId, qty: number) {
    return this.act(async () => {
      const line = this.shop.find((l) => l.item === item)
      if (!line) return
      if (this.save.coins < line.price * qty) throw new Error($t('金币不够'))
      if (!this.fits({ [item]: qty })) throw new Error($t('口袋装不下 {0} 件{1}', qty, ITEMS[item].name))
      const cost = await this.backend.buy(this.save.here, item, qty)
      this.save.coins -= cost
      this.receive({ [item]: qty })
      this.sfx('buy')
      const b = this.here.buildings.find((x) => x.kind === 'board')
      if (b) this.drop({ [item]: qty }, b.x, b.y, b.base + b.rise)
    })
  }

  // ───────────────────────────────────────────────────────────── departing, flying, landing
  /** what a vehicle would carry to an island: the deliveries that fit and can be filled */
  loadPlan(vehicleId: string, dest: string): { d: Delivery; ok: boolean; why: string }[] {
    const v = this.vehicle(vehicleId)
    if (!v) return []
    let room = this.vdef(v).cargo
    for (const d of this.deliveries) if (d.state === 'loaded') room -= d.qty
    const stock: Bag = { ...this.save.inv }
    if (this.atHome) give(stock, this.save.store ?? {}) // (loading at home: from the warehouse too)
    const out: { d: Delivery; ok: boolean; why: string }[] = []
    for (const d of this.deliveries) {
      if (d.dest !== dest || d.state === 'done') continue
      if (d.state === 'loaded') {
        out.push({ d, ok: true, why: $t('已在货舱') })
        continue
      }
      if (d.qty > room) {
        out.push({ d, ok: false, why: $t('货舱装不下（还剩 {0} 格）', room) })
        continue
      }
      if (d.source === 'buy' && (stock[d.item] ?? 0) < d.qty) {
        out.push({ d, ok: false, why: $t('缺 {0} {1}', ITEMS[d.item].name, d.qty - (stock[d.item] ?? 0)) })
        continue
      }
      if (d.source === 'buy') stock[d.item] = (stock[d.item] ?? 0) - d.qty
      room -= d.qty
      out.push({ d, ok: true, why: $t('装货') })
    }
    return out
  }
  cargoText(): string {
    const loaded = this.deliveries.filter((d) => d.state === 'loaded')
    return loaded.length ? loaded.map((d) => `${ITEMS[d.item].name}×${d.qty}`).join($t('、')) : $t('空舱')
  }

  async depart(vehicleId: string, dest: string | null) {
    const v = this.vehicle(vehicleId)
    const a = this.vehicleActors.get(vehicleId)
    if (!v || !a || this.mode !== 'island') return
    const def = this.vdef(v)
    const lay = this.here
    // load what is going there
    if (dest) {
      const now = this.now()
      for (const line of this.loadPlan(vehicleId, dest)) {
        if (!line.ok || line.d.state === 'loaded') continue
        if (line.d.source === 'buy') this.spend({ [line.d.item]: line.d.qty })
        await this.backend.markLoaded(line.d.id, now)
      }
      this.deliveries = (await this.backend.deliveries()).filter((d) => !this.estate.isCourier(d.id))
    }
    this.stopWalking()
    this.panel = null
    this.pilot.visible = false
    this.life.clear()
    this.pets.clear()
    this.voyage.begin(v, lay, dest ? this.layouts[dest] : null)
    this.combat.begin()
    // the pilot climbs aboard: the craft is drawn with somebody in it
    a.model = this.scene.models[this.craftModel(v, true)]
    this.scene.setLead(a)
    a.trails = true
    a.flames = def.flames
    a.trailLen = 0
    this.scene.setMode('flight')
    this.cancelPlacing(true)
    this.clearGhost()
    this.mode = 'flight'
    // the airship takes a plane parked here along in its cradle
    const carry = v.type === 'airship' ? this.cradleFor(v) : undefined
    this.flight = { vehicleId, from: lay.def.id, dest, phase: 'takeoff', t: 0, canLand: null, carry: carry?.id }
    if (carry) { const ca = this.vehicleActors.get(carry.id); if (ca) ca.visible = false; this.toast($t('{0}挂进了飞艇的吊舱', this.vdef(carry).name)) }
    this.setMarker(dest)
    this.sfx(def.kind === 'plane' ? 'whoosh' : 'splash', 0.8)
    const cruise = () => {
      if (this.flight) this.flight.phase = 'cruise'
      // wheels up (or clear of the harbour): a rising chime
      this.sfx('ring')
      this.changed()
    }
    if (def.kind === 'plane') {
      this.scene.runPath({
        x1: lay.runwayEnd.x, y1: lay.runwayEnd.y, yaw1: lay.runwayStart.yaw, z1: a.z + 9,
        ease: 'in', level: true, zFrom: 0.72, thenAlt: def.flight.altitude, onDone: cruise,
      })
    } else {
      this.scene.runPath({ x1: lay.seaward.x, y1: lay.seaward.y, yaw1: lay.berth.yaw, z1: a.z, ease: 'in', onDone: cruise })
    }
    this.changed()
  }
  setMarker(dest: string | null) {
    this.scene.markers.length = 0
    if (!dest) return
    const lay = this.layouts[dest]
    const v = this.flight ? this.vehicle(this.flight.vehicleId) : undefined
    const boat = v && this.vdef(v).kind === 'boat'
    const at = boat ? lay.berth : { x: (lay.runwayStart.x + lay.runwayEnd.x) / 2, y: (lay.runwayStart.y + lay.runwayEnd.y) / 2 }
    this.scene.markers.push({ x: at.x, y: at.y, z: boat ? 2 : this.world.heightAt(at.x, at.y) + 4, on: true })
  }

  private stepFlight(dt: number) {
    const f = this.flight
    const a = this.scene.lead
    if (!f || !a) return
    f.t += dt
    if (f.phase !== 'cruise') {
      f.canLand = null
      // dust off the strip on the take-off run and the roll-out; spray from a hull
      this.dustT -= dt
      const v0 = this.vehicle(f.vehicleId)!
      const d0 = this.vdef(v0)
      if (this.dustT <= 0 && this.scene.speed > 6) {
        this.dustT = 0.06
        const g = this.world.heightAt(Math.round(a.x), Math.round(a.y))
        if (d0.kind === 'boat') this.scene.burst({ kind: 'water', x: a.x, y: a.y, z: 1, n: 2, speed: 12, up: 14, life: 0.5, r: 3 })
        else if (a.z - d0.rest - g < 2.5) this.scene.burst({ kind: 'dust', x: a.x - Math.sin(a.yaw) * 6, y: a.y + Math.cos(a.yaw) * 6, z: g + 1, n: 2, speed: 8, up: 6, life: 0.7, mode: 'smoke', r: 2 })
      }
      return
    }
    this.voyage.step(dt, this.vehicle(f.vehicleId)!, f.dest ? this.layouts[f.dest] : null)
    // the thrusters coming on and a roll each have their rush of air
    const boosting = this.scene.boost > 0.45
    if (boosting && !this.wasBoosting) this.sfx('whoosh', 1.25, 0.7)
    this.wasBoosting = boosting
    const rolling = a.stunt >= 0
    if (rolling && !this.wasRolling) this.sfx('whoosh', 1.6, 0.8)
    this.wasRolling = rolling
    // which island can be landed on from here?
    const v = this.vehicle(f.vehicleId)!
    const boat = this.vdef(v).kind === 'boat'
    let best: string | null = null
    let bestD = boat ? BOAT_RANGE : PLANE_RANGE
    for (const id in this.layouts) {
      if (!this.known(id)) continue // fog: no runway to be seen
      // not straight back onto the island it has just left (unless that is where it is going)
      if (id === f.from && id !== f.dest && f.t < 14) continue
      const lay = this.layouts[id]
      const d = this.dist(a, boat ? lay.berth : lay.runwayEnd)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    if (best !== f.canLand) {
      f.canLand = best
      if (best) this.sfx('beep')
      this.changed()
    }
  }
  /** numbers for the flight display */
  hud(): FlightHud | null {
    const f = this.flight
    const a = this.scene.lead
    if (!f || !a) return null
    const v = this.vehicle(f.vehicleId)!
    let dist = 0
    let bearing = 0
    if (f.dest) {
      const lay = this.layouts[f.dest]
      const to = this.vdef(v).kind === 'boat' ? lay.berth : lay.runwayEnd
      const dx = this.world.delta(to.x, a.x)
      const dy = this.world.delta(to.y, a.y)
      dist = Math.hypot(dx, dy)
      const h = this.scene.heading
      bearing = Math.atan2(dx * Math.cos(h) - dy * Math.sin(h), -dx * Math.sin(h) - dy * Math.cos(h))
    }
    return {
      vehicle: this.vdef(v).name, dest: f.dest ? this.islandName(f.dest) : null, dist, bearing,
      canLand: f.canLand ? this.islandName(f.canLand) : null, phase: f.phase, cargo: this.cargoText(), seconds: f.t,
      voyage: this.voyage.view(v, f.dest ? this.layouts[f.dest] : null),
    }
  }

  /** bring the vehicle in to the island it is near */
  /** the catch to boast of: the longest fish in the record book */
  bestCatch(): { item: ItemId; cm: number; day: number } | null {
    const r = Object.entries(this.save.records ?? {}).sort((a, b) => (b[1]?.cm ?? 0) - (a[1]?.cm ?? 0))[0]
    return r && r[1] ? { item: r[0] as ItemId, cm: r[1].cm, day: r[1].day } : null
  }
  // ── fishing from the boat (round 18): drop the anchor anywhere at sea, cast over the side
  anchored = false
  /** on a boat, under way, a rod aboard */
  canAnchor(): boolean {
    const f = this.flight
    const v = f ? this.vehicle(f.vehicleId) : null
    return this.mode === 'flight' && !!f && f.phase === 'cruise' && !!v && this.vdef(v).kind === 'boat' && this.carried('rod') > 0 && !this.voyage.chased
  }
  dropAnchor() {
    if (!this.canAnchor() || this.anchored) return
    this.anchored = true
    this.scene.setAnchor(true)
    this.sfx('plop', 0.6)
    this.toast(this.fishing.farOut(this.scene.lead!.x, this.scene.lead!.y) ? $t('抛锚了。这里是远海的深水：大鱼多') : $t('抛锚了。近海：再往外开，大鱼更多'))
    this.changed()
  }
  weighAnchor() {
    if (!this.anchored) return
    this.fishing.cancel()
    this.anchored = false
    this.scene.setAnchor(false)
    this.sfx('whoosh', 0.8, 0.5)
    this.changed()
  }
  /** the creel emptied: into the bag and the warehouse */
  emptyCreel() {
    const c = this.save.creel ?? []
    if (!c.length) return
    const got: Bag = {}
    for (const f of c) got[f.item] = (got[f.item] ?? 0) + 1
    this.receive(got)
    this.save.creel = []
    this.sfx('pick')
    this.toast($t('鱼筐里的 {0} 条鱼收好了', c.length))
    this.changed()
  }
  land() {
    const f = this.flight
    const a = this.scene.lead
    if (!f || !a || f.phase !== 'cruise') return
    if (this.fishing.phase === 'reel' || this.fishing.phase === 'land') return this.warn($t('先把这条鱼拉上来'))
    this.weighAnchor()
    if (!f.canLand) return this.warn($t('离岛太远了，飞近一点再降落'))
    const island = f.canLand
    const lay = this.layouts[island]
    const v = this.vehicle(f.vehicleId)!
    const def = this.vdef(v)
    const done = () => void this.arrive(island)
    if (def.kind === 'boat' && !this.scene.pathOverWater(lay.berth.x, lay.berth.y, lay.berth.yaw + Math.PI, undefined)) return this.warn($t('从海面上正对码头再靠岸'))
    this.voyage.judge(v, lay)
    const who = this.owners[island]
    if (who && this.deliveries.some((d) => d.state === 'loaded' && d.dest === island)) {
      const at = def.kind === 'plane' ? lay.greetAt : lay.buildings.find((b) => b.kind === 'pier')!.door
      who.x = at.x
      who.y = at.y
      who.z = this.world.heightAt(at.x, at.y)
      const w = this.wander.get(island)
      if (w) { w.to = null; w.hold = this.clock + 25 }
    }
    if (def.kind === 'plane') {
      const rest = this.world.heightAt(lay.runwayStart.x, lay.runwayStart.y) + def.rest * def.scale
      const out = lay.runwayStart.yaw
      const back = out + Math.PI
      f.phase = 'landing'
      // down to the far end of the strip, roll out to the near end, turn round ready to leave
      this.sfx('beep', 1.2)
      this.scene.runPath({
        x1: lay.runwayEnd.x, y1: lay.runwayEnd.y, yaw1: back, z1: rest + 1.2, ease: 'linear', zFrom: 0.2,
        onDone: () => (this.touchdown(lay.runwayEnd.x, lay.runwayEnd.y, false), this.scene.runPath({
          x1: lay.runwayStart.x, y1: lay.runwayStart.y, yaw1: back, z1: rest, ease: 'out', level: true, idle: true,
          onDone: () => this.scene.runPath({
            kind: 'turn', x1: lay.runwayStart.x, y1: lay.runwayStart.y, yaw1: out, z1: rest, duration: 1.3, level: true, idle: true, onDone: done,
          }),
        })),
      })
    } else {
      const inYaw = lay.berth.yaw + Math.PI
      f.phase = 'landing'
      this.sfx('beep', 1.2)
      this.scene.runPath({
        x1: lay.berth.x, y1: lay.berth.y, yaw1: inYaw, z1: def.rest, ease: 'out',
        onDone: () => (this.touchdown(lay.berth.x, lay.berth.y, true), this.scene.runPath({
          kind: 'turn', x1: lay.berth.x, y1: lay.berth.y, yaw1: lay.berth.yaw, z1: def.rest, duration: 1.8, level: true, onDone: done,
        })),
      })
    }
    this.changed()
  }

  /** the wheels meet the strip, or the hull the pier */
  private touchdown(x: number, y: number, boat: boolean) {
    this.sfx(boat ? 'splash' : 'land')
    this.scene.shake(boat ? 1.4 : 2.6)
    if (boat) this.scene.burst({ kind: 'water', x, y, z: 1, n: 20, speed: 24, up: 30, life: 0.7, r: 5 })
    else this.scene.burst({ kind: 'dust', x, y, z: this.world.heightAt(Math.round(x), Math.round(y)) + 1, n: 16, speed: 22, up: 8, life: 0.8, mode: 'smoke', r: 4 })
  }
  /** home without landing (shot down: nobody hurt, the plane brought back) */
  comeHome(island: string) {
    return this.arrive(island)
  }
  /** take off for a sortie against the sky pirates */
  async sortie(vehicleId: string, sea: SeaId) {
    const v = this.vehicle(vehicleId)
    if (!v || !v.up?.includes('guns')) return this.warn($t('要先在机库给飞机装上武器挂架'))
    if (this.level < 5) return this.warn($t('岛 5 级才能出击'))
    await this.depart(vehicleId, null)
    this.combat.startSortie(sea)
  }
  private async arrive(island: string) {
    this.fishing.populate(this.layouts[island])
    const f = this.flight
    if (!f) return
    const v = this.vehicle(f.vehicleId)!
    const def = this.vdef(v)
    const lay = this.layouts[island]
    v.at = island
    const carried = f.carry ? this.vehicle(f.carry) : undefined
    if (carried) carried.at = island
    this.save.here = island
    this.flight = null
    this.mode = 'island'
    this.scene.markers.length = 0
    this.scene.setMode('island')
    if (def.kind === 'plane') this.save.activePlane = v.id
    this.syncVehicles() // the parked vehicle, in the island's own coordinates
    const spot = def.kind === 'plane' ? lay.boardAt : lay.buildings.find((b) => b.kind === 'pier')!.door
    this.pilot.x = spot.x
    this.pilot.y = spot.y
    this.pilot.z = this.world.heightAt(spot.x, spot.y)
    this.pilot.yaw = SOUTH
    this.pilot.visible = true

    // hand over what was for this island: paid for what arrived, a tip for promptness, a bonus for a clean landing
    const now = this.now()
    const lines: { text: string; reward: number; tip: number }[] = []
    for (const d of this.deliveries) {
      if (d.state !== 'loaded' || d.dest !== island) continue
      const r = await this.backend.complete(d.id, now, this.postcard ?? undefined)
      this.save.coins += r.reward + r.tip
      this.save.stats.delivered++
      lines.push({ text: `${ITEMS[d.item].name}×${r.delivered}${r.delivered < d.qty ? $t('（少了 {0}）', d.qty - r.delivered) : ''} → ${d.to}`, reward: r.reward, tip: r.tip })
    }
    // a postcard went with the goods: the islander writes back about it (and likes you the better for it)
    if (lines.length && this.postcard) {
      const card = this.postcard
      this.postcard = null
      this.save.stats.postcards = (this.save.stats.postcards ?? 0) + 1
      if ((FRIENDS as readonly string[]).includes(island)) {
        const fr = (this.save.friends ??= {})
        fr[island] = (fr[island] ?? 0) + 1
        const who = lay.def.owner
        this.mail.later({ kind: 'postcard', from: who, island, title: $t('{0}收到了你的明信片', who), body: $t('明信片收到了！我把它贴在{0}了。\n\n原来你那边是这个样子。下次也给我寄一张吧。\n\n——{1}', [$t('门背后'), $t('床头'), $t('灶台边上'), $t('窗户上')][this.clockDay % 4], who), photo: card })
      }
      this.after(1.2, () => this.toast($t('明信片跟着货一起送到了')))
    }
    const risky = this.deliveries.some((d) => d.dest === island && d.danger > 0) || lay.def.danger > 0
    const friend = this.story.landed(island, lines.length, risky)
    const rating = this.voyage.rating
    const robbed = this.voyage.robbed && this.voyage.robbed.units > 0 ? this.voyage.robbed.text : null
    const worn = this.wearNote(v.id)
    this.voyage.clear()
    this.combat.clear()
    if (worn) this.after(2.5, () => this.toast(worn, true))
    await this.refresh()
    if (lines.length) {
      const base = lines.reduce((n, l) => n + l.reward + l.tip, 0)
      // a clean approach and a charming home island each add a little on top
      const pct = (rating?.pct ?? 0) + this.charmBonus
      const bonus = pct > 0 ? { text: [rating && rating.pct > 0 ? rating.text : '', this.charmBonus ? $t('岛的名气') : ''].filter(Boolean).join(' + '), coins: Math.round(base * pct) } : null
      if (bonus) this.save.coins += bonus.coins
      const total = base + (bonus?.coins ?? 0)
      // the islander is there to take it: a hop, hearts, a word of thanks — and the coins come from their hand
      const who = this.owners[island]
      const from = who ?? { x: spot.x, y: spot.y - 6, z: this.pilot.z }
      if (who) {
        this.face(Math.atan2(who.x - this.pilot.x, -(who.y - this.pilot.y)), 1)
        who.yaw = Math.atan2(this.pilot.x - who.x, -(this.pilot.y - who.y))
        who.stretch = 0.6
        this.settling.push(who)
        this.scene.burst({ kind: 'heart', x: who.x, y: who.y, z: who.z + 13, n: 8, speed: 8, up: 22, life: 1, mode: 'float', grav: -6, r: 2 })
        this.float(robbed ? $t('路上遇到海盗了？人没事就好！') : THANKS[Math.floor(this.rnd() * THANKS.length)], who.x, who.y, who.z + 18)
        this.after(0.45, () => { who.stretch = 0.7; this.settling.push(who); this.sfx('pop', 1.3) })
        this.after(5, () => {
          const home = this.ownerSpot(lay)
          who.x = home.x
          who.y = home.y
          who.z = this.world.heightAt(home.x, home.y)
          who.yaw = SOUTH
        })
      }
      this.pay(total, from.x, from.y, from.z + 9)
      if (!this.milestone('delivery', $t('第一单送到了！'), $t('{0} · 赚到 {1} 金币', lay.def.name, total), 'coin')) this.celebrate(1, $t('送达 {0}', lay.def.name), $t('+{0} 金币{1}', total, bonus ? ` · ${bonus.text}` : ''), 'coin')
      if (friend) {
        this.after(1.4, () => {
          this.celebrate(1, friend.text.split($t('：'))[0], friend.gift ? $t('送你：{0}', bagText(friend.gift)) : '', friend.gift ? Object.keys(friend.gift)[0] : 'coin')
          if (friend.gift) this.drop(friend.gift, from.x, from.y, from.z + 9)
        })
      }
      this.panel = { kind: 'arrived', island, lines, bonus, robbed, friend }
    } else {
      this.sfx('done')
      this.toast($t('到了：{0}', lay.def.name))
    }
    if (island === 'far' && this.milestone('far', $t('彼岸'), $t('海的那一边，真的有一座岛'), 'seaChart')) {
      this.scene.burst({ kind: 'spark', x: this.pilot.x, y: this.pilot.y, z: this.pilot.z + 14, n: 40, speed: 30, up: 40, life: 1.6, r: 3 })
    }
    this.checkQuest()
    this.persistFn?.(this.save)
    this.changed()
  }

  // ───────────────────────────────────────────────────────────── quests, labels, dev
  /** the step the player is on (the first one not done yet) */
  quest(): { index: number; title: string; hint: string; progress: string } {
    let i = 0
    while (i < QUESTS.length - 1 && QUESTS[i].done(this)) i++
    const q = QUESTS[i]
    if (i === QUESTS.length - 1) return { index: i, ...this.story.line() }
    return { index: i, title: q.title, hint: q.hint, progress: q.progress ? q.progress(this) : '' }
  }
  private checkQuest() {
    const q = this.quest()
    if (q.index > this.save.questSeen) {
      for (let i = this.save.questSeen; i < q.index; i++) {
        // some steps of the guide come with a present: the first pieces of furniture
        const gift = QUESTS[i].reward
        if (gift) {
          // (presents wait in the warehouse: the pockets are for working)
          give((this.save.store ??= {}), gift)
          this.after(0.5, () => this.drop(gift, this.pilot.x, this.pilot.y, this.pilot.z + 12))
        }
        this.celebrate(1, `✓ ${QUESTS[i].title}`, gift ? $t('送你：{0}（放在仓库，在小屋里摆出去）', bagText(gift)) : $t('下一步：{0}', q.title))
      }
      this.save.questSeen = q.index
      this.changed()
    }
    // the chart to the far shore, the moment it is pieced together
    if (!this.save.milestones.chart && (this.save.stats.crafted.seaChart ?? 0) > 0) {
      this.save.milestones.chart = true
      this.celebrate(2, $t('远海海图'), $t('海图上多了一座岛：彼岸。往西，过了无人礁再往西。'), 'seaChart')
      this.makeBackend()
      void this.refresh()
    }
    this.story.tick(q.index === QUESTS.length - 1)
  }

  /** things to caption on screen, with where they are in the frame */
  labels(): Label[] {
    const out: Label[] = []
    const put = (key: string, text: string, x: number, y: number, z: number, kind: Label['kind'], value?: number) => {
      const s = this.scene.projectPoint(x, y, z)
      if (s) out.push({ key, text, x: s.x, y: s.y, kind, value })
    }
    if (this.mine.active) this.mine.labels(put)
    else if (this.house.active) this.house.labels(put)
    else if (this.dive.active) { /* the sea bed has no signs */ }
    else if (this.mode === 'island') {
      const lay = this.here
      for (const b of lay.buildings) {
        const name = b.kind === 'landmark' ? LANDMARK_NAME[lay.def.landmark] : b.kind === 'house' && !lay.def.home ? $t('{0}的家', lay.def.owner) : BUILDING_NAME[b.kind]
        put('b-' + b.id, name, b.x, b.y, b.base + b.rise + 3, 'building')
      }
      for (const [id, a] of this.vehicleActors) put('v-' + id, this.vdef(this.vehicle(id)!).name, a.x, a.y, a.z + 10, 'vehicle')
      if (this.gather && this.gather.fall < 0 && this.gather.need > 1) put('gather', '', this.pilot.x, this.pilot.y, this.pilot.z + 17, 'progress', this.gather.hits / this.gather.need)
      this.farm.labels(put)
      // the fish rack and the trophy show off the biggest catch: what, how long, which day
      if (lay.def.home) {
        const best = this.bestCatch()
        for (const d of this.save.decor ?? []) {
          if (d.item !== 'fishRack' && d.item !== 'trophy') continue
          const x = lay.plaza.x + d.dx, y = lay.plaza.y + d.dy
          put('show-' + d.dx + '-' + d.dy, best ? $t('{0} {1} cm · 第 {2} 天', ITEMS[best.item].name, best.cm, best.day + 1) : $t('还没有钓到鱼'), x, y, this.world.heightAt(Math.round(x), Math.round(y)) + 14, 'building')
        }
      }
      this.pets.labels(put)
      if (this.save.jobs.length && lay.def.home) {
        this.furnaceSpots().forEach((f, k) => {
          const left = this.furnaceLeftOf(k)
          if (left > 0) put('smelt' + k, $t('冶炼中 {0}s', Math.ceil(left)), f.x, f.y, this.world.heightAt(f.x, f.y) + 34, 'float')
        })
      }
    }
    if (this.mode === 'flight') this.combat.labels(put as never)
    for (const f of this.floaters) put('f-' + f.id, f.text, f.x, f.y, f.z + f.age * 9, 'float')
    const sp = this.speech
    if (sp && this.clock > sp.until) this.speech = null
    else if (sp && this.mode === 'island' && sp.island === this.save.here && !this.mine.active) {
      const who = this.owners[sp.island]
      if (who) put('speech', sp.text, who.x, who.y, who.z + 16, 'speech')
    }
    // a visitor (and the player, at the table) talking
    const vb = this.bubble
    if (vb && this.clock > vb.until) this.bubble = null
    else if (vb && this.mode === 'island' && this.onSurface && vb.who.visible !== false) put('bubble', vb.text, vb.who.x, vb.who.y, vb.who.z + 15, 'speech')
    return out
  }

  devGive() {
    for (const t of ['stoneAxe', 'stonePick', 'rod'] as ItemId[]) if (!this.count(t) && !this.supersededBy(t)) this.save.inv[t] = 1
    // (the materials go into the warehouse: the workbench takes from there)
    give((this.save.store ??= {}), { wood: 30, fiber: 20, stone: 20, copperOre: 12, ironOre: 12, coal: 8, berry: 10, plank: 12, cloth: 6, rope: 4, copperIngot: 8, ironIngot: 6 })
    this.save.coins += 300
    this.pay(300, this.pilot.x, this.pilot.y, this.pilot.z + 10)
    this.toast($t('开发者补给：材料和 300 金币'))
    this.changed()
  }
  // ── the day: twenty minutes from dawn to dawn, with a short night (the moonfish bite then)
  dayPhase(): 'day' | 'sunset' | 'night' {
    const t = this.save.day ?? 0
    return t < 0.62 ? 'day' : t < 0.74 ? 'sunset' : t < 0.95 ? 'night' : 'sunset'
  }
  private stepDay(dt: number) {
    const s = this.save
    s.played = (s.played ?? 0) + dt
    s.day = ((s.day ?? 0) + dt / DAY_SECONDS) % 1
    // the sky changes while the pilot is out under it (not down a mine or under the sea)
    if (!this.onSurface) return
    const ph = this.dayPhase()
    if (ph === this.baseParams.timeOfDay) return
    this.setBase({ timeOfDay: ph })
    if (ph === 'night' && this.mode === 'island') this.toast($t('天黑了。夜里，月光鱼会到岸边来。'))
  }
  /** jump to a time of day (0 dawn … 1) */
  setClock(t: number) {
    this.sfx('tap')
    this.save.day = t
  }
  setVolume(music: number, sfx: number) {
    this.save.settings = { music, sfx }
    this.dirty = true
  }
  setName(name: string) {
    const n = name.trim().slice(0, 10)
    if (n === (this.save.name ?? '')) return
    this.save.name = n || undefined
    this.layouts.home.def.name = n || $t('你的小岛')
    this.dirty = true
    this.onlineDirty = true
    this.sfx('done')
    this.changed()
  }
  /** one line on whether other players are within reach (the online layer fills it in) */
  onlineStatus(): string {
    return this.online ? this.online.status() : $t('单机：这里没有联机服务，订单由岛民来下。')
  }
  /** change a setting of the scene that is not the vehicle's (time of day, flame style …) */
  /** how the craft in the air handles this trip (its load, its engine): kept across a change of the light */
  flightParams: Record<string, unknown> = {}
  setBase(patch: Record<string, unknown>) {
    this.baseParams = { ...this.baseParams, ...patch }
    this.scene.setParams(this.flight ? { ...this.baseParams, ...this.flightParams } : this.baseParams)
  }
  /** for tests and the dev menu: where things are */
  debugPilot(): Point {
    return { x: this.pilot.x, y: this.pilot.y }
  }
}

export { bagText }
