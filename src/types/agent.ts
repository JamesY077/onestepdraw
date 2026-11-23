/** 对话角色：当前只保留用户与助手两种。 */
export type AgentRole = 'user' | 'assistant'

/** 单条消息状态：流式输出中 / 已完成 / 已停止 / 失败。 */
export type AgentMessageStatus = 'streaming' | 'done' | 'stopped' | 'error'

export interface AgentMessage {
  id: string
  role: AgentRole
  content: string
  /** 推理模型的思考过程（如上游返回 reasoning_content）。 */
  reasoning?: string
  createdAt: number
  status: AgentMessageStatus
  error?: string
  model?: string
}

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: AgentMessage[]
}

/** 发送给 /chat/completions 的消息结构。 */
export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
