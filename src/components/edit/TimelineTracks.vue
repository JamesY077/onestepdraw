<template>
  <section class="timeline">
    <header class="tl-head">
      <div class="tl-title">
        <strong>时间轴</strong>
        <span>{{ clipCount }} 个片段 · {{ formatTime(duration) }}</span>
      </div>
      <div class="tl-tools">
        <button type="button" class="tl-tool" title="缩小" @click="zoom(-1)">−</button>
        <span class="tl-zoom">{{ Math.round(pxPerSec) }}px/s</span>
        <button type="button" class="tl-tool" title="放大" @click="zoom(1)">＋</button>
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

      <div class="tl-scroll">
        <div class="tl-content" :style="{ width: `${totalWidth}px` }">
          <div ref="rulerRef" class="tl-ruler" @pointerdown="seekFromEvent">
            <span
              v-for="tick in ticks"
              :key="tick"
              class="tl-tick"
              :class="{ major: tick % majorStep === 0 }"
              :style="{ left: `${tick * pxPerSec}px` }"
            >
              <em v-if="tick % majorStep === 0">{{ tick }}s</em>
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
              v-for="clip in track.clips"
              :key="clip.id"
              class="tl-clip"
              :class="[
                `kind-${clip.kind}`,
                { 'is-selected': clip.id === selectedClipId, 'is-dragging': drag?.clipId === clip.id },
              ]"
              :style="clipStyle(clip)"
              :title="`${clip.name} · ${clip.duration.toFixed(1)}s`"
              @pointerdown="startDrag($event, track.id, clip, 'move')"
              @dblclick.stop="$emit('seek', clip.start)"
            >
              <span
                class="clip-handle left"
                aria-hidden="true"
                @pointerdown.stop="startDrag($event, track.id, clip, 'left')"
              />
              <span class="clip-body">
                <span class="clip-name">{{ clip.name }}</span>
                <span class="clip-time">{{ clip.duration.toFixed(1) }}s</span>
              </span>
              <span
                class="clip-handle right"
                aria-hidden="true"
                @pointerdown.stop="startDrag($event, track.id, clip, 'right')"
              />
            </div>
          </div>

          <div class="tl-playhead" :style="{ left: `${currentTime * pxPerSec}px` }">
            <span class="playhead-grip" @pointerdown.stop="startScrub" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  MAX_PROJECT_SECONDS,
  MIN_CLIP_SECONDS,
  type EditProject,
  type EditTrackKind,
  type TimelineClip,
} from '@/types/edit'
import { projectDuration } from '@/stores/editProjectStore'

