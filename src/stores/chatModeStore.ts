import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** 普通对话 = 只聊不做项目；创作对话 = 生成结果进入剪辑项目。 */
export type ConversationMode = 'chat' | 'create'
/** 默认模式 = grill-me 分轮提问；完全模式 = 模型自行决策、直接出结果。 */
export type AutomationMode = 'default' | 'auto'

const STORAGE_KEY = 'onestep_chat_mode_v1'

interface StoredMode {
  conversation: ConversationMode
  automation: AutomationMode
}

function load(): StoredMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // 默认直接进入创作对话 + 默认模式：先问清楚，再做片。
    if (!raw) return { conversation: 'create', automation: 'default' }
    const parsed = JSON.parse(raw)
    return {
      conversation: parsed?.conversation === 'chat' ? 'chat' : 'create',
      automation: parsed?.automation === 'auto' ? 'auto' : 'default',
    }
  } catch {
    return { conversation: 'create', automation: 'default' }
  }
}

export const useChatModeStore = defineStore('chatMode', () => {
  const initial = load()
  const conversation = ref<ConversationMode>(initial.conversation)
  const automation = ref<AutomationMode>(initial.automation)

  const isCreate = computed(() => conversation.value === 'create')
  const isAuto = computed(() => automation.value === 'auto')
  const conversationLabel = computed(() => (conversation.value === 'create' ? '创作对话' : '普通对话'))
  const automationLabel = computed(() => (automation.value === 'auto' ? '完全模式' : '默认模式'))

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ conversation: conversation.value, automation: automation.value }),
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

  function toggleCreate() {
    setConversation(conversation.value === 'create' ? 'chat' : 'create')
  }

  return {
    conversation,
    automation,
    isCreate,
    isAuto,
    conversationLabel,
    automationLabel,
    setConversation,
    setAutomation,
    toggleCreate,
  }
})
