/** 剪辑项目的数据模型：一个项目 = 一条时间轴 + 一个素材库 + 一段对话。 */

export type ProjectAssetKind = 'video' | 'image' | 'audio' | 'animation' | 'motion'
export type AnimationSourceType = 'html' | 'jsx' | 'tsx'
export type EditTrackKind = 'video' | 'overlay' | 'audio'
export type KeyframeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface ClipKeyframe {
  id: string
  /** 相对片段起点的秒数。 */
  time: number
  /** 音量或不透明度，范围 0-1。 */
  value: number
  /** 到下一个关键帧的插值曲线。 */
  easing: KeyframeEasing
}

export interface CaptionCue {
  id: string
  text: string
  start: number
  duration: number
}

/** 项目画布/导出分辨率档位：768P（1366×768）、1080P（1920×1080）、2K（2560×1440）。 */
export type ProjectResolution = '768P' | '1080P' | '2K'

/** 短边像素：用于按比例换算导出尺寸。 */
export function resolutionShortSide(resolution: ProjectResolution): number {
  return resolution === '2K' ? 1440 : resolution === '1080P' ? 1080 : 768
}

export interface ProjectVersionSnapshot {
  name: string
  aspectRatio: string
  resolution: ProjectResolution
  fps: number
  tracks: EditTrack[]
  captions: CaptionCue[]
}

export interface ProjectVersion {
  id: string
  label: string
  createdAt: number
  snapshot: ProjectVersionSnapshot
}

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
  /** HTML / React 代码动画的完整源码；选中修改时直接编辑这份源文件。 */
  code?: string
  codeLanguage?: AnimationSourceType
  /** 动效工程 id（HTML/CSS/JS 组合，由本地 /local/motion 服务托管）。 */
  motionId?: string
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
  /** 音量 / 不透明度曲线；关键帧时间为片段内时间。 */
  volumeKeyframes?: ClipKeyframe[]
  opacityKeyframes?: ClipKeyframe[]
  /** HTML / React 代码动画的完整源码。 */
  code?: string
  codeLanguage?: AnimationSourceType
  /** 动效工程 id：预览按 iframe 播放，渲染后可用 MP4 原位替换。 */
  motionId?: string
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
  /** 归属的工作区（本地目录）。缺省表示未分类。 */
  workspaceId?: string
  aspectRatio: string
  resolution: ProjectResolution
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
  captions?: CaptionCue[]
  /** 手动保存的命名版本，最多保留最近 8 个。 */
  versions?: ProjectVersion[]
}

export const PROJECT_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const

export const IMAGE_CLIP_SECONDS = 4
export const VIDEO_CLIP_SECONDS = 5
export const AUDIO_CLIP_SECONDS = 4
/** 动效工程默认入轨时长；渲染 MP4 后按实际片长回填。 */
export const MOTION_CLIP_SECONDS = 6
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
