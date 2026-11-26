<template>
  <div class="om-zone">
    <section class="om-intro">
      <div class="om-intro-copy">
        <span class="om-kicker">OpenMotion · HyperFrames</span>
        <strong>贴个视频链接，做同款</strong>
        <p>
          从 OpenMotion 的 {{ OPENMOTION_TEMPLATES.length }} 个动效模板直接复刻：保留镜头顺序、节奏与动效语言，
          换成你的品牌和文案。产物是可编辑工程，不是一次性视频。
        </p>
      </div>
      <form class="om-remake" @submit.prevent="startRemake">
        <input
          v-model="remakeUrl"
          type="url"
          placeholder="粘贴参考视频链接，例如 https://…/clip.mp4"
          aria-label="参考视频链接"
          spellcheck="false"
        />
        <button type="submit" :disabled="!remakeUrl.trim()">做同款</button>
      </form>
    </section>

    <div class="om-toolbar">
      <label class="om-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input v-model="query" type="search" placeholder="搜索模板名、品牌、风格或标签" aria-label="搜索 OpenMotion 模板" />
      </label>
      <div class="om-sort" role="group" aria-label="排序">
        <button
          v-for="option in SORTS"
          :key="option.value"
          type="button"
          :class="{ active: sort === option.value }"
          @click="sort = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <label class="om-editable">
        <input v-model="editableOnly" type="checkbox" />
        <span>只看可编辑工程（{{ editableCount }}）</span>
      </label>
    </div>

    <div class="om-filters" role="group" aria-label="按标签筛选">
      <button type="button" :class="{ active: tag === '' }" @click="tag = ''">全部</button>
      <button
        v-for="item in tagOptions"
        :key="item.value"
        type="button"
        :class="{ active: tag === item.value }"
        @click="tag = item.value"
      >
        {{ item.value }}<span>{{ item.count }}</span>
      </button>
    </div>

    <p v-if="notice" class="om-notice">{{ notice }}</p>

    <div v-if="filtered.length" class="om-grid">
      <article
        v-for="template in filtered"
        :key="template.id"
        class="om-card"
        tabindex="0"
        role="button"
        @click="openDetail(template)"
        @keydown.enter="openDetail(template)"
      >
        <div class="om-cover">
          <img
            v-if="template.cover && !brokenCovers.has(template.id)"
            :src="motionAssetUrl(template.cover)"
            :alt="template.name"
            loading="lazy"
            @error="brokenCovers.add(template.id)"
          />
          <div v-else class="om-cover-fallback">{{ template.name.slice(0, 2) }}</div>
          <span v-if="template.editable" class="om-badge om-badge--edit">可编辑工程</span>
          <span v-else class="om-badge">参考复刻</span>
          <span class="om-duration">{{ formatDuration(template.duration) }}</span>
        </div>
        <div class="om-card-body">
          <h3>{{ template.name }}</h3>
          <p>{{ template.summary || template.style }}</p>
          <div class="om-tags">
            <span v-for="value in openMotionTags(template).slice(0, 3)" :key="value">{{ value }}</span>
          </div>
        </div>
      </article>
    </div>

    <p v-else class="om-empty">没有匹配的模板，换个关键词或清空筛选。</p>

    <div
      v-if="detail"
      class="om-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`模板 ${detail.name}`"
      @click.self="closeDetail"
    >
      <div class="om-sheet">
        <header class="om-sheet-head">
          <div>
            <span class="om-kicker">{{ detail.editable ? 'Editable Project' : 'Motion Reference' }}</span>
            <h2>{{ detail.name }}</h2>
            <p>{{ detail.summary }}</p>
          </div>
          <button type="button" class="om-close" aria-label="关闭" @click="closeDetail">×</button>
        </header>

        <div class="om-sheet-body">
          <div class="om-sheet-preview">
            <video
              v-if="detail.video"
              :src="motionAssetUrl(detail.video)"
              :poster="motionAssetUrl(detail.cover)"
              controls
              playsinline
              preload="metadata"
            />
            <div class="om-meta">
              <span>{{ formatDuration(detail.duration) }}</span>
              <span>{{ detail.width }}×{{ detail.height }}</span>
              <span v-if="detail.brand">{{ detail.brand }}</span>
              <span v-for="color in detail.colors.slice(0, 4)" :key="color">{{ color }}</span>
            </div>
            <dl class="om-facts">
              <div v-if="detail.style">
                <dt>风格</dt>
                <dd>{{ detail.style }}</dd>
              </div>
              <div v-if="detail.reviewFocus">
                <dt>复刻重点</dt>
                <dd>{{ detail.reviewFocus }}</dd>
              </div>
              <div v-if="detail.sourceUrl">
                <dt>原作</dt>
                <dd>
                  <a :href="detail.sourceUrl" target="_blank" rel="noreferrer noopener">查看来源与署名</a>
                </dd>
              </div>
            </dl>
          </div>

          <div class="om-sheet-doc">
            <div class="om-doc-head">
              <strong>motion.md</strong>
              <span v-if="docLoading">读取中…</span>
              <span v-else-if="docError" class="om-error">{{ docError }}</span>
              <span v-else>{{ docLines }} 行动效说明</span>
            </div>
            <pre v-if="doc" class="om-doc">{{ doc }}</pre>
            <p v-else-if="!docLoading" class="om-empty om-empty--small">
              这条模板没有公开 motion.md，仍可按参考视频与复刻重点创作。
            </p>
          </div>
        </div>

        <footer class="om-sheet-foot">
          <p>参考素材版权归原作者；改编产物属于独立再创作，请保留署名。</p>
          <div class="om-actions">
            <button type="button" class="om-ghost" :disabled="creating" @click="createProject">
              {{ creating ? '正在准备工程…' : '直接建可编辑工程' }}
            </button>
            <button type="button" class="om-primary" @click="recreate(detail)">复刻模板</button>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { OPENMOTION_TEMPLATES } from '@/features/template/openmotionCatalog'
