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
}

export interface MotionRenderJob {
  id: string
  status: 'running' | 'succeeded' | 'failed'
  url?: string
  error?: string
  log?: string
  startedAt: number
  finishedAt?: number
}

/** 模板远程资源走本地缓存，前端不直接依赖外部 CDN。 */
export function motionAssetUrl(remote: string | undefined): string {
  if (!remote) return ''
  return `/local/motion/asset?url=${encodeURIComponent(remote)}`
}

export function motionFileUrl(projectId: string, file = 'index.html'): string {
  return `/local/motion/file?id=${encodeURIComponent(projectId)}&path=${encodeURIComponent(file)}`
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
}): Promise<MotionProject> {
  const payload = await request<{ project: MotionProject }>('/local/motion/create', input)
  return payload.project
}

export async function readMotionFile(projectId: string, file = 'index.html'): Promise<string> {
  const payload = await request<{ content: string }>('/local/motion/read', { id: projectId, path: file })
  return payload.content
}

export async function writeMotionFile(projectId: string, content: string, file = 'index.html') {
  return request<{ project: MotionProject }>('/local/motion/write', { id: projectId, path: file, content })
}

export async function startMotionRender(projectId: string): Promise<string> {
  const payload = await request<{ jobId: string }>('/local/motion/render', { id: projectId })
  return payload.jobId
}

export async function getMotionRenderJob(jobId: string): Promise<MotionRenderJob> {
  const payload = await request<{ job: MotionRenderJob }>(
    `/local/motion/render/status?jobId=${encodeURIComponent(jobId)}`,
  )
  return payload.job
}
