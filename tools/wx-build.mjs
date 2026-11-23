// Builds the WeChat mini game (round 25): one bundle, the pixel font, game.js and game.json.
//   node tools/wx-build.mjs [out-dir]        (default dist-wx; copy the result into the mini game project)
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
const out = process.argv[2] ?? 'dist-wx'
fs.mkdirSync(path.join(out, 'js'), { recursive: true })
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true })
await build({
  entryPoints: ['src/wx/main.ts'], bundle: true, format: 'iife', target: 'es2017', platform: 'browser',
  outfile: path.join(out, 'js/worldcut.js'), minify: true, legalComments: 'none', logLevel: 'warning',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
})
fs.writeFileSync(path.join(out, 'game.js'), "require('./js/worldcut.js')\n")
fs.writeFileSync(path.join(out, 'game.json'), JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false }, null, 2) + '\n')
console.log('built', out, (fs.statSync(path.join(out, 'js/worldcut.js')).size / 1024).toFixed(0), 'KB')
