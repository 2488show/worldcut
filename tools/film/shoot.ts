// npx tsx tools/film/shoot.ts <shot or prefix*>[,…] [16x9|9x16|1x1]
import { SHOTS, shoot } from './shots'
import { Fmt } from './rig'
const want = (process.argv[2] ?? '').split(',').filter(Boolean)
const fmt = (process.argv[3] ?? '16x9') as Fmt
const names = want.flatMap((w) => (w.endsWith('*') ? Object.keys(SHOTS).filter((n) => n.startsWith(w.slice(0, -1))) : [w]))
if (!names.length) { console.log(Object.keys(SHOTS).join('\n')); process.exit(0) }
shoot(names, fmt).then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
