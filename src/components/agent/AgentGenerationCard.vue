<template>
  <section class="generation-card" :class="`is-${generation.kind}`">
    <header class="generation-head">
      <span class="generation-icon" aria-hidden="true">
        <svg v-if="generation.kind === 'image'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
          <rect x="3.4" y="4.8" width="17.2" height="14.4" rx="3.2" />
          <circle cx="8.6" cy="9.7" r="1.4" />
          <path d="M3.8 17.1l4.8-4.5 3.5 3.1 2.8-2.4 5.3 4.1" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
          <rect x="3.4" y="4.8" width="17.2" height="14.4" rx="3.2" />
          <path d="M10.3 9.6 15 12l-4.7 2.4z" fill="currentColor" stroke="none" />
        </svg>
      </span>

      <div class="generation-titles">
        <strong>{{ generation.kind === 'image' ? '图片生成' : '视频生成' }}</strong>
        <span class="generation-meta">
          <span>{{ generation.aspectRatio }}</span>
          <template v-if="generation.kind === 'video'">
            <span>{{ generation.resolution }}</span>
            <span>{{ generation.duration }}s</span>
          </template>
          <span>{{ generation.modelLabel }}</span>
        </span>
      </div>

      <span class="generation-status" :class="`status-${generation.status}`">
        <span v-if="generation.status === 'running'" class="status-spinner" aria-hidden="true" />
        {{ statusLabel }}
      </span>
    </header>

    <p class="generation-prompt">{{ generation.prompt }}</p>

    <div v-if="generation.status === 'running'" class="generation-progress">
      <div class="progress-track">
        <span
          class="progress-fill"
          :class="{ indeterminate: generation.kind === 'video' && generation.progress == null }"
          :style="progressStyle"
        />
      </div>
      <span class="progress-label">{{ progressLabel }}</span>
    </div>

    <div v-else-if="generation.status === 'succeeded'" class="generation-result">
      <div v-if="generation.kind === 'image' && generation.images?.length" class="image-grid" :class="{ 'is-single': generation.images.length === 1 }">
        <a
          v-for="(url, index) in generation.images"
          :key="`${url}-${index}`"
          class="image-item"
          :href="url"
          target="_blank"
          rel="noopener"
        >
          <img :src="url" :alt="`生成结果 ${index + 1}`" referrerpolicy="no-referrer" loading="lazy" />
        </a>
      </div>

      <video
        v-else-if="generation.videoUrl"
        class="video-item"
        :src="generation.videoUrl"
        :poster="generation.thumbnail"
        controls
        playsinline
        preload="metadata"
      />

      <div class="generation-actions">
        <AddToProjectButton :asset="inboxAssets" compact />
        <span v-if="generation.attachedToProject" class="attached-note">已自动加入创作项目</span>
      </div>

      <p class="result-note">结果链接由上游临时提供，建议及时下载保存。</p>
    </div>

    <div v-else class="generation-error">
      <span>{{ generation.error || '生成失败，请稍后重试。' }}</span>
      <button type="button" class="generation-retry" @click="$emit('retry')">重试</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentGeneration } from '@/types/agent'
import AddToProjectButton from '@/components/common/AddToProjectButton.vue'

const props = defineProps<{ generation: AgentGeneration }>()
defineEmits<{ (event: 'retry'): void }>()

const inboxAssets = computed(() => {
  const baseName = props.generation.prompt.slice(0, 24) || '生成素材'
  if (props.generation.kind === 'image') {
    return (props.generation.images || []).map((url, index) => ({
      name: `${baseName}${(props.generation.images?.length || 0) > 1 ? ` ${index + 1}` : ''}`,
      kind: 'image' as const,
      url,
      source: 'chat' as const,
    }))
  }
  if (!props.generation.videoUrl) return []
  return [
    {
      name: baseName,
      kind: 'video' as const,
      url: props.generation.videoUrl,
      thumbnail: props.generation.thumbnail,
      duration: props.generation.duration,
      source: 'chat' as const,
    },
  ]
})

