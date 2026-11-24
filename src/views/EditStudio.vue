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
        <button type="button" class="top-icon" title="模板库" aria-label="模板库" @click="openTemplatePage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
            <rect x="3.4" y="4.4" width="7.2" height="7.2" rx="2" />
            <rect x="13.4" y="4.4" width="7.2" height="7.2" rx="2" />
            <rect x="3.4" y="14.4" width="7.2" height="5.2" rx="2" />
            <rect x="13.4" y="14.4" width="7.2" height="5.2" rx="2" />
          </svg>
        </button>
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
          {{ mobileChatOpen ? '关闭对话' : pendingClipCount ? `创作对话 · ${pendingClipCount}` : '创作对话' }}
        </button>
        <button type="button" class="top-action primary" @click="createNewProject">新建项目</button>
      </div>
    </header>

    <div
      v-if="project"
      class="es-body"
      :class="{ 'chat-open': mobileChatOpen }"
      :style="{
        '--studio-chat-width': `${chatWidth}px`,
        '--studio-timeline-height': `${timelineHeight}px`,
      }"
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
        <ClipInspector
          v-if="inspectorOpen && selectedEntries.length"
          :entries="selectedEntries"
          @close="inspectorOpen = false"
          @ask-ai="askAiForSelection"
          @update-clip="updateSelectedClip"
          @duplicate="duplicateSelected"
          @split="splitAtPlayhead"
          @remove="removeSelectedClip"
        />
      </main>

      <div ref="timelineRef" class="es-timeline">
        <div
          class="timeline-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整时间轴高度"
          title="拖动调整时间轴高度，双击复位"
          @pointerdown="startTimelineResize"
          @dblclick="resetTimelineHeight"
        >
          <span aria-hidden="true" />
        </div>
        <TimelineTracks
          v-model:pxPerSec="pxPerSec"
          v-model:note="clipNote"
          :project="project"
          :selected-clip-id="selectedClipId"
          :selected-clip-ids="selectedClipIds"
          :playing="playing"
          :can-undo="canUndo"
          :can-redo="canRedo"
          @seek="seek"
          @select="handleTimelineSelect"
          @move-clip="moveClip"
          @move-clips="moveClips"
          @trim-clip="trimClip"
          @toggle-mute="toggleMute"
          @add-asset="handleAddAsset"
          @split="splitAtPlayhead"
          @duplicate="duplicateSelected"
          @remove="removeSelectedClip"
          @ask-ai="askAiForSelection"
          @inspector="inspectorOpen = true"
          @undo="undo"
          @redo="redo"
          @fit="fitTimeline"
          @shortcuts="shortcutsOpen = true"
        />
      </div>

      <div class="es-chat">
        <StudioChat
          ref="studioChatRef"
          :conversation-id="conversationId"
          :project-id="project.id"
          :selected-clips="selectedAgentClips"
          :pending-batches="pendingClipBatches"
          :clip-note="clipNote"
          @clear-clips="clearTimelineSelection"
          @clear-note="clipNote = ''"
          @remove-batch="removePendingBatch"
          @clear-pending="clearPendingBatches"
          @consume-pending="consumePendingBatches"
        />
      </div>

      <div
        class="chat-resizer"
        role="separator"
        aria-orientation="vertical"
        title="拖动调整对话栏宽度"
        @pointerdown="startChatResize"
      />
    </div>

    <div v-else-if="!autoOpeningProject" class="es-empty">
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

    <div v-if="shortcutsOpen" class="shortcuts-backdrop" @click.self="shortcutsOpen = false">
      <section class="shortcuts-panel" role="dialog" aria-modal="true" aria-label="剪辑快捷键">
        <header>
          <div>
            <strong>剪辑快捷键</strong>
            <p>剪辑台里直接按，输入框内不会触发。</p>
          </div>
          <button type="button" aria-label="关闭快捷键面板" @click="shortcutsOpen = false">✕</button>
        </header>
        <div class="shortcuts-grid">
          <div v-for="group in SHORTCUT_GROUPS" :key="group.title" class="shortcut-group">
            <h4>{{ group.title }}</h4>
            <div v-for="item in group.items" :key="`${group.title}-${item.label}`" class="shortcut-row">
              <span>{{ item.label }}</span>
              <kbd>{{ item.keys }}</kbd>
            </div>
          </div>
        </div>
        <footer>macOS 用 ⌘，Windows / Linux 用 Ctrl；按 <kbd>?</kbd> 随时打开。</footer>
      </section>
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
import ClipInspector from '@/components/edit/ClipInspector.vue'
import { useAgentStore } from '@/stores/agentStore'
import { useEditProjectStore, projectDuration } from '@/stores/editProjectStore'
import { playhead, setPlayhead } from '@/features/edit/playhead'
import { exportProjectVideo } from '@/features/edit/exportVideo'
import { confirmDialog } from '@/features/ui/dialog'
import { consumeTemplatesFlash, describeTemplatesFlash } from '@/features/template/navigation'
import type { AgentClipRef } from '@/types/agent'
import { uploadAttachment } from '@/features/agent/attachments'
import {
  MAX_PROJECT_SECONDS,
  PROJECT_ASPECT_RATIOS,
  type EditTrackKind,
  type ProjectAsset,
  type TimelineClip,
} from '@/types/edit'

