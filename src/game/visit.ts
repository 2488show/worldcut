// Visitors. Now and then an islander sails over to your island with something for you — the
// goods you ordered, or a little of what their own island makes — ties up at the pier and walks
// up to the village to wait. Have a word, and if you have a restaurant and something cooked,
// ask them to stay for a meal: the two of you sit at the table, talk a while in the islands'
// own tongue, and they go home happy. Friendship grows, and so does the island's good name
// (its charm).

import type { Game } from './game'
import { ITEMS, type Bag, type ItemId, FOOD } from './data'
import { findPath } from './nav'
import { WEATHER_NAME } from './weather'
import { FURNITURE } from './data'
import { starsFor, starText } from './house'
import { $t } from '../i18n'

type Actor = Game['pilot']
type Point = { x: number; y: number }

export interface Visitor {
  island: string
  name: string
  model: string
  voice: number
  gift: Bag
  boat: Actor
  who: Actor
  phase: 'sailing' | 'walking' | 'waiting' | 'eating' | 'visiting' | 'leaving' | 'away'
  path: Point[]
  pathI: number
  t: number
  /** how long they will wait before going home */
  patience: number
  talked: boolean
}
export interface Treat {
  /** a meal at the restaurant, or a sit-down in the house's guests' corner */
  kind: 'meal' | 'parlour'
  dish?: ItemId
  lines: { who: 'me' | 'them'; text: string }[]
  i: number
  t: number
  at: Point
  /** the height to look at (the table outside, the floor inside) */
  alt?: number
  /** the visitor's verdict on the house (parlour) */
  stars?: number
}

const VOICES: Record<string, number> = { islanderA: 0.82, islanderB: 1.32, islanderC: 1.18, islanderD: 0.72 }
const LINE_SECS = 2.8

export class Visits {
  v: Visitor | null = null
  treat: Treat | null = null
  /** visitors come by themselves (off in the long playthrough tests) */
  enabled = true
  /** the 'come and talk to me' line, taken down once they are talked to */
  private hint = ''
  constructor(private g: Game) {}

