<template>
  <div class="edit-page">
    <header class="es-topbar">
      <div class="es-top-left">
        <button type="button" class="es-back" title="返回对话" @click="goChat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 6 8.5 12l6 6" />
          </svg>
        </button>
        <BrandMark :size="22" />
        <input
          v-if="project"
          class="project-name"
          :value="project.name"
          aria-label="项目名称"
          @change="renameProject"
          @keydown.enter="blurTarget"
        />
        <span v-if="project" class="save-state" :class="{ error: projectStore.storageError }">
          {{ projectStore.storageError ? '未保存 · 本地存储已满' : '已自动保存' }}
        </span>
      </div>

      <div class="es-top-right">
        <template v-if="project">
          <label class="top-field">
            <span>比例</span>
            <select :value="project.aspectRatio" @change="setAspect">
              <option v-for="ratio in PROJECT_ASPECT_RATIOS" :key="ratio" :value="ratio">{{ ratio }}</option>
            </select>
          </label>
          <label class="top-field">
            <span>分辨率</span>
            <select :value="project.resolution" @change="setResolution">
              <option value="768P">768P</option>
              <option value="2K">2K</option>
            </select>
          </label>
          <label class="top-field">
            <span>帧率</span>
            <select :value="project.fps" @change="setFps">
              <option :value="24">24</option>
              <option :value="25">25</option>
              <option :value="30">30</option>
              <option :value="60">60</option>
            </select>
          </label>
          <button type="button" class="top-action json" @click="exportProject">导出工程</button>
          <button type="button" class="top-action export" :disabled="exporting" @click="startExport">
            {{ exporting ? `导出 ${Math.round(exportRatio * 100)}%` : '导出视频' }}
          </button>
        </template>
        <button type="button" class="top-icon" title="设置" aria-label="设置" @click="router.push('/settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15.1 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.11a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49.86z" />
          </svg>
        </button>
        <button
          type="button"
          class="top-action chat-launch"
          :class="{ active: mobileChatOpen }"
          @click="mobileChatOpen = !mobileChatOpen"
        >
          {{ mobileChatOpen ? '关闭对话' : '创作对话' }}
        </button>
        <button type="button" class="top-action primary" @click="createNewProject">新建项目</button>
      </div>
    </header>

    <div
      v-if="project"
      class="es-body"
      :class="{ 'chat-open': mobileChatOpen }"
      :style="{ '--studio-chat-width': `${chatWidth}px` }"
    >
      <aside class="es-rail">
        <div class="rail-tabs">
          <button type="button" :class="{ active: railTab === 'projects' }" @click="railTab = 'projects'">项目</button>
          <button type="button" :class="{ active: railTab === 'assets' }" @click="railTab = 'assets'">
            素材<span v-if="project.assets.length">{{ project.assets.length }}</span>
          </button>
        </div>

        <div v-if="railTab === 'projects'" class="rail-projects">
          <div
            v-for="item in projectStore.sortedProjects"
            :key="item.id"
            class="rail-project"
            :class="{ active: item.id === project.id }"
            role="button"
            tabindex="0"
            @click="openProject(item.id)"
            @keydown.enter="openProject(item.id)"
            @keydown.space.prevent="openProject(item.id)"
          >
            <span class="rail-project-name">{{ item.name }}</span>
            <span class="rail-project-meta">{{ item.aspectRatio }} · {{ clipCount(item) }} 段</span>
            <span class="rail-project-time">{{ relativeTime(item.updatedAt) }}</span>
            <span
              class="rail-project-del"
              role="button"
              tabindex="0"
              title="删除项目"
              @click.stop="removeProject(item.id)"
              @keydown.enter.stop="removeProject(item.id)"
            >×</span>
          </div>
        </div>

        <div v-else class="rail-assets">
          <label class="rail-upload">
            <input type="file" accept="image/*,video/*,audio/*" multiple @change="handleUpload" />
            <span>＋</span> 上传素材
          </label>

          <p v-if="!project.assets.length" class="rail-empty">
            还没有素材。对话里生成的图片 / 视频 / 配音会自动出现在这里。
          </p>

          <button
            v-for="asset in project.assets"
            :key="asset.id"
            type="button"
            class="rail-asset"
            draggable="true"
            :title="`${asset.name} · 拖动到轨道或点击加到末尾`"
            @click="addAssetToEnd(asset.id)"
            @dragstart="startAssetDrag($event, asset.id)"
          >
            <span class="rail-asset-thumb">
              <img v-if="asset.kind === 'image'" :src="asset.thumbnail || asset.url" alt="" />
              <span v-else>{{ asset.kind === 'video' ? '视频' : '音频' }}</span>
            </span>
            <span class="rail-asset-copy">
              <strong>{{ asset.name }}</strong>
              <small>{{ asset.kind === 'video' ? '视频' : asset.kind === 'image' ? '图片' : '音频' }}<template v-if="asset.duration"> · {{ asset.duration.toFixed(1) }}s</template></small>
            </span>
          </button>
        </div>
      </aside>

      <main ref="mainRef" class="es-main">
        <section class="es-preview">
          <div class="preview-stage">
            <StudioPreview
              :project="project"
              :playing="playing"
              @toggle-play="togglePlay"
              @seek="seek"
            />
          </div>
        </section>

      </main>

      <div ref="timelineRef" class="es-timeline">
        <TimelineTracks
          v-model:pxPerSec="pxPerSec"
          :project="project"
          :selected-clip-id="selectedClipId"
          :playing="playing"
          :can-undo="canUndo"
          :can-redo="canRedo"
          @seek="seek"
          @select="selectedClipId = $event"
          @move-clip="moveClip"
          @trim-clip="trimClip"
          @toggle-mute="toggleMute"
          @add-asset="handleAddAsset"
          @split="splitAtPlayhead"
          @duplicate="duplicateSelected"
          @remove="removeSelectedClip"
          @undo="undo"
          @redo="redo"
          @fit="fitTimeline"
        />
      </div>

      <div class="es-chat">
        <StudioChat :conversation-id="conversationId" :project-id="project.id" />
      </div>

      <div
        class="chat-resizer"
        role="separator"
        aria-orientation="vertical"
        title="拖动调整对话栏宽度"
        @pointerdown="startChatResize"
      />
    </div>

    <div v-else class="es-empty">
      <BrandMark :size="44" />
      <h1>还没有剪辑项目</h1>
      <p>新建一个项目，或在对话里用「创作对话」说一句视频需求，会自动创建项目并进入剪辑台。</p>
      <div class="es-empty-actions">
        <button type="button" class="top-action primary" @click="createNewProject">新建项目</button>
        <button type="button" class="top-action" @click="router.push('/chat')">回到对话</button>
      </div>
      <ul v-if="projectStore.sortedProjects.length" class="es-empty-list">
        <li v-for="item in projectStore.sortedProjects.slice(0, 6)" :key="item.id">
          <button type="button" @click="openProject(item.id)">
            <strong>{{ item.name }}</strong>
            <small>{{ item.aspectRatio }} · {{ clipCount(item) }} 段 · {{ relativeTime(item.updatedAt) }}</small>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="exporting" class="export-panel" role="status">
      <div class="export-head">
        <strong>正在导出 MP4</strong>
        <span>{{ exportNote }}</span>
      </div>
      <div class="export-bar"><i :style="{ width: `${Math.round(exportRatio * 100)}%` }" /></div>
      <div class="export-foot">
        <span>{{ Math.round(exportRatio * 100) }}%</span>
        <button type="button" @click="cancelExport">取消</button>
      </div>
    </div>

    <div v-if="toast" class="es-toast" role="status">{{ toast }}</div>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '@/components/agent/BrandMark.vue'
