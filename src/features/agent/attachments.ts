import type { AgentAttachment, AgentAttachmentKind } from '@/types/agent'
import { getAudioDurationMs } from '@/features/voice/audio'

/** 一轮消息最多带 8 个参考素材。 */
export const MAX_ATTACHMENTS = 8
/** 单个参考素材的兜底上限：2GB，实际只受磁盘空间限制。 */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_ATTACHMENT_LABEL = '2GB'
/** 文本类文件最多读取这么多字符，避免把提示词撑爆。 */
const MAX_TEXT_CHARS = 16_000
/** 视频最多抽 4 张关键帧。 */
const VIDEO_FRAME_TIMES = [0.08, 0.36, 0.64, 0.92]
/** 送进模型前把图片压到这个尺寸以内。 */
const MODEL_IMAGE_MAX_SIDE = 1280

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'srt', 'vtt',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'ts', 'tsx',
  'jsx', 'vue', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'sh', 'zsh',
  'yaml', 'yml', 'toml', 'ini', 'xml', 'svg', 'sql', 'log',
])

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function classifyAttachment(file: File): AgentAttachmentKind {
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  const ext = extensionOf(file.name)
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'heic', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'].includes(ext)) return 'audio'
  return 'file'
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(value?: number): string {
  if (!value || !Number.isFinite(value)) return ''
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `att_${crypto.randomUUID()}`
  }
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

async function canvasToDataUrl(source: CanvasImageSource, width: number, height: number, quality = 0.86) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      // 回退到 <img>。
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight })
      // 图片元素会持有 object URL，等绘制完再回收不现实，这里交给浏览器。
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

/** 压缩图片，返回可直接展示 / 送进模型的 data URL。 */
export async function compressImage(file: Blob, maxSide = MODEL_IMAGE_MAX_SIDE): Promise<{
  dataUrl: string
  width: number
  height: number
}> {
  const decoded = await decodeImage(file)
  if (!decoded) return { dataUrl: '', width: 0, height: 0 }
  const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))
  const dataUrl = await canvasToDataUrl(decoded.source, width, height)
  return { dataUrl, width, height }
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => reject(new Error('读取视频超时')), 12_000)
    video.onloadedmetadata = () => {
      window.clearTimeout(timer)
      resolve(video)
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('浏览器无法解码这个视频'))
    }
    video.src = url
  })
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) return
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => resolve(), 3000)
    const done = () => {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done)
    try {
      video.currentTime = time
    } catch {
      done()
    }
  })
}

/** 抽取视频关键帧与尺寸；失败时返回空数组，但仍然保留文件引用。 */
async function readVideo(file: File): Promise<{
  duration: number
  width: number
  height: number
  frames: string[]
}> {
  const url = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null
  try {
    video = await loadVideo(url)
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const width = video.videoWidth
    const height = video.videoHeight
    const frames: string[] = []
    if (duration > 0 && width > 0) {
      const scale = Math.min(1, MODEL_IMAGE_MAX_SIDE / Math.max(width, height))
      for (const ratio of VIDEO_FRAME_TIMES) {
        await seekVideo(video, Math.min(duration - 0.05, Math.max(0, duration * ratio)))
        const frame = await canvasToDataUrl(video, width * scale, height * scale, 0.8)
        if (frame) frames.push(frame)
      }
    }
    return { duration, width, height, frames }
  } catch {
    return { duration: 0, width: 0, height: 0, frames: [] }
  } finally {
    video?.removeAttribute('src')
    video?.load()
    URL.revokeObjectURL(url)
  }
}

