import { getApiBaseUrl, getApiKey } from '@/api/config'
import type { AgentChatMessage } from '@/types/agent'

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

export interface AgentStreamOptions {
  messages: AgentChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  onDelta: (text: string) => void
  onReasoning?: (text: string) => void
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

/**
 * 流式调用 AIPing 的 OpenAI 兼容 /chat/completions 接口。
 * 使用 fetch + ReadableStream 读取 SSE，避免整段等待。
 */
export async function streamAgentChat(options: AgentStreamOptions): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new AgentApiError('还没有连接 AIPing，请先返回登录页填写 API Key。', 'auth')
  }

  const baseUrl = getApiBaseUrl().replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`
  const model = options.model || AGENT_MODEL_ID

  let response: Response
  try {
    response = await fetch(url, {
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
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
      signal: options.signal,
    })
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error
    throw new AgentApiError('网络连接失败，请检查本机网络或服务地址后重试。', 'network')
  }

  if (!response.ok) {
    throw await readErrorResponse(response)
  }

  const contentType = response.headers.get('content-type') || ''

  // 部分网关即使请求 stream=true 也会直接返回 JSON，这里做兼容。
  if (contentType.includes('application/json') && response.body) {
    const payload = await response.json().catch(() => null)
    const message = payload?.choices?.[0]?.message
    if (message?.reasoning_content) options.onReasoning?.(String(message.reasoning_content))
    const content = message?.content
    if (typeof content === 'string' && content) {
      options.onDelta(content)
      return
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

  const handleEvent = (raw: string) => {
    const data = raw.trim()
    if (!data || data === '[DONE]') return
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
    const content = delta?.content ?? choice?.message?.content
    if (typeof content === 'string' && content) {
      receivedAny = true
      options.onDelta(content)
    }
    if (payload?.error) {
      throw new AgentApiError(extractErrorMessage(payload, '模型返回了错误。'), 'unknown')
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        if (line.startsWith('data:')) handleEvent(line.slice(5))
        newlineIndex = buffer.indexOf('\n')
      }
    }

    // 处理最后一行没有换行符的残留数据。
    const tail = buffer.trim()
    if (tail.startsWith('data:')) handleEvent(tail.slice(5))

    if (!receivedAny) {
      throw new AgentApiError('模型没有返回内容，请重试。', 'unknown')
    }
  } finally {
    reader.releaseLock()
  }
}
