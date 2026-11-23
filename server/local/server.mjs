#!/usr/bin/env node
/**
 * OneStep 本地运行服务。
 *
 * - 托管 `dist/` 中的前端产物，并为 SPA 路由回退到 index.html；
 * - 把 `/api` 反向代理到 AIPing 官方接口（支持 SSE 流式透传）；
 * - 兼容旧的图片 / 3D 资源代理；
 * - 只监听 127.0.0.1，默认自动打开浏览器。
 *
 * 用法：
 *   node server/local/server.mjs
 *   node server/local/server.mjs --port 5800 --no-open
 */

import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const distDir = path.join(rootDir, 'dist')

const args = process.argv.slice(2)
const noOpen = args.includes('--no-open')
const portFlagIndex = args.indexOf('--port')
const requestedPort = Number(
  portFlagIndex >= 0 ? args[portFlagIndex + 1] : process.env.PORT || process.env.ONESTEP_PORT || 5500,
)
const host = process.env.ONESTEP_HOST || '127.0.0.1'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.bvh': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.ply': 'application/octet-stream',
  '.wasm': 'application/wasm',
}

function createProxy(prefix, targetBase, stripPrefix = false) {
  const target = new URL(targetBase)
  const transport = target.protocol === 'http:' ? http : https
  const port = target.port || (target.protocol === 'http:' ? 80 : 443)

  return (req, res) => {
    let upstreamPath = req.url || '/'
    if (stripPrefix) {
      upstreamPath = upstreamPath.slice(prefix.length) || '/'
    }

    const headers = { ...req.headers, host: target.host }
    delete headers.connection
    delete headers.origin
    delete headers.referer

    const proxyReq = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port,
        method: req.method,
        path: upstreamPath,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
        proxyRes.pipe(res)
      },
    )

    proxyReq.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      res.end(
        JSON.stringify({
          error: { message: `本地代理连接失败：${error.message}` },
        }),
      )
    })

    req.on('aborted', () => proxyReq.destroy())
    req.pipe(proxyReq)
  }
}

const proxies = [
  { prefix: '/api', handler: createProxy('/api', process.env.AIPING_TARGET || 'https://aiping.cn') },
  {
    prefix: '/v2fun-assets',
    handler: createProxy('/v2fun-assets', 'https://oss-cn-1.v2fun.art', true),
  },
  {
    prefix: '/ai-image-assets',
    handler: createProxy(
      '/ai-image-assets',
      'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com',
      true,
    ),
  },
]

function sendFile(res, filePath, statusCode = 200) {
  const extension = path.extname(filePath).toLowerCase()
  const stat = fs.statSync(filePath)
  const isHtml = extension === '.html'

  res.writeHead(statusCode, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })

  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const requestUrl = req.url || '/'

  for (const proxy of proxies) {
    if (requestUrl === proxy.prefix || requestUrl.startsWith(`${proxy.prefix}/`)) {
      proxy.handler(req, res)
      return
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Method Not Allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Bad Request')
    return
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.join(distDir, safePath)

  // 防止目录穿越。
  if (!candidate.startsWith(distDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    if (req.method === 'HEAD') {
      const stat = fs.statSync(candidate)
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(candidate).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
      })
      res.end()
      return
    }
    sendFile(res, candidate)
    return
  }

  const indexPath = path.join(distDir, 'index.html')
  if (fs.existsSync(indexPath)) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end()
      return
    }
    sendFile(res, indexPath)
    return
  }

  res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><html><body style="font-family:system-ui;padding:40px;color:#1d1d1b">
      <h1>还没有构建前端</h1>
      <p>请先在项目目录运行 <code>npm run build</code>，再启动本地服务。</p>
    </body></html>`,
  )
})

function openBrowser(url) {
  if (noOpen) return
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`
  exec(command, () => {
    // 打开浏览器失败时不影响服务本身。
  })
}

function listen(port, remainingAttempts = 20) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && remainingAttempts > 0) {
      listen(port + 1, remainingAttempts - 1)
      return
    }
    console.error(`OneStep 本地服务启动失败：${error.message}`)
    process.exit(1)
  })

  server.listen(port, host, () => {
    const url = `http://${host}:${port}`
    console.log('')
    console.log('  OneStep · 本地 AI 创作助手')
    console.log(`  已启动：${url}`)
    console.log('  按 Ctrl+C 停止服务')
    console.log('')
    openBrowser(url)
  })
}

if (!fs.existsSync(distDir)) {
  console.warn('提示：dist 目录不存在，页面会提示先运行 npm run build。')
}

listen(Number.isFinite(requestedPort) ? requestedPort : 5500)

function shutdown() {
  console.log('\n正在停止 OneStep 本地服务…')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
