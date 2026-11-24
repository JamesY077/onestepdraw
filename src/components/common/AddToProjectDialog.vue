<template>
  <Teleport to="body">
    <div v-if="inbox.isOpen" class="inbox-backdrop" @click.self="close">
      <section class="inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="inbox-title">
        <header class="inbox-head">
          <div>
            <h2 id="inbox-title">添加到剪辑项目</h2>
            <p>
              {{ inbox.pending.length }} 个素材
              <template v-if="inbox.pending.length === 1"> · {{ inbox.pending[0].kind === 'image' ? '图片' : inbox.pending[0].kind === 'video' ? '视频' : '音频' }}</template>
            </p>
          </div>
          <button type="button" class="inbox-close" aria-label="关闭" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <ul class="inbox-assets">
          <li v-for="(asset, index) in inbox.pending.slice(0, 4)" :key="`${asset.url}-${index}`">
            <img v-if="asset.kind === 'image'" :src="asset.url" alt="" />
            <span v-else class="asset-kind">{{ asset.kind === 'video' ? '视频' : '音频' }}</span>
            <span class="asset-name">{{ asset.name }}</span>
          </li>
          <li v-if="inbox.pending.length > 4" class="asset-more">+{{ inbox.pending.length - 4 }}</li>
        </ul>

        <div class="inbox-list-head">
          <span>选择项目</span>
          <button type="button" class="inbox-link" @click="createAndAdd">新建项目并加入</button>
        </div>

        <ul v-if="projects.length" class="inbox-projects">
          <li v-for="project in projects" :key="project.id">
            <button
              type="button"
              class="project-row"
              :class="{ 'is-last': project.id === inbox.lastTargetId }"
              @click="addTo(project.id, false)"
            >
              <span class="project-dot" aria-hidden="true" />
              <span class="project-copy">
                <strong>{{ project.name }}</strong>
                <small>
                  {{ project.aspectRatio }} · {{ project.tracks.reduce((count, track) => count + track.clips.length, 0) }} 个片段
                  <template v-if="project.id === inbox.lastTargetId"> · 上次使用</template>
                </small>
              </span>
              <span class="project-add">加入</span>
            </button>
          </li>
        </ul>
        <p v-else class="inbox-empty">还没有剪辑项目，点右上角新建一个。</p>

        <footer class="inbox-foot">
          <span v-if="added" class="inbox-done">已加入「{{ added }}」</span>
          <button v-else type="button" class="inbox-ghost" @click="close">取消</button>
          <button v-if="added" type="button" class="inbox-primary" @click="openProject">打开项目</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAssetInboxStore } from '@/stores/assetInboxStore'
import { useEditProjectStore } from '@/stores/editProjectStore'

const inbox = useAssetInboxStore()
const projectStore = useEditProjectStore()
const router = useRouter()
const added = ref('')
const addedProjectId = ref('')

const projects = computed(() => projectStore.sortedProjects)

function close() {
  added.value = ''
  addedProjectId.value = ''
  inbox.close()
}

function addAssets(projectId: string) {
  for (const asset of inbox.pending) {
    projectStore.appendAsset(projectId, {
      name: asset.name,
      kind: asset.kind,
      url: asset.url,
      thumbnail: asset.thumbnail,
      duration: asset.duration,
      source: asset.source || 'library',
    })
  }
  inbox.rememberTarget(projectId)
}

function addTo(projectId: string, open: boolean) {
  addAssets(projectId)
  const project = projectStore.getProject(projectId)
  added.value = project?.name || '项目'
  addedProjectId.value = projectId
  if (open) openProject()
}

function openProject() {
  if (!addedProjectId.value) return
  const id = addedProjectId.value
  added.value = ''
  addedProjectId.value = ''
  inbox.close()
  router.push(`/edit/${id}`)
}

function createAndAdd() {
  const name = inbox.pending[0]?.name || '未命名项目'
  const project = projectStore.createProject(name.slice(0, 24))
  addTo(project.id, true)
}
</script>

<style scoped>
.inbox-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20, 20, 18, 0.28);
  backdrop-filter: blur(3px);
}

.inbox-dialog {
  width: min(440px, 100%);
  max-height: min(78vh, 620px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sf-line-soft);
  border-radius: 16px;
  background: var(--sf-surface);
  box-shadow: 0 24px 70px rgba(36, 31, 25, 0.18);
  overflow: hidden;
}

.inbox-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
}

.inbox-head h2 {
  margin: 0;
  color: var(--sf-ink);
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.inbox-head p {
  margin: 4px 0 0;
  color: var(--sf-ink-3);
  font-size: 11.5px;
}

.inbox-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--sf-ink-3);
  cursor: pointer;
}

.inbox-close svg {
  width: 14px;
  height: 14px;
}

.inbox-close:hover {
  border-color: var(--sf-line-soft);
  color: var(--sf-ink);
}

.inbox-assets {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: 0 18px 14px;
  list-style: none;
}

.inbox-assets li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 150px;
  padding: 5px 8px;
  border: 1px solid var(--sf-surface-3);
  border-radius: 8px;
  background: var(--sf-surface-2);
  color: var(--sf-ink-2);
  font-size: 11px;
}

.inbox-assets img {
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 5px;
  object-fit: cover;
}

.asset-kind {
  flex: none;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-size: 9.5px;
}

.asset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-more {
  flex: none;
  color: var(--sf-ink-3);
}

.inbox-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 8px;
  color: var(--sf-ink-3);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.inbox-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sf-ink);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.inbox-projects {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 12px 12px;
  overflow-y: auto;
  list-style: none;
}

.project-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease;
}

.project-row:hover {
  border-color: var(--sf-line-soft);
  background: var(--sf-surface-2);
}

.project-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #d6d6ca;
}

.project-row.is-last .project-dot {
  background: var(--sf-ink);
}

.project-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-copy strong {
  overflow: hidden;
  color: var(--sf-ink);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-copy small {
  color: var(--sf-ink-3);
  font-size: 10.5px;
}

.project-add {
  flex: none;
  color: var(--sf-ink-3);
  font-size: 11px;
  font-weight: 600;
}

.project-row:hover .project-add {
  color: var(--sf-ink);
}

.inbox-empty {
  margin: 0 18px;
  padding: 18px;
  border: 1px dashed var(--sf-line-soft);
  border-radius: 10px;
  color: var(--sf-ink-3);
  font-size: 11.5px;
  text-align: center;
}

.inbox-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #f1f1eb;
}

.inbox-done {
  margin-right: auto;
  color: #4c7a4e;
  font-size: 11.5px;
}

.inbox-ghost,
.inbox-primary {
  padding: 6px 12px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
}

.inbox-ghost {
  border: 1px solid var(--sf-line-soft);
  background: var(--sf-surface);
  color: var(--sf-ink-2);
}

.inbox-primary {
  border: 1px solid var(--sf-ink);
  background: var(--sf-ink);
  color: var(--sf-surface);
}
</style>
