import { describe, expect, it } from 'vitest'
import { LocalBackend, fairPrice, newLocalState, parTime } from '../src/game/backend'

const neighbours = [
  { id: 'peak', owner: '阿澈', dist: 600, sells: ['ironOre' as const], wants: ['plank' as const, 'berry' as const], danger: 0 },
  { id: 'reef', owner: 'Mio', dist: 900, sells: ['cloth' as const], wants: ['berry' as const, 'plank' as const], danger: 1 },
  { id: 'pine', owner: 'Lena', dist: 1000, sells: ['pine' as const], wants: ['stone' as const], danger: 0 },
]
const make = (rnd = () => 0.5) => new LocalBackend(newLocalState(), neighbours, rnd)

describe('the market', () => {
  it('opens with one order from each safe neighbour, for goods a new island has (round 21)', async () => {
    const b = make()
    const orders = await b.orders()
    expect(orders.map((o) => o.island)).toEqual(['peak', 'pine'])
    expect(orders.every((o) => o.tier === 1)).toBe(true)
    expect(orders[0].qty).toBeLessThanOrEqual(4)
    // a dangerous route pays more for the same goods
    expect(fairPrice('plank', 4, 900, 1)).toBeGreaterThan(fairPrice('plank', 4, 900, 0) * 1.2)
    expect(orders.every((o) => o.kind === 'buy' && o.status === 'open')).toBe(true)
  })

  it('pays on delivery, with a tip only when it was prompt', async () => {
    const b = make()
    const [first, second] = await b.orders()
    const d1 = await b.accept(first.id)
    expect(d1.reward).toBe(first.price)
    expect((await b.orders()).some((o) => o.id === first.id)).toBe(false) // nobody else can take it now
    await expect(b.complete(d1.id, 0)).rejects.toThrow() // not loaded yet
    await b.markLoaded(d1.id, 100)
    const quick = await b.complete(d1.id, 100 + d1.par - 1)
    expect(quick).toMatchObject({ reward: first.price, tip: Math.round(first.price * 0.15) })

    const d2 = await b.accept(second.id)
    await b.markLoaded(d2.id, 100)
    const late = await b.complete(d2.id, 100 + d2.par + 1)
    expect(late.tip).toBe(0)
    expect(await b.deliveries()).toEqual([])
  })

  it('will not let an order be taken twice', async () => {
    const b = make()
    const [o] = await b.orders()
    await b.accept(o.id)
    await expect(b.accept(o.id)).rejects.toThrow()
  })

  it('puts an abandoned order back on the board', async () => {
    const b = make()
    const [o] = await b.orders()
    const d = await b.accept(o.id)
    await b.abandon(d.id)
    expect((await b.orders()).find((x) => x.id === o.id)?.status).toBe('open')
  })

  it('sells what the player offers at a fair price, and makes the player deliver it', async () => {
    const b = make()
    const fair = fairPrice('plank', 4, 1000)
    const o = await b.postSell('plank', 4, fair)
    expect(await b.poll(10)).toEqual([]) // a buyer takes a few seconds to turn up
    const events = await b.poll(30)
    expect(events).toHaveLength(1)
    const ev = events[0] as Extract<(typeof events)[number], { type: "sold" }>
    expect(ev.delivery.dest).toBeTruthy()
    expect(ev.order.id).toBe(o.id)
  })

  it('leaves an overpriced offer on the board', async () => {
    const b = make()
    const o = await b.postSell('plank', 4, fairPrice('plank', 4, 1000) * 2)
    await b.poll(10)
    expect(await b.poll(600)).toEqual([])
    expect((await b.orders()).find((x) => x.id === o.id)?.status).toBe('open')
    await b.cancelSell(o.id)
    expect((await b.orders()).some((x) => x.id === o.id)).toBe(false)
  })

  it('keeps the board stocked, but never floods it', async () => {
    const b = make(mulberry(7))
    for (let t = 0; t < 3600; t += 10) await b.poll(t)
    const open = (await b.orders()).filter((o) => o.kind === 'buy')
    // (orders nobody takes come down after a while, so the board is never quite full)
    expect(open.length).toBeGreaterThanOrEqual(3)
    expect(open.length).toBeLessThanOrEqual(6)
  })

  it('charges more for more goods and for a longer haul', () => {
    expect(fairPrice('plank', 8, 1000)).toBeGreaterThan(fairPrice('plank', 4, 1000))
    expect(fairPrice('plank', 4, 2000)).toBeGreaterThan(fairPrice('plank', 4, 1000))
    expect(parTime(2000)).toBeGreaterThan(parTime(1000))
  })

  it('sells an island’s own goods to visitors until they run out', async () => {
    const b = make()
    const [iron] = await b.shop('peak')
    expect(iron.item).toBe('ironOre')
    expect(await b.buy('peak', 'ironOre', 4)).toBe(iron.price * 4)
    await expect(b.buy('peak', 'ironOre', 1000)).rejects.toThrow()
  })

  it('survives being saved and loaded', async () => {
    const b = make()
    const [o] = await b.orders()
    await b.accept(o.id)
    await b.postSell('cloth', 2, 50)
    await b.poll(5)
    const copy = new LocalBackend(JSON.parse(JSON.stringify(b.s)), neighbours, () => 0.5)
    expect(await copy.deliveries()).toEqual(await b.deliveries())
    expect(await copy.orders()).toEqual(await b.orders())
    expect((await copy.poll(60)).length).toBe(1) // the buyer still turns up after a reload
  })
})

function mulberry(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
