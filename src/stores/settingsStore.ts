import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getDefaultVideoDuration,
  isSeedance2Model,
  PREFERRED_DEFAULT_MODEL_IDS,
  type MediaType,
} from '@/types/model'

/** 配音页「翻译」默认使用的文本模型。 */
export const DEFAULT_TRANSLATION_MODEL = 'DeepSeek-V4.1-Flash-1017'
/** 提示词增强 / AI 润色默认使用的文本模型，开箱即用，无需用户再填写 ID。 */
export const DEFAULT_PROMPT_POLISH_MODEL = 'DeepSeek-V4.1-Flash-1017'

export const DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT = `你是一名专业的 AI 图像与视频提示词优化助手。
请在保留用户原意的前提下，补全主体、场景、构图、镜头、光线、风格、材质、色彩、细节和质量描述。
只输出润色后的提示词，不要解释，不要添加标题，不要使用 Markdown。`

// 文本节点系统提示词：所有文本模型在生成前都会经过这段系统提示词，
// 用于明确自己的身份和边界（对应 PRD - 文本节点 - 系统提示词）。
export const DEFAULT_TEXT_SYSTEM_PROMPT = `你是文本创作与润色助手。
请在完全尊重用户原意与表达意图的前提下，对文字进行梳理、扩写或润色，让内容更清晰流畅、更具表现力。
不要改变用户想表达的核心内容、观点与风格倾向，不要新增用户未提及的重要事实或设定。
只输出处理后的文本正文，不要解释说明，不要添加标题，不要使用 Markdown 标记。`

// 图片节点系统提示词：图片节点开启 AI 润色时，对 prompt 进行优化所使用的系统提示词。
export const DEFAULT_IMAGE_SYSTEM_PROMPT = `你是 AI 图像提示词优化助手。
请在保留用户原始创意、主体与画面意图的前提下，把描述补充得更完整、更利于出图。
可适度补全构图、镜头、光线、色彩、材质、风格与画质等细节，但不要替换或偏离用户指定的主体、场景与风格。
只输出优化后的提示词正文，不要解释，不要添加标题，不要使用 Markdown。`

// 视频节点系统提示词：视频节点开启 AI 润色时，对 prompt 进行优化所使用的系统提示词。
export const DEFAULT_VIDEO_SYSTEM_PROMPT = `你是 AI 视频提示词优化助手。
请在保留用户原始创意、主体与叙事意图的前提下，把描述补充得更适合生成视频。
可适度补全画面主体、动作与运镜、镜头节奏、场景氛围、光线与风格等要素，但不要替换或偏离用户指定的核心内容与风格。
只输出优化后的提示词正文，不要解释，不要添加标题，不要使用 Markdown。`

// 扩图节点系统提示词：扩图节点开启 AI 润色时，对 prompt 进行优化所使用的系统提示词。
// 核心诉求是「原图内容保持不变，仅在画面外围自然延展」。
export const DEFAULT_EXPAND_SYSTEM_PROMPT = `你是 AI 图像扩展（Outpainting / 扩图）提示词助手。
你的任务是在完全保留原图已有主体、内容、风格、光线、色彩与透视关系不变的前提下，向画面外围自然、无缝地延展补全新的画面区域。
请严格遵循：绝不改变、扭曲、遮挡或重绘原图中已存在的主体与元素；新扩展区域必须与原图无缝衔接，保持一致的场景逻辑、光照方向、色调、材质与画面风格，让扩展部分看起来像原图本就存在的延续。
只输出优化后的提示词正文，不要解释，不要添加标题，不要使用 Markdown。`

// 扩图指令：无论是否开启 AI 润色，都会作为实际下发给图片模型的提示词前缀，
// 明确要求模型执行「保持原图不变、向外扩展」的 outpainting 操作，而非重绘整张图。
export const EXPAND_IMAGE_INSTRUCTION = `请对这张图片进行扩图（outpainting）：完整保留原图的全部内容、主体、构图、风格、光线与色彩不变，不要修改、裁剪或重绘原有画面；在此基础上向画面四周自然延展、补全新的画面区域，使扩展部分与原图无缝衔接、风格与透视保持一致，并按目标画面比例输出。`



