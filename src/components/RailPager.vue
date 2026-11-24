<template>
  <div v-if="pageCount > 1" class="rail-pager">
    <button class="pager-btn" type="button" aria-label="上一页" :disabled="page <= 1" @click="emit('update:page', page - 1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 6 8.5 12l6 6" />
      </svg>
    </button>
    <span class="pager-label">{{ page }} / {{ pageCount }}</span>
    <button
      class="pager-btn"
      type="button"
      aria-label="下一页"
      :disabled="page >= pageCount"
      @click="emit('update:page', page + 1)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.5 6l6 6-6 6" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ page: number; pageCount: number }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()
</script>

<style scoped>
.rail-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}

.pager-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--sf-line);
  border-radius: 7px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.pager-btn svg {
  width: 13px;
  height: 13px;
}

.pager-btn:hover:not(:disabled) {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface-3);
  color: var(--sf-ink);
}

.pager-btn:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.pager-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--sf-ink-3);
  font-variant-numeric: tabular-nums;
}
</style>
