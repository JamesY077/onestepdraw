<template>
  <article class="result-card video-result">
    <button class="media-frame" type="button" @click="openPreview">
      <video :src="result.url" :poster="result.thumbnail" class="video-player" muted playsinline preload="metadata" />
      <span class="media-chip">视频</span>
      <span class="media-ratio-chip">{{ ratioLabel }}</span>
      <span class="media-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 6.8v10.4a1 1 0 0 0 1.52.85l8.2-5.2a1 1 0 0 0 0-1.7l-8.2-5.2A1 1 0 0 0 9 6.8Z" />
        </svg>
      </span>
      <span class="media-overlay">查看原视频</span>
    </button>

    <div class="result-body">
      <div class="result-heading">
        <h3 class="result-title">{{ result.model }}</h3>
        <span v-if="result.provider" class="provider-name">{{ result.provider }}</span>
      </div>
      <div class="meta-line">
        <span v-if="result.duration" class="meta-chip">{{ result.duration }} 秒</span>
        <span v-if="result.size" class="meta-chip">{{ result.size.width }} × {{ result.size.height }}</span>
        <span v-if="createdTimeLabel" class="meta-chip">{{ createdTimeLabel }}</span>
      </div>
    </div>

    <footer class="result-actions">
      <button class="action-btn action-btn-primary" type="button" title="下载视频" @click="download">下载</button>
      <button class="action-btn" type="button" title="查看原视频" @click="openPreview">查看</button>
      <button class="action-btn action-btn-subtle" type="button" title="重新生成" @click="$emit('regenerate')">重生成</button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GenerateResult } from '@/types/chat'

const props = defineProps<{ result: GenerateResult }>()
defineEmits<{ (e: 'regenerate'): void }>()

const ratioLabel = computed(() => {
  if (props.result.aspectRatio) return props.result.aspectRatio
  const width = props.result.size?.width
  const height = props.result.size?.height
  if (width && height) return `${width}:${height}`
  return '未知'
})

const createdTimeLabel = computed(() => {
  if (!props.result.createdAt) return ''
  return new Date(props.result.createdAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})

function download() {
  const link = document.createElement('a')
  link.href = props.result.url
  link.download = `aiping-video-${Date.now()}.mp4`
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function openPreview() {
  window.open(props.result.url, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
.result-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 360px;
  padding: 10px;
  border: 1px solid #e8e8e2;
  border-radius: 18px;
  background: #ffffff;
  color: #1d1d1b;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.04);
  backdrop-filter: blur(18px);
  transition: transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
}

.result-card:hover {
  border-color: #d2d2ca;
  box-shadow: 0 8px 22px rgba(17, 17, 16, 0.06);
  transform: translateY(-2px);
}

.media-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 190px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 14px;
  background: #f5f5f1;
  box-shadow: inset 0 0 0 1px rgba(17, 17, 16, 0.06);
  cursor: zoom-in;
}

.media-frame img,
.video-player {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-player {
  pointer-events: none;
}

.media-chip,
.media-ratio-chip,
.media-overlay {
  position: absolute;
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

.media-chip {
  top: 8px;
  left: 8px;
  border: 1px solid rgba(17, 17, 16, 0.10);
  background: rgba(255, 255, 255, 0.92);
  color: rgba(29, 29, 27, 0.90);
}

.media-ratio-chip {
  top: 8px;
  right: 8px;
  border: 1px solid rgba(17, 17, 16, 0.24);
  background: rgba(255, 255, 255, 0.92);
  color: #1d1d1b;
  font-variant-numeric: tabular-nums;
}

.media-overlay {
  right: 8px;
  bottom: 8px;
  border: 1px solid rgba(17, 17, 16, 0.08);
  background: rgba(255, 255, 255, 0.92);
  color: rgba(29, 29, 27, 0.86);
  opacity: 0;
  transform: translateY(3px);
  transition: opacity var(--transition-base), transform var(--transition-base);
}

.media-frame:hover .media-overlay,
.media-frame:focus-visible .media-overlay {
  opacity: 1;
  transform: translateY(0);
}

.media-play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(17, 17, 16, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: rgba(29, 29, 27, 0.94);
  box-shadow: 0 10px 22px rgba(17, 17, 16, 0.12);
  transform: translate(-50%, -50%);
  transition: transform var(--transition-base), background var(--transition-base);
}

.media-play svg {
  width: 15px;
  height: 15px;
  margin-left: 2px;
}

.media-frame:hover .media-play {
  background: #111111;
  color: #ffffff;
  transform: translate(-50%, -50%) scale(1.06);
}

.result-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 0 2px;
}

.result-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.result-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: rgba(29, 29, 27, 0.88);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-name {
  flex: 0 1 auto;
  overflow: hidden;
  color: rgba(29, 29, 27, 0.36);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid rgba(17, 17, 16, 0.06);
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.055);
  color: rgba(29, 29, 27, 0.55);
  font-size: 9.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.result-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 0;
}

.action-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid rgba(17, 17, 16, 0.10);
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.055);
  color: rgba(29, 29, 27, 0.78);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    transform var(--transition-base),
    background var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base);
}

.action-btn:hover {
  border-color: rgba(17, 17, 16, 0.22);
  background: rgba(17, 17, 16, 0.10);
  color: #1d1d1b;
  transform: translateY(-1px);
}

.action-btn-primary {
  border-color: rgba(29, 29, 27, 0.32);
  background: #111111;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(17, 17, 16, 0.16);
}

.action-btn-primary:hover {
  border-color: rgba(29, 29, 27, 0.42);
  background: #2a2a27;
  color: #ffffff;
  box-shadow: 0 6px 16px rgba(17, 17, 16, 0.18);
}

.action-btn-primary:active {
  border-color: rgba(29, 29, 27, 0.28);
  background: #000000;
  color: #ffffff;
  box-shadow: 0 4px 10px rgba(160, 140, 105, 0.18);
  transform: translateY(0);
}

.action-btn-subtle {
  margin-left: 0;
}

@media (max-width: 767px) {
  .result-card {
    max-width: 100%;
  }

  .media-frame {
    max-height: 210px;
  }
}
</style>
