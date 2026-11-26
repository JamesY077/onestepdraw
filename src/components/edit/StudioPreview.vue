<template>
  <div class="stage">
    <div ref="viewportRef" class="stage-viewport">
      <div
        class="stage-frame"
        :style="{ width: `${frameSize.width}px`, height: `${frameSize.height}px` }"
      >
        <div class="stage-canvas">
          <template v-for="item in mediaNodes" :key="item.key">
            <video
              v-if="item.clip.kind === 'video'"
              :ref="(el) => setVideoRef(item.clip.id, el)"
              class="stage-video"
              :class="{ 'is-idle': !visibleSet.has(item.clip.id) }"
              :src="item.clip.url"
              :poster="item.clip.thumbnail || undefined"
              playsinline
              preload="auto"
              @loadedmetadata="syncMedia"
            />
            <img
              v-else-if="item.clip.kind === 'image'"
              class="stage-media"
              :class="{ 'is-idle': !visibleSet.has(item.clip.id) }"
              :ref="(el: unknown) => setVisualRef(item.clip.id, el)"
              :src="item.clip.url"
              alt=""
            />
            <hyperframes-player
              v-else-if="item.clip.kind === 'motion'"
              :ref="(el: unknown) => setMotionRef(item.clip.id, el)"
              class="stage-media stage-animation stage-motion"
              :class="{ 'is-idle': !visibleSet.has(item.clip.id) }"
              :src="item.clip.url"
              :poster="item.clip.thumbnail || undefined"
              :title="item.clip.name"
              disable-click-to-play
              low-power-idle
              @ready="onMotionReady(item.clip)"
            />
            <iframe
              v-else-if="item.clip.kind === 'animation' && item.clip.codeLanguage !== 'jsx' && item.clip.codeLanguage !== 'tsx'"
              :ref="(el: unknown) => setVisualRef(item.clip.id, el)"
              class="stage-media stage-animation"
              :class="{ 'is-idle': !visibleSet.has(item.clip.id) }"
              :src="item.clip.url"
              :title="item.clip.name"
              sandbox="allow-scripts"
            />
            <div
              v-else-if="item.clip.kind === 'animation'"
              :ref="(el: unknown) => setVisualRef(item.clip.id, el)"
              class="stage-media animation-source-placeholder"
              :class="{ 'is-idle': !visibleSet.has(item.clip.id) }"
            >
              <strong>{{ item.clip.codeLanguage?.toUpperCase() }} 代码动画</strong>
              <span>选中片段发给 AI 可直接修改原源码</span>
            </div>
            <audio
              v-else
              :ref="(el) => setAudioRef(item.clip.id, el)"
              :src="item.clip.url"
              preload="auto"
              @loadedmetadata="syncMedia"
            />
          </template>

          <div v-if="activeCaption" class="stage-caption" :key="activeCaption.id">
            {{ activeCaption.text }}
          </div>

          <div v-if="!visibleSet.size" class="stage-empty">
            <template v-if="hasClips">
              <p>当前时间点没有画面</p>
              <span>拖动播放头，或双击轨道上的片段跳到它的开头。</span>
            </template>
            <template v-else>
              <p>时间轴还是空的</p>
              <span>把左侧素材拖到轨道，或描述你要的画面。</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <footer class="stage-bar">
      <div class="stage-transport">
        <button
          type="button"
          class="stage-play"
          :title="playing ? '暂停（空格）' : '播放（空格）'"
          @click="$emit('toggle-play')"
        >
          <svg v-if="!playing" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6.2v11.6l9.8-5.8z" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="3.4" height="12" rx="1" /><rect x="13.6" y="6" width="3.4" height="12" rx="1" /></svg>
        </button>
        <button type="button" class="stage-skip" title="回到开头" @click="$emit('seek', 0)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 5v14M18 6l-8 6 8 6z" />
          </svg>
        </button>
        <span class="stage-time">{{ timeText }}</span>
      </div>
      <span class="stage-meta">{{ project.aspectRatio }} · {{ project.resolution }} · {{ project.fps }}fps</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import '@hyperframes/player'
import type { HyperframesPlayer as HFPlayer } from '@hyperframes/player'
import type { CaptionCue, EditProject, TimelineClip } from '@/types/edit'
import { projectDuration } from '@/stores/editProjectStore'
import { playhead } from '@/features/edit/playhead'
import { clipOpacityAt, clipVolumeAt } from '@/features/edit/keyframes'

const props = defineProps<{ project: EditProject; playing: boolean }>()

defineEmits<{
  (event: 'toggle-play'): void
  (event: 'seek', time: number): void
}>()

const videoRefs = new Map<string, HTMLVideoElement>()
const audioRefs = new Map<string, HTMLAudioElement>()
const motionRefs = new Map<string, HFPlayer>()
const visualRefs = new Map<string, HTMLElement>()

const duration = computed(() => projectDuration(props.project))

