<template>
  <div class="pl-page">
    <StudioIsland />

    <main class="pl-main">
      <header class="pl-head">
        <div class="pl-title">
          <p class="sf-kicker">Edit Studio</p>
          <h1>剪辑项目</h1>
          <p class="pl-sub">选一个项目进入剪辑台。项目之间互不打扰，想换片先回到这一页。</p>
        </div>
        <div class="pl-actions">
          <button type="button" class="pl-btn" @click="handleNew">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建项目
          </button>
        </div>
      </header>

      <div v-if="!projects.length" class="pl-empty">
        <span class="pl-empty-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
            <rect x="3.2" y="5" width="17.6" height="14" rx="3" />
            <path d="M3.6 9.2h16.8M8 5.2v4M14.2 5.2v4" />
          </svg>
        </span>
        <h2>还没有项目。</h2>
        <p>新建一个项目开始剪辑，或者在创作对话里描述需求，让生成的素材自动进入项目。</p>
        <button type="button" class="pl-btn is-primary" @click="handleNew">新建第一个项目</button>
      </div>

      <template v-else>
        <section v-for="group in groupedProjects" :key="group.id" class="pl-group">
          <header class="pl-group-head">
            <h2>{{ group.title }}</h2>
            <span class="pl-group-path">{{ group.path }}</span>
            <span class="pl-group-count">{{ group.items.length }} 个</span>
          </header>
          <div class="pl-grid">
        <article
          v-for="item in group.items"
          :key="item.id"
          class="pl-card"
          tabindex="0"
          role="link"
          :aria-label="`进入项目 ${item.name}`"
          @click="openProject(item.id)"
          @keydown.enter="openProject(item.id)"
          @keydown.space.prevent="openProject(item.id)"
        >
          <div class="pl-thumb" :style="{ aspectRatio: item.aspectRatio || '16:9' }">
            <img v-if="cover(item)" :src="cover(item)" alt="" loading="lazy" />
            <span v-else class="pl-thumb-empty" aria-hidden="true">{{ item.name.slice(0, 1) }}</span>
            <span class="pl-badge">{{ item.aspectRatio || '16:9' }}</span>
          </div>
          <div class="pl-card-body">
            <h2>{{ item.name }}</h2>
            <p class="pl-meta">
              <span>{{ formatDuration(projectDuration(item)) }}</span>
              <span>{{ clipCount(item) }} 个片段</span>
              <span>{{ formatTime(item.updatedAt) }}</span>
            </p>
          </div>
          <div class="pl-card-actions">
            <button type="button" class="pl-link" @click.stop="openProject(item.id)">进入剪辑台 →</button>
            <button type="button" class="pl-link is-danger" @click.stop="handleDelete(item)">删除</button>
          </div>
        </article>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import StudioIsland from '@/components/StudioIsland.vue'
import { confirmDialog } from '@/features/ui/dialog'
import { projectDuration, useEditProjectStore } from '@/stores/editProjectStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { EditProject } from '@/types/edit'

const router = useRouter()
const projectStore = useEditProjectStore()

const projects = computed(() => projectStore.sortedProjects)
const workspaceStore = useWorkspaceStore()

/** 项目按工作区分组：当前工作区在前，未归属的落到「未分类」。 */
const groupedProjects = computed(() => {
  const known = workspaceStore.sortedWorkspaces.map((item, index) => ({ ...item, order: index }))
  const buckets = new Map<string, { id: string; title: string; path: string; order: number; items: typeof projects.value }>()
  for (const project of projects.value) {
    const matched = known.find((item) => item.id === project.workspaceId)
    const id = matched?.id || ''
    if (!buckets.has(id)) {
      buckets.set(id, {
        id: id || 'unassigned',
        title: matched?.title || '未分类',
        path: matched?.path || '没有归属工作区的旧项目',
        order: matched?.order ?? 999,
        items: [],
      })
    }
    buckets.get(id)!.items.push(project)
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order)
})

function cover(item: EditProject): string {
  for (const track of item.tracks) {
    for (const clip of track.clips as Array<{ thumbnail?: string; url?: string; kind?: string }>) {
      if (clip.thumbnail) return clip.thumbnail
      if (clip.kind === 'image' && clip.url) return clip.url
    }
  }
  return ''
}

