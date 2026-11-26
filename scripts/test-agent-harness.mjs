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
  const { runAgentHarness, AgentHarnessError } = await server.ssrLoadModule('/src/features/agent/harness.ts')
  const { AGENT_NATIVE_TOOLS } = await server.ssrLoadModule('/src/features/agent/toolDefinitions.ts')
  const { normalizeAgentTimelineOps } = await server.ssrLoadModule('/src/features/agent/tools.ts')
  const { streamLocalAgent } = await server.ssrLoadModule('/src/api/localAgents.ts')
  const { buildRunPrompt, runAgent } = await server.ssrLoadModule('/server/local/agents.mjs')

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
  assert.equal(requestBody.tools.length, 8)
  assert.equal('execute' in requestBody.tools[0].function, false)

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

  // 取消、步数上限、截断与批量上限都不会留下后续模型调用或危险执行。
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

  await assert.rejects(() => runAgentHarness({
    messages: [],
    maxSteps: 1,
    signal: new AbortController().signal,
    stream: async () => ({ content: '', toolCalls: [{ id: 'loop', name: 'read_project', args: {} }] }),
    executeTool: async () => ({ ok: true }),
    onDelta: () => {},
    onReasoning: () => {},
  }), (error) => error instanceof AgentHarnessError && error.code === 'max_steps')

  let executedIncomplete = false
  await assert.rejects(() => runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async () => ({ content: '', finishReason: 'length', toolCalls: [{ id: 'partial', name: 'generate_video', args: {} }] }),
    executeTool: async () => { executedIncomplete = true },
    onDelta: () => {},
    onReasoning: () => {},
  }), (error) => error.code === 'incomplete_tool_call')
  assert.equal(executedIncomplete, false)

  let executedLargeBatch = false
  await assert.rejects(() => runAgentHarness({
    messages: [],
    signal: new AbortController().signal,
    stream: async () => ({
      content: '',
      toolCalls: Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, name: 'read_project', args: {} })),
    }),
    executeTool: async () => { executedLargeBatch = true },
    onDelta: () => {},
    onReasoning: () => {},
  }), (error) => error.code === 'too_many_tools')
  assert.equal(executedLargeBatch, false)

  // 本机 CLI 同样 fail-closed：普通模式没有生成说明，脚本在读取 API Key 前退出。
  const chatLocalPrompt = buildRunPrompt({ mode: 'chat' })
  const createLocalPrompt = buildRunPrompt({ mode: 'create' })
  assert.equal(chatLocalPrompt.includes('node scripts/onestep-generate.mjs image'), false)
  assert.match(chatLocalPrompt, /onestep-mode-handoff/)
  assert.match(chatLocalPrompt, /grill-me 创作澄清协议/)
  assert.match(createLocalPrompt, /node scripts\/onestep-generate\.mjs image/)
  assert.match(createLocalPrompt, /grill-me 创作澄清协议/)
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
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/chat/completions')) {
      const request = JSON.parse(init.body)
      modelRequests.push(request)
      const payload = queuedResponses.shift() || { content: '完成。', toolCalls: [] }
      if (payload.content !== undefined) return streamedResponse(event({ choices: [{ delta: { content: payload.content }, finish_reason: 'stop' }] }))
      return streamedResponse([
        event({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'store_tool', type: 'function', function: { name: payload.name, arguments: JSON.stringify(payload.args || {}) } }] }, finish_reason: 'tool_calls' }] }),
        'data: [DONE]\n\n',
      ].join(''))
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
  const originalMessageCount = store.activeConversation.messages.length
  queuedResponses.push({ content: '已切换到创作模式，将继续处理。', toolCalls: [] })
  const accepted = store.acceptCreativeHandoff(pendingMessage.id)
  assert.equal(accepted.conversationId, textConversationId)
  await waitFor(() => !store.isStreaming)
  assert.equal(store.activeId, textConversationId)
  assert.equal(store.activeConversation.mode, 'create')
  assert.ok(store.activeConversation.projectId)
  assert.ok(store.activeConversation.messages.length > originalMessageCount)
  assert.equal(generationRequests.length, 0)
  assert.equal(modelRequests.length, 6)
  assert.equal(modelRequests[5].tools.length, 8)
  assert.ok(modelRequests[5].messages.some((message) => message.role === 'user' && message.content === '接下来生成具体视频素材'))
  assert.match(modelRequests[5].messages.filter((message) => message.role === 'user').at(-1).content, /请按上述要求生成具体视频素材/)

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

  // 完整分镜：6 个镜头全部执行；S03 先于 S02 完成时立即入轨，但保留 S02 的固定位置。
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
    .filter((clip) => /^S0[1-6] ·/.test(clip.name))
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

  queuedResponses.push(
    { name: 'generate_storyboard', args: storyboardArgs },
    { content: '完整制作单已启动，宿主会按镜号完成整片。', toolCalls: [] },
  )
  await store.sendMessage('按完整分镜生成整支视频')
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
  queuedResponses.push(
    { name: 'generate_storyboard', args: storyboardArgs },
    { content: '整片已全部完成，无需重复生成。', toolCalls: [] },
  )
  await store.sendMessage('继续生成未完成镜头')
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
  await store.sendMessage('换成 2K 重新生成整片')
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
  await store.sendMessage('只改 S03 的镜头角度')
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
  await store.sendMessage('生成失败恢复回归整片')
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
  await store.sendMessage('继续生成未完成镜头')
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

  console.log('✓ Agent Harness：SSE、多步回注、普通/创作切换、取消、CLI 门禁、刷新恢复、六镜全片、4路并发、失败重试、定位入轨、改稿原位替换、轮询幂等与续跑跳镜全部通过（全部为本地 mock）')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
