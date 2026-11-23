// The dive on the web: the painted sea (divepaint.ts) full screen, the pointer as aim and taps.
import { useEffect, useRef } from 'preact/hooks'
import type { Game } from '../game/game'
import { PX_PER_M, VIEW_H, VIEW_W } from '../game/dive'
import { drawDive } from './divepaint'

/** the dive, full screen under the HUD; the pointer aims, a tap shoots or swims */
export function DiveView({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hover = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let raf = 0
    const frame = (now: number) => {
      if (game.dive.active) drawDive(ctx, game.dive, game, now, hover.current)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game])
  const at = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    // the canvas keeps its shape (cover): work out where in its pixels the pointer is
    const s = Math.max(r.width / VIEW_W, r.height / VIEW_H)
    const ox = (r.width - VIEW_W * s) / 2, oy = (r.height - VIEW_H * s) / 2
    return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s }
  }
  let down: { x: number; y: number; t: number } | null = null
  return (
    <canvas
      ref={ref}
      class="diveview"
      width={VIEW_W}
      height={VIEW_H}
      onPointerMove={(e) => { const p = at(e); hover.current = p; if (e.pointerType === 'mouse') game.dive.pointAt(p.x, p.y) }}
      onPointerDown={(e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() } }}
      onPointerUp={(e) => { const p = at(e); hover.current = e.pointerType === 'mouse' ? p : null; if (down) game.dive.tapView(p.x, p.y); down = null }}
      onPointerLeave={() => { hover.current = null }}
    />
  )
}
export const DIVE_METRES = PX_PER_M
