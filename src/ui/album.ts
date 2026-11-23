// The photo album: pictures taken in photo mode, kept on this device (not in the save, which goes
// to the cloud: pictures are too big for that). Each has the picture as it was on the screen, and a
// small copy for postcards. One can be chosen as the postcard that goes with the next delivery.
import type { Game } from '../game/game'
import { $t } from '../i18n'

export interface Photo { id: number; at: number; day: number; where: string; full: string; thumb: string }
const KEY = 'skyisle-album'
const CARD = 'skyisle-postcard'
/** pictures kept (the oldest go first) */
export const ALBUM_MAX = 12

export function loadAlbum(): Photo[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Photo[]) : []
    return Array.isArray(list) ? list.filter((p) => p && typeof p.full === 'string' && typeof p.thumb === 'string') : []
  } catch {
    return []
  }
}
function store(list: Photo[]) {
  // if the device is full, drop the oldest until it fits
  for (let n = list.length; n >= 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, n)))
      return n
    } catch { /* too big: one fewer */ }
  }
  return 0
}

/** the picture on the screen now, and a small copy */
export function capture(game: Game, at?: string): Photo | null {
  const cv = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement | null
  if (!cv) return null
  let full: string, thumb: string
  try {
    full = cv.toDataURL('image/png')
    const t = document.createElement('canvas')
    t.width = 200
    t.height = Math.round((200 * cv.height) / cv.width)
    const c = t.getContext('2d')!
    c.imageSmoothingEnabled = false
    c.drawImage(cv, 0, 0, t.width, t.height)
    thumb = t.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
  const where = at ?? (game.house.active ? $t('家里') : game.mine.active ? $t('矿洞') : game.mode === 'flight' ? $t('天上') : game.islandName(game.save.here))
  const p: Photo = { id: Date.now(), at: Date.now(), day: game.clockDay + 1, where, full, thumb }
  const list = [p, ...loadAlbum()].slice(0, ALBUM_MAX)
  store(list)
  game.save.stats.photos = (game.save.stats.photos ?? 0) + 1
  return p
}
export function removePhoto(id: number) {
  store(loadAlbum().filter((p) => p.id !== id))
}

/** a postcard is waiting on the device (so a sent one can be forgotten without reading storage each time) */
let kept = false
/** the postcard for the next delivery: kept on the device too, so it survives a reload */
export function setPostcard(game: Game, thumb: string | null) {
  game.postcard = thumb
  kept = !!thumb
  try { thumb ? localStorage.setItem(CARD, thumb) : localStorage.removeItem(CARD) } catch { /* no room: it lasts this session */ }
  game.changed()
}
/** at start: the postcard chosen last time */
export function restorePostcard(game: Game) {
  try {
    const c = localStorage.getItem(CARD)
    if (c && /^data:image\/(jpeg|png);base64,/.test(c)) { game.postcard = c; kept = true }
  } catch { /* ignore */ }
}
/** after a delivery took it: forget it on the device too */
export function forgetSentPostcard(game: Game) {
  if (!kept || game.postcard) return
  kept = false
  try { localStorage.removeItem(CARD) } catch { /* ignore */ }
}

/** a picture from the album as w × h colours, rows from the top (the middle of it, cropped to that
 * shape): for a frame on the wall */
export function photoPixels(id: number, w: number, h: number): Promise<[number, number, number][][] | null> {
  const p = loadAlbum().find((x) => x.id === id)
  if (!p || typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((done) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const x = c.getContext('2d')!
        // the middle of the picture, as wide for its height as the frame
        const want = w / h
        let sw = img.width, sh = img.height
        if (sw / sh > want) sw = sh * want; else sh = sw / want
        x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h)
        const d = x.getImageData(0, 0, w, h).data
        const rows: [number, number, number][][] = []
        for (let y = 0; y < h; y++) { const r: [number, number, number][] = []; for (let i = 0; i < w; i++) { const o = (y * w + i) * 4; r.push([d[o], d[o + 1], d[o + 2]]) } rows.push(r) }
        done(rows)
      } catch { done(null) }
    }
    img.onerror = () => done(null)
    img.src = p.thumb
  })
}
