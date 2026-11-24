<template>
  <Magnet
    v-if="!reduced"
    wrapper-class-name="sf-magnet"
    inner-class-name="sf-magnet-inner"
    :padding="padding"
    :magnet-strength="strength"
    :max-offset="maxOffset"
    :scale="scale"
    axis="both"
  >
    <slot />
  </Magnet>
  <span v-else class="sf-magnet sf-magnet--static">
    <slot />
  </span>
</template>

<script setup lang="ts">
import Magnet from '@/components/bits/Magnet.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

withDefaults(
  defineProps<{
    padding?: number
    strength?: number
    maxOffset?: number
    scale?: number
  }>(),
  { padding: 26, strength: 0.45, maxOffset: 7, scale: 1.008 },
)

const reduced = useReducedMotion()
</script>

<style>
.sf-magnet,
.sf-magnet--static {
  display: inline-flex;
  width: 100%;
}

.sf-magnet-inner {
  display: flex;
  width: 100%;
}
</style>
