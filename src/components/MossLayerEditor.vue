<template>
  <Teleport to="body">
    <div class="layer-editor-mask" @click.self="requestClose">
      <section class="layer-editor" role="dialog" aria-modal="true" :aria-label="`图层编辑 · ${editorModelLabel}`">
        <header class="editor-head">
          <div class="head-text">
            <h2>图层编辑 · {{ editorModelLabel }}</h2>
            <p v-if="isGlobalMode">
              拖动框调整元素位置和大小，也可以在右侧用自然语言让 AI 改布局。当前模型没有原生分层能力，
              会以参考图为底图，按图层描述与位置近似还原布局。改完点右下角「按此布局生成新图」才会出图。
            </p>
            <p v-else>
              拖动框调整元素位置和大小，也可以在右侧用自然语言让 AI 改布局。Moss 是文生图模型，
              布局改完必须点右下角「按此布局重新生成」才会出图。
            </p>
          </div>
          <button class="close-btn" type="button" aria-label="关闭图层编辑" @click="requestClose">✕</button>
        </header>

        <div class="editor-body">
          <div class="stage">
            <input
              ref="assetInputRef"
              type="file"
              accept="image/*"
              class="file-input"
              @change="handleAssetFileChange"
            />
            <div v-if="dirty" class="stage-badge">布局已修改 · 预览仍是上一版图片</div>
            <div ref="canvasRef" class="canvas-wrap">
              <img :src="imageUrl" alt="待编辑的生成图片" draggable="false" @dragstart.prevent />
              <div
                v-for="(item, index) in draft.items"
                :key="item.id"
                class="bbox"
                :class="{
                  selected: item.id === selectedId,
                  background: isBackgroundLike(item),
                  'has-asset': !!item.assetUrl,
                  'label-inside': item.y < draft.height * 0.03,
                }"
                :style="itemStyle(item, index)"
                @pointerdown="startDrag($event, item, 'move')"
              >
                <img
                  v-if="item.assetUrl"
                  class="bbox-asset"
                  :src="item.assetUrl"
                  alt=""
                  draggable="false"
                  @dragstart.prevent
                />
                <span class="bbox-label">
                  {{ index + 1 }} · {{ isBackgroundLike(item) ? '背景' : item.assetUrl ? '素材' : labelText(item.label) }}
                  <em v-if="isBackgroundLike(item)">底图</em>
                </span>
                <span
                  v-if="!isBackgroundLike(item)"
                  class="resize-handle"
                  aria-hidden="true"
                  @pointerdown.stop="startDrag($event, item, 'resize')"
                />
              </div>
            </div>
          </div>

          <aside class="side">
            <div class="side-scroll">
              <div class="panel-block layer-list-block">
              <div class="panel-head">
                <span class="panel-title">图层（{{ draft.items.length }}）</span>
                <div class="layer-add-actions">
                  <button class="ghost-btn" type="button" @click="addLayer">＋ 添加</button>
                  <button
                    v-if="isGlobalMode"
                    class="ghost-btn asset-add-btn"
                    type="button"
                    :disabled="busy"
                    title="上传一张素材图作为新图层，可拖拽与缩放"
                    @click="addAssetLayer"
                  >上传参考图</button>
                </div>
              </div>
              <div class="layer-list">
                <button
                  v-for="(item, index) in draft.items"
                  :key="item.id"
                  class="layer-row"
                  :class="{ active: item.id === selectedId }"
                  type="button"
                  @click="selectedId = item.id"
                >
                  <span class="layer-index" :style="{ background: colorAt(index) }">{{ index + 1 }}</span>
                  <span class="layer-meta">
                    <span class="layer-kind">
                      {{ isBackgroundLike(item) ? '背景 / 底图' : item.assetUrl ? '素材图' : labelText(item.label) }}
                    </span>
                    <span class="layer-caption" :class="{ missing: !isBackgroundLike(item) && !hasLayerContent(item) }">
                      {{
                        isBackgroundLike(item)
                          ? (item.caption || '整张参考图 · 底图')
                          : item.assetUrl
                            ? (item.caption || '已上传素材 · 可拖拽定位')
                            : (item.text || item.caption || '缺少描述 · 不会出现在生成结果中')
                      }}
                    </span>
                  </span>
                  <span
                    v-if="!isBackgroundLike(item) && (editableLayerCount > 1 || hasBackgroundLayer)"
                    class="layer-remove"
                    role="button"
                    tabindex="0"
                    title="删除该图层"
                    @click.stop="removeLayer(item.id)"
                    @keydown.enter.stop="removeLayer(item.id)"
                  >✕</span>
                </button>
              </div>
            </div>

            <div class="panel-block summary-block">
              <div class="panel-head">
                <span class="panel-title">整体画面</span>
                <span class="hint-text">背景 / 风格 / 光线</span>
              </div>
              <label class="field summary-field">
                <span>整体描述<em>作为底图与画面的补充说明</em></span>
                <textarea
                  v-model="draft.summary.caption"
                  rows="3"
                  :placeholder="summaryPlaceholder"
                />
              </label>
              <p class="panel-hint">
                {{ isGlobalMode
                  ? '会与参考图一起下发给模型；未提及区域尽量保持原图不变。'
                  : 'Moss 会把这里的内容当作整张图的背景与整体风格描述。' }}
              </p>
            </div>

            <div v-if="selectedItem" class="panel-block inspector-block">
              <div class="panel-head">
                <span class="panel-title">图层属性</span>
                <span class="hint-text">{{ isBackgroundLike(selectedItem) ? '整张参考图' : positionLabel(selectedItem) }}</span>
              </div>

              <label v-if="!isBackgroundLike(selectedItem)" class="field">
                <span>类型</span>
                <select v-model="selectedItem.label">
                  <option value="object">物体</option>
                  <option value="character">人物</option>
                  <option value="text">文字</option>
                </select>
              </label>

              <label class="field">
                <span>
                  {{ isBackgroundLike(selectedItem) ? '底图补充描述（可选）' : '元素描述' }}
                  <em v-if="!isBackgroundLike(selectedItem)">英文效果更好</em>
                </span>
                <textarea
                  ref="captionInputRef"
                  v-model="selectedItem.caption"
                  rows="3"
                  placeholder="例如：a white ceramic latte cup with leaf latte art, soft shadow"
                />
              </label>

              <label v-if="selectedItem.label === 'text' && !isBackgroundLike(selectedItem)" class="field">
                <span>文字内容</span>
                <textarea
                  v-model="selectedItem.text"
                  rows="2"
                  placeholder="要渲染的原文，可换行"
                />
              </label>

              <div v-if="isGlobalMode && !isBackgroundLike(selectedItem)" class="field asset-field">
                <span>图层素材<em>可选 · 按框位置参与生成</em></span>
                <div v-if="selectedItem.assetUrl" class="asset-preview">
                  <img :src="selectedItem.assetUrl" alt="图层素材预览" />
                  <div class="asset-preview-actions">
                    <button class="mini-btn" type="button" @click="pickAssetFor(selectedItem.id)">更换</button>
                    <button class="mini-btn danger" type="button" @click="clearAsset(selectedItem)">移除</button>
                  </div>
                </div>
                <button v-else class="asset-upload-btn" type="button" @click="pickAssetFor(selectedItem.id)">
                  ＋ 上传参考图作为素材
                </button>
                <p class="asset-hint">
                  支持 PNG / JPG / WebP。单图模型会先把素材合成到框内位置；多图参考模型会作为独立参考图下发。
                </p>
              </div>

              <div v-if="!isBackgroundLike(selectedItem)" class="field">
                <span>位置与大小（像素）</span>
                <div class="coord-grid">
                  <label>X<input v-model.number="selectedItem.x" type="number" min="0" @change="clampSelected" /></label>
                  <label>Y<input v-model.number="selectedItem.y" type="number" min="0" @change="clampSelected" /></label>
                  <label>宽<input v-model.number="selectedItem.width" type="number" min="24" @change="clampSelected" /></label>
                  <label>高<input v-model.number="selectedItem.height" type="number" min="24" @change="clampSelected" /></label>
                </div>
              </div>
              <p v-else class="panel-hint">整张参考图作为底图，位置与大小固定，不可移动或缩放。</p>
            </div>

            <div class="panel-block ai-block">
              <div class="panel-head">
                <span class="panel-title">自然语言修改</span>
              </div>
              <textarea
                v-model="instruction"
                rows="3"
                :disabled="busy"
                placeholder="例如：把标题移到顶部居中，咖啡杯放大并移到正中偏左，右下角再加一行小字「手冲 · 拿铁」"
              />
              <p class="panel-hint">
                这里只修改图层与位置，不会自动出图。直接点下方
                「{{ isGlobalMode ? '按此布局生成新图' : '按此布局重新生成' }}」也会先执行这段修改。
              </p>
              <button class="ai-btn" type="button" :disabled="busy || !instruction.trim()" @click="applyInstruction">
                {{ busy ? 'AI 正在更新布局…' : '让 AI 修改布局' }}
              </button>
              <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
            </div>

            </div>

            <footer class="editor-foot">
              <p v-if="missingCaptionCount" class="foot-warn">
                有 {{ missingCaptionCount }} 个图层还没有描述，生成时会被忽略，请先补充「元素描述」。
              </p>
              <p v-if="dirty" class="foot-dirty">布局已修改，点右侧按钮才会按新布局生成新图。</p>
              <p v-else-if="isGlobalMode" class="foot-note">
                生成会以参考图为底图，按图层描述与位置近似还原；未提及区域尽量保持原样。
              </p>
              <p v-else class="foot-note">
                重新生成会消耗一次 Moss 调用。未移动的元素会按原布局尽量保持原位，但细节可能有轻微差异。
              </p>
              <div class="foot-actions">
                <button class="ghost-btn" type="button" @click="requestClose">放弃修改</button>
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="busy || generating"
                  @click="regenerate"
                >
                  {{ generating
                    ? '正在生成中…'
                    : busy
                      ? '正在更新布局…'
                      : isGlobalMode
                        ? '按此布局生成新图'
                        : '按此布局重新生成' }}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { confirmDialog } from '@/features/ui/dialog'
