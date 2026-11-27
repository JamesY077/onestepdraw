<template>
  <section class="mi" aria-label="动效工程">
    <header class="mi-head">
      <span class="mi-tag">HyperFrames 动效工程</span>
      <a v-if="state.meta?.sourceUrl" :href="state.meta.sourceUrl" target="_blank" rel="noreferrer noopener">
        原作署名
      </a>
    </header>

    <p v-if="state.error" class="mi-error">{{ state.error }}</p>

    <div class="mi-preview">
      <hyperframes-player
        v-if="previewUrl"
        :key="previewKey"
        ref="playerRef"
        :src="previewUrl"
        :width="state.meta?.width || 1280"
        :height="state.meta?.height || 720"
        controls
        style="width: 100%; aspect-ratio: 16 / 10; background: #111"
        @ready="readLayers"
      />
      <span v-else class="mi-loading">{{ state.loading ? '读取工程中…' : '工程不可用' }}</span>
    </div>

    <!-- 对应 Studio 的 Layers：直接列出工程里可点选的图层，不用回画布盲找。 -->
    <div v-if="layers.length" class="mi-block">
      <div class="mi-review-head">
        <strong>图层</strong>
        <span class="mi-layer-count">{{ layers.length }}</span>
      </div>
      <ul class="mi-layers">
        <li v-for="layer in layers" :key="layer.key">
          <button
            type="button"
            class="mi-layer"
            :class="{ active: layer.key === activeLayerKey }"
            :title="layer.label"
            @click="pickLayer(layer)"
          >
            <span class="mi-layer-tag">{{ layer.tag }}</span>
            <span class="mi-layer-label">{{ layer.label }}</span>
          </button>
        </li>
      </ul>
      <p class="mi-hint">点图层会在预览里描边定位；文字改动仍走源码或发给 AI。</p>
    </div>

    <div v-if="state.variables.length" class="mi-block">
      <strong>模板参数</strong>
      <label v-for="variable in state.variables" :key="variable.id" class="mi-field">
        <span>{{ variable.label }}</span>
        <input
          v-if="variable.type === 'color'"
          type="color"
          :value="String(draft[variable.id] ?? variable.default ?? '#e2794f')"
          @change="commit(variable.id, ($event.target as HTMLInputElement).value)"
        />
        <select
          v-else-if="variable.type === 'enum'"
          :value="String(draft[variable.id] ?? variable.default ?? '')"
          @change="commit(variable.id, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in variable.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input
          v-else-if="variable.type === 'boolean'"
          type="checkbox"
          :checked="Boolean(draft[variable.id] ?? variable.default)"
          @change="commit(variable.id, ($event.target as HTMLInputElement).checked)"
        />
        <input
          v-else-if="variable.type === 'number'"
          type="number"
          step="0.1"
          :value="Number(draft[variable.id] ?? variable.default ?? 0)"
          @change="commit(variable.id, Number(($event.target as HTMLInputElement).value))"
        />
        <textarea
          v-else
          rows="2"
          :value="String(draft[variable.id] ?? variable.default ?? '')"
          @change="commit(variable.id, ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <p v-if="paramNotice" class="mi-note">{{ paramNotice }}</p>
    </div>

    <div class="mi-block">
      <button type="button" class="mi-toggle" @click="sourceOpen = !sourceOpen">
        {{ sourceOpen ? '收起源码' : '查看 / 修改工程源码' }}
      </button>
      <template v-if="sourceOpen">
        <textarea v-model="sourceDraft" class="mi-source" spellcheck="false" rows="14" />
        <div class="mi-row">
          <button type="button" class="mi-ghost" :disabled="state.saving" @click="reloadSource">还原</button>
          <button type="button" class="mi-primary" :disabled="state.saving" @click="saveSource">
            {{ state.saving ? '保存中…' : '保存并刷新预览' }}
          </button>
        </div>
      </template>
    </div>

    <div class="mi-block">
      <div class="mi-review-head">
        <strong>复查校验</strong>
        <span v-if="reviewSummary" class="mi-review-summary" :class="{ bad: reviewSummary.errorCount > 0 }">
          {{ reviewSummary.errorCount }} error · {{ reviewSummary.warningCount }} warning
        </span>
      </div>
      <p class="mi-hint">官方 HyperFrames check 复查字体、运行时与对比度，并额外检查 5% 动作安全区、10% 文字安全区、文字重叠与过近。</p>
      <div class="mi-row mi-review-actions">
        <button type="button" class="mi-primary" :disabled="reviewRunning" @click="runReview">
          {{ reviewRunning ? '正在复查…' : '运行复查校验' }}
        </button>
      </div>
      <p v-if="reviewError" class="mi-error">{{ reviewError }}</p>
      <ul v-if="reviewIssues.length" class="mi-findings">
        <li v-for="(issue, index) in reviewIssues.slice(0, 30)" :key="`${issue.code}-${issue.selector}-${index}`" :class="`sev-${issue.severity}`">
          <button type="button" class="mi-finding" @click="seekReview(issue)">
            <span class="mi-sev">{{ issue.severity }}</span>
            <span class="mi-finding-copy">
              <strong>{{ issue.code }}</strong>
              <span>{{ issue.message }}</span>
              <code v-if="issue.selector">{{ issue.selector }}</code>
            </span>
          </button>
        </li>
      </ul>
      <p v-else-if="reviewed && !reviewRunning" class="mi-note">没有发现需要处理的问题。</p>
    </div>

    <div class="mi-block">
      <strong>渲染导出</strong>
      <p class="mi-hint">用 HyperFrames CLI 在本机渲染 MP4，与预览是同一工程、同一组参数。</p>
      <button type="button" class="mi-primary mi-render" :disabled="rendering" @click="renderNow">
        {{ state.renderStatus === 'queued' ? '排队中…' : state.renderStatus === 'running' ? '正在渲染…' : '渲染为 MP4' }}
      </button>
      <div v-if="rendering" class="mi-progress" role="status" aria-live="polite">
        <div class="mi-progress-bar"><i :style="{ width: `${state.renderProgress?.pct ?? 0}%` }" /></div>
        <span>{{ renderStatusText }}</span>
      </div>
      <p v-if="state.renderError" class="mi-error">{{ state.renderError }}</p>
      <pre v-if="state.renderStatus === 'failed' && state.renderLog" class="mi-log">{{ state.renderLog }}</pre>
      <div v-if="state.renderUrl" class="mi-result">
        <video :src="state.renderUrl" controls playsinline />
        <!-- 时间轴固定使用 HyperFrames 实时预览，避免某次导出的 MP4 快照变成空白旧画面。 -->
        <a class="mi-primary" :href="state.renderUrl" :download="`${clip.name || 'motion'}.mp4`">下载 MP4</a>
        <p v-if="state.renderProbe" class="mi-hint mi-verified">
          已校验：{{ state.renderProbe.width }}×{{ state.renderProbe.height }} ·
          {{ state.renderProbe.duration.toFixed(2) }}s · {{ state.renderProbe.frames }} 帧
        </p>
        <p v-else-if="state.renderProbeError" class="mi-hint">
          已生成 MP4，但本机缺少 ffprobe，未能逐帧校验。
        </p>
        <p class="mi-hint">时间轴继续使用实时工程预览；这份 MP4 仅作为导出产物。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import '@hyperframes/player'
