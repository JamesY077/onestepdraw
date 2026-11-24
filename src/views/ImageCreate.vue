<template>
  <div class="studio-page image-page" :style="{ height: appHeight, '--app-height': appHeight }">
    <!-- 参数抽屉打开时收起悬浮岛，避免图标压在抽屉上层。 -->
    <StudioIsland v-show="!paramsOpen" />
    <div class="image-shell">
      <StudioHeader
        kicker="Image Studio"
        title="图片生成"
        subtitle="写好一句提示词，挑一种风格，一次出一组可以横向比较的画面"
        accent="var(--sf-ink)"
      >
        <template #actions>
          <button class="header-action" type="button" @click="openHistory">
            历史
            <span v-if="batches.length" class="header-action-count">{{ batches.length }}</span>
          </button>
        </template>
      </StudioHeader>

      <div class="image-body">
        <section class="workbench">
          <!-- 结果区 -->
          <div class="gallery-area" :class="{ 'has-result': !!currentBatch }">
            <div v-if="!batches.length" class="gallery-empty">
              <span class="empty-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4.5" width="18" height="15" rx="3.2" />
                  <circle cx="9" cy="10" r="1.6" />
                  <path d="M4 16.6 9.4 12l4 3.6 2.6-2.2 4 3.6" />
                </svg>
              </span>
              <h2>从一句话开始，出第一组图。</h2>
              <p>越具体越好：主体、材质、光线、镜头、用途。生成后可以在这里比较、放大、扩图或重生成。</p>
              <div class="starters">
                <button
                  v-for="item in quickStarts"
                  :key="item.title"
                  class="starter"
                  type="button"
                  @click="applyQuickPrompt(item.prompt)"
                >
                  <span class="starter-title">{{ item.title }}</span>
                  <span class="starter-desc">{{ item.desc }}</span>
                </button>
              </div>
            </div>

            <template v-else-if="currentBatch">
              <header class="batch-bar">
                <div class="batch-copy">
                  <p class="batch-prompt">{{ currentBatch.prompt || '以参考图向外扩展' }}</p>
                  <div class="batch-meta">
                    <span>{{ currentBatch.model || modelLabel }}</span>
                    <span v-if="currentBatch.aspectRatio">{{ currentBatch.aspectRatio }}</span>
                    <span v-if="currentBatch.results.length">{{ currentBatch.results.length }} 张</span>
                    <span>{{ formatTime(currentBatch.createdAt) }}</span>
                  </div>
                </div>
                <div class="batch-actions">
                  <button class="ghost-pill" type="button" :disabled="isGenerating" @click="regenerate(currentBatch)">
                    重生成
                  </button>
                  <button class="ghost-pill" type="button" @click="reusePrompt(currentBatch)">
                    用这段提示词
                  </button>
                </div>
              </header>

              <div v-if="currentBatch.partialError" class="batch-warning">
                {{ currentBatch.partialError }}
              </div>

              <div v-if="currentBatch.status === 'failed'" class="batch-error">
                <p>{{ currentBatch.error || '这一轮生成失败了。' }}</p>
                <button class="ghost-pill" type="button" :disabled="isGenerating" @click="regenerate(currentBatch)">
                  再试一次
                </button>
              </div>

              <div
                class="gallery-grid"
                :class="{ 'is-single': gridColumns === 1 }"
                :style="{ '--cols': gridColumns, '--tile-ratio': tileRatio }"
              >
                <figure
                  v-for="(result, index) in currentBatch.results"
                  :key="result.url"
                  class="tile"
                  @click="openLightbox(index)"
                >
                  <img :src="result.url" alt="生成的图片" referrerpolicy="no-referrer" loading="lazy" decoding="async" />
                  <span class="tile-index">{{ index + 1 }}</span>
                  <span v-if="result.layoutSkipped" class="tile-note">无编辑图层</span>
                  <figcaption class="tile-overlay">
                    <div class="tile-tools">
                      <button class="tile-btn" type="button" @click.stop="openLightbox(index)">查看</button>
                      <button class="tile-btn" type="button" @click.stop="downloadResult(result)">下载</button>
                      <AddToProjectButton :asset="imageInboxAsset(result, index)" compact />
                      <button class="tile-btn" type="button" @click.stop="expandFromResult(result)">扩图</button>
                      <button class="tile-btn" type="button" @click.stop="regenerate(currentBatch)">重生成</button>
                      <button
                        v-if="result.layout"
                        class="tile-btn tile-btn-layer"
                        type="button"
                        @click.stop="editLayers(result)"
                      >
                        图层
                      </button>
                    </div>
                    <span class="tile-size">{{ sizeLabel(result) }}</span>
                  </figcaption>
                </figure>

                <div v-for="n in pendingCount" :key="`pending-${n}`" class="tile tile-pending">
                  <span class="tile-shimmer" aria-hidden="true" />
                  <span class="tile-pending-text">
                    {{ currentBatch.progress ? `生成中 ${currentBatch.progress}%` : '排队中' }}
                  </span>
                </div>
              </div>
            </template>
          </div>

          <!-- 提示词条 -->
          <div class="prompt-card" :class="{ 'is-expand': isExpandMode }">
            <div class="prompt-field">
              <textarea
                ref="promptInputRef"
                v-model="inputText"
                class="prompt-input"
                :placeholder="promptPlaceholder"
                rows="1"
                @input="autoGrow"
                @keydown="onPromptKeydown"
              />
              <div class="prompt-buttons">
                <button
                  class="ghost-pill"
                  type="button"
                  :disabled="isPolishing || isGenerating || !hasPolishModel"
                  :title="polishButtonTitle"
                  @click="handlePolish"
                >
                  {{ isPolishing ? '润色中…' : 'AI 润色' }}
                </button>
                <button
                  class="generate-btn"
                  type="button"
                  :disabled="!canSend"
                  @click="handleSend"
                >
                  <template v-if="isGenerating">
                    <span class="generate-spinner" aria-hidden="true" />
                    {{ generatingProgress }}%
                  </template>
                  <template v-else>
                    生成
                    <span class="generate-kbd">⌘↵</span>
                  </template>
                </button>
              </div>
            </div>

            <div class="prompt-chips">
              <span class="pchip pchip-model">{{ modelLabel }}</span>
              <span class="pchip">{{ modeLabel }}</span>
              <span class="pchip">{{ settingsStore.aspectRatio }}</span>
              <span class="pchip">{{ effectiveBatchSize }} 张</span>
              <span v-if="selectedStyleCount" class="pchip pchip-accent">风格 × {{ selectedStyleCount }}</span>
              <span v-if="isMossImageModel && mossLayoutEnabled" class="pchip">分层布局</span>
              <button class="pchip pchip-action" type="button" @click="paramsOpen = true">参数</button>
            </div>
          </div>
        </section>

        <!-- 右侧参数栏 -->
        <aside class="param-rail" :class="{ 'is-open': paramsOpen }">
          <div class="rail-head">
            <span class="rail-title">参数</span>
            <button class="rail-close" type="button" aria-label="收起参数" @click="paramsOpen = false">✕</button>
          </div>

          <div class="rail-scroll">
            <section class="rail-card">
              <span class="rail-label">模型</span>
              <ModelSelector
                key="image-model"
                v-model="settingsStore.selectedModel"
                media-type="image"
                compact
                :disabled="isExpandMode"
                @update:model-value="settingsStore.saveToStorage()"
              />
              <p v-if="isExpandMode" class="rail-hint">扩图固定使用 Doubao-Seedream-5.0-lite。</p>
            </section>

            <section class="rail-card">
              <span class="rail-label">生成方式</span>
              <div class="chip-row">
                <button
                  v-for="option in modeOptions"
                  :key="option.value"
                  class="chip"
                  :class="{ active: imageMode === option.value }"
                  type="button"
                  :disabled="option.disabled"
                  @click="setImageMode(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <p v-if="isExpandMode" class="rail-hint">以上传的原图为中心向外延展，比例需与原图不同。</p>
              <p v-else-if="imageMode === 'image2image'" class="rail-hint" :class="{ 'is-guide': expandHint }">
                <template v-if="expandHint">请先在下方上传原图，再点「扩图」。</template>
                <template v-else-if="allowsMultiReference">可上传最多 {{ referenceLimit }} 张参考图做融合，用 @图片N 精确指定素材。</template>
                <template v-else>上传一张参考图，按提示词改写画面。</template>
              </p>
            </section>

            <section class="rail-card">
              <span class="rail-label">比例</span>
              <div class="ratio-grid">
                <button
                  v-for="option in ratioOptions"
                  :key="option.value"
                  class="ratio-chip"
                  :class="{ active: settingsStore.aspectRatio === option.value }"
                  type="button"
                  @click="selectRatio(option.value)"
                >
                  <span class="ratio-box" :style="{ width: `${option.boxWidth}px`, height: `${option.boxHeight}px` }" />
                  <span class="ratio-text">{{ option.label }}</span>
                </button>
              </div>
            </section>

            <section class="rail-card">
              <span class="rail-label">数量</span>
              <div class="chip-row">
                <button
                  v-for="count in batchOptions"
                  :key="count"
                  class="chip chip-count"
                  :class="{ active: settingsStore.batchSize === count }"
                  type="button"
                  :disabled="isExpandMode"
                  @click="selectBatchSize(count)"
                >
                  {{ count }}
                </button>
              </div>
            </section>

            <section
              v-if="imageMode !== 'text2image'"
              ref="uploadCardRef"
              class="rail-card upload-card"
              :class="{ 'is-highlighted': uploadHighlight }"
            >
              <div class="upload-card-head">
                <span class="rail-label">{{ isExpandMode ? '原图' : '参考图' }}</span>
                <span v-if="allowsMultiReference" class="upload-count">
                  {{ uploadedFiles.length }}/{{ referenceLimit }}
                </span>
              </div>
              <input
                ref="fileInput"
                type="file"
                :accept="imageAccept"
                :multiple="allowsMultiReference"
                class="hidden-input"
                @change="handleFileChange"
              />
              <div
                v-if="referenceFiles.length"
                class="upload-thumbs"
                :class="{ 'is-multi': allowsMultiReference }"
              >
                <div
                  v-for="(item, index) in referenceFiles"
                  :key="`${item.url}-${index}`"
                  class="upload-thumb-item"
                >
                  <button
                    class="upload-thumb-btn"
                    type="button"
                    :title="allowsMultiReference ? `插入 @${item.refLabel || item.name}` : '点击替换图片'"
                    @click="allowsMultiReference ? insertReferenceMention(item) : fileInput?.click()"
                  >
                    <img :src="item.url" :alt="item.name" />
                    <span v-if="allowsMultiReference" class="upload-thumb-tag">
                      {{ item.refLabel }}
                    </span>
                  </button>
                  <button
                    class="upload-thumb-remove"
                    type="button"
                    :aria-label="`移除 ${item.name}`"
                    :title="`移除 ${item.name}`"
                    @click.stop="removeReferenceFile(index)"
                  >
                    ×
                  </button>
                </div>
                <button
                  v-if="allowsMultiReference && uploadedFiles.length < referenceLimit"
                  class="upload-thumb-add"
                  type="button"
                  title="继续添加参考图"
                  @click="fileInput?.click()"
                >
                  +
                </button>
              </div>
              <button v-else class="upload-drop" type="button" @click="fileInput?.click()">
                <span class="upload-plus">+</span>
                <span class="upload-copy">{{ isExpandMode ? '上传原图' : '上传图片' }}</span>
                <span class="upload-hint">{{ IMAGE_FORMAT_HINT }}</span>
              </button>
              <p v-if="allowsMultiReference" class="rail-hint">
                最多 {{ referenceLimit }} 张，可点缩略图把 @图片N 插入提示词。
              </p>
              <button v-if="referenceFiles.length" class="rail-text-btn" type="button" @click="clearUploadedReference()">
                移除全部{{ isExpandMode ? '原图' : '参考图' }}
              </button>
            </section>

            <SkillPicker layout="grid" :model-id="settingsStore.selectedModel" />

            <section v-if="isMossImageModel" class="rail-card">
              <div class="rail-switch-row">
                <span class="rail-label">分层布局</span>
                <button
                  class="mini-switch"
                  :class="{ on: mossLayoutEnabled }"
                  type="button"
                  role="switch"
                  :aria-checked="mossLayoutEnabled"
                  @click="mossLayoutEnabled = !mossLayoutEnabled"
                >
                  <span class="mini-knob" aria-hidden="true" />
                </button>
              </div>
              <p class="rail-hint">默认关闭。开启后先拆成可编辑图层再出图；若没拆出图层，会按普通图片正常输出并标注「无编辑图层」。</p>
            </section>
          </div>
        </aside>

        <!-- 放在 .image-shell 内部：shell 是独立 stacking context，
             背板与参数栏必须同层比较 z-index，否则参数栏会被背板盖住。 -->
        <div v-if="paramsOpen" class="rail-backdrop" @click="paramsOpen = false" />
      </div>
    </div>

    <!-- 历史抽屉 -->
    <Teleport to="body">
      <div v-if="historyOpen" class="history-mask" @click.self="historyOpen = false">
        <aside class="history-panel">
          <header class="history-head">
            <div>
              <span class="history-kicker">History</span>
              <h3>生成历史</h3>
            </div>
            <button class="history-close" type="button" aria-label="关闭历史" @click="historyOpen = false">✕</button>
          </header>

          <p v-if="!batches.length" class="history-empty">还没有生成记录，先写下第一句提示词吧。</p>

          <ul v-else class="history-list">
            <li
              v-for="batch in batches"
              :key="batch.id"
              class="history-item"
              :class="{ active: currentBatch?.id === batch.id }"
            >
              <button class="history-item-btn" type="button" @click="selectBatch(batch.id)">
                <span class="history-thumb">
                  <img v-if="batch.results[0]" :src="batch.results[0].url" alt="" loading="lazy" />
                  <span v-else class="history-thumb-empty">{{ batch.status === 'failed' ? '!' : '…' }}</span>
                </span>
                <span class="history-copy">
                  <span class="history-prompt">{{ batch.prompt || '扩图' }}</span>
                  <span class="history-meta">
                    {{ formatTime(batch.createdAt) }} · {{ batch.results.length }} 张
                    <template v-if="batch.aspectRatio"> · {{ batch.aspectRatio }}</template>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </aside>
      </div>
    </Teleport>

    <ImageLightbox
      v-if="lightboxOpen"
      v-model:index="lightboxIndex"
      :results="currentBatch?.results || []"
      :prompt="currentBatch?.prompt"
      @close="lightboxOpen = false"
      @regenerate="currentBatch && regenerate(currentBatch)"
      @expand="lightboxResult && expandFromResult(lightboxResult)"
      @edit-layers="lightboxResult && editLayers(lightboxResult)"
    />

    <MossLayerEditor
      v-if="layerEditorState"
      :image-url="layerEditorState.imageUrl"
      :layout="layerEditorState.layout"
      :mode="layerEditorState.mode"
      :model-name="layerEditorState.modelName"
      :generating="isGenerating"
      @close="layerEditorState = null"
      @regenerate="handleLayerRegenerate"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import StudioHeader from '@/components/StudioHeader.vue'
