export type ImageRequestMode = 'default' | 'seedream-5-lite' | 'minimax-h3' | 'moss'

const ASPECT_RATIO_SIZE_MAP: Record<string, { width: number; height: number }> = {
  '21:9': { width: 1680, height: 720 },
  '16:9': { width: 1280, height: 720 },
  '3:2': { width: 1200, height: 800 },
  '4:3': { width: 1024, height: 768 },
  '1:1': { width: 1024, height: 1024 },
  '3:4': { width: 768, height: 1024 },
  '2:3': { width: 800, height: 1200 },
  '9:16': { width: 720, height: 1280 },
}

const SEEDREAM_5_LITE_SIZE_MAP: Record<string, { width: number; height: number }> = {
  '21:9': { width: 3136, height: 1344 },
  '16:9': { width: 2848, height: 1600 },
  '3:2': { width: 2496, height: 1664 },
  '4:3': { width: 2304, height: 1728 },
  '1:1': { width: 2048, height: 2048 },
  '3:4': { width: 1728, height: 2304 },
  '2:3': { width: 1664, height: 2496 },
  '9:16': { width: 1600, height: 2848 },
}

// MiniMax H3 Image 接受任意正整数尺寸；这里统一使用约 2K 像素量级。
const MINIMAX_H3_IMAGE_SIZE_MAP: Record<string, { width: number; height: number }> = {
  '21:9': { width: 3136, height: 1344 },
  '16:9': { width: 2720, height: 1536 },
  '3:2': { width: 2400, height: 1600 },
  '4:3': { width: 2304, height: 1728 },
  '1:1': { width: 2048, height: 2048 },
  '3:4': { width: 1728, height: 2304 },
  '2:3': { width: 1600, height: 2400 },
  '9:16': { width: 1536, height: 2720 },
}

export function aspectRatioToDimensions(
  aspectRatio: string,
  mode: ImageRequestMode = 'default'
): { width: number; height: number } {
  if (mode === 'seedream-5-lite') {
    return SEEDREAM_5_LITE_SIZE_MAP[aspectRatio] || SEEDREAM_5_LITE_SIZE_MAP['1:1']
  }
  if (mode === 'minimax-h3') {
    return MINIMAX_H3_IMAGE_SIZE_MAP[aspectRatio] || MINIMAX_H3_IMAGE_SIZE_MAP['1:1']
  }
  return ASPECT_RATIO_SIZE_MAP[aspectRatio] || ASPECT_RATIO_SIZE_MAP['1:1']
}

export function aspectRatioToImageSize(
  aspectRatio: string,
  mode: ImageRequestMode = 'default',
  separator: '*' | 'x' = mode === 'moss' ? 'x' : '*'
): string {
  const { width, height } = aspectRatioToDimensions(aspectRatio, mode)
  return `${width}${separator}${height}`
}

/** 从支持的画面比例中挑一个最接近上传图片实际比例的，用于编辑参考图时保持构图。 */
export function pickClosestAspectRatio(width: number, height: number): string {
  if (!width || !height) return '1:1'
  const sourceRatio = width / height
  // 只从图像模式可选的常见比例里挑，避免选出 UI 不支持的 21:9。
  const candidates = ['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16']
  let best = '1:1'
  let bestDelta = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const [w, h] = candidate.split(':').map(Number)
    if (!w || !h) continue
    const delta = Math.abs(Math.log(sourceRatio / (w / h)))
    if (delta < bestDelta) {
      bestDelta = delta
      best = candidate
    }
  }
  return best
}

export function getKlingAspectRatio(aspectRatio: string): string {
  if (['16:9', '9:16', '1:1'].includes(aspectRatio)) return aspectRatio
  throw new Error('当前可灵视频模型仅支持 16:9、9:16、1:1，请切换比例或模型后重试。')
}
