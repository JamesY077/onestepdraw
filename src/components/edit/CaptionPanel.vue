<template>
  <div class="captions">
    <div class="caption-create">
      <textarea v-model="draft" rows="3" maxlength="500" placeholder="输入一句字幕…" @keydown.meta.enter.prevent="add" @keydown.ctrl.enter.prevent="add" />
      <div class="caption-create-meta">
        <span>从 {{ playhead.toFixed(1) }}s 开始 · 默认 3 秒</span>
        <button type="button" :disabled="!draft.trim()" @click="add">添加字幕</button>
      </div>
    </div>

    <p v-if="!project.captions?.length" class="caption-empty">
      字幕会叠加在预览画面上，并在导出 MP4 时烧录进视频。无需调用生成服务。
    </p>

    <article v-for="(cue, index) in project.captions" :key="cue.id" class="caption-cue" :class="{ active: isActive(cue) }">
      <header>
        <button type="button" class="caption-index" title="跳到字幕开始" @click="seek(cue.start)">{{ index + 1 }}</button>
        <span>{{ cue.start.toFixed(1) }}s → {{ (cue.start + cue.duration).toFixed(1) }}s</span>
        <button type="button" class="caption-delete" aria-label="删除字幕" @click="store.removeCaption(project.id, cue.id)">×</button>
      </header>
      <textarea :value="cue.text" rows="2" maxlength="500" @change="updateText(cue, $event)" />
      <div class="caption-times">
        <label>开始<input type="number" min="0" step="0.1" :value="cue.start" @change="updateNumber(cue, 'start', $event)" /></label>
        <label>时长<input type="number" min="0.4" step="0.1" :value="cue.duration" @change="updateNumber(cue, 'duration', $event)" /></label>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { playhead } from '@/features/edit/playhead'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { CaptionCue, EditProject } from '@/types/edit'

const props = defineProps<{ project: EditProject }>()
const store = useEditProjectStore()
const draft = ref('')

function add() {
  if (!draft.value.trim()) return
  store.addCaption(props.project.id, { text: draft.value, start: playhead.value, duration: 3 })
  draft.value = ''
}
function seek(time: number) {
  playhead.value = time
}
function isActive(cue: CaptionCue): boolean {
  return playhead.value >= cue.start && playhead.value < cue.start + cue.duration
}
function updateText(cue: CaptionCue, event: Event) {
  store.updateCaption(props.project.id, cue.id, { text: (event.target as HTMLTextAreaElement).value })
}
function updateNumber(cue: CaptionCue, field: 'start' | 'duration', event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) store.updateCaption(props.project.id, cue.id, { [field]: value })
}
</script>

<style scoped>
.captions { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; gap: 9px; padding: 8px; scrollbar-width: thin; }
.caption-create { padding: 9px; border: 1px solid #eadfd7; border-radius: 9px; background: #fffaf7; }
.caption-create textarea, .caption-cue textarea { box-sizing: border-box; width: 100%; min-width: 0; resize: vertical; border: 0; outline: none; background: transparent; color: #40352f; font-family: inherit; font-size: 11px; line-height: 1.6; }
.caption-create-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px; }
.caption-create-meta span { color: #a3948a; font-size: 8.5px; }
.caption-create-meta button { flex: none; padding: 5px 8px; border: 0; border-radius: 6px; background: #b45f3c; color: #fff; font-size: 9.5px; cursor: pointer; }
.caption-create-meta button:disabled { opacity: 0.45; }
.caption-empty { margin: 3px 2px; color: #a3948a; font-size: 10px; line-height: 1.7; }
.caption-cue { padding: 8px; border: 1px solid #eee5df; border-radius: 9px; background: #fff; }
.caption-cue.active { border-color: #c98e73; box-shadow: 0 0 0 2px rgba(180, 95, 60, 0.07); }
.caption-cue header { display: flex; align-items: center; gap: 6px; color: #9d8e84; font-size: 9px; }
.caption-index { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 5px; background: #f4ece6; color: #9c4f31; font-size: 9px; cursor: pointer; }
.caption-delete { margin-left: auto; padding: 0 3px; border: 0; background: transparent; color: #b2a39a; font-size: 15px; cursor: pointer; }
.caption-cue textarea { margin: 5px 0; padding: 4px 0; border-top: 1px solid #f5f0ec; border-bottom: 1px solid #f5f0ec; }
.caption-times { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.caption-times label { display: flex; min-width: 0; align-items: center; gap: 4px; color: #aa9b91; font-size: 8.5px; }
.caption-times input { flex: 1 1 0; width: auto; min-width: 0; height: 23px; padding: 0 5px; border: 1px solid #eee4dd; border-radius: 5px; color: #5d4d43; font-size: 9px; }
</style>
