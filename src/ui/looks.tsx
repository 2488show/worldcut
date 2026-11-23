// Making the player: body, build, skin, hair and its colour, beard, eyes, hat, clothes. Shown
// once at the start of a new game, and again at the wardrobe in the house.

import { useEffect, useRef, useState } from 'preact/hooks'
import type { Game } from '../game/game'
import {
  BEARD_NAMES, BOTTOM_NAMES, BUILD_NAMES, CLOTHES, EYE_COLORS, HAIR_COLORS, HAIR_NAMES, HAT_NAMES, SKINS, TOP_NAMES, personModel,
  type Beard, type Bottom, type Build, type Hair, type Hat, type Look, type Top,
} from '../engine/avatar'
import { DESIGN_COLOURS } from '../engine/craft'
import { ITEMS, type Bag, type ItemId } from '../game/data'
import { Sheet } from './bits'
import { drawVoxels } from './voxview'
import { $t } from '../i18n'

type RGB = [number, number, number]
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
/** the paint shop's colours: the clothes can be dyed in them too, a dye a time (the plain colours are free) */
const DYES: ItemId[] = ['dyeRed', 'dyeYellow', 'dyeBlue', 'dyeGreen', 'dyeWhite', 'dyeBlack', 'dyePink', 'dyeSilver']
const dyeOf = (c: RGB): ItemId | null => { const i = DESIGN_COLOURS.findIndex((d) => d.join() === c.join()); return i >= 0 ? DYES[i] : null }
const PANTS: RGB[] = [[58, 84, 140], [80, 70, 60], [60, 70, 110], [90, 120, 150], [50, 52, 64], [150, 120, 90], [200, 190, 170], [120, 60, 60]]

function Chips<T extends string>({ value, of, set }: { value: T; of: Record<T, string>; set: (v: T) => void }) {
  return (
    <div class="tabs chips">
      {(Object.keys(of) as T[]).map((k) => <button key={k} class={value === k ? 'on' : ''} onClick={() => set(k)}>{of[k]}</button>)}
    </div>
  )
}
function Swatches({ colors, pick, set }: { colors: RGB[]; pick: (c: RGB, i: number) => boolean; set: (i: number) => void }) {
  return (
    <div class="swatches">
      {colors.map((c, i) => <button key={i} class={pick(c, i) ? 'on' : ''} style={{ background: css(c) }} onClick={() => set(i)} />)}
    </div>
  )
}

