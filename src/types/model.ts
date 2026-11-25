import { modelModules } from '@/models'

export type ModelIOType = 'text2image' | 'text2video' | 'image2image' | 'image2video'

export type MediaType = 'image' | 'video'
export type ModelInputType = 'text' | 'image' | 'video' | 'audio'

export interface ModelOption {
  id: string
  name: string
  ioType: ModelIOType
  pricing?: {
    input?: number
    output?: number
  }
}

export interface ModelCapability {
  mediaType: MediaType
  inputs: ModelInputType[]
  localUploadInputs?: ModelInputType[]
  requiresReference?: boolean
  availabilityNote?:
    | 'supports-image-upload'
    | 'supports-video-upload'
    | 'supports-image-video-upload'
    | 'supports-multimodal-upload'
    | 'requires-image-upload'
    | 'requires-video-upload'
  imageRequestMode?: 'default' | 'seedream-5-lite' | 'minimax-h3' | 'moss'
  /**
   * 图片参考模式：
   * - 'multi'：支持多张参考图（通过 image 数组上传），可使用 @ 在提示词中引用；
   * - 未设置：仅支持单张参考图。
   */
  imageReferenceMode?: 'multi'
  /** 多图参考的最大张数（默认 10，与 Seedream 5.0 Lite 上限一致）。 */
  imageReferenceLimit?: number
  videoRequestMode?: 'kling-v26' | 'kling-v3' | 'kling-omni' | 'kling-o1' | 'kling-v4' | 'viduq3-fast' | 'minimax-hailuo' | 'minimax-h3' | 'seedance-2'
  /**
   * 视频时长可选项（秒）。不同模型上限不同，未配置时由 videoRequestMode 的默认档位决定。
   * 例：Seedance 2.0 系列 4-15s，Seedance 2.5 4-30s。
   */
  videoDurations?: number[]
  /**
   * 视频分辨率可选项。未配置时不展示分辨率选择。
   * 例：MiniMax-H3 为 768P / 2K；Kling 4.0 为 720p / 1080p，Kling 4.0 Flash 仅 720p。
   */
  videoResolutions?: string[]

}

export interface BuiltInModelDescriptor {
  id: string
  mediaType: MediaType
}

export interface AspectRatioOption {
  value: string
  label: string
  boxWidth: number
  boxHeight: number
}

export interface VideoDurationOption {
  value: number
  label: string
}

export type VideoGenerationMode =
  | 'text2video'
  | 'image2video'
  | 'referenceImage2video'
  | 'startEnd2video'
  | 'endFrame2video'
  | 'subjectReference2video'
  | 'motionControl2video'
  | 'multimodalReference2video'
  | 'editVideo'




export interface VideoModeOption {
  value: VideoGenerationMode
  label: string
}


export const ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  { value: '16:9', label: '16:9', boxWidth: 28, boxHeight: 16 },
  { value: '3:2', label: '3:2', boxWidth: 24, boxHeight: 16 },
  { value: '4:3', label: '4:3', boxWidth: 22, boxHeight: 16 },
  { value: '1:1', label: '1:1', boxWidth: 18, boxHeight: 18 },
  { value: '3:4', label: '3:4', boxWidth: 16, boxHeight: 22 },
  { value: '2:3', label: '2:3', boxWidth: 16, boxHeight: 24 },
  { value: '9:16', label: '9:16', boxWidth: 16, boxHeight: 28 },
]

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = Object.fromEntries(
  modelModules.flatMap((model) => [
    [model.id, model.capability],
    ...model.adapter.models.map((alias) => [alias, model.capability] as const),
  ])
)

const HIDDEN_MODEL_ALIASES = new Set(['MiniMax-Hailuo-02', 'S2V-01'].map((id) => id.toLowerCase()))

export function isHiddenModelAlias(modelId: string | null | undefined): boolean {
  return !!modelId && HIDDEN_MODEL_ALIASES.has(modelId.toLowerCase())
}

export const BUILT_IN_MODELS: BuiltInModelDescriptor[] = Object.keys(MODEL_CAPABILITIES)
  .filter((id) => !isHiddenModelAlias(id))
  .map((id) => ({
  id,
  mediaType: MODEL_CAPABILITIES[id].mediaType,
}))

