import type { UploadedFile } from '@/types/chat'
import type { ModelCapability, VideoGenerationMode } from '@/types/model'
import type { ImageGenerateRequest, VideoGenerateRequest } from '@/types/api'
import { aspectRatioToDimensions, aspectRatioToImageSize } from '@/features/generate/aspectRatio'
import { fileToBase64, toRawBase64 } from '@/features/generate/files'
import { setVideoRatio, deleteVideoRatio } from '@/features/generate/video'

export type ImageRequestMode = NonNullable<ModelCapability['imageRequestMode']>
export type UploadInput = UploadedFile | UploadedFile[] | null | undefined

function getKlingAspectRatio(aspectRatio: string): string {
  if (['16:9', '9:16', '1:1'].includes(aspectRatio)) return aspectRatio
  throw new Error('当前可灵视频模型仅支持 16:9、9:16、1:1，请切换比例或模型后重试。')
}

export async function buildImageParams(
  prompt: string,
  model: string | null,
  uploadedFile: UploadInput,
  aspectRatio: string,
  mode: ImageRequestMode | undefined,
  sizeOverride?: string,
  /** 'multi' 时把多张参考图作为 image 数组下发（Seedream 5.0 Lite 支持）。 */
  imageReferenceMode?: ModelCapability['imageReferenceMode']
): Promise<ImageGenerateRequest> {
  const uploadedFiles = Array.isArray(uploadedFile) ? uploadedFile : uploadedFile ? [uploadedFile] : []
  const uploadValues = (await Promise.all(
    uploadedFiles.map(async (file) => (file.file ? fileToBase64(file.file) : file.url))
  )).filter((value): value is string => !!value)
  const imageInput = uploadValues[0]
  const isMultiImage = imageReferenceMode === 'multi'

  const imageParams: ImageGenerateRequest = {
    prompt,
    model: model || undefined,
    image: isMultiImage
      ? (uploadValues.length ? uploadValues : undefined)
      : imageInput,
    size: aspectRatioToImageSize(aspectRatio),
  }

  if (mode === 'moss') {
    // Moss 仅支持文生图：size 必须用 WxH，且不接受 image / width / height /
    // output_format / watermark，因此这里只保留提示词和尺寸。
    imageParams.size = aspectRatioToImageSize(aspectRatio, 'moss')
    delete imageParams.image
    delete imageParams.width
    delete imageParams.height
  } else if (mode === 'minimax-h3') {
    // MiniMax H3 Image 文生图使用 OpenAI 兼容协议，仅下发其明确支持的参数。
    imageParams.size = aspectRatioToImageSize(aspectRatio, mode, 'x')
    imageParams.response_format = 'url'
    delete imageParams.image
    delete imageParams.width
    delete imageParams.height
    delete imageParams.output_format
    delete imageParams.watermark
  } else if (mode && mode !== 'default') {
    const { width, height } = aspectRatioToDimensions(aspectRatio, mode)
    imageParams.output_format = 'png'
    imageParams.watermark = false
    if (mode === 'seedream-5-lite') {
      imageParams.size = aspectRatioToImageSize(aspectRatio, mode, 'x')
      // Seedream 5 固定单图输出：批量生成由前端并发请求实现，
      // 避免上游按 prompt 意图额外输出组图（组图会明显拉长耗时）。
      imageParams.sequential_image_generation = 'disabled'
      delete imageParams.width
      delete imageParams.height
    } else {
      imageParams.size = undefined
      imageParams.width = width
      imageParams.height = height
    }
  }

  // 扩图需要与预扩画布保持同一目标尺寸；只在明确传入时覆盖。
  if (sizeOverride) {
    imageParams.size = sizeOverride
    delete imageParams.width
    delete imageParams.height
  }

  return imageParams
}

