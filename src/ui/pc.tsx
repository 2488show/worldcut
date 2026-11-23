// The computer at home (round 13): sit down at the desk and the screen fills the view — a beige
// tower, a CRT, a lamp's warm light on the wood — and on the screen an old operating system, its
// icons the island's own things: the stock market, the mailbox, the weather, the fish book, the
// photo album, minesweeper. One window at a time, as on a small screen.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { WEATHER_NAME, type WeatherKind } from '../game/weather'
import { Board, SWEEP, settle, PAID_A_DAY, type SweepLevel } from '../game/sweep'
import { InWindow } from './bits'
import { NewsApp, StockMachine } from './stocks'
import { Mailbox } from './mailbox'
import { FishBookPage } from './fishbook'
import { Album } from './photo'
import { $t } from '../i18n'

// ───────────────────────────────────────────────────────────── the desk, painted small
/** the scene is painted at this size and scaled up with hard pixels */
const SW = 320
const SH = 180
/** the screen's glass, in scene pixels */
const GLASS = { x: 104, y: 31, w: 116, h: 82 }

function paintDesk(c: HTMLCanvasElement) {
  c.width = SW
  c.height = SH
  const x = c.getContext('2d')!
  const px = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`
  const rect = (a: number, b: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(a, b, w, h) }
  // the wall: dark, a little dithered
  rect(0, 0, SW, SH, px(28, 27, 46))
  for (let j = 0; j < 118; j += 2) for (let i = (j / 2) % 2; i < SW; i += 2) if ((i * 7 + j * 13) % 11 === 0) rect(i, j, 1, 1, px(34, 33, 54))
  // the lamp's light on the wall
  const lw = x.createRadialGradient(270, 70, 4, 270, 70, 120)
  lw.addColorStop(0, 'rgba(255,214,150,0.22)')
  lw.addColorStop(1, 'rgba(255,214,150,0)')
  x.fillStyle = lw
  x.fillRect(0, 0, SW, 120)
  // the desk: its top in perspective, its front edge
  x.fillStyle = px(150, 104, 68)
  x.beginPath(); x.moveTo(16, 118); x.lineTo(304, 118); x.lineTo(320, 168); x.lineTo(0, 168); x.closePath(); x.fill()
  for (let j = 120; j < 168; j += 5) rect(0, j, SW, 1, px(138, 94, 60))
  rect(0, 168, SW, 4, px(110, 74, 48))
  rect(0, 172, SW, 8, px(18, 16, 26))
  // warm light pooled on the desk under the lamp
  const ld = x.createRadialGradient(262, 140, 6, 262, 140, 110)
  ld.addColorStop(0, 'rgba(255,220,160,0.5)')
  ld.addColorStop(1, 'rgba(255,220,160,0)')
  x.fillStyle = ld
  x.fillRect(120, 110, 200, 60)
  // the tower
  rect(22, 40, 58, 112, px(206, 200, 186)); rect(22, 40, 58, 3, px(228, 224, 212)); rect(76, 43, 4, 109, px(170, 164, 150))
  rect(28, 52, 44, 20, px(86, 84, 90)); rect(31, 55, 38, 6, px(196, 192, 182))
  rect(28, 78, 44, 16, px(190, 184, 170)); rect(32, 86, 30, 2, px(70, 68, 74))
  rect(28, 100, 36, 12, px(178, 172, 158)); rect(32, 105, 26, 2, px(60, 58, 64)); rect(68, 104, 3, 3, px(110, 210, 120))
  for (let j = 134; j < 148; j += 3) rect(30, j, 42, 1, px(150, 144, 132))
  // the monitor: bezel, glass (drawn by the page over it), chin, stand
  rect(90, 20, 144, 106, px(214, 208, 194)); rect(90, 20, 144, 3, px(232, 228, 218)); rect(230, 23, 4, 103, px(176, 170, 156))
  rect(100, 27, 124, 90, px(150, 146, 136))
  rect(GLASS.x - 2, GLASS.y - 2, GLASS.w + 4, GLASS.h + 4, px(36, 38, 44))
  rect(96, 119, 132, 8, px(198, 192, 178))
  x.fillStyle = px(120, 116, 108); x.font = '6px monospace'; x.fillText('CRT', 104, 125)
  for (let i = 0; i < 4; i++) rect(190 + i * 7, 121, 4, 3, px(170, 164, 150))
  rect(222, 121, 3, 3, px(110, 210, 120))
  rect(146, 127, 32, 6, px(184, 178, 164)); rect(136, 133, 52, 3, px(170, 164, 150))
  // the keyboard
  x.fillStyle = px(226, 220, 204)
  x.beginPath(); x.moveTo(96, 140); x.lineTo(226, 140); x.lineTo(234, 162); x.lineTo(88, 162); x.closePath(); x.fill()
  for (let r = 0; r < 4; r++) for (let k = 0; k < 22; k++) {
    const kx = 96 + k * 6 - r * 2 + (r ? 1 : 0), ky = 143 + r * 5
    if (kx > 92 && kx < 228) rect(kx, ky, 4, 3, r === 3 && k > 6 && k < 15 ? px(150, 146, 140) : px(242, 238, 226))
  }
  rect(96, 160, 138, 2, px(170, 164, 150))
  // the lamp: base, arm, shade, and its bulb
  rect(248, 132, 36, 6, px(110, 170, 80)); rect(252, 130, 28, 2, px(130, 190, 96))
  x.strokeStyle = px(40, 40, 46); x.lineWidth = 3
  x.beginPath(); x.moveTo(266, 130); x.lineTo(272, 84); x.lineTo(258, 52); x.stroke()
  x.fillStyle = px(110, 176, 80)
  x.beginPath(); x.moveTo(236, 56); x.lineTo(258, 40); x.lineTo(278, 58); x.lineTo(262, 70); x.closePath(); x.fill()
  x.fillStyle = px(255, 246, 220)
  x.beginPath(); x.ellipse(250, 66, 12, 5, -0.6, 0, Math.PI * 2); x.fill()
  // the mouse on its pad, the cable
  x.fillStyle = px(70, 130, 128)
  x.beginPath(); x.moveTo(250, 146); x.lineTo(300, 146); x.lineTo(310, 166); x.lineTo(244, 166); x.closePath(); x.fill()
  x.fillStyle = px(224, 218, 204); x.beginPath(); x.ellipse(278, 156, 7, 5, 0.3, 0, Math.PI * 2); x.fill()
  x.strokeStyle = px(40, 40, 46); x.lineWidth = 1
  x.beginPath(); x.moveTo(280, 151); x.quadraticCurveTo(286, 132, 232, 128); x.stroke()
}

// ───────────────────────────────────────────────────────────── the desktop's icons, in pixels
const PAL: Record<string, string> = {
  k: '#1e1c26', w: '#ffffff', g: '#c8c8c8', G: '#808080', y: '#ffd84a', Y: '#fff2a8', o: '#f08a3c', r: '#e84a3a', R: '#ff9c8c',
  b: '#2a5cc8', B: '#8cb4ff', n: '#2e8a4a', N: '#7ad08c', c: '#5ac8d8', C: '#c8f0f4', s: '#8a6a4a', S: '#d0a878', p: '#b06ad8',
}
const ICON: Record<string, string[]> = {
  stocks: ['kkkkkkkkkkkk', 'kwwwwwwwwwwk', 'kwwwwwwwwrwk', 'kwwwwwwwrrwk', 'kwwrwwwrwwwk', 'kwrwrwrwwwwk', 'krwwwrwwwwwk', 'kwwwwwwwwwwk', 'kgggggggggk.', 'kkkkkkkkkkk.', '....kGGk....', '...kkkkkk...'],
  news: ['kkkkkkkkkkk.', 'kwwwwwwwwwkk', 'kwkkkkkkkwkw', 'kwwwwwwwwwkw', 'kwkkkwwkkwkw', 'kwkrkwwwwwkw', 'kwkkkwwkkwkw', 'kwwwwwwwwwkw', 'kwkkkkkkkwkw', 'kwwwwwwwwwkw', 'kkkkkkkkkkkw', '.kkkkkkkkkkk'],
  mail: ['............', 'kkkkkkkkkkkk', 'kYwwwwwwwwYk', 'kwYwwwwwwYwk', 'kwwYwwwwYwwk', 'kwwwYwwYwwwk', 'kwwwwYYwwwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk', '............', '............'],
  weather: ['....y.......', '.y..y..y....', '..yyyyy.....', 'yyyYYYyy....', '..yYYYgggg..', '.yyYYgwwwwg.', '...ygwwwwwwg', '..gwwwwwwwwg', '.gwwwwwwwwwg', '.gggggggggg.', '..B..B..B...', '.B..B..B....'],
  fish: ['............', '............', '....kkkkk...', '..kkcccccc.k', '.kccCCccccck', 'kcwkcCccccck', 'kccccCcccc.k', '.kccccccc.kk', '..kkkkkkk...', '............', '............', '............'],
  album: ['............', '.kkkkkkkkkk.', '.kgggkkgggk.', '.kggkCCkggk.', '.kggkCbCkgk.', '.kggkCCkggk.', '.kgggkkgggk.', '.kggggggggk.', '.kkkkkkkkkk.', '............', '............', '............'],
  sweep: ['............', '.....k......', '..k.kkk.k...', '...kkkkk....', '..kkwkkkk...', 'kkkwwkkkkkk.', '..kkkkkkk...', '...kkkkk....', '..k.kkk.k...', '.....k......', '............', '............'],
  bin: ['....kkkk....', '.kkkkkkkkkk.', '.kggggggggk.', '..kgGgGgGk..', '..kgGgGgGk..', '..kgGgGgGk..', '..kgGgGgGk..', '..kgGgGgGk..', '..kgGgGgGk..', '..kkkkkkkk..', '............', '............'],
  isle: ['.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', '..SSSSSSSS..', '..SSbbSSSS..', '..SSbbSssS..', '..SSSSSssS..', '..SSSSSssS..', 'nnnnnnnnnnnn', '............'],
  start: ['rrrrr.nnnnn.', 'rrrrr.nnnnn.', 'rrrrr.nnnnn.', 'rrrrr.nnnnn.', '............', 'bbbbb.yyyyy.', 'bbbbb.yyyyy.', 'bbbbb.yyyyy.', 'bbbbb.yyyyy.', '............', '............', '............'],
}
const iconCache = new Map<string, string>()
function pixIcon(id: string): string {
  let u = iconCache.get(id)
  if (u) return u
  const rows = ICON[id]
  const c = document.createElement('canvas')
  c.width = rows[0].length
  c.height = rows.length
  const x = c.getContext('2d')!
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1) } }))
  u = c.toDataURL()
  iconCache.set(id, u)
  return u
}
const Pix = ({ id, size = 28 }: { id: string; size?: number }) => <img class="pix" src={pixIcon(id)} width={size} height={size} alt="" />

// ───────────────────────────────────────────────────────────── the apps
type App = 'stocks' | 'news' | 'mail' | 'weather' | 'fish' | 'album' | 'sweep' | 'bin' | 'isle'
const APPS: { id: App; name: string; icon: string }[] = [
  { id: 'stocks', name: $t('股市'), icon: 'stocks' },
  { id: 'news', name: $t('新闻'), icon: 'news' },
  { id: 'mail', name: $t('信箱'), icon: 'mail' },
  { id: 'weather', name: $t('天气'), icon: 'weather' },
  { id: 'fish', name: $t('鱼类图鉴'), icon: 'fish' },
  { id: 'album', name: $t('相册'), icon: 'album' },
  { id: 'sweep', name: $t('扫雷'), icon: 'sweep' },
  { id: 'isle', name: $t('岛务'), icon: 'isle' },
  { id: 'bin', name: $t('回收站'), icon: 'bin' },
]

const SKY: Record<WeatherKind, string> = { clear: '☀', rain: '☂', storm: '⚡', snow: '❄', fog: '≋' }
function Weather({ game }: { game: Game }) {
  const d = game.clockDay
  const days = [0, 1, 2, 3, 4].map((i) => ({ day: d + i, k: game.weather.kindOn(d + i) }))
  return (
    <div class="wx">
      {days.map((x, i) => (
        <div class={'wx-day' + (i === 0 ? ' today' : '')} key={x.day}>
          <span class="wx-when">{i === 0 ? $t('今天') : i === 1 ? $t('明天') : $t('第 {0} 天', x.day + 1)}</span>
          <span class={'wx-sky k-' + x.k}>{SKY[x.k]}</span>
          <span class="wx-name">{WEATHER_NAME[x.k]}</span>
        </div>
      ))}
    </div>
  )
}

/** minesweeper: a tap opens, a flag-mode tap (or a right click, or a long press) flags */
function Sweeper({ game }: { game: Game }) {
  const [level, setLevel] = useState<SweepLevel>('easy')
  const [board, setBoard] = useState(() => new Board('easy'))
  const [, tick] = useState(0)
  const [flagMode, setFlagMode] = useState(false)
  const [menu, setMenu] = useState<'none' | 'level' | 'ranks'>('none')
  const [result, setResult] = useState<ReturnType<typeof settle> | null>(null)
  const t0 = useRef(0)
  const secs = useRef(0)
  const press = useRef<{ i: number; t: number; done: boolean } | null>(null)
  useEffect(() => {
    const id = setInterval(() => { if (board.state === 'play') { secs.current = Math.floor((performance.now() - t0.current) / 1000); tick((n) => n + 1) } }, 250)
    return () => clearInterval(id)
  }, [board])
  const fresh = (l: SweepLevel) => { setLevel(l); setBoard(new Board(l)); setResult(null); secs.current = 0; setMenu('none') }
  const after = () => {
    if (board.state === 'won' && !result) {
      const s = Math.max(1, Math.round((performance.now() - t0.current) / 1000))
      secs.current = s
      setResult(settle(game, level, s))
    } else if (board.state === 'lost') game.sfx('error')
    tick((n) => n + 1)
  }
  const open = (i: number) => {
    if (board.state === 'ready') t0.current = performance.now()
    board.reveal(i)
    game.sfx('tap', 1.6)
    after()
  }
  const flag = (i: number) => { board.toggleFlag(i); game.sfx('tap', 1.1); tick((n) => n + 1) }
  const best = game.save.sweep?.best ?? {}
  const left = board.mines - board.flags
  const face = board.state === 'won' ? '😎' : board.state === 'lost' ? '😵' : '🙂'
  const L = SWEEP[level]
  return (
    <div class="sweep">
      <div class="sw-bar">
        <button class="w95" onClick={() => setMenu(menu === 'level' ? 'none' : 'level')}>{$t('难度')}</button>
        <button class="w95" onClick={() => setMenu(menu === 'ranks' ? 'none' : 'ranks')}>{$t('排行榜')}</button>
        <span class="led">{String(Math.max(0, left)).padStart(3, '0')}</span>
        <button class="w95 face" aria-label={$t('重来')} onClick={() => fresh(level)}>{face}</button>
        <span class="led">{String(Math.min(999, secs.current)).padStart(3, '0')}</span>
        <button class={'w95 flagbtn' + (flagMode ? ' on' : '')} aria-label={$t('插旗')} onClick={() => setFlagMode(!flagMode)}>⚑</button>
      </div>
      {menu === 'level' && (
        <div class="sw-menu">
          {(Object.keys(SWEEP) as SweepLevel[]).map((l) => (
            <button key={l} class={'w95' + (l === level ? ' on' : '')} onClick={() => fresh(l)}>{$t('{0} · {1}×{2} · {3} 雷', SWEEP[l].name, SWEEP[l].w, SWEEP[l].h, SWEEP[l].mines)}</button>
          ))}
        </div>
      )}
      {menu === 'ranks' && (
        <div class="sw-menu">
          {(Object.keys(SWEEP) as SweepLevel[]).map((l) => <div key={l} class="sw-rank"><b>{SWEEP[l].name}</b><span>{best[l] !== undefined ? $t('{0} 秒', best[l]) : '—'}</span></div>)}
        </div>
      )}
      <div class="sw-grid" style={{ gridTemplateColumns: `repeat(${L.w}, 1fr)`, aspectRatio: `${L.w} / ${L.h}` }} onContextMenu={(e) => e.preventDefault()}>
        {Array.from({ length: L.w * L.h }, (_, i) => {
          const o = board.open[i], f = board.flag[i], m = board.mine[i]
          const show = o || (board.state === 'lost' && m)
          const cls = 'sw-c' + (show ? ' o' : '') + (board.boom === i ? ' boom' : '') + (show && !m && board.near[i] ? ' n' + board.near[i] : '')
          return (
            <button key={i} class={cls}
              onPointerDown={() => { press.current = { i, t: performance.now(), done: false }; const p = press.current; setTimeout(() => { if (press.current === p && !p.done) { p.done = true; flag(i) } }, 420) }}
              onPointerUp={(e) => {
                const p = press.current
                press.current = null
                if (!p || p.done || p.i !== i) return
                p.done = true
                if (e.button === 2 || flagMode) flag(i)
                else open(i)
              }}
              onPointerLeave={() => { if (press.current?.i === i) press.current = null }}>
              {show ? (m ? '✸' : board.near[i] || '') : f ? '⚑' : ''}
            </button>
          )
        })}
      </div>
      {result && (
        <div class="sw-settle">
          <b>{$t('结算')}</b>
          <span>{$t('用时 {0} 秒{1}', secs.current, result.best ? $t(' · 新纪录！') : '')}</span>
          <span>{result.coins ? $t('+{0} 金币（今天还能领 {1} 次）', result.coins, result.left) : $t('今天的 {0} 次奖励领完了', PAID_A_DAY)}</span>
          <button class="w95" onClick={() => fresh(level)}>{$t('再来一局')}</button>
        </div>
      )}
      {board.state === 'lost' && <div class="sw-settle lost"><b>{$t('踩雷了')}</b><button class="w95" onClick={() => fresh(level)}>{$t('再来一局')}</button></div>}
    </div>
  )
}

function AppBody({ app, game }: { app: App; game: Game }) {
  switch (app) {
    case 'stocks': return <StockMachine game={game} />
    case 'news': return <NewsApp game={game} />
    case 'mail': return <Mailbox game={game} />
    case 'weather': return <Weather game={game} />
    case 'fish': return <FishBookPage game={game} />
    case 'album': return <Album game={game} />
    case 'sweep': return <Sweeper game={game} />
    case 'bin': return <p class="bin-empty">{$t('回收站是空的。')}</p>
    case 'isle': return null
  }
}

// ───────────────────────────────────────────────────────────── the room
export function Computer({ game, start }: { game: Game; start?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [app, setApp] = useState<App | null>((start as App) ?? null)
  const [booting, setBooting] = useState(true)
  const [startMenu, setStartMenu] = useState(false)
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => { if (canvas.current) paintDesk(canvas.current) }, [])
  useEffect(() => {
    const r = () => setView({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', r)
    const t = setTimeout(() => setBooting(false), 900)
    game.sfx('beep', 0.8)
    return () => { window.removeEventListener('resize', r); clearTimeout(t) }
  }, [])
  // how big: the whole desk on a wide screen; on a tall one, the screen fills the width and the
  // desk goes off the sides
  const fit = useMemo(() => {
    const wide = view.w / view.h > 1.2
    if (wide) {
      // close enough that the screen is worth reading: the desk's edges may go off the sides
      const k = Math.min(view.w / (SW * 0.8), view.h / (SH * 0.92))
      const ox = view.w / 2 - (GLASS.x + GLASS.w / 2) * k
      const oy = (view.h - SH * k) / 2 + 6
      return { k, ox, oy, glass: { x: ox + GLASS.x * k, y: oy + GLASS.y * k, w: GLASS.w * k, h: GLASS.h * k }, tall: false }
    }
    // a phone held upright: the screen takes most of it (its own bezel round it), the keyboard,
    // the lamp and the mouse show below
    const gw = view.w - 28, gh = Math.min(view.h * 0.62, gw * 1.5)
    const gy = Math.max(18, view.h * 0.06)
    const k = view.w / (SW * 0.6)
    const ox = view.w / 2 - 160 * k
    const oy = gy + gh + 22 - 140 * k
    return { k, ox, oy, glass: { x: 14, y: gy, w: gw, h: gh }, tall: true }
  }, [view])
  const name = app ? APPS.find((a) => a.id === app)!.name : ''
  const unread = game.mail.unread
  return (
    <div class="pc-room" role="dialog" aria-label={$t('电脑')}>
      <canvas ref={canvas} class="pc-desk" style={{ left: `${fit.ox}px`, top: `${fit.oy}px`, width: `${SW * fit.k}px`, height: `${SH * fit.k}px` }} />
      <div class={'pc-screen' + (fit.tall ? ' tall' : '')} style={{ left: `${fit.glass.x}px`, top: `${fit.glass.y}px`, width: `${fit.glass.w}px`, height: `${fit.glass.h}px` }}>
        {booting ? (
          <div class="pc-boot"><b>{$t('云屿 95')}</b><span>{$t('正在启动…')}</span><i /></div>
        ) : (
          <div class="pc-os">
            <div class="pc-icons">
              {APPS.map((a) => (
                <button key={a.id} class="pc-icon" onClick={() => { game.sfx('key', 1.1); if (a.id === 'isle') return game.open({ kind: 'house' }); setApp(a.id); setStartMenu(false) }}>
                  <Pix id={a.icon} />
                  <span>{a.name}</span>
                  {a.id === 'mail' && unread > 0 && <i class="pc-badge">{unread}</i>}
                </button>
              ))}
            </div>
            {app && (
              <div class={'pc-win app-' + app}>
                <div class="pc-title"><Pix id={APPS.find((a) => a.id === app)!.icon} size={14} /><b>{name}</b><button class="w95 x" aria-label={$t('关窗')} onClick={() => setApp(null)}>×</button></div>
                <div class="pc-body"><InWindow.Provider value={true}><AppBody app={app} game={game} /></InWindow.Provider></div>
              </div>
            )}
            {startMenu && (
              <div class="pc-start-menu">
                <div class="side">{$t('云屿 95')}</div>
                <div class="items">
                  {APPS.slice(0, 7).map((a) => <button key={a.id} onClick={() => { setApp(a.id); setStartMenu(false) }}><Pix id={a.icon} size={16} />{a.name}</button>)}
                  <hr />
                  <button onClick={() => game.close()}>{$t('⏻ 关机')}</button>
                </div>
              </div>
            )}
            <div class="pc-task">
              <button class={'w95 start' + (startMenu ? ' on' : '')} onClick={() => setStartMenu(!startMenu)}><Pix id="start" size={14} />{$t('开始')}</button>
              {app && <span class="w95 tab on">{name}</span>}
              <span class="grow" />
              <span class="w95 clock">{game.body.clockText}</span>
            </div>
          </div>
        )}
        <div class="pc-scan" />
      </div>
      <button class="pc-leave" onClick={() => game.close()}>{$t('起身 ↓')}</button>
    </div>
  )
}
