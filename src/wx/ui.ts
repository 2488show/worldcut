// A small immediate-mode UI drawn on the WeChat mini-game canvas (round 25).
// The web version's windows are DOM; a mini game has no DOM, so every frame the screen is drawn here
// and each button leaves a hit box behind for the next touch. Sizes are in screen points (the
// phone's CSS pixels); the context is scaled by the pixel ratio once.
import { ICONS, COLORS } from '../game/icons'
import type { ItemId } from '../game/data'

export interface Hit { x: number; y: number; w: number; h: number; on?: () => void; hold?: (down: boolean) => void; scroll?: 'sheet'; label?: string }

export const C = {
  win: '#c0c0c0', light: '#ffffff', dark: '#404040', mid: '#808080', ink: '#101828', dim: '#5a6070',
  title1: '#0a246a', title2: '#3a6ea5', paper: '#fff6c9', coin: '#e0a020', bad: '#b8302a', ok: '#2a7a3a',
}

/** a picture for an item with no drawn icon (furniture): a canvas, set up by main */
let modelIcon: ((id: ItemId) => any) | null = null
export function setModelIcon(f: (id: ItemId) => any) { modelIcon = f }

export class UI {
  hits: Hit[] = []
  font = 'sans-serif'
  constructor(public ctx: CanvasRenderingContext2D, public W: number, public H: number) {}
  begin() { this.hits = [] }
  setFont(size: number, bold = false) { this.ctx.font = `${bold ? 'bold ' : ''}${size}px ${this.font}`; return this.ctx }
  text(s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean; shadow?: boolean } = {}) {
    const c = this.setFont(o.size ?? 12, o.bold)
    c.textAlign = o.align ?? 'left'
    c.textBaseline = 'alphabetic'
    if (o.shadow) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillText(s, x + 1, y + 1) }
    c.fillStyle = o.color ?? C.ink
    c.fillText(s, x, y)
  }
  width(s: string, size = 12, bold = false) { return this.setFont(size, bold).measureText(s).width }
  /** lines that fit in w (Chinese breaks anywhere; Latin at spaces when it can) */
  wrap(s: string, w: number, size = 12): string[] {
    const out: string[] = []
    for (const para of String(s).split('\n')) {
      let line = ''
      let i = 0
      while (i < para.length) {
        // a Latin word goes in whole
        const m = /^[A-Za-z0-9'’.,:;!?()%+\-/·]+ ?/.exec(para.slice(i))
        const piece = m ? m[0] : para[i]
        if (this.width(line + piece, size) > w && line) { out.push(line.trimEnd()); line = piece.trimStart() }
        else line += piece
        i += piece.length
      }
      out.push(line)
    }
    return out
  }
  fill(x: number, y: number, w: number, h: number, col: string) { this.ctx.fillStyle = col; this.ctx.fillRect(x, y, w, h) }
  /** a raised "Cloud Isles 95" box (sunk = pressed in) */
  bevel(x: number, y: number, w: number, h: number, sunk = false, face = C.win) {
    this.fill(x, y, w, h, face)
    this.fill(x, y, w, 1, sunk ? C.mid : C.light); this.fill(x, y, 1, h, sunk ? C.mid : C.light)
    this.fill(x, y + h - 1, w, 1, sunk ? C.light : C.dark); this.fill(x + w - 1, y, 1, h, sunk ? C.light : C.dark)
  }
  hit(x: number, y: number, w: number, h: number, on?: () => void, hold?: (down: boolean) => void) { this.hits.push({ x, y, w, h, on, hold }) }
  button(x: number, y: number, w: number, h: number, label: string, on: () => void, o: { disabled?: boolean; primary?: boolean; size?: number; hold?: (d: boolean) => void } = {}) {
    this.bevel(x, y, w, h, false, o.primary && !o.disabled ? '#dfe8f6' : C.win)
    this.text(label, x + w / 2, y + h / 2 + (o.size ?? 12) * 0.38, { size: o.size ?? 12, align: 'center', color: o.disabled ? C.mid : C.ink, bold: o.primary })
    if (!o.disabled) { this.hit(x, y, w, h, on, o.hold); this.hits[this.hits.length - 1].label = label }
  }
  /** a 10x10 item drawing, size points square */
  icon(id: ItemId | 'coin', x: number, y: number, size = 20) {
    const rows = ICONS[id]
    const c = this.ctx
    if (!rows) {
      const m = id !== 'coin' && modelIcon ? modelIcon(id) : null
      if (m) { c.imageSmoothingEnabled = false; c.drawImage(m, x, y, size, size); return }
      this.bevel(x + 2, y + 2, size - 4, size - 4, true, '#e8e0d0'); return
    }
    const p = size / 10
    for (let r = 0; r < 10; r++) for (let q = 0; q < 10; q++) {
      const col = COLORS[rows[r][q]]
      if (!col) continue
      c.fillStyle = col
      c.fillRect(Math.round(x + q * p), Math.round(y + r * p), Math.ceil(p), Math.ceil(p))
    }
  }
  /** a window: title bar with an × (if onClose) */
  window(x: number, y: number, w: number, h: number, title: string, onClose?: () => void) {
    this.bevel(x, y, w, h)
    const g = this.ctx.createLinearGradient(x, 0, x + w, 0)
    g.addColorStop(0, C.title1); g.addColorStop(1, C.title2)
    this.ctx.fillStyle = g
    this.ctx.fillRect(x + 3, y + 3, w - 6, 22)
    this.text(title, x + 9, y + 19, { size: 13, color: '#fff', bold: true })
    if (onClose) {
      const bx = x + w - 25, by = y + 6
      this.bevel(bx, by, 18, 16)
      this.text('×', bx + 9, by + 13, { size: 14, align: 'center', bold: true })
      this.hit(bx - 8, by - 6, 34, 28, onClose)
    }
  }
  chip(s: string, x: number, y: number, o: { size?: number; align?: 'left' | 'center' | 'right'; color?: string; bg?: string } = {}) {
    const size = o.size ?? 12
    const w = this.width(s, size) + 12, h = size + 9
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
    this.bevel(x0, y, w, h, false, o.bg ?? '#f4f0e6')
    this.text(s, x0 + 6, y + h - 6, { size, color: o.color })
    return { w, h, x: x0 }
  }
  bar(x: number, y: number, w: number, h: number, u: number, col: string) {
    this.bevel(x, y, w, h, true, '#e8e8e8')
    this.fill(x + 1, y + 1, Math.max(0, Math.min(1, u)) * (w - 2), h - 2, col)
  }
}

