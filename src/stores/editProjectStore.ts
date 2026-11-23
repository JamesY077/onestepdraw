import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  AUDIO_CLIP_SECONDS,
  IMAGE_CLIP_SECONDS,
  MAX_PROJECT_SECONDS,
  MIN_CLIP_SECONDS,
  VIDEO_CLIP_SECONDS,
  aspectSize,
  trackKindForAsset,
  type EditProject,
  type EditTrack,
  type EditTrackKind,
  type ProjectAsset,
  type ProjectAssetKind,
  type TimelineClip,
} from '@/types/edit'

const STORAGE_KEY = 'onestep_edit_projects_v1'
const MAX_PROJECTS = 30
const DEFAULT_DURATION = 5

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultTracks(): EditTrack[] {
  return [
    { id: makeId('trk'), kind: 'video', name: '画面 V1', clips: [] },
    { id: makeId('trk'), kind: 'overlay', name: '叠加 O1', clips: [] },
    { id: makeId('trk'), kind: 'audio', name: '音频 A1', clips: [], muted: false },
  ]
}

function isProject(value: any): value is EditProject {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.tracks) &&
    Array.isArray(value.assets)
  )
}

function normalizeProject(value: EditProject): EditProject {
  const tracks = value.tracks
    .filter((track) => track && Array.isArray(track.clips))
    .map((track) => ({
      ...track,
      kind: (['video', 'overlay', 'audio'].includes(track.kind) ? track.kind : 'video') as EditTrackKind,
      clips: track.clips
        .filter((clip) => clip && typeof clip.url === 'string')
        .map((clip) => ({
          ...clip,
          start: Math.max(0, Number(clip.start) || 0),
          duration: Math.max(MIN_CLIP_SECONDS, Number(clip.duration) || DEFAULT_DURATION),
        })),
    }))
  return {
    ...value,
    fps: Number(value.fps) || 30,
    aspectRatio: value.aspectRatio || '16:9',
    resolution: value.resolution === '2K' ? '2K' : '768P',
    tracks: tracks.length ? tracks : defaultTracks(),
    assets: value.assets.filter((asset) => asset && typeof asset.url === 'string'),
  }
}

function loadProjects(): EditProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isProject).map(normalizeProject).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function defaultClipSeconds(kind: ProjectAssetKind): number {
  if (kind === 'audio') return AUDIO_CLIP_SECONDS
  if (kind === 'image') return IMAGE_CLIP_SECONDS
  return VIDEO_CLIP_SECONDS
}

function clipEnd(clip: TimelineClip): number {
  return clip.start + clip.duration
}

function trackEnd(track: EditTrack): number {
  return track.clips.reduce((end, clip) => Math.max(end, clipEnd(clip)), 0)
}

export function projectDuration(project: EditProject | null): number {
  if (!project) return DEFAULT_DURATION
  const end = project.tracks.reduce((value, track) => Math.max(value, trackEnd(track)), 0)
  return Math.min(MAX_PROJECT_SECONDS, Math.max(DEFAULT_DURATION, end))
}

export function projectAssetClipCount(project: EditProject | null): number {
  if (!project) return 0
  return project.tracks.reduce((count, track) => count + track.clips.length, 0)
}

