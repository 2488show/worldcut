// npm run i18n: brings src/i18n/en.ts up to date with the code.
// Every $t('…') in src is a key: new keys are added (empty, untranslated), keys the code no longer has are
// dropped, translations already made are kept. Keys are grouped by the file they first appear in.
// npm run i18n -- --check: fails (exit 1) if a key has no English, for before a release.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import EN from '../src/i18n/en'

const root = join(import.meta.dirname, '..')
const src = join(root, 'src')
const OUT = join(src, 'i18n', 'en.ts')

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) {
      if (n !== 'i18n' && n !== 'fonts') walk(p, out)
    } else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}

const unq = (s: string) => s.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[c] ?? c)
const q = (s: string) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"

// Chinese the code shows but never passed through $t (comments and regular expressions aside): the English
// game would show it as it is
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/
const bare: string[] = []
const OK_BARE = ['语言 · Language'] // shown the same in both languages on purpose
for (const f of walk(src)) {
  let inBlock = false
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    let l = line
    if (inBlock) {
      if (!l.includes('*/')) return
      l = l.slice(l.indexOf('*/') + 2)
      inBlock = false
    }
    l = l.replace(/\/\*.*?\*\//g, '')
    if (l.includes('/*')) {
      l = l.slice(0, l.indexOf('/*'))
      inBlock = true
    }
    l = l.replace(/\$t\(\s*'(?:[^'\\]|\\.)*'/g, '').replace(/\/\/.*$/, '').replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '')
    for (const ok of OK_BARE) l = l.replace(ok, '')
    if (CJK.test(l)) bare.push(`${relative(root, f)}:${i + 1}  ${line.trim().slice(0, 100)}`)
  })
}

const byFile = new Map<string, string[]>()
const seen = new Set<string>()
for (const f of walk(src)) {
  const text = readFileSync(f, 'utf8')
  const keys: string[] = []
  for (const m of text.matchAll(/\$t\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    const k = unq(m[1])
    if (seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  if (keys.length) byFile.set(relative(root, f), keys)
}

let done = 0
let lines = ''
for (const [file, keys] of byFile) {
  lines += `  // ${file}\n`
  for (const k of keys) {
    const v = EN[k] ?? ''
    if (v) done++
    lines += `  ${q(k)}: ${q(v)},\n`
  }
}
const dropped = Object.keys(EN).filter((k) => !seen.has(k))
writeFileSync(OUT, `// English lines, keyed by the Chinese. Kept up to date by \`npm run i18n\` (new keys are added empty, keys no
// longer in the code are dropped). An empty line means "not translated yet": the game shows the Chinese.
const EN: Record<string, string> = {
${lines}}
export default EN
`)
const total = seen.size
console.log(`${total} lines · ${done} in English · ${total - done} still Chinese only${dropped.length ? ` · dropped ${dropped.length} no longer used` : ''}`)
if (bare.length) console.log(`Chinese not in $t (the English game shows it as it is):\n  ${bare.join('\n  ')}`)
if (process.argv.includes('--check') && (done < total || bare.length)) process.exit(1)
