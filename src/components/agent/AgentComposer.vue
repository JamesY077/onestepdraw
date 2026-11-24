<template>
  <div class="composer-wrap">
    <div
      class="composer"
      :class="{ 'is-focused': focused, 'is-streaming': disabled, 'is-create': isCreateTone, 'is-dragging': dragging }"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <div v-if="dragging" class="drop-hint" aria-hidden="true">松开以添加参考素材</div>
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

      <div v-if="templateStore.applied.length" class="applied-templates" aria-label="已引用模板">
        <span class="applied-templates-label">模板</span>
        <span
          v-for="(template, index) in templateStore.applied"
          :key="template.id"
          class="applied-template-chip"
          :title="`${template.name} · ${template.category}`"
        >
          <span class="applied-template-ref">@模板{{ index + 1 }}</span>
          <img
            v-if="template.images[0]"
            class="applied-template-thumb"
            :src="template.images[0]"
            alt=""
          />
          <span class="applied-template-name">{{ template.name }}</span>
          <button
            type="button"
            class="applied-template-remove"
            :aria-label="`移除模板 ${template.name}`"
            title="移除这个模板"
            @click="templateStore.removeApplied(template.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
        <button
          type="button"
          class="applied-templates-add"
          title="继续从模板库添加模板"
          aria-label="继续从模板库添加模板"
          @click="openTemplatePage('builtin')"
        >
          +
        </button>
      </div>

      <div v-if="skillStore.activeSkills.length" class="applied-skills">
        <span class="applied-skills-label">Skill</span>
        <span
          v-for="(skill, index) in skillStore.activeSkills"
          :key="`composer-skill-${skill.name}-${index}`"
          class="applied-skill"
          :title="skill.description"
        >
          <span class="applied-skill-name">{{ skill.name }}</span>
          <button
            type="button"
            class="applied-skill-remove"
            :aria-label="`移除 Skill ${skill.name}`"
            @click="skillStore.removeActiveSkill(index)"
          >
            ×
          </button>
        </span>
        <button
          type="button"
          class="applied-skills-add"
          title="从模板库的 Skill 专区添加"
          @click="openTemplatePage('skill')"
        >
          +
        </button>
      </div>

      <div v-if="attachments.length || pendingCount > 0" class="attach-tray" aria-live="polite">
        <div v-for="item in attachments" :key="item.id" class="attach-chip">
          <img
            v-if="item.kind === 'image' && item.url"
            :src="item.url"
            alt=""
            class="attach-thumb"
          />
          <img
            v-else-if="item.kind === 'video' && item.frames?.length"
            :src="item.frames[0]"
            alt=""
            class="attach-thumb"
          />
          <span v-else class="attach-icon">
            <svg v-if="item.kind === 'video'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
              <path d="M10.4 9.6 15 12l-4.6 2.4z" fill="currentColor" stroke="none" />
            </svg>
            <svg v-else-if="item.kind === 'audio'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M6 10v4M10 7.5v9M14 9v6M18 11v2" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <path d="M6 3.8h7.5L18.5 9v11.2H6z" />
              <path d="M13.2 4v5.2h5.2" />
            </svg>
          </span>
          <span class="attach-copy">
            <strong :title="item.name">{{ item.name }}</strong>
            <small>{{ attachmentKindLabel(item.kind) }}<template v-if="attachmentMeta(item)"> · {{ attachmentMeta(item) }}</template></small>
          </span>
          <button
            type="button"
            class="attach-remove"
            title="移除"
            aria-label="移除参考素材"
            @click="removeAttachment(item.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div v-if="pendingCount > 0" class="attach-chip is-reading">
          <span class="attach-spinner" aria-hidden="true" />
          <span class="attach-copy">
            <strong>正在读取参考素材…</strong>
            <small>{{ pendingCount }} 个文件</small>
          </span>
        </div>
      </div>

      <p v-if="attachNotice" class="attach-notice" role="status">{{ attachNotice }}</p>

      <div class="composer-field">
        <MentionInput
          ref="mentionInputRef"
          v-model="text"
          class="composer-input"
          :placeholder="placeholderText"
          :tokens="mentionTokens"
          @keydown="handleKeydown"
          @input="handleInput"
          @paste="handlePaste"
          @focus="focused = true"
          @blur="focused = false"
          @scroll="syncMentionScroll"
        />
        <MentionMenu
          :open="mention.open.value"
          :groups="mentionGroups"
          :active-key="mention.activeKey.value"
          :position="mentionPosition"
          @pick="insertMention"
          @hover="setMentionActive"
        />
      </div>

      <div class="composer-bottom">
        <div class="composer-pickers">
          <button
            type="button"
            class="composer-icon"
            title="添加参考素材（最多 8 个）"
            aria-label="添加参考素材"
            :disabled="props.disabled || attachments.length >= MAX_ATTACHMENTS"
            @click="pickFiles"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18.4 11.6 12 18a4.2 4.2 0 0 1-6-6l7.1-7.1a2.9 2.9 0 0 1 4.1 4.1l-7.1 7.1a1.6 1.6 0 0 1-2.3-2.3l6.4-6.4" />
            </svg>
          </button>
          <button
            type="button"
            class="composer-icon"
            :class="{ active: templateStore.applied.length > 0 }"
            title="模板库"
            aria-label="打开模板库"
            @click="openTemplatePage('builtin')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <rect x="3.4" y="4.4" width="7.2" height="7.2" rx="2" />
              <rect x="13.4" y="4.4" width="7.2" height="7.2" rx="2" />
              <rect x="3.4" y="14.4" width="7.2" height="5.2" rx="2" />
              <rect x="13.4" y="14.4" width="7.2" height="5.2" rx="2" />
            </svg>
          </button>

          <input
            ref="fileInputRef"
            class="file-input"
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.txt,.md,.markdown,.json,.jsonl,.csv,.tsv,.srt,.vtt,.html,.css,.js,.mjs,.ts,.vue,.py,.yaml,.yml,.xml,.pdf"
            @change="handleFileInput"
          />

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
              <AgentMark
                :id="localAgentStore.isLocalEngine ? localAgentStore.selectedId : BUILTIN_ENGINE_ID"
                :name="localAgentStore.selectedLabel"
                :size="20"
              />
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
                <AgentMark :id="BUILTIN_ENGINE_ID" name="AIPing" :size="26" />
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
                  <AgentMark :id="agent.id" :name="agent.name" :size="26" />
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
            :disabled="!canSend"
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
import AgentMark from '@/components/agent/AgentMark.vue'
import MentionMenu, { type MentionGroup, type MentionItem } from '@/components/agent/MentionMenu.vue'
import MentionInput from '@/components/agent/MentionInput.vue'
import { useMentionRefs } from '@/composables/useMentionRefs'
import { BUILTIN_ENGINE_ID, useLocalAgentStore } from '@/stores/localAgentStore'
import { useModelStore } from '@/stores/modelStore'
import { useChatModeStore } from '@/stores/chatModeStore'
import { useTemplateStore } from '@/stores/templateStore'
import { useSkillStore } from '@/stores/skillStore'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  attachmentKindLabel,
  formatBytes,
  formatDuration,
  readAttachment,
} from '@/features/agent/attachments'
import type { AgentAttachment, ComposerSubmit } from '@/types/agent'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    placeholder?: string
    tone?: 'auto' | 'create' | 'chat'
    /** 输入框之外还有可用上下文（例如选中的时间轴片段）时，允许空文本发送。 */
    canSendExtra?: boolean
  }>(),
  {
    disabled: false,
    placeholder: '',
    tone: 'auto',
    canSendExtra: false,
  },
)
const emit = defineEmits<{
  (event: 'send', payload: ComposerSubmit): void
  (event: 'stop'): void
}>()

