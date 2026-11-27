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
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isZip, readZipEntries, findMotionDocument } from './zip.mjs'

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

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

/** 平台可执行文件名；Windows 必须带 .exe，否则 spawn 失败。 */
function toolFileName(name, platform = process.platform) {
  return platform === 'win32' ? `${name}.exe` : name
}

/** 与 Chromium 一样，允许把 ffmpeg/ffprobe 随安装包放进 Resources/ffmpeg。 */
export function bundledToolPath(name, {
  rootDir = MODULE_ROOT,
  resourcesPath = process.resourcesPath,
  platform = process.platform,
} = {}) {
  const file = toolFileName(name, platform)
  const roots = []
  if (resourcesPath) roots.push(path.join(resourcesPath, 'ffmpeg'))
  if (rootDir) roots.push(path.join(rootDir, '.runtime', 'ffmpeg'))
  for (const root of roots) {
    const candidate = path.join(root, file)
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

/** ffmpeg 在 PATH 里也算可用：HyperFrames 自己会解析 PATH。 */
function commandAvailable(binary) {
  if (!binary) return false
  if (binary.includes(path.sep) && !fs.existsSync(binary)) return false
  try {
    const result = spawnSync(binary, ['-version'], { stdio: 'ignore', timeout: 8000 })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * 渲染用的 headless Chrome 随 App 一起分发。
 *
 * UI 跑在 Electron 里，但 HyperFrames 渲染必须另起一个可被 CDP 驱动的
 * Chromium（Electron 主进程不能直接当无头浏览器用）。官方默认做法是
 * 首次渲染时下载 chrome-headless-shell 到 ~/.cache，那相当于让用户
 * 装完 App 再偷偷下 200MB，离线还会直接失败。
 *
 * 打包脚本会把官方锁定的 chrome-headless-shell 放进
 * `Resources/chrome-headless-shell/`，开发态则读 `.runtime/`，运行时
 * 通过 HYPERFRAMES_BROWSER_PATH 指过去即可，不复用系统 Chrome。
 */
export function bundledBrowserPath({
  rootDir = MODULE_ROOT,
  resourcesPath = process.resourcesPath,
  platform = process.platform,
} = {}) {
  const binary = platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
  const roots = []
  if (resourcesPath) roots.push(path.join(resourcesPath, 'chrome-headless-shell'))
  if (rootDir) roots.push(path.join(rootDir, '.runtime', 'chrome-headless-shell'))
  for (const root of roots) {
    const direct = path.join(root, binary)
    if (fs.existsSync(direct)) return direct
    // 兼容未整理的 puppeteer 缓存布局（<root>/chrome-headless-shell-<platform>/<binary>）。
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith('chrome-headless-shell')) continue
        const candidate = path.join(root, entry.name, binary)
        if (fs.existsSync(candidate)) return candidate
      }
    } catch {
      // 目录不存在就继续看下一个候选位置。
    }
  }
  return ''
}

/**
 * Electron 的 process.execPath 是 Electron.app，不是系统 node。
 * CLI 及其内部 reaper/browser 子进程都必须以 Node 模式启动，否则 Electron
 * 会把 `-e` 后的进程清理脚本当成应用目录，报 Unable to find Electron app。
 */
export function motionRenderEnvironment(baseEnv = process.env, options = {}) {
  const env = {
    ...baseEnv,
    ELECTRON_RUN_AS_NODE: '1',
    HYPERFRAMES_NO_TELEMETRY: '1',
  }
  if (!env.HYPERFRAMES_BROWSER_PATH) {
    const bundled = bundledBrowserPath(options)
    if (bundled) env.HYPERFRAMES_BROWSER_PATH = bundled
  }
  if (!env.HYPERFRAMES_FFMPEG_PATH) {
    const bundledFfmpeg = bundledToolPath('ffmpeg', options)
    if (bundledFfmpeg) {
      env.HYPERFRAMES_FFMPEG_PATH = bundledFfmpeg
      const bundledProbe = bundledToolPath('ffprobe', options)
      if (bundledProbe) env.HYPERFRAMES_FFPROBE_PATH = bundledProbe
    } else {
      Object.assign(env, ffmpegEnv())
    }
  }
  return env
}

/** 渲染链路自检：CLI、内置 Chromium、ffmpeg 是否齐全，用于打包验收和失败提示。 */
export function motionRenderRuntime({
  rootDir = MODULE_ROOT,
  resourcesPath = process.resourcesPath,
} = {}) {
  const env = motionRenderEnvironment(process.env, { rootDir, resourcesPath })
  const cli = path.join(rootDir, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
  const ffmpeg = env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg'
  const ffprobe = env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe'
  const cliReady = fs.existsSync(cli)
  const browserReady = !!env.HYPERFRAMES_BROWSER_PATH && fs.existsSync(env.HYPERFRAMES_BROWSER_PATH)
  const ffmpegReady = commandAvailable(ffmpeg)
  return {
    cliReady,
    cli,
    browserReady,
    browser: env.HYPERFRAMES_BROWSER_PATH || '',
    ffmpegReady,
    ffmpeg,
    ffprobe,
    ready: cliReady && browserReady && ffmpegReady,
  }
}

const RENDER_PHASE_LABELS = {
  compile: '编译工程',
  extract_video: '提取素材',
  process_audio: '处理音频',
  start_browsers: '启动渲染器',
  capture: '渲染画面',
  encode: '编码视频',
  assemble: '合成输出',
}

/**
 * HyperFrames 的 drawElement 快速捕获只在单 worker 时默认开启。
 * `--workers auto` 会为此启动 6 个 Chrome 并退回逐帧截图：6 秒短片实测
 * 自动 6 worker 需要 134s，单 worker 只要 20s。短片固定 1 个 worker，
 * 长片再按帧数放大，避免为了并行反而失去快速捕获。
 */
export function resolveRenderWorkers({ durationSeconds, fps } = {}) {
  const seconds = Number(durationSeconds) || 0
  const rate = Number(fps) || 30
  const frames = Math.round(seconds * rate)
  if (!Number.isFinite(frames) || frames <= 0) return 1
  if (frames <= 900) return 1
  if (frames <= 2700) return 2
  return 4
}

/**
 * 找出源码里的根合成。OpenMotion 模板的 data-composition-id 不一定是
 * `main`（例如 `google-salsa-089`），只认 main 会把完整模板误判成缺画幅。
 * 优先 main，其次第一个带宽高的合成，最后退回第一个合成。
 */
export function motionRootComposition(source) {
  const html = String(source || '')
  const re = /<([a-z][\w:-]*)\b[^>]*\bdata-composition-id\s*=\s*["']([^"']+)["'][^>]*>/gi
  const attr = (tag, name) => {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
    return match ? match[1] : ''
  }
  const candidates = []
  for (const match of html.matchAll(re)) {
    const tag = match[0]
    candidates.push({
      tag,
      index: match.index || 0,
      id: match[2],
      width: Number(attr(tag, 'data-width')) || 0,
      height: Number(attr(tag, 'data-height')) || 0,
      duration: Number(attr(tag, 'data-duration')) || 0,
      start: Number(attr(tag, 'data-start')) || 0,
    })
  }
  if (!candidates.length) return null
  return candidates.find((item) => item.id.toLowerCase() === 'main') ||
    candidates.find((item) => item.width && item.height) ||
    candidates[0]
}

/** 读根合成的 data-duration，渲染后用真实成片时长和它对比。 */
export function compositionDuration(dir) {
  try {
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
    return motionRootComposition(html)?.duration || 0
  } catch {
    return 0
  }
}

/** 在合成根上写入镜号，模板副本也能被宿主识别成属于该镜的独立工程。 */
export function markMotionShot(source, shotId) {
  const id = String(shotId || '').trim()
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return String(source || '')
  const html = String(source || '')
  if (html.includes(`data-stepframe-shot="${id}"`)) return html
  return html.replace(/<html\b/i, `<html data-stepframe-shot="${id}"`)
}

/** CLI 每次进度都会写 `@hf-progress {...}`；取最后一条当作真实进度。 */
export function parseRenderProgress(text) {
  const lines = String(text || '').match(/@hf-progress\s+\{[^\n]*\}/g) || []
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const data = JSON.parse(lines[index].replace(/^@hf-progress\s+/, ''))
      if (typeof data?.pct !== 'number') continue
      const code = String(data.code || '')
      return {
        pct: Math.max(0, Math.min(100, Math.round(data.pct))),
        code,
        label: RENDER_PHASE_LABELS[code] || '渲染中',
        done: Number(data.done) || 0,
        total: Number(data.total) || 0,
      }
    } catch {
      // 进度行可能被 chunk 切断，跳过半行继续找上一条完整记录。
    }
  }
  return null
}

