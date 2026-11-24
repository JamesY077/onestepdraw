<template>
  <SpotlightCard
    v-if="!reduced"
    :class-name="`sf-spotlight ${className}`.trim()"
    theme="light"
    :surface="`var(--sf-surface)`"
    :border="`var(--sf-line)`"
    shadow="none"
    spotlight-color="#b4553a"
    :intensity="0.14"
    :spotlight-size="300"
    :softness="0.74"
    :border-glow="0.5"
    :proximity="120"
    :smoothing="0.26"
    :flare="false"
    :grain="grain"
  >
    <slot />
  </SpotlightCard>
  <div v-else :class="['sf-spotlight', 'sf-spotlight--static', className]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import SpotlightCard from '@/components/bits/SpotlightCard.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

withDefaults(
  defineProps<{
    className?: string
    /** 0 - 1，给卡片叠一层很轻的纸面颗粒。 */
    grain?: number
  }>(),
  { className: '', grain: 0 },
)

const reduced = useReducedMotion()
</script>

<style>
.sf-spotlight {
  border-radius: var(--sf-r-lg);
  padding: 0;
}

.sf-spotlight--static {
  border: 1px solid var(--sf-line);
  background: var(--sf-surface);
}
</style>
