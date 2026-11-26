import { createSeedanceProvider } from '@/api/providers/video/seedanceShared'
import type { VideoModelModule } from '../types'
import { createModelExample } from '../types'

/**
 * Doubao-Seedance-2.5：Seedance 2 系列模型，能力与 Doubao-Seedance-2.0 一致。
 * 仅 AI Ping 白名单账号生成的 API Key 才能成功调用，非白名单用户会被上游拒绝。
 */
export const doubaoSeedance25Model: VideoModelModule = {
  id: 'Doubao-Seedance-2.5',
  displayName: 'Doubao-Seedance-2.5',
  capability: {
    mediaType: 'video',
    inputs: ['text', 'image'],
    localUploadInputs: ['image'],
    availabilityNote: 'supports-image-upload',
    videoRequestMode: 'seedance-2',
    // 实测上限：4-30s（2.5 支持更长）
    videoDurations: [4, 5, 6, 8, 10, 12, 15, 20, 25, 30],
    videoResolutions: ['480p', '720p', '1080p', '4k'],
  },
  adapter: createSeedanceProvider('Doubao-Seedance-2.5'),
  example: createModelExample({
    title: 'Doubao-Seedance-2.5 视频生成示例',
    description: '使用 Doubao-Seedance-2.5 生成视频，支持传入参考图（素材）。仅 AI Ping 白名单账号可用。',
    request: {
      model: 'Doubao-Seedance-2.5',
      prompt: '清新奶油画风短剧，轻快吉他卡点快切，奶油白主色 + 蜜桃粉高光，画面柔和无特效',
      aspect_ratio: '16:9',
      duration: 8,
      audio: true,
      watermark: false,
    },
    code: `import { generateVideo } from '@/api/aiping'

await generateVideo({
  model: 'Doubao-Seedance-2.5',
  prompt: '清新奶油画风短剧，轻快吉他卡点快切，奶油白主色 + 蜜桃粉高光，画面柔和无特效',
  aspect_ratio: '16:9',
  duration: 8,
  audio: true,
  watermark: false,
})`,
  }),
}
