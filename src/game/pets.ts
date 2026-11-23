// Pets. Every island has its own animals — a couple of species, roaming near the village, each
// one in a colour that is mostly plain and now and then rare (a pink sheep, a blue dog). Feed one
// what it likes, a few times, and it is yours: it lives on your island, one of them follows you
// about (even abroad), and each brings you something now and then. The island's level decides
// how many can live there. Breeding (colours passed on by inheritance) comes at level 6, and
// trading them with other players with the market server.

import type { Game } from './game'
import { ITEMS, give, type Bag, type ItemId } from './data'
import { PET_SPECIES, petModel, type PetColour } from '../engine/petdefs'
import { canPlace } from './world'
import { $t } from '../i18n'

type Actor = Game['pilot']

export interface SpeciesRule {
  /** what wins it over */
  food: ItemId
  /** what it brings, and how often (seconds) */
  gift: () => Bag
  every: number
  /** a word on it, for the journal */
  note: string
}
export const PET_RULES: Record<string, SpeciesRule> = {
  rabbit: { food: 'carrot', every: 240, note: $t('会在地里刨出种子。'), gift: () => ({ [['carrotSeed', 'wheatSeed', 'strawberrySeed'][Math.floor(Math.random() * 3)]]: 1 }) },
  chicken: { food: 'wheat', every: 200, note: $t('每隔一阵下一个蛋。'), gift: () => ({ egg: 1 }) },
  sheep: { food: 'wheat', every: 300, note: $t('毛长了就能剪：两份羊毛织一块帆布。'), gift: () => ({ wool: 2 }) },
  goat: { food: 'berry', every: 300, note: $t('爱往石头缝里钻，偶尔叼回煤块。'), gift: () => (Math.random() < 0.2 ? { copperOre: 1 } : { coal: 1 }) },
  dog: { food: 'sardine', every: 260, note: $t('跟着你时会刨出地下的东西。'), gift: () => ({ [['stick', 'pebble', 'shell', 'copperOre', 'pearl'][Math.min(4, Math.floor(Math.random() * Math.random() * 6))]]: 1 }) },
  cat: { food: 'sardine', every: 280, note: $t('会从码头叼回一条鱼。'), gift: () => ({ [Math.random() < 0.8 ? 'sardine' : 'bream']: 1 }) },
  fox: { food: 'strawberry', every: 420, note: $t('彼岸的狐狸，偶尔带回发光的石头。'), gift: () => (Math.random() < 0.25 ? { crystal: 1 } : { berry: 2 }) },
}
/** which animals live on which island, and the colour each island's breed tends to */
export const ISLAND_PETS: Record<string, { sp: string; bias?: string }[]> = {
  home: [{ sp: 'rabbit' }, { sp: 'chicken' }],
  peak: [{ sp: 'sheep', bias: 'black' }, { sp: 'goat' }],
  pine: [{ sp: 'dog', bias: 'grey' }, { sp: 'rabbit', bias: 'brown' }],
  reef: [{ sp: 'cat', bias: 'white' }, { sp: 'chicken', bias: 'gold' }],
  dune: [{ sp: 'goat', bias: 'gold' }, { sp: 'cat', bias: 'orange' }],
  far: [{ sp: 'fox', bias: 'arctic' }],
}
export const rarityOf = (col: PetColour) => (col.weight <= 2 ? 2 : col.weight <= 6 ? 1 : 0)
export const RARITY_STARS = ['', $t('★ 少见'), $t('★★ 稀有')]

export interface Pet { id: string; sp: string; col: string; from: string; giftAt: number; follow?: boolean }

interface Wild { sp: string; col: string; a: Actor; trust: number; home: { x: number; y: number }; to: { x: number; y: number } | null; wait: number; t: number }
interface Tame { pet: Pet; a: Actor; to: { x: number; y: number } | null; wait: number; t: number }

const TRUST_PER_MEAL = 34
const FOLLOW = 9

export class Pets {
  wild: Wild[] = []
  tame: Tame[] = []
  private builtFor = ''
  constructor(private g: Game) {}

  get owned(): Pet[] {
    return (this.g.save.pets ??= [])
  }
  colour(sp: string, col: string): PetColour {
    return PET_SPECIES[sp].colours.find((c) => c.id === col) ?? PET_SPECIES[sp].colours[0]
  }
  /** what the journal knows: seen in the wild (1), or owned (2) */
  mark(sp: string, col: string, n: 1 | 2) {
    const seen = (this.g.save.petSeen ??= {})
    const k = sp + ':' + col
    if ((seen[k] ?? 0) < n) seen[k] = n
  }

