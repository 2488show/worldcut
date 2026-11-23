import { describe, expect, it } from 'vitest'
import { ITEMS, ITEM_ORDER, NODES, RECIPES, FURNITURE, ORES, MINE_BANDS, toolTier } from '../src/game/data'
import { ICONS } from '../src/game/icons'
import { buildProps } from '../src/engine/props'
import { buildModels } from '../src/engine/models'

describe('the tables', () => {
  it('every item has an icon of 10 × 10 and a line of description', () => {
    for (const id of [...ITEM_ORDER, 'coin' as const]) {
      // (furniture may have no drawn icon: then the model itself is drawn small)
      if (!ICONS[id] && id !== 'coin' && FURNITURE[id]) continue
      const rows = ICONS[id]
      expect(rows, 'icon for ' + id).toBeTruthy()
      expect(rows.length, id).toBe(10)
      for (const r of rows) expect(r.length, id + ': ' + r).toBe(10)
    }
    for (const id of ITEM_ORDER) expect(ITEMS[id].desc.length, id).toBeGreaterThan(3)
  })
  it('every node, piece of furniture and recipe points at things that exist', () => {
    const models = { ...buildModels(), ...buildProps() }
    for (const k in NODES) {
      const n = NODES[k as keyof typeof NODES]
      expect(models[n.model], 'model ' + n.model).toBeTruthy()
      if (n.empty) expect(models[n.empty], 'model ' + n.empty).toBeTruthy()
      for (const i in n.yield) expect(ITEMS[i as keyof typeof ITEMS], i).toBeTruthy()
    }
    for (const k in FURNITURE) expect(models[FURNITURE[k as keyof typeof FURNITURE]!.model], 'model for ' + k).toBeTruthy()
    for (const r of RECIPES) {
      expect(ITEMS[r.out], r.id).toBeTruthy()
      for (const i in r.cost) expect(ITEMS[i as keyof typeof ITEMS], r.id + ' needs ' + i).toBeTruthy()
    }
    for (const b of MINE_BANDS) for (const o in b.ore) expect(ORES[o as keyof typeof ORES], o).toBeTruthy()
  })
  it('no model has more colours than a palette holds', () => {
    const models = { ...buildModels(), ...buildProps() }
    for (const name in models) expect(Math.max(...Object.keys(models[name].colors).map(Number)), name).toBeLessThan(96)
  })
  it('the best tool in the bag counts', () => {
    expect(toolTier({}, 'axe')).toBe(0)
    expect(toolTier({ stoneAxe: 1 }, 'axe')).toBe(1)
    expect(toolTier({ stoneAxe: 1, ironAxe: 1 }, 'axe')).toBe(3)
    expect(toolTier({ copperPick: 1 }, 'pick')).toBe(2)
  })
})

import { ICONS as ALL_ICONS } from '../src/game/icons'
import { ITEM_ORDER as ALL_ITEMS } from '../src/game/data'
import { describe as d2, expect as e2, it as i2 } from 'vitest'
d2('icons', () => {
  i2('every item has a 10×10 icon', () => {
    for (const id of ALL_ITEMS) {
      if (!ALL_ICONS[id] && FURNITURE[id]) continue
      e2(ALL_ICONS[id], id).toBeTruthy()
      e2(ALL_ICONS[id].length, id).toBe(10)
      for (const row of ALL_ICONS[id]) e2(row.length, id + ': ' + row).toBe(10)
    }
  })
})
