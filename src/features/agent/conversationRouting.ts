import type {
  AgentAttachment,
  AgentClipRef,
  AgentGeneration,
  AgentGenerationKind,
  AgentTemplateRef,
} from '@/types/agent'
import type { CreativeEngineMode } from '@/stores/chatModeStore'
import type { UploadedFile } from '@/types/chat'
import {
  AGENT_IMAGE_MODEL,
  AGENT_IMAGE_MODEL_LABEL,
  AGENT_VIDEO_MODEL,
  AGENT_VIDEO_MODEL_LABEL,
} from '@/features/agent/tools'
import { mediaReferenceForClip, routeSelectedClips, type SelectedClipRoute } from '@/features/agent/clipRevision'

/** 所有对话入口共用的首轮判断；选中片段优先于上传附件。 */
export type ConversationRequestRoute = SelectedClipRoute | 'attachment-media' | 'agent'

const EDIT_INTENT = /修改|改成|改为|改一下|改下|改图|改视频|改背景|编辑|重绘|重新生成|重生成|换成|更换|替换|去除|去掉|移除|消除|修复|扩图|抠图|提高清晰度|增强清晰|\bedit\b|\bmodify\b|\bretouch\b|\bremove\b|\breplace\b|\bchange\b/i
const DISCUSSION_ONLY = /怎么.{0,10}改|如何.{0,10}改|修改建议|给我.{0,8}建议|不要修改|别修改|无需修改/i

/**
 * 只有明确要求“改这份素材”时才跳过聊天模型。
 * “参考它生成”“分析画面”“给我修改建议”仍走原有多模态对话，避免误触发生成。
 */
export function isDirectMediaEditRequest(content: string): boolean {
  const text = content.trim()
  return !!text && EDIT_INTENT.test(text) && !DISCUSSION_ONLY.test(text)
}

export interface ConversationRouteInput {
  content: string
  clips?: AgentClipRef[]
  attachments?: AgentAttachment[]
  templates?: AgentTemplateRef[]
  creativeEngine?: CreativeEngineMode
}

export function routeConversationRequest(input: ConversationRouteInput): ConversationRequestRoute {
  const selectedRoute = routeSelectedClips(input.clips)
  if (selectedRoute !== 'none') return selectedRoute
  // OpenMotion + Logo/截图也是动效工程任务，附件绝不能把它改道到付费素材编辑。
  if (input.creativeEngine === 'animation') return 'agent'
  if (!input.attachments?.length || input.templates?.length) return 'none'
  if (!input.attachments.every((item) => (item.kind === 'image' || item.kind === 'video') && !!item.url)) return 'none'
  return isDirectMediaEditRequest(input.content) ? 'attachment-media' : 'none'
}

export interface ConversationMediaTarget {
  aspectRatio: string
  resolution: '768P' | '2K'
}

/** 上传附件没有固定时间轴目标：生成结果作为衍生素材返回，不覆盖任何现有片段。 */
export function createAttachmentMediaGeneration(
  attachment: AgentAttachment,
  prompt: string,
  target: ConversationMediaTarget,
): AgentGeneration {
  if ((attachment.kind !== 'image' && attachment.kind !== 'video') || !attachment.url) {
    throw new Error('只有可读取的图片和视频附件可以直接进入多模态素材编辑。')
  }
  const image = attachment.kind === 'image'
  return {
    id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: attachment.kind,
    intent: 'edit',
    status: 'running',
    prompt,
    model: image ? AGENT_IMAGE_MODEL : AGENT_VIDEO_MODEL,
    modelLabel: image ? AGENT_IMAGE_MODEL_LABEL : AGENT_VIDEO_MODEL_LABEL,
    aspectRatio: target.aspectRatio,
    resolution: image ? undefined : target.resolution,
    duration: image ? undefined : Math.min(15, Math.max(4, Math.round(attachment.duration || 5))),
    targetClipName: attachment.name,
    targetSourceUrl: attachment.url,
    createdAt: Date.now(),
  }
}

/**
 * 普通对话里的参考生成也保留原素材：图片编辑/参考图生图用原图，
 * 视频优先使用原视频，其次允许图片作为首帧或视觉参考。
 */
export function attachmentReferenceForGeneration(
  attachments: AgentAttachment[] | undefined,
  kind: AgentGenerationKind,
): UploadedFile | null {
  const media = (attachments || []).filter((item) => item.kind === 'image' || item.kind === 'video')
  const attachment = kind === 'image'
    ? media.find((item) => item.kind === 'image')
    : media.find((item) => item.kind === 'video') || media.find((item) => item.kind === 'image')
  if (!attachment?.url) return null
  return mediaReferenceForClip({
    id: attachment.id,
    name: attachment.name,
    kind: attachment.kind as 'image' | 'video',
    trackId: '',
    trackName: '',
    trackKind: 'video',
    start: 0,
    duration: attachment.duration || 5,
    url: attachment.url,
  })
}
