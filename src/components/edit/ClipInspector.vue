<template>
  <aside class="clip-inspector" aria-label="片段检查器">
    <header class="ci-head">
      <div class="ci-title">
        <strong>检查器</strong>
        <span v-if="entries.length > 1">已选 {{ entries.length }} 段</span>
        <span v-else-if="selectedMotionElements?.length">{{ selectedMotionElements.length }} 个元素 · {{ primary.trackName }}</span>
        <span v-else>{{ kindLabel(primary.clip.kind) }} · {{ primary.trackName }}</span>
      </div>
      <button type="button" class="ci-close" aria-label="关闭检查器" @click="$emit('close')">×</button>
    </header>

    <div class="ci-body">
      <div class="ci-hero">
        <img v-if="thumbOf(primary.clip)" :src="thumbOf(primary.clip)" alt="" />
        <span v-else class="ci-hero-fallback">
          <svg v-if="primary.clip.kind === 'audio'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M5.5 10v4M9.2 7.5v9M13 9v6M16.8 11v2" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
            <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
            <path d="M10.4 9.6 15 12l-4.6 2.4z" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div class="ci-hero-copy">
          <input
            v-if="entries.length === 1"
            class="ci-name-input"
            :value="primary.clip.name"
            aria-label="片段名称"
            @change="renameClip"
            @keydown.enter="blurTarget"
          />
          <strong v-else>多片段编辑</strong>
          <small>{{ formatRange(primary.clip.start, primary.clip.duration) }} · {{ primary.clip.duration.toFixed(1) }}s</small>
        </div>
      </div>

      <div v-if="entries.length === 1" class="ci-row">
        <label class="ci-field">
          <span>起点</span>
          <input
            type="number"
            min="0"
            step="0.1"
            :value="round1(primary.clip.start)"
            @change="commitNumber($event, 'start')"
          />
        </label>
        <label class="ci-field">
          <span>时长</span>
          <input
            type="number"
            min="0.4"
            step="0.1"
            :value="round1(primary.clip.duration)"
            @change="commitNumber($event, 'duration')"
          />
        </label>
      </div>

      <div v-else class="ci-list" aria-label="选中的片段">
        <div v-for="entry in entries" :key="entry.clip.id" class="ci-list-item">
          <img v-if="thumbOf(entry.clip)" :src="thumbOf(entry.clip)" alt="" />
          <span v-else class="ci-list-icon">{{ kindShort(entry.clip.kind) }}</span>
          <span class="ci-list-copy">
            <strong>{{ entry.clip.name }}</strong>
            <small>{{ formatRange(entry.clip.start, entry.clip.duration) }}</small>
          </span>
        </div>
      </div>

      <label v-if="hasAudio" class="ci-slider">
        <span class="ci-slider-label">音量 <em>{{ volumePercent }}</em></span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="volumePercent"
          @change="commitPercent($event, 'volume')"
        />
      </label>

      <label v-if="hasVisual" class="ci-slider">
        <span class="ci-slider-label">不透明度 <em>{{ opacityPercent }}</em></span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="opacityPercent"
          @change="commitPercent($event, 'opacity')"
        />
      </label>

      <div class="ci-meta">
        <span>轨道 <b>{{ primary.trackName }}</b></span>
        <span>类型 <b>{{ kindLabel(primary.clip.kind) }}</b></span>
        <span v-if="primary.clip.trimStart">源内起点 <b>{{ primary.clip.trimStart.toFixed(1) }}s</b></span>
      </div>

      <div class="ci-actions">
        <button type="button" class="ci-ask" @click="$emit('ask-ai')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3.6 13.7 9l5.4 1.7-5.4 1.7L12 17.8l-1.7-5.4L4.9 10.7 10.3 9z" />
            <path d="M18.4 15.6 19 17.4l1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" />
          </svg>
          发给 AI 修改
        </button>
        <div class="ci-subactions">
          <button type="button" @click="$emit('duplicate')">复制</button>
          <button type="button" @click="$emit('split')">分割</button>
          <button type="button" class="danger" @click="$emit('remove')">删除</button>
        </div>
      </div>

      <template v-if="entries.length === 1">
        <KeyframeEditor
          v-if="hasAudio"
          :project-id="projectId"
          :clip="primary.clip"
          property="volume"
        />
        <KeyframeEditor
          v-if="hasVisual"
          :project-id="projectId"
          :clip="primary.clip"
          property="opacity"
        />
      </template>

      <MotionInspector
        v-if="entries.length === 1 && primary.clip.kind === 'motion' && primary.clip.motionId"
        :project-id="projectId"
        :clip="primary.clip"
        @select-elements="$emit('select-elements', { clipId: primary.clip.id, elements: $event.elements, mode: 'replace' })"
      />

      <div v-if="selectedMotionElements?.length" class="ci-elements">
        <strong>已选中 {{ selectedMotionElements.length }} 个元素</strong>
        <ul>
          <li v-for="element in selectedMotionElements" :key="element.selector">
            <span>{{ element.label }}</span>
            <small>{{ element.sectionLabel || '当前画面' }}{{ element.region ? ` · ${element.region}` : '' }}</small>
          </li>
        </ul>
        <p>可以直接删除、改文字或拖动位置；写清要求再发给 AI，只会改这些元素。</p>
      </div>

      <p class="ci-hint">
        发给 AI 会把这 {{ entries.length }} 段加入右侧待发送区，只带时间、素材和参数；可以继续选其他片段，最后统一发送。
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MotionInspector from '@/components/edit/MotionInspector.vue'
import KeyframeEditor from '@/components/edit/KeyframeEditor.vue'
import type { EditTrackKind, TimelineClip } from '@/types/edit'
import type { AgentMotionElementRef } from '@/types/agent'

