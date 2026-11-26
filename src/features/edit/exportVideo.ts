import type { AudioBufferSource, CanvasSink } from 'mediabunny'
import type { EditProject, TimelineClip } from '@/types/edit'
import { projectDuration } from '@/stores/editProjectStore'
import { getMotionRenderJob, startMotionRender } from '@/api/motion'
import { clipOpacityAt, clipVolumeAt } from '@/features/edit/keyframes'

/**
 * mediabunny 只在真正导出时下载，避免剪辑台首屏多背几百 KB。
 */
type MediaBunny = typeof import('mediabunny')
let bunnyPromise: Promise<MediaBunny> | null = null

function loadBunny(): Promise<MediaBunny> {
  if (!bunnyPromise) bunnyPromise = import('mediabunny')
  return bunnyPromise
}

export interface ExportOptions {
  onProgress?: (ratio: number, note: string) => void
  signal?: AbortSignal
}

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  duration: number
  /** 音频混流失败时为 false，视频仍然可用。 */
  hasAudio: boolean
}

const SAMPLE_RATE = 48000

export function exportOutputSize(project: EditProject): { width: number; height: number } {
  const [rawW, rawH] = (project.aspectRatio || '16:9').split(':').map((value) => Number(value) || 1)
  const shortSide = project.resolution === '2K' ? 1440 : 768
  const scale = shortSide / Math.min(rawW, rawH)
  return {
    width: even(Math.round(rawW * scale)),
    height: even(Math.round(rawH * scale)),
  }
}

function even(value: number): number {
  return Math.max(2, value % 2 === 0 ? value : value + 1)
}

function blobFor(url: string): Promise<Blob> {
  return fetch(url).then((response) => response.blob())
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消导出', 'AbortError')
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(done, milliseconds)
    function done() {
      signal?.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted() {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      reject(new DOMException('已取消导出', 'AbortError'))
    }
    if (signal?.aborted) aborted()
    else signal?.addEventListener('abort', aborted, { once: true })
  })
}

async function renderMotionForExport(motionId: string, options: ExportOptions): Promise<string> {
  const jobId = await startMotionRender(motionId)
  for (;;) {
    throwIfAborted(options.signal)
    const job = await getMotionRenderJob(jobId)
    if (job.status === 'succeeded' && job.url) return job.url
    if (job.status === 'failed') throw new Error(job.error || '动效工程渲染失败')
    await abortableDelay(500, options.signal)
  }
}

/**
 * 浏览器画布无法直接读取 iframe 里的 HyperFrames 画面。导出前先用同一个
 * HyperFrames CLI 把动效渲染为 MP4，再只替换本次导出的快照；用户时间轴保持可编辑。
 */
async function materializeMotionClips(project: EditProject, options: ExportOptions): Promise<EditProject> {
  const motionIds = new Set<string>()
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== 'motion') continue
      if (!clip.motionId) throw new Error(`动效片段「${clip.name}」缺少工程 id，请重新添加后再导出`)
      motionIds.add(clip.motionId)
    }
  }
  if (!motionIds.size) return project

  const rendered = new Map<string, string>()
  let completed = 0
  for (const motionId of motionIds) {
    throwIfAborted(options.signal)
    options.onProgress?.(0.02, `渲染动效工程 ${completed + 1}/${motionIds.size}`)
    rendered.set(motionId, await renderMotionForExport(motionId, options))
    completed += 1
  }
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.kind === 'motion'
        ? { ...clip, kind: 'video' as const, url: rendered.get(clip.motionId || '') || clip.url }
        : clip),
    })),
  }
}

function assertExportableClips(project: EditProject) {
  const unsupported = project.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === 'animation')
  if (unsupported.length) {
    throw new Error(`「${unsupported[0].name}」等代码动画暂不支持整片导出，请先转为动效工程或移除，避免导出黑场`)
  }
}

interface FrameSource {
  clip: TimelineClip
  kind: 'video' | 'image'
  sink?: CanvasSink
  image?: CanvasImageSource
  /** 位图或 blob URL，导出结束后释放。 */
  dispose?: () => void
}

