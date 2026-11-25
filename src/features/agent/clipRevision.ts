import type {
  AgentClipRef,
  AgentGeneration,
  AnimationSourceType,
} from '@/types/agent'
import type { UploadedFile } from '@/types/chat'
import {
  AGENT_IMAGE_MODEL,
  AGENT_IMAGE_MODEL_LABEL,
  AGENT_VIDEO_MODEL,
  AGENT_VIDEO_MODEL_LABEL,
} from '@/features/agent/tools'

/** 选中片段的执行路由。代码动画与媒体素材不能共用文生视频工具。 */
export type SelectedClipRoute = 'animation' | 'media' | 'audio' | 'mixed' | 'none'

export function isAnimationClip(clip: Pick<AgentClipRef, 'kind'>): boolean {
  return clip.kind === 'animation'
}

export function isEditableMediaClip(clip: Pick<AgentClipRef, 'kind'>): boolean {
  return clip.kind === 'image' || clip.kind === 'video'
}

export function routeSelectedClips(clips: AgentClipRef[] | undefined): SelectedClipRoute {
  if (!clips?.length) return 'none'
  if (clips.every(isAnimationClip)) return 'animation'
  if (clips.every(isEditableMediaClip)) return 'media'
  if (clips.every((clip) => clip.kind === 'audio')) return 'audio'
  return 'mixed'
}

/**
 * 选中媒体时，交给多模态模型的文本只能由用户原话组成。
 * 整体输入和片段意见都是用户原文；二者同时存在时仅用换行连接，不改写、不扩写。
 */
export function selectedClipPrompt(content: string, clip: AgentClipRef): string {
  const overall = content.trim()
  const note = clip.note?.trim() || ''
  if (overall && note && overall !== note) return `${note}\n${overall}`
  return overall || note || '请根据这个片段的内容进行修改。'
}

export interface MediaRevisionTarget {
  aspectRatio: string
  resolution: '768P' | '2K'
  expectedRevision?: number
}

/** 固定生成时的目标快照；执行结束后用它校验，绝不读取“当前新选择”。 */
export function createMediaRevisionGeneration(
  clip: AgentClipRef,
  prompt: string,
  target: MediaRevisionTarget,
): AgentGeneration {
  const image = clip.kind === 'image'
  return {
    id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: image ? 'image' : 'video',
    intent: 'edit',
    status: 'running',
    // prompt 原样保留；不要在发送前拼接角色、镜头或风格描述。
    prompt,
    model: image ? AGENT_IMAGE_MODEL : AGENT_VIDEO_MODEL,
    modelLabel: image ? AGENT_IMAGE_MODEL_LABEL : AGENT_VIDEO_MODEL_LABEL,
    aspectRatio: target.aspectRatio,
    resolution: image ? undefined : target.resolution,
    duration: image ? undefined : Math.min(15, Math.max(4, Math.round(clip.duration || 5))),
    targetClipId: clip.id,
    targetClipName: clip.name,
    targetSourceUrl: clip.url,
    targetRevision: target.expectedRevision,
    createdAt: Date.now(),
  }
}

export interface AgentAnimationEdit {
  clipId: string
  code: string
  sourceType: AnimationSourceType
}

const ANIMATION_FENCE = /```onestep-animation[ \t]*\r?\n([\s\S]*?)```/g

function sourceTypeOf(value: unknown, code: string): AnimationSourceType {
  const raw = String(value || '').toLowerCase()
  if (raw === 'html' || raw === 'htm') return 'html'
  if (raw === 'tsx' || raw === 'react-tsx') return 'tsx'
  if (raw === 'jsx' || raw === 'react' || raw === 'react-jsx') return 'jsx'
  if (/\b(?:interface|type)\s+[A-Z_$][\w$]*|:\s*(?:string|number|boolean)\b/.test(code) && /<[A-Z]/.test(code)) {
    return 'tsx'
  }
  if (!/<!doctype|<html|<style|<script/.test(code) && /<[A-Z]/.test(code)) return 'jsx'
  return 'html'
}

