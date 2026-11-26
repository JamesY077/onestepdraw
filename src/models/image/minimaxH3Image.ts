import {
  buildMinimaxH3ImageRequestBody,
  getMinimaxH3ImageEndpoint,
  MINIMAX_H3_IMAGE_GENERATIONS_ENDPOINT,
  MINIMAX_H3_IMAGE_REFERENCE_LIMIT,
} from '@/api/providers/image/minimaxH3Shared'
import type { ImageModelModule } from '../types'
import { createModelExample } from '../types'

function createMinimaxH3ImageModel(
  id: 'MiniMax-H3-Image' | 'MiniMax-H3-Image-Highspeed',
  displayName: string,
  description: string,
): ImageModelModule {
  return {
    id,
    displayName,
    capability: {
      mediaType: 'image',
      inputs: ['text', 'image'],
      localUploadInputs: ['image'],
      availabilityNote: 'supports-image-upload',
      imageRequestMode: 'minimax-h3',
      imageResolutions: ['1K', '2K', '4K'],
      // 图像编辑支持 1–16 张参考图；数组顺序对应提示词中的 @图片N。
      imageReferenceMode: 'multi',
      imageReferenceLimit: MINIMAX_H3_IMAGE_REFERENCE_LIMIT,
    },
    adapter: {
      provider: 'minimax',
      models: [id],
      endpoint: MINIMAX_H3_IMAGE_GENERATIONS_ENDPOINT,
      getEndpoint: getMinimaxH3ImageEndpoint,
      buildRequestBody: (params) => buildMinimaxH3ImageRequestBody(params, id),
    },
    example: createModelExample({
      title: `${displayName} 文生图示例`,
      description,
      request: {
        model: id,
        prompt: '一只橘猫趴在窗台上晒太阳，午后暖光，胶片质感',
        size: '2720x1536',
        n: 2,
        response_format: 'url',
      },
      code: `import { generateImage } from '@/api/aiping'

await generateImage({
  model: '${id}',
  prompt: '一只橘猫趴在窗台上晒太阳，午后暖光，胶片质感',
  size: '2720x1536',
  n: 2,
  response_format: 'url',
})`,
    }),
  }
}

/** MiniMax H3 Image：文生图与 1–16 张参考图编辑，尺寸使用 WxH。 */
export const minimaxH3ImageModel = createMinimaxH3ImageModel(
  'MiniMax-H3-Image',
  'MiniMax H3 Image',
  '使用 MiniMax-H3-Image 标准质量模型生成图片，可通过 n 一次请求多张结果。',
)

/** 高速版与标准版共用请求协议，仅模型 ID 不同。 */
export const minimaxH3ImageHighspeedModel = createMinimaxH3ImageModel(
  'MiniMax-H3-Image-Highspeed',
  'MiniMax H3 Image Highspeed',
  '使用 MiniMax-H3-Image-Highspeed 高速模型生成图片，适合对生成延迟敏感的场景。',
)
