// The screen: the stage (canvas) with the HUD, captions and panels laid over it.

import { TackleButton } from './tackle'
import { CreelButton } from './home'
import { Doodle } from './doodles'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Game, Label } from '../game/game'
import { FOOD, FURNITURE, ITEMS, ITEM_ORDER, RARITY_NAME, type ItemId } from '../game/data'
import { createStage, type Stage } from './stage'
import { Coin, Icon } from './bits'
import { Panels } from './panels'
import { audio } from './sound'
import { Title } from './menus'
import { Hotbar } from './inventory'
import { createFxLayer } from './fx'
import { Lids, RestOverlay } from './cozy'
import { DiveView } from './diveview'
import { ZONES } from '../game/dive'
import { PhotoHud } from './photo'
import { DecorTray, HouseBar, PlaceBar, UndoChip } from './decor'
import { capture, forgetSentPostcard, photoPixels, restorePostcard } from './album'
import { setModelIcons } from '../game/icons'
import { drawVoxels } from './voxview'
import { $t, LANG } from '../i18n'

export { audio }

/** re-render whenever the game says something changed */
export function useGame(game: Game) {
  const [, set] = useState(0)
  useEffect(() => game.subscribe(() => set((n) => n + 1)), [game])
}

export function App({ game, onReset, skipTitle }: { game: Game; onReset: () => void; skipTitle?: boolean }) {
  useGame(game)
  const [title, setTitle] = useState(!skipTitle)
  const hostRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)

  useEffect(() => {
    const host = hostRef.current!
    const pool = new Map<string, HTMLElement>()
    // sound may only start after a gesture: the first touch or key wakes it
    const wake = () => audio.unlock()
    window.addEventListener('pointerdown', wake, true)
    window.addEventListener('keydown', wake, true)
    const set = game.save.settings
    if (set) audio.setVolume(set.music, set.sfx)
    restorePostcard(game)
    // the album is on this device: the game asks the screen for pictures (frames on the wall, a photo with a guest)
    game.photoPixels = photoPixels
    game.takePhoto = (where) => !!capture(game, where)
    // the frames on the wall: their pictures, now that the album can be read
    game.house.refreshModels()
    // furniture with no drawn icon: a little picture of its model
    setModelIcons((id) => {
      const f = FURNITURE[id]
      const m = f && game.scene.models[f.model]
      if (!m) return null
      const c = document.createElement('canvas')
      c.width = 32; c.height = 32
      drawVoxels(c, m, 0.6, 0.6)
      return c.toDataURL()
    })
    const fx = createFxLayer(screenRef.current!, game, audio, () => stageRef.current?.scale ?? 1)
    game.onFx = (e) => fx.handle(e)
    // no button is silent: one that made no sound of its own gets a plain click
    const screen = screenRef.current!
    let before = 0
    const pre = () => { before = game.fxCount }
    const post = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('button, select, .tabs, .stepper') && game.fxCount === before) audio.play('tap')
    }
    screen.addEventListener('click', pre, true)
    screen.addEventListener('click', post)
    const stage = createStage(host, game, () => {
      fx.tick()
      audio.setScene(game.musicScene())
      const eng = game.engineSound()
      audio.setEngine(eng.kind, eng.speed, eng.boost)
      audio.setFurnace(game.furnaceLit())
      // the weather as sound: outside in it, or on the roof from inside; the hearth when home
      const wx = game.weather.now
      const heard = game.mode === 'island' && (game.onSurface || game.house.active)
      audio.setAmbience({ rain: heard ? Math.max(wx.rain, wx.storm * 1.3) : 0, snow: heard ? wx.snow : 0, indoor: game.house.active, fire: game.house.hearth, rest: game.house.resting || game.house.sleepIn > 0 })
      forgetSentPostcard(game)
      // captions follow what they name, every frame, without going through a re-render
      const box = labelsRef.current
      if (!box) return
      box.style.display = game.photoMode ? 'none' : ''
      const labels: Label[] = game.labels()
      const seen = new Set<string>()
      for (const l of labels) {
        seen.add(l.key)
        let el = pool.get(l.key)
        if (!el) {
          el = document.createElement('div')
          el.className = 'label label-' + l.kind
          if (l.kind === 'progress') el.appendChild(document.createElement('i'))
          box.appendChild(el)
          pool.set(l.key, el)
        }
        if (l.kind === 'progress') (el.firstChild as HTMLElement).style.width = `${Math.round((l.value ?? 0) * 100)}%`
        else if (el.textContent !== l.text) el.textContent = l.text
        el.style.transform = `translate(${Math.round(l.x * stage.scale)}px, ${Math.round(l.y * stage.scale)}px) translate(-50%, -100%)`
      }
      for (const [key, el] of pool) {
        if (seen.has(key)) continue
        el.remove()
        pool.delete(key)
      }
    })
    stageRef.current = stage
    return () => {
      window.removeEventListener('pointerdown', wake, true)
      window.removeEventListener('keydown', wake, true)
      game.onFx = null
      screen.removeEventListener('click', pre, true)
      screen.removeEventListener('click', post)
      audio.setEngine(null, 0, 0)
      audio.setFurnace(false)
      fx.destroy()
      stage.destroy()
    }
  }, [game])

  const flying = game.mode === 'flight'
  const idle = useIdle(8000)
  return (
    <div class="screen" ref={screenRef}>
      <div class="stage" ref={hostRef} />
      <div class="labels" ref={labelsRef} />
      {!title && game.dive.active && <DiveView game={game} />}
      <div class={'hud' + (idle && !game.panel && !game.placingItem && !game.fishing.active && !game.dive.active && !game.house.decorating ? ' idle' : '')}>
        {title || (game.panel?.kind === 'look' && game.panel.first) ? null : flying ? <FlightHud game={game} /> : game.photoMode && !game.panel ? <PhotoHud game={game} /> : game.house.resting ? <RestOverlay game={game} /> : game.visits.treat ? <TreatHud game={game} /> : <IslandHud game={game} />}
        <Toasts game={game} />
      </div>
      {!title && <Lids game={game} />}
      {!title && <Panels game={game} onReset={onReset} onTitle={() => setTitle(true)} />}
      {title && <Title game={game} onStart={() => { audio.unlock(); audio.play('done'); setTitle(false) }} onReset={onReset} />}
    </div>
  )
}

