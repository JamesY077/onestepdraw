<template>
  <div class="skill-picker" :class="`skill-picker-${layout}`">
    <div class="skill-picker-head">
      <span class="skill-picker-title">风格 Skill</span>
      <span class="skill-picker-meta">
        {{ totalSelected
          ? `已选 ${totalSelected} 个${skillStore.activeSkills.length ? ` · 含上传 ${skillStore.activeSkills.length}` : ''}`
          : layout === 'grid' ? '可多选' : '可多选 · 横向滑动' }}
      </span>
      <button
        v-if="skillStore.selectedStyleSkillIds.length"
        class="skill-picker-clear"
        type="button"
        @click="skillStore.clearStyleSkills()"
      >
        清空风格
      </button>
    </div>

    <div
      class="skill-picker-rail"
      role="group"
      aria-label="风格 Skill 与上传 Skill"
      @wheel="handleSkillRailWheel"
    >
      <!-- 上传入口放在最前：打开参数栏即可看到，不和风格卡抢滚动位置。 -->
      <input
        ref="skillFileInput"
        type="file"
        accept=".md,text/markdown"
        class="file-input"
        multiple
        @change="handleSkillFileChange"
      />
      <button
        class="skill-chip skill-chip-add"
        type="button"
        :class="{ 'is-full': isUploadFull }"
        :disabled="isUploadFull"
        :title="isUploadFull
          ? `最多同时使用 ${MAX_ACTIVE_SKILLS} 个上传 Skill`
          : '上传 .md Skill，可多选，生成时将严格遵循其规范'"
        @click="skillFileInput?.click()"
      >
        <span class="skill-chip-thumb skill-add-thumb" aria-hidden="true">
          <span class="skill-add-plus">{{ isUploadFull ? '满' : '+' }}</span>
          <span class="skill-add-label">{{ isUploadFull ? '已达上限' : '上传 Skill' }}</span>
        </span>
        <span class="skill-chip-name">
          {{ isUploadFull ? `最多 ${MAX_ACTIVE_SKILLS} 个` : '支持 .md' }}
        </span>
      </button>

      <!-- 已上传的 Skill：与风格卡同尺寸，可单独移除。 -->
      <div
        v-for="(skill, index) in skillStore.activeSkills"
        :key="`uploaded-${skill.name}-${index}`"
        class="skill-chip skill-chip-uploaded"
        :title="skill.description || skill.name"
      >
        <span class="skill-chip-thumb skill-chip-placeholder" aria-hidden="true">
          {{ skillInitial(skill.name) }}
        </span>
        <span class="skill-chip-check skill-chip-check--active" aria-hidden="true">✓</span>
        <button
          class="skill-chip-remove"
          type="button"
          :aria-label="`移除 ${skill.name}`"
          :title="`移除 ${skill.name}`"
          @click="skillStore.removeActiveSkill(index)"
        >
          ×
        </button>
        <span class="skill-chip-name">{{ skill.name }}</span>
      </div>

      <button
        v-for="skill in styleSkillOptions"
        :key="skill.id"
        class="skill-chip"
        :class="{ active: skillStore.selectedStyleSkillIds.includes(skill.id) }"
        type="button"
        :title="skill.description"
        :aria-pressed="skillStore.selectedStyleSkillIds.includes(skill.id)"
        @click="skillStore.toggleStyleSkill(skill.id)"
      >
        <img
          v-if="skill.thumbnail"
          class="skill-chip-thumb"
          :src="getPreviewSrc(skill)"
          alt=""
          loading="lazy"
          decoding="async"
          @error="handlePreviewError(skill, $event)"
        />
        <span class="skill-chip-name">{{ skill.name }}</span>
        <span class="skill-chip-check" aria-hidden="true">✓</span>
      </button>
    </div>

    <div class="skill-picker-foot">
      <div v-if="!hideDefaults" class="skill-defaults">
        <span class="skill-defaults-label">默认规范</span>
        <span
          v-for="skill in skillStore.enabledDefaultQualitySkills"
          :key="skill.id"
          class="skill-default-tag"
        >
          {{ skill.name }}
        </span>
        <span v-if="!skillStore.enabledDefaultQualitySkills.length" class="skill-defaults-off">
          已全部关闭
        </span>
        <button class="skill-settings-link" type="button" @click="openSkillZone">
          Skill 专区
        </button>
        <button class="skill-settings-link" type="button" @click="router.push('/settings')">
          设置
        </button>
      </div>
      <span class="skill-upload-count">
        上传 {{ skillStore.activeSkills.length }}/{{ MAX_ACTIVE_SKILLS }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MAX_ACTIVE_SKILLS, useSkillStore } from '@/stores/skillStore'
import { readSkillFile } from '@/features/skill/parse'
import { STYLE_SKILL_OPTIONS } from '@/features/skill/builtin'
import { getSkillPreviewPath } from '@/features/skill/previews'
import { showErrorMessage } from '@/utils/errors'
import { assetUrl } from '@/utils/assets'

