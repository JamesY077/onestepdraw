<template>
  <div class="tpl-page">
    <header class="tpl-head">
      <div class="tpl-head-row">
        <button type="button" class="tpl-back" aria-label="返回上一页" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 5 7.5 12l7 7" />
          </svg>
          <span>返回</span>
        </button>
        <div class="tpl-heading">
          <span class="tpl-kicker">Template Library</span>
          <h2>模板库</h2>
          <p>
            {{ BUILTIN_TEMPLATES.length }} 种风格
            <template v-if="stillCount"> · {{ stillCount }} 张静帧</template>
            <template v-if="generatedCount"> · {{ generatedCount }} 张 AI 示例</template>
          </p>
        </div>
        <label v-if="templateStore.tab === 'builtin'" class="tpl-search tpl-search--head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            v-model="query"
            type="search"
            placeholder="搜索风格、编号或分类，例如 水墨 / B3…"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
      </div>

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
        <button
          type="button"
          role="tab"
          :aria-selected="templateStore.tab === 'skill'"
          :class="{ active: templateStore.tab === 'skill' }"
          @click="switchTab('skill')"
        >
          Skill 专区
          <span class="tpl-count">{{ libraryStore.allSkills.length }}</span>
        </button>
      </div>
    </header>

    <div v-if="templateStore.tab === 'builtin'" class="tpl-body">
      <div class="tpl-filters">
        <div class="tpl-categories" role="group" aria-label="模板分类">
          <button type="button" :class="{ active: category === 'all' }" @click="category = 'all'">
            全部
            <span class="tpl-count">{{ BUILTIN_TEMPLATES.length }}</span>
          </button>
          <button
            v-for="item in TEMPLATE_CATEGORIES"
            :key="item.id"
            type="button"
            :class="{ active: category === item.label }"
            @click="category = item.label"
          >
            {{ item.label }}
            <span class="tpl-count">{{ categoryCounts[item.label] || 0 }}</span>
          </button>
        </div>
      </div>

      <p class="tpl-result">
        {{ category === 'all' ? '全部风格' : category }} · {{ filteredTemplates.length }} 个
        <span v-if="query.trim()">· 匹配「{{ query.trim() }}」</span>
      </p>

      <div class="tpl-grid">
        <button
          v-for="item in filteredTemplates"
          :key="item.id"
          type="button"
          class="tpl-card"
          :class="{
            selected: isSelected(item.id),
            applied: templateStore.isApplied(item.id),
          }"
          @click="toggleSelected(item.id)"
        >
          <span class="tpl-poster">
            <img
              v-if="!brokenPosters.has(item.id)"
              :src="templatePosterUrl(item.poster)"
              :alt="`${item.name}参考图`"
              loading="lazy"
              decoding="async"
              @error="markPosterBroken(item.id)"
            />
            <span v-else class="tpl-poster-fallback" aria-hidden="true">
              <em>{{ item.code }}</em>
              <span>{{ item.name }}</span>
            </span>
            <span class="tpl-poster-tag">{{ item.category }}</span>
            <span v-if="item.generated" class="tpl-poster-still">AI 示例</span>
            <span v-else-if="!item.still" class="tpl-poster-still">文字参考</span>
            <span v-if="templateStore.isApplied(item.id)" class="tpl-poster-state">已应用</span>
            <span v-if="isSelected(item.id)" class="tpl-poster-pick" aria-hidden="true">✓</span>
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
        风格提示词来自
        <a href="https://github.com/XiaoyeCodes/code-animation-prompts" target="_blank" rel="noreferrer">code-animation-prompts</a>
        （原素材整理 俯仰观照）· 没有静帧的条目由 Seedream 5.0 Lite 生成示例图 · 免费分享，请勿转售
      </p>
    </div>

      <div v-else-if="templateStore.tab === 'skill'" class="tpl-body tpl-skill-wrap">
        <SkillZone />
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
                selected: isSelected(group.id),
                applied: templateStore.isApplied(group.id),
              }"
              role="button"
              tabindex="0"
              @click="toggleSelected(group.id)"
              @keydown.enter.prevent="toggleSelected(group.id)"
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

      <footer v-if="templateStore.tab !== 'skill'" class="tpl-foot">
        <div class="tpl-selection">
          <template v-if="selectedCount">
            <span class="tpl-selection-label">已选 {{ selectedCount }} 个</span>
            <strong>{{ selectedNames.join('、') }}</strong>
            <small>可继续点选，数量不限；应用后一起引用到创作对话</small>
          </template>
          <template v-else-if="templateStore.applied.length">
            <span class="tpl-selection-label">当前引用 {{ templateStore.applied.length }} 个</span>
            <strong>{{ appliedNames }}</strong>
            <small>输入框里会以 @模板N 的形式挂成引用</small>
          </template>
          <span v-else class="tpl-selection-empty">点选模板，可多选，数量不限</span>
        </div>
        <div class="tpl-foot-actions">
          <button
            v-if="templateStore.applied.length"
            type="button"
            class="tpl-secondary"
            @click="templateStore.clearApplied()"
          >
            清空已引用
          </button>
          <button type="button" class="tpl-primary" :disabled="!selectedCount" @click="applySelection">
            引用选中模板
          </button>
        </div>
      </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTemplateStore } from '@/stores/templateStore'
