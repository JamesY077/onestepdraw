import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * 跟随系统「减少动态效果」设置。
 * 所有封装自 vue-bits 的动效组件都用它做降级，避免在低动效模式下仍然播放。
 */
export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(false)
  let query: MediaQueryList | null = null
  const update = (event?: MediaQueryListEvent) => {
    reduced.value = event ? event.matches : !!query?.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    query = window.matchMedia('(prefers-reduced-motion: reduce)')
    update()
    query.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    query?.removeEventListener('change', update)
  })

  return reduced
}
