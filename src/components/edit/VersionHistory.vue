<template>
  <div class="versions-backdrop" @click.self="$emit('close')">
    <section class="versions" role="dialog" aria-modal="true" aria-label="项目版本对比">
      <header class="versions-head">
        <div><strong>版本对比</strong><p>保存命名快照，对照结构差异；恢复后仍可用撤销回到当前状态。</p></div>
        <button type="button" aria-label="关闭版本对比" @click="$emit('close')">×</button>
      </header>

      <div class="versions-body">
        <aside class="version-list">
          <div class="version-save">
            <input v-model="label" maxlength="60" placeholder="例如：确认文案前" @keydown.enter="save" />
            <button type="button" @click="save">保存当前</button>
          </div>
          <p v-if="!project.versions?.length" class="version-empty">还没有命名版本。先保存一个快照，再继续修改即可对比。</p>
          <button
            v-for="version in project.versions"
            :key="version.id"
            type="button"
            class="version-item"
            :class="{ active: selectedId === version.id }"
            @click="select(version.id)"
          >
            <strong>{{ version.label }}</strong>
            <span>{{ formatDate(version.createdAt) }} · {{ clipCount(version.snapshot) }} 段</span>
          </button>
        </aside>

        <main v-if="selected" class="version-diff">
          <div class="version-columns">
            <section><span>当前项目</span><strong>{{ project.name }}</strong><small>{{ project.aspectRatio }} · {{ project.resolution }} · {{ project.fps }}fps</small><small>{{ currentClips.length }} 段 · {{ project.captions?.length || 0 }} 条字幕</small></section>
            <section><span>所选版本</span><strong>{{ selected.label }}</strong><small>{{ selected.snapshot.aspectRatio }} · {{ selected.snapshot.resolution }} · {{ selected.snapshot.fps }}fps</small><small>{{ clipCount(selected.snapshot) }} 段 · {{ selected.snapshot.captions.length }} 条字幕</small></section>
          </div>

          <div class="diff-summary">
            <span class="added">新增 {{ changes.filter((item) => item.kind === 'added').length }}</span>
            <span class="removed">移除 {{ changes.filter((item) => item.kind === 'removed').length }}</span>
            <span class="changed">修改 {{ changes.filter((item) => item.kind === 'changed').length }}</span>
          </div>
          <ul v-if="changes.length" class="diff-list">
            <li v-for="change in changes" :key="change.key" :class="change.kind">
              <span>{{ change.kind === 'added' ? '＋' : change.kind === 'removed' ? '−' : '↕' }}</span>
              <div><strong>{{ change.name }}</strong><small>{{ change.detail }}</small></div>
            </li>
          </ul>
          <p v-else class="diff-same">当前项目与这个版本的时间轴、字幕和项目设置一致。</p>

          <footer class="version-actions">
            <button type="button" class="version-remove" @click="remove">删除此版本</button>
            <button type="button" class="version-restore" :class="{ armed: restoreArmed }" @click="restore">
              {{ restoreArmed ? '再次点击确认恢复' : '恢复此版本' }}
            </button>
          </footer>
        </main>
        <main v-else class="version-no-selection">保存或选择一个版本后，这里会显示与当前项目的差异。</main>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { EditProject, ProjectVersionSnapshot, TimelineClip } from '@/types/edit'

const props = defineProps<{ project: EditProject }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'restored'): void }>()
const store = useEditProjectStore()
const label = ref('')
const selectedId = ref(props.project.versions?.[0]?.id || '')
const restoreArmed = ref(false)
const selected = computed(() => props.project.versions?.find((item) => item.id === selectedId.value) || null)
const currentClips = computed(() => props.project.tracks.flatMap((track) => track.clips))

interface Change { key: string; kind: 'added' | 'removed' | 'changed'; name: string; detail: string }

function clipCount(snapshot: ProjectVersionSnapshot): number {
  return snapshot.tracks.reduce((count, track) => count + track.clips.length, 0)
}
function clipDescription(clip: TimelineClip): string {
  return `${clip.start.toFixed(1)}–${(clip.start + clip.duration).toFixed(1)}s · ${clip.kind}`
}
function sameClip(a: TimelineClip, b: TimelineClip): boolean {
  return a.name === b.name && a.kind === b.kind && a.url === b.url &&
    Math.abs(a.start - b.start) < 0.001 && Math.abs(a.duration - b.duration) < 0.001 &&
    (a.trimStart || 0) === (b.trimStart || 0) && a.motionId === b.motionId &&
    (a.volume ?? 1) === (b.volume ?? 1) && (a.opacity ?? 1) === (b.opacity ?? 1) &&
    JSON.stringify(a.volumeKeyframes || []) === JSON.stringify(b.volumeKeyframes || []) &&
    JSON.stringify(a.opacityKeyframes || []) === JSON.stringify(b.opacityKeyframes || [])
}
const changes = computed<Change[]>(() => {
  const snapshot = selected.value?.snapshot
  if (!snapshot) return []
  const result: Change[] = []
  if (props.project.name !== snapshot.name || props.project.aspectRatio !== snapshot.aspectRatio ||
    props.project.resolution !== snapshot.resolution || props.project.fps !== snapshot.fps) {
    result.push({ key: 'settings', kind: 'changed', name: '项目设置', detail: `${snapshot.name} · ${snapshot.aspectRatio} / ${snapshot.resolution} / ${snapshot.fps}fps → ${props.project.name} · ${props.project.aspectRatio} / ${props.project.resolution} / ${props.project.fps}fps` })
  }
  const before = new Map(snapshot.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip]))
  const after = new Map(currentClips.value.map((clip) => [clip.id, clip]))
  for (const [id, clip] of after) {
    const old = before.get(id)
    if (!old) result.push({ key: id, kind: 'added', name: clip.name, detail: `当前新增 · ${clipDescription(clip)}` })
    else if (!sameClip(old, clip)) result.push({ key: id, kind: 'changed', name: clip.name, detail: `${clipDescription(old)} → ${clipDescription(clip)}` })
  }
  for (const [id, clip] of before) {
    if (!after.has(id)) result.push({ key: id, kind: 'removed', name: clip.name, detail: `当前已移除 · ${clipDescription(clip)}` })
  }
  const oldCaptions = snapshot.captions || []
  const newCaptions = props.project.captions || []
  if (JSON.stringify(oldCaptions) !== JSON.stringify(newCaptions)) {
    result.push({ key: 'captions', kind: 'changed', name: '字幕', detail: `${oldCaptions.length} 条 → ${newCaptions.length} 条` })
  }
  return result
})

