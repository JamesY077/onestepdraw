/** 剪辑项目的数据模型：一个项目 = 一条时间轴 + 一个素材库 + 一段对话。 */

export type ProjectAssetKind = 'video' | 'image' | 'audio'
export type EditTrackKind = 'video' | 'overlay' | 'audio'

export interface ProjectAsset {
  id: string
  name: string
  kind: ProjectAssetKind
  url: string
  thumbnail?: string
  /** 秒；图片可为空，入轨时给默认时长。 */
  duration?: number
  source: 'chat' | 'library' | 'upload'
  /** App / 本地服务模式下原文件在磁盘上的路径。 */
  path?: string
  createdAt: number
}

export interface TimelineClip {
  id: string
  assetId?: string
  kind: ProjectAssetKind
  name: string
  url: string
  thumbnail?: string
  /** 秒。 */
  start: number
  /** 秒。 */
  duration: number
  /** 从素材内部第几秒开始截取。 */
  trimStart?: number
  /** 音频音量 0-1。 */
  volume?: number
  /** 画面不透明度 0-1。 */
  opacity?: number
}

export interface EditTrack {
  id: string
  kind: EditTrackKind
  name: string
  clips: TimelineClip[]
  muted?: boolean
}

export interface EditProject {
  id: string
  name: string
  conversationId?: string
  aspectRatio: string
  resolution: '768P' | '2K'
  fps: number
  createdAt: number
  updatedAt: number
  /**
   * 并发保护版本号：每次写入递增。
   * 导出/Agent 改动前带上下文的版本，落后就说明别处已经改过，避免互相覆盖。
   */
  revision?: number
  tracks: EditTrack[]
  assets: ProjectAsset[]
}

export const PROJECT_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const

export const IMAGE_CLIP_SECONDS = 4
export const VIDEO_CLIP_SECONDS = 5
export const AUDIO_CLIP_SECONDS = 4
export const MIN_CLIP_SECONDS = 0.4
export const MAX_PROJECT_SECONDS = 300

export function aspectSize(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 }
    case '1:1':
      return { width: 1024, height: 1024 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    default:
      return { width: 1280, height: 720 }
  }
}

export function trackKindForAsset(kind: ProjectAssetKind): EditTrackKind {
  if (kind === 'audio') return 'audio'
  return 'video'
}