function IslandHud({ game }: { game: Game }) {
  const q = game.quest()
  const [open, setOpen] = useState(false)
  const [tip, setTip] = useState<ItemId | null>(null)
  const hold = useRef(0)
  const owned = ITEM_ORDER.filter((id) => game.count(id) > 0)
  return (
    <>
      <div class="hud-top">
        <div class="hud-left">
          <div class="chip place">
            <b>{game.mine.active ? $t('矿洞') : game.house.active ? $t('家里') : game.here.def.name}</b>
            <span class="coins" data-fx="coins"><Coin /><b /></span>
          </div>
          {game.here.def.home && !game.mine.active && (
            <button class={'chip isle-lv' + (game.levelInfo()?.ok ? ' ready' : '')} title={$t('岛务手账：小岛升级')} data-fx="isle" onClick={() => game.open({ kind: 'house' })}>
              <Doodle n="house" size={15} />{LANG === 'en' && <span>{$t('级')}</span>}<b>{game.level}</b>{LANG !== 'en' && <span>{$t('级')}</span>}{game.levelInfo()?.ok && <i>↑</i>}
            </button>
          )}
          <Status game={game} />
          {game.house.active && !game.placingItem && <HouseBar game={game} />}
        </div>
        <div class="hud-menu">
          {game.wishes.open && <button class="btn round mail-btn wish-btn" title={$t('今天的小心愿')} onClick={() => game.open({ kind: 'wish' })}><Doodle n="heart" />{game.wishes.canSend() && <i>!</i>}</button>}
          {game.mail.unread > 0 && <button class="btn round mail-btn" title={$t('信箱里有新信')} onClick={() => game.open({ kind: 'mail' })}><Doodle n="mail" /><i>{game.mail.unread}</i></button>}
          <button class="btn round" title={$t('照相')} onClick={() => { game.photoMode = true; game.cancelPlacing(true); game.changed() }}><Doodle n="camera" /></button>
          <button class="btn round" title={$t('航海日志')} data-fx="journal" onClick={() => game.open({ kind: 'journal' })}><Doodle n="book" /></button>
          <button class="btn round" title={$t('菜单')} onClick={() => game.open({ kind: 'settings' })}><Doodle n="menu" /></button>
        </div>
        <button class={'quest' + (open ? ' open' : '')} data-fx="quest" onClick={() => { game.sfx('tap'); setOpen(!open) }}>
          <div class="quest-title">
            <Doodle n="flag" size={16} />
            {q.title}
            {q.progress && <em>{q.progress}</em>}
          </div>
          {open && <div class="quest-hint">{q.hint}</div>}
        </button>
      </div>
      {game.dive.active && <DiveHud game={game} />}
      {game.fishing.active && <FishHud game={game} />}
      {game.mine.active && (
        <div class="banner">
          <span>{$t('{0} 层', game.mine.level)}</span>
          <button class="btn small" onClick={() => game.mine.exit()}>{$t('回地面')}</button>
        </div>
      )}
      {game.placingItem && <PlaceBar game={game} item={game.placingItem} />}
      <UndoChip game={game} />
      {!game.placingItem && game.heldItem() === 'shovel' && game.onSurface && game.isHome && (
        <div class="banner">
          <span>{game.shovelAim ? (game.shovelAim.ok ? $t('铲平这里') : game.shovelAim.why) : $t('点不平的地')}</span>
        </div>
      )}
      <EatButton game={game} />
      <div class="hud-bottom">
        {game.house.active && game.house.decorating && !game.placingItem ? <DecorTray game={game} /> : <Hotbar game={game} />}
        <TackleButton game={game} />
        <CreelButton game={game} />
      </div>
    </>
  )
}