const route = useRoute()
const router = useRouter()

function openTemplatePage() {
  router.push({
    path: '/templates',
    query: { from: `/edit/${projectId.value || ''}`.replace(/\/$/, '') },
  })
}

const projectStore = useEditProjectStore()
const agentStore = useAgentStore()

const railTab = ref<'projects' | 'assets'>('projects')
const mainRef = ref<HTMLElement | null>(null)
const timelineRef = ref<HTMLElement | null>(null)
const CHAT_WIDTH_KEY = 'onestep_studio_chat_width_v1'
const TIMELINE_HEIGHT_KEY = 'onestep_studio_timeline_height_v1'
const TIMELINE_MIN_HEIGHT = 150
const chatWidth = ref(readChatWidth())
const timelineHeight = ref(readTimelineHeight())
const shortcutsOpen = ref(false)
const pxPerSec = ref(52)
const clock = ref('00:00.0')
const playing = ref(false)
const selectedClipId = ref('')
const selectedClipIds = ref<string[]>([])
const inspectorOpen = ref(false)
const studioChatRef = ref<InstanceType<typeof StudioChat> | null>(null)
const mobileChatOpen = ref(false)
const toast = ref('')
const clipboard = ref<{ trackId: string; clip: TimelineClip } | null>(null)
const exporting = ref(false)
const exportRatio = ref(0)
const exportNote = ref('准备素材')
let exportAbort: AbortController | null = null
let toastTimer: number | null = null

const SHORTCUT_GROUPS = [
  {
    title: '播放与定位',
    items: [
      { label: '播放 / 暂停', keys: 'Space' },
      { label: '前后 0.1 秒', keys: '← / →' },
      { label: '前后 1 秒', keys: '⇧ ← / →' },
      { label: '跳到片头 / 片尾', keys: 'Home / End' },
    ],
  },
  {
    title: '编辑',
    items: [
      { label: '在播放头分割', keys: '⌘B / ⌘K' },
      { label: '复制片段', keys: '⌘D' },
      { label: '复制 / 剪切', keys: '⌘C / ⌘X' },
      { label: '粘贴到播放头', keys: '⌘V' },
      { label: '删除片段', keys: 'Delete' },
      { label: '全选片段', keys: '⌘A' },
      { label: '把选中片段加入待发送', keys: '⌘ Enter' },
      { label: '撤销 / 重做', keys: '⌘Z / ⇧⌘Z' },
    ],
  },
  {
    title: '视图',
    items: [
      { label: '缩放时间轴', keys: '+ / −' },
      { label: '适配窗口', keys: '\\' },
      { label: '微调选中片段', keys: '⌥ ← / →' },
      { label: '静音所在轨道', keys: 'M' },
      { label: '取消选择 / 关闭面板', keys: 'Esc' },
      { label: '导出 MP4', keys: '⌘S' },
    ],
  },
]

