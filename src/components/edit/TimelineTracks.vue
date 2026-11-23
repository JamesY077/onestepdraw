<template>
  <section class="timeline">
    <header class="tl-head">
      <div class="tl-title">
        <strong>时间轴</strong>
        <span>{{ clipCount }} 个片段 · {{ formatTime(duration) }}</span>
        <span v-if="hint" class="tl-hint">{{ hint }}</span>
      </div>
      <div class="tl-tools">
        <button type="button" class="tl-tool" title="缩小（Ctrl+滚轮）" @click="zoomStep(-1)">−</button>
        <span class="tl-zoom">{{ Math.round(pxPerSec) }}px/s</span>
        <button type="button" class="tl-tool" title="放大（Ctrl+滚轮）" @click="zoomStep(1)">＋</button>
        <button type="button" class="tl-tool wide" @click="$emit('fit')">适配</button>
      </div>
    </header>

    <div class="tl-body">
      <div class="tl-gutter">
        <div class="tl-gutter-ruler" />
        <div
          v-for="track in project.tracks"
          :key="track.id"
          class="tl-track-head"
          :class="`kind-${track.kind}`"
        >
          <span class="track-kind" aria-hidden="true">
            <svg v-if="track.kind === 'video'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
              <rect x="3.2" y="5" width="17.6" height="14" rx="3" />
              <path d="M10.2 9.5 15 12l-4.8 2.5z" fill="currentColor" stroke="none" />
            </svg>
            <svg v-else-if="track.kind === 'overlay'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
              <rect x="4.5" y="4.5" width="11" height="11" rx="2" />
              <path d="M9 19h9a1 1 0 0 0 1-1v-9" opacity="0.6" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <path d="M4.5 12v0M8 8.5v7M11.5 6v12M15 9v6M18.5 10.5v3" />
            </svg>
          </span>
          <span class="track-name">{{ track.name }}</span>
          <button
            type="button"
            class="track-mute"
            :class="{ muted: track.muted }"
            :title="track.muted ? '取消静音' : '静音'"
            @click="$emit('toggle-mute', track.id)"
          >
            <svg v-if="!track.muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4.5 9.5h3L12 6v12L7.5 14.5h-3z" />
              <path d="M15.5 9a4 4 0 0 1 0 6M18 6.8a7 7 0 0 1 0 10.4" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
              <path d="M4.5 9.5h3L12 6v12L7.5 14.5h-3z" />
              <path d="m16 10 4 4M20 10l-4 4" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref="scrollRef"
        class="tl-scroll"
        @scroll.passive="syncViewport"
        @wheel="onWheel"
      >
        <div class="tl-content" :style="{ width: `${totalWidth}px` }">
          <div ref="rulerRef" class="tl-ruler" @pointerdown="startScrub">
            <span
              v-for="tick in ticks"
              :key="tick"
              class="tl-tick"
              :class="{ major: isMajor(tick) }"
              :style="{ transform: `translate3d(${tick * pxPerSec}px, 0, 0)` }"
            >
              <em v-if="isMajor(tick)">{{ tickLabel(tick) }}</em>
            </span>
          </div>

          <div
            v-for="track in project.tracks"
            :key="track.id"
            class="tl-row"
            :class="[`kind-${track.kind}`, { 'is-drop': dropTrackId === track.id }]"
            @dragover.prevent="dropTrackId = track.id"
            @dragleave="dropTrackId = ''"
            @drop="handleDrop($event, track.id)"
          >
            <div class="tl-lane" />

            <div
              v-for="clip in visibleClips(track)"
              :key="clip.id"
              :ref="(el) => setClipRef(clip.id, el)"
              class="tl-clip"
              :class="[
                `kind-${clip.kind}`,
                {
                  'is-selected': clip.id === selectedClipId,
                  'is-dragging': activeDrag?.clipId === clip.id,
                },
              ]"
              :style="{ left: `${clip.start * pxPerSec}px`, width: `${Math.max(10, clip.duration * pxPerSec)}px` }"
              :title="`${clip.name} · ${clip.duration.toFixed(1)}s`"
              @pointerdown="startClipDrag($event, clip, 'move')"
              @dblclick.stop="$emit('seek', clip.start)"
            >
              <ClipWave
                v-if="clip.kind === 'audio'"
                :url="clip.url"
                :offset="clip.trimStart || 0"
                :span="clip.duration"
                :width-px="clip.duration * pxPerSec"
              />
              <span
                class="clip-handle left"
                aria-hidden="true"
                @pointerdown.stop="startClipDrag($event, clip, 'left')"
              />
              <span class="clip-body">
                <span class="clip-name">{{ clip.name }}</span>
                <span class="clip-time">{{ clip.duration.toFixed(1) }}s</span>
              </span>
              <span
                class="clip-handle right"
                aria-hidden="true"
                @pointerdown.stop="startClipDrag($event, clip, 'right')"
              />
            </div>
          </div>

          <div ref="guideRef" class="tl-snap-guide" aria-hidden="true" />
          <div ref="playheadRef" class="tl-playhead">
            <span class="playhead-grip" @pointerdown.stop="startScrub" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ClipWave from '@/components/edit/ClipWave.vue'
