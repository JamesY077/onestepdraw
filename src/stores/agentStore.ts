import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { AGENT_MODEL_ID, AgentApiError, streamAgentChat } from '@/api/agent'
import { LocalAgentError, streamLocalAgent, type LocalAgentMessage } from '@/api/localAgents'
import type { AgentChatMessage, AgentConversation, AgentMessage } from '@/types/agent'
import { DEFAULT_AGENT_SYSTEM_PROMPT } from '@/features/agent/prompt'
import {
  buildAgentGeneration,
  describeAgentGeneration,
  extractAgentToolCalls,
  stripAgentToolBlocks,
  type AgentToolCall,
} from '@/features/agent/tools'
import { buildImageParams, buildVideoParams } from '@/features/generate/buildParams'
import { pollVideoStatus } from '@/features/generate/video'
import { generateImage, generateVideo } from '@/api/aiping'
import { CUSTOM_ENGINE_ID, useLocalAgentStore } from '@/stores/localAgentStore'
import { useApiStore } from '@/stores/apiStore'
import { useModelStore } from '@/stores/modelStore'

const STORAGE_KEY = 'onestep_agent_conversations_v1'
const MAX_CONVERSATIONS = 50
const MAX_MESSAGES_PER_CONVERSATION = 200
const MAX_CONTEXT_MESSAGES = 40
const EMPTY_CONVERSATION_TITLE = '新对话'

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function makeTitle(content: string): string {
  const title = content.replace(/\s+/g, ' ').trim()
  if (!title) return EMPTY_CONVERSATION_TITLE
  return title.length > 30 ? `${title.slice(0, 30)}…` : title
}

function isConversation(value: any): value is AgentConversation {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.messages) &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

