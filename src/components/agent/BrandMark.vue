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
    <rect width="32" height="32" rx="8" :fill="inverted ? '#FCF7F2' : 'var(--sf-terra)'" />
    <path
      d="M9 23H13.7V18.3H18.4V13.6H23"
      :stroke="inverted ? 'var(--sf-terra)' : '#FCF5EE'"
      stroke-width="3.1"
      stroke-linecap="round"
      stroke-linejoin="round"
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