import {
  MAX_PROJECT_SECONDS,
  MIN_CLIP_SECONDS,
  type EditProject,
  type EditTrack,
  type EditTrackKind,
  type TimelineClip,
} from '@/types/edit'
import { projectDuration } from '@/stores/editProjectStore'
import { playhead } from '@/features/edit/playhead'
import { collectSnapTargets, resolveSnap } from '@/features/edit/timelineSnap'

const props = defineProps<{
  project: EditProject
  selectedClipId: string
  pxPerSec: number
  playing: boolean
  hint?: string
}>()

const emit = defineEmits<{
  (event: 'seek', time: number): void
  (event: 'select', clipId: string): void
  (event: 'move-clip', payload: { clipId: string; start: number }): void
  (event: 'trim-clip', payload: { clipId: string; start: number; duration: number }): void
  (event: 'toggle-mute', trackId: string): void
  (event: 'add-asset', payload: { assetId: string; at: number; trackKind: EditTrackKind }): void
  (event: 'fit'): void
  (event: 'update:pxPerSec', value: number): void
}>()

const scrollRef = ref<HTMLElement | null>(null)
const rulerRef = ref<HTMLElement | null>(null)
const guideRef = ref<HTMLElement | null>(null)
const playheadRef = ref<HTMLElement | null>(null)
const clipEls = new Map<string, HTMLElement>()

const dropTrackId = ref('')
const activeDrag = ref<{ clipId: string; mode: DragMode } | null>(null)
const scrollLeft = ref(0)
const viewWidth = ref(600)

type DragMode = 'move' | 'left' | 'right'

interface DragState {
  clipId: string
  mode: DragMode
  el: HTMLElement
  pointerId: number
  startClientX: number
  scrollStart: number
  origStart: number
  origDuration: number
  origTrim: number
  /** 素材本身还剩多长可剪；图片为 Infinity。 */
  maxLength: number
  pxPerSec: number
  targets: number[]
  preview: { start: number; duration: number }
  moved: boolean
}

let dragState: DragState | null = null
let rafSeek = 0
let pendingSeek = 0
let resizeObserver: ResizeObserver | null = null

const duration = computed(() => projectDuration(props.project))
const totalWidth = computed(() => Math.max(600, (Math.max(duration.value, 12) + 6) * props.pxPerSec))
const clipCount = computed(() =>
  props.project.tracks.reduce((count, track) => count + track.clips.length, 0),
)

const windowStart = computed(() => Math.max(0, scrollLeft.value / props.pxPerSec - 2))
const windowEnd = computed(() => (scrollLeft.value + viewWidth.value) / props.pxPerSec + 2)

const labelStep = computed(() => {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
  return steps.find((step) => step * props.pxPerSec >= 58) ?? 120
})

const ticks = computed(() => {
  const step = labelStep.value / 4
  const from = Math.max(0, Math.floor(windowStart.value / step) * step)
  const to = Math.min(Math.max(duration.value, 12) + 8, windowEnd.value + step)
  const list: number[] = []
  for (let value = from; value <= to; value += step) {
    list.push(Math.round(value * 100) / 100)
  }
  return list
})

function isMajor(tick: number): boolean {
  return Math.abs(tick / labelStep.value - Math.round(tick / labelStep.value)) < 0.001
}

function tickLabel(tick: number): string {
  const total = Math.max(0, tick)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  const text = Number.isInteger(seconds) ? String(seconds).padStart(2, '0') : seconds.toFixed(1)
  return minutes > 0 ? `${minutes}:${text.padStart(4, '0')}` : `${text}s`
}

function setClipRef(id: string, el: unknown) {
  if (el instanceof HTMLElement) clipEls.set(id, el)
  else clipEls.delete(id)
}

