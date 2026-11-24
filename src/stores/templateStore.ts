import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AgentAttachment, AgentTemplateRef } from '@/types/agent'
import { MAX_ATTACHMENTS, persistableAttachment } from '@/features/agent/attachments'
import { templatePosterUrl } from '@/features/template/poster'
import type { BuiltinTemplate, UserTemplateGroup } from '@/features/template/types'

const GROUPS_KEY = 'onestep_template_groups_v1'
const APPLIED_KEY = 'onestep_template_applied_v1'

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tpl_${crypto.randomUUID()}`
  }
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function loadGroups(): UserTemplateGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (group) =>
          group &&
          typeof group.id === 'string' &&
          typeof group.name === 'string' &&
          Array.isArray(group.assets),
      )
      .map((group) => ({
        ...group,
        note: typeof group.note === 'string' ? group.note : '',
        createdAt: Number(group.createdAt) || Date.now(),
        updatedAt: Number(group.updatedAt) || Date.now(),
        assets: group.assets.filter((asset: AgentAttachment) => asset && typeof asset.url === 'string'),
      }))
  } catch {
    return []
  }
}

function normalizeApplied(value: any): AgentTemplateRef | null {
  if (!value || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  return {
    ...value,
    images: Array.isArray(value.images)
      ? value.images.filter((url: unknown) => typeof url === 'string')
      : [],
    guide: typeof value.guide === 'string' ? value.guide : '',
    assets: Array.isArray(value.assets)
      ? value.assets.filter((asset: AgentAttachment) => asset && typeof asset.url === 'string')
      : undefined,
  }
}

/** 引用列表可以存多个；旧版本只存了一个对象，这里一并兼容。 */
function loadApplied(): AgentTemplateRef[] {
  try {
    const raw = localStorage.getItem(APPLIED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const seen = new Set<string>()
    const result: AgentTemplateRef[] = []
    for (const item of list) {
      const normalized = normalizeApplied(item)
      if (!normalized || seen.has(normalized.id)) continue
      seen.add(normalized.id)
      result.push(normalized)
    }
    return result
  } catch {
    return []
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 模板数据过大时忽略持久化，当前会话仍然可用。
  }
}

export const useTemplateStore = defineStore('template', () => {
  const tab = ref<'builtin' | 'custom' | 'skill'>('builtin')
  const groups = ref<UserTemplateGroup[]>(loadGroups())
  const applied = ref<AgentTemplateRef[]>(loadApplied())
  const draftGroupId = ref<string | null>(null)

  const sortedGroups = computed(() =>
    [...groups.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  function persistGroups() {
    save(
      GROUPS_KEY,
      groups.value.map((group) => ({
        ...group,
        assets: group.assets.map(persistableAttachment),
      })),
    )
  }

  function persistApplied() {
    if (!applied.value.length) {
      try {
        localStorage.removeItem(APPLIED_KEY)
      } catch {
        // 忽略。
      }
      return
    }
    save(
      APPLIED_KEY,
      applied.value.map((template) => ({
        ...template,
        assets: template.assets?.map(persistableAttachment),
      })),
    )
  }

  /** 追加一个模板；同一个 id 再引用时更新内容，不会重复占位。 */
  function applyTemplate(template: AgentTemplateRef) {
    const index = applied.value.findIndex((item) => item.id === template.id)
    if (index >= 0) applied.value.splice(index, 1, template)
    else applied.value.push(template)
    persistApplied()
    draftGroupId.value = null
  }

  function removeApplied(id: string) {
    applied.value = applied.value.filter((item) => item.id !== id)
    persistApplied()
  }

  function applyBuiltin(template: BuiltinTemplate) {
    applyTemplate({
      id: template.id,
      name: template.name,
      category: template.category,
      guide: template.guide,
      // 原素材静帧与 AI 示例图都能当视觉参考；纯占位图不带。
      images:
        template.still || template.generated
          ? [templatePosterUrl(template.poster), ...(template.references || []).map(templatePosterUrl)]
          : [],
      source: 'builtin',
    })
  }

  function applyGroup(group: UserTemplateGroup) {
    const images = group.assets
      .flatMap((asset) => {
        if (asset.kind === 'image' && asset.url) return [asset.url]
        if (asset.kind === 'video' && asset.frames?.length) return asset.frames.slice(0, 2)
        return []
      })
      .filter(Boolean)
      .slice(0, 4)
    const list = group.assets
      .map((asset) => `${asset.kind === 'image' ? '参考图' : asset.kind === 'video' ? '参考视频' : asset.kind === 'audio' ? '参考音频' : '参考文件'}：${asset.name}`)
      .join('\n')
    applyTemplate({
      id: group.id,
      name: group.name,
      category: '我的模板',
      guide: [group.note.trim(), list ? `本组参考素材：\n${list}` : ''].filter(Boolean).join('\n\n'),
      images,
      assets: group.assets,
      source: 'custom',
    })
  }

  function clearApplied() {
    applied.value = []
    persistApplied()
  }

  function isApplied(id: string): boolean {
    return applied.value.some((item) => item.id === id)
  }

  function createGroup(input: { name: string; note: string; assets: AgentAttachment[] }): UserTemplateGroup | null {
    const name = input.name.trim()
    if (!name) return null
    const now = Date.now()
    const group: UserTemplateGroup = {
      id: makeId(),
      name,
      note: input.note.trim(),
      createdAt: now,
      updatedAt: now,
      assets: input.assets.slice(0, MAX_ATTACHMENTS).map(persistableAttachment),
    }
    groups.value.unshift(group)
    persistGroups()
    return group
  }

  function updateGroup(
    id: string,
    input: { name: string; note: string; assets: AgentAttachment[] },
  ): UserTemplateGroup | null {
    const group = groups.value.find((item) => item.id === id)
    if (!group) return null
    const name = input.name.trim()
    if (!name) return null
    group.name = name
    group.note = input.note.trim()
    group.assets = input.assets.slice(0, MAX_ATTACHMENTS).map(persistableAttachment)
    group.updatedAt = Date.now()
    persistGroups()
    // 正在应用的模板跟着更新，避免模板库与输入框上的参考对不上。
    if (isApplied(id)) applyGroup(group)
    return group
  }

  function deleteGroup(id: string) {
    groups.value = groups.value.filter((group) => group.id !== id)
    persistGroups()
    if (isApplied(id)) removeApplied(id)
  }

  function startDraftGroup(id?: string) {
    draftGroupId.value = id || 'new'
  }

  function stopDraftGroup() {
    draftGroupId.value = null
  }

  return {
    tab,
    groups,
    sortedGroups,
    applied,
    draftGroupId,
    applyTemplate,
    applyBuiltin,
    applyGroup,
    clearApplied,
    removeApplied,
    isApplied,
    createGroup,
    updateGroup,
    deleteGroup,
    startDraftGroup,
    stopDraftGroup,
  }
})
