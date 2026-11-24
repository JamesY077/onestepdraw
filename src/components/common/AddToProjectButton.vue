<template>
  <button type="button" class="add-to-project" :class="{ compact }" @click.stop="openInbox">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssetInboxStore, type InboxAsset } from '@/stores/assetInboxStore'

const props = withDefaults(
  defineProps<{ asset: InboxAsset | InboxAsset[]; label?: string; compact?: boolean }>(),
  { label: '添加至项目', compact: false },
)
const inbox = useAssetInboxStore()

const items = computed(() => (Array.isArray(props.asset) ? props.asset : [props.asset]))

function openInbox() {
  inbox.openMany(items.value)
}
</script>

<style scoped>
.add-to-project {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid #e4e4de;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.94);
  color: #5c5c55;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 550;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
}

.add-to-project svg {
  width: 12px;
  height: 12px;
}

.add-to-project:hover {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface);
  color: var(--sf-ink);
}

.add-to-project.compact {
  padding: 4px 7px;
  font-size: 11px;
}
</style>
