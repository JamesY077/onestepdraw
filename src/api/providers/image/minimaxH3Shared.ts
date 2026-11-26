import type { ImageGenerateRequest } from '@/types/api'
import { buildOpenAiImageRequestBody } from '@/api/providers/image/common'

export const MINIMAX_H3_IMAGE_GENERATIONS_ENDPOINT = '/images/generations'
export const MINIMAX_H3_IMAGE_EDITS_ENDPOINT = '/images/edits'
export const MINIMAX_H3_IMAGE_REFERENCE_LIMIT = 16

/** 文生图走 generations；带 1–16 张参考图时走 MiniMax 原生图像编辑接口。 */
export function getMinimaxH3ImageEndpoint(params: ImageGenerateRequest): string {
  const images = Array.isArray(params.image) ? params.image : params.image ? [params.image] : []
  return images.length ? MINIMAX_H3_IMAGE_EDITS_ENDPOINT : MINIMAX_H3_IMAGE_GENERATIONS_ENDPOINT
}

/** MiniMax 编辑接口使用 images[].image_url，数组顺序与提示词中的 @图片N 一致。 */
export function buildMinimaxH3ImageRequestBody(
  params: ImageGenerateRequest,
  defaultModel: string,
): Record<string, unknown> {
  const images = Array.isArray(params.image) ? params.image : params.image ? [params.image] : []
  if (images.length > MINIMAX_H3_IMAGE_REFERENCE_LIMIT) {
    throw new Error(`MiniMax 图像编辑最多支持 ${MINIMAX_H3_IMAGE_REFERENCE_LIMIT} 张参考图。`)
  }

  const body = buildOpenAiImageRequestBody({ ...params, image: undefined }, defaultModel)
  if (images.length) {
    body.images = images.map((imageUrl) => ({ image_url: imageUrl }))
  }
  return body
}
