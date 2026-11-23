import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ProjectAssetKind } from '@/types/edit'

export interface InboxAsset {
  name: string
  kind: ProjectAssetKind
  url: string
  thumbnail?: string
  duration?: number
  source?: 'chat' | 'library' | 'upload'
}

const STORAGE_KEY = 'onestep_add_to_project_target_v1'

/** 全站「添加至项目」入口：任意页面把素材投递到这里，由全局弹窗选择目标项目。 */
export const useAssetInboxStore = defineStore('assetInbox', () => {
  const pending = ref<InboxAsset[]>([])
  const lastTargetId = ref<string>(readTarget())

  const isOpen = computed(() => pending.value.length > 0)

  function readTarget(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) || ''
    } catch {
      return ''
    }
  }

  function open(asset: InboxAsset) {
    pending.value = [asset]
  }

  function openMany(assets: InboxAsset[]) {
    const list = assets.filter((asset) => asset && asset.url)
    if (list.length) pending.value = list
  }

  function close() {
    pending.value = []
  }

  function rememberTarget(projectId: string) {
    lastTargetId.value = projectId
    try {
      localStorage.setItem(STORAGE_KEY, projectId)
    } catch {
      // 忽略存储失败。
    }
  }

  return { pending, isOpen, lastTargetId, open, openMany, close, rememberTarget }
})