/**
 * 内置风格 Skill 多选器 + 上传 Skill 卡片。
 * layout=rail：横向滑动缩略图；layout=grid：多列网格（图片页 / 视频页参数栏）。
 * 上传 Skill 最多 3 个，与内置风格卡同尺寸展示。
 */
const props = withDefaults(defineProps<{
  layout?: 'rail' | 'grid'
  /** 隐藏「默认规范」脚注：视频生成不携带图片的默认质量规范。 */
  hideDefaults?: boolean
  /** 当前选择的图片模型；示例图会按模型读取对应目录。 */
  modelId?: string | null
}>(), { layout: 'rail', hideDefaults: false, modelId: null })

const router = useRouter()

function openSkillZone() {
  router.push({ path: '/templates', query: { tab: 'skill', from: router.currentRoute.value.fullPath } })
}
const skillStore = useSkillStore()
const styleSkillOptions = STYLE_SKILL_OPTIONS
const skillFileInput = ref<HTMLInputElement | null>(null)

const isUploadFull = computed(() => skillStore.activeSkills.length >= MAX_ACTIVE_SKILLS)
/** 头部计数同时包含内置风格与上传 Skill，避免上传后看起来「没被选中」。 */
const totalSelected = computed(
  () => skillStore.selectedStyleSkillIds.length + skillStore.activeSkills.length,
)
/** 单份 Skill 只用于生成规范，超过 512KB 基本是误传，也容易撑爆 localStorage。 */
const MAX_SKILL_FILE_BYTES = 512 * 1024
/** 记录加载失败的「模型 + Skill」组合，失败后回落到公共示例图。 */
const failedPreviewKeys = ref<string[]>([])

function getPreviewSrc(skill: { id: string; thumbnail?: string }): string {
  if (!skill.thumbnail) return ''
  const key = `${props.modelId || 'base'}:${skill.id}`
  const path = failedPreviewKeys.value.includes(key)
    ? skill.thumbnail
    : getSkillPreviewPath(skill, props.modelId)
  return assetUrl(path || skill.thumbnail)
}

function handlePreviewError(skill: { id: string; thumbnail?: string }, event: Event) {
  if (!skill.thumbnail) return
  const key = `${props.modelId || 'base'}:${skill.id}`
  if (!failedPreviewKeys.value.includes(key)) {
    failedPreviewKeys.value = [...failedPreviewKeys.value, key]
  }
  // 立即回退，避免 404 后一直显示破图。
  ;(event.currentTarget as HTMLImageElement).src = assetUrl(skill.thumbnail)
}

function skillInitial(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'S'
  // 中文取首字，英文取首字母，避免卡片里全是 skill 后缀。
  return trimmed.replace(/\.md$/i, '').slice(0, 2).toUpperCase()
}

function handleSkillRailWheel(event: WheelEvent) {
  const rail = event.currentTarget as HTMLElement | null
  if (!rail) return
  if (rail.scrollWidth <= rail.clientWidth) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  event.preventDefault()
  rail.scrollLeft += event.deltaY
}

async function handleSkillFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (!files.length) return

  const remaining = MAX_ACTIVE_SKILLS - skillStore.activeSkills.length
  let added = 0
  let duplicated = 0
  let failed = 0

  for (const file of files.slice(0, Math.max(0, remaining))) {
    if (file.size > MAX_SKILL_FILE_BYTES) {
      failed += 1
      continue
    }
    try {
      const content = await readSkillFile(file)
      if (skillStore.addActiveSkillFromContent(content, file.name)) {
        added += 1
      } else {
        duplicated += 1
      }
    } catch {
      failed += 1
    }
  }

  const skipped = Math.max(0, files.length - Math.max(0, remaining))
  if (!added && duplicated) {
    showErrorMessage('这些 Skill 已经上传过了，请换一个文件。')
  } else if (!added && skipped) {
    showErrorMessage(`最多同时使用 ${MAX_ACTIVE_SKILLS} 个上传 Skill，请先移除一个。`)
  } else if (!added && failed) {
    showErrorMessage('Skill 文件读取失败：请确认是 .md 文件，且不超过 512KB。')
  } else if (added && skipped) {
    showErrorMessage(`已添加 ${added} 个，最多同时使用 ${MAX_ACTIVE_SKILLS} 个上传 Skill。`)
  }

  target.value = ''
}
</script>

<style scoped>
.file-input {
  display: none;
}

.skill-picker {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  /* 横向 chip 列表不能把父级 grid 列撑宽 */
  contain: inline-size;
  padding: 10px;
  border: 1px solid var(--sf-line);
  border-radius: 16px;
  background: var(--sf-surface-2);
}

.skill-picker-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.skill-picker-title {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sf-ink-2);
}

