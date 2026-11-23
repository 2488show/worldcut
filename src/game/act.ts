// Round 19: the little acts — sitting down to a meal, sitting at the computer, a pan on the stove.
// One mechanism for all of them: the pilot gets into place, things appear (a plate, a stool),
// beats fire in time (a bite, a sizzle), and at the end it is all put away again. What an act
// DOES (the food eaten, the dish cooked) is never lost by cutting it short: stop() runs the end.
import { DISHES, FOOD, ITEMS, type ItemId } from './data'
import type { Game } from './game'
import { $t } from '../i18n'

type Actor = Game['pilot']

interface Act {
  kind: 'meal' | 'snack' | 'pc' | 'cook' | 'water' | 'feed'
  t: number
  /** how long; Infinity = until it is stopped (the computer) */
  dur: number
  beats: { at: number; fn: () => void }[]
  props: Actor[]
  /** we sat the pilot down for this: over the moment they are up again */
  sat: boolean
  end?: () => void
}

/** a seated meal does a little more good than one eaten on the hoof */
export const SEATED = 1.1

export class Acts {
  cur: Act | null = null
  /** the last thing the kitchen said (shown in the cooking window) */
  note = ''
  /** the note says it could not be done (shown in red) */
  bad = false
  /** the dish just cooked (the window offers to eat it now) */
  made: ItemId | null = null
  constructor(private g: Game) {}
  get active(): boolean { return !!this.cur }
  is(kind: Act['kind']): boolean { return this.cur?.kind === kind }

  private start(kind: Act['kind'], dur: number, beats: [number, () => void][], opts: { props?: Actor[]; sat?: boolean; end?: () => void } = {}) {
    this.stop()
    this.cur = { kind, t: 0, dur, beats: beats.map(([at, fn]) => ({ at, fn })).sort((a, b) => a.at - b.at), props: opts.props ?? [], sat: !!opts.sat, end: opts.end }
    this.g.changed()
  }
  /** over (or cut short): what it does is done, what it brought out is put away */
  stop() {
    const a = this.cur
    if (!a) return
    this.cur = null
    a.end?.()
    for (const p of a.props) this.g.scene.removeActor(p)
    this.g.changed()
  }
  step(dt: number) {
    const a = this.cur
    if (!a) return
    const g = this.g
    // up and away: the act goes with the seat
    if (a.sat && !g.sitting) return this.stop()
    if (a.kind === 'pc' && a.t > 1 && g.panel?.kind !== 'pc') return this.leavePc()
    if (a.kind === 'cook' && g.panel?.kind !== 'cook') return this.stop()
    a.t += dt
    while (a.beats.length && a.beats[0].at <= a.t) a.beats.shift()!.fn()
    if (this.cur === a && a.t >= a.dur) this.stop()
  }

