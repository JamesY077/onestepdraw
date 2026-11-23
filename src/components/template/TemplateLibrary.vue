<template>
  <Teleport to="body">
    <Transition name="tpl">
      <div v-if="templateStore.open" class="tpl-overlay" @click.self="close">
        <aside class="tpl-drawer" role="dialog" aria-modal="true" aria-label="模板库">
          <header class="tpl-head">
            <div class="tpl-heading">
              <span class="tpl-kicker">Template Library</span>
              <h2>模板库</h2>
              <p>选一组参考，应用到创作对话里，一次只带一个模板。</p>
            </div>
            <button type="button" class="tpl-close" aria-label="关闭模板库" @click="close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div class="tpl-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="templateStore.tab === 'builtin'"
              :class="{ active: templateStore.tab === 'builtin' }"
              @click="switchTab('builtin')"
            >
              精选模板
              <span class="tpl-count">{{ BUILTIN_TEMPLATES.length }}</span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="templateStore.tab === 'custom'"
              :class="{ active: templateStore.tab === 'custom' }"
              @click="switchTab('custom')"
            >
              我的模板
              <span class="tpl-count">{{ templateStore.groups.length }}</span>
            </button>
          </div>

          <div v-if="templateStore.tab === 'builtin'" class="tpl-body">
            <div class="tpl-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                v-model="query"
                type="search"
                placeholder="搜索风格、分类或示例片名…"
                autocomplete="off"
                spellcheck="false"
              />
            </div>

            <div class="tpl-categories" role="group" aria-label="模板分类">
              <button
                type="button"
                :class="{ active: category === 'all' }"
                @click="category = 'all'"
              >
                全部
              </button>
              <button
                v-for="item in TEMPLATE_CATEGORIES"
                :key="item.id"
                type="button"
                :class="{ active: category === item.label }"
                @click="category = item.label"
              >
                {{ item.label }}
              </button>
            </div>

            <div class="tpl-grid">
              <button
                v-for="item in filteredTemplates"
                :key="item.id"
                type="button"
                class="tpl-card"
                :class="{
                  selected: selection.kind === 'builtin' && selection.id === item.id,
                  applied: templateStore.isApplied(item.id),
                }"
                @click="selectBuiltin(item)"
              >
                <span class="tpl-poster">
                  <img :src="item.poster" :alt="`${item.name}参考图`" loading="lazy" />
                  <span class="tpl-poster-tag">{{ item.category }}</span>
                  <span v-if="templateStore.isApplied(item.id)" class="tpl-poster-state">已应用</span>
                </span>
                <span class="tpl-card-copy">
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.nameEn }}<template v-if="item.demo"> · {{ item.demo }}</template></small>
                </span>
              </button>
            </div>

            <p v-if="!filteredTemplates.length" class="tpl-empty">
              没有匹配「{{ query }}」的模板，换个关键词试试。
            </p>

            <p v-else class="tpl-credit">
              风格素材来自
              <a href="https://github.com/lemomo-ai/lemo-opuscar" target="_blank" rel="noreferrer">lemo-opuscar</a>
              · LemoLab（海报 CC BY 4.0 / 说明 CC BY-NC 4.0）
            </p>
          </div>

          <div v-else class="tpl-body tpl-custom">
            <div v-if="editorOpen" class="tpl-editor">
              <div class="tpl-editor-head">
                <strong>{{ editorMode === 'new' ? '新建模板分组' : '编辑模板分组' }}</strong>
                <button type="button" class="tpl-text-btn" @click="closeEditor">取消</button>
              </div>
              <input v-model="draftName" class="tpl-field" type="text" placeholder="分组名称，例如「雨夜霓虹参考」" maxlength="40" />
              <textarea
                v-model="draftNote"
                class="tpl-field tpl-textarea"
                rows="3"
                placeholder="写一句这组参考的用法，例如：低饱和蓝绿、湿地面反光、手持跟拍。"
                maxlength="600"
              />

              <div class="tpl-drop">
                <div v-if="draftAssets.length" class="tpl-draft-assets">
                  <div v-for="asset in draftAssets" :key="asset.id" class="tpl-draft-asset">
                    <img
                      v-if="asset.kind === 'image' && asset.url"
                      :src="asset.url"
                      alt=""
                    />
                    <img
                      v-else-if="asset.kind === 'video' && asset.frames?.length"
                      :src="asset.frames[0]"
                      alt=""
                    />
                    <span v-else class="tpl-draft-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                        <path d="M6 3.8h7.5L18.5 9v11.2H6z" />
                        <path d="M13.2 4v5.2h5.2" />
                      </svg>
                    </span>
                    <span class="tpl-draft-name">{{ asset.name }}</span>
                    <button
                      type="button"
                      class="tpl-draft-remove"
                      aria-label="移除素材"
                      @click="removeDraftAsset(asset.id)"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <button type="button" class="tpl-add" :disabled="draftAssets.length >= MAX_ATTACHMENTS || draftPending > 0" @click="draftInputRef?.click()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {{ draftPending > 0 ? '读取中…' : `添加参考素材（${draftAssets.length}/${MAX_ATTACHMENTS}）` }}
                </button>
                <input
                  ref="draftInputRef"
                  class="tpl-file"
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,.txt,.md,.json,.csv,.srt,.pdf"
                  @change="handleDraftInput"
                />
                <p class="tpl-editor-hint">图片、视频、音频、文本都可以，最多 8 个，单个不超过 80MB。</p>
              </div>

              <p v-if="draftError" class="tpl-error">{{ draftError }}</p>

              <div class="tpl-editor-actions">
                <button type="button" class="tpl-secondary" @click="closeEditor">取消</button>
                <button type="button" class="tpl-primary" :disabled="!draftName.trim() || draftPending > 0" @click="saveGroup">
                  保存分组
                </button>
              </div>
            </div>

            <template v-else>
              <button type="button" class="tpl-create" @click="openNew">
                <span class="tpl-create-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span>
                  <strong>新建一组参考素材</strong>
                  <small>把同一支片用到的参考图、视频、音频放在一起</small>
                </span>
              </button>

              <div v-if="templateStore.groups.length" class="tpl-groups">
                <div
                  v-for="group in templateStore.sortedGroups"
                  :key="group.id"
                  class="tpl-group"
                  :class="{
                    selected: selection.kind === 'custom' && selection.id === group.id,
                    applied: templateStore.isApplied(group.id),
                  }"
                  role="button"
                  tabindex="0"
                  @click="selectGroup(group)"
                  @keydown.enter.prevent="selectGroup(group)"
                >
                  <span class="tpl-group-cover">
                    <img v-if="groupCover(group)" :src="groupCover(group)" alt="" />
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
                      <path d="M3.8 15.5 8.6 11l3.4 3 2.8-2.4 5.4 4.1" />
                    </svg>
                  </span>
                  <span class="tpl-group-copy">
                    <strong>{{ group.name }}</strong>
                    <small>{{ group.assets.length }} 个参考素材 · {{ group.note || '还没有说明' }}</small>
                  </span>
                  <span class="tpl-group-actions">
                    <button type="button" class="tpl-text-btn" @click.stop="openEdit(group)">编辑</button>
                    <button type="button" class="tpl-text-btn danger" @click.stop="removeGroup(group)">删除</button>
                  </span>
                  <span v-if="templateStore.isApplied(group.id)" class="tpl-group-state">已应用</span>
                </div>
              </div>

              <div v-else class="tpl-empty custom-empty">
                <strong>还没有自己的模板</strong>
                <p>把常用的参考图、视频关键帧或音频放在一组里，下次一键带到创作对话。</p>
              </div>
            </template>
          </div>

          <footer class="tpl-foot">
            <div class="tpl-selection">
              <template v-if="selectedTemplate">
                <span class="tpl-selection-label">已选择</span>
                <strong>{{ selectedTemplate.name }}</strong>
                <small>{{ selectedTemplate.category }}</small>
              </template>
              <template v-else-if="templateStore.applied">
                <span class="tpl-selection-label">当前应用</span>
                <strong>{{ templateStore.applied.name }}</strong>
                <small>{{ templateStore.applied.category }}</small>
              </template>
              <span v-else class="tpl-selection-empty">选择一个模板后点击应用</span>
            </div>
            <div class="tpl-foot-actions">
              <button
                v-if="templateStore.applied"
                type="button"
                class="tpl-secondary"
                @click="templateStore.clearApplied()"
              >
                取消应用
              </button>
              <button type="button" class="tpl-primary" :disabled="!selectedTemplate" @click="applySelection">
                应用到创作对话
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTemplateStore } from '@/stores/templateStore'
import { useChatModeStore } from '@/stores/chatModeStore'
import { confirmDialog } from '@/features/ui/dialog'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  readAttachment,
} from '@/features/agent/attachments'
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from '@/features/template/builtin'
import type { AgentAttachment } from '@/types/agent'
import type { BuiltinTemplate, UserTemplateGroup } from '@/features/template/types'

