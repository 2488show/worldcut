// A little picture of a voxel model on a 2D canvas, turned to any angle and seen a little from
// above: the previews in the character maker, the paint shop and the like.

import type { ModelDef } from '../engine/models'

type RGB = [number, number, number]

/** draw `m` turned by `yaw` (0: facing the viewer) into the canvas, as big as fits */
export function drawVoxels(cv: HTMLCanvasElement, m: ModelDef, yaw = 0, tilt = 0.45) {
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, cv.width, cv.height)
  const cs = Math.cos(yaw), sn = Math.sin(yaw)
  const ci = (m.W - 1) / 2, ck = (m.L - 1) / 2
  // every voxel with a free face, turned: x across the screen, z towards the viewer
  const vox: { x: number; y: number; z: number; c: RGB; top: boolean }[] = []
  for (let y = 0; y < m.H; y++) {
    const sl = m.slices[y]
    for (let k = 0; k < m.L; k++) {
      for (let i = 0; i < m.W; i++) {
        const v = sl[k * m.W + i]
        if (!v) continue
        const col = m.colors[v] as RGB | undefined
        if (!col) continue
        // facing the viewer at yaw 0: the model's front (k = 0) comes towards us
        const dx = i - ci, dz = ck - k
        const x = dx * cs + dz * sn
        const z = -dx * sn + dz * cs
        const above = y + 1 < m.H ? m.slices[y + 1][k * m.W + i] : 0
        vox.push({ x, y, z, c: col, top: !above })
      }
    }
  }
  vox.sort((a, b) => a.z - b.z || a.y - b.y)
  const span = Math.max(m.W, m.L)
  const s = Math.max(2, Math.floor(Math.min(cv.width / (span + 2), cv.height / (m.H + span * tilt + 2))))
  const ox = cv.width / 2
  const oy = cv.height / 2 + ((m.H - span * tilt) * s) / 2
  const css = (c: RGB, f: number) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`
  for (const v of vox) {
    const sx = Math.round(ox + v.x * s - s / 2)
    const sy = Math.round(oy - v.y * s - v.z * s * tilt)
    ctx.fillStyle = css(v.c, 0.82)
    ctx.fillRect(sx, sy, s, s)
    if (v.top) {
      ctx.fillStyle = css(v.c, 1.08)
      ctx.fillRect(sx, sy - Math.ceil(s * tilt), s, Math.ceil(s * tilt))
    }
  }
}