import {
  buildOpenMotionHandoff,
  buildReferenceRemakePrompt,
  openMotionTags,
  type OpenMotionTemplate,
} from '@/features/template/openmotionTypes'
import { createMotionProject, motionAssetUrl, fetchMotionText } from '@/api/motion'
import { flashComposerPrompt } from '@/features/template/navigation'
import { useChatModeStore } from '@/stores/chatModeStore'
import { useEditProjectStore } from '@/stores/editProjectStore'

const SORTS = [
  { value: 'curated', label: '推荐' },
  { value: 'short', label: '短片优先' },
  { value: 'long', label: '长片优先' },
] as const

const router = useRouter()
const chatMode = useChatModeStore()
const projects = useEditProjectStore()

const query = ref('')
const tag = ref('')
const sort = ref<(typeof SORTS)[number]['value']>('curated')
const editableOnly = ref(false)
const remakeUrl = ref('')
const notice = ref('')
const creating = ref(false)
const brokenCovers = ref(new Set<string>())

const detail = ref<OpenMotionTemplate | null>(null)
const doc = ref('')
const docLoading = ref(false)
const docError = ref('')

const editableCount = computed(() => OPENMOTION_TEMPLATES.filter((item) => item.editable).length)

const tagOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const template of OPENMOTION_TEMPLATES) {
    for (const value of openMotionTags(template)) counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([value, count]) => ({ value, count }))
})

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const list = OPENMOTION_TEMPLATES.filter((template) => {
    if (editableOnly.value && !template.editable) return false
    if (tag.value && !openMotionTags(template).includes(tag.value)) return false
    if (!keyword) return true
    const haystack = [template.name, template.summary, template.style, template.brand, template.useCase, template.presentation, template.reviewFocus]
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })
  if (sort.value === 'short') return [...list].sort((a, b) => a.duration - b.duration)
  if (sort.value === 'long') return [...list].sort((a, b) => b.duration - a.duration)
  return list
})

const docLines = computed(() => (doc.value ? doc.value.split('\n').length : 0))

function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

async function openDetail(template: OpenMotionTemplate) {
  detail.value = template
  doc.value = ''
  docError.value = ''
  if (!template.motionDoc) return
  docLoading.value = true
  try {
    doc.value = await fetchMotionText(template.motionDoc)
  } catch (error) {
    docError.value = String((error as Error)?.message || error)
  } finally {
    docLoading.value = false
  }
}

function closeDetail() {
  detail.value = null
  doc.value = ''
}

