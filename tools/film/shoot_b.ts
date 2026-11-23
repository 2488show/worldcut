// npx tsx tools/film/shoot_b.ts <shot or prefix*>[,…] [16x9|9x16|1x1]      (FILM_STILLS=1: three stills a shot instead of footage)
import './tall'
import { SHOTS_B, shootB } from './shots_b'
import { Fmt } from './rig'
const want = (process.argv[2] ?? '').split(',').filter(Boolean)
const fmt = (process.argv[3] ?? '16x9') as Fmt
const names = want.flatMap((w) => (w.endsWith('*') ? Object.keys(SHOTS_B).filter((n) => n.startsWith(w.slice(0, -1))) : [w]))
if (!names.length) { console.log(Object.keys(SHOTS_B).join('\n')); process.exit(0) }
shootB(names, fmt).then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