async function loadImage(url: string): Promise<{ image: CanvasImageSource; dispose: () => void } | null> {
  const blob = await blobFor(url)
  try {
    const bitmap = await createImageBitmap(blob)
    return { image: bitmap, dispose: () => bitmap.close() }
  } catch {
    // SVG 等格式 createImageBitmap 不支持，退回 <img>。
  }
  const objectUrl = URL.createObjectURL(blob)
  const element = new Image()
  element.decoding = 'sync'
  element.src = objectUrl
  try {
    await element.decode()
    return { image: element, dispose: () => URL.revokeObjectURL(objectUrl) }
  } catch {
    URL.revokeObjectURL(objectUrl)
    return null
  }
}

async function buildFrameSources(
  project: EditProject,
  width: number,
  height: number,
): Promise<FrameSource[]> {
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await loadBunny()
  const sources: FrameSource[] = []
  const sinkCache = new Map<string, Promise<CanvasSink | null>>()
  const bitmapCache = new Map<string, Promise<{ image: CanvasImageSource; dispose: () => void } | null>>()

  for (const track of project.tracks) {
    if (track.kind === 'audio') continue
    for (const clip of track.clips) {
      if (clip.kind === 'image') {
        let task = bitmapCache.get(clip.url)
        if (!task) {
          task = loadImage(clip.url).catch(() => null)
          bitmapCache.set(clip.url, task)
        }
        const loaded = await task
        if (loaded) sources.push({ clip, kind: 'image', image: loaded.image, dispose: loaded.dispose })
        continue
      }
      if (clip.kind !== 'video') continue
      let task = sinkCache.get(clip.url)
      if (!task) {
        task = (async () => {
          try {
            const blob = await blobFor(clip.url)
            const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
            const videoTrack = await input.getPrimaryVideoTrack()
            if (!videoTrack) return null
            return new CanvasSink(videoTrack, { width, height, fit: 'contain', poolSize: 2 })
          } catch {
            return null
          }
        })()
        sinkCache.set(clip.url, task)
      }
      const sink = await task
      if (sink) sources.push({ clip, kind: 'video', sink })
    }
  }
  const loadedIds = new Set(sources.map((source) => source.clip.id))
  const failed = project.tracks.flatMap((track) => track.clips).filter(
    (clip) => (clip.kind === 'image' || clip.kind === 'video') && !loadedIds.has(clip.id),
  )
  if (failed.length) {
    for (const source of sources) source.dispose?.()
    throw new Error(`无法读取素材「${failed[0].name}」，已停止导出以避免黑场`)
  }
  return sources
}

function isActive(clip: TimelineClip, time: number): boolean {
  return time >= clip.start - 0.0001 && time < clip.start + clip.duration
}

async function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  sources: FrameSource[],
): Promise<void> {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#0b0b0a'
  ctx.fillRect(0, 0, width, height)
  for (const source of sources) {
    if (!isActive(source.clip, time)) continue
    const alpha = clipOpacityAt(source.clip, time - source.clip.start)
    if (source.kind === 'image' && source.image) {
      ctx.globalAlpha = alpha
      const image = source.image as { width: number; height: number }
      const drawWidth = image.width
      const drawHeight = image.height
      if (!drawWidth || !drawHeight) continue
      const scale = Math.min(width / drawWidth, height / drawHeight)
      ctx.drawImage(
        source.image,
        (width - drawWidth * scale) / 2,
        (height - drawHeight * scale) / 2,
        drawWidth * scale,
        drawHeight * scale,
      )
      ctx.globalAlpha = 1
      continue
    }
    if (source.kind === 'video' && source.sink) {
      const local = (source.clip.trimStart || 0) + Math.max(0, time - source.clip.start)
      const wrapped = await source.sink.getCanvas(local)
      if (!wrapped) continue
      ctx.globalAlpha = alpha
      ctx.drawImage(wrapped.canvas as CanvasImageSource, 0, 0, width, height)
      ctx.globalAlpha = 1
    }
  }
}

let audioContext: OfflineAudioContext | null = null

function decodeContext(): OfflineAudioContext {
  if (!audioContext) audioContext = new OfflineAudioContext(2, 1, SAMPLE_RATE)
  return audioContext
}

