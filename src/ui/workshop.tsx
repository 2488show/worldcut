// The hangar and the pier as workshops: each line of hull with its ten-level ladder, the vehicle
// you own in it (wear, repair, the next level up, scrapping), and the paint shop.

import { useEffect, useRef, useState } from 'preact/hooks'
import type { Game, OwnedVehicle } from '../game/game'
import { DYES, HULLS, ITEMS, UPGRADES, VEHICLES, type UpgradeId, type VehicleId } from '../game/data'
import { craftModel, defaultsOf, DESIGN_COLOURS, DESIGN_H, DESIGN_W, canvasOf, type Paint, type RGB, type Stripe } from '../engine/craft'
import type { ModelDef } from '../engine/models'
import { Coin, Cost, Icon, Sheet } from './bits'
import { $t } from '../i18n'

/** the lines of hull each building looks after, in order */
export const HANGAR_LINES: VehicleId[] = ['sparrow', 'biplane', 'falcon', 'airship']
export const PIER_LINES: VehicleId[] = ['skiff', 'sloop', 'freighter', 'flagship']

const GEN = ['', $t('第一代'), $t('第二代'), $t('第三代'), $t('第四代')]

function WearBars({ v, game }: { v: OwnedVehicle; game: Game }) {
  const w = v.wear ?? { engine: 1, hull: 1, paint: 1 }
  const plane = game.vdef(v).kind === 'plane'
  const row = (label: string, x: number, warn: number) => (
    <>
      <span>{label}</span>
      <div class={'bar' + (x < warn ? ' bad' : '')}><i style={{ width: `${Math.round(x * 100)}%` }} /></div>
      <span class="dim">{Math.round(x * 100)}%</span>
    </>
  )
  return (
    <div class="wear">
      {row(plane ? $t('引擎') : $t('舵与缆'), w.engine, 0.6)}
      {row(plane ? $t('机身') : $t('船体'), w.hull, 0.6)}
      {row($t('涂装'), w.paint, 0.4)}
    </div>
  )
}

/** one line of hull: its ladder of levels, and the vehicle you own in it */
export function HullCard({ game, type }: { game: Game; type: VehicleId }) {
  const h = HULLS[type]
  const mine = game.save.vehicles.filter((v) => v.type === type)
  const first = VEHICLES[type]
  const block = game.buildBlock(type)
  const allPlanned = h.levels.every((l) => l.planned)
  return (
    <div class="card">
      <div class="card-head">
        <b>{mine.length ? game.vdef(mine[0]).name : first.name}</b>
        <span class="tag">{h.kind === 'boat' ? $t('{0}船', GEN[h.gen]) : $t('{0}飞机', GEN[h.gen])}</span>
        {mine.length > 0 && <span class="tag ok">{$t('已拥有')}</span>}
        {allPlanned && <span class="tag">{$t('规划中')}</span>}
      </div>
      <div class="ladder" title={$t('这一代船体能改装到的等级')}>
        {h.levels.map((l) => {
          const cur = mine.length ? game.vdef(mine[0]).lv : 0
          const cls = l.planned ? 'plan' : l.lv === cur ? 'on' : l.lv < cur ? 'done' : l.lv === cur + 1 || (!cur && l === h.levels[0]) ? 'next' : ''
          return <span key={l.lv} class={cls} title={$t('{0} 级 · {1}{2}', l.lv, l.name, l.planned ? $t('（规划中）') : '')}>{$t('{0} 级', l.lv)}</span>
        })}
      </div>
      {mine.length === 0 && (
        <>
          <p>{first.desc}</p>
          {!allPlanned && <p class="stats">{$t('速度 {0} · 货舱 {1} 格', Math.round(first.flight.speed), first.cargo)}</p>}
          {block
            ? <p class="dim small">{block}</p>
            : (
              <>
                <div><Cost game={game} cost={first.cost} /> {h.levels[0].coins > 0 && <span class="price"><Coin />{h.levels[0].coins}</span>}</div>
                <div class="actions"><button class="btn" disabled={!game.isHome} onClick={() => game.buildVehicle(type)}>{first.kind === 'boat' ? $t('亲手造一艘') : $t('亲手造一架')}</button></div>
              </>
            )}
        </>
      )}
      {mine.map((v) => <Owned key={v.id} game={game} v={v} />)}
    </div>
  )
}

