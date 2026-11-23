import type { EditProject } from '@/types/edit'

/** 吸附候选点：片段边缘、播放头、0 秒。 */
export function collectSnapTargets(
  project: EditProject,
  options: { excludeClipId?: string; playhead?: number } = {},
): number[] {
  const targets = new Set<number>([0])
  if (Number.isFinite(options.playhead)) targets.add(Math.max(0, options.playhead as number))
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === options.excludeClipId) continue
      targets.add(round(clip.start))
      targets.add(round(clip.start + clip.duration))
    }
  }
  targets.delete(Number.NaN)
  return [...targets].sort((a, b) => a - b)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function nearest(targets: number[], value: number, threshold: number): number | null {
  // targets 已排序，二分找到最近的三个候选即可。
  if (!targets.length) return null
  let low = 0
  let high = targets.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (targets[mid] < value) low = mid + 1
    else high = mid
  }
  let best: number | null = null
  let bestDistance = threshold
  for (const index of [low - 1, low, low + 1]) {
    if (index < 0 || index >= targets.length) continue
    const distance = Math.abs(targets[index] - value)
    if (distance <= bestDistance) {
      best = targets[index]
      bestDistance = distance
    }
  }
  return best
}

export interface SnapResult {
  start: number
  duration: number
  /** 命中的吸附时间点，用来画吸附参考线；没有命中时为 null。 */
  guide: number | null
}

const DEFAULT_THRESHOLD_PX = 9

/**
 * 边缘吸附：起点和终点都尝试贴到候选点上，取位移更小的那个。
 * 阈值按像素算，所以放大后吸附更精确、缩小后不会乱粘。
 */
export function resolveSnap(
  start: number,
  duration: number,
  targets: number[],
  pxPerSec: number,
  options: { mode?: 'move' | 'left' | 'right'; thresholdPx?: number } = {},
): SnapResult {
  const threshold = (options.thresholdPx ?? DEFAULT_THRESHOLD_PX) / Math.max(1, pxPerSec)
  const mode = options.mode || 'move'

  if (mode === 'left') {
    const hit = nearest(targets, start, threshold)
    if (hit === null) return { start, duration, guide: null }
    const nextStart = Math.max(0, Math.min(start + duration - 0.4, hit))
    return { start: nextStart, duration: duration + (start - nextStart), guide: hit }
  }

  if (mode === 'right') {
    const end = start + duration
    const hit = nearest(targets, end, threshold)
    if (hit === null) return { start, duration, guide: null }
    return { start, duration: Math.max(0.4, hit - start), guide: hit }
  }

  const startHit = nearest(targets, start, threshold)
  const endHit = nearest(targets, start + duration, threshold)
  if (startHit === null && endHit === null) return { start, duration, guide: null }
  const startDistance = startHit === null ? Number.POSITIVE_INFINITY : Math.abs(startHit - start)
  const endDistance = endHit === null ? Number.POSITIVE_INFINITY : Math.abs(endHit - (start + duration))
  if (startDistance <= endDistance && startHit !== null) {
    return { start: Math.max(0, startHit), duration, guide: startHit }
  }
  const nextStart = Math.max(0, (endHit as number) - duration)
  return { start: nextStart, duration, guide: endHit }
}