  /** a visit is due: once a day, from the second day (or once the first delivery is made) */
  private due(): boolean {
    const g = this.g
    const s = g.save
    const t = s.day ?? 0
    if (!this.enabled || this.v || g.mode !== 'island' || s.here !== 'home' || !g.onSurface) return false
    if (g.clockDay < 1 && s.stats.delivered < 1) return false
    if ((s.visitDay ?? -1) >= g.clockDay) return false
    return t > 0.12 && t < 0.58
  }
  step(dt: number) {
    const g = this.g
    if (!this.v && this.due() && g.rnd() < dt * 0.02) this.come()
    const v = this.v
    if (!v) return
    // only while the player is home to see it: elsewhere it is all put away
    if (g.save.here !== 'home' || g.mode !== 'island') return this.vanish()
    v.t += dt
    const lay = g.layouts.home
    switch (v.phase) {
      case 'sailing': {
        // in from the sea to the pier
        const k = Math.min(1, v.t / 6)
        const e = k * k * (3 - 2 * k)
        v.boat.x = lay.seaward.x + (lay.berth.x - lay.seaward.x) * e
        v.boat.y = lay.seaward.y + (lay.berth.y - lay.seaward.y) * e
        v.boat.yaw = Math.atan2(lay.berth.x - lay.seaward.x, -(lay.berth.y - lay.seaward.y))
        if (k >= 1) {
          v.phase = 'walking'
          v.who.visible = true
          v.who.x = lay.pierEnd.x
          v.who.y = lay.pierEnd.y
          const to = this.waitSpot()
          v.path = findPath(g.world, { x: v.who.x, y: v.who.y }, to, 2) ?? [to]
          v.pathI = 0
          g.sfx('splash', 1.3)
        }
        break
      }
      case 'walking': case 'leaving': {
        if (this.walk(v, dt)) {
          if (v.phase === 'walking') {
            v.phase = 'waiting'
            v.t = 0
            v.who.yaw = Math.PI
            g.speak(v.name, v.voice, $t('我来啦！'))
            this.hint = $t('{0}从{1}来了：点一下和{2}说话', v.name, g.islandName(v.island), v.name)
            g.toast(this.hint)
          } else {
            v.who.visible = false
            v.phase = 'away'
            v.t = 0
          }
        }
        break
      }
      case 'waiting':
        if (v.t > v.patience) this.leave()
        else if (Math.floor(v.t / 9) !== Math.floor((v.t - dt) / 9)) g.scene.burst({ kind: 'heart', x: v.who.x, y: v.who.y, z: v.who.z + 14, n: 1, speed: 4, up: 10, life: 0.8, mode: 'float', grav: 0 })
        break
      case 'eating':
        this.stepTreat(dt)
        break
      case 'visiting':
        // (out of the house before the end: the visit is over)
        if (!g.house.active) { if (this.treat) this.treat.i = this.treat.lines.length; this.endParlour() } else this.stepTreat(dt)
        break
      case 'away': {
        // and off back out to sea
        const k = Math.min(1, v.t / 5)
        v.boat.x = lay.berth.x + (lay.seaward.x - lay.berth.x) * k
        v.boat.y = lay.berth.y + (lay.seaward.y - lay.berth.y) * k
        v.boat.yaw = Math.atan2(lay.seaward.x - lay.berth.x, -(lay.seaward.y - lay.berth.y))
        if (k >= 1) this.vanish()
        break
      }
    }
  }
  /** along the path; true when there */
  private walk(v: Visitor, dt: number): boolean {
    const g = this.g
    let left = 26 * dt
    while (left > 0 && v.pathI < v.path.length) {
      const to = v.path[v.pathI]
      const dx = to.x - v.who.x, dy = to.y - v.who.y
      const d = Math.hypot(dx, dy)
      if (d <= left) { v.who.x = to.x; v.who.y = to.y; v.pathI++; left -= d; continue }
      v.who.x += (dx / d) * left
      v.who.y += (dy / d) * left
      v.who.yaw = Math.atan2(dx, -dy)
      left = 0
    }
    v.who.z = g.world.heightAt(Math.round(v.who.x), Math.round(v.who.y))
    const done = v.pathI >= v.path.length
    const frame = done ? v.model : Math.floor(v.t * 6) % 2 ? v.model + '_wa' : v.model + '_wb'
    v.who.model = g.scene.models[frame] ?? g.scene.models[v.model]
    return done
  }
  /** where a visitor waits: by the restaurant if there is one, else in the village square */
  private waitSpot(): Point {
    const g = this.g
    const lay = g.layouts.home
    const r = g.restaurant
    if (r) return { x: r.door.x + 10, y: r.door.y + 2 }
    return { x: lay.plaza.x + 14, y: lay.plaza.y + 6 }
  }

