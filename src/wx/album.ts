// The photo album on WeChat (round 26). The web keeps PNG data URLs in localStorage; here a photo
// is the engine's own frame (the pixel picture before it is scaled up), kept as RGB bytes in wx
// storage, one key a photo. Drawn back through an offscreen canvas; saved to the phone's album
// on request. The game sees the same three things as on the web: takePhoto, photoPixels, postcard.
import type { Game } from '../game/game'
import { $t } from '../i18n'
import { C, type Block } from './ui'

const G = globalThis as any
const LIST = 'wx-album'
const PIX = 'wx-photo-'
const CARD = 'skyisle-postcard'
export const ALBUM_MAX = 10

export interface WxPhoto { id: number; day: number; where: string; w: number; h: number }
type Frame = () => { w: number; h: number; data: Uint8ClampedArray } | null
let frameOf: Frame = () => null
export function setFrameSource(f: Frame) { frameOf = f }

// ── base64 (wx has no btoa)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function enc(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=')
  }
  return s
}
const DEC = new Int16Array(128).fill(-1)
for (let i = 0; i < 64; i++) DEC[B64.charCodeAt(i)] = i
function dec(s: string): Uint8Array {
  const n = Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
  const out = new Uint8Array(n)
  let o = 0
  for (let i = 0; i < s.length; i += 4) {
    const v = (DEC[s.charCodeAt(i)] << 18) | (DEC[s.charCodeAt(i + 1)] << 12) | ((DEC[s.charCodeAt(i + 2)] & 63) << 6) | (DEC[s.charCodeAt(i + 3)] & 63)
    if (o < n) out[o++] = (v >> 16) & 255
    if (o < n) out[o++] = (v >> 8) & 255
    if (o < n) out[o++] = v & 255
  }
  return out
}

export function loadAlbum(): WxPhoto[] {
  try { const r = G.localStorage.getItem(LIST); const l = r ? JSON.parse(r) : []; return Array.isArray(l) ? l : [] } catch { return [] }
}
function storeList(l: WxPhoto[]) { try { G.localStorage.setItem(LIST, JSON.stringify(l)) } catch { /* full */ } }
function rgbOf(id: number): Uint8Array | null {
  try { const s = G.localStorage.getItem(PIX + id); return s ? dec(s) : null } catch { return null }
}
export function removePhoto(id: number) {
  storeList(loadAlbum().filter((p) => p.id !== id))
  try { G.localStorage.removeItem(PIX + id) } catch { /* gone */ }
  canvases.delete(id)
}

/** keep what is on the screen now */
export function capture(game: Game, at?: string): WxPhoto | null {
  const f = frameOf()
  if (!f) return null
  const rgb = new Uint8Array(f.w * f.h * 3)
  for (let i = 0, o = 0; i < f.w * f.h; i++) { rgb[o++] = f.data[i * 4]; rgb[o++] = f.data[i * 4 + 1]; rgb[o++] = f.data[i * 4 + 2] }
  const where = at ?? (game.house.active ? $t('家里') : game.mine.active ? $t('矿洞') : game.mode === 'flight' ? $t('天上') : game.islandName(game.save.here))
  const p: WxPhoto = { id: Date.now(), day: game.clockDay + 1, where, w: f.w, h: f.h }
  let list = [p, ...loadAlbum()]
  // the oldest go first: past the count, or when the storage is full
  for (const old of list.slice(ALBUM_MAX)) removePhoto(old.id)
  list = list.slice(0, ALBUM_MAX)
  for (;;) {
    try { G.localStorage.setItem(PIX + p.id, enc(rgb)); break } catch {
      const last = list.pop()
      if (!last || last.id === p.id) return null
      removePhoto(last.id)
    }
  }
  storeList(list)
  game.save.stats.photos = (game.save.stats.photos ?? 0) + 1
  return p
}