  // ───────────────────────────────────────────────────────────── eating
  /** eat it: at a table if there is a chair near (it does more good sat down), else where you stand */
  eat(item: ItemId) {
    const g = this.g
    const f = FOOD[item]
    if (!f || g.count(item) < 1) return
    if (g.body.full >= 98) return g.warn($t('吃不下了'))
    if (this.is('meal') || this.is('snack')) return
    const kind = g.sitting?.kind
    if (g.sitting && (kind === undefined || kind === 'seat' || kind === 'soft' || kind === 'low' || kind === 'rock')) return this.meal(item)
    if (g.mode === 'island' && !g.fishing.active && !g.placing && !g.placingItem) {
      if (g.house.active) { if (g.house.sitToEat(() => this.meal(item))) return }
      else if (this.atRestaurant(() => this.meal(item))) return
    }
    this.snack(item)
  }
  /** the restaurant's own table, if it is close by and free */
  private atRestaurant(then: () => void): boolean {
    const g = this.g
    const r = g.restaurant
    const p = g.pilot
    if (!r || g.save.here !== 'home' || g.visits.v?.phase === 'eating' || Math.hypot(r.x - p.x, r.y - p.y) > 90) return false
    g.walkTo({ x: r.x - 6, y: r.y + 12 }, 10, () => {
      g.sitOn({ x: r.x - 6, y: r.y + 2, yaw: Math.PI / 2, z: r.base + 4 }, true)
      then()
    }, true)
    return true
  }
  /** sat down to it: the plate on the table, a few bites, the plate empty */
  private meal(item: ItemId) {
    const g = this.g
    const p = g.pilot
    if (!g.sitting || g.count(item) < 1) return this.snack(item)
    const gain = g.body.eat(item, true, true)
    if (!gain) return
    // the plate: on the table in front if there is one, else on the knees
    const top = g.house.active ? g.house.tableTop(p.x + Math.sin(p.yaw) * 7, p.y - Math.cos(p.yaw) * 7) : g.restaurant && !g.house.active ? g.restaurant.base + 6 : null
    const d = top == null ? 3 : 6
    const at = { x: p.x + Math.sin(p.yaw) * d, y: p.y - Math.cos(p.yaw) * d, z: top ?? p.z + 3 }
    const plate = g.scene.addActor(g.plateFor(item), { ...at, yaw: 0, shadow: false })
    g.sfx('cutlery')
    const bite = (n: number) => () => {
      g.sfx('munch', 1 + n * 0.04)
      p.stretch = 0.9
      g.settle(p)
      g.scene.burst({ kind: 'dust', x: at.x, y: at.y, z: at.z + 2, n: 2, speed: 4, up: 8, life: 0.35, grav: 30, r: 1 })
    }
    this.start('meal', 2.7, [[0.35, bite(0)], [0.85, bite(1)], [1.35, bite(2)], [1.85, bite(3)],
      [2.2, () => { plate.model = g.scene.models[g.plateFor('' as ItemId)]; g.sfx('cutlery', 1.3) }]], {
      props: [plate], sat: true,
      end: () => {
        g.sfx('yum')
        g.scene.burst({ kind: 'heart', x: p.x, y: p.y, z: p.z + 12, n: 4, speed: 8, up: 16, life: 0.8, mode: 'float', r: 3 })
        g.float($t('{0} · 体力 +{1} · 坐着吃更顶饿', ITEMS[item].name, gain), p.x, p.y, p.z + 16)
      },
    })
  }
  /** on the hoof: a couple of quick bites */
  private snack(item: ItemId) {
    const g = this.g
    const p = g.pilot
    const gain = g.body.eat(item, false, true)
    if (!gain) return
    const bite = (n: number) => () => { g.sfx('munch', 1.1 + n * 0.05); p.stretch = 0.88; g.settle(p) }
    this.start('snack', 0.9, [[0, bite(0)], [0.3, bite(1)], [0.6, bite(2)]], {
      end: () => {
        g.scene.burst({ kind: 'heart', x: p.x, y: p.y, z: p.z + 12, n: 3, speed: 8, up: 16, life: 0.7, mode: 'float', r: 3 })
        g.float($t('{0} · 体力 +{1}', ITEMS[item].name, gain), p.x, p.y, p.z + 14)
      },
    })
  }

  // ───────────────────────────────────────────────────────────── the field
  /** the can tipped over the row: the water falls on one plot after another */
  water(spots: { x: number; y: number; z: number }[]) {
    const g = this.g
    const p = g.pilot
    if (!spots.length) return
    g.face(Math.atan2(spots[0].x - p.x, -(spots[0].y - p.y)), 1)
    g.sfx('pour')
    const fall = (s: { x: number; y: number; z: number }) => () => {
      g.scene.burst({ kind: 'water', x: s.x, y: s.y, z: s.z + 9, n: 9, speed: 5, up: -4, life: 0.5, grav: 60, r: 3 })
      g.after(0.22, () => { g.scene.burst({ kind: 'water', x: s.x, y: s.y, z: s.z + 2, n: 5, speed: 9, up: 9, life: 0.35, r: 2 }); g.sfx('drip', 0.9 + Math.random() * 0.3) })
    }
    const dur = 0.7 + spots.length * 0.16
    this.start('water', dur, [[0.1, () => { p.stretch = 0.92; g.settle(p) }], ...spots.map((s, i) => [0.2 + i * 0.16, fall(s)] as [number, () => void])])
  }
  /** fertiliser shaken out of the sack onto the plot */
  feed(s: { x: number; y: number; z: number }) {
    const g = this.g
    const p = g.pilot
    g.face(Math.atan2(s.x - p.x, -(s.y - p.y)), 1)
    const shake = (v: number) => () => {
      g.sfx('scatter', v)
      p.stretch = 0.93
      g.settle(p)
      g.scene.burst({ kind: 'dust', x: s.x, y: s.y, z: s.z + 8, n: 7, speed: 5, up: -2, life: 0.45, grav: 50, r: 3 })
    }
    this.start('feed', 0.95, [[0.1, shake(1)], [0.35, shake(1.12)], [0.6, shake(0.94)]], {
      end: () => {
        g.sfx('sprout')
        g.scene.burst({ kind: 'spark', x: s.x, y: s.y, z: s.z + 2, n: 8, speed: 8, up: 10, life: 0.6, mode: 'float', grav: 0, r: 2 })
      },
    })
  }

