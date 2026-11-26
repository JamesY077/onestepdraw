/**
 * 动效工程（HyperFrames 同源）本地服务。
 *
 * - 模板资源按需下载并缓存：封面、参考视频、motion.md、可编辑工程文件；
 * - 动效工程落盘在 <data>/motion-projects/<id>/，前端通过 /local/motion/file 预览；
 * - 渲染导出交给 hyperframes CLI，任务状态可查，失败保留日志。
 *
 * 只允许白名单 CDN，避免把本地服务变成任意代理。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { isZip, readZipEntries, findMotionDocument } from './zip.mjs'

const ALLOWED_HOSTS = new Set([
  'r.open-design.ai',
  'releases.open-design.ai',
  'static.heygen.ai',
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
])

const EXT_BY_MIME = {
  'video/mp4': '.mp4',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/markdown': '.md',
  'text/plain': '.txt',
  'text/html': '.html',
  'application/json': '.json',
}

const safeId = (value) => {
  const id = String(value || '').trim()
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(id) ? id : ''
}

const safeRelative = (value) => {
  const rel = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel || rel.split('/').some((part) => !part || part === '.' || part === '..')) return ''
  return rel
}

/** 本机 Homebrew ffmpeg 常见路径；找不到时交给 CLI 自己的解析逻辑。 */
function ffmpegEnv() {
  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
  const found = candidates.find((file) => fs.existsSync(file))
  if (!found) return {}
  return {
    HYPERFRAMES_FFMPEG_PATH: found,
    HYPERFRAMES_FFPROBE_PATH: found.replace(/ffmpeg$/, 'ffprobe'),
  }
}