  clear() {
    for (const w of this.wild) this.g.scene.removeActor(w.a)
    for (const t of this.tame) this.g.scene.removeActor(t.a)
    this.wild = []
    this.tame = []
    this.builtFor = ''
  }

  /** the animals of the island the pilot is on: its wild ones, and (at home) the pets */
  private build() {
    const g = this.g
    const lay = g.here
    this.builtFor = lay.def.id + ':' + lay.def.r + ':' + g.clockDay
    for (const w of this.wild) g.scene.removeActor(w.a)
    for (const t of this.tame) g.scene.removeActor(t.a)
    this.wild = []
    this.tame = []
    if (lay.def.wild || lay.def.guest) return
    // wild ones: three or four, about the village's edge
    const kinds = ISLAND_PETS[lay.def.id] ?? []
    const n = kinds.length ? 3 + Math.floor(g.rnd() * 2) : 0
    for (let i = 0; i < n; i++) {
      const k = kinds[i % kinds.length]
      const at = this.spot(lay.plaza.x, lay.plaza.y, 30, 70)
      if (!at) break
      const col = this.roll(k.sp, k.bias)
      const a = g.scene.addActor(petModel(k.sp, col.id), { x: at.x, y: at.y, z: g.world.heightAt(at.x, at.y), yaw: g.rnd() * 6.28, shadow: false, reach: 500 })
      this.wild.push({ sp: k.sp, col: col.id, a, trust: 0, home: at, to: null, wait: g.rnd() * 3, t: 0 })
      this.mark(k.sp, col.id, 1)
    }
    // one's own: at home all of them; abroad, the one that follows
    for (const pet of this.owned) {
      if (!lay.def.home && !pet.follow) continue
      const near = lay.def.home && !pet.follow ? this.spot(lay.plaza.x, lay.plaza.y, 10, 40) : this.spot(g.pilot.x, g.pilot.y, 6, 14)
      if (!near) continue
      const a = g.scene.addActor(petModel(pet.sp, pet.col), { x: near.x, y: near.y, z: g.world.heightAt(near.x, near.y), yaw: g.rnd() * 6.28, shadow: false, reach: 600 })
      this.tame.push({ pet, a, to: null, wait: 1, t: 0 })
    }
  }
  private spot(cx: number, cy: number, r0: number, r1: number) {
    const g = this.g
    for (let i = 0; i < 30; i++) {
      const a = g.rnd() * Math.PI * 2
      const r = r0 + g.rnd() * (r1 - r0)
      const x = Math.round(cx + Math.cos(a) * r)
      const y = Math.round(cy + Math.sin(a) * r)
      if (canPlace(g.world, 2, 2, x, y)) return { x, y }
    }
    return null
  }
  /** a colour, by how common each is (the island's own breed comes up three times as often) */
  roll(sp: string, bias?: string): PetColour {
    const g = this.g
    const cols = PET_SPECIES[sp].colours
    const w = (c: PetColour) => c.weight * (c.id === bias ? 3 : 1)
    let sum = 0
    for (const c of cols) sum += w(c)
    let r = g.rnd() * sum
    for (const c of cols) if ((r -= w(c)) <= 0) return c
    return cols[0]
  }

