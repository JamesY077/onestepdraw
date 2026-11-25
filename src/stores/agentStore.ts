import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { AGENT_MODEL_ID, AgentApiError, analyzeImages, streamAgentChat } from '@/api/agent'
import { LocalAgentError, streamLocalAgent, type LocalAgentMessage } from '@/api/localAgents'
import type {
  AgentAttachment,
  AgentChatMessage,
  AgentClipRef,
  AgentContentPart,
  AgentConversation,
  AgentGeneration,
  AgentMessage,
  AgentTemplateRef,
} from '@/types/agent'
import { buildAgentSystemPrompt } from '@/features/agent/prompt'
import {
  MAX_ATTACHMENTS,
  collectAttachmentImages,
  describeAttachments,
  describeTemplates,
  persistableAttachment,
  templateAssets,
  toModelImage,
} from '@/features/agent/attachments'
import {
  collectClipImages,
  describeClipContext,
  persistableClip,
} from '@/features/agent/clipContext'
import {
  animationEditsForSelection,
  buildAnimationEditSystemPrompt,
  createMediaRevisionGeneration,
  mediaReferenceForClip,
  routeSelectedClips,
  selectedClipPrompt,
  stripAgentAnimationBlocks,
} from '@/features/agent/clipRevision'
import {
  buildAgentGeneration,
  describeAgentGeneration,
  extractAgentAsk,
  extractAgentTimelineOps,
  extractAgentToolCalls,
  extractLegacyAsk,
  extractMediaUrls,
  stripAgentAskBlocks,
  stripAgentControlBlocks,
  stripAgentTimelineBlocks,
  type AgentToolCall,
} from '@/features/agent/tools'
import {
  attachmentReferenceForGeneration,
  createAttachmentMediaGeneration,
  routeConversationRequest,
} from '@/features/agent/conversationRouting'
import { buildImageParams, buildVideoParams } from '@/features/generate/buildParams'
import { pollVideoStatus } from '@/features/generate/video'
import { generateImage, generateVideo } from '@/api/aiping'
import { CUSTOM_ENGINE_ID, useLocalAgentStore } from '@/stores/localAgentStore'
import { useApiStore } from '@/stores/apiStore'
import { useModelStore } from '@/stores/modelStore'
import { useSkillStore } from '@/stores/skillStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { createFlowSystemPrompt } from '@/features/agent/createSkill'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { AutomationMode, ConversationMode } from '@/stores/chatModeStore'

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

