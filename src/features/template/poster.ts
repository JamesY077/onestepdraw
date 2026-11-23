/**
 * 模板海报都在 public/templates/ 下，属于静态文件。
 * 加一个版本号，避免浏览器把早期「文件还没生成时的 404 / HTML 回退」缓存住，
 * 导致卡片一直显示不出缩略图。
 */
const POSTER_VERSION = '4'

export function templatePosterUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('blob:')) return path
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}v=${POSTER_VERSION}`
}
