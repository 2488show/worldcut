// The fish book: a page for each fish — caught ones with their picture, their record length and
// how many; the rest a shadow, with a hint of where (and when) to look.
import type { Game } from '../game/game'
import { ITEMS } from '../game/data'
import { BOOK_FISH, FISH_INFO } from '../game/fishbook'
import { Icon, Sheet } from './bits'
import { $t } from '../i18n'

export function FishBookPage({ game }: { game: Game }) {
  const rec = game.save.records ?? {}
  const got = game.save.stats.gathered
  const have = BOOK_FISH.filter((k) => (got[k] ?? 0) > 0 || rec[k]).length
  return (
    <div class="fishbook">
      <div class="fb-head">{have} / {BOOK_FISH.length}</div>
      <div class="fb-grid">
        {BOOK_FISH.map((k) => {
          const info = FISH_INFO[k]!
          const seen = (got[k] ?? 0) > 0 || !!rec[k]
          return (
            <div class={'fb-card' + (seen ? '' : ' unseen')} key={k}>
              <Icon id={k} />
              <b>{seen ? ITEMS[k].name : $t('？？？')}</b>
              {seen && rec[k] && <span class="fb-rec">{rec[k]!.cm} cm</span>}
              {seen && <span class="fb-n">×{got[k] ?? 0}</span>}
              <span class="fb-where">{info.how} · {info.where}{info.when ? ` · ${info.when}` : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export function FishBook({ game }: { game: Game }) {
  return (
    <Sheet title={$t('鱼的图鉴')} onClose={() => game.close()} wide>
      <FishBookPage game={game} />
    </Sheet>
  )
}
