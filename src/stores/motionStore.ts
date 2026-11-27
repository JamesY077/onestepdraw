import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createMotionProject,
  discardMotionProject,
  getMotionRenderJob,
  listMotionProjects,
  readMotionFile,
  startMotionRender,
  writeMotionFile,
  type MotionProject,
  type MotionRenderProbe,
  type MotionRenderProgress,
} from '@/api/motion'

export interface MotionVariable {
  id: string
  type: 'string' | 'number' | 'color' | 'boolean' | 'enum'
  label: string
  default?: unknown
  options?: string[]
}

interface MotionState {
  meta?: MotionProject
  source?: string
  variables: MotionVariable[]
  /** 源码或参数写回后强制主 Player 重新导航，不能只刷新独立检查器。 */
  sourceVersion: number
  loading: boolean
  saving: boolean
  error: string
  renderJobId?: string
  renderStatus: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
  renderUrl?: string
  renderError?: string
  renderLog?: string
  /** 官方 CLI 的实时进度；排队时 pct=0。 */
  renderProgress?: MotionRenderProgress
  /** ffprobe 实测的成片规格，用来证明“真的导出成功”而不是只生成了文件。 */
  renderProbe?: MotionRenderProbe
  renderProbeError?: string
}

const blank = (): MotionState => ({
  variables: [],
  sourceVersion: 0,
  loading: false,
  saving: false,
  error: '',
  renderStatus: 'idle',
})

/** 源码或参数变更后，上一份 MP4 与它的校验结果都不再对应当前工程。 */
function invalidateRender(state: MotionState) {
  state.renderStatus = 'idle'
  state.renderUrl = undefined
  state.renderProgress = undefined
  state.renderProbe = undefined
  state.renderProbeError = ''
}

/** 从 <html data-composition-variables='[...]'> 读出参数契约。 */
export function parseMotionVariables(source: string): MotionVariable[] {
  const match = source.match(/data-composition-variables\s*=\s*(['"])([\s\S]*?)\1/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[2].replace(/&#39;/g, "'"))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => ({
        id: item.id,
        type: ['string', 'number', 'color', 'boolean', 'enum'].includes(item.type) ? item.type : 'string',
        label: typeof item.label === 'string' ? item.label : item.id,
        default: item.default,
        options: Array.isArray(item.options) ? item.options.filter((v: unknown) => typeof v === 'string') : undefined,
      }))
  } catch {
    return []
  }
}

export const useMotionStore = defineStore('motion', () => {
  const states = reactive<Record<string, MotionState>>({})
  const projects = ref<MotionProject[]>([])

  const stateOf = (id: string): MotionState => {
    if (!states[id]) states[id] = blank()
    return states[id]
  }

  const hasProjects = computed(() => projects.value.length > 0)

  async function refreshProjects() {
    projects.value = await listMotionProjects()
    return projects.value
  }

  async function load(id: string, force = false) {
    const state = stateOf(id)
    if (state.loading || (state.source !== undefined && !force)) return state
    state.loading = true
    state.error = ''
    try {
      if (!state.meta) state.meta = projects.value.find((item) => item.id === id)
      const [list, source] = await Promise.all([
        state.meta ? Promise.resolve(projects.value) : refreshProjects(),
        readMotionFile(id),
      ])
      const previous = state.source
      state.meta = state.meta || list.find((item) => item.id === id)
      state.source = source
      state.variables = parseMotionVariables(source)
      // 官方 Studio 直接写工程文件；强制刷新时递增版本，主画面才会重建播放器。
      if (force && previous !== undefined && previous !== source) state.sourceVersion += 1
    } catch (error) {
      state.error = String((error as Error)?.message || error)
    } finally {
      state.loading = false
    }
    return state
  }

  async function saveSource(id: string, source: string) {
    const state = stateOf(id)
    state.saving = true
    state.error = ''
    try {
      const payload = await writeMotionFile(id, source)
      state.meta = payload.project
      state.source = source
      state.variables = parseMotionVariables(source)
      state.sourceVersion += 1
      // 源码变了，上一次渲染的 MP4 已经过期。
      invalidateRender(state)
      return state
    } catch (error) {
      state.error = String((error as Error)?.message || error)
      throw error
    } finally {
      state.saving = false
    }
  }

  async function setParams(id: string, params: Record<string, unknown>) {
    const state = stateOf(id)
    const response = await fetch('/local/motion/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, params }),
    })
    const payload = await response.json()
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || '保存参数失败')
    state.meta = payload.project
    state.sourceVersion += 1
    invalidateRender(state)
    return payload.project as MotionProject
  }

  async function create(input: { name: string; template?: unknown; width?: number; height?: number; shotId?: string }) {
    const project = await createMotionProject(input as Parameters<typeof createMotionProject>[0])
    projects.value = [project, ...projects.value.filter((item) => item.id !== project.id)]
    return project
  }

  async function discard(id: string) {
    await discardMotionProject(id)
    projects.value = projects.value.filter((item) => item.id !== id)
    delete states[id]
  }

  async function render(id: string, end?: number): Promise<string> {
    const state = stateOf(id)
    if (state.renderStatus === 'running' || state.renderStatus === 'queued') {
      throw new Error('这个工程正在渲染')
    }
    state.renderStatus = 'running'
    state.renderError = ''
    state.renderLog = ''
    state.renderProbe = undefined
    state.renderProbeError = ''
    state.renderProgress = { pct: 0, code: 'queued', label: '排队中', done: 0, total: 0 }
    try {
      state.renderJobId = await startMotionRender(id, end)
      // 轮询要等到真实成片：queued 只是排队，不能当成成功或失败。
      for (let attempt = 0; attempt < 1800; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const job = await getMotionRenderJob(state.renderJobId)
        state.renderLog = job.log || ''
        state.renderProgress = job.progress || state.renderProgress
        if (job.status === 'queued') {
          state.renderStatus = 'queued'
          continue
        }
        if (job.status === 'running') {
          state.renderStatus = 'running'
          continue
        }
        if (job.status === 'succeeded' && job.url) {
          state.renderStatus = 'succeeded'
          state.renderUrl = job.url
          state.renderProbe = job.probe
          state.renderProbeError = job.probeError || ''
          return job.url
        }
        if (job.status === 'failed') throw new Error(job.error || '渲染失败')
      }
      throw new Error('渲染超时，请到工程目录手动执行 hyperframes render。')
    } catch (error) {
      state.renderStatus = 'failed'
      state.renderError = String((error as Error)?.message || error)
      throw error
    }
  }

  return { states, projects, hasProjects, stateOf, refreshProjects, load, saveSource, setParams, create, discard, render }
})
