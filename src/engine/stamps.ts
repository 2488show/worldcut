// Stamps: small blocks of (height, material) cells that are pressed into the world's height
// map. Trees, ore rocks, buildings, runways and piers are all stamps, so adding a new building
// is a few lines of text here, not a sprite sheet.
//
// Rows run north → south, columns west → east. '.' leaves the ground as it is.

import { MAT } from './materials'

export interface Stamp {
  name: string
  w: number
  h: number
  /** height above the ground the stamp stands on (per cell; ignored where mat is 255) */
  rise: Uint8Array
  /** material per cell; 255 = leave the ground alone */
  mats: Uint8Array
  /** 1 where the pilot cannot walk */
  solid: Uint8Array
}

type Legend = Record<string, [rise: number, mat: string, solid?: boolean]>

export function makeStamp(name: string, rows: string[], legend: Legend): Stamp {
  const h = rows.length
  const w = rows[0].length
  const st: Stamp = { name, w, h, rise: new Uint8Array(w * h), mats: new Uint8Array(w * h).fill(255), solid: new Uint8Array(w * h) }
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`stamp ${name}: row ${y} has the wrong length`)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      if (ch === '.') continue
      const l = legend[ch]
      if (!l) throw new Error(`stamp ${name}: unknown cell '${ch}'`)
      const m = MAT[l[1]]
      if (m === undefined) throw new Error(`stamp ${name}: unknown material '${l[1]}'`)
      st.rise[y * w + x] = l[0]
      st.mats[y * w + x] = m
      st.solid[y * w + x] = l[2] === false ? 0 : 1
    }
  }
  return st
}

/** an empty stamp to fill in (every cell left alone until it is set) */
export function blank(name: string, w: number, h: number): Stamp {
  return { name, w, h, rise: new Uint8Array(w * h), mats: new Uint8Array(w * h).fill(255), solid: new Uint8Array(w * h) }
}
function put(st: Stamp, x: number, y: number, rise: number, mat: string, solid = true) {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return
  st.rise[y * st.w + x] = rise
  st.mats[y * st.w + x] = MAT[mat]
  st.solid[y * st.w + x] = solid ? 1 : 0
}

// ───────────────────────────────────────────────────────────── resource nodes
const tree = makeStamp('tree', [
  '..eee..',
  '.emmme.',
  'emtftme',
  'emtTtme',
  'emfttme',
  '.emmfe.',
  '..eee..',
], {
  e: [3, 'fruitTreeEdge'], m: [5, 'fruitTree'], t: [6, 'fruitTreeTop'], T: [7, 'fruitTreeTop'], f: [6, 'fruit'],
})
const stump = makeStamp('stump', ['.s.', 'sss', '.s.'], { s: [1, 'stump', false] })

const rockRows = [
  '.rRRr..',
  'rRcRRRr',
  'RRRcRcR',
  'rRcRRRr',
  '.rrRr..',
]
const rockStone = makeStamp('rockStone', rockRows, { r: [2, 'rubble'], R: [4, 'oreRock'], c: [4, 'rockLight'] })
const rockCopper = makeStamp('rockCopper', rockRows, { r: [2, 'rubble'], R: [4, 'oreRock'], c: [4, 'oreCopper'] })
const rockIron = makeStamp('rockIron', rockRows, { r: [2, 'rubble'], R: [4, 'oreRock'], c: [4, 'oreIron'] })
const rubble = makeStamp('rubble', ['.r.r.', 'rr.rr', '.r.r.'], { r: [1, 'rubble', false] })

const bush = makeStamp('bush', [
  '.bfb.',
  'bfbbb',
  'bbbfb',
  'fbbbb',
  '.bfb.',
], { b: [2, 'bush'], f: [3, 'bushFlower'] })
const bushPicked = makeStamp('bushPicked', [
  '.bbb.',
  'bbbbb',
  'bbbbb',
  'bbbbb',
  '.bbb.',
], { b: [1, 'bushPicked', false] })

// ───────────────────────────────────────────────────────────── buildings
const workbench = makeStamp('workbench', [
  'xXx.ttttttt',
  'xxx.tSSttht',
  'xXx.ttttttt',
], {
  x: [5, 'crate'], X: [5, 'crateBand'], t: [3, 'plank'], S: [4, 'stoneDark'], h: [4, 'roofRed'],
})

const furnace = makeStamp('furnace', [
  '..sssss..',
  '.sSSSSSKK',
  'sSSiiiSKK',
  'sSiEEEiSs',
  'sSiEEEiSs',
  'sSiEEEiSs',
  'sSSiiiSSs',
  '.sSSSSSs.',
  '..sdds...',
], {
  s: [4, 'stoneDark'], S: [6, 'stone'], i: [5, 'stoneDark'], E: [3, 'ember'], K: [10, 'soot'], d: [4, 'soot'],
})