  /** an islander sets out (or a player's courier, online: then name it) */
  come(from?: { name: string; island?: string; gift?: Bag }) {
    const g = this.g
    if (this.v) return
    const lay = g.layouts.home
    const others = g.def.islands.filter((d) => !d.home && !d.wild && !d.guest && !d.hidden && d.ownerModel.startsWith('islander'))
    if (!others.length) return
    // the best friend comes most often
    const friends = g.save.friends ?? {}
    others.sort((a, b) => (friends[b.id] ?? 0) - (friends[a.id] ?? 0))
    const d = from?.island ? others.find((o) => o.id === from.island) ?? others[0] : others[Math.floor(g.rnd() * g.rnd() * others.length)]
    const gift: Bag = from?.gift ?? (() => {
      const it = d.sells[Math.floor(g.rnd() * d.sells.length)]
      return it ? { [it]: ITEMS[it].value > 30 ? 1 : 2 + Math.floor(g.rnd() * 2) } : {}
    })()
    const boat = g.scene.addActor('skiffGreen', { x: lay.seaward.x, y: lay.seaward.y, z: 1, yaw: 0, shadow: false, reach: 900 })
    const who = g.scene.addActor(d.ownerModel, { x: lay.pierEnd.x, y: lay.pierEnd.y, z: g.world.heightAt(lay.pierEnd.x, lay.pierEnd.y), yaw: 0, shadow: false, reach: 700, scale: g.personScale })
    who.visible = false
    this.v = { island: d.id, name: from?.name ?? d.owner, model: d.ownerModel, voice: VOICES[d.ownerModel] ?? 1, gift, boat, who, phase: 'sailing', path: [], pathI: 0, t: 0, patience: 240, talked: false }
    g.save.visitDay = g.clockDay
    g.sfx('gull', 0.9)
    g.toast($t('远处有船往你的码头来了'))
    g.changed()
  }
  /** off home (a goodbye, or tired of waiting) */
  leave() {
    const g = this.g
    const v = this.v
    if (!v) return
    const lay = g.layouts.home
    v.phase = 'leaving'
    v.t = 0
    g.standUp()
    v.path = findPath(g.world, { x: v.who.x, y: v.who.y }, lay.pierEnd, 2) ?? [lay.pierEnd]
    v.pathI = 0
    v.who.model = g.scene.models[v.model]
    g.changed()
  }
  private vanish() {
    const g = this.g
    const v = this.v
    if (!v) return
    g.scene.removeActor(v.boat)
    g.scene.removeActor(v.who)
    if (this.inside) { g.scene.removeActor(this.inside); this.inside = null }
    this.v = null
    this.treat = null
    g.changed()
  }
  /** everything drawn again (a new world): the visit is called off */
  clear() {
    this.v = null
    this.treat = null
    this.inside = null
  }

