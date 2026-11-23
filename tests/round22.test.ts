// Round 22: fighting the sky pirates. The gun mount (level 5, planes only); a sortie to a sea that
// ends when enough are brought down (and the sea is clear for three days); a missile thrown off
// by a roll at the right moment; shot down, the pilot is brought home and nobody is hurt.
import { describe, expect, it } from 'vitest'
import { give } from '../src/game/data'
import { FOES, SEAS } from '../src/game/combat'
import { headless } from './harness'

type G = ReturnType<typeof headless>['g']
/** a plane with the gun mount, at level 5 */
async function armed(level = 5) {
  const h = headless()
  const { g, run } = h
  g.close(); g.body.tireless = true
  g.save.level = level
  g.save.coins = 5000
  give(g.save.inv, { plank: 20, cloth: 8, copperIngot: 10, ironIngot: 10 })
  g.buildVehicle('sparrow'); await run(3)
  return h
}
/** steer at a point (the bearing the HUD gives) */
function steer(g: G, x: number, y: number) {
  const a = g.scene.lead!
  const dx = g.world.delta(x, a.x), dy = g.world.delta(y, a.y)
  const hh = g.scene.heading
  const b = Math.atan2(dx * Math.cos(hh) - dy * Math.sin(hh), -dx * Math.sin(hh) - dy * Math.cos(hh))
  g.scene.setKeys(Math.max(-1, Math.min(1, b * 2)), 0, false)
}

describe('round 22: the gun mount', () => {
  it('only on a plane, only from level 5', async () => {
    const { g } = await armed(4)
    const v = g.save.vehicles[0]
    expect(g.upgradeBlock(v.id, 'guns')).toBe('岛 5 级解锁')
    g.save.level = 5
    expect(g.upgradeBlock(v.id, 'guns')).toBe('')
    g.buyUpgrade(v.id, 'guns')
    expect(v.up).toContain('guns')
  })
})

describe('round 22: a sortie', () => {
  it('out to the sea, the sky pirates come, the cannon and missiles bring them down; won, the sea is clear', async () => {
    const { g, run, settle } = await armed()
    const v = g.save.vehicles[0]
    g.buyUpgrade(v.id, 'guns')
    await g.sortie(v.id, 'peak'); await settle()
    await run(12, () => g.flight?.phase === 'cruise')
    expect(g.combat.armed).toBe(true)
    expect(g.combat.sortie?.need).toBe(SEAS.peak.need)
    // the pilot: fly at the sea, then at the nearest sky pirate, fire when the nose is on it,
    // missiles when locked, roll when a missile is about to strike
    let fired = 0
    const ok = await run(300, () => {
      const c = g.combat
      const s = c.sortie!
      if (s.won || c.downT >= 0) return true
      g.combat.hull = Math.max(g.combat.hull, 60) // (a test pilot who does not get shot down)
      const foe = c.foes[0]
      if (foe) {
        steer(g, foe.a.x, foe.a.y)
        c.fire(true)
        if (c.locked && c.missilesLeft > 0) { c.missile(); fired++ }
      } else { c.fire(false); steer(g, s.at.x, s.at.y) }
      return false
    })
    expect(ok).toBe(true)
    const s = g.combat.sortie!
    expect(s.won).toBe(true)
    expect(s.downed).toBe(SEAS.peak.need)
    void fired
    expect(g.combat.cleared('peak')).toBe(true)
    expect(g.save.stats.sorties).toBe(1)
    expect(g.flight!.dest).toBe('home') // and the way home is marked
  }, 300000)

  it('a missile coming in: a roll at the moment the rings meet throws it off, and the next missile fires three', async () => {
    const { g, run, settle } = await armed()
    const v = g.save.vehicles[0]
    g.buyUpgrade(v.id, 'guns')
    await g.sortie(v.id, 'reef'); await settle()
    await run(12, () => g.flight?.phase === 'cruise')
    const c = g.combat as never as { launch: (x: number, y: number, z: number, yaw: number, mine: boolean, t: null) => void; incoming: number | null; hull: number; view: () => { counter: boolean } }
    const a = g.scene.lead!
    // a missile from behind
    c.launch(a.x - Math.sin(a.yaw) * 260, a.y + Math.cos(a.yaw) * 260, a.z, a.yaw, false, null)
    const hull = c.hull
    expect(await run(6, () => c.incoming !== null && c.incoming < 0.45)).toBe(true)
    g.scene.startRoll()
    await run(3)
    expect(c.hull).toBe(hull) // it missed
    expect(g.save.stats.dodged).toBe(1)
  }, 120000)

  it('shot down: a parachute, home, the plane worn; nobody hurt, nothing lost', async () => {
    const { g, run, settle } = await armed()
    const v = g.save.vehicles[0]
    g.buyUpgrade(v.id, 'guns')
    const coins = g.save.coins
    await g.sortie(v.id, 'dune'); await settle()
    await run(12, () => g.flight?.phase === 'cruise')
    ;(g.combat as never as { hurt: (n: number, x: number, y: number, z: number) => void }).hurt(200, 0, 0, 0)
    expect(g.combat.view().down).toBe(true)
    expect(await run(8, () => g.mode === 'island')).toBe(true)
    await settle()
    expect(g.save.here).toBe('home')
    expect(g.save.coins).toBe(coins)
    expect(v.wear!.hull).toBeLessThan(1)
  }, 120000)

  it('the foes: tougher kinds last longer', () => {
    expect(FOES.skiff.hp).toBeLessThan(FOES.gunboat.hp)
    expect(FOES.gunboat.hp).toBeLessThan(FOES.boss.hp)
  })
})

describe('round 22: fighting back on a delivery', () => {
  it('the sky pirate chasing an armed plane can be shot down: it drops a crate, nothing is robbed', async () => {
    const { g, run, settle } = await armed()
    const v = g.save.vehicles[0]
    g.buyUpgrade(v.id, 'guns')
    g.save.stats.delivered = 6
    ;(g.backend as never as { addBuy(i: string, item: string, q: number, n: number): void }).addBuy('dune', 'plank', 4, 0)
    give(g.save.inv, { plank: 4 })
    await g.refresh()
    const o = g.orders.find((x) => x.island === 'dune' && x.qty === 4)!
    await g.acceptOrder(o.id)
    await g.depart(v.id, 'dune'); await settle()
    await run(10, () => g.flight?.phase === 'cruise')
    ;(g.voyage as never as { pirateAt: number }).pirateAt = 0.01
    expect(await run(10, () => !!g.voyage.pirateActor)).toBe(true)
    const won = await run(60, () => {
      const p = g.voyage.pirateActor
      if (!p) return true
      steer(g, p.x, p.y)
      g.combat.fire(true)
      return false
    })
    expect(won).toBe(true)
    expect(g.voyage.robbed).toBeNull()
    expect(g.save.stats.downed).toBe(1)
  }, 120000)
})
