import { buildOpenAiImageRequestBody } from '@/api/providers/image/common'
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
      inputs: ['text'],
      imageRequestMode: 'minimax-h3',
    },
    adapter: {
      provider: 'minimax',
      models: [id],
      endpoint: '/images/generations',
      buildRequestBody: (params) => buildOpenAiImageRequestBody(params, id),
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

/** MiniMax H3 Image：OpenAI 兼容的同步文生图接口，尺寸使用 WxH。 */
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