  // ───────────────────────────────────────────────────────────── talking
  /** for the tap test */
  taps(test: (x: number, y: number, hw: number, hh: number, base: number, rise: number, then: () => void, bias?: number) => void) {
    const v = this.v
    if (!v || v.phase !== 'waiting') return
    const g = this.g
    test(v.who.x, v.who.y, 4, 4, v.who.z, 13, () => g.walkTo({ x: v.who.x, y: v.who.y + 7 }, 4, () => this.talk()), -8)
  }
  talk() {
    const g = this.g
    const v = this.v
    if (!v) return
    // (the 'come and talk to me' line has done its job)
    g.toasts = g.toasts.filter((t) => t.text !== this.hint)
    v.who.yaw = Math.atan2(g.pilot.x - v.who.x, -(g.pilot.y - v.who.y))
    if (!v.talked) {
      v.talked = true
      if (Object.keys(v.gift).length) {
        g.receive(v.gift)
        g.drop(v.gift, v.who.x, v.who.y, v.who.z + 10)
      }
    }
    g.speak(v.name, v.voice, Object.keys(v.gift).length ? $t('给你带了{0}！', Object.entries(v.gift).map(([k, n]) => `${ITEMS[k as ItemId].name}×${n}`).join($t('、'))) : $t('路过来看看你！'))
    g.open({ kind: 'visitor' })
  }
  /** cooked food the player has (in the bag or the warehouse) that could be served */
  get dishes(): ItemId[] {
    const g = this.g
    return (Object.keys(FOOD) as ItemId[]).filter((k) => ITEMS[k].kind === 'food' && g.count(k) > 0)
  }
  /** ask them to stay for a meal at the restaurant */
  invite(dish: ItemId) {
    const g = this.g
    const v = this.v
    const r = g.restaurant
    if (!v || !r) return
    if (g.count(dish) < 1) return
    g.spend({ [dish]: 1 })
    g.panel = null
    g.stopWalking()
    // the two of them sit at the table, across from each other
    const at = { x: r.x - 1, y: r.y + 2 }
    const p = g.pilot
    p.x = r.x - 6; p.y = r.y + 2; p.z = r.base + 4; p.yaw = Math.PI / 2
    p.model = g.scene.models.pilot_sit
    g.sitting = { x: p.x, y: p.y }
    v.who.x = r.x + 4; v.who.y = r.y + 2; v.who.z = r.base + 4; v.who.yaw = -Math.PI / 2
    v.who.model = g.scene.models[v.model + '_sit'] ?? g.scene.models[v.model]
    v.phase = 'eating'
    v.t = 0
    const plate = g.scene.addActor(g.plateFor(dish), { x: at.x, y: at.y, z: r.base + 6, yaw: 0, shadow: false })
    this.plate = plate
    const lay = g.layouts[v.island]
    const spec = lay?.def.sells[0]
    const wx = g.weather.today
    const pickOne = <T,>(a: T[]) => a[Math.floor(g.rnd() * a.length)]
    const name = ITEMS[dish].name
    this.treat = {
      kind: 'meal', dish, i: 0, t: 0, at,
      lines: [
        { who: 'them', text: pickOne([$t('哇，{0}！闻着就香。', name), $t('这是给我做的{0}吗？', name), $t('{0}！我最爱吃这个了。', name)]) },
        { who: 'me', text: pickOne([$t('趁热吃。'), $t('尝尝看，刚做好的。'), $t('路上辛苦了，多吃点。')]) },
        { who: 'them', text: wx === 'rain' || wx === 'storm' ? $t('外面雨好大，吃点热的真舒服。') : wx === 'snow' ? $t('下着雪呢，吃完身上都暖了。') : spec ? $t('我们{0}有{1}，可做不出这个味道。', g.islandName(v.island), ITEMS[spec].name) : $t('今天{0}，适合出海。', WEATHER_NAME[wx]) },
        { who: 'me', text: pickOne([$t('你们岛最近怎么样？'), $t('下次再来，我做别的给你吃。'), $t('你的船开得真稳。')]) },
        { who: 'them', text: pickOne([$t('大家都好！就是想你这儿的饭了。'), $t('一定！下次我带好东西来。'), $t('嘿嘿，练出来的。')]) },
        { who: 'them', text: $t('悄悄告诉你，我听说{0}。真不真我可不敢保证。', g.stocks.rumour(v.name, g.save.friends?.[v.island] ?? 0)) },
        { who: 'me', text: pickOne([$t('我记下了。'), $t('回头我去电脑上看看。'), $t('消息灵通啊。')]) },
        { who: 'them', text: $t('谢谢你的招待！') },
      ],
    }
    g.sfx('pop', 1.1)
    g.scene.setCamera({ x: at.x, y: at.y + 4, alt: r.base + 4, yaw: g.camYaw, zoom: 3 })
    this.sayLine()
    g.changed()
  }
  private plate: Actor | null = null
  private sayLine() {
    const g = this.g
    const tr = this.treat
    const v = this.v
    if (!tr || !v) return
    const line = tr.lines[tr.i]
    if (!line) return
    if (line.who === 'them') g.speak(v.name, v.voice, line.text)
    else g.speak($t('你'), 1.05, line.text)
    const a = line.who === 'them' ? this.inside ?? v.who : g.pilot
    a.stretch = 0.9
    g.settle(a)
  }
  /** the next line (a tap, or after a while) */
  next() {
    const tr = this.treat
    if (!tr) return
    tr.i++
    tr.t = 0
    if (tr.i >= tr.lines.length) return this.endTreat()
    this.sayLine()
    this.g.changed()
  }
  private stepTreat(dt: number) {
    const g = this.g
    const tr = this.treat
    const v = this.v
    if (!tr || !v) return
    tr.t += dt
    const alt = tr.alt ?? v.who.z
    g.scene.setCamera({ x: tr.at.x, y: tr.at.y + 4, alt, yaw: g.camYaw, zoom: 3 })
    if (Math.floor(tr.t * 2) !== Math.floor((tr.t - dt) * 2) && tr.i >= 1) g.scene.burst({ kind: 'heart', x: tr.at.x, y: tr.at.y, z: alt + 8, n: 1, speed: 6, up: 14, life: 0.9, mode: 'float', grav: 0, r: 4 })
    if (tr.t > LINE_SECS) this.next()
  }
  // ───────────────────────────────────────────────────────────── a visit to the house
  /** the visitor sitting in the house (a second actor: the one outside waits, unseen) */
  private inside: Actor | null = null
  private lastDish: ItemId | null = null
  /** ask them in: the two of you sit in the guests' corner, they look round and say what they think of the place */
  home() {
    const g = this.g
    const v = this.v
    if (!v || this.treat) return
    g.panel = null
    if (!g.house.active) g.house.enter()
    if (!g.house.active) return
    const [a, b] = g.house.guestSeats()
    const sit = g.scene.models[v.model + '_sit']
    this.inside = g.scene.addActor(a.z > 4 && sit ? sit : g.scene.models[v.model], { x: a.x, y: a.y, z: a.z, yaw: a.yaw, shadow: false, reach: 500, scale: g.personScale })
    g.sitOn(b, true)
    if (b.z <= 4) g.pilot.model = g.scene.models.pilot
    g.pilot.yaw = Math.atan2(a.x - b.x, -(a.y - b.y))
    v.who.visible = false
    v.phase = 'visiting'
    v.t = 0
    // what they make of it
    const c = g.house.cosiness()
    const stars = starsFor(c.score)
    const fav = g.house.favourite()
    const missing = c.gaps[0]
    const wx = g.weather.today
    const pickOne = <T,>(xs: T[]) => xs[Math.floor(g.rnd() * xs.length)]
    this.treat = {
      kind: 'parlour', i: 0, t: 0, stars,
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, alt: a.z,
      lines: [
        { who: 'them', text: wx === 'rain' || wx === 'storm' ? $t('外面雨好大，屋里真暖和。') : wx === 'snow' ? $t('外面下着雪，屋里倒是暖洋洋的。') : pickOne([$t('原来你家是这样的！'), $t('打扰啦！你家好亮堂。'), $t('我早就想来你家看看了。')]) },
        { who: 'me', text: pickOne([$t('随便坐，别客气。'), $t('坐吧，我去倒杯茶。'), $t('收拾得不好，别笑话。')]) },
        { who: 'them', text: fav ? $t('我最喜欢那个{0}。{1}', ITEMS[fav].name, (FURNITURE[fav]?.charm ?? 0) >= 6 ? $t('真气派！') : $t('看着就舒服。')) : $t('屋里空空的，可以多摆点东西。') },
        { who: 'them', text: missing ? $t('要是{0}再有{1}，就更像个家了。', missing.room, missing.list) : $t('每个房间都收拾得好好的，真像个家。') },
        { who: 'them', text: $t('我给你家打 {0}！', starText(stars)) },
        { who: 'them', text: stars >= 4 ? $t('回去我要跟大家说说你家。') : $t('下次来的时候，看看你又添了什么。') },
        { who: 'them', text: $t('走之前，我们拍张合影吧！') },
      ],
    }
    g.sfx('pop', 1.1)
    g.scene.setCamera({ x: this.treat.at.x, y: this.treat.at.y + 4, alt: a.z, yaw: g.camYaw, zoom: 3 })
    this.sayLine()
    g.changed()
  }
  private endParlour() {
    const g = this.g
    const v = this.v
    const tr = this.treat
    if (!v || !tr) return
    const stars = tr.stars ?? 3
    this.treat = null
    // the photo together (it goes in the album: a frame on the wall can hold it), and a line in the guestbook
    if (this.inside && g.takePhoto) {
      g.sfx('tap', 0.6); g.sfx('pop', 1.6)
      if (g.takePhoto($t('和{0}的合影', v.name))) g.toast($t('合影放进相册了，可以挂在相框里'))
    }
    g.house.sign(v.name, stars >= 5 ? $t('这是我去过最舒服的家。') : stars >= 4 ? $t('茶很好喝，下次还来！') : stars >= 3 ? $t('谢谢招待，你家很温馨。') : $t('下次来，希望多几件家具～'))
    if (this.inside) {
      g.scene.burst({ kind: 'heart', x: this.inside.x, y: this.inside.y, z: this.inside.z + 12, n: 10, speed: 16, up: 26, life: 1.1, mode: 'float', grav: 0, r: 4 })
      g.scene.removeActor(this.inside)
      this.inside = null
    }
    const friends = (g.save.friends ??= {})
    friends[v.island] = (friends[v.island] ?? 0) + 1
    // a well-kept house is talked about: charm, a little, for three stars and up
    const charm = Math.max(0, stars - 2)
    g.save.hospitality = Math.min(80, (g.save.hospitality ?? 0) + charm)
    g.save.stats.hosted = (g.save.stats.hosted ?? 0) + 1
    g.save.bestStars = Math.max(g.save.bestStars ?? 0, stars)
    g.celebrate(1, $t('{0}给你家打了 {1}', v.name, starText(stars)), $t('好感 +1{0} · 明天会收到{1}的信', charm ? $t(' · 岛的魅力 +{0}', charm) : '', v.name), 'heart')
    g.sfx('fanfare')
    // and a letter tomorrow, with something for the house if they liked it
    const lay = g.layouts[v.island]
    const spec = lay?.def.sells[0] as ItemId | undefined
    const present: ItemId | undefined = stars >= 4 ? (['pottedPlant', 'floorLamp', 'rug', 'bookshelf'] as ItemId[])[g.clockDay % 4] : spec
    g.mail.later({
      kind: 'guest', from: v.name, island: v.island, title: $t('{0}的回信', v.name),
      body: $t('谢谢你昨天请我到家里坐。{0}\n\n{1}\n\n——{2}', stars >= 4 ? $t('你家真舒服，我回来以后一直在想你那个{0}。', (g.house.favourite() ? ITEMS[g.house.favourite()!].name : $t('屋子'))) : $t('你家很有意思，下次去说不定又不一样了。'), present && FURNITURE[present] ? $t('寄一件小家具给你，摆在哪儿都好看。') : $t('寄一点我们岛上的东西给你。'), v.name),
      gift: present ? { [present]: 1 } : undefined,
    })
    // they see themselves out: out of the front door and down to the boat
    g.standUp()
    const h = g.layouts.home?.buildings.find((b) => b.kind === 'house')
    if (h) { v.who.x = h.door.x; v.who.y = h.door.y + 4; v.who.z = g.world.heightAt(Math.round(v.who.x), Math.round(v.who.y)) }
    v.who.visible = true
    this.leave()
  }