const statusLabel = computed(() => {
  if (props.generation.status === 'succeeded') return '已完成'
  if (props.generation.status === 'failed') return '失败'
  return props.generation.kind === 'video' ? '生成中' : '绘制中'
})

const progressStyle = computed(() => {
  const progress = props.generation.progress
  if (typeof progress !== 'number') return {}
  return { width: `${Math.min(100, Math.max(4, progress))}%` }
})

const progressLabel = computed(() => {
  const progress = props.generation.progress
  if (typeof progress === 'number') return `${Math.round(progress)}%`
  return props.generation.kind === 'video' ? '正在排队 / 渲染，通常需要 1-5 分钟' : '正在生成，通常需要 20-60 秒'
})
</script>

<style scoped>
.generation-card {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--sf-line);
  border-radius: 16px;
  background: var(--sf-surface-2);
}

.generation-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.generation-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 1px solid var(--sf-line);
  border-radius: 9px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
}

.generation-icon svg {
  width: 16px;
  height: 16px;
}

.generation-titles {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.generation-titles strong {
  color: var(--sf-ink);
  font-size: 13px;
  font-weight: 600;
}

.generation-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  color: var(--sf-ink-3);
  font-size: 11px;
}

.generation-meta span + span::before {
  content: '·';
  margin-right: 8px;
  color: var(--sf-line-strong);
}

.generation-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  padding: 3px 9px;
  flex: none;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
  font-size: 10.5px;
  font-weight: 600;
}

.generation-status.status-succeeded {
  border-color: #dce8df;
  background: #f4faf5;
  color: #3f7a51;
}

.generation-status.status-failed {
  border-color: var(--sf-danger-soft);
  background: var(--sf-danger-soft);
  color: var(--sf-danger);
}

.status-spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--sf-line-strong);
  border-top-color: var(--sf-ink-2);
  border-radius: 50%;
  animation: generation-spin 0.8s linear infinite;
}

.generation-prompt {
  margin: 10px 0 0;
  color: var(--sf-ink-2);
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.generation-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.progress-track {
  position: relative;
  flex: 1;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--sf-line-soft);
}

.progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: 999px;
  background: var(--sf-ink);
  transition: width 300ms ease;
}

.progress-fill.indeterminate {
  width: 34% !important;
  animation: progress-slide 1.4s ease-in-out infinite;
}

.progress-label {
  flex: none;
  color: var(--sf-ink-3);
  font-size: 10.5px;
}

.generation-result {
  margin-top: 12px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.image-grid:has(.image-item:only-child) {
  grid-template-columns: minmax(0, 1fr);
}

.image-grid.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.image-item {
  display: block;
  overflow: hidden;
  border: 1px solid var(--sf-line);
  border-radius: 11px;
  background: var(--sf-surface);
}

.image-item img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 460px;
  object-fit: contain;
  transition: transform 200ms ease;
}

.image-item:hover img {
  transform: scale(1.015);
}

.video-item {
  display: block;
  width: 100%;
  max-height: 420px;
  border: 1px solid var(--sf-line);
  border-radius: 11px;
  background: var(--sf-ink);
}

.generation-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 9px;
}

.attached-note {
  color: #6b8a6c;
  font-size: 10px;
}

.result-note {
  margin: 8px 0 0;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  line-height: 1.5;
}

.generation-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 9px 11px;
  border: 1px solid var(--sf-danger-soft);
  border-radius: 9px;
  background: var(--sf-danger-soft);
  color: var(--sf-danger);
  font-size: 12px;
}

.generation-retry {
  margin-left: auto;
  padding: 3px 9px;
  flex: none;
  border: 1px solid #e6caca;
  border-radius: 999px;
  background: var(--sf-surface);
  color: #8f3d3d;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.generation-retry:hover {
  background: #fdeeee;
}

@keyframes generation-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes progress-slide {
  0% {
    left: -34%;
  }
  60% {
    left: 100%;
  }
  100% {
    left: 100%;
  }
}

@media (max-width: 560px) {
  .image-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
