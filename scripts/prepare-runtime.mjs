/**
 * 打包前把渲染引擎需要的 headless Chrome 固定到 .runtime/。
 *
 * 为什么需要它：Stepframe 的界面跑在 Electron 里，但导出 MP4 时要靠
 * HyperFrames 驱动一个真正的无头 Chromium 逐帧出图。官方 CLI 默认在
 * 首次渲染时把 chrome-headless-shell 下载到 ~/.cache，用户装完 App
 * 再等 200MB 下载、离线还导不出来。这里在构建阶段取到官方锁定的版本，
 * 由 electron-builder 一起塞进 Resources/chromium。
 *
 *   npm run prepare:runtime           # 首次会下载（约 200MB），之后秒过
 *   npm run prepare:runtime -- --force
 *   STEPFRAME_CHROME_DIR=/path/to/chrome-headless-shell npm run prepare:runtime
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs')
// 目录名故意不叫 chrome-headless-shell：与可执行文件同名时 codesign 会把
// 可执行文件当成 bundle，去校验同目录的 .pak，App 签名会直接失败。
const targetDir = path.join(root, '.runtime', 'chromium')
const binaryName = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
const force = process.argv.includes('--force')

function fail(message) {
  console.error(`[prepare-runtime] ${message}`)
  process.exit(1)
}

if (!fs.existsSync(cli)) fail('缺少 node_modules/hyperframes，请先执行 npm install。')
if (!fs.existsSync(path.join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'))) {
  fail('缺少 node_modules/gsap，动效工程会无法离线预览，请先执行 npm install。')
}

/** 调官方 CLI 解析/安装浏览器，避免和 CLI 自己锁定的版本脱节。 */
function resolveBrowser() {
  const fromEnv = String(process.env.STEPFRAME_CHROME_DIR || '').trim()
  if (fromEnv) {
    const candidate = path.join(fromEnv, binaryName)
    if (!fs.existsSync(candidate)) fail(`STEPFRAME_CHROME_DIR 里没有 ${binaryName}：${fromEnv}`)
    return candidate
  }

  // 不要在构建时继承开发机已有的浏览器覆盖，否则可能把旧版本打进安装包。
  const env = { ...process.env }
  delete env.HYPERFRAMES_BROWSER_PATH
  delete env.PRODUCER_HEADLESS_SHELL_PATH

  const ensure = spawnSync(process.execPath, [cli, 'browser', 'ensure'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
  })
  if (ensure.status !== 0) {
    fail(`准备 chrome-headless-shell 失败：\n${(ensure.stderr || ensure.stdout || '').slice(-4000)}`)
  }

  const resolved = spawnSync(process.execPath, [cli, 'browser', 'path'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const binary = String(resolved.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
  if (resolved.status !== 0 || !binary || !fs.existsSync(binary)) {
    fail(`无法定位 chrome-headless-shell：\n${(resolved.stdout || resolved.stderr || '').slice(-2000)}`)
  }
  return binary
}

const binary = resolveBrowser()
const sourceDir = path.dirname(binary)
const markerFile = path.join(targetDir, '.source')

function copyBrowser() {
  console.log(`[prepare-runtime] 复制 ${sourceDir} → ${targetDir}`)
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
  fs.chmodSync(path.join(targetDir, binaryName), 0o755)
  fs.writeFileSync(markerFile, `${sourceDir}\n`)
  const version = path.basename(path.dirname(sourceDir))
  const size = Number(
    spawnSync('du', ['-sm', targetDir], { encoding: 'utf8' }).stdout?.trim().split(/\s+/)[0] || 0,
  )
  console.log(`[prepare-runtime] 浏览器完成：${version}（${size || '?'} MB）`)
}

if (!force && fs.existsSync(path.join(targetDir, binaryName))) {
  const marker = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : ''
  if (marker === sourceDir) console.log(`[prepare-runtime] 浏览器已就绪：${targetDir}`)
  else copyBrowser()
} else {
  copyBrowser()
}

/**
 * macOS 上给随包的二进制做 ad-hoc 签名。
 *
 * chrome-headless-shell 从官方包解出来时是 linker-signed，资源信封和文件
 * 对不上；外层 App 做 ad-hoc 签名时会因为它直接失败（code has no resources
 * but signature indicates they must be present）。重签一次就能通过校验，
 * 也让安装包在别的 Mac 上不会显示「已损坏」。
 */
function adhocSign(file) {
  if (process.platform !== 'darwin') return
  if (!fs.existsSync(file)) return
  // Chrome for Testing 的二进制带的是 linker 签名 + 资源信封，直接重签会被
  // codesign 当成 bundle，要求同目录的 .pak 也有签名而失败。先摘掉旧签名，
  // 变成普通可执行文件后再做 ad-hoc 签名。
  spawnSync('codesign', ['--remove-signature', file], { encoding: 'utf8' })
  const signed = spawnSync('codesign', ['--force', '--sign', '-', '--timestamp=none', file], {
    encoding: 'utf8',
  })
  if (signed.status !== 0) {
    fail(`ad-hoc 签名失败：${file}\n${(signed.stderr || signed.stdout || '').slice(-2000)}`)
  }
  const verified = spawnSync('codesign', ['--verify', '--verbose=2', file], { encoding: 'utf8' })
  if (verified.status !== 0) {
    fail(`ad-hoc 签名校验失败：${file}\n${(verified.stderr || verified.stdout || '').slice(-2000)}`)
  }
}

adhocSign(path.join(targetDir, binaryName))

/**
 * FFmpeg 随包分发。优先用 STEPFRAME_FFMPEG_DIR 指定的目录；否则使用
 * devDependencies 里的 ffmpeg-static / @ffprobe-installer（安装时就按当前
 * 平台下载好），复制到 Resources/ffmpeg，用户机器不需要再装 FFmpeg。
 * 注意：ffmpeg-static 的构建带 x264/libpostproc，属于 GPL 构建，分发前
 * 请确认许可证合规；需要 LGPL 构建时改用 STEPFRAME_FFMPEG_DIR 指定。
 */
const ffmpegTarget = path.join(root, '.runtime', 'ffmpeg')
fs.mkdirSync(ffmpegTarget, { recursive: true })
const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'

function resolveFfmpegSources() {
  const explicit = String(process.env.STEPFRAME_FFMPEG_DIR || '').trim()
  if (explicit) return { dir: explicit }
  try {
    const require = createRequire(import.meta.url)
    const ffmpeg = require('ffmpeg-static')
    const ffprobe = require('@ffprobe-installer/ffprobe')?.path
    if (ffmpeg && ffprobe) return { ffmpeg, ffprobe }
  } catch {
    // 没装可选依赖时回退到系统 ffmpeg。
  }
  return null
}

const ffmpegSources = resolveFfmpegSources()
if (ffmpegSources?.dir) {
  for (const name of [ffmpegName, ffprobeName]) {
    const from = path.join(ffmpegSources.dir, name)
    if (!fs.existsSync(from)) fail(`STEPFRAME_FFMPEG_DIR 里没有 ${name}：${ffmpegSources.dir}`)
    fs.copyFileSync(from, path.join(ffmpegTarget, name))
    fs.chmodSync(path.join(ffmpegTarget, name), 0o755)
  }
  console.log(`[prepare-runtime] 已内置 FFmpeg：${ffmpegSources.dir}`)
} else if (ffmpegSources?.ffmpeg) {
  for (const file of [ffmpegSources.ffmpeg, ffmpegSources.ffprobe]) {
    if (!fs.existsSync(file)) fail(`FFmpeg 依赖文件不存在：${file}`)
    const name = path.basename(file)
    fs.copyFileSync(file, path.join(ffmpegTarget, name))
    fs.chmodSync(path.join(ffmpegTarget, name), 0o755)
  }
  console.log('[prepare-runtime] 已内置 FFmpeg（ffmpeg-static / ffprobe-installer）')
} else if (!fs.existsSync(path.join(ffmpegTarget, ffmpegName))) {
  console.log('[prepare-runtime] 未找到可打包的 FFmpeg，安装包将使用用户系统的 ffmpeg。')
}

adhocSign(path.join(ffmpegTarget, ffmpegName))
adhocSign(path.join(ffmpegTarget, ffprobeName))