function visibleClips(track: EditTrack): TimelineClip[] {
  const from = windowStart.value
  const to = windowEnd.value
  const dragId = dragState?.clipId
  return track.clips.filter((clip) => {
    if (clip.id === dragId) return true
    return clip.start + clip.duration >= from && clip.start <= to
  })
}

function syncViewport() {
  const element = scrollRef.value
  if (!element) return
  scrollLeft.value = element.scrollLeft
  viewWidth.value = element.clientWidth
}

function timeFromClientX(clientX: number): number {
  const rect = rulerRef.value?.getBoundingClientRect()
  if (!rect) return 0
  const value = (clientX - rect.left) / props.pxPerSec
  return Math.max(0, Math.min(MAX_PROJECT_SECONDS, value))
}

function emitSeek(time: number) {
  pendingSeek = time
  if (rafSeek) return
  rafSeek = requestAnimationFrame(() => {
    rafSeek = 0
    emit('seek', Math.round(pendingSeek * 1000) / 1000)
  })
}

function startScrub(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)
  emitSeek(timeFromClientX(event.clientX))
  const move = (pointer: PointerEvent) => emitSeek(timeFromClientX(pointer.clientX))
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function sourceLengthLeft(clip: TimelineClip): number {
  if (clip.kind === 'image') return Number.POSITIVE_INFINITY
  const asset = clip.assetId
    ? props.project.assets.find((item) => item.id === clip.assetId)
    : props.project.assets.find((item) => item.url === clip.url)
  if (!asset?.duration) return Number.POSITIVE_INFINITY
  return Math.max(MIN_CLIP_SECONDS, asset.duration - (clip.trimStart || 0))
}

