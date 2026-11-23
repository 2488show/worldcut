// What the pilot carries: the hotbar at the bottom of the screen, the backpack (all the slots),
// and the warehouse at home.

import { useRef, useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { HOTBAR, ITEMS, PACKS, PACK_ROW, RARITY_NAME, stackOf, type ItemId, FOOD } from '../game/data'
import { Icon, Sheet } from './bits'
import { $t } from '../i18n'

type Cell = { item: ItemId; n: number } | null

/** one slot: an icon and how many, or nothing */
/** how much is left in a tool (0–1), or undefined for things that do not wear */
const lifeOf = (game: Game, c: Cell) => {
  const l = c && game.toolLife(c.item)
  return l && l.left < l.max ? l.left / l.max : undefined
}
function SlotView({ cell, on, onTap, onTip, locked, keyNo, life }: { cell: Cell; on?: boolean; onTap?: () => void; onTip?: (id: ItemId | null) => void; locked?: boolean; keyNo?: number; life?: number }) {
  const hold = useRef(0)
  const id = cell?.item
  return (
    <button
      class={'slot' + (on ? ' on' : '') + (!cell ? ' empty' : '') + (locked ? ' locked' : '') + (id && ITEMS[id].rarity >= 2 ? ' rare' : '')}
      data-item={id} disabled={locked}
      onClick={onTap}
      onPointerEnter={(e) => { if (id && e.pointerType === 'mouse') onTip?.(id) }}
      onPointerLeave={() => onTip?.(null)}
      onPointerDown={(e) => { if (id && e.pointerType !== 'mouse') { clearTimeout(hold.current); hold.current = window.setTimeout(() => onTip?.(id), 320) } }}
      onPointerUp={(e) => { if (e.pointerType !== 'mouse') { clearTimeout(hold.current); window.setTimeout(() => onTip?.(null), 2200) } }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {id && <Icon id={id} />}
      {cell && cell.n > 1 && <b>{cell.n}</b>}
      {keyNo !== undefined && <i class="key">{keyNo}</i>}
      {life !== undefined && <i class={'dur' + (life < 0.2 ? ' low' : '')}><i style={{ width: `${Math.max(4, Math.round(life * 100))}%` }} /></i>}
    </button>
  )
}

export function TipCard({ game, id }: { game: Game; id: ItemId }) {
  return (
    <div class="tip">
      <Icon id={id} />
      <div>
        <b>{ITEMS[id].name}</b> <span class={'rarity r' + ITEMS[id].rarity}>{RARITY_NAME[ITEMS[id].rarity]}</span>{' '}
        <span class="dim">{$t('身上 {0}{1} · 值 {2} 金币', game.carried(id), game.atHome && game.stored(id) ? $t(' · 仓库 {0}', game.stored(id)) : '', ITEMS[id].value)}</span>
        <div>{ITEMS[id].desc}</div>
        {(() => { const l = game.toolLife(id); return l ? <div class="dim small">{$t('耐久 {0}/{1}{2}', l.left, l.max, l.left < l.max ? $t(' · 工作台可以修') : '')}</div> : null })()}
        {FOOD[id] && <div class="dim small">{$t('能吃：体力 +{0} · 饱腹 +{1}', FOOD[id]!.energy, FOOD[id]!.full)}{game.carried(id) ? <> <button class="btn small" onClick={() => { game.close(); game.acts.eat(id) }}>{$t('吃一个')}</button></> : null}</div>}
      </div>
    </div>
  )
}

/** the bottom of the screen: eight slots and the backpack */
export function Hotbar({ game }: { game: Game }) {
  const [tip, setTip] = useState<ItemId | null>(null)
  const slots = game.slots()
  const used = game.used()
  const cap = game.capacity()
  const held = game.save.held ?? 0
  return (
    <div class="hotbar-wrap">
      {tip && <TipCard game={game} id={tip} />}
      <div class="hotbar" data-fx="bag-row">
        {slots.slice(0, HOTBAR).map((c, i) => (
          <SlotView key={i} cell={c} life={lifeOf(game, c)} on={i === held && !!c} keyNo={i + 1} onTip={setTip} onTap={() => { setTip(null); game.hold(i) }} />
        ))}
        <button class={'slot bag-btn' + (used >= cap ? ' full' : '')} data-fx="bag" title={$t('背包（B）')} onClick={() => game.open({ kind: 'bag' })}>
          <Icon id={cap > HOTBAR ? PACKS[Math.min(PACKS.length, (cap - HOTBAR) / PACK_ROW) - 1] : 'pack1'} />
          <b>{used}/{cap}</b>
        </button>
      </div>
    </div>
  )
}

/** all the slots: tap one, then another to swap them; tap twice for what it is */
export function BagPanel({ game }: { game: Game }) {
  const [sel, setSel] = useState<number | null>(null)
  const slots = game.slots()
  const cap = game.capacity()
  const rows = Math.max(cap, HOTBAR + PACK_ROW * PACKS.length)
  const cells: Cell[] = []
  for (let i = 0; i < rows; i++) cells.push(slots[i] ?? null)
  const nextPack = PACKS.find((p) => !(game.count(p) > 0))
  const pick = (i: number) => {
    if (i >= cap) return
    if (sel === null) {
      if (cells[i]) setSel(i)
      game.sfx('tap', 1.2)
    } else if (sel === i) {
      setSel(null)
    } else {
      game.swapSlots(sel, i)
      setSel(null)
    }
  }
  const s = sel !== null ? cells[sel] : null
  return (
    <Sheet title={$t('背包 · {0}/{1} 格', game.used(), cap)} onClose={() => game.close()}>
      <p class="dim small">{$t('点两格互换。第一排是快捷栏。')}</p>
      {[0, 1, 2, 3].map((r) => {
        const from = r * PACK_ROW
        if (from >= rows) return null
        const locked = from >= cap
        return (
          <div key={r}>
            <h3 class="row-head">{r === 0 ? $t('快捷栏') : locked ? $t('{0}（还没做）', ITEMS[PACKS[r - 1]].name) : ITEMS[PACKS[r - 1]].name}</h3>
            <div class={'bag-grid' + (locked ? ' locked' : '')}>
              {cells.slice(from, from + PACK_ROW).map((c, j) => (
                <SlotView key={j} cell={locked ? null : c} life={locked ? undefined : lifeOf(game, c)} locked={locked} on={sel === from + j} onTap={() => pick(from + j)} />
              ))}
            </div>
          </div>
        )
      })}
      {s && (
        <div class="card">
          <div class="card-head"><Icon id={s.item} /><b>{ITEMS[s.item].name}</b><span class={'rarity r' + ITEMS[s.item].rarity}>{RARITY_NAME[ITEMS[s.item].rarity]}</span></div>
          <p>{ITEMS[s.item].desc}</p>
          <p class="dim small">{$t('身上 {0} · 一格放 {1} 个 · 值 {2} 金币', game.carried(s.item), stackOf(s.item), ITEMS[s.item].value)}</p>
          <div class="actions wrap">
            {sel! >= HOTBAR && <button class="btn small" onClick={() => { game.toHotbar(s.item); setSel(null) }}>{$t('放到快捷栏')}</button>}
            {sel! < HOTBAR && <button class="btn small" onClick={() => { game.hold(sel!); setSel(null); game.close() }}>{$t('拿在手上')}</button>}
          </div>
        </div>
      )}
      {nextPack && <p class="dim small">{$t('在工作台的“装备”里做{0}，多 {1} 格。{2}', ITEMS[nextPack].name, PACK_ROW, game.isHome ? $t('用不上的东西放进仓库（村子里的木箱堆）。') : '')}</p>}
    </Sheet>
  )
}

/** the warehouse: put things away, take them out */
export function Warehouse({ game }: { game: Game }) {
  const slots = game.slots()
  const store = game.save.store ?? {}
  const kept = (Object.keys(store) as ItemId[]).filter((k) => (store[k] ?? 0) > 0).sort((a, b) => (ITEMS[a].kind < ITEMS[b].kind ? -1 : ITEMS[a].kind > ITEMS[b].kind ? 1 : 0))
  const cap = game.capacity()
  return (
    <Sheet title={$t('仓库')} onClose={() => game.close()} wide>
      <div class="card-head">
        <h3 class="grow">{$t('身上 {0}/{1} 格', game.used(), cap)}</h3>
        <button class="btn small" onClick={() => game.depositAll()}>{$t('全部存进去（工具除外）')}</button>
      </div>
      <p class="dim small">{$t('点一下就存/取。做东西会直接用仓库里的。')}</p>
      <div class="bag-grid">
        {slots.slice(0, cap).map((c, i) => <SlotView key={i} cell={c} onTap={() => c && game.deposit(c.item, c.n)} />)}
      </div>
      <h3 class="row-head">{$t('仓库里 {0}', kept.length ? $t('{0} 种', kept.length) : '')}</h3>
      {kept.length === 0 && <p class="dim">{$t('空的。')}</p>}
      <div class="grid">
        {kept.map((k) => (
          <button class="cell" key={k} onClick={() => game.withdraw(k, stackOf(k))}>
            <Icon id={k} /><span>{ITEMS[k].name}</span><b>{store[k]}</b>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
