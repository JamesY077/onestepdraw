/** 对话角色：当前只保留用户与助手两种。 */
export type AgentRole = 'user' | 'assistant'

/** 用户上传的参考素材类型。 */
export type AgentAttachmentKind = 'image' | 'video' | 'audio' | 'file'
export type AnimationSourceType = 'html' | 'jsx' | 'tsx'

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
export interface AgentMotionElementRef {
  /** 静态源码定位优先级：data-hf-id → id → selector。 */
  hfId?: string
  id?: string
  selector: string
  label: string
  tagName: string
  textContent?: string
  src?: string
  sourceFile: 'index.html'
  selectedAtMotionTime: number
  boundingBox: { x: number; y: number; width: number; height: number }
  /** 元素属于哪个镜头/分组，用来区分不同部分里的同名元素。 */
  sectionId?: string
  sectionLabel?: string
  sectionSelector?: string
  /** 最近的模块容器（面板 / 图层 / 字幕条），方便 AI 定位“哪个部分的哪个元素”。 */
  moduleLabel?: string
  moduleSelector?: string
  /** 从元素到镜头的容器层级，例如 `#panel > .world > #camera > #stage`。 */
  modulePath?: string
  /** 父级结构，例如 `.copy > .subtitle`。 */
  parentPath?: string
  /** 元素在源码里的起始行号（1 起始）。 */
  sourceLine?: number
  /** 源码里这一段元素的原文，可直接作为 write_motion_project patch 的 find。 */
  sourceExcerpt?: string
  /** 元素所在的画面区域，例如「左上方」「画面中央」。 */
  region?: string
  /** 人类可读的元素类型：文字 / 图片 / Logo / 图形 / 控件。 */
  role?: string
}

/** 一批修改意见与它当时选中的元素绑定，避免同一工程多条意见张冠李戴。 */
export interface AgentMotionElementEdit {
  note: string
  elements: AgentMotionElementRef[]
}

export interface AgentClipRef {
  id: string
  name: string
  kind: 'video' | 'image' | 'audio' | 'animation' | 'motion'
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
  /** 代码动画的完整源码与语言；只用于源码直改，不送入文生视频。 */
  code?: string
  codeLanguage?: AnimationSourceType
  /** 动效工程 id；Agent 用 motion 工具读写这份工程，不当作视频素材。 */
  motionId?: string
  /**
   * 本轮选择的粒度：元素级只改点选元素，片段级改整段，轨道级改整条轨道。
   * 模型据此判断修改范围，不能把元素级请求扩大成整段重做。
   */
  scope?: 'element' | 'clip' | 'track'
  /** 主画面中实际点选/框选的工程元素；仍归属于同一个片段，不伪装成多个片段。 */
  motionElements?: AgentMotionElementRef[]
  /** 每条意见对应的元素快照；同一片段多批修改时逐条绑定，不能互相覆盖。 */
  motionElementEdits?: AgentMotionElementEdit[]
}

/** 输入框一次提交的内容。 */
export interface ComposerSubmit {
  content: string
  attachments: AgentAttachment[]
  /** 本轮引用的模板，可以多个，互不覆盖。 */
  templates?: AgentTemplateRef[]
}

/** 只有 store 已真正受理消息，输入框才可以清理本次草稿。 */
export type ComposerSendAck = (accepted: boolean) => void

/** 单条消息状态：流式输出中 / 已完成 / 已停止 / 失败。 */
export type AgentMessageStatus = 'streaming' | 'done' | 'stopped' | 'error'

export type AgentGenerationKind = 'image' | 'video'
export type AgentGenerationStatus = 'running' | 'succeeded' | 'failed'

/** 用户本轮选择的生成范围：全片自动完成、只看首镜，或每批最多 4 镜后确认。 */
export type AgentStoryboardDelivery = 'full' | 'preview' | 'batch'
export type AgentProductionStatus = 'running' | 'paused' | 'done' | 'failed'
export type AgentStoryboardShotStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type AgentStoryboardReferenceStatus = 'pending' | 'running' | 'ready' | 'failed'
export type AgentStoryboardReferenceSource = 'user' | 'upload' | 'code' | 'aigc'

