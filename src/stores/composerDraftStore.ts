import { reactive } from 'vue'
import { defineStore } from 'pinia'
import type { AgentAttachment } from '@/types/agent'

export interface ComposerDraftState {
  text: string
  attachments: AgentAttachment[]
  pendingCount: number
}

/**
 * 未发送的输入属于会话/项目，而不是路由组件。
 * 只保存在内存里：模板页往返不会丢，上传文件的大 data URL 也不挤占 localStorage。
 */
export const useComposerDraftStore = defineStore('composerDraft', () => {
  const drafts = reactive<Record<string, ComposerDraftState>>({})

  function stateOf(key: string): ComposerDraftState {
    const scope = key || 'chat:new'
    if (!drafts[scope]) drafts[scope] = { text: '', attachments: [], pendingCount: 0 }
    return drafts[scope]
  }

  function clear(key: string): void {
    const state = stateOf(key)
    state.text = ''
    state.attachments = []
    state.pendingCount = 0
  }

  return { drafts, stateOf, clear }
})
