<template>
  <div ref="rootRef" class="ws-switcher">
    <button
      type="button"
      class="ws-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :title="active ? `${active.title}\n${active.path}` : '选择工作区'"
      @click="toggle"
    >
      <span class="ws-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
          <path d="M3.4 7.2a2 2 0 0 1 2-2h4l1.8 2.2h7.4a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
        </svg>
      </span>
      <span class="ws-copy">
        <strong>{{ active ? active.title : '未分类' }}</strong>
        <small>{{ active ? shorten(active.path) : '选择本地目录' }}</small>
      </span>
      <svg class="ws-caret" :class="{ open }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>

    <div v-if="open" class="ws-panel" role="listbox" aria-label="工作区">
      <div class="ws-panel-head">
        <span>工作区</span>
        <span class="ws-count">{{ workspaces.length }} 个</span>
      </div>

      <button
        v-for="item in workspaces"
        :key="item.id"
        type="button"
        class="ws-option"
        :class="{ active: item.id === store.activeId }"
        role="option"
        :aria-selected="item.id === store.activeId"
        @click="choose(item.id)"
      >
        <span class="ws-option-mark" aria-hidden="true">{{ item.isDefault ? '默' : '自' }}</span>
        <span class="ws-option-copy">
          <strong>{{ item.title }}</strong>
          <small>{{ shorten(item.path) }}</small>
        </span>
        <span v-if="item.isDefault" class="ws-tag">默认</span>
      </button>

      <div v-if="!workspaces.length" class="ws-empty">还没有工作区</div>

      <div class="ws-actions">
        <button type="button" class="ws-action" @click="pickDirectory">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          指定本地目录
        </button>
      </div>
    </div>

    <!-- 目录选择：逐层浏览，也可以直接输入路径 -->
    <div v-if="pickerOpen" class="ws-picker" role="dialog" aria-label="选择本地工作目录">
      <header>
        <strong>选择本地工作目录</strong>
        <button type="button" aria-label="关闭" @click="closePicker">✕</button>
      </header>
      <div class="ws-picker-path">
        <button type="button" :disabled="!listing?.parent" title="上一级" @click="browse(listing?.parent)">
          ↑
        </button>
        <input v-model="manualPath" spellcheck="false" placeholder="/Users/你的名字/项目" @keydown.enter="browse(manualPath)" />
        <button type="button" @click="browse(manualPath)">打开</button>
      </div>
      <p v-if="pickerError" class="ws-picker-error" role="alert">{{ pickerError }}</p>
      <ul v-else class="ws-picker-list">
        <li v-for="entry in listing?.entries || []" :key="entry.path">
          <button type="button" @click="browse(entry.path)">{{ entry.name }}</button>
        </li>
        <li v-if="!(listing?.entries || []).length" class="ws-picker-empty">这个目录下没有子目录</li>
      </ul>
      <footer>
        <span class="ws-picker-current">{{ listing?.path || manualPath }}</span>
        <button type="button" class="ws-picker-ok" :disabled="!listing?.path" @click="adopt(listing!.path)">
          用这个目录
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface DirectoryListing {
  path: string
  parent: string
  entries: { name: string; path: string }[]
}

const store = useWorkspaceStore()
const open = ref(false)
const pickerOpen = ref(false)
const pickerError = ref('')
const manualPath = ref('')
const listing = ref<DirectoryListing | null>(null)
const rootRef = ref<HTMLElement | null>(null)

const workspaces = computed(() => store.sortedWorkspaces)
const active = computed(() => store.activeWorkspace)

