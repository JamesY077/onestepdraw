import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'

const values = new Map()
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
}
globalThis.localStorage = storage
globalThis.sessionStorage = storage
storage.setItem('aiping_api_auth_session', JSON.stringify({
  apiKey: 'mock-only-key',
  apiBaseUrl: 'https://mock.local/v1',
  sessionId: 'mock-session',
  verifiedAtEpochMs: Date.now(),
  verifiedDateCN: '2026-11-23',
}))

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'error',
})
const originalFetch = globalThis.fetch

function streamedResponse(text, widths = [1, 2, 5, 3, 11, 7]) {
  const bytes = new TextEncoder().encode(text)
  const stream = new ReadableStream({
    start(controller) {
      let offset = 0
      let index = 0
      while (offset < bytes.length) {
        const width = widths[index % widths.length]
        controller.enqueue(bytes.slice(offset, offset + width))
        offset += width
        index += 1
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

function event(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

try {
  const { streamAgentChat, AgentApiError } = await server.ssrLoadModule('/src/api/agent.ts')
  const { runAgentHarness, AgentHarnessError, compactAgentMessages } = await server.ssrLoadModule('/src/features/agent/harness.ts')
  const { AGENT_NATIVE_TOOLS, agentToolsForMode } = await server.ssrLoadModule('/src/features/agent/toolDefinitions.ts')
  const { normalizeAgentTimelineOps, normalizeAgentCreativeHandoff } = await server.ssrLoadModule('/src/features/agent/tools.ts')
  const { executeMotionTool, applyMotionEdits } = await server.ssrLoadModule('/src/features/agent/motionTools.ts')
  const { streamLocalAgent } = await server.ssrLoadModule('/src/api/localAgents.ts')
  const { buildRunPrompt, runAgent } = await server.ssrLoadModule('/server/local/agents.mjs')
  const { splitMentionSegments } = await server.ssrLoadModule('/src/composables/useMentionRefs.ts')
  const { describeAttachments, describeTemplates } = await server.ssrLoadModule('/src/features/agent/attachments.ts')

  // 原生 tool_calls：任意字节分片、中文、CRLF、多行 data、两个调用按 index 聚合。
  let requestBody
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body)
    const multiLinePayload = JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '[{"content":"读取项目","status":"in_progress"}]}' } }] } }],
    })
    const multiLineAt = multiLinePayload.indexOf('"arguments"')
    const multiLineEvent = `data: ${multiLinePayload.slice(0, multiLineAt)}\ndata: ${multiLinePayload.slice(multiLineAt)}\n\n`
    const events = [
      event({ choices: [{ delta: { reasoning_content: '先分析' } }] }),
      event({ choices: [{ delta: { content: '我先读取项目。' } }] }),
      event({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: { name: 'read_project', arguments: '' } }] } }] }),
      event({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_plan', type: 'function', function: { name: 'update_', arguments: '' } }] } }] }),
      event({ choices: [{ delta: { tool_calls: [{ index: 1, function: { name: 'plan', arguments: '{"items":' } }] } }] }),
      multiLineEvent,
      event({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      'data: [DONE]\n\n',
    ].join('').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
    return streamedResponse(events)
  }
  let streamedText = ''
  let streamedReasoning = ''
  const parsed = await streamAgentChat({
    messages: [{ role: 'user', content: '读取项目' }],
    tools: AGENT_NATIVE_TOOLS,
    onDelta: (text) => { streamedText += text },
    onReasoning: (text) => { streamedReasoning += text },
  })
  assert.equal(streamedText, '我先读取项目。')
  assert.equal(streamedReasoning, '先分析')
  assert.equal(parsed.finishReason, 'tool_calls')
  assert.equal(parsed.toolCalls.length, 2)
  assert.deepEqual(parsed.toolCalls.map((call) => call.name), ['read_project', 'update_plan'])
  assert.ok(Array.isArray(parsed.toolCalls[1].args.items), JSON.stringify(parsed.toolCalls))
  assert.equal(parsed.toolCalls[1].args.items[0].content, '读取项目')
  assert.equal(parsed.toolCalls[1].rawArguments, '{"items":[{"content":"读取项目","status":"in_progress"}]}')
  assert.equal(requestBody.tool_choice, 'auto')
  assert.equal(requestBody.tools.length, 17)
  assert.equal('execute' in requestBody.tools[0].function, false)
  const animationTools = agentToolsForMode('create', 'animation').map((tool) => tool.function.name)
  const aigcTools = agentToolsForMode('create', 'aigc').map((tool) => tool.function.name)
  assert.equal(animationTools.length, 13)
  assert.ok(animationTools.includes('create_motion_project'))
  assert.ok(animationTools.includes('prepare_storyboard'))
  assert.ok(animationTools.includes('import_motion_asset'))
  assert.ok(animationTools.every((name) => !['generate_image', 'generate_video', 'generate_storyboard', 'open_3d'].includes(name)))
  assert.ok(animationTools.includes('review_motion_project'), '动画模式必须提供复查校验工具')
  assert.equal(aigcTools.length, 9)
  assert.ok(aigcTools.includes('generate_image'))
  assert.ok(aigcTools.includes('prepare_storyboard'))
  assert.ok(aigcTools.every((name) => !name.includes('motion_')))
  assert.equal(agentToolsForMode('chat', 'animation').length, 2)
  assert.equal(normalizeAgentCreativeHandoff({
    target: 'create', engine: 'animation', reason: '复刻动效', prompt: '用 OpenMotion 复刻并替换 Logo',
  }).engine, 'animation')
  assert.equal(normalizeAgentCreativeHandoff({
    target: 'create', reason: '生成视频', prompt: '生成 5 秒视频',
  }).engine, 'aigc')
  assert.equal(normalizeAgentCreativeHandoff({
    target: 'create', reason: '模板复刻', prompt: '用 HyperFrames 做同款',
  }).engine, 'animation')

  // 网关没有发送 finish_reason / [DONE] 就断开：标记 incomplete，交给 Harness 重试。
  globalThis.fetch = async () => streamedResponse(event({ choices: [{ delta: { content: '只写了一半' } }] }))
  const cutStream = await streamAgentChat({ messages: [], onDelta: () => {} })
  assert.equal(cutStream.incomplete, true, '缺少结束标记的流必须标记为不完整')
  assert.equal(cutStream.content, '只写了一半')

  // 只发 [DONE] 不发 finish_reason 的网关仍算正常结束，避免误判。
  globalThis.fetch = async () => streamedResponse(
    `${event({ choices: [{ delta: { content: '正常结束' } }] })}data: [DONE]\n\n`,
  )
  const doneStream = await streamAgentChat({ messages: [], onDelta: () => {} })
  assert.equal(doneStream.incomplete, false)

  // 非流式 JSON 也允许只有 tool call 而没有正文。
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [{ id: 'json_call', type: 'function', function: { name: 'read_project', arguments: '{}' } }] } }],
  }), { headers: { 'Content-Type': 'application/json' } })
  const jsonResult = await streamAgentChat({ messages: [], onDelta: () => {} })
  assert.equal(jsonResult.toolCalls[0].id, 'json_call')

  // 半个 JSON 不让 SSE 解析器崩溃，而由 Harness 回注参数错误。
  globalThis.fetch = async () => streamedResponse(event({
    choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad', function: { name: 'generate_image', arguments: '{"prompt":' } }] }, finish_reason: 'tool_calls' }],
  }))
  const malformed = await streamAgentChat({ messages: [], onDelta: () => {} })
  assert.match(malformed.toolCalls[0].argumentError, /合法 JSON/)

  globalThis.fetch = async () => streamedResponse('data: [DONE]\n\n')
  await assert.rejects(() => streamAgentChat({ messages: [], onDelta: () => {} }), AgentApiError)

  // 多步主循环：两个工具顺序执行，assistant + 两个 tool result 全部进入下一 Step。
  const streamRequests = []
  const executionOrder = []
  const toolEvents = []
  const loop = await runAgentHarness({
    messages: [{ role: 'user', content: '读取后修改' }],
    tools: AGENT_NATIVE_TOOLS,
    signal: new AbortController().signal,
    stream: async (request) => {
      streamRequests.push(request.messages)
      if (request.step === 1) {
        return {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            { id: 'read', name: 'read_project', args: {}, rawArguments: '{}' },
            { id: 'edit', name: 'edit_timeline', args: { ops: [{ op: 'move', clipId: 'c1', start: 2 }] } },
          ],
        }
      }
      return { content: '已读取并更新时间轴。', toolCalls: [], finishReason: 'stop' }
    },
    executeTool: async (call) => {
      executionOrder.push(call.name)
      return call.name === 'read_project' ? { ok: true, project: 'c1' } : { ok: true, applied: 1, skipped: 0 }
    },
    onDelta: () => {},
    onReasoning: () => {},
    onToolStart: (call) => toolEvents.push(`start:${call.name}`),
    onToolEnd: ({ call, error }) => toolEvents.push(`end:${call.name}:${error || 'ok'}`),
  })
  assert.deepEqual(executionOrder, ['read_project', 'edit_timeline'])
  assert.deepEqual(toolEvents, ['start:read_project', 'end:read_project:ok', 'start:edit_timeline', 'end:edit_timeline:ok'])
  assert.equal(loop.steps, 2)
  assert.equal(streamRequests[1].at(-1).role, 'tool')
  assert.equal(streamRequests[1].at(-2).role, 'tool')
  assert.equal(streamRequests[1].at(-3).role, 'assistant')
  assert.equal(streamRequests[1].at(-3).tool_calls.length, 2)
  assert.equal(streamRequests[1].at(-2).tool_call_id, 'read')
  assert.equal(streamRequests[1].at(-1).tool_call_id, 'edit')

  // 业务异常不是 Turn 异常：错误结果回注，模型下一 Step 可解释或修正。
  let recoveredRequest
  await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => {
      if (request.step === 1) return { content: '', toolCalls: [{ id: 'x', name: 'edit_timeline', args: {} }] }
      recoveredRequest = request.messages
      return { content: '片段 ID 无效，请确认。', toolCalls: [] }
    },
    executeTool: async () => { throw new Error('片段不存在') },
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(recoveredRequest.at(-1).role, 'tool')
  assert.match(recoveredRequest.at(-1).content, /片段不存在/)

  // 旧 Markdown 工具只作为兼容回退，同样进入 tool result 回环。
  let legacyCalls = 0
  let legacyNextMessages
  await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    legacyToolCalls: true,
    stream: async (request) => {
      if (request.step === 1) return { content: '开始生成\n```onestep-tool\n{"tool":"generate_image","args":{"prompt":"一只橘猫"}}\n```', toolCalls: [] }
      legacyNextMessages = request.messages
      return { content: '任务已提交。', toolCalls: [] }
    },
    executeTool: async (call) => {
      legacyCalls += 1
      assert.equal(call.name, 'generate_image')
      return { ok: true, status: 'submitted', generationId: 'gen_mock' }
    },
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(legacyCalls, 1)
  assert.equal(legacyNextMessages.at(-1).role, 'tool')
  assert.match(legacyNextMessages.at(-1).content, /gen_mock/)

  // 取消与截断都不会留下后续模型调用或危险执行。
  const controller = new AbortController()
  let streamsAfterCancel = 0
  await assert.rejects(() => runAgentHarness({
    messages: [],
    signal: controller.signal,
    stream: async () => ({ content: '', toolCalls: [{ id: 'stop', name: 'read_project', args: {} }] }),
    executeTool: async () => { controller.abort(); return { ok: true } },
    onDelta: () => {},
    onReasoning: () => {},
    onStepStart: (step) => { if (step > 1) streamsAfterCancel += 1 },
  }), (error) => error.name === 'AbortError')
  assert.equal(streamsAfterCancel, 0)

  // 已确认任务可以连续执行超过旧的 8 步上限，直到模型结束。
  let unlimitedToolCalls = 0
  const unlimitedResult = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => request.step <= 12
      ? { content: '', toolCalls: [{ id: `step_${request.step}`, name: 'read_project', args: {} }] }
      : { content: '全部执行完成。', toolCalls: [] },
    executeTool: async () => {
      unlimitedToolCalls += 1
      return { ok: true }
    },
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(unlimitedToolCalls, 12)
  assert.equal(unlimitedResult.steps, 13)

  // 生成任务同样不设单轮上限：8 个付费任务按模型请求顺序全部提交。
  let executedGenerations = 0
  const generationResult = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => request.step === 1
      ? {
          content: '',
          toolCalls: Array.from({ length: 8 }, (_, index) => ({
            id: `gen_${index}`, name: 'generate_image', args: { prompt: `画面 ${index}` },
          })),
        }
      : { content: '八个生成任务全部提交。', toolCalls: [] },
    executeTool: async () => { executedGenerations += 1; return { ok: true } },
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(executedGenerations, 8, '单轮生成任务不再设上限')
  assert.equal(generationResult.steps, 2)

  let executedIncomplete = false
  let truncationAttempts = 0
  await assert.rejects(() => runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async () => {
      truncationAttempts += 1
      return { content: '', finishReason: 'length', toolCalls: [{ id: 'partial', name: 'generate_video', args: {} }] }
    },
    executeTool: async () => { executedIncomplete = true },
    onDelta: () => {},
    onReasoning: () => {},
  }), (error) => error.code === 'incomplete_tool_call')
  assert.equal(executedIncomplete, false)
  assert.equal(truncationAttempts, 3, '截断时先自动重试 2 次，仍然截断才报错')

  // 前两次工具参数被截断，第三次自动恢复并正常执行；内部重试提示不进入正式历史。
  let recoveredCalls = 0
  let recoveredAttempts = 0
  const retryHints = []
  const recoveredRun = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => {
      recoveredAttempts += 1
      const lastMessage = String(request.messages.at(-1)?.content || '')
      if (lastMessage.includes('[内部提示]')) retryHints.push(lastMessage)
      if (recoveredAttempts <= 2) {
        return { content: '', finishReason: 'length', toolCalls: [{ id: `cut_${recoveredAttempts}`, name: 'read_project', args: {} }] }
      }
      if (request.step === 1) return { content: '', toolCalls: [{ id: 'ok', name: 'read_project', args: {} }] }
      return { content: '已恢复。', toolCalls: [] }
    },
    executeTool: async () => { recoveredCalls += 1; return { ok: true } },
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(retryHints.length, 2)
  assert.ok(retryHints.every((hint) => /上一次回复在工具参数完成前达到输出上限被截断/.test(hint)))
  assert.equal(recoveredCalls, 1, '只执行恢复后的完整工具调用')
  assert.equal(recoveredRun.steps, 2)
  assert.ok(!JSON.stringify(recoveredRun.messages).includes('内部提示'), '重试提示只给模型看，不写入正式历史')

  // 网关在没有 [DONE] 的情况下断开：自动重来一步，不把半截内容当成结果。
  let interruptedAttempts = 0
  const interruptedReasons = []
  const interruptedRun = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async () => {
      interruptedAttempts += 1
      if (interruptedAttempts === 1) {
        return { content: '这是被切断的半截回答', toolCalls: [], incomplete: true }
      }
      return { content: '完整回答。', toolCalls: [], finishReason: 'stop' }
    },
    executeTool: async () => ({}),
    onDelta: () => {},
    onReasoning: () => {},
    onStepRetry: ({ reason }) => interruptedReasons.push(reason),
  })
  assert.equal(interruptedAttempts, 2, '流意外结束时自动重试')
  assert.deepEqual(interruptedReasons, ['interrupted'])
  assert.equal(interruptedRun.steps, 1)
  assert.equal(interruptedRun.messages.at(-1).content, '完整回答。', '半截内容不进入正式历史')

  // 网络抖动同样自动重试，而不是直接报“任务中断”。
  let flakyAttempts = 0
  const flakyRun = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async () => {
      flakyAttempts += 1
      if (flakyAttempts === 1) {
        const error = new Error('socket hang up')
        error.kind = 'network'
        throw error
      }
      return { content: '网络恢复后完成。', toolCalls: [], finishReason: 'stop' }
    },
    executeTool: async () => ({}),
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(flakyAttempts, 2)
  assert.equal(flakyRun.messages.at(-1).content, '网络恢复后完成。')

  // 纯文本达到输出上限：从断点续写，最终回答不会停在半句。
  let continuationAttempts = 0
  let sawContinueHint = false
  const continuedRun = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => {
      continuationAttempts += 1
      if (continuationAttempts === 1) {
        return { content: '第一段：结论是', toolCalls: [], finishReason: 'length' }
      }
      sawContinueHint = /从断点继续写/.test(String(request.messages.at(-1)?.content || ''))
      return { content: '按这个方案执行。', toolCalls: [], finishReason: 'stop' }
    },
    executeTool: async () => ({}),
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(continuationAttempts, 2)
  assert.equal(sawContinueHint, true, '续写请求要带上断点提示')
  assert.equal(continuedRun.messages.at(-1).content, '第一段：结论是按这个方案执行。')

  // 长任务上下文压缩：保留系统提示与最后一轮，截断历史工具结果，不拆散 tool 配对。
  const longTranscript = [{ role: 'system', content: '系统提示' }]
  for (let turn = 1; turn <= 12; turn += 1) {
    longTranscript.push({ role: 'user', content: `第 ${turn} 轮需求` })
    longTranscript.push({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: `call_${turn}`, type: 'function', function: { name: 'read_project', arguments: '{}' } }],
    })
    longTranscript.push({ role: 'tool', tool_call_id: `call_${turn}`, name: 'read_project', content: `结果${turn}:${'x'.repeat(12_000)}` })
  }
  longTranscript.push({ role: 'user', content: '最后一轮需求' })
  const compacted = compactAgentMessages(longTranscript)
  assert.equal(compacted[0].role, 'system', '压缩后系统提示必须保留')
  assert.equal(compacted.at(-1).content, '最后一轮需求', '压缩不能丢掉最新的用户消息')
  assert.ok(
    compacted.findIndex((message) => message.role !== 'system') >= 0 &&
      compacted[compacted.findIndex((message) => message.role !== 'system')].role === 'user',
    '压缩必须从整轮 user 边界开始，不能留下孤立 tool 结果',
  )
  assert.ok(JSON.stringify(compacted).length < JSON.stringify(longTranscript).length, '长任务必须真的压缩掉历史')
  assert.ok(JSON.stringify(compacted).length < 70_000, '压缩后必须落在单次请求预算内')
  assert.ok(
    compacted.some((message) => String(message.content).includes('已压缩')),
    '较早的工具结果要标注已压缩',
  )

  // 工具结果超长时必须是合法 JSON 预览，不能给模型半截 JSON（那会表现为“源码被截断”）。
  let oversizedToolMessages = null
  await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => {
      if (request.step === 1) {
        return { content: '', toolCalls: [{ id: 'huge', name: 'read_motion_project', args: {} }] }
      }
      oversizedToolMessages = request.messages
      return { content: '读完。', toolCalls: [], finishReason: 'stop' }
    },
    executeTool: async () => ({ ok: true, source: 'x'.repeat(40_000) }),
    onDelta: () => {},
    onReasoning: () => {},
  })
  const oversizedToolMessage = oversizedToolMessages.find((message) => message.role === 'tool')
  const oversizedPayload = JSON.parse(oversizedToolMessage.content)
  assert.equal(oversizedPayload.truncated, true)
  assert.ok(oversizedPayload.chars > 40_000)
  assert.match(oversizedPayload.note, /offset\/limit/, '超长结果要告诉模型怎么分页读取')
  assert.ok(oversizedPayload.preview.length > 0)

  // patch 模式：只替换命中的原文；重复命中与找不到都要明确报错。
  const patched = applyMotionEdits(
    '<h1 id="title">旧标题</h1><p class="sub">副标题</p>',
    [{ find: '旧标题', replace: '新标题' }],
  )
  assert.equal(patched.source, '<h1 id="title">新标题</h1><p class="sub">副标题</p>')
  assert.equal(patched.applied.length, 1)
  assert.throws(
    () => applyMotionEdits('<i></i><i></i>', [{ find: '<i></i>', replace: '<b></b>' }]),
    /命中 2 次/,
  )
  assert.equal(
    applyMotionEdits('<i></i><i></i>', [{ find: '<i></i>', replace: '<b></b>', all: true }]).source,
    '<b></b><b></b>',
  )
  assert.throws(
    () => applyMotionEdits('<i></i>', [{ find: '<u></u>', replace: 'x' }]),
    /没有找到目标原文/,
  )

  // 网关报上下文超限时自动压得更狠再试，而不是让整轮任务中断。
  const longMessages = [{ role: 'system', content: '系统提示' }]
  for (let turn = 1; turn <= 16; turn += 1) {
    longMessages.push({ role: 'user', content: `第 ${turn} 轮需求 ${'甲'.repeat(2_000)}` })
    longMessages.push({ role: 'assistant', content: `第 ${turn} 轮结果 ${'乙'.repeat(2_000)}` })
  }
  const contextSizes = []
  const contextRetries = []
  const shrunkRun = await runAgentHarness({
    messages: longMessages,
    signal: new AbortController().signal,
    stream: async (request) => {
      contextSizes.push(JSON.stringify(request.messages).length)
      if (contextSizes.length === 1) throw new Error("This model's maximum context length is 8192 tokens")
      return { content: '压缩后继续完成。', toolCalls: [], finishReason: 'stop' }
    },
    executeTool: async () => ({}),
    onDelta: () => {},
    onReasoning: () => {},
    onStepRetry: ({ reason }) => contextRetries.push(reason),
  })
  assert.deepEqual(contextRetries, ['context'])
  assert.equal(contextSizes.length, 2)
  assert.ok(contextSizes[1] < contextSizes[0], '上下文超限后必须压得更小再重试')
  assert.equal(shrunkRun.messages.at(-1).content, '压缩后继续完成。')

  let executedLargeBatch = 0
  let largeBatchFollowUp = null
  const largeBatchResult = await runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async (request) => {
      if (request.step === 1) {
        return {
          content: '',
          toolCalls: Array.from({ length: 9 }, (_, index) => ({ id: `c${index}`, name: 'read_project', args: {} })),
        }
      }
      largeBatchFollowUp = request.messages
      return { content: '九个大批次工具已全部执行。', toolCalls: [] }
    },
    executeTool: async () => { executedLargeBatch += 1; return { ok: true } },
    onDelta: () => {},
    onReasoning: () => {},
  })
  assert.equal(executedLargeBatch, 9, '单步工具数量不再设上限')
  assert.equal(largeBatchResult.steps, 2)
  assert.ok(
    largeBatchFollowUp?.some((message) => message.role === 'tool' && String(message.content).includes('[进度提醒]')),
    '单步大批次执行后提醒模型汇报进度，而不是静默跑完',
  )

  // 拒绝一次塞入超大源码，要求改用 append 分块，避免再次撞上输出上限。
  setActivePinia(createPinia())
  const oversizedWrite = await executeMotionTool({
    name: 'write_motion_project',
    args: { motionId: 'motion_big', source: 'x'.repeat(24001) },
  }, { messages: [], production: null }, { revision: 0 }).then(
    () => null,
    (error) => error,
  )
  assert.match(String(oversizedWrite?.message || ''), /mode=append/, '超大源码必须提示分块写入')

  // 本机 CLI 同样 fail-closed：普通模式没有生成说明，脚本在读取 API Key 前退出。
  const chatLocalPrompt = buildRunPrompt({ mode: 'chat' })
  const createLocalPrompt = buildRunPrompt({ mode: 'create' })
  const animationLocalPrompt = buildRunPrompt({ mode: 'create', creativeEngine: 'animation' })
  assert.equal(chatLocalPrompt.includes('node scripts/onestep-generate.mjs image'), false)
  assert.match(chatLocalPrompt, /onestep-mode-handoff/)
  assert.match(chatLocalPrompt, /grill-me 创作澄清协议/)
  assert.match(createLocalPrompt, /node scripts\/onestep-generate\.mjs image/)
  assert.match(createLocalPrompt, /grill-me 创作澄清协议/)
  assert.match(animationLocalPrompt, /HyperFrames/)
  assert.equal(animationLocalPrompt.includes('node scripts/onestep-generate.mjs image'), false)
  assert.match(animationLocalPrompt, /ONESTEP_ALLOW_GENERATION=0/)
  const blockedLocalGeneration = spawnSync(process.execPath, ['scripts/onestep-generate.mjs', 'image', '--prompt', 'mock'], {
    cwd: process.cwd(),
    env: { ...process.env, ONESTEP_ALLOW_GENERATION: '0', AIPING_API_KEY: 'mock-only-key' },
    encoding: 'utf8',
  })
  assert.equal(blockedLocalGeneration.status, 1)
  assert.match(blockedLocalGeneration.stderr, /普通对话.*禁用/)
  const inspectLocalEnvironment = async (allowGeneration) => {
    let output = ''
    const task = runAgent({
      preset: {
        id: 'custom',
        output: 'text',
        args: () => ['-e', 'console.log(JSON.stringify({generation:process.env.ONESTEP_ALLOW_GENERATION,api:process.env.AIPING_API_KEY||"",chat:process.env.ONESTEP_CHAT_API_KEY||""}))'],
      },
      command: process.execPath,
      prompt: 'mock',
      rootDir: process.cwd(),
      baseUrl: 'http://127.0.0.1:0',
      model: 'mock',
      apiKey: 'mock-only-key',
      apiBaseUrl: 'https://mock.local/v1',
      allowGeneration,
      onDelta: (text) => { output += text },
      onLog: () => {},
    })
    assert.equal((await task.done).exitCode, 0)
    return JSON.parse(output)
  }
  assert.deepEqual(await inspectLocalEnvironment(false), { generation: '0', api: '', chat: 'mock-only-key' })
  assert.deepEqual(await inspectLocalEnvironment(true), { generation: '1', api: 'mock-only-key', chat: 'mock-only-key' })

  // 时间轴参数归一化只接受白名单操作。
  assert.deepEqual(normalizeAgentTimelineOps({ ops: [
    { op: 'move', clipId: 'ok', start: 3 },
    { op: 'shell', clipId: 'bad' },
    { op: 'delete' },
  ] }), [{ op: 'move', clipId: 'ok', start: 3, duration: undefined, value: undefined }])

  // 本机 SSE 没有 done/error 的 EOF 是断连，不得伪装成 exitCode=0。
  globalThis.fetch = async () => streamedResponse(event({ type: 'delta', text: '部分正文' }))
  await assert.rejects(() => streamLocalAgent({ agentId: 'mock', messages: [], onDelta: () => {} }), /完成状态前中断/)

  // 刷新恢复：旧 streaming/running 不得永久卡住，必须转成可重试的停止/失败状态。
  const { recoverInterruptedMessage } = await server.ssrLoadModule('/src/features/agent/recovery.ts')
  const recovered = recoverInterruptedMessage({
    id: 'interrupted', role: 'assistant', content: '部分回复', createdAt: 2, status: 'streaming',
    generation: { id: 'gen', kind: 'image', status: 'running', prompt: 'mock', model: 'mock', modelLabel: 'mock', aspectRatio: '16:9', createdAt: 2 },
    run: {
      version: 1, status: 'running', phase: 'tool', currentStep: 2, maxSteps: 8, plan: [],
      activities: [{ id: 'tool', step: 2, name: 'read_project', title: '读取剪辑项目', status: 'running', startedAt: 2 }],
      startedAt: 1, updatedAt: 2,
    },
  })
  assert.equal(recovered.status, 'stopped')
  assert.equal(recovered.generation.status, 'failed')
  assert.match(recovered.generation.error, /状态未知/)
  assert.equal(recovered.run.status, 'stopped')
  assert.equal(recovered.run.phase, 'done')
  assert.equal(recovered.run.activities[0].status, 'stopped')

  // Store 级无付费回归：普通文案与偷跑旧生成工具都不产生任何生成请求。
  setActivePinia(createPinia())
  // agentStore 的会话守卫会引入 router；Node 回归只需最小的 history 浏览器壳。
  globalThis.window = {
    history: { state: null, pushState: () => {}, replaceState: () => {}, go: () => {} },
    location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  }
  globalThis.location = globalThis.window.location
  globalThis.history = globalThis.window.history
  globalThis.document = {
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const axios = (await import('axios')).default
  const modelRequests = []
  const motionCreateRequests = []
  const motionImportRequests = []
  const motionDiscardRequests = []
  const motionSources = new Map()
  const generationRequests = []
  const videoCreateRequests = []
  const videoStatusRequests = []
  const videoTaskShots = new Map()
  const videoTaskMeta = new Map()
  const pollFaultUsed = new Set()
  let explicitFailRemaining = 3
  const videoCreateAttempts = new Map()
  let activeVideoCreates = 0
  let maxActiveVideoCreates = 0
  let videoTaskSequence = 0
  let releaseS02Query
  const s02QueryGate = new Promise((resolve) => { releaseS02Query = resolve })
  const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const parseRequestData = (data) => {
    if (typeof data !== 'string') return data || {}
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  axios.defaults.adapter = async (config) => {
    const url = String(config.url || '')
    generationRequests.push({ url: config.url, body: config.data })

    // 视频状态查询：S03 先于 S02 完成，用于验证“预留位置、完成即入轨”。
    if (url.includes('/query/video_generation')) {
      const taskId = url.split('/').pop()
      const shot = videoTaskShots.get(taskId) || 'S00'
      const meta = videoTaskMeta.get(taskId) || {}
      videoStatusRequests.push({ taskId, shot })
      const delays = { S01: 0, S02: 0, S03: 0, S04: 0, S05: 0, S06: 0 }
      await sleepFor(delays[shot] ?? 0)
      // 轮询幂等：模拟一次网络抖动，验证宿主只重查原任务、绝不重复建单。
      if (meta.pollRecover && !pollFaultUsed.has(taskId)) {
        pollFaultUsed.add(taskId)
        const error = new Error('network timeout')
        error.code = 'network'
        throw error
      }
      // 上游明确失败：原任务无法再成功，才允许下一轮重新建单。
      // 只让首轮 3 次尝试失败，续跑时上游已恢复，用于验证成功后不再重复生成。
      if (meta.explicitFail && explicitFailRemaining > 0) {
        explicitFailRemaining -= 1
        return {
          data: {
            task_id: taskId,
            status: 'failed',
            error: 'mock 上游明确失败',
            model: 'MiniMax-H3',
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      // S02 由测试门闩放行，确保 S03 已先完成时不会占用 S02 的位置。
      if (shot === 'S02') await s02QueryGate
      return {
        data: {
          task_id: taskId,
          status: 'completed',
          model: 'MiniMax-H3',
          content: { url: `https://mock.local/generated/${taskId}.mp4` },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    // 视频建单：让 4 个任务短暂重叠以验证并发峰值；S05 首次故意失败后自动重试。
    if (url.includes('/video_generation')) {
      const body = parseRequestData(config.data)
      const text = JSON.stringify(body.content || body.prompt || '')
      const shot = (text.match(/S0[1-6]/) || ['S00'])[0]
      const attempt = (videoCreateAttempts.get(shot) || 0) + 1
      videoCreateAttempts.set(shot, attempt)
      videoCreateRequests.push({ shot, attempt, body })
      activeVideoCreates += 1
      maxActiveVideoCreates = Math.max(maxActiveVideoCreates, activeVideoCreates)
      try {
        await sleepFor(15)
        if (shot === 'S05' && attempt === 1) {
          const error = new Error('mock 视频建单失败')
          error.response = {
            status: 500,
            data: { message: 'mock 视频建单失败' },
            headers: {},
            config,
          }
          throw error
        }
        videoTaskSequence += 1
        const taskId = `mock_task_${videoTaskSequence}`
        videoTaskShots.set(taskId, shot)
        videoTaskMeta.set(taskId, {
          pollRecover: text.includes('POLL-RECOVER'),
          explicitFail: text.includes('EXPLICIT-FAIL'),
        })
        return {
          data: { task_id: taskId, status: 'pending', model: 'MiniMax-H3' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      } finally {
        activeVideoCreates -= 1
      }
    }

    return {
      data: { data: [{ url: 'https://mock.local/generated/cup.png' }] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
  const { useAgentStore } = await server.ssrLoadModule('/src/stores/agentStore.ts')
  const store = useAgentStore()
  const queuedResponses = []
  const waitFor = async (check) => {
    for (let index = 0; index < 100 && !check(); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    assert.ok(check(), JSON.stringify({ message: store.activeConversation?.messages.at(-1), generationRequests }))
  }
  const confirmStoryboardDraft = (engine = 'aigc') => {
    const conversation = store.activeConversation
    assert.equal(conversation.storyboard?.status, 'draft', JSON.stringify(conversation.storyboard))
    assert.equal(conversation.storyboard?.engine, engine)
    const result = store.confirmStoryboard(conversation.id)
    assert.ok(result, JSON.stringify(conversation.storyboard))
    assert.equal(result.engine, engine)
    assert.notEqual(result.status, 'error', result.error)
    assert.equal(conversation.storyboard.status, 'confirmed')
    const persisted = JSON.parse(localStorage.getItem('onestep_agent_conversations_v1') || '[]')
    assert.equal(persisted.find((item) => item.id === conversation.id)?.storyboard?.status, 'confirmed')
    return result
  }
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/chat/completions')) {
      const request = JSON.parse(init.body)
      modelRequests.push(request)
      const payload = queuedResponses.shift() || { content: '完成。', toolCalls: [] }
      if (payload.waitForAbort) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(event({ choices: [{ delta: { content: '等待停止信号' } }] })))
            init.signal?.addEventListener('abort', () => {
              controller.error(init.signal.reason || new DOMException('已停止生成。', 'AbortError'))
            }, { once: true })
          },
        })
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      }
      if (payload.content !== undefined) return streamedResponse(event({ choices: [{ delta: { content: payload.content }, finish_reason: 'stop' }] }))
      return streamedResponse([
        event({ choices: [{ delta: { tool_calls: [{ index: 0, id: `store_tool_${modelRequests.length}`, type: 'function', function: { name: payload.name, arguments: JSON.stringify(payload.args || {}) } }] }, finish_reason: 'tool_calls' }] }),
        'data: [DONE]\n\n',
      ].join(''))
    }
    if (href.includes('/local/motion/create')) {
      const body = JSON.parse(init.body)
      motionCreateRequests.push(body)
      const id = `motion_mock_${motionCreateRequests.length}`
      motionSources.set(id, '<html><body><div data-composition-id="main" data-start="0" data-duration="4"><section class="clip" data-start="0" data-duration="4" data-track-index="1"></section></div></body></html>')
      return new Response(JSON.stringify({
        project: {
          id, name: body.name, entry: 'index.html', entryUrl: `/local/motion/view/${id}/index.html`,
          templateId: '', sourceUrl: '', width: body.width || 1280, height: body.height || 720, fps: 30,
          createdAt: Date.now(), updatedAt: Date.now(), params: {}, missingFiles: [],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (href.includes('/local/motion/import')) {
      const body = JSON.parse(init.body)
      motionImportRequests.push(body)
      if (body.source.includes('Fail.svg')) {
        return new Response(JSON.stringify({ ok: false, error: 'mock 素材导入失败' }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, path: 'assets/uploads/Logo.svg' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (href.includes('/local/motion/check')) {
      const body = JSON.parse(init.body)
      return new Response(JSON.stringify({
        ok: true, passed: true, motionId: body.id, checkedAt: Date.now(), durationMs: 1,
        browserSkipped: true, summary: { errorCount: 0, warningCount: 0, infoCount: 0, findings: 0 },
        findings: [], log: '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (href.includes('/local/motion/discard')) {
      const body = JSON.parse(init.body)
      motionDiscardRequests.push(body)
      motionSources.delete(body.id)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (href.includes('/local/motion/write')) {
      const body = JSON.parse(init.body)
      motionSources.set(body.id, body.content)
      return new Response(JSON.stringify({ project: { id: body.id } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (href.includes('/local/motion/read')) {
      const body = JSON.parse(init.body)
      return new Response(JSON.stringify({ content: motionSources.get(body.id) || '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`未拦截的请求：${href}`)
  }
  const textConversation = store.createConversation('chat')
  const textConversationId = textConversation.id
  queuedResponses.push({ content: '这是一条完整广告文案，不是素材生成任务。' })
  await store.sendMessage('写一条咖啡广告文案')
  assert.equal(store.activeConversation.messages.at(-1).content, '这是一条完整广告文案，不是素材生成任务。', JSON.stringify({ messages: store.activeConversation.messages, modelRequests }))
  assert.equal(store.activeConversation.messages.at(-1).creativeHandoff, undefined)
  assert.equal(generationRequests.length, 0)
  assert.equal(modelRequests[0].tools.length, 2)

  queuedResponses.push({ name: 'generate_video', args: { prompt: '不应执行的付费生成', duration: 5 } })
  await store.sendMessage('直接生成咖啡视频')
  const handoffMessage = store.activeConversation.messages.at(-1)
  assert.ok(handoffMessage.creativeHandoff, JSON.stringify(handoffMessage))
  assert.equal(handoffMessage.creativeHandoff.target, 'create')
  assert.equal(handoffMessage.creativeHandoff.status, 'pending')
  assert.equal(handoffMessage.creativeHandoff.engine, 'aigc')
  assert.equal(store.activeConversation.mode || 'chat', 'chat')
  assert.equal(store.activeConversation.projectId || null, null)
  assert.equal(generationRequests.length, 0)
  assert.equal(modelRequests.length, 3)

  store.dismissCreativeHandoff(handoffMessage.id)
  assert.equal(store.activeConversation.mode || 'chat', 'chat')
  assert.equal(store.activeConversation.messages.at(-1).creativeHandoff.status, 'dismissed')
  assert.equal(store.activeConversation.projectId || null, null)
  assert.equal(generationRequests.length, 0)

  queuedResponses.push(
    { name: 'suggest_create_mode', args: { target: 'create', reason: '需要生成具体视频素材', prompt: '请按上述要求生成具体视频素材' } },
    { content: '是否切换到创作模式继续任务？', toolCalls: [] },
  )
  await store.sendMessage('接下来生成具体视频素材')
  const pendingMessage = store.activeConversation.messages.at(-1)
  assert.equal(pendingMessage.creativeHandoff.status, 'pending')
  assert.equal(pendingMessage.creativeHandoff.engine, 'aigc')
  const originalMessageCount = store.activeConversation.messages.length
  queuedResponses.push({ content: '已切换到创作模式，将继续处理。', toolCalls: [] })
  const accepted = store.acceptCreativeHandoff(pendingMessage.id)
  assert.equal(accepted.conversationId, textConversationId)
  await waitFor(() => !store.isStreaming)
  assert.equal(store.activeId, textConversationId)
  assert.equal(store.activeConversation.mode, 'create')
  assert.equal(store.activeConversation.creativeEngine, 'aigc')
  assert.ok(store.activeConversation.projectId)
  assert.ok(store.activeConversation.messages.length > originalMessageCount)
  assert.equal(generationRequests.length, 0)
  assert.equal(modelRequests.length, 6)
  assert.equal(modelRequests[5].tools.length, 9)
  assert.ok(modelRequests[5].messages.some((message) => message.role === 'user' && message.content === '接下来生成具体视频素材'))
  assert.match(modelRequests[5].messages.filter((message) => message.role === 'user').at(-1).content, /请按上述要求生成具体视频素材/)

  // OpenMotion + Logo：动画模式必须进入 Agent 和 motion 工具，不得被“替换”字样送入旧图片编辑。
  store.setCreativeEngine(textConversationId, 'animation')
  const animationRequestStart = modelRequests.length
  queuedResponses.push(
    { name: 'read_motion_template', args: { templateId: 'motion-dac924da-010f-4445-baf3-a39cb033e48f', includeDocument: false } },
    { content: '已读取 OpenMotion 模板，下一步创建 HyperFrames 工程。', toolCalls: [] },
  )
  await store.sendMessage('使用 OpenMotion 做同款，替换为我的 Logo、文案与品牌', {
    attachments: [{
      id: 'mock-logo', kind: 'image', name: 'Logo.svg', mime: 'image/svg+xml', size: 3,
      url: '/generated/uploads/Logo.svg', createdAt: Date.now(),
    }],
  })
  assert.equal(store.activeConversation.creativeEngine, 'animation')
  assert.equal(generationRequests.length, 0)
  assert.notEqual(store.activeConversation.messages.at(-1).model, '多模态素材编辑')
  assert.ok(store.activeConversation.messages.at(-1).run.activities.some((item) => item.name === 'read_motion_template'))
  const animationRequest = modelRequests[animationRequestStart]
  assert.ok(animationRequest.tools.some((tool) => tool.function.name === 'import_motion_asset'))
  assert.ok(animationRequest.tools.every((tool) => !['generate_image', 'generate_video', 'generate_storyboard'].includes(tool.function.name)))

  // 即使模型返回跨引擎工具，宿主也 fail-closed，且不会启动付费任务。
  queuedResponses.push(
    { name: 'generate_video', args: { prompt: '动画模式不应执行', duration: 5 } },
    { content: '已阻止跨引擎工具。', toolCalls: [] },
  )
  await store.sendMessage('尝试错误的视频生成工具')
  assert.equal(generationRequests.length, 0)
  assert.match(store.activeConversation.messages.at(-1).run.activities.at(-1).summary, /动画模式只使用/)

  // 动画同样先出分镜：草案内偷跑 create 会被拦截，确认后四镜各自建工程；失败只续跑缺镜。
  const animationStoryboardArgs = {
    title: '四镜品牌动画', brief: '用品牌 Logo 制作四镜产品发布动画。', continuity: '统一赤陶色品牌背景，始终引用原始 Logo 素材。',
    storyboard_text: 'S01 Logo 入场\nS02 产品标语\nS03 产品细节\nS04 品牌落版', aspect_ratio: '16:9', resolution: '768P', delivery: 'full',
    shots: [
      { id: 'S01', prompt: 'Logo 从画面中心缩放进入，停留后向左退场。', duration: 4, reference_svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#eee"/><text id="brand-custom" x="100" y="100">AI Ping</text></svg>' },
      { id: 'S02', prompt: '承接 S01，产品标语从右侧进入并定格。', duration: 4 },
      { id: 'S03', prompt: '产品细节推近，Logo 保持在右上角。', duration: 4 },
      { id: 'S04', prompt: '产品与原始 Logo 一起落版。', duration: 4 },
    ],
  }
  const motionCreatesBeforeDraft = motionCreateRequests.length
  const motionImportsBeforeDraft = motionImportRequests.length
  queuedResponses.push(
    { name: 'prepare_storyboard', args: animationStoryboardArgs },
    { name: 'create_motion_project', args: { name: '不应创建的草案工程' } },
    { content: '分镜仍待确认，工程创建已阻止。', toolCalls: [] },
  )
  await store.sendMessage('制作四镜品牌动画')
  assert.equal(store.activeConversation.storyboard.status, 'draft')
  assert.equal(store.activeConversation.storyboard.engine, 'animation')
  assert.ok(store.activeConversation.storyboard.shots.every((shot) => shot.referenceStatus === 'ready' && shot.referenceSource === 'code' && shot.referenceImage.startsWith('data:image/svg+xml')))
  assert.ok(decodeURIComponent(store.activeConversation.storyboard.shots[0].referenceImage).includes('brand-custom'))
  assert.equal(motionCreateRequests.length, motionCreatesBeforeDraft)
  assert.equal(generationRequests.length, 0)
  assert.match(store.activeConversation.messages.at(-1).run.activities.at(-1).summary, /分镜仍等待/)
  const motionSource = (shot, includeLogo = true) => `<html><body><div data-composition-id="main" data-start="0" data-duration="4" data-width="1280" data-height="720"><section class="clip" data-start="0" data-duration="4" data-track-index="1"><h1>${shot}</h1>${includeLogo ? '<img id="brand-logo" src="assets/uploads/Logo.svg">' : ''}</section></div><script>window.__timelines = {}</script></body></html>`
  for (const [index, shot] of ['S01', 'S02', 'S03', 'S04'].entries()) {
    queuedResponses.push(
      { name: 'create_motion_project', args: { name: `确认后的品牌动画 ${shot}`, at: index * 4, duration: 4 } },
      { name: 'write_motion_project', args: { motionId: `motion_mock_${motionCreatesBeforeDraft + index + 1}`, source: motionSource(shot, shot !== 'S03') } },
      { content: `${shot} 本轮结束。`, toolCalls: [] },
    )
  }
  confirmStoryboardDraft('animation')
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'failed')
  assert.equal(motionCreateRequests.length, motionCreatesBeforeDraft + 4)
  assert.deepEqual(motionCreateRequests.slice(-4).map((request) => request.name), ['S01', 'S02', 'S03', 'S04'].map((shot) => `${shot} · 确认后的品牌动画 ${shot}`))
  assert.ok(motionCreateRequests.slice(-4).every((request) => request.width === 1280 && request.height === 720))
  let animationProduction = store.activeConversation.production
  assert.equal(animationProduction.engine, 'animation')
  assert.equal(animationProduction.shots.length, 4)
  assert.deepEqual(animationProduction.shots.map((shot) => shot.status), ['succeeded', 'succeeded', 'failed', 'succeeded'])
  assert.ok(animationProduction.shots.every((shot) => shot.motionId && shot.clipId))
  assert.equal(new Set(animationProduction.shots.map((shot) => shot.motionId)).size, 4)
  assert.ok(animationProduction.shots.filter((shot) => shot.status === 'succeeded').every((shot) => shot.motionSourceReady))
  assert.deepEqual(animationProduction.shots.map((shot) => shot.timelineStart), [0, 4, 8, 12])
  assert.equal(motionImportRequests.length - motionImportsBeforeDraft, 4, '每镜都应自动导入早期消息里的原始 Logo')
  assert.ok(animationProduction.shots.every((shot) => shot.requiredAssetSources.includes('/generated/uploads/Logo.svg')))
  assert.ok(animationProduction.shots.every((shot) => shot.requiredAssetPaths.includes('assets/uploads/Logo.svg')))
  assert.ok(motionSources.get(animationProduction.shots[0].motionId).includes('src="assets/uploads/Logo.svg"'))
  assert.equal(generationRequests.length, 0)

  const failedMotionId = animationProduction.shots[2].motionId
  queuedResponses.push(
    { name: 'read_motion_project', args: { motionId: failedMotionId } },
    { name: 'write_motion_project', args: { motionId: failedMotionId, source: motionSource('S03') } },
    { content: 'S03 已补回原始 Logo 并完成。', toolCalls: [] },
  )
  const resumed = store.resumeProduction(textConversationId)
  assert.equal(resumed.remaining, 1)
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'done')
  animationProduction = store.activeConversation.production
  assert.equal(motionCreateRequests.length, motionCreatesBeforeDraft + 4, '续跑不得重建任何工程')
  assert.equal(motionImportRequests.length - motionImportsBeforeDraft, 4, '续跑不得重复导入素材')
  assert.equal(animationProduction.shots[2].motionId, failedMotionId)
  assert.equal(animationProduction.shots[2].attempt, 2)
  assert.deepEqual(animationProduction.shots.map((shot) => shot.attempt), [1, 1, 2, 1])
  assert.ok(animationProduction.shots.every((shot) => shot.status === 'succeeded' && shot.motionSourceReady))
  assert.ok([...motionSources.values()].every((source) => !/invert|brightness\s*\(\s*0/i.test(source)))

  const animationProjects = (await server.ssrLoadModule('/src/stores/editProjectStore.ts')).useEditProjectStore()
  const animationProject = animationProjects.getProject(store.activeConversation.projectId)
  const animationClips = animationProduction.shots.map((shot) => animationProject.tracks.flatMap((track) => track.clips).find((clip) => clip.id === shot.clipId))
  assert.ok(animationClips.every(Boolean))
  assert.equal(new Set(animationClips.map((clip) => clip.trackId || animationProject.tracks.find((track) => track.clips.includes(clip))?.id)).size, 4, '相邻镜头必须在独立轨道重叠转场')
  assert.deepEqual(animationClips.map((clip) => Number(clip.start.toFixed(1))), [0, 3.6, 7.2, 10.8])
  assert.ok(animationClips.every((clip) => clip.duration === 4))
  assert.deepEqual(animationClips[0].opacityKeyframes.map((point) => [point.time, point.value]), [[3.6, 1], [4, 0]])
  assert.deepEqual(animationClips[1].opacityKeyframes.map((point) => [point.time, point.value]), [[0, 0], [0.4, 1], [3.6, 1], [4, 0]])
  assert.deepEqual(animationClips[3].opacityKeyframes.map((point) => [point.time, point.value]), [[0, 0], [0.4, 1]])
  assert.ok(modelRequests.at(-1).messages.some((message) => message.role === 'system' && String(message.content).includes('状态：用户已确认')))

  // 主画面多元素上下文：只允许读写选中的 motion，越权写回失败，合法写回推进主 Player 的 sourceVersion。
  const selectedMotionClip = animationClips[0]
  const selectedMotionTrack = animationProject.tracks.find((track) => track.clips.includes(selectedMotionClip))
  const untouchedMotionId = animationProduction.shots[1].motionId
  const untouchedSource = motionSources.get(untouchedMotionId)
  const selectedMotionId = animationProduction.shots[0].motionId
  const { useMotionStore } = await server.ssrLoadModule('/src/stores/motionStore.ts')
  const motionStore = useMotionStore()
  const sourceVersionBefore = motionStore.stateOf(selectedMotionId).sourceVersion
  const selectedElements = [
    { hfId: 'hero-title', selector: '[data-hf-id="hero-title"]', label: '主标题', tagName: 'h1', textContent: '旧标题', sourceFile: 'index.html', selectedAtMotionTime: 1.2, boundingBox: { x: 10, y: 20, width: 300, height: 60 }, sectionId: 's01', sectionLabel: 'S01 · 身份亮相', sectionSelector: 'section#s01.clip', parentPath: 'div.copy', region: '画面中央', role: '文字' },
    { hfId: 'brand-logo', selector: '[data-hf-id="brand-logo"]', label: '品牌 Logo', tagName: 'img', src: 'assets/uploads/Logo.svg', sourceFile: 'index.html', selectedAtMotionTime: 1.2, boundingBox: { x: 500, y: 20, width: 80, height: 80 }, sectionId: 's01', sectionLabel: 'S01 · 身份亮相', sectionSelector: 'section#s01.clip', parentPath: 'header.brand', region: '右上方', role: 'Logo' },
  ]
  const targetedSource = motionSource('S01').replace('<h1>S01</h1>', '<h1 data-hf-id="hero-title">只改选中标题</h1>')
  const targetedRequestStart = modelRequests.length
  const createsBeforeTargeted = motionCreateRequests.length
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '原生越权创建', at: 0, duration: 4 } },
    { content: '```onestep-tool\n{"tool":"create_motion_project","args":{"name":"旧文本越权创建","at":0,"duration":4}}\n```' },
    { name: 'read_motion_project', args: { motionId: untouchedMotionId } },
    { name: 'write_motion_project', args: { motionId: untouchedMotionId, source: motionSource('越权修改') } },
    { name: 'read_motion_project', args: { motionId: selectedMotionId } },
    { name: 'write_motion_project', args: { motionId: selectedMotionId, source: targetedSource } },
    { content: '只更新了选中的标题与 Logo 元素。', toolCalls: [] },
  )
  await store.sendMessage('只修改选中的两个元素，其他内容保持不变', {
    clips: [{
      id: selectedMotionClip.id, name: selectedMotionClip.name, kind: 'motion',
      trackId: selectedMotionTrack.id, trackName: selectedMotionTrack.name, trackKind: selectedMotionTrack.kind,
      start: selectedMotionClip.start, duration: selectedMotionClip.duration, url: selectedMotionClip.url,
      motionId: selectedMotionId, motionElements: selectedElements, scope: 'element',
      motionElementEdits: [
        { note: '标题改成新文案', elements: [selectedElements[0]] },
        { note: 'Logo 只调整位置，不重绘、不改色。', elements: [selectedElements[1]] },
      ],
      note: '标题改成新文案，Logo 只调整位置，不重绘、不改色。',
    }],
  })
  const targetedRequest = modelRequests[targetedRequestStart]
  assert.deepEqual(targetedRequest.tools.map((tool) => tool.function.name), ['read_project', 'read_motion_project', 'write_motion_project', 'review_motion_project'])
  const targetedActivities = store.activeConversation.messages.at(-1).run.activities
  assert.equal(targetedActivities.filter((activity) => activity.summary === '本轮未开放工具 create_motion_project，已阻止越权调用。').length, 2, '原生与旧文本创建都必须 fail-closed')
  assert.equal(targetedActivities.filter((activity) => activity.summary === '已阻止访问未选中的动效工程。').length, 2, '未选工程读取与写回都必须 fail-closed')
  assert.equal(motionCreateRequests.length, createsBeforeTargeted, '越权创建不得留下新工程')
  const targetedUserContext = targetedRequest.messages.filter((message) => message.role === 'user').at(-1).content
  assert.match(targetedUserContext, /选中元素 1：主标题/)
  assert.match(targetedUserContext, /选中元素 2：品牌 Logo/)
  assert.match(targetedUserContext, /选择粒度=元素级/)
  assert.match(targetedUserContext, /本轮是元素级修改：只允许改动点选的元素本身及其直接动画/)
  assert.match(targetedUserContext, /所属镜头：S01 · 身份亮相/)
  assert.match(targetedUserContext, /画面位置：画面中央/)
  assert.match(targetedUserContext, /本轮要求：标题改成新文案/)
  assert.match(targetedUserContext, /本轮要求：Logo 只调整位置，不重绘、不改色。/)
  assert.ok(
    targetedUserContext.indexOf('本轮要求：标题改成新文案')
      < targetedUserContext.indexOf('本轮要求：Logo 只调整位置'),
    '同一工程的多条元素意见必须各自绑定到对应元素',
  )
  assert.match(targetedUserContext, /data-hf-id=hero-title/)
  assert.match(targetedUserContext, /data-hf-id=brand-logo/)
  assert.match(targetedUserContext, /只允许修改这个元素及其直接动画/)
  assert.equal(motionSources.get(untouchedMotionId), untouchedSource, '未选中的工程绝不能被写回')
  assert.equal(motionSources.get(selectedMotionId), targetedSource)
  assert.ok(motionStore.stateOf(selectedMotionId).sourceVersion > sourceVersionBefore)
  assert.equal(generationRequests.length, 0)
  store.setCreativeEngine(textConversationId, 'aigc')

  // 新一轮实际生成才开放工具，但这里只返回本地后台任务，不发真实图片/视频请求。
  queuedResponses.push(
    { name: 'generate_image', args: { prompt: '一只赤陶色杯子', aspectRatio: '16:9', model: 'mock-image' } },
    { content: '图片任务已启动。', toolCalls: [] },
  )
  await store.sendMessage('生成一只赤陶色杯子的图片')
  await waitFor(() => generationRequests.length === 1)
  assert.equal(generationRequests.length, 1)
  assert.match(String(generationRequests[0].url), /images\/generations/)
  for (let index = 0; index < 100 && store.activeConversation.messages.at(-1).generation?.status === 'running'; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(store.activeConversation.messages.at(-1).generation.status, 'succeeded')

  // 新视频不能绕过草案直接生成；宿主拒绝时不产生任何视频建单。
  const createsBeforeDirectVideo = videoCreateRequests.length
  queuedResponses.push(
    { name: 'generate_video', args: { prompt: '未确认分镜，不应执行', duration: 5 } },
    { content: '已阻止未确认的视频生成。', toolCalls: [] },
  )
  await store.sendMessage('尝试直接生成未确认的视频')
  assert.equal(videoCreateRequests.length, createsBeforeDirectVideo)
  assert.match(store.activeConversation.messages.at(-1).run.activities.at(-1).summary, /prepare_storyboard/)

  // 完整分镜：先确认草案，6 个镜头再全部执行；S03 先于 S02 完成时仍保留 S02 的固定位置。
  const { useEditProjectStore } = await server.ssrLoadModule('/src/stores/editProjectStore.ts')
  const projects = useEditProjectStore()
  const project = projects.getProject(store.activeConversation.projectId)
  assert.ok(project)
  const timelineBase = project.tracks.reduce(
    (end, track) => track.clips.reduce(
      (trackEnd, clip) => Math.max(trackEnd, clip.start + clip.duration),
      end,
    ),
    0,
  )
  const storyboardShots = Array.from({ length: 6 }, (_, index) => {
    const id = `S0${index + 1}`
    return {
      id,
      prompt: `${id} 完整分镜提示词：同一角色与场景锚点，推进第 ${index + 1} 个动作。`,
      duration: 4,
    }
  })
  const storyboardArgs = {
    title: '六镜并发顺序回归',
    brief: '完整广告需求：同一角色、同一场景、六个连续动作，最后落到产品。',
    continuity: '角色始终穿赤陶色外套，场景固定为暖光工作台，镜头色调一致。',
    storyboard_text: storyboardShots.map((shot) => `${shot.id} 4s ${shot.prompt}`).join('\n'),
    aspect_ratio: '16:9',
    resolution: '768P',
    delivery: 'full',
    shots: storyboardShots,
  }
  let sawOutOfOrderReservedSlot = false
  const recordedClipStarts = () => projects
    .getProject(store.activeConversation.projectId)
    ?.tracks.flatMap((track) => track.clips)
    .filter((clip) => clip.kind === 'video' && /^S0[1-6] ·/.test(clip.name))
    .map((clip) => clip.start) || []
  const waitForStoryboard = async (finalStatuses = ['done']) => {
    for (let index = 0; index < 6000; index += 1) {
      const production = store.activeConversation.production
      const starts = recordedClipStarts()
      if (
        starts.some((start) => Math.abs(start - (timelineBase + 8)) < 0.001) &&
        !starts.some((start) => Math.abs(start - (timelineBase + 4)) < 0.001)
      ) {
        sawOutOfOrderReservedSlot = true
        releaseS02Query()
      }
      const running = store.activeConversation.messages.some((message) =>
        (message.generations || []).some((generation) => generation.status === 'running'),
      )
      if (finalStatuses.includes(production?.status) && !running && !store.isStreaming) return
      await sleepFor(2)
    }
    assert.fail(JSON.stringify({
      production: store.activeConversation.production,
      clips: recordedClipStarts(),
      requests: videoCreateRequests,
    }))
  }
  const projectTimelineEnd = () => projects
    .getProject(store.activeConversation.projectId)
    ?.tracks.reduce(
      (end, track) => track.clips.reduce(
        (trackEnd, clip) => Math.max(trackEnd, clip.start + clip.duration),
        end,
      ),
      0,
    ) || 0

  const createsBeforeFirstStoryboard = videoCreateRequests.length
  const referenceImagesBeforeFirstStoryboard = generationRequests.length
  queuedResponses.push(
    { name: 'prepare_storyboard', args: storyboardArgs },
    { content: '完整分镜草案已保存，请在剪辑台确认。', toolCalls: [] },
  )
  await store.sendMessage('按完整分镜生成整支视频', { automation: 'default' })
  assert.equal(videoCreateRequests.length, createsBeforeFirstStoryboard, '确认前不得创建任何视频任务')
  assert.equal(generationRequests.length - referenceImagesBeforeFirstStoryboard, 6, 'AIGC 应先为每镜生成参考图')
  assert.ok(store.activeConversation.storyboard.shots.every((shot) => shot.referenceStatus === 'ready' && shot.referenceImage))
  confirmStoryboardDraft()
  await waitForStoryboard()

  const production = store.activeConversation.production
  assert.ok(production)
  assert.equal(production.status, 'done')
  assert.equal(production.timelineStart, timelineBase)
  assert.deepEqual(production.shots.map((shot) => shot.id), ['S01', 'S02', 'S03', 'S04', 'S05', 'S06'])
  assert.ok(production.shots.every((shot) => shot.status === 'succeeded'))
  assert.deepEqual(production.shots.map((shot) => shot.timelineStart), [
    timelineBase,
    timelineBase + 4,
    timelineBase + 8,
    timelineBase + 12,
    timelineBase + 16,
    timelineBase + 20,
  ])
  assert.equal(sawOutOfOrderReservedSlot, true, JSON.stringify({ clips: recordedClipStarts() }))
  assert.ok(maxActiveVideoCreates <= 4)
  assert.ok(maxActiveVideoCreates >= 2)
  assert.equal(videoCreateRequests.length, 7, JSON.stringify(videoCreateRequests))
  assert.equal(videoCreateAttempts.get('S05'), 2)
  assert.ok(videoCreateRequests.every((request) => request.body.content?.some((part) => part.role === 'first_frame')), '正式视频必须使用对应分镜参考图作为首帧')
  assert.ok([...videoCreateAttempts.entries()].filter(([shot]) => shot !== 'S05').every(([, count]) => count === 1))
  const videoStarts = recordedClipStarts().sort((a, b) => a - b)
  assert.deepEqual(videoStarts, [
    timelineBase,
    timelineBase + 4,
    timelineBase + 8,
    timelineBase + 12,
    timelineBase + 16,
    timelineBase + 20,
  ])

  const storyboardMessage = store.activeConversation.messages.find((message) => message.generations?.length === 6)
  assert.ok(storyboardMessage)
  const retriedShot = storyboardMessage.generations.find((generation) => generation.sceneId === 'S05')
  assert.equal(retriedShot.status, 'succeeded')
  assert.equal(retriedShot.attempt, 2)
  assert.equal(retriedShot.autoRetryCount, 1)
  assert.ok(retriedShot.taskId)

  // 续跑相同完整制作单：已成功镜头全部跳过，不再新建视频任务或重复扣费。
  const createsBeforeContinue = videoCreateRequests.length
  const referenceImagesBeforeContinue = generationRequests.length
  queuedResponses.push(
    { name: 'generate_storyboard', args: storyboardArgs },
    { content: '整片已全部完成，无需重复生成。', toolCalls: [] },
  )
  await store.sendMessage('继续生成未完成镜头', { automation: 'default' })
  assert.equal(videoCreateRequests.length, createsBeforeContinue)
  assert.equal(generationRequests.length, referenceImagesBeforeContinue, '相同分镜续跑不得重复生成参考图')
  confirmStoryboardDraft()
  await waitForStoryboard()
  assert.equal(videoCreateRequests.length, createsBeforeContinue)
  assert.equal(store.activeConversation.production.timelineStart, timelineBase)
  assert.equal(recordedClipStarts().length, 6)

  // 画幅/分辨率变化：即使提示词相同也不能复用旧结果，必须重生成并在原位置替换。
  const createsBeforeFormat = videoCreateRequests.length
  const formatArgs = { ...storyboardArgs, resolution: '2K' }
  queuedResponses.push(
    { name: 'generate_storyboard', args: formatArgs },
    { content: '已按 2K 重新生成整片。', toolCalls: [] },
  )
  await store.sendMessage('换成 2K 重新生成整片', { automation: 'default' })
  assert.equal(videoCreateRequests.length, createsBeforeFormat)
  confirmStoryboardDraft()
  await waitForStoryboard()
  assert.equal(videoCreateRequests.length - createsBeforeFormat, 6)
  assert.equal(store.activeConversation.production.resolution, '2K')
  assert.equal(recordedClipStarts().length, 6)
  assert.deepEqual(recordedClipStarts().sort((a, b) => a - b), videoStarts)

  // 只改 S03 提示词：仅重生成这一镜，并原位替换，不新增同镜号片段。
  const createsBeforeRevise = videoCreateRequests.length
  const revisedShots = storyboardShots.map((shot, index) => (
    index === 2 ? { ...shot, prompt: `${shot.id} 改稿：换成低角度仰拍，其余连续性不变。` } : shot
  ))
  const reviseArgs = {
    ...formatArgs,
    storyboard_text: revisedShots.map((shot) => `${shot.id} 4s ${shot.prompt}`).join('\n'),
    shots: revisedShots,
  }
  queuedResponses.push(
    { name: 'generate_storyboard', args: reviseArgs },
    { content: 'S03 已按改稿重新生成。', toolCalls: [] },
  )
  await store.sendMessage('只改 S03 的镜头角度', { automation: 'default' })
  assert.equal(videoCreateRequests.length, createsBeforeRevise)
  confirmStoryboardDraft()
  await waitForStoryboard()
  assert.equal(videoCreateRequests.length - createsBeforeRevise, 1)
  assert.equal(recordedClipStarts().length, 6)
  assert.deepEqual(recordedClipStarts().sort((a, b) => a - b), videoStarts)
  const revisedShot = store.activeConversation.production.shots.find((shot) => shot.id === 'S03')
  assert.equal(revisedShot.status, 'succeeded')
  assert.match(revisedShot.prompt, /低角度仰拍/)

  // 轮询抖动只重查原任务；上游明确失败才允许重新建单，最多 3 次；续跑不重复成功镜头。
  const timelineBeforeRecovery = projectTimelineEnd()
  const recoveryShots = [
    { id: 'S01', prompt: 'S01 RECOVERY 正常镜头：同一条走廊。', duration: 4 },
    { id: 'S02', prompt: 'S02 POLL-RECOVER 轮询抖动镜头：同一条走廊继续前进。', duration: 4 },
    { id: 'S03', prompt: 'S03 EXPLICIT-FAIL 上游明确失败镜头：同一条走廊回头。', duration: 4 },
  ]
  const recoveryArgs = {
    title: '失败恢复回归',
    brief: '另一支片：验证轮询抖动、上游明确失败与续跑复用。',
    continuity: '同一角色、同一条走廊、同一光线。',
    storyboard_text: recoveryShots.map((shot) => `${shot.id} 4s ${shot.prompt}`).join('\n'),
    aspect_ratio: '16:9',
    resolution: '768P',
    delivery: 'full',
    shots: recoveryShots,
  }
  const createsBeforeRecovery = videoCreateRequests.length
  queuedResponses.push(
    { name: 'generate_storyboard', args: recoveryArgs },
    { content: '已启动失败恢复回归制作单。', toolCalls: [] },
  )
  await store.sendMessage('生成失败恢复回归整片', { automation: 'default' })
  assert.equal(videoCreateRequests.length, createsBeforeRecovery)
  confirmStoryboardDraft()
  await waitForStoryboard(['failed'])
  const failedProduction = store.activeConversation.production
  assert.equal(failedProduction.title, '失败恢复回归')
  assert.equal(failedProduction.timelineStart, timelineBeforeRecovery)
  assert.equal(failedProduction.status, 'failed')
  assert.deepEqual(failedProduction.shots.map((shot) => [shot.id, shot.status]), [
    ['S01', 'succeeded'],
    ['S02', 'succeeded'],
    ['S03', 'failed'],
  ])
  const recoveryCreates = videoCreateRequests.slice(createsBeforeRecovery)
  const recoveryCreateCounts = recoveryCreates.reduce((counts, request) => {
    counts[request.shot] = (counts[request.shot] || 0) + 1
    return counts
  }, {})
  assert.deepEqual(recoveryCreateCounts, { S01: 1, S02: 1, S03: 3 })
  const allGenerations = store.activeConversation.messages.flatMap((message) => message.generations || [])
  const pollShotGeneration = allGenerations.find(
    (generation) => generation.sceneId === 'S02' && generation.prompt.includes('POLL-RECOVER'),
  )
  // 轮询抖动在 pollVideoStatus 内重查同一个 taskId，不升级为新的生成尝试。
  assert.equal(pollShotGeneration.status, 'succeeded')
  assert.equal(pollShotGeneration.attempt, 1)
  assert.equal((pollShotGeneration.autoRetryCount || 0), 0)
  assert.ok(pollShotGeneration.taskId)
  assert.ok(videoStatusRequests.filter((request) => request.taskId === pollShotGeneration.taskId).length >= 2)
  const failedShotGeneration = allGenerations.find(
    (generation) => generation.sceneId === 'S03' && generation.prompt.includes('EXPLICIT-FAIL'),
  )
  assert.equal(failedShotGeneration.attempt, 3)
  assert.equal(failedShotGeneration.autoRetryCount, 2)
  assert.equal(failedShotGeneration.taskId, undefined)
  const recoveryClips = () => projects
    .getProject(store.activeConversation.projectId)
    ?.tracks.flatMap((track) => track.clips)
    .filter((clip) => clip.start >= timelineBeforeRecovery - 0.001)
    .map((clip) => clip.start) || []
  assert.deepEqual(recoveryClips().sort((a, b) => a - b), [
    timelineBeforeRecovery,
    timelineBeforeRecovery + 4,
  ])

  // 续跑：S01/S02 跳过，只重生成失败的 S03，并回填它预留的位置。
  const createsBeforeRecoveryContinue = videoCreateRequests.length
  queuedResponses.push(
    { name: 'generate_storyboard', args: recoveryArgs },
    { content: '继续完成剩余镜头。', toolCalls: [] },
  )
  await store.sendMessage('继续生成未完成镜头', { automation: 'default' })
  assert.equal(videoCreateRequests.length, createsBeforeRecoveryContinue)
  confirmStoryboardDraft()
  await waitForStoryboard()
  assert.equal(videoCreateRequests.length - createsBeforeRecoveryContinue, 1)
  assert.equal(videoCreateRequests.at(-1).shot, 'S03')
  const recoveredProduction = store.activeConversation.production
  assert.equal(recoveredProduction.status, 'done')
  assert.ok(recoveredProduction.shots.every((shot) => shot.status === 'succeeded'))
  assert.deepEqual(recoveryClips().sort((a, b) => a - b), [
    timelineBeforeRecovery,
    timelineBeforeRecovery + 4,
    timelineBeforeRecovery + 8,
  ])

  // 逐镜编辑与单镜 AI 重做：未更新参考图不能总确认，其他镜头和参考图不被模型顺带改掉。
  const modularArgs = {
    title: '逐镜编辑回归', brief: '两镜产品片，验证逐卡编辑和单镜重做。', continuity: '同一产品与暖色背景。',
    storyboard_text: 'S01 产品出现\nS02 Logo 落版', aspect_ratio: '16:9', resolution: '768P', delivery: 'full',
    shots: [
      { id: 'S01', prompt: '产品从左侧进入并停在中央。', duration: 4 },
      { id: 'S02', prompt: 'Logo 在产品右侧落版。', duration: 4 },
    ],
  }
  const modularVideoCreates = videoCreateRequests.length
  queuedResponses.push(
    { name: 'prepare_storyboard', args: modularArgs },
    { content: '两镜参考图已准备。', toolCalls: [] },
  )
  await store.sendMessage('先制作两镜分镜参考图')
  assert.equal(videoCreateRequests.length, modularVideoCreates)
  const modularConversationId = store.activeConversation.id
  const untouchedReference = store.activeConversation.storyboard.shots[0].referenceImage
  store.updateStoryboardShot(modularConversationId, 'S02', { prompt: '手动改过的 S02 脚本。' })
  assert.equal(store.activeConversation.storyboard.shots[1].referenceStatus, 'pending')
  const blockedConfirmation = store.confirmStoryboard(modularConversationId)
  assert.equal(blockedConfirmation.status, 'error')
  assert.equal(store.activeConversation.storyboard.status, 'draft')
  assert.equal(videoCreateRequests.length, modularVideoCreates)
  const referenceImagesBeforeSingleRevision = generationRequests.length
  queuedResponses.push(
    {
      name: 'prepare_storyboard',
      args: {
        ...modularArgs,
        shots: [
          { id: 'S01', prompt: '模型不应修改的 S01。', duration: 4 },
          { id: 'S02', prompt: 'AI 单镜重做：Logo 从产品后方翻入并落版。', duration: 4 },
        ],
      },
    },
    { content: '只重做了 S02。', toolCalls: [] },
  )
  await store.regenerateStoryboardShot(modularConversationId, 'S02', '让 Logo 从产品后方翻入')
  assert.equal(store.activeConversation.storyboard.shots[0].prompt, modularArgs.shots[0].prompt)
  assert.equal(store.activeConversation.storyboard.shots[0].referenceImage, untouchedReference)
  assert.match(store.activeConversation.storyboard.shots[1].prompt, /产品后方翻入/)
  assert.ok(store.activeConversation.storyboard.shots.every((shot) => shot.referenceStatus === 'ready'))
  assert.equal(generationRequests.length - referenceImagesBeforeSingleRevision, 1)
  assert.equal(videoCreateRequests.length, modularVideoCreates)

  const generationBeforeUserReference = generationRequests.length
  queuedResponses.push(
    {
      name: 'prepare_storyboard',
      args: { ...modularArgs, shots: [modularArgs.shots[0]] },
    },
    { content: '已优先使用用户参考图。', toolCalls: [] },
  )
  await store.sendMessage('用我的图片作为分镜参考', {
    attachments: [{ id: 'storyboard-user-ref', kind: 'image', name: '用户产品图.png', mime: 'image/png', size: 3, url: 'https://mock.local/user-reference.png', createdAt: Date.now() }],
  })
  assert.equal(store.activeConversation.storyboard.shots[0].referenceImage, 'https://mock.local/user-reference.png')
  assert.equal(store.activeConversation.storyboard.shots[0].referenceSource, 'user')
  assert.equal(generationRequests.length, generationBeforeUserReference)

  // 普通对话确认卡必须把目标引擎带入会话，并持久化；接受后只开放动画工具。
  const animationConversation = store.createConversation()
  const animationConversationId = animationConversation.id
  queuedResponses.push(
    {
      name: 'suggest_create_mode',
      args: {
        target: 'create', engine: 'animation', reason: '需要复刻 OpenMotion 动效',
        prompt: '用指定 OpenMotion 模板创建 HyperFrames 工程并替换 Logo',
      },
    },
    { content: '是否切换到动画模式？', toolCalls: [] },
  )
  await store.sendMessage('帮我用 OpenMotion 复刻这个模板')
  const animationHandoff = store.activeConversation.messages.at(-1).creativeHandoff
  assert.equal(animationHandoff.engine, 'animation')
  queuedResponses.push({ content: '已进入动画模式。', toolCalls: [] })
  const acceptedAnimation = store.acceptCreativeHandoff(store.activeConversation.messages.at(-1).id)
  assert.equal(acceptedAnimation.creativeEngine, 'animation')
  await waitFor(() => !store.isStreaming)
  assert.equal(store.activeId, animationConversationId)
  assert.equal(store.activeConversation.creativeEngine, 'animation')
  assert.ok(store.activeConversation.projectId)
  assert.ok(modelRequests.at(-1).tools.some((tool) => tool.function.name === 'create_motion_project'))
  assert.ok(modelRequests.at(-1).tools.every((tool) => !['generate_image', 'generate_video', 'generate_storyboard'].includes(tool.function.name)))
  const persistedConversations = JSON.parse(localStorage.getItem('onestep_agent_conversations_v1') || '[]')
  assert.equal(persistedConversations.find((item) => item.id === animationConversationId)?.creativeEngine, 'animation')

  // 旧式 motion 工具在普通对话只形成动画交接卡，接受后不能误进 AIGC。
  const motionHandoffConversation = store.createConversation()
  const motionHandoffConversationId = motionHandoffConversation.id
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '普通对话里的动效请求' } },
    { content: '需要切换到动画创作模式。', toolCalls: [] },
  )
  await store.sendMessage('创建一个 HyperFrames 工程')
  const motionHandoff = store.activeConversation.messages.at(-1).creativeHandoff
  assert.equal(motionHandoff.engine, 'animation')
  queuedResponses.push({ content: '已进入动画模式。', toolCalls: [] })
  const acceptedMotionHandoff = store.acceptCreativeHandoff(store.activeConversation.messages.at(-1).id)
  assert.equal(acceptedMotionHandoff.creativeEngine, 'animation')
  await waitFor(() => !store.isStreaming)
  assert.equal(store.activeConversation.id, motionHandoffConversationId)
  assert.equal(store.activeConversation.creativeEngine, 'animation')

  // 即使用户选择了本机 CLI，创作也统一经受控 Harness；旧文本生成协议仍被动画权限拦截。
  const { useLocalAgentStore } = await server.ssrLoadModule('/src/stores/localAgentStore.ts')
  const localAgents = useLocalAgentStore()
  localAgents.saveCustomAgent({ name: 'Mock CLI', command: 'mock-cli' })
  const generationsBeforeLocalAnimation = generationRequests.length
  queuedResponses.push(
    { content: '```onestep-tool\n{"tool":"generate_video","args":{"prompt":"本机动画偷跑","duration":5}}\n```' },
    { content: '已阻止旧协议生成。', toolCalls: [] },
  )
  await store.sendMessage('本机 Agent 尝试旧协议生成视频')
  assert.equal(generationRequests.length, generationsBeforeLocalAnimation)
  assert.match(store.activeConversation.messages.at(-1).run.activities.at(-1).summary, /动画模式只使用/)
  assert.equal(store.activeConversation.messages.at(-1).model, 'DeepSeek-V4.1-Flash-1017')
  localAgents.select('builtin')

  const { useChatModeStore } = await server.ssrLoadModule('/src/stores/chatModeStore.ts')
  const chatMode = useChatModeStore()
  chatMode.setCreativeEngine('animation')
  assert.equal(JSON.parse(localStorage.getItem('onestep_chat_mode_v1') || '{}').creativeEngine, 'animation')

  // 停止当前镜必须同时暂停宿主队列；续跑沿用已建工程，并按 9:16 固定尺寸创建。
  const stoppedConversation = store.createConversation()
  stoppedConversation.mode = 'create'
  stoppedConversation.creativeEngine = 'animation'
  stoppedConversation.projectId = projects.createProject('动画停止与画幅回归').id
  const stopArgs = {
    title: '停止队列回归', brief: '两镜竖屏动画，停止后不得启动下一镜。', continuity: '统一竖屏构图。',
    storyboard_text: 'S01 第一镜\nS02 第二镜', aspect_ratio: '9:16', resolution: '768P', delivery: 'full',
    shots: [
      { id: 'S01', prompt: '第一镜标题进入。', duration: 4 },
      { id: 'S02', prompt: '第二镜标题落版。', duration: 4 },
    ],
  }
  queuedResponses.push(
    { name: 'prepare_storyboard', args: stopArgs },
    { content: '竖屏分镜已准备。', toolCalls: [] },
  )
  await store.sendMessage('制作两镜竖屏动画')
  const requestsBeforeStoppedRun = modelRequests.length
  const createsBeforeStoppedRun = motionCreateRequests.length
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '竖屏 S01', at: 0, duration: 4 } },
    { waitForAbort: true },
  )
  confirmStoryboardDraft('animation')
  await waitFor(() => store.isStreaming && motionCreateRequests.length === createsBeforeStoppedRun + 1)
  const requestsBeforeRejectedSend = modelRequests.length
  assert.equal(await store.sendMessage('这一轮不应被受理'), false, '流式期间必须明确返回未受理，Composer 才能保留草稿')
  assert.equal(modelRequests.length, requestsBeforeRejectedSend)
  store.stopStreaming()
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'paused')
  const requestsAfterStop = modelRequests.length
  assert.equal(requestsAfterStop, requestsBeforeStoppedRun + 2, '停止只能结束当前镜请求，不能启动 S02')
  assert.equal(motionCreateRequests.length, createsBeforeStoppedRun + 1)
  assert.deepEqual(store.activeConversation.production.shots.map((shot) => shot.status), ['pending', 'pending'])
  assert.ok(store.activeConversation.production.shots[0].motionId && store.activeConversation.production.shots[0].clipId)
  const stoppedS01MotionId = store.activeConversation.production.shots[0].motionId
  const portraitSource = (shot) => `<html><body><div data-composition-id="main" data-start="0" data-duration="4" data-width="720" data-height="1280"><section class="clip" data-start="0" data-duration="4" data-track-index="1"><h1>${shot}</h1></section></div><script>window.__timelines={}</script></body></html>`
  queuedResponses.push(
    { name: 'read_motion_project', args: { motionId: stoppedS01MotionId } },
    { name: 'write_motion_project', args: { motionId: stoppedS01MotionId, source: portraitSource('S01') } },
    { content: 'S01 已完成。', toolCalls: [] },
    { name: 'create_motion_project', args: { name: '竖屏 S02', at: 4, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${createsBeforeStoppedRun + 2}`, source: portraitSource('S02') } },
    { content: 'S02 已完成。', toolCalls: [] },
  )
  const stoppedProjectId = store.activeConversation.projectId
  const stoppedConversationId = store.activeConversation.id
  const resumedStopped = store.resumeProduction(stoppedConversationId)
  assert.equal(resumedStopped.remaining, 2)
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'done')
  assert.equal(modelRequests.length, requestsAfterStop + 6)
  assert.equal(motionCreateRequests.length, createsBeforeStoppedRun + 2, 'S01 续跑不得重建工程')
  assert.equal(store.activeConversation.production.shots[0].motionId, stoppedS01MotionId)
  assert.deepEqual(motionCreateRequests.slice(-2).map((request) => [request.width, request.height]), [[720, 1280], [720, 1280]])

  // 相同签名可复用；只改画幅必须重建，且新工程验收后移除旧片段而不是叠两份。
  const beforeReuseCreates = motionCreateRequests.length
  store.activeConversation.storyboard.status = 'draft'
  confirmStoryboardDraft('animation')
  await waitFor(() => store.activeConversation.production?.status === 'done')
  assert.equal(motionCreateRequests.length, beforeReuseCreates, '画幅与素材签名不变时必须复用成功工程')
  const oldFormatMotionIds = store.activeConversation.production.shots.map((shot) => shot.motionId)
  store.activeConversation.storyboard.status = 'draft'
  store.activeConversation.storyboard.aspectRatio = '16:9'
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '横屏 S01', at: 0, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${beforeReuseCreates + 1}`, source: motionSource('S01', false) } },
    { content: '横屏 S01 已完成。', toolCalls: [] },
    { name: 'create_motion_project', args: { name: '横屏 S02', at: 4, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${beforeReuseCreates + 2}`, source: motionSource('S02', false) } },
    { content: '横屏 S02 已完成。', toolCalls: [] },
  )
  confirmStoryboardDraft('animation')
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'done')
  assert.equal(motionCreateRequests.length, beforeReuseCreates + 2, '只改画幅也不能复用旧工程')
  assert.deepEqual(motionCreateRequests.slice(-2).map((request) => [request.width, request.height]), [[1280, 720], [1280, 720]])
  assert.ok(store.activeConversation.production.shots.every((shot, index) => shot.motionId !== oldFormatMotionIds[index]))
  assert.equal(projects.getProject(stoppedProjectId).tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === 'motion').length, 2, '改画幅后不得保留重复旧片段')

  // 参考 SVG 属于单镜签名：只改 S01 时 S02 仍复用。
  const beforeSvgCreates = motionCreateRequests.length
  const beforeSvgMotionIds = store.activeConversation.production.shots.map((shot) => shot.motionId)
  store.activeConversation.storyboard.status = 'draft'
  store.activeConversation.storyboard.shots[0].referenceSvg = '<svg viewBox="0 0 1280 720"><text x="20" y="40">新的构图</text></svg>'
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '新参考 S01', at: 0, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${beforeSvgCreates + 1}`, source: motionSource('S01', false) } },
    { content: '新参考 S01 已完成。', toolCalls: [] },
  )
  confirmStoryboardDraft('animation')
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'done')
  assert.equal(motionCreateRequests.length, beforeSvgCreates + 1, '参考 SVG 变化必须使对应工程失效')
  assert.notEqual(store.activeConversation.production.shots[0].motionId, beforeSvgMotionIds[0])
  assert.equal(store.activeConversation.production.shots[1].motionId, beforeSvgMotionIds[1], '其他镜头签名未变，不得重建')

  // 更换正式 Logo 素材后，所有受影响镜头都必须重建并引用新导入路径。
  const beforeLogoCreates = motionCreateRequests.length
  const beforeLogoMotionIds = store.activeConversation.production.shots.map((shot) => shot.motionId)
  store.activeConversation.messages.push({
    id: 'replacement-brand-message', role: 'user', content: '改用新的正式 Logo', createdAt: Date.now(), status: 'done',
    attachments: [{ id: 'replacement-logo', kind: 'image', name: 'NewLogo.svg', mime: 'image/svg+xml', size: 3, url: '/generated/uploads/NewLogo.svg', createdAt: Date.now() }],
  })
  store.activeConversation.storyboard.status = 'draft'
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '新 Logo S01', at: 0, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${beforeLogoCreates + 1}`, source: motionSource('S01') } },
    { content: '新 Logo S01 已完成。', toolCalls: [] },
    { name: 'create_motion_project', args: { name: '新 Logo S02', at: 4, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${beforeLogoCreates + 2}`, source: motionSource('S02') } },
    { content: '新 Logo S02 已完成。', toolCalls: [] },
  )
  confirmStoryboardDraft('animation')
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'done')
  assert.equal(motionCreateRequests.length, beforeLogoCreates + 2, '正式素材集合变化不得复用旧工程')
  assert.ok(store.activeConversation.production.shots.every((shot, index) => shot.motionId !== beforeLogoMotionIds[index]))
  assert.ok(store.activeConversation.production.shots.every((shot) => shot.requiredAssetSources.includes('/generated/uploads/NewLogo.svg')))

  // 建工程后的素材导入失败必须回滚工程与片段，续跑可以从干净状态重试。
  const orphanConversation = store.createConversation()
  orphanConversation.mode = 'create'
  orphanConversation.creativeEngine = 'animation'
  orphanConversation.projectId = projects.createProject('动画失败回滚').id
  const orphanConversationId = orphanConversation.id
  const orphanProjectId = orphanConversation.projectId
  const orphanArgs = {
    title: '失败回滚', brief: '导入失败不得留下孤儿工程。', continuity: '单一镜头。',
    storyboard_text: 'S01 导入失败', aspect_ratio: '16:9', resolution: '768P', delivery: 'full',
    shots: [{ id: 'S01', prompt: '引用正式 Logo。', duration: 4 }],
  }
  queuedResponses.push(
    { name: 'prepare_storyboard', args: orphanArgs },
    { content: '分镜已准备。', toolCalls: [] },
  )
  const generationRequestsBeforeOrphan = generationRequests.length
  await store.sendMessage('制作单镜动画', {
    attachments: [{ id: 'bad-logo', kind: 'image', name: 'Fail.svg', mime: 'image/svg+xml', size: 3, url: '/generated/uploads/Fail.svg', createdAt: Date.now() }],
  })
  const createsBeforeOrphan = motionCreateRequests.length
  const discardsBeforeOrphan = motionDiscardRequests.length
  queuedResponses.push(
    { name: 'create_motion_project', args: { name: '将回滚的工程', at: 0, duration: 4 } },
    { content: '素材导入失败，本轮结束。', toolCalls: [] },
  )
  confirmStoryboardDraft('animation')
  await waitFor(() => !store.isStreaming && store.activeConversation.production?.status === 'failed')
  assert.equal(motionCreateRequests.length, createsBeforeOrphan + 1)
  assert.equal(motionDiscardRequests.length, discardsBeforeOrphan + 1)
  assert.equal(motionDiscardRequests.at(-1).id, `motion_mock_${createsBeforeOrphan + 1}`)
  assert.ok(!motionSources.has(`motion_mock_${createsBeforeOrphan + 1}`), '失败工程必须从本地工程中删除')
  assert.equal(store.activeConversation.production.shots[0].motionId, undefined)
  assert.equal(store.activeConversation.production.shots[0].clipId, undefined)
  assert.equal(projects.getProject(orphanProjectId).tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === 'motion').length, 0)
  assert.equal(generationRequests.length, generationRequestsBeforeOrphan, '回滚测试不得触发任何付费生成')
  assert.equal(store.activeConversation.id, orphanConversationId)

  // 完全模式：分镜与参考图就绪后不再等待人工确认，直接逐镜执行并自动复查。
  const autoConversation = store.createConversation()
  autoConversation.mode = 'create'
  autoConversation.creativeEngine = 'animation'
  autoConversation.projectId = projects.createProject('完全模式自治').id
  const autoCreatesBefore = motionCreateRequests.length
  queuedResponses.push(
    {
      name: 'prepare_storyboard',
      args: {
        title: '完全模式单镜动画', brief: '完全模式自动完成单镜动画。', continuity: '单镜。',
        storyboard_text: 'S01 完全模式自动完成', aspect_ratio: '16:9', resolution: '768P', delivery: 'full',
        shots: [{ id: 'S01', prompt: '标题与 Logo 依次进入并定格。', duration: 4 }],
      },
    },
    { content: '分镜已提交。', toolCalls: [] },
    { name: 'create_motion_project', args: { name: '完全模式 S01', at: 0, duration: 4 } },
    { name: 'write_motion_project', args: { motionId: `motion_mock_${autoCreatesBefore + 1}`, source: motionSource('S01') } },
    { content: 'S01 已完成。', toolCalls: [] },
  )
  await store.sendMessage('完全模式制作一镜动画', {
    conversationId: autoConversation.id,
    automation: 'auto',
    creativeEngine: 'animation',
    projectId: autoConversation.projectId,
  })
  assert.equal(autoConversation.storyboard.status, 'confirmed', '完全模式不得停在草案等待人工确认')
  await waitFor(() => !store.isStreaming && autoConversation.production?.status === 'done')
  assert.equal(motionCreateRequests.length, autoCreatesBefore + 1, '自动确认后必须直接开始逐镜制作')
  assert.equal(autoConversation.production.shots[0].status, 'succeeded')
  assert.equal(autoConversation.production.shots[0].review?.ok, true, '完全模式每镜完成后应自动复查')
  assert.ok(autoConversation.messages.at(-1).content.includes('S01 已完成'))

  // @ 引用：多个引用同句共存；@模板10 不能被 @模板1 前缀截断。
  const mentionSegments = splitMentionSegments(
    '用 @模板10 做开场，再用 @模板1 收尾。',
    ['@模板1', '@模板10'],
  )
  assert.deepEqual(
    mentionSegments.filter((segment) => segment.mention).map((segment) => segment.text),
    ['@模板10', '@模板1'],
    '多个 @引用 必须各自完整高亮',
  )
  assert.equal(mentionSegments.map((segment) => segment.text).join(''), '用 @模板10 做开场，再用 @模板1 收尾。')
  const mentionAttachments = describeAttachments(
    [{ id: 'a1', kind: 'image', name: '场景.png', url: '/generated/uploads/a.png' }, { id: 'a2', kind: 'video', name: '动作.mp4', url: '/generated/uploads/b.mp4' }],
    { mentionable: true },
  )
  assert.ok(mentionAttachments.includes('@素材1、@素材2'), '@素材N 必须能对应到素材清单')
  assert.ok(mentionAttachments.includes('参考图 1：场景.png') && mentionAttachments.includes('参考视频 2：动作.mp4'))
  const mentionTemplates = describeTemplates([
    { name: '纸感手写', category: '风格', guide: '手写纸感。', images: [] },
    { name: '极简白底', category: '版式', guide: '极简白底。', images: [] },
  ])
  assert.ok(mentionTemplates.includes('@模板1、@模板2'), '@模板N 必须能对应到模板清单')
  assert.ok(mentionTemplates.includes('已应用模板 1') && mentionTemplates.includes('已应用模板 2'))

  // “继续任务”必须续用上一轮计划：不能重建计划，也不能从第一步重读。
  const planConversation = store.createConversation(false)
  const planRun = {
    version: 1, status: 'stopped', phase: 'done', currentStep: 2,
    plan: [
      { id: 'plan_1', content: '读取 5 个动效工程', status: 'completed' },
      { id: 'plan_2', content: 'S01 改为图纸绘制 Logo', status: 'in_progress' },
      { id: 'plan_3', content: 'S02-S05 去椭圆遮罩并换抠图', status: 'pending' },
    ],
    activities: [], startedAt: Date.now() - 4_000, updatedAt: Date.now() - 3_000,
  }
  planConversation.messages.push(
    { id: 'plan_user_1', role: 'user', content: '把这 5 个动效工程按清单改好', createdAt: Date.now() - 5_000, status: 'done' },
    { id: 'plan_assistant_1', role: 'assistant', content: '已读取 S01，先改蓝图镜头。', createdAt: Date.now() - 3_000, status: 'stopped', run: planRun },
  )
  const planRequestStart = modelRequests.length
  queuedResponses.push({ content: '接着改 S01。', toolCalls: [] })
  await store.sendMessage('继续任务', { conversationId: planConversation.id })
  await waitFor(() => !store.isStreaming)
  const planRequest = modelRequests[planRequestStart]
  const planNote = planRequest.messages.find(
    (message) => message.role === 'system' && String(message.content).startsWith('## 当前任务计划（执行事实'),
  )
  assert.ok(planNote, '续跑时必须把上一轮计划作为执行事实回注')
  assert.match(planNote.content, /\[已完成\] 读取 5 个动效工程/)
  assert.match(planNote.content, /\[进行中\] S01 改为图纸绘制 Logo/)
  assert.match(planNote.content, /\[待办\] S02-S05/)
  assert.match(planNote.content, /不要新建计划/, '必须明确告诉模型不要重建计划')
  assert.match(planNote.content, /不要整份重读/, '已完成的读取步骤不应重复执行')

  console.log('✓ Agent Harness：SSE、多步回注、普通/创作切换、双引擎确认与持久化、取消、CLI 门禁、刷新恢复、六镜全片、4路并发、失败重试、定位入轨、改稿原位替换、轮询幂等、续跑跳镜、计划续跑与完全模式自动确认全部通过（全部为本地 mock）')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