import StudioIsland from '@/components/StudioIsland.vue'
import AddToProjectButton from '@/components/common/AddToProjectButton.vue'
import ModelSelector from '@/components/ModelSelector.vue'
import SkillPicker from '@/components/SkillPicker.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'
import MossLayerEditor from '@/components/MossLayerEditor.vue'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { useSkillStore } from '@/stores/skillStore'
import { useGenerate } from '@/composables/useGenerate'
import { polishPromptWithSkills } from '@/features/skill/polish'
import {
  ASPECT_RATIO_OPTIONS,
  getLocalUploadAccept,
  getModelCapability,
  getSupportedAspectRatios,
  type AspectRatioOption,
} from '@/types/model'
import { createExpandedUploadedFile, getExpandTargetSize } from '@/features/generate/expand'
import {
  createUploadedFile,
  dataUrlToFile,
  releaseUploadedFile,
  resolveUploadedImageDimensions,
} from '@/features/generate/localFile'
import {
  IMAGE_FILE_ACCEPT,
  IMAGE_FORMAT_HINT,
  classifySupportedFile,
} from '@/features/generate/fileFormats'
import { isMossLayoutModel } from '@/features/layout/mossLayout'
import { getReadableErrorMessage, validatePromptOrThrow } from '@/utils/errorHandling'
import { showErrorMessage } from '@/utils/errors'
import type { GenerateResult, GenerateStatus, ImageGenerationMode, UploadedFile } from '@/types/chat'
import type { MossLayout } from '@/types/layout'

