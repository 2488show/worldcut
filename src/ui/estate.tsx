// Round 17: the panels of the island's buildings from level 6 on (see game/estate.ts).
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { ITEMS, type ItemId } from '../game/data'
import { COURIER_CUT, EXCHANGE, FACILITIES, courierSlots, type FacilityId } from '../game/estate'
import { DAY_SECONDS } from '../game/body'
import { PET_SPECIES } from '../engine/petdefs'
import type { Pet } from '../game/pets'
import { Coin, Icon, Sheet } from './bits'
import { $t } from '../i18n'

const petName = (game: Game, p: Pet) => $t('{0}色的{1}', game.pets.colour(p.sp, p.col).name, PET_SPECIES[p.sp].name)
/** what the player has to hand (bag and storage), tools and kits left out */
function haves(game: Game): ItemId[] {
  const ids = new Set<ItemId>([...Object.keys(game.save.inv), ...Object.keys(game.save.store ?? {})] as ItemId[])
  return [...ids].filter((i) => ITEMS[i] && game.count(i) > 0 && ITEMS[i].kind !== 'tool' && ITEMS[i].kind !== 'part').sort((a, b) => ITEMS[b].value - ITEMS[a].value)
}

function Ranch({ game }: { game: Game }) {
  const [a, setA] = useState<string | null>(null)
  const pets = game.save.pets ?? []
  const pair = game.estate.s.pair
  const left = pair ? Math.max(0, pair.due - (game.save.played ?? 0)) : 0
  const pa = pets.find((p) => p.id === a)
  return (
    <Sheet title={$t('牧场')} onClose={() => game.close()}>
      {pair ? (
        <p class="hand-note">{$t('“{0}和{1}在牧场里。再过 {2} 个钟头来看看。”', petName(game, pets.find((p) => p.id === pair.a)!), petName(game, pets.find((p) => p.id === pair.b)!), Math.ceil(left / (DAY_SECONDS / 24)))}</p>
      ) : (
        <>
          <p class="dim small">{$t('挑两只同种的宠物住进来，过一天就有一只小的。小的多半随爸爸或妈妈的颜色，偶尔是新颜色。宠物位：{0} / {1}', pets.length, game.petSlots)}</p>
          {!pets.length && <p class="dim">{$t('你还没有宠物。')}</p>}
          <div class="list">
            {pets.map((p) => {
              const why = pa ? game.estate.canPair(pa, p) : ''
              return (
                <button key={p.id} class={'row recipe' + (a === p.id ? ' card' : '')} disabled={!!pa && p.id !== a && !!why} title={why}
                  onClick={() => { if (!pa || p.id === a) return setA(p.id === a ? null : p.id); game.estate.pair(pa, p); setA(null) }}>
                  <span>{petName(game, p)}</span>
                  <span class="dim small">{a === p.id ? $t('已选：再选一只同种的') : pa ? (why || $t('配成一对')) : $t('选它')}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Sheet>
  )
}

function Shop({ game }: { game: Game }) {
  const [item, setItem] = useState<ItemId | null>(null)
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(0)
  const sh = game.estate.shop
  const fair = item ? game.estate.fair(item) : 0
  return (
    <Sheet title={$t('小店')} onClose={() => game.close()} wide>
      <div class="row">
        <span>{$t('钱箱：')}<Coin />{sh.till}</span>
        <button class="btn small" disabled={!sh.till} onClick={() => game.estate.takeTill()}>{$t('收钱')}</button>
      </div>
      <h3>{$t('橱窗（{0} / 6）', sh.lines.length)}</h3>
      {!sh.lines.length && <p class="dim small">{$t('还什么都没摆。')}</p>}
      {sh.lines.map((l) => (
        <div class="row recipe" key={l.item}>
          <Icon id={l.item} /><span>{ITEMS[l.item].name} ×{l.qty}</span>
          <span class="price"><Coin />{l.price}</span>
          <span class="dim small">{$t('{0}% / 时', Math.round(game.estate.saleChance(l) * 100))}</span>
          <button class="btn small" onClick={() => game.estate.unstock(l.item)}>{$t('收回')}</button>
        </div>
      ))}
      <h3>{$t('摆一样上去')}</h3>
      <div class="chips">
        {haves(game).slice(0, 24).map((i) => (
          <button key={i} class={'chip-btn' + (item === i ? ' on' : '')} onClick={() => { setItem(i); setQty(Math.min(5, game.count(i))); setPrice(game.estate.fair(i)) }}>
            <Icon id={i} /> {ITEMS[i].name} {game.count(i)}
          </button>
        ))}
      </div>
      {item && (
        <div class="row recipe">
          <span>{ITEMS[item].name}</span>
          <button class="btn small" onClick={() => setQty(Math.max(1, qty - 1))}>−</button><span>×{qty}</span>
          <button class="btn small" onClick={() => setQty(Math.min(game.count(item), qty + 1))}>+</button>
          <button class="btn small" onClick={() => setPrice(Math.max(1, Math.round(price * 0.9)))}>{$t('降价')}</button>
          <span class="price"><Coin />{price}</span>
          <button class="btn small" onClick={() => setPrice(Math.round(price * 1.1) + 1)}>{$t('涨价')}</button>
          <span class="dim small">{price <= fair ? $t('公道，卖得快') : price <= fair * 1.3 ? $t('有点贵') : $t('太贵，没人买')}</span>
          <button class="btn" onClick={() => { game.estate.stock(item, qty, price); setItem(null) }}>{$t('摆上')}</button>
        </div>
      )}
      <p class="dim small">{$t('你出门时，路过的客人会来买。价钱越公道卖得越快；比值钱多三成就很难卖了。')}</p>
    </Sheet>
  )
}

function Depot({ game }: { game: Game }) {
  const slots = courierSlots(game.level)
  const out = game.estate.couriers
  const now = game.save.played ?? 0
  const orders = game.orders.filter((o) => o.kind === 'buy' && o.status === 'open')
  return (
    <Sheet title={$t('货运站')} onClose={() => game.close()} wide>
      <p class="dim small">{$t('雇来的人只跑安全的航线（危险度 1 以内），拿报酬的 {0}%。货从你的仓库里出。在外面的人：{1} / {2}', Math.round(COURIER_CUT * 100), out.length, slots)}</p>
      {out.map((c) => (
        <div class="row recipe" key={c.id}>
          <Icon id={c.item} /><span>{ITEMS[c.item].name} ×{c.qty} → {game.islandName(c.island)}</span>
          <span class="dim small">{$t('再过 {0} 个钟头回来', Math.max(0, Math.ceil((c.back - now) / (DAY_SECONDS / 24))))}</span>
        </div>
      ))}
      <h3>{$t('布告板上的单')}</h3>
      {!orders.length && <p class="dim small">{$t('板上现在没有单。')}</p>}
      {orders.map((o) => {
        const why = game.estate.courierBlock(o)
        return (
          <div class="row recipe" key={o.id}>
            <Icon id={o.item} /><span>{ITEMS[o.item].name} ×{o.qty} → {game.islandName(o.island)}{o.relay ? $t('（转运）') : ''}</span>
            <span class="price"><Coin />{Math.round(o.price * (1 - COURIER_CUT))}</span>
            {why ? <span class="dim small">{why}</span> : <button class="btn small" onClick={() => game.estate.hire(o.id)}>{$t('雇人送')}</button>}
          </div>
        )
      })}
    </Sheet>
  )
}

function Lighthouse({ game }: { game: Game }) {
  return (
    <Sheet title={$t('灯塔')} onClose={() => game.close()}>
      <p class="hand-note">{$t('“夜里有船从下面过。”')}</p>
      <p>{$t('每天早上，过路的船交的过路费会寄到信箱：现在大约 ')}<Coin />{$t('{0}，岛越有名越多。', game.estate.toll())}</p>
      <p>{$t('布告板上标着“转运”的单，货在你接单时就交到你手上，你只管送过去，拿的是运费。')}</p>
      <p class="dim small">{$t('已经转运了 {0} 单。', game.save.stats.relayed ?? 0)}</p>
    </Sheet>
  )
}

function Exchange({ game }: { game: Game }) {
  const [n, setN] = useState(10)
  return (
    <Sheet title={$t('交易所')} onClose={() => game.close()} wide>
      <p class="dim small">{$t('价钱每个钟头都在变：买入比中间价高一点，卖出低一点。买得多价钱会往上走，卖得多会往下走。')}</p>
      <div class="row">
        {[1, 10, 50].map((x) => <button key={x} class={'chip-btn' + (n === x ? ' on' : '')} onClick={() => setN(x)}>{$t('每次 {0} 件', x)}</button>)}
      </div>
      {EXCHANGE.map((it) => {
        const p = game.estate.price(it)
        const pct = Math.round((p.k - 1) * 100)
        return (
          <div class="row recipe" key={it}>
            <Icon id={it} /><span>{ITEMS[it].name}</span>
            <span class={pct > 0 ? 'up' : pct < 0 ? 'down' : 'dim'}>{pct > 0 ? '▲' : pct < 0 ? '▼' : '·'}{Math.abs(pct)}%</span>
            <span class="dim small">{$t('有 {0}', game.count(it))}</span>
            <button class="btn small" onClick={() => game.estate.trade(it, n, 'buy')}>{$t('买 ')}<Coin />{p.buy * n}</button>
            <button class="btn small" disabled={game.count(it) < n} onClick={() => game.estate.trade(it, n, 'sell')}>{$t('卖 ')}<Coin />{p.sell * n}</button>
          </div>
        )
      })}
    </Sheet>
  )
}

export function FacilitySheet({ game, kind }: { game: Game; kind: FacilityId }) {
  if (!game.estate.has(kind)) return <Sheet title={FACILITIES[kind].name} onClose={() => game.close()}><p>{FACILITIES[kind].done}</p></Sheet>
  if (kind === 'ranch') return <Ranch game={game} />
  if (kind === 'shop') return <Shop game={game} />
  if (kind === 'depot') return <Depot game={game} />
  if (kind === 'lighthouse') return <Lighthouse game={game} />
  return <Exchange game={game} />
}
