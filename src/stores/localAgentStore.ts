import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchLocalAgents,
  type CustomAgentConfig,
  type LocalAgentPreset,
} from '@/api/localAgents'

/** 内置 AIPing 对话的引擎 id；其余 id 都对应本机 CLI Agent。 */
export const BUILTIN_ENGINE_ID = 'builtin'
export const CUSTOM_ENGINE_ID = 'custom'

const ENGINE_STORAGE_KEY = 'onestep_agent_engine_v1'
const CUSTOM_AGENT_STORAGE_KEY = 'onestep_custom_agent_v1'

type ScanStatus = 'idle' | 'scanning' | 'ready' | 'error'

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // 本地存储不可用时只影响记忆，不影响当次使用。
  }
}

function readCustomAgent(): CustomAgentConfig {
  try {
    const raw = readStorage(CUSTOM_AGENT_STORAGE_KEY)
    if (!raw) return { name: '', command: '' }
    const parsed = JSON.parse(raw)
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : '',
      command: typeof parsed?.command === 'string' ? parsed.command : '',
    }
  } catch {
    return { name: '', command: '' }
  }
}

export const useLocalAgentStore = defineStore('localAgent', () => {
  const agents = ref<LocalAgentPreset[]>([])
  const status = ref<ScanStatus>('idle')
  const error = ref('')
  const rootDir = ref('')
  const scannedAt = ref(0)
  const selectedId = ref(readStorage(ENGINE_STORAGE_KEY) || BUILTIN_ENGINE_ID)
  const custom = ref<CustomAgentConfig>(readCustomAgent())

  const installedAgents = computed<LocalAgentPreset[]>(() => {
    const list = agents.value.filter((agent) => agent.installed)
    const command = custom.value.command.trim()
    if (command) {
      list.push({
        id: CUSTOM_ENGINE_ID,
        name: custom.value.name.trim() || '自定义 Agent',
        vendor: '自定义命令',
        description: '由你填写的本地命令，步帧会把对话作为提示词传给它。',
        commands: [],
        installCommand: '',
        installUrl: '',
        installed: true,
        command,
        commandPath: command,
        version: '',
      })
    }
    return list
  })

  const missingAgents = computed(() =>
    agents.value.filter((agent) => !agent.installed && agent.installCommand),
  )

  const selectedAgent = computed<LocalAgentPreset | null>(
    () => installedAgents.value.find((agent) => agent.id === selectedId.value) || null,
  )

  const isLocalEngine = computed(() => selectedId.value !== BUILTIN_ENGINE_ID && !!selectedAgent.value)
  const selectedLabel = computed(() =>
    isLocalEngine.value ? selectedAgent.value?.name || '本机 Agent' : 'AIPing · DeepSeek',
  )
  const selectedHint = computed(() => {
    if (!isLocalEngine.value) return '内置模型，无需安装任何 CLI'
    const agent = selectedAgent.value
    if (!agent) return ''
    return [agent.vendor, agent.version].filter(Boolean).join(' · ')
  })
  const installedCount = computed(() => installedAgents.value.length)
  const isScanning = computed(() => status.value === 'scanning')

  /** 已选择但当前扫不到的 Agent（卸载、换电脑或命令改名）。 */
  const pendingSelection = computed(() => {
    if (selectedId.value === BUILTIN_ENGINE_ID || selectedAgent.value) return null
    const known = agents.value.find((agent) => agent.id === selectedId.value)
    return {
      id: selectedId.value,
      name: known?.name || selectedId.value,
    }
  })

  function select(id: string) {
    selectedId.value = id || BUILTIN_ENGINE_ID
    writeStorage(ENGINE_STORAGE_KEY, selectedId.value)
  }

  async function scan(force = false) {
    if (status.value === 'scanning') return
    status.value = 'scanning'
    error.value = ''
    try {
      const result = await fetchLocalAgents(force)
      agents.value = result.agents
      rootDir.value = result.rootDir
      scannedAt.value = Date.now()
      status.value = 'ready'
    } catch (err: any) {
      error.value = err?.message || '扫描本机 Agent 失败。'
      status.value = 'error'
    }
  }

  function ensureScanned() {
    if (status.value === 'idle') void scan(false)
  }

  function saveCustomAgent(config: CustomAgentConfig) {
    const next = {
      name: config.name.trim().slice(0, 40),
      command: config.command.trim(),
    }
    custom.value = next
    writeStorage(CUSTOM_AGENT_STORAGE_KEY, next.command ? JSON.stringify(next) : '')
    if (next.command) select(CUSTOM_ENGINE_ID)
  }

  function clearCustomAgent() {
    custom.value = { name: '', command: '' }
    writeStorage(CUSTOM_AGENT_STORAGE_KEY, '')
    if (selectedId.value === CUSTOM_ENGINE_ID) select(BUILTIN_ENGINE_ID)
  }

  return {
    agents,
    status,
    error,
    rootDir,
    scannedAt,
    selectedId,
    custom,
    installedAgents,
    missingAgents,
    selectedAgent,
    isLocalEngine,
    selectedLabel,
    selectedHint,
    installedCount,
    isScanning,
    pendingSelection,
    select,
    scan,
    ensureScanned,
    saveCustomAgent,
    clearCustomAgent,
  }
})
