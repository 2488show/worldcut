// One-off (round 23): the codemod that wrapped the Chinese in $t. Needs the old TypeScript API:
// npm i typescript@5 in a scratch folder, then node tools/i18n-wrap.cjs . [--write]. Kept for reference.
// One-off codemod: wrap every Chinese display string in the game in $t(...).
// usage: node wrap.js <project dir> [--write]
const ts = require('typescript')
const path = require('path')
const fs = require('fs')

const root = path.resolve(process.argv[2])
const WRITE = process.argv.includes('--write')
const CJK = /[　-〿一-鿿＀-￯]/
const FN = '$t'

const cfg = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => console.error(d) })
const files = cfg.fileNames.filter((f) => f.startsWith(path.join(root, 'src')) && !f.includes('/src/i18n/') && /\.tsx?$/.test(f))
const program = ts.createProgram(files, { ...cfg.options, noEmit: true })
const checker = program.getTypeChecker()

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + "'"
const problems = []
const stats = { lit: 0, tpl: 0, concat: 0, jsx: 0, attr: 0, files: 0 }

function stringish(node) {
  const ty = checker.getTypeAtLocation(node)
  const ok = (t) => (t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike)) !== 0
  if (ty.isUnion()) return ty.types.every(ok)
  return ok(ty)
}
function isFnCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === FN
}
function insideSkip(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (isFnCall(p)) return true
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === 'console') return true
    if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'RegExp') return true
    if (ts.isTypeNode(p)) return true
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
  }
  return false
}
function keyPosition(node) {
  const p = node.parent
  if (!p) return false
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p) || ts.isGetAccessor(p)) && p.name === node) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.InKeyword && p.left === node) return true
  if (ts.isLiteralTypeNode(p)) return true
  if (ts.isExpressionStatement(p)) return true
  if (ts.isTaggedTemplateExpression(p)) return true
  if (ts.isJsxAttribute(p)) return true // handled as an attribute
  return false
}
function checkBraces(s, where) {
  if (/\{\d/.test(s)) problems.push(where + ': text has {digit}: ' + s)
}

/** the JSX rules for text: lines trimmed, empty lines dropped, joined by a space */
function jsxEffective(raw) {
  const lines = raw.split(/\r\n|\n|\r/)
  if (lines.length === 1) return raw
  const out = []
  lines.forEach((ln, i) => {
    let s = ln
    if (i > 0) s = s.replace(/^[ \t]+/, '')
    if (i < lines.length - 1) s = s.replace(/[ \t]+$/, '')
    if (s) out.push(s)
  })
  return out.join(' ')
}

function textOf(node, sf) {
  const start = node.getStart(sf)
  const edits = []
  collect(node, sf, edits, true)
  let src = sf.text.slice(start, node.getEnd())
  edits.sort((a, b) => b.s - a.s)
  for (const e of edits) src = src.slice(0, e.s - start) + e.text + src.slice(e.e - start)
  return src
}

/** finds the outermost targets inside node (not node itself unless top is false) */
function collect(node, sf, edits, top) {
  if (!top) {
    const r = target(node, sf)
    if (r) {
      edits.push(r)
      return
    }
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    jsxRuns(node, sf, edits)
    // the opening tag (attributes) still needs a look
    if (ts.isJsxElement(node)) collect(node.openingElement, sf, edits, false)
    return
  }
  ts.forEachChild(node, (c) => collect(c, sf, edits, false))
}

function target(node, sf) {
  const where = sf.fileName.replace(root + '/', '') + ':' + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (!CJK.test(node.text) || keyPosition(node) || insideSkip(node)) return null
    checkBraces(node.text, where)
    stats.lit++
    return { s: node.getStart(sf), e: node.getEnd(), text: `${FN}(${q(node.text)})` }
  }
  if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
    if (!parts.some((p) => CJK.test(p)) || insideSkip(node) || keyPosition(node)) return null
    let fmt = node.head.text
    const args = []
    node.templateSpans.forEach((sp, i) => {
      fmt += `{${i}}` + sp.literal.text
      args.push(textOf(sp.expression, sf))
    })
    parts.forEach((p) => checkBraces(p, where))
    stats.tpl++
    return { s: node.getStart(sf), e: node.getEnd(), text: `${FN}(${q(fmt)}, ${args.join(', ')})` }
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && !(node.parent && ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken && node.parent.left === node)) {
    // the whole a + b + c chain, from its top
    const ops = []
    const flat = (n) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        flat(n.left)
        ops.push(n.right)
      } else ops.push(n)
    }
    flat(node)
    const lit = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
    if (!ops.some((o) => lit(o) && CJK.test(o.text)) || insideSkip(node)) return null
    if (!stringish(ops[0]) || !(checker.getTypeAtLocation(ops[0]).flags & ts.TypeFlags.StringLike || lit(ops[0]))) return null
    let fmt = ''
    const args = []
    for (const o of ops) {
      if (lit(o)) {
        checkBraces(o.text, where)
        fmt += o.text
      } else if (ts.isTemplateExpression(o)) {
        return null // mixed: let the parts be wrapped one by one
      } else {
        fmt += `{${args.length}}`
        args.push(textOf(o, sf))
      }
    }
    stats.concat++
    return { s: node.getStart(sf), e: node.getEnd(), text: `${FN}(${q(fmt)}${args.length ? ', ' + args.join(', ') : ''})` }
  }
  if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && CJK.test(node.initializer.text)) {
    checkBraces(node.initializer.text, where)
    stats.attr++
    return { s: node.initializer.getStart(sf), e: node.initializer.getEnd(), text: `{${FN}(${q(node.initializer.text)})}` }
  }
  return null
}