export const useEditProjectStore = defineStore('editProject', () => {
  const projects = ref<EditProject[]>(loadProjects())
  const activeProjectId = ref<string>(projects.value[0]?.id || '')
  /** 本地存储写满时置为 true，页面据此提示可能未保存。 */
  const storageError = ref(false)

  const sortedProjects = computed(() =>
    [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )
  const activeProject = computed(
    () => projects.value.find((project) => project.id === activeProjectId.value) || null,
  )

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...projects.value].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROJECTS)),
      )
      storageError.value = false
    } catch {
      // 本地存储写满时不影响当前编辑，但要让用户知道刷新后可能丢失。
      storageError.value = true
    }
  }

  function getProject(id: string | null | undefined): EditProject | null {
    if (!id) return null
    return projects.value.find((project) => project.id === id) || null
  }

  function findProjectByConversation(conversationId: string): EditProject | null {
    return projects.value.find((project) => project.conversationId === conversationId) || null
  }

  function createProject(name = '未命名项目', conversationId?: string): EditProject {
    const now = Date.now()
    const size = aspectSize('16:9')
    const project: EditProject = {
      id: makeId('prj'),
      name: name.trim().slice(0, 60) || '未命名项目',
      conversationId,
      aspectRatio: '16:9',
      resolution: size.height > 800 ? '2K' : '768P',
      fps: 30,
      createdAt: now,
      updatedAt: now,
      tracks: defaultTracks(),
      assets: [],
    }
    projects.value.unshift(project)
    activeProjectId.value = project.id
    persist()
    return project
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter((project) => project.id !== id)
    if (activeProjectId.value === id) activeProjectId.value = projects.value[0]?.id || ''
    persist()
  }

  function renameProject(id: string, name: string) {
    const project = getProject(id)
    if (!project) return
    const next = name.trim()
    if (!next) return
    project.name = next.slice(0, 60)
    project.updatedAt = Date.now()
    persist()
  }

  function updateProject(id: string, patch: Partial<Pick<EditProject, 'aspectRatio' | 'resolution' | 'fps' | 'conversationId'>>) {
    const project = getProject(id)
    if (!project) return
    Object.assign(project, patch)
    project.updatedAt = Date.now()
    persist()
  }

  function touch(project: EditProject) {
    project.updatedAt = Date.now()
    persist()
  }

  function ensureTrack(project: EditProject, kind: EditTrackKind): EditTrack {
    const existing = project.tracks.find((track) => track.kind === kind)
    if (existing) return existing
    const track: EditTrack = {
      id: makeId('trk'),
      kind,
      name: kind === 'audio' ? '音频 A1' : kind === 'overlay' ? '叠加 O1' : '画面 V1',
      clips: [],
    }
    project.tracks.push(track)
    return track
  }

  /** 把素材加入项目素材库，并追加到对应轨道末尾。 */
  function appendAsset(
    projectId: string,
    input: Omit<ProjectAsset, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
    options: { at?: number; trackKind?: EditTrackKind; duration?: number } = {},
  ): TimelineClip | null {
    const project = getProject(projectId)
    if (!project) return null

    const existing = project.assets.find(
      (asset) => asset.url === input.url && asset.kind === input.kind,
    )
    const asset: ProjectAsset = existing || {
      ...input,
      id: input.id || makeId('ast'),
      createdAt: input.createdAt || Date.now(),
    }
    if (!existing) project.assets.unshift(asset)

    const trackKind = options.trackKind || trackKindForAsset(asset.kind)
    const track = ensureTrack(project, trackKind)
    const start = Math.max(0, options.at ?? trackEnd(track))
    const duration = Math.min(
      MAX_PROJECT_SECONDS,
      Math.max(MIN_CLIP_SECONDS, options.duration || asset.duration || defaultClipSeconds(asset.kind)),
    )
    const clip: TimelineClip = {
      id: makeId('clip'),
      assetId: asset.id,
      kind: asset.kind,
      name: asset.name,
      url: asset.url,
      thumbnail: asset.thumbnail,
      start,
      duration,
      trimStart: 0,
      volume: asset.kind === 'audio' ? 1 : undefined,
      opacity: asset.kind === 'image' ? 1 : undefined,
    }
    track.clips.push(clip)
    touch(project)
    return clip
  }

  function hasAssetUrl(projectId: string, url: string): boolean {
    const project = getProject(projectId)
    return !!project?.assets.some((asset) => asset.url === url)
  }

  function addAssetOnly(projectId: string,
    input: Omit<ProjectAsset, 'id' | 'createdAt'>,
  ): ProjectAsset | null {
    const project = getProject(projectId)
    if (!project) return null
    const existing = project.assets.find(
      (asset) => asset.url === input.url && asset.kind === input.kind,
    )
    if (existing) return existing
    const asset: ProjectAsset = { ...input, id: makeId('ast'), createdAt: Date.now() }
    project.assets.unshift(asset)
    touch(project)
    return asset
  }

  function addAssetToTrack(projectId: string, assetId: string, trackKind?: EditTrackKind): TimelineClip | null {
    const project = getProject(projectId)
    const asset = project?.assets.find((item) => item.id === assetId)
    if (!project || !asset) return null
    return appendAsset(projectId, asset, { trackKind })
  }

  function findClip(project: EditProject, clipId: string): { track: EditTrack; clip: TimelineClip } | null {
    for (const track of project.tracks) {
      const clip = track.clips.find((item) => item.id === clipId)
      if (clip) return { track, clip }
    }
    return null
  }

  function updateClip(
    projectId: string,
    clipId: string,
    patch: Partial<Pick<TimelineClip, 'start' | 'duration' | 'trimStart' | 'volume' | 'opacity' | 'name'>>,
  ) {
    const project = getProject(projectId)
    if (!project) return
    const found = findClip(project, clipId)
    if (!found) return
    const { clip } = found
    if (typeof patch.start === 'number') {
      clip.start = Math.max(0, Math.min(MAX_PROJECT_SECONDS, patch.start))
    }
    if (typeof patch.duration === 'number') {
      clip.duration = Math.max(MIN_CLIP_SECONDS, Math.min(MAX_PROJECT_SECONDS, patch.duration))
    }
    if (typeof patch.trimStart === 'number') clip.trimStart = Math.max(0, patch.trimStart)
    if (typeof patch.volume === 'number') clip.volume = Math.max(0, Math.min(1, patch.volume))
    if (typeof patch.opacity === 'number') clip.opacity = Math.max(0, Math.min(1, patch.opacity))
    if (typeof patch.name === 'string' && patch.name.trim()) clip.name = patch.name.trim().slice(0, 80)
    touch(project)
  }

  function removeClip(projectId: string, clipId: string) {
    const project = getProject(projectId)
    if (!project) return
    for (const track of project.tracks) {
      const index = track.clips.findIndex((clip) => clip.id === clipId)
      if (index >= 0) {
        track.clips.splice(index, 1)
        touch(project)
        return
      }
    }
  }

  function setTrackMuted(projectId: string, trackId: string, muted: boolean) {
    const project = getProject(projectId)
    const track = project?.tracks.find((item) => item.id === trackId)
    if (!project || !track) return
    track.muted = muted
    touch(project)
  }

  /** 对话式时间轴操作。 */
  function applyTimelineOps(projectId: string, ops: unknown[]): { applied: number; skipped: number } {
    const project = getProject(projectId)
    if (!project) return { applied: 0, skipped: ops.length }
    let applied = 0
    let skipped = 0
    for (const raw of ops) {
      const op = raw as Record<string, unknown>
      const clipId = typeof op?.clipId === 'string' ? op.clipId : ''
      const found = clipId ? findClip(project, clipId) : null
      if (!found) {
        skipped += 1
        continue
      }
      const { track, clip } = found
      const kind = String(op.op || '')
      if (kind === 'delete') {
        const index = track.clips.findIndex((item) => item.id === clipId)
        if (index >= 0) track.clips.splice(index, 1)
        applied += 1
        continue
      }
      if (kind === 'move') {
        const start = Number(op.start)
        if (!Number.isFinite(start)) {
          skipped += 1
          continue
        }
        clip.start = Math.max(0, Math.min(MAX_PROJECT_SECONDS, start))
        applied += 1
        continue
      }
      if (kind === 'trim') {
        const duration = Number(op.duration)
        const start = Number(op.start)
        if (Number.isFinite(start)) clip.start = Math.max(0, start)
        if (Number.isFinite(duration)) clip.duration = Math.max(MIN_CLIP_SECONDS, duration)
        if (Number.isFinite(start) || Number.isFinite(duration)) applied += 1
        else skipped += 1
        continue
      }
      if (kind === 'volume' || kind === 'opacity') {
        const value = Number(op.value)
        if (!Number.isFinite(value)) {
          skipped += 1
          continue
        }
        if (kind === 'volume') clip.volume = Math.max(0, Math.min(1, value))
        else clip.opacity = Math.max(0, Math.min(1, value))
        applied += 1
        continue
      }
      skipped += 1
    }
    if (applied) touch(project)
    return { applied, skipped }
  }

  /** 给系统提示词用的项目摘要。 */
  function projectSummary(project: EditProject | null): string {
    if (!project) return ''
    const lines: string[] = [
      `项目：${project.name}`,
      `比例：${project.aspectRatio} · 分辨率：${project.resolution} · ${project.fps}fps · 时长约 ${projectDuration(project).toFixed(1)} 秒`,
    ]
    for (const track of project.tracks) {
      if (!track.clips.length) continue
      const clips = [...track.clips]
        .sort((a, b) => a.start - b.start)
        .map(
          (clip) =>
            `  - [${clip.id}] ${clip.name}（${clip.kind}）${clip.start.toFixed(1)}s → ${clipEnd(clip).toFixed(1)}s`,
        )
      lines.push(`轨道 ${track.name}：`, ...clips)
    }
    if (lines.length === 2) lines.push('时间轴目前还是空的。')
    return lines.join('\n')
  }

  return {
    projects,
    sortedProjects,
    activeProjectId,
    activeProject,
    storageError,
    getProject,
    findProjectByConversation,
    createProject,
    deleteProject,
    renameProject,
    updateProject,
    appendAsset,
    hasAssetUrl,
    addAssetOnly,
    addAssetToTrack,
    updateClip,
    removeClip,
    setTrackMuted,
    applyTimelineOps,
    projectSummary,
    persist,
  }
})
