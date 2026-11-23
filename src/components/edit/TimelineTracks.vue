<template>
  <section class="timeline">
    <header class="tl-head">
      <div class="tl-title">
        <strong>时间轴</strong>
        <span class="tl-meta">{{ clipCount }} 个片段 · {{ formatTime(duration) }}</span>
      </div>
      <div class="tl-actions">
        <button
          type="button"
          class="tl-action"
          :disabled="!selectedClipId"
          title="在播放头处分割（⌘B）"
          @click="$emit('split')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v18" />
            <path d="M7 7.5 12 12l-5 4.5zM17 7.5 12 12l5 4.5z" />
          </svg>
          <span class="tl-action-label">分割</span>
        </button>
        <button
          type="button"
          class="tl-action"
          :disabled="!selectedClipId"
          title="复制片段（⌘D）"
          @click="$emit('duplicate')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2.4" />
            <path d="M15.5 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h.5" />
          </svg>
          <span class="tl-action-label">复制</span>
        </button>
        <button
          type="button"
          class="tl-action danger"
          :disabled="!selectedClipIds.length"
          title="删除选中片段（Delete）"
          @click="$emit('remove')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
            <path d="M6.8 7l.8 11.2A1.8 1.8 0 0 0 9.4 20h5.2a1.8 1.8 0 0 0 1.8-1.8L17.2 7" />
          </svg>
          <span class="tl-action-label">删除</span>
        </button>
        <button
          type="button"
          class="tl-action ai"
          :disabled="!selectedClipIds.length"
          title="把选中片段加入右侧待发送区（⌘ Enter）"
          @click="$emit('ask-ai')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3.6 13.7 9l5.4 1.7-5.4 1.7L12 17.8l-1.7-5.4L4.9 10.7 10.3 9z" />
            <path d="M18.4 15.6 19 17.4l1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" />
          </svg>
          <span class="tl-action-label">发给 AI</span>
        </button>
        <span class="tl-divider" />
        <button
          type="button"
          class="tl-icon"
          :disabled="!canUndo"
          title="撤销（⌘Z）"
          @click="$emit('undo')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 7.5 4.8 11l3.7 3.5" />
            <path d="M4.8 11h9.4a4.3 4.3 0 0 1 0 8.6h-2.4" />
          </svg>
        </button>
        <button
          type="button"
          class="tl-icon"
          :disabled="!canRedo"
          title="重做（⇧⌘Z）"
          @click="$emit('redo')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15.5 7.5 3.7 3.5-3.7 3.5" />
            <path d="M19.2 11H9.8a4.3 4.3 0 0 0 0 8.6h2.4" />
          </svg>
        </button>
        <button
          type="button"
          class="tl-icon"
          title="快捷键（?）"
          aria-label="查看剪辑快捷键"
          @click="$emit('shortcuts')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2.6" />
            <path d="M6.5 9.5h.01M9.8 9.5h.01M13.2 9.5h.01M16.5 9.5h.01M7.2 14.2h9.6" />
          </svg>
        </button>
        <span class="tl-divider" />
        <div class="tl-zoomgroup">
          <button type="button" class="tl-zoomstep" title="缩小（Ctrl+滚轮）" @click="zoomStep(-1)">−</button>
          <span class="tl-zoom">{{ Math.round(pxPerSec) }}px/s</span>
          <button type="button" class="tl-zoomstep" title="放大（Ctrl+滚轮）" @click="zoomStep(1)">＋</button>
        </div>
        <button type="button" class="tl-fit" @click="$emit('fit')">适配</button>
      </div>
    </header>

    <div v-if="selectedClipIds.length" class="tl-selectbar">
      <div class="tl-selectsummary">
        <span class="tl-selectcount">{{ selectedClipIds.length }} 段已选</span>
        <span class="tl-selectnames">{{ selectedSummary }}</span>
      </div>
      <input
        v-model="noteText"
        class="tl-selectnote"
        type="text"
        maxlength="200"
        :placeholder="selectedClipIds.length > 1 ? '描述这几段要怎么改…' : '描述这段要怎么改…'"
        aria-label="给选中片段的修改意见"
        @keydown.stop
        @keydown.enter.prevent="askAi"
      />
      <div class="tl-selectactions">
        <button type="button" class="tl-selectprops" @click="$emit('inspector')">属性</button>
        <button type="button" class="tl-selectask" @click="askAi">
          发给 AI
          <kbd>⌘ ↵</kbd>
        </button>
        <button
          type="button"
          class="tl-selectclear"
          @click="$emit('select', { ids: [], primary: '' }); $emit('update:note', '')"
        >
          取消选择
        </button>
      </div>
    </div>

    <div class="tl-body">
      <div class="tl-gutter">
        <div class="tl-gutter-ruler" />
        <div ref="gutterInnerRef" class="tl-gutter-inner">
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
      </div>

      <div
        ref="scrollRef"
        class="tl-scroll"
        @scroll.passive="syncViewport"
        @wheel="onWheel"
      >
        <div ref="contentRef" class="tl-content" :style="{ width: `${totalWidth}px` }">          <div ref="rulerRef" class="tl-ruler" @pointerdown="startScrub">
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
            @pointerdown="startEmptySelect($event)"
            @contextmenu.prevent="openEmptyMenu($event)"
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
                  'is-selected': isClipSelected(clip.id),
                  'is-primary': clip.id === selectedClipId,
                  'is-dragging': activeDrag?.clipId === clip.id,
                },
              ]"
              :style="{ left: `${clip.start * pxPerSec}px`, width: `${Math.max(10, clip.duration * pxPerSec)}px` }"
              :title="`${clip.name} · ${clip.duration.toFixed(1)}s`"
              @pointerdown="startClipDrag($event, clip, 'move')"
              @contextmenu.prevent.stop="openClipMenu($event, clip)"
              @dblclick.stop="$emit('seek', clip.start)"
            >
              <span v-if="clipImage(clip)" class="clip-visual" aria-hidden="true">
                <img :src="clipImage(clip)" alt="" draggable="false" />
              </span>
              <span v-else class="clip-kind" aria-hidden="true">
                <svg v-if="clip.kind === 'audio'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                  <path d="M6 10v4M10 7.5v9M14 9v6M18 11v2" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
                  <path d="M10.4 9.6 15 12l-4.6 2.4z" fill="currentColor" stroke="none" />
                </svg>
              </span>
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
                v-if="selectedClipIds.length > 1 && isClipSelected(clip.id)"
                class="clip-select-order"
                aria-hidden="true"
              >{{ selectedOrder(clip.id) }}</span>
              <span
                class="clip-handle right"
                aria-hidden="true"
                @pointerdown.stop="startClipDrag($event, clip, 'right')"
              />
            </div>
          </div>

          <div v-if="marquee" class="tl-marquee" :style="marqueeStyle" aria-hidden="true" />
          <div ref="guideRef" class="tl-snap-guide" aria-hidden="true" />
          <div ref="playheadRef" class="tl-playhead">
            <span class="playhead-grip" @pointerdown.stop="startScrub" />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="clipMenu"
      class="tl-menu"
      :style="{ left: `${clipMenu.x}px`, top: `${clipMenu.y}px` }"
      role="menu"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <button v-if="clipMenu.clipId" type="button" role="menuitem" class="tl-menu-ai" @click="runMenu('ask-ai')">
        <span>发给 AI</span><kbd>⌘ ↵</kbd>
      </button>
      <button v-if="clipMenu.clipId" type="button" role="menuitem" @click="runMenu('inspector')">
        <span>查看属性</span>
      </button>
      <span v-if="clipMenu.clipId" class="tl-menu-sep" />
      <button v-if="clipMenu.clipId" type="button" role="menuitem" @click="runMenu('duplicate')">
        <span>复制片段</span><kbd>⌘D</kbd>
      </button>
      <button v-if="clipMenu.clipId" type="button" role="menuitem" @click="runMenu('split')">
        <span>在播放头分割</span><kbd>⌘B</kbd>
      </button>
      <button v-if="clipMenu.clipId" type="button" role="menuitem" class="danger" @click="runMenu('remove')">
        <span>删除片段</span><kbd>⌫</kbd>
      </button>
      <button v-if="!clipMenu.clipId" type="button" role="menuitem" @click="runMenu('select-all')">
        <span>全选片段</span><kbd>⌘A</kbd>
      </button>
      <button v-if="!clipMenu.clipId" type="button" role="menuitem" @click="runMenu('clear')">
        <span>取消选择</span>
      </button>
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
  type TimelineClip,
} from '@/types/edit'
import { projectDuration } from '@/stores/editProjectStore'
import { playhead } from '@/features/edit/playhead'
import { collectSnapTargets, resolveSnap } from '@/features/edit/timelineSnap'

