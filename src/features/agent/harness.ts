import type { AgentStreamResult } from '@/api/agent'
import type { AgentChatMessage, AgentToolDefinition } from '@/types/agent'
import { extractAgentToolCalls, type AgentToolCall } from './tools'

const MAX_TOOL_RESULT_CHARS = 16_000
/** 工具参数被输出上限截断时自动重试的次数。 */
const MAX_TRUNCATION_RETRIES = 2

const TRUNCATION_HINT = [
  '[内部提示] 上一次回复在工具参数完成前达到输出上限被截断，那个不完整的调用没有执行。',
  '请缩短单次输出：把任务拆成更小的工具调用，或先写最小可用版本再逐步补全；',
  '不要重复已经成功完成的步骤，也不要输出半截 JSON。',
].join('')

/**
 * 一次 Step 塞进太多工具时，模型往往一口气跑完、中间不汇报。
 * 在最后一条工具结果后面加一句进度提醒，要求它先说明阶段成果再继续。
 */
const PROGRESS_HINT = [
  '[进度提醒] 本步一次性执行了多个工具。',
  '如果后面还有阶段，先用一句话说明已完成哪部分、接下来做哪部分，并调用 update_plan 同步状态；',
  '不要把剩余步骤全部塞进同一步静默跑完。',
].join('')

/** 单步工具数量达到这个值时，追加进度提醒。 */
const PROGRESS_HINT_MIN_CALLS = 4

export class AgentHarnessError extends Error {
  code: 'incomplete_tool_call'

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

  // 持续执行到模型给出最终答复或用户主动停止，不按固定步数截断已确认任务。
  for (let step = 1; ; step += 1) {
    throwIfAborted(options.signal)
    options.onStepStart?.(step)
    let result = await options.stream({
      messages: [...messages],
      tools,
      step,
      signal: options.signal,
      onDelta: options.onDelta,
      onReasoning: options.onReasoning,
    })
    throwIfAborted(options.signal)

    // 输出达到上限时，工具参数可能只有一半。绝不执行半成品；
    // 先带着“拆小一点”的内部提示自动重试，避免用户手动重来。
    let truncationRetries = 0
    while (
      result.toolCalls.length &&
      ['length', 'max_tokens'].includes(result.finishReason || '') &&
      truncationRetries < MAX_TRUNCATION_RETRIES
    ) {
      truncationRetries += 1
      result = await options.stream({
        messages: [...messages, { role: 'user', content: TRUNCATION_HINT }],
        tools,
        step,
        signal: options.signal,
        onDelta: options.onDelta,
        onReasoning: options.onReasoning,
      })
      throwIfAborted(options.signal)
    }

    // 与 DSH assembler 一致：max-tokens 下参数可能只有一半，绝不执行。
    if (result.toolCalls.length && ['length', 'max_tokens'].includes(result.finishReason || '')) {
      throw new AgentHarnessError(
        '模型连续 3 次在工具参数完成前达到输出上限，这次调用没有执行。请把任务拆小，或换一个支持更长输出的模型后重试。',
        'incomplete_tool_call',
      )
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
    // 不限制单步工具数量与生成次数：模型可以按任务需要连续调用，
    // 只保留用户主动停止、参数截断和重复调用 ID 的保护。
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

    // 大批次执行后提醒模型汇报阶段进度，而不是默默做完全部任务。
    if (calls.length >= PROGRESS_HINT_MIN_CALLS) {
      const last = messages[messages.length - 1]
      if (last?.role === 'tool') last.content = `${last.content || ''}\n\n${PROGRESS_HINT}`
    }
  }
}
