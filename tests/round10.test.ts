// Round 10: the stock machine; clothes with a cut, dyed, and a raincoat in the rain; postcards; the seasons.
import { describe, expect, it } from 'vitest'
import { give } from '../src/game/data'
import { COMPANIES, TICK } from '../src/game/stocks'
import { seasonAt, seasonIdOn, weatherFor, SEASON_DAYS } from '../src/game/season'
import { personModel, readLook, DEFAULT_LOOK } from '../src/engine/avatar'
import { isCard } from '../src/game/online'
import { headless } from './harness'

describe('round 10', () => {
  it('the stock machine: prices move each game hour, buy and sell with a fee, history kept', async () => {
    const { g, run } = headless()
    g.close()
    g.save.coins = 1000
    const st = g.stocks
    // opened for the first time: five days of history already
    expect(st.save.hours.ore.length).toBeGreaterThan(24 * 4)
    const p0 = st.price('ore')
    expect(p0).toBeGreaterThan(0)
    // buy ten: price × 10 and 1%
    const cost = st.costOf('ore', 10)
    expect(cost).toBe(Math.ceil(p0 * 10 + Math.max(1, p0 * 10 * 0.01)))
    expect(st.buy('ore', 10)).toBe(true)
    expect(g.save.coins).toBe(1000 - cost)
    expect(st.held('ore')).toBe(10)
    // can't buy more than the purse holds
    const max = st.maxBuy('spice')
    expect(st.costOf('spice', max)).toBeLessThanOrEqual(g.save.coins)
    expect(st.costOf('spice', max + 1)).toBeGreaterThan(g.save.coins)
    // an hour on: new prices
    const hours = st.save.hours.ore.length
    g.save.played = (g.save.played ?? 0) + TICK * 3
    await run(0.1)
    expect(st.save.hours.ore.length).toBe(Math.min(240, hours + 3))
    // sell: coins back, less the fee; the holding gone
    const before = g.save.coins
    expect(st.sell('ore', 10)).toBe(true)
    expect(st.held('ore')).toBe(0)
    expect(g.save.coins).toBeGreaterThan(before)
    // the same island sees the same market
    const { g: g2 } = headless()
    expect(g2.stocks.save.hours.wood.slice(0, 20)).toEqual(headless().g.stocks.save.hours.wood.slice(0, 20))
    expect(COMPANIES.length).toBe(5)
  })

  it('the stock machine: a delivery to an island lifts its company', async () => {
    const { g, run } = headless()
    g.close()
    const fair = g.stocks.save.fair.ore
    g.save.friends = { ...(g.save.friends ?? {}), peak: (g.save.friends?.peak ?? 0) + 2 }
    g.save.played = (g.save.played ?? 0) + TICK
    await run(0.1)
    expect(g.stocks.save.fair.ore).toBeGreaterThan(fair * 1.05)
    // and the stock machine is in the house from the start
    expect(g.house.save.pieces.some((p) => p.item === 'computer')).toBe(true) // (round 13: the computer, on the desk)
  })

  it('the seasons: spring first, snow only in winter, the leaves turn slowly', () => {
    expect(seasonIdOn(0)).toBe('spring')
    expect(seasonIdOn(SEASON_DAYS)).toBe('summer')
    expect(seasonIdOn(SEASON_DAYS * 3)).toBe('winter')
    expect(seasonIdOn(SEASON_DAYS * 4)).toBe('spring')
    for (let r = 0; r < 1; r += 0.01) {
      expect(weatherFor(3, r)).not.toBe('snow')
      expect(weatherFor(SEASON_DAYS * 2 + 3, r)).not.toBe('snow')
    }
    let snow = 0
    for (let r = 0; r < 1; r += 0.01) if (weatherFor(SEASON_DAYS * 3 + 2, r) === 'snow') snow++
    expect(snow).toBeGreaterThan(30)
    // autumn comes on over two days, and goes as winter comes
    expect(seasonAt(SEASON_DAYS * 2).autumn).toBe(0)
    expect(seasonAt(SEASON_DAYS * 2 + 1).autumn).toBeGreaterThan(0.3)
    expect(seasonAt(SEASON_DAYS * 2 + 3).autumn).toBe(1)
    expect(seasonAt(SEASON_DAYS * 3 + 2).winter).toBe(1)
    expect(seasonAt(SEASON_DAYS * 3 + 2).autumn).toBe(0)
  })

  it('clothes: cuts, a raincoat when it rains outside, dyes spent at the wardrobe', async () => {
    const { g, run } = headless()
    g.close()
    // each cut draws differently
    const shapes = new Set<string>()
    for (const top of ['tee', 'sweater', 'jacket', 'dress'] as const) {
      const m = personModel({ ...DEFAULT_LOOK, top }, 't', 'stand')
      shapes.add(m.slices.map((sl) => Array.from(sl).join('')).join('|'))
    }
    expect(shapes.size).toBe(4)
    expect(readLook({ ...DEFAULT_LOOK, top: 'dress', bottom: 'nope' }).bottom).toBe('trousers')
    // rain outside: the raincoat goes on; indoors it comes off
    g.weather.force('rain', 120)
    await run(6)
    expect(g.wornLook.raincoat).toBe(true)
    const h = g.here.buildings.find((b) => b.kind === 'house')!
    g.pilot.x = h.door.x; g.pilot.y = h.door.y
    g.house.enter()
    await run(0.2)
    expect(g.wornLook.raincoat).toBeFalsy()
    g.house.exit()
    // a dye for each colour from the paint shop
    give(g.save.inv, { dyeRed: 1 })
    expect(g.count('dyeRed')).toBe(1)
   }, 20000)

  it('postcards: one goes with a delivery to an islander, and they write back with it', async () => {
    const card = 'data:image/jpeg;base64,AAAA'
    expect(isCard(card)).toBe(true)
    expect(isCard('javascript:alert(1)')).toBe(false)
    expect(isCard('data:image/svg+xml;base64,AAAA')).toBe(false)
    const { g, run, settle, flyTo } = headless()
    g.close()
    g.devGive(); g.close()
    give(g.save.inv, { plank: 10, cloth: 6, copperIngot: 6 })
    g.buildVehicle('sparrow')
    await run(3); await settle()
    // take an order for the peak and fly it there with a postcard
    await g.refresh()
    const o = g.orders.find((x) => x.island === 'peak' && x.kind === 'buy')!
    expect(o).toBeTruthy()
    give(g.save.inv, { [o.item]: o.qty })
    await g.acceptOrder(o.id); await settle()
    g.postcard = card
    const friends = g.save.friends?.peak ?? 0
    await flyTo(g.save.vehicles[0].id, 'peak')
    await run(1); await settle()
    expect(g.save.stats.delivered).toBeGreaterThan(0)
    expect(g.save.stats.postcards).toBe(1)
    expect(g.save.friends!.peak).toBeGreaterThanOrEqual(friends + 2)
    expect(g.postcard).toBeNull()
    g.save.played = (g.clockDay + 1) * 1200 + 10
    await run(0.2)
    expect(g.mail.letters.some((l) => l.kind === 'postcard' && l.photo === card)).toBe(true)
  }, 120000)
})
