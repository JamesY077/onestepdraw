import type { VideoGenerationMode } from '@/types/model'
import type { MossLayout } from '@/types/layout'

export type MessageType = 'system' | 'user' | 'assistant'

export type GenerateStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed'

export type GenerateType = 'image' | 'video'

/** 图片生成方式：扩图（expand）固定走原图向外延展链路。 */
export type ImageGenerationMode = 'text2image' | 'image2image' | 'expand'

export interface GenerateResult {
  type: GenerateType
  url: string
  model: string
  provider?: string
  cost: number
  costText?: string
  aspectRatio?: string
  createdAt?: number
  thumbnail?: string
  duration?: number
  size?: {
    width: number
    height: number
  }
  /** Moss 分层布局：仅该模型生成的图片会携带，用于打开图层编辑器。 */
  layout?: MossLayout
  /** 用户开启了分层布局，但本次未能规划出可编辑图层，已按普通图片正常输出。 */
  layoutSkipped?: boolean
}

export interface Message {
  id: string
  type: MessageType
  content: string
  timestamp: number
  generateType?: GenerateType
  generateStatus?: GenerateStatus
  generateResult?: GenerateResult
  /** 批量生成结果；批量模式下可能有多条，单条时通常只有一项。 */
  generateResults?: GenerateResult[]
  /** 用户发起本轮生成时选择的单轮生成数量（1-5）。 */
  batchSize?: number
  /** 批量生成出现部分失败时，用于展示的提示信息。 */
  partialError?: string
  error?: string
  progress?: number
  uploadedFile?: UploadedFile
  uploadedFiles?: UploadedFile[]
  duration?: number
  aspectRatio?: string
  model?: string
  /** 用户发起本轮生成时选择的图片生成方式；扩图消息用于重新生成。 */
  imageMode?: ImageGenerationMode
  /** 用户发起本轮生成时选择的视频生成方式；重新生成时沿用（如 Seedance 编辑视频）。 */
  videoMode?: VideoGenerationMode
  /** 本轮视频生成使用的分辨率档位；历史重生成时沿用。 */
  videoResolution?: string
  /** MiniMax H3 Image 本轮使用的 1K / 2K / 4K 档位。 */
  imageResolution?: string
  /** 本轮图片生成使用的 Moss 分层布局；重生成与图层编辑沿用。 */
  layout?: MossLayout
}

export interface MotionControlOptions {
  keep_original_sound: 'yes' | 'no'
  character_orientation: 'image' | 'video'
}

export type UploadedFilePurpose =
  | 'subject-reference'
  | 'motion-control-image'
  | 'motion-control-video'
  | 'multimodal-image'
  | 'multimodal-video'
  | 'multimodal-audio'
  | 'start-frame'
  | 'end-frame'
  | 'reference-image'


export interface UploadedFile {
  name: string
  type: 'image' | 'video' | 'audio'
  url: string
  size: number
  file?: File
  purpose?: UploadedFilePurpose
  /** 多模态参考模式下用于 @ 引用的稳定标识（如 图片1 / 视频1 / 音频1）。 */
  refLabel?: string
  /** 来自配音音频库时记录原条目 id，用于避免重复添加。 */
  libraryId?: string
  motionControlOptions?: MotionControlOptions
  dimensions?: {
    width: number
    height: number
  }
}