const props = defineProps<{
  project: EditProject
  selectedClipId: string
  selectedClipIds: string[]
  /** 当前选中片段的修改意见，和右侧待发送区共用。 */
  note: string
  pxPerSec: number
  playing: boolean
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  (event: 'seek', time: number): void
  (event: 'select', payload: { ids: string[]; primary: string }): void
  (event: 'update:note', value: string): void
  (event: 'move-clip', payload: { clipId: string; start: number }): void
  (event: 'move-clips', payload: { ids: string[]; delta: number }): void
  (event: 'trim-clip', payload: { clipId: string; start: number; duration: number }): void
  (event: 'toggle-mute', trackId: string): void
  (event: 'add-asset', payload: { assetId: string; at: number; trackId: string }): void
  (event: 'split'): void
  (event: 'duplicate'): void
  (event: 'remove'): void
  (event: 'ask-ai'): void
  (event: 'inspector'): void
  (event: 'undo'): void
  (event: 'redo'): void
  (event: 'fit'): void
  (event: 'shortcuts'): void
  (event: 'update:pxPerSec', value: number): void
}>()

const scrollRef = ref<HTMLElement | null>(null)
const gutterInnerRef = ref<HTMLElement | null>(null)
const rulerRef = ref<HTMLElement | null>(null)
const guideRef = ref<HTMLElement | null>(null)
const playheadRef = ref<HTMLElement | null>(null)
const clipEls = new Map<string, HTMLElement>()
const contentRef = ref<HTMLElement | null>(null)

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
  /** 多选整体平移时的所有片段（含自己）；单选或裁剪时为 null。 */
  group: Array<{ id: string; el: HTMLElement | null; start: number; end: number }> | null
}

