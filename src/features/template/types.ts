import type { AgentAttachment } from '@/types/agent'

/** 模板分类。 */
export interface TemplateCategory {
  id: string
  label: string
  labelEn: string
}

/** 从 lemo-opuscar 风格库整理出来的内置模板。 */
export interface BuiltinTemplate {
  /** 风格目录名，作为稳定 id。 */
  id: string
  name: string
  nameEn: string
  category: string
  categoryEn: string
  demo: string
  /** 打包后的预览图地址。 */
  poster: string
  /** STYLE.md 的正文摘要，应用模板时一起交给模型。 */
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