import type { MossLayout, MossLayoutItem, MossLayoutLabel } from '@/types/layout'
import {
  clampLayoutItem,
  cloneLayout,
  createDefaultLayoutItem,
  describeItemPosition,
  isBackgroundLayer,
} from '@/features/layout/mossLayout'
import { editMossLayout } from '@/features/layout/planner'
import { normalizeErrorMessage } from '@/utils/errors'

const props = withDefaults(
  defineProps<{
    imageUrl: string
    layout: MossLayout
    /** 主页面是否正在生成；生成中禁止重复提交，避免点击后毫无反馈。 */
    generating?: boolean
    /** moss：使用原生分层 JSON；global：其他图片模型按图层描述近似还原。 */
    mode?: 'moss' | 'global'
    modelName?: string
  }>(),
  {
    generating: false,
    mode: 'moss',
    modelName: '',
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'regenerate', layout: MossLayout): void
}>()

const isGlobalMode = computed(() => props.mode === 'global')
const editorModelLabel = computed(() => props.modelName || (isGlobalMode.value ? '通用图片模型' : 'Moss'))
const summaryPlaceholder = computed(() =>
  isGlobalMode.value
    ? '例如：以参考图为基础，保持人物与场景不变，整体改为黄昏暖色调'
    : '例如：夏日午后，暖光，极简海报风格',
)