export function getModelCapability(modelId: string | null | undefined): ModelCapability | null {
  if (!modelId) return null
  return MODEL_CAPABILITIES[modelId] || MODEL_CAPABILITIES[Object.keys(MODEL_CAPABILITIES).find((id) => id.toLowerCase() === modelId.toLowerCase()) || ''] || null
}

export function modelSupportsUpload(modelId: string | null | undefined): boolean {
  const capability = getModelCapability(modelId)
  return !!capability && capability.inputs.some((input) => input !== 'text')
}

export function modelSupportsLocalUpload(modelId: string | null | undefined): boolean {
  const capability = getModelCapability(modelId)
  return !!capability && !!capability.localUploadInputs?.length
}

export function getModelAvailabilityLabel(modelId: string | null | undefined): string {
  const capability = getModelCapability(modelId)
  const note = capability?.availabilityNote

  if (
    capability?.mediaType === 'video' &&
    capability.inputs.includes('text') &&
    capability.inputs.includes('image') &&
    note === 'supports-image-upload'
  ) {
    return '支持文生/图生视频'
  }

  switch (note) {
    case 'supports-image-upload':
      return '支持上传图片'
    case 'supports-video-upload':
      return '支持上传视频'
    case 'supports-image-video-upload':
      return '支持上传图片/视频'
    case 'supports-multimodal-upload':
      return '支持上传图片/视频/音频'
    case 'requires-image-upload':
      return '仅上传图片后可用'
    case 'requires-video-upload':
      return '仅上传视频后可用'
    default:
      return ''
  }
}

export function modelRequiresReference(modelId: string | null | undefined): boolean {
  return !!getModelCapability(modelId)?.requiresReference
}

export function getLocalUploadAccept(modelId: string | null | undefined): string {
  const capability = getModelCapability(modelId)
  const inputs = capability?.localUploadInputs ?? []
  if (inputs.includes('image') && inputs.includes('video') && inputs.includes('audio')) {
    return 'image/*,video/*,audio/*'
  }
  if (inputs.includes('video')) {
    return 'video/*'
  }
  if (inputs.includes('image')) {
    return 'image/*'
  }
  return ''
}

export function getSupportedAspectRatios(
  modelId: string | null | undefined,
  videoMode?: VideoGenerationMode | null | undefined
): string[] | null {
  const mode = getModelCapability(modelId)?.videoRequestMode
  if (mode === 'seedance-2') {
    return ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  }
  // MiniMax-H3 支持 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16；adaptive（默认）仅图生/参考场景可用，
  // 纯文生视频须给具体比例，因此只在非 text2video 模式下提供 adaptive。
  if (mode === 'minimax-h3') {
    const ratios = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
    return videoMode && videoMode !== 'text2video' ? ['adaptive', ...ratios] : ratios
  }
  if (mode === 'viduq3-fast' || mode === 'minimax-hailuo') {
    return ['16:9', '9:16', '1:1', '4:3']
  }
  if (mode === 'kling-v26' || mode === 'kling-v3' || mode === 'kling-omni' || mode === 'kling-o1') {
    return ['16:9', '9:16', '1:1']
  }
  // Kling 4.0 文生视频 / 参考生视频支持 6 种画幅；图生 / 首尾帧模式由首帧决定。
  if (mode === 'kling-v4') {
    return ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  }
  return null
}


