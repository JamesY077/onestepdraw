import type {
  AgentAsk,
  AgentAskOption,
  AgentCreativeHandoff,
  AgentGeneration,
  AgentGenerationKind,
} from '@/types/agent'

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

export type AgentToolName =
  | 'generate_image'
  | 'generate_video'
  | 'generate_storyboard'
  | 'open_voice'
  | 'open_3d'
  | 'update_plan'
  | 'read_project'
  | 'edit_timeline'
  | 'suggest_create_mode'
  | 'list_motion_templates'
  | 'read_motion_template'
  | 'create_motion_project'
  | 'read_motion_project'
  | 'write_motion_project'
  | 'render_motion_project'

export interface AgentToolCall {
  id?: string
  name: AgentToolName
  args: Record<string, unknown>
  /** 原生工具参数原始 JSON，供下一步 assistant/tool 历史无损配对。 */
  rawArguments?: string
  /** 原生工具参数不是合法 JSON 时保留错误，回注模型让它自我修正。 */
  argumentError?: string
}

/** 对话式时间轴操作：模型只说「怎么改」，由本地直接落到项目里。 */
export interface AgentTimelineOp {
  op: 'move' | 'trim' | 'delete' | 'volume' | 'opacity'
  clipId: string
  start?: number
  duration?: number
  value?: number
}

export const AGENT_TOOL_NAMES: AgentToolName[] = [
  'generate_image',
  'generate_video',
  'generate_storyboard',
  'open_voice',
  'open_3d',
  'update_plan',
  'read_project',
  'edit_timeline',
  'suggest_create_mode',
  'list_motion_templates',
  'read_motion_template',
  'create_motion_project',
  'read_motion_project',
  'write_motion_project',
  'render_motion_project',
]

const TIMELINE_FENCE = /```onestep-timeline[ \t]*\r?\n([\s\S]*?)```/g

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** 原生工具与旧文本协议共用同一份参数白名单和归一化逻辑。 */
export function normalizeAgentTimelineOps(value: unknown): AgentTimelineOp[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as any).ops)
      ? (value as any).ops
      : []
  if (list.length > 30) return []
  const ops: AgentTimelineOp[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const op = String(raw.op || '')
    const clipId = String(raw.clipId || raw.id || '')
    if (!clipId || !['move', 'trim', 'delete', 'volume', 'opacity'].includes(op)) continue
    const start = optionalNumber(raw.start)
    const duration = optionalNumber(raw.duration)
    const fieldValue = optionalNumber(raw.value)
    if (op === 'move' && start === undefined) continue
    if (op === 'trim' && start === undefined && duration === undefined) continue
    if ((op === 'volume' || op === 'opacity') && fieldValue === undefined) continue
    ops.push({
      op: op as AgentTimelineOp['op'],
      clipId,
      start,
      duration,
      value: fieldValue,
    })
  }
  return ops
}

/** 从回复里提取时间轴操作块。 */
export function extractAgentTimelineOps(content: string): AgentTimelineOp[] {
  const ops: AgentTimelineOp[] = []
  let match: RegExpExecArray | null
  TIMELINE_FENCE.lastIndex = 0
  while ((match = TIMELINE_FENCE.exec(content))) {
    try {
      ops.push(...normalizeAgentTimelineOps(JSON.parse(match[1].trim())))
    } catch {
      // 旧协议中的非法块不执行；原生协议会把参数错误回注给模型。
    }
  }
  return ops
}