  step(dt: number) {
    const g = this.g
    const on = g.mode === 'island' && g.onSurface && !g.mine.active && !g.dive.active
    if (!on) return
    const lay = g.here
    if (this.builtFor !== lay.def.id + ':' + lay.def.r + ':' + g.clockDay) this.build()
    const p = g.pilot
    for (const w of this.wild) this.roam(w, dt, w.home, 22, w.trust > 0 && g.carried(PET_RULES[w.sp].food) > 0 && Math.hypot(p.x - w.a.x, p.y - w.a.y) < 40)
    for (const t of this.tame) {
      if (t.pet.follow) {
        // at the pilot's heels: catches up when left behind, waits when close
        const d = Math.hypot(p.x - t.a.x, p.y - t.a.y)
        if (d > 70) {
          t.a.x = p.x + 6
          t.a.y = p.y + 6
        }
        t.to = d > FOLLOW ? { x: p.x, y: p.y } : null
        this.walk(t, dt, d > 22 ? 30 : 18)
      } else this.roam(t, dt, { x: lay.plaza.x, y: lay.plaza.y }, 40, false)
    }
  }
  /** idle about a spot: a few steps, a look round; or come towards the pilot (a wild one being won over) */
  private roam(w: { a: Actor; to: { x: number; y: number } | null; wait: number; t: number }, dt: number, home: { x: number; y: number }, r: number, come: boolean) {
    const g = this.g
    if (come) {
      const p = g.pilot
      w.to = Math.hypot(p.x - w.a.x, p.y - w.a.y) > 10 ? { x: p.x, y: p.y } : null
    } else if (!w.to) {
      w.wait -= dt
      if (w.wait <= 0) {
        w.wait = 2 + g.rnd() * 5
        const a = g.rnd() * Math.PI * 2
        const x = Math.round(home.x + Math.cos(a) * g.rnd() * r)
        const y = Math.round(home.y + Math.sin(a) * g.rnd() * r)
        if (canPlace(g.world, 1, 1, x, y)) w.to = { x, y }
      }
    }
    this.walk(w, dt, 9)
  }
  private walk(w: { a: Actor; to: { x: number; y: number } | null; t: number }, dt: number, speed: number) {
    const g = this.g
    const a = w.a
    let moving = false
    if (w.to) {
      const dx = w.to.x - a.x
      const dy = w.to.y - a.y
      const d = Math.hypot(dx, dy)
      if (d < 1.5) w.to = null
      else {
        const s = Math.min(d, speed * dt)
        const nx = a.x + (dx / d) * s
        const ny = a.y + (dy / d) * s
        if (!g.world.isWater(Math.round(nx), Math.round(ny))) {
          a.x = nx
          a.y = ny
          a.yaw = Math.atan2(dx, -dy)
          moving = true
        } else w.to = null
      }
    }
    w.t += dt
    a.z = g.world.heightAt(Math.round(a.x), Math.round(a.y)) + (moving ? Math.abs(Math.sin(w.t * 14)) * 0.6 : 0)
    // two frames of a walk
    const name = a.model.name.replace(/_w$/, '')
    const want = moving && Math.sin(w.t * 14) > 0 ? name + '_w' : name
    if (a.model.name !== want) a.model = g.scene.models[want]
  }

  taps(test: (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias?: number) => void) {
    for (const w of this.wild) test(w.a.x, w.a.y, 4, 4, w.a.z, 6, () => this.approach(w), -6)
    for (const t of this.tame) test(t.a.x, t.a.y, 4, 4, t.a.z, 6, () => this.g.walkTo({ x: t.a.x, y: t.a.y }, 8, () => this.pat(t)), -6)
  }
  /** over the pets' heads: a heart for one that is warming to you, a "!" for one with a present */
  labels(put: (key: string, text: string, x: number, y: number, z: number, kind: 'float') => void) {
    const now = this.g.now()
    for (const w of this.wild) if (w.trust > 0) put('pw' + w.sp + w.a.x.toFixed(0), '♥'.repeat(Math.ceil(w.trust / TRUST_PER_MEAL)) + '♡'.repeat(Math.max(0, 3 - Math.ceil(w.trust / TRUST_PER_MEAL))), w.a.x, w.a.y, w.a.z + 9, 'float')
    for (const t of this.tame) if (now >= t.pet.giftAt) put('pt' + t.pet.id, $t('！'), t.a.x, t.a.y, t.a.z + 9, 'float')
  }

