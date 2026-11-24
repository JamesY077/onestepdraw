<template>
  <svg
    class="brand-mark"
    :width="size"
    :height="size"
    viewBox="0 0 1024 1024"
    fill="none"
    role="img"
    :aria-label="`${BRAND_NAME_EN}${BRAND_NAME_CN ? ' ' + BRAND_NAME_CN : ''}`"
  >
    <!-- 与 design/app-icon 同一套分层：底色、取景框、笔触 -->
    <defs>
      <linearGradient :id="gradientId" x1="0.1" y1="0" x2="0.6" y2="1">
        <stop offset="0" :stop-color="inverted ? '#FBF3EA' : '#C4664A'" />
        <stop offset="0.52" :stop-color="inverted ? '#F3E7DA' : '#B4553A'" />
        <stop offset="1" :stop-color="inverted ? '#E9D9C9' : '#8F3C25'" />
      </linearGradient>
    </defs>
    <rect x="102" y="102" width="820" height="820" rx="188" :fill="`url(#${gradientId})`" />
    <g
      fill="none"
      :stroke="inverted ? 'var(--sf-terra)' : '#FBF3EA'"
      stroke-width="40"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-opacity="0.68"
    >
      <path d="M300 452V330H422" />
      <path d="M602 330H724V452" />
      <path d="M724 572V694H602" />
      <path d="M422 694H300V572" />
    </g>
    <path
      d="M292 712C402 700 496 624 566 500C600 440 646 388 716 362"
      fill="none"
      :stroke="inverted ? 'var(--sf-terra)' : '#FBF3EA'"
      stroke-width="72"
      stroke-linecap="round"
    />
    <path
      d="M716 362C742 353 762 344 776 330"
      fill="none"
      :stroke="inverted ? 'var(--sf-terra)' : '#FBF3EA'"
      stroke-width="44"
      stroke-linecap="round"
      stroke-opacity="0.9"
    />
  </svg>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { BRAND_NAME_CN, BRAND_NAME_EN } from '@/features/brand'

withDefaults(defineProps<{ size?: number; inverted?: boolean }>(), {
  size: 28,
  inverted: false,
})

// 每个实例独立的渐变 id，避免多个图标互相覆盖。
const gradientId = `sable-tile-${useId()}`
</script>

<style scoped>
.brand-mark {
  display: block;
  flex: none;
}
</style>