export async function buildVideoParams(
  prompt: string,
  model: string | null,
  uploadedFile: UploadInput,
  aspectRatio: string,
  duration: number,
  videoRequestMode: ModelCapability['videoRequestMode'],
  // 可灵声音开关：新协议使用 sound=on/off。
  klingSound: 'on' | 'off' = 'off',
  // 视频分辨率档位（当前仅 MiniMax-H3 使用：768P / 2K）。
  videoResolution: string | null = null,
  // 视频生成方式（文生 / 图生 / 首尾帧 / 参考 / 编辑等），部分模型需要据此改写参数。
  videoGenerationMode: VideoGenerationMode | null = null
): Promise<VideoGenerateRequest> {

  const uploadedFiles = (Array.isArray(uploadedFile) ? uploadedFile : uploadedFile ? [uploadedFile] : [])
  const uploadValues = await Promise.all(
    uploadedFiles.map(async (file) => (file.file ? fileToBase64(file.file) : file.url))
  )
  const primaryFile = uploadedFiles[0]
  const uploadValue = uploadValues[0]

  const videoParams: VideoGenerateRequest = {
    prompt,
    model: model || undefined,
    duration,
    resolution: '1080p',
  }
  setVideoRatio(videoParams, aspectRatio)

  switch (videoRequestMode) {
    case 'kling-v26':
    case 'kling-v3':
      if (uploadedFiles.some((file) => file.purpose?.startsWith('motion-control'))) {
        const referenceImageIndex = uploadedFiles.findIndex((file) => file.purpose === 'motion-control-image' || file.type === 'image')
        const referenceVideoIndex = uploadedFiles.findIndex((file) => file.purpose === 'motion-control-video' || file.type === 'video')
        const referenceImage = referenceImageIndex >= 0 ? uploadValues[referenceImageIndex] : undefined
        const referenceVideo = referenceVideoIndex >= 0 ? uploadValues[referenceVideoIndex] : undefined
        const motionControlOptions = uploadedFiles.find((file) => file.motionControlOptions)?.motionControlOptions

        if (!referenceImage || !referenceVideo) {
          throw new Error('动作控制需要同时上传参考图像和参考视频。')
        }

        videoParams.motion_control = true
        videoParams.image_url = referenceImage
        videoParams.video_url = referenceVideo
        videoParams.keep_original_sound = motionControlOptions?.keep_original_sound || 'yes'
        videoParams.character_orientation = motionControlOptions?.character_orientation || 'image'
        videoParams.mode = 'pro'
        videoParams.model_name = model || undefined
        delete videoParams.image
        delete videoParams.img_url
        deleteVideoRatio(videoParams)
        delete videoParams.resolution
        delete videoParams.duration
        break
      }

      if (uploadValues.length >= 2) {
        // 首尾帧生视频：首帧作为 image，尾帧作为 image_tail。
        videoParams.image = uploadValues[0]
        videoParams.image_tail = uploadValues[1]
        // 声音字段跟随开关：可灵新协议为 on/off。
        videoParams.sound = klingSound
        deleteVideoRatio(videoParams)
      } else if (uploadValue) {
        videoParams.image = uploadValue
        // 声音字段跟随开关：可灵新协议为 on/off。
        videoParams.sound = klingSound
        deleteVideoRatio(videoParams)
      } else {
        // 声音字段跟随开关：可灵新协议为 on/off。
        videoParams.sound = klingSound
        setVideoRatio(videoParams, getKlingAspectRatio(aspectRatio))
      }
      videoParams.model_name = model || undefined
      break


    case 'kling-omni': {
      // Kling V3-Omni / Video-O1：omni-video 接口。
      // - 首尾帧生视频：image_list 中带 first_frame / end_frame 标记。
      // - 参考生视频：多张参考图作为无 type 的 image_list（多图主体，上限 7）。
      videoParams.model_name = model || undefined
      videoParams.mode = 'pro'
      videoParams.sound = klingSound
      setVideoRatio(videoParams, getKlingAspectRatio(aspectRatio))

      const startFrameIndex = uploadedFiles.findIndex((file) => file.purpose === 'start-frame')
      const endFrameIndex = uploadedFiles.findIndex((file) => file.purpose === 'end-frame')
      const hasFrameUploads = startFrameIndex >= 0 || endFrameIndex >= 0

      if (hasFrameUploads) {
        const frameImages: Array<{ image_url: string; type: 'first_frame' | 'end_frame' }> = []
        if (startFrameIndex >= 0 && uploadValues[startFrameIndex]) {
          frameImages.push({ image_url: uploadValues[startFrameIndex] as string, type: 'first_frame' })
        }
        if (endFrameIndex >= 0 && uploadValues[endFrameIndex]) {
          frameImages.push({ image_url: uploadValues[endFrameIndex] as string, type: 'end_frame' })
        }
        videoParams.image_list = frameImages
      } else if (uploadValues.length) {
        // 参考生视频：参考图片列表（多图主体）。
        videoParams.image_list = uploadValues
          .filter((value): value is string => !!value)
          .map((value) => ({ image_url: value }))
      }
      delete videoParams.resolution
      break
    }


    case 'kling-o1':
      if (primaryFile?.type === 'image' && uploadValue) {
        videoParams.first_frame_url = primaryFile.file ? toRawBase64(uploadValue) : uploadValue
        deleteVideoRatio(videoParams)
      } else if (primaryFile?.type === 'video' && primaryFile.url) {
        videoParams.video_list = [primaryFile.url]
        deleteVideoRatio(videoParams)
      } else {
        setVideoRatio(videoParams, getKlingAspectRatio(aspectRatio))
      }
      break
    case 'kling-v4': {
      // 可灵 4.0 新版接口：
      // - 文生视频：prompt + settings.aspect_ratio；
      // - 图生视频：首帧 / 首尾帧（Kling-4.0 支持尾帧，Flash 仅首帧）；
      // - 全能参考：reference_images 交给 omni-video。
      const isFlash = (model || '').toLowerCase() === 'kling-4.0-flash'
      const maxDuration = isFlash ? 20 : 30
      videoParams.model_name = model || undefined
      videoParams.duration = Math.min(maxDuration, Math.max(3, Math.round(duration || 5)))
      videoParams.resolution = isFlash
        ? '720p'
        : videoResolution === '720p'
          ? '720p'
          : '1080p'

      if (videoGenerationMode === 'referenceImage2video') {
        const referenceImages = uploadValues.filter((value): value is string => !!value).slice(0, 10)
        if (referenceImages.length) videoParams.reference_images = referenceImages
        videoParams.aspect_ratio = aspectRatio || '16:9'
        delete videoParams.ratio
      } else if (videoGenerationMode === 'startEnd2video') {
        // 首尾帧：比例由首帧决定，不传 aspect_ratio / ratio。
        if (uploadValues[0]) videoParams.image = uploadValues[0]
        if (uploadValues[1] && !isFlash) videoParams.image_tail = uploadValues[1]
        deleteVideoRatio(videoParams)
      } else if (uploadValue) {
        // 图生视频：比例由首帧决定。
        videoParams.image = uploadValue
        deleteVideoRatio(videoParams)
      } else {
        videoParams.aspect_ratio = aspectRatio || '16:9'
        delete videoParams.ratio
      }

      delete videoParams.seconds
      delete videoParams.mode
      delete videoParams.sound
      delete videoParams.keep_original_sound
      delete videoParams.character_orientation
      delete videoParams.motion_control
      delete videoParams.image_url
      delete videoParams.image_list
      delete videoParams.images
      delete videoParams.img_url
      delete videoParams.first_frame_image
      delete videoParams.last_frame_image
      delete videoParams.first_frame_url
      delete videoParams.last_frame_url
      delete videoParams.start_image
      delete videoParams.end_image
      delete videoParams.subject_reference
      delete videoParams.video_url
      delete videoParams.video_list
      delete videoParams.audio
      delete videoParams.movement_amplitude
      delete videoParams.off_peak
      delete videoParams.seed
      delete videoParams.style
      delete videoParams.payload
      delete videoParams.extra_body
      break
    }
    case 'viduq3-fast':
      if (uploadValues.length) {
        videoParams.images = uploadValues.slice(0, 2)
        videoParams.resolution = '1080p'
        videoParams.movement_amplitude = 'auto'
      } else {
        videoParams.aspect_ratio = aspectRatio || '4:3'
        videoParams.resolution = '1080p'
        videoParams.style = 'general'
        videoParams.movement_amplitude = 'auto'
      }
      delete videoParams.image
      delete videoParams.img_url
      delete videoParams.first_frame_url
      delete videoParams.last_frame_url
      delete videoParams.reference_images
      delete videoParams.video_list
      delete videoParams.ratio
      delete videoParams.size
      delete videoParams.audio
      delete videoParams.off_peak
      delete videoParams.watermark
      delete videoParams.extra_body
      break
    case 'minimax-hailuo':
      if (uploadValues.length >= 2) {
        videoParams.first_frame_image = uploadValues[0]
        videoParams.last_frame_image = uploadValues[1]
      } else if (uploadValue) {
        if (primaryFile?.type === 'image' && primaryFile?.name === 'Subject Reference') {
          videoParams.subject_reference = [
            {
              type: 'character',
              image: [uploadValue],
            },
          ]
        } else {
          videoParams.first_frame_image = uploadValue
        }
      }
      if (videoParams.subject_reference) {
        // S2V-01 主体参考只接受 subject_reference，不接受比例 / 时长 / 分辨率，
        // 多传会被上游判为参数非法（实测 400）。
        delete videoParams.duration
        delete videoParams.resolution
        delete videoParams.seconds
        delete videoParams.size
      } else {
        videoParams.duration = duration || 6
        // Hailuo 2.3：10s 仅支持 768P，6s 才可选 1080P。
        videoParams.resolution = videoParams.duration >= 10 ? '768P' : '1080P'
      }
      deleteVideoRatio(videoParams)
      delete videoParams.seconds
      delete videoParams.size
      delete videoParams.image
      delete videoParams.images
      delete videoParams.img_url
      delete videoParams.first_frame_url
      delete videoParams.last_frame_url
      delete videoParams.reference_images
      delete videoParams.video_list
      delete videoParams.audio
      delete videoParams.movement_amplitude
      delete videoParams.off_peak
      delete videoParams.watermark
      delete videoParams.seed
      delete videoParams.style
      delete videoParams.payload
      delete videoParams.extra_body
      break
    case 'minimax-h3': {
      // MiniMax-H3 走 /multimodal/minimax/videos/video_generation，content 数组协议。
      // - 首尾帧生视频：purpose 为 start-frame / end-frame 的图片分别对应 first_frame / last_frame。
      // - 图生视频：单张图片作为首帧（first_frame_image）。
      // - 多模态参考：purpose 为 multimodal-image/-video/-audio 的素材按类型归类。
      const startFrameIndex = uploadedFiles.findIndex((file) => file.purpose === 'start-frame')
      const endFrameIndex = uploadedFiles.findIndex((file) => file.purpose === 'end-frame')
      const hasFrameUploads = startFrameIndex >= 0 || endFrameIndex >= 0

      if (hasFrameUploads) {
        if (startFrameIndex >= 0 && uploadValues[startFrameIndex]) {
          videoParams.first_frame_image = uploadValues[startFrameIndex]
        }
        if (endFrameIndex >= 0 && uploadValues[endFrameIndex]) {
          videoParams.last_frame_image = uploadValues[endFrameIndex]
        }
        // 纯尾帧生视频：只传尾帧（role=last_frame），不当作首帧。
        if (endFrameIndex >= 0 && startFrameIndex < 0 && uploadValues[endFrameIndex]) {
          delete videoParams.first_frame_image
        }
      } else if (uploadedFiles.some((file) => file.purpose?.startsWith('multimodal-'))) {
        const referenceImages: string[] = []
        const referenceVideos: string[] = []
        const referenceAudios: string[] = []
        uploadedFiles.forEach((file, index) => {
          const value = uploadValues[index]
          if (!value) return
          if (file.purpose === 'multimodal-video' || file.type === 'video') {
            referenceVideos.push(value)
          } else if (file.purpose === 'multimodal-audio' || file.type === 'audio') {
            referenceAudios.push(value)
          } else {
            referenceImages.push(value)
          }
        })
        if (referenceImages.length) videoParams.reference_images = referenceImages
        if (referenceVideos.length) videoParams.reference_videos = referenceVideos
        if (referenceAudios.length) videoParams.reference_audios = referenceAudios
      } else if (uploadValue) {
        videoParams.first_frame_image = uploadValue
      }

      videoParams.duration = duration || 5
      videoParams.resolution = videoResolution === '2K' ? '2K' : '768P'
      delete videoParams.seconds
      delete videoParams.size
      delete videoParams.image
      delete videoParams.images
      delete videoParams.img_url
      delete videoParams.image_url
      delete videoParams.image_list
      delete videoParams.video_url
      delete videoParams.video_list
      delete videoParams.subject_reference
      delete videoParams.audio
      delete videoParams.movement_amplitude
      delete videoParams.off_peak
      delete videoParams.seed
      delete videoParams.style
      delete videoParams.payload
      delete videoParams.extra_body
      break
    }
    case 'seedance-2': {
      // Seedance 2.0 走「素材 + contents/generations/tasks」接口。
      // 多模态参考模式下，前端会用 purpose（multimodal-image/-video/-audio）标记素材，
      // 这里按类别分别放入 reference_images / reference_videos / reference_audios，
      // 交由 seedance provider / aiping.ts 处理成素材（asset://）并组装 content 数组。
      // 图生视频等模式上传的普通图片（无 purpose）默认归为参考图。
      const referenceImages: string[] = []
      const referenceVideos: string[] = []
      const referenceAudios: string[] = []
      uploadedFiles.forEach((file, index) => {
        const value = uploadValues[index]
        if (!value) return
        if (file.purpose === 'multimodal-video' || (!file.purpose && file.type === 'video')) {
          referenceVideos.push(value)
        } else if (file.purpose === 'multimodal-audio' || (!file.purpose && file.type === 'audio')) {
          referenceAudios.push(value)
        } else {
          referenceImages.push(value)
        }
      })
      if (referenceImages.length) videoParams.reference_images = referenceImages
      if (referenceVideos.length) videoParams.reference_videos = referenceVideos
      if (referenceAudios.length) videoParams.reference_audios = referenceAudios

      videoParams.duration = duration || 5
      videoParams.audio = true
      videoParams.watermark = false
      deleteVideoRatio(videoParams)
      videoParams.aspect_ratio = aspectRatio || '16:9'
      if (referenceVideos.length) {
        // 带参考视频时，上游可能把任务判定为「视频续写/延长」，此时输出比例必须跟随
        // 参考视频（只接受 adaptive），传 16:9 等固定比例会在创建阶段被拒。
        videoParams.aspect_ratio = 'adaptive'
      }
      if (videoGenerationMode === 'editVideo') {
        // Seedance 编辑视频：输出比例与时长必须跟随被编辑的输入视频，
        // 上游只接受 ratio=adaptive、duration=-1（输入视频需 4-30s）。
        videoParams.aspect_ratio = 'adaptive'
        videoParams.duration = -1
      }
      delete videoParams.image
      delete videoParams.img_url
      delete videoParams.images
      delete videoParams.first_frame_url
      delete videoParams.last_frame_url
      delete videoParams.resolution
      delete videoParams.movement_amplitude
      delete videoParams.off_peak
      delete videoParams.seed
      delete videoParams.style
      delete videoParams.payload
      delete videoParams.extra_body
      break
    }
    default:
      if (uploadValue) videoParams.img_url = uploadValue
      break
  }


  return videoParams
}
