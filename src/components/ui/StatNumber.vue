<template>
  <CountUp
    v-if="!reduced"
    :to="to"
    :from="from"
    :duration="duration"
    :delay="delay"
    :separator="separator"
    :prefix="prefix"
    :suffix="suffix"
    :trigger="trigger"
    :class-name="className"
    mode="count"
    easing="easeOut"
  />
  <span v-else :class="className">{{ prefix }}{{ formatted }}{{ suffix }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CountUp from '@/components/bits/CountUp.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

const props = withDefaults(
  defineProps<{
    to: number
    from?: number
    duration?: number
    delay?: number
    separator?: string
    prefix?: string
    suffix?: string
    trigger?: 'view' | 'load'
    className?: string
  }>(),
  {
    from: 0,
    duration: 1.4,
    delay: 0.15,
    separator: ',',
    prefix: '',
    suffix: '',
    trigger: 'load',
    className: '',
  },
)

const reduced = useReducedMotion()
const formatted = computed(() =>
  props.separator ? props.to.toLocaleString('en-US') : String(props.to),
)
</script>