/** 渲染参数集中在这里，测试和真实导出用同一份规则。 */
export function buildRenderArgs({ cli, dir, output, fps, duration, end, params } = {}) {
  const rate = Number(fps) || 30
  const fullDuration = Number(duration) || 0
  const trimEnd = Number(end) || 0
  // 实际要渲染的区间决定 worker 数：截断后只跑 4 秒，不能按 48 秒开 4 个 worker。
  const renderSpan = trimEnd > 0 && fullDuration > 0 ? Math.min(trimEnd, fullDuration) : fullDuration
  const workers = resolveRenderWorkers({ durationSeconds: renderSpan, fps: rate })
  const args = [
    cli,
    'render',
    dir,
    '--output',
    output,
    '--format',
    'mp4',
    '-f',
    String(rate),
    // 固定 worker 数：auto 会关掉 drawElement 快速捕获并多起 6 个 Chrome。
    '--workers',
    String(workers),
  ]
  if (trimEnd > 0 && (!fullDuration || trimEnd < fullDuration - 0.001)) {
    // 时间轴只使用前 N 秒时，不要让 48s 的模板工程整段渲染。
    args.push('--end', String(Math.round(trimEnd * 1000) / 1000))
  }
  if (params && Object.keys(params).length) {
    args.push('--variables', JSON.stringify(params))
  }
  return { args, workers }
}