  // ───────────────────────────────────────────────────────────── the computer
  /** sit down at it (a stool comes out from under the desk), it starts up, the desktop opens */
  sitAtPc(app?: string) {
    const g = this.g
    const p = g.pilot
    const fz = g.house.fz
    const stool = g.scene.addActor('i_stool', { x: p.x, y: p.y, z: fz, yaw: p.yaw, shadow: true })
    g.sitOn({ x: p.x, y: p.y, yaw: p.yaw, z: fz + 3 }, true)
    g.sfx('boot')
    const key = (v: number) => () => g.sfx('key', v)
    this.start('pc', Infinity, [[0.45, key(1)], [0.56, key(1.1)], [0.7, key(0.95)], [0.8, () => g.open({ kind: 'pc', app })]], { props: [stool], sat: true })
  }
  /** the computer closed: the screen goes dark and the pilot gets up */
  leavePc() {
    const g = this.g
    if (!this.is('pc')) return
    g.sfx('shutdown')
    this.stop()
    g.standUp()
  }

  // ───────────────────────────────────────────────────────────── the stove
  /** why it cannot be cooked (nothing = it can) */
  cannotCook(out: ItemId): string {
    const g = this.g
    const d = DISHES.find((x) => x.out === out)
    if (!d) return $t('不会做这个')
    const short = (Object.keys(d.cost) as ItemId[]).filter((id) => g.count(id) < (d.cost[id] ?? 0)).map((id) => `${ITEMS[id].name} ×${(d.cost[id] ?? 0) - g.count(id)}`)
    if (short.length) return $t('还缺：{0}', short.join($t('、')))
    if (!g.fits({ [out]: 1 })) return $t('做好的装不下：背包和仓库都满了')
    return ''
  }
  /** a dish: into the pan, a stir or two, and out */
  cook(out: ItemId) {
    const g = this.g
    if (this.is('cook')) return
    const no = this.cannotCook(out)
    if (no) { this.note = no; this.bad = true; this.made = null; g.sfx('error'); return g.changed() }
    const p = g.pilot
    const at = { x: p.x + Math.sin(p.yaw) * 6, y: p.y - Math.cos(p.yaw) * 6, z: p.z + 10 }
    const stir = (v: number) => () => {
      g.sfx('stir', v)
      p.stretch = 0.92
      g.settle(p)
      g.scene.burst({ kind: 'steam', x: at.x, y: at.y, z: at.z, n: 4, speed: 4, up: 12, life: 0.9, mode: 'smoke', grav: -6, r: 2 })
    }
    this.note = $t('正在做{0}…', ITEMS[out].name)
    this.bad = false
    this.made = null
    g.sfx('sizzle')
    this.start('cook', 1.2, [[0.3, stir(1)], [0.6, stir(1.15)], [0.9, stir(0.95)]], {
      end: () => {
        const had = g.count(out)
        g.body.cook(out)
        const n = g.count(out) - had
        this.made = n > 0 ? out : null
        this.note = n > 0 ? $t('做好了：{0}{1}', ITEMS[out].name, n > 1 ? $t(' ×{0}（熟手多做了一份）', n) : '') : ''
      },
    })
  }
}
