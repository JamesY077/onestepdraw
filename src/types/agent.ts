/** 对话角色：当前只保留用户与助手两种。 */
export type AgentRole = 'user' | 'assistant'

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

/** 发送给 /chat/completions 的消息结构。 */
export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