/** 先把素材解码成 AudioBuffer；视频里的音轨走 mediabunny 兜底。 */
async function loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
  let blob: Blob
  try {
    blob = await blobFor(url)
  } catch {
    return null
  }
  const context = decodeContext()
  try {
    const bytes = await blob.arrayBuffer()
    return await context.decodeAudioData(bytes)
  } catch {
    // 视频容器里的音轨通常解不开，用 mediabunny 逐包取。
  }
  try {
    const { ALL_FORMATS, AudioBufferSink, BlobSource, Input } = await loadBunny()
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    const track = await input.getPrimaryAudioTrack()
    if (!track) return null
    const sink = new AudioBufferSink(track)
    const chunks: Array<{ buffer: AudioBuffer; timestamp: number }> = []
    for await (const wrapped of sink.buffers()) {
      chunks.push({ buffer: wrapped.buffer, timestamp: wrapped.timestamp })
    }
    if (!chunks.length) return null
    const duration = Math.max(...chunks.map((chunk) => chunk.timestamp + chunk.buffer.duration))
    const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE))
    const mixed = context.createBuffer(2, length, SAMPLE_RATE)
    for (const chunk of chunks) {
      const offset = Math.round(chunk.timestamp * SAMPLE_RATE)
      const sourceChannels = chunk.buffer.numberOfChannels
      for (let channel = 0; channel < 2; channel += 1) {
        const from = chunk.buffer.getChannelData(Math.min(channel, sourceChannels - 1))
        const to = mixed.getChannelData(channel)
        const count = Math.min(from.length, to.length - offset)
        if (count > 0) to.set(from.subarray(0, count), offset)
      }
    }
    return mixed
  } catch {
    return null
  }
}

