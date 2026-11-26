/**
 * AIPing 音频（MiniMax Speech）接口适配层。
 *
 * - 语音合成：POST /audio/speech
 * - 音色列表：POST /audio/minimax/voices/list
 * - 样本上传：POST /audio/minimax/voices/upload（multipart）
 * - 快速复刻：POST /audio/minimax/voices/clone
 * - 删除音色：POST /audio/minimax/voices/delete
 *
 * 合成与复刻试听统一使用 AIPing 平台标准模型 id：MiniMax-Speech-2.8-hd。
 * 旧的小写官方名 speech-2.8-hd 会被当前平台拒绝。
 */

import { AppError } from '@/utils/errors'
import { parseVoiceLanguage } from '@/features/voice/voices'
import type {
  RemoteClonedVoice,
  RemoteDesignedVoice,
  SpeechAudioFormat,
  SystemVoice,
  VoiceCatalog,
} from '@/features/voice/types'

export const SPEECH_ENDPOINT = '/audio/speech'
export const VOICES_LIST_ENDPOINT = '/audio/minimax/voices/list'
export const VOICES_UPLOAD_ENDPOINT = '/audio/minimax/voices/upload'
export const VOICES_CLONE_ENDPOINT = '/audio/minimax/voices/clone'
export const VOICES_DELETE_ENDPOINT = '/audio/minimax/voices/delete'
export const VOICES_DESIGN_ENDPOINT = '/audio/minimax/voices/design'

/** 语音合成属于长耗时接口，单独放宽超时。 */
export const SPEECH_REQUEST_TIMEOUT = 300_000
export const VOICE_CLONE_REQUEST_TIMEOUT = 300_000
export const VOICE_DESIGN_REQUEST_TIMEOUT = 300_000
export const VOICE_UPLOAD_REQUEST_TIMEOUT = 120_000

interface BaseResp {
  status_code?: number
  status_msg?: string
}

interface RawVoiceEntry {
  voice_id?: string
  voice_name?: string
  description?: string[] | string | null
  created_time?: string
}

export interface RawVoiceListResponse {
  system_voice?: RawVoiceEntry[] | null
  voice_cloning?: RawVoiceEntry[] | null
  voice_generation?: RawVoiceEntry[] | null
  base_resp?: BaseResp
}

export interface RawDesignResponse {
  /** 试听音频（hex 编码 mp3） */
  trial_audio?: string
  voice_id?: string
  extra_info?: {
    usage_characters?: number
    charge_method?: string
    charge_model?: string
  } | null
  base_resp?: BaseResp
}

export interface RawSpeechResponse {
  data?: {
    audio?: string | null
    status?: number
  } | null
  extra_info?: {
    audio_length?: number
    audio_size?: number
    usage_characters?: number
    audio_format?: string
  } | null
  trace_id?: string
  base_resp?: BaseResp
}

export interface RawCloneResponse {
  demo_audio?: string
  input_sensitive?: boolean | { type?: number }
  input_sensitive_type?: number
  extra_info?: { audio_length?: number } | null
  base_resp?: BaseResp
}

export interface RawUploadResponse {
  file?: { file_id?: number; bytes?: number; filename?: string } | null
  base_resp?: BaseResp
}

const BASE_RESP_MESSAGES: Record<number, string> = {
  1000: '语音服务返回未知错误，请稍后重试。',
  1001: '语音服务处理超时，请缩短文本或稍后重试。',
  1002: '语音服务触发限流，请稍等几秒再试。',
  1004: '鉴权失败，请检查 API Key 是否有效。',
  1008: '账号余额不足，请先充值后再生成。',
  1013: '语音服务内部错误，请稍后重试。',
  1039: '请求触发 TPM 限流，请降低频率或缩短文本后重试。',
  1042: '文本中非法字符超过 10%，请清理特殊符号后重试。',
  2013: '请求参数不合法，请检查音色、文本或参数区间。',
  2026: '文本过长，请拆分后再生成。',
  2038: '当前 API Key 没有音色复刻权限，请先在 AIPing 完成账号认证。',
  2049: 'API Key 无效，请重新登录。',
}

function getBaseResp(payload: { base_resp?: BaseResp } | null | undefined): BaseResp | undefined {
  return payload?.base_resp
}