async function readText(file: File): Promise<string> {
  const ext = extensionOf(file.name)
  const mime = (file.type || '').toLowerCase()
  const isText = mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || TEXT_EXTENSIONS.has(ext)
  if (!isText) return ''
  try {
    const text = await file.text()
    return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…（已截断）` : text
  } catch {
    return ''
  }
}

/** 参考素材上传到本地服务，返回可长期访问的地址与绝对路径。 */
export async function uploadAttachment(file: File): Promise<{ url: string; path: string } | null> {
  try {
    const response = await fetch('/local/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    if (!payload || typeof payload.url !== 'string') return null
    return {
      url: payload.url,
      path: typeof payload.path === 'string' ? payload.path : '',
    }
  } catch {
    return null
  }
}

/** 把用户选中的文件读成统一的参考素材。 */
export async function readAttachment(file: File): Promise<AgentAttachment> {
  const kind = classifyAttachment(file)
  const uploaded = await uploadAttachment(file)
  const attachment: AgentAttachment = {
    id: makeId(),
    kind,
    name: file.name || `${kind}-${Date.now()}`,
    mime: file.type || '',
    size: file.size,
    url: uploaded?.url || '',
    path: uploaded?.path || undefined,
    createdAt: Date.now(),
  }

  if (kind === 'image') {
    const compressed = await compressImage(file)
    // 上传成功时用本地服务地址展示原图；失败时退回压缩后的 data URL，保证当前会话可用。
    attachment.url = uploaded?.url || compressed.dataUrl
    attachment.width = compressed.width
    attachment.height = compressed.height
  } else if (kind === 'video') {
    const video = await readVideo(file)
    attachment.duration = video.duration
    attachment.width = video.width
    attachment.height = video.height
    attachment.frames = video.frames
    if (!uploaded) attachment.url = URL.createObjectURL(file)
  } else if (kind === 'audio') {
    attachment.duration = (await getAudioDurationMs(file)) / 1000
    if (!uploaded) attachment.url = URL.createObjectURL(file)
  } else {
    attachment.text = await readText(file)
    if (!uploaded && attachment.text) attachment.url = await fileToDataUrl(file)
    else if (!uploaded) attachment.url = URL.createObjectURL(file)
  }

  return attachment
}

/** 一条素材的中文标签。 */
export function attachmentKindLabel(kind: AgentAttachmentKind): string {
  if (kind === 'image') return '参考图'
  if (kind === 'video') return '参考视频'
  if (kind === 'audio') return '参考音频'
  return '参考文件'
}

/** 给模型看的素材清单；本机 Agent 额外拿到绝对路径。 */
export function describeAttachments(
  attachments: AgentAttachment[] | undefined,
  options: { includePaths?: boolean; mentionable?: boolean } = {},
): string {
  if (!attachments?.length) return ''
  const lines = attachments.map((item, index) => {
    const label = `${attachmentKindLabel(item.kind)} ${index + 1}`
    const meta: string[] = []
    if (item.width && item.height) meta.push(`${item.width}×${item.height}`)
    if (item.duration) meta.push(`${formatDuration(item.duration)}`)
    if (item.size) meta.push(formatBytes(item.size))
    if (item.kind === 'video' && item.frames?.length) meta.push(`已抽取 ${item.frames.length} 张关键帧`)
    const head = `- ${label}：${item.name}（${meta.join('，') || '文件'}）`
    const sourceLine = item.url.startsWith('/generated/uploads/')
      ? `\n  动效素材地址：${item.url}（动画模式用 import_motion_asset 导入，不要重新生成）`
      : ''
    const pathLine = options.includePaths && item.path ? `\n  本机路径：${item.path}` : ''
    const textLine = item.text ? `\n  文件内容：\n${item.text}` : ''
    return `${head}${sourceLine}${pathLine}${textLine}`
  })
  const mentionLine = options.mentionable
    ? '\n消息里的 @素材1、@素材2 … 依次指下面清单的第 1、2 … 项；不要把它们当成新文件。'
    : ''
  return `\n\n[用户上传的参考素材]${mentionLine}\n${lines.join('\n')}`
}

type TemplateLike = { name: string; category: string; guide: string; images: string[] }

/** 模板参考说明，放在用户消息后面一起交给模型；引用多个时逐条列出来。 */
export function describeTemplates(templates: TemplateLike[] | undefined | null): string {
  if (!templates?.length) return ''
  const note = '\n消息里的 @模板1、@模板2 … 依次指下面第 1、2 … 个模板。'
  return note + templates
    .map((template, index) => {
      const label = `模板 ${index + 1}`
      const images = template.images.length
        ? `\n参考图：${template.images.length} 张（已随消息附带）`
        : ''
      return `\n\n[已应用${label}] ${template.name} · ${template.category}\n${template.guide.trim()}${images}`
    })
    .join('')
}

/** 模板组里的参考素材清单；组里的附件也要一起交给模型。 */
export function templateAssets(templates: { assets?: AgentAttachment[] }[] | undefined | null): AgentAttachment[] {
  if (!templates?.length) return []
  return templates.flatMap((template) => template.assets || [])
}

/** 本轮可送进模型查看的图片：图片素材 + 视频关键帧 + 模板参考图。 */
export function collectAttachmentImages(
  attachments: AgentAttachment[] | undefined,
  templates?: { images: string[] }[] | null,
): string[] {
  const urls: string[] = []
  for (const item of attachments || []) {
    if (item.kind === 'image' && item.url) urls.push(item.url)
    if (item.kind === 'video' && item.frames?.length) urls.push(...item.frames)
  }
  for (const template of templates || []) {
    if (template.images?.length) urls.push(...template.images)
  }
  return [...new Set(urls)].slice(0, 10)
}

/** 把任意图片地址转成可发给远端模型的 data URL（只压缩一次）。 */
const modelImageCache = new Map<string, string>()

export async function toModelImage(url: string): Promise<string> {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  const cached = modelImageCache.get(url)
  if (cached) return cached
  try {
    const response = await fetch(url)
    if (!response.ok) return ''
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return ''
    const compressed = await compressImage(blob, 1024)
    if (compressed.dataUrl) {
      // 一次对话里反复发送同一批参考图时不必重复解码压缩。
      if (modelImageCache.size >= 24) {
        const oldest = modelImageCache.keys().next().value
        if (oldest) modelImageCache.delete(oldest)
      }
      modelImageCache.set(url, compressed.dataUrl)
    }
    return compressed.dataUrl
  } catch {
    return ''
  }
}

/** 写入 localStorage 前收敛体积：blob 地址失效、过大的 data URL 只保留首帧。 */
export function persistableAttachment(item: AgentAttachment): AgentAttachment {
  const next: AgentAttachment = {
    ...item,
    // 历史消息只需要一张封面，保留全部关键帧会让 8 个视频轻易撑爆本地存储。
    frames: item.frames?.length ? item.frames.slice(0, 1) : undefined,
  }
  if (next.text && next.text.length > 4_000) {
    next.text = `${next.text.slice(0, 4_000)}\n…（已截断）`
  }
  if (next.url.startsWith('blob:')) next.url = next.frames?.[0] || ''
  if (next.url.startsWith('data:') && next.url.length > 380_000) {
    next.url = next.kind === 'video' ? next.frames?.[0] || '' : ''
  }
  return next
}
