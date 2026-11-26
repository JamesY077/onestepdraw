export interface ModelPermission {
  id: string
  object: string
  created: number
  allow_create_engine: boolean
  allow_sampling: boolean
  allow_logprobs: boolean
  allow_search_indices: boolean
  allow_view: boolean
  allow_fine_tuning: boolean
  organization: string
  group: string | null
  is_blocking: boolean
}

export interface ModelPricing {
  input?: number
  output?: number
}

export interface Model {
  id: string
  object: 'model'
  created: number
  owned_by: string
  permission: ModelPermission[]
  root: string
  parent: string | null
  pricing?: ModelPricing
}

export interface ModelsResponse {
  object: 'list'
  data: Model[]
}

export interface ChatMessageImageContentPart {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export interface ChatMessageTextContentPart {
  type: 'text'
  text: string
}

export type ChatMessageContentPart = ChatMessageImageContentPart | ChatMessageTextContentPart

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatMessageContentPart[]
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  extra_body?: Record<string, unknown>
}

export interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export interface ImageGenerateRequest {
  model?: string
  prompt: string
  /** 参考图：单图传字符串；多图模型传数组（Seedream 最多 10 张，MiniMax H3 最多 16 张）。 */
  image?: string | string[]
  /** 组图输出开关（Seedream 5.0 Lite）：'disabled' 表示每次只返回一张图。 */
  sequential_image_generation?: 'auto' | 'disabled'
  size?: string
  width?: number
  height?: number
  output_format?: 'png' | 'jpeg'
  watermark?: boolean
  extra_body?: Record<string, unknown>
  n?: number
  response_format?: 'url' | 'b64_json'
  /** 不希望出现的内容（Moss 支持）。 */
  negative_prompt?: string
  /** 是否在同一任务内增强提示词；Moss 的分层 JSON 必须关闭，否则会被改写。 */
  prompt_enhance?: boolean
  /** 输出水印开关（Moss 支持）。 */
  output_watermark?: { enabled: boolean }
  /** 随机种子（Moss 支持）。 */
  seed?: number
}

export interface ImageGenerateResponse {
  created: number
  model?: string
  provider?: string
  usage?: {
    total_cost?: number | string
  }
  total_cost?: number | string
  cost?: number | string
  data: Array<{
    url?: string
    b64_json?: string
  }>
}

export interface VideoGenerateRequest {
  model?: string
  prompt: string
  model_name?: string
  negative_prompt?: string
  image?: string
  image_url?: string
  image_tail?: string
  image_list?: Array<{
    image_url: string
    type?: 'first_frame' | 'end_frame' | string
  }>
  images?: string[]
  img_url?: string
  first_frame_image?: string
  last_frame_image?: string
  first_frame_url?: string
  last_frame_url?: string
  start_image?: string
  end_image?: string
  reference_images?: string[]
  /** Seedance 2.0 多模态参考：参考视频地址（URL / base64 dataURI），最多 3 个。 */
  reference_videos?: string[]
  /** Seedance 2.0 多模态参考：参考音频地址（URL / base64 dataURI），最多 3 个。 */
  reference_audios?: string[]
  video_url?: string

  subject_reference?: Array<{
    type: 'character' | string
    image: string[]
  }>
  video_list?: string[]
  seconds?: number
  duration?: number
  mode?: string
  sound?: 'on' | 'off' | string
  keep_original_sound?: 'yes' | 'no' | string


  character_orientation?: 'image' | 'video' | string
  motion_control?: boolean
  aspect_ratio?: string
  ratio?: string
  size?: string
  resolution?: string
  audio?: boolean
  movement_amplitude?: string
  off_peak?: boolean
  watermark?: boolean
  seed?: number
  style?: string
  payload?: string
  callback_url?: string
  external_task_id?: string
  extra_body?: Record<string, unknown>
}

export interface VideoGenerateResponse {
  id: string
  task_id?: string
  object: 'video.generation'
  created: number
  status: 'pending' | 'created' | string
  provider?: string
  state?: string
  model: string
  images?: string[]
  prompt?: string
  duration?: number
  seed?: number
  aspect_ratio?: string
  resolution?: string
  movement_amplitude?: string
  audio?: boolean
  payload?: string
  off_peak?: boolean
  credits?: number
  created_at?: string
  aiping_id?: string
  providerCreateEndpoint?: string
}

export interface VideoStatusResponse {
  id: string
  task_id?: string
  object?: string
  created?: number
  status: string
  state?: string
  model: string
  progress?: number
  video_url?: string
  seconds?: number
  size?: string
  provider?: string
  usage?: {
    total_cost?: number | string
  }
  total_cost?: number | string
  cost?: number | string
  data?: Array<{
    url: string
    thumbnail?: string
    duration: number
    watermarked_url?: string
  }>
  error?: string
  aiping_id?: string
}
