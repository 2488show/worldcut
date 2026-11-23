// Small shared pieces of the UI.

import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { ITEMS, type Bag, type ItemId } from '../game/data'
import { iconUrl } from '../game/icons'
import type { Game } from '../game/game'
import { $t } from '../i18n'

export function Icon({ id }: { id: ItemId | 'coin' }) {
  const it = id === 'coin' ? null : ITEMS[id]
  return <i class={'icon' + (it && it.rarity >= 2 ? ' rare' + it.rarity : '')} title={it ? $t('{0}：{1}', it.name, it.desc) : $t('金币')} style={{ backgroundImage: `url(${iconUrl(id)})` }} />
}
export function Coin() {
  return <Icon id="coin" />
}

/** what something costs, each line coloured by whether the player has enough */
export function Cost({ game, cost, times = 1 }: { game: Game; cost: Bag; times?: number }) {
  return (
    <span class="cost">
      {(Object.keys(cost) as ItemId[]).map((id) => {
        const need = (cost[id] ?? 0) * times
        const have = game.count(id)
        return (
          <span class={'cost-line' + (have >= need ? '' : ' short')} key={id} title={ITEMS[id].name}>
            <Icon id={id} />
            {ITEMS[id].name} {Math.min(have, 999)}/{need}
          </span>
        )
      })}
    </span>
  )
}

/** inside the computer's window a panel is just its contents (the window has its own title and ×) */
export const InWindow = createContext(false)
export function Sheet({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ComponentChildren; wide?: boolean }) {
  if (useContext(InWindow)) return <div class="win-sheet" aria-label={title}>{children}</div>
  return (
    <div class="veil" onPointerDown={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}>
      <div class={'sheet' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <header class="win-title">
          <h2>{title}</h2>
          {onClose && <button class="x w95" aria-label={$t('关闭')} onClick={onClose}>×</button>}
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  )
}
