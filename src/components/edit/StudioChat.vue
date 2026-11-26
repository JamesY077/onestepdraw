<template>
  <aside class="studio-chat">
    <header class="sc-head">
      <div class="sc-title">
        <span class="sc-dot" aria-hidden="true" />
        <strong>创作对话</strong>
        <span class="sc-engine">{{ agentStore.isStreaming ? '正在生成' : engineLabel }}</span>
      </div>
      <div class="sc-auto" role="group" aria-label="自动程度">
        <button
          type="button"
          :class="{ active: !chatMode.isAuto }"
          :aria-pressed="!chatMode.isAuto"
          title="默认模式：先分轮问清需求"
          @click="chatMode.setAutomation('default')"
        >
          默认
        </button>
        <button
          type="button"
          :class="{ active: chatMode.isAuto }"
          :aria-pressed="chatMode.isAuto"
          title="完全模式：模型自行决策，直接产出"
          @click="chatMode.setAutomation('auto')"
        >
          完全
        </button>
      </div>
    </header>

    <div ref="scrollRef" class="sc-scroll">
      <section v-if="!messages.length" class="sc-empty">
        <p>继续用对话改这支片。</p>
        <span>可以直接说「第二个镜头换成夜景」「把配乐调小一点」，也可以继续生成新素材，结果会自动落到时间轴。</span>
        <div class="sc-chips">
          <button v-for="chip in chips" :key="chip" type="button" @click="sendChip(chip)">{{ chip }}</button>
        </div>
      </section>

      <section v-else class="sc-messages" aria-live="polite">
        <AgentMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :is-streaming="message.status === 'streaming'"
          :can-retry="message.id === lastAssistantId"
          compact
          @retry="retry"
          @generation-retry="agentStore.retryGeneration"
          @ask-answer="handleAskAnswer"
          @creative-handoff-accept="agentStore.acceptCreativeHandoff"
          @creative-handoff-dismiss="agentStore.dismissCreativeHandoff"
        />
      </section>
    </div>

    <div class="sc-composer">
      <div v-if="pendingBatches.length || selectedClips.length" class="sc-selection" aria-label="待发送的片段修改">
        <div class="sc-selection-head">
          <span class="sc-selection-title">
            <i aria-hidden="true" />
            <template v-if="pendingBatches.length">
              待发送 {{ queuedCount }} 段 · {{ pendingBatches.length }} 条修改
            </template>
            <template v-else>只改选中的 {{ selectedClips.length }} 个片段</template>
          </span>
          <button v-if="pendingBatches.length" type="button" @click="$emit('clear-pending')">清空</button>
          <button v-else type="button" @click="$emit('clear-clips')">取消选择</button>
        </div>

        <ul v-if="pendingBatches.length" class="sc-queue">
          <li v-for="batch in pendingBatches" :key="batch.id" class="sc-queue-item">
            <span class="sc-queue-thumbs" aria-hidden="true">
              <template v-for="clip in batch.clips.slice(0, 3)" :key="clip.id">
                <img v-if="clipThumb(clip)" :src="clipThumb(clip)" alt="" />
                <span v-else class="sc-queue-kind">{{ kindLetter(clip.kind) }}</span>
              </template>
              <span v-if="batch.clips.length > 3" class="sc-queue-more">+{{ batch.clips.length - 3 }}</span>
            </span>
            <span class="sc-queue-copy">
              <strong>{{ batch.clips.map((clip) => clip.name).join('、') }}</strong>
              <span class="sc-queue-note" :class="{ 'is-empty': !batch.note }" :title="batch.note || ''">
                {{ batch.note || '让 AI 针对这段给出修改建议' }}
              </span>
            </span>
            <button
              type="button"
              class="sc-queue-remove"
              title="移出待发送"
              aria-label="移出待发送"
              @click="$emit('remove-batch', batch.id)"
            >×</button>
          </li>
        </ul>

        <p v-if="pendingBatches.length && selectedClips.length" class="sc-queue-live">
          还有 {{ selectedClips.length }} 段正在选中，点时间轴上的「发给 AI」才会加入
        </p>

        <div v-if="!pendingBatches.length" class="sc-selection-list">
          <span
            v-for="clip in selectedClips"
            :key="clip.id"
            class="sc-selection-chip"
            :title="`${clip.name} · ${clip.start.toFixed(1)}s → ${(clip.start + clip.duration).toFixed(1)}s`"
          >
            <img v-if="clipThumb(clip)" :src="clipThumb(clip)" alt="" />
            <span v-else class="sc-selection-kind">{{ kindLetter(clip.kind) }}</span>
            <span class="sc-selection-name">{{ clip.name }}</span>
            <span class="sc-selection-time">{{ clip.duration.toFixed(1) }}s</span>
          </span>
        </div>

        <button
          v-if="previewText"
          type="button"
          class="sc-preview-toggle"
          :aria-expanded="previewOpen"
          @click="previewOpen = !previewOpen"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" :class="{ open: previewOpen }">
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ previewOpen ? '收起这次发送的内容' : `预览这次发给 AI 的内容 · ${previewClips.length} 段` }}
        </button>
        <div v-if="previewOpen" class="sc-preview">
          <ul class="sc-preview-list">
            <li v-for="clip in previewClips" :key="clip.id">
              <span class="sc-preview-name">{{ clip.name }}</span>
              <span class="sc-preview-time">{{ clip.start.toFixed(1) }}s → {{ (clip.start + clip.duration).toFixed(1) }}s</span>
              <span class="sc-preview-note" :class="{ 'is-empty': !clip.note }">
                {{ clip.note || '未写意见，AI 会自行判断' }}
              </span>
            </li>
          </ul>
          <p v-if="draft.trim()" class="sc-preview-draft">
            <span>补充要求</span>{{ draft.trim() }}
          </p>
          <details class="sc-preview-raw">
            <summary>原始提示词</summary>
            <pre>{{ previewText }}</pre>
          </details>
        </div>
      </div>
      <AgentComposer
        ref="composerRef"
        v-model="draft"
        tone="create"
        :disabled="agentStore.isStreaming"
        :can-send-extra="selectedClips.length > 0 || pendingBatches.length > 0"
        :placeholder="composerPlaceholder"
        @send="send"
        @stop="agentStore.stopStreaming"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AgentComposer from '@/components/agent/AgentComposer.vue'
