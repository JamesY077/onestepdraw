import { generateImage, generateVideo } from '@/api/aiping'
import { useChatStore } from '@/stores/chatStore'
import type { GenerateResult, GenerateType, ImageGenerationMode, UploadedFile } from '@/types/chat'
import { EXPAND_IMAGE_INSTRUCTION } from '@/stores/settingsStore'
import { getDefaultVideoResolution, getModelCapability, getSupportedVideoResolutions } from '@/types/model'
import type { ModelCapability, ModelIOType, VideoGenerationMode } from '@/types/model'
import type { ImageGenerateResponse, VideoStatusResponse } from '@/types/api'
import { validatePromptOrThrow } from '@/utils/errorHandling'
import { normalizeErrorMessage, showErrorMessage } from '@/utils/errors'
import { buildImageParams, buildVideoParams } from '@/features/generate/buildParams'
import { aspectRatioToDimensions } from '@/features/generate/aspectRatio'
import { GLOBAL_VIDEO_TIMEOUT_MS, pollVideoStatus } from '@/features/generate/video'
import { resolveRealCost } from '@/utils/format'
import { buildEffectivePrompt } from '@/features/skill/apply'
import type { MossLayout } from '@/types/layout'
import { cloneLayout, toMossLayoutPrompt } from '@/features/layout/mossLayout'
import { buildGlobalEditPrompt, type GlobalEditPromptOptions } from '@/features/layout/globalEdit'
import { assetLayerToUploadedFile, composeLayoutWithAssets, getAssetLayers } from '@/features/layout/layerCompose'
import { planMossLayout } from '@/features/layout/planner'

type UploadInput = UploadedFile | UploadedFile[] | null | undefined

export interface GenerateOptions {
  /** 扩图消息会记录该字段，重新生成时仍走扩图链路。 */
  imageMode?: ImageGenerationMode
  /** 实际发给模型的图片；可与消息展示的 uploadedFile 不同（扩图时使用预扩画布）。 */
  generationFile?: UploadInput
  /** 覆盖图片请求的 size（扩图使用当前模型的目标尺寸）。 */
  imageSize?: string
  /** MiniMax H3 Image 的 1K / 2K / 4K 输出档位。 */
  imageResolution?: string
  /** 视频生成方式；部分模型（如 Seedance 编辑视频）需要据此改写比例与时长。 */
  videoGenerationMode?: VideoGenerationMode | null
  /** 直接使用指定布局生成（Moss 图层编辑后重新生成）。 */
  mossLayout?: MossLayout | null
  /** 首次生成时，先让文本模型把自然语言拆成 Moss 分层布局。 */
  mossLayoutMode?: boolean
}

function ioTypeToGenerateType(ioType: ModelIOType): GenerateType {
  return ioType === 'text2image' || ioType === 'image2image' ? 'image' : 'video'
}

const MAX_BATCH_SIZE = 5

function normalizeBatchSize(value: number): number {
  const parsed = Math.round(Number(value))
  return Number.isFinite(parsed) ? Math.min(MAX_BATCH_SIZE, Math.max(1, parsed)) : 1
}

