<template>
  <div class="stage">
    <div ref="viewportRef" class="stage-viewport">
      <div
        class="stage-frame"
        :style="{ width: `${frameSize.width}px`, height: `${frameSize.height}px` }"
      >
      <div class="stage-canvas">
        <template v-for="item in activeClips" :key="`${item.track.id}-${item.clip.id}`">
          <video
            v-if="item.clip.kind === 'video'"
            :ref="(el) => setVideoRef(item.clip.id, el)"
            class="stage-video"
            :src="item.clip.url"
            :poster="item.clip.thumbnail || undefined"
            playsinline
            preload="auto"
            @loadedmetadata="syncMedia"
          />
          <img
            v-else-if="item.clip.kind === 'image'"
            class="stage-media"
            :src="item.clip.url"
            alt=""
            :style="{ opacity: item.clip.opacity ?? 1 }"
          />
          <audio
            v-else
            :ref="(el) => setAudioRef(item.clip.id, el)"
            :src="item.clip.url"
            preload="auto"
            @loadedmetadata="syncMedia"
          />
        </template>

        <div v-if="!activeClips.length" class="stage-empty">
          <template v-if="hasClips">
            <p>当前时间点没有画面</p>
            <span>移动播放头，或双击轨道上的片段跳到它的开头。</span>
          </template>
          <template v-else>
            <p>时间轴还是空的</p>
            <span>把左侧素材拖到轨道，或在右侧对话框里描述你要的画面。</span>
          </template>
        </div>
      </div>
      </div>
    </div>

    <footer class="stage-bar">
      <span class="stage-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      <span class="stage-meta">{{ project.aspectRatio }} · {{ project.resolution }} · {{ project.fps }}fps</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { EditProject, TimelineClip } from '@/types/edit'
import { projectDuration } from '@/stores/editProjectStore'

const props = defineProps<{ project: EditProject; currentTime: number; playing: boolean }>()

const videoRefs = new Map<string, HTMLVideoElement>()
const audioRefs = new Map<string, HTMLAudioElement>()

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
})

onBeforeUnmount(() => {
  frameObserver?.disconnect()
  frameObserver = null
  window.removeEventListener('resize', fitFrame)
})

watch(() => props.project.aspectRatio, () => nextTick(fitFrame))

const hasClips = computed(() =>
  props.project.tracks.some((track) => track.clips.length > 0),
)

const activeClips = computed(() => {
  const time = props.currentTime
  const list: Array<{ track: EditProject['tracks'][number]; clip: TimelineClip }> = []
  for (const track of props.project.tracks) {
    for (const clip of track.clips) {
      if (time >= clip.start - 0.001 && time < clip.start + clip.duration) {
        list.push({ track, clip })
      }
    }
  }
  return list
})

function setVideoRef(id: string, el: unknown) {
  if (el instanceof HTMLVideoElement) videoRefs.set(id, el)
  else videoRefs.delete(id)
}

function setAudioRef(id: string, el: unknown) {
  if (el instanceof HTMLAudioElement) audioRefs.set(id, el)
  else audioRefs.delete(id)
}

function targetTime(clip: TimelineClip): number {
  const offset = Math.max(0, props.currentTime - clip.start)
  return (clip.trimStart || 0) + Math.min(clip.duration, offset)
}

function syncMedia() {
  for (const { track, clip } of activeClips.value) {
    if (clip.kind === 'video') {
      const el = videoRefs.get(clip.id)
      if (!el) continue
      el.volume = track.muted ? 0 : Math.min(1, clip.volume ?? 1)
      const target = targetTime(clip)
      if (Math.abs(el.currentTime - target) > 0.24 && !el.seeking) {
        try {
          el.currentTime = target
        } catch {
          // 元数据还没就绪时忽略，loadedmetadata 会再同步一次。
        }
      }
      if (props.playing) void el.play().catch(() => {})
      else if (!el.paused) el.pause()
    } else if (clip.kind === 'audio') {
      const el = audioRefs.get(clip.id)
      if (!el) continue
      el.volume = track.muted ? 0 : Math.min(1, clip.volume ?? 1)
      const target = targetTime(clip)
      if (Math.abs(el.currentTime - target) > 0.24 && !el.seeking) {
        try {
          el.currentTime = target
        } catch {
          // 同上。
        }
      }
      if (props.playing) void el.play().catch(() => {})
      else if (!el.paused) el.pause()
    }
  }
}

watch(
  () => [props.currentTime, props.playing, activeClips.value.length],
  () => nextTick(syncMedia),
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
  box-shadow: 0 10px 30px rgba(17, 17, 16, 0.12);
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
}

.stage-canvas audio {
  display: none;
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
  color: #cfcfc7;
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 2px 0;
  color: #9a9a92;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.stage-time {
  color: #5d5d56;
  font-weight: 600;
}
</style>