import AgentMessage from '@/components/agent/AgentMessage.vue'
import { useAgentStore } from '@/stores/agentStore'
import { useEditProjectStore, projectDuration } from '@/stores/editProjectStore'
import { parseTimeRanges, resolveRevisionTargets } from '@/features/edit/revisionIntent'
import { useChatModeStore } from '@/stores/chatModeStore'
import { useLocalAgentStore } from '@/stores/localAgentStore'
import { useModelStore } from '@/stores/modelStore'
import { describeClipContext } from '@/features/agent/clipContext'
import type { AgentClipRef, ComposerSubmit } from '@/types/agent'

interface PendingClipBatch {
  id: string
  note: string
  clips: AgentClipRef[]
}

const props = withDefaults(
  defineProps<{
    conversationId: string
    projectId: string
    /** 时间轴上当前选中的片段；有值时这一轮只把这几段发给 AI。 */
    selectedClips?: AgentClipRef[]
    /** 已经加入待发送区的多段修改，发送时统一带上。 */
    pendingBatches?: PendingClipBatch[]
    /** 时间轴顶部正在写的意见；直接发送当前选中片段时也带上。 */
    clipNote?: string
  }>(),
  { selectedClips: () => [], pendingBatches: () => [], clipNote: '' },
)

const emit = defineEmits<{
  (event: 'clear-clips'): void
  (event: 'clear-note'): void
  (event: 'remove-batch', id: string): void
  (event: 'clear-pending'): void
  (event: 'consume-pending'): void
}>()

const agentStore = useAgentStore()
const projectStore = useEditProjectStore()
const chatMode = useChatModeStore()
const localAgentStore = useLocalAgentStore()
const modelStore = useModelStore()
const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof AgentComposer> | null>(null)
const draft = ref('')

const chips = ['按推荐', '开始生成', '节奏放慢一点']

const conversation = computed(
  () => agentStore.conversations.find((item) => item.id === props.conversationId) || null,
)
const messages = computed(() => conversation.value?.messages || [])
const lastAssistantId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'assistant') return messages.value[index].id
  }
  return ''
})
const engineLabel = computed(() =>
  localAgentStore.isLocalEngine ? localAgentStore.selectedLabel : modelStore.selectedId,
)

/** 待发送区里按片段去重，同一段以最后一次写的意见为准。 */
const queuedClips = computed<AgentClipRef[]>(() => {
  const map = new Map<string, AgentClipRef>()
  for (const batch of props.pendingBatches) {
    const note = batch.note.trim()
    for (const clip of batch.clips) {
      const previous = map.get(clip.id)
      map.set(clip.id, { ...clip, note: note || previous?.note || clip.note })
    }
  }
  return [...map.values()]
})

const queuedCount = computed(() => queuedClips.value.length)

/** 有待发送内容时只发队列；没有队列时沿用「直接发当前选中片段」。 */
const outgoingClips = computed(() =>
  queuedClips.value.length ? queuedClips.value : props.selectedClips,
)