const router = useRouter()

function openTemplatePage(tab: 'builtin' | 'skill') {
  router.push({ path: '/templates', query: { tab, from: router.currentRoute.value.fullPath } })
}
const localAgentStore = useLocalAgentStore()
const modelStore = useModelStore()
const chatMode = useChatModeStore()
const templateStore = useTemplateStore()
const skillStore = useSkillStore()
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
const mentionInputRef = ref<InstanceType<typeof MentionInput> | null>(null)
const textareaRef = computed(() => mentionInputRef.value?.getTextarea() || null)
const mention = useMentionRefs(textareaRef)

/** 输入框里可高亮的引用标记。 */
const mentionTokens = computed(() => mentionGroups.value.flatMap((group) => group.items.map((item) => item.token)))
const mentionPosition = computed<Record<string, string> | undefined>(() => ({
  position: 'absolute',
  left: '0',
  right: '0',
  bottom: 'calc(100% + 8px)',
}))

/** @ 面板的候选：已引用的模板 → 已添加的附件 → 已启用的 Skill。 */
const mentionGroups = computed<MentionGroup[]>(() => {
  const groups: MentionGroup[] = []

  groups.push({
    key: 'template',
    label: '模板',
    items: templateStore.applied.map((template, index) => ({
      key: `template-${template.id}`,
      kind: 'template' as const,
      label: template.name,
      hint: template.category,
      thumb: template.images[0],
      glyph: '模',
      tag: `@模板${index + 1}`,
      token: `@模板${index + 1}`,
    })),
  })

  groups.push({
    key: 'attachment',
    label: '参考素材',
    items: attachments.value.map((item, index) => ({
      key: `attachment-${item.id}`,
      kind: 'attachment' as const,
      label: item.name,
      hint: attachmentKindLabel(item.kind),
      thumb: item.kind === 'image' ? item.url : item.frames?.[0],
      glyph: item.kind === 'image' ? '图' : item.kind === 'video' ? '视' : item.kind === 'audio' ? '音' : '文',
      tag: `@素材${index + 1}`,
      token: `@素材${index + 1}`,
    })),
  })

  groups.push({
    key: 'skill',
    label: 'Skill',
    items: skillStore.activeSkills.map((skill, index) => ({
      key: `skill-${index}-${skill.name}`,
      kind: 'skill' as const,
      label: skill.name,
      hint: skill.description,
      glyph: '技',
      tag: `@Skill${index + 1}`,
      token: `@Skill${index + 1}`,
    })),
  })

  return groups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !mention.query.value || item.label.toLowerCase().includes(mention.query.value.toLowerCase()),
    ),
  }))
})

