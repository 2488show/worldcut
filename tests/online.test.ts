// Two players and one shared store: each sees the other's island on their own chart, one posts
// an order, the other flies it over, and the goods turn up in the first one's bag.
import { describe, expect, it } from 'vitest'
import { migrate } from '../src/game/game'
import { give } from '../src/game/data'
import { MemoryStore, Online, pickSave, readCard, readOrder, savePath } from '../src/game/online'
import { headless } from './harness'

describe('online', () => {
  it('reads nothing on trust', () => {
    expect(readCard({ name: 'x' })).toBeNull()
    const c = readCard({ name: '<b>很长很长很长很长很长的名字</b>', seed: 5.7, tier: 99, charm: -4, decor: [{ item: 'bench', dx: 1e9, dy: 'a' }, { item: 'nonsense' }, null] })!
    expect(c.tier).toBe(3)
    expect(c.seed).toBe(5)
    expect(c.name.length).toBeLessThanOrEqual(10)
    expect(c.name).not.toContain('<')
    expect(c.decor).toEqual([{ item: 'bench', dx: 300, dy: 0, rot: 0 }])
    expect(readOrder('a', { by: 'u', item: 'gold-bars', qty: 3 })).toBeNull()
    expect(readOrder('a', { by: 'u', item: 'plank', qty: 1e9, price: -5 })!.qty).toBe(40)
  })

  it('two players trade across the sea', async () => {
    const store = new MemoryStore()
    const A = headless({ seed: 111 })
    const B = headless({ seed: 222 })
    A.g.close(); B.g.close()
    A.g.setName('甲岛'); B.g.setName('乙岛')
    A.g.save.decor = []
    const onA = new Online(A.g, store.client('ua'))
    const onB = new Online(B.g, store.client('ub'))
    expect(A.g.onlineStatus()).toContain('联机')

    // ── each finds the other on the chart
    await A.run(2); await A.settle()
    expect(store.docs.has('islands/ua')).toBe(true)
    await B.run(2); await B.settle(); await B.run(1)
    expect(B.g.guests.map((x) => x.name)).toEqual(['甲岛'])
    const there = B.g.layouts.p_ua
    expect(there).toBeTruthy()
    // it is the same island: grown from the same seed, with the village in the same place
    const home = A.g.layouts.home
    expect(there.def.seed).toBe(111)
    expect(JSON.stringify(there.def.lobes)).toBe(JSON.stringify(home.def.lobes))
    expect(Math.abs((there.plaza.x - there.def.x) - (home.plaza.x - home.def.x))).toBeLessThan(2)
    expect(Math.abs((there.plaza.y - there.def.y) - (home.plaza.y - home.def.y))).toBeLessThan(2)
    expect(Math.abs(there.nodes.length - home.nodes.length)).toBeLessThan(home.nodes.length * 0.15)
    expect(B.fx).toContain('celebrate1')
    A.tick(25); await A.run(2); await A.settle(); await A.run(1)
    expect(A.g.guests.map((x) => x.name)).toEqual(['乙岛'])

    // ── furniture set out on one island is seen on the other
    A.g.save.decor = [{ item: 'bench', dx: 14, dy: 30, rot: 1 }]
    A.tick(25); await A.run(2); await A.settle()
    B.tick(25); await B.run(2); await B.settle(); await B.run(1)
    expect(B.g.guests[0].decor).toEqual([{ item: 'bench', dx: 14, dy: 30, rot: 1 }])

    // ── A asks for planks; the coins are set aside
    A.g.save.coins = 500
    await A.g.postBuy('plank', 4, 120); await A.settle()
    expect(A.g.save.coins).toBe(380)
    expect(A.g.orders.some((o) => o.mine && o.player && o.item === 'plank')).toBe(true)
    expect(onA.myOpen()).toBe(1)

    // ── B sees it on the board, takes it, and flies it over
    B.g.devGive(); B.g.close()
    give(B.g.save.inv, { plank: 20, cloth: 6, copperIngot: 6 })
    B.g.buildVehicle('sparrow')
    await B.run(3); await B.settle()
    B.tick(25); await B.run(2); await B.settle()
    const o = B.g.orders.find((x) => x.player && !x.mine)!
    expect(o).toBeTruthy()
    expect(o.island).toBe('p_ua')
    expect(o.by).toBe('甲岛')
    await B.g.acceptOrder(o.id); await B.settle()
    expect(B.g.deliveries.some((d) => d.dest === 'p_ua')).toBe(true)
    // (nobody else can take it now)
    const C = store.client('uc')
    await expect(new Online(headless({ seed: 333 }).g, C).take(o.id, 0)).rejects.toThrow()
    const coins = B.g.save.coins
    await B.flyTo(B.g.save.vehicles[0].id, 'p_ua')
    expect(B.g.save.here).toBe('p_ua')
    expect(B.g.panel?.kind).toBe('arrived')
    expect(B.g.save.coins - coins).toBeGreaterThanOrEqual(120)
    const doc = [...store.docs.entries()].find(([k]) => k.startsWith('orders/'))![1]
    expect(doc.status).toBe('done')
    expect(doc.delivered).toBe(4)
    // a guest may look, not touch
    expect(B.g.isHome).toBe(false)

    // ── and A finds the planks in the bag
    const had = A.g.save.inv.plank ?? 0
    A.fx.length = 0
    A.tick(25); await A.run(2); await A.settle(); await A.run(0.5)
    expect((A.g.save.inv.plank ?? 0) - had).toBe(4)
    expect(A.fx).toContain('celebrate1')
    expect([...store.docs.keys()].some((k) => k.startsWith('orders/'))).toBe(false)
    expect(onB.state).toBe('on')

    // ── the save goes up, and comes down on another device
    await onA.backup(1e6, true)
    expect(store.docs.has(savePath('ua'))).toBe(true)
    const other = await pickSave(store.client('ua'), null, migrate)
    expect(other?.island.seed).toBe(111)
    // nobody else can read it
    expect(await store.client('ub').get(savePath('ua'))).toBeNull()
    // a newer save on the device wins over the cloud's
    const local = { ...other!, coins: 1, at: 1e9 }
    expect((await pickSave(store.client('ua'), local, migrate))?.coins).toBe(1)
  }, 240000)

  it('a view-only seat sees the others but cannot post', async () => {
    const store = new MemoryStore()
    const A = headless({ seed: 111 })
    A.g.close()
    new Online(A.g, store.client('ua'))
    await A.run(2); await A.settle()
    const V = headless({ seed: 444 })
    V.g.close()
    const on = new Online(V.g, store.client('uv', false))
    await V.run(2); await V.settle(); await V.run(1)
    expect(on.state).toBe('readonly')
    expect(V.g.guests.length).toBe(1)
    expect(store.docs.has('islands/uv')).toBe(false)
    V.g.save.coins = 500
    await V.g.postBuy('plank', 2, 50); await V.settle()
    expect(V.g.save.coins).toBe(500)
    expect(V.g.onlineStatus()).toContain('只读')
  }, 60000)
})
