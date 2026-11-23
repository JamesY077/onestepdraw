export const AIPING_PUBLIC_API_BASE_URL = 'https://aiping.cn/api/v1'
export const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

/** 旧版 localStorage 凭据 key（仅用于迁移后清理）。 */
const API_AUTH_STORAGE_KEY = 'aiping_api_auth'
/** 新版 sessionStorage 凭据 key：浏览器会话结束即自动清除，降低凭据落盘暴露面。 */
const API_AUTH_SESSION_STORAGE_KEY = 'aiping_api_auth_session'
const API_SESSION_READY_STORAGE_KEY = 'aiping_api_session_ready'

type StoredApiAuth = {
  apiKey: string
  apiBaseUrl: string
  sessionId: string
  verifiedAtEpochMs: number
  /**
   * 登录时所属的周期键：当周周一的日期（`YYYY-MM-DD`，中国时区）。
   * 同一个自然周内保持登录，跨周（周一 00:00）后失效。
   */
  verifiedDateCN: string
}

function getCurrentChinaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''

  return {
    year: valueOf('year'),
    month: valueOf('month'),
    day: valueOf('day'),
    hour: valueOf('hour'),
    minute: valueOf('minute'),
    second: valueOf('second'),
  }
}

export function getCurrentChinaDateKey(date = new Date()): string {
  const { year, month, day } = getCurrentChinaDateParts(date)
  return `${year}-${month}-${day}`
}

