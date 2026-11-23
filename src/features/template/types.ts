import type { AgentAttachment } from '@/types/agent'

/** 模板分类。 */
export interface TemplateCategory {
  id: string
  label: string
  labelEn: string
}

/** 从风格库整理出来的内置模板。 */
export interface BuiltinTemplate {
  /** 稳定 id，例如 ca-b3。 */
  id: string
  /** 素材编号，例如 B3。 */
  code: string
  name: string
  nameEn: string
  category: string
  categoryEn: string
  demo: string
  /** 打包后的预览图地址。 */
  poster: string
  /** 是否有参考静帧；false 时 poster 是生成的「文字参考」占位图。 */
  still: boolean
  /** 风格提示词摘要，应用模板时一起交给模型。 */
  guide: string
}

/** 用户自己建立的一组参考素材。 */
export interface UserTemplateGroup {
  id: string
  name: string
  note: string
  createdAt: number
  updatedAt: number
  assets: AgentAttachment[]
}
