<template>
  <aside class="agent-sidebar">
    <header class="sidebar-head">
      <div class="sidebar-brand">
        <BrandMark :size="26" />
        <span class="brand-text">Stepframe</span>
        <span class="brand-cn">步帧</span>
      </div>
      <button type="button" class="icon-button close-button" aria-label="收起侧栏" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M14 6l-6 6 6 6" />
        </svg>
      </button>
    </header>

    <button type="button" class="new-chat-button" @click="$emit('new')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>新对话</span>
      <kbd>⌘K</kbd>
    </button>

    <label class="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.2" />
        <path d="m16 16 3.4 3.4" />
      </svg>
      <input v-model="query" type="search" placeholder="搜索对话" aria-label="搜索对话" />
    </label>

    <nav class="conversation-list" aria-label="历史对话">
      <template v-for="group in filteredGroups" :key="group.label">
        <p class="group-label">{{ group.label }}</p>
        <button
          v-for="conversation in group.items"
          :key="conversation.id"
          type="button"
          class="conversation-item"
          :class="{ active: conversation.id === activeId }"
          @click="$emit('select', conversation.id)"
        >
          <span class="conversation-title">{{ conversation.title || '新对话' }}</span>
          <span
            class="delete-button"
            role="button"
            tabindex="0"
            aria-label="删除对话"
            title="删除对话"
            @click.stop="handleDelete(conversation)"
            @keydown.enter.stop.prevent="handleDelete(conversation)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
              <path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M7.5 7l.7 11a1.6 1.6 0 0 0 1.6 1.5h4.4a1.6 1.6 0 0 0 1.6-1.5l.7-11" />
            </svg>
          </span>
        </button>
      </template>

      <div v-if="!filteredGroups.length" class="empty-history">
        {{ query.trim() ? '没有找到匹配的对话' : '还没有历史对话' }}
      </div>
    </nav>

    <footer class="sidebar-foot">
      <div class="account-row">
        <span class="status-dot" aria-hidden="true" />
        <div class="account-copy">
          <span class="account-title">AIPing 已连接</span>
          <span class="account-key">{{ maskedKey }}</span>
        </div>
      </div>
      <button type="button" class="logout-button" title="退出登录" aria-label="退出登录" @click="$emit('logout')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 8V6.4A1.4 1.4 0 0 0 12.6 5H6.4A1.4 1.4 0 0 0 5 6.4v11.2A1.4 1.4 0 0 0 6.4 19h6.2a1.4 1.4 0 0 0 1.4-1.4V16" />
          <path d="M10 12h10m-3-3 3 3-3 3" />
        </svg>
      </button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BrandMark from './BrandMark.vue'
import type { AgentConversation } from '@/types/agent'
import { confirmDialog } from '@/features/ui/dialog'
import { getApiKey } from '@/api/config'

const props = defineProps<{
  conversations: AgentConversation[]
  activeId: string | null
}>()

const emit = defineEmits<{
  (event: 'new'): void
  (event: 'select', id: string): void
  (event: 'delete', id: string): void
  (event: 'logout'): void
  (event: 'close'): void
}>()

const query = ref('')

const maskedKey = computed(() => {
  const key = getApiKey()
  if (!key) return '未连接'
  if (key.length <= 10) return key
  return `API Key ····${key.slice(-4)}`
})

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const filteredGroups = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const items = props.conversations.filter((conversation) =>
    keyword ? conversation.title.toLowerCase().includes(keyword) : true,
  )

  const today = startOfDay(Date.now())
  const yesterday = today - 24 * 60 * 60 * 1000
  const lastWeek = today - 6 * 24 * 60 * 60 * 1000

  const groups: Array<{ label: string; items: AgentConversation[] }> = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '近 7 天', items: [] },
    { label: '更早', items: [] },
  ]

  for (const conversation of items) {
    const day = startOfDay(conversation.updatedAt)
    if (day >= today) groups[0].items.push(conversation)
    else if (day >= yesterday) groups[1].items.push(conversation)
    else if (day >= lastWeek) groups[2].items.push(conversation)
    else groups[3].items.push(conversation)
  }

  return groups.filter((group) => group.items.length > 0)
})

