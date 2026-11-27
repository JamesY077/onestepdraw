import { getApiBaseUrl, getApiKey } from '@/api/config'
import type { AgentChatMessage, AgentChatToolCall, AgentToolDefinition } from '@/types/agent'
import type { AgentToolCall, AgentToolName } from '@/features/agent/tools'

/** 本地 Agent 当前内嵌的文本模型。 */
export const AGENT_MODEL_ID = 'DeepSeek-V4.1-Flash-1017'
export const AGENT_MODEL_NAME = 'DeepSeek-V4.1-Flash-1017'
export const AGENT_MODEL_DESCRIPTION = '由 AIPing 提供推理能力'

export type AgentErrorKind = 'auth' | 'rate_limit' | 'network' | 'server' | 'unknown'

export class AgentApiError extends Error {
  kind: AgentErrorKind
  status?: number

  constructor(message: string, kind: AgentErrorKind = 'unknown', status?: number) {
    super(message)
    this.name = 'AgentApiError'
    this.kind = kind
    this.status = status
  }
}

export function isAgentToolsUnsupportedError(error: unknown): boolean {
  if (!(error instanceof AgentApiError) || error.status !== 400) return false
  const message = error.message
  return /(?:tools?|tool_choice|function calling)[\s\S]{0,100}(?:unsupported|not supported|not support|不支持)|(?:unsupported|unknown|不支持)[\s\S]{0,60}(?:tools?|tool_choice|function calling)/i.test(message)
}

export interface AgentStreamOptions {
  messages: AgentChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: AgentToolDefinition[]
  signal?: AbortSignal
  onDelta: (text: string) => void
  onReasoning?: (text: string) => void
}

export interface AgentStreamResult {
  content: string
  toolCalls: AgentToolCall[]
  finishReason?: string
  /** 流在没有 [DONE] / finish_reason 的情况下结束：可能被网关或代理切断。 */
  incomplete?: boolean
}

/** 流式读取长时间没有新数据就判定为连接中断，避免任务永远卡住。 */
const STREAM_IDLE_TIMEOUT_MS = 5 * 60_000

/**
 * 用多模态模型快速描述参考图，供当前文本模型使用。
 * 只在用户选的是纯文本模型、但消息里带图片时调用。
 */
export async function analyzeImages(
  images: string[],
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey || !images.length) return ''
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content:
            '你是视觉分析助手。用简洁中文描述用户提供的参考图，重点写主体、场景、构图、镜头、光线、色彩、材质与风格，以及可以直接写进创作提示词的细节。不要寒暄，不要 Markdown 标题。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `请分析这 ${images.length} 张参考图。` },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        },
      ],
    }),
    signal,
  })
  if (!response.ok) return ''
  const payload = await response.json().catch(() => null)
  const content = payload?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const data = payload as Record<string, any>
  const detail = data.detail
  const detailMessage = typeof detail === 'string' ? detail : detail?.message || detail?.error
  const raw =
    detailMessage ||
    data.message ||
    data.error?.message ||
    (typeof data.error === 'string' ? data.error : '') ||
    data.msg
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
}

function toAgentError(status: number, message: string): AgentApiError {
  if (status === 401 || status === 403) {
    return new AgentApiError('登录状态已失效，请重新连接 AIPing API Key。', 'auth', status)
  }
  if (status === 429) {
    if (/rpm|频率|rate/i.test(message)) {
      return new AgentApiError('请求太频繁了，已触发频率限制，请稍后再试。', 'rate_limit', status)
    }
    return new AgentApiError('当前额度或并发已达上限，请稍后再试。', 'rate_limit', status)
  }
  if (status >= 500) {
    return new AgentApiError('模型服务暂时不可用，请稍后重试。', 'server', status)
  }
  return new AgentApiError(message || '请求失败，请稍后重试。', 'unknown', status)
}

async function readErrorResponse(response: Response): Promise<AgentApiError> {
  let message = ''
  try {
    const text = await response.text()
    if (text) {
      try {
        message = extractErrorMessage(JSON.parse(text), '')
      } catch {
        message = text.slice(0, 400)
      }
    }
  } catch {
    // 忽略读取错误，使用默认提示。
  }
  return toAgentError(response.status, message)
}

function parseToolArguments(raw: string): Pick<AgentToolCall, 'args' | 'argumentError'> {
  if (!raw.trim()) return { args: {} }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { args: {}, argumentError: '工具参数必须是 JSON 对象。' }
    }
    return { args: parsed as Record<string, unknown> }
  } catch {
    return { args: {}, argumentError: '工具参数不是合法 JSON，请修正参数后重试。' }
  }
}

function toNativeToolCall(raw: AgentChatToolCall, index: number): AgentToolCall {
  const rawArguments = String(raw.function?.arguments || '')
  return {
    id: raw.id || `call_${index + 1}`,
    name: String(raw.function?.name || '') as AgentToolName,
    rawArguments,
    ...parseToolArguments(rawArguments),
  }
}

/**
 * 流式调用 AIPing 的 OpenAI 兼容 /chat/completions 接口。
 * 文本与原生 tool_calls 都按 SSE 分片聚合，调用方无需了解 chunk 边界。
 */