function shorten(path: string): string {
  const home = store.localInfo?.homeDir || ''
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`
  return path
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    void store.initializeDefault()
    // 需要主目录信息来做路径缩短与首选浏览位置
    void store.loadLocalInfo()
  }
}

function choose(id: string) {
  store.setActive(id)
  open.value = false
  void store.loadLocalInfo()
}

async function browse(path?: string) {
  if (!path) return
  pickerError.value = ''
  try {
    const response = await fetch('/local/workspace/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = (await response.json()) as DirectoryListing & { ok: boolean; error?: string }
    if (!data.ok) throw new Error(data.error || '无法读取这个目录')
    listing.value = { path: data.path, parent: data.parent, entries: data.entries || [] }
    manualPath.value = data.path
  } catch (error) {
    pickerError.value = (error as Error)?.message || '无法读取这个目录'
  }
}

function pickDirectory() {
  open.value = false
  pickerOpen.value = true
  pickerError.value = ''
  // 从主目录开始浏览，比直接落到空的默认工作区更容易挑到目标目录。
  void browse(store.localInfo?.homeDir || store.activeWorkspace?.path)
}

function closePicker() {
  pickerOpen.value = false
  pickerError.value = ''
}

/** 登记目录：先在服务端确保目录存在，再写入工作区列表。 */
async function adopt(path: string) {
  try {
    const response = await fetch('/local/workspace/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = (await response.json()) as { ok: boolean; error?: string }
    if (!data.ok) throw new Error(data.error || '无法使用这个目录')
    store.adoptDirectory(path)
    closePicker()
  } catch (error) {
    pickerError.value = (error as Error)?.message || '无法使用这个目录'
  }
}

function handleOutside(event: PointerEvent) {
  if (!open.value) return
  if (!rootRef.value?.contains(event.target as Node)) open.value = false
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (pickerOpen.value) closePicker()
  else open.value = false
}

onMounted(() => {
  void store.initializeDefault()
  document.addEventListener('pointerdown', handleOutside)
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<style scoped>
.ws-switcher {
  position: relative;
}

.ws-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--sf-line);
  border-radius: 12px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--sf-dur-2) var(--sf-ease-out), background var(--sf-dur-2) var(--sf-ease-out);
}

.ws-trigger:hover {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface-2);
}

.ws-icon svg {
  width: 16px;
  height: 16px;
  color: var(--sf-ink-2);
}

.ws-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.ws-copy strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-copy small {
  overflow: hidden;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-caret {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--sf-ink-3);
  transition: transform var(--sf-dur-2) var(--sf-ease-out);
}

.ws-caret.open {
  transform: rotate(180deg);
}

.ws-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 40;
  padding: 6px;
  border: 1px solid var(--sf-line);
  border-radius: 14px;
  background: var(--sf-surface);
  box-shadow: var(--sf-shadow-md);
}

.ws-panel-head {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px 6px;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ws-count {
  letter-spacing: 0;
  text-transform: none;
}

.ws-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--sf-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ws-option:hover,
.ws-option.active {
  background: var(--sf-terra-wash);
}

.ws-option-mark {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-2);
  font-size: 10.5px;
  font-weight: 700;
}

.ws-option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.ws-option-copy strong {
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-option-copy small {
  overflow: hidden;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-tag {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-3);
  font-size: 10px;
}

.ws-empty {
  padding: 10px;
  color: var(--sf-ink-3);
  font-size: 12px;
}

.ws-actions {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--sf-line-soft);
}

.ws-action {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--sf-terra);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.ws-action:hover {
  background: var(--sf-terra-wash);
}

.ws-action svg {
  width: 14px;
  height: 14px;
}

.ws-picker {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1200;
  display: flex;
  width: min(560px, calc(100vw - 40px));
  max-height: min(560px, calc(100vh - 80px));
  flex-direction: column;
  padding: 14px;
  border: 1px solid var(--sf-line-strong);
  border-radius: 16px;
  background: var(--sf-surface);
  box-shadow: var(--sf-shadow-lg);
  transform: translate(-50%, -50%);
}

.ws-picker header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ws-picker header button {
  border: 0;
  background: transparent;
  color: var(--sf-ink-3);
  cursor: pointer;
}

.ws-picker-path {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.ws-picker-path input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--sf-line);
  border-radius: 8px;
  font-family: var(--sf-font-mono);
  font-size: 12px;
}

.ws-picker-path button {
  padding: 6px 10px;
  border: 1px solid var(--sf-line);
  border-radius: 8px;
  background: var(--sf-surface-2);
  color: var(--sf-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ws-picker-list {
  flex: 1;
  min-height: 120px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--sf-line-soft);
  border-radius: 10px;
  list-style: none;
}

.ws-picker-list button {
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--sf-ink);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}

.ws-picker-list button:hover {
  background: var(--sf-surface-3);
}

.ws-picker-empty {
  padding: 10px;
  color: var(--sf-ink-3);
  font-size: 12px;
}

.ws-picker-error {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--sf-danger-soft);
  color: var(--sf-danger);
  font-size: 12px;
}

.ws-picker footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.ws-picker-current {
  overflow: hidden;
  color: var(--sf-ink-3);
  font-family: var(--sf-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-picker-ok {
  flex: none;
  padding: 7px 14px;
  border: 0;
  border-radius: 9px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.ws-picker-ok:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
