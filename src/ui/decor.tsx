// Decorating the house: the little bar at the top (装修 / 出门), the tray of furniture you have
// but have not set out (bag, warehouse and the furniture box together, so nothing is ever out of
// reach), the bar shown while something is in hand, and the 撤回 chip after a piece is set down.
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { FURNITURE, ITEMS, type ItemId } from '../game/data'
import { Icon } from './bits'
import { $t } from '../i18n'

export function HouseBar({ game }: { game: Game }) {
  const h = game.house
  const toggle = () => { h.decorating = !h.decorating; game.sfx('tap'); game.changed() }
  return (
    <div class="housebar">
      <button class={'chip-btn' + (h.decorating ? ' on' : '')} onClick={toggle}>{h.decorating ? $t('✓ 完成') : $t('✎ 装修')}</button>
      {!h.decorating && <button class="chip-btn" onClick={() => h.exit()}>{$t('出门 →')}</button>}
    </div>
  )
}

type Where = 'all' | 'floor' | 'wall' | 'top'
const WHERE: [Where, string][] = [['all', $t('全部')], ['floor', $t('地上')], ['wall', $t('墙上')], ['top', $t('桌上')]]
const whereOf = (id: ItemId): Where => { const p = FURNITURE[id]?.place; return p === 'wall' ? 'wall' : p === 'top' ? 'top' : 'floor' }

export function DecorTray({ game }: { game: Game }) {
  const [where, setWhere] = useState<Where>('all')
  const list = game.house.owned().filter((o) => where === 'all' || whereOf(o.item) === where)
  return (
    <div class="tray">
      <div class="tray-tabs">
        {WHERE.map(([k, name]) => <button key={k} class={where === k ? 'on' : ''} onClick={() => setWhere(k)}>{name}</button>)}
      </div>
      <div class="tray-row">
        {list.length === 0 && <span class="tray-empty">{$t('点屋里的家具把它拿起来 · 工作台能做新的')}</span>}
        {list.map((o) => (
          <button key={o.item} class="tray-cell" title={ITEMS[o.item].name} onClick={() => game.startDecor(o.item)}>
            <Icon id={o.item} />
            {o.n > 1 && <b>{o.n}</b>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** a thing in hand: what it is, whether it fits (and why it settled there), and the buttons */
export function PlaceBar({ game, item }: { game: Game; item: ItemId }) {
  const gh = game.ghost
  const indoor = game.house.active
  const touch = game.pointerKind !== 'mouse'
  const moving = !!game.house.moving
  const turnable = !!FURNITURE[item]
  const toggle = () => { game.freePlace = !game.freePlace; game.sfx('tap', 1.3); if (gh) game.aimAt(gh.x, gh.y); game.changed() }
  return (
    <div class={'placebar' + (gh ? (gh.ok ? ' ok' : ' no') : '')}>
      <span class="pb-what"><Icon id={item} /><i class="dot" /><span class="pb-say">{!gh ? '' : gh.ok ? gh.hint || (touch ? $t('再点一下放下') : '') : gh.level ? $t('地不平：可以一下铲平这一整块') : gh.why}</span></span>
      <span class="pb-btns">
        {!!gh?.level && <button class="btn small" title={$t('用铲子把这整块地铲平，然后放下')} onClick={() => game.levelForPlacing()}>{$t('铲平这块（{0} 下）', gh.level)}</button>}
        {touch && !gh?.level && <button class="btn small" disabled={!gh?.ok} onClick={() => game.placeHere()}>{$t('放这里')}</button>}
        {turnable && <button class="btn small ghost" title={$t('转向')} onClick={() => game.rotatePlacing()}>⟳</button>}
        {indoor && <button class={'btn small ghost' + (game.freePlace ? '' : ' on')} title={game.freePlace ? $t('自由摆放（点一下打开自动对齐）') : $t('自动对齐（点一下关掉，可以一格一格挪）')} onClick={toggle}>{game.freePlace ? $t('自由') : $t('对齐')}</button>}
        {indoor && game.freePlace && (
          <span class="nudge">
            <button class="btn small ghost" onClick={() => game.nudge(-1, 0)}>←</button>
            <button class="btn small ghost" onClick={() => game.nudge(0, -1)}>↑</button>
            <button class="btn small ghost" onClick={() => game.nudge(0, 1)}>↓</button>
            <button class="btn small ghost" onClick={() => game.nudge(1, 0)}>→</button>
          </span>
        )}
        {item === 'furnaceKit' && !indoor && <button class="btn small ghost" onClick={() => game.placeAtDefault()}>{$t('推荐位置')}</button>}
        {moving && <button class="btn small ghost" title={$t('收进背包（满了就放进家具箱）')} onClick={() => game.house.stash()}>{$t('收起来')}</button>}
        <button class="btn small ghost" title={moving ? $t('放回原处') : $t('不放了')} onClick={() => game.cancelPlacing()}>✕</button>
      </span>
    </div>
  )
}

/** 撤回: for a few seconds after a piece is set down */
export function UndoChip({ game }: { game: Game }) {
  if (!game.house.active || game.placingItem || !game.house.canUndo) return null
  return <button class="chip-btn undo" onClick={() => game.house.undo()}>{$t('↶ 撤回')}</button>
}