const crates = makeStamp('crates', [
  'xXx.ccc',
  'xxx.cCc',
  'xXx.ccc',
  '.ccccc.',
  '.cCcCc.',
], { x: [6, 'crate'], X: [6, 'crateBand'], c: [3, 'crate'], C: [3, 'crateBand'] })

const board = makeStamp('board', [
  'RRRRRRRRRRRRRRR',
  'wYwPwWwYwWwPwYw',
], {
  R: [11, 'roofRed'], w: [9, 'boardWood'], Y: [9, 'paperYellow'], P: [9, 'paperPink'], W: [9, 'paperWhite'],
})

/** a tent hangar: an arched canvas roof with stripes, open to the south */
function hangar(): Stamp {
  const w = 28, h = 16
  const st = blank('hangar', w, h)
  for (let x = 0; x < w; x++) {
    const rise = 4 + Math.round(7 * Math.sin((Math.PI * (x + 0.5)) / w))
    const stripe = x % 7 < 2
    for (let y = 0; y < h; y++) {
      const front = y === h - 1
      const pillar = x < 2 || x >= w - 2
      put(st, x, y, rise, front && !pillar ? 'canvasFront' : stripe ? 'canvasStripe' : 'canvas')
    }
  }
  return st
}

/** a little house with a gable roof; the wall and door face south */
function house(name: string, roof: string): Stamp {
  const w = 17, h = 10
  const st = blank(name, w, h)
  const rise = [6, 7, 8, 9, 10, 10, 9, 8, 7, 6]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const front = y === h - 1
      const door = front && (x === 8 || x === 9)
      put(st, x, y, rise[y], door ? 'door' : front ? roof + 'Front' : roof)
    }
  }
  for (const [x, y] of [[13, 2], [14, 2], [13, 3], [14, 3]]) put(st, x, y, 13, 'stoneDark')
  return st
}

// ───────────────────────────────────────────────────────────── ground works (sized to fit)
/** a landing strip running west → east: asphalt, a dashed centre line, threshold bars, edge lights */
export function runwayStamp(length: number, width = 13): Stamp {
  const st = blank('runway', length, width)
  const mid = width >> 1
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < length; x++) {
      let mat = 'asphalt'
      if (y === mid && x > 8 && x < length - 9 && x % 8 < 4) mat = 'paint'
      if ((x === 3 || x === 4 || x === length - 4 || x === length - 5) && y % 2 === 1 && y > 0 && y < width - 1) mat = 'paint'
      put(st, x, y, 0, mat, false)
    }
  }
  for (let x = 1; x < length; x += 12) {
    put(st, x, 0, 1, 'beacon', false)
    put(st, x, width - 1, 1, 'beacon', false)
  }
  return st
}

/** a wooden pier running north → south, `length` long */
export function pierStamp(length: number, width = 5): Stamp {
  const st = blank('pier', width, length)
  for (let y = 0; y < length; y++) {
    for (let x = 0; x < width; x++) put(st, x, y, 0, y % 4 === 3 ? 'plankDark' : 'plank', false)
  }
  for (const y of [length - 1, length - 9]) {
    if (y < 0) continue
    put(st, 0, y, 2, 'plankDark', true)
    put(st, width - 1, y, 2, 'plankDark', true)
  }
  return st
}

/** the same stamp turned a quarter turn (rows become columns): a runway north–south, a pier east–west */
export function turned(st: Stamp): Stamp {
  const out = blank(st.name, st.h, st.w)
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const c = y * st.w + x
      const o = x * out.w + y
      out.rise[o] = st.rise[c]
      out.mats[o] = st.mats[c]
      out.solid[o] = st.solid[c]
    }
  }
  return out
}

/** a patch of ground of one material (plaza, path): only the material changes */
export function groundStamp(name: string, w: number, h: number, mat: string, speck?: string): Stamp {
  const st = blank(name, w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hs = ((x * 73856093) ^ (y * 19349663)) >>> 0
      put(st, x, y, 0, speck && hs % 11 === 0 ? speck : mat, false)
    }
  }
  return st
}

export const STAMPS: Record<string, Stamp> = {
  tree, stump, rockStone, rockCopper, rockIron, rubble, bush, bushPicked,
  workbench, furnace, crates, board,
  hangar: hangar(),
  houseRed: house('houseRed', 'roofRed'),
  houseBlue: house('houseBlue', 'roofBlue'),
  houseGreen: house('houseGreen', 'roofGreen'),
}
