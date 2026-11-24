import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_WORKSPACE_FOLDER,
  sameWorkspacePath,
  workspaceTitleFromPath,
  type Workspace,
} from '@/types/workspace'

const STORAGE_KEY = 'onestep_workspaces_v1'
const ACTIVE_KEY = 'onestep_active_workspace_v1'

interface StoredState {
  workspaces: Workspace[]
  activeId: string | null
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { workspaces: [], activeId: null }
    const parsed = JSON.parse(raw) as Partial<StoredState>
    const workspaces = Array.isArray(parsed.workspaces)
      ? parsed.workspaces.filter(
          (item): item is Workspace =>
            Boolean(item && typeof item.id === 'string' && typeof item.path === 'string'),
        )
      : []
    // 历史版本可能因为并发初始化登记了多个默认工作区；这里只保留第一个，
    // 其余同路径的条目并进默认项，避免下拉里出现两个「默认工作区」。
    const seen = new Set<string>()
    const deduped: Workspace[] = []
    for (const item of workspaces) {
      const key = item.path.replace(/[\\/]+$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
    }

    const activeId =
      typeof parsed.activeId === 'string' && deduped.some((item) => item.id === parsed.activeId)
        ? parsed.activeId
        : null
    return { workspaces: deduped, activeId }
  } catch {
    return { workspaces: [], activeId: null }
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ws_${crypto.randomUUID()}`
  }
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 本地服务返回的目录信息。 */
export interface LocalInfo {
  homeDir: string
  documentsDir: string
  defaultWorkspacePath: string
  defaultWorkspaceExists: boolean
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const initial = loadState()
  const workspaces = ref<Workspace[]>(initial.workspaces)
  const activeId = ref<string | null>(initial.activeId)
  const localInfo = ref<LocalInfo | null>(null)
  const infoError = ref('')
  /** 目录信息与默认工作区初始化的并发句柄。 */
  let infoPromise: Promise<LocalInfo | null> | null = null
  let defaultPromise: Promise<Workspace | null> | null = null

  const activeWorkspace = computed(
    () => workspaces.value.find((item) => item.id === activeId.value) || null,
  )

  const sortedWorkspaces = computed(() =>
    [...workspaces.value].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.createdAt - b.createdAt
    }),
  )

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ workspaces: workspaces.value, activeId: activeId.value }),
      )
      localStorage.setItem(ACTIVE_KEY, activeId.value || '')
    } catch {
      // 存储不可用时只影响记忆，不影响当前使用。
    }
  }

  function setActive(id: string | null) {
    activeId.value = id
    persist()
  }

  /** 读取本机目录信息（文档目录、默认工作区路径）。并发调用共用一个请求。 */
  async function loadLocalInfo(): Promise<LocalInfo | null> {
    if (localInfo.value) return localInfo.value
    if (infoPromise) return infoPromise
    infoPromise = fetchLocalInfo()
    try {
      return await infoPromise
    } finally {
      infoPromise = null
    }
  }

  async function fetchLocalInfo(): Promise<LocalInfo | null> {
    try {
      const response = await fetch('/local/info', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as Partial<LocalInfo>
      if (!data.defaultWorkspacePath) throw new Error('本地服务没有返回工作区路径')
      localInfo.value = {
        homeDir: data.homeDir || '',
        documentsDir: data.documentsDir || '',
        defaultWorkspacePath: data.defaultWorkspacePath,
        defaultWorkspaceExists: Boolean(data.defaultWorkspaceExists),
      }
      infoError.value = ''
      return localInfo.value
    } catch (error) {
      infoError.value = (error as Error)?.message || '读取本机目录失败'
      return null
    }
  }

  /**
   * 首次使用：登记默认工作区。
   * 目录由本地服务负责创建，这里只登记路径，重复调用不会产生新条目。
   */
  async function initializeDefault(): Promise<Workspace | null> {
    const existing = workspaces.value.find((item) => item.isDefault)
    if (existing) return existing
    // 并发保护：页面里多个入口同时触发时，只允许一次登记。
    if (defaultPromise) return defaultPromise
    defaultPromise = createDefaultWorkspace()
    try {
      return await defaultPromise
    } finally {
      defaultPromise = null
    }
  }

  async function createDefaultWorkspace(): Promise<Workspace | null> {
    const info = await loadLocalInfo()
    const path = info?.defaultWorkspacePath || ''

    // 已有同路径的工作区（哪怕没标记 isDefault）就直接复用，不再新增。
    const samePath = path
      ? workspaces.value.find((item) => sameWorkspacePath(item.path, path))
      : null
    if (samePath) {
      if (!samePath.isDefault) samePath.isDefault = true
      if (!activeId.value) activeId.value = samePath.id
      persist()
      return samePath
    }

    // 已经登记过默认项（路径可能拿不到）就不再重复创建。
    const existingDefault = workspaces.value.find((item) => item.isDefault)
    if (existingDefault) return existingDefault

    try {
      await fetch('/local/workspace/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path || undefined }),
      })
    } catch {
      // 服务不可用时仍登记路径，下次启动会再尝试创建。
    }
    const now = Date.now()
    const workspace: Workspace = {
      id: makeId(),
      title: workspaceTitleFromPath(path) || DEFAULT_WORKSPACE_FOLDER,
      path,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    }
    workspaces.value = [workspace, ...workspaces.value]
    if (!activeId.value) activeId.value = workspace.id
    persist()
    return workspace
  }

  /** 登记一个用户指定的本地目录；同一目录不会重复登记。 */
  function adoptDirectory(path: string, title?: string): Workspace {
    const trimmed = path.trim()
    const existing = workspaces.value.find((item) => sameWorkspacePath(item.path, trimmed))
    if (existing) {
      setActive(existing.id)
      return existing
    }
    const now = Date.now()
    const workspace: Workspace = {
      id: makeId(),
      title: (title || workspaceTitleFromPath(trimmed) || '工作区').slice(0, 60),
      path: trimmed,
      createdAt: now,
      updatedAt: now,
    }
    workspaces.value = [...workspaces.value, workspace]
    activeId.value = workspace.id
    persist()
    return workspace
  }

  function rename(id: string, title: string) {
    const target = workspaces.value.find((item) => item.id === id)
    if (!target) return
    target.title = title.trim().slice(0, 60) || workspaceTitleFromPath(target.path)
    target.updatedAt = Date.now()
    persist()
  }

  /** 删除登记关系，不删除磁盘上的目录。 */
  function remove(id: string) {
    const target = workspaces.value.find((item) => item.id === id)
    if (!target || target.isDefault) return
    workspaces.value = workspaces.value.filter((item) => item.id !== id)
    if (activeId.value === id) {
      activeId.value = workspaces.value.find((item) => item.isDefault)?.id || workspaces.value[0]?.id || null
    }
    persist()
  }

  return {
    workspaces,
    sortedWorkspaces,
    activeId,
    activeWorkspace,
    localInfo,
    infoError,
    loadLocalInfo,
    initializeDefault,
    adoptDirectory,
    setActive,
    rename,
    remove,
  }
})