import StudioPreview from '@/components/edit/StudioPreview.vue'
import TimelineTracks from '@/components/edit/TimelineTracks.vue'
import StudioChat from '@/components/edit/StudioChat.vue'
import { useAgentStore } from '@/stores/agentStore'
import { useEditProjectStore, projectDuration } from '@/stores/editProjectStore'
import { playhead, setPlayhead } from '@/features/edit/playhead'
import { exportProjectVideo } from '@/features/edit/exportVideo'
import { confirmDialog } from '@/features/ui/dialog'
import {
  MAX_PROJECT_SECONDS,
  PROJECT_ASPECT_RATIOS,
  type ProjectAsset,
} from '@/types/edit'

const route = useRoute()
const router = useRouter()
const projectStore = useEditProjectStore()
const agentStore = useAgentStore()

const railTab = ref<'projects' | 'assets'>('projects')
const mainRef = ref<HTMLElement | null>(null)
const timelineRef = ref<HTMLElement | null>(null)
const CHAT_WIDTH_KEY = 'onestep_studio_chat_width_v1'
const chatWidth = ref(readChatWidth())
const pxPerSec = ref(52)
const clock = ref('00:00.0')
const playing = ref(false)
const selectedClipId = ref('')
const mobileChatOpen = ref(false)
const toast = ref('')
const exporting = ref(false)
const exportRatio = ref(0)
const exportNote = ref('准备素材')
let exportAbort: AbortController | null = null
let toastTimer: number | null = null

