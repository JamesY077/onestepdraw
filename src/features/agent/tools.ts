import type { AgentGeneration, AgentGenerationKind } from '@/types/agent'

/** 对话 Agent 默认使用的图片 / 视频模型。 */
export const AGENT_IMAGE_MODEL = 'Doubao-Seedream-5.0-lite'
export const AGENT_IMAGE_MODEL_LABEL = 'Seedream 5.0 Lite'
export const AGENT_VIDEO_MODEL = 'MiniMax-H3'
export const AGENT_VIDEO_MODEL_LABEL = 'MiniMax H3'

export const AGENT_IMAGE_ASPECT_RATIOS = ['16:9', '4:3', '3:4', '1:1', '9:16'] as const
export const AGENT_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const
export const AGENT_IMAGE_DEFAULT_ASPECT = '16:9'
export const AGENT_VIDEO_DEFAULT_ASPECT = '16:9'
export const AGENT_VIDEO_DEFAULT_RESOLUTION = '768P'
export const AGENT_VIDEO_DEFAULT_DURATION = 5
export const AGENT_VIDEO_MIN_DURATION = 4
export const AGENT_VIDEO_MAX_DURATION = 15

export type AgentToolName = 'generate_image' | 'generate_video'

export interface AgentToolCall {
  name: AgentToolName
  args: Record<string, unknown>
}

export const AGENT_TOOL_NAMES: AgentToolName[] = ['generate_image', 'generate_video']

/**
 * 去掉助手回复里的工具调用块。
 * 流式输出时工具块可能还没闭合，因此未闭合的尾巴也一并裁掉。
 */
export function stripAgentToolBlocks(content: string): string {
  let text = content.replace(/```(?:onestep-tool|json|tool)?[ \t]*\r?\n[\s\S]*?```/g, (block) =>
    isAgentToolJson(block) ? '' : block,
  )

  const openIndex = text.lastIndexOf('```onestep-tool')
  if (openIndex >= 0 && text.indexOf('```', openIndex + 3) < 0) {
    text = text.slice(0, openIndex)
  }

  // 去掉模型直接输出的裸 JSON 工具块。
  text = removeLooseToolJson(text)

  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** 从助手回复中提取工具调用（支持多个，实际只执行第一个）。 */
export function extractAgentToolCalls(content: string): AgentToolCall[] {
  const calls: AgentToolCall[] = []
  const fence = /```(?:onestep-tool|json|tool)?[ \t]*\r?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fence.exec(content))) {
    const call = parseToolJson(match[1])
    if (call) calls.push(call)
  }

  // 兼容模型忘记闭合代码块的情况。
  const openIndex = content.lastIndexOf('```onestep-tool')
  if (openIndex >= 0 && content.indexOf('```', openIndex + 3) < 0) {
    const call = parseToolJson(content.slice(openIndex + '```onestep-tool'.length))
    if (call) calls.push(call)
  }

  // 兼容模型直接输出裸 JSON 的情况（只在代码块之外扫描）。
  const withoutFences = content.replace(/```[\s\S]*?```/g, ' ')
  calls.push(...collectLooseToolCalls(withoutFences))

  return calls
}

/** 把工具调用转换成可直接渲染与执行的生成任务。 */
export function buildAgentGeneration(call: AgentToolCall): AgentGeneration | null {
  const prompt = asText(call.args.prompt || call.args.text || call.args.description)
  if (!prompt) return null

  const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const createdAt = Date.now()

  if (call.name === 'generate_image') {
    return {
      id,
      kind: 'image',
      status: 'running',
      prompt,
      model: AGENT_IMAGE_MODEL,
      modelLabel: AGENT_IMAGE_MODEL_LABEL,
      aspectRatio: normalizeOption(call.args.aspect_ratio || call.args.ratio, AGENT_IMAGE_ASPECT_RATIOS, AGENT_IMAGE_DEFAULT_ASPECT),
      createdAt,
    }
  }

  const duration = normalizeDuration(call.args.duration)
  const resolution = String(call.args.resolution || '').toUpperCase() === '2K' ? '2K' : AGENT_VIDEO_DEFAULT_RESOLUTION

  return {
    id,
    kind: 'video',
    status: 'running',
    prompt,
    model: AGENT_VIDEO_MODEL,
    modelLabel: AGENT_VIDEO_MODEL_LABEL,
    aspectRatio: normalizeOption(call.args.aspect_ratio || call.args.ratio, AGENT_VIDEO_ASPECT_RATIOS, AGENT_VIDEO_DEFAULT_ASPECT),
    resolution,
    duration,
    createdAt,
  }
}

export function describeAgentGeneration(generation: AgentGeneration): string {
  if (generation.kind === 'image') {
    return `${generation.aspectRatio} · ${generation.modelLabel}`
  }
  return `${generation.aspectRatio} · ${generation.resolution} · ${generation.duration}s · ${generation.modelLabel}`
}

export function getGenerationKindLabel(kind: AgentGenerationKind): string {
  return kind === 'image' ? '图片' : '视频'
}

function normalizeOption(
  value: unknown,
  options: readonly string[],
  fallback: string,
): string {
  const raw = String(value ?? '').trim().replace(/\s+/g, '').replace('：', ':').replace(/×/g, ':')
  if (!raw) return fallback
  if (options.includes(raw)) return raw
  // 常见写法：「方图」「竖屏」「横屏」。
  if (raw === '横屏') return '16:9'
  if (raw === '竖屏') return '9:16'
  if (raw === '方图' || raw === '正方形') return '1:1'
  return fallback
}

function normalizeDuration(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return AGENT_VIDEO_DEFAULT_DURATION
  return Math.min(AGENT_VIDEO_MAX_DURATION, Math.max(AGENT_VIDEO_MIN_DURATION, Math.round(number)))
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join(' ')
      .trim()
  }
  return ''
}

