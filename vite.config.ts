import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

const publicAssets = ['favicon.svg', 'icons.svg', 'manifest.webmanifest', 'pwa-192.svg', 'pwa-512.svg']

function offlineShell(): Plugin {
  return {
    name: 'jst-offline-shell',
    apply: 'build',
    async generateBundle(_, bundle) {
      const template = await readFile(new URL('./pwa/service-worker.js', import.meta.url), 'utf8')
      const indexHtml = await readFile(new URL('./index.html', import.meta.url))
      const buildFiles = Object.keys(bundle).toSorted()
      const hash = createHash('sha256')
      hash.update('index.html')
      hash.update(indexHtml)
      for (const file of buildFiles) {
        const output = bundle[file]
        hash.update(file)
        hash.update(output.type === 'chunk' ? output.code : output.source)
      }
      for (const file of publicAssets) {
        hash.update(file)
        hash.update(await readFile(new URL(`./public/${file}`, import.meta.url)))
      }
      hash.update(template)

      const precacheUrls = [
        '/index.html',
        ...buildFiles.flatMap((file) => file.includes('sqlite3-opfs-async-proxy')
          ? [`/${file}`, `/${file}?vfs=opfs`, `/${file}?vfs=opfs-wl`]
          : [`/${file}`]),
        ...publicAssets.map((file) => `/${file}`),
      ]
      const source = template
        .replace('__CACHE_NAME__', `jst-shell-${hash.digest('hex').slice(0, 12)}`)
        .replace('__PRECACHE_URLS__', JSON.stringify(precacheUrls))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: { headers },
  preview: { headers },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: { format: 'es' },
})