const projectId = computed(() => String(route.params.id || ''))
const project = computed(() => projectStore.getProject(projectId.value))
/**
 * 悬浮岛「剪辑项目」和「在新标签页打开」都只会落到 /edit（没有 id）。
 * 只要本地已经有项目，就直接打开最近编辑的那个，避免出现「明明有项目却说没有」。
 */
const autoOpeningProject = ref(false)
function openLatestProject() {
  if (project.value) {
    autoOpeningProject.value = false
    return
  }
  const latest = projectStore.sortedProjects[0]
  // 已经在目标项目上（例如数据损坏）时就别再转，正常显示空状态。
  if (!latest || projectId.value === latest.id) {
    autoOpeningProject.value = false
    return
  }
  autoOpeningProject.value = true
  router.replace(`/edit/${latest.id}`)
}
openLatestProject()
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
  clearTimelineSelection()
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

function moveClips(payload: { ids: string[]; delta: number }) {
  if (!project.value || !payload.ids.length || !payload.delta) return
  projectStore.moveClips(project.value.id, payload.ids, payload.delta)
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
  if (!project.value || !selectedClipIds.value.length) return
  const count = projectStore.removeClips(project.value.id, selectedClipIds.value)
  clearTimelineSelection()
  if (count > 1) showToast(`已删除 ${count} 个片段`)
}

function selectedClipRef(): { trackId: string; clip: TimelineClip } | null {
  if (!project.value || !selectedClipId.value) return null
  for (const track of project.value.tracks) {
    const clip = track.clips.find((item) => item.id === selectedClipId.value)
    if (clip) return { trackId: track.id, clip }
  }
  return null
}

interface SelectedClipEntry {
  clip: TimelineClip
  trackId: string
  trackName: string
  trackKind: EditTrackKind
}

const selectedEntries = computed<SelectedClipEntry[]>(() => {
  const current = project.value
  if (!current || !selectedClipIds.value.length) return []
  const ids = new Set(selectedClipIds.value)
  const entries: SelectedClipEntry[] = []
  for (const track of current.tracks) {
    for (const clip of [...track.clips].sort((a, b) => a.start - b.start)) {
      if (!ids.has(clip.id)) continue
      entries.push({
        clip,
        trackId: track.id,
        trackName: track.name,
        trackKind: track.kind,
      })
    }
  }
  return entries
})

const selectedAgentClips = computed<AgentClipRef[]>(() =>
  selectedEntries.value.map(({ clip, trackId, trackName, trackKind }) => {
    const asset = clip.assetId
      ? project.value?.assets.find((item) => item.id === clip.assetId)
      : project.value?.assets.find((item) => item.url === clip.url)
    return {
      id: clip.id,
      name: clip.name,
      kind: clip.kind,
      trackId,
      trackName,
      trackKind,
      start: Math.round(clip.start * 1000) / 1000,
      duration: Math.round(clip.duration * 1000) / 1000,
      url: clip.url,
      thumbnail: clip.thumbnail || (clip.kind === 'image' ? clip.url : undefined),
      trimStart: clip.trimStart,
      volume: clip.volume,
      opacity: clip.opacity,
      assetName: asset?.name,
    }
  }),
)

/** 当前选中片段对应的修改意见，时间轴顶部和待发送区共用。 */
const clipNote = ref('')

interface PendingClipBatch {
  id: string
  note: string
  clips: AgentClipRef[]
}

/** 右侧「待发送区」：可以反复选片段 + 写意见，最后统一发送。 */
const pendingClipBatches = ref<PendingClipBatch[]>([])
const pendingClipCount = computed(() =>
  pendingClipBatches.value.reduce((total, batch) => total + batch.clips.length, 0),
)

function handleTimelineSelect(payload: { ids: string[]; primary: string }) {
  const nextIds = [...payload.ids]
  if (nextIds.join('|') !== selectedClipIds.value.join('|')) clipNote.value = ''
  selectedClipIds.value = nextIds
  selectedClipId.value = payload.primary || nextIds[nextIds.length - 1] || ''
  if (!nextIds.length) inspectorOpen.value = false
}

function clearTimelineSelection() {
  selectedClipIds.value = []
  selectedClipId.value = ''
  inspectorOpen.value = false
}

