// The island's life: creatures to catch, rain, the farm, pets, benches, barter, and the level ladder.
import { describe, expect, it } from 'vitest'
import { give } from '../src/game/data'
import { headless } from './harness'

describe('island life', () => {
  it('creatures turn up, and a net catches them into the book', async () => {
    const { g, run, settle } = headless()
    g.close()
    g.save.level = 2
    give(g.save.inv, { net: 1 })
    await run(12)
    expect(g.life.critters.length).toBeGreaterThan(0)
    // stand still beside one and swing: caught
    let caught = 0
    for (let tries = 0; tries < 12 && !caught; tries++) {
      const c = g.life.critters.find((x) => x.flee < 0)
      if (!c) { await run(3); continue }
      g.pilot.x = c.a.x + 4; g.pilot.y = c.a.y + 4
      ;(g.life as never as { swingAt(c: unknown): void }).swingAt(c)
      await run(0.5); await settle()
      caught = g.save.stats.caught ?? 0
    }
    expect(caught).toBeGreaterThan(0)
    expect(g.critterKinds()).toBeGreaterThan(0)
    // rain brings out the snails, and hides the butterflies
    g.life.setRain(true, 200)
    for (const c of g.life.critters) c.flee = 99
    await run(20)
    expect(g.life.critters.every((c) => c.def.rain !== 'no')).toBe(true)
  }, 60000)

  it('the farm: plant, rain speeds it, harvest', async () => {
    const { g, run, tick } = headless()
    g.close()
    g.save.level = 1
    g.save.coins = 1000
    g.save.stats.delivered = 1
    g.save.decor = [{ item: 'bench', dx: 0, dy: 60 }]
    g.levelUp()
    expect(g.level).toBe(2)
    expect(g.farm.beds.length).toBe(4)
    expect(g.count('carrotSeed')).toBe(6) // seeds come with the first beds (in the warehouse)
    expect(g.count('wateringCan')).toBe(1) // and a watering can
    g.withdraw('carrotSeed', 6)
    const bed = g.farm.beds[0]
    expect(bed.s).toBe(0) // waste ground at first
    g.farm.use(bed) // cleared
    expect(bed.s).toBe(1)
    g.farm.use(bed) // planted
    expect(bed.seed).toBe('carrotSeed')
    expect(g.carried('carrotSeed')).toBe(5)
    // not watered: it does not grow
    g.save.played = (g.save.played ?? 0) + 300; await run(0.5)
    expect(g.farm.progress(bed)).toBe(0)
    g.farm.use(bed) // watered (the whole row that is tilled)
    expect(g.farm.isWet(bed)).toBe(true)
    g.save.played! += 250; await run(0.5)
    expect(g.farm.progress(bed)).toBeGreaterThan(0.3)
    expect(g.farm.progress(bed)).toBeLessThan(1)
    g.save.played! += 400; await run(0.5)
    expect(g.farm.progress(bed)).toBe(1)
    g.farm.use(bed)
    expect(bed.seed).toBeUndefined()
    expect(g.carried('carrot')).toBe(3)
    expect(g.save.stats.harvested).toBe(1)
  }, 60000)

  it('pets: fed three times, a wild one comes home; it follows and brings presents', async () => {
    const { g, run, settle, tick } = headless()
    g.close()
    await run(1)
    expect(g.pets.wild.length).toBeGreaterThan(0)
    const w = g.pets.wild.find((x) => x.sp === 'rabbit') ?? g.pets.wild[0]
    const food = w.sp === 'rabbit' ? 'carrot' : 'wheat'
    // not yet: no room for pets below level 3
    ;(g.pets as never as { approach(w: unknown): void }).approach(w)
    expect(g.toasts.some((t) => t.text.includes('3 级'))).toBe(true)
    g.save.level = 3
    give(g.save.inv, { [food]: 5 })
    for (let i = 0; i < 3; i++) {
      ;(g.pets as never as { feed(w: unknown): void }).feed(w)
      await run(0.2); await settle()
    }
    expect(g.save.pets?.length).toBe(1)
    const pet = g.save.pets![0]
    expect(pet.follow).toBe(true)
    expect(g.save.petSeen?.[pet.sp + ':' + pet.col]).toBe(2)
    expect(g.carried(food)).toBe(2)
    // it follows
    const t = g.pets.tame[0]
    g.walkTo({ x: g.pilot.x + 60, y: g.pilot.y }, 1, null, true)
    await run(6)
    expect(Math.hypot(t.a.x - g.pilot.x, t.a.y - g.pilot.y)).toBeLessThan(20)
    // a present, in time
    tick(600)
    const before = Object.values(g.save.inv).reduce((a, b) => a + (b ?? 0), 0)
    ;(g.pets as never as { pat(t: unknown): void }).pat(t)
    const after = Object.values(g.save.inv).reduce((a, b) => a + (b ?? 0), 0)
    expect(after).toBeGreaterThan(before)
    // a full house
    const w2 = g.pets.wild[0]
    if (w2) {
      ;(g.pets as never as { approach(w: unknown): void }).approach(w2)
      expect(g.toasts.some((x) => x.text.includes('宠物位满了'))).toBe(true)
    }
  }, 60000)

  it('benches to sit on, lights after dark, barter with an islander', async () => {
    const { g, run, settle, flyTo } = headless()
    g.close()
    g.save.decor = [{ item: 'bench', dx: -30, dy: 46 }]
    g.save.here = 'home'
    ;(g as never as { build(): void }).build()
    await run(0.5)
    expect(g.benches.length).toBe(1)
    const b = g.benches[0]
    ;(g as never as { sit(b: unknown): void }).sit(b)
    expect(g.sitting).toBeTruthy()
    expect(g.pilot.model.name).toBe('pilot_sit')
    await run(1)
    expect(g.sitting).toBeTruthy()
    g.walkTo({ x: g.pilot.x + 20, y: g.pilot.y + 10 }, 1, null, true)
    await run(0.5)
    expect(g.sitting).toBeNull()
    // windows light up after dark
    const house = g.scene.models.houseBlue as { pal: Uint32Array; lit: { idx: number }[] }
    const idx = house.lit[0].idx
    g.setClock(0.3); await run(0.3) // (at first light the lamps are still on)
    const day = house.pal[idx]
    g.setClock(0.8); await run(0.3)
    expect(house.pal[idx]).not.toBe(day)
    g.setClock(0.2); await run(0.3)
    // barter: wheat for the peak's iron ore, no coins
    g.devGive(); g.close()
    give(g.save.inv, { plank: 10, cloth: 6, copperIngot: 6 })
    g.buildVehicle('sparrow')
    await run(3); await settle()
    await flyTo(g.save.vehicles[0].id, 'peak')
    // a trip wears the engine and the paint a little
    expect(g.save.vehicles[0].wear!.engine).toBeLessThan(1)
    expect(g.save.vehicles[0].wear!.paint).toBeLessThan(1)
    g.close()
    await g.refresh()
    // (whatever the flight picked up goes to the warehouse: the pockets need a free slot)
    for (const k of ['plank', 'cloth', 'copperIngot', 'copperOre'] as const) delete g.save.inv[k]
    give(g.save.inv, { carrot: 20 })
    const coins = g.save.coins
    const offer = g.barterOffer('ironOre')
    expect(offer).toBeTruthy()
    await g.barter('ironOre'); await settle()
    expect(g.save.coins).toBe(coins)
    expect(g.carried('ironOre')).toBeGreaterThan(0)
  }, 120000)
})