import { useMotionStore } from '@/stores/motionStore'
import { checkMotionProject, motionFileUrl } from '@/api/motion'
import type { MotionCheckFinding } from '@/api/motion'
import { auditMotionDocument, type MotionAuditIssue } from '@/features/edit/motionAudit'
import { snapshotMotionElement } from '@/features/edit/motionElements'
import type { AgentMotionElementRef } from '@/types/agent'
import type { TimelineClip } from '@/types/edit'

const props = defineProps<{ projectId: string; clip: TimelineClip }>()

const emit = defineEmits<{
  (event: 'select-elements', payload: { elements: AgentMotionElementRef[] }): void
}>()

const motion = useMotionStore()

const motionId = computed(() => props.clip.motionId || '')
const state = computed(() => motion.stateOf(motionId.value))
const rendering = computed(() =>
  state.value.renderStatus === 'running' || state.value.renderStatus === 'queued')
const renderStatusText = computed(() => {
  if (state.value.renderStatus === 'queued') return '排队中，等待上一个渲染结束'
  const progress = state.value.renderProgress
  if (!progress) return '正在渲染…'
  const count = progress.total ? ` · ${progress.done}/${progress.total}` : ''
  return `${progress.label} ${progress.pct}%${count}`
})
const sourceOpen = ref(false)
const sourceDraft = ref('')
const previewKey = ref(0)
const draft = reactive<Record<string, unknown>>({})
const paramNotice = ref('')
const playerRef = ref<HTMLElement | null>(null)
const layers = ref<PreviewLayer[]>([])
const activeLayerKey = ref('')
let highlightedLayerEl: Element | null = null

