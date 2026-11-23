// The dive, painted (shared by the web's DiveView and the mini game): a side view of the sea in pixels, from the bright shallows with their rays
// of sunlight and coral, down past kelp and rock arches into the blue and the dark. The game
// keeps the dive's state (game/dive.ts); this draws it every frame and turns the pointer into
// taps and aim.

import type { Game } from '../game/game'
import { PX_PER_M, VIEW_H, VIEW_W, type Decor, type Dive, type Fish, type Thing } from '../game/dive'
import { HAIR_COLORS, SKINS } from '../engine/avatar'

type RGB = [number, number, number]
const css = (c: number[], a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`)
const mix = (a: number[], b: number[], k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const hash = (n: number) => {
  let x = (n * 374761393) | 0
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}
/** the water's colour at a depth (pixels below the surface) */
const WATER: [number, RGB][] = [[0, [100, 214, 232]], [100, [52, 160, 214]], [240, [30, 104, 178]], [420, [16, 60, 128]], [620, [6, 24, 64]]]
function waterAt(y: number): RGB {
  if (y <= 0) return WATER[0][1]
  for (let i = 0; i < WATER.length - 1; i++) {
    const [a, ca] = WATER[i]
    const [b, cb] = WATER[i + 1]
    if (y <= b) return mix(ca, cb, (y - a) / (b - a))
  }
  return WATER[WATER.length - 1][1]
}

export function drawDive(ctx: CanvasRenderingContext2D, d: Dive, game: Game, now: number, hover: { x: number; y: number } | null) {
  const t = now / 1000
  const cam = d.cam
  const W = VIEW_W, H = VIEW_H
  ctx.imageSmoothingEnabled = false
  // ── the water, row by row; the sky above the surface
  for (let y = 0; y < H; y++) {
    const wy = cam.y + y
    if (wy < 0) { ctx.fillStyle = css(mix([196, 232, 250], [150, 210, 245], (wy + 30) / 30)); ctx.fillRect(0, y, W, 1); continue }
    ctx.fillStyle = css(waterAt(wy))
    ctx.fillRect(0, y, W, 1)
  }
  // the surface: a bright wavy line, seen from below
  if (cam.y < 6) {
    const sy = -cam.y
    for (let x = 0; x < W; x++) {
      const wv = Math.sin((x + cam.x) * 0.09 + t * 2) * 1.5 + Math.sin((x + cam.x) * 0.031 - t) * 1.2
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillRect(x, sy + wv, 1, 1)
      ctx.fillStyle = 'rgba(200,245,255,0.35)'
      ctx.fillRect(x, sy + wv + 1, 1, 2)
    }
  }
  // rays of sunlight slanting down from the surface, fading with depth
  if (cam.y < 260) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 7; i++) {
      const bx = ((i * 97 - cam.x * 0.25) % (W + 160) + W + 160) % (W + 160) - 80
      const sway = Math.sin(t * 0.5 + i) * 10
      const a = Math.max(0, 0.08 * (1 - cam.y / 260)) * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 2))
      ctx.fillStyle = `rgba(220,250,255,${a})`
      ctx.beginPath()
      ctx.moveTo(bx + sway, -cam.y)
      ctx.lineTo(bx + 14 + sway, -cam.y)
      ctx.lineTo(bx + 70 + sway * 2, H)
      ctx.lineTo(bx + 34 + sway * 2, H)
      ctx.fill()
    }
    ctx.restore()
  }
  // ── far and middle distance: rock arches and pillars, in the water's colour gone darker
  const layer = (k: number, base: number, amp: number, dark: number, salt: number) => {
    for (let x = 0; x < W; x += 2) {
      const bx = cam.x * k + x
      const h = Math.sin(bx * 0.013 + salt) * amp + Math.sin(bx * 0.041 + salt * 2) * amp * 0.4 + (hash(Math.floor(bx / 24) + salt) - 0.5) * amp * 0.5
      const top = base - h - cam.y * k
      if (top >= H) continue
      for (let y = Math.max(0, Math.floor(top)); y < H; y += 2) {
        const c = waterAt(cam.y * k + y + 40)
        ctx.fillStyle = css(mix(c, [6, 20, 50], dark))
        ctx.fillRect(x, y, 2, 2)
      }
    }
  }
  layer(0.35, 300, 70, 0.28, 1.3)
  layer(0.62, 380, 60, 0.42, 4.1)
  // the school of tiny fish far off, glinting
  ctx.fillStyle = 'rgba(220,240,255,0.5)'
  for (let i = 0; i < 18; i++) {
    const fx = ((i * 37 + t * 14 - cam.x * 0.5) % (W + 40) + W + 40) % (W + 40) - 20
    const fy = 70 + Math.sin(i * 1.7 + t * 0.6) * 12 - cam.y * 0.5 + i * 2
    if (fy > 0 && fy < H) ctx.fillRect(fx | 0, fy | 0, 2, 1)
  }
  // ── the sea bed
  for (let x = 0; x < W; x++) {
    const wx = cam.x + x
    const fy = d.floorAt(wx) - cam.y
    if (fy >= H) continue
    const deep = Math.min(1, (fy + cam.y) / 600)
    const sand = mix([236, 220, 170], [70, 80, 100], deep)
    ctx.fillStyle = css(mix(sand, [255, 255, 240], 0.2))
    ctx.fillRect(x, Math.floor(fy), 1, 2)
    ctx.fillStyle = css(sand)
    ctx.fillRect(x, Math.floor(fy) + 2, 1, H)
    if (hash(wx * 7) < 0.12) { ctx.fillStyle = css(mix(sand, [0, 0, 0], 0.15)); ctx.fillRect(x, Math.floor(fy) + 4 + Math.floor(hash(wx) * 8), 1, 1) }
  }
  // caustics on the bed in the shallows
  if (cam.y < 260) {
    ctx.fillStyle = `rgba(255,255,230,${0.18 * (1 - cam.y / 260)})`
    for (let x = 0; x < W; x += 3) {
      const wx = cam.x + x
      if (Math.sin(wx * 0.21 + t * 1.8) * Math.sin(wx * 0.07 - t * 1.1) > 0.55) ctx.fillRect(x, d.floorAt(wx) - cam.y + 1, 3, 1)
    }
  }
  for (const dc of d.decor) {
    const x = dc.x - cam.x
    if (x < -40 || x > W + 40) continue
    drawDecor(ctx, dc, x, d.floorAt(dc.x) - cam.y, t)
  }
  for (const th of d.things) {
    const x = th.x - cam.x, y = th.y - cam.y
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue
    drawThing(ctx, th, x, y, t)
  }
  // ink
  for (const k of d.inks) {
    ctx.fillStyle = `rgba(20,16,30,${Math.min(0.7, k.t * 0.3)})`
    for (let i = 0; i < 8; i++) ctx.fillRect(k.x - cam.x + Math.sin(i * 2.3) * 8 - 3, k.y - cam.y + Math.cos(i * 1.7) * 6 - 3, 7, 6)
  }
  // the vents, breathing; the sunken chest
  for (const v of d.vents) {
    const x = v.x - cam.x, y = v.y - cam.y
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue
    ctx.fillStyle = '#2a2f3a'
    ctx.fillRect(x - 4, y - 1, 8, 2)
    if (!v.used) {
      ctx.fillStyle = `rgba(200,240,255,${0.25 + Math.sin(v.t * 4) * 0.12})`
      ctx.fillRect(x - 2, y - 40, 4, 39)
    }
  }
  if (d.chest) {
    const c = d.chest, x = c.x - cam.x, y = c.y - cam.y
    if (x > -20 && x < W + 20 && y > -20 && y < H + 20) {
      ctx.fillStyle = '#6a4424'; ctx.fillRect(x - 6, y - 4, 12, 6)
      ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 6, c.open ? y - 9 : y - 7, 12, c.open ? 2 : 3)
      ctx.fillStyle = '#d8b050'; ctx.fillRect(x - 1, y - 4, 2, 2)
      if (!c.open && Math.floor(t * 2) % 3 === 0) { ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.fillRect(x + 4, y - 8, 1, 1) }
      if (c.open) { ctx.fillStyle = 'rgba(255,220,120,0.6)'; ctx.fillRect(x - 4, y - 8, 8, 2) }
    }
  }
  // life only to be seen: a turtle, a shoal of little silver fish, lanterns down deep
  for (const dr of d.drifters) {
    const x = dr.x - cam.x, y = dr.y - cam.y
    if (x < -40 || x > W + 40 || y < -30 || y > H + 30) continue
    const dir = dr.vx >= 0 ? 1 : -1
    if (dr.kind === 'turtle') {
      ctx.fillStyle = '#5a7a4a'; ctx.beginPath(); ctx.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#7a9a5a'; ctx.beginPath(); ctx.ellipse(x, y - 1, 6, 3, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#c0b080'; ctx.fillRect(x + dir * 9, y - 1, dir * 3, 3)
      const fl = Math.sin(dr.ph * 3) * 2
      ctx.fillRect(x + dir * 4, y + 3 + fl, 3, 2); ctx.fillRect(x - dir * 5, y + 3 - fl, 3, 2)
    } else if (dr.kind === 'school') {
      for (let i = 0; i < 14; i++) {
        const ox = Math.sin(i * 2.1 + dr.ph * 1.3) * 14 + (i % 5) * 4 * dir, oy = Math.cos(i * 1.7 + dr.ph) * 7
        ctx.fillStyle = (i + Math.floor(dr.ph * 4)) % 5 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(170,200,220,0.85)'
        ctx.fillRect((x + ox) | 0, (y + oy) | 0, 3, 1)
      }
    } else {
      const glow = 0.5 + Math.sin(dr.ph * 2) * 0.4
      ctx.fillStyle = `rgba(140,240,255,${glow * 0.25})`; ctx.fillRect(x - 3, y - 3, 7, 7)
      ctx.fillStyle = `rgba(190,255,250,${glow})`; ctx.fillRect(x, y, 2, 1)
    }
  }
  // the falling snow of the sea: specks drifting down, more of them in the deep
  ctx.fillStyle = 'rgba(230,240,250,0.35)'
  for (let i = 0; i < 46; i++) {
    const px = ((hash(i * 7 + 1) * 997 - cam.x * 0.6) % W + W) % W
    const py = ((hash(i * 13 + 5) * 991 + t * (4 + (i % 4)) - cam.y * 0.8) % H + H) % H
    if (i % 3 === 0 && d.y < 200) continue
    ctx.fillRect(px | 0, py | 0, 1, 1)
  }
  // ── creatures
  for (const j of d.jellies) drawJelly(ctx, j.x - cam.x, j.y - cam.y, j.ph, j.col)
  if (d.shark) drawShark(ctx, d.shark.x - cam.x, d.shark.y - cam.y, d.shark.dir, t, d.shark.charge > 0)
  for (const f of d.fish) {
    const x = f.x - cam.x, y = f.y - cam.y
    if (x < -30 || x > W + 30 || y < -20 || y > H + 20) continue
    drawFish(ctx, f, x, y, t)
  }
  // the reticle on the fish under the pointer
  if (hover && game.count('harpoon')) {
    let best: Fish | null = null
    let bd = 14
    for (const f of d.fish) { const q = Math.hypot(f.x - cam.x - hover.x, f.y - cam.y - hover.y) - f.sp.len * 0.5; if (q < bd) { bd = q; best = f } }
    if (best) {
      const x = best.x - cam.x, y = best.y - cam.y
      const r = best.sp.len * 0.6 + 4
      const inRange = Math.hypot(best.x - d.x, best.y - d.y) < 130
      ctx.strokeStyle = inRange ? 'rgba(255,255,255,0.95)' : 'rgba(255,200,120,0.8)'
      ctx.lineWidth = 1
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath(); ctx.moveTo(x + sx * r, y + sy * (r - 3)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - 3), y + sy * r); ctx.stroke()
      }
      // the aiming line, dotted, from the gun
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      const dx = x - (d.x - cam.x), dy = y - (d.y - cam.y)
      const len = Math.hypot(dx, dy)
      for (let s = 10; s < len - r; s += 4) ctx.fillRect((d.x - cam.x + (dx / len) * s) | 0, (d.y - cam.y + (dy / len) * s) | 0, 1, 1)
    }
  }
  // ── the harpoon on its line
  if (d.shot) {
    const s = d.shot
    const gx = d.x - cam.x + Math.cos(d.aim) * 8, gy = d.y - cam.y + Math.sin(d.aim) * 8
    ctx.strokeStyle = 'rgba(240,240,230,0.7)'
    ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(s.x - cam.x, s.y - cam.y); ctx.stroke()
    ctx.setLineDash([])
    const a = Math.atan2(s.vy, s.vx)
    ctx.save()
    ctx.translate(s.x - cam.x, s.y - cam.y)
    ctx.rotate(s.back ? a : a)
    ctx.fillStyle = '#d8dce4'
    ctx.fillRect(-6, -0.5, 7, 1)
    ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(6, 0); ctx.lineTo(3, 2); ctx.fill()
    ctx.restore()
    if (s.fish) drawFish(ctx, s.fish, s.x - cam.x, s.y - cam.y, t)
  }
  drawDiver(ctx, d, game, d.x - cam.x, d.y - cam.y, t)
  // bubbles
  ctx.strokeStyle = 'rgba(230,248,255,0.8)'
  for (const b of d.bubbles) {
    const x = b.x - cam.x, y = b.y - cam.y
    if (y < -cam.y) continue
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.stroke()
  }
  // ── the dark of the deep: the diver's lamp is all the light down there
  const deep = Math.max(0, Math.min(1, (d.y - 220) / 380))
  if (deep > 0) {
    const g = ctx.createRadialGradient(d.x - cam.x, d.y - cam.y, 20, d.x - cam.x, d.y - cam.y, 150)
    g.addColorStop(0, 'rgba(2,8,24,0)')
    g.addColorStop(1, `rgba(2,8,24,${0.8 * deep})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  // the lanterns glow through the dark
  if (deep > 0) for (const dr of d.drifters) if (dr.kind === 'lantern') {
    const x = dr.x - cam.x, y = dr.y - cam.y
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue
    const glow = 0.5 + Math.sin(dr.ph * 2) * 0.4
    ctx.fillStyle = `rgba(160,250,255,${glow * deep})`; ctx.fillRect(x, y, 2, 1)
  }
  // hurt: a red edge
  if (d.hurtT > 1) { ctx.strokeStyle = `rgba(240,60,60,${(d.hurtT - 1) * 0.8})`; ctx.lineWidth = 6; ctx.strokeRect(0, 0, W, H); ctx.lineWidth = 1 }
}