export const useSettingsStore = defineStore('settings', () => {
  const mediaType = ref<MediaType>('image')
  const selectedModel = ref<string | null>(null)
  const aspectRatio = ref('1:1')
  const videoDuration = ref(6)
  // 简易模式单轮批量生成数量（1-5），默认 1 张/条。
  const batchSize = ref(1)
  // 视频分辨率档位：MiniMax-H3 为 768P / 2K，Kling 4.0 为 720p / 1080p，Seedance 默认 720p。
  // 统一存字符串，切换模型时由页面按模型能力校正。
  const videoResolution = ref('1080p')
  // MiniMax H3 Image 图片档位：1K / 2K / 4K，默认保持原 2K 输出。
  const imageResolution = ref('2K')
  // 提示词增强 / AI 润色默认开启，模型默认 DeepSeek-V4.1-Flash-1017。
  const promptPolishEnabled = ref(true)
  const promptPolishModel = ref(DEFAULT_PROMPT_POLISH_MODEL)
  const promptPolishSystemPrompt = ref('')
  const textSystemPrompt = ref('')
  const translationModel = ref(DEFAULT_TRANSLATION_MODEL)

  function loadFromStorage() {
    const saved = localStorage.getItem('settings')
    if (saved) {
      const settings = JSON.parse(saved)
      mediaType.value = settings.mediaType || 'image'
      selectedModel.value = settings.selectedModel || null
      aspectRatio.value = settings.aspectRatio || (mediaType.value === 'video' ? '16:9' : '1:1')
      videoDuration.value = settings.videoDuration || getDefaultVideoDuration(selectedModel.value)
      const parsedBatchSize = Number(settings.batchSize)
      batchSize.value = Number.isFinite(parsedBatchSize) && parsedBatchSize >= 1 && parsedBatchSize <= 5
        ? Math.round(parsedBatchSize)
        : 1
      videoResolution.value = typeof settings.videoResolution === 'string' && settings.videoResolution
        ? settings.videoResolution
        : '1080p'
      imageResolution.value = ['1K', '2K', '4K'].includes(settings.imageResolution)
        ? settings.imageResolution
        : '2K'
      promptPolishEnabled.value = settings.promptPolishEnabled !== false
      promptPolishModel.value = settings.promptPolishModel || DEFAULT_PROMPT_POLISH_MODEL
      promptPolishSystemPrompt.value = settings.promptPolishSystemPrompt || ''
      textSystemPrompt.value = settings.textSystemPrompt || ''
      translationModel.value = settings.translationModel || DEFAULT_TRANSLATION_MODEL
    }
  }

  function saveToStorage() {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        mediaType: mediaType.value,
        selectedModel: selectedModel.value,
        aspectRatio: aspectRatio.value,
        videoDuration: videoDuration.value,
        batchSize: batchSize.value,
        videoResolution: videoResolution.value,
        imageResolution: imageResolution.value,
        promptPolishEnabled: promptPolishEnabled.value,
        promptPolishModel: promptPolishModel.value,
        promptPolishSystemPrompt: promptPolishSystemPrompt.value,
        textSystemPrompt: textSystemPrompt.value,
        translationModel: translationModel.value,
      })
    )
  }

  function setMediaType(nextType: MediaType) {
    mediaType.value = nextType
    if (nextType === 'video' && aspectRatio.value === '1:1') {
      aspectRatio.value = '16:9'
    }
    if (nextType === 'video') {
      videoDuration.value = getDefaultVideoDuration(selectedModel.value)
    }
    saveToStorage()
  }

  /** 新登录/退出登录时调用：避免沿用上一次会话可能选中的 Seedance 2.0 视频模型。 */
  function resetSeedanceVideoModelForNewSession() {
    loadFromStorage()
    if (mediaType.value === 'video' && isSeedance2Model(selectedModel.value)) {
      selectedModel.value = PREFERRED_DEFAULT_MODEL_IDS.video[0] || 'Kling-V2.6'
      saveToStorage()
    }
  }

  return {
    mediaType,
    selectedModel,
    aspectRatio,
    videoDuration,
    batchSize,
    videoResolution,
    imageResolution,
    promptPolishEnabled,
    promptPolishModel,
    promptPolishSystemPrompt,
    textSystemPrompt,
    translationModel,
    loadFromStorage,
    saveToStorage,
    setMediaType,
    resetSeedanceVideoModelForNewSession,
  }
})
