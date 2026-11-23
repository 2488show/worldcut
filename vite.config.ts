import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The build is one self-contained index.html (script and styles inlined), so it can be opened
// from disk, dropped on any static host, or wrapped as a mobile app without a server.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  server: { host: true },
})