const templateStore = useTemplateStore()
const chatMode = useChatModeStore()
const router = useRouter()

const query = ref('')
const category = ref('all')
const selection = reactive<{ kind: 'builtin' | 'custom'; id: string }>({
  kind: 'builtin',
  id: '',
})

const filteredTemplates = computed(() => {
  const text = query.value.trim().toLowerCase()
  return BUILTIN_TEMPLATES.filter((item) => {
    if (category.value !== 'all' && item.category !== category.value) return false
    if (!text) return true
    return [item.name, item.nameEn, item.category, item.categoryEn, item.demo, item.id]
      .join(' ')
      .toLowerCase()
      .includes(text)
  })
})


const selectedBuiltin = computed(() =>
  selection.kind === 'builtin'
    ? BUILTIN_TEMPLATES.find((item) => item.id === selection.id) || null
    : null,
)
const selectedGroup = computed(() =>
  selection.kind === 'custom'
    ? templateStore.groups.find((item) => item.id === selection.id) || null
    : null,
)
const selectedTemplate = computed(() =>
  selectedBuiltin.value || selectedGroup.value
    ? {
        name: selectedBuiltin.value?.name || selectedGroup.value?.name || '',
        category: selectedBuiltin.value?.category || '我的模板',
      }
    : null,
)