function drawDecor(ctx: CanvasRenderingContext2D, dc: Decor, x: number, base: number, t: number) {
  const c = dc.col
  const s = dc.size
  switch (dc.kind) {
    case 'coral': {
      // a branching coral: a few forks, thinning upwards
      const branch = (x0: number, y0: number, a: number, len: number, w: number, n: number) => {
        const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len
        ctx.strokeStyle = css(mix(c, [255, 255, 255], 0.15 * (3 - n)))
        ctx.lineWidth = w
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
        if (n > 0) {
          branch(x1, y1, a - 0.45 - hash(dc.seed + n) * 0.3, len * 0.72, Math.max(1, w - 1), n - 1)
          branch(x1, y1, a + 0.45 + hash(dc.seed + n * 3) * 0.3, len * 0.72, Math.max(1, w - 1), n - 1)
        } else { ctx.fillStyle = css(mix(c, [255, 255, 255], 0.5)); ctx.fillRect(x1 - 1, y1 - 1, 2, 2) }
      }
      branch(x, base, -Math.PI / 2, 9 * s, 3, 3)
      ctx.lineWidth = 1
      break
    }
    case 'fan': {
      ctx.strokeStyle = css(c)
      for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + i * 3 * s, base - 16 * s + Math.abs(i) * 2); ctx.stroke() }
      ctx.strokeStyle = css(mix(c, [255, 255, 255], 0.3))
      for (let r = 6; r < 16 * s; r += 4) { ctx.beginPath(); ctx.arc(x, base, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke() }
      break
    }
    case 'tube':
      for (let i = 0; i < 4; i++) {
        const h = (6 + hash(dc.seed + i) * 12) * s
        ctx.fillStyle = css(mix(c, [0, 0, 0], 0.15 * i))
        ctx.fillRect(x + i * 4 - 6, base - h, 3, h)
        ctx.fillStyle = css(mix(c, [255, 255, 255], 0.4))
        ctx.fillRect(x + i * 4 - 6, base - h, 3, 1)
      }
      break
    case 'kelp':
      for (let k = 0; k < 3; k++) {
        const h = (36 + hash(dc.seed + k) * 50) * s
        for (let y = 0; y < h; y += 2) {
          const sw = Math.sin(t * 1.2 + y * 0.06 + k) * (y / h) * 6
          ctx.fillStyle = (y >> 2) % 2 ? 'rgb(60,140,80)' : 'rgb(90,176,96)'
          ctx.fillRect(x + k * 4 + sw, base - y, 2, 2)
          if (y % 10 === 6) { ctx.fillStyle = 'rgb(110,190,100)'; ctx.fillRect(x + k * 4 + sw + 2, base - y, 3, 2) }
        }
      }
      break
    case 'rock': {
      const w = 14 * s, h = 9 * s
      ctx.fillStyle = 'rgb(84,96,116)'
      ctx.beginPath(); ctx.ellipse(x, base, w, h, 0, Math.PI, 0); ctx.fill()
      ctx.fillStyle = 'rgb(118,130,148)'
      ctx.beginPath(); ctx.ellipse(x - w * 0.25, base - h * 0.55, w * 0.45, h * 0.3, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = css(mix(c, [60, 140, 90], 0.5))
      ctx.fillRect(x + w * 0.2, base - h * 0.8, 3, 2)
      break
    }
    case 'anemone':
      for (let i = -3; i <= 3; i++) {
        const sw = Math.sin(t * 2 + i) * 1.5
        ctx.fillStyle = css(mix(c, [255, 200, 220], 0.4))
        ctx.fillRect(x + i * 1.5 + sw, base - 6 * s, 1, 6 * s)
        ctx.fillStyle = css(mix(c, [255, 255, 255], 0.5))
        ctx.fillRect(x + i * 1.5 + sw, base - 6 * s, 1, 1)
      }
      ctx.fillStyle = css(c)
      ctx.fillRect(x - 4, base - 2, 8, 2)
      break
  }
}