function jsxRuns(el, sf, edits) {
  const kids = el.children
  let run = []
  const flush = () => {
    if (run.length && run.some((c) => ts.isJsxText(c) && CJK.test(c.text))) {
      let fmt = ''
      const args = []
      for (const c of run) {
        if (ts.isJsxText(c)) {
          checkBraces(c.text, sf.fileName + ' jsx')
          fmt += jsxEffective(c.text)
        } else if (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression)) fmt += c.expression.text
        else {
          fmt += `{${args.length}}`
          args.push(textOf(c.expression, sf))
        }
      }
      // whitespace JSX drops anyway stays outside, for the layout
      const first = run[0]
      const last = run[run.length - 1]
      let lead = ''
      let trail = ''
      if (ts.isJsxText(first)) {
        const m = first.text.match(/^\s*\n\s*/)
        if (m) lead = m[0]
      }
      if (ts.isJsxText(last)) {
        const m = last.text.match(/\s*\n\s*$/)
        if (m) trail = m[0]
      }
      stats.jsx++
      edits.push({ s: first.pos, e: last.end, text: `${lead}{${FN}(${q(fmt)}${args.length ? ', ' + args.join(', ') : ''})}${trail}` })
    } else {
      // no Chinese text in this run: its expressions may still hold some
      for (const c of run) if (!ts.isJsxText(c)) collect(c, sf, edits, false)
    }
    run = []
  }
  for (const c of kids) {
    if (ts.isJsxText(c)) run.push(c)
    else if (ts.isJsxExpression(c) && c.expression && !c.dotDotDotToken && stringish(c.expression) && !containsJsx(c.expression)) run.push(c)
    else {
      flush()
      collect(c, sf, edits, false)
    }
  }
  flush()
}
function containsJsx(n) {
  let found = false
  const v = (x) => {
    if (found) return
    if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) found = true
    else ts.forEachChild(x, v)
  }
  v(n)
  return found
}

function importFor(file) {
  let rel = path.relative(path.dirname(file), path.join(root, 'src/i18n')).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = './' + rel
  return `import { ${FN} } from '${rel}'\n`
}

for (const f of files) {
  const sf = program.getSourceFile(f)
  const out = textOf(sf, sf)
  const lead = sf.text.slice(0, sf.getStart(sf))
  let full = lead + out
  if (full === sf.text) continue
  stats.files++
  if (!/import \{[^}]*\$t[^}]*\} from/.test(full)) {
    // after the last import, or at the top after the leading comments
    const imps = sf.statements.filter((s) => ts.isImportDeclaration(s))
    if (imps.length) {
      const endImp = imps[imps.length - 1].getEnd()
      // positions shift with the edits: find the import text in the new file instead
      const lastImpText = sf.text.slice(imps[imps.length - 1].getStart(sf), endImp)
      const at = full.indexOf(lastImpText)
      if (at < 0) problems.push(f + ': could not place the import')
      else full = full.slice(0, at + lastImpText.length) + '\n' + importFor(f).trimEnd() + full.slice(at + lastImpText.length)
    } else {
      full = lead + importFor(f) + out
    }
  }
  if (WRITE) fs.writeFileSync(f, full)
}
console.log(stats)
if (problems.length) console.log('PROBLEMS\n' + problems.join('\n'))
