import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  AGENT_MODEL_ID,
  AgentApiError,
  analyzeImages,
  isAgentToolsUnsupportedError,
  streamAgentChat,
} from '@/api/agent'
import { LocalAgentError, streamLocalAgent, type LocalAgentMessage } from '@/api/localAgents'
import type {
  AgentAttachment,
  AgentChatMessage,
  AgentClipRef,
  AgentContentPart,
  AgentConversation,
  AgentGeneration,
  AgentMessage,
  AgentPlanItem,
  AgentProduction,
  AgentRunState,
  AgentStoryboardShot,
  AgentTemplateRef,
  AgentToolActivity,
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
  buildMotionEditSystemPrompt,
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
  extractAgentCreativeHandoff,
  extractAgentTimelineOps,
  extractAgentToolCalls,
  extractLegacyAsk,
  extractMediaUrls,
  normalizeAgentCreativeHandoff,
  normalizeAgentTimelineOps,
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
import { executeMotionTool } from '@/features/agent/motionTools'
import { pollVideoStatus, VideoTaskFailedError } from '@/features/generate/video'
import { generateImage, generateVideo } from '@/api/aiping'
import { CUSTOM_ENGINE_ID, useLocalAgentStore } from '@/stores/localAgentStore'
import { useApiStore } from '@/stores/apiStore'
import { useModelStore } from '@/stores/modelStore'
import { useSkillStore } from '@/stores/skillStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { createFlowSystemPrompt } from '@/features/agent/createSkill'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { AutomationMode, ConversationMode } from '@/stores/chatModeStore'
import type { EditProject } from '@/types/edit'
import { runAgentHarness } from '@/features/agent/harness'
import { recoverInterruptedMessage } from '@/features/agent/recovery'
import {
  AGENT_GENERATION_CONCURRENCY,
  AGENT_GENERATION_MAX_ATTEMPTS,
  describeProduction,
  normalizeStoryboardToolInput,
  productionPendingShots,
  runGenerationQueue,
  withAccountGenerationSlot,
} from '@/features/agent/production'
import {
  AGENT_CHAT_NATIVE_TOOLS,
  AGENT_MAX_RUN_STEPS,
  AGENT_NATIVE_TOOLS,
  presentAgentToolCall,
} from '@/features/agent/toolDefinitions'

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

/** 现有时间轴真正结束的位置；新制作的镜头从这之后预留位置。 */
function projectTimelineEnd(project: EditProject | null): number {
  if (!project) return 0
  return project.tracks.reduce(
    (end, track) => track.clips.reduce(
      (trackEnd, clip) => Math.max(trackEnd, clip.start + clip.duration),
      end,
    ),
    0,
  )
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
      .map((conversation) => {
        const recovered: AgentConversation = {
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
            return recoverInterruptedMessage({ ...rest, templates })
          }),
        }
        if (recovered.production) {
          const productionShots = Array.isArray(recovered.production.shots)
            ? recovered.production.shots
            : []
          recovered.production.shots = productionShots.map((shot) => {
            if (shot.status !== 'running') return shot
            const generation = recovered.messages
              .flatMap((message) => messageGenerations(message))
              .find((item) => item.id === shot.generationId)
            return {
              ...shot,
              status: generation?.status === 'succeeded' ? 'succeeded' : 'failed',
              error: generation?.error || '页面刷新中断了本地等待，请继续生成。',
            }
          })
          if (recovered.production.status === 'running') recovered.production.status = 'paused'
        }
        return recovered
      })
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
  const activeProductionRuns = new Set<string>()

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
    const productionSummary = describeProduction(conversation.production) || undefined
    const automation = conversation.automation || 'default'

    // 创作对话固定带上「短视频脚本导演」（grill-me + video-director）：
    // 任何一次发送都会先按协议问清创作者，再动手做片。
    if ((conversation.mode || 'chat') === 'create') {
      return createFlowSystemPrompt({ automation, projectSummary, productionSummary, extraSkills: skills })
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
    return `${message.content}${note}${askContext(message)}${creativeHandoffContext(message)}${describeClipContext(
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
      : selectedRoute === 'motion' && latestUser?.clips
        ? buildMotionEditSystemPrompt(latestUser.clips)
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
      const clipRoute = message === latestUser ? routeSelectedClips(message.clips) : 'none'
      const animationProtocol = clipRoute === 'animation'
        ? `\n\n[本轮执行协议]\n${buildAnimationEditSystemPrompt(message.clips || [])}`
        : clipRoute === 'motion'
          ? `\n\n[本轮执行协议]\n${buildMotionEditSystemPrompt(message.clips || [])}`
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
    // 同步释放会话切换/新对话；旧请求 finally 只会清理属于自己的运行状态。
    streamingId.value = null
  }

  /** 创作对话里生成成功的素材自动进入关联项目的时间轴。 */
  function attachGenerationToProject(
    conversation: AgentConversation,
    generation: AgentGeneration,
    options: { at?: number; shot?: AgentStoryboardShot } = {},
  ) {
    if (conversation.mode !== 'create' || !conversation.projectId) return
    if (
      (generation.intent === 'edit' && generation.targetClipId) ||
      generation.status !== 'succeeded' ||
      generation.attachedToProject
    ) return
    const projects = useEditProjectStore()
    const url = generation.kind === 'image' ? generation.images?.[0] : generation.videoUrl
    if (!url) return
    const name = generation.sceneId
      ? `${generation.sceneId} · ${generation.prompt.slice(0, 24)}`
      : generation.prompt.slice(0, 32) || (generation.kind === 'image' ? '生成图片' : '生成视频')
    const shot = options.shot
    // 改稿重生成：已有片段存在时原位替换，保留它已经占好的时间轴位置。
    if (shot?.clipId && shot.clipUrl) {
      const replaced = projects.replaceClipAsset(
        conversation.projectId,
        shot.clipId,
        {
          kind: generation.kind === 'image' ? 'image' : 'video',
          url,
          thumbnail: generation.thumbnail,
          duration: generation.kind === 'video' ? generation.duration : undefined,
          name,
        },
        { url: shot.clipUrl },
      )
      if (replaced.status === 'applied') {
        generation.attachedToProject = true
        shot.clipUrl = url
        projects.updateClip(conversation.projectId, shot.clipId, {
          name,
          ...(generation.kind === 'video' && generation.duration ? { duration: generation.duration } : {}),
        })
        return
      }
    }
    const clip = projects.appendAsset(conversation.projectId, {
      name,
      kind: generation.kind,
      url,
      thumbnail: generation.thumbnail,
      duration: generation.kind === 'video' ? generation.duration : undefined,
      source: 'chat',
    }, {
      at: options.at,
      duration: generation.kind === 'video' ? generation.duration : undefined,
    })
    if (clip) {
      generation.attachedToProject = true
      if (shot) {
        shot.clipId = clip.id
        shot.clipUrl = clip.url
      }
    }
  }

  /** 选择题已经渲染成卡片，但模型下一轮仍需知道问了什么、用户选了什么。 */
  function askContext(message: AgentMessage): string {
    const ask = message.ask
    if (!ask) return ''
    const list = ask.options.map((option, index) => `${index + 1}. ${option.label}`).join(' / ')
    const picked = ask.answer ? `[用户选择] ${ask.answer}` : '[用户尚未选择]'
    return `\n\n[选择题] ${ask.header} · ${ask.question}\n[选项] ${list}\n${picked}`
  }

  function creativeHandoffContext(message: AgentMessage): string {
    const handoff = message.creativeHandoff
    if (!handoff) return ''
    const status = handoff.status === 'accepted'
      ? '用户已确认并切换到创作对话'
      : handoff.status === 'dismissed'
        ? '用户暂不切换，继续普通对话'
        : '等待用户确认，尚未切换或生成'
    return `\n\n[创作模式交接] ${handoff.reason}\n[交接任务] ${handoff.prompt}\n[状态] ${status}`
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

  /** 普通模式只提议交接；误输出的生成工具也转换成确认卡，绝不在这里执行。 */
  function applyCreativeHandoffFromReply(conversation: AgentConversation, message: AgentMessage) {
    if ((conversation.mode || 'chat') !== 'chat') return
    const block = extractAgentCreativeHandoff(message.content)
    if (block) message.creativeHandoff = block
    if (message.creativeHandoff) return

    const call = extractAgentToolCalls(message.content).find((item) =>
      ['suggest_create_mode', 'generate_image', 'generate_video', 'generate_storyboard', 'open_voice', 'open_3d', 'edit_timeline'].includes(item.name),
    )
    if (!call) return
    if (call.name === 'suggest_create_mode') {
      message.creativeHandoff = normalizeAgentCreativeHandoff(call.args) || undefined
      return
    }
    const task = String(call.args.prompt || call.args.text || '').trim()
    const reason = '下一步需要实际生成或编辑素材，并在创作项目中继续。'
    const prompt = task
      ? `请在创作模式中继续当前任务：${task}`
      : '请基于当前对话已经确认的内容，在创作模式中继续实际素材创作。'
    message.creativeHandoff = normalizeAgentCreativeHandoff({ target: 'create', reason, prompt }) || undefined
  }

  function dismissCreativeHandoff(messageId: string) {
    const message = conversations.value.flatMap((item) => item.messages).find((item) => item.id === messageId)
    if (message?.creativeHandoff?.status !== 'pending') return
    message.creativeHandoff.status = 'dismissed'
    persistNow()
  }

  /** 用户确认后才切换同一对话、创建/关联项目，并带着交接任务继续。 */
  function acceptCreativeHandoff(messageId: string) {
    if (streamingId.value) return null
    const conversation = conversations.value.find((item) => item.messages.some((msg) => msg.id === messageId))
    const message = conversation?.messages.find((msg) => msg.id === messageId)
    const handoff = message?.creativeHandoff
    if (!conversation || !handoff || handoff.status !== 'pending') return null

    for (const item of conversation.messages) {
      if (item.creativeHandoff?.status === 'pending') item.creativeHandoff.status = 'dismissed'
    }
    handoff.status = 'accepted'
    conversation.mode = 'create'
    activeId.value = conversation.id
    const sourceUser = [...conversation.messages].reverse().find((item) => item.role === 'user')
    const projects = useEditProjectStore()
    const project = projects.findProjectByConversation(conversation.id) ||
      projects.createProject(makeTitle(handoff.prompt), conversation.id)
    conversation.projectId = project.id
    conversation.updatedAt = Date.now()
    persistNow()
    void sendMessage(handoff.prompt, {
      conversationId: conversation.id,
      mode: 'create',
      automation: conversation.automation || 'default',
      attachments: sourceUser?.attachments,
      templates: sourceUser?.templates,
    })
    return { conversationId: conversation.id, projectId: project.id }
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
        const task = generation.taskId
          ? {
              id: generation.taskId,
              provider: generation.provider || 'minimax-h3',
              providerCreateEndpoint: generation.providerCreateEndpoint,
            }
          : await generateVideo(params)
        if (!task.id) throw new Error('视频任务创建成功但未返回任务 ID，请重试。')
        generation.taskId = task.id
        generation.provider = task.provider || 'minimax-h3'
        generation.providerCreateEndpoint = (task as any).providerCreateEndpoint
        // 建单后立刻落盘；后续轮询失败只恢复这个 taskId，绝不盲目重复建单。
        persistNow()
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
      if (error instanceof VideoTaskFailedError) {
        // 上游已明确失败，原任务不可能再成功，下一次尝试才允许重新建单。
        generation.taskId = undefined
        generation.providerCreateEndpoint = undefined
      }
      if (error instanceof AgentApiError && error.kind === 'auth') authExpired.value = true
    }
  }

  /** 普通错误最多自动重试 2 次；鉴权失败直接停，避免无意义重复请求。 */
  async function executeGenerationWithRetry(generation: AgentGeneration) {
    generation.maxAttempts = AGENT_GENERATION_MAX_ATTEMPTS
    generation.autoRetryCount = 0
    generation.autoRetrying = false
    for (let attempt = 1; attempt <= AGENT_GENERATION_MAX_ATTEMPTS; attempt += 1) {
      generation.attempt = attempt
      generation.lastAttemptAt = Date.now()
      generation.queued = false
      await withAccountGenerationSlot(() => executeGeneration(generation))
      if (generation.status === 'succeeded' || authExpired.value) break
      if (attempt < AGENT_GENERATION_MAX_ATTEMPTS) {
        generation.autoRetryCount = attempt
        generation.autoRetrying = true
        generation.status = 'running'
        generation.error = `${generation.error || '生成失败'}；正在自动重试（${attempt + 1}/${AGENT_GENERATION_MAX_ATTEMPTS}）`
        persistNow()
      }
    }
    generation.autoRetrying = false
    if (generation.status === 'failed' && (generation.autoRetryCount || 0) > 0) {
      generation.error = `${generation.error || '生成失败'}（已自动重试 ${generation.autoRetryCount} 次）`
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
    deferProjectAttach = false,
  ): Promise<AgentGeneration | undefined> {
    const built = existing || buildAgentGeneration(call)
    if (!built) return undefined
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

    await executeGenerationWithRetry(generation)
    if (!deferProjectAttach) {
      if (generation.intent === 'edit' && generation.targetClipId) {
        applyCompletedGeneration(conversation, generation)
      } else {
        attachGenerationToProject(conversation, generation)
      }
    }
    conversation.updatedAt = Date.now()
    persistNow()
    return generation
  }

  function syncProductionPlan(message: AgentMessage, production: AgentProduction) {
    production.updatedAt = Date.now()
    if (message.run) {
      message.run.plan = production.shots.map((shot) => ({
        id: `shot_${shot.id}`,
        content: `${shot.id} · ${shot.duration}s · ${shot.timelineStart ?? 0}s 起 · ${shot.prompt.slice(0, 48)}`,
        status: shot.status === 'succeeded'
          ? 'completed'
          : shot.status === 'running'
            ? 'in_progress'
            : 'pending',
      }))
      touchRun(message)
    }
  }

  function findGeneration(conversation: AgentConversation, id?: string): AgentGeneration | undefined {
    if (!id) return undefined
    for (const message of conversation.messages) {
      const generation = messageGenerations(message).find((item) => item.id === id)
      if (generation) return generation
    }
    return undefined
  }

  /**
   * 每个镜号都有预留时间点：先完成的 S03 可以立即入轨，
   * 但不会占用 S02 的位置；之后完成的 S02 会回填前面的空档。
   */
  function flushStoryboardAttachments(conversation: AgentConversation, production: AgentProduction) {
    for (const shot of production.shots) {
      const generation = findGeneration(conversation, shot.generationId)
      if (generation?.status !== 'succeeded') continue
      attachGenerationToProject(conversation, generation, { at: shot.timelineStart, shot })
    }
  }

  async function runStoryboardProduction(
    conversation: AgentConversation,
    assistant: AgentMessage,
    production: AgentProduction,
  ) {
    if (activeProductionRuns.has(production.id)) return
    activeProductionRuns.add(production.id)
    try {
      const pending = productionPendingShots(production)
      production.status = 'running'
      const work = pending.map((shot) => {
        const generation = buildAgentGeneration({
          name: 'generate_video',
          args: {
            prompt: shot.prompt,
            aspect_ratio: production.aspectRatio,
            resolution: production.resolution,
            duration: shot.duration,
          },
        })
        if (!generation) throw new Error(`${shot.id} 缺少可执行的生成参数。`)
        generation.sceneId = shot.id
        generation.attempt = 0
        generation.autoRetryCount = 0
        generation.queued = true
        shot.generationId = generation.id
        shot.status = 'pending'
        shot.error = undefined
        return { shot, generation }
      })
      // 先一次性建立全部卡片，后续镜头排队中也有持久化记录，不再只出现 S1。
      for (const { generation } of work) setMessageGeneration(assistant, reactive(generation))
      syncProductionPlan(assistant, production)
      conversation.updatedAt = Date.now()
      persistNow()

      await runGenerationQueue(work, async ({ shot, generation }) => {
        try {
          generation.queued = false
          shot.status = 'running'
          syncProductionPlan(assistant, production)
          persistNow()
          const result = await runGeneration(conversation, assistant, {
            name: 'generate_video',
            args: {
              prompt: shot.prompt,
              aspect_ratio: production.aspectRatio,
              resolution: production.resolution,
              duration: shot.duration,
            },
          }, generation, true)
          shot.status = result?.status === 'succeeded' ? 'succeeded' : 'failed'
          shot.attempt = result?.attempt
          shot.error = result?.error
        } catch (error: any) {
          // 单镜异常只让这一镜失败，不能把整片队列卡在 running。
          shot.status = 'failed'
          shot.error = error?.message || '生成失败，请稍后重试。'
          generation.status = 'failed'
          generation.error = shot.error
        } finally {
          syncProductionPlan(assistant, production)
          flushStoryboardAttachments(conversation, production)
          persistNow()
        }
      }, AGENT_GENERATION_CONCURRENCY)

      flushStoryboardAttachments(conversation, production)
      const succeeded = production.shots.filter((shot) => shot.status === 'succeeded').length
      const failed = production.shots.filter((shot) => shot.status === 'failed')
      const total = production.shots.length
      const remaining = total - succeeded
      production.status = remaining === 0 ? 'done' : failed.length ? 'failed' : 'paused'
      syncProductionPlan(assistant, production)
      const summary = remaining === 0
        ? `整支视频所需 ${total} 个镜头已全部生成，并按 ${production.shots.map((shot) => shot.id).join(' → ')} 顺序入轨，可在剪辑台预览完整视频。`
        : failed.length
          ? `已完成 ${succeeded}/${total} 镜。${failed.map((shot) => shot.id).join('、')} 在自动重试后仍失败；完整需求与进度已保存，可点对应卡片重试，成功后发送“继续生成”完成余镜。`
          : `本批已完成，整片进度 ${succeeded}/${total}，还剩 ${remaining} 镜。完整制作单已保存，发送“继续生成”即可从下一镜续跑。`
      assistant.content = `${assistant.content.trim()}\n\n${summary}`.trim()
      conversation.updatedAt = Date.now()
      persistNow()
    } catch (error: any) {
      // 即使队列本身异常退出，也要把制作单落到明确状态，刷新后仍能继续。
      production.status = 'failed'
      const reason = error?.message || '整片队列执行中断。'
      for (const shot of production.shots) {
        if (shot.status === 'pending' || shot.status === 'running') {
          shot.status = 'failed'
          shot.error = shot.error || reason
        }
      }
      syncProductionPlan(assistant, production)
      assistant.content = `${assistant.content.trim()}\n\n整片队列执行中断：${reason}。已完成镜头不会重复生成，发送“继续生成”可从未完成镜号续跑。`.trim()
      conversation.updatedAt = Date.now()
      persistNow()
    } finally {
      activeProductionRuns.delete(production.id)
    }
  }

  /** 将完整制作单交给宿主执行；工具结果只表示本地队列启动，不声称素材已完成。 */
  function startStoryboardProduction(
    conversation: AgentConversation,
    assistant: AgentMessage,
    call: AgentToolCall,
  ) {
    const input = normalizeStoryboardToolInput(call.args)
    const previous = conversation.production
    if (previous && activeProductionRuns.has(previous.id)) {
      throw new Error('当前整片任务仍在执行，请等待本批结束后再续跑。')
    }
    const now = Date.now()
    const projects = useEditProjectStore()
    const project = conversation.projectId ? projects.getProject(conversation.projectId) : null
    const formatUnchanged = !!previous &&
      previous.aspectRatio === input.aspectRatio &&
      previous.resolution === input.resolution
    // 同一片名与需求，或过半镜号仍是同一提示词，视为续跑/改稿；
    // 换成另一支片则新建制作单，并从现有时间轴末尾开始，避免覆盖旧片。
    const matchedShots = previous
      ? input.shots.filter((shot) =>
          previous.shots.some((item) => item.id === shot.id && item.prompt === shot.prompt),
        ).length
      : 0
    const isContinuation = !!previous && (
      (previous.title === input.title && previous.brief === input.brief) ||
      matchedShots >= Math.ceil(input.shots.length / 2)
    )
    // 旧版本制作单可能没有 timelineStart，按已入轨总时长回推起点。
    const timelineStart = isContinuation
      ? previous!.timelineStart ?? Math.max(
          0,
          projectTimelineEnd(project) - previous!.shots.reduce((sum, item) => sum + (item.duration || 0), 0),
        )
      : projectTimelineEnd(project)
    // 新镜号追加到已预留区域之后；老镜号保留原来的固定位置。
    let cursor = isContinuation
      ? previous!.shots.reduce(
          (end, item) => Math.max(end, (item.timelineStart ?? timelineStart) + (item.duration || 0)),
          timelineStart,
        )
      : timelineStart
    const shots: AgentStoryboardShot[] = input.shots.map((shot) => {
      const old = isContinuation ? previous!.shots.find((item) => item.id === shot.id) : undefined
      // 只有提示词、时长、画幅和分辨率全都没变，才复用已成功的镜头。
      if (
        old?.status === 'succeeded' &&
        old.prompt === shot.prompt &&
        old.duration === shot.duration &&
        formatUnchanged
      ) {
        return { ...old, timelineStart: old.timelineStart ?? timelineStart }
      }
      const shotStart = old?.timelineStart ?? cursor
      if (old?.timelineStart == null) cursor += shot.duration
      return {
        ...shot,
        // 若该镜号之前已经入轨，保留片段引用，重生成时原位替换。
        ...(old?.clipId ? { clipId: old.clipId, clipUrl: old.clipUrl } : {}),
        timelineStart: shotStart,
        generationId: undefined,
        status: 'pending' as const,
        attempt: 0,
        error: undefined,
      }
    })
    const production = reactive<AgentProduction>({
      id: isContinuation ? previous!.id : createId(),
      title: input.title,
      brief: input.brief,
      continuity: input.continuity,
      storyboardText: input.storyboardText,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      delivery: input.delivery,
      batchSize: AGENT_GENERATION_CONCURRENCY,
      status: 'running',
      messageId: assistant.id,
      timelineStart,
      shots,
      createdAt: isContinuation ? previous!.createdAt : now,
      updatedAt: now,
    })
    conversation.production = production
    const pending = productionPendingShots(production)
    syncProductionPlan(assistant, production)
    persistNow()
    void runStoryboardProduction(conversation, assistant, production)
    return {
      ok: true,
      status: 'started',
      productionId: production.id,
      totalShots: production.shots.length,
      queuedShotIds: pending.map((shot) => shot.id),
      completedShotIds: production.shots.filter((shot) => shot.status === 'succeeded').map((shot) => shot.id),
      concurrency: AGENT_GENERATION_CONCURRENCY,
      message: '完整制作单与所有镜号已持久化，本地队列已启动；每镜最多自动尝试3次，已成功镜头不会重复生成。最终状态以制作单和生成卡片为准。',
    }
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
      await executeGenerationWithRetry(generation)
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
      await executeGenerationWithRetry(generation)
      attachGenerationToProject(conversation, generation)
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
    const production = conversation.production
    const shot = production?.shots.find((item) => item.generationId === generation.id)
    if (shot) {
      shot.status = 'running'
      shot.error = undefined
      if (production) production.status = 'running'
    }
    void runGeneration(
      conversation,
      message,
      call,
      { ...generation, status: 'running', error: undefined, replacementError: undefined, attempt: 0, autoRetryCount: 0 },
      Boolean(shot),
    ).then((result) => {
      if (!shot || !production || !result) return
      shot.status = result.status === 'succeeded' ? 'succeeded' : 'failed'
      shot.attempt = result.attempt
      shot.error = result.error
      flushStoryboardAttachments(conversation, production)
      const remaining = production.shots.filter((item) => item.status !== 'succeeded').length
      production.status = remaining === 0
        ? 'done'
        : production.shots.some((item) => item.status === 'failed')
          ? 'failed'
          : 'paused'
      syncProductionPlan(message, production)
      if (remaining === 0) {
        message.content = `${message.content.trim()}\n\n全部 ${production.shots.length} 个镜头已生成并按镜号顺序入轨，整支视频可以在剪辑台预览。`.trim()
      }
      persistNow()
    })
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
      // 切换卡本身就是完整答复，不能因为没有额外正文而误报空响应。
      message.status = message.creativeHandoff ? 'done' : 'error'
      if (!message.creativeHandoff) message.error = '模型没有返回内容，请重试。'
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

  function createRunState(): AgentRunState {
    const now = Date.now()
    return {
      version: 1,
      status: 'running',
      phase: 'thinking',
      currentStep: 1,
      maxSteps: AGENT_MAX_RUN_STEPS,
      plan: [],
      activities: [],
      startedAt: now,
      updatedAt: now,
    }
  }

  function touchRun(message: AgentMessage) {
    if (message.run) message.run.updatedAt = Date.now()
  }

  function toolResultSummary(call: AgentToolCall, result: unknown, error?: string): string {
    if (error) return error
    const value = result && typeof result === 'object' ? result as Record<string, any> : {}
    if (call.name === 'suggest_create_mode' || value.status === 'confirmation_required') return '等待用户确认，不会自动切换或生成'
    if (call.name === 'update_plan') return `已更新 ${Array.isArray(value.items) ? value.items.length : 0} 个阶段`
    if (call.name === 'read_project') return value.project ? '最新项目状态已回注' : '当前对话未关联项目'
    if (call.name === 'edit_timeline') return `已应用 ${Number(value.applied) || 0} 项，跳过 ${Number(value.skipped) || 0} 项`
    if (call.name === 'generate_storyboard') {
      return `完整制作单已启动：${Number(value.totalShots) || 0} 镜，当前执行 ${Array.isArray(value.queuedShotIds) ? value.queuedShotIds.length : 0} 镜`
    }
    if (call.name === 'generate_image' || call.name === 'generate_video') {
      return `本地后台任务 ${String(value.generationId || '')} 已启动`
    }
    return '已完成'
  }

  function recordToolStart(message: AgentMessage, call: AgentToolCall, step: number) {
    if (!message.run) return
    const presentation = presentAgentToolCall(call)
    const activity: AgentToolActivity = {
      id: call.id || createId(),
      step,
      name: call.name,
      title: presentation.title,
      detail: presentation.detail,
      status: 'running',
      startedAt: Date.now(),
    }
    message.run.phase = 'tool'
    message.run.activities.push(activity)
    touchRun(message)
    persistNow()
  }

  function recordToolEnd(
    message: AgentMessage,
    call: AgentToolCall,
    step: number,
    result?: unknown,
    error?: string,
  ) {
    if (!message.run) return
    const activity = [...message.run.activities].reverse().find((item) =>
      item.id === call.id && item.step === step && item.status === 'running',
    )
    if (activity) {
      activity.status = error ? (error === '已停止' ? 'stopped' : 'failed') : 'succeeded'
      activity.summary = toolResultSummary(call, result, error)
      activity.finishedAt = Date.now()
    }
    message.run.phase = 'thinking'
    touchRun(message)
    persistNow()
  }

  /** 内置工具宿主：模型 schema 与副作用分离，项目写入复用已有事务接口。 */
  async function executeBuiltinTool(
    conversation: AgentConversation,
    assistant: AgentMessage,
    call: AgentToolCall,
    timeline: { revision?: number; allowedClipIds?: Set<string> },
  ): Promise<unknown> {
    const mode = conversation.mode || 'chat'
    const CHAT_READ_ONLY_TOOLS = [
      'update_plan',
      'suggest_create_mode',
      'list_motion_templates',
      'read_motion_template',
      'read_motion_project',
    ]
    if (mode === 'chat' && !CHAT_READ_ONLY_TOOLS.includes(call.name)) {
      const task = String(call.args.prompt || call.args.text || '').trim()
      const handoff = normalizeAgentCreativeHandoff({
        target: 'create',
        reason: '下一步需要实际生成或编辑素材，并在创作项目中继续。',
        prompt: task
          ? `请在创作模式中继续当前任务：${task}`
          : '请基于当前对话已经确认的内容，在创作模式中继续实际素材创作。',
      })
      const CHAT_BLOCKED_TOOLS = [
        'generate_image',
        'generate_video',
        'generate_storyboard',
        'open_voice',
        'open_3d',
        'edit_timeline',
        'create_motion_project',
        'write_motion_project',
        'render_motion_project',
      ]
      if (handoff && CHAT_BLOCKED_TOOLS.includes(call.name)) {
        assistant.creativeHandoff = handoff
        return {
          ok: true,
          status: 'confirmation_required',
          message: '普通对话已阻止该创作工具，仅记录切换建议；等待用户确认，不得执行或声称已经生成。',
        }
      }
      throw new Error('普通对话不执行素材生成、剪辑或工作台跳转；请改用 suggest_create_mode 请求用户确认。')
    }
    if (call.name === 'suggest_create_mode') {
      if (mode !== 'chat') throw new Error('当前已经是创作对话，无需重复切换。')
      const handoff = normalizeAgentCreativeHandoff(call.args)
      if (!handoff) throw new Error('切换建议需要 target=create、reason 和承接当前任务的 prompt。')
      assistant.creativeHandoff = handoff
      return {
        ok: true,
        status: 'confirmation_required',
        message: '切换建议已记录，等待用户确认；不要自动切换或执行生成，也不要重复调用本工具。',
      }
    }

    if (call.name.includes('motion_')) {
      return executeMotionTool(call, conversation, timeline)
    }

    if (call.name === 'update_plan') {
      const source = Array.isArray(call.args.items) ? call.args.items.slice(0, 6) : []
      const plan: AgentPlanItem[] = source.map((raw: any, index) => ({
        id: `plan_${index + 1}`,
        content: String(raw?.content || '').trim().slice(0, 80),
        status: ['pending', 'in_progress', 'completed'].includes(raw?.status)
          ? raw.status
          : 'pending',
      })).filter((item) => item.content)
      if (assistant.run) assistant.run.plan = plan
      return { ok: true, items: plan }
    }

    if (call.name === 'read_project') {
      const projects = useEditProjectStore()
      const project = conversation.projectId ? projects.getProject(conversation.projectId) : null
      if (project && conversation.projectId) {
        // stale 后模型可按提示 read_project 再重试；版本必须对应刚刚读取的快照。
        timeline.revision = projects.revisionOf(conversation.projectId)
      }
      return {
        ok: true,
        project: project ? projects.projectSummary(project) : null,
        message: project ? '已读取最新项目状态。' : '当前对话没有关联剪辑项目。',
      }
    }

    if (call.name === 'edit_timeline') {
      if (conversation.mode !== 'create' || !conversation.projectId) {
        throw new Error('当前对话没有关联剪辑项目，未修改时间轴。')
      }
      const extracted = normalizeAgentTimelineOps(call.args.ops)
      const ops = timeline.allowedClipIds
        ? extracted.filter((op) => timeline.allowedClipIds?.has(op.clipId))
        : extracted
      if (!extracted.length) throw new Error('没有合法的时间轴操作。')
      if (!ops.length) throw new Error('已阻止修改未选中的片段。')
      const projects = useEditProjectStore()
      const result = projects.applyTimelineOps(conversation.projectId, ops, timeline.revision)
      if (result.stale) {
        throw new Error('时间轴在本轮执行期间已被手动修改，本次没有覆盖；请先 read_project 刷新后再决定。')
      }
      if (!result.applied) throw new Error('没有操作成功，请检查片段 ID 与参数。')
      timeline.revision = projects.revisionOf(conversation.projectId)
      return {
        ok: true,
        ...result,
        skippedOutsideSelection: extracted.length - ops.length,
      }
    }

    if (call.name === 'generate_storyboard') {
      return startStoryboardProduction(conversation, assistant, call)
    }

    if (call.name === 'generate_image' || call.name === 'generate_video') {
      const generation = buildAgentGeneration(call)
      if (!generation) throw new Error('缺少可执行的 prompt 生成参数。')
      // 长任务保持既有后台卡片语义；started 仅表示本地任务已启动，不代表上游已受理。
      void runGeneration(conversation, assistant, call, generation)
      return {
        ok: true,
        status: 'started',
        generationId: generation.id,
        message: '本地后台生成任务已启动，尚未确认上游受理；进度、失败和最终结果由生成卡片展示，不要声称已提交成功或已生成完成。',
      }
    }

    if (call.name === 'open_voice' || call.name === 'open_3d') {
      routeToStudio(call)
      return { ok: true, status: 'opened', workspace: call.name === 'open_voice' ? 'voice' : 'model3d' }
    }

    throw new Error(`未知或当前不可用的工具：${call.name}`)
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
      } else if (requestRoute === 'attachment-media' && conversation.mode === 'create') {
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
          projectSummary: [
            project ? projects.projectSummary(project) : '',
            describeProduction(conversation.production),
          ].filter(Boolean).join('\n\n'),
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

        if (!assistant.content.trim() || result.exitCode !== 0) {
          assistant.status = 'error'
          assistant.error =
            result.exitCode !== 0
              ? `${engine.name} 退出（code ${result.exitCode}）。${
                  result.stderrTail.split('\n').filter(Boolean).slice(-1)[0] || '请展开运行日志查看。'
                }`
              : `${engine.name} 没有返回内容，请重试或展开运行日志查看。`
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
            applyCreativeHandoffFromReply(conversation, assistant)
            assistant.content = stripAgentControlBlocks(assistant.content)
            pendingTool = pendingToolFromReply(
              assistant,
              selectedClips,
              conversation.mode === 'chat' ? [] : toolCalls,
              timelineHandled,
            )
            if (!selectedClips.length) attachLocalMediaToProject(conversation, raw)
          }
        }
      } else {
        assistant.model = modelStore.selectedId
        assistant.run = createRunState()
        const timeline = { revision: startRevision, allowedClipIds }
        const createMode = conversation.mode === 'create'
        const nativeTools = selectedClips.length
          ? []
          : createMode
            ? AGENT_NATIVE_TOOLS
            : AGENT_CHAT_NATIVE_TOOLS
        let nativeToolsSupported = true
        await runAgentHarness({
          messages: await buildContext(conversation, controller.signal),
          tools: nativeTools,
          signal: controller.signal,
          legacyToolCalls: createMode && !selectedClips.length,
          stream: async (request) => {
            try {
              return await streamAgentChat({
                ...request,
                tools: nativeToolsSupported ? request.tools : [],
                model: modelStore.selectedId,
              })
            } catch (error: any) {
              // 部分 OpenAI 兼容模型不接受 tools；只在协议被拒绝时降级一次。
              if (isAgentToolsUnsupportedError(error) && request.tools.length) {
                nativeToolsSupported = false
                assistant.logs = `${assistant.logs || ''}\n当前模型未接受原生工具协议，已切换兼容工具格式。`.trim()
                return streamAgentChat({ ...request, tools: [], model: modelStore.selectedId })
              }
              throw error
            }
          },
          executeTool: (call, _step, signal) => {
            if (signal.aborted) {
              const error = new Error('已停止生成。')
              error.name = 'AbortError'
              throw error
            }
            return executeBuiltinTool(conversation, assistant, call, timeline)
          },
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
          onStepStart: (step) => {
            if (!assistant.run) return
            assistant.run.currentStep = step
            assistant.run.phase = 'thinking'
            if (step > 1 && assistant.content.trim() && !assistant.content.endsWith('\n\n')) {
              assistant.content += '\n\n'
            }
            touchRun(assistant)
            schedulePersist()
          },
          onToolStart: (call, step) => recordToolStart(assistant, call, step),
          onToolEnd: ({ call, step, result, error }) => {
            recordToolEnd(assistant, call, step, result, error)
            conversation.updatedAt = Date.now()
          },
        })

        const raw = assistant.content
        // 非固定目标路由的旧 onestep-tool 已由 Harness 执行并回注，收尾不可再次执行。
        // 固定目标路由没有开放 Harness 工具，仍保留旧的误调用拦截。
        const toolCalls = selectedClips.length ? extractAgentToolCalls(raw) : []
        assistant.content = raw
        if (selectedRoute === 'animation') {
          // 动画协议只接受固定 clipId 的完整源码；误返回生成工具也绝不执行。
          applyAnimationEditsFromReply(conversation, assistant, selectedClips, startRevision)
          assistant.content = stripAgentControlBlocks(assistant.content)
        } else {
          const timelineHandled = applyTimelineOpsFromReply(
            conversation,
            assistant,
            timeline.revision,
            allowedClipIds,
          )
          applyAskFromReply(assistant)
          applyCreativeHandoffFromReply(conversation, assistant)
          assistant.content = stripAgentControlBlocks(assistant.content)
          if (!assistant.content.trim() && assistant.run.activities.length && !assistant.creativeHandoff) {
            assistant.content = '已完成本轮操作，详细状态见执行轨迹。'
          }
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
      if (streamingId.value === assistant.id) streamingId.value = null
      if (assistant.run?.status === 'running') {
        assistant.run.status = assistant.status === 'error'
          ? 'error'
          : assistant.status === 'stopped'
            ? 'stopped'
            : 'done'
        assistant.run.phase = 'done'
        for (const activity of assistant.run.activities) {
          if (activity.status !== 'running') continue
          activity.status = assistant.status === 'stopped' ? 'stopped' : 'failed'
          activity.summary = activity.summary || '执行未正常闭合'
          activity.finishedAt = Date.now()
        }
        touchRun(assistant)
      }
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
    const hasRunningGeneration = conversation.messages
      .slice(lastUserIndex + 1)
      .some((message) => messageGenerations(message).some((generation) => generation.status === 'running'))
    // 停止 Agent 控制循环不会取消已启动的上游任务；不能裁掉卡片后隐形重复付费。
    if (hasRunningGeneration) return

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
    acceptCreativeHandoff,
    dismissCreativeHandoff,
    regenerate,
    retryGeneration,
    stopStreaming,
    renameConversation,
    flush,
  }
})
