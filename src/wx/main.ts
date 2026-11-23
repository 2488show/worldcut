// 云岭航行 on WeChat (rounds 25–26): the same Game and engine as the web version, on the mini
// game's canvas, with the screen drawn by ui.ts instead of the DOM. Everything the web's App.tsx
// shows is here: the HUDs (island, house, flight and combat, photo, the table with a guest, the
// bed, the dive), the windows (panels.ts and the files it brings in), the banners and the sound.
import './shim'
import { Game, migrate, type Fx, type Save } from '../game/game'
import { FOOD, FURNITURE, ITEMS, HOTBAR, type ItemId } from '../game/data'
import { ZONES, VIEW_W, VIEW_H } from '../game/dive'
import { CHAPTERS } from '../game/story'
import { $t } from '../i18n'
import { GameAudio } from '../ui/audio'
import { drawDive } from '../ui/divepaint'
import { drawVoxels } from '../ui/voxview'
import { UI, C, drawSheet, setModelIcon } from './ui'
import { sheetFor, ops } from './panels'
import { capture, forgetSentPostcard, photoPixels, restorePostcard, setFrameSource, photoCanvas, type WxPhoto } from './album'

const G = globalThis as any
const wx = G.wx
const info = wx.getSystemInfoSync()
const W: number = info.windowWidth
const H: number = info.windowHeight
const dpr: number = info.pixelRatio || 2
const safeTop: number = Math.max(20, info.safeArea?.top ?? 20)
const safeBot: number = Math.max(8, H - (info.safeArea?.bottom ?? H))

// ── the screen canvas (the first created is the one shown), and the font
const canvas = wx.createCanvas()
canvas.width = Math.round(W * dpr)
canvas.height = Math.round(H * dpr)
const ctx: CanvasRenderingContext2D = canvas.getContext('2d')
const ui = new UI(ctx, W, H)
try { const f = wx.loadFont('fonts/skypixel.ttf'); if (f) ui.font = `"${f}", sans-serif` } catch { /* the system font, then */ }

// ── the frame the engine draws: about 110 000 pixels whatever the phone (as on the web)
const dev = Math.max(1, Math.round(Math.sqrt((W * dpr * H * dpr) / 110000)))
const css = dev / dpr
const bw = Math.max(2, Math.ceil(W / css))
const bh = Math.max(2, Math.ceil(H / css))
const off = wx.createCanvas()
off.width = bw
off.height = bh
const octx: CanvasRenderingContext2D = off.getContext('2d')
const image = octx.createImageData(bw, bh)
const toScreen = W / bw
// the dive is its own picture, VIEW_W × VIEW_H, drawn over the whole screen (cover)
const diveCv = wx.createCanvas()
diveCv.width = VIEW_W
diveCv.height = VIEW_H
const dctx: CanvasRenderingContext2D = diveCv.getContext('2d')
// (on a phone held upright, cover would leave a sliver: show most of its width, and carry the
// water above and below with its own top and bottom rows)
const diveK = Math.min(Math.max(W / VIEW_W, H / VIEW_H), W / (VIEW_W * 0.62))
const diveOx = (W - VIEW_W * diveK) / 2, diveOy = Math.round(H * 0.56 - (VIEW_H * diveK) / 2)

// ── saves (the same key as the web version)
const KEY = 'skyisle-save-v2'
function load(): Save | null {
  try { const raw = G.localStorage.getItem(KEY); return migrate(raw ? JSON.parse(raw) : null) } catch { return null }
}
function persist(s: Save) {
  s.at = Math.round(Date.now() / 1000)
  G.localStorage.setItem(KEY, JSON.stringify(s))
}

// ── sound: synthesised, as on the web (WeChat's WebAudio); it starts with the first touch
// (wrapped: if this phone's WebAudio lacks something the engine needs, the game goes on silent
// instead of stopping at the first touch)
function guarded(a: GameAudio): GameAudio {
  let dead = false
  return new Proxy(a, {
    get(t, k) {
      const v = (t as any)[k]
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        if (dead) return undefined
        try { return v.apply(t, args) } catch (e) {
          dead = true
          G.__soundErr = `${String(k)}: ${(e as Error)?.message ?? e}`
          console.warn('sound off:', G.__soundErr, e)
          try { t.dispose() } catch { /* */ }
          return undefined
        }
      }
    },
  })
}
let audio = guarded(new GameAudio())
/** start the sound again from nothing (the settings' button) */
function restartSound() {
  try { audio.dispose() } catch { /* */ }
  G.__soundErr = ''
  audio = guarded(new GameAudio())
  ops.audio = audio
ops.restartSound = () => restartSound()
  G.__audio = audio
  audio.unlock()
  const set = game.save.settings
  if (set) audio.setVolume(set.music, set.sfx)
  audio.play('done')
}
let heardTouch = false

// ── the game (made again on a reset)
let game: Game
let shownCoins = 0
function makeGame(save: Save | null) {
  game = new Game({ save, persist, params: { flameStyle: 'pixel' } } as never)
  game.scene.resize(bw, bh)
  G.__game = game
  shownCoins = game.save.coins
  game.onFx = onFx
  game.photoPixels = photoPixels
  game.takePhoto = (where) => !!capture(game, where)
  restorePostcard(game)
  game.house.refreshModels()
  const set = game.save.settings
  if (set) audio.setVolume(set.music, set.sfx)
}
makeGame(load())
G.__wxui = ui
G.__audio = audio
wx.onHide?.(() => persist(game.save))
wx.onShow?.(() => { last = 0; if (heardTouch) audio.unlock() })
setFrameSource(() => ({ w: bw, h: bh, data: image.data }))
ops.audio = audio
ops.restartSound = () => restartSound()
ops.persist = () => persist(game.save)
ops.onTitle = () => { title = true; titleSure = false }
ops.onReset = () => {
  try { G.localStorage.removeItem(KEY) } catch { /* */ }
  makeGame(null)
  title = true
  titleSure = false
}
// furniture with no drawn icon: a little picture of its model
const modelIcons = new Map<string, any>()
setModelIcon((id: ItemId) => {
  if (modelIcons.has(id)) return modelIcons.get(id)
  const f = FURNITURE[id]
  const m = f && game.scene.models[f.model]
  let c: any = null
  if (m) { c = wx.createCanvas(); c.width = 32; c.height = 32; try { drawVoxels(c, m, 0.6, 0.6) } catch { c = null } }
  modelIcons.set(id, c)
  return c
})

let title = true
let titleSure = false
let questOpen = false
let flash = 0
let lastShot: WxPhoto | null = null
const scrolls: Record<string, number> = {}
const heights: Record<string, number> = {}
let sheetMax = 0
let openPanel: unknown = null

