// Lying in bed and listening: the camera goes down low beside the pillow, the real windows show
// the weather outside, the fire crackles and the rain ticks on the glass while the music plays
// low. Nothing to do; that is the point. And the eyes closing as sleep comes.

import type { Game } from '../game/game'
import { Sheet } from './bits'
import { $t } from '../i18n'

/** the bed: lie down for a while, or sleep to the morning */
export function BedChoice({ game }: { game: Game }) {
  const nap = game.body.canNap && game.dayPhase() !== 'night'
  const go = (napping: boolean) => { game.close(); game.house.bed && game.body.goToBed(game.house.bed, napping) }
  return (
    <Sheet title={$t('床')} onClose={() => game.close()}>
      <div class="bed-choice">
        <button class="big-choice" onClick={() => game.house.lieDown()}><span class="glyph">☁</span>{$t('躺一会儿')}</button>
        {nap && <button class="big-choice" onClick={() => go(true)}><span class="glyph">◔</span>{$t('睡个午觉')}<small>{$t('两小时 · 体力 +35')}</small></button>}
        <button class="big-choice" onClick={() => go(false)}><span class="glyph">☾</span>{nap ? $t('睡到明早') : $t('睡到天亮')}</button>
      </div>
      <p class="dim small">{$t('什么时候都能睡。过了半夜还不睡，体力会一点点往下掉，掉光了就地睡着。')}</p>
    </Sheet>
  )
}

/** in bed: the room seen low from the pillow (the real windows show the weather), a line, and getting up */
export function RestOverlay({ game }: { game: Game }) {
  const wx = game.weather
  const what = wx.raining ? (wx.now.storm > 0.3 ? 'storm' : 'rain') : wx.snowing ? 'snow' : wx.foggy ? 'fog' : game.dayPhase() === 'night' ? 'night' : 'sun'
  const lines: Record<string, string> = { storm: $t('风在外面打转。'), rain: $t('雨敲着窗。'), snow: $t('雪落在窗台上。'), fog: $t('窗外白茫茫的。'), night: $t('很安静。'), sun: $t('阳光照进来。') }
  const sleeping = game.house.sleepIn > 0
  return (
    <div class="rest">
      {!sleeping && (
        <div class="rest-bar">
          <span class="rest-line">{lines[what]}</span>
          <span class="rest-btns">
            {game.body.canNap && game.dayPhase() !== 'night' && <button class="chip-btn" onClick={() => game.house.bed && game.body.goToBed(game.house.bed, true)}>{$t('◔ 午觉')}</button>}
            <button class="chip-btn" onClick={() => game.house.bed && game.body.goToBed(game.house.bed)}>{$t('☾ 睡到天亮')}</button>
            <button class="chip-btn" onClick={() => game.house.getUp()}>{$t('起来')}</button>
          </span>
        </div>
      )}
    </div>
  )
}

/** the eyes closing as sleep comes, and opening in the morning */
export function Lids({ game }: { game: Game }) {
  const e = game.house.eyes
  if (e <= 0.001) return null
  const k = e * e * (3 - 2 * e)
  return (
    <div class="lids" style={{ ['--k' as string]: String(k) }}>
      <i class="lid top" /><i class="lid bottom" />
    </div>
  )
}
