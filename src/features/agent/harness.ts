import type { AgentStreamResult } from '@/api/agent'
import type { AgentChatMessage, AgentToolDefinition } from '@/types/agent'
import { extractAgentToolCalls, type AgentToolCall } from './tools'

const MAX_TOOL_CALLS_PER_STEP = 4
const MAX_GENERATION_CALLS_PER_RUN = 4
const MAX_TOOL_RESULT_CHARS = 16_000

export class AgentHarnessError extends Error {
  code: 'incomplete_tool_call' | 'too_many_tools'

  constructor(message: string, code: AgentHarnessError['code']) {
    super(message)
    this.name = 'AgentHarnessError'
    this.code = code
  }
}

export interface AgentHarnessStreamOptions {
  messages: AgentChatMessage[]
  tools: AgentToolDefinition[]
  step: number
  signal: AbortSignal
  onDelta: (text: string) => void
  onReasoning: (text: string) => void
}

export interface AgentHarnessToolEvent {
  call: AgentToolCall
  step: number
  result?: unknown
  error?: string
}

export interface AgentHarnessOptions {
  messages: AgentChatMessage[]
  tools?: AgentToolDefinition[]
  signal: AbortSignal
  /** 仅在内置 Agent 非固定片段路由开启旧文本工具回退。 */
  legacyToolCalls?: boolean
  stream: (options: AgentHarnessStreamOptions) => Promise<AgentStreamResult>
  executeTool: (call: AgentToolCall, step: number, signal: AbortSignal) => Promise<unknown>
  onDelta: (text: string) => void
  onReasoning: (text: string) => void
  onStepStart?: (step: number) => void
  onToolStart?: (call: AgentToolCall, step: number) => void
  onToolEnd?: (event: AgentHarnessToolEvent) => void
}

export interface AgentHarnessResult {
  messages: AgentChatMessage[]
  steps: number
}

function abortError(): Error {
  const error = new Error('已停止生成。')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError()
}

function serializedToolResult(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? { ok: true })
  if (!text) return '{"ok":true}'
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…` : text
}

function asModelToolCalls(calls: AgentToolCall[]) {
  return calls.map((call, index) => ({
    id: call.id || `legacy_call_${index + 1}`,
    type: 'function' as const,
    function: {
      name: call.name,
      arguments: call.rawArguments ?? JSON.stringify(call.args),
    },
  }))
}

/**
 * 精简的 DSH Turn/Step：模型请求 → 完整工具批次 → 有序 tool result 回注 → 下一 Step。
 * 这里不依赖 Vue/Pinia；持久化、UI 投影和具体工具副作用由调用方注入。
 */
export async function runAgentHarness(options: AgentHarnessOptions): Promise<AgentHarnessResult> {
  const messages = [...options.messages]
  const tools = options.tools || []
  const completedToolIds = new Set<string>()
  let generationCalls = 0

  // 持续执行到模型给出最终答复或用户主动停止，不按固定步数截断已确认任务。
  for (let step = 1; ; step += 1) {
    throwIfAborted(options.signal)
    options.onStepStart?.(step)
    const result = await options.stream({
      messages: [...messages],
      tools,
      step,
      signal: options.signal,
      onDelta: options.onDelta,
      onReasoning: options.onReasoning,
    })
    throwIfAborted(options.signal)

    // 与 DSH assembler 一致：max-tokens 下参数可能只有一半，绝不执行。
    if (result.toolCalls.length && ['length', 'max_tokens'].includes(result.finishReason || '')) {
      throw new AgentHarnessError('模型输出在工具参数完成前被截断，请重试。', 'incomplete_tool_call')
    }

    const native = result.toolCalls.length > 0
    const rawCalls = native
      ? result.toolCalls
      : options.legacyToolCalls !== false
        ? extractAgentToolCalls(result.content)
        : []
    const calls = rawCalls.map((call, index) => ({
      ...call,
      id: call.id || `call_${step}_${index + 1}`,
    }))

    messages.push({
      role: 'assistant',
      content: result.content || null,
      ...(calls.length ? { tool_calls: asModelToolCalls(calls) } : {}),
    })

    if (!calls.length) return { messages, steps: step }
    if (calls.length > MAX_TOOL_CALLS_PER_STEP) {
      throw new AgentHarnessError('模型一次请求了过多工具，本轮已停止，请缩小任务后重试。', 'too_many_tools')
    }
    // 默认顺序执行：创作工具包含付费任务与项目写入，不能声明为并发安全。
    for (let index = 0; index < calls.length; index += 1) {
      throwIfAborted(options.signal)
      const call = calls[index]
      const id = call.id!
      options.onToolStart?.(call, step)
      let content: string
      try {
        if (call.argumentError) throw new Error(call.argumentError)
        if (completedToolIds.has(id)) throw new Error('检测到重复的工具调用 ID，已阻止重复执行。')
        if (call.name === 'generate_image' || call.name === 'generate_video') {
          generationCalls += 1
          if (generationCalls > MAX_GENERATION_CALLS_PER_RUN) {
            throw new Error(`本轮最多提交 ${MAX_GENERATION_CALLS_PER_RUN} 个生成任务，请拆成多轮并确认数量后继续。`)
          }
        }
        const value = await options.executeTool(call, step, options.signal)
        completedToolIds.add(id)
        content = serializedToolResult(value)
        options.onToolEnd?.({ call, step, result: value })
      } catch (error: any) {
        if (error?.name === 'AbortError' || options.signal.aborted) {
          options.onToolEnd?.({ call, step, error: '已停止' })
          throw abortError()
        }
        const message = error?.message || '工具执行失败。'
        content = serializedToolResult({ ok: false, error: message })
        options.onToolEnd?.({ call, step, error: message })
      }
      // 普通业务错误也回注，让下一 Step 能修正参数或向用户解释。
      messages.push({ role: 'tool', tool_call_id: id, name: call.name, content })
    }
  }
}
