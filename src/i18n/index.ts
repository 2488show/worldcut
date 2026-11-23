// Languages (round 23). The Chinese line is the key: $t('还差 {0} 个', n) gives the Chinese back as it is,
// or the English line for it from en.ts. A line with no English yet falls back to the Chinese, so a missing
// translation never breaks the game, it only shows up in `npm run i18n`.
//
// The language is fixed when the page loads (every table and name is built once, at start-up); changing it
// in the settings saves the choice and reloads the page.
import EN from './en'

export type Lang = 'zh' | 'en'
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'zh', name: '中文' },
  { id: 'en', name: 'English' },
]
const KEY = 'skyisle-lang'

function detect(): Lang {
  try {
    // ?lang=en in the address wins (screenshots, the promo footage), then the player's choice, then the browser
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'zh' || q === 'en') return q
    const saved = localStorage.getItem(KEY)
    if (saved === 'zh' || saved === 'en') return saved
    return /^zh/i.test(navigator.language) ? 'zh' : 'en'
  } catch {
    return 'zh' // no browser (the tests): Chinese, the source language
  }
}

export let LANG: Lang = detect()
let dict: Record<string, string> = LANG === 'en' ? EN : {}

/** for the tests: switch without a reload (tables already built stay in the language they were built in) */
export function useLang(l: Lang) {
  LANG = l
  dict = l === 'en' ? EN : {}
}

/** the player's choice: kept, and the page reloads in it */
export function chooseLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch { /* private mode: it lasts this load */ }
  if (l !== LANG) location.reload()
}

/**
 * The line in the current language. {0}, {1}… are the arguments in order (the English may put them anywhere).
 * {0|plank|planks} picks by the number: the first word for 1, the second otherwise.
 */
export function $t(zh: string, ...args: unknown[]): string {
  const line = dict[zh] || zh
  if (!args.length && line.indexOf('{') < 0) return line
  return line.replace(/\{(\d+)(?:\|([^|}]*)\|([^}]*))?\}/g, (m, i: string, one?: string, many?: string) => {
    const k = Number(i)
    if (k >= args.length) return m
    const v = args[k]
    if (one !== undefined) return Number(v) === 1 ? one : many!
    return String(v)
  })
}

/** list joiner: 、 in Chinese, a comma in English */
export const SEP = (): string => (LANG === 'en' ? ', ' : '、')
