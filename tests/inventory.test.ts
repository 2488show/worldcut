// What the pilot can carry: eight slots, a row more for each backpack, stacks, the warehouse.
import { describe, expect, it } from 'vitest'
import { give, slotsFor } from '../src/game/data'
import { Game, newSave } from '../src/game/game'
import { headless } from './harness'

describe('inventory', () => {
  it('slots, stacks, overflow to the warehouse, and the backpacks', async () => {
    const { g, run } = headless()
    g.close()
    g.save.inv = {}
    expect(g.capacity()).toBe(8)
    expect(slotsFor({ wood: 30 })).toBe(1)
    expect(slotsFor({ wood: 31 })).toBe(2)
    expect(slotsFor({ stoneAxe: 1, sardine: 11 })).toBe(3)
    // more than fits: the rest goes home
    const sent = g.receive({ wood: 300 })
    expect(g.save.inv.wood).toBe(240)
    expect(sent.wood).toBe(60)
    expect(g.save.store!.wood).toBeGreaterThanOrEqual(60)
    expect(g.used()).toBe(8)
    // a full pocket: nothing more can be picked up
    const stick = g.layouts.home.nodes.find((n) => n.kind === 'stick' && !n.depleted)!
    g.goGather(stick)
    expect(g.toasts.some((t) => t.text.includes('口袋满了'))).toBe(true)
    // at the warehouse
    g.depositAll()
    expect(g.used()).toBe(0)
    g.withdraw('wood', 30)
    expect(g.carried('wood')).toBe(30)
    // the workbench takes from the warehouse too (at home)
    expect(g.count('wood')).toBe(300)
    // a backpack: a row more; the next one replaces it
    give(g.save.inv, { fiber: 8, stick: 4 })
    g.craft('pack1')
    await run(2)
    expect(g.capacity()).toBe(16)
    give(g.save.inv, { cloth: 4, rope: 3 })
    g.craft('pack2')
    await run(2)
    expect(g.capacity()).toBe(24)
    expect(g.count('pack1')).toBe(0)
    // a better tool retires the old one
    give(g.save.inv, { stoneAxe: 1, copperIngot: 2, stick: 2 })
    g.craft('copperAxe')
    await run(2)
    expect(g.count('stoneAxe')).toBe(0)
    expect(g.count('copperAxe')).toBe(1)
    g.craft('stoneAxe')
    expect(g.toasts.some((t) => t.text.includes('更好的'))).toBe(true)
    // the hotbar: the new tool is in hand, and anything can be moved to the front
    expect(g.heldItem()).toBe('copperAxe')
    g.toHotbar('wood')
    expect(g.slots()[0]?.item).toBe('wood')
  }, 60000)

  it('an old save with an unlimited bag is settled into slots', () => {
    const s = newSave(5)
    s.inv = { stoneAxe: 1, stonePick: 1, wood: 200, stone: 90, fiber: 40, plank: 50, cloth: 20 }
    const g = new Game({ save: s, now: () => 0, rnd: () => 0.5 })
    expect(g.used()).toBeLessThanOrEqual(8)
    expect(g.carried('stoneAxe')).toBe(1)
    const total = (k: 'wood' | 'stone') => (g.save.inv[k] ?? 0) + (g.save.store![k] ?? 0)
    expect(total('wood')).toBe(200)
    expect(total('stone')).toBe(90)
  })
})
