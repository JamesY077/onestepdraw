import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { AGENT_MODEL_ID } from '@/api/agent'
import { fetchAipingChatModels, type AipingChatModel } from '@/api/models'

const MODEL_STORAGE_KEY = 'onestep_chat_model_v1'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

function readSelectedId(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) || AGENT_MODEL_ID
  } catch {
    return AGENT_MODEL_ID
  }
}

export const useModelStore = defineStore('chatModel', () => {
  const models = ref<AipingChatModel[]>([])
  const status = ref<ModelStatus>('idle')
  const error = ref('')
  const selectedId = ref(readSelectedId())

  const selectedModel = computed<AipingChatModel>(
    () =>
      models.value.find((model) => model.id === selectedId.value) || {
        id: selectedId.value,
        kind: 'llm',
        context: 0,
        created: 0,
      },
  )
  const isLoaded = computed(() => models.value.length > 0)

  function select(id: string) {
    const next = String(id || '').trim() || AGENT_MODEL_ID
    selectedId.value = next
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next)
    } catch {
      // 存储不可用时只影响记忆。
    }
  }

  async function load(force = false) {
    if (status.value === 'loading') return
    status.value = 'loading'
    error.value = ''
    try {
      models.value = await fetchAipingChatModels(selectedId.value, force)
      status.value = 'ready'
    } catch (err: any) {
      error.value = err?.message || '读取模型列表失败。'
      status.value = 'error'
    }
  }

  function ensureLoaded() {
    if (status.value === 'idle') void load(false)
  }

  return {
    models,
    status,
    error,
    selectedId,
    selectedModel,
    isLoaded,
    select,
    load,
    ensureLoaded,
  }
})
