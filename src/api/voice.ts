/**
 * 配音创作相关的 API 调用。
 *
 * 全部走 /api/v1（开发环境由 Vite 代理到 aiping.cn），鉴权沿用全局 axios 实例
 * 注入的 Bearer Token，接口错误统一转成中文 AppError。
 */

import client from './aiping'
import { AppError } from '@/utils/errors'
import { bytesToBlob, getAudioDurationMs, hexToBytes } from '@/features/voice/audio'
import { getVoiceApiErrorMessage } from './providers/voice'
import {
  SPEECH_ENDPOINT,
  SPEECH_REQUEST_TIMEOUT,
  VOICES_CLONE_ENDPOINT,
  VOICES_DELETE_ENDPOINT,
  VOICES_DESIGN_ENDPOINT,
  VOICES_LIST_ENDPOINT,
  VOICES_UPLOAD_ENDPOINT,
  VOICE_CLONE_REQUEST_TIMEOUT,
  VOICE_DESIGN_REQUEST_TIMEOUT,
  VOICE_UPLOAD_REQUEST_TIMEOUT,
  createVoiceId,
  extractCloneResult,
  extractDesignResult,
  extractFileId,
  extractSpeechAudio,
  normalizeVoiceCatalog,
} from './providers/voice'
import type {
  CloneResult,
  SpeechRequest,
  SpeechResult,
  VoiceCatalog,
  VoiceDesignResult,
} from '@/features/voice/types'

function toAppError(error: unknown, fallback: string): AppError {
  return new AppError(getVoiceApiErrorMessage(error, fallback))
}

/** 拉取系统音色 + 账号下的复刻音色。 */
export async function fetchVoiceCatalog(): Promise<VoiceCatalog> {
  try {
    const response = await client.post(
      VOICES_LIST_ENDPOINT,
      { voice_type: 'all' },
      // 页面加载时的目录请求：失败只在页面提示，不把用户踢出登录态。
      { timeout: VOICE_UPLOAD_REQUEST_TIMEOUT, skipAuthRedirect: true } as never,
    )
    return normalizeVoiceCatalog(response.data)
  } catch (error) {
    throw toAppError(error, '音色列表加载失败，请稍后重试。')
  }
}

/** 文本转语音：返回可直接播放 / 下载的 Blob 结果。 */
export async function synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult> {
  const voiceSetting: Record<string, unknown> = {
    voice_id: request.voice.voiceId,
    speed: request.voice.speed,
    vol: request.voice.vol,
    pitch: request.voice.pitch,
  }
  if (request.voice.emotion) voiceSetting.emotion = request.voice.emotion

  const body: Record<string, unknown> = {
    model: request.model,
    text: request.text,
    stream: false,
    voice_setting: voiceSetting,
    audio_setting: {
      sample_rate: request.audio.sampleRate,
      bitrate: request.audio.bitrate,
      format: request.audio.format,
      channel: request.audio.channel,
    },
  }
  if (request.textNormalization) body.text_normalization = true

  let extracted
  try {
    const response = await client.post(SPEECH_ENDPOINT, body, { timeout: SPEECH_REQUEST_TIMEOUT })
    extracted = extractSpeechAudio(response.data)
  } catch (error) {
    throw toAppError(error, '语音合成失败，请稍后重试。')
  }

  const blob = bytesToBlob(hexToBytes(extracted.hex), extracted.format)
  const durationMs = extracted.durationMs || (await getAudioDurationMs(blob))

  return {
    blob,
    url: URL.createObjectURL(blob),
    format: extracted.format,
    durationMs,
    usageCharacters: extracted.usageCharacters,
    size: blob.size,
    traceId: extracted.traceId,
    createdAt: Date.now(),
  }
}

/** 上传复刻样本，返回 file_id。 */
export async function uploadCloneAudio(blob: Blob, fileName: string): Promise<number> {
  const form = new FormData()
  form.append('purpose', 'voice_clone')
  form.append('file', blob, fileName)

  try {
    // 不手动设置 Content-Type，交给浏览器补 boundary。
    const response = await client.post(VOICES_UPLOAD_ENDPOINT, form, {
      timeout: VOICE_UPLOAD_REQUEST_TIMEOUT,
    })
    return extractFileId(response.data)
  } catch (error) {
    throw toAppError(error, '样本音频上传失败，请检查格式与大小后重试。')
  }
}