function Owned({ game, v }: { game: Game; v: OwnedVehicle }) {
  const def = game.vdef(v)
  const here = v.at === game.save.here
  const parked = def.kind === 'boat' || game.save.activePlane === v.id
  const up = game.upgradeVehicleInfo(v.id)
  const fix = here ? game.repairCost(v.id) : null
  const scrap = game.scrapInfo(v.id)
  const [confirm, setConfirm] = useState(false)
  return (
    <div class="owned-vehicle">
      <p>{def.desc}</p>
      <p class="stats">{$t('速度 {0} · 货舱 {1} 格{2}{3}', Math.round(def.flight.speed), def.cargo, def.armor > 1 ? $t(' · 坚固 ×{0}', def.armor) : '', !here ? $t(' · 停在{0}', game.islandName(v.at)) : '')}</p>
      <WearBars v={v} game={game} />
      <div class="actions">
        {here && !parked && <button class="btn ghost" onClick={() => game.rollOut(v.id)}>{$t('推上跑道')}</button>}
        {here && parked && <button class="btn" onClick={() => game.open({ kind: 'depart', vehicleId: v.id })}>{$t('出发')}</button>}
        {here && game.isHome && def.model !== 'jet' && <button class="btn ghost" onClick={() => game.open({ kind: 'paint', vehicleId: v.id })}>{$t('涂装')}</button>}
      </div>
      {fix && fix.parts.length > 0 && (
        <div class="row recipe">
          <div class="grow">
            <b>{$t('修理{0}', fix.parts.map((p) => (p === 'engine' ? (def.kind === 'plane' ? $t('引擎') : $t('舵和缆绳')) : def.kind === 'plane' ? $t('机身') : $t('船体'))).join($t('和')))}</b>
            <div class="dim small">{game.isHome ? $t('在家修，用材料。') : $t('不在家：请这里的人修，只收金币，贵一倍。')}</div>
            <div><Cost game={game} cost={fix.cost} /> {fix.coins > 0 && <span class="price"><Coin />{fix.coins}</span>}</div>
          </div>
          <button class="btn small" onClick={() => game.repairVehicle(v.id)}>{$t('修理')}</button>
        </div>
      )}
      {here && up && (
        up.next
          ? (
            <div class="row recipe">
              <div class="grow">
                <b>{$t('改装到 {0} 级：{1}', up.next.lv, up.next.name)}</b>
                <div class="dim small">{up.next.desc}</div>
                {!up.next.planned && <div><Cost game={game} cost={up.next.cost} /> <span class="price"><Coin />{up.next.coins}</span></div>}
                {up.why && <div class="dim small">{up.why}</div>}
              </div>
              <button class="btn small" disabled={!up.ok} onClick={() => game.upgradeVehicle(v.id)}>{$t('改装')}</button>
            </div>
          )
          : <p class="dim small">{up.why}</p>
      )}
      {here && game.isHome && (Object.keys(UPGRADES) as UpgradeId[]).map((u) => (
        <div class="row recipe" key={u}>
          <div class="grow">
            <b>{UPGRADES[u].name}</b>
            <div class="dim small">{UPGRADES[u].desc}</div>
            {!v.up?.includes(u) && <div><Cost game={game} cost={UPGRADES[u].cost} /> <span class="price"><Coin />{UPGRADES[u].coins}</span></div>}
            {!v.up?.includes(u) && game.upgradeBlock(v.id, u) && <div class="tag">{game.upgradeBlock(v.id, u)}</div>}
          </div>
          {v.up?.includes(u)
            ? <span class="owned">{$t('✓ 已装')}</span>
            : <button class="btn small" disabled={!game.canUpgrade(v.id, u)} onClick={() => game.buyUpgrade(v.id, u)}>{$t('装上')}</button>}
        </div>
      ))}
      {here && game.isHome && scrap.ok && (
        <div class="row recipe">
          <div class="grow">
            <b>{$t('拆掉')}</b>
            <div class="dim small">{$t('拆回一半的材料：{0}', Object.keys(scrap.back).length ? '' : $t('（几乎什么也不剩）'))}<Cost game={game} cost={scrap.back} /></div>
          </div>
          {confirm
            ? <button class="btn small danger" onClick={() => game.scrapVehicle(v.id)}>{$t('确定拆')}</button>
            : <button class="btn small ghost" onClick={() => setConfirm(true)}>{$t('拆掉')}</button>}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────── the paint shop
/** a little picture of a model, seen from behind and above (the way it is seen on a trip) */
function drawModel(cv: HTMLCanvasElement, m: ModelDef) {
  const ctx = cv.getContext('2d')!
  const s = Math.max(2, Math.floor(Math.min(cv.width / (m.W + m.L * 0.5 + 2), cv.height / (m.H + m.L * 0.42 + 2))))
  ctx.clearRect(0, 0, cv.width, cv.height)
  const w = (m.W + m.L * 0.5) * s
  const ox = (cv.width - w) / 2 + m.L * 0.5 * s
  const oy = (cv.height - (m.H + m.L * 0.42) * s) / 2 + m.H * s
  const rgb = (c: RGB, f: number) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`
  for (let k = 0; k < m.L; k++) {
    for (let y = 0; y < m.H; y++) {
      const sl = m.slices[y]
      for (let i = 0; i < m.W; i++) {
        const c = sl[k * m.W + i]
        if (!c) continue
        const col = m.colors[c] as RGB | undefined
        if (!col) continue
        const x = ox + i * s - k * s * 0.5
        const yy = oy - y * s + k * s * 0.42
        ctx.fillStyle = rgb(col, 0.78)
        ctx.fillRect(x, yy, s, s)
        ctx.fillStyle = rgb(col, 1.06)
        ctx.fillRect(x, yy, s, Math.max(1, s * 0.42))
      }
    }
  }
}

const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
const STRIPES: [Stripe, string][] = [['none', $t('无')], ['single', $t('单条')], ['double', $t('双条')], ['checker', $t('格纹')]]

export function PaintShop({ game, vehicleId }: { game: Game; vehicleId: string }) {
  const v = game.vehicle(vehicleId)
  const def = v ? game.vdef(v) : null
  const base = def ? defaultsOf(def.model) : undefined
  const [p, setP] = useState<Paint>(() => JSON.parse(JSON.stringify(v?.paint ?? {})))
  const [brush, setBrush] = useState(0)
  const cv = useRef<HTMLCanvasElement>(null)
  const painting = useRef<string | null>(null)
  useEffect(() => {
    if (!def || !cv.current) return
    const m = craftModel(def.model, 'preview', p, 0, false)
    if (m) drawModel(cv.current, m)
  }, [JSON.stringify(p), def?.model])
  if (!v || !def || !base) return null
  const where = canvasOf(def.model)
  const design = p.design ?? '.'.repeat(DESIGN_W * DESIGN_H)
  const put = (idx: number) => {
    const ch = painting.current ?? String(brush)
    if (design[idx] === ch) return
    setP({ ...p, design: design.slice(0, idx) + ch + design.slice(idx + 1) })
  }
  const cost = game.paintCost(vehicleId, p)
  const ok = game.canPay(cost)
  const Swatch = ({ field }: { field: 'body' | 'accent' | 'cloth' }) => (
    <div class="swatches">
      <button style={{ background: css(base[field]) }} class={!p[field] ? 'on' : ''} title={$t('原色（不要颜料）')} onClick={() => setP({ ...p, [field]: undefined })} />
      {DESIGN_COLOURS.map((c, i) => (
        <button key={i} style={{ background: css(c) }} class={p[field] && p[field]!.join() === c.join() ? 'on' : ''} title={ITEMS[DYES[i]].name} onClick={() => setP({ ...p, [field]: c })} />
      ))}
    </div>
  )
  return (
    <Sheet title={$t('涂装 · {0}', def.name)} onClose={() => game.open({ kind: def.kind === 'boat' ? 'pier' : 'hangar' })} wide>
      <div class="paintshop">
        <div class="ps-left">
          <canvas ref={cv} class="preview" width={220} height={160} />
          {where && (
            <>
              <b>{$t('{0}上的图案', where)}</b>
              <div class="swatches">
                {DESIGN_COLOURS.map((c, i) => <button key={i} style={{ background: css(c) }} class={brush === i ? 'on' : ''} onClick={() => setBrush(i)} />)}
                <button class={'word' + (brush === -1 ? ' on' : '')} onClick={() => setBrush(-1)}>{$t('擦')}</button>
                <button class="word" onClick={() => setP({ ...p, design: undefined })}>{$t('清空')}</button>
              </div>
              <div class="design" onPointerUp={() => { painting.current = null }} onPointerLeave={() => { painting.current = null }}>
                {Array.from(design).map((ch, i) => (
                  <i
                    key={i}
                    data-cell={i}
                    style={{ background: ch >= '0' && ch <= '7' ? css(DESIGN_COLOURS[Number(ch)]) : css(p.cloth ?? base.cloth) }}
                    onPointerDown={(e) => { const el = e.currentTarget as HTMLElement; if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId); painting.current = brush < 0 ? '.' : String(brush); put(i) }}
                    onPointerEnter={() => { if (painting.current) put(i) }}
                  />
                ))}
              </div>
              <p class="dim small">{$t('点格子画，按住拖动连着画。')}</p>
            </>
          )}
        </div>
        <div class="ps-right">
          <b>{def.kind === 'boat' ? $t('船身') : $t('机身')}</b><Swatch field="body" />
          <b>{$t('点缀色（条纹、尾翼）')}</b><Swatch field="accent" />
          <b>{def.kind === 'boat' ? $t('帆布') : $t('蒙布')}</b><Swatch field="cloth" />
          <b>{$t('条纹')}</b>
          <div class="tabs">
            {STRIPES.map(([id, name]) => <button key={id} class={(p.stripe ?? 'single') === id ? 'on' : ''} onClick={() => setP({ ...p, stripe: id })}>{name}</button>)}
          </div>
          <p class="dim small">{$t('原色不要颜料；每种新颜色一份颜料。')}</p>
        </div>
      </div>
      <div class="actions">
        <span>{Object.keys(cost).length ? <>{$t('要 ')}<Cost game={game} cost={cost} /></> : <span class="dim">{$t('不用颜料')}</span>}</span>
        <button class="btn" disabled={!ok} onClick={() => game.paintVehicle(vehicleId, p)}>{$t('涂上')}</button>
        <button class="btn ghost" onClick={() => game.open({ kind: def.kind === 'boat' ? 'pier' : 'hangar' })}>{$t('算了')}</button>
      </div>
      {Object.values(cost).some(Boolean) && !ok && <p class="dim small">{$t('颜料不够：')}{DYES.filter((d) => cost[d]).map((d) => <span key={d}><Icon id={d} /> </span>)}</p>}
    </Sheet>
  )
}