// ───────────────────────────────────────────────── windows made of blocks
export interface Btn { label: string; on: () => void; disabled?: boolean; primary?: boolean }
/** a cell of an item grid (the bag, the warehouse, the codex…) */
export interface Cell { item?: ItemId | null; n?: number; label?: string; on?: boolean; locked?: boolean; life?: number; dim?: boolean; text?: string }
export type Block =
  | { t: 'p'; text: string; dim?: boolean; small?: boolean; color?: string; center?: boolean }
  | { t: 'h'; text: string; right?: string; rightColor?: string; small?: boolean }
  | { t: 'row'; icon?: ItemId | 'coin'; title: string; tag?: string; lines?: string[]; lineColor?: string; titleColor?: string; price?: number | string; btns?: Btn[]; done?: boolean; on?: () => void; sel?: boolean }
  | { t: 'tabs'; items: { label: string; on: () => void; active: boolean; badge?: string }[] }
  | { t: 'actions'; btns: Btn[]; left?: boolean }
  | { t: 'bar'; label: string; u: number; color?: string; right?: string }
  | { t: 'gap' }
  /** a grid of item cells, `cols` across (cells are square) */
  | { t: 'cells'; cells: Cell[]; cols?: number; size?: number; tap?: (i: number) => void }
  /** a row of colour swatches; the picked one sunk */
  | { t: 'swatches'; colors: string[]; picked: (i: number) => boolean; tap: (i: number) => void; extra?: Btn[] }
  /** a label, − value + */
  | { t: 'stepper'; label: string; value: string; minus: () => void; plus: () => void; big?: [() => void, () => void]; note?: string }
  /** a line chart */
  | { t: 'spark'; pts: number[]; h: number; up?: string; down?: string; labels?: boolean }
  /** anything else: draws itself in (x, y, w) and says how tall it was */
  | { t: 'custom'; h: number | ((w: number) => number); draw: (ui: UI, x: number, y: number, w: number) => void }
export interface Sheet { title: string; blocks: Block[]; onClose?: () => void; foot?: Btn[] }