let dragState: DragState | null = null
let rafSeek = 0
let pendingSeek = 0
let resizeObserver: ResizeObserver | null = null

const duration = computed(() => projectDuration(props.project))

/**
 * 时间轴至少要铺满视口：否则缩小后内容会停在项目时长处，
 * 右侧留一大片空白，看起来像「后面的片段没渲染」。
 */
const spanSeconds = computed(() => {
  const fill = viewWidth.value > 0 ? viewWidth.value / props.pxPerSec : 0
  return Math.max(duration.value + 6, fill + 3, 12)
})
const totalWidth = computed(() =>
  Math.max(viewWidth.value, Math.ceil(spanSeconds.value * props.pxPerSec)),
)
const clipCount = computed(() =>
  props.project.tracks.reduce((count, track) => count + track.clips.length, 0),
)

interface MarqueeState {
  startX: number
  startY: number
  x: number
  y: number
  pointerId: number
  additive: boolean
  moved: boolean
}

const marquee = ref<MarqueeState | null>(null)

interface ClipMenuState {
  x: number
  y: number
  clipId: string | null
}

const clipMenu = ref<ClipMenuState | null>(null)

function openClipMenu(event: MouseEvent, clip: TimelineClip) {
  if (!isClipSelected(clip.id)) {
    emit('select', { ids: [clip.id], primary: clip.id })
  }
  clipMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - 196),
    y: Math.min(event.clientY, window.innerHeight - 224),
    clipId: clip.id,
  }
}