/** 把「中国本地 YYYY-MM-DD」当作 UTC 零点解析，用于稳定地取星期与做日期加减。 */
function chinaDateKeyToUtcMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`)
}

function utcMsToDateKey(ms: number): string {
  const d = new Date(ms)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 会话周期键：以中国时区（Asia/Shanghai）**周一 00:00** 为界，返回当周周一的日期。
 * 登录状态在同一个自然周内保持有效，跨周后自动失效，需要重新登录。
 */
export function getCurrentChinaWeekStartDateKey(date = new Date()): string {
  const todayMs = chinaDateKeyToUtcMs(getCurrentChinaDateKey(date))
  const weekday = new Date(todayMs).getUTCDay() // 0=周日, 1=周一
  const daysFromMonday = (weekday + 6) % 7
  return utcMsToDateKey(todayMs - daysFromMonday * 24 * 60 * 60 * 1000)
}

/** 距离下一个「中国时区周一 00:00」还有多少毫秒（即当前登录周期的到期时间）。 */
export function getMillisecondsUntilNextChinaWeekStart(date = new Date()): number {
  const todayMs = chinaDateKeyToUtcMs(getCurrentChinaDateKey(date))
  const weekday = new Date(todayMs).getUTCDay()
  const daysFromMonday = (weekday + 6) % 7
  const nextWeekStartWallClockMs = todayMs + (7 - daysFromMonday) * 24 * 60 * 60 * 1000
  // 上面的毫秒数是「中国本地时间」的墙上时间，真正的 UTC 时刻要减 8 小时。
  const nextWeekStartInstant = nextWeekStartWallClockMs - 8 * 60 * 60 * 1000
  return Math.max(nextWeekStartInstant - date.getTime(), 0)
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function parseStoredApiAuth(): StoredApiAuth | null {
  // 优先读 sessionStorage；无则尝试迁移旧版 localStorage 中的凭据。
  const sessionRaw = sessionStorage.getItem(API_AUTH_SESSION_STORAGE_KEY)
  const legacyRaw = !sessionRaw ? localStorage.getItem(API_AUTH_STORAGE_KEY) : null
  const raw = sessionRaw || legacyRaw

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredApiAuth>
    if (!parsed.apiKey || !parsed.apiBaseUrl || !parsed.sessionId || !parsed.verifiedDateCN) {
      return null
    }

    if (legacyRaw) {
      sessionStorage.setItem(API_AUTH_SESSION_STORAGE_KEY, legacyRaw)
      localStorage.removeItem(API_AUTH_STORAGE_KEY)
    }

    return {
      apiKey: parsed.apiKey,
      apiBaseUrl: parsed.apiBaseUrl,
      sessionId: parsed.sessionId,
      verifiedAtEpochMs: Number(parsed.verifiedAtEpochMs) || Date.now(),
      verifiedDateCN: parsed.verifiedDateCN,
    }
  } catch {
    return null
  }
}

function getSessionReadyToken(): string | null {
  return sessionStorage.getItem(API_SESSION_READY_STORAGE_KEY)
}

function clearStoredAuthData(): void {
  localStorage.removeItem(API_AUTH_STORAGE_KEY)
  sessionStorage.removeItem(API_AUTH_SESSION_STORAGE_KEY)
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')

  try {
    const url = new URL(normalized)
    if (url.hostname === 'aiping.cn' && url.pathname.replace(/\/+$/, '') === '/api/v1') {
      return '/api/v1'
    }
    if (url.hostname === 'api.aiping.cn' && url.pathname.replace(/\/+$/, '') === '/v1') {
      return '/api/v1'
    }
  } catch {
    // Relative URLs such as /api/v1 are expected in local development.
  }

  return normalized
}

export function isOpenAiBaseUrlFormat(baseUrl: string): boolean {
  const trimmed = baseUrl.trim()
  if (!trimmed) return false

  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    return url.pathname.replace(/\/+$/, '').endsWith('/v1')
  } catch {
    return false
  }
}

export function isAipingBaseUrl(baseUrl: string): boolean {
  return normalizeApiBaseUrl(baseUrl) === '/api/v1'
}

export function getApiKey(): string | null {
  return parseStoredApiAuth()?.apiKey || null
}

export function saveApiKey(apiKey: string): void {
  const current = parseStoredApiAuth()
  const normalizedBaseUrl = current?.apiBaseUrl || DEFAULT_API_BASE_URL

  saveApiAuth(apiKey, normalizedBaseUrl)
}

export function clearApiKey(): void {
  clearStoredAuthData()
}

export function getApiBaseUrl(): string {
  return normalizeApiBaseUrl(parseStoredApiAuth()?.apiBaseUrl || DEFAULT_API_BASE_URL)
}

export function getApiBaseUrlInputValue(): string {
  const value = parseStoredApiAuth()?.apiBaseUrl || AIPING_PUBLIC_API_BASE_URL
  return isAipingBaseUrl(value) ? AIPING_PUBLIC_API_BASE_URL : value.trim().replace(/\/+$/, '')
}

export function saveApiBaseUrl(baseUrl: string): void {
  const current = parseStoredApiAuth()
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  sessionStorage.setItem(
    API_AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      apiKey: current?.apiKey || '',
      apiBaseUrl: normalizedBaseUrl,
      sessionId: current?.sessionId || createSessionId(),
      verifiedAtEpochMs: current?.verifiedAtEpochMs || 0,
      verifiedDateCN: current?.verifiedDateCN || '',
    } satisfies StoredApiAuth),
  )
  localStorage.removeItem(API_AUTH_STORAGE_KEY)
}

export function saveApiAuth(apiKey: string, baseUrl: string): void {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  sessionStorage.setItem(
    API_AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      apiKey: apiKey.trim(),
      apiBaseUrl: normalizedBaseUrl,
      sessionId: createSessionId(),
      verifiedAtEpochMs: Date.now(),
      verifiedDateCN: getCurrentChinaWeekStartDateKey(),
    } satisfies StoredApiAuth),
  )
  localStorage.removeItem(API_AUTH_STORAGE_KEY)
}

export function clearApiBaseUrl(): void {
  clearStoredAuthData()
}

export function hasApiConfig(): boolean {
  return !!getApiKey() && !!getApiBaseUrl()
}

export function markApiSessionReady(): void {
  const auth = parseStoredApiAuth()
  if (!auth) return
  sessionStorage.setItem(API_SESSION_READY_STORAGE_KEY, auth.sessionId)
}

export function clearApiSessionReady(): void {
  sessionStorage.removeItem(API_SESSION_READY_STORAGE_KEY)
}

export function clearApiAuth(): void {
  clearStoredAuthData()
  clearApiSessionReady()
}

export function hasActiveApiSession(): boolean {
  const auth = parseStoredApiAuth()
  if (!auth?.apiKey || !auth.apiBaseUrl) return false

  if (auth.verifiedDateCN !== getCurrentChinaWeekStartDateKey()) {
    clearApiSessionReady()
    return false
  }

  return getSessionReadyToken() === auth.sessionId
}

export function invalidateExpiredApiSession(): boolean {
  const auth = parseStoredApiAuth()
  if (!auth) return false

  if (auth.verifiedDateCN === getCurrentChinaWeekStartDateKey()) {
    return false
  }

  clearApiSessionReady()
  return true
}
