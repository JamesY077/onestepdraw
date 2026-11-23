<template>
  <div class="model-selector" :class="{ compact, disabled }">
    <select
      v-model="selectedModel"
      :disabled="disabled"
      :title="disabled ? '扩图模式固定使用 Doubao-Seedream-5.0-lite' : undefined"
      @change="onChange"
    >
      <!-- 普通模型 -->
      <option v-for="model in normalModels" :key="model.id" :value="model.id">
        {{ formatModelLabel(model.id) }}
      </option>
      <!-- seedance 2 系列分组：2.0 / -fast / -mini / 2.5 同属一组 -->
      <optgroup v-if="seedanceModels.length" :label="SEEDANCE_2_GROUP_LABEL">
        <option v-for="model in seedanceModels" :key="model.id" :value="model.id">
          {{ formatModelLabel(model.id) }}
        </option>
      </optgroup>
    </select>
    <span class="select-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6.5L8 10L12 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>

    <!-- seedance 2 系列白名单提示弹窗 -->
    <teleport to="body">
      <div v-if="showSeedanceNotice" class="seedance-modal-mask" @click.self="closeSeedanceNotice">
        <div class="seedance-modal" role="dialog" aria-modal="true">
          <div class="seedance-modal-title">seedance 2 系列使用提示</div>
          <p class="seedance-modal-text">{{ SEEDANCE_2_WHITELIST_NOTICE }}</p>
          <div class="seedance-modal-actions">
            <button type="button" class="seedance-modal-btn" @click="closeSeedanceNotice">我已知晓</button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { getModels } from '@/api/aiping'
import type { Model } from '@/types/api'
import type { MediaType } from '@/types/model'
import {
  BUILT_IN_MODELS,
  getModelsByMediaType,

  isSeedance2Model,
  pickPreferredDefaultModelId,
  SEEDANCE_2_GROUP_LABEL,
  SEEDANCE_2_WHITELIST_NOTICE,
} from '@/types/model'


const props = defineProps<{
  mediaType: MediaType
  modelValue: string | null
  compact?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: string | null): void }>()

const selectedModel = ref<string | null>(props.modelValue)
const models = ref<Model[]>([])
const allModels = ref<Model[]>([])
const showSeedanceNotice = ref(false)

// 普通模型与 Seedance 2 系列模型分组展示。
const seedanceModels = computed(() => models.value.filter((m) => isSeedance2Model(m.id)))
const normalModels = computed(() => models.value.filter((m) => !isSeedance2Model(m.id)))

watch(() => props.modelValue, (v) => {
  selectedModel.value = v
})

// 选择默认模型：按媒体类型的首选默认模型优先级挑选（均为非 Seedance 2 系列，
// seedance 为白名单专属，不应作为简易模式 / 节点新建时的默认模型）；
// 命中不到首选时退回第一个非 seedance 模型，仍无则退回列表第一个。
function pickDefaultModelId(): string | null {
  return pickPreferredDefaultModelId(props.mediaType, models.value.map((m) => m.id))
}


watch(() => props.mediaType, () => {
  filterModels()
  if (!models.value.find((m) => m.id === selectedModel.value)) {
    selectedModel.value = pickDefaultModelId()
    emit('update:modelValue', selectedModel.value)
  }
})


function toModel(id: string): Model {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'built-in',
    permission: [],
    root: id,
    parent: null,
  }
}

function filterModels() {
  const allowedIds = new Set(getModelsByMediaType(props.mediaType, allModels.value.map((m) => m.id)))
  const filtered = allModels.value.filter((m) => allowedIds.has(m.id))

  // Seedance 2 系列为白名单专属模型，/models 接口通常不会返回，
  // 这里始终把内置的 Seedance 2 系列模型补进列表，保证前端可见（点击时再弹白名单提示）。
  const existingIds = new Set(filtered.map((m) => m.id.toLowerCase()))
  const seedanceModels = BUILT_IN_MODELS
    .filter((model) => model.mediaType === props.mediaType && isSeedance2Model(model.id))
    .filter((model) => !existingIds.has(model.id.toLowerCase()))
    .map((model) => toModel(model.id))

  models.value = [...filtered, ...seedanceModels].sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'))
}


