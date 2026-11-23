import router from '@/router'
import { clearApiSessionReady, getMillisecondsUntilNextChinaWeekStart, hasActiveApiSession, invalidateExpiredApiSession } from '@/api/config'

/** 登录态按周轮换：每周一 00:00（中国时区）清一次会话并要求重新登录。 */
let weekRefreshTimer: number | null = null

function redirectToLoginIfNeeded() {
  const publicPaths = new Set(['/', '/login', '/setup'])
  if (!publicPaths.has(router.currentRoute.value.path)) {
    router.replace('/login')
  }
}

function clearWeekRefreshTimer() {
  if (weekRefreshTimer !== null) {
    window.clearTimeout(weekRefreshTimer)
    weekRefreshTimer = null
  }
}

function scheduleNextWeekRefresh() {
  clearWeekRefreshTimer()

  const delay = getMillisecondsUntilNextChinaWeekStart(new Date())
  weekRefreshTimer = window.setTimeout(() => {
    clearApiSessionReady()
    window.location.replace('/login')
  }, delay)
}

export function enforceApiSessionGuard() {
  const wasExpired = invalidateExpiredApiSession()

  if (wasExpired || !hasActiveApiSession()) {
    clearApiSessionReady()
    redirectToLoginIfNeeded()
  }

  if (hasActiveApiSession()) {
    scheduleNextWeekRefresh()
  } else {
    clearWeekRefreshTimer()
  }
}

export function restartApiSessionGuard() {
  enforceApiSessionGuard()
}

export function stopApiSessionGuard() {
  clearWeekRefreshTimer()
}
