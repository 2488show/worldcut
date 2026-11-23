// The stage: the pixel canvas the engine draws into, the frame loop, and the controls.
// On an island a tap is passed to the game; in flight the pointer steers, as in the prototype.

import type { Game } from '../game/game'
import { createFlameLayer } from '../engine/flame-layer.js'

export interface Stage {
  /** CSS pixels per frame pixel (for placing captions over the canvas) */
  scale: number
  destroy(): void
}

export function createStage(host: HTMLElement, game: Game, onFrame: () => void): Stage {
  const canvas = document.createElement('canvas')
  canvas.className = 'stage-canvas'
  host.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  const scene = game.scene
  const stage: Stage = { scale: 1, destroy }

  let image: ImageData | null = null
  let bw = 0
  let bh = 0

  // Smooth afterburner flames for the jet, on a canvas of their own over the picture (the
  // prototype's). Where the graphics card cannot draw them they are drawn in pixels instead.
  const fire = document.createElement('canvas')
  fire.className = 'stage-glow'
  host.appendChild(fire)
  let layer: ReturnType<typeof createFlameLayer> | null = null
  let fireDead = false
  const noFire = () => {
    layer = null
    fireDead = true
    game.setBase({ flameStyle: 'pixel' })
  }
  const onFireLost = (e: Event) => {
    e.preventDefault()
    noFire()
  }
  fire.addEventListener('webglcontextlost', onFireLost)

  function fit() {
    const cw = Math.max(1, host.clientWidth)
    const ch = Math.max(1, host.clientHeight)
    // The frame holds about 110 000 pixels whatever the screen, each a whole number of device
    // pixels: the same picture and the same cost on a phone and on a desktop.
    const dpr = window.devicePixelRatio || 1
    const dev = Math.max(1, Math.round(Math.sqrt((cw * dpr * ch * dpr) / 110000)))
    const css = dev / dpr
    bw = Math.max(2, Math.ceil(cw / css))
    bh = Math.max(2, Math.ceil(ch / css))
    stage.scale = css
    canvas.width = bw
    canvas.height = bh
    canvas.style.width = `${bw * css}px`
    canvas.style.height = `${bh * css}px`
    scene.resize(bw, bh)
    image = null
    const fdpr = Math.min(2, dpr)
    fire.width = Math.round(bw * css * fdpr)
    fire.height = Math.round(bh * css * fdpr)
    fire.style.width = canvas.style.width
    fire.style.height = canvas.style.height
  }
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(host)

  // ── the frame loop
  let raf = 0
  let last = 0
  let hidden = document.hidden
  function frame(t: number) {
    raf = requestAnimationFrame(frame)
    if (hidden) return
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016
    last = t
    game.update(dt)
    const bytes = scene.render()
    if (scene.width !== bw || scene.height !== bh) return
    if (!image) image = new ImageData(bytes, bw, bh) // the engine's own buffer: no copy
    ctx.putImageData(image, 0, 0)
    const flames = scene.flames
    if (flames.count > 0 && !layer && !fireDead) {
      layer = createFlameLayer(fire)
      if (!layer) noFire()
    }
    if (layer) layer.draw(flames.count, flames.data, fire.width / bw, t / 1000)
    onFrame()
  }
  raf = requestAnimationFrame(frame)
  const onVis = () => {
    hidden = document.hidden
    last = 0
  }
  document.addEventListener('visibilitychange', onVis)

  // ── pointer
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * bw, y: ((e.clientY - r.top) / r.height) * bh }
  }
  let down: { x: number; y: number; t: number; id: number } | null = null
  const onMove = (e: PointerEvent) => {
    if (game.mode === 'island' && e.pointerType === 'mouse' && !down) {
      game.pointerKind = 'mouse'
      const q = at(e)
      game.hover(q.x, q.y)
      return
    }
    if (game.mode !== 'flight' || game.anchored) return
    if (e.pointerType !== 'mouse' && !down) return
    const p = at(e)
    scene.pointerMove(p.x, p.y)
  }
  // two fingers on the island (round 18: the camera buttons are gone from the screen): pinch to pull
  // the camera back or in, twist to turn it an eighth at a time
  const fingers = new Map<number, { x: number; y: number }>()
  let two: { dist: number; ang: number } | null = null
  let gestured = false
  const pair = () => {
    const [a, b] = [...fingers.values()]
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }
  }
  const onGesture = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId)) return
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.size !== 2 || !two || game.mode !== 'island') return
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
  const onDown = (e: PointerEvent) => {
    const p = at(e)
    if (e.pointerType !== 'mouse') {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (fingers.size === 2) { two = pair(); gestured = true; down = null; game.press(false); return }
      if (fingers.size > 2) return
      gestured = false
    }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    game.pointerKind = e.pointerType === 'mouse' ? 'mouse' : 'touch'
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch { /* not every browser lets a canvas capture */ }
    game.press(true)
    if (game.mode !== 'flight' || game.anchored) return
    scene.pointerMove(p.x, p.y)
    // a mouse: hold for the thrusters, click to roll (the prototype's controls). A finger only
    // steers while it is down — the thrusters have a button of their own — and a quick tap rolls.
    if (e.pointerType === 'mouse') scene.press()
  }
  const onUp = (e: PointerEvent) => {
    fingers.delete(e.pointerId)
    if (fingers.size < 2) two = null
    const d = down
    down = null
    game.press(false)
    if (!d || gestured) return
    const quick = performance.now() - d.t < 260 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12
    if (game.mode === 'flight' && game.anchored) return
    if (game.mode === 'flight') {
      if (e.pointerType === 'mouse') scene.release()
      else {
        if (quick) {
          scene.press()
          scene.release()
        }
        scene.pointerLeave()
      }
      return
    }
    if (quick || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) {
      const p = at(e)
      game.tap(p.x, p.y)
    }
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && game.mode === 'flight') scene.pointerLeave()
  }
  const onCancel = (e: PointerEvent) => {
    fingers.delete(e.pointerId)
    two = null
    down = null
    game.press(false)
    scene.pointerLeave()
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointermove', onGesture)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointercancel', onCancel)
  const noMenu = (e: Event) => e.preventDefault()
  canvas.addEventListener('contextmenu', noMenu)
  // the wheel pulls the island camera back to see the whole island, or in again
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (game.mode === 'island' && (e.deltaY > 0) === (game.islandZoom === 2)) game.toggleZoom()
  }
  canvas.addEventListener('wheel', onWheel, { passive: false })

  // ── keyboard: the arrows / WASD walk on an island and steer in flight
  const held = new Set<string>()
  const NAMES: Record<string, string> = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', Shift: 'boost', j: 'boost', J: 'boost',
  }
  function sync() {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    const y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0)
    if (game.mode === 'flight') {
      scene.setKeys(x, -y, held.has('boost'))
      game.setWalkKeys(0, 0)
    } else {
      scene.setKeys(0, 0, false)
      game.setWalkKeys(game.panel ? 0 : x, game.panel ? 0 : y)
    }
  }
  const typing = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (typing(e)) return
    if (e.key === 'Escape') {
      if (game.placingItem) game.cancelPlacing()
      else if (game.panel) game.close()
      return
    }
    if (game.mode === 'island' && !e.repeat && !game.panel && /^[1-8]$/.test(e.key)) {
      game.hold(Number(e.key) - 1)
      return
    }
    if ((e.key === 'b' || e.key === 'B' || e.key === 'Tab') && game.mode === 'island' && !e.repeat) {
      e.preventDefault()
      // with the rod in hand, Tab is the tackle box
      const box = e.key === 'Tab' && game.heldItem() === 'rod'
      if (game.panel?.kind === 'bag' || game.panel?.kind === 'tackle') game.close()
      else if (!game.panel) game.open(box ? { kind: 'tackle' } : { kind: 'bag' })
      return
    }
    if ((e.key === 'g' || e.key === 'G') && game.mode === 'flight' && !e.repeat) {
      game.voyage.smoke()
      return
    }
    // Space changes the view, on foot and in the air alike (the thrusters are on Shift)
    if ((e.key === ' ' || e.key === 'v' || e.key === 'V') && !game.panel) {
      e.preventDefault()
      if (!e.repeat) game.switchView()
      return
    }
    if (game.mode === 'flight' && !e.repeat) {
      if (e.key === 'l' || e.key === 'L' || e.key === 'Enter') game.land()
      // round 22: an armed plane — F holds the cannon, M a missile, R a roll
      if (e.key === 'f' || e.key === 'F') game.press(true)
      if (e.key === 'm' || e.key === 'M') game.combat.missile()
      if (e.key === 'r' || e.key === 'R') game.scene.startRoll()
    } else if (!e.repeat && !game.panel) {
      if (e.key === 'q' || e.key === 'Q') game.rotateView(-1)
      if (e.key === 'e' || e.key === 'E') game.rotateView(1)
      if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') game.press(true)
    }
    const n = NAMES[e.key]
    if (!n) return
    e.preventDefault()
    held.add(n)
    sync()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') game.press(false)
    const n = NAMES[e.key]
    if (!n) return
    held.delete(n)
    sync()
  }
  const onBlur = () => {
    held.clear()
    sync()
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  // a mode change (take-off, landing) while a key is down
  const unsub = game.subscribe(sync)

  function destroy() {
    cancelAnimationFrame(raf)
    ro.disconnect()
    unsub()
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    fire.removeEventListener('webglcontextlost', onFireLost)
    layer?.dispose()
    canvas.remove()
    fire.remove()
  }
  return stage
}
