<template>
  <div class="composer-wrap">
    <div class="composer" :class="{ 'is-focused': focused, 'is-streaming': disabled, 'is-create': isCreateTone }">
      <div class="composer-modes">
        <div class="mode-switch conversation-switch" role="group" aria-label="对话模式">
          <button
            type="button"
            :class="{ active: !chatMode.isCreate }"
            :aria-pressed="!chatMode.isCreate"
            @click="chatMode.setConversation('chat')"
          >
            普通对话
          </button>
          <button
            type="button"
            :class="{ active: chatMode.isCreate }"
            :aria-pressed="chatMode.isCreate"
            @click="chatMode.setConversation('create')"
          >
            <i v-if="chatMode.isCreate" class="switch-dot" aria-hidden="true" />
            创作对话
          </button>
        </div>

        <span class="mode-tip">{{ modeTip }}</span>
      </div>

      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer-input"
        rows="1"
        :placeholder="placeholderText"
        :disabled="false"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="handleKeydown"
        @input="resize"
      />

      <div class="composer-bottom">
        <div class="composer-pickers">
          <div ref="engineRef" class="engine-anchor">
            <button
              type="button"
              class="engine-button"
              :class="{ 'is-local': localAgentStore.isLocalEngine }"
              :title="engineTitle"
              :aria-expanded="engineMenuOpen"
              aria-haspopup="listbox"
              @click="toggleEngineMenu"
            >
              <span class="model-dot" aria-hidden="true" />
              <span class="engine-label">{{ localAgentStore.selectedLabel }}</span>
              <svg class="engine-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m7 14 5-5 5 5" />
              </svg>
            </button>

            <div v-if="engineMenuOpen" class="engine-menu" role="listbox" aria-label="选择执行创作的 Agent">
              <div class="engine-menu-head">
                <span>使用哪个 Agent</span>
                <span class="engine-count">{{ localAgentStore.installedCount }} 个本机</span>
              </div>

              <button
                type="button"
                class="engine-option"
                :class="{ active: localAgentStore.selectedId === BUILTIN_ENGINE_ID }"
                role="option"
                :aria-selected="localAgentStore.selectedId === BUILTIN_ENGINE_ID"
                @click="chooseEngine(BUILTIN_ENGINE_ID)"
              >
                <span class="option-mark" aria-hidden="true" />
                <span class="option-copy">
                  <strong>AIPing · DeepSeek</strong>
                  <small>内置模型，无需安装</small>
                </span>
                <span v-if="localAgentStore.selectedId === BUILTIN_ENGINE_ID" class="option-check">✓</span>
              </button>

              <template v-if="localAgentStore.installedAgents.length">
                <p class="engine-group-label">本机 Agent</p>
                <button
                  v-for="agent in localAgentStore.installedAgents"
                  :key="agent.id"
                  type="button"
                  class="engine-option"
                  :class="{ active: localAgentStore.selectedId === agent.id }"
                  role="option"
                  :aria-selected="localAgentStore.selectedId === agent.id"
                  @click="chooseEngine(agent.id)"
                >
                  <span class="option-mark local" aria-hidden="true" />
                  <span class="option-copy">
                    <strong>{{ agent.name }}</strong>
                    <small>{{ [agent.vendor, agent.version].filter(Boolean).join(' · ') }}</small>
                  </span>
                  <span v-if="localAgentStore.selectedId === agent.id" class="option-check">✓</span>
                </button>
              </template>

              <p v-else class="engine-empty">
                {{
                  localAgentStore.isScanning
                    ? '正在扫描本机 Agent…'
                    : localAgentStore.status === 'error'
                      ? '本地扫描不可用，请用 npm start 启动'
                      : '还没有检测到已安装的 Agent'
                }}
              </p>

              <div class="engine-menu-foot">
                <button type="button" class="engine-link" :disabled="localAgentStore.isScanning" @click="rescan">
                  {{ localAgentStore.isScanning ? '扫描中…' : '重新扫描' }}
                </button>
                <button type="button" class="engine-link" @click="openSettings">安装与管理</button>
              </div>
            </div>
          </div>

          <div class="mode-switch automation-switch" role="group" aria-label="自动模式">
            <button
              type="button"
              :class="{ active: !chatMode.isAuto }"
              :aria-pressed="!chatMode.isAuto"
              title="默认模式：先分轮问清需求"
              @click="chatMode.setAutomation('default')"
            >
              默认模式
            </button>
            <button
              type="button"
              class="auto-switch"
              :class="{ active: chatMode.isAuto }"
              :aria-pressed="chatMode.isAuto"
              title="完全模式：模型自行决策，直接产出"
              @click="chatMode.setAutomation('auto')"
            >
              完全模式
            </button>
          </div>
        </div>

        <div class="composer-actions">
          <div v-if="!localAgentStore.isLocalEngine" ref="modelRef" class="model-anchor">
            <button
              type="button"
              class="engine-button model-button"
              :title="`当前对话模型：${modelStore.selectedId}`"
              :aria-expanded="modelMenuOpen"
              aria-haspopup="listbox"
              @click="toggleModelMenu"
            >
              <span class="engine-label">{{ modelStore.selectedId }}</span>
              <svg class="engine-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m7 14 5-5 5 5" />
              </svg>
            </button>

            <div v-if="modelMenuOpen" class="engine-menu model-menu" role="listbox" aria-label="选择 AIPing 模型">
              <div class="model-search-row">
                <svg class="model-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
                <input
                  ref="modelSearchRef"
                  v-model="modelQuery"
                  class="model-search"
                  type="text"
                  placeholder="搜索模型…"
                  autocomplete="off"
                  spellcheck="false"
                  @keydown.stop
                  @keydown.esc.stop="modelMenuOpen = false"
                />
              </div>

              <p v-if="modelStore.status === 'error'" class="engine-empty">
                {{ modelStore.error }}
                <button type="button" class="engine-link" @click="reloadModels">重试</button>
              </p>
              <p v-else-if="!modelStore.isLoaded" class="engine-empty">正在读取 AIPing 模型…</p>

              <div v-else class="model-list">
                <button
                  v-for="model in filteredModels"
                  :key="model.id"
                  type="button"
                  class="engine-option"
                  :class="{ active: modelStore.selectedId === model.id }"
                  role="option"
                  :aria-selected="modelStore.selectedId === model.id"
                  @click="chooseModel(model.id)"
                >
                  <span class="option-copy">
                    <strong>{{ model.id }}</strong>
                    <small>
                      {{ model.kind === 'vision' ? '多模态' : '文本' }}
                      <template v-if="model.context"> · 上下文 {{ formatContext(model.context) }}</template>
                    </small>
                  </span>
                  <span v-if="modelStore.selectedId === model.id" class="option-check">✓</span>
                </button>
                <p v-if="!filteredModels.length" class="engine-empty">
                  没有匹配「{{ modelQuery }}」的模型
                </p>
              </div>

              <div class="engine-menu-foot">
                <button
                  type="button"
                  class="engine-link"
                  :disabled="modelStore.status === 'loading'"
                  @click="reloadModels"
                >
                  {{ modelStore.status === 'loading' ? '刷新中…' : '刷新列表' }}
                </button>
                <span class="engine-count">{{ modelStore.models.length }} 个模型</span>
              </div>
            </div>
          </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BUILTIN_ENGINE_ID, useLocalAgentStore } from '@/stores/localAgentStore'
