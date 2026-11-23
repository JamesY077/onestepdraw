<template>
  <article class="agent-message" :class="[`is-${message.role}`, `status-${message.status}`]">
    <div v-if="message.role === 'assistant'" class="message-avatar" aria-hidden="true">
      <BrandMark :size="24" />
    </div>

    <div class="message-main">
      <div
        v-if="message.role === 'user' && (message.templates?.length || message.attachments?.length || message.clips?.length)"
        class="message-refs"
      >
        <div
          v-for="(template, index) in message.templates || []"
          :key="template.id"
          class="ref-template"
        >
          <img v-if="template.images[0]" :src="template.images[0]" alt="" />
          <span class="ref-template-icon" v-else aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <path d="M3.8 15.5 8.6 11l3.4 3 2.8-2.4 5.4 4.1" />
            </svg>
          </span>
          <span class="ref-template-copy">
            <strong>@模板{{ index + 1 }} {{ template.name }}</strong>
            <small>模板参考 · {{ template.category }}</small>
          </span>
        </div>
        <div v-if="message.attachments?.length" class="ref-assets">
          <component
            :is="item.kind === 'file' ? 'span' : 'a'"
            v-for="item in message.attachments"
            :key="item.id"
            class="ref-asset"
            :class="{ 'has-thumb': hasPreview(item) }"
            :href="item.kind === 'file' ? undefined : item.url || undefined"
            :target="item.kind === 'file' ? undefined : '_blank'"
            :rel="item.kind === 'file' ? undefined : 'noreferrer'"
          >
            <img v-if="item.kind === 'image' && item.url" :src="item.url" alt="" />
            <img v-else-if="item.kind === 'video' && item.frames?.length" :src="item.frames[0]" alt="" />
            <span v-else class="ref-asset-icon" aria-hidden="true">
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
            <span class="ref-asset-name">{{ item.name }}</span>
          </component>
        </div>
        <div v-if="message.clips?.length" class="ref-clips">
          <span v-for="clip in message.clips" :key="clip.id" class="ref-clip">
            <img v-if="clip.thumbnail" :src="clip.thumbnail" alt="" />
            <span v-else class="ref-clip-icon" aria-hidden="true">
              <svg v-if="clip.kind === 'audio'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M6 10v4M10 7.5v9M14 9v6M18 11v2" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
                <path d="M10.4 9.6 15 12l-4.6 2.4z" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span class="ref-clip-copy">
              <strong>{{ clip.name }}</strong>
              <small>{{ clip.start.toFixed(1) }}s → {{ (clip.start + clip.duration).toFixed(1) }}s</small>
            </span>
          </span>
        </div>
      </div>

      <div v-if="message.role === 'user' && message.content" class="user-bubble">{{ message.content }}</div>

      <template v-else>
        <details v-if="message.logs" class="reasoning-block">
          <summary>
            <span class="reasoning-dot" aria-hidden="true" />
            运行日志
            <span v-if="message.status === 'streaming'" class="reasoning-running">进行中</span>
          </summary>
          <pre class="reasoning-text">{{ message.logs }}</pre>
        </details>

        <details v-if="message.reasoning" class="reasoning-block">
          <summary>
            <span class="reasoning-dot" aria-hidden="true" />
            思考过程
            <span v-if="message.status === 'streaming'" class="reasoning-running">进行中</span>
          </summary>
          <pre class="reasoning-text">{{ message.reasoning }}</pre>
        </details>

        <MarkdownView v-if="displayContent" :content="displayContent" />
        <div v-if="isStreaming" class="streaming-indicator" aria-label="正在生成">
          <span class="streaming-dot" />
          <span class="streaming-dot" />
          <span class="streaming-dot" />
        </div>

        <AgentAskCard
          v-if="message.ask"
          :ask="message.ask"
          :compact="compact"
          :disabled="isStreaming"
          @answer="$emit('ask-answer', { messageId: message.id, ...$event })"
        />

        <AgentGenerationCard
          v-if="message.generation"
          :generation="message.generation"
          @retry="$emit('generation-retry', message.id)"
        />

        <div v-if="message.status === 'error'" class="message-error">
          <span>{{ message.error || '生成失败，请重试。' }}</span>
          <button v-if="canRetry" type="button" class="text-action" @click="$emit('retry')">重试</button>
        </div>

        <div v-else-if="message.status === 'stopped'" class="message-stopped">
          <span>{{ displayContent ? '已停止生成' : '已停止' }}</span>
          <button v-if="canRetry" type="button" class="text-action" @click="$emit('retry')">继续生成</button>
        </div>
      </template>

      <footer class="message-meta">
        <span v-if="message.role === 'assistant' && message.model" class="message-engine">{{ message.model }}</span>
        <span class="message-time">{{ timeLabel }}</span>
        <div class="message-actions">
          <button v-if="displayContent" type="button" class="text-action" @click="copyContent">
            {{ copied ? '已复制' : '复制' }}
          </button>
          <button
            v-if="canRetry && message.role === 'assistant' && !isStreaming && displayContent"
            type="button"
            class="text-action"
            @click="$emit('retry')"
          >
            重新生成
          </button>
        </div>
      </footer>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BrandMark from './BrandMark.vue'
import MarkdownView from './MarkdownView.vue'
import AgentGenerationCard from './AgentGenerationCard.vue'
import AgentAskCard from './AgentAskCard.vue'
import { stripAgentControlBlocks } from '@/features/agent/tools'
import type { AgentAttachment, AgentMessage } from '@/types/agent'