// ── what the game says happened: sounds, banners, the big moments
type Banner = { title: string; sub?: string; icon?: string; until: number; big: boolean; born: number }
let banner: Banner | null = null
const flyers: { icon: string; to: 'bag' | 'coins'; x: number; y: number; born: number; i: number }[] = []
function onFx(e: Fx) {
  switch (e.t) {
    case 'sfx': audio.play(e.name, e.pitch, e.vol); break
    case 'say': audio.babble(e.text, e.voice); break
    case 'rumble': try { e.ms > 30 ? wx.vibrateLong?.() : wx.vibrateShort?.({ type: 'light' }) } catch { /* */ } break
    case 'fly': {
      const p = game.scene.projectPoint(e.x, e.y, e.z ?? 0)
      const x = p && Number.isFinite(p.x) ? p.x * toScreen : W / 2, y = p && Number.isFinite(p.y) ? p.y * toScreen : H / 2
      const n = Math.min(e.to === 'coins' ? 8 : 5, Math.max(1, e.n))
      for (let i = 0; i < n; i++) flyers.push({ icon: e.icon, to: e.to, x, y, born: Date.now() + i * 55, i })
      break
    }
    case 'celebrate':
      banner = { title: e.title, sub: e.sub, icon: e.icon, big: e.level === 2, born: Date.now(), until: Date.now() + (e.level === 2 ? 3200 : 2600) }
      audio.play(e.level === 2 ? 'bigfanfare' : 'quest')
      break
    case 'toast': break
  }
}