const projectId = computed(() => String(route.params.id || ''))
const project = computed(() => projectStore.getProject(projectId.value))
const conversationId = computed(() => project.value?.conversationId || '')
const timelineDuration = computed(() => projectDuration(project.value))
const canUndo = computed(() => {
  void projectStore.historyTick
  return !!project.value && projectStore.canUndo(project.value.id)
})
const canRedo = computed(() => {
  void projectStore.historyTick
  return !!project.value && projectStore.canRedo(project.value.id)
})

function clipCount(item: { tracks: Array<{ clips: unknown[] }> }): number {
  return item.tracks.reduce((count, track) => count + track.clips.length, 0)
}

function showToast(message: string) {
  toast.value = message
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 2200)
}

function ensureConversation(projectValue: NonNullable<ReturnType<typeof projectStore.getProject>>) {
  let conversation = projectValue.conversationId
    ? agentStore.conversations.find((item) => item.id === projectValue.conversationId)
    : null
  if (!conversation) {
    conversation = agentStore.createConversation(true)
    projectStore.updateProject(projectValue.id, { conversationId: conversation.id })
    conversation.projectId = projectValue.id
    conversation.mode = 'create'
    agentStore.flush()
  }
  agentStore.selectConversation(conversation.id)
  return conversation.id
}

function openProject(id: string) {
  playing.value = false
  setPlayhead(0)
  syncClock()
  selectedClipId.value = ''
  mobileChatOpen.value = false
  router.push(`/edit/${id}`)
}

function goChat() {
  playing.value = false
  router.push(conversationId.value ? `/chat/${conversationId.value}` : '/chat')
}

function createNewProject() {
  const conversation = agentStore.createConversation(true)
  const created = projectStore.createProject('未命名项目', conversation.id)
  conversation.projectId = created.id
  conversation.mode = 'create'
  agentStore.flush()
  openProject(created.id)
}