const LAYER_COLORS = ['var(--sf-amber)', '#63b3ed', '#f687b3', '#68d391', '#b794f4', '#f6ad55', '#4fd1c5', '#fc8181']

const draft = ref<MossLayout>(cloneLayout(props.layout))
// 背景层不可编辑位置，默认选中第一个可编辑图层，没有时才回落到背景层。
const selectedId = ref<string | null>(
  draft.value.items.find((item) => !isBackgroundLayer(item))?.id ?? draft.value.items[0]?.id ?? null,
)
const instruction = ref('')
const busy = ref(false)
const dirty = ref(false)
const errorMessage = ref('')
const canvasRef = ref<HTMLElement | null>(null)
const captionInputRef = ref<HTMLTextAreaElement | null>(null)
const assetInputRef = ref<HTMLInputElement | null>(null)
/** 下一次选择素材文件时要写入的图层 id。 */
const pendingAssetLayerId = ref<string | null>(null)
/** 下一次选择素材文件时是否需要新建图层（「上传参考图」入口）。 */
const pendingNewAssetLayer = ref(false)
const ASSET_MAX_BYTES = 10 * 1024 * 1024

// 任何图层改动都要显式提示：预览图是上一版生成结果，只有重新生成才会变。
watch(
  draft,
  () => {
    dirty.value = true
  },
  { deep: true }
)