function recreate(template: OpenMotionTemplate) {
  chatMode.setConversation('create')
  flashComposerPrompt(buildOpenMotionHandoff(template))
  notice.value = '已把完整复刻要求放进创作对话输入框，确认后发送。'
  void router.push('/chat')
}

function startRemake() {
  const url = remakeUrl.value.trim()
  if (!url) return
  chatMode.setConversation('create')
  flashComposerPrompt(buildReferenceRemakePrompt(url))
  remakeUrl.value = ''
  notice.value = '已把参考链接和复刻要求放进创作对话输入框。'
  void router.push('/chat')
}

async function createProject() {
  const template = detail.value
  if (!template || creating.value) return
  creating.value = true
  try {
    const project = await createMotionProject({
      name: template.name,
      template,
      width: template.width,
      height: template.height,
    })
    const editProject = projects.createProject(template.name)
    projects.appendAsset(
      editProject.id,
      {
        kind: 'motion',
        name: `${template.name}.动效工程`,
        url: project.entryUrl || '',
        motionId: project.id,
        thumbnail: motionAssetUrl(template.cover),
        source: 'library',
      },
      { duration: template.duration || undefined },
    )
    closeDetail()
    void router.push(`/edit/${editProject.id}`)
    notice.value = `已创建动效工程「${template.name}」，在时间轴继续编辑。`
  } catch (error) {
    notice.value = `创建工程失败：${String((error as Error)?.message || error)}`
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.om-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 40px;
}

.om-intro {
  display: flex;
  gap: 24px;
  align-items: flex-end;
  justify-content: space-between;
  padding: 20px 22px;
  border: 1px solid #eadfd7;
  border-radius: 18px;
  background: linear-gradient(120deg, #fffaf6 0%, #fff 60%);
}

.om-intro-copy {
  max-width: 640px;
}

.om-kicker {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #b06a4c;
}

.om-intro-copy strong {
  display: block;
  margin: 6px 0 6px;
  font-family: 'Instrument Serif', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 500;
  color: #2c2521;
}

.om-intro-copy p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #7a6a60;
}

.om-remake {
  display: flex;
  gap: 8px;
  min-width: 340px;
}

.om-remake input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e4d5cb;
  border-radius: 10px;
  background: #fff;
  font-size: 12.5px;
  color: #2c2521;
}

.om-remake input:focus {
  outline: none;
  border-color: #d08a68;
  box-shadow: 0 0 0 3px rgba(208, 138, 104, 0.14);
}

.om-remake button {
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #b45f3c;
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.om-remake button:disabled {
  opacity: 0.45;
  cursor: default;
}

.om-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.om-search {
  display: flex;
  flex: 1;
  min-width: 240px;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid #e8ded7;
  border-radius: 999px;
  background: #fff;
}

.om-search svg {
  width: 15px;
  height: 15px;
  color: #a3948a;
  flex: none;
}

.om-search input {
  flex: 1;
  border: 0;
  background: transparent;
  font-size: 12.5px;
  color: #2c2521;
  outline: none;
}

.om-sort {
  display: flex;
  padding: 3px;
  border: 1px solid #e8ded7;
  border-radius: 999px;
  background: #fff;
}

.om-sort button {
  padding: 5px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 12px;
  color: #8b7c72;
  cursor: pointer;
}

.om-sort button.active {
  background: #f6ece5;
  color: #9c4f31;
  font-weight: 600;
}

.om-editable {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #7a6a60;
  cursor: pointer;
}

.om-editable input {
  accent-color: #b45f3c;
}

.om-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.om-filters button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 5px 11px;
  border: 1px solid #e8ded7;
  border-radius: 999px;
  background: #fff;
  font-size: 11.5px;
  color: #7a6a60;
  cursor: pointer;
}

.om-filters button span {
  font-size: 10px;
  color: #b3a49a;
}

.om-filters button.active {
  border-color: #d8a187;
  background: #fdf3ed;
  color: #9c4f31;
}

.om-notice {
  margin: 0;
  padding: 9px 13px;
  border-left: 2px solid #dfaa94;
  background: #fff7f2;
  font-size: 12px;
  color: #8a5a44;
}

.om-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
  gap: 16px;
}

