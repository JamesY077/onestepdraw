<template>
  <div :class="['message', message.type]">
    <div class="avatar">
      <span v-if="message.type === 'user'" class="avatar-icon">我</span>
      <span v-else-if="message.type === 'system'" class="avatar-icon">🤖</span>
      <span v-else class="avatar-icon">AI</span>
    </div>
    <div class="bubble">
      <div class="content">
        <p v-if="message.content">{{ message.content }}</p>
        <span v-if="message.imageMode === 'expand'" class="expand-mode-chip">
          扩图 · {{ message.aspectRatio || '目标比例' }}
        </span>
        <div v-if="previewFiles.length" class="file-preview-list">
          <div
            v-for="(file, index) in previewFiles"
            :key="`${file.url}-${index}`"
            class="file-preview"
          >
            <span v-if="previewFiles.length > 1" class="frame-badge">
              {{ file.refLabel || (index === 0 ? '首帧' : '尾帧') }}
            </span>
            <img v-if="file.type === 'image'" :src="file.url" class="preview-img" loading="lazy" decoding="async" />
            <video v-else :src="file.url" class="preview-video" controls preload="metadata" />
            <span class="file-name">{{ file.name }}</span>
          </div>
        </div>
      </div>
      <div v-if="message.generateStatus" class="generate-result">
        <div v-if="isActiveGeneration" class="generation-progress">
          <div class="inline-loading">
            <div class="inline-spinner" />
            <span class="loading-text">{{ loadingText }}</span>
          </div>

          <div class="tip-window">
            <Transition name="tip-slide" mode="out-in">
              <span :key="tipIndex" class="generation-tip">{{ currentTip }}</span>
            </Transition>
          </div>

          <div class="progress-meta">
            <span class="progress-label">{{ progressLabel }}</span>
            <span class="progress-text">{{ Math.round(displayProgress) }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${displayProgress}%` }" />
          </div>
        </div>
        <div
          v-if="resultItems.length"
          class="result-list"
          :class="{ 'has-multiple': resultItems.length > 1 }"
        >
          <div
            v-if="resultItems.length > 1 || (message.batchSize && message.batchSize > 1)"
            class="batch-note"
          >
            <template v-if="isActiveGeneration">
              已完成 {{ resultItems.length }}/{{ message.batchSize || resultItems.length }} 个，其余生成中…
            </template>
            <template v-else>本轮共生成 {{ resultItems.length }} 个结果</template>
          </div>
          <template v-for="(result, index) in resultItems" :key="`${result.url}-${index}`">
            <ImageResult
              v-if="result.type === 'image'"
              :result="result"
              @regenerate="$emit('regenerate', message)"
              @expand="$emit('expandImage', result)"
              @edit-layers="$emit('editLayers', result)"
            />
            <VideoResult
              v-else-if="result.type === 'video'"
              :result="result"
              @regenerate="$emit('regenerate', message)"
            />
          </template>
        </div>
        <div v-if="message.partialError && message.generateStatus !== 'failed'" class="partial-warning">
          {{ message.partialError }}
        </div>
        <div v-if="message.generateStatus === 'failed'" class="error">
          <span>{{ message.error || '生成失败' }}</span>
          <button class="retry-btn" @click="$emit('regenerate', message)">重新尝试</button>
        </div>
      </div>
      <div class="meta">
        <span class="time">{{ formatTime(message.timestamp) }}</span>
        <div class="meta-actions">
          <button
            v-if="message.type === 'user' && message.content"
            class="icon-btn"
            title="复制到输入框"
            aria-label="复制提示词到输入框"
            @click="$emit('copyPrompt', message.content)"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="8.5" y="8.5" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8" />
              <path d="M15.5 8.5V6.8A2.3 2.3 0 0 0 13.2 4.5H6.8A2.3 2.3 0 0 0 4.5 6.8v6.4a2.3 2.3 0 0 0 2.3 2.3h1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ImageResult from './ImageResult.vue'
import VideoResult from './VideoResult.vue'
import { formatTime } from '@/utils/format'
import type { GenerateResult, Message } from '@/types/chat'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ message: Message }>()
defineEmits<{
  (e: 'regenerate', message: Message): void
  (e: 'copyPrompt', prompt: string): void
  (e: 'expandImage', result: GenerateResult): void
  (e: 'editLayers', result: GenerateResult): void
}>()

const previewFiles = computed(() => props.message.uploadedFiles?.length ? props.message.uploadedFiles : props.message.uploadedFile ? [props.message.uploadedFile] : [])

const resultItems = computed(() => (
  props.message.generateResults?.length
    ? props.message.generateResults
    : props.message.generateResult
      ? [props.message.generateResult]
      : []
))

const imageTips = [
  '小提示：提示词写清主体、环境、光线和风格，画面会更稳定。',
  '小提示：参考图越清晰，生成结果越容易贴近你想要的效果。',
  '小提示：一次多生成几张，更容易挑到满意的构图。',
  '小提示：复杂场景可以拆成几个关键词，逐层补充。',
]

const videoTips = [
  '小提示：写清主体动作、镜头运动和场景变化，视频会更连贯。',
  '小提示：参考图越清晰，人物和场景的一致性通常越好。',
  '小提示：视频生成需要一点时间，完成后结果会自动回到对话。',
  '小提示：想要更长的视频，可以分段生成后再剪辑。',
  '小提示：一次生成多个版本，方便对比运镜和节奏。',
]

const tips = computed(() => (props.message.generateType === 'video' ? videoTips : imageTips))
const tipIndex = ref(0)
const simulatedProgress = ref(0)
const elapsedSeconds = ref(0)

let progressStartedAt = 0
let progressTimer: ReturnType<typeof setInterval> | undefined
let tipTimer: ReturnType<typeof setInterval> | undefined

const isActiveGeneration = computed(() => props.message.generateStatus === 'pending' || props.message.generateStatus === 'processing')
const currentTip = computed(() => tips.value[tipIndex.value % tips.value.length])
const isVideo = computed(() => props.message.generateType === 'video')
const batchSize = computed(() => Math.max(1, props.message.batchSize || 1))
const loadingText = computed(() => {
  const kind = isVideo.value ? '视频' : '图片'
  const isBatch = batchSize.value > 1
  const batchLabel = isBatch ? `（共 ${batchSize.value} 个）` : ''
  if (props.message.generateStatus === 'pending') {
    return isBatch ? `${kind}批量任务准备中${batchLabel}` : `${kind}任务准备中`
  }
  return isBatch ? `${kind}批量生成进行中${batchLabel}` : `${kind}生成进行中`
})

/** 按真实生成耗时给出一个合理的预计区间，避免进度条几十秒就冲到 90%。 */
const estimatedRange = computed(() => {
  if (!isVideo.value) return batchSize.value > 1 ? '40–90 秒' : '20–60 秒'
  const duration = props.message.duration || 6
  const base = duration >= 10 ? '3–6 分钟' : duration <= 5 ? '1–3 分钟' : '2–4 分钟'
  return batchSize.value >= 4 ? '3–6 分钟' : batchSize.value >= 2 ? '2–5 分钟' : base
})
const estimatedMaxSeconds = computed(() => {
  if (!isVideo.value) return batchSize.value > 1 ? 90 : 60
  return batchSize.value >= 4 ? 360 : batchSize.value >= 2 ? 300 : 240
})
const elapsedLabel = computed(() => {
  const minutes = Math.floor(elapsedSeconds.value / 60)
  const seconds = elapsedSeconds.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const progressLabel = computed(() => {
  if (elapsedSeconds.value > estimatedMaxSeconds.value) {
    return `已用时 ${elapsedLabel.value} · 仍在生成`
  }
  return `已用时 ${elapsedLabel.value} · 预计 ${estimatedRange.value}`
})
const displayProgress = computed(() => {
  const real = props.message.progress
  const normalizedReal = typeof real === 'number' && Number.isFinite(real) ? Math.min(real, 99) : 0
  return Math.min(99, Math.max(simulatedProgress.value, normalizedReal))
})
const simulatedTau = computed(() => {
  const base = isVideo.value ? 70 : 16
  return batchSize.value > 1 ? base * 1.2 : base
})

function clearGenerationTimers() {
  if (progressTimer) clearInterval(progressTimer)
  if (tipTimer) clearInterval(tipTimer)
  progressTimer = undefined
  tipTimer = undefined
}

function updateSimulatedProgress() {
  const elapsed = Math.max(0, (Date.now() - progressStartedAt) / 1000)
  elapsedSeconds.value = Math.floor(elapsed)
  // 用时间衰减曲线逼近 92%，视频约 2 分钟后到 75% 左右，不再几十秒跑完。
  const next = 4 + 88 * (1 - Math.exp(-elapsed / simulatedTau.value))
  simulatedProgress.value = Math.min(92, Math.round(next * 10) / 10)
}

function startGenerationAnimation() {
  clearGenerationTimers()
  if (!progressStartedAt) {
    progressStartedAt = Date.now()
    elapsedSeconds.value = 0
    simulatedProgress.value = 4
    tipIndex.value = 0
  }
  updateSimulatedProgress()

  progressTimer = setInterval(updateSimulatedProgress, 1000)

  tipTimer = setInterval(() => {
    tipIndex.value += 1
  }, 5600)
}

function stopGenerationAnimation() {
  clearGenerationTimers()
  simulatedProgress.value = 0
  elapsedSeconds.value = 0
  progressStartedAt = 0
}

watch(
  () => props.message.generateStatus,
  (status) => {
    if (status === 'pending' || status === 'processing') {
      startGenerationAnimation()
      return
    }
    if (status === 'completed') {
      clearGenerationTimers()
      simulatedProgress.value = 100
      progressStartedAt = 0
      elapsedSeconds.value = 0
      return
    }
    stopGenerationAnimation()
  },
  { immediate: true },
)

onBeforeUnmount(clearGenerationTimers)
</script>

<style scoped>
.message {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: flex-start;
  animation: fade-up 0.35s ease;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  position: sticky;
  top: 88px;
  flex-shrink: 0;
}

.avatar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 9px;
  font-weight: 700;
  backdrop-filter: blur(14px);
}

.bubble {
  width: min(100%, 680px);
  padding: 7px 11px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--color-border);
  box-shadow: var(--color-shadow-soft);
  backdrop-filter: blur(18px);
}

.message.user .bubble {
  border-color: var(--sf-line);
  background: var(--sf-surface-3);
  color: var(--sf-ink);
  box-shadow: none;
}

.message.system .bubble {
  background: rgba(255, 255, 255, 0.92);
}

.content p {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text);
  word-break: break-word;
  white-space: pre-wrap;
}


.message.user .content p,
.message.user .time {
  color: rgba(36, 31, 25, 0.96);
}

.expand-mode-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  margin-top: 6px;
  padding: 0 9px;
  border: 1px solid rgba(36, 31, 25, 0.30);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
  line-height: 1;
}

.file-preview-list {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.file-preview {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.06);
  border: 1px solid rgba(36, 31, 25, 0.12);
}

.frame-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 1;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--sf-ink);
  box-shadow: 0 2px 6px rgba(36, 31, 25, 0.08);
  font-size: 10px;
  font-weight: 700;
}

.preview-img,
.preview-video {
  display: block;
  max-height: 180px;
  width: 100%;
  object-fit: cover;
}

.file-name {
  display: block;
  padding: 6px 10px;
  font-size: 11px;
  color: rgba(36, 31, 25, 0.62);
  border-top: 1px solid rgba(36, 31, 25, 0.08);
}

.generate-result {
  margin-top: 6px;
}

.result-list {
  margin-top: 6px;
}

.result-list.has-multiple {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  align-items: start;
}

.batch-note {
  grid-column: 1 / -1;
  padding: 6px 10px;
  border: 1px solid rgba(36, 31, 25, 0.16);
  border-radius: 10px;
  background: var(--sf-surface-2);
  color: var(--sf-ink);
  font-size: 11px;
  font-weight: 700;
}

.generation-progress {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 4px;
  padding: 11px 12px;
  border: 1px solid rgba(36, 31, 25, 0.20);
  border-radius: 14px;
  background: var(--sf-surface-2);
  box-shadow: none;
}

.inline-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.inline-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(36, 31, 25, 0.18);
  border-top-color: var(--sf-ink);
  box-shadow: 0 0 10px rgba(36, 31, 25, 0.18);
  animation: spin 0.75s linear infinite;
}

.loading-text,
.time,
.progress-text {
  font-size: 11px;
  color: rgba(36, 31, 25, 0.62);
}

.loading-text {
  color: rgba(36, 31, 25, 0.78);
  font-weight: 600;
}

.progress-bar {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--sf-line-strong) 0%, #8f8f88 55%, var(--sf-ink) 100%);
  box-shadow: 0 0 12px rgba(36, 31, 25, 0.38);
  transition: width 0.9s linear;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.progress-label {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.72);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-text {
  flex-shrink: 0;
  color: var(--sf-ink-2);
  font-variant-numeric: tabular-nums;
}

.tip-window {
  min-height: 18px;
  padding: 5px 8px;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.05);
  border-radius: 8px;
  background: rgba(36, 31, 25, 0.035);
}

.generation-tip {
  display: block;
  font-size: 11px;
  line-height: 1.55;
  color: rgba(36, 31, 25, 0.5);
}

.tip-slide-enter-active,
.tip-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.tip-slide-enter-from {
  opacity: 0;
  transform: translateY(7px);
}

.tip-slide-leave-to {
  opacity: 0;
  transform: translateY(-7px);
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.meta-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(36, 31, 25, 0.24);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.10);
  color: rgba(36, 31, 25, 0.8);
  font-size: 12px;
}

.icon-btn svg {
  display: block;
  width: 13px;
  height: 13px;
}

.icon-btn:hover {
  border-color: rgba(36, 31, 25, 0.38);
  background: rgba(36, 31, 25, 0.18);
  color: var(--sf-ink);
}

.message.user .icon-btn {
  border-color: rgba(36, 31, 25, 0.42);
  background: rgba(36, 31, 25, 0.14);
  color: rgba(36, 31, 25, 0.94);
}

.message.user .icon-btn:hover {
  border-color: rgba(36, 31, 25, 0.6);
  background: rgba(36, 31, 25, 0.24);
  color: var(--sf-ink);
}

.error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
  flex-wrap: wrap;
}

.partial-warning {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
  background: var(--sf-surface-2);
  border: 1px solid var(--sf-amber-soft);
  color: var(--sf-amber);
}

.retry-btn {
  min-height: 22px;
  padding: 0 8px;
  font-size: 11px;
  border: none;
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--color-text);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 767px) {
  .message {
    gap: 10px;
    margin-bottom: 18px;
  }

  .avatar {
    top: 72px;
  }

  .avatar-icon {
    width: 36px;
    height: 36px;
  }

  .bubble {
    width: 100%;
    padding: 16px;
    border-radius: 20px;
  }
}
</style>
