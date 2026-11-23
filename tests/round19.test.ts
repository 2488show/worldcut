// Round 19: the little acts. A meal is eaten sat at the table (and does a tenth more good there),
// the computer is sat down to and got up from, a dish takes a moment in the pan and says why it
// cannot be made, and a long wait with the line out is spent sitting on the bank.
import { describe, expect, it } from 'vitest'
import { FOOD, give } from '../src/game/data'
import { headless } from './harness'

type H = { actors: { piece: { item: string }; a: { x: number; y: number } }[]; goUse: (e: unknown) => void }

describe('round 19: sitting down to things', () => {
  it('indoors a meal is eaten at the table: walk to the chair, sit, the plate, and a tenth more filling', async () => {
    const { g, run } = headless()
    g.close(); g.house.enter(); await run(0.5)
    give(g.save.inv, { bread: 1 })
    g.body.full = 20; g.body.energy = 30
    g.acts.eat('bread')
    expect(await run(20, () => g.acts.is('meal'))).toBe(true)
    expect(g.sitting).toBeTruthy()
    expect(g.pilot.model.name).toBe('pilot_sit')
    expect(g.acts.cur!.props.length).toBe(1) // the plate
    expect(g.count('bread')).toBe(0)
    expect(Math.round(g.body.full)).toBe(20 + Math.round(FOOD.bread!.full * 1.1))
    await run(3.5)
    expect(g.acts.active).toBe(false)
    expect(g.sitting).toBeTruthy() // still at the table until sent somewhere
    // and up again without being stuck in the table
    g.standUp()
    expect(g.world.solidAt(Math.round(g.pilot.x), Math.round(g.pilot.y))).toBe(false)
  }, 60000)
  it('with no chair near, it is eaten standing: the plain amount', async () => {
    const { g, run } = headless()
    g.close()
    give(g.save.inv, { bread: 1 })
    g.body.full = 20
    g.acts.eat('bread')
    expect(g.acts.is('snack')).toBe(true)
    expect(Math.round(g.body.full)).toBe(20 + FOOD.bread!.full)
    await run(1.5)
    expect(g.acts.active).toBe(false)
    expect(g.sitting).toBeFalsy()
  })
  it('the computer: sat down to, the desktop opens, and closing it stands the pilot up on open floor', async () => {
    const { g, run } = headless()
    g.close(); g.house.enter(); await run(0.5)
    const h = g.house as unknown as H
    const pc = h.actors.find((e) => e.piece.item === 'computer')!
    h.goUse(pc)
    expect(await run(20, () => g.acts.is('pc'))).toBe(true)
    expect(g.sitting).toBeTruthy()
    expect(g.panel).toBeNull() // starting up
    await run(1.2)
    expect(g.panel?.kind).toBe('pc')
    await run(3)
    expect(g.acts.is('pc')).toBe(true)
    g.close(); await run(0.2)
    expect(g.acts.active).toBe(false)
    expect(g.sitting).toBeFalsy()
    expect(g.world.solidAt(Math.round(g.pilot.x), Math.round(g.pilot.y))).toBe(false)
  }, 60000)
  it('cooking says what is missing, takes a moment, and is not lost if the window is closed', async () => {
    const { g, run } = headless()
    g.close()
    g.open({ kind: 'cook' })
    g.save.inv.egg = 0; if (g.save.store) g.save.store.egg = 0
    g.acts.cook('omelette')
    expect(g.acts.note).toContain('还缺')
    expect(g.acts.note).toContain('×2')
    give(g.save.inv, { egg: 4 })
    g.acts.cook('omelette')
    expect(g.acts.is('cook')).toBe(true)
    expect(g.count('omelette')).toBe(0)
    await run(1.5)
    expect(g.count('omelette')).toBeGreaterThanOrEqual(1)
    expect(g.acts.note).toContain('做好了')
    const had = g.count('omelette')
    g.acts.cook('omelette'); g.close()
    expect(g.count('omelette')).toBeGreaterThan(had)
    expect(g.acts.active).toBe(false)
  })
})