const mentionFlat = computed(() => mentionGroups.value.flatMap((group) => group.items))

/**
 * 输入框里实际出现的 @引用。
 * 引用已经用强调色直接标在文字上，这里不再额外占用一行高度。
 */

function insertMention(item: MentionItem) {
  mention.insert(item.token)
  nextTick(resize)
}

function setMentionActive(key: string) {
  mention.activeKey.value = key
}

function handleInput() {
  resize()
  mention.onInput()
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const dragging = ref(false)
const attachments = ref<AgentAttachment[]>([])
const pendingCount = ref(0)
const attachNotice = ref('')
let noticeTimer: number | null = null

const canSend = computed(
  () =>
    !props.disabled &&
    pendingCount.value === 0 &&
    (!!text.value.trim() ||
      attachments.value.length > 0 ||
      templateStore.applied.length > 0 ||
      props.canSendExtra),
)

const placeholderText = computed(() => {
  if (props.placeholder) return props.placeholder
  if (chatMode.isCreate) {
    return chatMode.isAuto
      ? '直接说需求，模型会自己定下镜头与节奏…'
      : '先说说你想拍什么，步帧会问清镜头与节奏…'
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
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
})

function resize() {
  mentionInputRef.value?.resize()
}

function syncMentionScroll() {}

watch(text, () => nextTick(resize))

function notify(message: string) {
  attachNotice.value = message
  if (noticeTimer !== null) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    attachNotice.value = ''
    noticeTimer = null
  }, 2800)
}

