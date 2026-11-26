import type { ImageGenerateRequest } from '@/types/api'

export type ImageProviderName = 'doubao' | 'glm' | 'minimax' | 'moss'

export interface ImageProviderAdapter {
  provider: ImageProviderName
  models: string[]
  endpoint: string
  /** 部分模型的文生图与参考图编辑使用不同接口。 */
  getEndpoint?: (params: ImageGenerateRequest) => string
  buildRequestBody: (params: ImageGenerateRequest) => Record<string, unknown>
}