function collectLooseToolCalls(text: string): AgentToolCall[] {
  const calls: AgentToolCall[] = []
  let index = 0

  while (index < text.length) {
    const start = text.indexOf('{', index)
    if (start < 0) break
    const end = findJsonEnd(text, start)
    if (end < 0) {
      index = start + 1
      continue
    }
    const slice = text.slice(start, end + 1)
    if (slice.includes('"tool"')) {
      const call = parseToolJson(slice)
      if (call) calls.push(call)
    }
    index = end + 1
  }

  return calls
}

function removeLooseToolJson(text: string): string {
  let result = ''
  let index = 0

  while (index < text.length) {
    const start = text.indexOf('{', index)
    if (start < 0) {
      result += text.slice(index)
      break
    }
    const end = findJsonEnd(text, start)
    if (end < 0) {
      result += text.slice(index)
      break
    }
    const slice = text.slice(start, end + 1)
    result += text.slice(index, start)
    if (!(slice.includes('"tool"') && parseToolJson(slice))) result += slice
    index = end + 1
  }

  return result
}

function findJsonEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function parseToolJson(raw: string): AgentToolCall | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  if (!trimmed) return null

  let parsed: any
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  // 兼容 {"tool":"generate_image","args":{...}} 与 {"name":"generate_image",...}
  const name = parsed?.tool || parsed?.name || parsed?.action
  if (typeof name !== 'string' || !AGENT_TOOL_NAMES.includes(name as AgentToolName)) return null
  const args = parsed?.args || parsed?.arguments || parsed?.parameters || parsed?.input
  return {
    name: name as AgentToolName,
    args: args && typeof args === 'object' ? (args as Record<string, unknown>) : parsed,
  }
}

function isAgentToolJson(block: string): boolean {
  const body = block.replace(/^```[^\n]*\n?/, '').replace(/```\s*$/, '')
  return !!parseToolJson(body)
}