function drawThing(ctx: CanvasRenderingContext2D, th: Thing, x: number, y: number, t: number) {
  switch (th.item) {
    case 'urchin':
      ctx.fillStyle = 'rgb(50,30,70)'
      ctx.beginPath(); ctx.arc(x, y - 2, 3, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgb(80,50,110)'
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + Math.cos(a) * 6, y - 2 + Math.sin(a) * 6); ctx.stroke() }
      break
    case 'shell':
      ctx.fillStyle = 'rgb(250,190,180)'
      ctx.beginPath(); ctx.arc(x, y, 4, Math.PI, 0); ctx.fill()
      ctx.strokeStyle = 'rgb(220,140,140)'
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + i * 2, y - 4); ctx.stroke() }
      break
    case 'lobster':
      ctx.fillStyle = 'rgb(210,70,50)'
      ctx.fillRect(x - 6, y - 3, 10, 3)
      ctx.fillRect(x + 4, y - 4, 3, 2); ctx.fillRect(x + 4, y - 1, 3, 2)
      ctx.fillStyle = 'rgb(240,120,90)'
      ctx.fillRect(x - 8 + Math.sin(t * 3), y - 5, 1, 3)
      break
    case 'pearl':
      ctx.fillStyle = 'rgb(110,100,110)'
      ctx.beginPath(); ctx.ellipse(x, y - 1, 6, 3, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = `rgba(255,255,255,${0.7 + 0.3 * Math.sin(t * 4)})`
      ctx.beginPath(); ctx.arc(x, y - 3, 1.6, 0, Math.PI * 2); ctx.fill()
      break
  }
}