type ImageMode = ImageGenerationMode

interface ImageBatch {
  id: string
  assistantId: string
  prompt: string
  createdAt: number
  status: GenerateStatus
  progress: number
  results: GenerateResult[]
  error?: string
  partialError?: string
  aspectRatio?: string
  model?: string
  imageMode?: ImageMode
  batchSize?: number
  uploadedFile?: UploadedFile
  uploadedFiles?: UploadedFile[]
}

interface LayerEditorState {
  imageUrl: string
  layout: MossLayout
  mode: 'moss' | 'global'
  modelName: string
  baseFile: UploadedFile | null
  prompt: string
}

const EXPAND_MODEL_ID = 'Doubao-Seedream-5.0-lite'
const MAX_BATCH = 5
const LANDING_REFERENCE_STORAGE_KEY = 'artrealm_landing_reference_image'

const route = useRoute()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const skillStore = useSkillStore()
const { generate } = useGenerate()

const inputText = ref('')
const imageMode = ref<ImageMode>('text2image')
// 参考图列表：普通模型最多 1 张，Seedream 5 等多图模型最多 10 张。
const uploadedFiles = ref<UploadedFile[]>([])
// uploadedFile 继续指向首图，兼容扩图、落地页参考图与历史记录等单图逻辑。
const uploadedFile = computed(() => uploadedFiles.value[0] ?? null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadCardRef = ref<HTMLElement | null>(null)
const uploadHighlight = ref(false)
const expandHint = ref(false)
let uploadHighlightTimer: number | null = null
const promptInputRef = ref<HTMLTextAreaElement | null>(null)
const isPolishing = ref(false)
// 分层布局默认关闭：开启后会多一次文本模型布局规划，失败时退回普通出图。
const mossLayoutEnabled = ref(false)
const layerEditorState = ref<LayerEditorState | null>(null)
const historyOpen = ref(false)
const paramsOpen = ref(false)
const selectedBatchId = ref<string | null>(null)
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const appHeight = ref('100dvh')

const quickStarts = [
  {
    title: '产品主视觉',
    desc: '磨砂玻璃香水瓶 · 柔光侧逆光 · 极简石台',
    prompt: '一只磨砂玻璃质感的香水瓶立在浅灰色石台上，柔和侧逆光，极简背景，高级产品主视觉，8K 细节。',
  },
  {
    title: '电影感人像',
    desc: '雨夜霓虹街头 · 浅景深 · 青橙色调',
    prompt: '电影感中景：雨夜霓虹街头，人物侧脸回望，浅景深，青橙色调，胶片颗粒，35mm 镜头。',
  },
  {
    title: '场景概念',
    desc: '未来城市空中花园 · 黄昏暖光',
    prompt: '未来城市空中花园概念场景，黄昏暖光穿过玻璃连廊，宏大远景，概念艺术风格，细腻光影。',
  },
  {
    title: '编辑插画',
    desc: '杂志内页 · 大标题 · 留白排版',
    prompt: '编辑设计风格的杂志内页插画，大标题与正文形成清晰层级，大面积留白，克制的双色调，纸张质感。',
  },
  {
    title: '品牌海报',
    desc: '瑞士网格 · 黑白加红 · 几何裁切',
    prompt: '瑞士国际主义风格品牌海报，严格网格排版，黑白为主加一处高饱和红，几何裁切，博物馆级印刷质感。',
  },
  {
    title: '纹理素材',
    desc: '柔光织物质感 · 无缝平铺',
    prompt: '柔和侧光下的亚麻织物近景，细腻纤维纹理，低饱和米灰色，可无缝平铺的背景素材。',
  },
]

const isExpandMode = computed(() => imageMode.value === 'expand')
const isGenerating = computed(() => chatStore.isGenerating)
const modelCapability = computed(() => getModelCapability(settingsStore.selectedModel))
const isMossImageModel = computed(() => modelCapability.value?.imageRequestMode === 'moss')
const isMultiReferenceModel = computed(
  () => modelCapability.value?.imageReferenceMode === 'multi',
)
/** 多图参考上限：模型默认 10 张，普通模型固定 1 张。 */
const referenceLimit = computed(() =>
  isMultiReferenceModel.value
    ? Math.max(1, modelCapability.value?.imageReferenceLimit ?? 10)
    : 1,
)
/** 只有多图模型 + 图生图才展示多图上传；扩图始终只处理一张原图。 */
const allowsMultiReference = computed(
  () => isMultiReferenceModel.value && imageMode.value === 'image2image',
)
const referenceFiles = computed(() => uploadedFiles.value)
const supportsImageReferenceMode = computed(
  () => !!modelCapability.value?.localUploadInputs?.includes('image'),
)
const modelLabel = computed(() => settingsStore.selectedModel || '未选择模型')
const selectedStyleCount = computed(() => skillStore.selectedStyleSkillIds.length)
const hasPolishModel = computed(() => settingsStore.promptPolishEnabled && !!settingsStore.promptPolishModel.trim())
const polishButtonTitle = computed(() => {
  if (!hasPolishModel.value) return '提示词增强已在设置中关闭'
  const usesSkills = !isExpandMode.value && skillStore.effectiveSkillContents.length > 0
  return usesSkills ? '按已选 Skill 规范改写提示词并补齐必要画面元素' : '用 AI 把简短描述扩写成更专业的提示词'
})
const imageAccept = computed(() => getLocalUploadAccept(settingsStore.selectedModel) || IMAGE_FILE_ACCEPT)

const modeOptions = computed(() => [
  { value: 'text2image' as ImageMode, label: '文生图', disabled: false },
  { value: 'image2image' as ImageMode, label: '图生图', disabled: !supportsImageReferenceMode.value },
  { value: 'expand' as ImageMode, label: '扩图', disabled: !supportsImageReferenceMode.value },
])

const modeLabel = computed(
  () => modeOptions.value.find((option) => option.value === imageMode.value)?.label || '文生图',
)

const batchOptions = Array.from({ length: MAX_BATCH }, (_, index) => index + 1)

const ratioOptions = computed<AspectRatioOption[]>(() => {
  const supported = getSupportedAspectRatios(settingsStore.selectedModel, null)
  if (!supported?.length) return ASPECT_RATIO_OPTIONS
  return ASPECT_RATIO_OPTIONS.filter((option) => supported.includes(option.value))
})

const effectiveBatchSize = computed(() =>
  isExpandMode.value ? 1 : Math.min(MAX_BATCH, Math.max(1, settingsStore.batchSize || 1)),
)

const promptPlaceholder = computed(() => {
  if (isExpandMode.value) return '可以先留空：直接把这张图按目标比例向外扩展'
  if (imageMode.value === 'image2image') return '描述要改成什么样：主体、风格、光线与构图'
  return '描述你想生成的画面：主体、氛围、镜头、色彩、质感'
})

const canSend = computed(() => {
  if (isGenerating.value) return false
  if (isExpandMode.value) return !!uploadedFile.value
  if (!inputText.value.trim()) return false
  if (imageMode.value === 'image2image' && !uploadedFiles.value.length) return false
  return true
})

/** 从消息流里还原出「一轮生成」：user 提示词 + 下一条图片 assistant 结果。 */
const batches = computed<ImageBatch[]>(() => {
  const list = chatStore.messages
  const result: ImageBatch[] = []
  for (let index = 0; index < list.length; index += 1) {
    const message = list[index]
    if (message.type !== 'user') continue
    const next = list[index + 1]
    if (!next || next.type !== 'assistant' || next.generateType !== 'image') continue
    result.push({
      id: message.id,
      assistantId: next.id,
      prompt: message.content,
      createdAt: message.timestamp,
      status: next.generateStatus || 'idle',
      progress: next.progress || 0,
      results: next.generateResults?.length
        ? next.generateResults
        : next.generateResult
          ? [next.generateResult]
          : [],
      error: next.error,
      partialError: next.partialError,
      aspectRatio: message.aspectRatio,
      model: message.model,
      imageMode: message.imageMode,
      batchSize: message.batchSize,
      uploadedFile: message.uploadedFile,
      uploadedFiles: message.uploadedFiles,
    })
  }
  return result.reverse()
})

const currentBatch = computed<ImageBatch | null>(() => {
  if (!batches.value.length) return null
  if (selectedBatchId.value) {
    const hit = batches.value.find((batch) => batch.id === selectedBatchId.value)
    if (hit) return hit
  }
  return batches.value[0]
})

const pendingCount = computed(() => {
  const batch = currentBatch.value
  if (!batch) return 0
  if (batch.status !== 'pending' && batch.status !== 'processing') return 0
  return Math.max(0, (batch.batchSize || 1) - batch.results.length)
})

const generatingProgress = computed(() => {
  const batch = batches.value[0]
  if (!isGenerating.value || !batch) return 0
  return Math.min(99, Math.max(batch.progress || 0, 1))
})

const lightboxResult = computed(() => currentBatch.value?.results[lightboxIndex.value] || null)

const gridColumns = computed(() => {
  const count = (currentBatch.value?.results.length || 0) + pendingCount.value
  if (count <= 1) return 1
  if (count <= 4) return 2
  return 3
})

/** 结果网格统一按本轮比例展示，横向比较时不裁切画面内容。 */
const tileRatio = computed(() => {
  const first = currentBatch.value?.results[0]
  const ratio = first?.aspectRatio || currentBatch.value?.aspectRatio || settingsStore.aspectRatio
  const [width, height] = (ratio || '1:1').split(':').map(Number)
  if (!width || !height) return '1 / 1'
  return `${width} / ${height}`
})

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function sizeLabel(result: GenerateResult) {
  if (!result.size) return result.aspectRatio || ''
  return `${result.size.width} × ${result.size.height}`
}

function syncAppHeight() {
  const viewport = window.visualViewport
  appHeight.value = `${viewport?.height || window.innerHeight}px`
}

function getGreatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}

