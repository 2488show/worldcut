import { describe, expect, it } from 'vitest'
import { playSlice } from './play'

describe('the vertical slice', () => {
  it('plays from an empty island to a delivery by air and one by sea', async () => {
    const g = await playSlice()
    expect(g.save.stats.delivered).toBeGreaterThanOrEqual(2)
    expect(g.save.coins).toBeGreaterThan(0)
    expect(g.owns('sparrow')).toBe(true)
    expect(g.owns('skiff')).toBe(true)
    expect(g.save.here).toBe('pine')
  }, 240_000)
})