import { useModelStore } from '@/stores/modelStore'
import { useChatModeStore } from '@/stores/chatModeStore'

const props = withDefaults(
  defineProps<{ disabled?: boolean; placeholder?: string; tone?: 'auto' | 'create' | 'chat' }>(),
  {
    disabled: false,
    placeholder: '',
    tone: 'auto',
  },
)
const emit = defineEmits<{
  (event: 'send', content: string): void
  (event: 'stop'): void
}>()

const router = useRouter()
const localAgentStore = useLocalAgentStore()
const modelStore = useModelStore()
const chatMode = useChatModeStore()
/** tone=auto 跟随模式开关；剪辑台里固定为创作色。 */
const isCreateTone = computed(() =>
  props.tone === 'auto' ? chatMode.isCreate : props.tone === 'create',
)
const engineRef = ref<HTMLElement | null>(null)
const engineMenuOpen = ref(false)
const modelRef = ref<HTMLElement | null>(null)
const modelMenuOpen = ref(false)
const modelQuery = ref('')
const modelSearchRef = ref<HTMLInputElement | null>(null)
const text = defineModel<string>({ default: '' })
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const focused = ref(false)

const placeholderText = computed(() => {
  if (props.placeholder) return props.placeholder
  if (chatMode.isCreate) {
    return chatMode.isAuto
      ? '直接说需求，模型会自己定下镜头与节奏…'
      : '先说说你想拍什么，OneStep 会问清镜头与节奏…'
  }
  return `给 ${localAgentStore.selectedLabel} 发消息…`
})