function openEmptyMenu(event: MouseEvent) {
  clipMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - 196),
    y: Math.min(event.clientY, window.innerHeight - 120),
    clipId: null,
  }
}

function runMenu(action: 'ask-ai' | 'inspector' | 'duplicate' | 'split' | 'remove' | 'select-all' | 'clear') {
  clipMenu.value = null
  if (action === 'ask-ai') emit('ask-ai')
  else if (action === 'inspector') emit('inspector')
  else if (action === 'duplicate') emit('duplicate')
  else if (action === 'split') emit('split')
  else if (action === 'remove') emit('remove')
  else if (action === 'clear') emit('select', { ids: [], primary: '' })
  else if (action === 'select-all') {
    const ids = orderedClipIds()
    emit('select', { ids, primary: ids[ids.length - 1] || '' })
  }
}

function closeClipMenu(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.tl-menu')) return
  clipMenu.value = null
}

function closeClipMenuOnKey(event: KeyboardEvent) {
  if (event.key === 'Escape') clipMenu.value = null
}

watch(clipMenu, (value) => {
  if (value) window.addEventListener('pointerdown', closeClipMenu, true)
  else window.removeEventListener('pointerdown', closeClipMenu, true)
})

const marqueeStyle = computed(() => {
  const state = marquee.value
  if (!state) return {}
  const left = Math.min(state.startX, state.x)
  const top = Math.min(state.startY, state.y)
  return {
    transform: `translate3d(${left}px, ${top}px, 0)`,
    width: `${Math.abs(state.x - state.startX)}px`,
    height: `${Math.abs(state.y - state.startY)}px`,
  }
})

const selectedSummary = computed(() => {
  const names = orderedClipIds()
    .filter((id) => props.selectedClipIds.includes(id))
    .map((id) => findClip(id)?.clip.name || '')
    .filter(Boolean)
  if (!names.length) return ''
  const shown = names.slice(0, 3).join('、')
  return names.length > 3 ? `${shown} 等 ${names.length} 段` : shown
})

const noteText = computed({
  get: () => props.note,
  set: (value: string) => emit('update:note', value),
})

/** 把当前选中的片段交给右侧待发送区，文字意见跟着一起带走。 */
function askAi() {
  emit('ask-ai')
}

function findClip(clipId: string): { track: EditTrack; clip: TimelineClip } | null {
  for (const track of props.project.tracks) {
    const clip = track.clips.find((item) => item.id === clipId)
    if (clip) return { track, clip }
  }
  return null
}

/** 按轨道顺序、再按起点排序，确保删掉 / 选中顺序稳定。 */
function orderedClipIds(): string[] {
  return props.project.tracks.flatMap((track) =>
    [...track.clips].sort((a, b) => a.start - b.start).map((clip) => clip.id),
  )
}

function isClipSelected(clipId: string): boolean {
  return props.selectedClipIds.includes(clipId)
}

function selectedOrder(clipId: string): number {
  return props.selectedClipIds.indexOf(clipId) + 1
}

function clipImage(clip: TimelineClip): string {
  if (clip.thumbnail) return clip.thumbnail
  return clip.kind === 'image' ? clip.url : ''
}

/** 单击 / ⌘ 单击 / Shift 单击的选择语义。 */
function selectClipFromClick(event: PointerEvent, clip: TimelineClip) {
  const current = props.selectedClipIds
  if (event.shiftKey) {
    const order = orderedClipIds()
    const anchor =
      props.selectedClipId && order.includes(props.selectedClipId)
        ? props.selectedClipId
        : clip.id
    const from = order.indexOf(anchor)
    const to = order.indexOf(clip.id)
    if (from < 0 || to < 0) {
      emit('select', { ids: [clip.id], primary: clip.id })
      return
    }
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1)
    const ids = event.metaKey || event.ctrlKey ? [...new Set([...current, ...range])] : range
    emit('select', { ids, primary: clip.id })
    return
  }
  if (event.metaKey || event.ctrlKey) {
    const ids = current.includes(clip.id)
      ? current.filter((id) => id !== clip.id)
      : [...current, clip.id]
    emit('select', {
      ids,
      primary: ids.includes(clip.id) ? clip.id : ids[ids.length - 1] || '',
    })
    return
  }
  emit('select', { ids: [clip.id], primary: clip.id })
}