const composerPlaceholder = computed(() => {
  if (props.pendingBatches.length) return '补充整体要求，或直接点发送…'
  if (props.selectedClips.length) return '说清楚这几段要怎么改，只影响选中片段…'
  return '描述要改的地方，或继续生成…'
})

/** 和 send() 用同一份规则算出真正要发的片段，保证预览和实际请求一致。 */
function resolveSendClips(): { clips: AgentClipRef[]; queued: boolean; directNote: string } {
  const queued = queuedClips.value.length > 0
  const directNote = queued ? '' : props.clipNote.trim()
  const clips = outgoingClips.value.map((clip) => ({
    ...clip,
    note: clip.note || directNote || undefined,
  }))
  return { clips, queued, directNote }
}

const previewOpen = ref(false)

const previewClips = computed(() => resolveSendClips().clips)

/** 发送前可以核对：模型这一轮会收到哪些片段、每段改什么。 */
const previewText = computed(() => {
  const { clips } = resolveSendClips()
  const parts = [draft.value.trim()]
  const clipBlock = describeClipContext(clips)
  if (clipBlock) parts.push(clipBlock)
  return parts.filter(Boolean).join('\n\n')
})

function scrollToBottom() {
  const element = scrollRef.value
  if (!element) return
  element.scrollTop = element.scrollHeight
}

watch(
  () => [messages.value.length, messages.value.at(-1)?.content.length || 0],
  () => nextTick(scrollToBottom),
)

/**
 * 用户没手动选片段时，从文里识别「第 X 秒到第 Y 秒」这类范围，
 * 自动对应到项目里真实存在的片段，连同范围内的偏移一起交给模型。
 */
function detectTargetsFromText(text: string) {
  const project = projectStore.getProject(props.projectId)
  if (!project) return []
  const total = projectDuration(project)
  const ranges = parseTimeRanges(text, total)
  if (!ranges.length) return []
  return resolveRevisionTargets(project, ranges).map(({ clip, innerStart, innerEnd }) => ({
    id: clip.id,
    name: clip.name,
    kind: clip.kind,
    trackId: '',
    trackName: '',
    trackKind: 'video' as const,
    start: clip.start,
    duration: clip.duration,
    url: clip.url,
    thumbnail: clip.thumbnail,
    assetName: clip.name,
    code: clip.code,
    codeLanguage: clip.codeLanguage,
    motionId: clip.motionId,
    note: `用户指的是这支片里 ${(clip.start + innerStart).toFixed(1)}s–${(clip.start + innerEnd).toFixed(1)}s 这一段（片段内 ${innerStart.toFixed(1)}s–${innerEnd.toFixed(1)}s）`,
  }))
}

function send(payload: ComposerSubmit) {
  const text = payload.content.trim()
  const { clips: pickedClips, queued, directNote } = resolveSendClips()
  // 没手动选片段时，按文字里的时间范围自动定位
  const detected = pickedClips.length ? [] : detectTargetsFromText(text)
  const clips = pickedClips.length ? pickedClips : detected
  if (
    (!text && !payload.attachments.length && !payload.templates?.length && !clips.length) ||
    agentStore.isStreaming
  ) return
  // 没写整体要求、片段也没带意见时，给模型一个明确的最小指令。
  const fallback = clips.length && !clips.some((clip) => clip.note)
    ? '请先看看选中的片段，并给出具体修改建议。'
    : ''
  void agentStore.sendMessage(text || fallback, {
    conversationId: props.conversationId,
    mode: 'create',
    automation: chatMode.automation,
    projectId: props.projectId,
    attachments: payload.attachments,
    templates: payload.templates,
    clips: clips.length ? clips : undefined,
  })
  previewOpen.value = false
  if (queued) emit('consume-pending')
  else if (directNote) emit('clear-note')
}

function sendChip(content: string) {
  send({ content, attachments: [], templates: [] })
  composerRef.value?.focus()
}

function handleAskAnswer(payload: { messageId: string; optionId: string; label: string }) {
  agentStore.answerAsk(payload.messageId, payload.optionId, payload.label)
}

function retry() {
  if (agentStore.isStreaming) return
  agentStore.selectConversation(props.conversationId)
  void agentStore.regenerate()
}

function clipThumb(clip: AgentClipRef): string {
  if (clip.thumbnail) return clip.thumbnail
  return clip.kind === 'image' ? clip.url : ''
}

function kindLetter(kind: AgentClipRef['kind']): string {
  if (kind === 'motion') return '动'
  return kind === 'audio' ? '音' : kind === 'image' ? '图' : kind === 'animation' ? '码' : '视'
}

