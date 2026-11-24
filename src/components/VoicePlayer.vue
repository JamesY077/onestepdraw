<template>
  <div class="voice-player" :class="{ 'is-compact': compact, 'is-ready': !!src, 'is-playing': isPlaying }">
    <button class="player-toggle" type="button" :disabled="!src" :aria-label="isPlaying ? '暂停' : '播放'" @click="toggle">
      <svg v-if="!isPlaying" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.4 5.6 18 12l-9.6 6.4z" fill="currentColor" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7.4" y="5.6" width="3.4" height="12.8" rx="1.4" fill="currentColor" />
        <rect x="13.2" y="5.6" width="3.4" height="12.8" rx="1.4" fill="currentColor" />
      </svg>
    </button>

    <button ref="trackRef" class="player-track" type="button" :disabled="!src" aria-label="调整播放进度" @click="seekByEvent">
      <span
        v-for="(height, index) in bars"
        :key="index"
        class="player-bar"
        :class="{ 'is-played': index / bars.length < progress }"
        :style="{ height: `${Math.round(height * 100)}%` }"
      />
      <span
        v-if="progress > 0"
        class="player-playhead"
        :style="{ left: `${Math.min(progress, 0.995) * 100}%` }"
        aria-hidden="true"
      />
    </button>

    <span class="player-time">{{ currentText }}<em>/ {{ totalText }}</em></span>

    <div v-if="$slots.actions" class="player-actions">
      <slot name="actions" />
    </div>

    <audio
      ref="audioRef"
      :src="src"
      preload="metadata"
      @loadedmetadata="handleLoadedMetadata"
      @timeupdate="handleTimeUpdate"
      @play="isPlaying = true"
      @pause="isPlaying = false"
      @ended="handleEnded"
      @error="handleError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computeWaveform, formatDurationMs } from '@/features/voice/audio'

const props = withDefaults(
  defineProps<{
    src?: string
    /** 已知时长（毫秒），用于还没加载 metadata 时展示 */
    durationMs?: number
    /** 外部传入的波形峰值（0~1），不传则自动解析 */
    waveform?: number[]
    /** 初始条数；渲染后会按容器宽度自适应调整 */
    bars?: number
    compact?: boolean
    autoplay?: boolean
  }>(),
  { src: '', durationMs: 0, waveform: () => [], bars: 64, compact: false, autoplay: false },
)

const audioRef = ref<HTMLAudioElement | null>(null)
const trackRef = ref<HTMLButtonElement | null>(null)
const trackWidth = ref(0)
const isPlaying = ref(false)
const currentMs = ref(0)
const mediaDurationMs = ref(0)
const autoWaveform = ref<number[]>([])
let loadToken = 0
let resizeObserver: ResizeObserver | null = null

const totalMs = computed(() => mediaDurationMs.value || props.durationMs || 0)
const progress = computed(() => {
  if (!totalMs.value) return 0
  return Math.min(1, currentMs.value / totalMs.value)
})

const currentText = computed(() => formatDurationMs(currentMs.value))
const totalText = computed(() => (totalMs.value ? formatDurationMs(totalMs.value) : '--:--'))

/** 没有真实波形时用稳定的伪随机条，避免播放器看起来是空白。 */
function fallbackBars(count: number): number[] {
  const seed = (props.src || 'voice').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return Array.from({ length: count }, (_, index) => {
    const noise = Math.sin((index + 1) * (seed % 13 + 3) * 0.7) * 0.5 + 0.5
    return 0.24 + noise * 0.62
  })
}

/** 将任意长度的波形重采样到当前容器需要的条数，保证宽屏下不会变成粗柱子。 */
function resamplePeaks(source: number[], count: number): number[] {
  if (!source.length) return fallbackBars(count)
  if (source.length === count) return source
  if (count === 1) return [source[0]]

  return Array.from({ length: count }, (_, index) => {
    const position = (index / (count - 1)) * (source.length - 1)
    const left = Math.floor(position)
    const right = Math.min(source.length - 1, left + 1)
    const mix = position - left
    return source[left] * (1 - mix) + source[right] * mix
  })
}

const barCount = computed(() => {
  if (!trackWidth.value) return Math.max(24, Math.min(128, props.bars))
  const idealBarWidth = props.compact ? 2.6 : 3.2
  const gap = props.compact ? 1.5 : 2
  return Math.max(24, Math.min(128, Math.round(trackWidth.value / (idealBarWidth + gap))))
})

const bars = computed(() => {
  const source = props.waveform.length ? props.waveform : autoWaveform.value
  const peaks = resamplePeaks(source, barCount.value)
  const max = Math.max(...peaks, 0.001)

  return peaks.map((peak) => {
    const normalized = Math.max(0, Math.min(1, peak / max))
    return 0.14 + Math.pow(normalized, 0.82) * 0.86
  })
})

async function loadWaveform(url: string) {
  const token = ++loadToken
  autoWaveform.value = []
  if (!url) return

  try {
    const response = await fetch(url)
    if (!response.ok) return
    const blob = await response.blob()
    const peaks = await computeWaveform(blob, 160)
    if (token === loadToken && peaks.length) autoWaveform.value = peaks
  } catch {
    // 远程地址常被 CORS 拦住，保持兜底波形即可
  }
}

