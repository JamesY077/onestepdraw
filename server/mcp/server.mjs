#!/usr/bin/env node
/**
 * OneStep MCP Server（stdio）
 *
 * 把 OneStep 内置的图片 / 视频生成能力暴露给支持 MCP 的 Agent
 * （Claude Code、Cursor、Codex、Claude Desktop 等）。
 *
 * 配置环境变量后运行：
 *   AIPING_API_KEY=sk-xxxx node server/mcp/server.mjs
 *
 * 可选环境变量：
 *   AIPING_BASE_URL      默认 https://aiping.cn/api/v1
 *   ONESTEP_IMAGE_MODEL  默认 Doubao-Seedream-5.0-lite
 *   ONESTEP_VIDEO_MODEL  默认 MiniMax-H3
 *
 * 注意：stdout 专用于 MCP JSON-RPC，日志一律写入 stderr。
 */

import readline from 'node:readline'

const SERVER_NAME = 'onestep'
const SERVER_VERSION = '1.0.0'
const DEFAULT_PROTOCOL_VERSION = '2024-11-05'

const API_BASE = (
  process.env.AIPING_BASE_URL ||
  process.env.AIPING_API_BASE ||
  'https://aiping.cn/api/v1'
).replace(/\/+$/, '')
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
const IMAGE_RATIOS = Object.keys(IMAGE_SIZES)
const VIDEO_RATIOS = ['16:9', '9:16', '1:1']

const TOOLS = [
  {
    name: 'generate_image',
    description:
      '使用 OneStep 内置的 Seedream 5.0 Lite 文生图模型生成图片。默认 16:9 比例，生成后返回图片 URL。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '完整的中文画面描述，包含主体、场景、构图、光线、风格与质感。',
        },
        aspect_ratio: {
          type: 'string',
          enum: IMAGE_RATIOS,
          default: '16:9',
          description: '画面比例，默认 16:9。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_video',
    description:
      '使用 OneStep 内置的 MiniMax H3 模型生成视频。默认 16:9、768P、5 秒。默认会等待任务完成并返回视频 URL；也可以传 wait=false 立即返回任务 ID，再用 check_video 查询。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '完整的中文镜头描述，包含主体动作、运镜、场景与氛围。',
        },
        aspect_ratio: {
          type: 'string',
          enum: VIDEO_RATIOS,
          default: '16:9',
          description: '画面比例，默认 16:9。',
        },
        resolution: {
          type: 'string',
          enum: ['768P', '2K'],
          default: '768P',
          description: '分辨率档位，默认 768P。',
        },
        duration: {
          type: 'integer',
          minimum: 4,
          maximum: 15,
          default: 5,
          description: '视频时长（秒），默认 5。',
        },
        wait: {
          type: 'boolean',
          default: true,
          description: '是否等待视频生成完成。false 时立即返回 task_id。',
        },
        wait_seconds: {
          type: 'integer',
          minimum: 10,
          maximum: 900,
          default: 480,
          description: '等待生成完成的最长时间（秒），默认 480。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_video',
    description: '查询 OneStep 视频任务状态；任务完成时直接返回视频 URL。',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'generate_video 返回的任务 ID。' },
        wait_seconds: {
          type: 'integer',
          minimum: 0,
          maximum: 900,
          default: 120,
          description: '最长等待时间（秒），默认 120；0 表示只查询一次当前状态。',
        },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
]

/* ------------------------------------------------------------------ 基础设施 */

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function log(...args) {
  console.error('[onestep-mcp]', ...args)
}

function textResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function normalizeRatio(value, options, fallback) {
  const ratio = String(value || '').trim().replace(/\s+/g, '').replace('：', ':')
  return options.includes(ratio) ? ratio : fallback
}

async function api(path, { method = 'GET', body, timeoutMs = 120_000 } = {}) {
  if (!API_KEY) {
    throw new Error('缺少 AIPING_API_KEY。请在 MCP 配置的环境变量里填写 AIPing API Key。')
  }

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new Error(`连接 AIPing 失败：${error?.message || error}`)
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
      raw?.slice(0, 300) ||
      response.statusText
    throw new Error(`AIPing 请求失败（${response.status}）：${detail}`)
  }

  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readTaskId(data) {
  const task = data?.task || data?.data?.task || data?.data || data
  return String(task?.task_id || task?.id || '')
}

function readVideoStatus(data) {
  const task = data?.task || data?.data?.task || data?.data || data
  const videoUrl =
    task?.content?.url || task?.content?.video_url || task?.video_url || task?.url || ''
  return {
    status: String(task?.status || task?.state || 'pending').toLowerCase(),
    videoUrl,
    thumbnail: task?.content?.cover_url || task?.cover_url || task?.thumbnail || '',
    error: task?.error?.message || task?.error || task?.err_msg || task?.message || '',
    raw: task,
  }
}

async function pollVideo(taskId, waitSeconds) {
  const deadline = Date.now() + Math.max(0, waitSeconds) * 1000
  let last = { status: 'pending', videoUrl: '', thumbnail: '', error: '' }

  while (true) {
    try {
      const data = await api(
        `/multimodal/minimax/videos/query/video_generation/${encodeURIComponent(taskId)}`,
        { timeoutMs: 60_000 },
      )
      last = readVideoStatus(data)
    } catch (error) {
      log('查询视频状态失败：', error?.message || error)
    }

    if (['completed', 'succeed', 'succeeded', 'success', 'done'].includes(last.status)) return last
    if (['failed', 'error', 'cancelled', 'expired'].includes(last.status)) {
      throw new Error(last.error || `视频生成失败（task: ${taskId}）`)
    }
    if (Date.now() >= deadline) return last
    await sleep(5000)
  }
}

