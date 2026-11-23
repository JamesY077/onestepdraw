/** 本机 Agent 检测与流式调用。 */

export interface LocalAgentPreset {
  id: string
  name: string
  vendor: string
  description: string
  commands: string[]
  installCommand: string
  installUrl: string
  installHint?: string
  experimental?: boolean
  installed: boolean
  /** path = 来自 PATH；app = 来自桌面应用包内置的命令行。 */
  source?: 'path' | 'app' | ''
  command: string
  commandPath: string
  /** 检测到的桌面端应用路径（即使没有可用命令行也会返回）。 */
  appPath?: string
  version: string
}

export interface CustomAgentConfig {
  name: string
  command: string
}

export interface LocalAgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LocalAgentRunResult {
  exitCode: number
  stderrTail: string
}

export class LocalAgentError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LocalAgentError'
    this.status = status
  }
}

export interface LocalAgentStreamOptions {
  agentId: string
  messages: LocalAgentMessage[]
  apiKey?: string
  apiBaseUrl?: string
  /** 当前选择的对话模型；dsh 会用它配置模型路由。 */
  model?: string
  /** 当前对话模式：chat = 普通对话，create = 创作对话。 */
  mode?: 'chat' | 'create'
  /** default = 分轮提问，auto = 模型自行决策。 */
  automation?: 'default' | 'auto'
  /** 当前剪辑项目摘要，让 Agent 能做时间轴操作。 */
  projectSummary?: string
  custom?: CustomAgentConfig
  signal?: AbortSignal
  onStart?: (agent: { id: string; name: string; vendor: string }) => void
  onLog?: (text: string) => void
  onDelta: (text: string) => void
}

function toErrorMessage(payload: unknown, fallback: string): string {
  const data = payload as Record<string, any> | null
  return (
    data?.error?.message ||
    data?.message ||
    (typeof data?.error === 'string' ? data.error : '') ||
    fallback
  )
}

export async function fetchLocalAgents(force = false): Promise<{
  agents: LocalAgentPreset[]
  rootDir: string
}> {
  let response: Response
  try {
    response = await fetch(`/local/agents${force ? '?refresh=1' : ''}`, {
      cache: 'no-store',
    })
  } catch {
    throw new LocalAgentError('无法连接本地服务，请用 npm start 启动 OneStep 后再扫描。')
  }

  let payload: any = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new LocalAgentError(toErrorMessage(payload, '扫描本机 Agent 失败。'), response.status)
  }

  if (!payload || !Array.isArray(payload.agents)) {
    throw new LocalAgentError('本机扫描接口不可用，请用 npm start 启动 OneStep。')
  }

  return {
    agents: payload.agents,
    rootDir: typeof payload.rootDir === 'string' ? payload.rootDir : '',
  }
}

/** 逐块读取 SSE，处理跨 chunk 的事件边界。 */
export async function streamLocalAgent(options: LocalAgentStreamOptions): Promise<LocalAgentRunResult> {
  const response = await fetch('/local/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: options.agentId,
      messages: options.messages,
      apiKey: options.apiKey || '',
      apiBaseUrl: options.apiBaseUrl || '',
      model: options.model || '',
      mode: options.mode || 'chat',
      automation: options.automation || 'default',
      projectSummary: options.projectSummary || '',
      custom: options.custom || null,
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    let payload: any = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    throw new LocalAgentError(toErrorMessage(payload, 'Agent 启动失败。'), response.status)
  }

  if (!response.body) throw new LocalAgentError('当前浏览器不支持流式读取。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let exitCode = 0
  let stderrTail = ''
  let failure = ''

  const handleEvent = (raw: string) => {
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data) continue
      let event: any
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }
      if (event?.type === 'delta' && typeof event.text === 'string') {
        options.onDelta(event.text)
      } else if (event?.type === 'log' && typeof event.text === 'string') {
        options.onLog?.(event.text)
      } else if (event?.type === 'start' && event.agent) {
        options.onStart?.(event.agent)
      } else if (event?.type === 'done') {
        exitCode = Number(event.exitCode) || 0
        stderrTail = typeof event.stderrTail === 'string' ? event.stderrTail : ''
      } else if (event?.type === 'error') {
        failure = event.message || 'Agent 运行失败。'
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      handleEvent(chunk)
      boundary = buffer.indexOf('\n\n')
    }
  }

  if (buffer.trim()) handleEvent(buffer)
  if (failure) throw new LocalAgentError(failure)
  return { exitCode, stderrTail }
}
