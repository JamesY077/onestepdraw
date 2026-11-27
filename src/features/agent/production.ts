import type {
  AgentProduction,
  AgentStoryboardPlan,
  AgentStoryboardDelivery,
  AgentStoryboardShot,
} from '@/types/agent'

/** AIPing 账号默认并发：全片可以有很多镜，但同时执行的上游生成最多 4 个。 */
export const AGENT_GENERATION_CONCURRENCY = 4
/** 首次失败后再自动重试 2 次；不会无限扣费，最终失败仍保留手动续跑入口。 */
export const AGENT_GENERATION_MAX_ATTEMPTS = 3
const MAX_STORYBOARD_SHOTS = 32

export interface StoryboardToolInput {
  title: string
  brief: string
  continuity: string
  storyboardText?: string
  aspectRatio: string
  resolution: string
  delivery: AgentStoryboardDelivery
  shots: Array<Pick<AgentStoryboardShot, 'id' | 'prompt' | 'duration'> & { referenceSvg?: string }>
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label}不能为空。`)
  return text.slice(0, maxLength)
}

function normalizeSceneId(value: unknown): string {
  const match = /^S0*([1-9]\d*)$/i.exec(String(value || '').trim())
  if (!match) throw new Error('镜号必须使用 S1、S01 这类格式。')
  return `S${String(Number(match[1])).padStart(2, '0')}`
}

/** 严格校验完整分镜，拒绝悄悄丢掉镜号、时长或连续性要求。 */
export function normalizeStoryboardToolInput(value: unknown): StoryboardToolInput {
  if (!value || typeof value !== 'object') throw new Error('完整分镜参数无效。')
  const raw = value as Record<string, any>
  const source = Array.isArray(raw.shots) ? raw.shots : []
  if (source.length < 1) throw new Error('分镜至少需要一个镜头。')
  if (source.length > MAX_STORYBOARD_SHOTS) throw new Error(`一支片最多记录 ${MAX_STORYBOARD_SHOTS} 个镜头。`)
  const ids = new Set<string>()
  const shots = source.map((item: any) => {
    const id = normalizeSceneId(item?.id)
    if (ids.has(id)) throw new Error(`镜号 ${id} 重复，请保留唯一且连续的分镜。`)
    ids.add(id)
    const duration = Number(item?.duration)
    if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
      throw new Error(`${id} 的时长必须是 4-15 秒整数。`)
    }
    return {
      id,
      prompt: requiredText(item?.prompt, `${id} 提示词`, 6000),
      referenceSvg: String(item?.reference_svg || '').trim().slice(0, 24000) || undefined,
      duration,
    }
  })
  const delivery = ['full', 'preview', 'batch'].includes(raw.delivery)
    ? raw.delivery as AgentStoryboardDelivery
    : 'full'
  const aspectRatio = ['16:9', '9:16', '1:1'].includes(raw.aspect_ratio)
    ? raw.aspect_ratio
    : '16:9'
  const resolution = ['768P', '1080P', '2K'].includes(raw.resolution) ? raw.resolution : '768P'
  return {
    title: requiredText(raw.title, '片名', 80),
    brief: requiredText(raw.brief, '完整创作需求', 12000),
    continuity: requiredText(raw.continuity, '连续性要求', 6000),
    storyboardText: String(raw.storyboard_text || '').trim().slice(0, 24000) || undefined,
    aspectRatio,
    resolution,
    delivery,
    shots,
  }
}

let activeAccountGenerations = 0
const accountGenerationWaiters: Array<() => void> = []

/** 所有 Agent 生成入口共享账号级并发槽位，不局限于单个制作单。 */
export async function withAccountGenerationSlot<T>(worker: () => Promise<T>): Promise<T> {
  if (activeAccountGenerations >= AGENT_GENERATION_CONCURRENCY) {
    await new Promise<void>((resolve) => accountGenerationWaiters.push(resolve))
  }
  activeAccountGenerations += 1
  try {
    return await worker()
  } finally {
    activeAccountGenerations = Math.max(0, activeAccountGenerations - 1)
    accountGenerationWaiters.shift()?.()
  }
}

/** 同一批任务最多 4 路并发；任务自己在内部处理失败与重试，不让一个失败中断整片。 */
export async function runGenerationQueue<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = AGENT_GENERATION_CONCURRENCY,
): Promise<void> {
  const limit = Math.max(1, Math.min(AGENT_GENERATION_CONCURRENCY, Math.floor(concurrency) || 1))
  let cursor = 0
  async function next() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()))
}

export function productionPendingShots(production: AgentProduction): AgentStoryboardShot[] {
  const pending = production.shots.filter((shot) => shot.status !== 'succeeded')
  if (production.delivery === 'preview') return pending.slice(0, 1)
  if (production.delivery === 'batch') return pending.slice(0, production.batchSize || 4)
  return pending
}

export function describeStoryboardPlan(plan?: AgentStoryboardPlan): string {
  if (!plan) return ''
  const shots = plan.shots.map((shot) => `${shot.id} ${shot.duration}s · 参考${shot.referenceStatus === 'ready' ? '已就绪' : shot.referenceStatus === 'running' ? '生成中' : shot.referenceStatus === 'failed' ? '失败' : '待重做'}${shot.referenceName ? ` · ${shot.referenceName}` : ''}\n${shot.prompt}`).join('\n')
  return `片名：${plan.title}\n状态：${plan.status === 'draft' ? '等待用户确认，禁止生成正式视频或创建动效工程' : '用户已确认'}\n完整需求：${plan.brief}\n连续性锚点：${plan.continuity}\n原始分镜：${plan.storyboardText || '见下方逐镜内容'}\n逐镜草案：\n${shots}`
}

/** 每轮系统提示词都带完整制作单，即使历史消息被窗口截断也不会只剩 S1。 */
export function describeProduction(production?: AgentProduction): string {
  if (!production) return ''
  const shots = production.shots.map((shot) =>
    `${shot.id} [${shot.status}] ${shot.duration}s${shot.attempt ? ` · 第${shot.attempt}次尝试` : ''}${shot.error ? ` · ${shot.error}` : ''}\n${shot.prompt}`,
  ).join('\n')
  return `片名：${production.title}
状态：${production.status}；生成方式：${production.delivery}；并发上限：4；批次大小：${production.batchSize}
完整需求：${production.brief}
连续性锚点：${production.continuity}
原始分镜：${production.storyboardText || '见下方逐镜提示词'}
逐镜进度：
${shots}`
}
