/** 对话角色：当前只保留用户与助手两种。 */
export type AgentRole = 'user' | 'assistant'

/** 用户上传的参考素材类型。 */
export type AgentAttachmentKind = 'image' | 'video' | 'audio' | 'file'

/** 一轮对话里附带的参考素材；图片会压缩，视频会额外抽取关键帧。 */
export interface AgentAttachment {
  id: string
  kind: AgentAttachmentKind
  name: string
  mime: string
  size: number
  /** 预览 / 播放地址，可能是 data: 或本地服务上的 /generated/uploads 地址。 */
  url: string
  /** 上传到本地服务后的绝对路径，本机 Agent 可以直接读取。 */
  path?: string
  duration?: number
  width?: number
  height?: number
  /** 文本类文件截取的内容，供模型直接参考。 */
  text?: string
  /** 视频抽出的关键帧（data URL）。 */
  frames?: string[]
  createdAt: number
}

/** 应用在输入框上的模板参考。 */
export interface AgentTemplateRef {
  id: string
  name: string
  category: string
  /** 风格说明正文，会随消息一起交给模型。 */
  guide: string
  /** 参考图（内置模板为打包资源，自定义模板为上传地址）。 */
  images: string[]
  /** 自定义模板组里的完整参考素材；内置模板只有 images。 */
  assets?: AgentAttachment[]
  source: 'builtin' | 'custom'
}

/**
 * 时间轴片段快照：只描述用户选中的片段。
 * 选中片段发给 AI 时用它做上下文，避免把整条时间轴都塞进这一轮请求。
 */
export interface AgentClipRef {
  id: string
  name: string
  kind: 'video' | 'image' | 'audio'
  trackId: string
  trackName: string
  trackKind: 'video' | 'overlay' | 'audio'
  /** 秒。 */
  start: number
  /** 秒。 */
  duration: number
  url: string
  thumbnail?: string
  trimStart?: number
  volume?: number
  opacity?: number
  /** 素材库里的原始名字，方便模型理解画面来源。 */
  assetName?: string
  /** 用户为这一段写的修改意见；多段排队发送时逐段带上。 */
  note?: string
}

/** 输入框一次提交的内容。 */
export interface ComposerSubmit {
  content: string
  attachments: AgentAttachment[]
  /** 本轮引用的模板，可以多个，互不覆盖。 */
  templates?: AgentTemplateRef[]
}

/** 单条消息状态：流式输出中 / 已完成 / 已停止 / 失败。 */
export type AgentMessageStatus = 'streaming' | 'done' | 'stopped' | 'error'

export type AgentGenerationKind = 'image' | 'video'
export type AgentGenerationStatus = 'running' | 'succeeded' | 'failed'

/** 对话 Agent 调用本机生成能力后附在消息上的结果卡片。 */
export interface AgentGeneration {
  id: string
  kind: AgentGenerationKind
  status: AgentGenerationStatus
  prompt: string
  model: string
  modelLabel: string
  aspectRatio: string
  resolution?: string
  duration?: number
  /** 视频任务的轮询进度（0-100），上游不返回时为 undefined。 */
  progress?: number
  images?: string[]
  videoUrl?: string
  thumbnail?: string
  error?: string
  createdAt: number
  /** 素材是否已自动加入创作对话的剪辑项目。 */
  attachedToProject?: boolean
}

/** Agent 向用户提的单个选择题，由对话里的 ```onestep-ask 块解析而来。 */
export interface AgentAskOption {
  id: string
  label: string
  recommended?: boolean
  /** 选项下面的一行补充说明，例如适用场景。 */
  hint?: string
}

export interface AgentAsk {
  header: string
  question: string
  options: AgentAskOption[]
  /** 自定义选项的说明，默认「写你自己的答案」。 */
  customHint?: string
  allowCustom: boolean
  /** 用户已选中的选项 id，'custom' 表示自己写的。 */
  answerId?: string
  /** 用户选择后的原文，用于展示。 */
  answer?: string
}

export interface AgentMessage {
  id: string
  role: AgentRole
  content: string
  /** 推理模型的思考过程（如上游返回 reasoning_content）。 */
  reasoning?: string
  /** 本机 CLI Agent 的运行日志（stderr），默认折叠展示。 */
  logs?: string
  createdAt: number
  status: AgentMessageStatus
  error?: string
  model?: string
  /** 本条回复触发的图片 / 视频生成任务。 */
  generation?: AgentGeneration
  /** 本条回复向用户提出的选择题（一次只有一个）。 */
  ask?: AgentAsk
  /** 用户这一轮上传的参考素材。 */
  attachments?: AgentAttachment[]
  /** 用户这一轮引用的模板，可以多个。 */
  templates?: AgentTemplateRef[]
  /** 用户这一轮选中的时间轴片段；有值表示只针对这些片段修改。 */
  clips?: AgentClipRef[]
}

/** 对话所在的工作模式：普通对话只聊；创作对话的结果进入剪辑项目。 */
export type AgentConversationMode = 'chat' | 'create'
/** 提问策略：默认分轮澄清；完全模式由模型自行决策并直接产出。 */
export type AgentAutomationMode = 'default' | 'auto'

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: AgentMessage[]
  /** 创作对话关联的剪辑项目。 */
  projectId?: string
  mode?: AgentConversationMode
  automation?: AgentAutomationMode
}

/** OpenAI 兼容的多模态内容片段。 */
export type AgentContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** 发送给 /chat/completions 的消息结构。 */
export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | AgentContentPart[]
}