.om-card {
  overflow: hidden;
  border: 1px solid #ece2db;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.om-card:hover,
.om-card:focus-visible {
  transform: translateY(-2px);
  border-color: #dcb6a2;
  box-shadow: 0 10px 24px rgba(90, 58, 42, 0.09);
  outline: none;
}

.om-cover {
  position: relative;
  aspect-ratio: 16 / 10;
  background: #f4ece7;
}

.om-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.om-cover-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  font-family: 'Instrument Serif', serif;
  font-size: 34px;
  color: #c3a696;
}

.om-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(24, 20, 18, 0.62);
  color: #fff;
  font-size: 10px;
  letter-spacing: 0.02em;
}

.om-badge--edit {
  background: rgba(180, 95, 60, 0.9);
}

.om-duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(24, 20, 18, 0.66);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.om-card-body {
  padding: 11px 12px 13px;
}

.om-card-body h3 {
  margin: 0 0 5px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: #2c2521;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.om-card-body p {
  margin: 0 0 8px;
  font-size: 11.5px;
  line-height: 1.55;
  color: #8a7c73;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.om-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.om-tags span {
  padding: 2px 7px;
  border-radius: 4px;
  background: #faf4ef;
  font-size: 10px;
  color: #9a7f70;
}

.om-empty {
  padding: 48px 0;
  text-align: center;
  font-size: 12.5px;
  color: #a3948a;
}

.om-empty--small {
  padding: 12px 0;
  text-align: left;
}

.om-modal {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(32, 24, 19, 0.42);
  backdrop-filter: blur(3px);
}

.om-sheet {
  display: flex;
  flex-direction: column;
  width: min(1080px, 100%);
  max-height: 88vh;
  border-radius: 18px;
  background: #fffdfb;
  box-shadow: 0 24px 80px rgba(40, 24, 16, 0.28);
  overflow: hidden;
}

.om-sheet-head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid #f0e6df;
}

.om-sheet-head h2 {
  margin: 4px 0 4px;
  font-family: 'Instrument Serif', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 500;
  color: #2c2521;
}

.om-sheet-head p {
  margin: 0;
  font-size: 12px;
  color: #8a7c73;
}

.om-close {
  border: 0;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  color: #a3948a;
  cursor: pointer;
}

.om-sheet-body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 18px;
  padding: 18px 22px;
  overflow: auto;
}

.om-sheet-preview video {
  width: 100%;
  border-radius: 12px;
  background: #14100e;
}

.om-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}

.om-meta span {
  padding: 3px 8px;
  border-radius: 999px;
  background: #f7efe9;
  font-size: 10.5px;
  color: #8a6a58;
}

.om-facts {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.om-facts div {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 10px;
  font-size: 11.5px;
  line-height: 1.6;
}

.om-facts dt {
  color: #b09a8c;
}

.om-facts dd {
  margin: 0;
  color: #5f5148;
}

.om-facts a {
  color: #a3542f;
}

.om-sheet-doc {
  min-height: 220px;
  padding: 12px 14px;
  border: 1px solid #f0e6df;
  border-radius: 12px;
  background: #fffaf6;
}

.om-doc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: #a3948a;
}

.om-doc-head strong {
  font-size: 12px;
  color: #5f5148;
}

.om-doc {
  margin: 10px 0 0;
  max-height: 46vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.7;
  color: #5c4d44;
}

.om-error {
  color: #b4472c;
}

.om-sheet-foot {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px 18px;
  border-top: 1px solid #f0e6df;
}

.om-sheet-foot p {
  margin: 0;
  font-size: 10.5px;
  color: #a3948a;
}

.om-actions {
  display: flex;
  gap: 8px;
  flex: none;
}

.om-ghost,
.om-primary {
  padding: 9px 16px;
  border-radius: 9px;
  font-size: 12.5px;
  cursor: pointer;
}

.om-ghost {
  border: 1px solid #e2d3c9;
  background: #fff;
  color: #6a584d;
}

.om-primary {
  border: 0;
  background: #b45f3c;
  color: #fff;
  font-weight: 600;
}

.om-primary:disabled,
.om-ghost:disabled {
  opacity: 0.5;
  cursor: default;
}

@media (max-width: 900px) {
  .om-intro {
    flex-direction: column;
    align-items: stretch;
  }

  .om-remake {
    min-width: 0;
  }

  .om-sheet-body {
    grid-template-columns: 1fr;
  }
}
</style>