function loadConversations(): AgentConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isConversation)
      .map((conversation) => ({
        ...conversation,
        messages: conversation.messages.filter(
          (message) => message && typeof message.content === 'string' && typeof message.role === 'string',
        ),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export const useAgentStore = defineStore('agent', () => {
  const conversations = ref<AgentConversation[]>(loadConversations())
  const activeId = ref<string | null>(conversations.value[0]?.id || null)
  const streamingId = ref<string | null>(null)
  const authExpired = ref(false)

  let abortController: AbortController | null = null
  let saveTimer: number | null = null

  const activeConversation = computed(
    () => conversations.value.find((conversation) => conversation.id === activeId.value) || null,
  )
  const isStreaming = computed(() => streamingId.value !== null)
  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  function persistNow() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
    try {
      const payload = conversations.value
        .filter((conversation) => conversation.messages.length > 0)
        .slice(0, MAX_CONVERSATIONS)
        .map((conversation) => ({
          ...conversation,
          messages: conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
        }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // 本地存储写满时静默忽略，不影响当前对话继续使用。
    }
  }

  function schedulePersist() {
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      saveTimer = null
      persistNow()
    }, 500)
  }

  function findConversation(id: string | null): AgentConversation | null {
    if (!id) return null
    return conversations.value.find((conversation) => conversation.id === id) || null
  }

  function createConversation(select = true): AgentConversation {
    // 只保留一个空白会话，避免侧栏堆积「新对话」。
    conversations.value = conversations.value.filter((conversation) => conversation.messages.length > 0)
    const now = Date.now()
    const conversation: AgentConversation = {
      id: createId(),
      title: EMPTY_CONVERSATION_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    conversations.value.unshift(conversation)
    if (select) activeId.value = conversation.id
    persistNow()
    return conversation
  }

  function selectConversation(id: string) {
    if (streamingId.value) return
    activeId.value = id
  }

  function deleteConversation(id: string) {
    if (streamingId.value) stopStreaming()
    conversations.value = conversations.value.filter((conversation) => conversation.id !== id)
    if (activeId.value === id) {
      activeId.value = sortedConversations.value[0]?.id || null
    }
    persistNow()
  }

  function clearAll() {
    stopStreaming()
    conversations.value = []
    activeId.value = null
    persistNow()
  }

  function buildContext(conversation: AgentConversation): AgentChatMessage[] {
    const history = conversation.messages
      .filter((message) => message.status !== 'error' && (message.content.trim() || message.generation))
      .slice(-MAX_CONTEXT_MESSAGES)
      .map<AgentChatMessage>((message) => {
        const note =
          message.role === 'assistant' && message.generation
            ? `\n\n[系统记录] 已调用${message.generation.kind === 'image' ? '图片' : '视频'}生成：${describeAgentGeneration(message.generation)}。`
            : ''
        return {
          role: message.role,
          content: `${message.content}${note}`.trim(),
        }
      })

    return [
      { role: 'system', content: DEFAULT_AGENT_SYSTEM_PROMPT },
      ...history,
    ]
  }

  /** 本机 CLI Agent 使用纯对话记录，系统提示词由本地服务统一拼装。 */
  function buildLocalContext(conversation: AgentConversation): LocalAgentMessage[] {
    return conversation.messages
      .filter(
        (message) =>
          message.status !== 'error' && (message.content.trim() || message.generation),
      )
      .slice(-MAX_CONTEXT_MESSAGES)
      .map<LocalAgentMessage>((message) => {
        const note =
          message.role === 'assistant' && message.generation
            ? `\n\n[系统记录] 已调用${message.generation.kind === 'image' ? '图片' : '视频'}生成：${describeAgentGeneration(message.generation)}。`
            : ''
        return {
          role: message.role,
          content: `${message.content}${note}`.trim(),
        }
      })
  }

  function stopStreaming() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  async function runGeneration(
    conversation: AgentConversation,
    message: AgentMessage,
    call: AgentToolCall,
  ) {
    const built = buildAgentGeneration(call)
    if (!built) return
    // 保留 reactive 代理：直接改原始对象不会触发结果卡片更新。
    const generation = reactive(built)
    message.generation = generation
    conversation.updatedAt = Date.now()
    persistNow()

    try {
      if (generation.kind === 'image') {
        const params = await buildImageParams(
          generation.prompt,
          generation.model,
          null,
          generation.aspectRatio,
          'seedream-5-lite',
        )
        const response = await generateImage(params)
        const images = (response.data || [])
          .map((item) =>
            item.url ? item.url : item.b64_json ? `data:image/png;base64,${item.b64_json}` : '',
          )
          .filter((url): url is string => !!url)
        if (!images.length) throw new Error('图片生成成功，但没有返回可显示的图片。')
        generation.images = images
        generation.status = 'succeeded'
      } else {
        const params = await buildVideoParams(
          generation.prompt,
          generation.model,
          null,
          generation.aspectRatio,
          generation.duration || 5,
          'minimax-h3',
          'off',
          generation.resolution || '768P',
          null,
        )
        const task = await generateVideo(params)
        if (!task.id) throw new Error('视频任务创建成功但未返回任务 ID，请重试。')
        const finalStatus = await pollVideoStatus(
          task.id,
          (progress) => {
            generation.progress = progress
          },
          {
            provider: task.provider || 'minimax-h3',
            providerCreateEndpoint: (task as any).providerCreateEndpoint,
            duration: generation.duration,
            resolution: generation.resolution,
            deadline: Date.now() + 60 * 60 * 1000,
          },
        )
        const url = finalStatus.video_url || finalStatus.data?.find((item) => item.url)?.url
        if (!url) throw new Error('视频任务已完成，但没有返回视频地址。')
        generation.videoUrl = url
        generation.thumbnail = finalStatus.data?.[0]?.thumbnail
        generation.progress = 100
        generation.status = 'succeeded'
      }
    } catch (error: any) {
      generation.status = 'failed'
      generation.error = error?.message || '生成失败，请稍后重试。'
      if (error instanceof AgentApiError && error.kind === 'auth') authExpired.value = true
    } finally {
      conversation.updatedAt = Date.now()
      persistNow()
    }
  }

  function retryGeneration(messageId: string) {
    const conversation = activeConversation.value
    if (!conversation) return
    const message = conversation.messages.find((item) => item.id === messageId)
    const generation = message?.generation
    if (!message || !generation || generation.status === 'running') return

    const call: AgentToolCall = {
      name: generation.kind === 'image' ? 'generate_image' : 'generate_video',
      args: {
        prompt: generation.prompt,
        aspect_ratio: generation.aspectRatio,
        resolution: generation.resolution,
        duration: generation.duration,
      },
    }
    void runGeneration(conversation, message, call)
  }

  async function requestAssistant(conversation: AgentConversation, assistant: AgentMessage) {
    const controller = new AbortController()
    abortController = controller
    streamingId.value = assistant.id
    authExpired.value = false
    let pendingTool: AgentToolCall | null = null

    const localAgentStore = useLocalAgentStore()
    const apiStore = useApiStore()
    const modelStore = useModelStore()
    const engine = localAgentStore.isLocalEngine ? localAgentStore.selectedAgent : null

    try {
      if (engine) {
        assistant.model = engine.name
        const result = await streamLocalAgent({
          agentId: engine.id,
          messages: buildLocalContext(conversation),
          apiKey: apiStore.apiKey || '',
          apiBaseUrl: apiStore.apiBaseUrl || '',
          model: modelStore.selectedId,
          custom:
            engine.id === CUSTOM_ENGINE_ID
              ? { name: localAgentStore.custom.name, command: localAgentStore.custom.command }
              : undefined,
          signal: controller.signal,
          onDelta: (text) => {
            assistant.content += text
            conversation.updatedAt = Date.now()
            schedulePersist()
          },
          onLog: (text) => {
            const next = (assistant.logs || '') + text
            assistant.logs = next.length > 8000 ? next.slice(-8000) : next
            conversation.updatedAt = Date.now()
            schedulePersist()
          },
        })

        if (!assistant.content.trim()) {
          assistant.status = 'error'
          assistant.error =
            result.exitCode === 0
              ? `${engine.name} 没有返回内容，请重试或展开运行日志查看。`
              : `${engine.name} 退出（code ${result.exitCode}）。${
                  result.stderrTail.split('\n').filter(Boolean).slice(-1)[0] || ''
                }`
        } else {
          assistant.status = 'done'
        }
      } else {
        assistant.model = modelStore.selectedId
        await streamAgentChat({
          messages: buildContext(conversation),
          model: modelStore.selectedId,
          signal: controller.signal,
          onDelta: (text) => {
            assistant.content += text
            conversation.updatedAt = Date.now()
            schedulePersist()
          },
          onReasoning: (text) => {
            assistant.reasoning = (assistant.reasoning || '') + text
            conversation.updatedAt = Date.now()
            schedulePersist()
          },
        })

        const raw = assistant.content
        const toolCalls = extractAgentToolCalls(raw)
        const visible = stripAgentToolBlocks(raw)
        assistant.content = visible

        if (!visible && !toolCalls.length) {
          assistant.status = 'error'
          assistant.error = '模型没有返回内容，请重试。'
        } else {
          assistant.status = 'done'
          if (toolCalls.length) {
            const call = toolCalls[0]
            if (buildAgentGeneration(call)) {
              pendingTool = call
            } else if (!visible) {
              assistant.status = 'error'
              assistant.error = '没有解析到可执行的生成参数，请补充画面内容后重试。'
            }
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        assistant.status = 'stopped'
        if (!assistant.content.trim()) {
          assistant.content = ''
          assistant.error = '已停止生成。'
        }
      } else if (error instanceof AgentApiError) {
        assistant.status = 'error'
        assistant.error = error.message
        if (error.kind === 'auth') authExpired.value = true
      } else if (error instanceof LocalAgentError) {
        assistant.status = 'error'
        assistant.error = error.message
      } else {
        assistant.status = 'error'
        assistant.error = error?.message || '生成失败，请稍后重试。'
      }
    } finally {
      if (abortController === controller) abortController = null
      streamingId.value = null
      conversation.updatedAt = Date.now()
      persistNow()
    }

    // 文本流结束后再执行生成，避免长时间任务占住输入框。
    if (pendingTool) void runGeneration(conversation, assistant, pendingTool)
  }

  async function sendMessage(rawContent: string) {
    const content = rawContent.trim()
    if (!content || streamingId.value) return

    let conversation = activeConversation.value
    if (!conversation) conversation = createConversation(true)
    activeId.value = conversation.id

    const now = Date.now()
    const userMessage = reactive<AgentMessage>({
      id: createId(),
      role: 'user',
      content,
      createdAt: now,
      status: 'done',
    })
    const assistantMessage = reactive<AgentMessage>({
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      status: 'streaming',
      model: AGENT_MODEL_ID,
    })

    conversation.messages.push(userMessage, assistantMessage)
    conversation.updatedAt = now
    if (conversation.title === EMPTY_CONVERSATION_TITLE) {
      conversation.title = makeTitle(content)
    }
    persistNow()

    await requestAssistant(conversation, assistantMessage)
  }

  async function regenerate() {
    const conversation = activeConversation.value
    if (!conversation || streamingId.value) return

    let lastUserIndex = -1
    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
      if (conversation.messages[index].role === 'user') {
        lastUserIndex = index
        break
      }
    }
    if (lastUserIndex < 0) return

    conversation.messages = conversation.messages.slice(0, lastUserIndex + 1)
    const assistantMessage = reactive<AgentMessage>({
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
      model: AGENT_MODEL_ID,
    })
    conversation.messages.push(assistantMessage)
    conversation.updatedAt = Date.now()
    persistNow()

    await requestAssistant(conversation, assistantMessage)
  }

  function renameConversation(id: string, title: string) {
    const conversation = findConversation(id)
    if (!conversation) return
    const next = title.trim()
    if (!next) return
    conversation.title = next.slice(0, 60)
    conversation.updatedAt = Date.now()
    persistNow()
  }

  function flush() {
    persistNow()
  }

  return {
    conversations,
    sortedConversations,
    activeId,
    activeConversation,
    isStreaming,
    streamingId,
    authExpired,
    createConversation,
    selectConversation,
    deleteConversation,
    clearAll,
    sendMessage,
    regenerate,
    retryGeneration,
    stopStreaming,
    renameConversation,
    flush,
  }
})