export async function streamAgentChat(options: AgentStreamOptions): Promise<AgentStreamResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new AgentApiError('还没有连接 AIPing，请先返回登录页填写 API Key。', 'auth')
  }

  const baseUrl = getApiBaseUrl().replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`
  const model = options.model || AGENT_MODEL_ID

  /** 智能体要用工具写源码，默认给足输出额度；网关不接受时再退回服务端默认值。 */
  const DEFAULT_AGENT_MAX_TOKENS = 8192
  const requestedMaxTokens = options.maxTokens ?? DEFAULT_AGENT_MAX_TOKENS
  const post = (maxTokens?: number) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
    }),
    signal: options.signal,
  })

  let response: Response
  try {
    response = await post(requestedMaxTokens)
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error
    throw new AgentApiError('网络连接失败，请检查本机网络或服务地址后重试。', 'network')
  }

  if (!response.ok && options.maxTokens === undefined && response.status === 400) {
    const error = await readErrorResponse(response)
    // 有些模型不支持 8K 输出，明确报 max_tokens 超限时退回服务端默认值，避免整轮不可用。
    if (/max[_ ]?tokens|output.{0,20}tokens?|token.{0,20}(?:too large|exceed|limit)/i.test(error.message)) {
      try {
        response = await post(undefined)
      } catch (networkError: any) {
        if (networkError?.name === 'AbortError') throw networkError
        throw new AgentApiError('网络连接失败，请检查本机网络或服务地址后重试。', 'network')
      }
    } else {
      throw error
    }
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  const contentType = response.headers.get('content-type') || ''

  // 部分网关即使请求 stream=true 也会直接返回 JSON，这里做兼容。
  if (contentType.includes('application/json') && response.body) {
    const payload = await response.json().catch(() => null)
    if (payload?.code && payload?.msg && !payload?.choices) {
      const status = Number(payload.code)
      throw toAgentError(Number.isFinite(status) ? status : 500, String(payload.msg))
    }
    const choice = payload?.choices?.[0]
    const message = choice?.message
    if (message?.reasoning_content) options.onReasoning?.(String(message.reasoning_content))
    const content = typeof message?.content === 'string' ? message.content : ''
    if (content) options.onDelta(content)
    const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
    const toolCalls = rawCalls.map((call: AgentChatToolCall, index: number) => toNativeToolCall(call, index))
    if (content || toolCalls.length) {
      return { content, toolCalls, finishReason: choice?.finish_reason }
    }
    throw new AgentApiError('模型没有返回内容，请重试。', 'unknown')
  }

  if (!response.body) {
    throw new AgentApiError('浏览器不支持流式读取，请更换现代浏览器后重试。', 'unknown')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let receivedAny = false
  let sawDone = false
  let content = ''
  let finishReason: string | undefined
  const callDeltas = new Map<number, { id: string; name: string; arguments: string }>()

  const collectToolCallDelta = (raw: any, position: number) => {
    const index = Number.isInteger(raw?.index) ? Number(raw.index) : position
    const current = callDeltas.get(index) || { id: '', name: '', arguments: '' }
    if (typeof raw?.id === 'string' && raw.id) current.id = raw.id
    if (typeof raw?.function?.name === 'string') current.name += raw.function.name
    if (typeof raw?.function?.arguments === 'string') current.arguments += raw.function.arguments
    callDeltas.set(index, current)
  }

  const eventData: string[] = []
  const flushEvent = () => {
    if (!eventData.length) return
    handleEvent(eventData.join('\n'))
    eventData.length = 0
  }
  const handleLine = (line: string) => {
    if (!line) {
      flushEvent()
      return
    }
    if (line.startsWith('data:')) eventData.push(line.slice(5).trimStart())
  }

  const handleEvent = (raw: string) => {
    const data = raw.trim()
    if (!data) return
    if (data === '[DONE]') {
      sawDone = true
      return
    }
    let payload: any
    try {
      payload = JSON.parse(data)
    } catch {
      return
    }

    const choice = payload?.choices?.[0]
    const delta = choice?.delta
    const reasoning = delta?.reasoning_content ?? delta?.reasoning
    if (typeof reasoning === 'string' && reasoning) {
      receivedAny = true
      options.onReasoning?.(reasoning)
    }
    const contentDelta = delta?.content ?? choice?.message?.content
    if (typeof contentDelta === 'string' && contentDelta) {
      receivedAny = true
      content += contentDelta
      options.onDelta(contentDelta)
    }
    const rawCalls = delta?.tool_calls ?? choice?.message?.tool_calls
    if (Array.isArray(rawCalls) && rawCalls.length) {
      receivedAny = true
      rawCalls.forEach(collectToolCallDelta)
    }
    if (typeof choice?.finish_reason === 'string') {
      finishReason = choice.finish_reason
      sawDone = true
    }
    if (payload?.error) {
      throw new AgentApiError(extractErrorMessage(payload, '模型返回了错误。'), 'unknown')
    }
  }

  /**
   * 读取一块数据，超过 5 分钟没有任何新字节就判定连接被切断。
   * 没有这个看门狗时，代理层静默丢连接会让任务一直转圈，只能手动刷新。
   */
  const readWithIdleTimeout = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new AgentApiError('模型响应长时间没有新内容，连接可能已中断。', 'network'))
          }, STREAM_IDLE_TIMEOUT_MS)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await readWithIdleTimeout()
      } catch (error) {
        void reader.cancel().catch(() => {})
        throw error
      }
      const { done, value } = chunk
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        handleLine(line)
        newlineIndex = buffer.indexOf('\n')
      }
    }

    // 处理最后一行没有换行符的残留数据与未以空行收尾的 SSE 事件。
    if (buffer.trim()) handleLine(buffer.replace(/\r$/, ''))
    flushEvent()

    if (!receivedAny) {
      throw new AgentApiError('模型没有返回内容，请重试。', 'unknown')
    }

    const toolCalls = [...callDeltas.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call], position) => toNativeToolCall({
        id: call.id || `call_${index + 1}`,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      }, position))
    // 没有结束标记就断开：工具参数可能是半截 JSON，交给 Harness 自动重试。
    return { content, toolCalls, finishReason, incomplete: !sawDone && !finishReason }
  } finally {
    reader.releaseLock()
  }
}
