<template>
  <SplitText
    v-if="!reduced"
    :text="text"
    :tag="tag"
    :class-name="`sf-reveal ${className}`.trim()"
    :split-type="splitType"
    :effect="effect"
    :trigger="trigger"
    :delay="delay"
    :duration="duration"
    :text-align="textAlign"
    :color="color"
    :accent-color="accentColor"
    :mask="mask"
    :stagger-from="staggerFrom"
    :hover-effect="hoverEffect"
  />
  <component
    :is="tag"
    v-else
    :class="['sf-reveal', className]"
    :style="{ color, textAlign }"
  >
    {{ text }}
  </component>
</template>

<script setup lang="ts">
import SplitText from '@/components/bits/SplitText.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

withDefaults(
  defineProps<{
    text: string
    tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span'
    className?: string
    splitType?: 'chars' | 'words' | 'lines' | 'words, chars'
    effect?: 'rise' | 'fade' | 'blur' | 'flip' | 'pop' | 'skew' | 'wave'
    trigger?: 'view' | 'load' | 'hover' | 'click'
    delay?: number
    duration?: number
    textAlign?: 'left' | 'center' | 'right' | 'justify'
    color?: string
    accentColor?: string
    mask?: boolean
    staggerFrom?: 'start' | 'center' | 'end' | 'edges' | 'random'
    hoverEffect?: 'none' | 'lift' | 'wave'
  }>(),
  {
    tag: 'p',
    className: '',
    splitType: 'chars',
    effect: 'rise',
    trigger: 'load',
    delay: 26,
    duration: 0.9,
    textAlign: 'left',
    color: undefined,
    accentColor: undefined,
    mask: false,
    staggerFrom: 'start',
    hoverEffect: 'none',
  },
)

const reduced = useReducedMotion()
</script>

<style>
.sf-reveal {
  margin: 0;
}

.sf-reveal .split-char,
.sf-reveal .split-word,
.sf-reveal .split-line {
  will-change: transform, opacity, filter;
}
</style>