/** draws a window of blocks; returns the height of its content (for scrolling) */
export function drawSheet(ui: UI, s: Sheet, box: { x: number; y: number; w: number; h: number }, scroll: number): number {
  const { x, y, w, h } = box
  ui.window(x, y, w, h, s.title, s.onClose)
  const foot = s.foot?.length ? 40 : 0
  const cx = x + 6, cy = y + 30, cw = w - 12, ch = h - 36 - foot
  ui.bevel(cx, cy, cw, ch, true, '#fbfbf8')
  if (foot) {
    let bx = x + w - 6
    for (const bt of [...s.foot!].reverse()) {
      const bw = Math.max(64, ui.width(bt.label, 12, true) + 20)
      bx -= bw
      ui.button(bx, cy + ch + 6, bw, 30, bt.label, bt.on, { disabled: bt.disabled, primary: bt.primary ?? true })
      bx -= 8
    }
  }
  const c = ui.ctx
  c.save()
  c.beginPath(); c.rect(cx + 1, cy + 1, cw - 2, ch - 2); c.clip()
  // hits made inside the content are kept only where they are visible
  const before = ui.hits.length
  let py = cy + 8 - scroll
  const pad = 10, iw = cw - pad * 2
  for (const b of s.blocks) {
    if (b.t === 'gap') { py += 8; continue }
    if (b.t === 'p') {
      const size = b.small ? 11 : 12
      for (const ln of ui.wrap(b.text, iw, size)) { ui.text(ln, b.center ? cx + cw / 2 : cx + pad, py + size, { size, color: b.color ?? (b.dim ? C.dim : C.ink), align: b.center ? 'center' : 'left' }); py += size + 5 }
      py += 4
      continue
    }
    if (b.t === 'h') {
      const size = b.small ? 13 : 15
      ui.text(b.text, cx + pad, py + size, { size, bold: true })
      if (b.right) ui.text(b.right, cx + cw - pad, py + size, { size: 12, align: 'right', color: b.rightColor ?? C.coin, bold: true })
      py += size + 9
      continue
    }
    if (b.t === 'cells') {
      const cols = b.cols ?? Math.max(4, Math.floor(iw / (b.size ?? 44)))
      const gap = 4
      const s = Math.floor((iw - gap * (cols - 1)) / cols)
      b.cells.forEach((c, i) => {
        const x0 = cx + pad + (i % cols) * (s + gap), y0 = py + Math.floor(i / cols) * (s + gap + (c.label !== undefined ? 14 : 0))
        ui.bevel(x0, y0, s, s, !!c.on, c.locked ? '#a8a8a8' : c.on ? '#fff6c9' : C.win)
        if (c.item) {
          const pad2 = Math.max(3, Math.round(s * 0.12))
          ui.ctx.globalAlpha = c.dim ? 0.3 : 1
          ui.icon(c.item, x0 + pad2, y0 + pad2, s - pad2 * 2)
          ui.ctx.globalAlpha = 1
        } else if (c.text) ui.text(c.text, x0 + s / 2, y0 + s / 2 + 6, { size: Math.min(18, s * 0.45), align: 'center', color: c.dim ? C.mid : C.ink, bold: true })
        if (c.n !== undefined && c.n > 1) ui.text(String(c.n), x0 + s - 3, y0 + s - 3, { size: 10, align: 'right', bold: true })
        if (c.life !== undefined) { ui.fill(x0 + 3, y0 + s - 5, s - 6, 3, '#555'); ui.fill(x0 + 3, y0 + s - 5, (s - 6) * c.life, 3, c.life < 0.2 ? C.bad : C.ok) }
        if (c.label !== undefined) ui.text(c.label, x0 + s / 2, y0 + s + 11, { size: 9, align: 'center', color: C.dim })
        if (b.tap && !c.locked) { const k = i; ui.hit(x0, y0, s, s, () => b.tap!(k)) }
      })
      const rowH = s + gap + (b.cells.some((c) => c.label !== undefined) ? 14 : 0)
      py += Math.ceil(b.cells.length / cols) * rowH + 6
      continue
    }
    if (b.t === 'swatches') {
      const s = 26, gap = 5
      let sx = cx + pad, sy = py
      const all = b.colors.length + (b.extra?.length ?? 0)
      for (let i = 0; i < all; i++) {
        if (sx + s > cx + cw - pad) { sx = cx + pad; sy += s + gap }
        if (i < b.colors.length) {
          const on = b.picked(i)
          ui.bevel(sx, sy, s, s, on, C.win)
          ui.fill(sx + 3, sy + 3, s - 6, s - 6, b.colors[i])
          if (on) { ui.ctx.strokeStyle = C.title1; ui.ctx.lineWidth = 2; ui.ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2) }
          const k = i
          ui.hit(sx, sy, s, s, () => b.tap(k))
          sx += s + gap
        } else {
          const bt = b.extra![i - b.colors.length]
          const bw = ui.width(bt.label, 12) + 14
          if (sx + bw > cx + cw - pad) { sx = cx + pad; sy += s + gap }
          ui.button(sx, sy, bw, s, bt.label, bt.on, { disabled: bt.disabled, primary: bt.primary })
          sx += bw + gap
        }
      }
      py = sy + s + 10
      continue
    }
    if (b.t === 'stepper') {
      ui.text(b.label, cx + pad, py + 19, { size: 13 })
      let bx = cx + cw - pad
      const put = (label: string, on: () => void, w = 34) => { bx -= w; ui.button(bx, py, w, 28, label, on, { size: 14 }); bx -= 4 }
      if (b.big) put('+10', b.big[1], 40)
      put('+', b.plus)
      bx -= 64
      ui.bevel(bx, py, 64, 28, true, '#ffffff')
      ui.text(b.value, bx + 32, py + 19, { size: 13, align: 'center', bold: true })
      bx -= 4
      put('−', b.minus)
      if (b.big) put('−10', b.big[0], 40)
      py += 34
      if (b.note) { for (const ln of ui.wrap(b.note, iw, 11)) { ui.text(ln, cx + pad, py + 11, { size: 11, color: C.dim }); py += 15 } py += 4 }
      continue
    }
    if (b.t === 'spark') {
      drawSpark(ui, b.pts, cx + pad, py, iw, b.h, b.labels)
      py += b.h + 8
      continue
    }
    if (b.t === 'custom') {
      b.draw(ui, cx + pad, py, iw)
      py += (typeof b.h === 'function' ? b.h(iw) : b.h) + 6
      continue
    }
    if (b.t === 'tabs') {
      let tx = cx + pad, ty = py
      for (const it of b.items) {
        const tw = ui.width(it.label, 12) + 16
        if (tx + tw > cx + cw - pad) { tx = cx + pad; ty += 28 }
        ui.bevel(tx, ty, tw, 24, it.active, it.active ? '#ffffff' : C.win)
        ui.text(it.label, tx + tw / 2, ty + 16, { size: 12, align: 'center', bold: it.active })
        if (it.badge) { ui.fill(tx + tw - 9, ty - 3, 12, 12, C.bad); ui.text(it.badge, tx + tw - 3, ty + 7, { size: 9, align: 'center', color: '#fff', bold: true }) }
        ui.hit(tx, ty, tw, 24, it.on); ui.hits[ui.hits.length - 1].label = it.label
        tx += tw + 4
      }
      py = ty + 32
      continue
    }
    if (b.t === 'actions') {
      // right-aligned, wrapping onto more lines when they do not fit
      const ws = b.btns.map((bt) => Math.min(iw, Math.max(64, ui.width(bt.label, 12, true) + 20)))
      const lines: number[][] = [[]]
      let used = 0
      ws.forEach((w, i) => { if (used + w > iw && lines[lines.length - 1].length) { lines.push([]); used = 0 } lines[lines.length - 1].push(i); used += w + 8 })
      for (const ln of lines) {
        let bx = b.left ? cx + pad : cx + cw - pad - ln.reduce((a, i) => a + ws[i] + 8, -8)
        for (const i of ln) {
          const bt = b.btns[i]
          ui.button(bx, py, ws[i], 30, bt.label, bt.on, { disabled: bt.disabled, primary: bt.primary ?? true })
          bx += ws[i] + 8
        }
        py += 36
      }
      py += 4
      continue
    }
    if (b.t === 'bar') {
      ui.text(b.label, cx + pad, py + 12, { size: 12 })
      if (b.right) ui.text(b.right, cx + cw - pad, py + 12, { size: 11, align: 'right', color: C.dim })
      ui.bar(cx + pad, py + 18, iw, 10, b.u, b.color ?? C.title2)
      py += 36
      continue
    }
    // a row: icon, name, lines, price, then its buttons under it on the right
    const ix = cx + pad, tx = ix + (b.icon ? 30 : 0), tw = cx + cw - pad - tx - (b.price !== undefined ? 60 : 0)
    const top = py
    if (b.sel) ui.fill(cx + 2, py - 4, cw - 4, 4, '#dfe8f6')
    if (b.icon) ui.icon(b.icon, ix, py + 2, 24)
    const tl = ui.wrap((b.done ? '✓ ' : '') + b.title, tw, 13)
    tl.forEach((ln, i) => ui.text(ln, tx, py + 14 + i * 17, { size: 13, bold: true, color: b.titleColor ?? (b.done ? C.ok : C.ink) }))
    py += (tl.length - 1) * 17
    if (b.tag) ui.chip(b.tag, tx + ui.width((b.done ? '✓ ' : '') + b.title, 13, true) + 6, py + 1, { size: 10 })
    if (b.price !== undefined) {
      ui.icon('coin', cx + cw - pad - 58, py + 2, 14)
      ui.text(String(b.price), cx + cw - pad, py + 14, { size: 13, align: 'right', bold: true, color: '#8a5a00' })
    }
    let ly = py + 20
    for (const l of b.lines ?? []) for (const ln of ui.wrap(l, tw, 11)) { ui.text(ln, tx, ly + 11, { size: 11, color: b.lineColor ?? C.dim }); ly += 15 }
    if (b.btns?.length) {
      ly += 4
      let bx = cx + cw - pad
      for (const bt of [...b.btns].reverse()) {
        const bw = Math.max(52, ui.width(bt.label, 12, true) + 16)
        bx -= bw
        ui.button(bx, ly, bw, 28, bt.label, bt.on, { disabled: bt.disabled, primary: bt.primary })
        bx -= 6
      }
      ly += 32
    }
    py = ly + 6
    if (b.sel) { ui.ctx.strokeStyle = C.title2; ui.ctx.lineWidth = 2; ui.ctx.strokeRect(cx + 3, top - 4, cw - 6, py - top + 4) }
    if (b.on) { const before2 = ui.hits.length; ui.hits.splice(before2 - (b.btns?.filter((x) => !x.disabled).length ?? 0), 0, { x: cx, y: top - 4, w: cw, h: py - top + 4, on: b.on }) }
    ui.fill(cx + pad, py, iw, 1, '#e4e0d8')
    py += 8
  }
  c.restore()
  // drop hits that are out of the visible content
  const keep = ui.hits.slice(before).filter((t) => t.y + t.h > cy && t.y < cy + ch)
  for (const t of keep) { const top = Math.max(t.y, cy); t.h = Math.min(t.y + t.h, cy + ch) - top; t.y = top }
  ui.hits.length = before
  ui.hits.push({ x: cx, y: cy, w: cw, h: ch, scroll: 'sheet' }, ...keep)
  return py + scroll - (cy + 8)
}