function focusComposer() {
  composerRef.value?.focus()
}

defineExpose({ focusComposer })

</script>

<style scoped>
.studio-chat {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--sf-line-soft);
  background: var(--sf-surface);
}

.sc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid var(--sf-surface-3);
}

.sc-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* 窄侧栏里把自动程度放到标题行，给输入区腾出一整行。 */
.sc-auto {
  display: inline-flex;
  flex: none;
  align-items: center;
  padding: 2px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 7px;
  background: var(--sf-surface-2);
}

.sc-auto button {
  padding: 2px 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--sf-ink-3);
  font-family: inherit;
  font-size: 9.5px;
  font-weight: 550;
  line-height: 1.6;
  cursor: pointer;
}

.sc-auto button:hover {
  color: var(--sf-ink-2);
}

.sc-auto button.active {
  background: var(--sf-surface);
  color: var(--sf-ink);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.07);
}

.sc-auto button:last-child.active {
  background: var(--sf-ink);
  color: var(--sf-surface-2);
  box-shadow: none;
}

.sc-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: #4c7a4e;
}

.sc-title strong {
  color: var(--sf-ink);
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
}

.sc-engine {
  overflow: hidden;
  max-width: 120px;
  color: var(--sf-ink-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 12px 4px;
  scrollbar-width: thin;
}

.sc-empty {
  padding: 10px 4px;
  color: var(--sf-ink-3);
  font-size: 11.5px;
  line-height: 1.7;
}

.sc-empty p {
  margin: 0 0 4px;
  color: var(--sf-ink);
  font-size: 12.5px;
  font-weight: 600;
}

.sc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.sc-chips button {
  padding: 4px 9px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.sc-chips button:hover {
  border-color: var(--sf-line-strong);
  color: var(--sf-ink);
}

.sc-messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sc-messages :deep(.agent-message) {
  padding: 8px 0;
}

.sc-messages :deep(.message-avatar) {
  display: none;
}

.sc-messages :deep(.message-main) {
  min-width: 0;
}

.sc-messages :deep(.user-bubble) {
  font-size: 12px;
}

.sc-messages :deep(.markdown-body) {
  font-size: 12px;
  line-height: 1.75;
}

.sc-messages :deep(.message-meta) {
  margin-top: 4px;
}

.sc-composer {
  flex: none;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--sf-surface-3);
}

.sc-selection {
  margin-bottom: 7px;
  padding: 6px 7px 7px;
  border: 1px solid #f0e3dc;
  border-radius: 8px;
  background: var(--sf-terra-wash);
}

.sc-selection-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 5px;
}

.sc-selection-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--sf-terra-strong);
  font-size: 9.5px;
  font-weight: 600;
  white-space: nowrap;
}

.sc-selection-title i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sf-terra);
}

.sc-selection-head button {
  flex: none;
  padding: 1px 5px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--sf-ink-3);
  font-family: inherit;
  font-size: 9px;
  cursor: pointer;
}

.sc-selection-head button:hover {
  border-color: #ecd9cf;
  color: var(--sf-terra-strong);
}

.sc-queue {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 148px;
  margin: 0;
  padding: 0 1px 0 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
}

.sc-queue-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 5px;
  border: 1px solid #f0e5df;
  border-radius: 6px;
  background: var(--sf-surface);
}

.sc-queue-thumbs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.sc-queue-thumbs img,
.sc-queue-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 3px;
  background: #f2ece7;
  color: var(--sf-ink-3);
  font-size: 8.5px;
  object-fit: cover;
}

.sc-queue-kind {
  display: inline-flex;
}

.sc-queue-more {
  flex: none;
  color: var(--sf-ink-4);
  font-size: 8.5px;
}

.sc-queue-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.sc-queue-copy strong {
  overflow: hidden;
  color: #3d2b23;
  font-size: 9.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-queue-note {
  overflow: hidden;
  color: var(--sf-terra-strong);
  font-size: 9px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-queue-note.is-empty {
  color: var(--sf-ink-4);
  font-style: italic;
}

.sc-queue-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--sf-ink-4);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.sc-queue-remove:hover {
  background: #f7ece6;
  color: var(--sf-terra-strong);
}

.sc-queue-live {
  margin: 5px 0 0;
  color: var(--sf-ink-3);
  font-size: 9px;
  line-height: 1.4;
}

.sc-selection-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 1px;
  scrollbar-width: none;
}

.sc-selection-list::-webkit-scrollbar {
  display: none;
}