/** 上游 200 但 base_resp.status_code 非 0 时抛错。 */
export function assertBaseRespOk(payload: { base_resp?: BaseResp } | null | undefined, fallback: string): void {
  const baseResp = getBaseResp(payload)
  const statusCode = baseResp?.status_code
  if (typeof statusCode !== 'number' || statusCode === 0) return

  const message = BASE_RESP_MESSAGES[statusCode] || baseResp?.status_msg || fallback
  throw new AppError(message, { code: String(statusCode) })
}

/** 把 axios 错误 / 业务错误统一转成可直接展示的中文提示。 */
export function getVoiceApiErrorMessage(error: unknown, fallback = '操作没有成功，请稍后重试。'): string {
  if (error instanceof AppError) return error.message

  const axiosError = error as {
    response?: { status?: number; data?: unknown }
    code?: string
    message?: string
  }
  const data = axiosError?.response?.data as
    | { detail?: { message?: string; error?: string } | string; msg?: string; message?: string; code?: number }
    | undefined

  const detail = data?.detail
  const detailMessage = typeof detail === 'string' ? detail : detail?.message || detail?.error
  const rawMessage = detailMessage || data?.msg || data?.message || axiosError?.message || ''
  const message = typeof rawMessage === 'string' ? rawMessage : ''

  if (message.includes('voice clone') || message.includes('voice_clone')) {
    if (message.includes('model not allowed')) {
      return '复刻试听模型名不被上游接受，请刷新页面后重试。'
    }
    if (message.includes('permission') || message.includes('2038')) {
      return '当前 API Key 没有音色复刻权限，请先在 AIPing 完成账号认证。'
    }
    return '音色复刻没有成功，请换一段更干净的样本音频后重试。'
  }

  if (message.includes('voice design') || message.includes('voice_design')) {
    if (message.includes('sensitive') || message.includes('risk') || message.includes('敏感')) {
      return '音色描述没有通过内容风控，换个说法再试。'
    }
    if (message.includes('permission')) {
      return '当前 API Key 没有音色设计权限，请先在 AIPing 完成账号认证。'
    }
    if (message.includes('invalid params')) {
      return '音色描述不完整，请补充性别、年龄或音色质感后重试。'
    }
    return '音色设计没有成功，请调整描述后重试。'
  }

  const status = axiosError?.response?.status
  if (status === 401 || status === 403) {
    return '鉴权失败，请重新登录或检查 API Key 权限。'
  }
  if (status === 413) {
    return '上传的音频太大，请控制在 20MB 以内。'
  }
  if (status === 429) {
    return '请求过于频繁或并发已满，请稍后重试。'
  }
  if (status && status >= 500) {
    return message || '语音服务暂时不可用，请稍后重试。'
  }
  if (axiosError?.code === 'ECONNABORTED') {
    return '请求超时，文本较长或网络不稳定，请缩短文本后重试。'
  }
  if (message.includes('Network Error')) {
    return '网络异常，无法连接语音服务，请检查网络或代理设置。'
  }

  return message || fallback
}

function normalizeDescription(description: RawVoiceEntry['description']): string {
  if (Array.isArray(description)) return description.filter(Boolean).join(' ')
  return typeof description === 'string' ? description : ''
}

/** 音色列表归一化：补语言分组、过滤空 id、去重。 */
export function normalizeVoiceCatalog(payload: RawVoiceListResponse | null | undefined): VoiceCatalog {
  const seen = new Set<string>()

  const system: SystemVoice[] = (payload?.system_voice || [])
    .map((entry): SystemVoice | null => {
      const voiceId = (entry.voice_id || '').trim()
      if (!voiceId || seen.has(voiceId)) return null
      seen.add(voiceId)
      const language = parseVoiceLanguage(voiceId).key
      return {
        voiceId,
        name: (entry.voice_name || '').trim() || voiceId,
        description: normalizeDescription(entry.description),
        createdAt: entry.created_time || '',
        language,
      }
    })
    .filter((voice): voice is SystemVoice => !!voice)

  const cloned: RemoteClonedVoice[] = (payload?.voice_cloning || [])
    .map((entry) => {
      const voiceId = (entry.voice_id || '').trim()
      if (!voiceId) return null
      return {
        voiceId,
        name: (entry.voice_name || '').trim() || voiceId,
        createdAt: entry.created_time || '',
      } satisfies RemoteClonedVoice
    })
    .filter((voice): voice is RemoteClonedVoice => !!voice)

  // voice_generation 是「音色设计」生成的音色；只有真正用于合成过才会出现在这里。
  // 上游不返回名称，这里不要用 voice_id 兜底，否则列表里会显示一串乱码似的 id。
  const designed: RemoteDesignedVoice[] = (payload?.voice_generation || [])
    .map((entry) => {
      const voiceId = (entry.voice_id || '').trim()
      if (!voiceId) return null
      return {
        voiceId,
        name: (entry.voice_name || '').trim(),
        createdAt: entry.created_time || '',
      } satisfies RemoteDesignedVoice
    })
    .filter((voice): voice is RemoteDesignedVoice => !!voice)

  return { system, cloned, designed }
}