const selectedItem = computed(() => draft.value.items.find((item) => item.id === selectedId.value) || null)

/** 没有描述、文字或素材的图层不会出现在发送给模型的布局里。 */
function hasLayerContent(item: MossLayoutItem): boolean {
  return !!(item.caption.trim() || item.text?.trim() || item.assetUrl)
}

/** 背景层：整张参考图铺满画布，位置固定，也不参与「缺少描述」统计。 */
function isBackgroundLike(item: MossLayoutItem): boolean {
  return isBackgroundLayer(item)
}

const missingCaptionCount = computed(
  () => draft.value.items.filter((item) => !isBackgroundLike(item) && !hasLayerContent(item)).length,
)

/** 可移动 / 可删除的普通图层数量（不含背景层）。 */
const editableLayerCount = computed(() => draft.value.items.filter((item) => !isBackgroundLike(item)).length)
const hasBackgroundLayer = computed(() => draft.value.items.some((item) => isBackgroundLike(item)))

function colorAt(index: number): string {
  return LAYER_COLORS[index % LAYER_COLORS.length]
}

function labelText(label: MossLayoutLabel): string {
  if (label === 'text') return '文字'
  if (label === 'character') return '人物'
  return '物体'
}

function itemStyle(item: MossLayoutItem, index: number) {
  const color = colorAt(index)
  return {
    left: `${(item.x / draft.value.width) * 100}%`,
    top: `${(item.y / draft.value.height) * 100}%`,
    width: `${(item.width / draft.value.width) * 100}%`,
    height: `${(item.height / draft.value.height) * 100}%`,
    borderColor: color,
    '--layer-color': color,
  }
}

function positionLabel(item: MossLayoutItem): string {
  return `${describeItemPosition(item, draft.value.width, draft.value.height)} · ${item.width}×${item.height}`
}

function clampSelected() {
  const item = selectedItem.value
  if (!item || isBackgroundLike(item)) return
  const clamped = clampLayoutItem(
    {
      ...item,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      width: Number(item.width) || 24,
      height: Number(item.height) || 24,
    },
    draft.value.width,
    draft.value.height
  )
  Object.assign(item, clamped)
}

function addLayer() {
  const item = createDefaultLayoutItem(draft.value)
  draft.value.items.push(item)
  selectedId.value = item.id
  // 新图层默认没有描述，直接聚焦描述框，避免加完忘记写导致生成时被忽略。
  nextTick(() => captionInputRef.value?.focus())
}

function removeLayer(id: string) {
  const target = draft.value.items.find((item) => item.id === id)
  if (!target || isBackgroundLike(target)) return
  // 没有背景底图时，至少保留一个图层；有底图时可以清空图层只保留底图。
  if (!hasBackgroundLayer.value && editableLayerCount.value <= 1) return
  const index = draft.value.items.findIndex((item) => item.id === id)
  if (index < 0) return
  releaseAsset(target)
  draft.value.items.splice(index, 1)
  if (selectedId.value === id) {
    selectedId.value = draft.value.items[Math.min(index, draft.value.items.length - 1)]?.id ?? null
  }
}

