<template>
  <div class="composer-wrap">
    <div class="composer" :class="{ 'is-focused': focused, 'is-streaming': disabled }">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer-input"
        rows="1"
        :placeholder="placeholder"
        :disabled="false"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="handleKeydown"
        @input="resize"
      />

      <div class="composer-bottom">
        <div class="composer-model" :title="AGENT_MODEL_DESCRIPTION">
          <span class="model-dot" aria-hidden="true" />
          {{ AGENT_MODEL_NAME }}
        </div>

        <div class="composer-actions">
          <button
            v-if="disabled"
            type="button"
            class="stop-button"
            title="停止生成"
            aria-label="停止生成"
            @click="$emit('stop')"
          >
            <span class="stop-square" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            class="send-button"
            :disabled="!text.trim()"
            title="发送"
            aria-label="发送"
            @click="submit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <p class="composer-hint">
      <span>Enter 发送 · Shift + Enter 换行</span>
      <span class="hint-sep">·</span>
      <span>内容由 AI 生成，请核对重要信息</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { AGENT_MODEL_DESCRIPTION, AGENT_MODEL_NAME } from '@/api/agent'

const props = withDefaults(defineProps<{ disabled?: boolean; placeholder?: string }>(), {
  disabled: false,
  placeholder: '给 OneStep 发消息…',
})
const emit = defineEmits<{
  (event: 'send', content: string): void
  (event: 'stop'): void
}>()

const text = defineModel<string>({ default: '' })
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const focused = ref(false)

function resize() {
  const textarea = textareaRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
}

watch(text, () => nextTick(resize))

function submit() {
  const content = text.value.trim()
  if (!content || props.disabled) return
  emit('send', content)
  text.value = ''
  nextTick(() => {
    resize()
    textareaRef.value?.focus()
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}

function focus() {
  textareaRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
.composer-wrap {
  width: 100%;
}

.composer {
  border: 1px solid #e2e2dc;
  border-radius: 18px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(17, 17, 16, 0.03),
    0 8px 30px rgba(17, 17, 16, 0.05);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.composer.is-focused {
  border-color: #c9c9c1;
  box-shadow:
    0 1px 2px rgba(17, 17, 16, 0.03),
    0 10px 34px rgba(17, 17, 16, 0.07);
}

.composer-input {
  display: block;
  width: 100%;
  max-height: 200px;
  min-height: 48px;
  padding: 14px 16px 6px;
  border: 0;
  outline: none;
  background: transparent;
  color: #1d1d1b;
  font-family: inherit;
  font-size: 14.5px;
  line-height: 1.65;
  resize: none;
  scrollbar-width: thin;
}

.composer-input::placeholder {
  color: #a6a69e;
}

.composer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px 9px 14px;
}

.composer-model {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #8b8b83;
  font-size: 11.5px;
  font-weight: 550;
  white-space: nowrap;
}

.model-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #5aa77a;
  box-shadow: 0 0 0 2.5px rgba(90, 167, 122, 0.13);
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.send-button,
.stop-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease, transform 150ms ease;
}

.send-button {
  background: #111111;
  color: #ffffff;
}

.send-button svg {
  width: 16px;
  height: 16px;
}

.send-button:hover:not(:disabled) {
  background: #2c2c2a;
  transform: translateY(-1px);
}

.send-button:disabled {
  background: #ecece7;
  color: #b7b7af;
  cursor: not-allowed;
}

.stop-button {
  background: #f3f3ef;
  color: #33332f;
}

.stop-button:hover {
  background: #e9e9e4;
}

.stop-square {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: currentColor;
}

.composer-hint {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  color: #a5a59d;
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
}

.hint-sep {
  color: #c8c8c1;
}

@media (max-width: 640px) {
  .composer-hint .hint-sep,
  .composer-hint span:last-child {
    display: none;
  }
}
</style>