function ffprobeBinary(env) {
  if (env?.HYPERFRAMES_FFPROBE_PATH) return env.HYPERFRAMES_FFPROBE_PATH
  const found = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe'].find((file) => fs.existsSync(file))
  return found || 'ffprobe'
}

/** 渲染成功后用 ffprobe 实测分辨率/时长/帧数，避免“有文件但没画面”。 */
function probeVideo(file, bin, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let output = ''
    let child
    try {
      child = spawn(
        bin,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
        { shell: false },
      )
    } catch (error) {
      resolve({ ok: false, error: `无法执行 ffprobe：${error?.message || error}` })
      return
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { output += String(chunk) })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: `无法执行 ffprobe：${error?.message || error}` })
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        const data = JSON.parse(output)
        const video = (data.streams || []).find((stream) => stream.codec_type === 'video')
        if (!video) {
          resolve({ ok: false, error: '导出文件没有视频流' })
          return
        }
        const duration = Number(data.format?.duration) || Number(video.duration) || 0
        const [num, den] = String(video.avg_frame_rate || video.r_frame_rate || '').split('/')
        const rate = Number(num) / (Number(den) || 1)
        const frames = Number(video.nb_frames) || (rate > 0 ? Math.round(duration * rate) : 0)
        resolve({
          ok: true,
          width: Number(video.width) || 0,
          height: Number(video.height) || 0,
          codec: String(video.codec_name || ''),
          duration: Math.round(duration * 1000) / 1000,
          frames,
        })
      } catch {
        resolve({ ok: false, error: 'ffprobe 返回内容无法解析' })
      }
    })
  })
}