function attachmentMeta(item: AgentAttachment): string {
  const parts: string[] = []
  if (item.kind === 'video' || item.kind === 'audio') {
    const duration = formatDuration(item.duration)
    if (duration) parts.push(duration)
  }
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`)
  if (item.size) parts.push(formatBytes(item.size))
  return parts.join(' · ')
}

function pickFiles() {
  if (props.disabled) return
  fileInputRef.value?.click()
}

async function addFiles(files: File[]) {
  if (props.disabled || !files.length) return
  const room = MAX_ATTACHMENTS - attachments.value.length
  if (room <= 0) {
    notify(`最多上传 ${MAX_ATTACHMENTS} 个参考素材，请先移除一个。`)
    return
  }
  const picked = files.slice(0, room)
  const skippedByCount = files.length - picked.length
  const accepted = picked.filter((file) => {
    if (file.size <= MAX_ATTACHMENT_BYTES) return true
    return false
  })
  const skippedBySize = picked.length - accepted.length

  pendingCount.value += accepted.length
  let failed = 0
  for (const file of accepted) {
    try {
      const item = await readAttachment(file)
      attachments.value.push(item)
    } catch {
      failed += 1
    } finally {
      pendingCount.value = Math.max(0, pendingCount.value - 1)
    }
  }

  const notes: string[] = []
  if (skippedByCount > 0) notes.push(`最多 ${MAX_ATTACHMENTS} 个，已跳过 ${skippedByCount} 个`)
  if (skippedBySize > 0) notes.push(`${skippedBySize} 个文件超过 ${MAX_ATTACHMENT_LABEL}，已跳过`)
  if (failed > 0) notes.push(`${failed} 个文件读取失败`)
  if (notes.length) notify(notes.join('；'))
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  void addFiles(files)
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((item) => item.id !== id)
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || [])
  if (!files.length) return
  event.preventDefault()
  void addFiles(files)
}

function handleDragOver(event: DragEvent) {
  if (props.disabled) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dragging.value = true
}

function handleDragLeave(event: DragEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  dragging.value = false
}

function handleDrop(event: DragEvent) {
  dragging.value = false
  if (props.disabled) return
  const files = Array.from(event.dataTransfer?.files || [])
  void addFiles(files)
}

function submit() {
  const content = text.value.trim()
  if (!canSend.value) return
  const payload: ComposerSubmit = {
    content,
    attachments: [...attachments.value],
    templates: [...templateStore.applied],
  }
  emit('send', payload)
  text.value = ''
  attachments.value = []
  // 模板和上传素材一样是「这一条消息」的引用，发完就清空。
  templateStore.clearApplied()
  attachNotice.value = ''
  mention.close()
  nextTick(() => {
    resize()
    mentionInputRef.value?.focus()
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (mention.open.value) {
    const items = mentionFlat.value
    const total = items.length
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!total) return
      const current = items.findIndex((item) => item.key === mention.activeKey.value)
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = (current + step + total) % total
      mention.activeKey.value = items[next].key
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const chosen = items.find((item) => item.key === mention.activeKey.value) || items[0]
      if (chosen) {
        event.preventDefault()
        insertMention(chosen)
        return
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      mention.close()
      return
    }
  }

  if (event.key === '@' && !event.isComposing) {
    // 空输入框直接按 @：把 @ 写进去并立刻展开可选引用
    if (!text.value.trim()) {
      event.preventDefault()
      mention.triggerOnEmpty()
      nextTick(resize)
      return
    }
  }

  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}

function focus() {
  mentionInputRef.value?.focus()
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
  background: var(--sf-surface);
  box-shadow:
    0 1px 2px rgba(36, 31, 25, 0.03),
    0 8px 30px rgba(36, 31, 25, 0.05);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.composer.is-focused {
  border-color: var(--sf-line-strong);
  box-shadow:
    0 1px 2px rgba(36, 31, 25, 0.03),
    0 10px 34px rgba(36, 31, 25, 0.07);
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
  border: 1px solid var(--sf-line-soft);
  border-radius: 8px;
  background: var(--sf-surface-2);
}

.mode-switch button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
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

.switch-dot {
  width: 4px;
  height: 4px;
  flex: none;
  border-radius: 50%;
  background: #c2603f;
}

.mode-switch button:hover {
  color: var(--sf-ink-2);
}

.mode-switch button.active {
  background: var(--sf-surface);
  color: var(--sf-ink);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.07);
}

.mode-switch button.auto-switch.active {
  background: var(--sf-ink);
  color: var(--sf-surface-2);
  box-shadow: none;
}

.mode-tip {
  min-width: 0;
  overflow: hidden;
  color: var(--sf-ink-4);
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

.composer.is-dragging {
  border-color: #c78a76;
  box-shadow:
    0 1px 2px rgba(36, 31, 25, 0.03),
    0 0 0 3px rgba(180, 71, 47, 0.08);
}

.drop-hint {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--sf-terra);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}

.composer {
  position: relative;
}

.applied-templates {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 78px;
  margin: 8px 12px 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.applied-templates-label {
  flex: none;
  color: var(--sf-ink-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.applied-template-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 260px;
  padding: 3px 4px 3px 9px;
  border-radius: 999px;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.applied-template-ref {
  flex: none;
  color: rgba(255, 255, 255, 0.58);
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.applied-template-thumb {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 4px;
  object-fit: cover;
}

.applied-template-name {
  overflow: hidden;
  font-size: 11px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.applied-template-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: var(--sf-surface);
  cursor: pointer;
}

.applied-template-remove svg {
  width: 9px;
  height: 9px;
}

.applied-template-remove:hover {
  background: rgba(255, 255, 255, 0.28);
}

.applied-templates-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  padding: 0;
  border: 1px dashed var(--sf-line-strong);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink-3);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.applied-templates-add:hover {
  border-color: var(--sf-line-strong);
  color: var(--sf-ink);
}

.attach-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #b9a49a;
  cursor: pointer;
}

.attach-remove svg {
  width: 12px;
  height: 12px;
}

.attach-remove:hover {
  background: rgba(180, 71, 47, 0.08);
  color: var(--sf-terra);
}

.applied-skills {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 7px 12px 0;
  padding: 4px 7px;
  overflow-x: auto;
  border: 1px solid var(--sf-line-soft);
  border-radius: 9px;
  background: var(--sf-surface-2);
  scrollbar-width: none;
}

.applied-skills::-webkit-scrollbar {
  display: none;
}

.applied-skills-label {
  flex: none;
  color: var(--sf-ink-3);
  font-size: 8.5px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.applied-skill {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 3px;
  padding: 2px 3px 2px 7px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 999px;
  background: var(--sf-surface);
}

.applied-skill-name {
  max-width: 150px;
  overflow: hidden;
  color: var(--sf-ink-2);
  font-size: 9.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.applied-skill-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--sf-ink-4);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.applied-skill-remove:hover {
  background: #fdf2ef;
  color: var(--sf-terra);
}

.applied-skills-add {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px dashed var(--sf-line-strong);
  border-radius: 50%;
  background: transparent;
  color: var(--sf-ink-3);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.applied-skills-add:hover {
  border-color: var(--sf-terra);
  color: var(--sf-terra);
}

.attach-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 12px 0;
}

.attach-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 220px;
  padding: 4px 5px 4px 4px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 9px;
  background: var(--sf-surface-2);
}

.attach-thumb {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 6px;
  object-fit: cover;
  background: var(--sf-surface-3);
}

.attach-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 6px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-3);
}

.attach-icon svg {
  width: 15px;
  height: 15px;
}

.attach-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0;
  line-height: 1.35;
}

.attach-copy strong {
  overflow: hidden;
  max-width: 130px;
  color: #34342f;
  font-size: 10.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-copy small {
  overflow: hidden;
  max-width: 130px;
  color: var(--sf-ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-chip.is-reading {
  color: var(--sf-ink-3);
}

.attach-spinner {
  width: 14px;
  height: 14px;
  margin: 0 8px;
  border: 1.5px solid var(--sf-line);
  border-top-color: var(--sf-terra);
  border-radius: 50%;
  animation: attach-spin 700ms linear infinite;
}

@keyframes attach-spin {
  to {
    transform: rotate(360deg);
  }
}

.attach-notice {
  margin: 7px 14px 0;
  color: var(--sf-terra);
  font-size: 10.5px;
  line-height: 1.5;
}

.file-input {
  display: none;
}

.composer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--sf-ink-3);
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.composer-icon svg {
  width: 16px;
  height: 16px;
}

.composer-icon:hover:not(:disabled) {
  border-color: var(--sf-line-soft);
  background: var(--sf-surface-2);
  color: var(--sf-ink-2);
}

.composer-icon.active {
  border-color: var(--sf-terra-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra);
}

.composer-icon:disabled {
  opacity: 0.4;
  cursor: default;
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
  color: var(--sf-ink);
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
  color: var(--sf-ink-3);
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
  border: 1px solid var(--sf-line-soft);
  border-radius: 8px;
  background: var(--sf-surface-2);
}

.model-search-icon {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--sf-ink-4);
}

.model-search {
  width: 100%;
  padding: 8px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sf-ink);
  font-family: inherit;
  font-size: 12px;
}

.model-search::placeholder {
  color: var(--sf-ink-4);
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
  border-color: var(--sf-line-soft);
  background: var(--sf-surface-2);
  color: var(--sf-ink-2);
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

.engine-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 40;
  width: 266px;
  max-height: min(58vh, 380px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 12px;
  background: var(--sf-surface);
  box-shadow:
    0 1px 2px rgba(36, 31, 25, 0.04),
    0 14px 40px rgba(36, 31, 25, 0.12);
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
  color: var(--sf-ink-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.engine-count {
  color: var(--sf-ink-4);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0;
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
  color: var(--sf-ink);
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
  color: var(--sf-ink-3);
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
  background: var(--sf-surface-2);
  color: var(--sf-ink-3);
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
  border-top: 1px solid var(--sf-surface-3);
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
  background: var(--sf-surface-3);
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
  background: var(--sf-ink);
  color: var(--sf-surface);
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
  background: var(--sf-line-soft);
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
    max-width: 38vw;
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

/* 窄屏：输入框底部控件很多，隐藏引擎文字、收紧模型与模式，避免互相压字。 */
@media (max-width: 560px) {
  .composer-bottom {
    gap: 6px;
    padding: 6px 8px 8px 10px;
  }

  .composer-pickers {
    gap: 0;
  }

  .composer-pickers .engine-button {
    gap: 4px;
    padding: 4px 5px;
  }

  .composer-pickers .engine-button .engine-label {
    display: none;
  }

  .automation-switch button {
    padding: 3px 6px;
    font-size: 10px;
  }

  .model-button {
    max-width: 78px;
    padding: 4px 5px;
  }

  .model-button .engine-label {
    max-width: 52px;
  }

  .composer-actions {
    gap: 4px;
  }

  /* 手机上一行横滑，避免 8 个素材把输入框撑到半屏高。 */
  .attach-tray {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 8px 10px 0;
  }

  .attach-tray::-webkit-scrollbar {
    display: none;
  }

  .attach-chip {
    flex: 0 0 auto;
    max-width: 205px;
  }

  .attach-chip.is-reading {
    padding-right: 10px;
  }
}

/* ── 创作对话：保持白色，只留陶土色发送键与更强的模式胶囊 ── */
.composer.is-create {
  border-color: #e8e4da;
  background: var(--sf-surface);
}

.composer.is-create.is-focused {
  border-color: #cfc7b8;
  box-shadow:
    0 1px 2px rgba(36, 31, 25, 0.03),
    0 10px 34px rgba(36, 31, 25, 0.07);
}

.composer.is-create .conversation-switch {
  border-color: #e9e5dc;
  background: #fbfaf7;
}

.composer.is-create .conversation-switch button.active {
  background: var(--sf-ink);
  color: var(--sf-surface-2);
  box-shadow: none;
}

.composer.is-create .conversation-switch button.active .switch-dot {
  background: #e08a63;
}

.composer.is-create .mode-tip {
  color: #a29a8c;
}

.composer.is-create .automation-switch {
  border-color: var(--sf-line-soft);
  background: var(--sf-surface-2);
}

.composer.is-create .automation-switch button.auto-switch.active {
  background: var(--sf-ink);
  color: var(--sf-surface-2);
  box-shadow: none;
}

.composer.is-create .send-button {
  background: var(--sf-terra);
  color: var(--sf-surface);
}

.composer.is-create .send-button:hover:not(:disabled) {
  background: #9c3a24;
}

.composer.is-create .send-button:disabled {
  background: #f0e6e0;
  color: #c0a89e;
}

/* ---------------- @ 引用 ---------------- */

.composer-field {
  position: relative;
  width: 100%;
  min-width: 0;
}

/* 输入框本身由 MentionInput 绘制，这里只保证不撑破容器 */
.composer-field .composer-input {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

/* 插入后的 @引用 用主题色标出，便于确认它落在哪一句里 */
.composer-mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 60px;
  overflow-y: auto;
}

.composer-mention-chip {
  max-width: 180px;
  overflow: hidden;
  padding: 2px 8px;
  border: 1px solid var(--sf-terra-soft);
  border-radius: 999px;
  background: var(--sf-terra-wash);
  color: var(--sf-terra);
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