function labelOfRatio(width: number, height: number) {
  const divisor = getGreatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function parseRatio(value: string | undefined | null): number | null {
  if (!value) return null
  const [width, height] = value.split(':').map(Number)
  if (!width || !height) return null
  return width / height
}

function autoGrow() {
  const el = promptInputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(180, Math.max(46, el.scrollHeight))}px`
}

function onPromptKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if (event.shiftKey) return
  event.preventDefault()
  if (canSend.value) handleSend()
}

function applyQuickPrompt(text: string) {
  inputText.value = text
  nextTick(() => {
    autoGrow()
    promptInputRef.value?.focus()
  })
}

function reusePrompt(batch: ImageBatch) {
  inputText.value = batch.prompt
  nextTick(() => {
    autoGrow()
    promptInputRef.value?.focus()
  })
}

function selectRatio(value: string) {
  settingsStore.aspectRatio = value
  settingsStore.saveToStorage()
}

function selectBatchSize(count: number) {
  if (isExpandMode.value) return
  settingsStore.batchSize = count
  settingsStore.saveToStorage()
}

function ensureSupportedAspectRatio() {
  const options = ratioOptions.value
  if (!options.length) return
  if (options.some((option) => option.value === settingsStore.aspectRatio)) return
  settingsStore.aspectRatio = options[0].value
  settingsStore.saveToStorage()
}

function setImageMode(mode: ImageMode) {
  if (imageMode.value === mode) return
  if (mode === 'image2image' && !supportsImageReferenceMode.value) return
  if (mode === 'expand' && !uploadedFile.value) {
    // 不弹通用错误：直接切到图生图，并把用户视线引到上传卡。
    imageMode.value = 'image2image'
    expandHint.value = true
    highlightUploadCard()
    return
  }
  if (mode === 'expand') {
    settingsStore.selectedModel = EXPAND_MODEL_ID
    settingsStore.saveToStorage()
  }
  expandHint.value = false
  imageMode.value = mode
  // 扩图只接受一张原图，多余的参考图需要释放掉。
  if (mode === 'expand' && uploadedFiles.value.length > 1) {
    setReferenceFiles(uploadedFiles.value.slice(0, 1))
  }
}

/** 短暂高亮原图上传卡并滚动到可见区域，替代「请先上传」的报错弹窗。 */
function highlightUploadCard() {
  uploadHighlight.value = true
  if (uploadHighlightTimer !== null) window.clearTimeout(uploadHighlightTimer)
  uploadHighlightTimer = window.setTimeout(() => {
    uploadHighlight.value = false
    uploadHighlightTimer = null
  }, 2200)
  void nextTick(() => {
    uploadCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function clearUploadedReference() {
  clearUploadedFile()
  if (isExpandMode.value) {
    // 扩图失去原图后回到图生图，避免停在一个无法生成的状态。
    imageMode.value = 'image2image'
    expandHint.value = true
    highlightUploadCard()
  }
}

/** 给参考图重新编号 图片1..N，保证缩略图顺序与 @图片N 一致。 */
function relabelReferenceFiles() {
  uploadedFiles.value.forEach((file, index) => {
    file.purpose = 'reference-image'
    file.refLabel = `图片${index + 1}`
  })
}

/** 整体替换参考图：只释放被移除的 blob URL，保留仍在列表中的文件。 */
function setReferenceFiles(files: UploadedFile[]) {
  const kept = files.slice(0, referenceLimit.value)
  const keptSet = new Set(kept)
  uploadedFiles.value.forEach((file) => {
    if (!keptSet.has(file)) releaseUploadedFile(file)
  })
  uploadedFiles.value = kept
  relabelReferenceFiles()
}

/** 模型或生成方式切换后，把超出上限的参考图裁掉（普通模型只留 1 张）。 */
function enforceReferenceLimit() {
  if (uploadedFiles.value.length > referenceLimit.value) {
    setReferenceFiles(uploadedFiles.value.slice(0, referenceLimit.value))
  } else if (uploadedFiles.value.length) {
    relabelReferenceFiles()
  }
}

function removeReferenceFile(index: number) {
  const target = uploadedFiles.value[index]
  if (!target) return
  releaseUploadedFile(target)
  uploadedFiles.value = uploadedFiles.value.filter((_, current) => current !== index)
  relabelReferenceFiles()
}

/** 在提示词光标处插入 @图片N，多图融合时用来精确指定素材。 */
function insertReferenceMention(item: UploadedFile) {
  const label = item.refLabel || item.name
  const textarea = promptInputRef.value
  if (!textarea) {
    inputText.value += `@${label} `
    return
  }
  const start = textarea.selectionStart ?? inputText.value.length
  const end = textarea.selectionEnd ?? start
  const before = inputText.value.slice(0, start)
  const after = inputText.value.slice(end)
  inputText.value = `${before}@${label} ${after}`
  void nextTick(() => {
    textarea.focus()
    const caret = before.length + label.length + 2
    textarea.setSelectionRange(caret, caret)
    autoGrow()
  })
}

function clearUploadedFile(options: { revoke?: boolean } = {}) {
  const previous = uploadedFiles.value
  uploadedFiles.value = []
  if (options.revoke !== false) {
    previous.forEach((file) => releaseUploadedFile(file))
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  target.value = ''
  if (!files.length) return

  const limit = referenceLimit.value
  const accepted: UploadedFile[] = []
  let invalidCount = 0
  for (const file of files) {
    if (classifySupportedFile(file) !== 'image') {
      invalidCount += 1
      continue
    }
    accepted.push(createUploadedFile(file, 'image'))
  }
  if (invalidCount) {
    showErrorMessage(`仅支持图片格式：${IMAGE_FORMAT_HINT}`)
  }
  if (!accepted.length) return

  // 多图模型追加；普通模型与扩图始终整体替换成新上传的这张。
  const merged = allowsMultiReference.value
    ? [...uploadedFiles.value, ...accepted]
    : accepted
  if (merged.length > limit) {
    showErrorMessage(`最多上传 ${limit} 张参考图，已保留前 ${limit} 张。`)
    // 超出上限的新文件不会进入列表，这里手动释放掉它们的 blob URL。
    merged.slice(limit).forEach((file) => releaseUploadedFile(file))
  }
  setReferenceFiles(merged)
  accepted.forEach((file) => void resolveUploadedImageDimensions(file))
  expandHint.value = false

  // 图生图/扩图都需要参考图；文生图模式下上传后自动切到图生图更符合直觉。
  if (imageMode.value === 'text2image') imageMode.value = 'image2image'
}

function restoreLandingReference() {
  if (route.query.reference !== 'landing') return
  const raw = sessionStorage.getItem(LANDING_REFERENCE_STORAGE_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { name?: string; type?: string; dataUrl?: string }
    if (!parsed.dataUrl) return
    const file = dataUrlToFile(parsed.dataUrl, parsed.name || 'landing-reference.png', parsed.type || 'image/png')
    imageMode.value = 'image2image'
    setReferenceFiles([createUploadedFile(file, 'image')])
  } catch (error) {
    showErrorMessage(getReadableErrorMessage(error, '首页参考图读取失败，请重新上传。'))
  } finally {
    sessionStorage.removeItem(LANDING_REFERENCE_STORAGE_KEY)
  }
}

function openHistory() {
  historyOpen.value = true
}

function selectBatch(id: string) {
  selectedBatchId.value = id
  historyOpen.value = false
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

function imageInboxAsset(result: GenerateResult, index: number) {
  const base = (currentBatch.value?.prompt || '生成图片').replace(/\s+/g, ' ').trim().slice(0, 24) || '生成图片'
  return {
    name: index > 0 ? `${base} ${index + 1}` : base,
    kind: 'image' as const,
    url: result.url,
    source: 'library' as const,
  }
}

function downloadResult(result: GenerateResult) {
  const link = document.createElement('a')
  link.href = result.url
  link.download = `aiping-image-${Date.now()}.png`
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** 以这张结果作为原图进入扩图模式，并自动挑一个不同于原图的比例。 */
async function expandFromResult(result: GenerateResult) {
  const source: UploadedFile = {
    name: `扩图原图-${Date.now()}.png`,
    type: 'image',
    url: result.url,
    size: 0,
    dimensions: result.size,
  }
  clearUploadedFile()
  imageMode.value = 'expand'
  settingsStore.selectedModel = EXPAND_MODEL_ID
  settingsStore.saveToStorage()
  lightboxOpen.value = false
  setReferenceFiles([source])

  const currentRatio = parseRatio(
    result.size ? labelOfRatio(result.size.width, result.size.height) : result.aspectRatio,
  )
  const next = ratioOptions.value.find((option) => {
    const target = parseRatio(option.value)
    if (!target) return false
    return !currentRatio || Math.abs(target - currentRatio) > 0.02
  })
  if (next) selectRatio(next.value)
  await nextTick()
  paramsOpen.value = true
}

function editLayers(result: GenerateResult) {
  if (!result.layout) return
  const hasBackground = result.layout.items.some((item) => item.role === 'background')
  const mode: LayerEditorState['mode'] = hasBackground
    ? 'global'
    : isMossLayoutModel(result.model)
      ? 'moss'
      : 'global'
  const modelName = getModelCapability(result.model) ? result.model : settingsStore.selectedModel || result.model
  lightboxOpen.value = false
  layerEditorState.value = {
    imageUrl: result.url,
    layout: result.layout,
    mode,
    modelName,
    baseFile:
      mode === 'global'
        ? {
            name: `图层底图-${Date.now()}.png`,
            type: 'image',
            url: result.url,
            size: 0,
            dimensions: result.size,
          }
        : null,
    prompt: '',
  }
}

async function handleLayerRegenerate(layout: MossLayout) {
  if (isGenerating.value) {
    showErrorMessage('当前还有生成任务进行中，请等它完成后再按新布局生成。')
    return
  }
  const editorState = layerEditorState.value
  layerEditorState.value = null
  if (!editorState) return

  if (editorState.mode === 'global') {
    const baseFile = editorState.baseFile
    if (!baseFile) {
      showErrorMessage('缺少底图，无法生成新图，请重新上传参考图后再试。')
      return
    }
    const model = getModelCapability(editorState.modelName) ? editorState.modelName : settingsStore.selectedModel
    settingsStore.selectedModel = model
    settingsStore.aspectRatio = layout.aspectRatio || settingsStore.aspectRatio
    settingsStore.saveToStorage()
    imageMode.value = 'image2image'

    await generate(
      editorState.prompt.trim() || '保持参考图的主体、构图与风格不变，按图层布局调整画面',
      'image2image',
      model,
      baseFile,
      settingsStore.aspectRatio,
      settingsStore.videoDuration,
      false,
      skillStore.effectiveSkillContents,
      settingsStore.videoResolution,
      1,
      { mossLayout: layout },
    )
    return
  }

  settingsStore.selectedModel = 'Moss-Image-SFT'
  settingsStore.aspectRatio = layout.aspectRatio || settingsStore.aspectRatio
  settingsStore.saveToStorage()
  imageMode.value = 'text2image'

  await generate(
    `图层调整后重新生成 · ${layout.items.length} 个图层`,
    'text2image',
    'Moss-Image-SFT',
    null,
    settingsStore.aspectRatio,
    settingsStore.videoDuration,
    false,
    skillStore.effectiveSkillContents,
    settingsStore.videoResolution,
    1,
    { mossLayout: layout },
  )
}

async function handlePolish() {
  const prompt = inputText.value.trim()
  if (!prompt) {
    showErrorMessage('先写一点内容，再让 AI 润色。')
    return
  }
  try {
    validatePromptOrThrow(prompt)
  } catch (error) {
    showErrorMessage(getReadableErrorMessage(error, '请检查提示词后重试。'))
    return
  }
  const model = settingsStore.promptPolishModel.trim()
  if (!model) {
    showErrorMessage('提示词增强已关闭，请先在设置中开启后再使用 AI 润色。')
    return
  }
  isPolishing.value = true
  try {
    // 有已选 Skill 时按 Skill 规范改写并补齐元素，而不是脱离规范自由扩写。
    inputText.value = await polishPromptWithSkills({
      model,
      prompt,
      skillContent: isExpandMode.value ? [] : skillStore.effectiveSkillContents,
      systemPrompt: settingsStore.promptPolishSystemPrompt,
    })
    await nextTick()
    autoGrow()
    promptInputRef.value?.focus()
  } catch (error) {
    showErrorMessage(getReadableErrorMessage(error, '润色失败，请稍后重试。'))
  } finally {
    isPolishing.value = false
  }
}

/** 扩图链路：先预扩画布，再把扩展后的图交给 Seedream；比例与原图一致时拦截。 */
async function runExpand(source: UploadedFile, ratio: string, prompt = '') {
  let dimensions = source.dimensions || null
  if (!dimensions) {
    try {
      dimensions = await resolveUploadedImageDimensions(source)
    } catch {
      dimensions = null
    }
  }
  const sourceRatio = dimensions ? parseRatio(labelOfRatio(dimensions.width, dimensions.height)) : null
  const targetRatio = parseRatio(ratio)
  if (sourceRatio && targetRatio && Math.abs(sourceRatio - targetRatio) < 0.01) {
    showErrorMessage('扩图比例与原图一致，请换一个比例再生成。')
    return
  }

  const prepared = await createExpandedUploadedFile(source, ratio)
  const target = getExpandTargetSize(ratio)
  const expandPrompt = prompt.trim()

  await generate(
    expandPrompt,
    'image2image',
    EXPAND_MODEL_ID,
    source,
    ratio,
    settingsStore.videoDuration,
    false,
    null,
    settingsStore.videoResolution,
    1,
    {
      imageMode: 'expand',
      generationFile: prepared || source,
      imageSize: target.size,
    },
  )
}

async function handleSend() {
  if (!canSend.value) return

  const prompt = inputText.value.trim()
  if (!isExpandMode.value || prompt) {
    try {
      validatePromptOrThrow(prompt)
    } catch (error) {
      showErrorMessage(getReadableErrorMessage(error, '提示词校验失败，请修改后重试。'))
      return
    }
  }

  if (isExpandMode.value) {
    const source = uploadedFile.value
    if (!source) {
      setImageMode('image2image')
      expandHint.value = true
      highlightUploadCard()
      return
    }
    expandHint.value = false
    const ratio = settingsStore.aspectRatio
    inputText.value = ''
    clearUploadedFile()
    paramsOpen.value = false
    selectedBatchId.value = null
    await runExpand(source, ratio, prompt)
    settingsStore.saveToStorage()
    return
  }

  const files = imageMode.value === 'image2image' ? [...uploadedFiles.value] : []
  const ioType = files.length ? 'image2image' : 'text2image'
  const referenceInput =
    files.length && allowsMultiReference.value && files.length > 1 ? files : files[0] || null
  const batchSize = effectiveBatchSize.value

  inputText.value = ''
  clearUploadedFile()
  paramsOpen.value = false
  selectedBatchId.value = null

  await generate(
    prompt,
    ioType,
    settingsStore.selectedModel,
    referenceInput,
    settingsStore.aspectRatio,
    settingsStore.videoDuration,
    false,
    skillStore.effectiveSkillContents,
    settingsStore.videoResolution,
    batchSize,
    { mossLayoutMode: isMossImageModel.value && mossLayoutEnabled.value },
  )

  settingsStore.saveToStorage()
}

/** 按历史记录原样重跑一轮（沿用当时的模型、比例、数量与生成方式）。 */
async function regenerate(batch: ImageBatch) {
  if (isGenerating.value) return
  lightboxOpen.value = false

  const sourceFiles = batch.uploadedFiles?.length
    ? batch.uploadedFiles
    : batch.uploadedFile
      ? [batch.uploadedFile]
      : []
  const source = sourceFiles[0]
  const ratio = batch.aspectRatio || settingsStore.aspectRatio
  if (batch.imageMode === 'expand' && source) {
    selectedBatchId.value = null
    await runExpand(source, ratio, batch.prompt)
    return
  }

  const model = batch.model || settingsStore.selectedModel
  if (model) settingsStore.selectedModel = model
  settingsStore.aspectRatio = ratio
  settingsStore.saveToStorage()

  const savedLayout = batch.results.find((item) => item.layout)?.layout || null
  imageMode.value = batch.imageMode === 'image2image' ? 'image2image' : 'text2image'
  selectedBatchId.value = null

  await generate(
    batch.prompt,
    source ? 'image2image' : 'text2image',
    model,
    sourceFiles.length > 1 ? sourceFiles : source || null,
    ratio,
    settingsStore.videoDuration,
    false,
    skillStore.effectiveSkillContents,
    settingsStore.videoResolution,
    batch.batchSize || effectiveBatchSize.value,
    { mossLayout: savedLayout },
  )

  settingsStore.saveToStorage()
}

watch(
  () => settingsStore.selectedModel,
  () => {
    ensureSupportedAspectRatio()
    enforceReferenceLimit()
  },
)

onMounted(async () => {
  settingsStore.loadFromStorage()
  skillStore.loadFromStorage()
  settingsStore.setMediaType('image')
  syncAppHeight()
  window.visualViewport?.addEventListener('resize', syncAppHeight)

  if (route.query.type === 'image') {
    imageMode.value = 'text2image'
  }
  ensureSupportedAspectRatio()
  restoreLandingReference()

  const initialPrompt = typeof route.query.prompt === 'string' ? route.query.prompt.trim() : ''
  if (initialPrompt) {
    inputText.value = initialPrompt
    await nextTick()
    autoGrow()
    if (route.query.autosend === '1') {
      await handleSend()
    } else {
      promptInputRef.value?.focus()
    }
  }
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', syncAppHeight)
  if (uploadHighlightTimer !== null) window.clearTimeout(uploadHighlightTimer)
  uploadedFiles.value.forEach((file) => releaseUploadedFile(file))
})
</script>

<style scoped>
.image-page {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100dvh;
  padding: 0 10px 10px;
  overflow: hidden;
  background: transparent;
  color: var(--sf-ink);
}

.image-page::before {
  display: none;
}

.image-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: min(100%, var(--page-max-width, 1480px));
  min-height: 0;
  margin: 0 auto;
}



/* ---------- 头部 ---------- */

.header-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 15px;
  border: 1px solid rgba(36, 31, 25, 0.10);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.76);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.header-action:hover {
  border-color: rgba(36, 31, 25, 0.32);
  background: rgba(36, 31, 25, 0.10);
  color: var(--sf-ink);
}

.header-action-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.22);
  color: var(--sf-ink);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* ---------- 主体 ---------- */

.image-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 352px;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 18px 4px;
}

.workbench {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

/* ---------- 提示词条 ---------- */

.prompt-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 0 0 auto;
  padding: 12px 14px 11px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 20px;
  background: var(--sf-surface);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.04);
  transition: border-color 0.24s ease;
}

.prompt-card:focus-within {
  border-color: rgba(36, 31, 25, 0.28);
}

.prompt-card.is-expand {
  border-color: rgba(36, 31, 25, 0.24);
}

.prompt-field {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.prompt-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 46px;
  max-height: 180px;
  padding: 11px 2px;
  border: 0;
  background: transparent;
  color: rgba(36, 31, 25, 0.94);
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  resize: none;
  outline: none;
}

.prompt-input::placeholder {
  color: rgba(36, 31, 25, 0.32);
}

.prompt-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding-bottom: 4px;
}

.ghost-pill {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.72);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.ghost-pill:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.34);
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.ghost-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(36, 31, 25, 0.16);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(36, 31, 25, 0.2);
}

.generate-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  box-shadow: none;
}

.generate-kbd {
  color: rgba(255, 255, 255, 0.62);
  font-size: 10px;
  font-weight: 600;
}

.generate-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--sf-surface);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pchip {
  display: inline-flex;
  align-items: center;
  max-width: 220px;
  min-height: 24px;
  padding: 0 10px;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.58);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pchip-model {
  color: rgba(36, 31, 25, 0.82);
}

.pchip-accent {
  border-color: rgba(36, 31, 25, 0.28);
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.pchip-action {
  display: none;
  margin-left: auto;
  border-color: rgba(36, 31, 25, 0.3);
  color: var(--sf-ink);
  cursor: pointer;
}

/* ---------- 结果区 ---------- */

.gallery-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 8px 2px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.3) rgba(36, 31, 25, 0.04);
  overscroll-behavior: contain;
}

.gallery-area::-webkit-scrollbar {
  width: 9px;
}

.gallery-area::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
}

.gallery-area::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.34);
  background-clip: padding-box;
}

.gallery-area::-webkit-scrollbar-thumb:hover {
  background: rgba(36, 31, 25, 0.58);
  background-clip: padding-box;
}

.gallery-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 12px 40px;
  text-align: center;
}

.empty-mark {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 18px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.78);
}

.empty-mark svg {
  width: 24px;
  height: 24px;
}

.gallery-empty h2 {
  margin: 0;
  color: rgba(36, 31, 25, 0.94);
  font-size: clamp(20px, 2vw, 26px);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.gallery-empty p {
  max-width: 520px;
  margin: 0;
  color: rgba(36, 31, 25, 0.44);
  font-size: 12.5px;
  line-height: 1.7;
}

.starters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  width: min(100%, 760px);
  margin-top: 8px;
}

.starter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.03);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.starter:hover {
  border-color: rgba(36, 31, 25, 0.3);
  background: rgba(36, 31, 25, 0.08);
  transform: translateY(-1px);
}

.starter-title {
  color: rgba(36, 31, 25, 0.9);
  font-size: 12.5px;
  font-weight: 650;
}

.starter-desc {
  color: rgba(36, 31, 25, 0.4);
  font-size: 10.5px;
  line-height: 1.5;
}

.batch-bar {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 0 0 auto;
  padding: 2px 4px 0;
}

.batch-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.batch-prompt {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: rgba(36, 31, 25, 0.9);
  font-size: 13px;
  line-height: 1.5;
}

.batch-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: rgba(36, 31, 25, 0.36);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.batch-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
  flex: 0 0 auto;
}

.batch-warning,
.batch-error {
  flex: 0 0 auto;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 11.5px;
  line-height: 1.6;
}

.batch-warning {
  border: 1px solid var(--sf-amber-soft);
  background: var(--sf-surface-2);
  color: var(--sf-amber);
}

.batch-error {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--sf-danger-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.batch-error p {
  margin: 0;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}

.gallery-grid.is-single .tile {
  width: min(100%, 680px);
  justify-self: center;
}

.tile {
  position: relative;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 16px;
  aspect-ratio: var(--tile-ratio, 1 / 1);
  background: rgba(36, 31, 25, 0.03);
  cursor: zoom-in;
  transition: border-color 0.22s ease, transform 0.22s ease;
}

.tile:hover {
  border-color: rgba(36, 31, 25, 0.34);
  transform: translateY(-2px);
}

.tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tile-index {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink);
  box-shadow: 0 1px 4px rgba(36, 31, 25, 0.12);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(8px);
}

.tile-note {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 0 8px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink-2);
  font-size: 9.5px;
  font-weight: 600;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}

.tile-overlay {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 26px 10px 10px;
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.94));
  opacity: 0;
  transition: opacity 0.22s ease;
}

.tile:hover .tile-overlay,
.tile:focus-within .tile-overlay {
  opacity: 1;
}

.tile-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tile-tools :deep(.add-to-project) {
  min-height: 26px;
  padding: 0 9px;
  border-color: rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--sf-ink);
  font-size: 11px;
  font-weight: 500;
}

.tile-tools :deep(.add-to-project svg) {
  display: none;
}

.tile-btn {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background 0.18s ease, border-color 0.18s ease;
}

.tile-btn:hover {
  border-color: rgba(36, 31, 25, 0.16);
  background: var(--sf-surface-3);
  color: var(--sf-ink);
}

.tile-btn-layer {
  border-color: rgba(36, 31, 25, 0.4);
  color: var(--sf-ink);
}

.tile-size {
  margin-left: auto;
  color: rgba(36, 31, 25, 0.42);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tile-pending {
  display: grid;
  place-items: center;
  cursor: default;
}

.tile-pending:hover {
  border-color: rgba(36, 31, 25, 0.08);
  transform: none;
}

.tile-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    rgba(36, 31, 25, 0.02) 20%,
    rgba(36, 31, 25, 0.07) 42%,
    rgba(36, 31, 25, 0.02) 64%
  );
  background-size: 220% 100%;
  animation: shimmer 1.5s linear infinite;
}

@keyframes shimmer {
  from {
    background-position: 140% 0;
  }
  to {
    background-position: -60% 0;
  }
}

.tile-pending-text {
  position: relative;
  color: rgba(36, 31, 25, 0.34);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ---------- 参数栏 ---------- */

.param-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 22px;
  background: var(--sf-surface);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.04);
}

.rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.06);
}

.rail-title {
  color: rgba(36, 31, 25, 0.86);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.rail-close {
  display: none;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 50%;
  background: transparent;
  color: rgba(36, 31, 25, 0.6);
  font-size: 11px;
  cursor: pointer;
}

.rail-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px 8px 12px 12px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.36) rgba(36, 31, 25, 0.05);
  overscroll-behavior: contain;
}

/* 参数卡片不允许被压缩：内容超出时交给滚动条，而不是把卡片裁掉。 */
.rail-scroll > * {
  flex: 0 0 auto;
}

.rail-scroll::-webkit-scrollbar {
  width: 9px;
}

.rail-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
}

.rail-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.4);
  background-clip: padding-box;
}

.rail-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(36, 31, 25, 0.62);
  background-clip: padding-box;
}

.rail-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.028);
}

.rail-label {
  color: rgba(36, 31, 25, 0.46);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.rail-hint {
  margin: 0;
  color: rgba(36, 31, 25, 0.36);
  font-size: 10.5px;
  line-height: 1.6;
}

.rail-hint.is-guide {
  color: var(--sf-amber);
}

/* 扩图缺少原图时，用柔和高亮把视线引到上传卡，而不是弹错误框。 */
.upload-card {
  border-radius: 14px;
  transition: box-shadow 0.3s ease, background 0.3s ease;
}

.upload-card.is-highlighted {
  background: rgba(36, 31, 25, 0.06);
  box-shadow: 0 0 0 1px rgba(36, 31, 25, 0.5), 0 0 18px rgba(36, 31, 25, 0.16);
}

.upload-card.is-highlighted .upload-drop {
  border-color: rgba(36, 31, 25, 0.66);
  background: rgba(36, 31, 25, 0.08);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.66);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.chip:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.3);
  color: var(--sf-ink);
}

.chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.chip:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

.chip-count {
  min-width: 38px;
  padding: 0 0;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.ratio-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 9px 4px 7px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.03);
  color: rgba(36, 31, 25, 0.5);
  font-size: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.ratio-chip:hover {
  border-color: rgba(36, 31, 25, 0.3);
  color: var(--sf-ink);
}

.ratio-chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.ratio-box {
  display: block;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: 0.8;
}

.ratio-text {
  font-variant-numeric: tabular-nums;
}

.hidden-input {
  display: none;
}

.upload-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 96px;
  padding: 10px;
  overflow: hidden;
  border: 1px dashed rgba(36, 31, 25, 0.16);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.02);
  color: rgba(36, 31, 25, 0.5);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.upload-drop:hover {
  border-color: rgba(36, 31, 25, 0.42);
  background: rgba(36, 31, 25, 0.06);
}

.upload-drop img {
  width: 100%;
  max-height: 120px;
  border-radius: 10px;
  object-fit: cover;
}

.upload-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-plus {
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
}

.upload-copy {
  font-size: 11.5px;
  font-weight: 600;
}

.upload-hint {
  color: rgba(36, 31, 25, 0.28);
  font-size: 9.5px;
}

/* 多图参考：缩略图网格 + 编号，点缩略图把 @图片N 插进提示词。 */
.upload-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.upload-count {
  color: rgba(36, 31, 25, 0.72);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.upload-thumbs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

/* 单图模型沿用大图预览，只有多图模型才排成缩略图网格。 */
.upload-thumbs:not(.is-multi) {
  grid-template-columns: minmax(0, 1fr);
}

.upload-thumbs:not(.is-multi) .upload-thumb-btn {
  aspect-ratio: 4 / 3;
}

.upload-thumb-item {
  position: relative;
  min-width: 0;
}

.upload-thumb-btn {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.03);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.upload-thumb-btn:hover {
  border-color: rgba(36, 31, 25, 0.5);
}

.upload-thumb-btn img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-thumb-tag {
  position: absolute;
  bottom: 4px;
  left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink);
  font-size: 9px;
  line-height: 1.5;
  backdrop-filter: blur(4px);
}

.upload-thumb-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.upload-thumb-remove:hover {
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.upload-thumb-add {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 1px dashed rgba(36, 31, 25, 0.18);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.02);
  color: rgba(36, 31, 25, 0.45);
  font-size: 18px;
  font-weight: 300;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.upload-thumb-add:hover {
  border-color: rgba(36, 31, 25, 0.5);
  background: rgba(36, 31, 25, 0.06);
  color: var(--sf-ink);
}

.rail-text-btn {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(36, 31, 25, 0.8);
  font-size: 10.5px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.rail-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mini-switch {
  position: relative;
  width: 40px;
  height: 23px;
  padding: 0;
  border: 1px solid rgba(36, 31, 25, 0.16);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.14);
  cursor: pointer;
  transition: background 0.22s ease;
}

.mini-switch.on {
  border-color: transparent;
  background: var(--sf-ink);
}

.mini-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.mini-switch.on .mini-knob {
  transform: translateX(17px);
  background: var(--sf-surface);
}

/* ---------- 历史抽屉 ---------- */

.history-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  justify-content: flex-end;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(6px);
}

.history-panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 400px);
  padding: 18px 16px;
  border-left: 1px solid rgba(36, 31, 25, 0.08);
  background: var(--sf-surface);
  animation: slide-in 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-in {
  from {
    transform: translateX(18px);
    opacity: 0.4;
  }
}

.history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex: 0 0 auto;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.07);
}

.history-kicker {
  color: rgba(36, 31, 25, 0.34);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.history-head h3 {
  margin: 3px 0 0;
  color: var(--sf-ink);
  font-size: 17px;
  font-weight: 700;
}

.history-close {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 50%;
  background: transparent;
  color: rgba(36, 31, 25, 0.6);
  font-size: 11px;
  cursor: pointer;
}

.history-empty {
  margin: 22px 2px;
  color: rgba(36, 31, 25, 0.4);
  font-size: 12px;
  line-height: 1.7;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1 1 auto;
  min-height: 0;
  margin: 12px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.history-item-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.025);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.history-item-btn:hover {
  border-color: rgba(36, 31, 25, 0.3);
  background: rgba(36, 31, 25, 0.07);
}

.history-item.active .history-item-btn {
  border-color: rgba(36, 31, 25, 0.44);
  background: rgba(36, 31, 25, 0.1);
}

.history-thumb {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.05);
}

.history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.history-thumb-empty {
  color: rgba(36, 31, 25, 0.4);
  font-size: 13px;
}

.history-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.history-prompt {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: rgba(36, 31, 25, 0.82);
  font-size: 11.5px;
  line-height: 1.45;
}

.history-meta {
  color: rgba(36, 31, 25, 0.34);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.rail-backdrop {
  display: none;
}

/* ---------- 桌面窄屏 ---------- */

@media (max-width: 1200px) {
  .image-body {
    grid-template-columns: minmax(0, 1fr) 320px;
    padding: 0 12px 4px;
  }

  .starters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ---------- 移动端 ---------- */

@media (max-width: 980px) {
  .image-page {
    padding: 0 8px 8px;
  }

  .image-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 60px 4px 6px;
  }

  .pchip-action {
    display: inline-flex;
  }

  .starters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .param-rail {
    position: fixed;
    right: 8px;
    bottom: 8px;
    left: 8px;
    z-index: 112;
    max-height: min(76vh, 620px);
    border-radius: 20px;
    transform: translateY(calc(100% + 20px));
    pointer-events: none;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .param-rail.is-open {
    transform: translateY(0);
    pointer-events: auto;
  }

  .rail-close {
    display: block;
  }

  .rail-backdrop {
    position: fixed;
    inset: 0;
    z-index: 111;
    display: block;
    background: rgba(36, 31, 25, 0.28);
    backdrop-filter: blur(4px);
  }

  .batch-bar {
    flex-direction: column;
    gap: 8px;
  }

  .batch-actions {
    margin-left: 0;
  }

  .gallery-grid {
    grid-template-columns: repeat(min(var(--cols, 2), 2), minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .prompt-field {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .upload-thumbs.is-multi {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .prompt-buttons {
    justify-content: flex-end;
    padding-bottom: 0;
  }

  .generate-btn {
    flex: 0 0 auto;
  }

  .generate-kbd {
    display: none;
  }

  .starters {
    grid-template-columns: 1fr;
  }

  .gallery-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .history-panel {
    width: 100%;
    border-left: 0;
  }
}
.image-shell {
  margin: 0 auto;
}

</style>