watch(
  () => props.src,
  async (url) => {
    currentMs.value = 0
    mediaDurationMs.value = 0
    await loadWaveform(url)
    if (url && props.autoplay) void play()
  },
  { immediate: true },
)

function play() {
  const audio = audioRef.value
  if (!audio || !props.src) return
  audio.play().catch(() => {
    isPlaying.value = false
  })
}

function toggle() {
  const audio = audioRef.value
  if (!audio) return
  if (audio.paused) void play()
  else audio.pause()
}

function handleLoadedMetadata() {
  const audio = audioRef.value
  if (audio && Number.isFinite(audio.duration)) mediaDurationMs.value = Math.round(audio.duration * 1000)
}

function handleTimeUpdate() {
  const audio = audioRef.value
  if (audio) currentMs.value = Math.round(audio.currentTime * 1000)
}

function handleEnded() {
  isPlaying.value = false
  currentMs.value = 0
}

function handleError() {
  isPlaying.value = false
}

function seekByEvent(event: MouseEvent) {
  const audio = audioRef.value
  const total = totalMs.value
  if (!audio || !total) return
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  audio.currentTime = (ratio * total) / 1000
  currentMs.value = Math.round(ratio * total)
}

defineExpose({ play, pause: () => audioRef.value?.pause() })

onMounted(() => {
  const track = trackRef.value
  if (!track || typeof ResizeObserver === 'undefined') return

  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width > 0) trackWidth.value = width
  })
  resizeObserver.observe(track)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  audioRef.value?.pause()
})
</script>

<style scoped>
.voice-player {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  padding: 10px 14px 10px 11px;
  border: 1px solid var(--sf-line);
  border-radius: 17px;
  overflow: hidden;
  background: var(--sf-surface-2);
  isolation: isolate;
  transition: border-color var(--transition-base), background var(--transition-base);
}

.voice-player:hover {
  border-color: var(--sf-line-strong);
}

.voice-player.is-compact {
  gap: 9px;
  padding: 8px 11px 8px 9px;
  border-radius: 13px;
}

.player-toggle {
  position: relative;
  z-index: 2;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: var(--sf-ink);
  color: var(--sf-surface);
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(36, 31, 25, 0.16);
  transition: transform 0.18s ease, background 0.18s ease;
}

.is-compact .player-toggle {
  width: 30px;
  height: 30px;
}

.player-toggle svg {
  width: 16px;
  height: 16px;
}

.is-compact .player-toggle svg {
  width: 13px;
  height: 13px;
}

.player-toggle:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.03);
  background: var(--sf-ink);
}

.player-toggle:active:not(:disabled) {
  transform: scale(0.97);
}

.player-toggle:focus-visible {
  outline: 2px solid rgba(36, 31, 25, 0.36);
  outline-offset: 3px;
}

.player-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 播放时的外圈呼吸灯 */
.player-toggle::after {
  content: '';
  position: absolute;
  inset: -5px;
  border: 1px solid rgba(36, 31, 25, 0.22);
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
}

.is-playing .player-toggle::after {
  animation: voice-player-pulse 2.2s ease-out infinite;
}

.player-track {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 2px;
  min-width: 0;
  height: 38px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.is-compact .player-track {
  height: 28px;
  gap: 1.5px;
}

.player-track:focus-visible {
  outline: 2px solid rgba(36, 31, 25, 0.32);
  outline-offset: 4px;
  border-radius: 8px;
}

/* 波形中心基线，让上下起伏更有层次 */
.player-track::before {
  content: '';
  position: absolute;
  z-index: 0;
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(36, 31, 25, 0.1) 12%,
    rgba(36, 31, 25, 0.1) 88%,
    transparent
  );
  pointer-events: none;
}

.player-bar {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-width: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.24) 0%, rgba(36, 31, 25, 0.1) 100%);
  transition:
    height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    background var(--transition-base),
    opacity var(--transition-base);
}

.player-track:hover .player-bar:not(.is-played) {
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.4) 0%, rgba(36, 31, 25, 0.16) 100%);
}

.player-bar.is-played {
  background: linear-gradient(180deg, #3a3a36 0%, var(--sf-ink) 100%);
}

/* 播放头 */
.player-playhead {
  position: absolute;
  z-index: 2;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  border-radius: 999px;
  background: var(--sf-ink);
  pointer-events: none;
  transition: left 0.12s linear;
}

.player-playhead::after {
  content: '';
  position: absolute;
  top: -3px;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sf-ink);
  transform: translateX(-50%);
}

.player-time {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 3px;
  padding: 4px 7px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.015em;
  line-height: 1;
  white-space: nowrap;
}

.player-time em {
  margin-left: 0;
  color: var(--sf-ink-3);
  font-style: normal;
  font-weight: 500;
}

.is-compact .player-time {
  padding: 3px 6px;
  font-size: 10px;
}

.player-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

audio {
  display: none;
}

@keyframes voice-player-pulse {
  0% {
    opacity: 0.55;
    transform: scale(0.82);
  }
  75%,
  100% {
    opacity: 0;
    transform: scale(1.18);
  }
}

@media (max-width: 640px) {
  .voice-player {
    gap: 9px;
    padding: 9px 11px 9px 9px;
  }

  .player-track {
    height: 34px;
  }

  .is-compact .player-track {
    height: 28px;
  }

  .player-time em {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-player,
  .voice-player * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
