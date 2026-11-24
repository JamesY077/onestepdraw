/**
 * 工作区：按「本地目录」给对话与项目分组。
 *
 * 参考 DeepSeek Harness 的工作区模型：
 * - 每个工作区对应一个磁盘目录，对话与项目都归属于它；
 * - 首次使用自动创建一个默认工作区，位于用户文档目录下；
 * - 用户也可以指定自己的本地目录，同一个目录只会登记一次。
 */

export interface Workspace {
  id: string
  /** 用户看到的名称，默认取目录名。 */
  title: string
  /** 磁盘上的绝对路径；默认工作区也使用真实路径。 */
  path: string
  /** 是否为自动创建的默认工作区（不可删除）。 */
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

/** 默认工作区在文档目录下的固定子目录名。 */
export const DEFAULT_WORKSPACE_FOLDER = 'stepframe'

/** 新对话、新项目在找不到归属时落到这里。 */
export const UNASSIGNED_WORKSPACE_TITLE = '未分类'

/** 由路径推断显示名：取最后一段目录名。 */
export function workspaceTitleFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed || '工作区'
}

/** 判断两个路径是否指向同一目录（忽略大小写差异与尾部分隔符）。 */
export function sameWorkspacePath(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/[\\/]+$/, '').toLowerCase()
  return normalize(a) === normalize(b)
}
