import type { VideoGenerateRequest, VideoGenerateResponse } from '@/types/api'
import type { VideoProviderAdapter } from './types'

/**
 * Seedance 2 系列（Doubao-Seedance-2.0 / -fast / -mini / -2.5）与平台其余视频模型不同：
 * - 走火山「素材 + contents/generations/tasks」接口，而非通用 /videos/* 接口。
 * - 请求体使用 content 数组（text + reference_image），并单独查询任务。
 * - 仅 AI Ping 白名单账号生成的 API Key 才能成功调用，否则上游返回鉴权类报错。
 * 详见 seedance2.0 api 文档说明（最新版）。
 */

// contents/generations 任务接口（相对 /api/v1，与 axios baseURL 拼接）。
export const SEEDANCE_TASKS_ENDPOINT = '/multimodal/sd/videos/contents/generations/tasks'
// 素材接口：保留用于排查/对接历史版本；当前主流程直接使用公网 URL，避免网关素材查询异常。
export const SEEDANCE_ASSETS_ENDPOINT = '/multimodal/sd/assets?Action=CreateAsset&Version=2024-01-01'

// Seedance 2 系列模型名称（同属「seedance 2 系列」分组）。
export const SEEDANCE_2_MODEL_IDS = [
  'Doubao-Seedance-2.0',
  'Doubao-Seedance-2.0-fast',
  'Doubao-Seedance-2.0-mini',
  'Doubao-Seedance-2.5',
] as const

export type Seedance2ModelId = (typeof SEEDANCE_2_MODEL_IDS)[number]

/**
 * Seedance 分辨率遵循火山方舟强校验规则：2.0 / 2.5 支持 1080p 与 4k，
 * Fast / Mini 仅支持 480p / 720p。缺省或不合法档位回退到官方默认 720p。
 */
export function resolveSeedanceResolution(modelId: string, requested?: string | null): string {
  const normalized = requested?.trim().toLowerCase() || ''
  const isFastOrMini = /doubao-seedance-2\.0-(?:fast|mini)$/i.test(modelId)
  const options = isFastOrMini ? ['480p', '720p'] : ['480p', '720p', '1080p', '4k']
  return options.includes(normalized) ? normalized : '720p'
}

export function isSeedance2ModelId(modelId: string | null | undefined): boolean {
  if (!modelId) return false
  const normalized = modelId.toLowerCase()
  return SEEDANCE_2_MODEL_IDS.some((id) => id.toLowerCase() === normalized)
}

/**
 * 从视频请求参数中收集所有可作为「参考图」的图片地址（URL 或 base64 dataURI）。
 * Seedance 2.0 支持传入多张参考图，这里做去重后按顺序返回。
 */
export function collectSeedanceReferenceImages(params: VideoGenerateRequest): string[] {
  const images: string[] = []
  const push = (value?: string | null) => {
    if (typeof value === 'string' && value.trim()) images.push(value.trim())
  }

  if (Array.isArray(params.images)) params.images.forEach(push)
  if (Array.isArray(params.reference_images)) params.reference_images.forEach(push)
  push(params.image)
  push(params.image_url)
  push(params.img_url)
  push(params.first_frame_image)
  push(params.first_frame_url)
  push(params.last_frame_image)
  push(params.last_frame_url)
  push(params.start_image)
  push(params.end_image)

  return Array.from(new Set(images))
}

/** 收集多模态参考视频地址（去重、按顺序）。 */
export function collectSeedanceReferenceVideos(params: VideoGenerateRequest): string[] {
  const videos: string[] = []
  if (Array.isArray(params.reference_videos)) {
    params.reference_videos.forEach((value) => {
      if (typeof value === 'string' && value.trim()) videos.push(value.trim())
    })
  }
  return Array.from(new Set(videos))
}

/** 收集多模态参考音频地址（去重、按顺序）。 */
export function collectSeedanceReferenceAudios(params: VideoGenerateRequest): string[] {
  const audios: string[] = []
  if (Array.isArray(params.reference_audios)) {
    params.reference_audios.forEach((value) => {
      if (typeof value === 'string' && value.trim()) audios.push(value.trim())
    })
  }
  return Array.from(new Set(audios))
}

export interface SeedanceReferenceAssets {
  images?: string[]
  videos?: string[]
  audios?: string[]
}

/**
 * 把多模态参考素材（图片 / 视频 / 音频）转换成 Seedance content 数组。
 * urls 必须是可直接公网访问的 http/https 地址。
 * 顺序：text → 图片 → 视频 → 音频，与官方示例一致。
 */
export function buildSeedanceContent(
  prompt: string,
  references: string[] | SeedanceReferenceAssets
): Array<Record<string, unknown>> {
  const normalized: SeedanceReferenceAssets = Array.isArray(references)
    ? { images: references }
    : references
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]

  for (const url of normalized.images || []) {
    content.push({ type: 'image_url', role: 'reference_image', image_url: { url } })
  }
  for (const url of normalized.videos || []) {
    content.push({ type: 'video_url', role: 'reference_video', video_url: { url } })
  }
  for (const url of normalized.audios || []) {
    content.push({ type: 'audio_url', role: 'reference_audio', audio_url: { url } })
  }
  return content
}

/**
 * 同步构造请求体（适配器兜底路径）。主流程在 aiping.ts 中会先把本地 base64
 * 参考图换成公网 URL，再复用同样的字段结构。
 */
export function buildSeedanceRequestBody(params: VideoGenerateRequest, canonicalModel: string): Record<string, unknown> {
  const referenceImages = collectSeedanceReferenceImages(params)
  const referenceVideos = collectSeedanceReferenceVideos(params)
  const referenceAudios = collectSeedanceReferenceAudios(params)
  return {
    model: params.model || canonicalModel,
    content: buildSeedanceContent(params.prompt, {
      images: referenceImages,
      videos: referenceVideos,
      audios: referenceAudios,
    }),
    generate_audio: typeof params.audio === 'boolean' ? params.audio : true,
    resolution: resolveSeedanceResolution(params.model || canonicalModel, params.resolution),
    ratio: params.aspect_ratio || params.ratio || '16:9',
    duration: params.duration || params.seconds || 5,
    watermark: typeof params.watermark === 'boolean' ? params.watermark : false,
  }
}


export function getSeedanceEndpoint(): string {
  return SEEDANCE_TASKS_ENDPOINT
}

/**
 * 归一化「创建任务」响应：Seedance 返回 { id, model, status, content?.video_url, ... }。
 */
export function normalizeSeedanceResponse(data: any): VideoGenerateResponse {
  const videoUrl = data?.content?.video_url || data?.video_url
  const createdAt = typeof data?.created_at === 'number' ? data.created_at : Math.floor(Date.now() / 1000)
  return {
    ...data,
    id: data?.id || data?.task_id || '',
    task_id: data?.id || data?.task_id || '',
    object: 'video.generation',
    created: createdAt,
    status: data?.status || 'queued',
    provider: 'seedance',
    model: data?.model,
    ...(videoUrl ? { video_url: videoUrl } : {}),
  } as VideoGenerateResponse
}

export function createSeedanceProvider(canonicalModel: Seedance2ModelId): VideoProviderAdapter {
  return {
    provider: 'seedance',
    models: [canonicalModel],
    buildRequestBody: (params) => buildSeedanceRequestBody(params, canonicalModel),
    getEndpoint: getSeedanceEndpoint,
    normalizeResponse: normalizeSeedanceResponse,
  }
}
