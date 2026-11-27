/**
 * 模板库的「带着选择回到对话」：
 * - 记住是从哪个页面进来的，返回时精确回到那段对话 / 剪辑台；
 * - 用一条一次性提示，让目标页面知道刚引用了模板，主动聚焦输入框。
 */

const RETURN_KEY = 'onestep_templates_return_v1'
const FLASH_KEY = 'onestep_templates_flash_v1'

/** 允许回跳的站内地址：必须是站内路径，且不能还停在模板库。 */
export function sanitizeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (!value.startsWith('/') || value.startsWith('//')) return ''
  if (value.startsWith('/templates') || value.startsWith('/login') || value.startsWith('/setup')) return ''
  return value
}

export function rememberTemplatesReturn(path: string): void {
  const safe = sanitizeReturnPath(path)
  if (!safe) return
  try {
    sessionStorage.setItem(RETURN_KEY, safe)
  } catch {
    // 忽略存储失败，仍然可以用 history 返回。
  }
}

export function peekTemplatesReturn(): string {
  try {
    return sanitizeReturnPath(sessionStorage.getItem(RETURN_KEY))
  } catch {
    return ''
  }
}

export function clearTemplatesReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // 忽略。
  }
}

export interface TemplatesFlash {
  count: number
  names: string[]
}

/** 应用模板后留一条一次性提示，目标页面读取后立刻清除。 */
export function flashTemplatesApplied(flash: TemplatesFlash): void {
  try {
    sessionStorage.setItem(
      FLASH_KEY,
      JSON.stringify({ count: flash.count, names: flash.names.slice(0, 6) }),
    )
  } catch {
    // 忽略。
  }
}

export function consumeTemplatesFlash(): TemplatesFlash | null {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY)
    if (!raw) return null
    sessionStorage.removeItem(FLASH_KEY)
    const parsed = JSON.parse(raw)
    const count = Number(parsed?.count)
    if (!Number.isFinite(count) || count <= 0) return null
    const names = Array.isArray(parsed?.names)
      ? parsed.names.filter((name: unknown): name is string => typeof name === 'string' && !!name)
      : []
    return { count, names }
  } catch {
    return null
  }
}

const PROMPT_KEY = 'onestep_composer_prompt_v1'
const PROMPT_ENGINE_KEY = 'onestep_composer_engine_v1'

export interface ComposerPromptContext {
  prompt: string
  creativeEngine?: 'animation' | 'aigc'
}

/** 模板复刻 / 参考做同款：提示词和真实引擎一起交接，不能只改变界面文案。 */
export function flashComposerPrompt(prompt: string, engine?: 'animation' | 'aigc'): void {
  try {
    sessionStorage.setItem(PROMPT_KEY, prompt)
    if (engine) sessionStorage.setItem(PROMPT_ENGINE_KEY, engine)
    else sessionStorage.removeItem(PROMPT_ENGINE_KEY)
  } catch {
    // 忽略。
  }
}

export function consumeComposerPromptContext(): ComposerPromptContext {
  try {
    const prompt = sessionStorage.getItem(PROMPT_KEY) || ''
    const storedEngine = sessionStorage.getItem(PROMPT_ENGINE_KEY)
    sessionStorage.removeItem(PROMPT_KEY)
    sessionStorage.removeItem(PROMPT_ENGINE_KEY)
    if (!prompt) return { prompt: '' }
    return {
      prompt,
      creativeEngine: storedEngine === 'animation' || storedEngine === 'aigc' ? storedEngine : undefined,
    }
  } catch {
    return { prompt: '' }
  }
}

export function consumeComposerPrompt(): string {
  return consumeComposerPromptContext().prompt
}

/** 模板说明不能覆盖进入模板库前已经写好的需求。 */
export function mergeComposerPrompt(handoff: string, existing: string): string {
  const addition = existing.trim()
  if (!addition) return handoff
  if (!handoff.trim()) return addition
  const marker = /我的要求：\s*$/.exec(handoff)
  if (marker) return `${handoff.slice(0, marker.index)}我的要求：\n${addition}`
  return `${handoff.trimEnd()}\n\n我的原需求：\n${addition}`
}

/** 把「已引用 2 个模板：A、B」拼成一句提示语。 */
export function describeTemplatesFlash(flash: TemplatesFlash): string {
  const shown = flash.names.slice(0, 3).join('、')
  const suffix = flash.names.length > 3 ? ' 等' : ''
  return shown
    ? `已引用 ${flash.count} 个模板：${shown}${suffix}`
    : `已引用 ${flash.count} 个模板`
}