/* ------------------------------------------------------------------ 工具实现 */

async function generateImage(args = {}) {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) throw new Error('prompt 不能为空。')

  const aspectRatio = normalizeRatio(args.aspect_ratio, IMAGE_RATIOS, '16:9')
  const data = await api('/images/generations', {
    method: 'POST',
    timeoutMs: 180_000,
    body: {
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZES[aspectRatio],
      output_format: 'png',
      watermark: false,
      sequential_image_generation: 'disabled',
    },
  })

  const images = (Array.isArray(data?.data) ? data.data : [])
    .map((item) => (item?.url ? item.url : item?.b64_json ? `data:image/png;base64,${item.b64_json}` : ''))
    .filter(Boolean)

  if (!images.length) throw new Error('图片生成成功，但没有返回图片地址。')

  const lines = [
    `已生成 ${images.length} 张图片（${IMAGE_MODEL}，${aspectRatio}）。`,
    '',
    ...images.map((url, index) => `${index + 1}. ${url}`),
    '',
    '提示：上游返回的图片链接为临时地址，请及时下载保存。',
  ]
  return textResult(lines.join('\n'))
}

async function generateVideo(args = {}) {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) throw new Error('prompt 不能为空。')

  const aspectRatio = normalizeRatio(args.aspect_ratio, VIDEO_RATIOS, '16:9')
  const resolution = String(args.resolution || '').toUpperCase() === '2K' ? '2K' : '768P'
  const duration = clampNumber(args.duration, 4, 15, 5)
  const wait = args.wait !== false
  const waitSeconds = clampNumber(args.wait_seconds, 10, 900, 480)

  const data = await api('/multimodal/minimax/videos/video_generation', {
    method: 'POST',
    timeoutMs: 120_000,
    body: {
      model: VIDEO_MODEL,
      content: [{ type: 'text', text: prompt }],
      resolution,
      duration,
      ratio: aspectRatio,
    },
  })

  const taskId = readTaskId(data)
  if (!taskId) throw new Error('视频任务创建成功，但没有返回任务 ID。')

  if (!wait) {
    return textResult(
      [
        `视频任务已创建（${VIDEO_MODEL}，${aspectRatio}，${resolution}，${duration}s）。`,
        `task_id: ${taskId}`,
        '',
        '任务仍在生成中，请稍后调用 check_video 查询结果。',
      ].join('\n'),
    )
  }

  const final = await pollVideo(taskId, waitSeconds)
  if (final.videoUrl) {
    return textResult(
      [
        `视频生成完成（${VIDEO_MODEL}，${aspectRatio}，${resolution}，${duration}s）。`,
        '',
        final.videoUrl,
        '',
        '提示：上游返回的视频链接为临时地址，请及时下载保存。',
      ].join('\n'),
    )
  }

  return textResult(
    [
      `视频仍在生成中（当前状态：${final.status}）。`,
      `task_id: ${taskId}`,
      '',
      '请稍后再次调用 check_video 查询结果。',
    ].join('\n'),
  )
}

async function checkVideo(args = {}) {
  const taskId = String(args.task_id || '').trim()
  if (!taskId) throw new Error('task_id 不能为空。')
  const waitSeconds = clampNumber(args.wait_seconds, 0, 900, 120)

  const final = await pollVideo(taskId, waitSeconds)
  if (final.videoUrl) {
    return textResult([`视频生成完成（task: ${taskId}）。`, '', final.videoUrl].join('\n'))
  }
  return textResult(
    [
      `视频仍在生成中（当前状态：${final.status}，task: ${taskId}）。`,
      '请稍后再次调用 check_video。',
    ].join('\n'),
  )
}

const HANDLERS = {
  generate_image: generateImage,
  generate_video: generateVideo,
  check_video: checkVideo,
}

/* ------------------------------------------------------------------ JSON-RPC */

async function handleRequest(message) {
  const { id, method, params } = message || {}

  // 通知消息（无 id）不需要响应。
  if (id === undefined || id === null) return

  if (method === 'initialize') {
    const requested = params?.protocolVersion
    sendResult(id, {
      protocolVersion: typeof requested === 'string' && requested ? requested : DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        title: 'OneStep 图片 / 视频生成',
      },
      instructions:
        'OneStep MCP 提供图片与视频生成。图片默认 Seedream 5.0 Lite + 16:9；视频默认 MiniMax H3 + 16:9 + 768P + 5 秒。',
    })
    return
  }

  if (method === 'ping') {
    sendResult(id, {})
    return
  }

  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS })
    return
  }

  if (method === 'tools/call') {
    const name = params?.name
    const args = params?.arguments || {}
    const handler = HANDLERS[name]
    if (!handler) {
      sendResult(id, textResult(`未知工具：${name}`, true))
      return
    }
    try {
      sendResult(id, await handler(args))
    } catch (error) {
      log(`工具 ${name} 执行失败：`, error?.message || error)
      sendResult(id, textResult(error?.message || '执行失败，请稍后重试。', true))
    }
    return
  }

  sendError(id, -32601, `未实现的方法：${method}`)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let message
  try {
    message = JSON.parse(trimmed)
  } catch {
    log('收到无法解析的消息，已忽略。')
    return
  }
  handleRequest(message).catch((error) => {
    log('处理请求失败：', error?.message || error)
    if (message?.id !== undefined && message?.id !== null) {
      sendError(message.id, -32603, error?.message || '内部错误')
    }
  })
})

rl.on('close', () => {
  process.exit(0)
})

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

log(`已启动，接口：${API_BASE}${API_KEY ? '' : '（未设置 AIPING_API_KEY）'}`)
