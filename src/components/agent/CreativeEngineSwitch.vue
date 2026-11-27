<template>
  <div class="engine-switch" :class="{ 'is-compact': compact }" role="group" aria-label="创作引擎">
    <button
      type="button"
      :class="{ active: modelValue === 'animation' }"
      :aria-pressed="modelValue === 'animation'"
      :disabled="disabled"
      title="动画模式：OpenMotion 模板与 HyperFrames 可编辑工程"
      @click="$emit('update:modelValue', 'animation')"
    >
      动画模式
    </button>
    <button
      type="button"
      :class="{ active: modelValue === 'aigc' }"
      :aria-pressed="modelValue === 'aigc'"
      :disabled="disabled"
      title="AIGC 模式：图片、视频生成与多模态素材编辑"
      @click="$emit('update:modelValue', 'aigc')"
    >
      AIGC 模式
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CreativeEngineMode } from '@/stores/chatModeStore'

withDefaults(defineProps<{
  modelValue: CreativeEngineMode
  disabled?: boolean
  compact?: boolean
}>(), { disabled: false, compact: false })

defineEmits<{
  (event: 'update:modelValue', value: CreativeEngineMode): void
}>()
</script>

<style scoped>
.engine-switch {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 2px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 8px;
  background: var(--sf-surface-2);
}

.engine-switch button {
  padding: 3px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-ink-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 550;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.engine-switch button:hover:not(:disabled) {
  color: var(--sf-ink);
}

.engine-switch button.active {
  background: var(--sf-surface);
  color: var(--sf-terra-strong);
  box-shadow: 0 1px 3px rgba(36, 31, 25, 0.08);
}

.engine-switch button:disabled {
  cursor: default;
  opacity: 0.65;
}

.engine-switch.is-compact button {
  padding: 2px 6px;
  font-size: 10.5px;
}
</style>
