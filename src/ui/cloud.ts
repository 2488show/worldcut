// The shared store, as the page is given it. When the game runs as a published Claude artifact
// with the `db` and `user` capabilities declared, `window.claude.use()` hands over a document
// store that everyone who opens the page shares. Anywhere else (a local file, a dev server)
// there is no such thing and the game is single-player. Nothing here may throw at start-up.

import type { Cloud } from '../game/online'

type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
type DocRef = {
  get(): Promise<Snap>
  set(d: Record<string, unknown>): Promise<void>
  update(d: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
  acquire(o: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean }>
}
type Db = { doc(path: string): DocRef; collection(path: string): { limit(n: number): { get(): Promise<{ docs: Snap[] }> } } }
type User = { id(): Promise<string | null>; can(name: string): Promise<boolean | null> }

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** the store, or null when there is none (or it does not answer in time) */
export async function connect(ms: number): Promise<Cloud | null> {
  try {
    const c = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude
    if (!c || typeof c.use !== 'function') return null
    const [db, user] = (await Promise.all([within(c.use('db'), ms), within(c.use('user'), ms)])) as [Db | null, User | null]
    if (!db || !user) return null
    const uid = await within(user.id(), ms)
    if (!uid) return null
    const may = await within(user.can('data.write'), ms)
    // writes to one document go one at a time; a transient failure is tried once more
    const chain = new Map<string, Promise<unknown>>()
    const write = <T,>(path: string, fn: () => Promise<T>): Promise<T> => {
      const run = async () => {
        try {
          return await fn()
        } catch (e) {
          if ((e as { code?: string } | null)?.code !== 'unavailable') throw e
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 600))
          return fn()
        }
      }
      const next = (chain.get(path) ?? Promise.resolve()).then(run, run)
      chain.set(path, next.catch(() => undefined))
      return next
    }
    return {
      uid,
      canWrite: may !== false,
      async get(path) {
        const s = await db.doc(path).get()
        const d = s.exists ? s.data() : undefined
        return d ? clone(d) : null
      },
      set: (path, data) => write(path, () => db.doc(path).set(data)),
      update: (path, data) => write(path, () => db.doc(path).update(data)),
      remove: (path) => write(path, () => db.doc(path).delete()),
      async list(col) {
        const q = await db.collection(col).limit(300).get()
        return q.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: clone(d.data() ?? {}) }))
      },
      async lock(path, ttlMs) {
        const r = await db.doc(path).acquire({ holder: uid, ttlMs })
        return !!r.acquired
      },
    }
  } catch {
    return null
  }
}