/** 在空白轨道上拖拽框选；单击空白处则取消选择。 */
function startEmptySelect(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.tl-clip') || target?.closest('.tl-playhead')) return
  const content = contentRef.value
  if (!content) return
  event.preventDefault()
  const rect = content.getBoundingClientRect()
  const state: MarqueeState = {
    startX: event.clientX - rect.left,
    startY: event.clientY - rect.top,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pointerId: event.pointerId,
    additive: event.metaKey || event.ctrlKey || event.shiftKey,
    moved: false,
  }
  marquee.value = state
  const move = (pointer: PointerEvent) => {
    const current = marquee.value
    if (!current) return
    const nextRect = content.getBoundingClientRect()
    const x = pointer.clientX - nextRect.left
    const y = pointer.clientY - nextRect.top
    if (!current.moved && Math.abs(x - current.startX) + Math.abs(y - current.startY) > 4) {
      current.moved = true
    }
    marquee.value = { ...current, x, y }
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    const finished = marquee.value
    marquee.value = null
    if (!finished) return
    if (!finished.moved) {
      if (!finished.additive) emit('select', { ids: [], primary: '' })
      return
    }
    const contentRect = content.getBoundingClientRect()
    const left = contentRect.left + Math.min(finished.startX, finished.x)
    const right = contentRect.left + Math.max(finished.startX, finished.x)
    const top = contentRect.top + Math.min(finished.startY, finished.y)
    const bottom = contentRect.top + Math.max(finished.startY, finished.y)
    const hits = new Set<string>()
    for (const [id, el] of clipEls) {
      const box = el.getBoundingClientRect()
      if (box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom) {
        hits.add(id)
      }
    }
    const ids = orderedClipIds().filter((id) => hits.has(id))
    const merged = finished.additive
      ? [...new Set([...props.selectedClipIds, ...ids])]
      : ids
    emit('select', { ids: merged, primary: merged[merged.length - 1] || '' })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

const windowStart = computed(() => Math.max(0, scrollLeft.value / props.pxPerSec - 2))
const windowEnd = computed(() => (scrollLeft.value + viewWidth.value) / props.pxPerSec + 2)

const labelStep = computed(() => {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
  return steps.find((step) => step * props.pxPerSec >= 58) ?? 120
})

const ticks = computed(() => {
  const step = labelStep.value / 4
  const from = Math.max(0, Math.floor(windowStart.value / step) * step)
  const to = Math.min(spanSeconds.value, windowEnd.value + step)
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
  const seconds = total - minutes * 60
  const text = Number.isInteger(seconds)
    ? String(seconds).padStart(2, '0')
    : seconds.toFixed(1).padStart(minutes > 0 ? 4 : 3, '0')
  return minutes > 0 ? `${minutes}:${text}` : `${text}s`
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
  clipMenu.value = null
  scrollLeft.value = element.scrollLeft
  viewWidth.value = element.clientWidth
  // 轨道变多、时间轴变矮时，左侧轨道头跟着轨道一起纵向滚动。
  if (gutterInnerRef.value) {
    gutterInnerRef.value.style.transform = `translate3d(0, ${-element.scrollTop}px, 0)`
  }
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
  // ⌘ / Shift 单击只用来加选、连选，不进入拖动，避免刚选完就把选择打散。
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    selectClipFromClick(event, clip)
    return
  }
  if (!isClipSelected(clip.id)) {
    emit('select', { ids: [clip.id], primary: clip.id })
  }
  const groupIds =
    props.selectedClipIds.length > 1 && isClipSelected(clip.id)
      ? props.selectedClipIds
      : [clip.id]
  const group = mode === 'move' && groupIds.length > 1
    ? groupIds
        .map((id) => {
          const found = findClip(id)
          if (!found) return null
          return {
            id,
            el: clipEls.get(id) || null,
            start: found.clip.start,
            end: found.clip.start + found.clip.duration,
          }
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
    : null
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
      excludeClipIds: group ? group.map((item) => item.id) : undefined,
      playhead: playhead.value,
    }),
    preview: { start: clip.start, duration: clip.duration },
    moved: false,
    group: group && group.length > 1 ? group : null,
  }
  activeDrag.value = { clipId: clip.id, mode }
  clipMenu.value = null
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
    const rawStart = state.origStart + deltaTime
    if (state.group) {
      const minStart = Math.min(...state.group.map((item) => item.start))
      const maxEnd = Math.max(...state.group.map((item) => item.end))
      const delta = Math.max(-minStart, Math.min(MAX_PROJECT_SECONDS - maxEnd, rawStart - state.origStart))
      start = state.origStart + delta
    } else {
      start = Math.max(
        0,
        Math.min(MAX_PROJECT_SECONDS - state.origDuration, rawStart),
      )
    }
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
  } else if (state.group) {
    const minStart = Math.min(...state.group.map((item) => item.start))
    const maxEnd = Math.max(...state.group.map((item) => item.end))
    const delta = Math.max(-minStart, Math.min(MAX_PROJECT_SECONDS - maxEnd, start - state.origStart))
    start = state.origStart + delta
  }
  state.preview = { start, duration: length }

  const shift = (start - state.origStart) * px
  if (state.group && state.mode === 'move') {
    for (const item of state.group) {
      if (item.el?.isConnected) item.el.style.transform = `translate3d(${shift}px, 0, 0)`
    }
  } else {
    state.el.style.transform = `translate3d(${shift}px, 0, 0)`
  }
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
      if (state.group) {
        const delta = Math.round((state.preview.start - state.origStart) * 1000) / 1000
        emit('move-clips', { ids: state.group.map((item) => item.id), delta })
      } else {
        emit('move-clip', { clipId: state.clipId, start })
      }
    } else {
      emit('trim-clip', { clipId: state.clipId, start, duration: length })
    }
  }

  // 提交后 Vue 会把 left/width 补成最终值；这里等它补完再撤掉临时 transform，
  // 两件事在同一个 microtask 队列里完成，不会看到跳帧。
  void nextTick(() => {
    const elements = state.group
      ? state.group.map((item) => item.el).filter((item): item is HTMLElement => !!item)
      : [el]
    for (const element of elements) {
      if (!element.isConnected) continue
      element.style.transform = ''
      if (state.mode !== 'move') {
        element.style.width = `${Math.max(10, (state.moved ? length : state.origDuration) * state.pxPerSec)}px`
      }
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

watch(
  () => props.project.id,
  () => {
    if (scrollRef.value) scrollRef.value.scrollTop = 0
    nextTick(syncViewport)
  },
)

function handleDrop(event: DragEvent, trackId: string) {
  dropTrackId.value = ''
  const assetId = event.dataTransfer?.getData('application/onestep-asset') || ''
  if (!assetId) return
  const track = props.project.tracks.find((item) => item.id === trackId)
  if (!track) return
  const at = Math.round(timeFromClientX(event.clientX) * 10) / 10
  emit('add-asset', { assetId, at, trackId: track.id })
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
  window.addEventListener('keydown', closeClipMenuOnKey)
  void nextTick(paintPlayhead)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafSeek)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', closeClipMenuOnKey)
  window.removeEventListener('pointerdown', closeClipMenu, true)
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
  gap: 14px;
  height: 42px;
  flex: none;
  padding: 0 12px;
  border-bottom: 1px solid #f0f0ea;
  background: #fbfbf8;
}

.tl-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
  white-space: nowrap;
}

.tl-title strong {
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.tl-meta {
  overflow: hidden;
  color: #a3a39b;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
}

.tl-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.tl-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}

.tl-action svg {
  width: 13px;
  height: 13px;
  color: #8c8c84;
}

.tl-action:hover:not(:disabled) {
  border-color: #e6e6df;
  background: #ffffff;
  color: #111110;
}

.tl-action.danger:hover:not(:disabled) {
  border-color: #f0d9d4;
  background: #fdf7f5;
  color: #b4472f;
}

.tl-action.danger:hover:not(:disabled) svg {
  color: #b4472f;
}

.tl-action.ai:not(:disabled) {
  color: #a34a2f;
}

.tl-action.ai:not(:disabled) svg {
  color: #b4553a;
}

.tl-action.ai:hover:not(:disabled) {
  border-color: #eedcd3;
  background: #fdf6f2;
  color: #8f3d26;
}

.tl-action.ai:hover:not(:disabled) svg {
  color: #8f3d26;
}

.tl-action:disabled {
  opacity: 0.34;
  cursor: default;
}

.tl-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #6b6b63;
  cursor: pointer;
}