/**
 * 释放素材图层的本地 blob URL。
 *
 * 布局快照会被存进聊天消息，并可能共享同一个 blob URL，
 * 因此只有确认当前草稿和已保存布局都不再引用时才真正释放。
 */
function releaseAsset(item: MossLayoutItem) {
  const url = item.assetUrl
  if (!url?.startsWith('blob:')) return
  nextTick(() => {
    const stillInDraft = draft.value.items.some((candidate) => candidate.assetUrl === url)
    const stillInSaved = props.layout.items.some((candidate) => candidate.assetUrl === url)
    if (!stillInDraft && !stillInSaved) URL.revokeObjectURL(url)
  })
}

/** 「上传参考图」：选好文件后再创建图层，取消选择不会留下空图层。 */
function addAssetLayer() {
  if (!isGlobalMode.value) return
  pendingAssetLayerId.value = null
  pendingNewAssetLayer.value = true
  if (assetInputRef.value) assetInputRef.value.value = ''
  assetInputRef.value?.click()
}

function pickAssetFor(id: string) {
  pendingNewAssetLayer.value = false
  pendingAssetLayerId.value = id
  if (assetInputRef.value) assetInputRef.value.value = ''
  assetInputRef.value?.click()
}

function clearAsset(item: MossLayoutItem) {
  releaseAsset(item)
  delete item.assetUrl
  delete item.assetFile
}

function readLocalImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight }
      URL.revokeObjectURL(objectUrl)
      resolve(size)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('素材图片读取失败'))
    }
    image.src = objectUrl
  })
}

function probeImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false)
      return
    }
    const image = new Image()
    image.onload = () => resolve(!!image.naturalWidth)
    image.onerror = () => resolve(false)
    image.src = url
  })
}

/**
 * 打开历史布局时，素材预览的 blob URL 可能已经失效。
 * 素材原文件仍保存在布局里，这里重新生成预览地址，保证「图层」再次打开仍可编辑。
 */
async function restoreAssetUrls() {
  if (!isGlobalMode.value) return
  let changed = false
  for (const item of draft.value.items) {
    if (!item.assetFile) continue
    if (item.assetUrl && (await probeImageUrl(item.assetUrl))) continue
    item.assetUrl = URL.createObjectURL(item.assetFile)
    changed = true
  }
  if (!changed) return
  await nextTick()
  // 恢复预览地址不算用户修改，避免一打开就提示「布局已修改」。
  dirty.value = false
}

async function handleAssetFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  let id = pendingAssetLayerId.value
  const createNew = pendingNewAssetLayer.value
  pendingAssetLayerId.value = null
  pendingNewAssetLayer.value = false
  input.value = ''
  if (!file || (!id && !createNew)) return
  if (!file.type.startsWith('image/')) {
    errorMessage.value = '请选择图片文件作为图层素材。'
    return
  }
  if (file.size > ASSET_MAX_BYTES) {
    errorMessage.value = '素材图片不能超过 10MB，请压缩后再试。'
    return
  }

  let item = id ? draft.value.items.find((candidate) => candidate.id === id) : undefined
  if (createNew) {
    const created = createDefaultLayoutItem(draft.value)
    draft.value.items.push(created)
    // 从响应式数组重新取出代理对象，后续修改尺寸才能触发视图更新。
    item = draft.value.items.find((candidate) => candidate.id === created.id)
    id = created.id
  }
  if (!item || !id) return

  releaseAsset(item)
  item.assetFile = file
  item.assetUrl = URL.createObjectURL(file)
  selectedId.value = id
  errorMessage.value = ''

  // 让图层框贴合素材比例（等比），用户仍可继续拖拽 / 缩放。
  try {
    const size = await readLocalImageSize(file)
    if (!size.width || !size.height) return
    const ratio = size.height / size.width
    const maxWidth = draft.value.width * 0.9
    const maxHeight = draft.value.height * 0.9
    let width = Math.min(item.width, maxWidth)
    let height = width * ratio
    if (height > maxHeight) {
      height = maxHeight
      width = height / ratio
    }
    width = Math.round(Math.max(24, width))
    height = Math.round(Math.max(24, height))
    const centerX = item.x + item.width / 2
    const centerY = item.y + item.height / 2
    item.width = width
    item.height = height
    item.x = Math.round(Math.min(Math.max(centerX - width / 2, 0), draft.value.width - width))
    item.y = Math.round(Math.min(Math.max(centerY - height / 2, 0), draft.value.height - height))
  } catch {
    // 尺寸读取失败时保留默认框。
  }
}

