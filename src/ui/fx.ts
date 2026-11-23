// The feedback the game asks for, played on the screen: sounds, things flying into the bag,
// coins into the purse, banners and the big ceremonies. One layer of DOM over the canvas.

import type { Fx, Game } from '../game/game'
import { iconUrl } from '../game/icons'
import type { GameAudio } from './audio'

export interface FxLayer {
  handle(e: Fx): void
  /** once a frame: the coin counter rolls towards the real number */
  tick(): void
  destroy(): void
}

const CONFETTI = ['#e8603c', '#54b2be', '#fad25a', '#9cda58', '#f49696', '#ffffff']

export function createFxLayer(root: HTMLElement, game: Game, audio: GameAudio, scale: () => number): FxLayer {
  const box = document.createElement('div')
  box.className = 'fx'
  root.appendChild(box)
  let shownCoins = game.save.coins
  let banner: HTMLElement | null = null
  let bannerT = 0
  let ceremony: HTMLElement | null = null
  let ceremonyT = 0
  const can = typeof box.animate === 'function'

  function centreOf(sel: string): { x: number; y: number; el: HTMLElement } | null {
    const el = root.querySelector<HTMLElement>(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const o = root.getBoundingClientRect()
    if (r.width === 0) return null
    return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2, el }
  }
  function bump(el: HTMLElement) {
    el.classList.remove('bump')
    void el.offsetWidth // restart the animation
    el.classList.add('bump')
  }

  /** icons pop out of a spot in the world, hang for a moment, then fly to where they belong */
  function fly(e: Extract<Fx, { t: 'fly' }>) {
    const coins = e.to === 'coins'
    const target = (!coins && centreOf(`[data-item="${e.icon}"]`)) || centreOf(coins ? '[data-fx="coins"]' : '[data-fx="bag"]')
    const p = game.scene.projectPoint(e.x, e.y, e.z ?? 0)
    // under water (or anywhere off the island's picture) there is no point to fly from: use the middle
    const from = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
    const s = scale()
    const w = root.clientWidth
    const h = root.clientHeight
    const x0 = from ? Math.max(20, Math.min(w - 20, from.x * s)) : w / 2
    const y0 = from ? Math.max(20, Math.min(h - 20, from.y * s)) : h / 2
    const n = Math.min(coins ? 10 : 6, Math.max(1, e.n))
    if (!can || !target) {
      audio.play(coins ? 'coin' : 'collect')
      if (target) bump(target.el)
      return
    }
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i')
      el.className = 'icon fly'
      el.style.backgroundImage = `url(${iconUrl(e.icon as never)})`
      box.appendChild(el)
      // pop: up and out in a little arc, with a bounce
      const a = (i / n) * Math.PI * 2 + Math.random()
      const r = 16 + Math.random() * 26
      const px = x0 + Math.cos(a) * r
      const py = y0 + Math.sin(a) * r * 0.6 - 18
      const at = (x: number, y: number, k: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${k})`
      const anim = el.animate(
        [
          { transform: at(x0, y0, 0.3), offset: 0, easing: 'cubic-bezier(.2,1.6,.5,1)' },
          { transform: at(px, py, 1.5), offset: 0.26, easing: 'ease-out' },
          { transform: at(px, py + 7, 1.25), offset: 0.42, easing: 'cubic-bezier(.6,-0.3,.9,.5)' },
          { transform: at(target.x, target.y, 0.7), offset: 1 },
        ],
        { duration: 720 + i * 70, delay: i * 55, fill: 'both' },
      )
      anim.onfinish = () => {
        el.remove()
        audio.play(coins ? 'coin' : 'collect')
        bump(target.el)
      }
      audio.play('pop', 0.9 + i * 0.08, 0.5)
    }
  }

  function showBanner(e: Extract<Fx, { t: 'celebrate' }>) {
    banner?.remove()
    const el = document.createElement('div')
    el.className = 'fx-banner'
    if (e.icon) {
      const i = document.createElement('i')
      i.className = 'icon'
      i.style.backgroundImage = `url(${iconUrl(e.icon as never)})`
      el.appendChild(i)
    }
    const b = document.createElement('b')
    b.textContent = e.title
    el.appendChild(b)
    if (e.sub) {
      const sp = document.createElement('span')
      sp.textContent = e.sub
      el.appendChild(sp)
    }
    box.appendChild(el)
    banner = el
    bannerT = performance.now() + 2600
    audio.play('quest')
    const q = centreOf('[data-fx="quest"]')
    if (q) bump(q.el)
  }

  /** a milestone: the screen flashes, rays turn behind the words, confetti falls, the fanfare plays */
  function showCeremony(e: Extract<Fx, { t: 'celebrate' }>) {
    ceremony?.remove()
    const el = document.createElement('div')
    el.className = 'fx-ceremony'
    el.innerHTML = '<div class="fx-flash"></div><div class="fx-rays"></div>'
    const card = document.createElement('div')
    card.className = 'fx-card'
    if (e.icon) {
      const i = document.createElement('i')
      i.className = 'icon'
      i.style.backgroundImage = `url(${iconUrl(e.icon as never)})`
      card.appendChild(i)
    }
    const h = document.createElement('h1')
    h.textContent = e.title
    card.appendChild(h)
    if (e.sub) {
      const p = document.createElement('p')
      p.textContent = e.sub
      card.appendChild(p)
    }
    el.appendChild(card)
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('i')
      c.className = 'fx-confetti'
      c.style.left = `${Math.random() * 100}%`
      c.style.background = CONFETTI[i % CONFETTI.length]
      c.style.animationDelay = `${Math.random() * 0.9}s`
      c.style.animationDuration = `${1.6 + Math.random() * 1.4}s`
      c.style.setProperty('--sway', `${(Math.random() - 0.5) * 120}px`)
      el.appendChild(c)
    }
    el.addEventListener('pointerdown', () => {
      if (performance.now() > ceremonyT - 2600) ceremonyT = 0 // not in the first half second
    })
    box.appendChild(el)
    ceremony = el
    ceremonyT = performance.now() + 3200
    audio.play('bigfanfare')
  }

  return {
    handle(e) {
      switch (e.t) {
        case 'sfx': audio.play(e.name, e.pitch, e.vol); break
        case 'say': audio.babble(e.text, e.voice); break
        case 'rumble': try { navigator.vibrate?.(e.ms) } catch { /* not here */ } break
        case 'fly': fly(e); break
        case 'celebrate': if (e.level === 2) showCeremony(e); else showBanner(e); break
        case 'toast': break
      }
    },
    tick() {
      const now = performance.now()
      if (banner && now > bannerT) {
        const b = banner
        banner = null
        b.classList.add('out')
        setTimeout(() => b.remove(), 400)
      }
      if (ceremony && now > ceremonyT) {
        const c = ceremony
        ceremony = null
        c.classList.add('out')
        setTimeout(() => c.remove(), 500)
      }
      const real = game.save.coins
      if (shownCoins !== real) {
        const d = real - shownCoins
        shownCoins += Math.abs(d) < 2 ? d : Math.round(d * 0.18) || Math.sign(d)
      }
      const el = root.querySelector<HTMLElement>('[data-fx="coins"] b')
      if (el && el.textContent !== String(shownCoins)) el.textContent = String(shownCoins)
    },
    destroy() {
      box.remove()
    },
  }
}