function buildFallbackModels(): Model[] {
  return BUILT_IN_MODELS
    .filter((model) => model.mediaType === props.mediaType)
    .map((model): Model => ({
      id: model.id,
      object: 'model',
      created: 0,
      owned_by: 'built-in',
      permission: [],
      root: model.id,
      parent: null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'))
}

onMounted(async () => {
  try {
    const response = await getModels()
    allModels.value = response.data
    filterModels()
    if (models.value.length === 0) {
      models.value = buildFallbackModels()
    }
    if (!models.value.find((m) => m.id === selectedModel.value)) {
      selectedModel.value = pickDefaultModelId()
      emit('update:modelValue', selectedModel.value)
    }
  } catch {
    models.value = buildFallbackModels()
    if (!models.value.find((m) => m.id === selectedModel.value)) {
      selectedModel.value = pickDefaultModelId()
      emit('update:modelValue', selectedModel.value)
    }
  }

})

function onChange() {
  emit('update:modelValue', selectedModel.value)
  // 选中 Seedance 2 系列时弹出白名单提示。
  if (isSeedance2Model(selectedModel.value)) {
    showSeedanceNotice.value = true
  }
}

function closeSeedanceNotice() {
  showSeedanceNotice.value = false
}

function formatModelLabel(modelId: string): string {
  // 仅展示模型 ID，去掉后面的可用性说明文案。
  return modelId
}

</script>

<style scoped>
.model-selector,
select {
  width: 100%;
}

.model-selector {
  position: relative;
}

.model-selector.compact {
  max-width: 100%;
}

select {
  appearance: none;
  -webkit-appearance: none;
  min-height: 46px;
  padding: 0 42px 0 16px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.08);
  color: var(--color-text);
  outline: none;
}

select option {
  background: #ffffff;
  color: #1d1d1b;
}

.compact select {
  min-height: 28px;
  padding: 0 26px 0 8px;
  border-radius: 10px;
  font-size: 11px;
  background: rgba(17, 17, 16, 0.06);
}

select:focus {
  border-color: var(--color-border-strong);
}

.model-selector.disabled select {
  cursor: not-allowed;
  opacity: 0.78;
}

.model-selector.disabled .select-icon {
  opacity: 0.55;
}

.select-icon {
  position: absolute;
  top: 50%;
  right: 14px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transform: translateY(-50%);
  pointer-events: none;
}

.compact .select-icon {
  right: 10px;
  width: 14px;
  height: 14px;
}

.select-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* Seedance 2 系列白名单提示弹窗 */
.seedance-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 17, 16, 0.28);
  padding: 20px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.seedance-modal {
  width: 100%;
  max-width: 380px;
  background: #ffffff;
  border: 1px solid rgba(17, 17, 16, 0.10);
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 24px 70px rgba(17, 17, 16, 0.16);
}

.seedance-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: rgba(29, 29, 27, 0.94);
  margin-bottom: 12px;
}

.seedance-modal-text {
  font-size: 14px;
  line-height: 1.7;
  color: rgba(29, 29, 27, 0.66);
  margin: 0 0 20px;
}

.seedance-modal-actions {
  display: flex;
  justify-content: flex-end;
}

.seedance-modal-btn {
  min-height: 40px;
  padding: 0 24px;
  border: 1px solid var(--color-action-border);
  border-radius: 999px;
  background: var(--color-action-bg);
  color: var(--color-action-text);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(17, 17, 16, 0.14);
}

.seedance-modal-btn:hover {
  opacity: 0.96;
  background: var(--color-action-bg-hover);
}
</style>