interface PreviewLayer {
  key: string
  id: string
  tag: string
  label: string
}

const SKIP_TAGS = new Set([
  'defs',
  'pattern',
  'clippath',
  'line',
  'rect',
  'circle',
  'path',
  'g',
  'use',
  'style',
  'script',
])

function previewDocument(): Document | null {
  const player = playerRef.value as (HTMLElement & { iframeElement?: HTMLIFrameElement }) | null
  try {
    return player?.iframeElement?.contentDocument || null
  } catch {
    return null
  }
}

/** 从预览 iframe 读取图层的稳定 id；Studio 的 Layers 也是同一份 DOM。 */
function readLayers() {
  activeLayerKey.value = ''
  highlightedLayerEl = null
  const doc = previewDocument()
  if (!doc?.body) {
    layers.value = []
    return
  }
  const root = doc.getElementById('root') || doc.body
  const items: PreviewLayer[] = []
  const seen = new Set<string>()
  for (const element of root.querySelectorAll('[data-hf-id]')) {
    const id = element.id || ''
    const tag = element.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) continue
    const text = element.childElementCount === 0
      ? (element.textContent || '').trim().replace(/\s+/g, ' ')
      : ''
    const key = id || element.getAttribute('data-hf-id') || ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    items.push({ key, id, tag, label: id ? `#${id}` : text.slice(0, 28) || tag })
    if (items.length >= 40) break
  }
  layers.value = items
}

function pickLayer(layer: PreviewLayer) {
  const doc = previewDocument()
  if (!doc) return
  // iframe 里的元素不属于当前 window，不能用 instanceof 判断。
  const highlightable = (element: Element | null): element is Element & { style: CSSStyleDeclaration } =>
    !!element && 'style' in element
  if (highlightable(highlightedLayerEl)) {
    highlightedLayerEl.style.outline = ''
    highlightedLayerEl.style.outlineOffset = ''
  }
  const element = layer.id
    ? doc.getElementById(layer.id)
    : doc.querySelector(`[data-hf-id="${layer.key}"]`)
  if (!highlightable(element)) return
  highlightedLayerEl = element
  element.style.outline = '3px solid #e2794f'
  element.style.outlineOffset = '-3px'
  activeLayerKey.value = layer.key
  // 点图层等同于在主画面点选这个元素：把元素名和 selector 交给剪辑台，
  // 后续修改只作用于它，不会扩大成整段重做。
  const player = playerRef.value as (HTMLElement & { iframeElement?: HTMLIFrameElement }) | null
  const iframe = player?.iframeElement
  if (!iframe) return
  const rect = iframe.getBoundingClientRect()
  const viewport = {
    width: iframe.clientWidth || rect.width,
    height: iframe.clientHeight || rect.height,
  }
  emit('select-elements', {
    elements: [snapshotMotionElement(element, rect, rect, 0, viewport)],
  })
}

const reviewRunning = ref(false)
const reviewed = ref(false)
const reviewError = ref('')
const reviewFindings = ref<MotionCheckFinding[]>([])
const auditIssues = ref<MotionAuditIssue[]>([])

type ReviewIssue = MotionCheckFinding | MotionAuditIssue

const reviewIssues = computed<ReviewIssue[]>(() => [
  ...reviewFindings.value,
  ...auditIssues.value,
])

const reviewSummary = computed(() => {
  if (!reviewed.value) return null
  const failures = reviewFindings.value.filter((finding) => finding.severity === 'error').length +
    auditIssues.value.filter((finding) => finding.severity === 'error').length
  const warnings = reviewFindings.value.filter((finding) => finding.severity === 'warning').length +
    auditIssues.value.filter((finding) => finding.severity === 'warning').length
  return { errorCount: failures, warningCount: warnings }
})

