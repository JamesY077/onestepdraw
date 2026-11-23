<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_ENGINE_ID } from '@/stores/localAgentStore'
import codebuddyIcon from '@/assets/agents/codebuddy.png'
import codexIcon from '@/assets/agents/codex.png'
import dshIcon from '@/assets/agents/dsh.png'
import opencodeIcon from '@/assets/agents/opencode.png'
import qoderIcon from '@/assets/agents/qoder.png'

/**
 * 本机 Agent 图标：优先用从电脑里扫出来的应用图标，没有就退回首字母。
 * AIPing 用官方标志里的图形部分（不含字标）。
 */
const ICONS: Record<string, string> = {
  codebuddy: codebuddyIcon,
  codex: codexIcon,
  dsh: dshIcon,
  opencode: opencodeIcon,
  qoder: qoderIcon,
}

const props = withDefaults(
  defineProps<{ id: string; name?: string; size?: number }>(),
  { name: '', size: 18 },
)

const builtin = computed(() => props.id === BUILTIN_ENGINE_ID)
const icon = computed(() => ICONS[props.id] || '')
const initial = computed(() => {
  const text = props.name.trim() || props.id.trim()
  const first = [...text][0] || '?'
  return first.toUpperCase()
})
const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${Math.max(4, Math.round(props.size * 0.28))}px`,
  fontSize: `${Math.round(props.size * 0.46)}px`,
}))
</script>

<template>
  <span
    class="agent-mark"
    :class="{ 'is-builtin': builtin, 'has-image': !!icon }"
    :style="boxStyle"
    aria-hidden="true"
  >
    <svg v-if="builtin" class="mark-builtin" viewBox="0 0 198.2 118.7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#2563eb"
        d="M143.72 0c14.66 0 28.72 5.61 39.09 15.6 9.14 8.81 14.75 20.38 15.94 32.67.16.73.24 1.49.24 2.27v23.46c0 5.98-4.95 10.83-11.05 10.83s-11.05-4.85-11.05-10.83V53.24l-.04-1.59c-.41-7.9-3.84-15.39-9.67-21-6.22-5.99-14.66-9.36-23.45-9.36-8.8 0-17.23 3.37-23.45 9.36-6.22 5.99-9.72 14.12-9.72 22.59v74.9h32.24c6.61 0 11.98 5.25 11.98 11.73 0 6.48-5.36 11.73-11.98 11.73H56.2c-6.61 0-11.98-5.25-11.98-11.73 0-6.48 5.36-11.73 11.98-11.73h32.24V53.24l-.04-1.59c-.41-7.9-3.84-15.39-9.67-21-6.22-5.99-14.66-9.36-23.45-9.36-8.8 0-17.23 3.37-23.45 9.36-6.22 5.99-9.72 14.12-9.72 22.59v20.76c0 5.98-4.95 10.83-11.05 10.83S0 79.98 0 74V50.54c0-.78.09-1.53.24-2.26 1.2-12.3 6.8-23.87 15.95-32.68C26.56 5.61 40.62 0 55.27 0c14.66 0 28.72 5.61 39.09 15.6 1.86 1.79 3.57 3.7 5.13 5.7 1.56-2 3.28-3.91 5.14-5.7C115 5.61 129.06 0 143.72 0Z"
      />
      <circle fill="#2563eb" cx="11.56" cy="107.12" r="11.54" />
      <circle fill="#2563eb" cx="186.62" cy="107.12" r="11.54" />
    </svg>
    <img v-else-if="icon" :src="icon" alt="" draggable="false" />
    <span v-else class="mark-initial">{{ initial }}</span>
  </span>
</template>

<style scoped>
.agent-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #f3f3ed;
  color: #6b6b63;
  line-height: 1;
}

.agent-mark.has-image {
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 16, 0.08);
}

.agent-mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-mark.is-builtin {
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.14);
}

.mark-builtin {
  width: 72%;
  height: auto;
}

.mark-initial {
  font-size: 1em;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}
</style>