.sc-selection-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  max-width: 168px;
  height: 24px;
  padding: 0 5px 0 3px;
  border: 1px solid #eadfd8;
  border-radius: 5px;
  background: var(--sf-surface);
}

.sc-selection-chip img,
.sc-selection-kind {
  width: 22px;
  height: 18px;
  flex: none;
  border-radius: 3px;
  background: #f2ece7;
  object-fit: cover;
}

.sc-selection-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sf-ink-3);
  font-size: 8.5px;
}

.sc-selection-name {
  overflow: hidden;
  color: var(--sf-ink-2);
  font-size: 9.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-selection-time {
  flex: none;
  color: var(--sf-ink-4);
  font-size: 8.5px;
  font-variant-numeric: tabular-nums;
}

.sc-preview-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sf-ink-3);
  font-family: inherit;
  font-size: 9px;
  cursor: pointer;
}

.sc-preview-toggle:hover {
  color: var(--sf-terra-strong);
}

.sc-preview-toggle svg {
  width: 9px;
  height: 9px;
  flex: none;
  transition: transform 140ms ease;
}

.sc-preview-toggle svg.open {
  transform: rotate(90deg);
}

.sc-preview {
  margin-top: 4px;
  padding: 6px 7px;
  border: 1px solid #f0e5df;
  border-radius: 6px;
  background: var(--sf-surface);
}

.sc-preview-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sc-preview-list li {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  font-size: 9.5px;
  line-height: 1.5;
}

.sc-preview-name {
  flex: none;
  max-width: 42%;
  overflow: hidden;
  color: #3d2b23;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-preview-time {
  flex: none;
  color: var(--sf-ink-4);
  font-size: 8.5px;
  font-variant-numeric: tabular-nums;
}

.sc-preview-note {
  flex: 1;
  min-width: 0;
  color: var(--sf-terra-strong);
  overflow-wrap: anywhere;
}

.sc-preview-note.is-empty {
  color: var(--sf-ink-4);
  font-style: italic;
}

.sc-preview-draft {
  margin: 5px 0 0;
  color: #4a3b33;
  font-size: 9.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.sc-preview-draft span {
  margin-right: 4px;
  color: var(--sf-ink-3);
  font-size: 8.5px;
}

.sc-preview-raw {
  margin-top: 4px;
}

.sc-preview-raw summary {
  color: var(--sf-ink-3);
  font-size: 8.5px;
  cursor: pointer;
  user-select: none;
}

.sc-preview-raw summary:hover {
  color: var(--sf-terra-strong);
}

.sc-preview-raw pre {
  max-height: 148px;
  margin: 4px 0 0;
  padding: 5px 6px;
  overflow: auto;
  border-radius: 5px;
  background: #fbf7f4;
  color: #7b6a61;
  font-family: inherit;
  font-size: 8.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-width: thin;
}

/*
 * 剪辑页的输入框贴左上角：
 * 外层 .composer-field 与输入框自身的内边距会叠加，
 * 这里两层都收紧，文字才会真正靠在卡片左上。
 */
.sc-composer :deep(.composer-field) {
  /* 文字与卡片边缘留一点呼吸，不要贴死 */
  padding: 9px 13px 0;
}

.sc-composer :deep(.composer-input) {
  min-height: 30px;
  padding: 0;
  font-size: 12.5px;
}

.sc-composer :deep(.composer-bottom) {
  flex-wrap: nowrap;
  gap: 6px;
  padding: 2px 8px 8px 10px;
}

/* 自动程度在标题行；输入区只在同一行放素材、Agent、模型和发送。 */
.sc-composer :deep(.automation-switch) {
  display: none;
}

.sc-composer :deep(.composer-pickers) {
  flex: 1 1 auto;
  min-width: 0;
}

.sc-composer :deep(.composer-actions) {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
  gap: 4px;
}

.sc-composer :deep(.model-anchor) {
  min-width: 0;
}

/* 面板窄，Agent 只留状态点，名字放进悬停提示，避免和模型名一起换行。 */
.sc-composer :deep(.engine-anchor > .engine-button) {
  max-width: none;
  padding: 4px;
}

.sc-composer :deep(.engine-anchor > .engine-button .engine-label) {
  display: none;
}

.sc-composer :deep(.model-button) {
  max-width: 124px;
}

.sc-composer :deep(.model-button .engine-label) {
  max-width: 100px;
}

.sc-composer :deep(.composer-hint) {
  display: none;
}

/* 剪辑台里始终是创作对话，隐藏「普通/创作」切换那一行，只保留自动程度。 */
.sc-composer :deep(.composer-modes) {
  display: none;
}

.sc-composer :deep(.engine-menu) {
  width: min(320px, calc(100vw - 32px));
}
</style>