/** 预览框严格按项目比例缩放，避免容器被拉高后画面变形、留大黑边。 */
const viewportRef = ref<HTMLElement | null>(null)
const frameSize = reactive({ width: 0, height: 0 })
let frameObserver: ResizeObserver | null = null

function fitFrame() {
  const element = viewportRef.value
  if (!element) return
  const [rawW, rawH] = props.project.aspectRatio.split(':').map((value) => Number(value) || 1)
  const availableWidth = element.clientWidth
  const availableHeight = element.clientHeight
  if (!availableWidth || !availableHeight) return
  const scale = Math.min(availableWidth / rawW, availableHeight / rawH)
  frameSize.width = Math.max(1, Math.floor(rawW * scale))
  frameSize.height = Math.max(1, Math.floor(rawH * scale))
}

onMounted(() => {
  fitFrame()
  if (typeof ResizeObserver !== 'undefined' && viewportRef.value) {
    frameObserver = new ResizeObserver(fitFrame)
    frameObserver.observe(viewportRef.value)
  }
  window.addEventListener('resize', fitFrame)
  refreshActive()
  paintTime()
  void nextTick(syncMedia)
})

onBeforeUnmount(() => {
  frameObserver?.disconnect()
  frameObserver = null
  window.removeEventListener('resize', fitFrame)
})

watch(() => props.project.aspectRatio, () => nextTick(fitFrame))

const hasClips = computed(() => props.project.tracks.some((track) => track.clips.length > 0))

/** 只依赖 project：播放过程中不重建媒体节点。 */
const mediaNodes = computed(() => {
  const list: Array<{ key: string; clip: TimelineClip }> = []
  for (const track of props.project.tracks) {
    for (const clip of track.clips) list.push({ key: `${track.id}-${clip.id}`, clip })
  }
  return list
})

const clipIndex = computed(() => {
  const map = new Map<string, { track: EditProject['tracks'][number]; clip: TimelineClip }>()
  for (const track of props.project.tracks) {
    for (const clip of track.clips) map.set(clip.id, { track, clip })
  }
  return map
})

/** 当前时间点可见的片段集合：只有集合变化时才触发重渲染。 */
const visibleSet = shallowRef<Set<string>>(new Set())
const activeCaption = shallowRef<CaptionCue | null>(null)
let lastSignature = ''

const timeText = ref('00:00.00 / 00:00.00')
let lastPaint = -1

function refreshActive() {
  const time = playhead.value
  const caption = (props.project.captions || []).find(
    (cue) => time >= cue.start && time < cue.start + cue.duration,
  ) || null
  if (caption?.id !== activeCaption.value?.id || caption?.text !== activeCaption.value?.text) {
    activeCaption.value = caption
  }
  const ids: string[] = []
  for (const track of props.project.tracks) {
    for (const clip of track.clips) {
      if (time >= clip.start - 0.001 && time < clip.start + clip.duration) ids.push(clip.id)
    }
  }
  const signature = ids.join('|')
  if (signature === lastSignature) return
  lastSignature = signature
  visibleSet.value = new Set(ids)
}

function paintTime() {
  const time = playhead.value
  if (Math.abs(time - lastPaint) < 0.09 && time !== 0 && time !== duration.value) return
  lastPaint = time
  timeText.value = `${formatTime(time)} / ${formatTime(duration.value)}`
}

function setVideoRef(id: string, el: unknown) {
  if (el instanceof HTMLVideoElement) {
    videoRefs.set(id, el)
    visualRefs.set(id, el)
  } else {
    videoRefs.delete(id)
    visualRefs.delete(id)
  }
}

function setVisualRef(id: string, el: unknown) {
  if (el instanceof HTMLElement) visualRefs.set(id, el)
  else visualRefs.delete(id)
}

function setAudioRef(id: string, el: unknown) {
  if (el instanceof HTMLAudioElement) audioRefs.set(id, el)
  else audioRefs.delete(id)
}

function setMotionRef(id: string, el: unknown) {
  if (el instanceof HTMLElement && el.tagName === 'HYPERFRAMES-PLAYER') {
    const player = el as HFPlayer
    motionRefs.set(id, player)
    visualRefs.set(id, player)
  } else {
    motionRefs.delete(id)
    visualRefs.delete(id)
  }
}

/** Player ready 后再下发范围与播放头，避免工程加载期间丢掉第一次 seek。 */
function onMotionReady(clip: TimelineClip) {
  syncMotion(clip, true)
}

function syncMotion(clip: TimelineClip, force = false) {
  const player = motionRefs.get(clip.id)
  if (!player?.ready) return
  const item = clipIndex.value.get(clip.id)
  const active = visibleSet.value.has(clip.id)
  const trimStart = clip.trimStart || 0
  const rangeEnd = trimStart + clip.duration
  if (player.rangeStart !== trimStart) player.rangeStart = trimStart
  if (player.rangeEnd !== rangeEnd) player.rangeEnd = rangeEnd
  player.volume = item?.track.muted ? 0 : clipVolumeAt(clip, playhead.value - clip.start)

  if (!active) {
    if (!player.paused) player.pause()
    return
  }
  const target = targetTime(clip)
  // seek() 会暂停 Player；只有拖动播放头或漂移明显时才调用，避免每帧重启动效。
  const drift = Math.abs(player.currentTime - target)
  if (force || (!props.playing && drift > 0.025) || (props.playing && drift > 0.3)) {
    player.seek(target)
  }
  if (props.playing && target < rangeEnd - 1 / 30 && player.paused) player.play()
  else if (!props.playing && !player.paused) player.pause()
}

