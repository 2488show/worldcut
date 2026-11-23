// Photo mode and the album. In photo mode the interface goes (the captions too); the camera can be
// turned, tilted and drawn in or out; 拍下 keeps what is on the screen. The album shows what was
// taken: save one to the device, delete it, or choose it as the postcard for the next delivery.
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { ALBUM_MAX, capture, loadAlbum, removePhoto, setPostcard, type Photo } from './album'
import { Sheet } from './bits'
import { $t } from '../i18n'

export function PhotoHud({ game }: { game: Game }) {
  const [flash, setFlash] = useState(0)
  const [last, setLast] = useState<Photo | null>(null)
  const shoot = () => {
    const p = capture(game)
    if (!p) return game.warn($t('这台设备拍不了照'))
    game.sfx('tap', 0.6)
    game.sfx('pop', 1.6)
    setFlash(Date.now())
    setLast(p)
  }
  const out = () => { game.photoMode = false; game.changed() }
  return (
    <>
      {flash > 0 && <div class="shutter" key={flash} />}
      <div class="photo-frame"><i /><i /><i /><i /></div>
      <div class="photo-top">
        <span>{$t('照相 · 转镜头、拉远拉近，再按“拍下”')}</span>
        <span class="actions">
          <button class="btn small ghost" onClick={() => { game.photoMode = false; game.open({ kind: 'album' }) }}>{$t('相册')}</button>
          <button class="btn small ghost" onClick={out}>{$t('退出')}</button>
        </span>
      </div>
      <div class="photo-bar">
        {game.view3d && <button class="btn round" title={$t('向左转')} onClick={() => game.rotateView(-1)}>↶</button>}
        <button class="btn round" title={$t('换视角')} onClick={() => game.toggleView()}>{game.view3d ? $t('俯') : $t('斜')}</button>
        <button class="btn big-btn shoot" onClick={shoot}>{$t('拍下')}</button>
        <button class="btn round" title={$t('拉远 / 拉近')} onClick={() => game.toggleZoom()}>{game.islandZoom === 2 ? $t('远') : $t('近')}</button>
        {game.view3d && <button class="btn round" title={$t('向右转')} onClick={() => game.rotateView(1)}>↷</button>}
      </div>
      {last && (
        <button class="photo-last" title={$t('打开相册')} onClick={() => { game.photoMode = false; game.open({ kind: 'album' }) }}>
          <img src={last.thumb} alt={$t('刚拍的')} />
          <span>{$t('相册')}</span>
        </button>
      )}
    </>
  )
}

export function Album({ game }: { game: Game }) {
  const [list, setList] = useState(loadAlbum)
  const [at, setAt] = useState<number | null>(null)
  const p = at !== null ? list.find((x) => x.id === at) : null
  if (p) {
    const chosen = game.postcard === p.thumb
    return (
      <Sheet title={$t('相册 · 第 {0} 天 · {1}', p.day, p.where)} onClose={() => game.close()} wide>
        <img class="album-big" src={p.full} alt={$t('照片')} />
        <div class="actions">
          <button class="btn small" onClick={() => setPostcard(game, chosen ? null : p.thumb)}>{chosen ? $t('不寄这张了') : $t('下次送货时寄出这张明信片')}</button>
          <a class="btn small ghost" href={p.full} download={$t('云岭航行-第{0}天-{1}.png', p.day, p.where)}>{$t('存到设备')}</a>
          <button class="btn small ghost" onClick={() => { removePhoto(p.id); if (chosen) setPostcard(game, null); setList(loadAlbum()); setAt(null) }}>{$t('删掉')}</button>
        </div>
        <p class="dim small">{$t('随下一单货寄出，岛主会回信。')}</p>
        <div class="actions"><button class="btn ghost" onClick={() => setAt(null)}>{$t('← 所有照片')}</button></div>
      </Sheet>
    )
  }
  return (
    <Sheet title={$t('相册 · {0}/{1}', list.length, ALBUM_MAX)} onClose={() => game.close()} wide>
      {game.postcard && <p class="small">{$t('下一单会附上一张明信片 ✉')}</p>}
      {!list.length && <p class="dim">{$t('还没有照片。点右上角的“拍”进入照相。')}</p>}
      <div class="album-grid">
        {list.map((x) => (
          <button key={x.id} class={'album-cell' + (game.postcard === x.thumb ? ' card' : '')} onClick={() => setAt(x.id)}>
            <img src={x.thumb} alt="" />
            <span class="small">{$t('第 {0} 天 · {1}', x.day, x.where)}</span>
          </button>
        ))}
      </div>
      <div class="actions"><button class="btn" onClick={() => { game.close(); game.photoMode = true; game.changed() }}>{$t('去拍照')}</button></div>
    </Sheet>
  )
}
