<template>
  <section class="handoff-card" :class="{ 'is-settled': settled, 'is-compact': compact }" aria-label="切换创作模式建议">
    <div class="handoff-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 7.5h10.5M13 4.5l3 3-3 3M19 16.5H8.5M11 13.5l-3 3 3 3" />
      </svg>
    </div>
    <div class="handoff-copy">
      <span class="handoff-eyebrow">创作模式建议</span>
      <h3>是否切换到创作模式继续任务？</h3>
      <p>{{ handoff.reason }}</p>
      <div v-if="!settled" class="handoff-task">{{ handoff.prompt }}</div>
      <div v-if="!settled" class="handoff-actions">
        <button type="button" class="handoff-primary" :disabled="disabled" @click="$emit('accept')">
          切换并继续
          <span aria-hidden="true">↗</span>
        </button>
        <button type="button" class="handoff-secondary" :disabled="disabled" @click="$emit('dismiss')">暂不切换</button>
      </div>
      <span v-else class="handoff-status">
        {{ handoff.status === 'accepted' ? '已切换到创作模式，并在当前对话中继续' : '已保留在普通对话' }}
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentCreativeHandoff } from '@/types/agent'

const props = withDefaults(defineProps<{
  handoff: AgentCreativeHandoff
  disabled?: boolean
  compact?: boolean
}>(), { disabled: false, compact: false })

defineEmits<{
  (event: 'accept'): void
  (event: 'dismiss'): void
}>()

const settled = computed(() => props.handoff.status !== 'pending')
</script>

<style scoped>
.handoff-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  max-width: 560px;
  margin-top: 14px;
  padding: 16px;
  border: 1px solid #e6c6b9;
  border-radius: 14px;
  background: linear-gradient(145deg, #fffaf7 0%, #fff 72%);
  box-shadow: 0 8px 28px rgba(110, 67, 48, 0.055);
}

.handoff-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 9px;
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.handoff-icon svg {
  width: 18px;
  height: 18px;
}

.handoff-copy {
  min-width: 0;
  flex: 1;
}

.handoff-eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--sf-terra-strong);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.handoff-copy h3 {
  margin: 0;
  color: var(--sf-ink);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.55;
}

.handoff-copy p {
  margin: 5px 0 0;
  color: var(--sf-ink-2);
  font-size: 12px;
  line-height: 1.6;
}

/*
 * 交接任务可能是一份完整的 S1-S6 分镜。卡片高度保持稳定，
 * 内容在自己的小滚动区里完整保留，不能只截两行把后续镜头吞掉。
 */
.handoff-task {
  max-height: 112px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-top: 10px;
  padding: 8px 10px;
  border-left: 2px solid #dfaa94;
  background: rgba(255, 255, 255, 0.72);
  color: var(--sf-ink-3);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-width: thin;
  scrollbar-color: #d8b8aa transparent;
}

.handoff-task::-webkit-scrollbar {
  width: 5px;
}

.handoff-task::-webkit-scrollbar-track {
  background: transparent;
}

.handoff-task::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d8b8aa;
}

.handoff-task::-webkit-scrollbar-thumb:hover {
  background: #c79d8b;
}

.handoff-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
}

.handoff-actions button {
  min-height: 34px;
  padding: 7px 13px;
  border-radius: 9px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.handoff-primary {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--sf-terra-strong);
  background: var(--sf-terra-strong);
  color: #fff;
}

.handoff-primary:hover:not(:disabled) {
  background: #93452f;
}

.handoff-secondary {
  border: 1px solid #e5e2da;
  background: #fff;
  color: var(--sf-ink-2);
}

.handoff-secondary:hover:not(:disabled) {
  background: #f7f6f2;
}

.handoff-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

.handoff-status {
  display: block;
  margin-top: 8px;
  color: #7f8b77;
  font-size: 11px;
}

.handoff-card.is-settled {
  padding: 12px 14px;
  border-color: #e6e5de;
  background: #fafaf7;
  box-shadow: none;
}

.handoff-card.is-settled .handoff-icon {
  width: 28px;
  height: 28px;
  background: #efeee8;
  color: #88887f;
}

.handoff-card.is-compact {
  max-width: 100%;
  padding: 12px;
}

.handoff-card.is-compact .handoff-icon {
  display: none;
}

@media (max-width: 520px) {
  .handoff-card {
    gap: 9px;
    padding: 13px;
  }

  .handoff-icon {
    width: 28px;
    height: 28px;
  }

  .handoff-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