async function mixAudio(
  project: EditProject,
  duration: number,
  options: ExportOptions,
): Promise<AudioBuffer | null> {
  const clips: Array<{ clip: TimelineClip; muted: boolean }> = []
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.kind === 'image' || clip.kind === 'animation') continue
      clips.push({ clip, muted: !!track.muted })
    }
  }
  if (!clips.length) return null

  const bufferCache = new Map<string, Promise<AudioBuffer | null>>()
  const usable: Array<{ clip: TimelineClip; buffer: AudioBuffer }> = []
  for (const item of clips) {
    if (item.muted) continue
    throwIfAborted(options.signal)
    let task = bufferCache.get(item.clip.url)
    if (!task) {
      task = loadAudioBuffer(item.clip.url)
      bufferCache.set(item.clip.url, task)
    }
    const buffer = await task
    if (buffer) usable.push({ clip: item.clip, buffer })
    options.onProgress?.(0.05, '准备音频')
  }
  if (!usable.length) return null

  const frames = Math.max(1, Math.ceil(duration * SAMPLE_RATE))
  const offline = new OfflineAudioContext(2, frames, SAMPLE_RATE)
  let scheduled = 0
  for (const { clip, buffer } of usable) {
    const offset = Math.max(0, clip.trimStart || 0)
    const playLength = Math.min(clip.duration, Math.max(0, buffer.duration - offset))
    if (playLength <= 0.01) continue
    const source = offline.createBufferSource()
    source.buffer = buffer
    const gain = offline.createGain()
    if (clip.volumeKeyframes?.length) {
      const count = Math.max(2, Math.ceil(playLength * 30) + 1)
      const curve = new Float32Array(count)
      for (let index = 0; index < count; index += 1) {
        curve[index] = clipVolumeAt(clip, (index / (count - 1)) * playLength)
      }
      gain.gain.setValueCurveAtTime(curve, Math.max(0, clip.start), playLength)
    } else {
      gain.gain.value = clipVolumeAt(clip, 0)
    }
    source.connect(gain)
    gain.connect(offline.destination)
    source.start(Math.max(0, clip.start), offset, playLength)
    scheduled += 1
  }
  if (!scheduled) return null
  return offline.startRendering()
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  project: EditProject,
  width: number,
  height: number,
  time: number,
) {
  const cue = (project.captions || []).find(
    (item) => time >= item.start && time < item.start + item.duration,
  )
  if (!cue?.text.trim()) return
  const fontSize = Math.max(20, Math.round(height * 0.045))
  const lineHeight = Math.round(fontSize * 1.4)
  const maxWidth = width * 0.84
  ctx.save()
  ctx.font = `600 ${fontSize}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineJoin = 'round'
  const lines: string[] = []
  for (const paragraph of cue.text.split('\n')) {
    let line = ''
    for (const character of paragraph) {
      const candidate = line + character
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = character
      } else line = candidate
    }
    lines.push(line)
  }
  const bottom = height * 0.92
  lines.forEach((line, index) => {
    const y = bottom - (lines.length - index - 1) * lineHeight
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.86)'
    ctx.lineWidth = Math.max(3, fontSize * 0.12)
    ctx.strokeText(line, width / 2, y, maxWidth)
    ctx.fillStyle = '#fff'
    ctx.fillText(line, width / 2, y, maxWidth)
  })
  ctx.restore()
}

export async function exportProjectVideo(
  project: EditProject,
  options: ExportOptions = {},
): Promise<ExportResult> {
  assertExportableClips(project)
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('当前浏览器不支持 WebCodecs，无法在本地导出视频')
  }
  const supported = await (await loadBunny()).canEncode('avc')
  if (!supported) throw new Error('当前浏览器没有可用的 H.264 编码器，无法导出 MP4')

  const exportProject = await materializeMotionClips(project, options)
  const duration = Math.max(1, projectDuration(exportProject))
  const fps = Math.max(12, Math.min(60, Math.round(exportProject.fps || 30)))
  const { width, height } = exportOutputSize(exportProject)
  const totalFrames = Math.max(1, Math.ceil(duration * fps))

  options.onProgress?.(0.04, '读取素材')
  const sources = await buildFrameSources(exportProject, width, height)
  throwIfAborted(options.signal)

  options.onProgress?.(0.06, '混合音频')
  let mixed: AudioBuffer | null = null
  try {
    mixed = await mixAudio(exportProject, duration, options)
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') throw error
    mixed = null
  }
  throwIfAborted(options.signal)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('无法创建导出画布')

  const { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output } = await loadBunny()
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const bitrate = Math.round(width * height * fps * 0.14)
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: Math.max(2_000_000, Math.min(24_000_000, bitrate)),
    keyFrameInterval: 1,
  })
  output.addVideoTrack(videoSource)

  let audioSource: AudioBufferSource | null = null
  if (mixed) {
    audioSource = new AudioBufferSource({ codec: 'aac', bitrate: 192_000 })
    output.addAudioTrack(audioSource)
  }

  try {
    await output.start()
    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        throwIfAborted(options.signal)
        const time = frame / fps
        await drawFrame(ctx, width, height, time, sources)
        drawCaption(ctx, exportProject, width, height, time)
        await videoSource.add(time, 1 / fps)
        if (frame % 6 === 0 || frame === totalFrames - 1) {
          options.onProgress?.(0.1 + (frame / totalFrames) * 0.85, `渲染 ${frame + 1}/${totalFrames} 帧`)
        }
      }
      if (audioSource && mixed) await audioSource.add(mixed)
      options.onProgress?.(0.97, '封装 MP4')
      await output.finalize()
    } catch (error) {
      await output.cancel().catch(() => {})
      throw error
    }

    const buffer = target.buffer
    if (!buffer) throw new Error('导出失败：没有拿到视频数据')
    options.onProgress?.(1, '完成')
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width,
      height,
      duration,
      hasAudio: !!mixed,
    }
  } finally {
    // 取消或失败时也要放掉位图和 blob URL，否则连续导出会越积越多。
    for (const source of sources) source.dispose?.()
  }
}

/** 独立重读最终 MP4，而不是把编码器自己的返回值当成校验结果。 */
export async function inspectExportedVideo(blob: Blob): Promise<{
  width?: number
  height?: number
  duration?: number
  hasAudio?: boolean
}> {
  const { ALL_FORMATS, BlobSource, Input } = await loadBunny()
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const [videoTrack, audioTrack, duration] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
      input.computeDuration(),
    ])
    return {
      width: videoTrack?.displayWidth,
      height: videoTrack?.displayHeight,
      duration,
      hasAudio: !!audioTrack,
    }
  } finally {
    input.dispose()
  }
}
