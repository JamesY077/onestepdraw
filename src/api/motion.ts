import type { OpenMotionTemplate } from '@/features/template/openmotionTypes'

export interface MotionProject {
  id: string
  name: string
  entry: string
  entryUrl?: string
  templateId: string
  sourceUrl: string
  width: number
  height: number
  fps: number
  createdAt: number
  updatedAt: number
  params: Record<string, unknown>
  missingFiles?: { path: string; error: string }[]
  /** 服务端确认落盘源码已是完整、画幅匹配且带镜号的工程（模板副本）。 */
  sourceReady?: boolean
}

export interface MotionRenderProgress {
  pct: number
  code: string
  label: string
  done: number
  total: number
}

export interface MotionRenderProbe {
  width: number
  height: number
  codec: string
  duration: number
  frames: number
}

export interface MotionRenderJob {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  url?: string
  error?: string
  log?: string
  progress?: MotionRenderProgress
  /** 渲染完成后 ffprobe 实测的成片规格；有值才代表逐帧验证通过。 */
  probe?: MotionRenderProbe
  probeError?: string
  duration?: number
  workers?: number
  startedAt: number
  finishedAt?: number
}

/** 模板远程资源走本地缓存，前端不直接依赖外部 CDN。 */
export function motionAssetUrl(remote: string | undefined): string {
  if (!remote) return ''
  return `/local/motion/asset?url=${encodeURIComponent(remote)}`
}

export function motionFileUrl(projectId: string, file = 'index.html'): string {
  const relative = String(file || 'index.html').split('/').map(encodeURIComponent).join('/')
  return `/local/motion/view/${encodeURIComponent(projectId)}/${relative}`
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `动效服务请求失败（${response.status}）`)
  }
  return payload as T
}

/** motion.md 可能是 ZIP 说明包，由本地服务解包后返回正文。 */
export async function fetchMotionText(remote: string): Promise<string> {
  const response = await fetch(`/local/motion/document?url=${encodeURIComponent(remote)}`)
  if (!response.ok) throw new Error(`读取模板文档失败（${response.status}）`)
  return response.text()
}

export async function listMotionProjects(): Promise<MotionProject[]> {
  const payload = await request<{ projects: MotionProject[] }>('/local/motion/list')
  return payload.projects || []
}

export async function createMotionProject(input: {
  name: string
  template?: OpenMotionTemplate
  width?: number
  height?: number
  fps?: number
  /** 动画逐镜生产时注入，模板副本会写入镜号标记。 */
  shotId?: string
}): Promise<MotionProject> {
  const payload = await request<{ project: MotionProject }>('/local/motion/create', input)
  return payload.project
}

/** 仅用于新建事务失败后的回滚，正常改稿不会删除用户工程。 */
export async function discardMotionProject(projectId: string): Promise<void> {
  await request<{ ok: true }>('/local/motion/discard', { id: projectId })
}

export async function readMotionFile(projectId: string, file = 'index.html'): Promise<string> {
  const payload = await request<{ content: string }>('/local/motion/read', { id: projectId, path: file })
  return payload.content
}

export async function writeMotionFile(projectId: string, content: string, file = 'index.html') {
  return request<{ project: MotionProject }>('/local/motion/write', { id: projectId, path: file, content })
}

export async function startMotionRender(projectId: string, end?: number): Promise<string> {
  const payload = await request<{ jobId: string }>('/local/motion/render', { id: projectId, end })
  return payload.jobId
}

export interface LatestMotionRender {
  url: string
  updatedAt: number
  sourceUpdatedAt: number
  stale: boolean
}

/** 旧项目恢复：找到某工程的最近一次真实渲染产物。end 为时间轴需要的秒数。 */
export async function getLatestMotionRender(projectId: string, end?: number): Promise<LatestMotionRender> {
  const suffix = end && end > 0 ? `&end=${encodeURIComponent(end)}` : ''
  return request<LatestMotionRender>(
    `/local/motion/render/latest?id=${encodeURIComponent(projectId)}${suffix}`,
  )
}

export interface MotionCheckFinding {
  stage: string
  severity: 'error' | 'warning' | 'info' | string
  code: string
  message: string
  selector: string
  sourceFile: string
  time: number
}

export interface MotionCheckReport {
  ok: boolean
  /** 是否没有 error 级问题；ok 仅代表接口调用成功。 */
  passed: boolean
  motionId: string
  checkedAt: number
  durationMs: number
  browserSkipped: boolean
  summary: {
    errorCount: number
    warningCount: number
    infoCount: number
    findings: number
  }
  findings: MotionCheckFinding[]
  log: string
}

/** 官方 HyperFrames check：字体、安全区、重叠、对比度、运行时等复查。 */
export async function checkMotionProject(projectId: string, samples = 5): Promise<MotionCheckReport> {
  return request<MotionCheckReport>('/local/motion/check', { id: projectId, samples })
}

export async function getMotionRenderJob(jobId: string): Promise<MotionRenderJob> {
  const payload = await request<{ job: MotionRenderJob }>(
    `/local/motion/render/status?jobId=${encodeURIComponent(jobId)}`,
  )
  return payload.job
}
