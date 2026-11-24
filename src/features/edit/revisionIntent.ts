import type { EditProject, TimelineClip } from '@/types/edit'

/**
 * 剪辑区对话的意图识别。
 *
 * 用户在剪辑区说的多半是「对现在这支片的修改意见」，
 * 常见说法会带时间范围（第 3 秒到第 6 秒 / 3-6s / 00:03-00:06 / 开头两秒）。
 * 这里把时间范围解析出来，再映射到项目里真正存在的片段，
 * 交给模型时就是具体 clipId 与秒数，而不是一句模糊的话。
 */

export interface TimeRange {
  start: number
  end: number
  /** 原文片段，方便回显给用户确认。 */
  raw: string
}

/** 把 m:ss / mm:ss / ss 解析成秒。 */
function parseClock(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length === 2) {
    const minutes = Number(parts[0])
    const seconds = Number(parts[1])
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return minutes * 60 + seconds
  }
  const seconds = Number(trimmed)
  return Number.isFinite(seconds) ? seconds : null
}

const RANGE_PATTERNS: RegExp[] = [
  // 第3秒到第6秒 / 从第3秒到第6秒
  /第\s*(\d+(?::\d+)?)\s*秒?\s*(?:到|至|-|~|—)\s*第?\s*(\d+(?::\d+)?)\s*秒/g,
  // 3-6秒 / 3s-6s / 00:03-00:06
  /(\d+(?::\d{1,2}(?:\.\d+)?)?)\s*(?:秒|s)?\s*(?:到|至|-|~|—)\s*(\d+(?::\d{1,2}(?:\.\d+)?)?)\s*(?:秒|s)/g,
]

/** 开头/结尾的说法，按项目总时长换算。 */
function parseRelative(text: string, total: number): TimeRange[] {
  const ranges: TimeRange[] = []
  const head = /(?:开头|前)\s*(\d+(?:\.\d+)?)\s*秒/.exec(text)
  if (head) {
    const end = Math.min(total, Number(head[1]))
    if (Number.isFinite(end) && end > 0) ranges.push({ start: 0, end, raw: head[0] })
  }
  const tail = /(?:最后|结尾)\s*(\d+(?:\.\d+)?)\s*秒/.exec(text)
  if (tail) {
    const duration = Math.min(total, Number(tail[1]))
    if (Number.isFinite(duration) && duration > 0) {
      ranges.push({ start: Math.max(0, total - duration), end: total, raw: tail[0] })
    }
  }
  return ranges
}

export function parseTimeRanges(text: string, totalSeconds: number): TimeRange[] {
  const found: TimeRange[] = []
  for (const pattern of RANGE_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const start = parseClock(match[1])
      const end = parseClock(match[2])
      if (start === null || end === null) continue
      if (end <= start) continue
      found.push({ start, end, raw: match[0] })
    }
  }
  found.push(...parseRelative(text, totalSeconds))
  // 同一段话里重复命中时按起点去重
  const seen = new Set<string>()
  return found.filter((range) => {
    const key = `${range.start}-${range.end}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface RevisionTarget {
  clip: TimelineClip
  /** 这段意见落在片段内部的哪一段。 */
  innerStart: number
  innerEnd: number
}

/** 找出与时间范围有交集的片段，并把范围裁到片段内部。 */
export function resolveRevisionTargets(project: EditProject | null, ranges: TimeRange[]): RevisionTarget[] {
  if (!project || !ranges.length) return []
  const targets: RevisionTarget[] = []
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipStart = clip.start
      const clipEnd = clip.start + clip.duration
      for (const range of ranges) {
        const start = Math.max(range.start, clipStart)
        const end = Math.min(range.end, clipEnd)
        if (end - start <= 0.01) continue
        targets.push({ clip, innerStart: start - clipStart, innerEnd: end - clipStart })
      }
    }
  }
  return targets
}

/** 给模型看的时间范围说明。 */
export function describeRanges(ranges: TimeRange[]): string {
  if (!ranges.length) return ''
  return ranges.map((range) => `${range.start.toFixed(1)}s–${range.end.toFixed(1)}s`).join('、')
}