/** 从合成响应里取出 hex 音频与统计信息。 */
export function extractSpeechAudio(payload: RawSpeechResponse | null | undefined): {
  hex: string
  format: SpeechAudioFormat
  durationMs: number
  usageCharacters: number
  size: number
  traceId: string
  status: number
} {
  assertBaseRespOk(payload, '语音合成失败，请稍后重试。')

  const hex = (payload?.data?.audio || '').trim()
  if (!hex) {
    throw new AppError(payload?.data?.status === 1 ? '语音还在合成中，请稍后重试。' : '没有拿到音频数据，请稍后重试。')
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new AppError('音频数据格式异常（不是 hex 编码），请稍后重试。')
  }

  const format = (payload?.extra_info?.audio_format || 'mp3') as SpeechAudioFormat
  return {
    hex,
    format: ['mp3', 'wav', 'flac', 'pcm'].includes(format) ? format : 'mp3',
    durationMs: Number(payload?.extra_info?.audio_length) || 0,
    usageCharacters: Number(payload?.extra_info?.usage_characters) || 0,
    size: Number(payload?.extra_info?.audio_size) || Math.floor(hex.length / 2),
    traceId: payload?.trace_id || '',
    status: Number(payload?.data?.status) || 2,
  }
}

/** 上传接口返回的 file_id。 */
export function extractFileId(payload: RawUploadResponse | null | undefined): number {
  assertBaseRespOk(payload, '样本音频上传失败，请稍后重试。')
  const fileId = Number(payload?.file?.file_id)
  if (!Number.isFinite(fileId) || fileId <= 0) {
    throw new AppError('样本音频上传失败：没有拿到 file_id，请重试。')
  }
  return fileId
}

/** 复刻结果：试听地址与时长。 */
export function extractCloneResult(payload: RawCloneResponse | null | undefined): {
  demoUrl?: string
  durationMs?: number
} {
  assertBaseRespOk(payload, '音色复刻失败，请稍后重试。')

  const sensitiveType =
    typeof payload?.input_sensitive_type === 'number'
      ? payload.input_sensitive_type
      : typeof payload?.input_sensitive === 'object'
        ? Number(payload.input_sensitive?.type) || 0
        : 0

  if (sensitiveType > 0) {
    throw new AppError('样本音频没有通过内容风控，请换一段干净的人声录音后重试。')
  }

  return {
    demoUrl: payload?.demo_audio?.trim() || undefined,
    durationMs: Number(payload?.extra_info?.audio_length) || undefined,
  }
}

/** 音色设计结果：新音色 id + 一次试听音频（hex mp3）。 */
export function extractDesignResult(payload: RawDesignResponse | null | undefined): {
  voiceId: string
  hex: string
  usageCharacters: number
} {
  assertBaseRespOk(payload, '音色设计失败，请稍后重试。')

  const voiceId = (payload?.voice_id || '').trim()
  if (!voiceId) {
    throw new AppError('音色设计失败：没有拿到 voice_id，请重试。')
  }

  const hex = (payload?.trial_audio || '').trim()
  if (hex && !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new AppError('音色设计返回的试听音频格式异常，请重试。')
  }

  return {
    voiceId,
    hex,
    usageCharacters: Number(payload?.extra_info?.usage_characters) || 0,
  }
}

/** 生成复刻音色 id：首字符须为字母，只含字母数字与 - _，长度 ≥ 8。 */
export function createVoiceId(): string {
  const random = Math.random().toString(36).slice(2, 6)
  return `arvoice${Date.now().toString(36)}${random}`.slice(0, 48)
}

/** 复刻音色名称长度限制（仅前端展示用，MiniMax 侧只有 voice_id）。 */
export function sanitizeVoiceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 24)
}
