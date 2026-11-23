// The smaller things that make it a whole game: a seed that grows into a tree, furniture that
// can be turned, the day going round, smoke that throws off a pursuer.
import { describe, expect, it } from 'vitest'
import { give } from '../src/game/data'
import { headless } from './harness'

type Inner = { plant(i: string, x: number, y: number): void; placeFurniture(i: string, x: number, y: number): void; addBuy(island: string, item: string, qty: number, now: number): void }

describe('extras', () => {
  it('a seed grows into a tree that can be felled; furniture keeps the way it was turned', async () => {
    const { g, run, tick, fx } = headless()
    g.close()
    give(g.save.inv, { acorn: 2, bench: 1, stoneAxe: 1 })
    const lay = g.layouts.home
    const nodes = lay.nodes.length
    g.startDecor('acorn')
    for (let dy = -24; dy <= 24 && !g.save.planted?.length; dy += 6) for (let dx = -36; dx <= 36 && !g.save.planted?.length; dx += 6) (g as never as Inner).plant('acorn', lay.plaza.x + dx, lay.plaza.y + dy)
    expect(g.save.planted?.length).toBe(1)
    expect(g.save.inv.acorn).toBe(1)
    expect(fx).toContain('place')
    await run(2)
    expect(lay.nodes.length).toBe(nodes) // still a seedling
    tick(300)
    await run(1.5)
    expect(lay.nodes.length).toBe(nodes + 1)
    const tree = lay.nodes[lay.nodes.length - 1]
    expect(tree.kind).toBe('oak2')
    // it is a tree like any other: walk up and fell it
    const wood = g.save.inv.wood ?? 0
    g.goGather(tree)
    await run(30, () => tree.depleted)
    expect(tree.depleted).toBe(true)
    await run(0.5)
    expect((g.save.inv.wood ?? 0) - wood).toBe(4)

    // furniture, turned a quarter
    g.startDecor('bench'); g.rotatePlacing()
    for (let dy = -24; dy <= 24 && !g.save.decor?.length; dy += 6) for (let dx = -36; dx <= 36 && !g.save.decor?.length; dx += 6) (g as never as Inner).placeFurniture('bench', lay.plaza.x + dx, lay.plaza.y + dy)
    expect(g.save.decor?.[0].rot).toBe(1)
  }, 60000)

  it('the day goes round: dusk, a short night, morning', async () => {
    const { g, run } = headless()
    g.close()
    expect(g.dayPhase()).toBe('day')
    g.setClock(0.7); await run(0.2)
    expect(g.dayPhase()).toBe('sunset')
    g.setClock(0.8); await run(0.2)
    expect(g.dayPhase()).toBe('night')
    expect(g.toasts.some((t) => t.text.includes('天黑了'))).toBe(true)
    g.setClock(0.99); await run(14)
    expect(g.dayPhase()).toBe('day')
    expect(g.save.played).toBeGreaterThan(14)
  }, 60000)

  it('a smoke bomb throws a pursuer off', async () => {
    const { g, run, settle, fx } = headless()
    g.close(); g.devGive(); g.close()
    g.save.stats.delivered = 5
    give(g.save.inv, { plank: 26, cloth: 6, copperIngot: 6, smoke: 2 })
    g.buildVehicle('sparrow')
    await run(3); await settle()
    ;(g.local as never as Inner).addBuy('dune', 'plank', 8, 0)
    await g.refresh()
    await g.acceptOrder(g.orders.find((x) => x.island === 'dune' && x.qty === 8)!.id)
    await g.depart(g.save.vehicles[0].id, 'dune'); await settle()
    await run(10, () => g.flight?.phase === 'cruise')
    ;(g.voyage as never as { pirateAt: number }).pirateAt = 0.12
    let used = 0
    await run(240, () => {
      const h = g.hud()!
      g.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false)
      const p = h.voyage.pirate
      // fully laden and flying straight: the only thing that saves the cargo is the smoke
      if (p && p.phase === 'chase' && p.dist < 70 && p.grip > 0.3 && h.voyage.smoke > 0) { g.voyage.smoke(); used++ }
      return g.flight?.canLand === 'dune' && h.dist < 190
    })
    expect(used).toBeGreaterThan(0)
    expect(g.save.inv.smoke ?? 0).toBeLessThan(2)
    expect(fx).toContain('alarm')
    expect(g.voyage.robbed).toBeNull()
  }, 120000)
})