/** a line of prices: red up, green down (as on a Chinese board) */
export function drawSpark(ui: UI, pts: number[], x: number, y: number, w: number, h: number, labels = false) {
  const c = ui.ctx
  ui.bevel(x, y, w, h, true, '#0d1420')
  if (pts.length < 2) return
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1
  const up = pts[pts.length - 1] >= pts[0]
  const col = up ? '#e84a3a' : '#3ab060'
  const px = (i: number) => x + 2 + (i / (pts.length - 1)) * (w - 4)
  const py = (v: number) => y + h - 3 - ((v - lo) / span) * (h - 6)
  c.beginPath()
  pts.forEach((v, i) => (i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v))))
  c.strokeStyle = col; c.lineWidth = 1.5; c.stroke()
  if (labels) {
    c.lineTo(px(pts.length - 1), y + h - 1); c.lineTo(px(0), y + h - 1); c.closePath()
    c.fillStyle = up ? 'rgba(232,74,58,0.18)' : 'rgba(58,176,96,0.18)'; c.fill()
    ui.text(hi.toFixed(1), x + w - 4, y + 12, { size: 10, align: 'right', color: '#c8c8c8' })
    ui.text(lo.toFixed(1), x + w - 4, y + h - 4, { size: 10, align: 'right', color: '#c8c8c8' })
  }
}