export function LookMaker({ game, first }: { game: Game; first?: boolean }) {
  const [l, setL] = useState<Look>(() => JSON.parse(JSON.stringify(game.look)))
  const [yaw, setYaw] = useState(0.5)
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (cv.current) drawVoxels(cv.current, personModel(l, 'preview', 'stand'), yaw)
  }, [JSON.stringify(l), yaw])
  // the preview turns slowly by itself
  useEffect(() => {
    const id = setInterval(() => setYaw((y) => y + 0.06), 80)
    return () => clearInterval(id)
  }, [])
  const set = (patch: Partial<Look>) => setL({ ...l, ...patch })
  // dyeing costs a dye of that colour (not the first time, when the player is made)
  const was = game.look
  const need: Bag = {}
  if (!first) for (const [now, before] of [[l.shirt, was.shirt], [l.pants, was.pants]] as [RGB, RGB][]) {
    const d = dyeOf(now)
    if (d && now.join() !== before.join()) need[d] = (need[d] ?? 0) + 1
  }
  const short = (Object.keys(need) as ItemId[]).filter((d) => game.count(d) < (need[d] ?? 0))
  const done = () => {
    if (short.length) return game.warn($t('颜料不够：{0}（在工作台“涂装”页做）', short.map((d) => ITEMS[d].name).join($t('、'))))
    if (Object.keys(need).length) game.spend(need)
    game.setLook(l)
    game.open(first ? { kind: 'welcome' } : null)
  }
  const randomise = () => {
    const r = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
    const body = Math.random() < 0.5 ? 'm' : 'f'
    setL({
      body, build: r(['slim', 'plain', 'strong'] as const), skin: Math.floor(Math.random() * SKINS.length), hair: r(Object.keys(HAIR_NAMES) as Hair[]),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length), beard: body === 'm' ? r(Object.keys(BEARD_NAMES) as Beard[]) : 'none',
      eyes: Math.floor(Math.random() * EYE_COLORS.length), hat: r(Object.keys(HAT_NAMES) as Hat[]), shirt: r(CLOTHES), pants: r(PANTS), scarf: Math.random() < 0.5,
      top: r(Object.keys(TOP_NAMES) as Top[]), bottom: r(Object.keys(BOTTOM_NAMES) as Bottom[]),
    })
  }
  return (
    <Sheet title={first ? $t('你是谁？') : $t('衣柜 · 换个样子')} onClose={first ? undefined : () => game.close()} wide>
      {first && <p class="dim small">{$t('先捏一个自己。以后在家里的衣柜前随时能改。')}</p>}
      <div class="lookmaker">
        <div class="look-left">
          <canvas ref={cv} class="preview person" width={200} height={240} />
          <div class="actions">
            <button class="btn small ghost" onClick={() => setYaw(yaw + Math.PI / 2)}>{$t('转一下')}</button>
            <button class="btn small ghost" onClick={randomise}>{$t('随机')}</button>
          </div>
        </div>
        <div class="look-right">
          <b>{$t('身体')}</b><Chips value={l.body} of={{ m: $t('男'), f: $t('女') }} set={(v) => set({ body: v, beard: v === 'f' ? 'none' : l.beard })} />
          <b>{$t('体型')}</b><Chips value={l.build} of={BUILD_NAMES as Record<Build, string>} set={(v) => set({ build: v })} />
          <b>{$t('肤色')}</b><Swatches colors={SKINS} pick={(_, i) => i === l.skin} set={(i) => set({ skin: i })} />
          <b>{$t('发型')}</b><Chips value={l.hair} of={HAIR_NAMES} set={(v) => set({ hair: v })} />
          <b>{$t('发色')}</b><Swatches colors={HAIR_COLORS} pick={(_, i) => i === l.hairColor} set={(i) => set({ hairColor: i })} />
          {l.body === 'm' && <><b>{$t('胡子')}</b><Chips value={l.beard} of={BEARD_NAMES} set={(v) => set({ beard: v })} /></>}
          <b>{$t('眼睛')}</b><Swatches colors={EYE_COLORS} pick={(_, i) => i === l.eyes} set={(i) => set({ eyes: i })} />
          <b>{$t('帽子')}</b><Chips value={l.hat} of={HAT_NAMES} set={(v) => set({ hat: v })} />
          <b>{$t('上衣')}</b><Chips value={l.top ?? 'tee'} of={TOP_NAMES} set={(v) => set({ top: v })} />
          <Swatches colors={CLOTHES} pick={(c) => c.join() === l.shirt.join()} set={(i) => set({ shirt: CLOTHES[i] })} />
          <span class="dim small">{$t('颜料色（每染一次用一份对应的颜料{0}）', first ? $t('；第一次免费') : '')}</span>
          <Swatches colors={DESIGN_COLOURS} pick={(c) => c.join() === l.shirt.join()} set={(i) => set({ shirt: DESIGN_COLOURS[i] })} />
          {(l.top ?? 'tee') !== 'dress' && <><b>{$t('下装')}</b><Chips value={l.bottom ?? 'trousers'} of={BOTTOM_NAMES} set={(v) => set({ bottom: v })} /></>}
          <Swatches colors={PANTS} pick={(c) => c.join() === l.pants.join()} set={(i) => set({ pants: PANTS[i] })} />
          <Swatches colors={DESIGN_COLOURS} pick={(c) => c.join() === l.pants.join()} set={(i) => set({ pants: DESIGN_COLOURS[i] })} />
          <label class="check"><input type="checkbox" checked={l.scarf} onChange={(e) => set({ scarf: (e.target as HTMLInputElement).checked })} />{$t(' 围巾')}</label>
        </div>
      </div>
      {Object.keys(need).length > 0 && <p class={'small ' + (short.length ? 'warn-line' : 'dim')}>{$t('染色要用：{0}', (Object.keys(need) as ItemId[]).map((d) => $t('{0}×{1}（有 {2}）', ITEMS[d].name, need[d], game.count(d))).join($t('、')))}</p>}
      <p class="dim small">{$t('下雨天出门，小人会自己穿上雨衣。')}</p>
      <div class="actions"><button class="btn" disabled={short.length > 0} onClick={done}>{first ? $t('就是我了') : $t('换好了')}</button></div>
    </Sheet>
  )
}
