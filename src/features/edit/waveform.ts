/** 音频波形：一次解码 → 缓存峰值 → 任意缩放直接重绘，播放时不参与计算。 */

export interface AudioPeaks {
  /** 素材本身的时长（秒）。 */
  duration: number
  /** 每个桶的最大振幅（0-1），长度固定。 */
  peaks: Float32Array
}

const BUCKETS = 1400
const cache = new Map<string, Promise<AudioPeaks | null>>()
let decodeContext: OfflineAudioContext | null = null

function getDecodeContext(): OfflineAudioContext | null {
  if (typeof OfflineAudioContext === 'undefined') return null
  if (!decodeContext) decodeContext = new OfflineAudioContext(1, 1, 44100)
  return decodeContext
}

export function loadAudioPeaks(url: string): Promise<AudioPeaks | null> {
  const cached = cache.get(url)
  if (cached) return cached
  const task = computePeaks(url).catch(() => null)
  cache.set(url, task)
  return task
}

async function computePeaks(url: string): Promise<AudioPeaks | null> {
  const context = getDecodeContext()
  if (!context) return null
  const response = await fetch(url)
  if (!response.ok && !url.startsWith('data:')) return null
  const bytes = await response.arrayBuffer()
  if (!bytes.byteLength) return null
  const buffer = await context.decodeAudioData(bytes.slice(0))
  const channels = Math.min(2, buffer.numberOfChannels)
  const length = buffer.length
  const peaks = new Float32Array(BUCKETS)
  const step = Math.max(1, Math.floor(length / BUCKETS))
  for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
    const from = bucket * step
    const to = Math.min(length, from + step)
    let max = 0
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel)
      for (let index = from; index < to; index += 1) {
        const value = data[index] < 0 ? -data[index] : data[index]
        if (value > max) max = value
      }
    }
    peaks[bucket] = max
  }
  return { duration: buffer.duration, peaks }
}

/**
 * 把峰值画成波形。offset/span 是片段在素材里截取的那一段，
 * 所以裁切片段时波形会跟着变化，而不是整个素材的波形被拉伸。
 */
export function drawPeaks(
  canvas: HTMLCanvasElement,
  data: AudioPeaks,
  options: { offset: number; span: number; color: string },
): void {
  const width = Math.max(1, Math.round(canvas.clientWidth))
  const height = Math.max(1, Math.round(canvas.clientHeight))
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const { peaks, duration } = data
  if (!peaks.length || !duration) return
  const total = Math.max(0.001, options.span)
  const offset = Math.max(0, Math.min(duration, options.offset))
  const visible = Math.min(total, Math.max(0.01, duration - offset))
  const mid = height / 2

  ctx.fillStyle = options.color
  for (let x = 0; x < width; x += 2) {
    const from = offset + (x / width) * total
    const to = offset + ((x + 2) / width) * total
    let fromIndex = Math.floor((from / duration) * peaks.length)
    let toIndex = Math.ceil((to / duration) * peaks.length)
    fromIndex = Math.max(0, Math.min(peaks.length - 1, fromIndex))
    toIndex = Math.max(fromIndex + 1, Math.min(peaks.length, toIndex))
    let max = 0
    for (let index = fromIndex; index < toIndex; index += 1) {
      if (peaks[index] > max) max = peaks[index]
    }
    const amplitude = Math.max(0.6, max * (mid - 1))
    const faded = x / width > visible / total ? 0.35 : 1
    ctx.globalAlpha = faded
    ctx.fillRect(x, mid - amplitude, 1, amplitude * 2)
  }
  ctx.globalAlpha = 1
}