const props = defineProps<{
  project: EditProject
  currentTime: number
  selectedClipId: string
  pxPerSec: number
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

const rulerRef = ref<HTMLElement | null>(null)
const dropTrackId = ref('')
const drag = ref<{
  clipId: string
  mode: 'move' | 'left' | 'right'
  startX: number
  origStart: number
  origDuration: number
} | null>(null)
const previewStart = ref(0)
const previewDuration = ref(0)

const duration = computed(() => projectDuration(props.project))
const totalWidth = computed(() => Math.max(600, (Math.max(duration.value, 12) + 6) * props.pxPerSec))
const clipCount = computed(() =>
  props.project.tracks.reduce((count, track) => count + track.clips.length, 0),
)
const majorStep = computed(() => (props.pxPerSec >= 60 ? 1 : props.pxPerSec >= 28 ? 5 : 10))
const ticks = computed(() => {
  const step = props.pxPerSec >= 60 ? 1 : props.pxPerSec >= 28 ? 2 : 5
  const count = Math.ceil(Math.max(duration.value, 12) / step) + 6
  return Array.from({ length: count }, (_, index) => index * step)
})

function clipStyle(clip: TimelineClip) {
  const active = drag.value?.clipId === clip.id
  const start = active ? previewStart.value : clip.start
  const length = active ? previewDuration.value : clip.duration
  return {
    left: `${start * props.pxPerSec}px`,
    width: `${Math.max(10, length * props.pxPerSec)}px`,
  }
}

function timeFromClientX(clientX: number): number {
  const rect = rulerRef.value?.getBoundingClientRect()
  if (!rect) return 0
  const value = (clientX - rect.left) / props.pxPerSec
  return Math.max(0, Math.min(MAX_PROJECT_SECONDS, value))
}

function seekFromEvent(event: PointerEvent) {
  emit('seek', snap(timeFromClientX(event.clientX)))
}

function snap(value: number): number {
  return Math.round(value * 10) / 10
}

function startDrag(
  event: PointerEvent,
  _trackId: string,
  clip: TimelineClip,
  mode: 'move' | 'left' | 'right',
) {
  if (event.button !== 0) return
  event.preventDefault()
  emit('select', clip.id)
  drag.value = {
    clipId: clip.id,
    mode,
    startX: event.clientX,
    origStart: clip.start,
    origDuration: clip.duration,
  }
  previewStart.value = clip.start
  previewDuration.value = clip.duration
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDragMove(event: PointerEvent) {
  const state = drag.value
  if (!state) return
  const delta = snap((event.clientX - state.startX) / props.pxPerSec)
  if (state.mode === 'move') {
    previewStart.value = Math.max(0, Math.min(MAX_PROJECT_SECONDS, state.origStart + delta))
    previewDuration.value = state.origDuration
    return
  }
  if (state.mode === 'left') {
    const maxStart = state.origStart + state.origDuration - MIN_CLIP_SECONDS
    const start = Math.max(0, Math.min(maxStart, state.origStart + delta))
    previewStart.value = start
    previewDuration.value = Math.max(MIN_CLIP_SECONDS, state.origDuration - (start - state.origStart))
    return
  }
  previewDuration.value = Math.max(
    MIN_CLIP_SECONDS,
    Math.min(MAX_PROJECT_SECONDS, state.origDuration + delta),
  )
  previewStart.value = state.origStart
}

function endDrag() {
  const state = drag.value
  if (state) {
    if (state.mode === 'move') {
      emit('move-clip', { clipId: state.clipId, start: previewStart.value })
    } else {
      emit('trim-clip', {
        clipId: state.clipId,
        start: previewStart.value,
        duration: previewDuration.value,
      })
    }
  }
  drag.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function startScrub(event: PointerEvent) {
  event.preventDefault()
  const move = (pointer: PointerEvent) => emit('seek', Math.max(0, snap(timeFromClientX(pointer.clientX))))
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function handleDrop(event: DragEvent, trackId: string) {
  dropTrackId.value = ''
  const assetId = event.dataTransfer?.getData('application/onestep-asset') || ''
  if (!assetId) return
  const track = props.project.tracks.find((item) => item.id === trackId)
  if (!track) return
  const lane = (event.currentTarget as HTMLElement).querySelector('.tl-lane')
  const rect = lane?.getBoundingClientRect() || (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('add-asset', {
    assetId,
    at: Math.max(0, snap((event.clientX - rect.left) / props.pxPerSec)),
    trackKind: track.kind,
  })
}

function zoom(direction: number) {
  const next = props.pxPerSec * (direction > 0 ? 1.25 : 0.8)
  emit('update:pxPerSec', Math.min(220, Math.max(14, Math.round(next))))
}

function formatTime(seconds: number): string {
  const value = Math.max(0, seconds)
  const minutes = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
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
  align-items: baseline;
  gap: 8px;
  color: #9a9a92;
  font-size: 10.5px;
}

.tl-title strong {
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 650;
}

.tl-tools {
  display: flex;
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
  cursor: text;
}

.tl-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #f0f0ea;
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
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  padding: 0 6px;
  overflow: hidden;
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
  width: 6px;
  flex: none;
  cursor: ew-resize;
  background: transparent;
}

.clip-handle:hover {
  background: rgba(17, 17, 16, 0.08);
}

.tl-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #e0513f;
  pointer-events: none;
  z-index: 5;
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
</style>