export function getSupportedVideoDurations(modelId: string | null | undefined): VideoDurationOption[] | null {
  const capability = getModelCapability(modelId)
  const mode = capability?.videoRequestMode

  // 模型自己声明了时长档位时优先使用（各 Seedance 版本上限不同）。
  if (capability?.videoDurations?.length) {
    return capability.videoDurations.map((value) => ({ value, label: `${value}s` }))
  }

  switch (mode) {
    case 'seedance-2':
      // 兜底：Seedance 2.0 系列实测 4-15s（4/16 边界已验证）。
      return [
        { value: 4, label: '4s' },
        { value: 5, label: '5s' },
        { value: 8, label: '8s' },
        { value: 10, label: '10s' },
        { value: 12, label: '12s' },
        { value: 15, label: '15s' },
      ]
    case 'kling-v26':
    case 'kling-v3':
    case 'kling-omni':
    case 'kling-o1':
      return [
        { value: 5, label: '5s' },
        { value: 10, label: '10s' },
      ]

    case 'minimax-hailuo':
      // MiniMax-Hailuo-2.3 支持 6s / 10s 两档时长。
      return [
        { value: 6, label: '6s' },
        { value: 10, label: '10s' },
      ]
    case 'viduq3-fast':
      return [
        { value: 5, label: '5s' },
      ]
    case 'minimax-h3':
      // MiniMax-H3 支持 4-15 秒整数时长，覆盖全档。
      return [
        { value: 4, label: '4s' },
        { value: 5, label: '5s' },
        { value: 6, label: '6s' },
        { value: 8, label: '8s' },
        { value: 10, label: '10s' },
        { value: 12, label: '12s' },
        { value: 15, label: '15s' },
      ]
    default:
      return [
        { value: 6, label: '6s' },
      ]
  }
}

/**
 * 返回指定视频模型可选的清晰度档位。
 * 未显式声明 videoResolutions 的模型（目前仅 MiniMax-H3）沿用旧版 768P / 2K。
 */
export function getSupportedVideoResolutions(modelId: string | null | undefined): string[] | null {
  const capability = getModelCapability(modelId)
  if (capability?.videoResolutions?.length) return capability.videoResolutions
  if (capability?.videoRequestMode === 'minimax-h3') return ['768P', '2K']
  return null
}

/** 返回指定视频模型的默认清晰度档位；不支持的模型返回 null。 */
export function getDefaultVideoResolution(modelId: string | null | undefined): string | null {
  const options = getSupportedVideoResolutions(modelId)
  if (!options?.length) return null
  // 优先 1080P / 768P 这类常规档位，避免默认落到 720P 或 2K。
  return options.find((option) => option === '1080p' || option === '768P') ?? options[0]
}

export function getDefaultVideoDuration(modelId: string | null | undefined): number {
  const options = getSupportedVideoDurations(modelId)
  if (!options?.length) return 6
  // 优先取 5s / 6s 作为默认（如 MiniMax-H3 的首档是 4s，不作为默认）。
  return options.find((option) => option.value === 5 || option.value === 6)?.value ?? options[0].value
}

const VIDEO_MODE_LABELS: Record<VideoGenerationMode, string> = {
  text2video: '文生视频',
  image2video: '图生视频',
  referenceImage2video: '参考生视频',
  startEnd2video: '首尾帧生视频',
  endFrame2video: '尾帧生视频',
  subjectReference2video: '主体参考视频',
  motionControl2video: '动作控制',
  multimodalReference2video: '多模态参考',
  editVideo: '编辑视频',
}




function buildVideoModeOptions(modes: VideoGenerationMode[]): VideoModeOption[] {
  return modes.map((value) => ({ value, label: VIDEO_MODE_LABELS[value] }))
}

/**
 * 返回指定视频模型支持的所有生成模式。
 * - viduq3-fast（Vidu Q3）：文生 / 图生 / 首尾帧
 * - minimax-hailuo（MiniMax Hailuo）：文生 / 图生 / 首尾帧 / 主体参考
 * - kling-v26 / kling-v3：文生 / 首尾帧 / 动作控制（图生视频统一走首尾帧）
 * - kling-omni（含 V3-Omni / Video-O1）：文生 / 参考生视频（多图 image_list）/ 首尾帧
 * - 其他（含默认）：文生 / 图生
 */
