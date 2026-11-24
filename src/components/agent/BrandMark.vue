<template>
  <svg
    class="brand-mark"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    role="img"
    :aria-label="`${BRAND_NAME_EN}${BRAND_NAME_CN ? ' ' + BRAND_NAME_CN : ''}`"
  >
    <!-- 底：圆角方块 -->
    <rect
      width="32"
      height="32"
      rx="9"
      :fill="inverted ? '#FBF6EE' : 'var(--sf-terra)'"
    />
    <!-- 一道斜向笔触，穿过取景框 -->
    <path
      d="M8.2 22.8C12.4 22.2 16.2 18.6 19.2 13.6C20.5 11.5 22 10 24.2 9.4"
      :stroke="inverted ? 'var(--sf-terra)' : '#FBF3EA'"
      stroke-width="2.6"
      stroke-linecap="round"
    />
    <!-- 取景框右下角：表示「片」 -->
    <path
      d="M8.4 12.2V8.6H12M20 8.6H23.6V12.2M23.6 19.8V23.4H20M12 23.4H8.4V19.8"
      :stroke="inverted ? 'var(--sf-terra)' : '#FBF3EA'"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      :opacity="inverted ? 0.9 : 0.62"
    />
  </svg>
</template>

<script setup lang="ts">
import { BRAND_NAME_CN, BRAND_NAME_EN } from '@/features/brand'

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