/** 把当前选中片段和这段修改意见放进右侧待发送区，不立刻发送。 */
function askAiForSelection() {
  if (!selectedAgentClips.value.length) {
    showToast('先在时间轴上选中要修改的片段')
    return
  }
  if (!project.value) return
  const note = clipNote.value.trim()
  const clips = selectedAgentClips.value
  const incoming = new Set(clips.map((clip) => clip.id))
  // 同一段重复加入时以最新的意见为准，避免待发送区里出现重复片段。
  const kept = pendingClipBatches.value
    .map((batch) => ({ ...batch, clips: batch.clips.filter((clip) => !incoming.has(clip.id)) }))
    .filter((batch) => batch.clips.length > 0)
  kept.push({
    id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    note,
    clips: clips.map((clip) => ({ ...clip, note: note || undefined })),
  })
  pendingClipBatches.value = kept
  clipNote.value = ''
  clearTimelineSelection()
  void nextTick(() => studioChatRef.value?.focusComposer())
  showToast(`已加入待发送 · ${clips.length} 段，可继续选下一段`)
}

function removePendingBatch(id: string) {
  pendingClipBatches.value = pendingClipBatches.value.filter((batch) => batch.id !== id)
}

function clearPendingBatches() {
  pendingClipBatches.value = []
}

/** 发送成功后清空队列；发送前不改动，失败时还能继续编辑。 */
function consumePendingBatches() {
  pendingClipBatches.value = []
}

function updateSelectedClip(payload: {
  ids?: string[]
  patch: Partial<Pick<TimelineClip, 'start' | 'duration' | 'volume' | 'opacity' | 'name'>>
}) {
  if (!project.value) return
  const ids = payload.ids?.length ? payload.ids : selectedClipIds.value
  if (!ids.length) return
  const { name, ...rest } = payload.patch
  if (name !== undefined && ids.length === 1) {
    projectStore.updateClip(project.value.id, ids[0], { name })
  }
  // 多选时「起点」只有一个值，统一写会把片段叠到一起，这里只允许单段改起点。
  if (ids.length > 1) delete rest.start
  if (Object.keys(rest).length) {
    projectStore.updateClips(project.value.id, ids, rest)
  }
}

function copySelected() {
  const found = selectedClipRef()
  if (!found) return
  clipboard.value = { trackId: found.trackId, clip: { ...found.clip } }
  showToast('已复制片段，⌘V 粘贴到播放头')
}

function cutSelected() {
  const found = selectedClipRef()
  if (!found) return
  clipboard.value = { trackId: found.trackId, clip: { ...found.clip } }
  removeSelectedClip()
  showToast('已剪切片段，⌘V 粘贴到播放头')
}

function pasteClipboard() {
  if (!project.value || !clipboard.value) {
    showToast('剪贴板里还没有片段')
    return
  }
  const { clip, trackId } = clipboard.value
  const fits = (kind: string, trackKind: string) =>
    kind === 'audio' ? trackKind === 'audio' : trackKind !== 'audio'
  const target =
    project.value.tracks.find((track) => track.id === trackId && fits(clip.kind, track.kind)) ||
    project.value.tracks.find((track) => fits(clip.kind, track.kind))
  if (!target) {
    showToast('没有能放下这个片段的轨道')
    return
  }
  let start = playhead.value
  const overlapped = target.clips.some(
    (item) => start < item.start + item.duration && start + clip.duration > item.start,
  )
  if (overlapped) {
    // 播放头后面被占住时，顺延到最近的空位，避免粘出互相压住的片段。
    const ordered = [...target.clips].sort((a, b) => a.start - b.start)
    let moved = true
    while (moved) {
      moved = false
      for (const item of ordered) {
        if (start < item.start + item.duration && start + clip.duration > item.start) {
          start = item.start + item.duration
          moved = true
        }
      }
    }
  }
  if (start + clip.duration > MAX_PROJECT_SECONDS) {
    showToast('播放头后面没有足够的空位')
    return
  }
  const id = projectStore.insertClip(project.value.id, target.id, clip, start)
  if (!id) {
    showToast('这个位置放不下片段')
    return
  }
  selectedClipId.value = id
  selectedClipIds.value = [id]
  showToast(overlapped ? `已粘贴到 ${start.toFixed(1)}s（避开已有片段）` : `已粘贴到 ${start.toFixed(1)}s`)
}