function drawFish(ctx: CanvasRenderingContext2D, f: Fish, x: number, y: number, t: number) {
  const sp = f.sp
  const [back, belly, fin, stripe] = sp.col
  const L = sp.len, Ht = sp.ht
  const dir = f.dir
  const flash = f.hurt > 0 && Math.floor(t * 20) % 2 === 0
  const B = flash ? [255, 255, 255] : back
  const wig = Math.sin(t * 10 + f.id) * (Math.abs(f.vx) > 10 ? 1.5 : 0.7)
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.scale(dir, 1)
  switch (sp.shape) {
    case 'octo': {
      ctx.fillStyle = css(B)
      ctx.beginPath(); ctx.ellipse(0, -2, L * 0.38, Ht * 0.4, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = css(fin)
      ctx.lineWidth = 1.5
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(-4 + i * 1.6, 1)
        ctx.quadraticCurveTo(-6 + i * 2.4 + Math.sin(t * 3 + i) * 3, 5, -8 + i * 3, 6 + Math.cos(t * 3 + i) * 2)
        ctx.stroke()
      }
      ctx.lineWidth = 1
      ctx.fillStyle = '#fff'; ctx.fillRect(1, -3, 2, 2); ctx.fillStyle = '#222'; ctx.fillRect(2, -3, 1, 1)
      break
    }
    case 'squid': {
      ctx.fillStyle = css(B, 0.85)
      ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(-L * 0.1, -Ht * 0.5); ctx.lineTo(-L * 0.3, 0); ctx.lineTo(-L * 0.1, Ht * 0.5); ctx.fill()
      ctx.strokeStyle = css(fin, 0.8)
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-L * 0.3, i); ctx.lineTo(-L * 0.6 + Math.sin(t * 6 + i) * 2, i * 1.6); ctx.stroke() }
      ctx.fillStyle = '#222'; ctx.fillRect(-L * 0.2, -1, 1, 1)
      break
    }
    case 'flat': {
      const flap = Math.sin(t * 3 + f.id) * Ht * 0.6
      ctx.fillStyle = css(B)
      ctx.beginPath(); ctx.moveTo(L * 0.5, 0); ctx.lineTo(0, -Ht - flap); ctx.lineTo(-L * 0.35, 0); ctx.lineTo(0, Ht * 0.5 + flap * 0.3); ctx.fill()
      ctx.strokeStyle = css(fin)
      ctx.beginPath(); ctx.moveTo(-L * 0.35, 0); ctx.lineTo(-L * 0.8, Math.sin(t * 4) * 2); ctx.stroke()
      ctx.fillStyle = css(belly); ctx.fillRect(-2, 0, 6, 1)
      break
    }
    default: {
      const tall = sp.shape === 'tall'
      const long = sp.shape === 'long'
      // tail
      ctx.fillStyle = css(fin)
      ctx.beginPath(); ctx.moveTo(-L * 0.42, 0); ctx.lineTo(-L * 0.62, -Ht * (long ? 0.7 : 0.55) + wig); ctx.lineTo(-L * 0.62, Ht * (long ? 0.7 : 0.55) + wig); ctx.fill()
      // body: back above, belly below
      ctx.fillStyle = css(B)
      ctx.beginPath()
      if (tall) { ctx.moveTo(L * 0.5, 0); ctx.lineTo(0, -Ht * 0.5); ctx.lineTo(-L * 0.45, 0); ctx.lineTo(0, Ht * 0.5) }
      else ctx.ellipse(0, 0, L * 0.5, Ht * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      if (!flash) {
        ctx.fillStyle = css(belly)
        ctx.beginPath()
        if (tall) { ctx.moveTo(L * 0.45, 0.5); ctx.lineTo(-L * 0.4, 0.5); ctx.lineTo(0, Ht * 0.45) }
        else ctx.ellipse(0, Ht * 0.18, L * 0.42, Ht * 0.28, 0, 0, Math.PI)
        ctx.fill()
        if (stripe) {
          ctx.fillStyle = css(stripe)
          const n = long ? 5 : tall ? 3 : 2
          for (let i = 0; i < n; i++) ctx.fillRect(-L * 0.3 + i * (L * 0.6 / n), -Ht * (long ? 0.45 : 0.4), long ? 1 : 1.5, long ? Ht * 0.4 : Ht * 0.8)
        }
        // a fin on the back
        ctx.fillStyle = css(fin)
        ctx.beginPath(); ctx.moveTo(-L * 0.1, -Ht * 0.45); ctx.lineTo(L * 0.08, -Ht * (tall ? 1.1 : 0.75)); ctx.lineTo(L * 0.18, -Ht * 0.4); ctx.fill()
        if (tall) { ctx.beginPath(); ctx.moveTo(-L * 0.1, Ht * 0.45); ctx.lineTo(L * 0.05, Ht * 1.05); ctx.lineTo(L * 0.15, Ht * 0.4); ctx.fill() }
      }
      ctx.fillStyle = '#fff'
      ctx.fillRect(Math.round(L * 0.28), Math.round(-Ht * 0.18) - 1, 2, 2)
      ctx.fillStyle = '#1a1a22'
      ctx.fillRect(Math.round(L * 0.28) + 1, Math.round(-Ht * 0.18) - 1, 1, 1)
      if (f.sp.item === 'moonfish') { ctx.fillStyle = `rgba(220,230,255,${0.25 + 0.15 * Math.sin(t * 3)})`; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.8, Ht * 0.8, 0, 0, Math.PI * 2); ctx.fill() }
    }
  }
  ctx.restore()
}