function startClipDrag(event: PointerEvent, clip: TimelineClip, mode: DragMode) {
  if (event.button !== 0) return
  const el = (event.currentTarget as HTMLElement | null)?.closest('.tl-clip') as HTMLElement | null
  if (!el) return
  event.preventDefault()
  emit('select', clip.id)
  dragState = {
    clipId: clip.id,
    mode,
    el,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    scrollStart: scrollRef.value?.scrollLeft ?? 0,
    origStart: clip.start,
    origDuration: clip.duration,
    origTrim: clip.trimStart || 0,
    maxLength: sourceLengthLeft(clip),
    pxPerSec: props.pxPerSec,
    targets: collectSnapTargets(props.project, {
      excludeClipId: clip.id,
      playhead: playhead.value,
    }),
    preview: { start: clip.start, duration: clip.duration },
    moved: false,
  }
  activeDrag.value = { clipId: clip.id, mode }
  el.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDragMove(event: PointerEvent) {
  const state = dragState
  if (!state) return
  const scrollDelta = (scrollRef.value?.scrollLeft ?? state.scrollStart) - state.scrollStart
  const deltaTime = (event.clientX - state.startClientX + scrollDelta) / state.pxPerSec
  const px = state.pxPerSec
  let start = state.origStart
  let length = state.origDuration

  if (state.mode === 'move') {
    start = Math.max(0, Math.min(MAX_PROJECT_SECONDS - state.origDuration, state.origStart + deltaTime))
  } else if (state.mode === 'left') {
    // 左侧裁切不能把素材剪到 0 之前，也不能短于最小片段。
    const floor = Math.max(0, state.origStart - state.origTrim)
    start = Math.max(
      floor,
      Math.min(state.origStart + state.origDuration - MIN_CLIP_SECONDS, state.origStart + deltaTime),
    )
    length = state.origDuration + (state.origStart - start)
  } else {
    length = Math.max(
      MIN_CLIP_SECONDS,
      Math.min(
        MAX_PROJECT_SECONDS - state.origStart,
        state.maxLength,
        state.origDuration + deltaTime,
      ),
    )
  }

  const snapped = resolveSnap(start, length, state.targets, px, { mode: state.mode })
  start = snapped.start
  length = snapped.duration
  // 吸附不能把片段拉出素材长度或拉到素材负数区。
  if (state.mode === 'left') {
    const floor = Math.max(0, state.origStart - state.origTrim)
    if (start < floor) {
      length += floor - start
      start = floor
    }
  } else if (state.mode === 'right') {
    length = Math.min(length, state.maxLength)
  }
  state.preview = { start, duration: length }

  const shift = (start - state.origStart) * px
  state.el.style.transform = `translate3d(${shift}px, 0, 0)`
  if (state.mode !== 'move') {
    state.el.style.width = `${Math.max(10, length * px)}px`
  }
  state.moved = state.moved || Math.abs(shift) > 0.5 || Math.abs(length - state.origDuration) * px > 0.5

  paintGuide(snapped.guide)
  autoScroll(event.clientX)
}

function paintGuide(time: number | null) {
  const guide = guideRef.value
  if (!guide) return
  if (time === null) {
    guide.style.opacity = '0'
    return
  }
  guide.style.opacity = '1'
  guide.style.transform = `translate3d(${time * props.pxPerSec}px, 0, 0)`
}

function autoScroll(clientX: number) {
  const element = scrollRef.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const edge = 42
  if (clientX > rect.right - edge && element.scrollLeft < element.scrollWidth) {
    element.scrollLeft += 14
  } else if (clientX < rect.left + edge && element.scrollLeft > 0) {
    element.scrollLeft -= 14
  }
}

function endDrag() {
  const state = dragState
  dragState = null
  activeDrag.value = null
  paintGuide(null)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (!state) return

  const el = state.el
  try {
    el.releasePointerCapture?.(state.pointerId)
  } catch {
    // 捕获可能已被浏览器释放。
  }

  const start = Math.round(state.preview.start * 1000) / 1000
  const length = Math.round(state.preview.duration * 1000) / 1000
  if (state.moved) {
    if (state.mode === 'move') {
      emit('move-clip', { clipId: state.clipId, start })
    } else {
      emit('trim-clip', { clipId: state.clipId, start, duration: length })
    }
  }

  // 提交后 Vue 会把 left/width 补成最终值；这里等它补完再撤掉临时 transform，
  // 两件事在同一个 microtask 队列里完成，不会看到跳帧。
  void nextTick(() => {
    if (!el.isConnected) return
    el.style.transform = ''
    if (state.mode !== 'move') {
      el.style.width = `${Math.max(10, (state.moved ? length : state.origDuration) * state.pxPerSec)}px`
    }
  })
}

function zoomStep(direction: number) {
  zoomTo(props.pxPerSec * (direction > 0 ? 1.25 : 0.8), null)
}

function zoomTo(raw: number, anchorClientX: number | null) {
  const element = scrollRef.value
  const next = Math.round(Math.min(400, Math.max(6, raw)))
  if (!element || next === props.pxPerSec) {
    emit('update:pxPerSec', next)
    return
  }
  const rect = element.getBoundingClientRect()
  const anchorX = anchorClientX === null ? viewWidth.value / 2 : anchorClientX - rect.left
  const anchorTime = (element.scrollLeft + anchorX) / props.pxPerSec
  emit('update:pxPerSec', next)
  void nextTick(() => {
    element.scrollLeft = Math.max(0, anchorTime * next - anchorX)
    syncViewport()
    paintPlayhead()
  })
}

function onWheel(event: WheelEvent) {
  const element = scrollRef.value
  if (!element) return
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    zoomTo(props.pxPerSec * Math.exp(-event.deltaY * 0.0022), event.clientX)
    return
  }
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault()
    element.scrollLeft += event.deltaY
  }
}

function paintPlayhead() {
  const element = playheadRef.value
  if (!element) return
  element.style.transform = `translate3d(${playhead.value * props.pxPerSec}px, 0, 0)`
  const scroller = scrollRef.value
  if (props.playing && scroller) {
    const x = playhead.value * props.pxPerSec
    const left = scroller.scrollLeft
    const right = left + scroller.clientWidth
    if (x > right - 60) {
      scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.25)
    } else if (x < left) {
      scroller.scrollLeft = Math.max(0, x - 40)
    }
  }
}

watch(playhead, paintPlayhead, { flush: 'post' })
watch(
  () => props.pxPerSec,
  () => nextTick(paintPlayhead),
)

function handleDrop(event: DragEvent, trackId: string) {
  dropTrackId.value = ''
  const assetId = event.dataTransfer?.getData('application/onestep-asset') || ''
  if (!assetId) return
  const track = props.project.tracks.find((item) => item.id === trackId)
  if (!track) return
  const at = Math.round(timeFromClientX(event.clientX) * 10) / 10
  emit('add-asset', { assetId, at, trackKind: track.kind })
}

function formatTime(seconds: number): string {
  const value = Math.max(0, seconds)
  const minutes = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

onMounted(() => {
  syncViewport()
  if (typeof ResizeObserver !== 'undefined' && scrollRef.value) {
    resizeObserver = new ResizeObserver(syncViewport)
    resizeObserver.observe(scrollRef.value)
  }
  void nextTick(paintPlayhead)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafSeek)
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (dragState) {
    dragState.el.style.transform = ''
    dragState = null
  }
})
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid #ecece6;
  background: #fbfbf8;
}

