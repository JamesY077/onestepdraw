<template>
  <div class="ask-card" :class="{ 'is-answered': answered, 'is-compact': compact }">
    <header class="ask-head">
      <span class="ask-badge">{{ ask.header }}</span>
      <span v-if="answered" class="ask-done">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m5 12.5 4.4 4.4L19 7.4" />
        </svg>
        已选
      </span>
      <span v-else class="ask-tip">点一下就能选</span>
    </header>

    <p class="ask-question">{{ ask.question }}</p>

    <div class="ask-options" role="group" :aria-label="ask.question">
      <button
        v-for="(option, index) in ask.options"
        :key="option.id"
        type="button"
        class="ask-option"
        :class="{
          'is-recommended': option.recommended && !answered,
          'is-chosen': answered && ask.answerId === option.id,
          'is-muted': answered && ask.answerId !== option.id,
        }"
        :disabled="disabled || answered"
        @click="choose(option.id, option.label)"
      >
        <span class="ask-index">{{ index + 1 }}</span>
        <span class="ask-copy">
          <span class="ask-label">{{ option.label }}</span>
          <span v-if="option.hint" class="ask-hint">{{ option.hint }}</span>
        </span>
        <span v-if="option.recommended && !answered" class="ask-pick">推荐</span>
        <svg
          v-if="answered && ask.answerId === option.id"
          class="ask-check"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m5 12.5 4.4 4.4L19 7.4" />
        </svg>
      </button>

      <template v-if="ask.allowCustom">
        <div v-if="answered && ask.answerId === 'custom'" class="ask-option is-chosen">
          <span class="ask-index">4</span>
          <span class="ask-copy">
            <span class="ask-label">{{ ask.answer?.replace(/^自定义\s*[:：]\s*/, '') }}</span>
          </span>
          <svg class="ask-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12.5 4.4 4.4L19 7.4" />
          </svg>
        </div>

        <div v-else-if="customOpen && !answered" class="ask-custom">
          <span class="ask-index">4</span>
          <input
            ref="customInputRef"
            v-model="customText"
            class="ask-input"
            :placeholder="ask.customHint || '写你自己的答案，回车确认'"
            :disabled="disabled"
            @keydown.enter.prevent="submitCustom"
            @keydown.esc.prevent="closeCustom"
          />
          <button type="button" class="ask-confirm" :disabled="disabled || !customText.trim()" @click="submitCustom">
            确定
          </button>
        </div>

        <button
          v-else-if="!answered"
          type="button"
          class="ask-option is-custom"
          :disabled="disabled"
          @click="openCustom"
        >
          <span class="ask-index">4</span>
          <span class="ask-copy">
            <span class="ask-label">自定义</span>
            <span v-if="ask.customHint" class="ask-hint">{{ ask.customHint }}</span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { AgentAsk } from '@/types/agent'

const props = withDefaults(
  defineProps<{
    ask: AgentAsk
    disabled?: boolean
    compact?: boolean
  }>(),
  { disabled: false, compact: false },
)

const emit = defineEmits<{
  (event: 'answer', payload: { optionId: string; label: string }): void
}>()

const customOpen = ref(false)
const customText = ref('')
const customInputRef = ref<HTMLInputElement | null>(null)

const answered = computed(() => Boolean(props.ask.answerId))

function choose(optionId: string, label: string) {
  if (props.disabled || answered.value) return
  emit('answer', { optionId, label })
}

function openCustom() {
  if (props.disabled || answered.value) return
  customOpen.value = true
  void nextTick(() => customInputRef.value?.focus())
}

function closeCustom() {
  customOpen.value = false
  customText.value = ''
}

function submitCustom() {
  const text = customText.value.trim()
  if (!text || props.disabled || answered.value) return
  emit('answer', { optionId: 'custom', label: text })
}
</script>

<style scoped>
.ask-card {
  width: 100%;
  max-width: 560px;
  margin-top: 4px;
  padding: 14px 15px 13px;
  border: 1px solid #e6e4dc;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.03);
}

.ask-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}

.ask-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #fbeee8;
  color: #a8422b;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.ask-tip,
.ask-done {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #a5a29a;
  font-size: 10px;
}

.ask-done {
  color: #6d7a64;
}

.ask-done svg {
  width: 11px;
  height: 11px;
}

.ask-question {
  margin: 0 0 11px;
  color: #1d1d1b;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.6;
  letter-spacing: -0.01em;
}

.ask-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ask-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #ecebe4;
  border-radius: 10px;
  background: #ffffff;
  color: #24241f;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.ask-option:hover:not(:disabled) {
  border-color: #cfc9ba;
  background: #fcfbf8;
  transform: translateX(1px);
}

.ask-option:disabled {
  cursor: default;
}

.ask-option.is-recommended {
  border-color: #e3b7a7;
  background: #fdf7f4;
}

.ask-option.is-recommended:hover:not(:disabled) {
  border-color: #cf8d76;
  background: #fcf1ec;
}

.ask-option.is-chosen {
  border-color: #b9c5ad;
  background: #f5f8f1;
}

.ask-option.is-muted {
  opacity: 0.45;
}

.ask-option.is-custom {
  border-style: dashed;
  background: #fcfcfa;
}

.ask-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 6px;
  background: #f3f2ec;
  color: #8c887c;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ask-option.is-recommended .ask-index {
  background: #f5ded4;
  color: #a8422b;
}

.ask-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.ask-label {
  color: inherit;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.ask-hint {
  color: #a09b90;
  font-size: 11px;
  line-height: 1.5;
}

.ask-pick {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  background: #f7e2d9;
  color: #a8422b;
  font-size: 10px;
  font-weight: 600;
}

.ask-check {
  width: 14px;
  height: 14px;
  flex: none;
  color: #5f7a52;
}

.ask-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 9px;
  border: 1px solid #d8d3c4;
  border-radius: 10px;
  background: #ffffff;
}

.ask-input {
  flex: 1;
  min-width: 0;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: #24241f;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.ask-input::placeholder {
  color: #b3aea2;
}

.ask-confirm {
  flex: none;
  padding: 5px 11px;
  border: 0;
  border-radius: 7px;
  background: #1c1b18;
  color: #fbfaf6;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.ask-confirm:disabled {
  background: #f1efe8;
  color: #b8b3a6;
  cursor: default;
}

/* 剪辑台右侧栏更窄，卡片收紧一档 */
.is-compact {
  max-width: none;
  padding: 11px 11px 10px;
  border-radius: 12px;
}

.is-compact .ask-question {
  font-size: 13px;
  margin-bottom: 9px;
}

.is-compact .ask-head {
  margin-bottom: 7px;
}

.is-compact .ask-option {
  padding: 7px 9px;
  gap: 8px;
}

.is-compact .ask-label {
  font-size: 12.5px;
}

@media (max-width: 640px) {
  .ask-card {
    padding: 12px;
  }

  .ask-question {
    font-size: 14px;
  }

  .ask-label {
    font-size: 12.5px;
  }
}
</style>
