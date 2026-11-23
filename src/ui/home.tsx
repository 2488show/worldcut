// Round 16: the pieces of the house that keep memories — choosing the picture for a frame on the
// wall, reading the guestbook — and the day's small wish from an islander.
import { COMPOST_PER, compostWorth } from '../game/farm'
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import type { Piece } from '../game/house'
import { DISHES, FOOD, ITEMS, type ItemId } from '../game/data'
import { loadAlbum } from './album'
import { Cost, Icon, Sheet } from './bits'
import { $t } from '../i18n'

/** a frame on the wall: which picture from the album goes in it */
export function FramePicker({ game, piece }: { game: Game; piece: Piece }) {
  const [list] = useState(loadAlbum)
  return (
    <Sheet title={$t('相框：放哪张照片？')} onClose={() => game.close()} wide>
      {!list.length && <p class="dim">{$t('相册里还没有照片。点右上角的相机拍一张，或者请客人来家里坐坐，走的时候会合影。')}</p>}
      <div class="album-grid">
        {list.map((x) => (
          <button key={x.id} class={'album-cell' + (piece.photo === x.id ? ' card' : '')} onClick={() => { game.house.setPhoto(piece, x.id); game.close() }}>
            <img src={x.thumb} alt="" />
            <span class="small">{$t('第 {0} 天 · {1}', x.day, x.where)}</span>
          </button>
        ))}
      </div>
      <p class="dim small">{$t('照片存在这台设备上；换了设备，相框里会是一幅海景画。')}</p>
    </Sheet>
  )
}

