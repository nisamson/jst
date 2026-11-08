import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const distPath = resolve(process.cwd(), 'dist')
let serveUpdatedWorker = false

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname === '/__test/update' && request.method === 'POST') {
    serveUpdatedWorker = true
    response.writeHead(204).end()
    return
  }
  if (pathname === '/__test/health') {
    response.writeHead(200).end('ok')
    return
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  let filePath = resolve(distPath, relativePath)
  if (!filePath.startsWith(`${distPath}${sep}`) && filePath !== distPath) {
    response.writeHead(400).end()
    return
  }
  try {
    let content = await readFile(filePath)
    if (pathname === '/sw.js' && serveUpdatedWorker) {
      content = Buffer.from(content.toString()
        .replace(/const CACHE_NAME = 'jst-shell-[^']+'/u, "const CACHE_NAME = 'jst-shell-update-test'") + '\n// updated')
    }
    const extension = filePath.split('.').at(-1)
    const contentTypes = {
      css: 'text/css',
      html: 'text/html',
      js: 'text/javascript',
      svg: 'image/svg+xml',
      wasm: 'application/wasm',
      webmanifest: 'application/manifest+json',
    }
    response.writeHead(200, {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
    }).end(content)
  } catch {
    filePath = resolve(distPath, 'index.html')
    response.writeHead(200, {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Type': 'text/html',
    }).end(await readFile(filePath))
  }
})

server.listen(4178, '127.0.0.1')