/** at the table with a guest: the picture in letterbox, the line being said, and a tap for the next */
function TreatHud({ game }: { game: Game }) {
  const tr = game.visits.treat!
  const v = game.visits.v
  const line = tr.lines[tr.i]
  if (!line || !v) return null
  return (
    <div class="treat" onClick={() => game.visits.next()}>
      <div class="letterbox top" />
      <div class="letterbox bottom">
        <div class="treat-line"><b>{line.who === 'me' ? $t('你') : v.name}</b>{line.text}</div>
        <span class="dim small">{$t('点一下继续 · {0}/{1}', tr.i + 1, tr.lines.length)}</span>
      </div>
    </div>
  )
}
/** strength, how full, and the clock */
function Status({ game }: { game: Game }) {
  useTick(1000)
  const b = game.body
  const e = Math.round(b.energy)
  const f = Math.round(b.full)
  return (
    <div class="status" title={$t('体力 {0} · 饱腹 {1}', e, f)}>
      <span class="clock">{game.season.name} · {game.clockDay + 1} · {b.clockText}</span>
      <span class="meter" aria-label={$t('体力')}><Doodle n="bolt" size={14} /><span class={'bar' + (e < 20 ? ' bad' : '')}><i style={{ width: `${e}%` }} /></span></span>
      <span class="meter" aria-label={$t('饱腹')}><Doodle n="bowl" size={14} /><span class={'bar full' + (f < 20 ? ' bad' : '')}><i style={{ width: `${f}%` }} /></span></span>
    </div>
  )
}
/** food in hand: a button to eat it */
function EatButton({ game }: { game: Game }) {
  const it = game.heldItem()
  if (!it || !FOOD[it] || game.mode !== 'island') return null
  const f = FOOD[it]!
  return (
    <button class="btn eat" onClick={() => game.acts.eat(it)} title={$t('体力 +{0}，饱腹 +{1}', f.energy, f.full)}>
      <Icon id={it} />{$t(' 吃{0}', ITEMS[it].name)}
    </button>
  )
}