function save() {
  const version = store.saveVersion(props.project.id, label.value)
  if (!version) return
  label.value = ''
  selectedId.value = version.id
  restoreArmed.value = false
}
function select(id: string) {
  selectedId.value = id
  restoreArmed.value = false
}
function remove() {
  if (!selected.value) return
  store.removeVersion(props.project.id, selected.value.id)
  selectedId.value = props.project.versions?.[0]?.id || ''
  restoreArmed.value = false
}
function restore() {
  if (!selected.value) return
  if (!restoreArmed.value) {
    restoreArmed.value = true
    return
  }
  if (store.restoreVersion(props.project.id, selected.value.id)) emit('restored')
}
function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}
</script>

<style scoped>
.versions-backdrop { position: fixed; z-index: 90; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(43, 33, 27, 0.26); backdrop-filter: blur(4px); }
.versions { width: min(880px, 96vw); max-height: min(680px, 90vh); overflow: hidden; border: 1px solid #e5d8cf; border-radius: 16px; background: #fdfbf9; box-shadow: 0 24px 70px rgba(55, 38, 28, 0.2); }
.versions-head { display: flex; justify-content: space-between; padding: 20px 22px 16px; border-bottom: 1px solid #eee4dc; }
.versions-head strong { color: #342a25; font-size: 17px; }
.versions-head p { margin: 5px 0 0; color: #97877d; font-size: 11px; }
.versions-head > button { align-self: flex-start; border: 0; background: transparent; color: #8d7d73; font-size: 22px; cursor: pointer; }
.versions-body { display: grid; grid-template-columns: 250px 1fr; min-height: 400px; max-height: calc(90vh - 90px); }
.version-list { overflow-y: auto; padding: 14px; border-right: 1px solid #eee4dc; background: #f8f3ef; }
.version-save { display: flex; gap: 6px; margin-bottom: 12px; }
.version-save input { width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid #e4d8cf; border-radius: 7px; background: #fff; color: #493b33; font-size: 10px; }
.version-save button { flex: none; padding: 0 9px; border: 0; border-radius: 7px; background: #b45f3c; color: #fff; font-size: 10px; cursor: pointer; }
.version-empty, .version-no-selection { color: #a19085; font-size: 11px; line-height: 1.7; }
.version-item { display: flex; flex-direction: column; gap: 4px; width: 100%; margin-bottom: 6px; padding: 10px; border: 1px solid transparent; border-radius: 9px; background: transparent; text-align: left; cursor: pointer; }
.version-item.active { border-color: #ddc5b7; background: #fff; }
.version-item strong { overflow: hidden; color: #54443b; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.version-item span { color: #a08f84; font-size: 9px; }
.version-diff { display: flex; flex-direction: column; min-width: 0; overflow-y: auto; padding: 18px; }
.version-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.version-columns section { display: flex; flex-direction: column; gap: 5px; padding: 12px; border: 1px solid #eee3db; border-radius: 10px; background: #fff; }
.version-columns span { color: #b45f3c; font-size: 9px; text-transform: uppercase; }
.version-columns strong { overflow: hidden; color: #44372f; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.version-columns small { color: #97877c; font-size: 9.5px; }
.diff-summary { display: flex; gap: 14px; padding: 16px 2px 9px; font-size: 10px; }
.added { color: #4e8065; }.removed { color: #b15745; }.changed { color: #9b7342; }
.diff-list { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; list-style: none; }
.diff-list li { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 7px; background: #f7f2ee; }
.diff-list li > span { font-size: 15px; }.diff-list div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.diff-list strong { color: #55463e; font-size: 10.5px; }.diff-list small { overflow: hidden; color: #9b8b81; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.diff-same { padding: 30px 10px; color: #8f8177; font-size: 11px; text-align: center; }
.version-actions { display: flex; justify-content: space-between; margin-top: auto; padding-top: 16px; }
.version-actions button { padding: 7px 12px; border-radius: 7px; font-size: 10px; cursor: pointer; }
.version-remove { border: 1px solid #e4d8cf; background: #fff; color: #9b7262; }
.version-restore { border: 0; background: #4d4038; color: #fff; }.version-restore.armed { background: #b45f3c; }
.version-no-selection { display: grid; place-items: center; padding: 30px; }
@media (max-width: 700px) { .versions-body { grid-template-columns: 190px 1fr; }.version-columns { grid-template-columns: 1fr; } }
</style>
