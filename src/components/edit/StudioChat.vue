<template>
  <aside class="studio-chat">
    <header class="sc-head">
      <div class="sc-title">
        <span class="sc-dot" aria-hidden="true" />
        <strong>创作对话</strong>
        <span class="sc-engine">{{ agentStore.isStreaming ? '正在生成' : engineLabel }}</span>
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

function send(content: string) {
  const text = content.trim()
  if (!text || agentStore.isStreaming) return
  void agentStore.sendMessage(text, {
    conversationId: props.conversationId,
    mode: 'create',
    automation: chatMode.automation,
    projectId: props.projectId,
  })
}

function sendChip(content: string) {
  send(content)
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
  gap: 8px;
  flex: none;
  padding: 11px 14px;
  border-bottom: 1px solid #f0f0ea;
}

.sc-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
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
  flex-wrap: wrap;
  row-gap: 5px;
  padding: 2px 6px 6px 10px;
}

/* 剪辑台对话栏更窄：先放 Agent 与自动程度，模型与发送换到下一行右侧。 */
.sc-composer :deep(.composer-pickers) {
  flex: 0 0 auto;
}

.sc-composer :deep(.composer-actions) {
  margin-left: auto;
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
  max-width: 140px;
}

.sc-composer :deep(.model-button .engine-label) {
  max-width: 116px;
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
