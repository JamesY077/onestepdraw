import type { AgentStreamResult } from '@/api/agent'
import type { AgentChatMessage, AgentToolDefinition } from '@/types/agent'
import { extractAgentToolCalls, type AgentToolCall } from './tools'

const MAX_TOOL_RESULT_CHARS = 16_000
/** 单次请求的消息体积上限（字符数）。超过后从最早的整轮对话开始压缩。 */
const CONTEXT_CHAR_BUDGET = 64_000
/** 历史工具结果保留的字符数；长源码留在磁盘上，需要时可重新读取。 */
const OLD_TOOL_RESULT_CHARS = 2_000
/** 工具参数被输出上限截断时自动重试的次数。 */
const MAX_TRUNCATION_RETRIES = 2
/** 流被网关切断、网络抖动时的自动重试次数。 */
const MAX_STREAM_RETRIES = 2
/** 纯文本达到输出上限时自动续写的次数。 */
const MAX_TEXT_CONTINUATIONS = 2

const TRUNCATION_HINT = [
  '[内部提示] 上一次回复在工具参数完成前达到输出上限被截断，那个不完整的调用没有执行。',
  '请缩短单次输出：把任务拆成更小的工具调用，或先写最小可用版本再逐步补全；',
  '不要重复已经成功完成的步骤，也不要输出半截 JSON。',
].join('')

/** 纯文本达到输出上限时，带这条提示从断点接着写，避免回答停在半句。 */
const CONTINUE_HINT = [
  '[内部提示] 上一条回复达到输出上限被截断。',
  '请从断点继续写，不要重复已经输出的内容，也不要在开头重新介绍；',
  '如果剩余部分仍然很长，优先保留结论和关键步骤。',
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
  /** 流中断/截断需要重来一步时，让宿主回滚已经流到界面的半截内容。 */
  onStepRetry?: (info: { reason: 'interrupted' | 'truncated' | 'network' | 'context'; attempt: number }) => void
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
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text
  // 直接把 JSON 切一半会让模型收到无法解析的残片，只能看到“源码被截断”。
  // 这里改成合法 JSON：保留预览，并明确告诉模型怎么拿全量。
  const preview = text.slice(0, MAX_TOOL_RESULT_CHARS - 600)
  return JSON.stringify({
    ok: (value as { ok?: boolean } | null)?.ok ?? true,
    truncated: true,
    chars: text.length,
    preview,
    note: '工具结果过长，这里只有预览，不是完整内容。请用 read_motion_project 的 offset/limit/query 分页读取，或改用 write_motion_project 的 patch 做局部修改。',
  })
}

function transcriptChars(messages: AgentChatMessage[]): number {
  return messages.reduce((total, message) => {
    const size = typeof message.content === 'string'
      ? message.content.length
      : Array.isArray(message.content)
        ? message.content.length * 200
        : 0
    return total + size + 240
  }, 0)
}

/**
 * 长任务反复读取源码会把请求体撑爆，网关直接 400 / 超时，看起来就像“任务中断”。
 * 每步发送前压缩一次：先截断较早的工具结果，再从最早的整轮对话开始丢弃；
 * 只在高层的 user 边界切，保证 assistant tool_calls 与 tool 结果不被拆散。
 */
