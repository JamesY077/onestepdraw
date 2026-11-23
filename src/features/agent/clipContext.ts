/**
 * 选中片段的上下文：把用户选中的时间轴片段变成一段可读、可定位的说明。
 * 有选中片段时，模型只需要理解这几段，不再把整条时间轴当作修改对象。
 */
import type { AgentClipRef } from '@/types/agent'

const KIND_LABEL: Record<AgentClipRef['kind'], string> = {
  video: '视频',
  image: '图片',
  audio: '音频',
}

function seconds(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  return `${safe.toFixed(1)}s`
}

function percent(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

export function clipTimeRange(clip: Pick<AgentClipRef, 'start' | 'duration'>): string {
  return `${seconds(clip.start)} → ${seconds(clip.start + clip.duration)}`
}

function clipLine(clip: AgentClipRef, index: number): string {
  const details = [
    `id=${clip.id}`,
    `「${clip.name}」`,
    KIND_LABEL[clip.kind] || clip.kind,
    `轨道 ${clip.trackName}`,
    clipTimeRange(clip),
    `时长 ${seconds(clip.duration)}`,
  ]
  if (clip.assetName) details.push(`素材 ${clip.assetName}`)
  const volume = percent(clip.volume)
  if (volume) details.push(`音量 ${volume}`)
  const opacity = percent(clip.opacity)
  if (opacity) details.push(`不透明度 ${opacity}`)
  return `${index + 1}. ${details.join('｜')}`
}

function clipNoteLine(clip: AgentClipRef): string {
  const note = typeof clip.note === 'string' ? clip.note.replace(/\s+/g, ' ').trim() : ''
  return note ? `   修改意见：${note}` : ''
}

/** 追加到用户消息后面的选中片段清单；没有选中片段时返回空字符串。 */
export function describeClipContext(clips?: AgentClipRef[]): string {
  if (!clips?.length) return ''
  const lines = [
    `[选中片段 · 只改这些] 用户在本轮选中了 ${clips.length} 个片段，请只针对下面的片段回答和修改；`,
    '不要改动未选中的片段，也不需要重做整支片。带「修改意见」的片段优先按那条意见处理，',
    '每条修改意见只作用于它所属的片段。需要移动 / 裁剪 / 删除 / 调音量时，',
    '继续使用 onestep-timeline 操作块，clipId 必须使用下面的 id：',
    ...clips.flatMap((clip, index) => {
      const note = clipNoteLine(clip)
      return note ? [clipLine(clip, index), note] : [clipLine(clip, index)]
    }),
  ]
  return lines.join('\n')
}

/** 选中片段里可以给模型看的图：图片片段用原图，视频片段用封面，最多 6 张。 */
export function collectClipImages(clips?: AgentClipRef[]): string[] {
  if (!clips?.length) return []
  const urls: string[] = []
  for (const clip of clips) {
    if (clip.thumbnail) urls.push(clip.thumbnail)
    else if (clip.kind === 'image' && clip.url) urls.push(clip.url)
  }
  return [...new Set(urls)].slice(0, 6)
}

/** 写进本地存储前收敛体积：长 data URL 只保留封面。 */
export function persistableClip(clip: AgentClipRef): AgentClipRef {
  const next: AgentClipRef = { ...clip }
  if (next.url?.startsWith('data:') && next.url.length > 380_000) next.url = ''
  if (next.url?.startsWith('blob:')) next.url = ''
  if (next.thumbnail?.startsWith('data:') && next.thumbnail.length > 380_000) {
    next.thumbnail = ''
  }
  return next
}
