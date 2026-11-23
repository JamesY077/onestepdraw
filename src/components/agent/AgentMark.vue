<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_ENGINE_ID } from '@/stores/localAgentStore'
import aipingIcon from '@/assets/agents/aiping.png'
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
const icon = computed(() => (builtin.value ? aipingIcon : ICONS[props.id] || ''))
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
    <img v-if="icon" :src="icon" alt="" draggable="false" />
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

.agent-mark.is-builtin {
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.agent-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.mark-initial {
  font-size: 1em;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}
</style>