/** the guestbook: what visitors wrote, the newest first */
export function GuestBook({ game }: { game: Game }) {
  const book = game.house.save.book ?? []
  return (
    <Sheet title={$t('留言本')} onClose={() => game.close()}>
      {!book.length && <p class="hand-note">{$t('“还没有人写过。请岛主们来家里坐坐吧。”')}</p>}
      <div class="guestbook">
        {book.map((l, i) => (
          <div class="guest-line" key={i}>
            <p class="hand-note">“{l.text}”</p>
            <p class="dim small">{$t('—— {0} · 第 {1} 天', l.who, l.day + 1)}</p>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** today's wish: who wants what, and the button to send it */
export function WishSheet({ game }: { game: Game }) {
  const w = game.wishes.open
  if (!w) {
    return (
      <Sheet title={$t('小心愿')} onClose={() => game.close()}>
        <p class="hand-note">{game.save.wish?.done && game.save.wish.day === game.clockDay ? $t('“谢谢你！明天见。”') : $t('现在没有人许愿。')}</p>
      </Sheet>
    )
  }
  const have = game.count(w.item)
  return (
    <Sheet title={$t('{0}的小心愿', w.who)} onClose={() => game.close()}>
      <div class="row recipe">
        <Icon id={w.item} />
        <div class="grow"><b>{ITEMS[w.item].name} × {w.n}</b> <span class={have >= w.n ? '' : 'dim'}>{$t('（有 {0}）', have)}</span></div>
      </div>
      <p class="dim small">{$t('还剩 {0} 天：在这里寄出，或者飞去{1}当面交给{2}。{3}', Math.max(1, 3 - (game.clockDay - w.day)), game.islandName(w.island), w.who, w.gift ? $t('回礼会是一件小家具（{0}）。', ITEMS[w.gift].name) : '')}</p>
      <div class="actions">
        <button class="btn" disabled={have < w.n} onClick={() => { if (game.wishes.send()) game.close() }}>{$t('寄出')}</button>
      </div>
    </Sheet>
  )
}

/** round 18: the compost bin — what rots goes in, fertiliser comes out the next morning */
export function CompostSheet({ game }: { game: Game }) {
  const c = game.farm.compost
  const ids = ([...new Set([...Object.keys(game.save.inv), ...Object.keys(game.save.store ?? {})])] as ItemId[]).filter((i) => compostWorth(i) > 0 && game.count(i) > 0)
  const tomorrow = Math.floor(c.pts / COMPOST_PER)
  return (
    <Sheet title={$t('堆肥箱')} onClose={() => game.close()}>
      <div class="row">
        <Icon id="fertilizer" /><span class="grow">{$t('沤好的肥料：{0} 袋', c.ready)}</span>
        <button class="btn small" disabled={!c.ready} onClick={() => game.farm.takeFertilizer()}>{$t('取出')}</button>
      </div>
      <p class="dim small">{$t('箱里有 {0} 份料，明天早上变成 {1} 袋肥料（每 {2} 份一袋{3}）。', c.pts, tomorrow, COMPOST_PER, c.pts % COMPOST_PER ? $t('，还差 {0} 份凑下一袋', COMPOST_PER - (c.pts % COMPOST_PER)) : '')}</p>
      <h3>{$t('放进去')}</h3>
      {!ids.length && <p class="dim small">{$t('手上没有能沤肥的东西。小鱼、多余的菜、纤维、树枝、贝壳、莓子都行。')}</p>}
      {ids.map((i) => (
        <div class="row recipe" key={i}>
          <Icon id={i} /><span class="grow">{ITEMS[i].name} ×{game.count(i)}<span class="dim small">{$t(' · 每个 {0} 份', compostWorth(i))}</span></span>
          <button class="btn small" onClick={() => game.farm.addCompost(i, 1)}>{$t('放 1 个')}</button>
          <button class="btn small" onClick={() => game.farm.addCompost(i, game.count(i))}>{$t('全放')}</button>
        </div>
      ))}
      <p class="dim small">{$t('肥料撒在种了东西、浇过水的地里：长得更快，收的时候多一个，地也会慢慢变成好地、肥地。')}</p>
    </Sheet>
  )
}

/** round 18: the creel — what was caught with it on the back, each with its length */
export function CreelButton({ game }: { game: Game }) {
  const n = (game.save.creel ?? []).length
  if (!game.carried('creel') || game.fishing.active || game.house.active || game.panel || game.mode !== 'island') return null
  return <button class="creel-btn btn" title={$t('鱼筐')} onClick={() => game.open({ kind: 'creel' })}><Icon id="creel" /><b>{n}</b></button>
}
export function CreelSheet({ game }: { game: Game }) {
  const c = game.save.creel ?? []
  const best = game.bestCatch()
  return (
    <Sheet title={$t('鱼筐 · {0} / 20', c.length)} onClose={() => game.close()}>
      {!c.length && <p class="dim">{$t('筐是空的。背着它去钓鱼，钓上来的先进筐，不占背包。')}</p>}
      {c.map((f, i) => (
        <div class="row recipe" key={i}>
          <Icon id={f.item} /><span class="grow">{ITEMS[f.item].name}</span>
          <span>{f.cm} cm</span>
          {best && best.item === f.item && best.cm === f.cm && <span class="tag">{$t('最大')}</span>}
        </div>
      ))}
      <div class="actions"><button class="btn" disabled={!c.length} onClick={() => game.emptyCreel()}>{$t('全部收好（背包装不下的进仓库）')}</button></div>
      {best && <p class="dim small">{$t('你钓过最大的：{0} {1} cm（第 {2} 天）。在岛上摆一个晒鱼架，或在屋里挂一块鱼标本，它就展示出来。', ITEMS[best.item].name, best.cm, best.day + 1)}</p>}
    </Sheet>
  )
}

/** round 20: the kitchen and the table. Two pages: eat what is ready (sat down to it), or cook. */
export function CookSheet({ game, restaurant }: { game: Game; restaurant: boolean }) {
  const ready = (Object.keys(FOOD) as ItemId[]).filter((id) => game.count(id) > 0)
  const [page, setPage] = useState<'eat' | 'cook'>(restaurant && ready.length ? 'eat' : 'cook')
  const a = game.acts
  const eat = (id: ItemId) => { game.close(); game.acts.eat(id) }
  const full = game.body.full >= 98
  return (
    <Sheet title={restaurant ? $t('餐厅') : $t('灶台')} onClose={() => game.close()}>
      <div class="tabs small">
        <button class={page === 'eat' ? 'on' : ''} onClick={() => setPage('eat')}>{$t('用餐{0}', ready.length ? $t('（{0}）', ready.length) : '')}</button>
        <button class={page === 'cook' ? 'on' : ''} onClick={() => setPage('cook')}>{$t('后厨')}</button>
      </div>
      {page === 'eat' && (
        <>
          <p class="dim small">{$t('{0}坐着吃，饱腹多一成。{1}', restaurant ? $t('坐到餐厅的桌边吃。') : $t('端到餐桌边坐下吃。'), full ? $t('现在吃不下了。') : '')}</p>
          {!ready.length && <p class="dim">{$t('没有能吃的。去“后厨”做一道。')}</p>}
          {ready.map((id) => {
            const f = FOOD[id]!
            return (
              <div class="row recipe" key={id}>
                <Icon id={id} />
                <div class="grow"><b>{ITEMS[id].name}</b> <span class="dim">{$t('· 体力 +{0} · 饱腹 +{1} · 有 {2} 份', f.energy, Math.round(f.full * 1.1), game.count(id))}</span></div>
                <button class="btn small" disabled={full} onClick={() => eat(id)}>{$t('坐下吃')}</button>
              </div>
            )
          })}
        </>
      )}
      {page === 'cook' && (
        <>
          <p class="dim small">{$t('做熟的更顶饿。')}</p>
          {a.note && (
            <p class={'cook-note' + (a.bad ? ' bad' : '')}>
              {a.note}
              {a.made && game.count(a.made) > 0 && !a.is('cook') && <> <button class="btn small" disabled={full} onClick={() => eat(a.made!)}>{$t('现在吃')}</button></>}
            </p>
          )}
          {DISHES.map((d) => {
            const f = FOOD[d.out]!
            return (
              <div class="row recipe" key={d.out}>
                <Icon id={d.out} />
                <div class="grow">
                  <b>{ITEMS[d.out].name}</b> <span class="dim">{$t('· 体力 +{0} · 饱腹 +{1}{2}', f.energy, f.full, game.count(d.out) ? $t(' · 有 {0} 份', game.count(d.out)) : '')}</span>
                  <div><Cost game={game} cost={d.cost} /></div>
                </div>
                <button class={'btn small' + (a.cannotCook(d.out) ? ' off' : '')} disabled={a.is('cook')} onClick={() => a.cook(d.out)}>{a.is('cook') ? '…' : $t('做')}</button>
              </div>
            )
          })}
        </>
      )}
    </Sheet>
  )
}
