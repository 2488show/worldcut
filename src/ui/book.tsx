// The journal and the island notebook: a window with a tab for each page (round 17: every panel
// in the game is a window of the island's computer, 云屿 95). Swipe, the arrows or ←/→ turn it.
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Doodle, type DoodleName } from './doodles'
import { $t } from '../i18n'

export type Page = { key: string; mark: DoodleName; title: string; body: () => ComponentChildren }

export function Book({ pages, onClose, kind = 'diary', start = 0, label }: { pages: Page[]; onClose: () => void; kind?: 'diary' | 'notebook'; start?: number; label: string }) {
  const [at, setAt] = useState(Math.min(start, pages.length - 1))
  const [dir, setDir] = useState(0)
  const [flip, setFlip] = useState(0)
  const down = useRef<number | null>(null)
  const go = (i: number) => {
    if (i < 0 || i >= pages.length || i === at) return
    setDir(i > at ? 1 : -1)
    setFlip((f) => f + 1)
    setAt(i)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(at + 1)
      else if (e.key === 'ArrowLeft') go(at - 1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  const p = pages[at]
  return (
    <div class="veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={'book ' + kind} role="dialog" aria-label={label}
        onPointerDown={(e) => { down.current = e.clientX }}
        onPointerUp={(e) => {
          if (down.current === null) return
          const dx = e.clientX - down.current
          down.current = null
          if (Math.abs(dx) > 60) go(at + (dx < 0 ? 1 : -1))
        }}>
        <div class="win-title">
          <b>{label}</b>
          <button class="book-x w95" aria-label={$t('合上')} onClick={onClose}>×</button>
        </div>
        <div class="book-marks" role="tablist">
          {pages.map((q, i) => (
            <button key={q.key} role="tab" aria-selected={i === at} class={'mark' + (i === at ? ' on' : '')} title={q.title} aria-label={q.title} onClick={() => go(i)}>
              <Doodle n={q.mark} size={16} />
            </button>
          ))}
        </div>
        <div class={'page' + (dir > 0 ? ' turn-on' : dir < 0 ? ' turn-back' : '')} key={flip}>
          <h2 class="page-title">{p.title}</h2>
          <div class="page-body">{p.body()}</div>
          <div class="page-foot">
            <button class="corner" disabled={at === 0} aria-label={$t('上一页')} onClick={() => go(at - 1)}>‹</button>
            <span>{at + 1} / {pages.length}</span>
            <button class="corner" disabled={at === pages.length - 1} aria-label={$t('下一页')} onClick={() => go(at + 1)}>›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