/** re-draws a few times a second while something on screen is counting */
function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}
/** under water: the air that is left, how deep, what is in the bag, and the way up */
function DiveHud({ game }: { game: Game }) {
  useTick(120)
  const d = game.dive
  const low = d.oxygen < 10
  return (
    <div class={'gauge-panel' + (low ? ' low' : '')}>
      <div class="gauge-row">
        <span>◯</span>
        <div class="gauge"><i style={{ width: `${Math.max(0, (d.oxygen / d.maxOxygen) * 100)}%` }} /></div>
        <b>{Math.ceil(d.oxygen)}s</b>
      </div>
      <div class="gauge-row">
        <span class="dive-depth">{ZONES[d.zone].name} · {d.metres} m</span>
        <span class="dive-bag">{Array.from({ length: 8 }, (_, i) => <i key={i} class={i < d.count ? 'full' : ''} />)}</span>
        <button class="btn small" onClick={() => d.surface()}>{$t('上浮')}</button>
      </div>
    </div>
  )
}
/** a line in the water: wait for the bite, then the fight — how far in the fish is, and how near the line is to snapping */
function FishHud({ game }: { game: Game }) {
  useTick(60)
  const f = game.fishing
  const hold = {
    onPointerDown: (e: PointerEvent) => { e.preventDefault(); f.hold(true) },
    onPointerUp: () => f.hold(false),
    onPointerLeave: () => f.hold(false),
    onPointerCancel: () => f.hold(false),
  }
  if (f.phase === 'cast' || f.phase === 'land') return null
  if (f.phase === 'wait') return <div class="gauge-panel"><div class="gauge-row"><span>{$t('等鱼上钩… 浮标猛地一沉再提竿（现在点是收竿）')}</span></div></div>
  if (f.phase === 'bite') return <div class="gauge-panel bite"><button class="btn big-btn" {...hold}>{$t('提竿！')}</button></div>
  return (
    <div class={'gauge-panel' + (f.surging ? ' surge' : '')}>
      <div class="gauge-row"><span>{$t('拉近')}</span><div class="gauge good"><i style={{ width: `${Math.max(0, Math.min(1, f.progress)) * 100}%` }} /></div></div>
      <div class="gauge-row"><span>{$t('线')}</span><div class={'gauge tension' + (f.tension > 0.72 ? ' hot' : '')}><i style={{ width: `${Math.min(1, f.tension) * 100}%` }} /></div></div>
      <button class="btn big-btn" {...hold}>{f.surging ? $t('鱼在冲！松手') : $t('按住收线')}</button>
    </div>
  )
}
function FlightHud({ game }: { game: Game }) {
  // the numbers change every frame; five times a second is plenty for a readout
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), 180)
    return () => clearInterval(t)
  }, [])
  const h = game.hud()
  if (!h) return null
  const boat = game.flight && game.vehicle(game.flight.vehicleId)?.type === 'skiff'
  const boost = (on: boolean) => game.scene.setKeys(0, 0, on)
  const hold = {
    onPointerDown: (e: PointerEvent) => { e.preventDefault(); boost(true) },
    onPointerUp: () => boost(false),
    onPointerLeave: () => boost(false),
    onPointerCancel: () => boost(false),
  }
  return (
    <>
      <div class="hud-top">
        <div class="chip place">
          <b>{h.vehicle}</b>
          <span class="cargo">{$t('货舱：{0} · {1}', h.cargo, h.voyage.heavy)}</span>
        </div>
        <div class="chip wind" title={$t('风把你往箭头的方向推')}>
          <span class="arrow small" style={{ transform: `rotate(${h.voyage.wind}rad)` }} />
          <span>{h.voyage.slip > 0 ? $t('海鸟气流！') : h.voyage.fog ? $t('雾里 · 藏身') : h.voyage.rain ? $t('雨里 · 慢') : h.voyage.windText}</span>
        </div>
        {h.dest && (
          <div class="chip dest">
            <span class="arrow" style={{ transform: `rotate(${h.bearing}rad)` }} />
            <b>{h.dest}</b>
            <span>{(h.dist / 100).toFixed(1)} km</span>
          </div>
        )}
      </div>
      {h.voyage.pirate && h.voyage.pirate.phase !== 'gone' && (
        <div class={'pirate-warn' + (h.voyage.pirate.dist < 62 ? ' close' : '')}>
          <span class="arrow red" style={{ transform: `rotate(${h.voyage.pirate.bearing}rad)` }} />
          <b>☠ {boat ? $t('海盗') : $t('空盗')} {(h.voyage.pirate.dist / 100).toFixed(1)} km</b>
          <div class="gauge tension hot"><i style={{ width: `${Math.min(1, h.voyage.pirate.grip) * 100}%` }} /></div>
          {h.voyage.smoke > 0 && <button class="btn small" onClick={() => game.voyage.smoke()}>{$t('烟幕 ×{0}（G）', h.voyage.smoke)}</button>}
          <span>{h.voyage.pirate.phase === 'sighted' ? $t('发现你了！加速、急转弯') : h.voyage.pirate.dist < 62 ? $t('它咬住你了！甩开！') : $t('保持距离')}</span>
        </div>
      )}
      {game.combat.armed && h.phase === 'cruise' && <CombatHud game={game} />}
      {h.phase === 'cruise' && h.voyage.approach !== null && (
        <div class={'approach' + (h.voyage.approach >= 80 ? ' good' : h.voyage.approach >= 55 ? ' ok' : '')}>
          <span>{$t('{0}：{1}', boat ? $t('靠岸') : $t('进场'), h.voyage.approachText)}</span>
          <div class="gauge good"><i style={{ width: `${h.voyage.approach}%` }} /></div>
          <span class="dim">{$t('{0} → 多 10–20% 收入', boat ? $t('从海上正对码头、别加速') : $t('顺着跑道方向、穿过金色光圈'))}</span>
        </div>
      )}
      <div class="flight-help">
        {h.phase === 'takeoff' && (boat ? $t('离港中…') : $t('起飞中…'))}
        {h.phase === 'landing' && (boat ? $t('靠岸中…') : $t('降落中…'))}
        {h.phase === 'cruise' && !h.canLand && (
          <span class="hint-desktop">{$t('指哪飞哪 · 按住加速 · 点一下翻滚')}</span>
        )}
        {h.phase === 'cruise' && !h.canLand && <span class="hint-touch">{$t('按住屏幕转向 · 点一下翻滚')}</span>}
      </div>
      <div class="hud-bottom flight">
        <button class="btn round big" {...hold}>{$t('加速')}</button>
        {game.combat.armed && h.phase === 'cruise' && <CombatButtons game={game} />}
        {boat && !game.anchored && game.canAnchor() && !game.fishing.active && <button class="btn land" onClick={() => game.dropAnchor()}>{$t('抛锚钓鱼')}</button>}
        {game.anchored && !game.fishing.active && <button class="btn land" onClick={() => game.fishing.castAtSea()}>{$t('抛竿')}</button>}
        {game.anchored && !game.fishing.active && <button class="btn land" onClick={() => game.weighAnchor()}>{$t('起锚')}</button>}
        {h.phase === 'cruise' && h.canLand && (
          <button class="btn land" onClick={() => game.land()}>
            {boat ? $t('靠岸') : $t('降落')} · {h.canLand}
          </button>
        )}
        <button class="btn round big" title={$t('换视角（空格）')} onClick={() => game.switchView()}>{$t('视角')}</button>
        <Mute game={game} />
      </div>
    </>
  )
}