export function compactAgentMessages(
  input: AgentChatMessage[],
  budget = CONTEXT_CHAR_BUDGET,
): AgentChatMessage[] {
  const system = input[0]?.role === 'system' ? [input[0]] : []
  let rest = input.slice(system.length)
  const recentFrom = Math.max(0, rest.length - 6)
  rest = rest.map((message, index) => {
    if (index >= recentFrom) return message
    if (message.role !== 'tool' || typeof message.content !== 'string') return message
    if (message.content.length <= OLD_TOOL_RESULT_CHARS) return message
    return {
      ...message,
      content: `${message.content.slice(0, OLD_TOOL_RESULT_CHARS)}\n…[历史工具结果已压缩，需要原文请重新读取]`,
    }
  })
  while (transcriptChars([...system, ...rest]) > budget) {
    const nextUser = rest.findIndex((message, index) => index > 0 && message.role === 'user')
    if (nextUser <= 0 || nextUser >= rest.length - 1) break
    rest = rest.slice(nextUser)
  }
  return [...system, ...rest]
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

function isRetryableStreamError(error: unknown): boolean {
  const kind = (error as { kind?: string } | null)?.kind
  return kind === 'network' || kind === 'server'
}

/** 网关直接报上下文超限时，压得更狠再试一次，而不是把整轮任务判死。 */
function isContextOverflowError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message || '')
  return /context.{0,24}(length|window|size|limit|token)|maximum context|too many tokens|prompt.{0,16}too long|上下文.{0,10}(过长|太长|超限)/i.test(message)
}

/**
 * 取一次模型输出。连接被切断、网关没有给出结束标记时自动重来一步；
 * 重试前通过 onStepRetry 让宿主回滚已经流出去的半截内容，避免界面重复。
 */
async function streamStep(
  options: AgentHarnessOptions,
  messages: AgentChatMessage[],
  tools: AgentToolDefinition[],
  step: number,
  initialBudget = CONTEXT_CHAR_BUDGET,
): Promise<AgentStreamResult> {
  let budget = initialBudget
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await options.stream({
        messages: compactAgentMessages(messages, budget),
        tools,
        step,
        signal: options.signal,
        onDelta: options.onDelta,
        onReasoning: options.onReasoning,
      })
      throwIfAborted(options.signal)

      // 有些网关正常结束时不发 [DONE] 也没有 finish_reason；第二次仍如此就接受现状，
      // 避免把兼容性问题误判成永远失败。
      if (result.incomplete && attempt < MAX_STREAM_RETRIES) {
        options.onStepRetry?.({ reason: 'interrupted', attempt: attempt + 1 })
        continue
      }
      return result
    } catch (error: any) {
      if (error?.name === 'AbortError' || options.signal.aborted) throw error
      if (isContextOverflowError(error) && attempt < MAX_STREAM_RETRIES) {
        budget = Math.max(8_000, Math.floor(budget / 2))
        options.onStepRetry?.({ reason: 'context', attempt: attempt + 1 })
        continue
      }
      if (isRetryableStreamError(error) && attempt < MAX_STREAM_RETRIES) {
        options.onStepRetry?.({ reason: 'network', attempt: attempt + 1 })
        continue
      }
      throw error
    }
  }
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

    let result = await streamStep(options, messages, tools, step)
    throwIfAborted(options.signal)

    // 纯文本被输出上限截断：从断点续写，不把半句话当成最终答复。
    let content = result.content
    let continuations = 0
    while (
      !result.toolCalls.length &&
      ['length', 'max_tokens'].includes(result.finishReason || '') &&
      continuations < MAX_TEXT_CONTINUATIONS
    ) {
      continuations += 1
      result = await streamStep(options, [
        ...messages,
        { role: 'assistant', content },
        { role: 'user', content: CONTINUE_HINT },
      ], tools, step)
      throwIfAborted(options.signal)
      content += result.content
    }

    // 工具参数可能只有一半：绝不执行半成品，带提示重来一步。
    let truncationRetries = 0
    while (
      result.toolCalls.length &&
      ['length', 'max_tokens'].includes(result.finishReason || '') &&
      truncationRetries < MAX_TRUNCATION_RETRIES
    ) {
      truncationRetries += 1
      options.onStepRetry?.({ reason: 'truncated', attempt: truncationRetries })
      result = await streamStep(
        options,
        [...messages, { role: 'user', content: TRUNCATION_HINT }],
        tools,
        step,
      )
      throwIfAborted(options.signal)
      content = result.content
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
        ? extractAgentToolCalls(content)
        : []
    const calls = rawCalls.map((call, index) => ({
      ...call,
      id: call.id || `call_${step}_${index + 1}`,
    }))

    messages.push({
      role: 'assistant',
      content: content || null,
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