/** 去掉时间轴操作块，避免把 JSON 显示给用户。 */
export function stripAgentTimelineBlocks(content: string): string {
  return content
    .replace(/```onestep-timeline[ \t]*\r?\n[\s\S]*?```/g, '')
    .replace(/```onestep-timeline[\s\S]*$/, '')
    .trim()
}

const CREATIVE_HANDOFF_FENCE = /```onestep-mode-handoff[ \t]*\r?\n([\s\S]*?)```/

export function normalizeAgentCreativeHandoff(value: unknown): AgentCreativeHandoff | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.target !== 'create') return null
  const reason = String(raw.reason || '').trim().slice(0, 120)
  const prompt = String(raw.prompt || '').trim().slice(0, 12000)
  if (!reason || !prompt) return null
  return { target: 'create', reason, prompt, status: 'pending' }
}

/** 普通模式的结构化交接建议；解析不代表已获用户授权。 */
export function extractAgentCreativeHandoff(content: string): AgentCreativeHandoff | null {
  const match = CREATIVE_HANDOFF_FENCE.exec(content)
  if (!match) return null
  try {
    return normalizeAgentCreativeHandoff(JSON.parse(match[1].trim()))
  } catch {
    return null
  }
}

export function stripAgentCreativeHandoffBlocks(content: string): string {
  return content
    .replace(/```onestep-mode-handoff[ \t]*\r?\n[\s\S]*?```/g, '')
    .replace(/```onestep-mode-handoff[\s\S]*$/, '')
}

const ASK_FENCE = /```onestep-ask[ \t]*\r?\n([\s\S]*?)```/

/**
 * 从回复里解析「一次一个问题」的选择题。
 * 结构来自 ```onestep-ask { ... }```；只有前三个选项 + 自定义，最多四个。
 */
export function extractAgentAsk(content: string): AgentAsk | null {
  const match = ASK_FENCE.exec(content)
  if (!match) return null

  let parsed: any
  try {
    parsed = JSON.parse(match[1].trim())
  } catch {
    return null
  }

  const question = String(parsed?.question || parsed?.q || '').trim()
  if (!question) return null

  const rawOptions = Array.isArray(parsed?.options) ? parsed.options : []
  const options: AgentAskOption[] = []
  for (const raw of rawOptions.slice(0, 3)) {
    const label =
      typeof raw === 'string' ? raw.trim() : String(raw?.label || raw?.text || raw?.title || '').trim()
    if (!label) continue
    options.push({
      id: String(options.length + 1),
      label,
      recommended: Boolean(raw?.recommended || raw?.pick || raw?.isRecommended),
      hint: typeof raw === 'object' ? String(raw?.hint || raw?.detail || '').trim() || undefined : undefined,
    })
  }
  if (options.length < 2) return null

  const customHint = String(parsed?.custom?.hint || parsed?.customHint || '').trim()

  return {
    header: String(parsed?.header || parsed?.topic || parsed?.title || '').trim() || '确认一下',
    question,
    options,
    customHint: customHint || undefined,
    allowCustom: parsed?.allowCustom !== false,
  }
}

