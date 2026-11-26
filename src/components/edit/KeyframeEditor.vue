<template>
  <section class="kf" :aria-label="`${label}关键帧曲线`">
    <header class="kf-head">
      <strong>{{ label }}曲线</strong>
      <span>{{ points.length }} 个关键帧</span>
    </header>

    <div class="kf-chart">
      <svg viewBox="0 0 220 72" role="img" :aria-label="`${label}随时间变化曲线`">
        <path class="kf-grid" d="M8 8H212M8 34H212M8 60H212" />
        <path v-if="points.length > 1" class="kf-line" :d="curvePath" />
        <line class="kf-playhead" :x1="playheadX" :x2="playheadX" y1="5" y2="63" />
        <circle
          v-for="point in points"
          :key="point.id"
          class="kf-point"
          :class="{ active: point.id === selectedId }"
          :cx="pointX(point.time)"
          :cy="pointY(point.value)"
          r="4"
          tabindex="0"
          role="button"
          :aria-label="`${point.time.toFixed(2)} 秒，${Math.round(point.value * 100)}%`"
          @click="selectedId = point.id"
          @keydown.enter="selectedId = point.id"
        />
      </svg>
      <span class="kf-current">{{ Math.round(currentValue * 100) }}%</span>
    </div>

    <div class="kf-actions">
      <button type="button" @click="addAtPlayhead">＋ 播放头处</button>
      <button type="button" :disabled="!selected" @click="removeSelected">删除点</button>
      <button type="button" :disabled="!points.length" @click="commit([])">清除</button>
    </div>

    <template v-if="selected">
      <div class="kf-fields">
        <label>时间（秒）<input type="number" min="0" :max="clip.duration" step="0.05" :value="selected.time" @change="updateTime" /></label>
        <label>数值（%）<input type="number" min="0" max="100" step="1" :value="Math.round(selected.value * 100)" @change="updateValue" /></label>
      </div>
      <label class="kf-easing">到下一曲线
        <select :value="selected.easing" @change="updateEasing">
          <option value="linear">线性</option>
          <option value="ease-in">缓入</option>
          <option value="ease-out">缓出</option>
          <option value="ease-in-out">缓入缓出</option>
        </select>
      </label>
    </template>
    <p v-else class="kf-hint">把播放头移入片段，添加关键帧；点击曲线上的点可精调时间和数值。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { playhead } from '@/features/edit/playhead'
import { easedProgress, sampleKeyframes } from '@/features/edit/keyframes'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { ClipKeyframe, KeyframeEasing, TimelineClip } from '@/types/edit'

const props = defineProps<{
  projectId: string
  clip: TimelineClip
  property: 'volume' | 'opacity'
}>()

const store = useEditProjectStore()
const selectedId = ref('')
const label = computed(() => props.property === 'volume' ? '音量' : '不透明度')
const points = computed(() => [...(props.property === 'volume'
  ? props.clip.volumeKeyframes || []
  : props.clip.opacityKeyframes || [])].sort((a, b) => a.time - b.time))
const selected = computed(() => points.value.find((point) => point.id === selectedId.value) || null)
const localTime = computed(() => Math.max(0, Math.min(props.clip.duration, playhead.value - props.clip.start)))
const fallback = computed(() => (props.property === 'volume' ? props.clip.volume : props.clip.opacity) ?? 1)
const currentValue = computed(() => sampleKeyframes(points.value, localTime.value, fallback.value))

watch(() => props.clip.id, () => { selectedId.value = '' })
watch(points, (value) => {
  if (selectedId.value && !value.some((point) => point.id === selectedId.value)) selectedId.value = ''
})