interface DragState {
  mode: 'move' | 'resize'
  id: string
  startX: number
  startY: number
  origin: { x: number; y: number; width: number; height: number }
}

let dragState: DragState | null = null

function canvasRect(): DOMRect | null {
  const rect = canvasRef.value?.getBoundingClientRect()
  return rect && rect.width > 0 && rect.height > 0 ? rect : null
}

function startDrag(event: PointerEvent, item: MossLayoutItem, mode: 'move' | 'resize') {
  if (isBackgroundLike(item)) return
  event.preventDefault()
  selectedId.value = item.id
  dragState = {
    mode,
    id: item.id,
    startX: event.clientX,
    startY: event.clientY,
    origin: { x: item.x, y: item.y, width: item.width, height: item.height },
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function onDragMove(event: PointerEvent) {
  const state = dragState
  const rect = canvasRect()
  if (!state || !rect) return
  const item = draft.value.items.find((candidate) => candidate.id === state.id)
  if (!item) return

  const scaleX = draft.value.width / rect.width
  const scaleY = draft.value.height / rect.height
  const dx = (event.clientX - state.startX) * scaleX
  const dy = (event.clientY - state.startY) * scaleY

  if (state.mode === 'move') {
    item.x = Math.round(Math.min(Math.max(state.origin.x + dx, 0), draft.value.width - item.width))
    item.y = Math.round(Math.min(Math.max(state.origin.y + dy, 0), draft.value.height - item.height))
    return
  }

  item.width = Math.round(Math.min(Math.max(state.origin.width + dx, 24), draft.value.width - item.x))
  item.height = Math.round(Math.min(Math.max(state.origin.height + dy, 24), draft.value.height - item.y))
}

function stopDrag() {
  dragState = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

async function applyInstructionLayout(): Promise<MossLayout | null> {
  const text = instruction.value.trim()
  if (!text || busy.value) return null

  busy.value = true
  errorMessage.value = ''
  try {
    const next = await editMossLayout({ layout: draft.value, instruction: text })
    draft.value = next
    instruction.value = ''
    if (!next.items.some((item) => item.id === selectedId.value)) {
      selectedId.value = next.items[0]?.id ?? null
    }
    return next
  } catch (error) {
    errorMessage.value = normalizeErrorMessage(error, 'AI 更新布局失败，请稍后重试。')
    return null
  } finally {
    busy.value = false
  }
}

async function applyInstruction() {
  if (busy.value) return
  await applyInstructionLayout()
}

async function regenerate() {
  if (busy.value || props.generating) return
  // 自然语言框里还有没应用的指令时，先执行它再出图，避免用户以为输入已生效。
  if (instruction.value.trim()) {
    const next = await applyInstructionLayout()
    if (!next) return
  }
  emit('regenerate', cloneLayout(draft.value))
}

/** 改动未应用时关闭前二次确认，避免用户误以为已经生成。 */
async function requestClose() {
  if (dirty.value) {
    const ok = await confirmDialog({
      title: '放弃修改',
      message: '布局已修改但还没重新生成，关闭会放弃这些修改。',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      danger: true,
    })
    if (!ok) return
  }
  emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') requestClose()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void restoreAssetUrls()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopDrag()
})
</script>

<style scoped>
.layer-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(10px);
}

.layer-editor {
  display: flex;
  flex-direction: column;
  width: min(1280px, 100%);
  height: min(860px, 100%);
  overflow: hidden;
  border: 1px solid var(--sf-line);
  border-radius: 22px;
  background: var(--sf-surface);
  color: rgba(36, 31, 25, 0.9);
  box-shadow: 0 24px 70px rgba(36, 31, 25, 0.16);
}

.editor-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.08);
}

