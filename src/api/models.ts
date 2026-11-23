/** AIPing 模型列表：对话里允许用户切换内置模型。 */

import { getApiBaseUrl, getApiKey } from '@/api/config'

export interface AipingChatModel {
  id: string
  /** llm = 纯文本，vision = 多模态。 */
  kind: 'llm' | 'vision'
  context: number
  created: number
}

const CACHE_KEY = 'onestep_aiping_models_v1'
const CACHE_TTL = 6 * 60 * 60 * 1000
const CHAT_TYPES = new Set(['llm', 'vlm'])
const SKIP_PATTERN = /ocr|embedding|rerank/i

type RawModel = {
  id?: unknown
  status?: unknown
  created?: unknown
  model_type?: unknown
  context_length_range?: unknown
}

function readCache(baseUrl: string): AipingChatModel[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.baseUrl !== baseUrl || !Array.isArray(parsed.models)) return null
    if (Date.now() - Number(parsed.at || 0) > CACHE_TTL) return null
    return parsed.models as AipingChatModel[]
  } catch {
    return null
  }
}

function writeCache(baseUrl: string, models: AipingChatModel[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ baseUrl, at: Date.now(), models }))
  } catch {
    // 缓存失败不影响使用。
  }
}

function normalizeModel(raw: RawModel): AipingChatModel | null {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  if (!id || SKIP_PATTERN.test(id)) return null
  if (raw?.status === false) return null

  const types = Array.isArray(raw?.model_type)
    ? raw.model_type
    : typeof raw?.model_type === 'string'
      ? [raw.model_type]
      : []
  const chatTypes = types.filter((type): type is string => typeof type === 'string')
  if (!chatTypes.some((type) => CHAT_TYPES.has(type))) return null

  const range = Array.isArray(raw?.context_length_range) ? raw.context_length_range : []
  const context = Math.max(
    ...range.filter((value): value is number => typeof value === 'number'),
    0,
  )

  return {
    id,
    kind: chatTypes.includes('vlm') ? 'vision' : 'llm',
    context,
    created: Number(raw?.created) || 0,
  }
}

function sortModels(models: AipingChatModel[], preferredId: string): AipingChatModel[] {
  return [...models].sort((a, b) => {
    if (a.id === preferredId) return -1
    if (b.id === preferredId) return 1
    return b.created - a.created
  })
}

export async function fetchAipingChatModels(
  preferredId: string,
  force = false,
): Promise<AipingChatModel[]> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '')
  if (!force) {
    const cached = readCache(baseUrl)
    if (cached?.length) return sortModels(cached, preferredId)
  }

  const apiKey = getApiKey()
  const response = await fetch(`${baseUrl}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error('读取 AIPing 模型列表失败，请稍后重试。')
  }

  const payload = await response.json().catch(() => null)
  const list: unknown[] = Array.isArray(payload?.data) ? payload.data : []
  const models = list
    .map((item) => normalizeModel(item as RawModel))
    .filter((model): model is AipingChatModel => model !== null)

  if (!models.length) {
    throw new Error('AIPing 没有返回可用的对话模型。')
  }

  writeCache(baseUrl, models)
  return sortModels(models, preferredId)
}