interface InspectorEntry {
  clip: TimelineClip
  trackId: string
  trackName: string
  trackKind: EditTrackKind
}

const props = defineProps<{
  entries: InspectorEntry[]
  projectId: string
  /** 主画面选中的元素：检查器显示当前选择和可直接操作项。 */
  selectedMotionElements?: AgentMotionElementRef[]
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'ask-ai'): void
  (event: 'select-elements', payload: { clipId: string; elements: AgentMotionElementRef[]; mode: 'replace' | 'add' | 'toggle' }): void
  (event: 'duplicate'): void
  (event: 'split'): void
  (event: 'remove'): void
  (
    event: 'update-clip',
    payload: {
      ids: string[]
      patch: Partial<Pick<TimelineClip, 'start' | 'duration' | 'volume' | 'opacity' | 'name'>>
    },
  ): void
}>()

const primary = computed(() => props.entries[0])
const ids = computed(() => props.entries.map((entry) => entry.clip.id))
const hasAudio = computed(() =>
  props.entries.every((entry) => entry.clip.kind === 'audio' || entry.clip.kind === 'video' || entry.clip.kind === 'motion'),
)
const hasVisual = computed(() =>
  props.entries.every((entry) => entry.clip.kind !== 'audio'),
)

const volumePercent = computed(() => {
  const values = props.entries.map((entry) => entry.clip.volume)
  const known = values.filter((value): value is number => typeof value === 'number')
  const value = known.length ? known[0] : 1
  return Math.round(Math.max(0, Math.min(1, value)) * 100)
})

const opacityPercent = computed(() => {
  const values = props.entries.map((entry) => entry.clip.opacity)
  const known = values.filter((value): value is number => typeof value === 'number')
  const value = known.length ? known[0] : 1
  return Math.round(Math.max(0, Math.min(1, value)) * 100)
})

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function formatRange(start: number, duration: number): string {
  return `${start.toFixed(1)}s → ${(start + duration).toFixed(1)}s`
}

function kindLabel(kind: TimelineClip['kind']): string {
  if (kind === 'motion') return '动效工程'
  return kind === 'audio' ? '音频' : kind === 'image' ? '图片' : kind === 'animation' ? '代码动画' : '视频'
}

function kindShort(kind: TimelineClip['kind']): string {
  if (kind === 'motion') return '动'
  return kind === 'audio' ? '音' : kind === 'image' ? '图' : kind === 'animation' ? '码' : '视'
}

function thumbOf(clip: TimelineClip): string {
  if (clip.thumbnail) return clip.thumbnail
  return clip.kind === 'image' ? clip.url : ''
}

function renameClip(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  if (!value || value === primary.value.clip.name) return
  emit('update-clip', { ids: ids.value, patch: { name: value } })
}

function commitNumber(event: Event, field: 'start' | 'duration') {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return
  emit('update-clip', { ids: ids.value, patch: { [field]: Math.max(0, raw) } })
}

function commitPercent(event: Event, field: 'volume' | 'opacity') {
  const raw = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(raw)) return
  emit('update-clip', {
    ids: ids.value,
    patch: { [field]: Math.max(0, Math.min(1, raw / 100)) },
  })
}

function blurTarget(event: KeyboardEvent) {
  ;(event.target as HTMLInputElement | null)?.blur()
}
</script>

<style scoped>
.clip-inspector {
  position: relative;
  z-index: 12;
  display: flex;
  flex-direction: column;
  width: 254px;
  flex: none;
  align-self: stretch;
  margin: 10px 14px 8px 0;
  border: 1px solid var(--sf-line-soft);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 8px 22px rgba(38, 28, 22, 0.08);
  overflow: hidden;
}

.ci-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  padding: 9px 10px 9px 12px;
  border-bottom: 1px solid #f1eeea;
}

.ci-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.ci-title strong {
  color: var(--sf-ink);
  font-size: 11.5px;
  font-weight: 650;
}