/** a photo as a canvas (made once) */
const canvases = new Map<number, any>()
export function photoCanvas(p: WxPhoto): any {
  let c = canvases.get(p.id)
  if (c) return c
  const rgb = rgbOf(p.id)
  if (!rgb) return null
  try {
    c = G.wx.createCanvas()
    c.width = p.w; c.height = p.h
    const x = c.getContext('2d')
    const img = x.createImageData(p.w, p.h)
    for (let i = 0; i < p.w * p.h; i++) { img.data[i * 4] = rgb[i * 3]; img.data[i * 4 + 1] = rgb[i * 3 + 1]; img.data[i * 4 + 2] = rgb[i * 3 + 2]; img.data[i * 4 + 3] = 255 }
    x.putImageData(img, 0, 0)
    canvases.set(p.id, c)
    return c
  } catch { return null }
}

/** for a frame on the wall: the middle of the picture, w × h colours */
export function photoPixels(id: number, w: number, h: number): Promise<[number, number, number][][] | null> {
  const p = loadAlbum().find((x) => x.id === id)
  const rgb = p && rgbOf(id)
  if (!p || !rgb) return Promise.resolve(null)
  const want = w / h
  let sw = p.w, sh = p.h
  if (sw / sh > want) sw = sh * want; else sh = sw / want
  const ox = (p.w - sw) / 2, oy = (p.h - sh) / 2
  const rows: [number, number, number][][] = []
  for (let y = 0; y < h; y++) {
    const r: [number, number, number][] = []
    for (let x = 0; x < w; x++) {
      const sx = Math.min(p.w - 1, Math.floor(ox + ((x + 0.5) * sw) / w)), sy = Math.min(p.h - 1, Math.floor(oy + ((y + 0.5) * sh) / h))
      const o = (sy * p.w + sx) * 3
      r.push([rgb[o], rgb[o + 1], rgb[o + 2]])
    }
    rows.push(r)
  }
  return Promise.resolve(rows)
}

/** the postcard for the next delivery: a small JPEG, as on the web (when this phone can make one) */
export function setPostcard(game: Game, p: WxPhoto | null) {
  if (!p) { game.postcard = null; try { G.localStorage.removeItem(CARD) } catch { /* */ } game.changed(); return }
  const src = photoCanvas(p)
  try {
    const t = G.wx.createCanvas()
    t.width = 200; t.height = Math.round((200 * p.h) / p.w)
    const x = t.getContext('2d')
    x.imageSmoothingEnabled = false
    x.drawImage(src, 0, 0, t.width, t.height)
    const url = t.toDataURL('image/jpeg', 0.82)
    if (!/^data:image\/(jpeg|png);base64,/.test(url)) throw new Error('no data url')
    game.postcard = url
    cardId = p.id
    try { G.localStorage.setItem(CARD, url) } catch { /* lasts this session */ }
  } catch { game.warn($t('这台手机做不了明信片')) }
  game.changed()
}
let cardId: number | null = null
export function restorePostcard(game: Game) {
  try { const c = G.localStorage.getItem(CARD); if (c && /^data:image\/(jpeg|png);base64,/.test(c)) game.postcard = c } catch { /* */ }
}
export function forgetSentPostcard(game: Game) {
  if (game.postcard) return
  cardId = null
  try { if (G.localStorage.getItem(CARD)) G.localStorage.removeItem(CARD) } catch { /* */ }
}

/** to the phone's own album (asks for the permission the first time) */
export function saveToPhone(p: WxPhoto) {
  const src = photoCanvas(p)
  if (!src) return
  try {
    const k = 4
    const t = G.wx.createCanvas()
    t.width = p.w * k; t.height = p.h * k
    const x = t.getContext('2d')
    x.imageSmoothingEnabled = false
    x.drawImage(src, 0, 0, t.width, t.height)
    const path = t.toTempFilePathSync({ fileType: 'png' })
    G.wx.saveImageToPhotosAlbum({ filePath: path, success: () => G.wx.showToast({ title: $t('存好了'), icon: 'success' }), fail: () => G.wx.showToast({ title: $t('没存上'), icon: 'none' }) })
  } catch { G.wx.showToast?.({ title: $t('没存上'), icon: 'none' }) }
}