// ── drawing
function frame() {
  ui.begin()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  image.data.set(game.scene.render())
  octx.putImageData(image, 0, 0)
  ctx.drawImage(off, 0, 0, bw, bh, 0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (title) { drawTitle(); return }
  if (game.dive.active) {
    drawDive(dctx, game.dive, game, Date.now(), null)
    ctx.imageSmoothingEnabled = false
    const dh = VIEW_H * diveK
    if (diveOy > 0) ctx.drawImage(diveCv, 0, 0, VIEW_W, 1, diveOx, 0, VIEW_W * diveK, diveOy + 1)
    if (diveOy + dh < H) ctx.drawImage(diveCv, 0, VIEW_H - 1, VIEW_W, 1, diveOx, diveOy + dh - 1, VIEW_W * diveK, H - diveOy - dh + 1)
    ctx.drawImage(diveCv, 0, 0, VIEW_W, VIEW_H, diveOx, diveOy, VIEW_W * diveK, dh)
  }
  const firstLook = game.panel?.kind === 'look' && game.panel.first
  if (!firstLook) {
    if (!game.photoMode && !game.dive.active && (!game.panel || game.panel.kind === 'arrived')) drawLabels()
    if (game.mode === 'flight') drawFlight()
    else if (game.photoMode && !game.panel) drawPhoto()
    else if (game.house.resting) drawRest()
    else if (game.visits.treat) drawTreat()
    else drawIsland()
    drawFlyers()
    drawToasts()
  }
  drawLids()
  drawPanel()
  drawBanner()
}

/** in bed: a line about the weather, and the ways out of bed */
function drawRest() {
  const g = game
  if (g.house.sleepIn > 0 || g.panel) return
  const w = g.weather
  const what = w.raining ? (w.now.storm > 0.3 ? 'storm' : 'rain') : w.snowing ? 'snow' : w.foggy ? 'fog' : g.dayPhase() === 'night' ? 'night' : 'sun'
  const lines: Record<string, string> = { storm: $t('风在外面打转。'), rain: $t('雨敲着窗。'), snow: $t('雪落在窗台上。'), fog: $t('窗外白茫茫的。'), night: $t('很安静。'), sun: $t('阳光照进来。') }
  const y = H - safeBot - 96
  ui.bevel(12, y, W - 24, 84, false, 'rgba(244,240,230,0.94)')
  ui.text(lines[what], W / 2, y + 22, { size: 13, align: 'center' })
  const nap = g.body.canNap && g.dayPhase() !== 'night'
  const bed = g.house.bed
  const btns: [string, () => void, boolean][] = []
  if (nap) btns.push([$t('◔ 午觉'), () => { if (bed) g.body.goToBed(bed, true) }, false])
  btns.push([$t('☾ 睡到天亮'), () => { if (bed) g.body.goToBed(bed) }, false])
  btns.push([$t('起来'), () => g.house.getUp(), true])
  const bw2 = Math.min(110, (W - 48 - (btns.length - 1) * 8) / btns.length)
  let x = W / 2 - (btns.length * bw2 + (btns.length - 1) * 8) / 2
  for (const [label, on, primary] of btns) { ui.button(x, y + 36, bw2, 36, label, on, { size: 14, primary }); x += bw2 + 8 }
}

/** at the table with a guest: letterbox, the line being said, a tap for the next */
function drawTreat() {
  const tr = game.visits.treat!
  const v = game.visits.v
  const line = tr.lines[tr.i]
  if (!line || !v) return
  ui.fill(0, 0, W, safeTop + 40, '#000')
  const bh2 = 120 + safeBot
  ui.fill(0, H - bh2, W, bh2, '#000')
  const who = line.who === 'me' ? $t('你') : v.name
  ui.text(who, 20, H - bh2 + 26, { size: 14, bold: true, color: '#ffd84a' })
  ui.wrap(line.text, W - 40, 14).forEach((ln, i) => ui.text(ln, 20, H - bh2 + 50 + i * 20, { size: 14, color: '#fff' }))
  ui.text($t('点一下继续 · {0}/{1}', tr.i + 1, tr.lines.length), W - 16, H - safeBot - 10, { size: 11, align: 'right', color: '#aaa' })
  ui.hit(0, 0, W, H, () => game.visits.next())
}

/** photo mode: the frame corners, the shutter, the view buttons */
function drawPhoto() {
  const g = game
  const k = 18
  for (const [x, y, sx, sy] of [[16, safeTop + 50, 1, 1], [W - 16, safeTop + 50, -1, 1], [16, H - safeBot - 110, 1, -1], [W - 16, H - safeBot - 110, -1, -1]]) {
    ui.fill(x - (sx < 0 ? 3 : 0), y - (sy < 0 ? 3 : 0), 3 * 1, 3, '#fff')
    ui.fill(sx > 0 ? x : x - k, sy > 0 ? y : y - 3, k, 3, '#fff')
    ui.fill(sx > 0 ? x : x - 3, sy > 0 ? y : y - k, 3, k, '#fff')
  }
  const y = safeTop + 6
  ui.chip($t('照相 · 转镜头、拉远拉近，再按“拍下”'), 8, y, { size: 11 })
  ui.button(W - 110, y, 50, 26, $t('相册'), () => { g.photoMode = false; g.open({ kind: 'album' }) })
  ui.button(W - 56, y, 48, 26, $t('退出'), () => { g.photoMode = false; g.changed() })
  const by = H - safeBot - 70
  const shoot = () => {
    const p = capture(g)
    if (!p) return g.warn($t('这台设备拍不了照'))
    g.sfx('tap', 0.6); g.sfx('pop', 1.6)
    flash = Date.now(); lastShot = p
  }
  ui.button(W / 2 - 50, by, 100, 56, $t('拍下'), shoot, { size: 18, primary: true })
  ui.button(W / 2 - 112, by + 8, 52, 40, g.view3d ? $t('俯') : $t('斜'), () => g.toggleView(), { size: 14 })
  ui.button(W / 2 + 60, by + 8, 52, 40, g.islandZoom === 2 ? $t('远') : $t('近'), () => g.toggleZoom(), { size: 14 })
  if (g.view3d) {
    ui.button(12, by + 8, 44, 40, '↶', () => g.rotateView(-1), { size: 18 })
    ui.button(W - 56, by + 8, 44, 40, '↷', () => g.rotateView(1), { size: 18 })
  }
  if (lastShot) {
    const c = photoCanvas(lastShot)
    if (c) {
      const tw = 54, th = (tw * lastShot.h) / lastShot.w
      ui.bevel(W - tw - 18, by - th - 18, tw + 6, th + 6)
      ctx.drawImage(c, W - tw - 15, by - th - 15, tw, th)
      ui.hit(W - tw - 18, by - th - 18, tw + 6, th + 6, () => { g.photoMode = false; g.open({ kind: 'album' }) })
    }
  }
  const age = Date.now() - flash
  if (age < 300) ui.fill(0, 0, W, H, `rgba(255,255,255,${(1 - age / 300) * 0.85})`)
}

/** the eyes closing as sleep comes, and opening in the morning */
function drawLids() {
  const e = game.house.eyes
  if (e <= 0.001) return
  const k = e * e * (3 - 2 * e)
  const h = (H / 2 + 4) * k
  ui.fill(0, 0, W, h, '#0b0a12')
  ui.fill(0, H - h, W, h, '#0b0a12')
}

function drawTitle() {
  const s = game.save
  const old = !!s.welcomed
  ui.fill(0, 0, W, H, 'rgba(10,24,60,0.25)')
  ui.text($t('云岭航行'), W / 2, H * 0.3, { size: 48, align: 'center', color: '#fff', bold: true, shadow: true })
  ui.text('WORLDCUT', W / 2, H * 0.3 + 34, { size: 18, align: 'center', color: '#fff', shadow: true })
  ui.text($t('海的那一边是什么？'), W / 2, H * 0.3 + 62, { size: 13, align: 'center', color: '#fff', shadow: true })
  if (old) {
    const ch = s.story ? (s.story.ended ? $t('彼岸之后') : $t('第{0}章', CHAPTERS[s.story.ch]?.no ?? $t('五'))) : $t('第一章')
    ui.text($t('{0} · {1} · {2} 级 · ', s.name || $t('你的小岛'), ch, game.level) + s.coins, W / 2, H * 0.3 + 90, { size: 12, align: 'center', color: '#fff', shadow: true })
  }
  const start = () => { title = false; titleSure = false; audio.unlock(); audio.play('done') }
  ui.button(W / 2 - 80, H * 0.62, 160, 44, old ? $t('继续') : $t('开始'), start, { size: 16, primary: true })
  if (old && !titleSure) ui.button(W / 2 - 60, H * 0.62 + 56, 120, 32, $t('新游戏'), () => { titleSure = true })
  if (old && titleSure) {
    ui.button(W / 2 - 130, H * 0.62 + 56, 260, 32, $t('确定：丢掉这座岛，重新开始'), ops.onReset, { primary: true })
    ui.button(W / 2 - 50, H * 0.62 + 96, 100, 30, $t('算了'), () => { titleSure = false })
  }
}

function drawLabels() {
  for (const l of game.labels()) {
    const x = l.x * toScreen, y = l.y * toScreen
    if (l.kind === 'progress') { ui.bar(x - 20, y - 8, 40, 7, l.value ?? 0, C.ok); continue }
    if (!l.text) continue
    ui.chip(l.text, x, y - 20, { size: 11, align: 'center', bg: l.kind === 'speech' ? '#ffffff' : '#f4f0e6' })
  }
}

function drawToasts() {
  let y = H * 0.42
  for (const t of game.toasts.slice(-3)) {
    const lines = ui.wrap(t.text, W - 80, 12)
    const h = lines.length * 17 + 10
    ui.bevel(30, y, W - 60, h, false, t.bad ? '#ffe4dc' : '#fffbe8')
    lines.forEach((ln, i) => ui.text(ln, W / 2, y + 18 + i * 17, { size: 12, align: 'center', color: t.bad ? C.bad : C.ink }))
    y += h + 6
  }
}

/** things gathered fly to the bag, coins to the purse */
function drawFlyers() {
  const now = Date.now()
  const bagAt = { x: W - 30, y: H - safeBot - 26 }, coinAt = { x: 40, y: safeTop + 17 }
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]
    const u = (now - f.born) / 720
    if (u < 0) continue
    if (u >= 1) {
      flyers.splice(i, 1)
      audio.play(f.to === 'coins' ? 'coin' : 'collect')
      continue
    }
    const to = f.to === 'coins' ? coinAt : bagAt
    const a = (f.i * 2.4) % (Math.PI * 2)
    const px = f.x + Math.cos(a) * 26, py = f.y + Math.sin(a) * 16 - 18
    let x: number, y: number, s: number
    if (u < 0.3) { const k = u / 0.3; x = f.x + (px - f.x) * k; y = f.y + (py - f.y) * k; s = 10 + 12 * k }
    else { const k = (u - 0.3) / 0.7, e = k * k; x = px + (to.x - px) * e; y = py + (to.y - py) * e; s = 22 - 8 * k }
    ui.icon(f.icon as ItemId, x - s / 2, y - s / 2, s)
  }
}