function selectBuiltin(item: BuiltinTemplate) {
  selection.kind = 'builtin'
  selection.id = item.id
}

function selectGroup(group: UserTemplateGroup) {
  selection.kind = 'custom'
  selection.id = group.id
}

function switchTab(tab: 'builtin' | 'custom') {
  templateStore.tab = tab
  selection.id = ''
}

function close() {
  templateStore.closeLibrary()
  closeEditor()
}

function applySelection() {
  if (selectedBuiltin.value) templateStore.applyBuiltin(selectedBuiltin.value)
  else if (selectedGroup.value) templateStore.applyGroup(selectedGroup.value)
  else return
  chatMode.setConversation('create')
  selection.id = ''
  templateStore.closeLibrary()
  // 在剪辑台里也直接留在当前页，模板会挂在右侧输入框上；
  // 其它页面统一回对话页，保证用户看到“已带模板的创作对话”。
  if (!router.currentRoute.value.path.startsWith('/edit')) {
    router.push('/chat')
  }
}

/* ------------------------------ 我的模板编辑 ------------------------------ */

const editorOpen = computed(() => !!templateStore.draftGroupId)
const editorMode = computed(() => (templateStore.draftGroupId === 'new' ? 'new' : 'edit'))
const draftName = ref('')
const draftNote = ref('')
const draftAssets = ref<AgentAttachment[]>([])
const draftPending = ref(0)
const draftError = ref('')
const draftInputRef = ref<HTMLInputElement | null>(null)

function resetDraft() {
  draftName.value = ''
  draftNote.value = ''
  draftAssets.value = []
  draftPending.value = 0
  draftError.value = ''
}

function openNew() {
  resetDraft()
  templateStore.startDraftGroup()
}

function openEdit(group: UserTemplateGroup) {
  resetDraft()
  draftName.value = group.name
  draftNote.value = group.note
  draftAssets.value = [...group.assets]
  templateStore.startDraftGroup(group.id)
}

function closeEditor() {
  templateStore.stopDraftGroup()
  resetDraft()
}

function removeDraftAsset(id: string) {
  draftAssets.value = draftAssets.value.filter((item) => item.id !== id)
}