const props = withDefaults(
  defineProps<{ message: AgentMessage; isStreaming: boolean; canRetry?: boolean; compact?: boolean }>(),
  { canRetry: false, compact: false },
)
defineEmits<{
  (event: 'retry'): void
  (event: 'generation-retry', id: string): void
  (event: 'ask-answer', payload: { messageId: string; optionId: string; label: string }): void
}>()

const copied = ref(false)

const displayContent = computed(() => stripAgentControlBlocks(props.message.content))

function hasPreview(item: AgentAttachment): boolean {
  return (item.kind === 'image' && !!item.url) || (item.kind === 'video' && !!item.frames?.length)
}

const timeLabel = computed(() => {
  const date = new Date(props.message.createdAt)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
})

async function copyContent() {
  try {
    await navigator.clipboard.writeText(displayContent.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1400)
  } catch {
    // 忽略剪贴板权限错误。
  }
}
</script>

<style scoped>
.agent-message {
  display: flex;
  gap: 12px;
  width: 100%;
  animation: message-in 180ms ease-out;
}

.agent-message.is-user {
  justify-content: flex-end;
  padding-left: 12%;
}

.message-avatar {
  flex: none;
  margin-top: 1px;
}

.message-main {
  min-width: 0;
  max-width: 100%;
}

.is-assistant .message-main {
  flex: 1;
}

.message-refs {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  margin-bottom: 7px;
}

.ref-template {
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  padding: 4px 9px 4px 4px;
  border: 1px solid #ecdcd3;
  border-radius: 9px;
  background: #fdf7f4;
}

.ref-template img,
.ref-template-icon {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 6px;
  object-fit: cover;
  background: #ffffff;
}

.ref-template-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b4472f;
}

.ref-template-icon svg {
  width: 15px;
  height: 15px;
}

.ref-template-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.ref-template-copy strong {
  overflow: hidden;
  color: #4a2f26;
  font-size: 10.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-template-copy small {
  color: #ad9185;
  font-size: 9px;
}

.ref-assets {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.ref-asset {
  display: inline-flex;
  max-width: 150px;
  align-items: center;
  gap: 5px;
  padding: 3px 7px 3px 3px;
  border: 1px solid #ecece6;
  border-radius: 8px;
  background: #fbfbf8;
  color: #6b6b63;
  text-decoration: none;
}

.ref-asset:hover {
  border-color: #d8d8d0;
}

.ref-asset img {
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 5px;
  object-fit: cover;
}

.ref-asset-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 5px;
  background: #f2f2ec;
  color: #8a8a82;
}

.ref-asset-icon svg {
  width: 14px;
  height: 14px;
}

.ref-asset-name {
  overflow: hidden;
  max-width: 108px;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-clips {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.ref-clip {
  display: inline-flex;
  max-width: 176px;
  align-items: center;
  gap: 5px;
  padding: 3px 8px 3px 3px;
  border: 1px solid #ecdcd3;
  border-radius: 8px;
  background: #fdf8f5;
}

.ref-clip img,
.ref-clip-icon {
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 5px;
  background: #f4ece7;
  object-fit: cover;
}

.ref-clip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b4553a;
}

.ref-clip-icon svg {
  width: 14px;
  height: 14px;
}

.ref-clip-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.ref-clip-copy strong {
  overflow: hidden;
  color: #4a2f26;
  font-size: 9.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-clip-copy small {
  color: #b09286;
  font-size: 8.5px;
  font-variant-numeric: tabular-nums;
}

.user-bubble {
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  background: #f2f2ef;
  color: #1d1d1b;
  font-size: 14.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.reasoning-block {
  margin-bottom: 12px;
  padding: 9px 12px;
  border: 1px solid #ebebe6;
  border-radius: 10px;
  background: #fafaf8;
}

.reasoning-block summary {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #77776f;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.reasoning-block summary::-webkit-details-marker {
  display: none;
}

.reasoning-block summary::after {
  content: '▾';
  margin-left: auto;
  color: #a3a39b;
  font-size: 10px;
  transition: transform 160ms ease;
}

.reasoning-block[open] summary::after {
  transform: rotate(180deg);
}

.reasoning-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b9b9b1;
}

.reasoning-running {
  color: #8a8a82;
  font-weight: 500;
}

.reasoning-text {
  margin: 9px 0 0;
  padding-top: 9px;
  border-top: 1px solid #efefe9;
  color: #6d6d65;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.streaming-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
}

.streaming-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #a9a9a1;
  animation: dot-pulse 1.1s ease-in-out infinite;
}

.streaming-dot:nth-child(2) {
  animation-delay: 0.14s;
}

.streaming-dot:nth-child(3) {
  animation-delay: 0.28s;
}

.message-error,
.message-stopped {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  font-size: 13px;
}

.message-error {
  border: 1px solid #f0dede;
  background: #fdf6f6;
  color: #a04444;
}

.message-stopped {
  border: 1px solid #ecece7;
  background: #fafaf8;
  color: #7c7c74;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 22px;
  margin-top: 6px;
  opacity: 0;
  transition: opacity 150ms ease;
}

.agent-message:hover .message-meta,
.agent-message.is-user .message-meta {
  opacity: 1;
}

.message-engine {
  max-width: 180px;
  overflow: hidden;
  color: #b0b0a8;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-time {
  color: #a5a59d;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.message-actions {
  display: flex;
  gap: 4px;
}

.text-action {
  padding: 2px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #8b8b83;
  font-size: 11.5px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.text-action:hover {
  background: #f2f2ee;
  color: #1d1d1b;
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  45% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (max-width: 720px) {
  .agent-message.is-user {
    padding-left: 6%;
  }

  .message-meta {
    opacity: 1;
  }
}
</style>
