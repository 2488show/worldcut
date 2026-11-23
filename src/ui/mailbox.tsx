// The mailbox: a mail program, 云屿邮局 — the same whether opened at the box by the door or on the
// computer. Letters down the left (newest first), the one picked on the right with what came with
// it to take out; on a narrow screen one pane at a time.
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import type { Letter } from '../game/mail'
import { bagText, type ItemId } from '../game/data'
import { Coin, Icon, Sheet } from './bits'
import { $t } from '../i18n'

const STAMP: Record<Letter['kind'], string> = { welcome: '✉', thanks: '♥', guest: '☕', chat: '✎', cosy: '★', note: '✂', postcard: '▣', wish: '♡' }
const KIND: Record<Letter['kind'], string> = { welcome: $t('欢迎'), thanks: $t('感谢'), guest: $t('来客'), chat: $t('闲聊'), cosy: $t('评定'), note: $t('通知'), postcard: $t('明信片'), wish: $t('心愿') }

function Read({ game, l }: { game: Game; l: Letter }) {
  game.mail.read(l)
  const first = l.gift ? (Object.keys(l.gift)[0] as ItemId) : null
  return (
    <div class={'mail-read kind-' + l.kind}>
      <table class="mail-fields">
        <tbody>
          <tr><th>{$t('发件人')}</th><td>{l.from}</td></tr>
          <tr><th>{$t('日期')}</th><td>{$t('第 {0} 天', l.day + 1)}</td></tr>
          <tr><th>{$t('主题')}</th><td><b>{l.title}</b></td></tr>
        </tbody>
      </table>
      {l.photo && /^data:image\/(jpeg|png);base64,/.test(l.photo) && <img class="postcard-img" src={l.photo} alt={$t('明信片')} />}
      <div class="mail-text">{l.body.split('\n').map((p, i) => (p ? <p key={i}>{p}</p> : <br key={i} />))}</div>
      {(l.gift || l.coins) && (
        <div class="mail-attach">
          <span class="clip">{$t('附件')}</span>
          {first && <Icon id={first} />}
          {l.coins ? <Coin /> : null}
          <span class="grow">{[l.gift ? bagText(l.gift) : '', l.coins ? $t('{0} 金币', l.coins) : ''].filter(Boolean).join($t('、'))}</span>
          <button class="btn small" disabled={l.taken} onClick={() => game.mail.take(l)}>{l.taken ? $t('已收下') : $t('收下附件')}</button>
        </div>
      )}
    </div>
  )
}

export function Mailbox({ game, open }: { game: Game; open?: number }) {
  const letters = game.mail.letters
  // (a wide screen shows the newest letter beside the list; a narrow one only the list, nothing read yet)
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches
  const [at, setAt] = useState<number | null>(open ?? (narrow ? null : letters[0]?.id ?? null))
  const [reading, setReading] = useState(open !== undefined)
  const l = at !== null ? letters.find((x) => x.id === at) ?? null : null
  const gifts = letters.filter((x) => (x.gift || x.coins) && !x.taken)
  return (
    <Sheet title={$t('云屿邮局 - 收件箱{0}', game.mail.unread ? $t('（{0} 封未读）', game.mail.unread) : '')} onClose={() => game.close()} wide>
      <div class={'mail-app' + (reading ? ' reading' : '')}>
        <div class="mail-tools">
          <button class="btn small" disabled={!reading} onClick={() => setReading(false)}>{$t('← 收件箱')}</button>
          <button class="btn small" disabled={!gifts.length} onClick={() => { for (const x of gifts) game.mail.take(x) }}>{$t('全部收下附件{0}', gifts.length ? $t('（{0}）', gifts.length) : '')}</button>
          <span class="grow" />
          <span class="dim small">{$t('{0} 封', letters.length)}</span>
        </div>
        <div class="mail-panes">
          <div class="mail-list" role="listbox">
            {!letters.length && <p class="dim">{$t('还没有信。海鸥每天早上来。')}</p>}
            {letters.map((x) => (
              <button class={'mail-row' + (x.read ? '' : ' unread') + (x.id === at ? ' on' : '')} key={x.id} role="option" aria-selected={x.id === at}
                onClick={() => { setAt(x.id); setReading(true) }}>
                <span class="stamp" title={KIND[x.kind]}>{STAMP[x.kind]}</span>
                <span class="grow"><b>{x.title}</b><span class="dim small">{$t('{0} · 第 {1} 天', x.from, x.day + 1)}</span></span>
                {(x.gift || x.coins) && !x.taken && <span class="gift-dot" title={$t('有附件')}>{$t('附')}</span>}
              </button>
            ))}
          </div>
          <div class="mail-view">{l ? <Read game={game} l={l} /> : <p class="dim">{$t('选一封信来读。')}</p>}</div>
        </div>
      </div>
    </Sheet>
  )
}