/** round 22: the hull, rounds, missiles; the sortie's tally; the two rings when a missile comes in */
function CombatHud({ game }: { game: Game }) {
  const c = game.combat.view()
  const k = c.incoming === null ? 0 : Math.max(0, Math.min(1, c.incoming / 1.3))
  return (
    <>
      <div class="combat">
        <div class="combat-row"><span>{$t('机体')}</span><div class={'gauge hull' + (c.hull < 0.3 ? ' hot' : '')}><i style={{ width: `${c.hull * 100}%` }} /></div></div>
        <div class="combat-row"><span>{$t('机炮')}</span>{c.reload > 0 ? <div class="gauge"><i style={{ width: `${c.reload * 100}%` }} /></div> : <b>{c.ammo}</b>}</div>
        <div class="combat-row"><span>{$t('导弹')}</span><span class="pips">{Array.from({ length: 4 }, (_, i) => <i key={i} class={i < c.missiles ? 'on' : ''} />)}</span>{c.counter && <b class="counter">{$t('三连发！')}</b>}</div>
      </div>
      {c.sortie && (
        <div class="chip sortie">
          {!c.sortie.won && <span class="arrow red" style={{ transform: `rotate(${c.sortie.bearing}rad)` }} />}
          <b>{c.sortie.name}</b>
          <span>{c.sortie.won ? $t('清剿完了 · 回家') : $t('击落 {0} / {1}{2}', c.sortie.downed, c.sortie.need, c.sortie.dist > 420 ? ` · ${(c.sortie.dist / 100).toFixed(1)} km` : '')}</span>
        </div>
      )}
      {c.incoming !== null && (
        <div class="dodge-rings" aria-label={$t('导弹来袭：两个圈重合时翻滚')}>
          <i class="ring inner" />
          <i class={'ring outer' + (c.incoming <= 0.62 && c.incoming >= 0.1 ? ' now' : '')} style={{ transform: `translate(-50%, -50%) scale(${1 + k * 2.2})` }} />
          <b>{c.incoming <= 0.62 && c.incoming >= 0.1 ? $t('翻滚！') : $t('导弹')}</b>
        </div>
      )}
      {c.word && <div class="combat-word">{c.word}</div>}
    </>
  )
}
function CombatButtons({ game }: { game: Game }) {
  const c = game.combat.view()
  const fire = (on: boolean) => (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); game.combat.fire(on) }
  return (
    <>
      <button class="btn round big fire" onPointerDown={fire(true)} onPointerUp={fire(false)} onPointerLeave={fire(false)} onPointerCancel={fire(false)}>{$t('开火')}</button>
      <button class={'btn round big' + (c.locked ? ' locked' : '')} disabled={c.missiles <= 0} onClick={(e) => { e.stopPropagation(); game.combat.missile() }}>{$t('导弹')}</button>
      <button class={'btn round big' + (c.incoming !== null ? ' urgent' : '')} onClick={(e) => { e.stopPropagation(); game.scene.startRoll() }}>{$t('翻滚')}</button>
    </>
  )
}

function Mute({ game }: { game: Game }) {
  const [, set] = useState(0)
  return (
    <button
      class={'btn round' + (audio.muted ? ' off' : '')}
      title={audio.muted ? $t('打开声音') : $t('静音')}
      onClick={() => { audio.toggleMute(); audio.unlock(); game.sfx('tap'); set((n) => n + 1) }}
    >♪</button>
  )
}

function Toasts({ game }: { game: Game }) {
  return (
    <div class="toasts">
      {game.toasts.map((t) => (
        <div class={'toast' + (t.bad ? ' bad' : '')} key={t.id}>{t.text}</div>
      ))}
    </div>
  )
}

/** true once the player has left the controls alone for a while: the HUD fades, the note stays */
function useIdle(ms: number) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let last = performance.now()
    const wake = () => { last = performance.now(); setIdle(false) }
    const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    const t = setInterval(() => { if (performance.now() - last > ms) setIdle(true) }, 500)
    return () => { evs.forEach((e) => window.removeEventListener(e, wake)); clearInterval(t) }
  }, [ms])
  return idle
}