async function removeProject(id: string) {
  const ok = await confirmDialog({
    title: '删除项目',
    message: '删除这个项目？项目里的时间轴和素材会被移除，已生成的原始文件不受影响。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  const wasActive = id === projectId.value
  projectStore.deleteProject(id)
  if (wasActive) router.push('/edit')
}

function renameProject(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!project.value) return
  projectStore.renameProject(project.value.id, value)
}

function blurTarget(event: KeyboardEvent) {
  ;(event.target as HTMLInputElement | null)?.blur()
}

function setAspect(event: Event) {
  if (!project.value) return
  projectStore.updateProject(project.value.id, { aspectRatio: (event.target as HTMLSelectElement).value })
}

function setResolution(event: Event) {
  if (!project.value) return
  const value = (event.target as HTMLSelectElement).value === '2K' ? '2K' : '768P'
  projectStore.updateProject(project.value.id, { resolution: value })
}

function setFps(event: Event) {
  if (!project.value) return
  const value = Number((event.target as HTMLSelectElement).value) || 30
  projectStore.updateProject(project.value.id, { fps: value })
}

function seek(time: number) {
  setPlayhead(Math.max(0, Math.min(MAX_PROJECT_SECONDS, time)))
  syncClock()
}

function syncClock() {
  const value = playhead.value
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  clock.value = `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

function togglePlay() {
  if (!project.value) return
  if (playhead.value >= timelineDuration.value - 0.05) seek(0)
  playing.value = !playing.value
}

let raf = 0
let lastTs = 0
let lastClock = 0

function tick(timestamp: number) {
  if (!playing.value) return
  if (!lastTs) lastTs = timestamp
  const delta = (timestamp - lastTs) / 1000
  lastTs = timestamp
  const next = playhead.value + delta
  if (next >= timelineDuration.value) {
    setPlayhead(timelineDuration.value)
    syncClock()
    playing.value = false
    return
  }
  setPlayhead(next)
  if (timestamp - lastClock > 80) {
    lastClock = timestamp
    syncClock()
  }
  raf = requestAnimationFrame(tick)
}

watch(playing, (value) => {
  cancelAnimationFrame(raf)
  if (value) {
    lastTs = 0
    raf = requestAnimationFrame(tick)
  }
})

function moveClip(payload: { clipId: string; start: number }) {
  if (!project.value) return
  projectStore.updateClip(project.value.id, payload.clipId, { start: payload.start })
}

function trimClip(payload: { clipId: string; start: number; duration: number }) {
  if (!project.value) return
  let trimStart: number | undefined
  for (const track of project.value.tracks) {
    const clip = track.clips.find((item) => item.id === payload.clipId)
    if (!clip) continue
    const delta = payload.start - clip.start
    if (Math.abs(delta) > 0.001 && clip.kind !== 'image') {
      trimStart = Math.max(0, (clip.trimStart ?? 0) + delta)
    }
    break
  }
  projectStore.updateClip(project.value.id, payload.clipId, {
    start: payload.start,
    duration: payload.duration,
    ...(trimStart === undefined ? {} : { trimStart }),
  })
}

function toggleMute(trackId: string) {
  if (!project.value) return
  const track = project.value.tracks.find((item) => item.id === trackId)
  if (!track) return
  projectStore.setTrackMuted(project.value.id, trackId, !track.muted)
}

function handleAddAsset(payload: { assetId: string; at: number; trackId: string }) {
  if (!project.value) return
  const asset = project.value.assets.find((item) => item.id === payload.assetId)
  if (!asset) return
  projectStore.appendAsset(project.value.id, asset, { at: payload.at, trackId: payload.trackId })
}

function addAssetToEnd(assetId: string) {
  if (!project.value) return
  const clip = projectStore.addAssetToTrack(project.value.id, assetId)
  if (clip) showToast(`已加入「${clip.name}」`)
}

function startAssetDrag(event: DragEvent, assetId: string) {
  event.dataTransfer?.setData('application/onestep-asset', assetId)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function removeSelectedClip() {
  if (!project.value || !selectedClipId.value) return
  projectStore.removeClip(project.value.id, selectedClipId.value)
  selectedClipId.value = ''
}

function clipAtPlayhead(): string {
  if (!project.value) return ''
  const time = playhead.value
  if (selectedClipId.value) {
    for (const track of project.value.tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId.value)
      if (clip && time > clip.start + 0.2 && time < clip.start + clip.duration - 0.2) {
        return clip.id
      }
    }
  }
  for (const track of project.value.tracks) {
    for (const clip of track.clips) {
      if (time > clip.start + 0.2 && time < clip.start + clip.duration - 0.2) return clip.id
    }
  }
  return ''
}

function splitAtPlayhead() {
  if (!project.value) return
  const target = clipAtPlayhead()
  if (!target) {
    showToast('把播放头放到片段中间再分割')
    return
  }
  const rightId = projectStore.splitClip(project.value.id, target, playhead.value)
  if (!rightId) {
    showToast('这个位置没法分割')
    return
  }
  selectedClipId.value = rightId
  showToast('已在播放头处分割')
}

function duplicateSelected() {
  if (!project.value || !selectedClipId.value) return
  const id = projectStore.duplicateClip(project.value.id, selectedClipId.value)
  if (id) {
    selectedClipId.value = id
    showToast('已复制片段')
  }
}

function nudgeSelected(delta: number) {
  if (!project.value || !selectedClipId.value) return
  projectStore.nudgeClip(project.value.id, selectedClipId.value, delta)
}

function undo() {
  if (!project.value) return
  if (projectStore.undo(project.value.id)) showToast('已撤销')
}

function redo() {
  if (!project.value) return
  if (projectStore.redo(project.value.id)) showToast('已重做')
}

async function startExport() {
  if (!project.value || exporting.value) return
  if (!project.value.tracks.some((track) => track.clips.length > 0)) {
    showToast('时间轴还是空的，先加几个片段再导出')
    return
  }
  playing.value = false
  const projectValue = project.value
  const controller = new AbortController()
  exportAbort = controller
  exporting.value = true
  exportRatio.value = 0
  exportNote.value = '读取素材'
  try {
    const result = await exportProjectVideo(projectValue, {
      signal: controller.signal,
      onProgress: (ratio, note) => {
        exportRatio.value = ratio
        exportNote.value = note
      },
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(result.blob)
    link.download = `${projectValue.name || 'onestep'}.mp4`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000)
    const size = result.blob.size < 1024 * 1024
      ? `${Math.round(result.blob.size / 1024)}KB`
      : `${(result.blob.size / 1024 / 1024).toFixed(1)}MB`
    showToast(
      `已导出 ${result.width}×${result.height} · ${size}${result.hasAudio ? '' : ' · 无音轨'}`,
    )
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') showToast('已取消导出')
    else showToast((error as Error)?.message || '导出失败')
  } finally {
    exporting.value = false
    exportAbort = null
  }
}

function cancelExport() {
  exportAbort?.abort()
}

function fitTimeline() {
  const width = (timelineRef.value?.clientWidth || mainRef.value?.clientWidth || window.innerWidth) - 116 - 28
  pxPerSec.value = Math.max(14, Math.min(140, Math.round(width / Math.max(10, timelineDuration.value))))
}

function maxChatWidth(): number {
  return Math.max(360, Math.min(600, window.innerWidth - 760))
}

function readChatWidth(): number {
  const saved = Number(localStorage.getItem(CHAT_WIDTH_KEY))
  if (Number.isFinite(saved) && saved >= 340) return Math.min(maxChatWidth(), saved)
  return Math.round(Math.min(maxChatWidth(), Math.max(400, window.innerWidth * 0.27)))
}

let resizing = false

function startChatResize(event: PointerEvent) {
  if (window.innerWidth < 1181) return
  event.preventDefault()
  resizing = true
  const move = (moveEvent: PointerEvent) => {
    if (!resizing) return
    const next = window.innerWidth - moveEvent.clientX
    chatWidth.value = Math.max(360, Math.min(maxChatWidth(), Math.round(next)))
  }
  const stop = () => {
    resizing = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth.value))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!project.value || !files.length) return

  for (const file of files) {
    if (file.size > 1.2 * 1024 * 1024) {
      showToast(`${file.name} 超过 1.2MB，浏览器本地项目暂不支持这么大的文件`)
      continue
    }
    const kind = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('image/')
          ? 'image'
          : ''
    if (!kind) continue
    const url = await readFileAsDataUrl(file)
    if (!url) continue
    const duration = kind === 'image' ? undefined : await probeDuration(url, kind)
    const asset: ProjectAsset = {
      id: `ast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
      kind,
      url,
      duration,
      source: 'upload',
      createdAt: Date.now(),
    }
    projectStore.appendAsset(project.value.id, asset)
  }
  railTab.value = 'assets'
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function probeDuration(url: string, kind: 'video' | 'audio'): Promise<number | undefined> {
  return new Promise((resolve) => {
    const element = document.createElement(kind === 'video' ? 'video' : 'audio')
    element.preload = 'metadata'
    element.onloadedmetadata = () => {
      const value = Number.isFinite(element.duration) ? element.duration : undefined
      resolve(value)
      element.remove()
    }
    element.onerror = () => resolve(undefined)
    element.src = url
  })
}