function drawJelly(ctx: CanvasRenderingContext2D, x: number, y: number, ph: number, col: RGB) {
  if (x < -20 || x > VIEW_W + 20 || y < -30 || y > VIEW_H + 30) return
  const pulse = 1 + Math.sin(ph * 3) * 0.15
  ctx.fillStyle = css(col, 0.55)
  ctx.beginPath(); ctx.ellipse(x, y, 6 * pulse, 5 / pulse, 0, Math.PI, 0); ctx.fill()
  ctx.fillStyle = css(mix(col, [255, 255, 255], 0.5), 0.6)
  ctx.fillRect(x - 3, y - 3, 2, 1)
  ctx.strokeStyle = css(col, 0.5)
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * 2, y)
    ctx.quadraticCurveTo(x + i * 2 + Math.sin(ph * 2 + i) * 3, y + 7, x + i * 2.4 + Math.sin(ph * 2.5 + i) * 2, y + 14)
    ctx.stroke()
  }
}

function drawShark(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, t: number, charge: boolean) {
  if (x < -60 || x > VIEW_W + 60 || y < -30 || y > VIEW_H + 30) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir, 1)
  const sw = Math.sin(t * (charge ? 10 : 4)) * 3
  ctx.fillStyle = 'rgb(84,100,124)'
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.quadraticCurveTo(10, -9, -18, -3); ctx.lineTo(-30, -10 + sw); ctx.lineTo(-26, 0); ctx.lineTo(-30, 9 + sw); ctx.lineTo(-18, 4); ctx.quadraticCurveTo(10, 8, 26, 0); ctx.fill()
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-6, -15); ctx.lineTo(-9, -5); ctx.fill()
  ctx.fillStyle = 'rgb(200,210,220)'
  ctx.beginPath(); ctx.moveTo(24, 1); ctx.quadraticCurveTo(8, 7, -14, 3); ctx.lineTo(-10, 1); ctx.fill()
  ctx.fillStyle = '#111'; ctx.fillRect(16, -3, 2, 2)
  if (charge) { ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(18 + i * 2, 2, 1, 2) }
  ctx.restore()
}