export interface AgentStoryboardReference {
  image?: string
  video?: string
  source: AgentStoryboardReferenceSource
  name?: string
}

/** 草案镜头在执行前独立保存参考图/视频；确认后才转换成正式制作单。 */
export interface AgentStoryboardDraftShot extends Pick<AgentStoryboardShot, 'id' | 'prompt' | 'duration'> {
  referenceImage?: string
  referenceVideo?: string
  referenceStatus: AgentStoryboardReferenceStatus
  referenceSource?: AgentStoryboardReferenceSource
  referenceName?: string
  /** 动画模式随脚本提交的可审阅 SVG 分镜源码；AIGC 不使用。 */
  referenceSvg?: string
  referenceError?: string
}

/** Agent 调用本机生成能力后附在消息上的结果卡片。 */
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
  sceneId?: string
  attempt?: number
  maxAttempts?: number
  autoRetryCount?: number
  autoRetrying?: boolean
  lastAttemptAt?: number
  /** 排队等待账号并发槽位；排队不算正在执行。 */
  queued?: boolean
  /** 已建单后保留任务 ID，轮询恢复只能查询原任务，不能重复创建。 */
  taskId?: string
  provider?: string
  providerCreateEndpoint?: string
  /** 视频任务的轮询进度（0-100），上游不返回时为 undefined。 */
  progress?: number
  images?: string[]
  videoUrl?: string
  thumbnail?: string
  error?: string
  createdAt: number
  /** 素材是否已自动加入创作对话的剪辑项目。 */
  attachedToProject?: boolean
  /** edit = 修改选中原素材；create = 生成并追加新素材。 */
  intent?: 'create' | 'edit'
  targetClipId?: string
  targetClipName?: string
  /** 发起时固定的原素材地址；固定片段编辑同时用它防止误覆盖。 */
  targetSourceUrl?: string
  targetSourceKind?: 'image' | 'video'
  targetRevision?: number
  replacementStatus?: 'replaced' | 'stale'
  replacementError?: string
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

/** 一次工具调用的可持久化执行状态，供 Codex 风格执行轨迹与恢复使用。 */
export type AgentToolActivityStatus = 'running' | 'succeeded' | 'failed' | 'stopped'

export interface AgentToolActivity {
  id: string
  step: number
  name: string
  title: string
  detail?: string
  status: AgentToolActivityStatus
  summary?: string
  startedAt: number
  finishedAt?: number
}

export interface AgentPlanItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** 一轮用户请求可包含多个模型 Step；run 是该 Turn 的持久化投影。 */
export interface AgentRunState {
  version: 1
  status: 'running' | 'done' | 'stopped' | 'error'
  phase: 'thinking' | 'tool' | 'done'
  currentStep: number
  /** 旧会话保留的历史步数上限；新任务不再设置固定上限。 */
  maxSteps?: number
  plan: AgentPlanItem[]
  activities: AgentToolActivity[]
  startedAt: number
  updatedAt: number
}

/** 普通对话完成建议/文案后，由模型提议进入实际创作；必须经用户确认。 */
export interface AgentCreativeHandoff {
  target: 'create'
  /** 确认后进入的创作引擎；旧会话缺省为 AIGC。 */
  engine?: 'animation' | 'aigc'
  reason: string
  /** 用户确认后作为同一对话的下一条创作任务发送。 */
  prompt: string
  status: 'pending' | 'accepted' | 'dismissed'
}

