<template>
  <article class="agent-message" :class="[`is-${message.role}`, `status-${message.status}`]">
    <div v-if="message.role === 'assistant'" class="message-avatar" aria-hidden="true">
      <BrandMark :size="24" />
    </div>

    <div class="message-main">
      <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>

      <template v-else>
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
import { stripAgentToolBlocks } from '@/features/agent/tools'
import type { AgentMessage } from '@/types/agent'

const props = withDefaults(defineProps<{ message: AgentMessage; isStreaming: boolean; canRetry?: boolean }>(), {
  canRetry: false,
})
defineEmits<{ (event: 'retry'): void; (event: 'generation-retry', id: string): void }>()

const copied = ref(false)

const displayContent = computed(() => stripAgentToolBlocks(props.message.content))

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
