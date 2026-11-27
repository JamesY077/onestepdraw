import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** 普通对话完成文字任务且不做项目；创作对话复用生成链路，结果进入剪辑项目。 */
export type ConversationMode = 'chat' | 'create'
/** 动画走 HyperFrames/OpenMotion 工程；AIGC 走原图片/视频生成。 */
export type CreativeEngineMode = 'animation' | 'aigc'
/** 默认模式 = grill-me 分轮提问；完全模式 = 模型自行决策、直接出结果。 */
export type AutomationMode = 'default' | 'auto'

const STORAGE_KEY = 'onestep_chat_mode_v1'

interface StoredMode {
  conversation: ConversationMode
  automation: AutomationMode
  creativeEngine: CreativeEngineMode
}

const DEFAULT_MODE: StoredMode = {
  conversation: 'create',
  automation: 'default',
  creativeEngine: 'aigc',
}

function load(): StoredMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_MODE }
    const parsed = JSON.parse(raw)
    return {
      conversation: parsed?.conversation === 'chat' ? 'chat' : 'create',
      automation: parsed?.automation === 'auto' ? 'auto' : 'default',
      creativeEngine: parsed?.creativeEngine === 'animation' ? 'animation' : 'aigc',
    }
  } catch {
    return { ...DEFAULT_MODE }
  }
}

export const useChatModeStore = defineStore('chatMode', () => {
  const initial = load()
  const conversation = ref<ConversationMode>(initial.conversation)
  const automation = ref<AutomationMode>(initial.automation)
  const creativeEngine = ref<CreativeEngineMode>(initial.creativeEngine)

  const isCreate = computed(() => conversation.value === 'create')
  const isAuto = computed(() => automation.value === 'auto')
  const isAnimation = computed(() => creativeEngine.value === 'animation')
  const conversationLabel = computed(() => (conversation.value === 'create' ? '创作对话' : '普通对话'))
  const automationLabel = computed(() => (automation.value === 'auto' ? '完全模式' : '默认模式'))
  const creativeEngineLabel = computed(() => (creativeEngine.value === 'animation' ? '动画模式' : 'AIGC 模式'))

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          conversation: conversation.value,
          automation: automation.value,
          creativeEngine: creativeEngine.value,
        }),
      )
    } catch {
      // 忽略存储失败。
    }
  }

  function setConversation(mode: ConversationMode) {
    conversation.value = mode
    persist()
  }

  function setAutomation(mode: AutomationMode) {
    automation.value = mode
    persist()
  }

  function setCreativeEngine(mode: CreativeEngineMode) {
    creativeEngine.value = mode
    persist()
  }

  function toggleCreate() {
    setConversation(conversation.value === 'create' ? 'chat' : 'create')
  }

  return {
    conversation,
    automation,
    creativeEngine,
    isCreate,
    isAuto,
    isAnimation,
    conversationLabel,
    automationLabel,
    creativeEngineLabel,
    setConversation,
    setAutomation,
    setCreativeEngine,
    toggleCreate,
  }
})