export function getSupportedVideoModes(modelId: string | null | undefined): VideoModeOption[] {
  const mode = getModelCapability(modelId)?.videoRequestMode
  switch (mode) {
    case 'viduq3-fast':
      if (modelId?.toLowerCase() === 'viduq3-pro-fast') {
        return buildVideoModeOptions(['image2video'])
      }
      return buildVideoModeOptions(['text2video', 'image2video', 'startEnd2video'])
    case 'kling-omni':
      return buildVideoModeOptions(['text2video', 'referenceImage2video', 'startEnd2video'])
    case 'minimax-hailuo':
      return buildVideoModeOptions([
        'text2video',
        'image2video',
        'startEnd2video',
        'subjectReference2video',
      ])
    case 'kling-v26':
    case 'kling-v3':
      return buildVideoModeOptions(['text2video', 'startEnd2video', 'motionControl2video'])

    case 'kling-v4':
      // Kling 4.0 Flash 仅支持文生 / 首帧图生；4.0 额外支持首尾帧与多图参考。
      if (modelId?.toLowerCase().includes('flash')) {
        return buildVideoModeOptions(['text2video', 'image2video'])
      }
      return buildVideoModeOptions(['text2video', 'image2video', 'startEnd2video', 'referenceImage2video'])


    case 'seedance-2':
      return buildVideoModeOptions([
        'text2video',
        'image2video',
        'multimodalReference2video',
        'editVideo',
      ])
    case 'minimax-h3':
      return buildVideoModeOptions([
        'text2video',
        'image2video',
        'endFrame2video',
        'startEnd2video',
        'multimodalReference2video',
      ])
    default:

      return buildVideoModeOptions(['text2video', 'image2video'])
  }
}


export function getModelsByMediaType(mediaType: MediaType, ids: string[]): string[] {
  return ids.filter((id) => !isHiddenModelAlias(id) && MODEL_CAPABILITIES[id]?.mediaType === mediaType)
}

/** Seedance 2 系列分组名称（2.0 / -fast / -mini / 2.5 同属该组）。 */
export const SEEDANCE_2_GROUP_LABEL = 'seedance 2 系列'

/**
 * 白名单提示文案：Seedance 2 系列仅支持 AI Ping 白名单用户调用。
 * 用户在简易模式 / 无限画布中选中该系列模型时弹窗提示。
 */
export const SEEDANCE_2_WHITELIST_NOTICE =
  '该系列模型仅支持 AI Ping 白名单用户使用，若您已经是白名单用户则可以正常完成调用，反之则无法正常调用。尽请谅解。'

/** 判断某个模型是否属于 Seedance 2 系列（基于 videoRequestMode）。 */
export function isSeedance2Model(modelId: string | null | undefined): boolean {
  return getModelCapability(modelId)?.videoRequestMode === 'seedance-2'
}

/**
 * 判断某个模型是否属于 Kling 系列（基于 videoRequestMode）。
 * Kling 系列支持通过 `sound: on/off` 生成带声音的视频，
 * 因此视频节点会针对该系列展示「是否生成声音」开关。
 */
export function isKlingVideoModel(modelId: string | null | undefined): boolean {
  const mode = getModelCapability(modelId)?.videoRequestMode
  return mode === 'kling-v26' || mode === 'kling-v3' || mode === 'kling-omni' || mode === 'kling-o1'
}


/**
 * 各媒体类型的「首选默认模型」优先级列表（均为非 Seedance 2 系列）。
 * 简易模式 / 无限画布在没有已选模型时，会按此顺序挑选默认模型，
 * 确保默认永远不落到白名单专属的 Seedance 2 系列上。
 */
export const PREFERRED_DEFAULT_MODEL_IDS: Record<MediaType, string[]> = {
  image: ['Doubao-Seedream-5.0-lite'],
  video: ['Kling-V2.6', 'Kling-V3', 'ViduQ3-Pro', 'ViduQ3-Pro-Fast', 'MiniMax-Hailuo-2.3'],
}

/**
 * 从候选模型 id 列表中挑选默认模型：
 * 1. 优先命中该媒体类型的首选默认模型（非 seedance）；
 * 2. 否则退回第一个非 seedance 模型；
 * 3. 仍无则退回列表第一个。
 */
export function pickPreferredDefaultModelId(
  mediaType: MediaType,
  candidateIds: string[]
): string | null {
  if (candidateIds.length === 0) return null
  const lowerToId = new Map(candidateIds.map((id) => [id.toLowerCase(), id]))
  for (const preferred of PREFERRED_DEFAULT_MODEL_IDS[mediaType]) {
    const hit = lowerToId.get(preferred.toLowerCase())
    if (hit) return hit
  }
  const firstNormal = candidateIds.find((id) => !isSeedance2Model(id))
  return firstNormal ?? candidateIds[0]
}
