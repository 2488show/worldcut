// The stock machine's screen: the five companies with their prices and a line of the last days,
// what you hold and how it stands, the morning news, and buy / sell. Red is up and green is down,
// as on a Chinese market board.
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { COMPANIES, FEE, SRC_NAME, type Src, type StockId } from '../game/stocks'
import { Coin, Sheet } from './bits'
import { $t } from '../i18n'

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
const tone = (x: number) => (x > 0.0005 ? 'rise' : x < -0.0005 ? 'fall' : 'flat')

function Line({ pts, w, h, big }: { pts: number[]; w: number; h: number; big?: boolean }) {
  if (pts.length < 2) return <svg class="spark" width={w} height={h} />
  const lo = Math.min(...pts), hi = Math.max(...pts)
  const span = hi - lo || 1
  const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`)
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg class={'spark' + (big ? ' big' : '')} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {big && <polygon points={`1,${h - 1} ${xy.join(' ')} ${w - 1},${h - 1}`} class={up ? 'fill-rise' : 'fill-fall'} />}
      <polyline points={xy.join(' ')} class={up ? 'rise' : 'fall'} fill="none" stroke-width={big ? 1.6 : 1.2} />
      {big && <text x={w - 2} y={10} text-anchor="end" class="lbl">{hi.toFixed(1)}</text>}
      {big && <text x={w - 2} y={h - 3} text-anchor="end" class="lbl">{lo.toFixed(1)}</text>}
    </svg>
  )
}

export function StockMachine({ game }: { game: Game }) {
  const st = game.stocks
  const s = st.save
  const [open, setOpen] = useState<StockId | null>(null)
  const [span, setSpan] = useState<'days' | 'hours'>('hours')
  const w = st.worth
  const floating = w.value - w.cost
  return (
    <Sheet title={$t('炒股机')} onClose={() => game.close()} wide>
      <div class="stk-sum">
        <span>{$t('现金 ')}<Coin /><b>{game.save.coins}</b></span>
        <span>{$t('持仓 ')}<Coin /><b>{w.value}</b></span>
        <span>{$t('浮动 ')}<b class={tone(floating)}>{floating >= 0 ? '+' : ''}{floating}</b></span>
        <span>{$t('已实现 ')}<b class={tone(s.realised)}>{s.realised >= 0 ? '+' : ''}{Math.round(s.realised)}</b></span>
      </div>
      <div class="stk-news">
        {st.news.filter((n) => n.k !== 0 && n.day >= 0).slice(0, 3).map((n, i) => (
          <div key={i} class={'small ' + (n.k > 0 ? 'rise' : 'fall')}>{$t('第 {0} 天 · ', n.day + 1)}<span class="dim">{SRC_NAME[n.src ?? 'paper']}</span> · {n.text}</div>
        ))}
        {!st.news.length && <div class="dim small">{$t('还没有新闻。')}</div>}
      </div>
      {COMPANIES.map((c) => {
        const p = st.price(c.id)
        const ch = st.change(c.id)
        const h = s.hold[c.id]
        const isOpen = open === c.id
        const pts = span === 'hours' || !isOpen ? s.hours[c.id].slice(-72) : [...s.closes[c.id].slice(-30), p]
        const mine = h ? Math.round(h.n * p - h.cost) : 0
        const max = st.maxBuy(c.id)
        return (
          <div class={'stk' + (isOpen ? ' open' : '')} key={c.id}>
            <button class="stk-row" onClick={() => setOpen(isOpen ? null : c.id)}>
              <span class="stk-name"><b>{c.name}</b>{c.island && <span class="dim small"> · {game.islandName(c.island)}</span>}</span>
              <Line pts={s.hours[c.id].slice(-72)} w={84} h={24} />
              <span class="stk-px">{p.toFixed(2)}</span>
              <span class={'stk-ch ' + tone(ch)}>{pct(ch)}</span>
            </button>
            {h && <div class="small stk-hold">{$t('持有 {0} 股 · 成本 {1} · ', h.n, (h.cost / h.n).toFixed(2))}<span class={tone(mine)}>{mine >= 0 ? $t('赚') : $t('亏')} {Math.abs(mine)}</span></div>}
            {isOpen && (
              <div class="stk-detail">
                <div class="tabs small">
                  <button class={span === 'hours' ? 'on' : ''} onClick={() => setSpan('hours')}>{$t('三天（每小时）')}</button>
                  <button class={span === 'days' ? 'on' : ''} onClick={() => setSpan('days')}>{$t('一个月（每天）')}</button>
                </div>
                <Line pts={pts} w={300} h={90} big />
                <p class="dim small">{c.what}</p>
                <div class="actions">
                  <button class="btn small" disabled={max < 1} onClick={() => st.buy(c.id, 1)}>{$t('买 1 股')}</button>
                  <button class="btn small" disabled={max < 10} onClick={() => st.buy(c.id, 10)}>{$t('买 10 股')}</button>
                  <button class="btn small" disabled={max < 1} onClick={() => st.buy(c.id, max)}>{$t('买满（{0}）', max)}</button>
                </div>
                <div class="actions">
                  <button class="btn small ghost" disabled={!h} onClick={() => st.sell(c.id, 1)}>{$t('卖 1 股')}</button>
                  <button class="btn small ghost" disabled={!h || h.n < 10} onClick={() => st.sell(c.id, 10)}>{$t('卖 10 股')}</button>
                  <button class="btn small ghost" disabled={!h} onClick={() => st.sell(c.id, h?.n ?? 0)}>{$t('全卖')}</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <p class="dim small">{$t('每小时（游戏里）跳一次价。买卖各收 {0}% 手续费。给哪座岛送货，哪家就涨一点。每家公司每周有自己的走势，周一的日报会回顾上周。消息在“新闻”里看，小报和传闻不一定是真的。有涨有跌，只投闲钱。', FEE * 100)}</p>
    </Sheet>
  )
}

/** round 20: the news — the paper (true), the weather office, the tabloid and the column (maybe), and what guests have said */
const TRUST: Record<Src, string> = { paper: $t('可信'), weather: $t('可信'), tabloid: $t('真假难辨'), column: $t('三次对两次'), guest: $t('看交情') }
export function NewsApp({ game }: { game: Game }) {
  const st = game.stocks
  const [only, setOnly] = useState<'all' | 'sure' | 'maybe'>('all')
  const all = st.news.filter((n) => { const s = n.src ?? 'paper'; if (n.day < 0) return false; return only === 'all' || (only === 'sure') === (s === 'paper' || s === 'weather') })
  const days = [...new Set(all.map((n) => n.day))]
  const today = game.clockDay
  return (
    <Sheet title={$t('新闻')} onClose={() => game.close()} wide>
      <div class="tabs small">
        <button class={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>{$t('全部')}</button>
        <button class={only === 'sure' ? 'on' : ''} onClick={() => setOnly('sure')}>{$t('日报和气象台')}</button>
        <button class={only === 'maybe' ? 'on' : ''} onClick={() => setOnly('maybe')}>{$t('小报、专栏和传闻')}</button>
      </div>
      {!all.length && <p class="dim">{$t('还没有消息。明天早上再来看。')}</p>}
      {days.map((d) => (
        <div class="news-day" key={d}>
          <h3>{d === today ? $t('今天') : d === today - 1 ? $t('昨天') : $t('第 {0} 天', d + 1)}</h3>
          {all.filter((n) => n.day === d).map((n, i) => {
            const src = n.src ?? 'paper'
            return (
              <div class={'news-item src-' + src + (n.outed ? ' outed' : '')} key={i}>
                <span class="news-src">{SRC_NAME[src]}</span>
                <span class="news-text">{n.text}{n.outed && <b class="fall">{$t('（已被日报更正）')}</b>}</span>
                {n.k !== 0 && src !== 'column' && <span class={'news-k ' + (n.k > 0 ? 'rise' : 'fall')}>{n.k > 0 ? $t('利好') : $t('利空')}</span>}
                <span class="news-trust dim small">{TRUST[src]}</span>
              </div>
            )
          })}
        </div>
      ))}
      <p class="dim small">{$t('日报和气象台说的都是真的。小报差不多一半是编的：价格会先跳一下，假的当天就跌回去，隔天日报会更正。请客人吃饭，他们会透露听来的消息；交情越深越准。')}</p>
    </Sheet>
  )
}