.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0ea;
}

.tl-title {
  display: flex;
  flex-wrap: nowrap;
  min-width: 0;
  white-space: nowrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  color: #9a9a92;
  font-size: 10.5px;
}

.tl-title strong {
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 650;
}

.tl-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 220px;
  color: #b0b0a8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.tl-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid #e7e7e1;
  border-radius: 6px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.tl-tool.wide {
  font-size: 10.5px;
}

.tl-tool:hover {
  border-color: #cfcfc7;
  color: #111110;
}

.tl-zoom {
  min-width: 46px;
  color: #a3a39b;
  font-size: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.tl-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.tl-gutter {
  width: 116px;
  flex: none;
  border-right: 1px solid #f0f0ea;
  background: #fbfbf8;
}

.tl-gutter-ruler {
  height: 26px;
  border-bottom: 1px solid #f0f0ea;
}

.tl-track-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 54px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid #f3f3ed;
  color: #8c8c84;
}

.track-kind {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: #b0b0a8;
}

.track-kind svg {
  width: 14px;
  height: 14px;
}

.track-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #5f5f57;
  font-size: 10.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-mute {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #b0b0a8;
  cursor: pointer;
}

.track-mute svg {
  width: 13px;
  height: 13px;
}

.track-mute.muted {
  color: #d05a4a;
}

.tl-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.tl-content {
  position: relative;
  min-height: 100%;
}

.tl-ruler {
  position: relative;
  height: 26px;
  border-bottom: 1px solid #f0f0ea;
  cursor: ew-resize;
  touch-action: none;
}

.tl-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: #f0f0ea;
  pointer-events: none;
}

.tl-tick.major {
  background: #e4e4dd;
}

.tl-tick em {
  position: absolute;
  top: 4px;
  left: 4px;
  color: #a8a8a0;
  font-size: 9.5px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.tl-row {
  position: relative;
  height: 54px;
  border-bottom: 1px solid #f3f3ed;
}

.tl-row.is-drop {
  background: rgba(17, 17, 16, 0.035);
}

.tl-lane {
  position: absolute;
  inset: 6px 0;
  background-image: linear-gradient(90deg, #f2f2ec 1px, transparent 1px);
  background-size: 40px 100%;
  opacity: 0.55;
}

.tl-clip {
  position: absolute;
  top: 8px;
  height: 38px;
  display: flex;
  align-items: stretch;
  border: 1px solid #deded6;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.04);
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  user-select: none;
  will-change: transform;
}

.tl-clip.is-dragging {
  cursor: grabbing;
  box-shadow: 0 4px 14px rgba(17, 17, 16, 0.16);
  z-index: 3;
}

.tl-clip.kind-video {
  border-color: #d8d8ce;
  background: linear-gradient(180deg, #ffffff, #f4f4ee);
}

.tl-clip.kind-overlay {
  border-color: #dcdcd2;
  background: repeating-linear-gradient(135deg, #ffffff, #ffffff 6px, #f7f7f1 6px, #f7f7f1 12px);
}

.tl-clip.kind-audio {
  border-color: #d9d9cf;
  background: #f6f6f0;
}

.tl-clip.is-selected {
  border-color: #111110;
  box-shadow: 0 0 0 1px #111110;
}

.clip-body {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  padding: 0 6px;
  overflow: hidden;
  pointer-events: none;
}

.clip-name {
  overflow: hidden;
  color: #3b3b36;
  font-size: 10px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clip-time {
  color: #a3a39b;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.clip-handle {
  position: relative;
  z-index: 2;
  width: 6px;
  flex: none;
  cursor: ew-resize;
  background: transparent;
}

.clip-handle:hover {
  background: rgba(17, 17, 16, 0.08);
}

.tl-snap-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: #b4472f;
  opacity: 0;
  pointer-events: none;
  z-index: 6;
}

.tl-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: #e0513f;
  pointer-events: none;
  z-index: 5;
  will-change: transform;
}

.playhead-grip {
  position: absolute;
  top: 0;
  left: -5px;
  width: 11px;
  height: 11px;
  border-radius: 3px 3px 6px 6px;
  background: #e0513f;
  pointer-events: auto;
  cursor: ew-resize;
}
@media (max-width: 620px) {
  .tl-hint {
    display: none;
  }
  .tl-scroll {
    touch-action: pan-x;
  }
}
</style>
