<template>
  <ShinyText
    v-if="!reduced"
    :text="text"
    :class-name="`sf-shiny ${className}`.trim()"
    color="var(--sf-ink-3)"
    shine-color="var(--sf-terra)"
    :speed="5.2"
    :shine-width="22"
    :softness="0.9"
    :bands="1"
    :glow="0"
    trigger="hover"
    :pause-on-hover="false"
    :disabled="disabled"
  />
  <span v-else :class="['sf-shiny', className]">{{ text }}</span>
</template>

<script setup lang="ts">
import ShinyText from '@/components/bits/ShinyText.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

withDefaults(
  defineProps<{
    text: string
    className?: string
    disabled?: boolean
  }>(),
  { className: '', disabled: false },
)

const reduced = useReducedMotion()
</script>

<style>
.sf-shiny {
  display: inline-block;
}
</style>