// 目录式预览地址让 index.html 里的 assets/... 相对路径在检查器里也能正确解析。
const previewUrl = computed(() =>
  motionId.value ? `${location.origin}${motionFileUrl(motionId.value)}` : '',
)

watch(
  motionId,
  async (id) => {
    if (!id) return
    const loaded = await motion.load(id)
    sourceDraft.value = loaded.source || ''
    Object.keys(draft).forEach((key) => delete draft[key])
    Object.assign(draft, loaded.meta?.params || {})
    previewKey.value += 1
  },
  { immediate: true },
)

watch(previewKey, () => {
  layers.value = []
  activeLayerKey.value = ''
  highlightedLayerEl = null
})

function reloadSource() {
  sourceDraft.value = state.value.source || ''
}

async function saveSource() {
  await motion.saveSource(motionId.value, sourceDraft.value)
  previewKey.value += 1
}

async function commit(id: string, value: unknown) {
  draft[id] = value
  try {
    await motion.setParams(motionId.value, { ...draft })
    previewKey.value += 1
    paramNotice.value = '参数已写入工程，预览与渲染同步更新。'
  } catch (error) {
    paramNotice.value = String((error as Error)?.message || error)
  }
}

async function renderNow() {
  try {
    await motion.render(motionId.value)
  } catch {
    // 错误已写进 state.renderError。
  }
}

function seekReview(issue: ReviewIssue) {
  const player = playerRef.value as (HTMLElement & { seek?: (time: number) => void }) | null
  if (typeof player?.seek === 'function') player.seek(Math.max(0, Number(issue.time) || 0))
}

