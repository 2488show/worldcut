// The seasons. A game year is four weeks of game days (seven days a season, about two and a half
// hours of play each), starting in spring. What they change:
//   - the weather: snow only in winter; spring is wet, summer clear with thunderstorms, autumn foggy;
//   - the colours: oaks, birches and bushes turn gold and rust through autumn, the grass yellows;
//     in winter both go dull (and the snow lies when it snows);
//   - the creatures: no butterflies, dragonflies or fireflies in winter;
//   - the stock market's morning news (the fishing season, firewood, winter spices).
// The changes of colour come on over the first two days of a season, so nothing jumps.

import type { WeatherKind } from './weather'
import { $t } from '../i18n'

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter'
export const SEASONS: SeasonId[] = ['spring', 'summer', 'autumn', 'winter']
export const SEASON_NAME: Record<SeasonId, string> = { spring: $t('春'), summer: $t('夏'), autumn: $t('秋'), winter: $t('冬') }
export const SEASON_DAYS = 7
/** the chance of each kind of day, by season (in the order clear, rain, storm, snow, fog) */
const WEIGHTS: Record<SeasonId, [number, number, number, number, number]> = {
  spring: [40, 32, 5, 0, 23],
  summer: [55, 18, 14, 0, 13],
  autumn: [38, 25, 7, 0, 30],
  winter: [36, 8, 2, 40, 14],
}
const KINDS: WeatherKind[] = ['clear', 'rain', 'storm', 'snow', 'fog']

export interface Season { id: SeasonId; name: string; day: number; autumn: number; winter: number }

export function seasonIdOn(day: number): SeasonId {
  return SEASONS[Math.floor(Math.max(0, day) / SEASON_DAYS) % 4]
}
/** the weather for a roll of 0–1 on a day */
export function weatherFor(day: number, r: number): WeatherKind {
  const w = WEIGHTS[seasonIdOn(day)]
  const total = w.reduce((a, b) => a + b, 0)
  let x = r * total
  for (let i = 0; i < 5; i++) { x -= w[i]; if (x < 0) return KINDS[i] }
  return 'clear'
}
const smooth = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k) }
/** the season at a moment (t = days since the start, with the fraction of today) */
export function seasonAt(t: number): Season {
  const day = Math.floor(t)
  const id = seasonIdOn(day)
  const into = t - Math.floor(Math.max(0, t) / SEASON_DAYS) * SEASON_DAYS // days into this season
  let autumn = 0, winter = 0
  if (id === 'autumn') autumn = smooth(into / 2)
  if (id === 'winter') { winter = smooth(into / 2); autumn = 1 - smooth(into / 1.5) }
  if (id === 'spring' && t >= SEASON_DAYS * 4) winter = 1 - smooth(into / 2)
  return { id, name: SEASON_NAME[id], day: Math.floor(into) + 1, autumn, winter }
}
