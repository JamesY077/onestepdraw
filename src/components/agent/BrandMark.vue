<template>
  <svg
    class="brand-mark"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    role="img"
    aria-label="OneStep"
  >
    <rect width="32" height="32" rx="9" :fill="inverted ? '#ffffff' : '#111111'" />
    <path
      d="M9.4 22V17.2M15.8 22V12.8M22.2 22V8.8"
      :stroke="inverted ? '#111111' : '#ffffff'"
      stroke-width="2.6"
      stroke-linecap="round"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number; inverted?: boolean }>(), {
  size: 28,
  inverted: false,
})
</script>

<style scoped>
.brand-mark {
  display: block;
  flex: none;
}
</style>
