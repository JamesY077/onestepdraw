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
import { buildCustomAgent, buildRunPrompt, detectAgents, getInstalledAgent, runAgent } from './agents.mjs'

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
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.pdf': 'application/pdf',
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

function readJsonBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求内容过大。'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('请求内容不是合法 JSON。'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function currentBaseUrl() {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : startPort
  return `http://${host}:${port}`
}

async function handleAgents(req, res, requestUrl) {
  const refresh = new URL(requestUrl, 'http://localhost').searchParams.get('refresh') === '1'
  try {
    const agents = await detectAgents({ refresh })
    sendJson(res, 200, {
      agents,
      rootDir,
      platform: process.platform,
      scannedAt: new Date().toISOString(),
    })
  } catch (error) {
    sendJson(res, 500, { error: { message: error?.message || '扫描本机 Agent 失败。' } })
  }
}

/** 保存用户上传的参考素材到 generated/uploads，返回可直接访问的地址。 */
function handleUpload(req, res) {
  const rawName = typeof req.headers['x-file-name'] === 'string' ? req.headers['x-file-name'] : ''
  let fileName = ''
  try {
    fileName = decodeURIComponent(rawName)
  } catch {
    fileName = rawName
  }
  fileName = path.basename(fileName || `upload-${Date.now()}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  if (!fileName || fileName === '.' || fileName === '..') fileName = `upload-${Date.now()}`

  const contentType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim()
  let extension = path.extname(fileName).toLowerCase()
  if (!extension) {
    const guessed = Object.entries(MIME_TYPES).find(([, mime]) => mime.split(';')[0] === contentType)
    extension = guessed ? guessed[0] : ''
    if (extension) fileName = `${fileName}${extension}`
  }

  const uploadDir = path.join(rootDir, 'generated', 'uploads')
  try {
    fs.mkdirSync(uploadDir, { recursive: true })
  } catch (error) {
    sendJson(res, 500, { error: { message: `无法创建上传目录：${error.message}` } })
    return
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const target = path.join(uploadDir, `${unique}-${fileName}`)
  const limit = 80 * 1024 * 1024
  const output = fs.createWriteStream(target)
  let size = 0
  let failed = false

  const abort = (message) => {
    if (failed) return
    failed = true
    output.destroy()
    fs.rm(target, { force: true }, () => {})
    sendJson(res, 413, { error: { message } })
  }

  req.on('data', (chunk) => {
    if (failed) return
    size += chunk.length
    if (size > limit) {
      abort('单个参考素材不能超过 80MB。')
      req.destroy()
    }
  })
  req.on('error', () => abort('上传中断，请重试。'))
  output.on('error', (error) => abort(`保存失败：${error.message}`))
  output.on('finish', () => {
    if (failed) return
    sendJson(res, 200, {
      url: `/generated/uploads/${encodeURIComponent(path.basename(target))}`,
      path: target,
      name: fileName,
      size,
    })
  })
  req.pipe(output)
}

async function handleAgentRun(req, res) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : ''
  if (origin) {
    let originHost = ''
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = ''
    }
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : startPort
    const allowedHosts = new Set([`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`])
    if (!originHost || !allowedHosts.has(originHost)) {
      sendJson(res, 403, { error: { message: '拒绝来自其他站点的 Agent 调用。' } })
      return
    }
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    sendJson(res, 415, { error: { message: '请求必须使用 application/json。' } })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: { message: error?.message || '请求解析失败。' } })
    return
  }

  const agentId = typeof body?.agentId === 'string' ? body.agentId : ''
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
  const apiBaseUrl = typeof body?.apiBaseUrl === 'string' ? body.apiBaseUrl.trim() : ''
  const model = typeof body?.model === 'string' ? body.model.trim().slice(0, 120) : ''
  const mode = body?.mode === 'create' ? 'create' : 'chat'
  const automation = body?.automation === 'auto' ? 'auto' : 'default'
  const projectSummary =
    typeof body?.projectSummary === 'string' ? body.projectSummary.slice(0, 6000) : ''

  if (!agentId) {
    sendJson(res, 400, { error: { message: '缺少 agentId。' } })
    return
  }

  let installed = null
  if (agentId === 'custom') {
    const custom = body?.custom && typeof body.custom === 'object' ? body.custom : null
    installed = buildCustomAgent({
      name: typeof custom?.name === 'string' ? custom.name : '',
      command: typeof custom?.command === 'string' ? custom.command : '',
    })
    if (!installed) {
      sendJson(res, 400, { error: { message: '自定义命令为空，请先在设置里填写。' } })
      return
    }
  } else {
    installed = await getInstalledAgent(agentId)
  }

  if (!installed) {
    sendJson(res, 404, { error: { message: '没有检测到该 Agent，请先在设置里扫描或安装。' } })
    return
  }

  const { preset, command } = installed
  const baseUrl = currentBaseUrl()
  const prompt = buildRunPrompt({
    messages,
    rootDir,
    baseUrl,
    agentName: preset.name,
    mode,
    automation,
    projectSummary,
  })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const send = (payload) => {
    if (res.writableEnded) return
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  send({
    type: 'start',
    agent: { id: preset.id, name: preset.name, vendor: preset.vendor },
    baseUrl,
  })

  const { child, done, stop } = runAgent({
    preset,
    command,
    prompt,
    rootDir,
    baseUrl,
    model,
    apiKey: apiKey.length >= 8 && !/\s/.test(apiKey) ? apiKey : '',
    apiBaseUrl,
    onDelta: (text) => send({ type: 'delta', text }),
    onLog: (text) => send({ type: 'log', text }),
  })

  let closed = false
  const finish = (payload) => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    send(payload)
    if (!res.writableEnded) res.end()
  }

  const timer = setTimeout(() => {
    stop('SIGTERM')
    finish({ type: 'error', message: 'Agent 运行超过 30 分钟，已自动停止。' })
  }, 30 * 60 * 1000)
  timer.unref?.()

  res.on('close', () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    stop('SIGTERM')
  })

  done.then((result) => {
    if (result.error) {
      finish({ type: 'error', message: result.error })
      return
    }
    finish({
      type: 'done',
      exitCode: result.exitCode,
      stderrTail: result.stderrTail || '',
    })
  })
}

const server = http.createServer((req, res) => {
  const requestUrl = req.url || '/'

  for (const proxy of proxies) {
    if (requestUrl === proxy.prefix || requestUrl.startsWith(`${proxy.prefix}/`)) {
      proxy.handler(req, res)
      return
    }
  }

  if (requestUrl === '/local/upload') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed')
      return
    }
    handleUpload(req, res)
    return
  }

  if (requestUrl === '/local/agent/run') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed')
      return
    }
    void handleAgentRun(req, res)
    return
  }

  if (requestUrl.startsWith('/local/agents')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Method Not Allowed')
      return
    }
    void handleAgents(req, res, requestUrl)
    return
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

  // 本地环境信息：设置页用它展示项目在磁盘上的真实路径。
  if (pathname === '/local/info') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(
      JSON.stringify({
        name: 'onestep',
        rootDir,
        platform: process.platform,
      }),
    )
    return
  }

  if (pathname.startsWith('/generated/')) {
    const relative = path.normalize(pathname.slice('/generated/'.length)).replace(/^(\.\.[/\\])+/, '')
    const generatedRoot = path.join(rootDir, 'generated')
    const filePath = path.join(generatedRoot, relative)
    if (filePath.startsWith(generatedRoot) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
    return
  }

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

let started = false

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
    if (started) return
    started = true
    const address = server.address()
    const actualPort = typeof address === 'object' && address ? address.port : port
    const url = `http://${host}:${actualPort}`
    console.log('')
    console.log('  OneStep · 本地 AI 创作助手')
    console.log(`  已启动：${url}`)
    if (actualPort !== startPort) {
      console.log(`  端口 ${startPort} 已被占用，已自动切换到 ${actualPort}`)
    }
    console.log('  按 Ctrl+C 停止服务')
    console.log('')
    openBrowser(url)
  })
}

const startPort = Number.isFinite(requestedPort) ? requestedPort : 5500

if (!fs.existsSync(distDir)) {
  console.warn('提示：dist 目录不存在，页面会提示先运行 npm run build。')
}

listen(startPort)

function shutdown() {
  console.log('\n正在停止 OneStep 本地服务…')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