function drawDiver(ctx: CanvasRenderingContext2D, d: Dive, game: Game, x: number, y: number, t: number) {
  const look = game.look
  const skin = SKINS[look.skin] ?? SKINS[1]
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[1]
  const suit = [40, 60, 110], shirt = look.shirt
  const f = d.facing
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.scale(f * 1.4, 1.4)
  if (d.stun > 0) ctx.rotate(Math.sin(t * 30) * 0.15)
  const kick = Math.sin(d.kick) * 2.5
  // flippers and legs, behind
  ctx.fillStyle = 'rgb(240,200,40)'
  ctx.fillRect(-17, -1 + kick, 5, 2); ctx.fillRect(-17, 2 - kick, 5, 2)
  ctx.fillStyle = css(suit)
  ctx.fillRect(-12, -1 + kick * 0.5, 6, 2); ctx.fillRect(-12, 2 - kick * 0.5, 6, 2)
  // body
  ctx.fillRect(-7, -3, 11, 6)
  ctx.fillStyle = css(shirt)
  ctx.fillRect(-6, -3, 9, 2)
  // the tank on the back
  ctx.fillStyle = 'rgb(250,200,50)'
  ctx.fillRect(-7, -6, 9, 3)
  ctx.fillStyle = 'rgb(200,150,30)'
  ctx.fillRect(-7, -4, 9, 1)
  // head, hair, mask
  ctx.fillStyle = css(skin)
  ctx.fillRect(4, -5, 5, 5)
  if (look.hair !== 'bald') { ctx.fillStyle = css(hair); ctx.fillRect(4, -6, 4, 2); ctx.fillRect(3, -5, 2, 3) }
  if (look.hair === 'long' || look.hair === 'ponytail') { ctx.fillStyle = css(hair); ctx.fillRect(1, -5, 3, 2) }
  ctx.fillStyle = 'rgb(140,220,240)'
  ctx.fillRect(7, -4, 3, 2)
  ctx.fillStyle = 'rgb(40,40,50)'
  ctx.fillRect(6, -4, 1, 2)
  ctx.fillStyle = 'rgb(240,200,40)' // the mouthpiece
  ctx.fillRect(8, -1, 2, 1)
  ctx.restore()
  // the arm and the harpoon gun, along the aim
  const a = d.aim
  ctx.save()
  ctx.translate(Math.round(x + f * 3), Math.round(y))
  ctx.rotate(a)
  ctx.scale(1.4, 1.4)
  ctx.fillStyle = css(suit)
  ctx.fillRect(0, -1, 5, 2)
  if (game.count('harpoon')) {
    ctx.fillStyle = 'rgb(110,76,50)'
    ctx.fillRect(4, -1, 7, 2)
    ctx.fillStyle = 'rgb(180,186,196)'
    if (!d.shot) ctx.fillRect(10, -0.5, 4, 1)
  }
  ctx.restore()
}

