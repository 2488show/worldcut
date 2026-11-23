// Walking: which ground the pilot can cross, and the way from here to there.
// The world is small and the grid is one pixel, so a plain breadth-first search is enough.

import type { Point, WorldApi } from './world'

/** the tallest step the pilot hops up or down (a terrace is 2–3 px; steep slopes drop two at once) */
const STEP = 4

export function walkable(w: WorldApi, x: number, y: number): boolean {
  return !w.isWater(x, y) && !w.solidAt(x, y)
}
/** the nearest cell the pilot can stand on (ring by ring), or null within `r` */
export function freeSpot(w: WorldApi, x: number, y: number, r = 24): Point | null {
  const cx = Math.round(x), cy = Math.round(y)
  if (walkable(w, cx, cy)) return { x: cx, y: cy }
  for (let d = 1; d <= r; d++) {
    let best: Point | null = null, bd = 1e9
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d || !walkable(w, cx + dx, cy + dy)) continue
      const k = dx * dx + dy * dy
      if (k < bd) { bd = k; best = { x: cx + dx, y: cy + dy } }
    }
    if (best) return best
  }
  return null
}
function canStep(w: WorldApi, x0: number, y0: number, x1: number, y1: number): boolean {
  return walkable(w, x1, y1) && Math.abs(w.heightAt(x1, y1) - w.heightAt(x0, y0)) <= STEP
}

/** everything the pilot can walk to from (sx, sy), within `radius`: returns a test for a cell */
export function floodReach(w: WorldApi, sx: number, sy: number, radius: number): (x: number, y: number) => boolean {
  const size = radius * 2 + 1
  const x0 = Math.round(sx) - radius
  const y0 = Math.round(sy) - radius
  const seen = new Uint8Array(size * size)
  const queue = new Int32Array(size * size)
  let head = 0
  let tail = 0
  queue[tail++] = radius * size + radius
  seen[radius * size + radius] = 1
  while (head < tail) {
    const c = queue[head++]
    const cx = c % size
    const cy = (c / size) | 0
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0)
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0)
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const n = ny * size + nx
      if (seen[n] || !canStep(w, x0 + cx, y0 + cy, x0 + nx, y0 + ny)) continue
      seen[n] = 1
      queue[tail++] = n
    }
  }
  return (x, y) => {
    const gx = Math.round(x) - x0
    const gy = Math.round(y) - y0
    return gx >= 0 && gy >= 0 && gx < size && gy < size && seen[gy * size + gx] === 1
  }
}

/** can the pilot walk in a straight line from a to b? */
function clearLine(w: WorldApi, a: Point, b: Point): boolean {
  const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2)
  let px = Math.round(a.x)
  let py = Math.round(a.y)
  for (let i = 1; i <= n; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n)
    const y = Math.round(a.y + ((b.y - a.y) * i) / n)
    if (x === px && y === py) continue
    if (!canStep(w, px, py, x, y)) return false
    // no squeezing between two blocked corners
    if (x !== px && y !== py && (!walkable(w, x, py) || !walkable(w, px, y))) return false
    px = x
    py = y
  }
  return true
}

/**
 * The way from `from` to within `near` px of `to`. When `to` cannot be reached (it is inside a
 * rock, across water …) the path leads as close as the pilot can get. null when already there.
 */
export function findPath(w: WorldApi, from: Point, to: Point, near = 0.8): Point[] | null {
  const sx = Math.round(from.x)
  const sy = Math.round(from.y)
  const margin = 110
  const x0 = Math.min(sx, Math.round(to.x)) - margin
  const y0 = Math.min(sy, Math.round(to.y)) - margin
  const gw = Math.abs(Math.round(to.x) - sx) + margin * 2 + 1
  const gh = Math.abs(Math.round(to.y) - sy) + margin * 2 + 1
  if (gw * gh > 560 * 560) return null
  const prev = new Int32Array(gw * gh).fill(-1)
  const queue = new Int32Array(gw * gh)
  let head = 0
  let tail = 0
  const start = (sy - y0) * gw + (sx - x0)
  prev[start] = start
  queue[tail++] = start
  let best = start
  let bestD = Math.hypot(sx - to.x, sy - to.y)
  let goal = bestD <= near ? start : -1
  while (head < tail && goal < 0) {
    const c = queue[head++]
    const cx = c % gw
    const cy = (c / gw) | 0
    for (let d = 0; d < 8; d++) {
      const dx = d < 4 ? (d === 0 ? 1 : d === 1 ? -1 : 0) : d < 6 ? 1 : -1
      const dy = d < 4 ? (d === 2 ? 1 : d === 3 ? -1 : 0) : d % 2 === 0 ? 1 : -1
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
      const n = ny * gw + nx
      if (prev[n] >= 0) continue
      const wx = x0 + nx
      const wy = y0 + ny
      if (!canStep(w, x0 + cx, y0 + cy, wx, wy)) continue
      if (dx !== 0 && dy !== 0 && (!walkable(w, x0 + cx + dx, y0 + cy) || !walkable(w, x0 + cx, y0 + cy + dy))) continue
      prev[n] = c
      queue[tail++] = n
      const dist = Math.hypot(wx - to.x, wy - to.y)
      if (dist < bestD) {
        bestD = dist
        best = n
      }
      if (dist <= near) {
        goal = n
        break
      }
    }
  }
  const end = goal >= 0 ? goal : best
  if (end === start) return null
  const cells: Point[] = []
  for (let c = end; c !== start; c = prev[c]) cells.push({ x: x0 + (c % gw), y: y0 + ((c / gw) | 0) })
  cells.push({ x: from.x, y: from.y })
  cells.reverse()
  // straighten: skip every corner the pilot can cut
  const out: Point[] = []
  let i = 0
  while (i < cells.length - 1) {
    let j = cells.length - 1
    while (j > i + 1 && !clearLine(w, cells[i], cells[j])) j--
    out.push(cells[j])
    i = j
  }
  return out
}

/** one step of free walking (keyboard): slides along whatever is in the way */
export function slide(w: WorldApi, from: Point, dx: number, dy: number): Point {
  const fx = Math.round(from.x)
  const fy = Math.round(from.y)
  const tryMove = (mx: number, my: number): Point | null => {
    const nx = from.x + mx
    const ny = from.y + my
    const rx = Math.round(nx)
    const ry = Math.round(ny)
    if (rx === fx && ry === fy) return { x: nx, y: ny }
    return canStep(w, fx, fy, rx, ry) ? { x: nx, y: ny } : null
  }
  return tryMove(dx, dy) ?? tryMove(dx, 0) ?? tryMove(0, dy) ?? from
}