.tl-icon svg {
  width: 14px;
  height: 14px;
}

.tl-icon:hover:not(:disabled) {
  border-color: #e6e6df;
  background: #ffffff;
  color: #111110;
}

.tl-icon:disabled {
  opacity: 0.32;
  cursor: default;
}

.tl-divider {
  width: 1px;
  height: 15px;
  margin: 0 4px;
  background: #ecece6;
}

.tl-zoomgroup {
  display: inline-flex;
  align-items: center;
  height: 26px;
  border: 1px solid #e7e7e1;
  border-radius: 7px;
  background: #ffffff;
  overflow: hidden;
}

.tl-zoomstep {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #6b6b63;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.tl-zoomstep:hover {
  background: #f4f4ee;
  color: #111110;
}

.tl-zoom {
  min-width: 46px;
  color: #8c8c84;
  font-size: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.tl-fit {
  height: 26px;
  margin-left: 2px;
  padding: 0 9px;
  border: 1px solid #e7e7e1;
  border-radius: 7px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.tl-fit:hover {
  border-color: #cfcfc7;
  color: #111110;
}

.tl-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.tl-selectbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  flex: none;
  min-height: 34px;
  padding: 5px 12px;
  border-bottom: 1px solid #f0e6e0;
  background: #fdf8f5;
}

.tl-selectsummary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 34%;
}