// ── the album's window
export const albumState = { at: null as number | null }
function grid(list: WxPhoto[], tap: (p: WxPhoto) => void, chosen: (p: WxPhoto) => boolean): Block {
  const cols = 3, gap = 6
  return {
    t: 'custom', h: (w) => { const s = (w - gap * (cols - 1)) / cols; return Math.ceil(list.length / cols) * (s * 1.5 + 22) }, draw: (ui, x, y, w) => {
      const s = (w - gap * (cols - 1)) / cols, ph = s * 1.5
      list.forEach((p, i) => {
        const px = x + (i % cols) * (s + gap), py = y + Math.floor(i / cols) * (ph + 22)
        ui.bevel(px, py, s, ph, chosen(p), chosen(p) ? '#fff6c9' : '#ffffff')
        const c = photoCanvas(p)
        if (c) {
          // cover the cell, nearest-neighbour
          const k = Math.max((s - 6) / p.w, (ph - 6) / p.h)
          const sw = (s - 6) / k, sh = (ph - 6) / k
          ui.ctx.imageSmoothingEnabled = false
          ui.ctx.drawImage(c, (p.w - sw) / 2, (p.h - sh) / 2, sw, sh, px + 3, py + 3, s - 6, ph - 6)
        }
        ui.text($t('第 {0} 天 · {1}', p.day, p.where), px + s / 2, py + ph + 14, { size: 10, align: 'center', color: C.dim })
        ui.hit(px, py, s, ph + 20, () => tap(p))
      })
    },
  }
}
export function albumBlocks(game: Game): Block[] {
  const list = loadAlbum()
  const p = albumState.at !== null ? list.find((x) => x.id === albumState.at) : null
  if (p) {
    const chosen = cardId === p.id && !!game.postcard
    return [
      { t: 'h', text: $t('第 {0} 天 · {1}', p.day, p.where), small: true },
      { t: 'custom', h: (w) => Math.min(w * 1.6, (w * p.h) / p.w), draw: (ui, x, y, w) => {
        const c = photoCanvas(p)
        const h = Math.min(w * 1.6, (w * p.h) / p.w), pw = (h * p.w) / p.h
        ui.ctx.imageSmoothingEnabled = false
        if (c) ui.ctx.drawImage(c, 0, 0, p.w, p.h, x + (w - pw) / 2, y, pw, h)
      } },
      { t: 'actions', btns: [
        { label: chosen ? $t('不寄这张了') : $t('下次送货时寄出这张明信片'), on: () => setPostcard(game, chosen ? null : p) },
        { label: $t('存到手机相册'), on: () => saveToPhone(p), primary: false },
        { label: $t('删掉'), on: () => { removePhoto(p.id); if (chosen) setPostcard(game, null); albumState.at = null }, primary: false },
      ] },
      { t: 'p', text: $t('随下一单货寄出，岛主会回信。'), dim: true, small: true },
      { t: 'actions', left: true, btns: [{ label: $t('← 所有照片'), on: () => { albumState.at = null }, primary: false }] },
    ]
  }
  const out: Block[] = []
  if (game.postcard) out.push({ t: 'p', text: $t('下一单会附上一张明信片 ✉'), small: true })
  if (!list.length) out.push({ t: 'p', text: $t('还没有照片。点右上角的“拍”进入照相。'), dim: true })
  else out.push(grid(list, (x) => { albumState.at = x.id; game.sfx('tap') }, (x) => cardId === x.id && !!game.postcard))
  out.push({ t: 'actions', btns: [{ label: $t('去拍照'), on: () => { game.close(); game.photoMode = true; game.changed() } }] })
  return out
}
/** a frame on the wall: which photo goes in it */
export function frameBlocks(game: Game, piece: { photo?: number }): Block[] {
  const list = loadAlbum()
  const out: Block[] = []
  if (!list.length) out.push({ t: 'p', text: $t('相册里还没有照片。点右上角的相机拍一张，或者请客人来家里坐坐，走的时候会合影。'), dim: true })
  else out.push(grid(list, (x) => { game.house.setPhoto(piece as never, x.id); game.close() }, (x) => piece.photo === x.id))
  out.push({ t: 'p', text: $t('照片存在这台设备上；换了设备，相框里会是一幅海景画。'), dim: true, small: true })
  return out
}