.head-text h2 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
}

.head-text p {
  margin: 0;
  max-width: 760px;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(36, 31, 25, 0.55);
}

.close-btn {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.7);
  cursor: pointer;
}

.close-btn:hover {
  background: rgba(36, 31, 25, 0.1);
}

.editor-body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.stage {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--sf-surface-3);
}

.stage-badge {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 3;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transform: translateX(-50%);
  box-shadow: 0 6px 16px rgba(36, 31, 25, 0.12);
}

/* 画布容器必须与图片尺寸完全一致，否则 bbox 百分比定位会和图片错位。 */
.canvas-wrap {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: fit-content;
  height: fit-content;
  max-width: 100%;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(36, 31, 25, 0.12);
  touch-action: none;
}

.canvas-wrap img {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(min(860px, 100vh - 40px) - 140px);
  user-select: none;
  -webkit-user-drag: none;
}

.bbox {
  position: absolute;
  border: 1.5px solid var(--layer-color, var(--sf-amber));
  background: color-mix(in srgb, var(--layer-color, var(--sf-amber)) 12%, transparent);
  cursor: move;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.bbox.background {
  cursor: default;
  border-color: rgba(36, 31, 25, 0.38);
  border-style: dashed;
  background: transparent;
}

.bbox.background.selected {
  background: transparent;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.32);
}

.bbox.has-asset {
  background: transparent;
  overflow: visible;
}

.bbox-asset {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.bbox.selected {
  background: color-mix(in srgb, var(--layer-color, var(--sf-amber)) 22%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--layer-color, var(--sf-amber)) 45%, transparent);
  z-index: 2;
}

.bbox-label {
  position: absolute;
  top: -22px;
  left: -1px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  padding: 2px 7px;
  overflow: hidden;
  border-radius: 6px 6px 6px 0;
  background: var(--layer-color, var(--sf-amber));
  color: rgba(10, 10, 10, 0.92);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}

.bbox-label em {
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(36, 31, 25, 0.08);
  font-style: normal;
}

/* 贴近画布顶部的图层把标签放进框内，避免被裁切。 */
.bbox.label-inside .bbox-label {
  top: 0;
  border-radius: 0 6px 6px 0;
}

.resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 11px;
  height: 11px;
  border: 1.5px solid rgba(10, 10, 10, 0.85);
  border-radius: 3px;
  background: var(--layer-color, var(--sf-amber));
  cursor: nwse-resize;
}

.side {
  display: flex;
  flex-direction: column;
  width: 360px;
  flex: 0 0 360px;
  min-height: 0;
  border-left: 1px solid rgba(36, 31, 25, 0.08);
  overflow: hidden;
}

/* 面板区独立滚动，底部操作按钮始终可见。 */
.side-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.panel-block {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.06);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(36, 31, 25, 0.78);
}

.hint-text {
  font-size: 11px;
  color: rgba(36, 31, 25, 0.42);
}

.panel-hint {
  margin: 8px 0 0;
  color: rgba(36, 31, 25, 0.38);
  font-size: 11px;
  line-height: 1.5;
}

.ghost-btn {
  padding: 5px 10px;
  border: 1px solid rgba(36, 31, 25, 0.14);
  border-radius: 8px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.75);
  font-size: 12px;
  cursor: pointer;
}

.ghost-btn:hover {
  background: rgba(36, 31, 25, 0.1);
}

.file-input {
  display: none;
}

.layer-add-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.asset-add-btn {
  border-color: rgba(36, 31, 25, 0.38);
  background: rgba(36, 31, 25, 0.10);
  color: rgba(36, 31, 25, 0.92);
}

.asset-add-btn::before {
  content: '🖼';
  margin-right: 4px;
  font-size: 10px;
}

.asset-add-btn:hover {
  background: rgba(36, 31, 25, 0.18);
}

.asset-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 8px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.03);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.layer-row:hover {
  background: rgba(36, 31, 25, 0.07);
}