/**
 * 写入前拒绝会退回「把这一屏幕换成你的故事」占位页的伪工程。
 *
 * 官方模板并不都用 `class="clip"` + `data-track-index`：有的直接用 GSAP
 * 时间线驱动整份合成（例如 406×720 的 Doodle），也有用
 * `data-composition-src` 引用子合成的。只要根合成完整就允许写回；
 * 真正声明成 clip 的元素才要求 start / track-index。
 */
export function validateMotionCompositionSource(source) {
  const html = String(source || '').replace(/<!--[\s\S]*?-->/g, '')
  const root = motionRootComposition(html)
  const missing = []
  if (!root) missing.push('data-composition-id')
  else if (!root.duration) missing.push('根合成 data-duration')
  if (!/<[a-z][^>]*\bdata-start\s*=\s*['"]\d+(?:\.\d+)?['"]/i.test(html)) missing.push('片段 data-start')
  const clipTags = html.match(/<[a-z][^>]*\bclass\s*=\s*['"][^'"]*\bclip\b[^'"]*['"][^>]*>/gi) || []
  if (clipTags.length) {
    if (!clipTags.every((tag) => /\bdata-start\s*=/.test(tag))) missing.push('片段 data-start')
    if (!clipTags.every((tag) => /\bdata-track-index\s*=/.test(tag))) missing.push('轨道 data-track-index')
  }
  if (missing.length) {
    throw new Error(`HyperFrames 合成结构不完整：缺少 ${missing.join('、')}。请补齐单一合成根与轨道片段后再写回；当前内容未保存。`)
  }
  return true
}

/** 已落盘源码是否已经是可直接预览/渲染的完整工程（模板副本用）。 */
export function motionSourceReady(source, { width, height, shotId } = {}) {
  try {
    validateMotionCompositionSource(source)
  } catch {
    return false
  }
  const root = motionRootComposition(source)
  if (!root || !root.width || !root.height) return false
  if (width && root.width !== Math.round(Number(width))) return false
  if (height && root.height !== Math.round(Number(height))) return false
  const id = String(shotId || '').trim()
  if (id && !String(source).includes(id)) return false
  return true
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

    const requestedWidth = Number(body?.width) || template?.width || 1280
    const requestedHeight = Number(body?.height) || template?.height || 720
    let width = requestedWidth
    let height = requestedHeight
    const shotId = String(body?.shotId || '').slice(0, 40)
    const indexFile = path.join(dir, 'index.html')
    const fromTemplate = Boolean(template?.editable && fs.existsSync(indexFile))
    if (!fs.existsSync(indexFile)) {
      const starter = STARTER_HTML
        .replace('data-width="1280"', `data-width="${width}"`)
        .replace('data-height="720"', `data-height="${height}"`)
      fs.writeFileSync(indexFile, starter)
    } else if (fromTemplate) {
      // 模板副本保留原画幅。时间轴预览的 hyperframes-player 与整片导出的
      // CanvasSink 都按 contain 等比缩放，强行改根画幅只会让场景背景铺满
      // 目标画幅、正文错位（HyperFrames 会用 data-width/data-height 覆盖
      // 根元素的 width/height）。这里只记录模板真实画幅，交给播放器留边。
      try {
        const root = motionRootComposition(fs.readFileSync(indexFile, 'utf8'))
        if (root?.width && root?.height) {
          width = root.width
          height = root.height
        }
      } catch (error) {
        failures.push({ path: 'index.html', error: `模板画幅读取失败：${String(error?.message || error)}` })
      }
    }
    if (fs.existsSync(indexFile) && shotId) {
      const marked = markMotionShot(fs.readFileSync(indexFile, 'utf8'), shotId)
      fs.writeFileSync(indexFile, marked)
    }
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
      templateWidth: Number(template?.width) || 0,
      templateHeight: Number(template?.height) || 0,
      shotId,
      sourceUrl: typeof template?.sourceUrl === 'string' ? template.sourceUrl : '',
      width,
      height,
      fps: Number(body?.fps) || 30,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      params: {},
      missingFiles: failures,
    }
    writeMeta(id, meta)
    // 可编辑模板复制 + 画幅适配 + 镜号注入后本身就是完整工程：直接标记可用，
    // 避免 Agent 只做了 create 却因为没再写一次源码而误报“未完成独立工程”。
    const ready = fromTemplate &&
      motionSourceReady(fs.readFileSync(indexFile, 'utf8'), { width, height, shotId })
    return {
      ...meta,
      sourceReady: ready,
      entryUrl: `/local/motion/view/${encodeURIComponent(id)}/index.html`,
    }
  }

  function importAsset(body) {
    const id = safeId(body?.id)
    if (!readMeta(id)) throw new Error('动效工程不存在')
    const source = String(body?.source || '').trim()
    let parsed
    try {
      parsed = new URL(source, 'http://127.0.0.1')
    } catch {
      throw new Error('素材地址不合法')
    }
    // 旧项目可能把上传地址存成带端口或 localhost 的绝对 URL；这里只读取本机文件，
    // 因此按 host 白名单和固定目录判断，不再因为端口/主机写法不同误拦截。
    const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
    if (!localHosts.has(parsed.hostname) || !parsed.pathname.startsWith('/generated/uploads/')) {
      throw new Error('只允许导入本机 generated/uploads 里的上传素材')
    }
    const uploadRoot = path.join(dataDir, 'generated', 'uploads')
    let relative
    try {
      relative = decodeURIComponent(parsed.pathname.slice('/generated/uploads/'.length))
    } catch {
      throw new Error('素材地址编码不合法')
    }
    const sourceFile = path.resolve(uploadRoot, relative)
    if (!sourceFile.startsWith(uploadRoot + path.sep) || !fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
      throw new Error('上传素材不存在或路径不合法')
    }
    const requested = path.basename(String(body?.fileName || path.basename(sourceFile)))
    const extension = path.extname(sourceFile).toLowerCase()
    const stem = path.basename(requested, path.extname(requested))
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .trim()
      .slice(0, 72) || 'asset'
    const key = crypto.createHash('sha256').update(sourceFile).digest('hex').slice(0, 8)
    const relativeTarget = `assets/uploads/${key}-${stem}${extension}`
    const target = resolveInside(id, relativeTarget)
    if (!target) throw new Error('工程素材路径不合法')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(sourceFile, target)
    writeMeta(id, {})
    return {
      ok: true,
      motionId: id,
      path: relativeTarget,
      url: `/local/motion/view/${encodeURIComponent(id)}/${relativeTarget.split('/').map(encodeURIComponent).join('/')}`,
    }
  }

  /** 运行 HyperFrames CLI 并收集输出；check / preview 都需要 JSON 结果。 */
  function runHyperframesCli(args, { timeoutMs = 120_000 } = {}) {
    const cli = path.join(rootDir, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
    if (!fs.existsSync(cli)) throw new Error('未安装 hyperframes CLI，请先在项目目录执行 npm install。')
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], {
        cwd: rootDir,
        shell: false,
        env: motionRenderEnvironment(),
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`HyperFrames 命令超时（${Math.round(timeoutMs / 1000)}s）`))
      }, timeoutMs)
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + String(chunk)).slice(-4_000_000)
      })
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + String(chunk)).slice(-200_000)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code, stdout, stderr })
      })
    })
  }

  function parseCliJson(stdout) {
    const text = String(stdout || '').trim()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      // CLI 偶尔在 JSON 前后打印提示行，取最后一段完整 JSON。
      const lines = text.split('\n').filter((line) => line.trim().startsWith('{'))
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          return JSON.parse(lines[index])
        } catch {
          // 继续向前找。
        }
      }
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1))
        } catch {
          return null
        }
      }
      return null
    }
  }

  const REVIEW_STAGES = ['lint', 'runtime', 'layout', 'motion', 'contrast', 'craft', 'audio']

  /**
   * 复查校验：复用官方 hyperframes check（lint / runtime / layout / 对比度）。
   * 返回扁平问题列表，前端可直接渲染；CLI 失败时保留日志供排查。
   */
  async function checkProject(body) {
    const id = safeId(body?.id)
    if (!id || !readMeta(id)) throw new Error('动效工程不存在')
    const samples = Math.max(1, Math.min(12, Number(body?.samples) || 5))
    const startedAt = Date.now()
    const { code, stdout, stderr } = await runHyperframesCli(
      ['check', projectDir(id), '--json', '--samples', String(samples), '--max-issues', '60'],
      { timeoutMs: 240_000 },
    )
    const report = parseCliJson(stdout)
    if (!report) {
      throw new Error(`复查校验没有返回可解析结果（退出码 ${code}）：${stderr.trim().slice(-600) || '无输出'}`)
    }
    const findings = []
    for (const stage of REVIEW_STAGES) {
      const section = report[stage] || {}
      for (const finding of section.findings || []) {
        findings.push({
          stage,
          severity: finding.severity || 'warning',
          code: finding.code || stage,
          message: finding.message || '',
          selector: finding.selector || '',
          sourceFile: finding.sourceFile || 'index.html',
          time: Number(finding.time) || 0,
        })
      }
    }
    const count = (severity) => findings.filter((item) => item.severity === severity).length
    return {
      // 传输成功固定为 ok:true；是否通过复查用 passed，避免前端把“有 error”误判成接口失败。
      ok: true,
      passed: findings.every((item) => item.severity !== 'error'),
      motionId: id,
      checkedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      browserSkipped: !!report.browserSkipped,
      summary: {
        errorCount: count('error'),
        warningCount: count('warning'),
        infoCount: count('info'),
        findings: findings.length,
      },
      findings,
      log: stderr.trim().slice(-4000),
    }
  }

  /** 官方 HyperFrames Studio：启动（或复用）该工程的预览服务，前端直接嵌入同一套 UI。 */
  const studioSessions = new Map()

  async function startStudio(body) {
    const id = safeId(body?.id)
    if (!id || !readMeta(id)) throw new Error('动效工程不存在')
    const cached = studioSessions.get(id)
    if (cached?.url) {
      try {
        const response = await fetch(cached.url, { signal: AbortSignal.timeout(1500) })
        if (response.ok) return { ok: true, ...cached, reused: true }
      } catch {
        studioSessions.delete(id)
      }
    }
    const { code, stdout, stderr } = await runHyperframesCli(
      ['preview', projectDir(id), '--no-open', '--background', '--json'],
      { timeoutMs: 90_000 },
    )
    const parsed = parseCliJson(stdout)
    const result = parsed?.result || parsed
    const url = result?.studioUrl || result?.serverUrl || ''
    if (code !== 0 || !url) {
      throw new Error(`HyperFrames Studio 启动失败（退出码 ${code}）：${stderr.trim().slice(-600) || stdout.trim().slice(-600) || '无输出'}`)
    }
    const session = {
      url: String(url),
      serverUrl: String(result.serverUrl || url),
      port: Number(result.port) || 0,
      pid: Number(result.pid) || 0,
      projectDir: projectDir(id),
      startedAt: Date.now(),
    }
    studioSessions.set(id, session)
    return { ok: true, ...session, reused: false }
  }

  const renderQueue = []
  let activeRender = null

  /** 渲染是重 CPU 任务：串行排队，避免两个工程各起一套 Chrome 互相拖慢。 */
  function pumpRenderQueue() {
    if (activeRender) return
    const next = renderQueue.shift()
    if (!next) return
    activeRender = next
    next.status = 'running'
    next.startedRenderingAt = Date.now()
    void runRender(next).finally(() => {
      activeRender = null
      pumpRenderQueue()
    })
  }

  function runRender(job) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, job.args, {
        cwd: job.dir,
        shell: false,
        env: motionRenderEnvironment(),
      })
      const append = (text) => {
        job.log = (job.log + text).slice(-8000)
        const progress = parseRenderProgress(text)
        if (progress) job.progress = progress
      }
      child.stdout.on('data', (chunk) => append(String(chunk)))
      child.stderr.on('data', (chunk) => append(String(chunk)))
      child.on('error', (error) => {
        job.status = 'failed'
        job.error = String(error?.message || error)
        job.finishedAt = Date.now()
        resolve()
      })
      child.on('close', async (code) => {
        job.finishedAt = Date.now()
        if (code !== 0 || !fs.existsSync(job.output)) {
          job.status = 'failed'
          job.error = job.error || `渲染进程退出码 ${code}`
          resolve()
          return
        }
        // 有文件不等于有画面：用 ffprobe 实测时长/帧数，和工程时长对齐后才算成功。
        const probe = await probeVideo(job.output, ffprobeBinary(motionRenderEnvironment()))
        if (!probe.ok) {
          job.probeError = probe.error
          job.status = 'succeeded'
          job.url = `/generated/${path.basename(job.output)}`
          resolve()
          return
        }
        job.probe = {
          width: probe.width,
          height: probe.height,
          codec: probe.codec,
          duration: probe.duration,
          frames: probe.frames,
        }
        const expected = Number(job.duration) || 0
        const tolerance = Math.max(0.2, 2 / (Number(job.fps) || 30))
        if (expected > 0 && Math.abs(probe.duration - expected) > tolerance) {
          job.status = 'failed'
          job.error = `导出时长 ${probe.duration.toFixed(2)}s 与工程 ${expected}s 不一致`
          resolve()
          return
        }
        job.progress = {
          pct: 100,
          code: 'done',
          label: '完成',
          done: probe.frames,
          total: probe.frames,
        }
        job.status = 'succeeded'
        job.url = `/generated/${path.basename(job.output)}`
        resolve()
      })
    })
  }

  async function startRender(body) {
    const id = safeId(body?.id)
    const meta = readMeta(id)
    if (!meta) throw new Error('动效工程不存在')
    const cli = path.join(rootDir, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
    if (!fs.existsSync(cli)) {
      throw new Error('渲染组件缺失：安装包里没有 HyperFrames CLI。请重新安装 Stepframe。')
    }
    const runtime = motionRenderRuntime({ rootDir })
    if (!runtime.ffmpegReady) {
      throw new Error(
        '导出 MP4 需要 FFmpeg：当前设备没有可用的 ffmpeg。macOS 可执行 brew install ffmpeg，或把 ffmpeg/ffprobe 放进安装包的 Resources/ffmpeg。',
      )
    }

    const dir = projectDir(id)
    const fps = Number(meta.fps) || 30
    const fullDuration = compositionDuration(dir)
    // 时间轴片段只用前 N 秒：只渲染这一段，48s 模板不必整段出片。
    // 片段从合成 0 秒开始读，所以 end = trimStart + clip.duration 即可。
    const requestedEnd = Math.max(0, Number(body?.end) || 0)
    const duration = requestedEnd > 0 && fullDuration > 0
      ? Math.min(requestedEnd, fullDuration)
      : fullDuration
    const trimmed = duration > 0 && fullDuration > 0 && duration < fullDuration - 0.001
    // 文件名带上渲染区间，恢复旧项目时才能确认这份产物够不够长。
    const output = path.join(exportRoot, `${id}-${Date.now()}${trimmed ? `-e${Math.round(duration * 1000)}` : ''}.mp4`)
    const { args, workers } = buildRenderArgs({
      cli,
      dir,
      output,
      fps,
      duration: fullDuration,
      end: trimmed ? duration : 0,
      params: meta.params,
    })

    const job = {
      id: `render_${crypto.randomUUID().slice(0, 8)}`,
      projectId: id,
      dir,
      output,
      args,
      fps,
      duration,
      fullDuration,
      trimmed,
      workers,
      status: 'queued',
      log: '',
      progress: { pct: 0, code: 'queued', label: '排队中', done: 0, total: 0 },
      createdAt: Date.now(),
    }
    jobs.set(job.id, job)
    renderQueue.push(job)
    pumpRenderQueue()
    return { jobId: job.id, workers, duration, queued: job.status === 'queued' }
  }

  /**
   * 让旧项目能在打开时把丢失的渲染片段重新接回最近一次真实产物。
   * `end` 是时间轴实际需要的秒数：短于它的旧产物不能复用，否则后半段黑场。
   */
  function latestRender(id, end = 0) {
    if (!readMeta(id)) throw new Error('动效工程不存在')
    const prefix = `${id}-`
    const requestedEnd = Math.max(0, Number(end) || 0)
    const renders = fs.readdirSync(exportRoot)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.mp4'))
      .map((name) => {
        const file = path.join(exportRoot, name)
        const stat = fs.statSync(file)
        const match = name.match(/-e(\d+)\.mp4$/)
        return {
          name,
          file,
          mtime: stat.mtimeMs,
          // 没有后缀的是完整渲染（旧版本也没有 --end），任何区间都能复用。
          end: match ? Number(match[1]) / 1000 : 0,
        }
      })
      .filter((item) => (requestedEnd ? item.end === 0 || item.end >= requestedEnd - 0.001 : item.end === 0))
      .sort((left, right) => right.mtime - left.mtime)
    const newest = renders[0]
    if (!newest) return { ok: true, url: '', updatedAt: 0, stale: false }
    const entry = resolveInside(id, 'index.html')
    const sourceMtime = entry && fs.existsSync(entry) ? fs.statSync(entry).mtimeMs : 0
    return {
      ok: true,
      url: `/generated/${newest.name}`,
      updatedAt: newest.mtime,
      sourceUpdatedAt: sourceMtime,
      // 源码在最近一次渲染后又被改过：保留片段但不自动换成过期产物。
      stale: sourceMtime > newest.mtime + 1000,
    }
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

      /**
       * 目录式预览地址：必须让 index.html 里的相对路径（assets/logo.svg 等）能正常解析。
       * 查询串式的 /file 会让浏览器把 assets/... 解析到 /local/motion/assets/...，Logo 与照片全部 404。
       */
      const viewMatch = pathname.match(/^\/local\/motion\/view\/([^/]+)\/?(.*)$/)
      if (viewMatch && req.method === 'GET') {
        let id = ''
        let relative = ''
        try {
          id = decodeURIComponent(viewMatch[1] || '')
          relative = decodeURIComponent(viewMatch[2] || '') || 'index.html'
        } catch {
          throw new Error('预览路径编码不合法')
        }
        const target = resolveInside(id, relative)
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

      if (pathname === '/local/motion/import' && req.method === 'POST') {
        sendJson(res, 200, importAsset(await readBody()))
        return
      }

      if (pathname === '/local/motion/discard' && req.method === 'POST') {
        const body = await readBody()
        const id = safeId(body.id)
        if (!id || !readMeta(id)) throw new Error('动效工程不存在')
        fs.rmSync(projectDir(id), { recursive: true, force: true })
        sendJson(res, 200, { ok: true })
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
        if ((body.path || 'index.html') === 'index.html') validateMotionCompositionSource(body.content)
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

      if (pathname === '/local/motion/runtime' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, runtime: motionRenderRuntime({ rootDir }) })
        return
      }

      if (pathname === '/local/motion/check' && req.method === 'POST') {
        sendJson(res, 200, await checkProject(await readBody()))
        return
      }

      if (pathname === '/local/motion/studio' && req.method === 'POST') {
        sendJson(res, 200, await startStudio(await readBody()))
        return
      }

      if (pathname === '/local/motion/render/latest' && req.method === 'GET') {
        sendJson(res, 200, latestRender(url.searchParams.get('id') || '', url.searchParams.get('end') || 0))
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
            progress: job.progress,
            probe: job.probe,
            probeError: job.probeError,
            duration: job.duration,
            workers: job.workers,
            startedAt: job.startedRenderingAt || job.createdAt,
            finishedAt: job.finishedAt,
          },
        })
        return
      }

      sendJson(res, 404, { ok: false, error: '未知的动效接口' })
    },
  }
}