/** an everyday step: a banner; a milestone: the screen flashes, rays turn, confetti falls */
const CONFETTI = ['#e8603c', '#54b2be', '#fad25a', '#9cda58', '#f49696', '#ffffff']
function drawBanner() {
  const b = banner
  if (!b) return
  const now = Date.now()
  if (now > b.until) { banner = null; return }
  const age = (now - b.born) / 1000
  const out = Math.max(0, Math.min(1, (b.until - now) / 400))
  if (b.big) {
    if (age < 0.25) ui.fill(0, 0, W, H, `rgba(255,255,255,${0.8 * (1 - age / 0.25)})`)
    ctx.save()
    ctx.globalAlpha = out
    ui.fill(0, 0, W, H, 'rgba(10,20,50,0.45)')
    // rays
    ctx.translate(W / 2, H * 0.42)
    ctx.rotate(age * 0.4)
    ctx.fillStyle = 'rgba(255,230,140,0.18)'
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -H); ctx.lineTo(40, -H); ctx.closePath(); ctx.fill() }
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = out
    for (let i = 0; i < 60; i++) {
      const x = ((i * 97.13) % W) + Math.sin(age * 3 + i) * 12
      const y = ((i * 53.7) % 140) - 140 + age * (120 + (i % 7) * 30)
      ctx.fillStyle = CONFETTI[i % CONFETTI.length]
      ctx.fillRect(x, y % (H + 40), 5, 7)
    }
    const cw = W - 60, ch = 150
    ui.bevel(30, H * 0.42 - ch / 2, cw, ch, false, '#fffbe8')
    if (b.icon) ui.icon(b.icon as ItemId, W / 2 - 24, H * 0.42 - ch / 2 + 14, 48)
    ui.text(b.title, W / 2, H * 0.42 + 24, { size: 20, bold: true, align: 'center' })
    if (b.sub) ui.wrap(b.sub, cw - 30, 12).slice(0, 2).forEach((ln, i) => ui.text(ln, W / 2, H * 0.42 + 46 + i * 16, { size: 12, align: 'center', color: C.dim }))
    ctx.restore()
    ui.hit(0, 0, W, H, () => { b.until = Math.min(b.until, Date.now() + 300) })
    return
  }
  const slide = Math.min(1, age / 0.25)
  ctx.save()
  ctx.globalAlpha = out
  const y = safeTop + 40 - (1 - slide) * 60
  ui.bevel(20, y, W - 40, b.sub ? 52 : 36, false, '#fff6c9')
  let tx = 30
  if (b.icon) { ui.icon(b.icon as ItemId, 28, y + 6, 24); tx = 60 }
  ui.text(b.title, tx, y + 23, { size: 14, bold: true })
  if (b.sub) ui.text(ui.wrap(b.sub, W - tx - 30, 11)[0], tx, y + 42, { size: 11, color: C.dim })
  ctx.restore()
}

/** a small round button for the right column */
function roundBtn(x: number, y: number, label: string, on: () => void, badge?: string) {
  ui.button(x, y, 40, 34, label, on, { size: 13 })
  if (badge) { ui.fill(x + 30, y - 4, 14, 14, C.bad); ui.text(badge, x + 37, y + 7, { size: 10, align: 'center', color: '#fff', bold: true }) }
}

function drawIsland() {
  const g = game
  let y = safeTop + 4
  // where, and the coins (they roll towards the real number)
  if (shownCoins !== g.save.coins) { const d = g.save.coins - shownCoins; shownCoins += Math.abs(d) < 2 ? d : Math.round(d * 0.18) || Math.sign(d) }
  const place = g.mine.active ? $t('矿洞') : g.house.active ? $t('家里') : g.here.def.name
  const pw = ui.width(place, 13, true) + ui.width(String(shownCoins), 13, true) + 40
  ui.bevel(8, y, pw, 26)
  ui.text(place, 14, y + 18, { size: 13, bold: true })
  const cx = 14 + ui.width(place, 13, true) + 8
  ui.icon('coin', cx, y + 6, 14)
  ui.text(String(shownCoins), cx + 17, y + 18, { size: 13, bold: true, color: '#8a5a00' })
  let lx = 14 + pw
  // the island's level: opens the notebook
  if (g.here.def.home && !g.mine.active) {
    const ready = !!g.levelInfo()?.ok
    const lv = $t('{0} 级', g.level) + (ready ? ' ↑' : '')
    const lw = ui.width(lv, 12, true) + 16
    ui.button(lx, y, lw, 26, lv, () => g.open({ kind: 'house' }), { primary: ready })
    lx += lw + 6
  }
  // the right column: the wish, the mail, the camera, the journal, the menu
  let ry = y
  const rx = W - 48
  if (g.wishes.open) { roundBtn(rx, ry, '♡', () => g.open({ kind: 'wish' }), g.wishes.canSend() ? '!' : undefined); ry += 40 }
  if (g.mail.unread > 0) { roundBtn(rx, ry, '✉', () => g.open({ kind: 'mail' }), String(g.mail.unread)); ry += 40 }
  roundBtn(rx, ry, $t('拍'), () => { g.photoMode = true; g.cancelPlacing(true); g.changed() }); ry += 40
  roundBtn(rx, ry, $t('日志'), () => g.open({ kind: 'journal' })); ry += 40
  roundBtn(rx, ry, '☰', () => g.open({ kind: 'settings' })); ry += 40
  y += 32
  // clock, strength, how full
  const b = g.body
  ui.bevel(8, y, 150, 38, false, 'rgba(244,240,230,0.92)')
  ui.text(`${g.season.name} · ${g.clockDay + 1} · ${b.clockText}`, 14, y + 15, { size: 11 })
  ui.bar(14, y + 21, 64, 8, b.energy / 100, b.energy < 20 ? C.bad : C.title2)
  ui.bar(86, y + 21, 64, 8, b.full / 100, b.full < 20 ? C.bad : '#d08a30')
  // in the house: decorate, and the way out
  if (g.house.active && !g.placingItem) {
    const hx = 164
    const toggle = () => { g.house.decorating = !g.house.decorating; g.sfx('tap'); g.changed() }
    ui.button(hx, y + 4, 62, 30, g.house.decorating ? $t('✓ 完成') : $t('✎ 装修'), toggle, { primary: g.house.decorating })
    if (!g.house.decorating) ui.button(hx + 66, y + 4, 62, 30, $t('出门 →'), () => g.house.exit())
  }
  y += 44
  // the note with the next thing to do
  const q = g.quest()
  const qw = W - 16 - 52
  const qt = q.title + (q.progress ? '  ' + q.progress : '')
  const qlines = ui.wrap(qt, qw - 24, 12)
  const hl = questOpen ? ui.wrap(q.hint, qw - 24, 11) : []
  const qh = qlines.length * 17 + hl.length * 15 + 12
  ui.fill(8, y, qw, qh, '#fff6c9')
  ui.fill(8, y + qh, qw, 2, 'rgba(40,30,20,0.18)')
  qlines.forEach((ln, i) => ui.text((i ? '' : '⚑ ') + ln, 16, y + 18 + i * 17, { size: 12, bold: true }))
  hl.forEach((ln, i) => ui.text(ln, 16, y + 16 + qlines.length * 17 + i * 15, { size: 11, color: C.dim }))
  ui.hit(8, y, qw, qh, () => { g.sfx('tap'); questOpen = !questOpen })
  // under water, under ground, with a fish on
  if (g.dive.active) drawDiveHud()
  if (g.mine.active) {
    ui.chip($t('{0} 层', g.mine.level), W / 2, H - safeBot - 150, { size: 12, align: 'center' })
    ui.button(W / 2 - 60, H - safeBot - 120, 120, 34, $t('回地面'), () => g.mine.exit(), { primary: true })
  }
  drawFishing()
  drawPlacing()
  // after a piece is set down: take it back
  if (g.house.active && !g.placingItem && g.house.canUndo) ui.button(12, H - safeBot - 110, 70, 30, $t('↶ 撤回'), () => g.house.undo())
  // the shovel: what it would do here
  if (!g.placingItem && g.heldItem() === 'shovel' && g.onSurface && g.isHome) ui.chip(g.shovelAim ? (g.shovelAim.ok ? $t('铲平这里') : g.shovelAim.why) : $t('点不平的地'), W / 2, H - safeBot - 150, { size: 12, align: 'center' })
  // food in hand: eat it
  const it = g.heldItem()
  if (it && FOOD[it] && !g.placingItem && g.mode === 'island') ui.button(W / 2 - 60, H - safeBot - 104, 120, 32, $t(' 吃{0}', ITEMS[it].name), () => g.acts.eat(it), { primary: true })
  // the rod in hand: the tackle box; the creel on the back: what is in it
  if (it === 'rod' && !g.fishing.active && !g.house.active && !g.panel) {
    const on = g.tackle.on
    ui.bevel(12, H - safeBot - 104, 64, 32)
    if (on) { ui.icon(on, 16, H - safeBot - 100, 24); ui.text($t('钓具'), 58, H - safeBot - 84, { size: 10, align: 'center' }) } else ui.text($t('空钩'), 44, H - safeBot - 84, { size: 11, align: 'center' })
    ui.hit(12, H - safeBot - 104, 64, 32, () => g.open({ kind: 'tackle' }))
  }
  if (g.carried('creel') && !g.fishing.active && !g.house.active && !g.panel && g.mode === 'island') {
    ui.bevel(W - 76, H - safeBot - 104, 64, 32)
    ui.icon('creel', W - 72, H - safeBot - 100, 24)
    ui.text(String((g.save.creel ?? []).length), W - 30, H - safeBot - 84, { size: 12, align: 'center', bold: true })
    ui.hit(W - 76, H - safeBot - 104, 64, 32, () => g.open({ kind: 'creel' }))
  }
  if (g.house.active && g.house.decorating && !g.placingItem) drawDecorTray()
  else drawHotbar()
}

