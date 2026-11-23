// A game with no screen, for the tests: a clock that only moves when told to, a fixed run of
// random numbers, and a pilot who can be told to fly somewhere.
import { Game, type GameOptions } from '../src/game/game'
import { cottageSave } from '../src/game/house'

/** `home`: the house the game starts with — most tests are about the cottage (five rooms, round 12–15); a new game's is the cabin */
export function headless(opts: GameOptions = {}, start = 1000, home: 'cottage' | 'hut' = 'cottage') {
  let clock = start
  let seed = 777
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const g = new Game({ now: () => clock, rnd, seed: 4242, ...opts })
  g.scene.resize(427, 267)
  // the long runs are not about strength or bedtime (those have tests of their own)
  g.body.tireless = true
  g.body.stayAwake = true
  g.visits.enabled = false
  if (home === 'cottage' && !opts.save) {
    g.save.home = cottageSave()
    g.house.attach()
    g.mail.build()
  }
  const fx: string[] = []
  g.onFx = (e) => fx.push(e.t === 'sfx' ? e.name : e.t === 'celebrate' ? 'celebrate' + e.level : e.t)
  async function run(sec: number, until?: () => boolean) {
    for (let i = 0; i < Math.ceil(sec * 30); i++) {
      clock += 1 / 30
      g.update(1 / 30)
      g.scene.render() // (the view, and so the heading read-outs, are worked out when a frame is drawn)
      if (i % 15 === 0) await Promise.resolve()
      if (until && until()) return true
    }
    return !until
  }
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  /** takes the vehicle to an island: steers at the marker, lands when the runway is in reach */
  async function flyTo(vehicleId: string, dest: string) {
    await g.depart(vehicleId, dest); await settle()
    await run(12, () => g.flight?.phase === 'cruise')
    let tick = 0
    const there = await run(300, () => {
      const h = g.hud()
      if (!h) return true
      if ((globalThis as unknown as { FLYLOG?: boolean }).FLYLOG && tick++ % 150 === 0) console.log('fly', dest, Math.round(h.dist), h.bearing.toFixed(2), JSON.stringify(h.voyage?.pirate ?? null), g.scene.lead?.yaw?.toFixed(2), g.scene.lead?.x?.toFixed(0), g.scene.lead?.y?.toFixed(0))
      g.scene.setKeys(Math.max(-1, Math.min(1, h.bearing * 2)), 0, false)
      return g.flight?.canLand === dest && h.dist < 190
    })
    if (!there) {
      const h = g.hud()
      throw new Error('never got near ' + dest + ' ' + JSON.stringify({ mode: g.mode, flight: g.flight, dist: h?.dist, bearing: h?.bearing, here: g.save.here, panel: g.panel?.kind }))
    }
    g.land()
    await run(45, () => g.mode === 'island'); await settle(); await run(0.4); await settle()
  }
  return { g, run, settle, fx, flyTo, tick: (s: number) => { clock += s } }
}