.layer-row.active {
  border-color: rgba(36, 31, 25, 0.55);
  background: rgba(36, 31, 25, 0.1);
}

.layer-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border-radius: 7px;
  color: rgba(10, 10, 10, 0.9);
  font-size: 11px;
  font-weight: 700;
}

.layer-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.layer-kind {
  font-size: 10px;
  color: rgba(36, 31, 25, 0.4);
}

.layer-caption {
  overflow: hidden;
  font-size: 12px;
  color: rgba(36, 31, 25, 0.8);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.layer-caption.missing {
  color: var(--sf-amber);
  font-style: italic;
}

.layer-remove {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 6px;
  color: rgba(36, 31, 25, 0.35);
  font-size: 11px;
}

.layer-remove:hover {
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 11px;
  color: rgba(36, 31, 25, 0.55);
}

.field em {
  margin-left: 6px;
  color: rgba(36, 31, 25, 0.32);
  font-style: normal;
}

.field select,
.field input,
.field textarea,
.ai-block textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 9px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font-size: 12px;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
}

.field select:focus,
.field input:focus,
.field textarea:focus,
.ai-block textarea:focus {
  outline: none;
  border-color: rgba(36, 31, 25, 0.5);
}

.coord-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.coord-grid label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(36, 31, 25, 0.45);
}

.asset-field {
  padding-top: 10px;
  border-top: 1px dashed rgba(36, 31, 25, 0.08);
}

.asset-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 10px;
  background: var(--sf-surface-2);
}

.asset-preview img {
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(36, 31, 25, 0.04);
}

.asset-preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.asset-upload-btn {
  padding: 10px 12px;
  border: 1px dashed rgba(36, 31, 25, 0.45);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.08);
  color: var(--sf-ink);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.asset-upload-btn:hover {
  background: rgba(36, 31, 25, 0.16);
}

.asset-hint {
  margin: 2px 0 0;
  color: rgba(36, 31, 25, 0.32);
  font-size: 10px;
  line-height: 1.5;
}

.mini-btn {
  padding: 5px 9px;
  border: 1px solid rgba(36, 31, 25, 0.14);
  border-radius: 8px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.72);
  font-size: 11px;
  cursor: pointer;
}

.mini-btn:hover {
  background: rgba(36, 31, 25, 0.1);
}

.mini-btn.danger {
  border-color: var(--sf-danger-soft);
  color: var(--sf-terra-strong);
}

.mini-btn.danger:hover {
  background: var(--sf-terra-wash);
}

.ai-btn {
  width: 100%;
  margin-top: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(36, 31, 25, 0.4);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ai-btn:hover:not(:disabled) {
  background: rgba(36, 31, 25, 0.2);
}

.ai-btn:disabled,
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  margin: 8px 0 0;
  color: var(--sf-terra-strong);
  font-size: 11px;
  line-height: 1.5;
}

.editor-foot {
  flex: 0 0 auto;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--sf-line-soft);
  background: var(--sf-surface-2);
}

.foot-note {
  margin: 0 0 10px;
  color: rgba(36, 31, 25, 0.38);
  font-size: 11px;
  line-height: 1.5;
}

.foot-dirty {
  margin: 0 0 10px;
  color: var(--sf-amber);
  font-size: 11px;
  line-height: 1.5;
}

.foot-warn {
  margin: 0 0 8px;
  color: var(--sf-amber);
  font-size: 11px;
  line-height: 1.5;
}

.foot-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.primary-btn {
  padding: 9px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 1100px) {
  .side {
    width: 320px;
    flex-basis: 320px;
  }
}

@media (max-width: 820px) {
  .layer-editor-mask {
    padding: 0;
  }

  .layer-editor {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  .editor-body {
    flex-direction: column;
  }

  .stage {
    flex: none;
    height: auto;
  }

  .canvas-wrap img {
    max-height: 42vh;
  }

  .side {
    width: 100%;
    flex: 1;
    border-left: 0;
    border-top: 1px solid rgba(36, 31, 25, 0.08);
  }
}
</style>