/** under water: the air left, how deep, the catch bag, and the way up */
function drawDiveHud() {
  const d = game.dive
  const y = safeTop + 150
  const low = d.oxygen < 10
  ui.bevel(8, y, W - 16, 56, false, low ? '#ffe4dc' : 'rgba(244,240,230,0.92)')
  ui.text('◯', 16, y + 19, { size: 12 })
  ui.bar(32, y + 9, W - 110, 12, Math.max(0, d.oxygen / d.maxOxygen), low ? C.bad : '#3aa0d8')
  ui.text(Math.ceil(d.oxygen) + 's', W - 70, y + 20, { size: 12, bold: true })
  ui.text(`${ZONES[d.zone].name} · ${d.metres} m`, 16, y + 44, { size: 12 })
  for (let i = 0; i < 8; i++) ui.bevel(W / 2 - 20 + i * 12, y + 34, 10, 10, i < d.count, i < d.count ? '#ffd84a' : '#d0d0d0')
  ui.button(W - 72, y + 30, 58, 22, $t('上浮'), () => d.surface(), { primary: true })
}

/** decorating: the furniture not yet set out (bag, warehouse and the furniture box together) */
const WHERE: ['all' | 'floor' | 'wall' | 'top', string][] = [['all', $t('全部')], ['floor', $t('地上')], ['wall', $t('墙上')], ['top', $t('桌上')]]
let trayWhere: 'all' | 'floor' | 'wall' | 'top' = 'all'
let trayScroll = 0
function drawDecorTray() {
  const g = game
  const whereOf = (id: ItemId) => { const p = FURNITURE[id]?.place; return p === 'wall' ? 'wall' : p === 'top' ? 'top' : 'floor' }
  const list = g.house.owned().filter((o) => trayWhere === 'all' || whereOf(o.item) === trayWhere)
  const h = 96
  const y = H - safeBot - h - 4
  ui.bevel(6, y, W - 12, h)
  let tx = 12
  for (const [k, name] of WHERE) {
    const tw = ui.width(name, 12) + 16
    ui.bevel(tx, y + 6, tw, 24, trayWhere === k, trayWhere === k ? '#fff' : C.win)
    ui.text(name, tx + tw / 2, y + 22, { size: 12, align: 'center', bold: trayWhere === k })
    ui.hit(tx, y + 6, tw, 24, () => { trayWhere = k; trayScroll = 0 })
    tx += tw + 4
  }
  if (!list.length) { ui.text($t('点屋里的家具把它拿起来 · 工作台能做新的'), W / 2, y + 66, { size: 11, align: 'center', color: C.dim }); return }
  const s = 48, perPage = Math.floor((W - 64) / (s + 4))
  const pages = Math.ceil(list.length / perPage)
  trayScroll = Math.max(0, Math.min(pages - 1, trayScroll))
  list.slice(trayScroll * perPage, trayScroll * perPage + perPage).forEach((o, i) => {
    const x = 12 + i * (s + 4)
    ui.bevel(x, y + 38, s, s)
    ui.icon(o.item, x + 6, y + 44, s - 12)
    if (o.n > 1) ui.text(String(o.n), x + s - 3, y + 38 + s - 3, { size: 10, align: 'right', bold: true })
    ui.hit(x, y + 38, s, s, () => g.startDecor(o.item))
  })
  if (pages > 1) ui.button(W - 48, y + 38, 36, s, trayScroll < pages - 1 ? '›' : '‹', () => { trayScroll = trayScroll < pages - 1 ? trayScroll + 1 : 0 }, { size: 18 })
}

