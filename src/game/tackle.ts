// The tackle box (round 13): what is on the hook. Live bait (worms, shrimp, dough, squid) is
// taken by the fish that bites; a lure is kept. What is on the hook decides which fish come and
// how soon — the fishing itself, the strike and the reel, is the same as ever.
import type { Game } from './game'
import { ITEMS, ROD_FISH, type ItemId } from './data'
import { $t } from '../i18n'

export interface BaitDef {
  /** live bait is used up (one a bite); a lure lasts */
  live: boolean
  /** how much more (or less) each fish likes it than a bare hook */
  likes: Partial<Record<ItemId, number>>
  /** how soon something bites (× the usual wait) */
  quick: number
  /** only at night does it do what it says (the glowing lure) */
  night?: boolean
}
export const BAITS: Partial<Record<ItemId, BaitDef>> = {
  worm: { live: true, likes: { sardine: 1.3, bream: 1.3, mackerel: 1.2, tuna: 1.1, moonfish: 1 }, quick: 0.65 },
  shrimp: { live: true, likes: { bream: 3, mackerel: 1.6, sardine: 0.6 }, quick: 0.75 },
  breadBait: { live: true, likes: { sardine: 3, bream: 0.8, mackerel: 0.5, tuna: 0.3 }, quick: 0.7 },
  squidBait: { live: true, likes: { tuna: 3.5, moonfish: 2, bream: 0.6, sardine: 0.3 }, quick: 0.9 },
  spinner: { live: false, likes: { mackerel: 3, tuna: 1.4, sardine: 0.6 }, quick: 1 },
  softLure: { live: false, likes: { bream: 2.2, sardine: 1.4 }, quick: 0.95 },
  glowLure: { live: false, likes: { moonfish: 4, tuna: 1.6 }, quick: 1, night: true },
}
export const BAIT_ORDER = Object.keys(BAITS) as ItemId[]
export const LIVE_BAIT = BAIT_ORDER.filter((b) => BAITS[b]!.live)
export const LURES = BAIT_ORDER.filter((b) => !BAITS[b]!.live)
/** the fish a bait is good for (liked more than a bare hook), best first */
export const goodFor = (b: ItemId): ItemId[] =>
  ROD_FISH.map((f) => f.item).filter((f) => (BAITS[b]?.likes[f] ?? 1) > 1.05).sort((p, q) => (BAITS[b]!.likes[q] ?? 1) - (BAITS[b]!.likes[p] ?? 1))

export class Tackle {
  constructor(private g: Game) {}
  /** what is on the hook (null: a bare hook). Used up or sold, it is off the hook */
  get on(): ItemId | null {
    const b = this.g.save.bait
    if (!b || !BAITS[b]) return null
    if (this.g.count(b) <= 0) return null
    return b
  }
  /** put this on the hook (or take it off again) */
  use(b: ItemId | null) {
    const g = this.g
    if (b && (!BAITS[b] || g.count(b) <= 0)) return
    g.save.bait = b ?? undefined
    g.sfx('tap', b ? 1.3 : 0.9)
    g.changed()
  }
  /** how much the fish on the hook's line likes it: the weight a fish is picked with is × this */
  like(fish: ItemId): number {
    const b = this.on
    if (!b) return 1
    const d = BAITS[b]!
    if (d.night && this.g.dayPhase() !== 'night') return 1
    return d.likes[fish] ?? 1
  }
  /** how soon a bite comes (× the usual wait) */
  get quick(): number {
    const b = this.on
    return b ? BAITS[b]!.quick : 1
  }
  /** a fish took it: live bait is gone (and when the last one goes, it is said) */
  taken() {
    const g = this.g
    const b = this.on
    if (!b || !BAITS[b]!.live) return
    g.spend({ [b]: 1 })
    if (g.count(b) <= 0) {
      g.toast($t('{0}用完了', ITEMS[b].name))
      g.save.bait = undefined
    }
  }
}