function messageGenerations(message: AgentMessage): AgentGeneration[] {
  if (message.generations?.length) return message.generations
  return message.generation ? [message.generation] : []
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
        messages: conversation.messages
          .filter(
            (message: any) =>
              message && typeof message.content === 'string' && typeof message.role === 'string',
          )
          .map((message: any) => {
            // 旧版本一条消息只存一个模板，迁移成引用列表。
            const templates = Array.isArray(message.templates)
              ? message.templates
              : message.template
                ? [message.template]
                : undefined
            const { template: _legacyTemplate, ...rest } = message
            return { ...rest, templates }
          }),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export interface AgentSendOptions {
  conversationId?: string
  mode?: ConversationMode
  automation?: AutomationMode
  projectId?: string
  /** 本轮上传的参考素材。 */
  attachments?: AgentAttachment[]
  /** 本轮引用的模板，可以多个。 */
  templates?: AgentTemplateRef[]
  /** 本轮选中的时间轴片段；只把这几段交给模型。 */
  clips?: AgentClipRef[]
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
          messages: conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map((message) => ({
            ...message,
            attachments: message.attachments?.map(persistableAttachment),
            templates: message.templates?.length
              ? message.templates.map((template) => ({
                  ...template,
                  assets: template.assets?.map(persistableAttachment),
                }))
              : undefined,
            clips: message.clips?.length
              ? message.clips.map(persistableClip)
              : undefined,
          })),
        }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      // 存储失败不应打断对话，但保留诊断信息，避免桌面端静默丢失记录。
      console.warn('[stepframe] 对话记录保存失败', error)
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
      // 新对话落到当前选中的工作区，便于按项目目录分组。
      workspaceId: useWorkspaceStore().activeId || undefined,
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

  function systemPromptFor(conversation: AgentConversation): string {
    const projects = useEditProjectStore()
    const project = projects.getProject(conversation.projectId)
    const skills = useSkillStore().activeSkills.map((skill) => ({
      name: skill.name,
      content: skill.content,
    }))
    const projectSummary = project ? projects.projectSummary(project) : undefined
    const automation = conversation.automation || 'default'

    // 创作对话固定带上「短视频脚本导演」（grill-me + video-director）：
    // 任何一次发送都会先按协议问清创作者，再动手做片。
    if ((conversation.mode || 'chat') === 'create') {
      return createFlowSystemPrompt({ automation, projectSummary, extraSkills: skills })
    }

    return buildAgentSystemPrompt({
      mode: 'chat',
      automation,
      projectSummary,
      skills,
    })
  }

  /** 把历史消息拼成一段文本；附件与模板会变成可读清单。 */
  function historyText(message: AgentMessage, includePaths = false): string {
    const note = message.role === 'assistant'
      ? messageGenerations(message).map((generation) =>
          `\n\n[系统记录] 已调用${generation.kind === 'image' ? '图片' : '视频'}生成：${describeAgentGeneration(generation)}。`,
        ).join('')
      : ''
    return `${message.content}${note}${askContext(message)}${describeClipContext(
      message.clips,
    )}${describeAttachments(message.attachments, { includePaths })}${describeTemplates(
      message.templates,
    )}${describeAttachments(templateAssets(message.templates), { includePaths })}`.trim()
  }

  function latestUserMessage(history: AgentMessage[]): AgentMessage | null {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].role === 'user') return history[index]
    }
    return null
  }

  async function buildContext(
    conversation: AgentConversation,
    signal?: AbortSignal,
  ): Promise<AgentChatMessage[]> {
    const source = conversation.messages
      .filter(
        (message) =>
          message.status !== 'error' &&
          (message.content.trim() ||
            message.generation ||
            message.generations?.length ||
            message.attachments?.length ||
            message.templates?.length ||
            message.clips?.length),
      )
      .slice(-MAX_CONTEXT_MESSAGES)

    const latestUser = latestUserMessage(source)
    const imageUrls = latestUser
      ? [
          ...collectClipImages(latestUser.clips),
          ...collectAttachmentImages(latestUser.attachments, latestUser.templates),
        ]
      : []
    const modelImages: string[] = []
    for (const url of imageUrls) {
      const data = await toModelImage(url)
      if (data) modelImages.push(data)
      if (modelImages.length >= 10) break
    }

    // 当前模型不支持图片时，用可用的多模态模型先做一次视觉分析，
    // 让纯文本模型也能拿到画面信息；没有多模态模型则明确说明。
    const model = useModelStore()
    const supportsVision = model.selectedModel.kind === 'vision'
    let visualNote = ''
    if (modelImages.length && !supportsVision) {
      const visionModel = model.models.find((item) => item.kind === 'vision')
      if (visionModel) {
        try {
          const described = await analyzeImages(modelImages.slice(0, 6), visionModel.id, signal)
          if (described) visualNote = `[视觉分析 · ${visionModel.id}]\n${described}`
        } catch {
          // 分析失败不影响正常对话，下面会给出说明。
        }
      }
      if (!visualNote) {
        visualNote = '[说明] 当前模型不能直接查看图片，请参考上面的文件名与清单；需要看图时可在模型菜单里切换到「多模态」模型。'
      }
    }

    const history = source.map<AgentChatMessage>((message) => {
      const text = historyText(message)
      // 只有本轮用户消息带图片，历史里保留文字清单，避免每轮都重传。
      if (message === latestUser) {
        const finalText = visualNote ? `${text}\n\n${visualNote}`.trim() : text
        if (modelImages.length && supportsVision) {
          const parts: AgentContentPart[] = [
            { type: 'text', text: finalText || '请查看这些参考素材。' },
          ]
          for (const url of modelImages) parts.push({ type: 'image_url', image_url: { url } })
          return { role: 'user', content: parts }
        }
        return { role: 'user', content: finalText }
      }
      return { role: message.role, content: text }
    })

    const selectedRoute = routeSelectedClips(latestUser?.clips)
    const systemPrompt = selectedRoute === 'animation' && latestUser?.clips
      ? buildAnimationEditSystemPrompt(latestUser.clips)
      : systemPromptFor(conversation)
    return [{ role: 'system', content: systemPrompt }, ...history]
  }

  /** 本机 CLI Agent 使用纯对话记录，系统提示词由本地服务统一拼装。 */
  function buildLocalContext(conversation: AgentConversation): LocalAgentMessage[] {
    const source = conversation.messages
      .filter(
        (message) =>
          message.status !== 'error' &&
          (message.content.trim() ||
            message.generation ||
            message.generations?.length ||
            message.attachments?.length ||
            message.templates?.length ||
            message.clips?.length),
      )
      .slice(-MAX_CONTEXT_MESSAGES)
    const latestUser = latestUserMessage(source)
    return source.map<LocalAgentMessage>((message) => {
      const animationProtocol = message === latestUser && routeSelectedClips(message.clips) === 'animation'
        ? `\n\n[本轮执行协议]\n${buildAnimationEditSystemPrompt(message.clips || [])}`
        : ''
      return {
        role: message.role,
        content: `${historyText(message, true)}${animationProtocol}`,
      }
    })
  }

  function stopStreaming() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  /** 创作对话里生成成功的素材自动进入关联项目的时间轴。 */
  function attachGenerationToProject(
    conversation: AgentConversation,
    message: AgentMessage,
  ) {
    if (conversation.mode !== 'create' || !conversation.projectId) return
    const generation = message.generation
    if (
      !generation ||
      (generation.intent === 'edit' && generation.targetClipId) ||
      generation.status !== 'succeeded' ||
      generation.attachedToProject
    ) return
    const projects = useEditProjectStore()
    const url = generation.kind === 'image' ? generation.images?.[0] : generation.videoUrl
    if (!url) return
    const clip = projects.appendAsset(conversation.projectId, {
      name: generation.prompt.slice(0, 32) || (generation.kind === 'image' ? '生成图片' : '生成视频'),
      kind: generation.kind,
      url,
      thumbnail: generation.thumbnail,
      duration: generation.kind === 'video' ? generation.duration : undefined,
      source: 'chat',
    })
    if (clip) generation.attachedToProject = true
  }

  /** 选择题已经渲染成卡片，但模型下一轮仍需知道问了什么、用户选了什么。 */
  function askContext(message: AgentMessage): string {
    const ask = message.ask
    if (!ask) return ''
    const list = ask.options.map((option, index) => `${index + 1}. ${option.label}`).join(' / ')
    const picked = ask.answer ? `[用户选择] ${ask.answer}` : '[用户尚未选择]'
    return `\n\n[选择题] ${ask.header} · ${ask.question}\n[选项] ${list}\n${picked}`
  }

  /** 把回复里的选择题块解析成卡片数据，并从正文里移除。 */
  function applyAskFromReply(message: AgentMessage) {
    const blockAsk = extractAgentAsk(message.content)
    if (blockAsk) {
      message.ask = blockAsk
      message.content = stripAgentAskBlocks(message.content)
      return
    }
    const legacy = extractLegacyAsk(message.content)
    if (legacy) {
      message.ask = legacy.ask
      message.content = legacy.rest
    }
  }

  /** 用户点选卡片：先记录答案，再把答案作为一条用户消息发给模型。 */
  function answerAsk(messageId: string, optionId: string, label: string) {
    if (streamingId.value) return
    const conversation =
      conversations.value.find((item) => item.messages.some((msg) => msg.id === messageId)) || null
    if (!conversation) return
    const message = conversation.messages.find((msg) => msg.id === messageId)
    const ask = message?.ask
    if (!message || !ask || ask.answerId) return

    const text = optionId === 'custom' ? label.trim() : `${optionId}. ${label}`
    if (!text) return
    ask.answerId = optionId
    ask.answer = text
    conversation.updatedAt = Date.now()
    persistNow()
    void sendMessage(text, { conversationId: conversation.id })
  }

  /**
   * 模型输出的时间轴操作直接落到项目里，并把操作块从正文去掉。
   * 带上发起时的项目版本：期间有人手动改过时间轴，就不再覆盖，
   * 并在回复里明确说明这次改动没有落盘。
   */
  function applyTimelineOpsFromReply(
    conversation: AgentConversation,
    message: AgentMessage,
    expectedRevision?: number,
    allowedClipIds?: Set<string>,
  ): boolean {
    const extracted = extractAgentTimelineOps(message.content)
    const ops = allowedClipIds
      ? extracted.filter((op) => allowedClipIds.has(op.clipId))
      : extracted
    if (!extracted.length) return false
    if (!ops.length) {
      message.content = `${stripAgentTimelineBlocks(message.content)}\n\n> 已忽略针对未选中片段的时间轴操作。`
      return true
    }
    if (conversation.mode === 'create' && conversation.projectId) {
      const projects = useEditProjectStore()
      const result = projects.applyTimelineOps(conversation.projectId, ops, expectedRevision)
      if (result.stale) {
        message.content = `${stripAgentTimelineBlocks(message.content)}\n\n> 时间轴在你生成这段回复期间被改动过，这次修改没有覆盖到项目，请确认后让我再改一次。`
        return true
      }
    }
    message.content = stripAgentTimelineBlocks(message.content)
    return true
  }

  function attachProject(conversationId: string, projectId: string) {
    const conversation = findConversation(conversationId)
    if (!conversation) return
    conversation.projectId = projectId
    conversation.mode = 'create'
    conversation.updatedAt = Date.now()
    persistNow()
  }

  /** 本机 Agent 回复里带出的 /generated 链接自动入轨。 */
  function attachLocalMediaToProject(conversation: AgentConversation, content: string) {
    if (conversation.mode !== 'create' || !conversation.projectId) return
    const projects = useEditProjectStore()
    for (const media of extractMediaUrls(content)) {
      if (projects.hasAssetUrl(conversation.projectId, media.url)) continue
      const name =
        media.url.split('/').pop()?.split('?')[0] ||
        (media.kind === 'image' ? '生成图片' : media.kind === 'video' ? '生成视频' : '生成音频')
      projects.appendAsset(conversation.projectId, {
        name: name.slice(0, 40),
        kind: media.kind,
        url: media.url,
        source: 'chat',
      })
    }
  }

  function setMessageGeneration(message: AgentMessage, generation: AgentGeneration) {
    message.generation = generation
    const others = (message.generations || []).filter((item) => item.id !== generation.id)
    message.generations = [...others, generation]
  }

  /** 只负责调用模型并填充结果；项目写入由固定目标的调用方决定。 */
  async function executeGeneration(generation: AgentGeneration) {
    generation.status = 'running'
    generation.error = undefined
    generation.replacementError = undefined
    generation.replacementStatus = undefined
    try {
      const reference = generation.targetSourceUrl
        ? mediaReferenceForClip({
            id: generation.targetClipId || '',
            name: generation.targetClipName || '选中素材',
            kind: generation.kind,
            trackId: '',
            trackName: '',
            trackKind: 'video',
            start: 0,
            duration: generation.duration || 5,
            url: generation.targetSourceUrl,
          })
        : null
      if (generation.intent === 'edit' && !reference) {
        throw new Error('缺少原始素材，已阻止退化为纯文本生成。')
      }
      if (generation.kind === 'image') {
        const params = await buildImageParams(
          generation.prompt,
          generation.model,
          reference,
          generation.aspectRatio,
          'seedream-5-lite',
          undefined,
          reference ? 'multi' : undefined,
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
          reference,
          generation.aspectRatio,
          generation.duration || 5,
          'minimax-h3',
          'off',
          generation.resolution || '768P',
          generation.intent === 'edit' && reference?.type === 'video' ? 'editVideo' : null,
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
    }
  }

  function applyCompletedGeneration(conversation: AgentConversation, generation: AgentGeneration) {
    if (
      generation.intent !== 'edit' ||
      generation.status !== 'succeeded' ||
      !conversation.projectId ||
      !generation.targetClipId ||
      !generation.targetSourceUrl
    ) return
    const url = generation.kind === 'image' ? generation.images?.[0] : generation.videoUrl
    if (!url) return
    const result = useEditProjectStore().replaceClipAsset(
      conversation.projectId,
      generation.targetClipId,
      {
        kind: generation.kind,
        url,
        thumbnail: generation.thumbnail || (generation.kind === 'image' ? url : undefined),
        duration: generation.duration,
        name: generation.targetClipName,
      },
      { url: generation.targetSourceUrl, revision: generation.targetRevision },
    )
    if (result.status === 'applied') {
      generation.replacementStatus = 'replaced'
      generation.attachedToProject = true
    } else {
      generation.replacementStatus = 'stale'
      generation.replacementError = result.status === 'missing'
        ? '原片段已删除，生成结果未写入项目。'
        : '片段或项目已在生成期间变化，生成结果未覆盖新内容。'
    }
  }

  async function runGeneration(
    conversation: AgentConversation,
    message: AgentMessage,
    call: AgentToolCall,
    existing?: AgentGeneration,
  ) {
    const built = existing || buildAgentGeneration(call)
    if (!built) return
    if (!built.targetSourceUrl) {
      const user = latestUserMessage(conversation.messages)
      const reference = attachmentReferenceForGeneration([
        ...(user?.attachments || []),
        ...templateAssets(user?.templates),
      ], built.kind)
      if (reference) {
        built.targetSourceUrl = reference.url
        built.targetClipName = built.targetClipName || reference.name
      }
    }
    // 保留 reactive 代理：直接改原始对象不会触发结果卡片更新。
    const generation = reactive(built)
    setMessageGeneration(message, generation)
    conversation.updatedAt = Date.now()
    persistNow()

    await executeGeneration(generation)
    if (generation.intent === 'edit' && generation.targetClipId) {
      applyCompletedGeneration(conversation, generation)
    } else {
      attachGenerationToProject(conversation, message)
    }
    conversation.updatedAt = Date.now()
    persistNow()
  }

  /** 选中媒体跳过聊天模型：原需求 + 原素材直接进图片/多模态视频模型。 */
  async function runSelectedMediaRevisions(
    conversation: AgentConversation,
    message: AgentMessage,
    clips: AgentClipRef[],
    expectedRevision?: number,
  ) {
    const project = conversation.projectId
      ? useEditProjectStore().getProject(conversation.projectId)
      : null
    if (!project) {
      message.status = 'error'
      message.error = '找不到选中的剪辑项目，未发起生成。'
      return
    }
    const user = latestUserMessage(conversation.messages)
    const generations = clips.map((clip) => reactive(createMediaRevisionGeneration(
      clip,
      selectedClipPrompt(user?.content || '', clip),
      {
        aspectRatio: project.aspectRatio,
        resolution: project.resolution,
        expectedRevision,
      },
    )))

    for (const generation of generations) {
      setMessageGeneration(message, generation)
      conversation.updatedAt = Date.now()
      persistNow()
      await executeGeneration(generation)
    }

    const succeeded = generations.filter((generation) =>
      generation.status === 'succeeded' &&
      generation.targetClipId &&
      generation.targetSourceUrl &&
      (generation.kind === 'image' ? generation.images?.[0] : generation.videoUrl)
    )
    const replacements = succeeded.map((generation) => {
      const url = generation.kind === 'image' ? generation.images?.[0] : generation.videoUrl
      return {
        clipId: generation.targetClipId || '',
        expectedUrl: generation.targetSourceUrl || '',
        input: {
          kind: generation.kind,
          url: url || '',
          thumbnail: generation.thumbnail || (generation.kind === 'image' ? url : undefined),
          duration: generation.duration,
          name: generation.targetClipName,
        },
      }
    })
    const result = conversation.projectId
      ? useEditProjectStore().replaceClipAssets(conversation.projectId, replacements, expectedRevision)
      : { status: 'missing' as const, appliedClipIds: [] }
    const applied = new Set(result.appliedClipIds)
    for (const generation of succeeded) {
      if (applied.has(generation.targetClipId || '')) {
        generation.replacementStatus = 'replaced'
        generation.attachedToProject = true
      } else {
        generation.replacementStatus = 'stale'
        generation.replacementError = result.status === 'missing'
          ? '原片段已删除，生成结果未写入项目。'
          : '项目已在生成期间变化，所有生成结果均未覆盖新内容。'
      }
    }
    const failed = generations.length - succeeded.length
    if (!succeeded.length) {
      message.content = `${generations.length} 个选中片段均生成失败，未修改任何片段。`
      message.status = 'error'
      message.error = generations.map((generation) => generation.error).filter(Boolean).join('；') || '生成失败，请重试。'
    } else {
      message.content = result.status === 'applied'
        ? `已按原需求修改 ${applied.size} 个选中片段，保留原时间点、时长与布局；可用撤销恢复。${failed ? `另有 ${failed} 段生成失败。` : ''}`
        : `素材已生成，但目标校验未通过，未修改任何片段。${failed ? `另有 ${failed} 段生成失败。` : ''}`
      message.status = result.status === 'applied' ? 'done' : 'error'
      if (result.status !== 'applied') message.error = '生成结果未写回项目，请确认原片段后重试。'
    }
    conversation.updatedAt = Date.now()
    persistNow()
  }

  /** 普通对话里的明确改图 / 改视频请求同样绕过聊天模型，但只返回衍生素材，不覆盖时间轴。 */
  async function runAttachmentMediaRevisions(
    conversation: AgentConversation,
    message: AgentMessage,
    attachments: AgentAttachment[],
  ) {
    const project = conversation.projectId
      ? useEditProjectStore().getProject(conversation.projectId)
      : null
    const target = {
      aspectRatio: project?.aspectRatio || '16:9',
      resolution: project?.resolution || ('768P' as const),
    }
    const prompt = latestUserMessage(conversation.messages)?.content.trim() || ''
    const generations = attachments.map((attachment) => reactive(
      createAttachmentMediaGeneration(attachment, prompt, target),
    ))

    for (const generation of generations) {
      setMessageGeneration(message, generation)
      conversation.updatedAt = Date.now()
      persistNow()
      await executeGeneration(generation)
      attachGenerationToProject(conversation, message)
    }

    const succeeded = generations.filter((generation) => generation.status === 'succeeded').length
    const failed = generations.length - succeeded
    if (!succeeded) {
      message.content = `${generations.length} 份素材均修改失败，未生成新素材。`
      message.status = 'error'
      message.error = generations.map((generation) => generation.error).filter(Boolean).join('；') || '生成失败，请重试。'
    } else {
      message.content = `已根据原素材和你的原话生成 ${succeeded} 份修改结果。${failed ? `另有 ${failed} 份失败。` : ''}`
      message.status = 'done'
    }
    conversation.updatedAt = Date.now()
    persistNow()
  }

  function applyAnimationEditsFromReply(
    conversation: AgentConversation,
    message: AgentMessage,
    clips: AgentClipRef[],
    expectedRevision?: number,
  ): boolean {
    const parsed = animationEditsForSelection(message.content, clips)
    message.content = stripAgentAnimationBlocks(message.content)
    if (parsed.error) {
      message.status = 'error'
      message.error = parsed.error
      return false
    }
    if (!conversation.projectId) {
      message.status = 'error'
      message.error = '找不到动画所属的剪辑项目，源码未写入。'
      return false
    }
    const byId = new Map(clips.map((clip) => [clip.id, clip]))
    const result = useEditProjectStore().replaceAnimationSources(
      conversation.projectId,
      parsed.edits.map((edit) => {
        const clip = byId.get(edit.clipId)
        return {
          clipId: edit.clipId,
          code: edit.code,
          codeLanguage: edit.sourceType,
          expectedUrl: clip?.url || '',
          expectedCode: clip?.code,
        }
      }),
      expectedRevision,
    )
    if (result.status !== 'applied') {
      message.status = 'error'
      message.error = result.status === 'missing'
        ? '原动画片段已删除，源码未写入。'
        : '动画或项目已在回复期间变化，源码未覆盖新内容。'
      return false
    }
    message.status = 'done'
    message.content = `${message.content}${message.content ? '\n\n' : ''}已直接更新 ${result.appliedClipIds.length} 个选中动画的源码；时间轴属性保持不变，可用撤销恢复。`
    return true
  }

  function retryGeneration(messageId: string, generationId?: string) {
    const conversation = activeConversation.value
    if (!conversation) return
    const message = conversation.messages.find((item) => item.id === messageId)
    const generation = message
      ? generationId
        ? messageGenerations(message).find((item) => item.id === generationId)
        : message.generation
      : undefined
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
    void runGeneration(
      conversation,
      message,
      call,
      { ...generation, status: 'running', error: undefined, replacementError: undefined },
    )
  }

  /** 内置模型与本机 Agent 共用同一套工具路由，选中片段时绝不另起生成任务。 */
  function pendingToolFromReply(
    message: AgentMessage,
    selectedClips: AgentClipRef[],
    toolCalls: AgentToolCall[],
    timelineHandled: boolean,
  ): AgentToolCall | null {
    const visible = message.content
    if (!visible && !toolCalls.length && !timelineHandled) {
      message.status = 'error'
      message.error = '模型没有返回内容，请重试。'
      return null
    }
    message.status = 'done'
    if (!visible && timelineHandled && !toolCalls.length) {
      message.content = selectedClips.length ? '已按选中范围更新时间轴。' : '已更新时间轴。'
    }
    if (!toolCalls.length) return null

    const call = toolCalls[0]
    if (selectedClips.length) {
      message.status = 'error'
      message.error = '选中片段只接受本轮固定目标的修改；本次未执行模型额外返回的生成或跳转工具。'
      return null
    }
    if (buildAgentGeneration(call) || call.name === 'open_voice' || call.name === 'open_3d') return call
    if (!visible) {
      message.status = 'error'
      message.error = '没有解析到可执行的生成参数，请补充画面内容后重试。'
    }
    return null
  }

  async function requestAssistant(conversation: AgentConversation, assistant: AgentMessage) {
    const controller = new AbortController()
    const targetUser = latestUserMessage(conversation.messages)
    const selectedClips = targetUser?.clips || []
    const selectedRoute = routeSelectedClips(selectedClips)
    const requestRoute = routeConversationRequest({
      content: targetUser?.content || '',
      clips: targetUser?.clips,
      attachments: targetUser?.attachments,
      templates: targetUser?.templates,
    })
    const allowedClipIds = selectedClips.length ? new Set(selectedClips.map((clip) => clip.id)) : undefined
    // 记下发起时的项目版本：模型回复期间若有人手动改时间轴，落盘前会发现并放弃覆盖。
    const startRevision =
      conversation.mode === 'create' && conversation.projectId
        ? useEditProjectStore().revisionOf(conversation.projectId)
        : undefined
    abortController = controller
    streamingId.value = assistant.id
    authExpired.value = false
    let pendingTool: AgentToolCall | null = null
    let pendingMediaClips: AgentClipRef[] | null = null
    let pendingMediaAttachments: AgentAttachment[] | null = null

    const localAgentStore = useLocalAgentStore()
    const apiStore = useApiStore()
    const modelStore = useModelStore()
    const engine = localAgentStore.isLocalEngine ? localAgentStore.selectedAgent : null
    const skillsText = useSkillStore()
      .activeSkills.map((skill, index) => `### ${index + 1}. ${skill.name}\n${skill.content}`)
      .join('\n\n')

    try {
      if (selectedRoute === 'media') {
        assistant.model = '多模态素材编辑'
        assistant.content = `已将 ${selectedClips.length} 个选中片段的原素材与需求提交给对应模型，未经过文生视频改写。`
        assistant.status = 'done'
        pendingMediaClips = selectedClips
      } else if (requestRoute === 'attachment-media') {
        assistant.model = '多模态素材编辑'
        assistant.content = `已将 ${targetUser?.attachments?.length || 0} 份原素材与你的原话提交给对应模型，未经过文生视频改写。`
        assistant.status = 'done'
        pendingMediaAttachments = targetUser?.attachments || []
      } else if (selectedRoute === 'mixed') {
        assistant.model = '选中片段路由'
        assistant.status = 'error'
        assistant.error = '代码动画、媒体与音频不能混在同一轮修改。请按类型分别选择后发送；本次未修改任何片段。'
      } else if (engine) {
        assistant.model = engine.name
        const projects = useEditProjectStore()
        const project = projects.getProject(conversation.projectId)
        const result = await streamLocalAgent({
          agentId: engine.id,
          messages: buildLocalContext(conversation),
          apiKey: apiStore.apiKey || '',
          apiBaseUrl: apiStore.apiBaseUrl || '',
          model: modelStore.selectedId,
          mode: conversation.mode || 'chat',
          automation: conversation.automation || 'default',
          projectSummary: project ? projects.projectSummary(project) : '',
          skills: skillsText,
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
          if (selectedRoute === 'animation') {
            applyAnimationEditsFromReply(conversation, assistant, selectedClips, startRevision)
            assistant.content = stripAgentControlBlocks(assistant.content)
          } else {
            const raw = assistant.content
            const toolCalls = extractAgentToolCalls(raw)
            const timelineHandled = applyTimelineOpsFromReply(
              conversation,
              assistant,
              startRevision,
              allowedClipIds,
            )
            applyAskFromReply(assistant)
            assistant.content = stripAgentControlBlocks(assistant.content)
            pendingTool = pendingToolFromReply(assistant, selectedClips, toolCalls, timelineHandled)
            if (!selectedClips.length) attachLocalMediaToProject(conversation, raw)
          }
        }
      } else {
        assistant.model = modelStore.selectedId
        await streamAgentChat({
          messages: await buildContext(conversation, controller.signal),
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
        assistant.content = raw
        if (selectedRoute === 'animation') {
          // 动画协议只接受固定 clipId 的完整源码；误返回生成工具也绝不执行。
          applyAnimationEditsFromReply(conversation, assistant, selectedClips, startRevision)
          assistant.content = stripAgentControlBlocks(assistant.content)
        } else {
          const timelineHandled = applyTimelineOpsFromReply(
            conversation,
            assistant,
            startRevision,
            allowedClipIds,
          )
          applyAskFromReply(assistant)
          assistant.content = stripAgentControlBlocks(assistant.content)
          pendingTool = pendingToolFromReply(assistant, selectedClips, toolCalls, timelineHandled)
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

    if (pendingMediaClips) {
      void runSelectedMediaRevisions(conversation, assistant, pendingMediaClips, startRevision)
      return
    }
    if (pendingMediaAttachments) {
      void runAttachmentMediaRevisions(conversation, assistant, pendingMediaAttachments)
      return
    }

    // 文本流结束后再执行生成，避免长时间任务占住输入框。
    if (pendingTool) {
      // 配音 / 3D：本地没有对应的生成卡片，转到对应工作台并把参数填好，
      // 用户在确认过细节后直接就能开始，不必再复述一遍需求。
      if (pendingTool.name === 'open_voice' || pendingTool.name === 'open_3d') {
        routeToStudio(pendingTool)
        return
      }
      void runGeneration(conversation, assistant, pendingTool)
    }
  }

  /** 把配音 / 3D 的请求带到对应工作台，参数预先填好。 */
  function routeToStudio(call: AgentToolCall) {
    const text = typeof call.args.text === 'string' ? call.args.text : ''
    const prompt = typeof call.args.prompt === 'string' ? call.args.prompt : ''
    const target =
      call.name === 'open_voice'
        ? { path: '/voice', query: text ? { text } : {} }
        : { path: '/model3d', query: prompt ? { prompt } : {} }
    void import('@/router').then(({ default: router }) => router.push(target))
  }

  async function sendMessage(rawContent: string, options: AgentSendOptions = {}) {
    const content = rawContent.trim()
    const attachments = (options.attachments || []).slice(0, MAX_ATTACHMENTS)
    const templates = options.templates?.length ? options.templates : undefined
    const clips = options.clips?.length ? options.clips : undefined
    if ((!content && !attachments.length && !templates?.length && !clips?.length) || streamingId.value) return

    let conversation = options.conversationId
      ? findConversation(options.conversationId)
      : activeConversation.value
    if (!conversation) conversation = createConversation(true)
    activeId.value = conversation.id
    if (options.mode) conversation.mode = options.mode
    if (options.automation) conversation.automation = options.automation
    if (options.projectId) {
      conversation.projectId = options.projectId
      conversation.mode = 'create'
    }

    const now = Date.now()
    const userMessage = reactive<AgentMessage>({
      id: createId(),
      role: 'user',
      content,
      createdAt: now,
      status: 'done',
      attachments: attachments.length ? attachments : undefined,
      templates,
      clips,
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
      const titleSource =
        content ||
        templates?.[0]?.name ||
        clips?.[0]?.name ||
        attachments[0]?.name ||
        ''
      conversation.title = makeTitle(titleSource)
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
    attachProject,
    selectConversation,
    deleteConversation,
    clearAll,
    sendMessage,
    answerAsk,
    regenerate,
    retryGeneration,
    stopStreaming,
    renameConversation,
    flush,
  }
})