import { COMPANIES, TREND_NAME } from '../src/game/stocks'
import { DAY_SECONDS } from '../src/game/body'

describe('round 20: the news and the week\'s shape', () => {
  it('each company has a shape for the week, and it shows in the price', () => {
    const { g } = headless()
    const st = g.stocks
    void st.save
    // over many weeks every shape turns up, and a rise week ends higher than a slide week on average
    const seen = new Set<string>()
    for (let w = 0; w < 30; w++) for (const c of COMPANIES) seen.add(st.trendOf(c.id, w))
    expect([...seen].sort()).toEqual(Object.keys(TREND_NAME).sort())
    const sum = { rise: 0, slide: 0 }, n = { rise: 0, slide: 0 }
    for (let w = 1; w <= 24; w++) {
      const a = Object.fromEntries(COMPANIES.map((c) => [c.id, st.price(c.id)]))
      g.save.played = w * 7 * DAY_SECONDS + 10; st.step()
      for (const c of COMPANIES) {
        const tr = st.trendOf(c.id, w - 1)
        if (tr === 'rise' || tr === 'slide') { sum[tr] += st.price(c.id) / a[c.id] - 1; n[tr]++ }
      }
    }
    expect(n.rise).toBeGreaterThan(3); expect(n.slide).toBeGreaterThan(3)
    expect(sum.rise / n.rise).toBeGreaterThan(sum.slide / n.slide + 0.04)
  })
  it('the news has its sources: the tabloid is sometimes wrong and the paper corrects it; Monday looks back', () => {
    const { g } = headless()
    const st = g.stocks
    void st.save
    const all: { src?: string; fake?: boolean; outed?: boolean; text: string }[] = []
    for (let d = 1; d <= 60; d++) { g.save.played = d * DAY_SECONDS + 10; st.step(); for (const n of st.news) if (!all.includes(n)) all.push(n) }
    const tab = all.filter((n) => n.src === 'tabloid')
    expect(tab.length).toBeGreaterThan(10)
    expect(tab.some((n) => n.fake)).toBe(true)
    expect(tab.some((n) => !n.fake)).toBe(true)
    expect(all.some((n) => n.src === 'paper' && n.text.startsWith('更正'))).toBe(true)
    expect(all.some((n) => n.text.startsWith('上周回顾'))).toBe(true)
    expect(all.some((n) => n.src === 'column')).toBe(true)
    // nothing from the paper or the weather office is ever false
    expect(all.filter((n) => (n.src ?? 'paper') === 'paper' || n.src === 'weather').every((n) => !n.fake)).toBe(true)
  })
  it('a guest\'s rumour is filed under what was heard; a close friend is right more often', () => {
    const { g } = headless()
    const st = g.stocks
    void st.save
    let near = 0, far = 0
    for (let i = 0; i < 300; i++) { st.rumour('阿海', 7); if (!st.news[0].fake) near++; st.rumour('生客', 0); if (!st.news[0].fake) far++ }
    expect(st.news[0].src).toBe('guest')
    expect(st.news.length).toBeLessThanOrEqual(40)
    expect(near).toBeGreaterThan(far + 40)
  })
})

describe('round 22 fix: not stuck after a meal at the table', () => {
  it('the arrow keys walk a seated pilot off the chair and away (they used to stay inside the table)', async () => {
    const { g, run } = headless()
    g.close(); g.house.enter(); await run(0.5)
    give(g.save.inv, { bread: 1 }); g.body.full = 10
    g.acts.eat('bread')
    await run(20, () => g.acts.is('meal')); await run(4)
    expect(g.sitting).toBeTruthy()
    const at = { x: g.pilot.x, y: g.pilot.y }
    g.keyY = -1; await run(1.5); g.keyY = 0; g.keyX = 1; await run(1.5); g.keyX = 0
    expect(g.sitting).toBeFalsy()
    expect(Math.hypot(g.pilot.x - at.x, g.pilot.y - at.y)).toBeGreaterThan(10)
    expect(g.world.solidAt(Math.round(g.pilot.x), Math.round(g.pilot.y))).toBe(false)
  }, 60000)
})