async function auditPreview(): Promise<MotionAuditIssue[]> {
  const player = playerRef.value as (HTMLElement & {
    seek?: (time: number) => void
    currentTime?: number
    iframeElement?: HTMLIFrameElement
  }) | null
  if (!player?.iframeElement?.contentDocument) return []
  const source = state.value.source || sourceDraft.value || ''
  const duration = Math.max(0.5, Number(source.match(/data-duration\s*=\s*["']([\d.]+)["']/)?.[1]) || 5)
  const times = [0, duration * 0.34, duration * 0.67, Math.max(0, duration - 0.05)]
  const original = Number(player.currentTime) || 0
  const issues: MotionAuditIssue[] = []
  for (const time of times) {
    player.seek?.(time)
    await new Promise((resolve) => setTimeout(resolve, 220))
    issues.push(...auditMotionDocument(player.iframeElement?.contentDocument, Math.round(time * 100) / 100))
  }
  player.seek?.(original)
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.selector}|${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function runReview() {
  if (reviewRunning.value || !motionId.value) return
  reviewRunning.value = true
  reviewError.value = ''
  auditIssues.value = []
  reviewFindings.value = []
  try {
    const [report, localIssues] = await Promise.allSettled([
      checkMotionProject(motionId.value, 5),
      auditPreview(),
    ])
    if (report.status === 'fulfilled') {
      reviewFindings.value = report.value.findings
      if (!report.value.passed) {
        reviewError.value = `官方复查发现 ${report.value.summary.errorCount} 个 error。`
      }
    } else {
      reviewError.value = `官方复查失败：${(report.reason as Error)?.message || report.reason}`
    }
    auditIssues.value = localIssues.status === 'fulfilled' ? localIssues.value : []
  } finally {
    reviewed.value = true
    reviewRunning.value = false
  }
}
</script>

<style scoped>
.mi {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--sf-line, #eee4dc);
}

.mi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.mi-tag {
  padding: 3px 8px;
  border-radius: 999px;
  background: #f7ece5;
  color: #9c4f31;
}

.mi-head a {
  color: #a3542f;
  text-decoration: none;
}

.mi-preview {
  overflow: hidden;
  border-radius: 10px;
  background: #111;
}

.mi-loading {
  display: block;
  padding: 32px 0;
  text-align: center;
  font-size: 11px;
  color: #a3948a;
}

.mi-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mi-review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: var(--sf-ink-2, #4c413a);
}

.mi-layer-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: #f0eae4;
  color: #8a7a6f;
  font-size: 10px;
}

.mi-layers {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 176px;
  margin: 0;
  padding: 3px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid #eee4dd;
  border-radius: 8px;
  background: #fffdfb;
}

.mi-layer {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--sf-ink-2, #4c413a);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.mi-layer:hover {
  background: #f7f1eb;
}

.mi-layer.active {
  background: #fdeee6;
  color: #b4562c;
}

.mi-layer-tag {
  flex: none;
  min-width: 30px;
  padding: 1px 4px;
  border-radius: 4px;
  background: #f1eae4;
  color: #a3948a;
  font-size: 9px;
  text-align: center;
}

.mi-layer-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mi-review-summary {
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef6ef;
  color: #3f7a4b;
  font-size: 10px;
}

.mi-review-summary.bad {
  background: #fbeae5;
  color: #b4472c;
}

.mi-review-actions {
  flex-direction: column;
  align-items: stretch;
}

.mi-review-actions button {
  width: 100%;
  white-space: nowrap;
}

.mi-findings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 260px;
  overflow: auto;
}

.mi-finding {
  display: flex;
  gap: 7px;
  width: 100%;
  padding: 6px 7px;
  border: 1px solid #eee3dc;
  border-radius: 7px;
  background: #fffaf7;
  text-align: left;
  cursor: pointer;
}

.mi-finding:hover {
  border-color: #d9b9a8;
}

.mi-sev {
  flex: none;
  height: 15px;
  padding: 0 5px;
  border-radius: 4px;
  background: #f1ece7;
  color: #6a584d;
  font-size: 9px;
  line-height: 15px;
  text-transform: uppercase;
}

.sev-error .mi-sev {
  background: #fbe1da;
  color: #a3321c;
}

.sev-warning .mi-sev {
  background: #fdf0d8;
  color: #8a5a12;
}

.mi-finding-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.mi-finding-copy strong {
  font-size: 10px;
  color: #8a7c73;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.mi-finding-copy span {
  font-size: 11px;
  line-height: 1.5;
  color: #4c413a;
}

.mi-finding-copy code {
  overflow: hidden;
  font-size: 9.5px;
  color: #a3948a;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mi-block > strong {
  font-size: 11.5px;
  color: var(--sf-ink-2, #4c413a);
}

.mi-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #8a7c73;
}

.mi-field input[type='text'],
.mi-field input[type='number'],
.mi-field select,
.mi-field textarea {
  padding: 6px 8px;
  border: 1px solid #e8ded7;
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
  color: #2c2521;
  font-family: inherit;
}

.mi-field input[type='color'] {
  width: 48px;
  height: 28px;
  padding: 0;
  border: 1px solid #e8ded7;
  border-radius: 6px;
  background: #fff;
}

.mi-hint,
.mi-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: #a3948a;
}

.mi-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 11.5px;
  color: #a3542f;
  cursor: pointer;
}

.mi-source {
  width: 100%;
  padding: 8px;
  border: 1px solid #e8ded7;
  border-radius: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: #4c413a;
  background: #fffaf7;
}

.mi-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.mi-primary,
.mi-ghost {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 11.5px;
  cursor: pointer;
}

.mi-primary {
  border: 0;
  background: #b45f3c;
  color: #fff;
}

.mi-ghost {
  border: 1px solid #e2d3c9;
  background: #fff;
  color: #6a584d;
}

.mi-primary:disabled {
  opacity: 0.55;
  cursor: default;
}

.mi-render {
  align-self: flex-start;
}

.mi-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 10.5px;
  color: #6a584d;
}

.mi-progress-bar {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #efe2d9;
}

.mi-progress-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #b45f3c;
  transition: width 0.3s ease;
}

.mi-verified {
  color: #2f7a4f;
}

.mi-error {
  margin: 0;
  font-size: 11px;
  color: #b4472c;
}

.mi-log {
  max-height: 140px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  background: #2a2320;
  color: #e9d9cf;
  font-size: 10px;
  white-space: pre-wrap;
}

.mi-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mi-result video {
  width: 100%;
  border-radius: 8px;
  background: #111;
}

.mi-result .mi-primary {
  align-self: flex-start;
}
</style>