import { useChatModeStore } from '@/stores/chatModeStore'
import { useSkillLibraryStore } from '@/stores/skillLibraryStore'
import SkillZone from '@/components/template/SkillZone.vue'
import { confirmDialog } from '@/features/ui/dialog'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  readAttachment,
} from '@/features/agent/attachments'
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from '@/features/template/builtin'
import { templatePosterUrl } from '@/features/template/poster'
import {
  clearTemplatesReturn,
  flashTemplatesApplied,
  peekTemplatesReturn,
  rememberTemplatesReturn,
  sanitizeReturnPath,
} from '@/features/template/navigation'
import type { AgentAttachment } from '@/types/agent'
import type { BuiltinTemplate, UserTemplateGroup } from '@/features/template/types'

const templateStore = useTemplateStore()
const chatMode = useChatModeStore()
const libraryStore = useSkillLibraryStore()
const router = useRouter()
const route = useRoute()

const query = ref('')
const category = ref('all')
/** 可以一次选多个模板，没有数量上限。 */
const selectedIds = ref<string[]>([])
/** 海报加载失败的条目，退回带编号的占位卡，避免出现空白框。 */
const brokenPosters = ref<Set<string>>(new Set())

function markPosterBroken(id: string) {
  const next = new Set(brokenPosters.value)
  next.add(id)
  brokenPosters.value = next
}

const stillCount = computed(() => BUILTIN_TEMPLATES.filter((item) => item.still).length)
const generatedCount = computed(() => BUILTIN_TEMPLATES.filter((item) => item.generated).length)

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const item of BUILTIN_TEMPLATES) {
    counts[item.category] = (counts[item.category] || 0) + 1
  }
  return counts
})

const filteredTemplates = computed(() => {
  const text = query.value.trim().toLowerCase()
  return BUILTIN_TEMPLATES.filter((item) => {
    if (category.value !== 'all' && item.category !== category.value) return false
    if (!text) return true
    return [item.name, item.code, item.category, item.categoryEn, item.demo, item.id]
      .join(' ')
      .toLowerCase()
      .includes(text)
  })
})

const selectedBuiltinList = computed(() =>
  selectedIds.value
    .map((id) => BUILTIN_TEMPLATES.find((item) => item.id === id))
    .filter((item): item is BuiltinTemplate => !!item),
)
const selectedGroupList = computed(() =>
  selectedIds.value
    .map((id) => templateStore.groups.find((group) => group.id === id))
    .filter((group): group is UserTemplateGroup => !!group),
)
const selectedCount = computed(() => selectedBuiltinList.value.length + selectedGroupList.value.length)
const selectedNames = computed(() => [
  ...selectedBuiltinList.value.map((item) => item.name),
  ...selectedGroupList.value.map((item) => item.name),
])
const appliedNames = computed(() => templateStore.applied.map((item) => item.name).join('、'))

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