.tl-selectnote {
  flex: 1 1 160px;
  min-width: 110px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid #ecdbd2;
  border-radius: 6px;
  background: #ffffff;
  color: #3d2b23;
  font-family: inherit;
  font-size: 10.5px;
  outline: none;
}

.tl-selectnote::placeholder {
  color: #b39d92;
}

.tl-selectnote:focus {
  border-color: #c98a72;
  box-shadow: 0 0 0 2px rgba(180, 85, 58, 0.1);
}

.tl-selectactions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  margin-left: auto;
}

.tl-selectcount {
  flex: none;
  color: #9c4a30;
  font-size: 10.5px;
  font-weight: 650;
  white-space: nowrap;
}

.tl-selectnames {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #8f7d74;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-selectprops {
  flex: none;
  height: 23px;
  padding: 0 7px;
  border: 1px solid #e7d9d2;
  border-radius: 6px;
  background: #ffffff;
  color: #8f6f62;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.tl-selectprops:hover {
  border-color: #cdb6ab;
  color: #6c4b3f;
}

.tl-selectask {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 23px;
  padding: 0 8px;
  border: 1px solid #c98a72;
  border-radius: 6px;
  background: #b4553a;
  color: #fffaf7;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.tl-selectask:hover {
  background: #a34a2f;
}

.tl-selectask kbd {
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.16);
  font-family: inherit;
  font-size: 8.5px;
  font-weight: 500;
}

.tl-selectclear {
  flex: none;
  height: 23px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #9b8379;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.tl-selectclear:hover {
  border-color: #e8d9d1;
  color: #6c4b3f;
}

.tl-gutter {
  width: 116px;
  flex: none;
  overflow: hidden;
  border-right: 1px solid #f0f0ea;
  background: #fbfbf8;
}

.tl-gutter-ruler {
  height: 26px;
  border-bottom: 1px solid #f0f0ea;
  background: #fbfbf8;
}