function exportProject() {
  if (!project.value) return
  const payload = JSON.stringify(project.value, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${project.value.name || 'onestep-project'}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  showToast('工程已导出为 JSON')
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const editing =
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  if (editing) return
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (key === 'b') {
      event.preventDefault()
      splitAtPlayhead()
      return
    }
    if (key === 'd') {
      event.preventDefault()
      duplicateSelected()
      return
    }
    if (key === 's') {
      event.preventDefault()
      void startExport()
      return
    }
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!selectedClipId.value) return
    event.preventDefault()
    removeSelectedClip()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (event.altKey && selectedClipId.value) nudgeSelected(-(event.shiftKey ? 1 : 0.1))
    else seek(playhead.value - (event.shiftKey ? 1 : 0.1))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (event.altKey && selectedClipId.value) nudgeSelected(event.shiftKey ? 1 : 0.1)
    else seek(playhead.value + (event.shiftKey ? 1 : 0.1))
  }
}

watch(
  () => route.params.id,
  (id, previous) => {
    if (previous !== undefined) {
      playing.value = false
      setPlayhead(0)
      syncClock()
      selectedClipId.value = ''
    }
    if (id && project.value) {
      const conversation = ensureConversation(project.value)
      if (!agentStore.activeId || agentStore.activeId !== conversation) {
        agentStore.selectConversation(conversation)
      }
    }
  },
  { immediate: true },
)