function drawHotbar() {
  const g = game
  const slots = g.slots()
  const held = g.save.held ?? 0
  const n = HOTBAR, gap = 3
  const s = Math.min(40, (W - 16 - gap * n) / (n + 1))
  const y = H - safeBot - s - 6
  let x = (W - (s + gap) * (n + 1) + gap) / 2
  for (let i = 0; i < n; i++) {
    const c = slots[i]
    ui.bevel(x, y, s, s, i === held && !!c, i === held && c ? '#fff6c9' : C.win)
    if (c) {
      ui.icon(c.item, x + 4, y + 3, s - 8)
      if (c.n > 1) ui.text(String(c.n), x + s - 3, y + s - 3, { size: 10, align: 'right', bold: true })
      const l = g.toolLife(c.item)
      if (l && l.left < l.max) { ui.fill(x + 3, y + s - 4, s - 6, 2, '#555'); ui.fill(x + 3, y + s - 4, (s - 6) * (l.left / l.max), 2, l.left / l.max < 0.2 ? C.bad : C.ok) }
    }
    const k = i
    ui.hit(x, y, s, s, () => g.hold(k))
    x += s + gap
  }
  ui.button(x, y, s, s, `${g.used()}/${g.capacity()}`, () => g.open({ kind: 'bag' }), { size: 10, primary: g.used() >= g.capacity() })
}

function drawFishing() {
  const f = game.fishing
  if (!f.active || f.phase === 'cast' || f.phase === 'land') return
  const y = H - safeBot - 150
  if (f.phase === 'wait') { ui.chip($t('等鱼上钩… 浮标猛地一沉再提竿（现在点是收竿）'), W / 2, y, { size: 11, align: 'center' }); return }
  const hold = (d: boolean) => f.hold(d)
  if (f.phase === 'bite') { ui.button(W / 2 - 70, y, 140, 48, $t('提竿！'), () => {}, { size: 18, primary: true, hold }); return }
  ui.text($t('拉近'), 12, y - 21, { size: 11 })
  ui.bar(44, y - 30, W - 84, 10, f.progress, C.ok)
  ui.text($t('线'), 12, y - 7, { size: 11 })
  ui.bar(44, y - 16, W - 84, 10, Math.min(1, f.tension), f.tension > 0.72 ? C.bad : C.coin)
  ui.button(W / 2 - 80, y, 160, 48, f.surging ? $t('鱼在冲！松手') : $t('按住收线'), () => {}, { size: 16, primary: !f.surging, hold })
}

/** a thing in hand: whether it fits (and why), and the buttons */
function drawPlacing() {
  const g = game
  const item = g.placingItem
  if (!item) return
  const gh = g.ghost
  const indoor = g.house.active
  const moving = !!g.house.moving
  const y = H - safeBot - (indoor && g.freePlace ? 150 : 112)
  const hh = indoor && g.freePlace ? 98 : 60
  ui.bevel(8, y, W - 16, hh, false, gh ? (gh.ok ? '#e8f6e8' : '#fbe8e4') : C.win)
  ui.icon(item, 14, y + 6, 22)
  const say = !gh ? $t('点地面选位置') : gh.ok ? gh.hint || $t('再点一下放下') : gh.level ? $t('地不平：可以一下铲平这一整块') : gh.why
  ui.text(ui.wrap(say, W - 60, 11)[0], 42, y + 22, { size: 11, color: gh && !gh.ok ? C.bad : C.ink })
  const btns: [string, () => void, boolean, boolean][] = []
  if (gh?.level) btns.push([$t('铲平这块（{0} 下）', gh.level), () => g.levelForPlacing(), true, false])
  else btns.push([$t('放这里'), () => g.placeHere(), true, !gh?.ok])
  if (FURNITURE[item]) btns.push(['⟳', () => g.rotatePlacing(), false, false])
  if (indoor) btns.push([g.freePlace ? $t('自由') : $t('对齐'), () => { g.freePlace = !g.freePlace; g.sfx('tap', 1.3); if (gh) g.aimAt(gh.x, gh.y); g.changed() }, false, false])
  if (item === 'furnaceKit' && !indoor) btns.push([$t('推荐位置'), () => g.placeAtDefault(), false, false])
  if (moving) btns.push([$t('收起来'), () => g.house.stash(), false, false])
  btns.push(['✕', () => g.cancelPlacing(), false, false])
  let bx = 14
  for (const [label, on, primary, disabled] of btns) {
    const w = Math.max(36, ui.width(label, 12, primary) + 16)
    ui.button(bx, y + 28, w, 28, label, on, { primary, disabled })
    bx += w + 5
  }
  if (indoor && g.freePlace) {
    const ny = y + 62
    ui.button(14, ny, 40, 30, '←', () => g.nudge(-1, 0), { size: 14 })
    ui.button(58, ny, 40, 30, '↑', () => g.nudge(0, -1), { size: 14 })
    ui.button(102, ny, 40, 30, '↓', () => g.nudge(0, 1), { size: 14 })
    ui.button(146, ny, 40, 30, '→', () => g.nudge(1, 0), { size: 14 })
  }
}

