import type { ClipKeyframe, KeyframeEasing, TimelineClip } from '@/types/edit'

export function easedProgress(progress: number, easing: KeyframeEasing): number {
  const t = Math.max(0, Math.min(1, progress))
  if (easing === 'ease-in') return t * t
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t)
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
  return t
}

export function sampleKeyframes(
  keyframes: ClipKeyframe[] | undefined,
  time: number,
  fallback: number,
): number {
  if (!keyframes?.length) return fallback
  const points = [...keyframes].sort((a, b) => a.time - b.time)
  if (time <= points[0].time) return points[0].value
  const last = points[points.length - 1]
  if (time >= last.time) return last.value
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (time < from.time || time > to.time) continue
    const span = Math.max(0.0001, to.time - from.time)
    const progress = easedProgress((time - from.time) / span, from.easing)
    return from.value + (to.value - from.value) * progress
  }
  return fallback
}

export function clipOpacityAt(clip: TimelineClip, localTime: number): number {
  return sampleKeyframes(clip.opacityKeyframes, localTime, clip.opacity ?? 1)
}

export function clipVolumeAt(clip: TimelineClip, localTime: number): number {
  return sampleKeyframes(clip.volumeKeyframes, localTime, clip.volume ?? 1)
}