const modeTip = computed(() => {
  if (chatMode.isCreate && chatMode.isAuto) return '模型自行决策，直接产出并进入时间轴'
  if (chatMode.isCreate) return '先问清需求，再进入剪辑台'
  if (chatMode.isAuto) return '模型自行补全细节，不追问'
  return '正常聊天与创作建议'
})
const engineTitle = computed(() =>
  localAgentStore.isLocalEngine
    ? `${localAgentStore.selectedLabel} · ${localAgentStore.selectedHint}`
    : 'AIPing · DeepSeek，内置模型',
)

const filteredModels = computed(() => {
  const query = modelQuery.value.trim().toLowerCase()
  if (!query) return modelStore.models
  return modelStore.models.filter((model) => model.id.toLowerCase().includes(query))
})

function formatContext(value: number): string {
  if (!value) return ''
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return String(value)
}

function toggleEngineMenu() {
  if (props.disabled) return
  engineMenuOpen.value = !engineMenuOpen.value
  if (engineMenuOpen.value) {
    modelMenuOpen.value = false
    localAgentStore.ensureScanned()
  }
}

function chooseEngine(id: string) {
  if (props.disabled) return
  localAgentStore.select(id)
  engineMenuOpen.value = false
}

function toggleModelMenu() {
  if (props.disabled) return
  modelMenuOpen.value = !modelMenuOpen.value
  if (modelMenuOpen.value) {
    engineMenuOpen.value = false
    modelQuery.value = ''
    modelStore.ensureLoaded()
    nextTick(() => modelSearchRef.value?.focus())
  }
}

function chooseModel(id: string) {
  modelStore.select(id)
  modelMenuOpen.value = false
}

function reloadModels() {
  void modelStore.load(true)
}

function rescan() {
  void localAgentStore.scan(true)
}

function openSettings() {
  engineMenuOpen.value = false
  modelMenuOpen.value = false
  router.push('/settings#agents')
}

function handleDocumentPointer(event: MouseEvent) {
  const target = event.target as Node
  if (engineMenuOpen.value && !engineRef.value?.contains(target)) {
    engineMenuOpen.value = false
  }
  if (modelMenuOpen.value && !modelRef.value?.contains(target)) {
    modelMenuOpen.value = false
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    engineMenuOpen.value = false
    modelMenuOpen.value = false
  }
}

onMounted(() => {
  localAgentStore.ensureScanned()
  modelStore.ensureLoaded()
  document.addEventListener('mousedown', handleDocumentPointer)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointer)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

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

.composer-modes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 12px 0 12px;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid #ecece6;
  border-radius: 8px;
  background: #fafaf7;
}

.mode-switch button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #9a9a92;
  font-family: inherit;
  font-size: 11px;
  font-weight: 550;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.switch-dot {
  width: 4px;
  height: 4px;
  flex: none;
  border-radius: 50%;
  background: #c2603f;
}

.mode-switch button:hover {
  color: #4a4a44;
}

.mode-switch button.active {
  background: #ffffff;
  color: #1d1d1b;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.07);
}

.mode-switch button.auto-switch.active {
  background: #111110;
  color: #fafaf7;
  box-shadow: none;
}

.mode-tip {
  min-width: 0;
  overflow: hidden;
  color: #b0b0a8;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .mode-tip {
    display: none;
  }
  .mode-switch button {
    padding: 3px 7px;
  }
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

