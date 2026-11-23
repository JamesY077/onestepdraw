#!/usr/bin/env node
/**
 * 步帧资源生成 CLI —— 给本机 Agent 调用。
 *
 * 用法：
 *   node scripts/onestep-generate.mjs image --prompt "画面描述" [--ratio 16:9]
 *   node scripts/onestep-generate.mjs video --prompt "镜头描述" [--ratio 16:9] [--resolution 768P] [--duration 5]
 *
 * 依赖环境变量：
 *   AIPING_API_KEY    必填
 *   AIPING_BASE_URL   可选，默认 https://aiping.cn/api/v1
 *
 * 生成结果保存到项目根目录的 generated/，并在 stdout 打印 Markdown 可用的
 * /generated/... 链接（本地服务会托管这个目录）。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'generated')

const API_BASE = (process.env.AIPING_BASE_URL || 'https://aiping.cn/api/v1').replace(/\/+$/, '')
const API_KEY = process.env.AIPING_API_KEY || process.env.AIPING_KEY || ''

const IMAGE_MODEL = process.env.ONESTEP_IMAGE_MODEL || 'Doubao-Seedream-5.0-lite'
const VIDEO_MODEL = process.env.ONESTEP_VIDEO_MODEL || 'MiniMax-H3'

const IMAGE_SIZES = {
  '21:9': '3136x1344',
  '16:9': '2848x1600',
  '3:2': '2496x1664',
  '4:3': '2304x1728',
  '1:1': '2048x2048',
  '3:4': '1728x2304',
  '2:3': '1664x2496',
  '9:16': '1600x2848',
}

const VIDEO_RATIOS = ['16:9', '9:16', '1:1']

function parseArgs(argv) {
  const [kind, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = rest[index + 1]
    if (value === undefined || value.startsWith('--')) {
      options[key] = 'true'
      continue
    }
    options[key] = value
    index += 1
  }
  return { kind, options }
}

function fail(message) {
  console.error(`错误：${message}`)
  process.exit(1)
}

async function api(pathname, { method = 'GET', body, timeoutMs = 180_000 } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    fail(`连接 AIPing 失败：${error?.message || error}`)
  }

  const raw = await response.text()
  let data = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = { raw }
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      data?.message ||
      data?.msg ||
      data?.detail ||
      raw.slice(0, 300) ||
      response.statusText
    fail(`AIPing 请求失败（${response.status}）：${detail}`)
  }

  return data
}

function timestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function extensionOf(url, fallback) {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase()
    if (extension) return extension
  } catch {
    // data: URL 或非法 URL 时用兜底扩展名。
  }
  return fallback
}

async function saveBuffer(buffer, filename, fallback) {
  await fs.mkdir(outputDir, { recursive: true })
  const filePath = path.join(outputDir, filename)
  await fs.writeFile(filePath, buffer)
  return {
    absolutePath: filePath,
    relativePath: `/generated/${path.basename(filePath)}`,
    extension: path.extname(filePath).slice(1) || fallback,
  }
}

async function saveRemote(url, filenamePrefix, fallbackExtension) {
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1] || ''
    const buffer = Buffer.from(base64, 'base64')
    return saveBuffer(buffer, `${filenamePrefix}.${fallbackExtension}`, fallbackExtension)
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) throw new Error(`下载生成结果失败（${response.status}）。`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const extension = extensionOf(url, fallbackExtension).replace('.', '')
  return saveBuffer(buffer, `${filenamePrefix}.${extension}`, extension)
}

async function generateImage(options) {
  const prompt = String(options.prompt || '').trim()
  if (!prompt) fail('image 需要 --prompt 参数。')

  const ratio = IMAGE_SIZES[options.ratio] ? options.ratio : options.size && IMAGE_SIZES[options.size] ? options.size : '16:9'
  const data = await api('/images/generations', {
    method: 'POST',
    body: {
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZES[ratio],
      output_format: 'png',
      watermark: false,
      sequential_image_generation: 'disabled',
    },
  })

  const urls = (Array.isArray(data?.data) ? data.data : [])
    .map((item) => (item?.url ? item.url : item?.b64_json ? `data:image/png;base64,${item.b64_json}` : ''))
    .filter(Boolean)

  if (!urls.length) fail('图片生成成功，但没有返回图片地址。')

  const files = []
  for (let index = 0; index < urls.length; index += 1) {
    const file = await saveRemote(urls[index], `${timestamp()}-image-${index + 1}`, 'png')
    files.push(file)
  }

  console.log(`图片生成完成（${IMAGE_MODEL}，${ratio}）。`)
  files.forEach((file, index) => {
    console.log(`图片 ${index + 1}：${file.absolutePath}`)
    console.log(`Markdown：![结果 ${index + 1}](${file.relativePath})`)
  })
}

function readTaskId(data) {
  const task = data?.task || data?.data?.task || data?.data || data
  return String(task?.task_id || task?.id || '')
}

function readVideoStatus(data) {
  const task = data?.task || data?.data?.task || data?.data || data
  return {
    status: String(task?.status || task?.state || 'pending').toLowerCase(),
    videoUrl:
      task?.content?.url || task?.content?.video_url || task?.video_url || task?.url || '',
    coverUrl: task?.content?.cover_url || task?.cover_url || task?.thumbnail || '',
    error: task?.error?.message || task?.error || task?.err_msg || '',
  }
}

async function generateVideo(options) {
  const prompt = String(options.prompt || '').trim()
  if (!prompt) fail('video 需要 --prompt 参数。')

  const ratio = VIDEO_RATIOS.includes(options.ratio) ? options.ratio : '16:9'
  const resolution = String(options.resolution || '').toUpperCase() === '2K' ? '2K' : '768P'
  const duration = Math.min(15, Math.max(4, Math.round(Number(options.duration) || 5)))

  const created = await api('/multimodal/minimax/videos/video_generation', {
    method: 'POST',
    body: {
      model: VIDEO_MODEL,
      content: [{ type: 'text', text: prompt }],
      resolution,
      duration,
      ratio,
    },
  })

  const taskId = readTaskId(created)
  if (!taskId) fail('视频任务创建成功，但没有返回任务 ID。')

  console.log(`视频任务已创建（${VIDEO_MODEL}，${ratio}，${resolution}，${duration}s）。`)
  console.log(`task_id：${taskId}`)
  console.log('开始等待生成结果，通常需要 1–5 分钟…')

  const deadline = Date.now() + 20 * 60 * 1000
  let last = { status: 'pending', videoUrl: '', coverUrl: '', error: '' }

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const data = await api(
      `/multimodal/minimax/videos/query/video_generation/${encodeURIComponent(taskId)}`,
      { timeoutMs: 60_000 },
    )
    last = readVideoStatus(data)

    if (['completed', 'succeed', 'succeeded', 'success', 'done'].includes(last.status)) break
    if (['failed', 'error', 'cancelled', 'expired'].includes(last.status)) {
      fail(last.error || `视频生成失败（task: ${taskId}）。`)
    }
  }

  if (!last.videoUrl) {
    fail(`等待超时，视频仍在生成（task: ${taskId}）。可以稍后用同一 task_id 查询。`)
  }

  const video = await saveRemote(last.videoUrl, `${timestamp()}-video`, 'mp4')
  let cover = null
  if (last.coverUrl) {
    try {
      cover = await saveRemote(last.coverUrl, `${timestamp()}-video-cover`, 'png')
    } catch {
      cover = null
    }
  }

  console.log('视频生成完成。')
  console.log(`视频：${video.absolutePath}`)
  if (cover) console.log(`封面：${cover.absolutePath}`)
  if (cover) console.log(`Markdown：![视频封面](${cover.relativePath})`)
  console.log(`播放链接：[点击播放视频](${video.relativePath})`)
  console.log(`Video URL：${video.relativePath}`)
}

async function main() {
  if (!API_KEY) {
    fail('缺少 AIPING_API_KEY。请在步帧页面登录后，由本地服务注入，或手动 export AIPING_API_KEY=sk-...')
  }

  const { kind, options } = parseArgs(process.argv.slice(2))
  if (kind === 'image') {
    await generateImage(options)
    return
  }
  if (kind === 'video') {
    await generateVideo(options)
    return
  }

  console.log('用法：')
  console.log('  node scripts/onestep-generate.mjs image --prompt "画面描述" [--ratio 16:9]')
  console.log('  node scripts/onestep-generate.mjs video --prompt "镜头描述" [--ratio 16:9] [--resolution 768P] [--duration 5]')
  if (kind) process.exit(1)
}

main().catch((error) => fail(error?.message || String(error)))
