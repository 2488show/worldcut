// The tackle box (round 13): opened over the island, as a real box — the lures in the lid, the
// live bait in the tray's compartments, the rod strapped to its side. Tap a thing to look at it;
// "用这个" puts it on the hook. What it is good for is a row of fish: the ones you have caught in
// colour, the rest as shadows.
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { ITEMS, type ItemId } from '../game/data'
import { BAITS, LIVE_BAIT, LURES, goodFor } from '../game/tackle'
import { Icon } from './bits'
import { $t } from '../i18n'

export function TackleBox({ game }: { game: Game }) {
  const on = game.tackle.on
  const [pick, setPick] = useState<ItemId | null>(on ?? null)
  const seen = (f: ItemId) => (game.save.stats.gathered[f] ?? 0) > 0 || !!game.save.records?.[f]
  const cell = (b: ItemId) => {
    const n = game.count(b)
    const live = BAITS[b]!.live
    return (
      <button key={b} class={'tb-cell' + (n ? '' : ' none') + (pick === b ? ' sel' : '') + (on === b ? ' using' : '')} onClick={() => { game.sfx('tap', 1.5); setPick(b) }} aria-label={ITEMS[b].name}>
        <Icon id={b} />
        {n > 0 && <span class="tb-n">{live ? n : ''}</span>}
        {on === b && <span class="tb-check">✓</span>}
      </button>
    )
  }
  const p = pick
  const n = p ? game.count(p) : 0
  return (
    <div class="veil" onPointerDown={(e) => { if (e.target === e.currentTarget) game.close() }}>
      <div class="tackle" role="dialog" aria-label={$t('钓具箱')}>
        <div class="tb-lid">
          <div class="tb-foam">{LURES.map(cell)}</div>
        </div>
        <div class="tb-tray">
          <div class="tb-reel"><Icon id="rod" /><span class="tb-n">{game.count('rod') ? '' : '?'}</span></div>
          <div class="tb-bait">{LIVE_BAIT.map(cell)}</div>
        </div>
        <div class="tb-rods" aria-hidden="true"><i /><i /></div>
        <button class="tb-x" aria-label={$t('合上')} onClick={() => game.close()}>×</button>
      </div>
      {p && (
        <div class="tb-tip">
          <div class="tb-tip-head">
            <Icon id={p} />
            <div class="grow">
              <b>{ITEMS[p].name}</b>
              <span class="dim small">{n ? (BAITS[p]!.live ? $t('有 {0} 个', n) : $t('用不坏')) : $t('还没有')}</span>
            </div>
            {on === p && <span class="tb-using">{$t('使用中')}</span>}
          </div>
          <div class="tb-likes">
            {(goodFor(p).length ? goodFor(p) : (['sardine', 'bream', 'mackerel'] as ItemId[])).map((f) => (
              <span key={f} class={'tb-fish' + (seen(f) ? '' : ' shadow')} title={seen(f) ? ITEMS[f].name : $t('？')}><Icon id={f} /></span>
            ))}
            {BAITS[p]!.night && <span class="tb-night">☾</span>}
          </div>
          <p class="dim small">{ITEMS[p].desc}</p>
          <div class="actions">
            {on === p
              ? <button class="btn small ghost" onClick={() => game.tackle.use(null)}>{$t('取下')}</button>
              : <button class="btn small" disabled={!n} onClick={() => game.tackle.use(p)}>{$t('用这个')}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

/** the little box by the hotbar while the rod is in hand: what is on the hook, a tap to open */
export function TackleButton({ game }: { game: Game }) {
  if (game.heldItem() !== 'rod' || game.fishing.active || game.house.active || game.panel) return null
  const on = game.tackle.on
  return (
    <button class="tackle-btn" title={$t('钓具箱（Tab）')} onClick={() => game.open({ kind: 'tackle' })}>
      <span class="tb-mini" />
      {on ? <Icon id={on} /> : <span class="tb-bare">{$t('空钩')}</span>}
    </button>
  )
}