.composer-pickers {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.model-anchor {
  position: relative;
  min-width: 0;
}

.model-button {
  max-width: 190px;
  color: #9a9a92;
}

.model-button .engine-label {
  max-width: 168px;
}

.model-menu {
  max-height: min(64vh, 430px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.model-search-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
  margin: 1px 2px 5px;
  padding: 0 9px;
  border: 1px solid #ecece6;
  border-radius: 8px;
  background: #fafaf7;
}

.model-search-icon {
  width: 14px;
  height: 14px;
  flex: none;
  color: #b0b0a8;
}

.model-search {
  width: 100%;
  padding: 8px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #2c2c28;
  font-family: inherit;
  font-size: 12px;
}

.model-search::placeholder {
  color: #b3b3ab;
}

.model-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.model-menu .engine-menu-foot {
  flex: none;
}

.model-menu .engine-empty {
  margin: 4px 6px 8px;
}

.engine-anchor {
  position: relative;
  min-width: 0;
}

.engine-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 250px;
  padding: 4px 7px 4px 5px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #8b8b83;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.engine-button:hover {
  border-color: #e9e9e3;
  background: #fafaf8;
  color: #4a4a44;
}

.engine-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.engine-caret {
  width: 12px;
  height: 12px;
  flex: none;
  color: #b4b4ac;
}

.model-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: #5aa77a;
  box-shadow: 0 0 0 2.5px rgba(90, 167, 122, 0.13);
}

.engine-button.is-local .model-dot {
  background: #4f86c6;
  box-shadow: 0 0 0 2.5px rgba(79, 134, 198, 0.14);
}

.engine-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: 266px;
  max-height: min(58vh, 380px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #e6e6df;
  border-radius: 12px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(17, 17, 16, 0.04),
    0 14px 40px rgba(17, 17, 16, 0.12);
}

/* 模型选择在发送按钮左边，菜单要向右对齐，避免超出视口。 */
.engine-menu.model-menu {
  right: 0;
  left: auto;
  width: 336px;
}

.engine-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px 7px;
  color: #8d8d85;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.engine-count {
  color: #b3b3ab;
  font-weight: 500;
}

.engine-group-label {
  margin: 7px 8px 3px;
  color: #a8a8a0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.engine-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #2c2c28;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}

.engine-option:hover {
  background: #f7f7f3;
}

.engine-option.active {
  background: #f3f3ee;
}

.option-mark {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #5aa77a;
}

.option-mark.local {
  background: #4f86c6;
}

.option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.option-copy strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-copy small {
  overflow: hidden;
  color: #96968e;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-check {
  flex: none;
  color: #55554e;
  font-size: 11px;
}

.engine-empty {
  margin: 4px 8px 8px;
  padding: 10px 8px;
  border-radius: 8px;
  background: #fafaf7;
  color: #9c9c94;
  font-size: 11px;
  line-height: 1.6;
}

.engine-menu-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding: 7px 6px 2px;
  border-top: 1px solid #f0f0ea;
}

.engine-link {
  padding: 3px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7f7f77;
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.engine-link:hover:not(:disabled) {
  background: #f4f4ef;
  color: #33332e;
}

.engine-link:disabled {
  color: #b7b7af;
  cursor: default;
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

  .engine-button {
    max-width: 34vw;
  }

  .model-button {
    max-width: 30vw;
  }

  .model-button .engine-label {
    max-width: 26vw;
  }

  .model-menu {
    width: min(86vw, 336px);
  }

  .engine-menu.model-menu {
    width: min(78vw, 336px);
  }

  .automation-switch button {
    padding: 3px 7px;
  }
}

/* ── 创作对话：保持白色，只留陶土色发送键与更强的模式胶囊 ── */
.composer.is-create {
  border-color: #e8e4da;
  background: #ffffff;
}

.composer.is-create.is-focused {
  border-color: #cfc7b8;
  box-shadow:
    0 1px 2px rgba(17, 17, 16, 0.03),
    0 10px 34px rgba(17, 17, 16, 0.07);
}

.composer.is-create .conversation-switch {
  border-color: #e9e5dc;
  background: #fbfaf7;
}

.composer.is-create .conversation-switch button.active {
  background: #141412;
  color: #fafaf7;
  box-shadow: none;
}

.composer.is-create .conversation-switch button.active .switch-dot {
  background: #e08a63;
}

.composer.is-create .mode-tip {
  color: #a29a8c;
}

.composer.is-create .automation-switch {
  border-color: #ecece6;
  background: #fafaf7;
}

.composer.is-create .automation-switch button.auto-switch.active {
  background: #141412;
  color: #fafaf7;
  box-shadow: none;
}

.composer.is-create .send-button {
  background: #b4472f;
  color: #fff8f2;
}

.composer.is-create .send-button:hover:not(:disabled) {
  background: #9c3a24;
}

.composer.is-create .send-button:disabled {
  background: #f0e6e0;
  color: #c0a89e;
}
</style>
