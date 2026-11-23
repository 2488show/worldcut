import { render } from 'preact'
import { Game, migrate, type Save } from './game/game'
import { Online, pickSave, type Cloud } from './game/online'
import { connect } from './ui/cloud'
import { App } from './ui/App'
import './ui/styles.css'
import { $t, LANG } from './i18n'

document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en'
document.title = $t('云岭航行')

const KEY = 'skyisle-save-v2' // (the key keeps its name; saves from the second slice are brought up to date on loading)

function load(): Save | null {
  try {
    const raw = localStorage.getItem(KEY)
    return migrate(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}
function persist(s: Save) {
  s.at = Math.round(Date.now() / 1000)
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* private mode, or the quota: the game still plays, it just does not remember */ }
}

let game: Game | null = null
let cloud: Cloud | null = null

/** starts the game from a save (the one on this device unless another is given), or (fresh) from nothing */
function start(fresh = false, save: Save | null = fresh ? null : load()) {
  const root = document.getElementById('app')!
  render(null, root) // takes the old stage down, if there is one
  root.textContent = ''
  if (fresh) {
    try {
      localStorage.removeItem(KEY)
    } catch { /* nothing to clear */ }
  }
  game = new Game({ save, persist, params: { flameStyle: 'realistic' } })
  // a handle for the browser console and the end-to-end test
  ;(window as unknown as { __game: Game }).__game = game
  if (cloud) attach(game, cloud, fresh)
  render(<App game={game} onReset={() => start(true)} skipTitle={fresh} />, root)
}
/** other players, and the copy of the save in the cloud */
function attach(g: Game, c: Cloud, fresh: boolean) {
  const on = new Online(g, c)
  // a brand-new game replaces the cloud copy too, straight away
  if (fresh) void on.backup(Date.now() / 1000, true)
}

window.addEventListener('pagehide', () => {
  if (!game) return
  persist(game.save)
  void game.online?.backup(Date.now() / 1000, true)
})

async function boot() {
  // other players and the cloud save, if this page has them: a short wait, then the game starts either way
  const first = connect(2500)
  cloud = await first
  let save = load()
  if (cloud) save = await Promise.race([pickSave(cloud, save, migrate), new Promise<Save | null>((r) => setTimeout(() => r(save), 3000))])
  start(false, save)
  if (!cloud) {
    // the store may answer late (a slow connection): players join the running game when it does
    const late = await connect(12000)
    if (late && game && !game.online) {
      cloud = late
      attach(game, late, false)
      game.changed()
    }
  }
}
// let the "generating…" line paint before the world is built (it takes a moment on a phone)
requestAnimationFrame(() => setTimeout(() => void boot(), 0))