watch(
  () => projectStore.storageError,
  (failed) => {
    if (failed) showToast('本地存储已满，最近的改动可能没有写入，建议导出工程或清理旧项目')
  },
)

/** 撤销/删除后选中的片段可能已经不存在，顺手清理。 */
watch(
  () => projectStore.historyTick,
  () => {
    if (!project.value || !selectedClipId.value) return
    const exists = project.value.tracks.some((track) =>
      track.clips.some((clip) => clip.id === selectedClipId.value),
    )
    if (!exists) selectedClipId.value = ''
  },
)

function clampChatWidth() {
  if (window.innerWidth > 1180 && chatWidth.value > maxChatWidth()) {
    chatWidth.value = maxChatWidth()
  }
}

onMounted(() => {
  if (project.value) ensureConversation(project.value)
  syncClock()
  nextTick(fitTimeline)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', clampChatWidth)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  exportAbort?.abort()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', clampChatWidth)
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  playing.value = false
})
</script>

<style scoped>
.edit-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #ffffff;
  color: #1d1d1b;
  overflow: hidden;
}

.es-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  height: 52px;
  flex: none;
  padding: 0 12px;
  border-bottom: 1px solid #ecece6;
}

.es-top-left,
.es-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.es-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #8c8c84;
  cursor: pointer;
}

.es-back svg {
  width: 15px;
  height: 15px;
}

.es-back:hover {
  border-color: #ecece6;
  color: #111110;
}

.project-name {
  width: 170px;
  min-width: 60px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #1d1d1b;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  outline: none;
}

.project-name:hover,
.project-name:focus {
  border-color: #e7e7e1;
  background: #fbfbf8;
}

.save-state {
  flex: none;
  color: #b0b0a8;
  font-size: 9.5px;
}

.save-state.error {
  color: #c0503f;
}

.top-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #a3a39b;
  font-size: 10px;
}