async function handleDraftInput(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  const room = MAX_ATTACHMENTS - draftAssets.value.length
  if (room <= 0) {
    draftError.value = `最多 ${MAX_ATTACHMENTS} 个参考素材。`
    return
  }
  const accepted = files.slice(0, room).filter((file) => file.size <= MAX_ATTACHMENT_BYTES)
  if (!accepted.length) {
    draftError.value = '文件超过 80MB，换一个小一点的再试。'
    return
  }
  draftError.value = ''
  draftPending.value += accepted.length
  for (const file of accepted) {
    try {
      const item = await readAttachment(file)
      draftAssets.value.push(item)
    } catch {
      draftError.value = '有一个文件读取失败，已跳过。'
    } finally {
      draftPending.value = Math.max(0, draftPending.value - 1)
    }
  }
}

function saveGroup() {
  if (!draftName.value.trim() || draftPending.value > 0) return
  const payload = { name: draftName.value, note: draftNote.value, assets: draftAssets.value }
  const group =
    editorMode.value === 'new'
      ? templateStore.createGroup(payload)
      : templateStore.updateGroup(templateStore.draftGroupId || '', payload)
  if (!group) {
    draftError.value = '分组名不能为空。'
    return
  }
  selectGroup(group)
  closeEditor()
}

async function removeGroup(group: UserTemplateGroup) {
  const ok = await confirmDialog({
    title: '删除模板分组',
    message: `删除「${group.name}」？组里的 ${group.assets.length} 个参考素材会一起移除，已上传到本机的文件不受影响。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  templateStore.deleteGroup(group.id)
  if (selection.kind === 'custom' && selection.id === group.id) selection.id = ''
}

function groupCover(group: UserTemplateGroup): string {
  const image = group.assets.find((item) => item.kind === 'image' && item.url)
  if (image) return image.url
  const video = group.assets.find((item) => item.kind === 'video' && item.frames?.length)
  return video?.frames?.[0] || ''
}

let previousOverflow = ''

watch(
  () => templateStore.open,
  (open) => {
    // 抽屉打开时锁住背后的页面滚动，关闭后交还；保留打开前的值，避免和弹窗互相覆盖。
    if (open) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousOverflow
      previousOverflow = ''
      closeEditor()
    }
  },
)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && templateStore.open) {
    event.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.tpl-overlay {
  position: fixed;
  inset: 0;
  z-index: 980;
  display: flex;
  justify-content: flex-end;
  background: rgba(20, 20, 18, 0.18);
  backdrop-filter: blur(2px);
}

.tpl-drawer {
  display: flex;
  width: min(430px, 100vw);
  height: 100%;
  flex-direction: column;
  border-left: 1px solid #e8e8e2;
  background: #ffffff;
  box-shadow: -18px 0 60px rgba(17, 17, 16, 0.12);
}

.tpl-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 20px 20px 14px;
}

.tpl-kicker {
  display: block;
  color: #b4472f;
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.tpl-heading h2 {
  margin: 3px 0 0;
  color: #1d1d1b;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.tpl-heading p {
  margin: 5px 0 0;
  color: #8c8c84;
  font-size: 11.5px;
  line-height: 1.6;
}

.tpl-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  padding: 0;
  border: 1px solid #ecece6;
  border-radius: 50%;
  background: #ffffff;
  color: #8a8a82;
  cursor: pointer;
}

.tpl-close svg {
  width: 14px;
  height: 14px;
}

.tpl-close:hover {
  border-color: #d8d8d0;
  color: #1d1d1b;
}

.tpl-tabs {
  display: flex;
  gap: 4px;
  flex: none;
  padding: 0 16px;
  border-bottom: 1px solid #f0f0ea;
}

.tpl-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #9a9a92;
  font-family: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
}

.tpl-tabs button.active {
  border-bottom-color: #111110;
  color: #1d1d1b;
}

.tpl-count {
  padding: 1px 5px;
  border-radius: 999px;
  background: #f3f3ed;
  color: #9b9b93;
  font-size: 9px;
  font-weight: 600;
}

.tpl-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  scrollbar-width: thin;
}

.tpl-search {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid #ecece6;
  border-radius: 9px;
  background: #fafaf7;
}

.tpl-search svg {
  width: 14px;
  height: 14px;
  flex: none;
  color: #b0b0a8;
}

.tpl-search input {
  width: 100%;
  padding: 9px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #2c2c28;
  font-family: inherit;
  font-size: 12px;
}

.tpl-search input::placeholder {
  color: #b3b3ab;
}

.tpl-categories {
  display: flex;
  gap: 5px;
  margin: 10px 0 12px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 18px), transparent 100%);
}

.tpl-categories::-webkit-scrollbar {
  display: none;
}

.tpl-categories button {
  flex: none;
  padding: 4px 9px;
  border: 1px solid #ecece6;
  border-radius: 999px;
  background: #ffffff;
  color: #7d7d75;
  font-family: inherit;
  font-size: 10.5px;
  white-space: nowrap;
  cursor: pointer;
}

.tpl-categories button:hover {
  border-color: #d8d8d0;
}

.tpl-categories button.active {
  border-color: #111110;
  background: #111110;
  color: #ffffff;
}

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.tpl-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border: 1px solid #ecece6;
  border-radius: 11px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.tpl-card:hover {
  border-color: #d4d4cc;
  box-shadow: 0 8px 20px rgba(17, 17, 16, 0.06);
  transform: translateY(-1px);
}

.tpl-card.selected {
  border-color: #111110;
  box-shadow: 0 0 0 2px rgba(17, 17, 16, 0.08);
}

.tpl-card.applied {
  border-color: #d9a695;
}

.tpl-poster {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #f3f3ed;
}

.tpl-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 260ms ease;
}

.tpl-card:hover .tpl-poster img {
  transform: scale(1.025);
}

.tpl-poster-tag {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.62);
  color: #ffffff;
  font-size: 8.5px;
  font-weight: 550;
  backdrop-filter: blur(4px);
}

.tpl-poster-state {
  position: absolute;
  right: 6px;
  top: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #b4472f;
  color: #ffffff;
  font-size: 8.5px;
  font-weight: 600;
}

.tpl-card-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
  padding: 7px 8px 8px;
}

.tpl-card-copy strong {
  overflow: hidden;
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-card-copy small {
  overflow: hidden;
  color: #a3a39b;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-credit {
  margin: 14px 2px 0;
  color: #b3b3ab;
  font-size: 9px;
  line-height: 1.6;
}

.tpl-credit a {
  color: #9a9a92;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.tpl-credit a:hover {
  color: #b4472f;
}

.tpl-empty {
  margin: 26px 8px;
  color: #9a9a92;
  font-size: 11.5px;
  line-height: 1.7;
  text-align: center;
}

.tpl-custom {
  padding-top: 14px;
}

.tpl-create {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px dashed #dcdcd4;
  border-radius: 11px;
  background: #fbfbf8;
  text-align: left;
  cursor: pointer;
}

.tpl-create:hover {
  border-color: #b4472f;
  background: #fdf9f7;
}

.tpl-create-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: #ffffff;
  color: #b4472f;
  box-shadow: inset 0 0 0 1px #ecdcd3;
}

.tpl-create-icon svg {
  width: 15px;
  height: 15px;
}

.tpl-create strong {
  display: block;
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 600;
}

.tpl-create small {
  display: block;
  margin-top: 1px;
  color: #a3a39b;
  font-size: 9.5px;
}

.tpl-groups {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 12px;
}

.tpl-group {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 1px solid #ecece6;
  border-radius: 10px;
  background: #ffffff;
  cursor: pointer;
}

.tpl-group:hover {
  border-color: #d4d4cc;
}

.tpl-group.selected {
  border-color: #111110;
  box-shadow: 0 0 0 2px rgba(17, 17, 16, 0.06);
}

.tpl-group.applied {
  border-color: #d9a695;
}

.tpl-group-cover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex: none;
  overflow: hidden;
  border-radius: 8px;
  background: #f3f3ed;
  color: #b4472f;
}

.tpl-group-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tpl-group-cover svg {
  width: 18px;
  height: 18px;
}

.tpl-group-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.tpl-group-copy strong {
  overflow: hidden;
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-group-copy small {
  overflow: hidden;
  color: #a3a39b;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-group-actions {
  display: flex;
  flex: none;
  gap: 2px;
}

.tpl-group-state {
  position: absolute;
  right: 6px;
  top: -7px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #b4472f;
  color: #ffffff;
  font-size: 8px;
  font-weight: 600;
}

.tpl-text-btn {
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8c8c84;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.tpl-text-btn:hover {
  background: #f5f5f1;
  color: #1d1d1b;
}

.tpl-text-btn.danger:hover {
  background: #fdf2ef;
  color: #b4472f;
}

.tpl-empty.custom-empty {
  margin-top: 34px;
}

.tpl-empty.custom-empty strong {
  display: block;
  margin-bottom: 4px;
  color: #4a4a44;
  font-size: 12px;
}

.tpl-empty.custom-empty p {
  margin: 0;
}

.tpl-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tpl-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.tpl-editor-head strong {
  color: #1d1d1b;
  font-size: 12.5px;
  font-weight: 600;
}

.tpl-field {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #ecece6;
  border-radius: 9px;
  outline: none;
  background: #ffffff;
  color: #2c2c28;
  font-family: inherit;
  font-size: 12px;
}

.tpl-field:focus {
  border-color: #c9c9c1;
}

.tpl-textarea {
  resize: vertical;
  line-height: 1.6;
}

.tpl-drop {
  padding: 9px;
  border: 1px dashed #dcdcd4;
  border-radius: 10px;
  background: #fbfbf8;
}

.tpl-draft-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}

.tpl-draft-asset {
  position: relative;
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  padding: 3px 20px 3px 3px;
  border: 1px solid #ecece6;
  border-radius: 7px;
  background: #ffffff;
}

.tpl-draft-asset img,
.tpl-draft-icon {
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 5px;
  object-fit: cover;
  background: #f3f3ed;
}

.tpl-draft-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8a8a82;
}

.tpl-draft-icon svg {
  width: 12px;
  height: 12px;
}

.tpl-draft-name {
  overflow: hidden;
  max-width: 110px;
  color: #6b6b63;
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-draft-remove {
  position: absolute;
  right: 2px;
  top: 50%;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: #b0b0a8;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transform: translateY(-50%);
}

.tpl-draft-remove:hover {
  color: #b4472f;
}

.tpl-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid #e4e4dc;
  border-radius: 7px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.tpl-add svg {
  width: 12px;
  height: 12px;
}

.tpl-add:hover:not(:disabled) {
  border-color: #b4472f;
  color: #b4472f;
}

.tpl-add:disabled {
  opacity: 0.5;
  cursor: default;
}

.tpl-file {
  display: none;
}

.tpl-editor-hint {
  margin: 6px 0 0;
  color: #a3a39b;
  font-size: 9.5px;
  line-height: 1.5;
}

.tpl-error {
  margin: 0;
  color: #b4472f;
  font-size: 10.5px;
}

.tpl-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 2px;
}

.tpl-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: none;
  padding: 12px 16px;
  border-top: 1px solid #f0f0ea;
  background: #ffffff;
}

.tpl-selection {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.tpl-selection-label {
  color: #b4472f;
  font-size: 8.5px;
  font-weight: 650;
  letter-spacing: 0.06em;
}

.tpl-selection strong {
  overflow: hidden;
  color: #2a2a26;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-selection small {
  color: #a3a39b;
  font-size: 9.5px;
}

.tpl-selection-empty {
  color: #b0b0a8;
  font-size: 10.5px;
}

.tpl-foot-actions {
  display: flex;
  flex: none;
  gap: 7px;
}

.tpl-primary,
.tpl-secondary {
  padding: 7px 12px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.tpl-primary {
  border: 1px solid #b4472f;
  background: #b4472f;
  color: #ffffff;
}

.tpl-primary:hover:not(:disabled) {
  border-color: #9c3b26;
  background: #9c3b26;
}

.tpl-primary:disabled {
  border-color: #e4d7d1;
  background: #e4d7d1;
  cursor: default;
}

.tpl-secondary {
  border: 1px solid #e7e7e1;
  background: #ffffff;
  color: #6b6b63;
}

.tpl-secondary:hover {
  border-color: #d4d4cc;
  color: #1d1d1b;
}

.tpl-enter-active,
.tpl-leave-active {
  transition: opacity 160ms ease;
}

.tpl-enter-active .tpl-drawer,
.tpl-leave-active .tpl-drawer {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.tpl-enter-from,
.tpl-leave-to {
  opacity: 0;
}

.tpl-enter-from .tpl-drawer,
.tpl-leave-to .tpl-drawer {
  transform: translateX(24px);
}

@media (max-width: 560px) {
  .tpl-drawer {
    width: 100vw;
  }
  .tpl-grid {
    gap: 8px;
  }
  .tpl-foot {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .tpl-foot-actions {
    margin-left: auto;
  }
}
</style>