function targetTime(clip: TimelineClip): number {
  const offset = Math.max(0, playhead.value - clip.start)
  return (clip.trimStart || 0) + Math.min(clip.duration, offset)
}

let previousActive: string[] = []

function syncMedia() {
  const active = visibleSet.value
  for (const [id, element] of visualRefs) {
    const clip = clipIndex.value.get(id)?.clip
    if (!clip) continue
    element.style.opacity = active.has(id)
      ? String(clipOpacityAt(clip, playhead.value - clip.start))
      : '0'
  }
  for (const id of previousActive) {
    if (active.has(id)) continue
    const el = videoRefs.get(id) || audioRefs.get(id)
    if (el && !el.paused) el.pause()
    const motionPlayer = motionRefs.get(id)
    if (motionPlayer && !motionPlayer.paused) motionPlayer.pause()
  }
  for (const id of active) {
    const item = clipIndex.value.get(id)
    if (!item) continue
    const { track, clip } = item
    if (clip.kind === 'motion') {
      syncMotion(clip)
      continue
    }
    const el = clip.kind === 'video'
      ? videoRefs.get(clip.id)
      : clip.kind === 'audio'
        ? audioRefs.get(clip.id)
        : null
    if (!el) continue
    el.volume = track.muted ? 0 : clipVolumeAt(clip, playhead.value - clip.start)
    const target = targetTime(clip)
    if (Math.abs(el.currentTime - target) > 0.24 && !el.seeking) {
      try {
        el.currentTime = target
      } catch {
        // 元数据还没就绪时忽略，loadedmetadata 会再同步一次。
      }
    }
    if (props.playing) {
      if (el.paused) void el.play().catch(() => {})
    } else if (!el.paused) {
      el.pause()
    }
  }
  previousActive = [...active]
}

watch(
  playhead,
  () => {
    refreshActive()
    paintTime()
    syncMedia()
  },
  { flush: 'post' },
)

watch(
  () => props.playing,
  () => syncMedia(),
)

watch(
  () => [props.project.tracks, props.project.captions],
  () => {
    refreshActive()
    void nextTick(syncMedia)
  },
  { deep: true, flush: 'post' },
)

watch(
  () => props.project.id,
  () => {
    lastSignature = ''
    lastPaint = -1
    refreshActive()
    paintTime()
    void nextTick(syncMedia)
  },
)

function formatTime(seconds: number): string {
  const value = Math.max(0, seconds)
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}
</script>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.stage-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.stage-frame {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  background: #0f0f0e;
  box-shadow: 0 10px 30px rgba(36, 31, 25, 0.12);
}

.stage-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0b0b0a;
}

.stage-video,
.stage-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #0b0b0a;
  transition: opacity 90ms linear;
}

.stage-animation {
  border: 0;
  pointer-events: none;
}

.animation-source-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: #d8d0c8;
  font-family: var(--sf-font-mono, monospace);
  text-align: center;
}

.animation-source-placeholder strong {
  font-size: 15px;
  font-weight: 600;
}

.animation-source-placeholder span {
  color: #8f8780;
  font-family: var(--sf-font, sans-serif);
  font-size: 11px;
}

.stage-video.is-idle,
.stage-media.is-idle {
  opacity: 0;
  pointer-events: none;
}

.stage-canvas audio {
  display: none;
}

.stage-caption {
  position: absolute;
  z-index: 20;
  left: 8%;
  right: 8%;
  bottom: 7%;
  color: #fff;
  font-size: clamp(12px, 2.8vw, 30px);
  font-weight: 600;
  line-height: 1.45;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}

.stage-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: #81817a;
  text-align: center;
}

.stage-empty p {
  margin: 0;
  color: var(--sf-line-strong);
  font-size: 13px;
  font-weight: 600;
}

.stage-empty span {
  max-width: 260px;
  font-size: 11px;
  line-height: 1.7;
}

.stage-bar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 4px 2px;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.stage-transport {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.stage-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid #e5e3db;
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.stage-play svg {
  width: 13px;
  height: 13px;
}

.stage-play:hover {
  border-color: var(--sf-ink);
  box-shadow: 0 3px 10px -6px rgba(36, 31, 25, 0.5);
}

.stage-skip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--sf-ink-3);
  cursor: pointer;
}

.stage-skip svg {
  width: 14px;
  height: 14px;
}

.stage-skip:hover {
  border-color: var(--sf-line-soft);
  background: var(--sf-surface);
  color: var(--sf-ink);
}

.stage-time {
  color: #4d4d46;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
</style>