export interface DesignVoiceParams {
  /** 音色描述：性别、年龄、质感、语速、场景 */
  prompt: string
  /** 试听文案（同时按字符计费） */
  previewText: string
}

/**
 * 音色设计（文生音色）：用一段描述生成全新音色，返回 voice_id 与试听音频。
 * 生成的音色 7 天内未用于合成会被上游删除。
 */
export async function designVoice(params: DesignVoiceParams): Promise<VoiceDesignResult> {
  let result
  try {
    const response = await client.post(
      VOICES_DESIGN_ENDPOINT,
      { prompt: params.prompt, preview_text: params.previewText },
      { timeout: VOICE_DESIGN_REQUEST_TIMEOUT },
    )
    result = extractDesignResult(response.data)
  } catch (error) {
    throw toAppError(error, '音色设计失败，请稍后重试。')
  }

  const blob = result.hex ? bytesToBlob(hexToBytes(result.hex), 'mp3') : new Blob([], { type: 'audio/mpeg' })
  const durationMs = blob.size ? await getAudioDurationMs(blob) : 0

  return {
    voiceId: result.voiceId,
    blob,
    url: blob.size ? URL.createObjectURL(blob) : '',
    durationMs,
    usageCharacters: result.usageCharacters,
    format: 'mp3',
  }
}

export interface CloneVoiceParams {
  fileId: number
  /** 自定义 voice_id（不传则自动生成） */
  voiceId?: string
  /** 试听文本，不传则上游不返回试听音频 */
  demoText?: string
  /** 复刻试听使用的 AIPing 平台标准名，如 MiniMax-Speech-2.8-hd */
  demoModel?: string
  needNoiseReduction?: boolean
  needVolumeNormalization?: boolean
}

/** 快速复刻：成功后返回试听音频地址。 */
export async function cloneVoice(params: CloneVoiceParams): Promise<CloneResult> {
  const voiceId = params.voiceId || createVoiceId()
  const body: Record<string, unknown> = {
    file_id: params.fileId,
    voice_id: voiceId,
    need_noise_reduction: params.needNoiseReduction ?? true,
    need_volume_normalization: params.needVolumeNormalization ?? true,
  }
  if (params.demoText && params.demoModel) {
    body.text = params.demoText
    body.model = params.demoModel
  }

  let result
  try {
    const response = await client.post(VOICES_CLONE_ENDPOINT, body, {
      timeout: VOICE_CLONE_REQUEST_TIMEOUT,
    })
    result = extractCloneResult(response.data)
  } catch (error) {
    throw toAppError(error, '音色复刻失败，请稍后重试。')
  }

  return {
    voiceId,
    demoUrl: result.demoUrl,
    durationMs: result.durationMs,
  }
}

/** 删除音色（复刻音色或设计音色）。 */
export async function deleteClonedVoice(
  voiceId: string,
  voiceType: 'voice_cloning' | 'voice_generation' = 'voice_cloning',
): Promise<void> {
  try {
    const response = await client.post(
      VOICES_DELETE_ENDPOINT,
      { voice_type: voiceType, voice_id: voiceId },
      { timeout: VOICE_UPLOAD_REQUEST_TIMEOUT },
    )
    // 删除接口同样用 base_resp 报错，复用复刻结果的校验逻辑。
    const statusCode = Number(response.data?.base_resp?.status_code)
    if (Number.isFinite(statusCode) && statusCode !== 0) {
      throw new AppError(response.data?.base_resp?.status_msg || '删除音色失败，请稍后重试。')
    }
    if (!Number.isFinite(statusCode)) {
      // 没有 base_resp 视为异常响应，避免静默失败。
      throw new AppError('删除音色失败：服务返回格式异常。')
    }
  } catch (error) {
    throw toAppError(error, '删除音色失败，请稍后重试。')
  }
}
