<template>
  <svg
    class="brand-mark"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    role="img"
    aria-label="步帧 Stepframe"
  >
    <rect width="32" height="32" rx="8" :fill="inverted ? '#ffffff' : '#101114'" />
    <rect
      x="8.05"
      y="16.31"
      width="3.9"
      height="8.25"
      rx="1.95"
      :fill="inverted ? '#101114' : '#ffffff'"
    />
    <rect
      x="14.05"
      y="11.81"
      width="3.9"
      height="12.75"
      rx="1.95"
      :fill="inverted ? '#101114' : '#ffffff'"
    />
    <rect x="20.05" y="7.31" width="3.9" height="17.25" rx="1.95" fill="#C2532F" />
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
