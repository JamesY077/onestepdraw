/**
 * 配音创作（TTS）模型与参数注册表。
 *
 * 当前只接入 AIPing 已开放的 MiniMax-Speech-2.8-hd：
 * - 语音合成与声音复刻试听都使用平台标准名：`MiniMax-Speech-2.8-hd`
 * - 不再使用已被平台拒绝的官方小写名：`speech-2.8-hd`
 *
 * 参数区间来自官方文档：
 *   speed [0.5, 2] · vol (0, 10] · pitch [-12, 12]
 */

import type { SpeechAudioFormat, VoiceEmotion } from './types'

export type VoiceModelProvider = 'minimax'

export interface VoiceParamRange {
  min: number
  max: number
  step: number
  defaultValue: number
  unit?: string
}

export interface VoiceModelCapability {
  /** 支持的音色来源：内置音色 / 复刻音色 */
  voiceSources: ('preset' | 'clone')[]
  /** 是否支持情绪、语速、音量等演绎参数 */
  expressive: boolean
  /** 是否支持多角色对白 */
  multiSpeaker: boolean
  /** 单次请求最大文本长度 */
  maxChars: number
  /** 超过该长度建议流式（本项目统一非流式，仅做提示） */
  streamSuggestChars: number
}

export interface VoiceModelOption {
  id: string
  displayName: string
  provider: VoiceModelProvider
  description: string
  /** 复刻试听使用的 AIPing 平台标准模型名 */
  cloneDemoModel: string
  capability: VoiceModelCapability
}

/** 演绎参数区间（页面滑杆直接复用）。 */
export const VOICE_PARAM_LIMITS = {
  speed: { min: 0.5, max: 2, step: 0.05, defaultValue: 1, unit: 'x' },
  vol: { min: 0.1, max: 10, step: 0.1, defaultValue: 1, unit: '' },
  pitch: { min: -12, max: 12, step: 1, defaultValue: 0, unit: '' },
} as const satisfies Record<string, VoiceParamRange>

/** 情绪标签（Speech 2.8 支持，不含 whisper）。 */
export const VOICE_EMOTIONS: { value: VoiceEmotion; label: string; icon: string }[] = [
  { value: 'happy', label: '开心', icon: '◡' },
  { value: 'sad', label: '悲伤', icon: '◞' },
  { value: 'angry', label: '生气', icon: '◣' },
  { value: 'fearful', label: '恐惧', icon: '◌' },
  { value: 'disgusted', label: '厌恶', icon: '◠' },
  { value: 'surprised', label: '惊讶', icon: '◎' },
  { value: 'calm', label: '平静', icon: '—' },
]

/** 采样率 / 比特率候选。 */
export const SPEECH_SAMPLE_RATES = [8000, 16000, 22050, 24000, 32000, 44100] as const
export const SPEECH_BITRATES = [32000, 64000, 128000, 256000] as const
export const SPEECH_FORMATS: { value: SpeechAudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'flac', label: 'FLAC' },
]

/** 默认输出格式按上游默认值（mp3 / 32kHz / 128kbps / 单声道）。 */
export const DEFAULT_AUDIO_SETTING = {
  format: 'mp3' as SpeechAudioFormat,
  sampleRate: 32000,
  bitrate: 128000,
  channel: 1 as const,
}

export const VOICE_MODELS: VoiceModelOption[] = [
  {
    id: 'MiniMax-Speech-2.8-hd',
    displayName: 'MiniMax Speech 2.8 HD',
    provider: 'minimax',
    description: '高保真语音合成，支持情绪、语速、音量与语调细调，适合成片配音。',
    cloneDemoModel: 'MiniMax-Speech-2.8-hd',
    capability: {
      voiceSources: ['preset', 'clone'],
      expressive: true,
      multiSpeaker: false,
      maxChars: 10000,
      streamSuggestChars: 3000,
    },
  },
]

export const DEFAULT_VOICE_MODEL_ID = VOICE_MODELS[0].id

export function getVoiceModel(modelId: string | null | undefined): VoiceModelOption | undefined {
  if (!modelId) return undefined
  return VOICE_MODELS.find((item) => item.id === modelId)
}

/** 把当前模型 id 映射为复刻试听用的 AIPing 平台标准名。 */
export function getCloneDemoModel(modelId: string): string {
  return getVoiceModel(modelId)?.cloneDemoModel || 'MiniMax-Speech-2.8-hd'
}

export function clampVoiceParam(key: keyof typeof VOICE_PARAM_LIMITS, value: number): number {
  const range = VOICE_PARAM_LIMITS[key]
  const safe = Number.isFinite(value) ? value : range.defaultValue
  return Math.min(range.max, Math.max(range.min, safe))
}
