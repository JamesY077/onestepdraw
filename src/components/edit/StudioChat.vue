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
        />
      </section>
    </div>

    <div class="sc-composer">
      <AgentComposer
        ref="composerRef"
        v-model="draft"
        tone="create"
        :disabled="agentStore.isStreaming"
        placeholder="描述要改的地方，或继续生成…"
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
import { useChatModeStore } from '@/stores/chatModeStore'
import { useLocalAgentStore } from '@/stores/localAgentStore'
import { useModelStore } from '@/stores/modelStore'
import type { ComposerSubmit } from '@/types/agent'

const props = defineProps<{ conversationId: string; projectId: string }>()

const agentStore = useAgentStore()
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

function scrollToBottom() {
  const element = scrollRef.value
  if (!element) return
  element.scrollTop = element.scrollHeight
}

watch(
  () => [messages.value.length, messages.value.at(-1)?.content.length || 0],
  () => nextTick(scrollToBottom),
)

function send(payload: ComposerSubmit) {
  const text = payload.content.trim()
  if ((!text && !payload.attachments.length && !payload.template) || agentStore.isStreaming) return
  void agentStore.sendMessage(text, {
    conversationId: props.conversationId,
    mode: 'create',
    automation: chatMode.automation,
    projectId: props.projectId,
    attachments: payload.attachments,
    template: payload.template,
  })
}

function sendChip(content: string) {
  send({ content, attachments: [], template: null })
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

</script>

<style scoped>
.studio-chat {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid #ecece6;
  background: #ffffff;
}

.sc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid #f0f0ea;
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
  border: 1px solid #ecece6;
  border-radius: 7px;
  background: #fafaf7;
}

.sc-auto button {
  padding: 2px 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #9a9a92;
  font-family: inherit;
  font-size: 9.5px;
  font-weight: 550;
  line-height: 1.6;
  cursor: pointer;
}

.sc-auto button:hover {
  color: #4a4a44;
}

.sc-auto button.active {
  background: #ffffff;
  color: #1d1d1b;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.07);
}

.sc-auto button:last-child.active {
  background: #111110;
  color: #fafaf7;
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
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
}

.sc-engine {
  overflow: hidden;
  max-width: 120px;
  color: #a3a39b;
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
  color: #8c8c84;
  font-size: 11.5px;
  line-height: 1.7;
}

.sc-empty p {
  margin: 0 0 4px;
  color: #2a2a26;
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
  border: 1px solid #e7e7e1;
  border-radius: 999px;
  background: #ffffff;
  color: #5f5f57;
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.sc-chips button:hover {
  border-color: #c9c9c1;
  color: #111110;
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
  border-top: 1px solid #f3f3ed;
}

.sc-composer :deep(.composer-input) {
  min-height: 38px;
  padding: 9px 12px 2px;
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