function clipCount(item: EditProject): number {
  return item.tracks.reduce((count, track) => count + track.clips.length, 0)
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

function formatTime(value: number): string {
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function openProject(id: string) {
  void router.push(`/edit/${id}`)
}

function handleNew() {
  const project = projectStore.createProject()
  openProject(project.id)
}

async function handleDelete(item: EditProject) {
  const ok = await confirmDialog({
    title: '删除项目',
    message: `确定要删除「${item.name}」吗？该项目里的剪辑与素材引用会一起移除，已生成的素材文件不受影响。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  projectStore.deleteProject(item.id)
}
</script>

<style scoped>
.pl-page {
  display: flex;
  min-height: 100dvh;
  color: var(--sf-ink);
}

.pl-main {
  flex: 1 1 auto;
  min-width: 0;
  padding: 30px clamp(20px, 4vw, 48px) 60px;
}

.pl-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto 26px;
}

.pl-title h1 {
  margin: 6px 0 6px;
  font-size: clamp(26px, 3vw, 34px);
  font-weight: 680;
  letter-spacing: -0.03em;
}

.pl-sub {
  max-width: 52ch;
  margin: 0;
  color: var(--sf-ink-2);
  font-size: 13px;
  line-height: 1.7;
}

.pl-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--sf-dur-2) var(--sf-ease-out), border-color var(--sf-dur-2) var(--sf-ease-out);
}

.pl-btn svg {
  width: 15px;
  height: 15px;
}

.pl-btn:hover {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface-2);
}

.pl-btn.is-primary {
  border-color: var(--sf-ink);
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.pl-group {
  max-width: 1180px;
  margin: 0 auto 26px;
}

.pl-group-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--sf-line-soft);
}

.pl-group-head h2 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 660;
}

.pl-group-path {
  overflow: hidden;
  max-width: 46ch;
  color: var(--sf-ink-3);
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pl-group-count {
  margin-left: auto;
  color: var(--sf-ink-3);
  font-size: 11px;
}

.pl-empty {
  max-width: 520px;
  margin: 60px auto;
  text-align: center;
}

.pl-empty-mark {
  display: inline-flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sf-line);
  border-radius: 16px;
  background: var(--sf-surface-2);
  color: var(--sf-ink-2);
}

.pl-empty-mark svg {
  width: 26px;
  height: 26px;
}

.pl-empty h2 {
  margin: 16px 0 8px;
  font-size: 20px;
}

.pl-empty p {
  margin: 0 0 20px;
  color: var(--sf-ink-2);
  font-size: 13px;
  line-height: 1.7;
}

.pl-grid {
  display: grid;
  max-width: 1180px;
  margin: 0 auto;
  gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.pl-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--sf-line);
  border-radius: var(--sf-r-lg);
  background: var(--sf-surface);
  cursor: pointer;
  transition: transform var(--sf-dur-2) var(--sf-ease-out), box-shadow var(--sf-dur-2) var(--sf-ease-out),
    border-color var(--sf-dur-2) var(--sf-ease-out);
}

.pl-card:hover,
.pl-card:focus-visible {
  border-color: var(--sf-line-strong);
  box-shadow: var(--sf-shadow-md);
  transform: translateY(-2px);
}

.pl-thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sf-paper-3);
}

.pl-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pl-thumb-empty {
  color: var(--sf-ink-4);
  font-family: var(--sf-font-display);
  font-size: 48px;
}

.pl-badge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.72);
  color: var(--sf-surface);
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
}

.pl-card-body {
  padding: 14px 16px 10px;
}

.pl-card-body h2 {
  margin: 0 0 6px;
  overflow: hidden;
  font-size: 15px;
  font-weight: 640;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pl-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  color: var(--sf-ink-3);
  font-family: var(--sf-font-mono);
  font-size: 11px;
}

.pl-card-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px 14px;
}

.pl-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sf-terra);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.pl-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pl-link.is-danger {
  color: var(--sf-danger);
}

@media (max-width: 900px) {
  .pl-page {
    flex-direction: column;
  }

  .pl-main {
    padding: 22px 16px 48px;
  }
}
</style>