  /** a wild one: walk up, and feed it (if what it likes is to hand) */
  private approach(w: Wild) {
    const g = this.g
    const rule = PET_RULES[w.sp]
    const sp = PET_SPECIES[w.sp]
    const col = this.colour(w.sp, w.col)
    const what = $t('{0}色的{1}{2}', col.name, sp.name, RARITY_STARS[rarityOf(col)] ? $t('（{0}）', RARITY_STARS[rarityOf(col)]) : '')
    if (g.petSlots === 0) return g.warn($t('一只{0}。岛升到 3 级，才有地方养宠物', what))
    if (this.owned.length >= g.petSlots) return g.warn($t('一只{0}。宠物位满了（{1} 个）：岛升级会多出位子', what, g.petSlots))
    if (!g.carried(rule.food)) return g.warn($t('一只{0}，它在闻你的口袋——它爱吃{1}', what, ITEMS[rule.food].name))
    g.walkTo({ x: w.a.x, y: w.a.y }, 7, () => this.feed(w))
  }
  private feed(w: Wild) {
    const g = this.g
    const rule = PET_RULES[w.sp]
    if (!this.wild.includes(w) || !g.carried(rule.food)) return
    const a = w.a
    g.face(Math.atan2(a.x - g.pilot.x, -(a.y - g.pilot.y)), 1)
    a.yaw = Math.atan2(g.pilot.x - a.x, -(g.pilot.y - a.y))
    g.spend({ [rule.food]: 1 })
    w.trust += TRUST_PER_MEAL
    g.sfx('pop', 1.3)
    g.sfx('talk', 1.6, 0.6)
    a.stretch = 0.7
    g.settling.push(a)
    g.scene.burst({ kind: 'heart', x: a.x, y: a.y, z: a.z + 6, n: 4, speed: 8, up: 18, life: 0.9, mode: 'float', grav: 0 })
    if (w.trust < 100) {
      g.float(w.trust < 50 ? $t('它吃了，又看看你') : $t('它蹭了蹭你的手'), a.x, a.y, a.z + 12)
      return g.changed()
    }
    // it is yours
    const pet: Pet = { id: 'p' + Math.round(g.now()).toString(36) + Math.floor(g.rnd() * 1e4).toString(36), sp: w.sp, col: w.col, from: g.save.here, giftAt: g.now() + PET_RULES[w.sp].every, follow: !this.owned.some((x) => x.follow) }
    this.owned.push(pet)
    this.mark(w.sp, w.col, 2)
    this.wild = this.wild.filter((x) => x !== w)
    this.tame.push({ pet, a, to: null, wait: 1, t: 0 })
    if (!pet.follow && !g.here.def.home) {
      // a pet won abroad goes home ahead of you
      g.scene.removeActor(a)
      this.tame = this.tame.filter((t) => t.pet !== pet)
    }
    const col = this.colour(w.sp, w.col)
    const title = $t('{0}色的{1}跟你回家了！', col.name, PET_SPECIES[w.sp].name)
    g.scene.burst({ kind: 'heart', x: a.x, y: a.y, z: a.z + 6, n: 14, speed: 14, up: 26, life: 1.2, mode: 'float', grav: 0 })
    if (rarityOf(col) >= 2) {
      g.sfx('rare')
      g.celebrate(2, title, `${RARITY_STARS[2]} · ${rule.note}`, 'heart')
    } else g.celebrate(1, title, rule.note, 'heart')
    if (!g.milestone('pet', $t('第一只宠物！'), $t('{0} 在小屋里可以选谁跟着你', title), 'heart')) { /* the first */ }
    g.changed()
  }
  /** one's own: a pat, and the present if there is one */
  private pat(t: Tame) {
    const g = this.g
    const a = t.a
    g.face(Math.atan2(a.x - g.pilot.x, -(a.y - g.pilot.y)), 1)
    a.yaw = Math.atan2(g.pilot.x - a.x, -(g.pilot.y - a.y))
    a.stretch = 0.65
    g.settling.push(a)
    g.scene.burst({ kind: 'heart', x: a.x, y: a.y, z: a.z + 6, n: 5, speed: 8, up: 16, life: 0.9, mode: 'float', grav: 0 })
    g.sfx('talk', 1.7, 0.6)
    const now = g.now()
    if (now < t.pet.giftAt) return g.float($t('蹭蹭你'), a.x, a.y, a.z + 12)
    const got = PET_RULES[t.pet.sp].gift()
    if (!g.fits(got)) return g.full($t('它带来的东西装不下'))
    t.pet.giftAt = now + PET_RULES[t.pet.sp].every
    g.receive(got)
    give(g.save.stats.gathered, got)
    g.drop(got, a.x, a.y, a.z + 4)
    g.sfx('pick')
    g.float($t('它带来了 {0}', Object.keys(got).map((k) => ITEMS[k as ItemId].name).join($t('、'))), a.x, a.y, a.z + 12)
    g.changed()
  }
  /** choose which one follows (only one does) */
  setFollow(id: string) {
    for (const p of this.owned) p.follow = p.id === id ? !p.follow : false
    this.builtFor = ''
    this.g.sfx('pop')
    this.g.changed()
  }
}