/** 流式输出时，未闭合的 ask 块也要从正文里裁掉。 */
export function stripAgentAskBlocks(content: string): string {
  return content
    .replace(/```onestep-ask[ \t]*\r?\n[\s\S]*?```/g, '')
    .replace(/```onestep-ask[\s\S]*$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 兜底：模型没按 ask 块输出，而是写了「❓ Q1 · 动作 / 1. … / 4. 自定义…」时，
 * 也把它收成同一张选择题卡片，避免又要用户手打数字。
 */
export function extractLegacyAsk(content: string): { ask: AgentAsk; rest: string } | null {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => /^\s*(?:❓|\?\ufe0f?)\s*/.test(line) && /Q\s*\d|·/.test(line))
  if (start < 0) return null

  const headerLine = lines[start].replace(/^\s*(?:❓|\?\ufe0f?)\s*/, '')
  const parts = headerLine
    .replace(/\*+/g, '')
    .split(/[·:：]/)
    .map((part) => part.trim())
    .filter(Boolean)
  let header = parts[0] || ''
  // 「Q1 · 动作」只保留「动作」
  if (/^Q\s*\d+$/i.test(header)) header = parts[1] || header

  let cursor = start + 1
  while (cursor < lines.length && !lines[cursor].trim()) cursor += 1
  if (cursor >= lines.length) return null
  const question = lines[cursor].replace(/^[*\s]+/, '').replace(/\*+$/g, '').trim()
  if (!question) return null
  cursor += 1

  const options: AgentAskOption[] = []
  let customHint = ''
  let end = cursor
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    const optionMatch = /^\s*(?:[-*]\s*)?(\d)[.、)]\s*(.+)$/.exec(line)
    if (!optionMatch) {
      if (!line.trim() && options.length) break
      if (options.length) break
      continue
    }
    const index = Number(optionMatch[1])
    let label = optionMatch[2].replace(/\*+/g, '').trim()
    const recommended = /(?:←|<-|＜-)\s*推荐/.test(label)
    label = label.replace(/\s*(?:←|<-|＜-)\s*推荐\s*$/, '').trim()
    if (index === 4 || /^自定义/.test(label)) {
      customHint = label.replace(/^自定义\s*[:：]?\s*/, '').trim()
    } else if (index <= 3 && label) {
      options.push({ id: String(options.length + 1), label, recommended })
    }
    end = cursor
  }

  if (options.length < 2) return null

  // 顺手去掉「回复 1 / 2 / 3 直接选」这类文字提示，卡片上已经用不到了。
  if (lines[end + 1] !== undefined && /^\s*回复\s*\d/.test(lines[end + 1])) end += 1

  return {
    ask: {
      header: header || '确认一下',
      question,
      options,
      customHint: customHint || undefined,
      allowCustom: true,
    },
    rest: [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  }
}


/** 展示用：同时去掉生成工具块、时间轴操作块与选择题块。 */
export function stripAgentControlBlocks(content: string): string {
  return stripAgentCreativeHandoffBlocks(
    stripAgentAskBlocks(stripAgentTimelineBlocks(stripAgentToolBlocks(content))),
  ).trim()
}

const MEDIA_EXT: Record<string, 'image' | 'video' | 'audio'> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  avif: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
}

/** 本机 Agent 直接输出媒体链接时，抽出可入轨的素材。 */
export function extractMediaUrls(content: string): Array<{
  kind: 'image' | 'video' | 'audio'
  url: string
}> {
  const found: Array<{ kind: 'image' | 'video' | 'audio'; url: string }> = []
  const seen = new Set<string>()
  const matcher = /(https?:\/\/[^\s)"'<>]+|\/generated\/[^\s)"'<>]+)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(content))) {
    const url = match[1].replace(/[.,;，。；]+$/, '')
    if (seen.has(url)) continue
    const clean = url.split('?')[0].split('#')[0]
    const ext = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase()
    const kind = MEDIA_EXT[ext]
    if (!kind) continue
    seen.add(url)
    found.push({ kind, url })
  }
  return found
}


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

/** 从助手回复中提取旧文本工具调用；Harness 按模型顺序执行，旧单步收尾只取首个。 */
export function extractAgentToolCalls(content: string): AgentToolCall[] {
  const calls: AgentToolCall[] = []
  const fence = /```(?:onestep-tool|json|tool)?[ \t]*\r?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = fence.exec(content))) {
    const call = parseToolJson(match[1])
    if (call) calls.push(call)
  }

  // 兼容模型忘记闭合代码块的情况；该区域必须从后续裸 JSON 扫描中排除，避免重复执行。
  const openIndex = content.lastIndexOf('```onestep-tool')
  const hasUnclosedTool = openIndex >= 0 && content.indexOf('```', openIndex + 3) < 0
  if (hasUnclosedTool) {
    const call = parseToolJson(content.slice(openIndex + '```onestep-tool'.length))
    if (call) calls.push(call)
  }

  // 兼容模型直接输出裸 JSON 的情况（只在代码块之外扫描）。
  const withoutFences = (hasUnclosedTool ? content.slice(0, openIndex) : content)
    .replace(/```[\s\S]*?```/g, ' ')
  calls.push(...collectLooseToolCalls(withoutFences))

  return calls
}

/** 把工具调用转换成可直接渲染与执行的生成任务。 */
export function buildAgentGeneration(call: AgentToolCall): AgentGeneration | null {
  if (call.name !== 'generate_image' && call.name !== 'generate_video') return null
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
