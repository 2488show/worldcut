// Round 6: tools wear out and are mended; vehicles have levels, wear, repairs and paint.
import { describe, expect, it } from 'vitest'
import { give, HULLS, TOOL_USES, vehicleDef } from '../src/game/data'
import { migrate, newSave } from '../src/game/game'
import { craftModel, DESIGN_H, DESIGN_W } from '../src/engine/craft'
import { readCard } from '../src/game/online'
import { headless } from './harness'

describe('workshop', () => {
  it('tools break after their uses, and the workbench mends them', async () => {
    const { g } = headless()
    g.close()
    g.save.inv = { stoneAxe: 1, copperAxe: 1 }
    expect(g.toolInHand('axe')).toBe('copperAxe')
    const max = TOOL_USES.copperAxe!
    for (let i = 0; i < max - 1; i++) g.useTool('copperAxe')
    expect(g.toolLife('copperAxe')).toEqual({ left: 1, max })
    expect(g.wornTools).toContain('copperAxe')
    // mend it
    give(g.save.inv, { copperIngot: 1 })
    g.mendTool('copperAxe')
    expect(g.toolLife('copperAxe')!.left).toBe(max)
    expect(g.save.inv.copperIngot).toBe(0)
    // wear it out: it breaks, and the stone axe is what is left
    for (let i = 0; i < max; i++) g.useTool('copperAxe')
    expect(g.save.inv.copperAxe ?? 0).toBe(0)
    expect(g.toolInHand('axe')).toBe('stoneAxe')
    expect(g.toasts.some((t) => t.text.includes('坏了'))).toBe(true)
  })

  it('vehicles: built by hand at level 1, upgraded in place to 3, then a new hull', async () => {
    const { g, run } = headless()
    g.close()
    g.save.level = 2
    give(g.save.inv, { plank: 40, copperIngot: 20, cloth: 10, ironIngot: 10, wood: 20, rope: 6 })
    g.save.coins = 5000
    g.buildVehicle('skiff')
    await run(2)
    const raft = g.save.vehicles.find((v) => v.type === 'skiff')!
    expect(g.vdef(raft).name).toBe('筏子')
    expect(g.vdef(raft).lv).toBe(1)
    // a second one of the same line cannot be built: it is upgraded
    expect(g.buildBlock('skiff')).toBeTruthy()
    g.upgradeVehicle(raft.id); await run(1)
    g.upgradeVehicle(raft.id); await run(1)
    expect(g.vdef(raft).lv).toBe(3)
    // the generation's end
    expect(g.upgradeVehicleInfo(raft.id)!.next).toBeNull()
    // the next generation needs a bigger island
    expect(g.buildBlock('sloop')).toMatch(/5 级/)
    g.save.level = 5
    expect(g.buildBlock('sloop')).toBeNull()
    // the third generation needs a bigger island still
    expect(g.buildBlock('freighter')).toMatch(/7 级/)
    // ten levels of each kind, planned or not
    for (const kind of ['plane', 'boat'] as const) {
      const lvs = Object.values(HULLS).filter((h) => h.kind === kind).flatMap((h) => h.levels.map((l) => l.lv))
      expect(new Set(lvs).size).toBe(10)
    }
  }, 20000)

  it('wear slows the engine and shrinks the hold; repairs set it right', async () => {
    const { g, run } = headless()
    g.close()
    give(g.save.inv, { plank: 20, copperIngot: 10, cloth: 6, wood: 20, rope: 6 })
    g.buildVehicle('sparrow')
    await run(2)
    const v = g.save.vehicles[0]
    const fresh = g.vdef(v)
    g.wearVehicle(v.id, { km: 40, robbed: true, squall: 3, chased: true })
    const worn = g.vdef(v)
    expect(v.wear!.engine).toBeLessThan(0.6)
    expect(worn.flight.speed).toBeLessThan(fresh.flight.speed)
    expect(worn.cargo).toBeLessThan(fresh.cargo)
    expect(g.wearNote(v.id)).toBeTruthy()
    const r = g.repairCost(v.id)!
    expect(r.parts).toEqual(['engine', 'hull'])
    // abroad, only coins, and dearer
    const away = g.repairCost(v.id, true)!
    expect(Object.keys(away.cost)).toHaveLength(0)
    expect(away.coins).toBeGreaterThan(r.coins)
    give(g.save.inv, { copperIngot: 10, plank: 10, cloth: 4 })
    g.save.coins += 1000
    g.repairVehicle(v.id)
    expect(v.wear!.engine).toBe(1)
    expect(g.vdef(v).cargo).toBe(fresh.cargo)
  })

  it('paint: dyes for each new colour, a picture on the sail, the model redrawn', async () => {
    const { g, run } = headless()
    g.close()
    give(g.save.inv, { wood: 20, rope: 6 })
    g.buildVehicle('skiff')
    await run(2)
    const v = g.save.vehicles[0]
    const design = '0'.repeat(DESIGN_W) + '.'.repeat(DESIGN_W * (DESIGN_H - 1))
    const paint = { body: [62, 112, 204] as [number, number, number], stripe: 'double' as const, design }
    expect(g.paintCost(v.id, paint)).toEqual({ dyeBlue: 1, dyeRed: 1 })
    g.paintVehicle(v.id, paint)
    expect(v.paint).toBeUndefined() // no dyes yet
    give(g.save.inv, { dyeBlue: 1, dyeRed: 1 })
    g.paintVehicle(v.id, paint)
    expect(v.paint?.stripe).toBe('double')
    expect(g.save.inv.dyeBlue).toBe(0)
    // the vehicle is drawn with its own model
    const name = g.craftModel(v, false)
    expect(name).toBe('veh_' + v.id)
    expect(g.scene.models[name]).toBeTruthy()
    // a sail-raft carries the picture on its sail; a faded one is greyer
    const m = craftModel('sailraft', 't', paint, 0, false)!
    const used = new Set<number>()
    for (const s of m.slices) for (const c of s) used.add(c)
    expect(used.has(30)).toBe(true)
    const faded = craftModel('sailraft', 't', paint, 1, false)!
    expect(faded.colors[3]).not.toEqual(m.colors[3])
    // the prototype's jet is not repainted
    expect(craftModel('jet', 'x', paint, 0, false)).toBeNull()
  })

  it('another player\'s paint, read from their card, is checked', () => {
    const c = readCard({ seed: 5, craft: { model: 'sloop', kind: 'boat', paint: { body: [300, -4, 'x'], stripe: 'zigzag', design: '<script>', accent: [1, 2, 3] } } })!
    expect(c.craft!.model).toBe('sloop')
    expect(c.craft!.paint!.body).toBeUndefined()
    expect(c.craft!.paint!.stripe).toBeUndefined()
    expect(c.craft!.paint!.design).toBeUndefined()
    expect(c.craft!.paint!.accent).toEqual([1, 2, 3])
    expect(readCard({ seed: 5, craft: { model: 'evil' } })!.craft).toBeUndefined()
  })

  it('old saves: the vehicles keep their place on the ladder', () => {
    const s = newSave()
    s.vehicles.push({ id: 'a', type: 'sparrow', at: 'home' }, { id: 'b', type: 'skiff', at: 'home' })
    const m = migrate(JSON.parse(JSON.stringify(s)))!
    expect(m.vehicles.map((v) => v.lv)).toEqual([2, 3])
    expect(m.vehicles[0].wear).toBeTruthy()
    expect(vehicleDef('skiff', 3).name).toBe('舢板')
  })
})