function pointX(time: number): number {
  return 8 + (time / Math.max(0.001, props.clip.duration)) * 204
}
function pointY(value: number): number {
  return 60 - value * 52
}
const playheadX = computed(() => pointX(localTime.value))
const curvePath = computed(() => {
  if (points.value.length < 2) return ''
  const coordinates: string[] = []
  for (let index = 0; index < points.value.length - 1; index += 1) {
    const from = points.value[index]
    const to = points.value[index + 1]
    for (let step = 0; step <= 16; step += 1) {
      if (index > 0 && step === 0) continue
      const t = step / 16
      const value = from.value + (to.value - from.value) * easedProgress(t, from.easing)
      const time = from.time + (to.time - from.time) * t
      coordinates.push(`${coordinates.length ? 'L' : 'M'}${pointX(time).toFixed(2)} ${pointY(value).toFixed(2)}`)
    }
  }
  return coordinates.join(' ')
})

function commit(next: ClipKeyframe[]) {
  store.updateClipKeyframes(props.projectId, props.clip.id, props.property, next)
}

function addAtPlayhead() {
  const existing = points.value.find((point) => Math.abs(point.time - localTime.value) < 0.025)
  if (existing) {
    selectedId.value = existing.id
    return
  }
  const next = [...points.value]
  if (!next.length && localTime.value > 0.025) {
    next.push({ id: crypto.randomUUID(), time: 0, value: fallback.value, easing: 'linear' })
  }
  const point: ClipKeyframe = {
    id: crypto.randomUUID(),
    time: localTime.value,
    value: currentValue.value,
    easing: 'linear',
  }
  next.push(point)
  commit(next)
  selectedId.value = point.id
}

function patchSelected(patch: Partial<ClipKeyframe>) {
  if (!selected.value) return
  commit(points.value.map((point) => point.id === selectedId.value ? { ...point, ...patch } : point))
}
function updateTime(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) patchSelected({ time: Math.max(0, Math.min(props.clip.duration, value)) })
}
function updateValue(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) patchSelected({ value: Math.max(0, Math.min(1, value / 100)) })
}
function updateEasing(event: Event) {
  patchSelected({ easing: (event.target as HTMLSelectElement).value as KeyframeEasing })
}
function removeSelected() {
  if (!selected.value) return
  commit(points.value.filter((point) => point.id !== selectedId.value))
}
</script>

<style scoped>
.kf { display: flex; flex-direction: column; gap: 7px; padding-top: 10px; border-top: 1px solid #f0e8e2; }
.kf-head { display: flex; align-items: center; justify-content: space-between; }
.kf-head strong { color: #4c413a; font-size: 11px; }
.kf-head span { color: #a3948a; font-size: 9.5px; }
.kf-chart { position: relative; padding: 3px; border: 1px solid #eee4dc; border-radius: 8px; background: #fffaf7; }
.kf-chart svg { display: block; width: 100%; height: 74px; overflow: visible; }
.kf-grid { fill: none; stroke: #eee5de; stroke-width: 1; }
.kf-line { fill: none; stroke: #b45f3c; stroke-width: 2; }
.kf-playhead { stroke: #c9a595; stroke-width: 1; stroke-dasharray: 2 2; pointer-events: none; }
.kf-point { fill: #fff; stroke: #a85435; stroke-width: 2; cursor: pointer; outline: none; }
.kf-point.active, .kf-point:focus { fill: #b45f3c; stroke: #fff; filter: drop-shadow(0 0 1px #8d4229); }
.kf-current { position: absolute; top: 7px; right: 8px; color: #9c4f31; font: 9px ui-monospace, monospace; }
.kf-actions { display: flex; gap: 5px; }
.kf-actions button { padding: 4px 7px; border: 1px solid #e8dcd4; border-radius: 6px; background: #fff; color: #795e50; font-size: 9.5px; cursor: pointer; }
.kf-actions button:disabled { opacity: 0.4; cursor: default; }
.kf-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.kf-fields label, .kf-easing { display: flex; flex-direction: column; gap: 3px; color: #9a8a80; font-size: 9.5px; }
.kf-fields input, .kf-easing select { width: 100%; height: 26px; padding: 0 6px; border: 1px solid #e8ded7; border-radius: 6px; background: #fff; color: #4c413a; font-size: 10px; }
.kf-hint { margin: 0; color: #a3948a; font-size: 9.5px; line-height: 1.5; }
</style>