export function createMotionService({ dataDir, rootDir, sendJson, sendFile }) {
  const projectRoot = path.join(dataDir, 'motion-projects')
  const cacheRoot = path.join(dataDir, 'motion-cache')
  const exportRoot = path.join(dataDir, 'generated')
  const jobs = new Map()

  fs.mkdirSync(projectRoot, { recursive: true })
  fs.mkdirSync(cacheRoot, { recursive: true })
  fs.mkdirSync(exportRoot, { recursive: true })

  const projectDir = (id) => path.join(projectRoot, safeId(id))
  const metaFile = (id) => path.join(projectDir(id), 'project.json')

  function readMeta(id) {
    const file = metaFile(id)
    if (!safeId(id) || !fs.existsSync(file)) return null
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  function writeMeta(id, patch) {
    const meta = { ...readMeta(id), ...patch, updatedAt: Date.now() }
    fs.writeFileSync(metaFile(id), JSON.stringify(meta, null, 2))
    return meta
  }

  function resolveInside(id, rel) {
    const base = projectDir(id)
    const relative = safeRelative(rel)
    if (!safeId(id) || !relative) return null
    const target = path.resolve(base, relative)
    return target === base || target.startsWith(base + path.sep) ? target : null
  }

  async function download(url) {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('资源地址不合法')
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.host)) {
      throw new Error(`不允许的资源来源：${parsed.host}`)
    }
    const key = crypto.createHash('sha256').update(url).digest('hex').slice(0, 40)
    const existing = fs.readdirSync(cacheRoot).find((name) => name.startsWith(key))
    if (existing) return path.join(cacheRoot, existing)

    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok || !response.body) throw new Error(`下载失败（${response.status}）`)
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim()
    const ext = EXT_BY_MIME[mime] || path.extname(parsed.pathname).slice(0, 8) || '.bin'
    const target = path.join(cacheRoot, `${key}${ext}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(target, buffer)
    return target
  }

  /** motion 说明包是 ZIP（motion.md + 参考图 + demo），也可能直接是 Markdown。 */
  async function readMotionPackage(url) {
    const file = await download(url)
    const buffer = fs.readFileSync(file)
    if (!isZip(buffer)) return { document: buffer.toString('utf8'), entries: [] }
    const entries = readZipEntries(buffer)
    const doc = findMotionDocument(entries)
    return { document: doc ? doc.data.toString('utf8') : '', entries }
  }

  function listProjects() {
    return fs
      .readdirSync(projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readMeta(entry.name))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  const STARTER_HTML = `<!doctype html>
<html lang="zh-CN" data-composition-variables='[
  {"id":"title","type":"string","label":"主标题","default":"把这一屏换成你的故事"},
  {"id":"accent","type":"color","label":"强调色","default":"#e2794f"}
]'>
<head>
<meta charset="utf-8" />
<title>Stepframe 动效工程</title>
<style>
  html, body { margin: 0; background: #111214; color: #fff; font-family: -apple-system, "PingFang SC", sans-serif; }
  .clip { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 18px; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 66px; letter-spacing: -0.02em; }
  span { font-size: 20px; color: var(--accent); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1280" data-height="720">
  <section class="clip" data-start="0" data-duration="6" data-track-index="1">
    <h1 id="headline" data-var-text="title">把这一屏换成你的故事</h1>
    <span>Stepframe · Motion</span>
  </section>
</div>
<script src="assets/gsap.min.js"></script>
<script>
  const tl = gsap.timeline({ paused: true })
  tl.fromTo('#headline', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out' }, 0)
  tl.fromTo('span', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 0.5)
  tl.to('#headline', { opacity: 0, y: -30, duration: 0.8, ease: 'power2.in' }, 4.6)
  window.__timelines = { main: tl }
</script>
</body>
</html>
`

  async function createProject(body) {
    const id = `motion_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    const name = String(body?.name || '未命名动效').slice(0, 120)
    const dir = projectDir(id)
    fs.mkdirSync(dir, { recursive: true })
    const template = body?.template
    const failures = []

    // 参考型条目也可能带未完成的上游草稿文件；不能把残缺草稿当成工程复制。
    if (template?.editable && Array.isArray(template.files) && template.files.length) {
      for (const file of template.files.slice(0, 200)) {
        const target = resolveInside(id, file.path)
        if (!target || typeof file.url !== 'string') continue
        try {
          const cached = await download(file.url)
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.copyFileSync(cached, target)
        } catch (error) {
          failures.push({ path: file.path, error: String(error?.message || error) })
        }
      }
      if (typeof template.indexUrl === 'string' && template.indexUrl && !fs.existsSync(path.join(dir, 'index.html'))) {
        try {
          const cached = await download(template.indexUrl)
          fs.copyFileSync(cached, path.join(dir, 'index.html'))
        } catch (error) {
          failures.push({ path: 'index.html', error: String(error?.message || error) })
        }
      }
    }

    // GSAP 随工程落盘，预览与渲染都不依赖外网 CDN。
    const gsapSource = path.join(rootDir, 'node_modules', 'gsap', 'dist', 'gsap.min.js')
    if (fs.existsSync(gsapSource) && !fs.existsSync(path.join(dir, 'assets', 'gsap.min.js'))) {
      fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
      fs.copyFileSync(gsapSource, path.join(dir, 'assets', 'gsap.min.js'))
    }

    if (!fs.existsSync(path.join(dir, 'index.html'))) fs.writeFileSync(path.join(dir, 'index.html'), STARTER_HTML)
    // 参考包解到 reference/，Agent 可以读 motion.md、看参考图与 demo，不必重复下载。
    const docUrl = template?.motionDoc || template?.motionGuide
    if (docUrl) {
      try {
        const pack = await readMotionPackage(docUrl)
        if (pack.document) fs.writeFileSync(path.join(dir, 'motion.md'), pack.document)
        for (const entry of pack.entries) {
          const target = resolveInside(id, path.join('reference', entry.name))
          if (!target) continue
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, entry.data)
        }
      } catch (error) {
        failures.push({ path: 'motion.md', error: String(error?.message || error) })
      }
    }

    const meta = {
      id,
      name,
      entry: 'index.html',
      templateId: typeof template?.id === 'string' ? template.id : '',
      sourceUrl: typeof template?.sourceUrl === 'string' ? template.sourceUrl : '',
      width: Number(body?.width) || 1280,
      height: Number(body?.height) || 720,
      fps: Number(body?.fps) || 30,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      params: {},
      missingFiles: failures,
    }
    writeMeta(id, meta)
    return { ...meta, entryUrl: `/local/motion/file?id=${id}&path=index.html` }
  }

  function runRender(job, args) {
    return new Promise((resolve) => {
      const child = spawn(args.command, args.args, {
        cwd: job.dir,
        shell: false,
        env: {
          ...process.env,
          HYPERFRAMES_NO_TELEMETRY: '1',
          ...(process.env.HYPERFRAMES_FFMPEG_PATH ? {} : ffmpegEnv()),
        },
      })
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        job.log = (job.log + String(chunk)).slice(-4000)
      })
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + String(chunk)).slice(-4000)
        job.log = stderr
      })
      child.on('error', (error) => {
        job.status = 'failed'
        job.error = String(error?.message || error)
        resolve()
      })
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(job.output)) {
          job.status = 'succeeded'
          job.url = `/generated/${path.basename(job.output)}`
        } else {
          job.status = 'failed'
          job.error = job.error || `渲染进程退出码 ${code}`
        }
        job.finishedAt = Date.now()
        resolve()
      })
    })
  }

  async function startRender(body) {
    const id = safeId(body?.id)
    const meta = readMeta(id)
    if (!meta) throw new Error('动效工程不存在')
    const output = path.join(exportRoot, `${id}-${Date.now()}.mp4`)
    const job = {
      id: `render_${crypto.randomUUID().slice(0, 8)}`,
      projectId: id,
      dir: projectDir(id),
      output,
      status: 'running',
      log: '',
      startedAt: Date.now(),
    }
    jobs.set(job.id, job)

    const cli = path.join(rootDir, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
    if (!fs.existsSync(cli)) {
      throw new Error('未安装 hyperframes CLI，请先在项目目录执行 npm install。')
    }
    const args = [
      cli,
      'render',
      projectDir(id),
      '--output',
      output,
      '--format',
      'mp4',
      '-f',
      String(meta.fps || 30),
    ]
    if (meta.params && Object.keys(meta.params).length) {
      args.push('--variables', JSON.stringify(meta.params))
    }
    void runRender(job, { command: process.execPath, args })
    return { jobId: job.id }
  }

  return {
    async handle(req, res) {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const pathname = url.pathname
      const readBody = () =>
        new Promise((resolve, reject) => {
          let raw = ''
          req.on('data', (chunk) => {
            raw += chunk
            if (raw.length > 20_000_000) reject(new Error('请求体过大'))
          })
          req.on('end', () => {
            try {
              resolve(raw ? JSON.parse(raw) : {})
            } catch {
              reject(new Error('请求体不是合法 JSON'))
            }
          })
          req.on('error', reject)
        })

      if (pathname === '/local/motion/asset' && req.method === 'GET') {
        const file = await download(url.searchParams.get('url') || '')
        sendFile(res, file)
        return
      }

      if (pathname === '/local/motion/document' && req.method === 'GET') {
        const pack = await readMotionPackage(url.searchParams.get('url') || '')
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(pack.document || '# 这条模板没有 motion.md 正文\n')
        return
      }

      if (pathname === '/local/motion/file' && req.method === 'GET') {
        const target = resolveInside(url.searchParams.get('id'), url.searchParams.get('path') || 'index.html')
        if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not Found')
          return
        }
        res.setHeader('Cache-Control', 'no-store')
        sendFile(res, target)
        return
      }

      if (pathname === '/local/motion/list' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, projects: listProjects() })
        return
      }

      if (pathname === '/local/motion/create' && req.method === 'POST') {
        const meta = await createProject(await readBody())
        sendJson(res, 200, { ok: true, project: meta })
        return
      }

      if (pathname === '/local/motion/read' && req.method === 'POST') {
        const body = await readBody()
        const target = resolveInside(body.id, body.path || 'index.html')
        if (!target || !fs.existsSync(target)) throw new Error('文件不存在')
        sendJson(res, 200, { ok: true, content: fs.readFileSync(target, 'utf8') })
        return
      }

      if (pathname === '/local/motion/write' && req.method === 'POST') {
        const body = await readBody()
        const target = resolveInside(body.id, body.path || 'index.html')
        if (!target) throw new Error('路径不合法')
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, String(body.content ?? ''))
        sendJson(res, 200, { ok: true, project: writeMeta(body.id, {}) })
        return
      }

      if (pathname === '/local/motion/update' && req.method === 'POST') {
        const body = await readBody()
        const id = safeId(body.id)
        if (!readMeta(id)) throw new Error('动效工程不存在')
        const patch = {}
        if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 120)
        if (body.params && typeof body.params === 'object' && !Array.isArray(body.params)) {
          patch.params = body.params
          // 参数写回 HTML 的默认值：浏览器预览与 CLI 渲染共用同一份事实来源。
          const entry = resolveInside(id, 'index.html')
          if (entry && fs.existsSync(entry)) {
            const source = fs.readFileSync(entry, 'utf8')
            const next = source.replace(
              /data-composition-variables\s*=\s*(['"])([\s\S]*?)\1/,
              (whole, quote, json) => {
                try {
                  const variables = JSON.parse(json)
                  if (!Array.isArray(variables)) return whole
                  for (const variable of variables) {
                    if (variable && typeof variable.id === 'string' && variable.id in body.params) {
                      variable.default = body.params[variable.id]
                    }
                  }
                  return `data-composition-variables='${JSON.stringify(variables).replace(/'/g, '&#39;')}'`
                } catch {
                  return whole
                }
              },
            )
            if (next !== source) fs.writeFileSync(entry, next)
          }
        }
        for (const key of ['width', 'height', 'fps']) {
          if (Number.isFinite(Number(body[key])) && Number(body[key]) > 0) patch[key] = Number(body[key])
        }
        sendJson(res, 200, { ok: true, project: writeMeta(id, patch) })
        return
      }

      if (pathname === '/local/motion/render' && req.method === 'POST') {
        sendJson(res, 200, { ok: true, ...(await startRender(await readBody())) })
        return
      }

      if (pathname === '/local/motion/render/status' && req.method === 'GET') {
        const job = jobs.get(url.searchParams.get('jobId') || '')
        if (!job) {
          sendJson(res, 404, { ok: false, error: '渲染任务不存在或已随重启清理' })
          return
        }
        sendJson(res, 200, {
          ok: true,
          job: {
            id: job.id,
            status: job.status,
            url: job.url,
            error: job.error,
            log: job.log,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
          },
        })
        return
      }

      sendJson(res, 404, { ok: false, error: '未知的动效接口' })
    },
  }
}