function zoomBy(factor: number) {
  pxPerSec.value = Math.max(14, Math.min(140, Math.round(pxPerSec.value * factor)))
}

function muteSelectedTrack() {
  const found = selectedClipRef()
  if (!found || !project.value) return
  const track = project.value.tracks.find((item) => item.id === found.trackId)
  if (!track) return
  projectStore.setTrackMuted(project.value.id, track.id, !track.muted)
  showToast(track.muted ? '已恢复声音' : '已静音这条轨道')
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
  selectedClipIds.value = [rightId]
  showToast('已在播放头处分割')
}

function duplicateSelected() {
  if (!project.value || !selectedClipIds.value.length) return
  const ids: string[] = []
  for (const clipId of selectedClipIds.value) {
    const id = projectStore.duplicateClip(project.value.id, clipId)
    if (id) ids.push(id)
  }
  if (ids.length) {
    selectedClipIds.value = ids
    selectedClipId.value = ids[ids.length - 1]
    showToast(ids.length > 1 ? `已复制 ${ids.length} 个片段` : '已复制片段')
  }
}

function nudgeSelected(delta: number) {
  if (!project.value || !selectedClipIds.value.length) return
  projectStore.nudgeClips(project.value.id, selectedClipIds.value, delta)
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

function maxTimelineHeight(): number {
  return Math.max(TIMELINE_MIN_HEIGHT, Math.min(720, window.innerHeight - 260))
}

function readTimelineHeight(): number {
  const saved = Number(localStorage.getItem(TIMELINE_HEIGHT_KEY))
  const fallback = Math.round(window.innerHeight * 0.23)
  if (Number.isFinite(saved) && saved >= TIMELINE_MIN_HEIGHT) {
    return Math.min(maxTimelineHeight(), Math.round(saved))
  }
  return Math.max(TIMELINE_MIN_HEIGHT, Math.min(maxTimelineHeight(), fallback))
}

function startTimelineResize(event: PointerEvent) {
  event.preventDefault()
  const startY = event.clientY
  const startHeight = timelineHeight.value
  const move = (moveEvent: PointerEvent) => {
    const next = startHeight - (moveEvent.clientY - startY)
    timelineHeight.value = Math.max(
      TIMELINE_MIN_HEIGHT,
      Math.min(maxTimelineHeight(), Math.round(next)),
    )
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    localStorage.setItem(TIMELINE_HEIGHT_KEY, String(timelineHeight.value))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

function resetTimelineHeight() {
  timelineHeight.value = Math.max(
    TIMELINE_MIN_HEIGHT,
    Math.min(maxTimelineHeight(), Math.round(window.innerHeight * 0.23)),
  )
  localStorage.setItem(TIMELINE_HEIGHT_KEY, String(timelineHeight.value))
  showToast('时间轴高度已复位')
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

  let skipped = 0
  let needsLocalServer = 0
  for (const file of files) {
    const kind = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('image/')
          ? 'image'
          : ''
    if (!kind) continue
    // 有本地服务时把原文件写到磁盘，项目里只存地址，大素材不再受浏览器存储限制。
    const uploaded = await uploadAttachment(file)
    if (!uploaded && file.size > DATA_URL_FALLBACK_MAX) {
      needsLocalServer += 1
      continue
    }
    const url = uploaded?.url || (await readFileAsDataUrl(file))
    if (!url) {
      skipped += 1
      continue
    }
    const duration = kind === 'image' ? undefined : await probeDuration(url, kind)
    const asset: ProjectAsset = {
      id: `ast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
      kind,
      url,
      duration,
      path: uploaded?.path,
      source: 'upload',
      createdAt: Date.now(),
    }
    projectStore.appendAsset(project.value.id, asset)
  }
  if (needsLocalServer) {
    showToast(`${needsLocalServer} 个大文件需要 App 或本地服务才能导入`)
  } else if (skipped) {
    showToast(`${skipped} 个文件读取失败，请重试或换一个文件`)
  }
  railTab.value = 'assets'
}

/**
 * 本地服务不可用时退回 data URL。
 * 只接受浏览器存储扛得住的小文件，避免把项目存档撑爆。
 */
const DATA_URL_FALLBACK_MAX = 2 * 1024 * 1024

function readFileAsDataUrl(file: File): Promise<string | null> {
  if (file.size > DATA_URL_FALLBACK_MAX) return Promise.resolve(null)
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

function selectAllClips() {
  if (!project.value) return
  const ids = project.value.tracks.flatMap((track) =>
    [...track.clips].sort((a, b) => a.start - b.start).map((clip) => clip.id),
  )
  selectedClipIds.value = ids
  selectedClipId.value = ids[ids.length - 1] || ''
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
  if (shortcutsOpen.value) {
    if (event.key === 'Escape' || event.key === '?') {
      event.preventDefault()
      shortcutsOpen.value = false
    }
    return
  }
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (key === 'a') {
      event.preventDefault()
      selectAllClips()
      return
    }
    if (key === 'enter') {
      event.preventDefault()
      askAiForSelection()
      return
    }
    if (key === 'b' || key === 'k') {
      event.preventDefault()
      splitAtPlayhead()
      return
    }
    if (key === 'd') {
      event.preventDefault()
      duplicateSelected()
      return
    }
    if (key === 'c') {
      event.preventDefault()
      copySelected()
      return
    }
    if (key === 'x') {
      event.preventDefault()
      cutSelected()
      return
    }
    if (key === 'v') {
      event.preventDefault()
      pasteClipboard()
      return
    }
    if (key === 's') {
      event.preventDefault()
      void startExport()
      return
    }
    if (key === '=' || key === '+') {
      event.preventDefault()
      zoomBy(1.25)
      return
    }
    if (key === '-' || key === '_') {
      event.preventDefault()
      zoomBy(0.8)
      return
    }
    if (key === '0') {
      event.preventDefault()
      fitTimeline()
      return
    }
    return
  }
  if (event.key === '?') {
    event.preventDefault()
    shortcutsOpen.value = !shortcutsOpen.value
    return
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(1.25)
    return
  }
  if (event.key === '-') {
    event.preventDefault()
    zoomBy(0.8)
    return
  }
  if (event.key === '\\') {
    event.preventDefault()
    fitTimeline()
    return
  }
  if (event.key === 'Escape') {
    shortcutsOpen.value = false
    clearTimelineSelection()
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    seek(0)
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    seek(timelineDuration.value)
    return
  }
  if (event.key === 'm' || event.key === 'M') {
    event.preventDefault()
    muteSelectedTrack()
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!selectedClipIds.value.length) return
    event.preventDefault()
    removeSelectedClip()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (event.altKey && selectedClipIds.value.length) nudgeSelected(-(event.shiftKey ? 1 : 0.1))
    else seek(playhead.value - (event.shiftKey ? 1 : 0.1))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (event.altKey && selectedClipIds.value.length) nudgeSelected(event.shiftKey ? 1 : 0.1)
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
      clearTimelineSelection()
      // 换项目后上一支片的待发送内容不再适用。
      pendingClipBatches.value = []
      clipNote.value = ''
    }
    if (id && project.value) {
      autoOpeningProject.value = false
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
    if (!project.value || !selectedClipIds.value.length) return
    const alive = new Set(
      project.value.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
    )
    const kept = selectedClipIds.value.filter((id) => alive.has(id))
    if (kept.length !== selectedClipIds.value.length) {
      selectedClipIds.value = kept
      if (!kept.includes(selectedClipId.value)) {
        selectedClipId.value = kept[kept.length - 1] || ''
      }
      if (!kept.length) inspectorOpen.value = false
    }
  },
)

/** 片段被删掉后，待发送区里对应的条目也要同步移除。 */
watch(
  () => project.value?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)).join('|') || '',
  () => {
    if (!pendingClipBatches.value.length) return
    const alive = new Set(
      project.value?.tracks.flatMap((track) => track.clips.map((clip) => clip.id)) || [],
    )
    pendingClipBatches.value = pendingClipBatches.value
      .map((batch) => ({ ...batch, clips: batch.clips.filter((clip) => alive.has(clip.id)) }))
      .filter((batch) => batch.clips.length > 0)
  },
)

function clampChatWidth() {
  if (window.innerWidth > 1180 && chatWidth.value > maxChatWidth()) {
    chatWidth.value = maxChatWidth()
  }
  if (timelineHeight.value > maxTimelineHeight()) {
    timelineHeight.value = maxTimelineHeight()
  }
}

onMounted(() => {
  if (project.value) ensureConversation(project.value)
  syncClock()
  nextTick(fitTimeline)
  announceTemplates()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', clampChatWidth)
})

/** 从模板库回来：把模板挂进这一轮对话，并聚焦输入框。 */
function announceTemplates() {
  const flash = consumeTemplatesFlash()
  if (!flash) return
  showToast(`${describeTemplatesFlash(flash)}，说一下想怎么改`)
  if (window.innerWidth <= 1180) mobileChatOpen.value = true
  void nextTick(() => studioChatRef.value?.focusComposer())
}

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
  --es-topbar-height: 52px;
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
  height: var(--es-topbar-height);
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
  grid-template-rows: minmax(0, 1fr) var(--studio-timeline-height, 220px);
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
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.es-timeline {
  position: relative;
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

.es-preview {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
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

.shortcuts-backdrop {
  position: fixed;
  inset: 0;
  z-index: 940;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(17, 17, 16, 0.28);
  backdrop-filter: blur(2px);
}

.shortcuts-panel {
  width: min(560px, 100%);
  max-height: min(640px, calc(100dvh - 40px));
  overflow-y: auto;
  padding: 14px 16px 12px;
  border: 1px solid #e6e6df;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 24px 60px -24px rgba(17, 17, 16, 0.45);
}

.shortcuts-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0ea;
}

.shortcuts-panel header strong {
  color: #1d1d1b;
  font-size: 13px;
  font-weight: 650;
}

.shortcuts-panel header p {
  margin: 3px 0 0;
  color: #a3a39b;
  font-size: 10px;
}

.shortcuts-panel header button {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #9a9a92;
  font-size: 12px;
  cursor: pointer;
}

.shortcuts-panel header button:hover {
  border-color: #ecece6;
  color: #111110;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding: 12px 0 6px;
}

.shortcut-group h4 {
  margin: 0 0 5px;
  color: #b0b0a8;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  color: #5f5f57;
  font-size: 10.5px;
}

.shortcut-row kbd,
.shortcuts-panel footer kbd {
  flex: none;
  padding: 1px 5px;
  border: 1px solid #ecece6;
  border-bottom-color: #dcdcd4;
  border-radius: 5px;
  background: #fafaf7;
  color: #6b6b63;
  font-family: inherit;
  font-size: 9.5px;
  line-height: 1.5;
  white-space: nowrap;
}

.shortcuts-panel footer {
  padding-top: 8px;
  border-top: 1px solid #f0f0ea;
  color: #b0b0a8;
  font-size: 9.5px;
}

@media (max-width: 640px) {
  .shortcuts-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
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

/* 时间轴上沿可上下拖动，调高后轨道区自己滚动 */
.timeline-resizer {
  position: absolute;
  top: -5px;
  right: 0;
  left: 0;
  z-index: 24;
  display: flex;
  height: 10px;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  touch-action: none;
}

.timeline-resizer > span {
  width: 44px;
  height: 3px;
  border-radius: 999px;
  background: #e2e0d8;
  transition: width 140ms ease, background 140ms ease;
}

.timeline-resizer:hover > span,
.timeline-resizer:active > span {
  width: 68px;
  background: #b9b3a6;
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
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      'main'
      'timeline';
  }
  .es-timeline {
    height: min(34vh, 240px);
    max-height: none;
  }
  .timeline-resizer {
    display: none;
  }
  .es-chat {
    position: fixed;
    top: var(--es-topbar-height);
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