.top-field select {
  padding: 2px 4px;
  border: 1px solid #ecece6;
  border-radius: 5px;
  background: #ffffff;
  color: #4a4a44;
  font-family: inherit;
  font-size: 10.5px;
  outline: none;
}

.top-action {
  padding: 5px 10px;
  border: 1px solid #e7e7e1;
  border-radius: 7px;
  background: #ffffff;
  color: #5c5c55;
  font-family: inherit;
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
}

.top-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #8c8c84;
  cursor: pointer;
}

.top-icon svg {
  width: 14px;
  height: 14px;
}

.top-icon:hover {
  border-color: #ecece6;
  color: #111110;
}

.top-action:hover {
  border-color: #c9c9c1;
  color: #111110;
}

.top-action.primary {
  border-color: #111110;
  background: #111110;
  color: #ffffff;
}

.es-body {
  position: relative;
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr) var(--studio-chat-width, 400px);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    'rail main chat'
    'timeline timeline chat';
  flex: 1;
  min-height: 0;
}

.es-rail {
  grid-area: rail;
}

.es-main {
  grid-area: main;
}

.es-timeline {
  grid-area: timeline;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.es-timeline > * {
  flex: 1 1 auto;
  min-height: 0;
}

.es-chat {
  grid-area: chat;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.es-rail {
  display: flex;
  flex-direction: column;
  width: 232px;
  flex: none;
  border-right: 1px solid #ecece6;
  background: #fcfcfa;
}

.rail-tabs {
  display: flex;
  gap: 2px;
  padding: 8px;
  border-bottom: 1px solid #f0f0ea;
}

.rail-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: center;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #9a9a92;
  font-family: inherit;
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
}

.rail-tabs button span {
  color: #b0b0a8;
  font-size: 9.5px;
}

.rail-tabs button.active {
  background: #ffffff;
  color: #1d1d1b;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.06);
}

.rail-projects,
.rail-assets {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
}

.rail-project {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 24px 8px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.rail-project:hover {
  border-color: #ecece6;
  background: #ffffff;
}

.rail-project.active {
  border-color: #e0e0d8;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.04);
}

.rail-project-name {
  overflow: hidden;
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-project-meta,
.rail-project-time {
  color: #a3a39b;
  font-size: 9.5px;
}

.rail-project-del {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  color: #c9c9c1;
  font-size: 13px;
  line-height: 1;
  opacity: 0;
}

.rail-project:hover .rail-project-del {
  opacity: 1;
}

.rail-project-del:hover {
  background: #f6f1ef;
  color: #c0503f;
}

.rail-upload {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-bottom: 8px;
  padding: 7px;
  border: 1px dashed #e0e0d8;
  border-radius: 8px;
  color: #8c8c84;
  font-size: 10.5px;
  cursor: pointer;
}

.rail-upload:hover {
  border-color: #c9c9c1;
  color: #111110;
}

.rail-upload input {
  display: none;
}

.rail-empty {
  margin: 10px 4px;
  color: #a3a39b;
  font-size: 10.5px;
  line-height: 1.7;
}

.rail-asset {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: grab;
}

.rail-asset:hover {
  border-color: #ecece6;
  background: #ffffff;
}

.rail-asset-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 26px;
  flex: none;
  border-radius: 5px;
  background: #f0f0e9;
  overflow: hidden;
}

.rail-asset-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rail-asset-thumb span {
  color: #8c8c84;
  font-size: 9px;
}

.rail-asset-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.rail-asset-copy strong {
  overflow: hidden;
  color: #3b3b36;
  font-size: 10.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-asset-copy small {
  color: #a3a39b;
  font-size: 9px;
}

.es-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.es-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 10px 14px 8px;
  background: #f7f7f3;
}

.preview-stage {
  flex: 1;
  min-height: 0;
  display: flex;
}

.preview-stage > * {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.preview-stage :deep(.stage-frame) {
  margin: 0 auto;
}

.es-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 20px;
  text-align: center;
}

.es-empty h1 {
  margin: 6px 0 0;
  color: #1d1d1b;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.es-empty p {
  max-width: 420px;
  margin: 0;
  color: #8c8c84;
  font-size: 12px;
  line-height: 1.8;
}

.es-empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.es-empty-list {
  display: grid;
  gap: 4px;
  width: min(420px, 100%);
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.es-empty-list button {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 12px;
  border: 1px solid #ecece6;
  border-radius: 9px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.es-empty-list strong {
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 600;
}

.es-empty-list small {
  color: #a3a39b;
  font-size: 10px;
}

.es-toast {
  position: fixed;
  left: 50%;
  bottom: 26px;
  z-index: 950;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: 999px;
  background: #111110;
  color: #ffffff;
  font-size: 11.5px;
  box-shadow: 0 8px 24px rgba(17, 17, 16, 0.2);
}

.export-panel {
  position: fixed;
  left: 50%;
  bottom: 26px;
  z-index: 960;
  width: min(360px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 12px 14px;
  border: 1px solid #ecece6;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 18px 40px -18px rgba(17, 17, 16, 0.35);
}

.export-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.export-head strong {
  color: #1d1d1b;
  font-size: 11.5px;
  font-weight: 650;
}

.export-head span {
  overflow: hidden;
  color: #a3a39b;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-bar {
  height: 3px;
  border-radius: 999px;
  background: #f0f0ea;
  overflow: hidden;
}

.export-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #b4472f;
  transition: width 160ms linear;
}

.export-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 7px;
  color: #a3a39b;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.export-foot button {
  padding: 2px 8px;
  border: 1px solid #ecece6;
  border-radius: 6px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.export-foot button:hover {
  border-color: #cfcfc7;
  color: #111110;
}

.top-action:disabled {
  opacity: 0.55;
  cursor: default;
}

/* 对话栏可拖拽改宽，边界只画一条细线 */
.chat-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  right: var(--studio-chat-width, 400px);
  z-index: 30;
  width: 7px;
  transform: translateX(3px);
  cursor: col-resize;
  touch-action: none;
}

.chat-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
  background: transparent;
  transition: background 140ms ease;
}

.chat-resizer:hover::after {
  background: #b9b3a6;
}

.chat-launch {
  display: none;
}

@media (max-width: 1180px) {
  .es-body {
    grid-template-columns: minmax(0, 1fr) 340px;
    grid-template-areas:
      'main chat'
      'timeline chat';
  }
  .es-rail,
  .chat-resizer {
    display: none;
  }
  .save-state,
  .top-field span {
    display: none;
  }
  .top-action.json {
    display: none;
  }
}

@media (max-width: 980px) {
  .es-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'main'
      'timeline';
  }
  .es-chat {
    position: fixed;
    top: 52px;
    right: 0;
    bottom: 0;
    z-index: 70;
    width: min(420px, 94vw);
    border-left: 1px solid #e6e4dc;
    background: #ffffff;
    box-shadow: -18px 0 44px -30px rgba(17, 17, 16, 0.55);
    transform: translateX(102%);
    transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .es-body.chat-open .es-chat {
    transform: none;
  }
    .chat-launch {
    display: inline-flex;
  }
  .chat-launch.active {
    border-color: #111110;
    background: #111110;
    color: #ffffff;
  }
}

@media (max-width: 820px) {
  .project-name {
    width: 110px;
  }
  .top-field {
    display: none;
  }
}

@media (max-width: 640px) {
  .project-name {
    width: auto;
    min-width: 0;
    max-width: 96px;
    flex: 1 1 auto;
  }
  .es-top-left {
    flex: 1;
    min-width: 0;
  }
  .es-top-right {
    flex: none;
  }
  .save-state,
  .top-action.json,
  .top-icon {
    display: none;
  }
  .top-action {
    padding: 5px 8px;
  }
  .es-preview {
    padding: 8px 10px 6px;
  }
}
</style>