.skill-picker-meta {
  font-size: 10.5px;
  color: var(--sf-ink-3);
}

.skill-picker-clear {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
  font-size: 10px;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.skill-picker-clear:hover {
  border-color: var(--sf-line-strong);
  color: var(--sf-ink);
}

.skill-picker-rail {
  display: flex;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding-bottom: 3px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--sf-line-strong) transparent;
}

.skill-picker-rail::-webkit-scrollbar {
  height: 5px;
}

.skill-picker-rail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--sf-line-strong);
}

.skill-picker-rail::-webkit-scrollbar-track {
  background: transparent;
}

.skill-chip {
  position: relative;
  flex: 0 0 auto;
  width: 78px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.skill-chip-thumb {
  display: block;
  width: 78px;
  height: 78px;
  border-radius: 11px;
  object-fit: cover;
  filter: none;
  outline: 1px solid var(--sf-line-soft);
  outline-offset: -1px;
  transition:
    filter 0.3s ease,
    outline-color 0.3s ease,
    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.skill-chip:hover .skill-chip-thumb {
  filter: none;
  transform: translateY(-2px);
}

.skill-chip.active .skill-chip-thumb {
  filter: none;
  outline: 2px solid var(--sf-ink);
  outline-offset: -2px;
}

.skill-chip-name {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--sf-ink-2);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: color 0.25s ease;
}

.skill-chip.active .skill-chip-name {
  color: var(--sf-ink);
  font-weight: 700;
}

.skill-chip-check {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-size: 10px;
  font-weight: 800;
  box-shadow: 0 0 0 1.5px rgba(36, 31, 25, 0.12);
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity 0.25s ease,
    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.skill-chip.active .skill-chip-check {
  opacity: 1;
  transform: scale(1);
}

/* 上传的 Skill 始终参与生成：用同款对勾标明「已加入」，右上角保留移除按钮。 */
.skill-chip-check--active {
  left: 5px;
  right: auto;
  opacity: 1;
  transform: scale(1);
}

/* 上传的 Skill：用同样的尺寸占位，避免和内置缩略图错位。 */
.skill-chip-uploaded {
  cursor: default;
}

.skill-chip-placeholder {
  display: grid;
  place-items: center;
  background: var(--sf-surface-3);
  color: var(--sf-ink-2);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.skill-chip-uploaded:hover .skill-chip-thumb {
  filter: none;
  transform: none;
}

.skill-chip-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--sf-line);
  border-radius: 50%;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.skill-chip-remove:hover {
  border-color: var(--sf-danger-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

/* 上传入口：与 sample skill 同尺寸的虚线卡。 */
.skill-chip-add {
  border: 0;
}

.skill-add-thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 1px dashed var(--sf-line-strong);
  background: var(--sf-surface);
  color: var(--sf-ink-3);
}

.skill-chip-add:hover .skill-add-thumb {
  border-color: var(--sf-line-strong);
  background: var(--sf-surface-3);
  color: var(--sf-ink);
  filter: none;
}

.skill-chip-add.is-full {
  cursor: not-allowed;
}

.skill-chip-add.is-full .skill-add-thumb {
  border-style: solid;
  border-color: var(--sf-line-soft);
  background: var(--sf-surface-2);
  color: var(--sf-line-strong);
}

.skill-add-plus {
  font-size: 22px;
  font-weight: 400;
  line-height: 1;
}

.skill-add-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.skill-picker-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.skill-defaults {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.skill-defaults-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sf-ink-3);
}

.skill-default-tag {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-2);
  font-size: 9.5px;
  white-space: nowrap;
}

.skill-defaults-off {
  color: var(--sf-amber);
  font-size: 10px;
}

.skill-settings-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sf-ink-3);
  font-size: 10px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.skill-settings-link:hover {
  color: var(--sf-ink);
}

.skill-upload-count {
  margin-left: auto;
  color: var(--sf-ink-3);
  font-size: 10px;
  white-space: nowrap;
}

/* 侧栏网格版：三列铺满，方便快速扫视风格 */
.skill-picker-grid .skill-picker-rail {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 8px;
  overflow: visible;
}

.skill-picker-grid .skill-chip {
  width: 100%;
  min-width: 0;
}

.skill-picker-grid .skill-chip-thumb {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

.skill-picker-grid .skill-picker-foot {
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}

.skill-picker-grid .skill-defaults {
  min-width: 0;
}

.skill-picker-grid .skill-default-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 560px) {
  .skill-picker {
    padding: 9px;
  }

  .skill-picker-rail .skill-chip,
  .skill-picker-rail .skill-chip-thumb {
    width: 70px;
  }

  .skill-picker-rail .skill-chip-thumb {
    height: 70px;
  }

  .skill-picker-grid .skill-chip,
  .skill-picker-grid .skill-chip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
}
</style>
