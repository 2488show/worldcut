// The panels that open when the pilot uses something: workbench, furnace, hangar, pier,
// notice board (the market), departure, arrival.

import { CLEAR_DAYS, SEAS, type SeaId } from '../game/combat'
import { TIER_NAME } from '../game/backend'
import { Computer } from './pc'
import { TackleBox } from './tackle'
import { Book, type Page } from './book'
import { Doodle } from './doodles'
import { FishBook } from './fishbook'
import { Album } from './photo'
import { StockMachine } from './stocks'
import { Mailbox } from './mailbox'
import { FacilitySheet } from './estate'
import { FramePicker, GuestBook, WishSheet, CompostSheet, CookSheet, CreelSheet } from './home'
import { useEffect, useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { bagText, FURNITURE, ITEMS, PLANTS, MAX_PLANTS, NODES, ITEM_ORDER, RECIPES, RECIPE_TABS, RARITY_NAME, TOOL_MEND, type ItemId, type Recipe, type RecipeTab, DISHES, FOOD } from '../game/data'
import { richText } from '../game/world'
import { LEVELS } from '../game/levels'
import { houseName } from '../game/house'
import { PET_RULES, RARITY_STARS, rarityOf } from '../game/pets'
import { PET_SPECIES } from '../engine/petdefs'
import { PIRATE_FREE_DELIVERIES } from '../game/voyage'

const FURNITURE_ORDER = ITEM_ORDER.filter((id) => ITEMS[id].kind === 'furniture')
import { fairPrice } from '../game/backend'
import { Coin, Cost, Icon, Sheet } from './bits'
import { Ending, Journal, Settings } from './menus'
import { BagPanel, Warehouse } from './inventory'
import { WEATHER_LINE } from '../game/weather'
import { LookMaker } from './looks'
import { BedChoice } from './cozy'
import { HANGAR_LINES, HullCard, PaintShop, PIER_LINES } from './workshop'
import { $t } from '../i18n'

export function Panels({ game, onReset, onTitle }: { game: Game; onReset: () => void; onTitle: () => void }) {
  const p = game.panel
  if (!p) return null
  const close = () => game.close()
  switch (p.kind) {
    case 'welcome':
      return (
        <Sheet title={$t('云岭航行')}>
          <p class="hand-note">{$t('“这是我的小岛。先捡些树枝石头，做把斧头和镐。”')}</p>
          <div class="welcome-row"><Doodle n="hammer" /><span>{$t('做工具、造飞机')}</span></div>
          <div class="welcome-row"><Doodle n="flag" /><span>{$t('接单，亲自把货送到别的岛')}</span></div>
          <div class="welcome-row"><Doodle n="moon" /><span>{$t('累了吃点东西，晚上回屋睡觉')}</span></div>
          <p class="dim small">{$t('点哪儿走到哪儿 · 空格换视角 · 便签上写着下一步')}</p>
          <div class="actions"><button class="btn" onClick={close}>{$t('上岛')}</button></div>
        </Sheet>
      )
    case 'workbench':
      return (
        <Sheet title={$t('工作台')} onClose={close}>
          <CraftBar game={game} />
          <Workbench game={game} />
          {game.count('furnaceKit') > 0 && !game.save.furnace && (
            <div class="actions"><button class="btn" onClick={() => game.startPlacing('furnace')}>{$t('放置熔炉')}</button></div>
          )}
        </Sheet>
      )
    case 'furnace': {
      const left = game.furnaceLeft()
      return (
        <Sheet title={$t('熔炉')} onClose={close}>
          {game.furnaceSpots().length > 1
            ? <div class="furnaces">{game.furnaceSpots().map((_, k) => {
                const q = game.save.jobs.filter((j) => (j.f ?? 0) === k)
                return <div key={k} class={'furnace-row' + (q.length ? ' lit' : '')}><b>{$t('熔炉 {0}', k + 1)}</b> {q.length ? $t('{0} 炉 · 约 {1} 秒', q.length, Math.ceil(game.furnaceLeftOf(k))) : $t('空着')}</div>
              })}</div>
            : <p class="dim">{game.save.jobs.length ? $t('炉里还有 {0} 炉，约 {1} 秒后全部出炉。你可以先去忙别的。', game.save.jobs.length, Math.ceil(left)) : $t('炉子空着。')}</p>}
          <p class="dim small">{game.furnaceSpots().length > 1 ? $t('{0} 座熔炉同时烧：放进去的分到最快空出来的那座。', game.furnaceSpots().length) : ''}{game.furnaceFull() ? '' : $t(' 还能再砌一座熔炉（工作台做套件）。')}</p>
          {RECIPES.filter((r) => r.station === 'furnace').map((r) => <RecipeRow key={r.id} game={game} r={r} />)}
        </Sheet>
      )
    }
    case 'house':
      return <IslandNotebook game={game} />
    case 'mine': {
      const m = game.mine
      const levels = []
      for (let l = 1; l <= m.depth; l++) levels.push(l)
      return (
        <Sheet title={$t('矿洞')} onClose={close}>
          <p class="dim">{$t('很黑。挖开岩石找矿脉；落细尘的地方藏着往下的梯子。越深越稀有。')}</p>
          {levels.map((l) => (
            <div class="row recipe" key={l}>
              <div class="grow">
                <b>{$t('第 {0} 层', l)}</b>
                <div class="dim small">{m.describe(l)}</div>
              </div>
              {l <= m.save.unlocked
                ? <button class="btn small" onClick={() => m.enter(l)}>{$t('下去')}</button>
                : <span class="dim small">{$t('还没挖到')}</span>}
            </div>
          ))}
          {m.depth < 12 && <p class="dim small">{$t('岛升级后，矿洞会更深。')}</p>}
        </Sheet>
      )
    }
    case 'hangar':
      return (
        <Sheet title={$t('机库')} onClose={close}>
          <p class="dim small">{$t('每代最多改三级。飞久了会旧，回家修一修。')}</p>
          {HANGAR_LINES.filter((t) => game.isHome || game.owns(t)).map((t) => <HullCard key={t} game={game} type={t} />)}
        </Sheet>
      )
    case 'pier':
      return (
        <Sheet title={$t('码头')} onClose={close}>
          {PIER_LINES.filter((t) => game.here.def.home || game.save.vehicles.some((v) => v.type === t && v.at === game.save.here)).map((t) => <HullCard key={t} game={game} type={t} />)}
          <div class="row recipe">
            <Icon id="harpoon" />
            <div class="grow">
              <b>{$t('下潜')}</b> <span class="dim">{$t('· 气 {0} 秒', game.count('tank') ? 80 : 45)}</span>
              <div class="dim small">{$t('越深越稀有，也越费气。气泡柱能补气。按时上浮；气用完会丢一半。{0}', game.count('harpoon') ? '' : $t('（还没有鱼枪：只能捡海底的东西）'))}</div>
            </div>
            <button class="btn small" onClick={() => game.dive.enter()}>{$t('下潜')}</button>
          </div>
          <p class="dim small">{$t('任何岸边都能钓：点水面，对着黑影下竿。{0}', game.here.def.home ? '' : $t('这里是{0}的海，鱼和你家的不一样。', game.here.def.name))}</p>
        </Sheet>
      )
    case 'crates':
      return <Warehouse game={game} />
    case 'visitor': {
      const v = game.visits.v
      if (!v) return null
      const r = game.restaurant
      const dishes = game.visits.dishes
      const gift = Object.entries(v.gift)
      return (
        <Sheet title={$t('{0} · 从{1}来', v.name, game.islandName(v.island))} onClose={close}>
          <p>{gift.length ? $t('{0}给你带来了 {1}。', v.name, gift.map(([k, n]) => `${ITEMS[k as ItemId].name}×${n}`).join($t('、'))) : $t('{0}来看看你。', v.name)}</p>
          {r
            ? dishes.length
              ? (
                <>
                  <p class="dim small">{$t('请{0}到餐厅坐下吃一顿？好感 +2，岛的魅力 +4。', v.name)}</p>
                  <div class="dishes">
                    {dishes.map((d) => (
                      <button key={d} class="btn small" onClick={() => game.visits.invite(d)}><Icon id={d} />{$t(' {0}（有 {1}）', ITEMS[d].name, game.count(d))}</button>
                    ))}
                  </div>
                </>
              )
              : <p class="dim small">{$t('手头没有做好的菜。')}</p>
            : <p class="dim small">{$t('还没有餐厅（工作台能做')}<b>{$t('餐厅套件')}</b>{$t('）。')}</p>}
          <p class="dim small">{$t('也可以请{0}到家里坐坐，看看你的屋子。', v.name)}</p>
          <div class="actions"><button class="btn" onClick={() => game.visits.home()}>{$t('请到家里坐坐')}</button></div>
          <div class="actions"><button class="btn ghost" onClick={() => { game.close(); game.visits.leave(); game.speak(v.name, v.voice, $t('那我回去啦，再见！')) }}>{$t('谢谢，慢走')}</button></div>
        </Sheet>
      )
    }
    case 'bed':
      return <BedChoice game={game} />
    case 'pc':
      return <Computer game={game} start={p.app} />
    case 'tackle':
      return <TackleBox game={game} />
    case 'fishbook':
      return <FishBook game={game} />
    case 'album':
      return <Album game={game} />
    case 'frame':
      return <FramePicker game={game} piece={p.piece} />
    case 'guestbook':
      return <GuestBook game={game} />
    case 'wish':
      return <WishSheet game={game} />
    case 'compost':
      return <CompostSheet game={game} />
    case 'creel':
      return <CreelSheet game={game} />
    case 'ranch': case 'shop': case 'depot': case 'lighthouse': case 'exchange':
      return <FacilitySheet game={game} kind={p.kind} />
    case 'stocks':
      return <StockMachine game={game} />
    case 'mail':
      return <Mailbox game={game} open={p.open} />
    case 'look':
      return <LookMaker game={game} first={p.first} />
    case 'cook':
      return <CookSheet game={game} restaurant={!!p.restaurant} />
    case 'night': {
      const s = p.summary
      const lines: [string, number][] = [[$t('送达订单'), s.delivered], [$t('采集'), s.gathered], [$t('收菜'), s.harvested], [$t('捉到小动物'), s.caught], [$t('做饭'), s.cooked]]
      return (
        <Sheet title={$t('第 {0} 天结束了', s.day)}>
          {s.passedOut
            ? <p>{$t('你熬到半夜两点，累倒在地上。{0}{1}。今天只恢复了六成体力。', s.away ? $t('{0}把你扶进屋里借住了一晚', s.away) : $t('岛上的人把你抬回了家'), s.fee ? $t('，收了 {0} 金币', s.fee) : '')}</p>
            : s.away ? <p>{$t('在{0}家借住了一晚。', s.away)}</p> : <p>{s.late ? $t('睡得有点晚，体力没有完全恢复。') : $t('一夜好眠，体力回满了。')}</p>}
          <div class="summary">
            <div class="big"><Coin /> {s.coins >= 0 ? '+' : ''}{s.coins}<span class="dim small">{$t(' 金币（今天的净收入）')}</span></div>
            {lines.filter(([, n]) => n > 0).map(([t, n]) => <div key={t}>{t} <b>{n}</b></div>)}
            {lines.every(([, n]) => n <= 0) && <div class="dim">{$t('今天很悠闲。')}</div>}
          </div>
          <p class="dim">{$t('今天的天气：{0}。{1}', WEATHER_LINE[s.weather ?? 'clear'], s.hungry ? $t('肚子空空的：早上先吃点东西。') : '')}</p>
          <div class="actions"><button class="btn" onClick={close}>{$t('起床')}</button></div>
        </Sheet>
      )
    }
    case 'board':
      return <Board game={game} />
    case 'bag':
      return <BagPanel game={game} />
    case 'journal':
      return <Journal game={game} />
    case 'ending':
      return <Ending game={game} />
    case 'settings':
      return <Settings game={game} onReset={onReset} onTitle={onTitle} />
    case 'paint':
      return <PaintShop game={game} vehicleId={p.vehicleId} />
    case 'depart':
      return <Depart game={game} vehicleId={p.vehicleId} />
    case 'arrived': {
      const total = p.lines.reduce((s, l) => s + l.reward + l.tip, 0) + (p.bonus?.coins ?? 0)
      return (
        <Sheet title={$t('货送到了 · {0}', game.islandName(p.island))}>
          {p.robbed && <p class="warn-line">{$t('☠ 路上被抢走了 {0}。按实际送到的数量结算。', p.robbed)}</p>}
          {p.lines.map((l, i) => (
            <div class="row" key={i}>
              <span class="grow">{l.text}</span>
              <span class="price"><Coin />{l.reward}{l.tip > 0 && <em>{$t(' +{0} 准时小费', l.tip)}</em>}</span>
            </div>
          ))}
          {p.bonus && <div class="row"><span class="grow">★ {p.bonus.text}</span><span class="price"><Coin />+{p.bonus.coins}</span></div>}
          <div class="row total"><span class="grow">{$t('到手')}</span><span class="price"><Coin />{total}</span></div>
          {p.friend && <p class="friend-line">♥ {p.friend.text}{p.friend.gift && <> <b>{$t('送你：{0}', bagText(p.friend.gift))}</b></>}</p>}
          <p class="dim">{$t('这座岛的布告板上还有本地特产卖。想回家，点你的{0}。', game.save.vehicles.find((v) => v.at === p.island) ? game.vdef(game.save.vehicles.find((v) => v.at === p.island)!).name : $t('载具'))}</p>
          <div class="actions"><button class="btn" onClick={close}>{$t('好')}</button></div>
        </Sheet>
      )
    }
  }
}

function RecipeRow({ game, r }: { game: Game; r: Recipe }) {
  const make = (n: number) => (r.station === 'furnace' ? game.smelt(r.id, n) : game.craft(r.id, n))
  return (
    <div class="row recipe">
      <Icon id={r.out} />
      <div class="grow">
        <b>{ITEMS[r.out].name}</b>
        {ITEMS[r.out].rarity > 0 && <span class={'rarity r' + ITEMS[r.out].rarity}> {RARITY_NAME[ITEMS[r.out].rarity]}</span>}
        {r.time > 0 && <span class="dim">{$t(' · {0} 秒', r.time)}</span>}
        {!r.once && <span class="dim">{$t(' · 现有 {0}', game.count(r.out))}</span>}
        {(r.level ?? 1) > game.level && <span class="tag">{$t('岛 ')}{r.level}{$t(' 级解锁')}</span>}
        <div class="dim small">{ITEMS[r.out].desc}</div>
        <div><Cost game={game} cost={r.cost} /></div>
      </div>
      {r.once && game.count(r.out) > 0
        ? <span class="owned">{$t('✓ 已有')}</span>
        : <button class="btn small" disabled={!game.canCraft(r.id, 1) || !!game.craftJob} onClick={() => make(1)}>{$t('做 1')}</button>}
      {!r.once && <button class="btn small ghost" disabled={!game.canCraft(r.id, 3) || !!game.craftJob} onClick={() => make(3)}>{$t('做 3')}</button>}
      {!r.once && <button class="btn small ghost" disabled={!game.canCraft(r.id, 10) || !!game.craftJob} onClick={() => make(10)}>{$t('做 10')}</button>}
    </div>
  )
}

/** "blow the island up": asks twice, and says plainly when it can no longer be done */
function Reroll({ game, block }: { game: Game; block: string | null }) {
  const [sure, setSure] = useState(false)
  return (
    <div class="row recipe">
      <div class="grow">
        <b>{$t('炸岛重开')}</b>
        <div class="dim small">{$t('换一座随机的新岛。背包留着；造出第一架飞机前能用，最多 3 次。{0}', block ?? $t('还剩 {0} 次。', game.rerollsLeft))}</div>
      </div>
      {!block && (sure
        ? <button class="btn small danger" onClick={() => { setSure(false); game.rerollIsland() }}>{$t('确定炸掉！')}</button>
        : <button class="btn small ghost" onClick={() => setSure(true)}>{$t('炸岛…')}</button>)}
    </div>
  )
}

/** the workbench's recipes, a tab for each kind of thing */
function Workbench({ game }: { game: Game }) {
  const [tab, setTab] = useState<RecipeTab>('tools')
  return (
    <>
      <div class="tabs">
        {RECIPE_TABS.map(([id, name]) => (
          <button key={id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>
      {RECIPES.filter((r) => r.station === 'workbench' && r.tab === tab).map((r) => <RecipeRow key={r.id} game={game} r={r} />)}
      {tab === 'tools' && game.wornTools.length > 0 && (
        <>
          <p class="dim small">{$t('修工具：')}</p>
          {game.wornTools.map((t) => {
            const l = game.toolLife(t)!
            return (
              <div class="row recipe" key={'mend' + t}>
                <Icon id={t} />
                <div class="grow">
                  <b>{$t('修{0}', ITEMS[t].name)}</b> <span class="dim">{$t('· 耐久 {0}/{1}', l.left, l.max)}</span>
                  <div><Cost game={game} cost={TOOL_MEND[t]!} /></div>
                </div>
                <button class="btn small" disabled={!game.canPay(TOOL_MEND[t]!)} onClick={() => game.mendTool(t)}>{$t('修')}</button>
              </div>
            )
          })}
        </>
      )}
    </>
  )
}

/** the job on the workbench: what is being made, how many are left, and the hammer coming down */
function CraftBar({ game }: { game: Game }) {
  const [, set] = useState(0)
  const busy = !!game.craftJob
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => set((n) => n + 1), 50)
    return () => clearInterval(t)
  }, [busy])
  const c = game.crafting()
  if (!c) return <div class="craftbar idle">{$t('选一样东西来做。每做一件要敲上几锤。')}</div>
  const r = RECIPES.find((x) => x.id === c.id)!
  return (
    <div class="craftbar">
      <i class={'hammer' + (Math.floor(c.u * 3.3) % 2 ? ' down' : '')} />
      <Icon id={r.out} />
      <div class="grow">
        <b>{$t('正在做 {0}', ITEMS[r.out].name)}</b> <span class="dim">{$t('第 {0} / {1} 件', c.total - c.left + 1, c.total)}</span>
        <div class="bar"><i style={{ width: `${Math.round(c.u * 100)}%` }} /></div>
      </div>
    </div>
  )
}

function Board({ game }: { game: Game }) {
  const [tab, setTab] = useState<'buy' | 'sell' | 'mine' | 'shop' | 'ask'>('buy')
  const buys = game.orders.filter((o) => o.kind === 'buy' && o.status === 'open' && !o.mine)
  const myBuys = game.orders.filter((o) => o.kind === 'buy' && o.mine)
  const mySells = game.orders.filter((o) => o.mine && o.kind === 'sell' && o.status === 'open')
  const shop = game.shop
  return (
    <Sheet title={$t('布告板 · {0}', game.here.def.name)} onClose={() => game.close()} wide>
      <div class="tabs">
        <button class={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>{$t('求购单 {0}', buys.length)}</button>
        <button class={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>{$t('我要卖货')}</button>
        <button class={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>{$t('送货单 {0}', game.deliveries.length)}</button>
        {shop.length > 0 && <button class={tab === 'shop' ? 'on' : ''} onClick={() => setTab('shop')}>{$t('本地特产')}</button>}
        {game.online && <button class={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}>{$t('向玩家求购 {0}', myBuys.length || '')}</button>}
      </div>
      {tab === 'buy' && (
        <>
          <p class="dim">{$t('送到才付钱。')}</p>
          {buys.length === 0 && <p class="dim">{$t('暂时没有新单子，过一会儿再来看看。')}</p>}
          {buys.map((o) => (
            <div class="row" key={o.id}>
              <Icon id={o.item} />
              <div class="grow">
                <b>{ITEMS[o.item].name} ×{o.qty}</b>{o.tier && <span class={'tag tier t' + o.tier}>{TIER_NAME[o.tier]}</span>}{o.player && <span class="tag ok">{$t('玩家')}</span>}
                <div class="dim small">{game.fitFor(o.qty)}</div>
                <div class="dim">{$t('{0}{1} · {2} km · 你有 {3}', o.player ? '' : `${o.by} · `, game.islandName(o.island), (game.distanceTo(o.island) / 100).toFixed(1), game.count(o.item))}</div>
                {o.danger > 0 && <div class="skulls" title={$t('这条航线有海盗，报酬已含危险津贴')}>{$t('{0} 危险航线 · 报酬 +{1}%', '☠'.repeat(o.danger), Math.round(o.danger * 28))}</div>}
              </div>
              <span class="price"><Coin />{o.price}</span>
              {game.orderBlock(o)
                ? <span class="tag bad" title={game.orderBlock(o)}>{$t('装不下')}</span>
                : <button class="btn small" onClick={() => game.acceptOrder(o.id)}>{$t('接单')}</button>}
            </div>
          ))}
        </>
      )}
      {tab === 'sell' && <SellForm game={game} mySells={mySells} />}
      {tab === 'ask' && <BuyForm game={game} myBuys={myBuys} />}
      {tab === 'mine' && (
        <>
          {game.deliveries.length === 0 && <p class="dim">{$t('手上没有要送的货。')}</p>}
          {game.deliveries.map((d) => (
            <div class="row" key={d.id}>
              <Icon id={d.item} />
              <div class="grow">
                <b>{ITEMS[d.item].name} ×{d.qty}</b>{$t(' → {0}（{1}）', game.islandName(d.dest), d.to)}
                <div class="dim">{d.state === 'loaded' ? $t('已装进货舱') : d.source === 'sell' ? $t('已备好，等装货') : $t('等装货 · 你有 {0}', game.count(d.item))}</div>
              </div>
              <span class="price"><Coin />{d.reward}</span>
              <button class="btn small ghost" onClick={() => game.abandon(d.id)}>{$t('放弃')}</button>
            </div>
          ))}
          <p class="dim">{$t('点飞机或船出发。')}</p>
        </>
      )}
      {tab === 'shop' && (
        <>
          <p class="dim">{$t('{0}岛上的特产，买了自己带走。你有 ', game.here.def.owner)}<Coin />{game.save.coins}</p>
          {shop.map((l) => (
            <div class="row" key={l.item}>
              <Icon id={l.item} />
              <div class="grow"><b>{ITEMS[l.item].name}</b><div class="dim">{$t('存货 {0} · 你有 {1}', l.stock, game.count(l.item))}</div></div>
              <span class="price"><Coin />{l.price}</span>
              <button class="btn small" disabled={l.stock < 1 || game.save.coins < l.price} onClick={() => game.shopBuy(l.item, 1)}>{$t('买 1')}</button>
              <button class="btn small ghost" disabled={l.stock < 4 || game.save.coins < l.price * 4} onClick={() => game.shopBuy(l.item, 4)}>{$t('买 4')}</button>
              {(() => { const o = game.barterOffer(l.item); return o ? <button class="btn small ghost" title={$t('以物易物')} onClick={() => game.barter(l.item)}>{$t('用 {0}×{1} 换', ITEMS[o.pay].name, o.n)}</button> : null })()}
            </div>
          ))}
          <p class="dim small">{$t('以物易物多算两成。')}</p>
        </>
      )}
    </Sheet>
  )
}

function SellForm({ game, mySells }: { game: Game; mySells: Game['orders'] }) {
  const owned = ITEM_ORDER.filter((id) => game.count(id) > 0)
  const [item, setItem] = useState<ItemId | null>(null)
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState<number | null>(null)
  const it = item && game.count(item) > 0 ? item : owned[0] ?? null
  const max = it ? game.count(it) : 0
  const q = Math.max(1, Math.min(qty, max))
  const guide = it ? fairPrice(it, q, 900) : 0
  const ask = price ?? guide
  return (
    <>
      <p class="dim">{$t('挂到市场上；有人买了，送到才收钱。')}</p>
      {!it && <p class="dim">{$t('背包里没有可以卖的东西。')}</p>}
      {it && (
        <div class="form">
          <label>
            {$t('货物')}
            <select value={it} onChange={(e) => { setItem((e.target as HTMLSelectElement).value as ItemId); setPrice(null); setQty(1) }}>
              {owned.map((id) => <option value={id} key={id}>{$t('{0}（有 {1}）', ITEMS[id].name, game.count(id))}</option>)}
            </select>
          </label>
          <label>
            {$t('数量')}
            <span class="stepper">
              <button class="btn small ghost" onClick={() => { setQty(Math.max(1, q - 1)); setPrice(null) }}>−</button>
              <b>{q}</b>
              <button class="btn small ghost" onClick={() => { setQty(Math.min(max, q + 1)); setPrice(null) }}>{$t('＋')}</button>
            </span>
          </label>
          <label>
            {$t('要价')}
            <input type="number" min={1} value={ask} onInput={(e) => setPrice(Math.max(1, parseInt((e.target as HTMLInputElement).value || '1', 10)))} />
          </label>
          <p class="dim">{$t('行情价约 {0}（含运费）。要价高出太多就没人买。', guide)}</p>
          <div class="actions">
            <button class="btn" onClick={() => { void game.postSell(it, q, ask); setPrice(null); setQty(1) }}>{$t('挂单')}</button>
          </div>
        </div>
      )}
      {mySells.length > 0 && <h3>{$t('挂着的单子')}</h3>}
      {mySells.map((o) => (
        <div class="row" key={o.id}>
          <Icon id={o.item} />
          <div class="grow"><b>{ITEMS[o.item].name} ×{o.qty}</b><div class="dim">{$t('等买家…')}</div></div>
          <span class="price"><Coin />{o.price}</span>
          <button class="btn small ghost" onClick={() => game.cancelSell(o.id)}>{$t('撤单')}</button>
        </div>
      ))}
    </>
  )
}

const ASKABLE = ITEM_ORDER.filter((id) => ['material', 'part', 'fish'].includes(ITEMS[id].kind) && ITEMS[id].value > 0)
/** online: ask other players for something. They fly it over; it lands in the bag the next time this player is on. */
function BuyForm({ game, myBuys }: { game: Game; myBuys: Game['orders'] }) {
  const [item, setItem] = useState<ItemId>('plank')
  const [qty, setQty] = useState(4)
  const [price, setPrice] = useState<number | null>(null)
  const guide = fairPrice(item, qty, 800)
  const offer = price ?? guide
  const can = !!game.online?.writable
  return (
    <>
      <p class="dim">{game.onlineStatus()}</p>
      {can && (
        <div class="form">
          <label>
            {$t('想要')}
            <select value={item} onChange={(e) => { setItem((e.target as HTMLSelectElement).value as ItemId); setPrice(null) }}>
              {ASKABLE.map((id) => <option value={id} key={id}>{ITEMS[id].name}</option>)}
            </select>
          </label>
          <label>
            {$t('数量')}
            <span class="stepper">
              <button class="btn small ghost" onClick={() => { setQty(Math.max(1, qty - 1)); setPrice(null) }}>−</button>
              <b>{qty}</b>
              <button class="btn small ghost" onClick={() => { setQty(Math.min(24, qty + 1)); setPrice(null) }}>{$t('＋')}</button>
            </span>
          </label>
          <label>
            {$t('出价')}
            <input type="number" min={1} value={offer} onInput={(e) => setPrice(Math.max(1, parseInt((e.target as HTMLInputElement).value || '1', 10)))} />
          </label>
          <p class="dim">{$t('行情价约 {0}。金币现在就押在单子上（你有 ', guide)}<Coin />{$t('{0}），货送到才付给对方；撤单全额退回。', game.save.coins)}</p>
          <div class="actions">
            <button class="btn" disabled={game.save.coins < offer} onClick={() => { void game.postBuy(item, qty, offer); setPrice(null) }}>{$t('发求购单')}</button>
          </div>
        </div>
      )}
      {myBuys.length > 0 && <h3>{$t('你挂的求购单')}</h3>}
      {myBuys.map((o) => (
        <div class="row" key={o.id}>
          <Icon id={o.item} />
          <div class="grow"><b>{ITEMS[o.item].name} ×{o.qty}</b><div class="dim">{o.status === 'open' ? $t('等玩家接单…') : $t('{0}接了，货在路上', o.buyer ?? $t('有人'))}</div></div>
          <span class="price"><Coin />{o.price}</span>
          {o.status === 'open' && <button class="btn small ghost" onClick={() => game.cancelBuy(o.id)}>{$t('撤单')}</button>}
        </div>
      ))}
    </>
  )
}

/** round 22: out to a sea to bring down sky pirates */
function SortieCard({ game, vehicleId, armed }: { game: Game; vehicleId: string; armed: boolean }) {
  return (
    <div class="card sortie-card">
      <div class="card-head"><b>{$t('出击 · 清剿空盗')}</b><span class="dim">{$t('打赢了那片海 {0} 天没有空盗', CLEAR_DAYS)}</span></div>
      {!armed && <p class="dim">{$t('先在机库给这架飞机装上“武器挂架”。')}</p>}
      {armed && (Object.keys(SEAS) as SeaId[]).map((s) => {
        const S = SEAS[s]
        const clear = game.combat.cleared(s)
        return (
          <div class="row" key={s}>
            <span class="grow"><b>{S.name}</b> <span class="skulls">{'★'.repeat(S.stars)}</span> <span class="dim">{$t('击落 {0} 架{1}', S.need, clear ? $t(' · 已清剿，还剩 {0} 天', (game.save.cleared?.[s] ?? 0) - game.clockDay + 1) : '')}</span></span>
            <button class="btn small" onClick={() => void game.sortie(vehicleId, s)}>{$t('出击')}</button>
          </div>
        )
      })}
      {armed && <p class="dim small">{$t('按住“开火”机炮会自己找准头；锁定框变红按“导弹”；导弹飞来时，两个圈重合的一刻按“翻滚”，闪开后马上打导弹是三连发。被击落人没事，飞机要修。')}</p>}
    </div>
  )
}

function Depart({ game, vehicleId }: { game: Game; vehicleId: string }) {
  const v = game.vehicle(vehicleId)
  if (!v) return null
  const def = game.vdef(v)
  const dests = game.destinations()
  return (
    <Sheet title={$t('{0} · 去哪儿？', def.name)} onClose={() => game.close()}>
      <p class="dim">{$t('货舱 {0} 格 · 现在装着：{1}。装得越满，飞得越慢、转得越笨。', def.cargo, game.cargoText())}</p>
      {game.save.stats.delivered < PIRATE_FREE_DELIVERIES && <p class="dim small">{$t('头 {0} 单是新手期：哪条航线都不会遇到海盗。', PIRATE_FREE_DELIVERIES)}</p>}
      {def.kind === 'plane' && game.level >= 5 && <SortieCard game={game} vehicleId={vehicleId} armed={!!v.up?.includes('guns')} />}
      {dests.map((id) => {
        const plan = game.loadPlan(vehicleId, id)
        return (
          <div class="card" key={id}>
            <div class="card-head">
              <b>{game.islandName(id)}</b>
              <span class="dim">{game.layouts[id].def.home ? $t('回家') : game.layouts[id].def.owner} · {(game.distanceTo(id) / 100).toFixed(1)} km</span>
              {Math.max(game.layouts[id].def.danger, game.here.def.danger) > 0 && <span class="skulls">{'☠'.repeat(Math.max(game.layouts[id].def.danger, game.here.def.danger))}</span>}
            </div>
            {plan.length === 0 && <p class="dim">{$t('没有要送到这里的货。')}</p>}
            {plan.map((l) => (
              <div class={'plan' + (l.ok ? '' : ' short')} key={l.d.id}>
                <Icon id={l.d.item} /> {ITEMS[l.d.item].name} ×{l.d.qty} <span>{l.ok ? '✓ ' : '✗ '}{l.why}</span>
              </div>
            ))}
            <div class="actions">
              <button class="btn" onClick={() => void game.depart(vehicleId, id)}>{def.kind === 'boat' ? $t('起航') : $t('起飞')}</button>
            </div>
          </div>
        )
      })}
    </Sheet>
  )
}

/** what the islander writes on the island page, one line for each level reached */
const MY_WORDS = [
  $t('先把岛收拾干净，再说别的。'),
  $t('有了工作台，什么都能自己做了。'),
  $t('岛大了一圈。想养只小动物。'),
  $t('码头热闹起来了，邻岛的人常来。'),
  $t('晚上坐在门口看海，挺好。'),
  $t('屋里该添几样像样的家具了。'),
  $t('岛上的路，闭着眼也能走。'),
  $t('想去更远的海看看。'),
  $t('朋友们都说这里像个家。'),
  $t('这座岛，是我一点点攒起来的。'),
]

/** the house's next size: what it brings, what it costs, and the button */
function HouseGrow({ game }: { game: Game }) {
  const up = game.house.nextUp()
  if (!up) return <p class="hand-note">{$t('“房子已经是最大的了。”')}</p>
  return (
    <div class="level-next">
      <h3>{$t('扩建 → {0}', up.name)}<span class="price"><Coin />{up.coins}</span></h3>
      <p class="small dim">{up.brings}</p>
      <div class={'goal' + (game.level >= up.level ? ' done' : '')}><span class="check">{game.level >= up.level ? <Doodle n="check" size={16} /> : '○'}</span><span class="grow">{$t('小岛 {0} 级', up.level)}</span></div>
      {(Object.entries(up.need) as [ItemId, number][]).map(([id, n]) => (
        <div class={'goal' + (game.count(id) >= n ? ' done' : '')} key={id}><span class="check">{game.count(id) >= n ? <Doodle n="check" size={16} /> : '○'}</span><span class="grow">{ITEMS[id].name}</span><em>{Math.min(game.count(id), n)}/{n}</em></div>
      ))}
      <div class="actions"><button class="btn" disabled={!up.ok} onClick={() => { if (game.house.grow()) game.close() }}>{up.ok ? $t('扩建') : up.why}</button></div>
    </div>
  )
}

/** the island notebook (the desk at home): the island, the house, the animals, the yard */
function IslandNotebook({ game }: { game: Game }) {
  const close = () => game.close()
  const d = game.here.def
  const up = game.levelInfo()
  const block = game.rerollBlock()
  const mine = FURNITURE_ORDER.filter((id) => game.count(id) > 0 && !FURNITURE[id]?.indoor)
  const out = FURNITURE_ORDER.filter((id) => (game.save.decor ?? []).some((x) => x.item === id))
  const seeds = (Object.keys(PLANTS) as ItemId[]).filter((id) => game.count(id) > 0)
  const c = game.house.cosiness()
  const stars = Math.max(0, Math.min(5, Math.round(c.score / 20)))
  const pages: Page[] = [
    {
      key: 'isle', mark: 'house', title: `${LEVELS[game.level - 1].name} · ${game.level}/10`,
      body: () => (
        <>
          <p class="hand-note">“{MY_WORDS[game.level - 1]}”</p>
          <div class="isle-facts">
            <span title={$t('矿洞层数')}><Doodle n="flag" size={18} />{game.mine.depth}</span>
            <span title={$t('菜地')}><Doodle n="sprout" size={18} />{game.farmPlots}</span>
            <span title={$t('宠物位')}><Doodle n="paw" size={18} />{game.petSlots}</span>
            <span title={$t('魅力')}><Doodle n="star" size={18} />{game.charm}</span>
          </div>
          {(() => { const c = game.charmParts(); return <p class="small dim">{$t('魅力 {0} ＝ 岛上摆设 {1} ＋ 屋里家具 {2}（四分之一）＋ 请客 {3}', game.charm, c.outdoor, c.house, c.guests)}</p> })()}
          {up
            ? <div class="level-next">
                <h3>→ {up.level.name}{!up.level.planned && <span class="price"><Coin />{up.level.coins}</span>}</h3>
                <p class="small dim">{up.level.opens}</p>
                {up.goals.map((q) => (
                  <div class={'goal' + (q.done ? ' done' : '')} key={q.text}><span class="check">{q.done ? <Doodle n="check" size={16} /> : '○'}</span><span class="grow">{q.text}</span>{!q.done && <em>{q.have}/{q.need}</em>}</div>
                ))}
                {up.level.planned
                  ? <p class="dim small">{$t('还在规划中。')}</p>
                  : <div class="actions"><button class="btn" disabled={!up.ok} onClick={() => game.levelUp()}>{$t('升级')}</button></div>}
              </div>
            : <p class="hand-note">{$t('已经是最高级了。')}</p>}
          <details class="ladder"><summary class="dim small">{$t('全部 10 级')}</summary>
            {LEVELS.map((L) => <p class={'small' + (L.n <= game.level ? ' dim' : '')} key={L.n}><b>{L.n} {L.name}</b>{$t('：{0}', L.opens)}</p>)}
          </details>
          <Reroll game={game} block={block} />
        </>
      ),
    },
    {
      key: 'home', mark: 'heart', title: houseName(game.house.tier),
      body: () => (
        <>
          <div class="cosy-stars" title={$t('温馨度 {0}', c.score)}>{[0, 1, 2, 3, 4].map((i) => <Doodle key={i} n="star" size={26} fill={i < stars} class={i < stars ? 'lit' : ''} />)}</div>
          <p class="hand-note">“{stars >= 4 ? $t('回家的感觉真好。') : stars >= 2 ? $t('再添点东西，会更像个家。') : $t('屋里空荡荡的。')}”</p>
          <div class="small">{c.notes.map((n) => <div key={n}>· {n}</div>)}</div>
          <HouseGrow game={game} />
        </>
      ),
    },
    {
      key: 'pets', mark: 'paw', title: $t('动物 {0}/{1}', game.pets.owned.length, game.petSlots),
      body: () => (
        <>
          {game.petSlots === 0 && <p class="hand-note">{$t('岛到 3 级就能养。')}</p>}
          {game.petSlots > 0 && game.pets.owned.length === 0 && <p class="hand-note">{$t('“村边的小家伙，喂它爱吃的，几次就熟了。”')}</p>}
          {game.pets.owned.map((pet) => {
            const col = game.pets.colour(pet.sp, pet.col)
            return (
              <div class="row recipe" key={pet.id}>
                <span class="swatch" style={{ background: `rgb(${col.main.join(',')})` }} />
                <div class="grow"><b>{col.name}{PET_SPECIES[pet.sp].name}</b> <span class="dim small">{RARITY_STARS[rarityOf(col)]} · {game.islandName(pet.from)}</span></div>
                <button class={'btn small' + (pet.follow ? '' : ' ghost')} onClick={() => game.pets.setFollow(pet.id)}>{pet.follow ? <Doodle n="heart" size={16} fill /> : $t('跟着')}</button>
              </div>
            )
          })}
        </>
      ),
    },
    {
      key: 'yard', mark: 'sprout', title: $t('院子'),
      body: () => (
        <>
          {mine.length === 0 && out.length === 0 && seeds.length === 0 && <p class="hand-note">{$t('“院子还空着。工作台能做长椅和灯。”')}</p>}
          {mine.map((id) => (
            <div class="row recipe" key={id}>
              <Icon id={id} />
              <div class="grow"><b>{ITEMS[id].name}</b> <span class="dim">×{game.count(id)}</span></div>
              <button class="btn small" onClick={() => game.startDecor(id)}>{$t('摆出去')}</button>
            </div>
          ))}
          {seeds.map((id) => (
            <div class="row recipe" key={'s' + id}>
              <Icon id={id} />
              <div class="grow"><b>{ITEMS[id].name}</b> ×{game.count(id)} <span class="dim small">{game.save.planted?.length ?? 0}/{MAX_PLANTS}</span></div>
              <button class="btn small" onClick={() => game.startDecor(id)}>{$t('种下')}</button>
            </div>
          ))}
          {out.map((id) => (
            <div class="row recipe" key={'o' + id}>
              <Icon id={id} />
              <div class="grow"><b>{ITEMS[id].name}</b> <span class="dim">×{(game.save.decor ?? []).filter((x) => x.item === id).length}</span></div>
              <button class="btn small ghost" onClick={() => game.pickUpDecor(id)}>{$t('收回')}</button>
            </div>
          ))}
        </>
      ),
    },
  ]
  return <Book kind="notebook" label={$t('岛务手账')} pages={pages} onClose={close} />
}