function toggleSelected(id: string) {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function switchTab(tab: 'builtin' | 'custom' | 'skill') {
  templateStore.tab = tab
  selectedIds.value = []
}

/** 打开模板库时带的返回地址（例如从剪辑台进来）。 */
function fromPath(): string {
  const from = sanitizeReturnPath(route.query.from)
  return from || peekTemplatesReturn()
}

/** 引用完 / 点返回时，带着选择回到原来的对话或剪辑台。 */
function navigateBack(fallback: 'history' | 'chat') {
  const back = fromPath()
  clearTemplatesReturn()
  if (back && (fallback === 'history' || hasComposer(back))) {
    router.replace(back)
    return
  }
  // 直接打开模板库时没有来源页：引用完一律回到创作对话，别退到浏览器上一页。
  if (fallback === 'chat') {
    router.replace('/chat')
    return
  }
  if (window.history.length > 1) router.back()
  else router.replace('/chat')
}

/** 只有带输入框的页面才值得把模板带回去。 */
function hasComposer(path: string): boolean {
  return /^\/(chat|edit|video|image|voice)(\/|$|\?)/.test(path)
}

function goBack() {
  closeEditor()
  navigateBack('history')
}

function applySelection() {
  if (!selectedCount.value) return
  const names = [...selectedNames.value]
  for (const template of selectedBuiltinList.value) templateStore.applyBuiltin(template)
  for (const group of selectedGroupList.value) templateStore.applyGroup(group)
  chatMode.setConversation('create')
  selectedIds.value = []
  // 目标页面读到这条提示后会聚焦输入框，并把模板挂在输入框上方。
  flashTemplatesApplied({ count: names.length, names })
  navigateBack('chat')
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
  if (!isSelected(group.id)) selectedIds.value = [...selectedIds.value, group.id]
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
  selectedIds.value = selectedIds.value.filter((id) => id !== group.id)
}

function groupCover(group: UserTemplateGroup): string {
  const image = group.assets.find((item) => item.kind === 'image' && item.url)
  if (image) return image.url
  const video = group.assets.find((item) => item.kind === 'video' && item.frames?.length)
  return video?.frames?.[0] || ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (editorOpen.value) {
    event.preventDefault()
    closeEditor()
    return
  }
  if (selectedIds.value.length) {
    event.preventDefault()
    selectedIds.value = []
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  const tab = String(route.query.tab || '')
  if (tab === 'custom' || tab === 'skill' || tab === 'builtin') templateStore.tab = tab
  // 记住入口，哪怕之后刷新 / 直接重开模板库也能原路返回。
  rememberTemplatesReturn(String(route.query.from || ''))
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.tpl-page {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  flex-direction: column;
  background: #fbfbf8;
}

.tpl-head {
  position: sticky;
  top: 0;
  z-index: 30;
  flex: none;
  border-bottom: 1px solid #ecece6;
  background: rgba(251, 251, 248, 0.94);
  backdrop-filter: blur(12px);
}

.tpl-head-row {
  display: flex;
  max-width: 1480px;
  align-items: flex-start;
  gap: 16px;
  margin: 0 auto;
  padding: 20px 28px 12px;
}

.tpl-back {
  display: inline-flex;
  height: 30px;
  flex: none;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  padding: 0 10px 0 6px;
  border: 1px solid #e7e7e1;
  border-radius: 999px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.tpl-back svg {
  width: 15px;
  height: 15px;
}

.tpl-back:hover {
  border-color: #d4d4cc;
  color: #1d1d1b;
}

.tpl-kicker {
  display: block;
  color: #b4472f;
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.tpl-heading {
  min-width: 0;
  flex: 1;
}

.tpl-heading h2 {
  margin: 4px 0 0;
  color: #1d1d1b;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.tpl-heading p {
  margin: 5px 0 0;
  color: #8c8c84;
  font-size: 11.5px;
  line-height: 1.6;
}


.tpl-tabs {
  display: flex;
  max-width: 1480px;
  gap: 4px;
  margin: 0 auto;
  padding: 0 28px;
}

.tpl-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 10px 12px;
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

.tpl-skill-wrap {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding-bottom: 96px;
}

.tpl-skill-wrap :deep(.sz-zone) {
  overflow: visible;
  padding: 0;
}

.tpl-skill-wrap :deep(.sz-list) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
  gap: 12px;
}

.tpl-body {
  width: 100%;
  max-width: 1480px;
  flex: 1;
  margin: 0 auto;
  padding: 18px 28px 96px;
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

.tpl-search--head {
  width: min(340px, 32vw);
  flex: none;
  margin-top: 8px;
  background: #ffffff;
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

.tpl-filters {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.tpl-categories {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 18px), transparent 100%);
}

.tpl-result {
  margin: 0 0 12px;
  color: #a3a39b;
  font-size: 11px;
}

.tpl-categories::-webkit-scrollbar {
  display: none;
}

.tpl-categories button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 6px 11px;
  border: 1px solid #ecece6;
  border-radius: 999px;
  background: #ffffff;
  color: #7d7d75;
  font-family: inherit;
  font-size: 11.5px;
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

.tpl-categories .tpl-count {
  background: transparent;
  padding: 0;
  font-size: 9px;
  color: #b0b0a8;
}

.tpl-categories button.active .tpl-count {
  color: rgba(255, 255, 255, 0.62);
}

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 16px;
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
  aspect-ratio: 16 / 9;
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

/* 海报加载失败时的兜底：至少还能看到编号与风格名。 */
.tpl-poster-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background:
    radial-gradient(circle at 22% 18%, rgba(180, 85, 58, 0.12), transparent 58%),
    linear-gradient(135deg, #f7f4ef, #efeae3);
  color: #8d8179;
}

.tpl-poster-fallback em {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.72);
  color: #8f5340;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tpl-poster-fallback span {
  font-size: 9.5px;
  font-weight: 550;
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

.tpl-poster-pick {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 999px;
  background: #111110;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

/* 没有参考静帧时明确标出来，避免把占位图当成真实截图。 */
.tpl-poster-still {
  position: absolute;
  left: 6px;
  top: 6px;
  padding: 2px 6px;
  border: 1px solid rgba(17, 17, 16, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #6b6b63;
  font-size: 8.5px;
  font-weight: 550;
  backdrop-filter: blur(4px);
}

.tpl-card-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px 10px;
}

.tpl-card-copy strong {
  overflow: hidden;
  color: #2a2a26;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpl-card-copy small {
  overflow: hidden;
  color: #a3a39b;
  font-size: 10px;
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
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  margin-top: auto;
  padding: 12px max(28px, calc((100vw - 1480px) / 2 + 28px));
  border-top: 1px solid #ecece6;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
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
  padding: 8px 16px;
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

@media (max-width: 900px) {
  .tpl-head-row {
    flex-wrap: wrap;
    padding: 16px 18px 10px;
  }
  .tpl-search--head {
    order: 3;
    width: 100%;
    margin-top: 4px;
  }
  .tpl-tabs {
    padding: 0 18px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tpl-tabs::-webkit-scrollbar {
    display: none;
  }
  .tpl-body {
    padding: 16px 18px 88px;
  }
  .tpl-skill-wrap :deep(.sz-list) {
    grid-template-columns: minmax(0, 1fr);
  }
  .tpl-filters {
    align-items: flex-start;
  }
  .tpl-categories {
    width: 100%;
    max-width: 100%;
  }
  .tpl-result {
    padding-left: 2px;
  }
  .tpl-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }
  .tpl-foot {
    flex-wrap: wrap;
    row-gap: 8px;
    padding: 10px 18px;
  }
  .tpl-foot-actions {
    margin-left: auto;
  }
}
</style>
