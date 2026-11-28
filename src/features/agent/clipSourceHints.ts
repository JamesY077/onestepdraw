/**
 * 点选元素 → 源码位置。
 *
 * 预览里选中的元素只有 selector 时，模型往往要先整份读取工程才能动手；
 * 长工程来回读几遍就是几十分钟。发送前在本地把元素所在的行号和原文片段补进上下文，
 * 模型可以直接用 write_motion_project 的 patch 改这一段。
 */
import type { AgentClipRef } from '@/types/agent'
import { readMotionFile } from '@/api/motion'
import {
  elementSnippet,
  locateMotionElement,
} from '@/features/edit/motionSourceEdit'

const MAX_ELEMENTS = 12
const MAX_SNIPPET = 1_100

export async function withMotionSourceHints(clips?: AgentClipRef[]): Promise<AgentClipRef[] | undefined> {
  if (!clips?.length) return clips
  const targets = clips.filter((clip) => clip.kind === 'motion' && clip.motionId && clip.motionElements?.length)
  if (!targets.length) return clips

  const sources = new Map<string, string>()
  await Promise.all(targets.map(async (clip) => {
    const id = clip.motionId!
    if (sources.has(id)) return
    try {
      sources.set(id, await readMotionFile(id))
    } catch {
      // 读取失败时保留原上下文，模型仍可自己读取工程。
      sources.set(id, '')
    }
  }))

  return clips.map((clip) => {
    if (!clip.motionId || !clip.motionElements?.length) return clip
    const source = sources.get(clip.motionId) || ''
    if (!source) return clip
    const motionElements = clip.motionElements.slice(0, MAX_ELEMENTS).map((element) => {
      const location = locateMotionElement(source, element)
      if (!location) return element
      return {
        ...element,
        sourceLine: location.line,
        sourceExcerpt: elementSnippet(source, location, MAX_SNIPPET),
      }
    })
    return { ...clip, motionElements }
  })
}
