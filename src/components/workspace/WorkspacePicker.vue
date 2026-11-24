<template>
  <div ref="rootRef" class="wsp">
    <button
      type="button"
      class="wsp-trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :title="active ? `${active.title}\n${active.path}` : '选择工作区'"
      @click="toggle"
    >
      <span class="wsp-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
          <path d="M3.4 7.2a2 2 0 0 1 2-2h4l1.8 2.2h7.4a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
        </svg>
      </span>
      <span class="wsp-label">{{ active ? active.title : '未分类' }}</span>
      <svg class="wsp-caret" :class="{ open }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <path d="m7 10 5 5 5-5" />
      </svg>
    </button>

    <div v-if="open" class="wsp-panel" role="listbox" aria-label="选择工作区">
      <button
        v-for="item in workspaces"
        :key="item.id"
        type="button"
        class="wsp-option"
        :class="{ active: item.id === store.activeId }"
        role="option"
        :aria-selected="item.id === store.activeId"
        @click="choose(item.id)"
      >
        <span class="wsp-option-copy">
          <strong>{{ item.title }}</strong>
          <small>{{ shorten(item.path) }}</small>
        </span>
        <span v-if="item.isDefault" class="wsp-tag">默认</span>
      </button>

      <div class="wsp-actions">
        <button type="button" class="wsp-action" @click="pickDirectory">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ nativePicker ? '选择本地目录…' : '添加本地目录' }}
        </button>
      </div>

      <!-- 浏览器里没有系统面板，退回手动输入路径 -->
      <form v-if="manualOpen" class="wsp-manual" @submit.prevent="submitManual">
        <input v-model="manualPath" spellcheck="false" placeholder="/Users/你的名字/项目" aria-label="工作目录路径" />
        <button type="submit" :disabled="!manualPath.trim()">添加</button>
      </form>
      <p v-if="error" class="wsp-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { chooseDirectoryNative, ensureDirectory, hasNativeDirectoryPicker } from '@/features/workspace/directoryPicker'

const store = useWorkspaceStore()
const open = ref(false)
const error = ref('')
const manualPath = ref('')
const manualOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const nativePicker = ref(hasNativeDirectoryPicker())

const workspaces = computed(() => store.sortedWorkspaces)
const active = computed(() => store.activeWorkspace)

function shorten(path: string): string {
  const home = store.localInfo?.homeDir || ''
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`
  return path
}

function toggle() {
  open.value = !open.value
  error.value = ''
  if (open.value) {
    void store.initializeDefault()
    void store.loadLocalInfo()
  }
}

function choose(id: string) {
  store.setActive(id)
  open.value = false
}

/** 优先用系统自带目录面板；浏览器里退回手动输入。 */
async function pickDirectory() {
  error.value = ''
  if (!nativePicker.value) {
    manualOpen.value = true
    return
  }
  const picked = await chooseDirectoryNative(store.localInfo?.homeDir)
  if (!picked) return
  const result = await ensureDirectory(picked)
  if (!result.ok) {
    error.value = result.error || '无法使用这个目录'
    return
  }
  store.adoptDirectory(result.path)
  open.value = false
}

async function submitManual() {
  const path = manualPath.value.trim()
  if (!path) return
  const result = await ensureDirectory(path)
  if (!result.ok) {
    error.value = result.error || '无法使用这个目录'
    return
  }
  store.adoptDirectory(result.path)
  manualPath.value = ''
  manualOpen.value = false
  open.value = false
}

function handleOutside(event: PointerEvent) {
  if (!open.value) return
  if (!rootRef.value?.contains(event.target as Node)) open.value = false
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
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
.wsp {
  position: relative;
  display: inline-flex;
}

.wsp-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 4px 9px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--sf-dur-2) var(--sf-ease-out), color var(--sf-dur-2) var(--sf-ease-out);
}

.wsp-trigger:hover {
  border-color: var(--sf-line-strong);
  color: var(--sf-ink);
}

.wsp-icon svg {
  width: 13px;
  height: 13px;
}

.wsp-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wsp-caret {
  width: 12px;
  height: 12px;
  flex: none;
  transition: transform var(--sf-dur-2) var(--sf-ease-out);
}

.wsp-caret.open {
  transform: rotate(180deg);
}

.wsp-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 60;
  width: 280px;
  padding: 6px;
  border: 1px solid var(--sf-line);
  border-radius: 12px;
  background: var(--sf-surface);
  box-shadow: var(--sf-shadow-md);
}

.wsp-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sf-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.wsp-option:hover,
.wsp-option.active {
  background: var(--sf-terra-wash);
}

.wsp-option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.wsp-option-copy strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wsp-option-copy small {
  overflow: hidden;
  color: var(--sf-ink-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wsp-tag {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-3);
  font-size: 9.5px;
}

.wsp-actions {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--sf-line-soft);
}

.wsp-action {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sf-terra);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.wsp-action:hover {
  background: var(--sf-terra-wash);
}

.wsp-action svg {
  width: 13px;
  height: 13px;
}

.wsp-manual {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.wsp-manual input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--sf-line);
  border-radius: 7px;
  font-family: var(--sf-font-mono);
  font-size: 11px;
}

.wsp-manual button {
  flex: none;
  padding: 5px 10px;
  border: 0;
  border-radius: 7px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.wsp-manual button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wsp-error {
  margin: 6px 2px 0;
  color: var(--sf-danger);
  font-size: 11px;
  line-height: 1.5;
}
</style>