/** 一个镜号的持久化状态。成功的 generationId 在续跑时直接跳过，不重复付费。 */
export interface AgentStoryboardShot {
  id: string
  prompt: string
  duration: number
  /** 在时间轴上预留的固定起点（秒）；先完成的镜头不会抢占其他镜号的位置。 */
  timelineStart?: number
  /** 已入轨的片段；改稿重生成时原位替换，避免同一镜号留下两段视频。 */
  clipId?: string
  clipUrl?: string
  generationId?: string
  /** 动画逐镜制作单：每镜独立 HyperFrames 工程与上传素材路径。 */
  motionId?: string
  /** 本镜工程真实画幅；模板可能不是制作单画幅，写回时两者都允许。 */
  motionWidth?: number
  motionHeight?: number
  requiredAssetSources?: string[]
  requiredAssetPaths?: string[]
  /** 提示词、画幅、参考 SVG 与正式素材共同决定工程能否复用。 */
  creationSignature?: string
  /** 改稿新工程验收成功后，再移除被替代的旧片段，失败时保留旧成果。 */
  supersededClipId?: string
  motionSourceReady?: boolean
  /** 自动复查结果：字体、安全区、重叠、对比度等问题的摘要。 */
  review?: {
    checkedAt: number
    errorCount: number
    warningCount: number
    findings: number
    ok: boolean
    /** 复查本身失败（CLI 不可用、超时等），不影响镜头成果。 */
    error?: string
  }
  status: AgentStoryboardShotStatus
  attempt?: number
  error?: string
}

/** 整片需求与执行进度独立于模型记忆，切换、追加消息和刷新后仍能知道缺哪几镜。 */
export interface AgentStoryboardPlan {
  id: string
  engine: 'animation' | 'aigc'
  title: string
  brief: string
  continuity: string
  storyboardText?: string
  aspectRatio: string
  resolution: string
  delivery: AgentStoryboardDelivery
  shots: AgentStoryboardDraftShot[]
  status: 'draft' | 'confirmed'
  messageId?: string
  createdAt: number
  updatedAt: number
}

export interface AgentProduction {
  id: string
  /** 动画与 AIGC 共用进度模型，但执行器和工具门禁不同。 */
  engine?: 'animation' | 'aigc'
  title: string
  brief: string
  continuity: string
  storyboardText?: string
  aspectRatio: string
  resolution: string
  delivery: AgentStoryboardDelivery
  batchSize: number
  status: AgentProductionStatus
  messageId?: string
  /** 本片在项目时间轴上的起始秒；续跑和刷新后保持不变。 */
  timelineStart?: number
  shots: AgentStoryboardShot[]
  createdAt: number
  updatedAt: number
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
  /** 本条回复当前展示的图片 / 视频生成任务（兼容旧会话）。 */
  generation?: AgentGeneration
  /** 一轮修改多个素材时保留全部任务，避免只显示或只能重试最后一个。 */
  generations?: AgentGeneration[]
  /** 本条回复向用户提出的选择题（一次只有一个）。 */
  ask?: AgentAsk
  /** 用户这一轮上传的参考素材。 */
  attachments?: AgentAttachment[]
  /** 用户这一轮引用的模板，可以多个。 */
  templates?: AgentTemplateRef[]
  /** 用户这一轮选中的时间轴片段；有值表示只针对这些片段修改。 */
  clips?: AgentClipRef[]
  /** 内置 Agent 的 Turn/Step 与工具执行投影；本机 CLI Agent 不使用。 */
  run?: AgentRunState
  /** 普通对话到创作对话的待确认交接，不会自动切换或生成。 */
  creativeHandoff?: AgentCreativeHandoff
}

/** 普通对话处理聊天与文字创作；创作对话实际生成素材，结果进入剪辑项目。 */
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
  /** 整片创作需求、每镜任务与生成进度；用于跨轮续跑而不是只记最后一镜。 */
  production?: AgentProduction
  /** 归属的工作区（本地目录）。缺省表示未分类。 */
  workspaceId?: string
  mode?: AgentConversationMode
  automation?: AgentAutomationMode
  /** 创作对话实际使用的引擎；普通对话忽略，旧会话缺省为 aigc。 */
  creativeEngine?: 'animation' | 'aigc'
  /** 两种引擎共用的分镜草案；确认前不会生成素材或搭建动效工程。 */
  storyboard?: AgentStoryboardPlan
}

/** OpenAI 兼容的多模态内容片段。 */
export type AgentContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** OpenAI 原生 Function Calling 的持久化/传输结构。 */
export interface AgentChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 只包含模型可见的 schema；宿主执行函数、权限与 UI 投影不会进入请求体。 */
export interface AgentToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 发送给 /chat/completions 的消息结构，包含工具结果回注。 */
export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | AgentContentPart[] | null
  tool_calls?: AgentChatToolCall[]
  tool_call_id?: string
  name?: string
}