function parseImageSize(size: string | undefined): { width: number; height: number } | null {
  if (!size) return null
  const match = size.match(/^(\d+)[*x](\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width && height ? { width, height } : null
}

function buildImageResult(
  response: ImageGenerateResponse,
  model: string | null,
  aspectRatio: string,
  capability: ModelCapability | null,
  outputSize?: { width: number; height: number } | null,
  layout?: MossLayout | null,
  layoutSkipped = false
): GenerateResult {
  const url = response.data[0]?.url || ''
  if (!url) {
    throw new Error('图片生成完成但未返回有效图片地址，请稍后重试或切换模型。')
  }

  return buildImageResultFromUrl(url, response, model, aspectRatio, capability, outputSize, layout, layoutSkipped)
}

function buildImageResultFromUrl(
  url: string,
  response: ImageGenerateResponse,
  model: string | null,
  aspectRatio: string,
  capability: ModelCapability | null,
  outputSize?: { width: number; height: number } | null,
  layout?: MossLayout | null,
  layoutSkipped = false
): GenerateResult {
  return {
    type: 'image',
    url,
    model: response.model || model || 'Doubao-Seedream-5.0-lite',
    provider: response.provider,
    cost: resolveRealCost(response) / Math.max(response.data.length, 1),
    aspectRatio,
    createdAt: Date.now(),
    size: outputSize || aspectRatioToDimensions(aspectRatio, capability?.imageRequestMode),
    ...(layout ? { layout } : {}),
    ...(layoutSkipped ? { layoutSkipped: true } : {}),
  }
}

function buildVideoResult(
  finalStatus: VideoStatusResponse,
  model: string | null,
  aspectRatio: string
): GenerateResult {
  const videoUrl = finalStatus.video_url || finalStatus.data?.[0]?.url || ''
  if (!videoUrl) {
    throw new Error('视频生成完成但未返回有效视频地址，请稍后重试或切换模型。')
  }

  return {
    type: 'video',
    url: videoUrl,
    model: finalStatus.model || model || '',
    provider: finalStatus.provider,
    cost: resolveRealCost(finalStatus),
    aspectRatio,
    createdAt: Date.now(),
    size: aspectRatioToDimensions(aspectRatio),
    thumbnail: finalStatus.data?.[0]?.thumbnail,
    duration: finalStatus.seconds || finalStatus.data?.[0]?.duration,
  }
}

function describeBatchFailure(successCount: number, total: number, errors: string[]): string | undefined {
  if (!errors.length) return undefined
  return `本轮共 ${total} 个任务，已成功生成 ${successCount} 个；失败原因：${errors.join('；')}`
}

export function useGenerate() {
  const chatStore = useChatStore()

  async function generate(
    prompt: string,
    ioType: ModelIOType,
    model: string | null,
    uploadedFile?: UploadInput,
    aspectRatio = '1:1',
    duration = 6,
    // 可灵系列是否生成声音：true 对应 sound=on，false 对应 off。
    klingSound = false,
    // Skill 规范：非空时，实际下发给模型的提示词会携带该 skill 规范，
    // 但聊天区仍展示用户输入的原始 prompt。
    skillContent: string | string[] | null = null,
    // 视频分辨率档位（MiniMax-H3、Kling 4.0、Seedance 使用，其余模型忽略）。
    videoResolution: string | null = null,
    // 简易模式单轮批量生成数量，限制为 1-5。
    batchSize = 1,
    options: GenerateOptions = {}
  ) {

    const isExpand = options.imageMode === 'expand'
    // 扩图允许不写提示词；若用户写了内容，仍执行敏感词/格式校验。
    if (!isExpand || prompt.trim()) {
      validatePromptOrThrow(prompt)
    }

    chatStore.isGenerating = true
    const generateType = ioTypeToGenerateType(ioType)
    // 扩图一次只生成一张，避免批量结果与单个结果卡片的快捷扩图语义冲突。
    const requestedBatchSize = isExpand ? 1 : normalizeBatchSize(batchSize)
    const supportsVideoResolution = generateType === 'video' && !!getSupportedVideoResolutions(model)?.length

    chatStore.addMessage({
      type: 'user',
      content: prompt,

      uploadedFile: Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile || undefined,
      uploadedFiles: Array.isArray(uploadedFile) ? uploadedFile : undefined,
      aspectRatio,
      model: model || undefined,
      duration,
      batchSize: requestedBatchSize,
      imageMode: options.imageMode,
      videoMode: options.videoGenerationMode ?? undefined,
      videoResolution: supportsVideoResolution
        ? videoResolution || getDefaultVideoResolution(model) || undefined
        : undefined,
      imageResolution: options.imageResolution,
    })

    const assistantId = chatStore.addMessage({
      type: 'assistant',
      content: '',
      generateType,
      generateStatus: 'pending',
      batchSize: requestedBatchSize,
      progress: 0,
    })

    try {
      // 有 Skill 时先把规范压缩成 400-500 字，再拼接用户提示词下发。
      // 扩图固定使用扩图指令，忽略 Skill，避免 Skill 里的主体/风格要求覆盖「保持原图不变」。
      const effectivePrompt = isExpand
        ? [EXPAND_IMAGE_INSTRUCTION, prompt.trim()].filter(Boolean).join('\n\n')
        : await buildEffectivePrompt(prompt, skillContent)
      const capability = getModelCapability(model)
      const outputSize = parseImageSize(options.imageSize) || (
        capability?.imageRequestMode === 'minimax-h3'
          ? aspectRatioToDimensions(aspectRatio, capability.imageRequestMode, options.imageResolution)
          : null
      )

      if (generateType === 'image') {
        // Moss 分层：可直接沿用编辑后的布局，或先让文本模型把自然语言拆成布局。
        let mossLayout: MossLayout | null = options.mossLayout ? cloneLayout(options.mossLayout) : null
        // 分层规划失败时不能让整次生成失败：退回普通出图，并在结果上标注没有可编辑图层。
        let layoutSkipped = false
        if (!mossLayout && options.mossLayoutMode && capability?.imageRequestMode === 'moss') {
          const layoutSize = outputSize || aspectRatioToDimensions(aspectRatio, capability?.imageRequestMode)
          try {
            mossLayout = await planMossLayout({
              idea: effectivePrompt,
              width: layoutSize.width,
              height: layoutSize.height,
              aspectRatio,
            })
          } catch (error) {
            layoutSkipped = true
            console.warn('分层布局规划失败，已改为普通图片输出。', error)
          }
        }
        if (mossLayout) {
          chatStore.updateMessage(assistantId, { layout: mossLayout })
        }
        // Moss 使用原生布局 JSON；其他图片模型把布局转成提示词，配合参考图近似还原。
        let requestUpload: UploadInput = options.generationFile || uploadedFile
        let requestPrompt = effectivePrompt
        if (mossLayout) {
          if (capability?.imageRequestMode === 'moss') {
            requestPrompt = toMossLayoutPrompt(mossLayout)
          } else {
            let editPromptOptions: GlobalEditPromptOptions | undefined
            const assetLayers = getAssetLayers(mossLayout)
            if (assetLayers.length) {
              const base = Array.isArray(requestUpload) ? requestUpload[0] : requestUpload
              if (!base) {
                throw new Error('素材图层需要一张底图，请重新上传参考图后再生成。')
              }
              const multiLimit =
                capability?.imageReferenceMode === 'multi'
                  ? capability.imageReferenceLimit ?? 10
                  : 1
              if (capability?.imageReferenceMode === 'multi' && assetLayers.length + 1 <= multiLimit) {
                // 多图参考模型：底图 + 素材分别下发，素材保真度更高，也不受跨域影响。
                requestUpload = [
                  base,
                  ...assetLayers.map((item, index) => assetLayerToUploadedFile(item, index)),
                ]
                const indexByLayerId: Record<string, number> = {}
                assetLayers.forEach((item, index) => {
                  indexByLayerId[item.id] = index + 2
                })
                editPromptOptions = { assetImageIndexByLayerId: indexByLayerId }
              } else {
                // 单图模型：把素材按 bbox 预先合成到底图上。
                const composed = await composeLayoutWithAssets(base, mossLayout)
                if (!composed) {
                  throw new Error('素材图层合成失败，请重试或移除素材图层后再生成。')
                }
                requestUpload = composed
                editPromptOptions = { assetsComposited: true }
              }
            }
            requestPrompt = buildGlobalEditPrompt(mossLayout, effectivePrompt, editPromptOptions)
          }
        }

        const imageParams = await buildImageParams(
          requestPrompt,
          model,
          requestUpload,
          aspectRatio,
          capability?.imageRequestMode,
          options.imageSize,
          capability?.imageReferenceMode,
          options.imageResolution,
        )

        if (requestedBatchSize === 1) {
          const result = await generateImage(imageParams)
          const imageResult = buildImageResult(result, model, aspectRatio, capability, outputSize, mossLayout, layoutSkipped)
          chatStore.updateMessage(assistantId, {
            generateStatus: 'completed',
            generateResult: imageResult,
            generateResults: [imageResult],
            progress: 100,
          })
          return
        }

        const imageResults: GenerateResult[] = []
        const imageErrors: string[] = []

        // 所有图片模型统一走并发单张请求：出图更快，也能单张滚动展示进度。
        const imageTasks = Array.from({ length: requestedBatchSize }, async () => {
          const result = await generateImage({ ...imageParams })
          const imageResult = buildImageResult(result, model, aspectRatio, capability, outputSize, mossLayout, layoutSkipped)
          imageResults.push(imageResult)
          // 出一张显示一张，不必等整批完成。
          chatStore.updateMessage(assistantId, {
            generateResult: imageResults[0],
            generateResults: [...imageResults],
            progress: Math.min(99, Math.round((imageResults.length / requestedBatchSize) * 100)),
          })
          return imageResult
        })
        const imageSettled = await Promise.allSettled(imageTasks)
        for (const item of imageSettled) {
          if (item.status === 'rejected') {
            imageErrors.push(normalizeErrorMessage(item.reason, '部分图片生成失败'))
          }
        }

        if (!imageResults.length) {
          throw new Error(imageErrors[0] || '批量图片生成失败，请稍后重试。')
        }

        chatStore.updateMessage(assistantId, {
          generateStatus: 'completed',
          generateResult: imageResults[0],
          generateResults: imageResults,
          partialError: describeBatchFailure(imageResults.length, requestedBatchSize, imageErrors),
          progress: 100,
        })
        return
      }

      // 全局视频预算：任务创建 + 轮询合计不超过 1 小时，批量任务共享同一截止时间。
      const videoDeadline = Date.now() + GLOBAL_VIDEO_TIMEOUT_MS

      const videoParams = await buildVideoParams(
        effectivePrompt,
        model,
        uploadedFile,
        aspectRatio,
        duration,

        capability?.videoRequestMode,
        // Kling 系列「是否生成声音」：开启则 audio=native，否则 off（默认）。
        klingSound ? 'on' : 'off',
        videoResolution,
        options.videoGenerationMode ?? null
      )

      // 多模态参考素材会显著拉长创建与生成耗时，用于放宽轮询预算。
      const hasReferenceMedia = Array.isArray(uploadedFile)
        ? uploadedFile.length > 0
        : !!uploadedFile

      if (requestedBatchSize === 1) {
        const task = await generateVideo(videoParams)
        if (!task.id) {
          throw new Error('视频任务创建成功但未返回任务 ID，请稍后重试或切换模型。')
        }
        chatStore.updateMessage(assistantId, { generateStatus: 'processing' })

        const finalStatus = await pollVideoStatus(
          task.id,
          (progress) => {
            chatStore.updateMessage(assistantId, { progress })
          },
          {
            provider: task.provider,
            providerCreateEndpoint: task.providerCreateEndpoint,
            duration,
            resolution: videoResolution,
            hasReferenceMedia,
            deadline: videoDeadline,
          },
        )

        const videoResult = buildVideoResult(finalStatus, model, aspectRatio)
        chatStore.updateMessage(assistantId, {
          generateStatus: 'completed',
          generateResult: videoResult,
          generateResults: [videoResult],
          progress: 100,
        })
        return
      }

      const videoTasks: Awaited<ReturnType<typeof generateVideo>>[] = []
      const videoCreateErrors: string[] = []
      const videoCreateSettled = await Promise.allSettled(
        Array.from({ length: requestedBatchSize }, () => generateVideo({ ...videoParams }))
      )
      for (const item of videoCreateSettled) {
        if (item.status === 'rejected') {
          videoCreateErrors.push(normalizeErrorMessage(item.reason, '部分视频任务创建失败'))
          continue
        }
        if (!item.value.id) {
          videoCreateErrors.push('视频任务创建成功但未返回任务 ID。')
          continue
        }
        videoTasks.push(item.value)
      }

      if (!videoTasks.length) {
        throw new Error(videoCreateErrors[0] || '批量视频任务创建失败，请稍后重试。')
      }

      chatStore.updateMessage(assistantId, {
        generateStatus: 'processing',
        progress: Math.max(2, Math.round((videoTasks.length / requestedBatchSize) * 10)),
      })

      const videoTaskProgress = videoTasks.map(() => 0)
      const videoTaskCompleted = videoTasks.map(() => false)
      // 按任务下标占位，保证结果顺序稳定（完成顺序可能乱序）。
      const orderedVideoResults: (GenerateResult | undefined)[] = new Array(videoTasks.length)
      const videoPollErrors: string[] = []

      const currentVideoResults = () => (
        orderedVideoResults.filter((item): item is GenerateResult => !!item)
      )

      const updateVideoBatchProgress = () => {
        const overall = videoTasks.reduce((sum, _task, index) => (
          sum + (videoTaskCompleted[index] ? 100 : Math.max(0, Math.min(100, videoTaskProgress[index])))
        ), 0)
        chatStore.updateMessage(assistantId, {
          progress: Math.min(99, Math.round(overall / videoTasks.length)),
        })
      }

      // 生成成功一个就立刻返回一个：每完成/失败一个任务就刷新一次消息，界面无需等整批结束。
      const publishVideoResults = () => {
        const completed = currentVideoResults()
        chatStore.updateMessage(assistantId, {
          generateResult: completed[0],
          generateResults: completed,
          partialError: describeBatchFailure(
            completed.length,
            requestedBatchSize,
            [...videoCreateErrors, ...videoPollErrors],
          ),
        })
      }

      const videoPollTasks = videoTasks.map(async (task, index) => {
        try {
          const finalStatus = await pollVideoStatus(
            task.id,
            (progress) => {
              videoTaskProgress[index] = progress
              updateVideoBatchProgress()
            },
            {
              provider: task.provider,
              providerCreateEndpoint: task.providerCreateEndpoint,
              duration,
              resolution: videoResolution,
              hasReferenceMedia,
              deadline: videoDeadline,
            },
          )
          const videoResult = buildVideoResult(finalStatus, model, aspectRatio)
          orderedVideoResults[index] = videoResult
          return videoResult
        } catch (error) {
          videoPollErrors.push(normalizeErrorMessage(error, '部分视频生成失败'))
          throw error
        } finally {
          videoTaskCompleted[index] = true
          updateVideoBatchProgress()
          publishVideoResults()
        }
      })

      await Promise.allSettled(videoPollTasks)

      const videoResults = currentVideoResults()
      const allVideoErrors = [...videoCreateErrors, ...videoPollErrors]
      if (!videoResults.length) {
        throw new Error(allVideoErrors[0] || '批量视频生成失败，请稍后重试。')
      }

      chatStore.updateMessage(assistantId, {
        generateStatus: 'completed',
        generateResult: videoResults[0],
        generateResults: videoResults,
        partialError: describeBatchFailure(videoResults.length, requestedBatchSize, allVideoErrors),
        progress: 100,
      })
    } catch (e: unknown) {
      const isTimeout = e instanceof Error && (e.message.includes('timeout') || e.message.includes('超时'))
      const errorMessage = isTimeout
        ? (e instanceof Error && (e.message.startsWith('视频生成超时') || e.message.startsWith('视频生成已经超时'))
            ? e.message
            : '生成超时，请更换模型或重试')
        : normalizeErrorMessage(e, '生成失败，请重试')
      chatStore.updateMessage(assistantId, {
        generateStatus: 'failed',
        error: errorMessage,
      })
      showErrorMessage(errorMessage, '生成失败，请重试')
    } finally {
      chatStore.isGenerating = false
    }
  }

  return { generate }
}