/* 轨道头的纵向位置由滚动容器同步，和右侧轨道保持对齐。 */
.tl-gutter-inner {
  will-change: transform;
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
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.tl-content {
  position: relative;
  min-height: 100%;
}

.tl-ruler {
  position: sticky;
  top: 0;
  z-index: 3;
  height: 26px;
  border-bottom: 1px solid #f0f0ea;
  background: #fbfbf8;
  cursor: ew-resize;
  touch-action: none;
}

/*
 * 刻度只在标尺底部画短竖线，数字统一放在上方。
 * 之前的整列竖线会直接穿过秒数文字，读起来像是被划掉了。
 */
.tl-tick {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 4px;
  background: #ebebe4;
  pointer-events: none;
}

.tl-tick.major {
  height: 8px;
  background: #d9d9d0;
}

.tl-tick em {
  position: absolute;
  bottom: 9px;
  left: 7px;
  padding: 0 2px;
  background: #fbfbf8;
  color: #a2a29a;
  font-size: 9.5px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
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

.tl-clip.is-primary.is-selected {
  border-color: #b4553a;
  box-shadow: 0 0 0 1px #b4553a, 0 2px 8px rgba(180, 85, 58, 0.16);
}

.tl-clip.is-selected.is-dragging {
  box-shadow: 0 6px 18px rgba(17, 17, 16, 0.2);
}

.clip-visual {
  width: 30px;
  flex: none;
  overflow: hidden;
  border-right: 1px solid rgba(17, 17, 16, 0.08);
  background: #eeeee8;
}

.clip-visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.92;
  pointer-events: none;
}

.clip-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  flex: none;
  color: #a8a8a0;
  pointer-events: none;
}

.clip-kind svg {
  width: 12px;
  height: 12px;
}

.clip-select-order {
  position: absolute;
  top: 3px;
  right: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 0 3px;
  border-radius: 4px;
  background: #b4553a;
  color: #fffaf7;
  font-size: 8px;
  font-weight: 650;
  line-height: 1;
  pointer-events: none;
}

.tl-marquee {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 7;
  border: 1px solid rgba(180, 85, 58, 0.7);
  border-radius: 3px;
  background: rgba(180, 85, 58, 0.08);
  pointer-events: none;
}

.tl-menu {
  position: fixed;
  z-index: 40;
  display: flex;
  flex-direction: column;
  min-width: 178px;
  padding: 4px;
  border: 1px solid #e9e4de;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 30px rgba(38, 28, 22, 0.15);
  backdrop-filter: blur(8px);
}

.tl-menu button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #5f5f57;
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.tl-menu button:hover {
  background: #f7f4f0;
  color: #1d1d1b;
}

.tl-menu button.danger:hover {
  background: #fdf4f1;
  color: #b4472f;
}

.tl-menu button.tl-menu-ai {
  color: #9c4a30;
  font-weight: 600;
}

.tl-menu button.tl-menu-ai:hover {
  background: #fdf4f0;
  color: #8f3d26;
}

.tl-menu kbd {
  padding: 0 3px;
  border-radius: 3px;
  background: #f4f1ec;
  color: #a39a92;
  font-family: inherit;
  font-size: 8.5px;
}

.tl-menu-sep {
  height: 1px;
  margin: 3px 4px;
  background: #f0ece7;
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
@media (max-width: 700px) {
  .tl-action-label,
  .tl-meta {
    display: none;
  }
  .tl-head {
    gap: 8px;
    padding: 0 8px;
  }
  .tl-actions {
    gap: 0;
  }
  .tl-action {
    padding: 0 6px;
  }
  .tl-divider {
    margin: 0 2px;
  }
  .tl-scroll {
    touch-action: pan-x;
  }
  .tl-selectbar {
    height: 30px;
    padding: 0 8px;
    gap: 6px;
  }
  .tl-selectnames,
  .tl-selectask kbd {
    display: none;
  }
  .tl-selectcount {
    flex: 1;
  }
}
</style>
