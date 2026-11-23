/** 蒸馏 Skill 库的数据结构。 */

/** 长内容来源类型。 */
export type SkillSourceType = 'book' | 'video' | 'podcast' | 'course' | 'article' | 'github'

/** Skill 主要适用的创作场景。 */
export type SkillChannel = 'chat' | 'image' | 'video' | 'copy'

export interface DistilledSkill {
  id: string
  name: string
  /** 一句话说明这个 Skill 解决什么问题。 */
  summary: string
  /** 来源类型：书籍 / 长视频 / 播客 / 课程 / 长文 / GitHub。 */
  sourceType: SkillSourceType
  /** 来源标题，例如《影响力》、吴恩达 AI for Everyone。 */
  sourceTitle: string
  /** 原始仓库或方法出处。 */
  origin?: string
  license?: string
  /** 适用场景标签。 */
  channels: SkillChannel[]
  /** 领域标签，用于搜索与展示。 */
  domains: string[]
  /** 蒸馏出的能力数量；内置卡片默认 1。 */
  skillCount?: number
  /** Skill Markdown 全文，应用到对话或生成页时使用。 */
  content: string
  kind: 'builtin' | 'user'
  createdAt?: number
}

export const SKILL_SOURCE_LABELS: Record<SkillSourceType, string> = {
  book: '书籍',
  video: '长视频',
  podcast: '播客',
  course: '课程',
  article: '长文',
  github: 'GitHub',
}

export const SKILL_CHANNEL_LABELS: Record<SkillChannel, string> = {
  chat: '对话',
  image: '图片',
  video: '视频',
  copy: '文案',
}

/** 蒸馏输入支持的内容类型。 */
export const DISTILL_SOURCE_OPTIONS: Array<{ value: SkillSourceType; label: string }> = [
  { value: 'book', label: '书籍 / 书稿' },
  { value: 'video', label: '长视频 / 课程转写' },
  { value: 'podcast', label: '播客 / 访谈' },
  { value: 'course', label: '课程讲义' },
  { value: 'article', label: '长文 / 资料集' },
]