function drawFlight() {
  const g = game
  const h = g.hud()
  if (!h) return
  const boat = g.flight && g.vehicle(g.flight.vehicleId)?.type === 'skiff'
  let y = safeTop + 4
  ui.chip(`${h.vehicle} · ${$t('货舱：{0} · {1}', h.cargo, h.voyage.heavy)}`, 8, y, { size: 12 })
  y += 30
  if (h.dest) {
    const r = ui.chip(`${h.dest}  ${(h.dist / 100).toFixed(1)} km`, 8, y, { size: 13 })
    arrow(r.x + r.w + 18, y + 11, h.bearing, C.title1)
    y += 30
  }
  const wr = ui.chip(h.voyage.slip > 0 ? $t('海鸟气流！') : h.voyage.fog ? $t('雾里 · 藏身') : h.voyage.rain ? $t('雨里 · 慢') : h.voyage.windText, 8, y, { size: 11 })
  arrow(wr.x + wr.w + 14, y + 10, h.voyage.wind, '#5a6070', 0.7)
  y += 30
  const pr = h.voyage.pirate
  if (pr && pr.phase !== 'gone') {
    const py = y + 6
    ui.bevel(8, py, W - 16, 54, false, pr.dist < 62 ? '#ffd8d0' : '#fff0ec')
    arrow(26, py + 18, pr.bearing, C.bad)
    ui.text(`☠ ${boat ? $t('海盗') : $t('空盗')} ${(pr.dist / 100).toFixed(1)} km`, 44, py + 22, { size: 13, bold: true, color: C.bad })
    ui.bar(44, py + 30, W - 160, 8, Math.min(1, pr.grip), C.bad)
    ui.text(pr.phase === 'sighted' ? $t('发现你了！加速、急转弯') : pr.dist < 62 ? $t('它咬住你了！甩开！') : $t('保持距离'), 44, py + 50, { size: 11 })
    if (h.voyage.smoke > 0) ui.button(W - 104, py + 8, 90, 30, $t('烟幕 ×{0}', h.voyage.smoke), () => g.voyage.smoke())
    y += 66
  }
  if (g.combat.armed && h.phase === 'cruise') drawCombat(y)
  if (h.phase === 'cruise' && h.voyage.approach !== null) {
    const ay = H - safeBot - 150
    const a = h.voyage.approach
    ui.bevel(8, ay, W - 16, 46, false, a >= 80 ? '#e8f6e8' : a >= 55 ? '#fffbe8' : C.win)
    ui.text($t('{0}：{1}', boat ? $t('靠岸') : $t('进场'), h.voyage.approachText), 16, ay + 16, { size: 12, bold: true })
    ui.bar(16, ay + 22, W - 32, 8, a / 100, a >= 80 ? C.ok : C.coin)
    ui.text($t('{0} → 多 10–20% 收入', boat ? $t('从海上正对码头、别加速') : $t('顺着跑道方向、穿过金色光圈')), 16, ay + 42, { size: 10, color: C.dim })
  }
  const msg = h.phase === 'takeoff' ? (boat ? $t('离港中…') : $t('起飞中…')) : h.phase === 'landing' ? (boat ? $t('靠岸中…') : $t('降落中…')) : !h.canLand && h.voyage.approach === null ? $t('按住屏幕转向 · 点一下翻滚') : ''
  if (msg) ui.text(msg, W / 2, H - safeBot - 76, { size: 12, align: 'center', color: '#fff', shadow: true })
  const by = H - safeBot - 58
  ui.button(12, by, 64, 50, $t('加速'), () => {}, { size: 14, hold: (d) => g.scene.setKeys(0, 0, d) })
  ui.button(W - 76, by, 64, 50, $t('视角'), () => g.switchView(), { size: 14 })
  if (g.combat.armed && h.phase === 'cruise') {
    const c = g.combat.view()
    const bx = W / 2 - 99
    ui.button(bx, by, 62, 50, $t('开火'), () => {}, { size: 14, primary: true, hold: (d) => g.combat.fire(d) })
    ui.button(bx + 68, by, 62, 50, $t('导弹'), () => g.combat.missile(), { size: 14, disabled: c.missiles <= 0, primary: c.locked })
    ui.button(bx + 136, by, 62, 50, $t('翻滚'), () => g.scene.startRoll(), { size: 14, primary: c.incoming !== null })
  } else if (h.phase === 'cruise' && h.canLand) ui.button(W / 2 - 70, by, 140, 50, `${boat ? $t('靠岸') : $t('降落')} · ${h.canLand}`, () => g.land(), { size: 14, primary: true })
  if (g.combat.armed && h.phase === 'cruise' && h.canLand) ui.button(W / 2 - 70, by - 44, 140, 36, `${boat ? $t('靠岸') : $t('降落')} · ${h.canLand}`, () => g.land(), { primary: true })
  if (boat && !g.anchored && g.canAnchor() && !g.fishing.active) ui.button(W / 2 - 60, by - 44, 120, 36, $t('抛锚钓鱼'), () => g.dropAnchor())
  if (g.anchored && !g.fishing.active) {
    ui.button(W / 2 - 124, by - 44, 120, 36, $t('抛竿'), () => g.fishing.castAtSea(), { primary: true })
    ui.button(W / 2 + 4, by - 44, 120, 36, $t('起锚'), () => g.weighAnchor())
  }
  drawFishing()
}
function arrow(x: number, y: number, rot: number, col: string, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k)
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill()
  ctx.restore()
}
/** the hull, rounds, missiles; the sortie's tally; the two rings when a missile comes in */
function drawCombat(y: number) {
  const c = game.combat.view()
  ui.bevel(8, y, 150, 58, false, 'rgba(20,24,34,0.8)')
  ui.text($t('机体'), 14, y + 16, { size: 11, color: '#fff' })
  ui.bar(48, y + 7, 100, 10, c.hull, c.hull < 0.3 ? C.bad : C.ok)
  ui.text($t('机炮'), 14, y + 33, { size: 11, color: '#fff' })
  if (c.reload > 0) ui.bar(48, y + 24, 100, 10, c.reload, C.coin)
  else ui.text(String(c.ammo), 48, y + 33, { size: 12, bold: true, color: '#fff' })
  ui.text($t('导弹'), 14, y + 50, { size: 11, color: '#fff' })
  for (let i = 0; i < 4; i++) ui.fill(48 + i * 14, y + 41, 10, 10, i < c.missiles ? '#ffd84a' : '#555')
  if (c.counter) ui.text($t('三连发！'), 110, y + 50, { size: 11, bold: true, color: '#ffd84a' })
  if (c.sortie) {
    const t = c.sortie.won ? $t('清剿完了 · 回家') : $t('击落 {0} / {1}{2}', c.sortie.downed, c.sortie.need, c.sortie.dist > 420 ? ` · ${(c.sortie.dist / 100).toFixed(1)} km` : '')
    const r = ui.chip(`${c.sortie.name} · ${t}`, W - 8, y, { size: 12, align: 'right' })
    if (!c.sortie.won) arrow(r.x - 14, y + 11, c.sortie.bearing, C.bad)
  }
  if (c.incoming !== null) {
    const k = Math.max(0, Math.min(1, c.incoming / 1.3))
    const now = c.incoming <= 0.62 && c.incoming >= 0.1
    const cx = W / 2, cy = H * 0.45
    ctx.lineWidth = 3
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = now ? '#ffd84a' : C.bad; ctx.beginPath(); ctx.arc(cx, cy, 34 * (1 + k * 2.2), 0, Math.PI * 2); ctx.stroke()
    ui.text(now ? $t('翻滚！') : $t('导弹'), cx, cy + 6, { size: 16, bold: true, align: 'center', color: now ? '#ffd84a' : '#fff', shadow: true })
  }
  if (c.word) ui.text(c.word, W / 2, H * 0.3, { size: 22, bold: true, align: 'center', color: '#ffd84a', shadow: true })
}