/** 只接受带明确目标的完整源码，避免把普通 HTML 示例误写进时间轴。 */
export function extractAgentAnimationEdits(content: string): AgentAnimationEdit[] {
  const edits: AgentAnimationEdit[] = []
  let match: RegExpExecArray | null
  ANIMATION_FENCE.lastIndex = 0
  while ((match = ANIMATION_FENCE.exec(content))) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const list = Array.isArray(parsed) ? parsed : parsed?.edits || [parsed]
      if (!Array.isArray(list)) continue
      for (const raw of list) {
        const clipId = String(raw?.clipId || raw?.id || '').trim()
        const code = typeof raw?.code === 'string'
          ? raw.code
          : typeof raw?.content === 'string'
            ? raw.content
            : ''
        if (!clipId || !code.trim()) continue
        edits.push({ clipId, code, sourceType: sourceTypeOf(raw?.sourceType || raw?.language, code) })
      }
    } catch {
      // 不完整或非法 JSON 不产生任何写入。
    }
  }
  return edits
}

export function stripAgentAnimationBlocks(content: string): string {
  return content
    .replace(/```onestep-animation[ \t]*\r?\n[\s\S]*?```/g, '')
    .replace(/```onestep-animation[\s\S]*$/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 选中素材以固定参考输入进入模型；视频绝不进入空参考的文生视频分支。 */
export function mediaReferenceForClip(clip: AgentClipRef): UploadedFile {
  if (!isEditableMediaClip(clip) || !clip.url) {
    throw new Error('选中片段缺少可读取的原始素材，请重新导入后再修改。')
  }
  return {
    name: clip.assetName || clip.name,
    type: clip.kind as 'image' | 'video',
    url: clip.url,
    size: 0,
    purpose: clip.kind === 'video' ? 'multimodal-video' : 'reference-image',
    refLabel: clip.kind === 'video' ? '视频1' : '图片1',
  }
}

/** 严格限定源码补丁的目标、数量和语言；任一目标不合法就不写入任何片段。 */
export function animationEditsForSelection(
  content: string,
  clips: AgentClipRef[],
): { edits: AgentAnimationEdit[]; error?: string } {
  const selected = new Map(clips.filter(isAnimationClip).map((clip) => [clip.id, clip]))
  const extracted = extractAgentAnimationEdits(content)
  if (!extracted.length) return { edits: [], error: '模型没有返回完整的代码动画源码补丁，请重试。' }
  if (extracted.some((edit) => !selected.has(edit.clipId))) {
    return { edits: [], error: '源码补丁包含未选中的片段，已拒绝写入。' }
  }
  const byId = new Map<string, AgentAnimationEdit>()
  for (const edit of extracted) {
    if (byId.has(edit.clipId)) return { edits: [], error: '同一片段返回了多份源码，已拒绝写入。' }
    const clip = selected.get(edit.clipId)
    if (clip?.codeLanguage && edit.sourceType !== clip.codeLanguage) {
      return { edits: [], error: `片段「${clip.name}」的源码语言发生变化，已拒绝写入。` }
    }
    byId.set(edit.clipId, edit)
  }
  if (byId.size !== selected.size || [...selected.keys()].some((id) => !byId.has(id))) {
    return { edits: [], error: '源码补丁没有覆盖全部选中片段，为避免部分修改，本次未写入。' }
  }
  return { edits: [...byId.values()] }
}

/** 代码动画使用独立协议，不能继承通用创作流程里的文生视频工具。 */
export function buildAnimationEditSystemPrompt(clips: AgentClipRef[]): string {
  const ids = clips.map((clip) => `${clip.id}（${clip.codeLanguage || 'html'}）`).join('、')
  return `你是 Stepframe 剪辑台的代码动画源码编辑器。本轮只允许修改这些选中片段：${ids}。

用户消息附有每段完整的原始 HTML / React 源码与修改意见。直接在原源码上做最小修改，保持原有结构、动画逻辑、依赖与时间轴语义，不要重做成图片或视频。

必须输出一个且仅一个 onestep-animation 代码块，内容为合法 JSON：
{"edits":[{"clipId":"选中片段id","sourceType":"html | jsx | tsx","code":"修改后的完整源码字符串"}]}

硬性规则：
- edits 必须恰好覆盖全部选中片段，每段一次；clipId 不得新增或替换。
- code 必须是可运行的完整源码，不是 diff、片段、说明或 Markdown。
- sourceType 必须与原片段一致。
- 不输出 onestep-tool、generate_video、generate_image、onestep-timeline 或 onestep-ask。
- 不改动未选中的任何片段。代码块前最多写一句简短说明，代码块后不要写内容。`
}