  private endTreat() {
    if (this.treat?.kind === 'parlour') return this.endParlour()
    this.lastDish = this.treat?.dish ?? null
    const g = this.g
    const v = this.v
    if (!v) return
    this.treat = null
    if (this.plate) { g.scene.removeActor(this.plate); this.plate = null }
    const friends = (g.save.friends ??= {})
    // a practised cook: the guest likes it more (5), and word of the cooking gets about (10)
    const liked = 2 + (g.skills.has('cook', 0) ? 1 : 0)
    const charm = 4 + (g.skills.has('cook', 1) ? 2 : 0)
    friends[v.island] = (friends[v.island] ?? 0) + liked
    g.save.hospitality = Math.min(80, (g.save.hospitality ?? 0) + charm)
    g.save.stats.treated = (g.save.stats.treated ?? 0) + 1
    g.scene.burst({ kind: 'heart', x: v.who.x, y: v.who.y, z: v.who.z + 12, n: 12, speed: 18, up: 30, life: 1.2, mode: 'float', grav: 0, r: 4 })
    g.mail.later({ kind: 'guest', from: v.name, island: v.island, title: $t('{0}的回信', v.name), body: $t('昨天的{0}真好吃！回来以后我还跟大家说了。\n\n下次我带好东西去。\n\n——{1}', ITEMS[this.lastDish ?? 'bread'].name, v.name) })
    g.celebrate(1, $t('{0}吃得很开心', v.name), $t('好感 +{0} · 岛的魅力 +{1}（现在 {2}）', liked, charm, g.charm), 'heart')
    g.sfx('fanfare')
    // up from the table, and out onto the step: the table is inside the restaurant's footprint,
    // where no path starts
    const r = g.restaurant
    const p = g.pilot
    g.sitting = null
    p.model = g.scene.models.pilot
    if (r) { p.x = r.door.x; p.y = r.door.y + 2; p.z = g.world.heightAt(Math.round(p.x), Math.round(p.y)); p.yaw = Math.PI }
    this.leave()
  }
}