.ci-title span {
  overflow: hidden;
  color: var(--sf-ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-close {
  width: 22px;
  height: 22px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-ink-3);
  font-family: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.ci-close:hover {
  background: #f4f2ee;
  color: var(--sf-ink);
}

.ci-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
}

.ci-hero {
  display: flex;
  align-items: center;
  gap: 9px;
}

.ci-hero img,
.ci-hero-fallback {
  width: 52px;
  height: 36px;
  flex: none;
  border: 1px solid #eeeae5;
  border-radius: 7px;
  background: #f7f5f1;
  object-fit: cover;
}

.ci-hero-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b2aaa2;
}

.ci-hero-fallback svg {
  width: 16px;
  height: 16px;
}

.ci-hero-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ci-hero-copy strong {
  color: var(--sf-ink);
  font-size: 11.5px;
  font-weight: 600;
}

.ci-hero-copy small {
  color: var(--sf-ink-3);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.ci-name-input {
  width: 100%;
  padding: 2px 5px;
  margin-left: -5px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--sf-ink);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  outline: none;
}

.ci-name-input:hover,
.ci-name-input:focus {
  border-color: #e8e2db;
  background: #fbf9f6;
}

.ci-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.ci-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #9a928a;
  font-size: 9.5px;
}

.ci-field input {
  width: 100%;
  height: 27px;
  padding: 0 7px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 6px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font-family: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.ci-field input:focus {
  border-color: #c9a595;
  box-shadow: 0 0 0 2px rgba(180, 85, 58, 0.09);
}

.ci-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 132px;
  overflow-y: auto;
  padding: 3px;
  border: 1px solid var(--sf-surface-3);
  border-radius: 8px;
  background: #fcfaf7;
}

.ci-list-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 4px;
  border-radius: 5px;
}

.ci-list-item img,
.ci-list-icon {
  width: 28px;
  height: 20px;
  flex: none;
  border-radius: 4px;
  background: #eeebe6;
  object-fit: cover;
}

.ci-list-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #a49a91;
  font-size: 9px;
}

.ci-list-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ci-list-copy strong {
  overflow: hidden;
  color: var(--sf-ink-2);
  font-size: 10px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-list-copy small {
  color: var(--sf-ink-3);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.ci-slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ci-slider-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8c847c;
  font-size: 9.5px;
}

.ci-slider-label em {
  color: #6b635c;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.ci-slider input {
  width: 100%;
  height: 4px;
  accent-color: var(--sf-terra);
}

.ci-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 7px 8px;
  border: 1px solid #f2eee9;
  border-radius: 7px;
  background: #fcfbf9;
  color: #a39a92;
  font-size: 9px;
}

.ci-meta b {
  color: #6b635c;
  font-weight: 550;
}

.ci-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding-top: 3px;
}

.ci-ask {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 31px;
  border: 1px solid var(--sf-terra);
  border-radius: 7px;
  background: var(--sf-terra);
  color: var(--sf-surface);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.ci-ask:hover {
  background: #a34a2f;
}

.ci-ask svg {
  width: 14px;
  height: 14px;
}

.ci-subactions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

.ci-subactions button {
  height: 26px;
  padding: 0;
  border: 1px solid var(--sf-line-soft);
  border-radius: 6px;
  background: var(--sf-surface);
  color: #6b635c;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.ci-subactions button:hover {
  border-color: #d5cdc5;
  color: var(--sf-ink);
}

.ci-subactions button.danger:hover {
  border-color: #efd7d1;
  background: #fdf7f5;
  color: var(--sf-terra);
}

.ci-hint {
  margin: 0;
  color: var(--sf-ink-4);
  font-size: 9px;
  line-height: 1.55;
}

.ci-elements {
  margin: 8px 0;
  padding: 7px 8px;
  border: 1px solid #f0e3dc;
  border-radius: 7px;
  background: var(--sf-terra-wash);
}

.ci-elements strong {
  display: block;
  margin-bottom: 4px;
  color: var(--sf-terra-strong);
  font-size: 9.5px;
  font-weight: 600;
}

.ci-elements ul {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ci-elements li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.ci-elements li span {
  overflow: hidden;
  color: var(--sf-ink-2);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-elements li small {
  flex: none;
  color: var(--sf-ink-4);
  font-size: 8.5px;
}

.ci-elements p {
  margin: 5px 0 0;
  color: var(--sf-ink-3);
  font-size: 8.5px;
  line-height: 1.45;
}

@media (max-width: 1360px) {
  .clip-inspector {
    position: absolute;
    top: 10px;
    right: 10px;
    bottom: 10px;
    width: 240px;
    margin: 0;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 14px 34px rgba(38, 28, 22, 0.13);
    backdrop-filter: blur(8px);
  }
}

@media (max-width: 700px) {
  .clip-inspector {
    top: auto;
    left: 8px;
    right: 8px;
    bottom: 8px;
    width: auto;
    max-height: 62%;
    box-shadow: 0 18px 42px rgba(28, 20, 15, 0.24);
  }
  .ci-hint {
    display: none;
  }
}
</style>