async function handleDelete(conversation: AgentConversation) {
  const ok = await confirmDialog({
    title: '删除对话',
    message: `删除对话「${conversation.title || '新对话'}」？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  emit('delete', conversation.id)
}
</script>

<style scoped>
.agent-sidebar {
  display: flex;
  flex-direction: column;
  width: 272px;
  height: 100%;
  border-right: 1px solid var(--sf-line);
  background: var(--sf-surface-2);
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 12px 18px;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 9px;
}

.brand-text {
  color: var(--sf-ink);
  font-family: var(--sf-font-display);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.012em;
  line-height: 1;
}

.brand-cn {
  margin-left: 1px;
  padding-left: 8px;
  border-left: 1px solid var(--sf-line-strong);
  color: var(--sf-ink-3);
  font-size: 10px;
  font-weight: 620;
  letter-spacing: 0.14em;
  line-height: 1;
}

.close-button {
  display: none;
}

.new-chat-button {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 14px 12px;
  padding: 9px 12px;
  border: 1px solid var(--sf-line);
  border-radius: 11px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.new-chat-button svg {
  width: 15px;
  height: 15px;
  color: var(--sf-ink-2);
}

.new-chat-button kbd {
  margin-left: auto;
  color: var(--sf-ink-3);
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 500;
}

.new-chat-button:hover {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface);
  box-shadow: 0 2px 10px rgba(36, 31, 25, 0.04);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 14px 8px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-3);
  transition: background 150ms ease, border-color 150ms ease;
}

.search-box:focus-within {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface);
}

.search-box svg {
  width: 14px;
  height: 14px;
  flex: none;
}

.search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sf-ink);
  font: inherit;
  font-size: 12.5px;
}

.search-box input::placeholder {
  color: var(--sf-ink-3);
}

.conversation-list {
  flex: 1;
  min-height: 0;
  padding: 4px 10px 12px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--sf-line-strong) transparent;
}

.conversation-list::-webkit-scrollbar {
  width: 6px;
}

.conversation-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--sf-line-strong);
}

.group-label {
  padding: 12px 8px 5px;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.05em;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sf-ink-2);
  font-size: 12.8px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.conversation-item:hover {
  background: var(--sf-line-soft);
  color: #1d1d1a;
}

.conversation-item.active {
  background: var(--sf-line);
  color: var(--sf-ink);
  font-weight: 600;
}

.conversation-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 5px;
  color: #9b9b93;
  opacity: 0;
  cursor: pointer;
  transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
}

.delete-button svg {
  width: 13px;
  height: 13px;
}

.conversation-item:hover .delete-button,
.conversation-item.active .delete-button {
  opacity: 1;
}

.delete-button:hover {
  background: var(--sf-line);
  color: #8d3f3f;
}

.empty-history {
  padding: 26px 10px;
  color: var(--sf-ink-3);
  font-size: 12px;
  text-align: center;
}

.sidebar-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px 18px;
  border-top: 1px solid var(--sf-line);
}

.account-row {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}

.status-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #4e9d6c;
  box-shadow: 0 0 0 3px rgba(78, 157, 108, 0.12);
}

.account-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.account-title {
  color: #3d3d38;
  font-size: 11.5px;
  font-weight: 600;
}

.account-key {
  overflow: hidden;
  color: #9d9d95;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #97978f;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.logout-button svg {
  width: 16px;
  height: 16px;
}

.logout-button:hover {
  background: var(--sf-line-soft);
  color: #8d3f3f;
}

@media (max-width: 900px) {
  .agent-sidebar {
    width: 284px;
    box-shadow: 18px 0 48px rgba(36, 31, 25, 0.08);
  }

  .close-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--sf-ink-3);
    cursor: pointer;
  }

  .close-button svg {
    width: 17px;
    height: 17px;
  }

  .close-button:hover {
    background: var(--sf-line-soft);
  }
}
</style>
