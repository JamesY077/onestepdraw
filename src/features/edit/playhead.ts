import { ref } from 'vue'
import { MAX_PROJECT_SECONDS } from '@/types/edit'

/**
 * 播放头是高频状态：播放时每帧都在变。
 * 单独放在模块里，让时间轴和预览用 watch 直接写 DOM，
 * 而不是当作 prop 传下去触发整棵组件树重渲染。
 */
export const playhead = ref(0)

export function setPlayhead(seconds: number): void {
  const next = Number.isFinite(seconds) ? seconds : 0
  playhead.value = Math.max(0, Math.min(MAX_PROJECT_SECONDS, next))
}