function drawPanel() {
  const s = sheetFor(game)
  if (!s) return
  ui.fill(0, 0, W, H, 'rgba(10,20,40,0.28)')
  ui.hit(0, 0, W, H) // the world under a window takes no taps
  const key = game.panel!.kind
  const foot = s.foot?.length ? 40 : 0
  // as tall as last frame's content needed, up to most of the screen; standing on the bottom edge
  const maxH = H - Math.max(safeTop + 30, H * 0.12) - safeBot - 8
  const h = Math.min(maxH, Math.max(140, (heights[key] ?? maxH) + 50 + foot))
  const box = { x: 8, y: H - safeBot - 8 - h, w: W - 16, h }
  const sc = scrolls[key] ?? 0
  const content = drawSheet(ui, s, box, sc)
  // while the same window is open it only grows (so what is under a finger does not jump away)
  if (openPanel !== game.panel) { openPanel = game.panel; heights[key] = content }
  else heights[key] = Math.max(heights[key] ?? 0, content)
  sheetMax = Math.max(0, content - (box.h - 50 - foot))
  if (sc > sheetMax) scrolls[key] = sheetMax
  // a scroll bar when there is more
  if (sheetMax > 0) {
    const ch = box.h - 36 - foot
    const th = Math.max(24, (ch * ch) / (content + 16))
    ui.fill(box.x + box.w - 10, box.y + 30 + ((ch - th) * Math.min(sc, sheetMax)) / sheetMax, 3, th, 'rgba(10,36,106,0.4)')
  }
}

// ── touch
type Touch = { id: number; x: number; y: number; sx: number; sy: number; t: number; hit: ReturnType<typeof pick>; world: boolean; moved: boolean }
const touches = new Map<number, Touch>()
function pick(x: number, y: number) {
  for (let i = ui.hits.length - 1; i >= 0; i--) {
    const h = ui.hits[i]
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h
  }
  return null
}
const frameAt = (x: number, y: number) => ({ x: x / toScreen, y: y / toScreen })
const diveAt = (x: number, y: number) => ({ x: (x - diveOx) / diveK, y: (y - diveOy) / diveK })
// two fingers on the island: pinch to pull the camera back or in, twist to turn it
let two: { dist: number; ang: number } | null = null
let gestured = false
function pair() {
  const [a, b] = [...touches.values()]
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }
}

wx.onTouchStart((e: any) => {
  if (!heardTouch) { heardTouch = true; audio.unlock() }
  for (const t of e.changedTouches) {
    const hit = pick(t.clientX, t.clientY)
    const tc: Touch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: Date.now(), hit, world: !hit, moved: false }
    touches.set(t.identifier, tc)
    if (hit?.hold) hit.hold(true)
    if (tc.world && !title) {
      if (touches.size === 2 && [...touches.values()].every((x) => x.world) && game.mode === 'island') { two = pair(); gestured = true; game.press(false); continue }
      gestured = false
      game.pointerKind = 'touch'
      game.press(true)
      if (game.mode === 'flight' && !game.anchored) { const p = frameAt(t.clientX, t.clientY); game.scene.pointerMove(p.x, p.y) }
    }
  }
})
wx.onTouchMove((e: any) => {
  for (const t of e.changedTouches) {
    const tc = touches.get(t.identifier)
    if (!tc) continue
    const dy = t.clientY - tc.y
    tc.x = t.clientX; tc.y = t.clientY
    if (Math.hypot(tc.x - tc.sx, tc.y - tc.sy) > 10) tc.moved = true
    if (tc.hit?.scroll === 'sheet' || (tc.hit && tc.moved && game.panel)) {
      const key = game.panel?.kind
      if (key) scrolls[key] = Math.max(0, Math.min(sheetMax, (scrolls[key] ?? 0) - dy))
    }
    if (tc.world && game.mode === 'flight' && !game.anchored) { const p = frameAt(t.clientX, t.clientY); game.scene.pointerMove(p.x, p.y) }
  }
  if (two && touches.size === 2 && game.mode === 'island') {
    const now = pair()
    if (now.dist > two.dist * 1.25 && game.islandZoom !== 2) { game.toggleZoom(); two = now }
    else if (now.dist < two.dist * 0.8 && game.islandZoom === 2) { game.toggleZoom(); two = now }
    let d = now.ang - two.ang
    d -= Math.PI * 2 * Math.round(d / (Math.PI * 2))
    if (Math.abs(d) > Math.PI / 7) {
      if (!game.view3d) game.toggleView()
      game.rotateView(d > 0 ? 1 : -1)
      two = { dist: two.dist, ang: now.ang }
    }
  }
})
function end(e: any, cancel: boolean) {
  for (const t of e.changedTouches) {
    const tc = touches.get(t.identifier)
    touches.delete(t.identifier)
    if (touches.size < 2) two = null
    if (!tc) continue
    if (tc.hit?.hold) tc.hit.hold(false)
    if (tc.hit && !tc.moved && !cancel) {
      const before = game.fxCount
      tc.hit.on?.()
      // no button is silent: one that made no sound of its own gets a plain click
      if (tc.hit.on && game.fxCount === before) audio.play('tap')
      continue
    }
    if (!tc.world || title) continue
    game.press(false)
    if (gestured) { if (!touches.size) gestured = false; continue }
    const quick = Date.now() - tc.t < 260 && !tc.moved
    if (game.mode === 'flight') {
      if (game.anchored) continue
      if (quick && !cancel) { game.scene.press(); game.scene.release() }
      game.scene.pointerLeave()
      continue
    }
    if (tc.moved || cancel) continue
    if (game.dive.active) { const p = diveAt(t.clientX, t.clientY); game.dive.tapView(p.x, p.y); continue }
    if (game.house.resting && game.house.sleepIn <= 0 && !game.panel) { game.house.getUp(); continue }
    const p = frameAt(t.clientX, t.clientY)
    game.tap(p.x, p.y)
  }
}
wx.onTouchEnd((e: any) => end(e, false))
wx.onTouchCancel((e: any) => end(e, true))

// ── the loop
let last = 0
function sound() {
  audio.setScene(game.musicScene())
  const eng = game.engineSound()
  audio.setEngine(eng.kind, eng.speed, eng.boost)
  audio.setFurnace(game.furnaceLit())
  const w = game.weather.now
  const heard = game.mode === 'island' && (game.onSurface || game.house.active)
  audio.setAmbience({ rain: heard ? Math.max(w.rain, w.storm * 1.3) : 0, snow: heard ? w.snow : 0, indoor: game.house.active, fire: game.house.hearth, rest: game.house.resting || game.house.sleepIn > 0 })
}
function loop(t: number) {
  G.requestAnimationFrame(loop)
  const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016
  last = t
  game.update(title ? Math.min(dt, 0.016) : dt)
  if (audio.ctx) sound()
  forgetSentPostcard(game)
  frame()
}
G.requestAnimationFrame(loop)
