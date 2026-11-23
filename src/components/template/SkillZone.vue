<template>
  <div class="sz-zone">
    <section v-if="!distillOpen" class="sz-intro">
      <div class="sz-intro-copy">
        <strong>把长内容变成能用的能力</strong>
        <p>书、长视频、播客都能蒸馏成可执行 Skill。选中后直接带去创作对话、图片或视频生成。</p>
      </div>
      <button type="button" class="sz-distill-open" @click="openDistill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        蒸馏新 Skill
      </button>
    </section>

    <section v-else class="sz-distill">
      <header class="sz-distill-head">
        <div>
          <strong>蒸馏一个新 Skill</strong>
          <p>粘贴书稿、视频转写或播客文字稿，产出 1–3 个可执行 Skill。</p>
        </div>
        <button type="button" class="sz-ghost" :disabled="distilling" @click="closeDistill">取消</button>
      </header>

      <div class="sz-field-row">
        <label class="sz-field">
          <span>来源标题</span>
          <input v-model="distillTitle" class="sz-input" type="text" placeholder="例如：《影响力》第 3 章 / 某期播客" />
        </label>
        <label class="sz-field sz-field--type">
          <span>类型</span>
          <select v-model="distillType" class="sz-input">
            <option v-for="option in DISTILL_SOURCE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <label class="sz-field">
        <span>重点服务（可选）</span>
        <input v-model="distillFocus" class="sz-input" type="text" placeholder="例如：短视频脚本、品牌文案、产品决策" />
      </label>

      <label class="sz-field">
        <span>原文</span>
        <textarea
          v-model="distillText"
          class="sz-input sz-textarea"
          rows="8"
          placeholder="粘贴书稿节选、视频字幕、播客文字稿或课程笔记。建议 2000–20000 字，太长会自动截取前 26000 字。"
        />
      </label>

      <div class="sz-distill-meta">
        <button type="button" class="sz-file-btn" :disabled="distilling" @click="fileInputRef?.click()">
          导入文本文件
        </button>
        <input
          ref="fileInputRef"
          class="sz-file"
          type="file"
          accept=".md,.markdown,.txt,.srt,.vtt,.json,.csv"
          @change="handleFile"
        />
        <span class="sz-count" :class="{ over: distillText.length > DISTILL_MAX_INPUT_CHARS }">
          {{ distillText.length.toLocaleString() }} 字
        </span>
      </div>

      <p v-if="distillError" class="sz-error">{{ distillError }}</p>
      <p v-if="distillNotice" class="sz-notice">{{ distillNotice }}</p>

      <div class="sz-distill-actions">
        <span class="sz-distill-hint">蒸馏方法：cangjie-skill · RIA-TV++</span>
        <button
          type="button"
          class="sz-primary"
          :disabled="distilling || !distillTitle.trim() || distillText.trim().length < 200"
          @click="runDistill"
        >
          {{ distilling ? '正在蒸馏…' : '开始蒸馏' }}
        </button>
      </div>
    </section>

    <template v-if="!distillOpen">
      <div class="sz-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 3.4 3.4" />
        </svg>
        <input v-model="query" type="search" placeholder="搜索 Skill、来源或领域" aria-label="搜索 Skill" />
      </div>

      <div class="sz-filters" role="group" aria-label="按场景筛选">
        <button
          v-for="item in filters"
          :key="item.value"
          type="button"
          :class="{ active: channel === item.value }"
          @click="channel = item.value"
        >
          {{ item.label }}
        </button>
      </div>

      <p v-if="notice" class="sz-notice">{{ notice }}</p>

      <div class="sz-list">
        <article
          v-for="skill in filteredSkills"
          :key="skill.id"
          class="sz-card"
          :class="{ 'is-user': skill.kind === 'user' }"
        >
          <header class="sz-card-head">
            <span class="sz-source">{{ SKILL_SOURCE_LABELS[skill.sourceType] }}</span>
            <span class="sz-source-title">{{ skill.sourceTitle }}</span>
            <span v-if="skill.kind === 'user'" class="sz-user-tag">我的蒸馏</span>
            <span v-else-if="libraryStore.isActive(skill)" class="sz-active-tag">已启用</span>
          </header>

          <h3>{{ skill.name }}</h3>
          <p class="sz-summary">{{ skill.summary }}</p>

          <div class="sz-tags">
            <span v-for="domain in skill.domains" :key="domain" class="sz-tag">{{ domain }}</span>
          </div>

          <div class="sz-actions">
            <button type="button" class="sz-action sz-action--chat" @click="applySkill(skill, 'chat')">
              带入创作对话
            </button>
            <button type="button" class="sz-action" @click="applySkill(skill, 'image')">图片生成</button>
            <button type="button" class="sz-action" @click="applySkill(skill, 'video')">视频生成</button>
            <button
              v-if="skill.kind === 'user'"
              type="button"
              class="sz-action sz-action--danger"
              @click="removeSkill(skill)"
            >
              删除
            </button>
          </div>

          <details class="sz-detail">
            <summary>查看 Skill 正文</summary>
            <pre>{{ skill.content }}</pre>
          </details>
        </article>
      </div>

      <div v-if="!filteredSkills.length" class="sz-empty">
        {{ query.trim() ? '没有找到匹配的 Skill' : '这个场景下还没有 Skill，先蒸馏一个。' }}
      </div>

      <p class="sz-credit">
        蒸馏方法改编自
        <a href="https://github.com/kangarooking/cangjie-skill" target="_blank" rel="noreferrer">cangjie-skill</a>
        的 RIA-TV++；脚本规范参考
        <a href="https://github.com/win4r/video-director" target="_blank" rel="noreferrer">video-director</a>
        与
        <a href="https://github.com/mattpocock/skills" target="_blank" rel="noreferrer">grill-me</a>
        （均为 MIT）。
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSkillLibraryStore } from '@/stores/skillLibraryStore'
import { useChatModeStore } from '@/stores/chatModeStore'
import {
  DISTILL_MAX_INPUT_CHARS,
  distillSkillPackage,
} from '@/features/skill/library/distill'
import {
  DISTILL_SOURCE_OPTIONS,
  SKILL_CHANNEL_LABELS,
  SKILL_SOURCE_LABELS,
  type DistilledSkill,
  type SkillChannel,
  type SkillSourceType,
} from '@/features/skill/library/types'
import { AppError, showErrorMessage } from '@/utils/errors'

const libraryStore = useSkillLibraryStore()
const chatMode = useChatModeStore()
const router = useRouter()

const query = ref('')
const channel = ref<'all' | SkillChannel>('all')
const notice = ref('')

const filters: Array<{ value: 'all' | SkillChannel; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: SKILL_CHANNEL_LABELS.video },
  { value: 'image', label: SKILL_CHANNEL_LABELS.image },
  { value: 'copy', label: SKILL_CHANNEL_LABELS.copy },
  { value: 'chat', label: SKILL_CHANNEL_LABELS.chat },
]

const filteredSkills = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return libraryStore.allSkills.filter((skill) => {
    if (channel.value !== 'all' && !skill.channels.includes(channel.value)) return false
    if (!keyword) return true
    return [skill.name, skill.summary, skill.sourceTitle, ...skill.domains]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
})

function applySkill(skill: DistilledSkill, target: 'chat' | 'image' | 'video') {
  const result = libraryStore.activate(skill)
  if (result === 'full') {
    showErrorMessage(
      new AppError('生成页最多同时使用 3 个 Skill，请先在图片/视频页移除一个，再从这里带入。'),
    )
    return
  }
  if (result === 'duplicate') {
    notice.value = `「${skill.name}」已在生成页启用，已直接为你带上。`
  } else {
    notice.value = `已启用「${skill.name}」。`
  }
  if (target === 'chat') {
    chatMode.setConversation('create')
    void router.push('/chat')
    return
  }
  void router.push(target === 'image' ? '/image' : '/video')
}

/* ------------------------------ 蒸馏 ------------------------------ */

const distillOpen = ref(false)
const distillTitle = ref('')
const distillType = ref<SkillSourceType>('book')
const distillFocus = ref('')
const distillText = ref('')
const distilling = ref(false)
const distillError = ref('')
const distillNotice = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

function openDistill() {
  distillOpen.value = true
  notice.value = ''
  distillError.value = ''
  distillNotice.value = ''
}

function closeDistill() {
  if (distilling.value) return
  distillOpen.value = false
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    distillError.value = '文件超过 8MB，请换一个小一点的文本文件。'
    return
  }
  try {
    const text = await file.text()
    distillText.value = text.slice(0, DISTILL_MAX_INPUT_CHARS * 2)
    if (!distillTitle.value.trim()) {
      distillTitle.value = file.name.replace(/\.(md|markdown|txt|srt|vtt|json|csv)$/i, '')
    }
    distillError.value = ''
  } catch {
    distillError.value = '文件读取失败，请重试。'
  }
}

async function runDistill() {
  if (distilling.value) return
  const text = distillText.value.trim()
  if (!distillTitle.value.trim() || text.length < 200) return
  distilling.value = true
  distillError.value = ''
  distillNotice.value = ''
  try {
    const result = await distillSkillPackage({
      title: distillTitle.value,
      sourceType: distillType.value,
      text,
      focus: distillFocus.value,
    })
    const added = libraryStore.saveDrafts(result.drafts, {
      sourceTitle: distillTitle.value.trim(),
      sourceType: distillType.value,
    })
    if (!added) {
      distillNotice.value = '这批 Skill 已经存在（同名），没有重复保存。'
      return
    }
    notice.value = `已蒸馏 ${added} 个 Skill，并加入列表。`
    distillText.value = ''
    distillFocus.value = ''
    distillOpen.value = false
  } catch (error) {
    distillError.value = error instanceof Error ? error.message : '蒸馏失败，请稍后重试。'
  } finally {
    distilling.value = false
  }
}

function removeSkill(skill: DistilledSkill) {
  libraryStore.removeSkill(skill.id)
  notice.value = `已删除「${skill.name}」。`
}
</script>

<style scoped>
.sz-zone {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  scrollbar-width: thin;
}

.sz-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid #efe8e2;
  border-radius: 11px;
  background: #fdf9f6;
}

.sz-intro-copy strong {
  color: #3b2a23;
  font-size: 11.5px;
  font-weight: 650;
}

.sz-intro-copy p {
  margin: 3px 0 0;
  color: #a08c81;
  font-size: 10px;
  line-height: 1.55;
}

.sz-distill-open {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  padding: 6px 9px;
  border: 1px solid #b4472f;
  border-radius: 8px;
  background: #b4472f;
  color: #ffffff;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.sz-distill-open:hover {
  border-color: #9c3b26;
  background: #9c3b26;
}

.sz-distill-open svg {
  width: 12px;
  height: 12px;
}

.sz-distill {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  border: 1px solid #e8e8e2;
  border-radius: 11px;
  background: #fbfbf8;
}

.sz-distill-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.sz-distill-head strong {
  color: #1d1d1b;
  font-size: 12.5px;
  font-weight: 650;
}

.sz-distill-head p {
  margin: 3px 0 0;
  color: #9a9a92;
  font-size: 10px;
  line-height: 1.55;
}

.sz-distill-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sz-distill-hint {
  color: #b0b0a8;
  font-size: 9px;
}

.sz-field-row {
  display: flex;
  gap: 7px;
}

.sz-field {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.sz-field--type {
  flex: 0 0 112px;
}

.sz-field > span {
  color: #8c8c84;
  font-size: 9.5px;
  font-weight: 550;
}

.sz-input {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid #e6e6df;
  border-radius: 8px;
  outline: none;
  background: #ffffff;
  color: #2c2c28;
  font-family: inherit;
  font-size: 11px;
}

.sz-input:focus {
  border-color: #c9c9c1;
}

.sz-textarea {
  resize: vertical;
  line-height: 1.6;
}

.sz-distill-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sz-file-btn {
  padding: 4px 8px;
  border: 1px solid #e4e4dc;
  border-radius: 7px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 9.5px;
  cursor: pointer;
}

.sz-file-btn:hover:not(:disabled) {
  border-color: #b4472f;
  color: #b4472f;
}

.sz-file {
  display: none;
}

.sz-count {
  margin-left: auto;
  color: #a3a39b;
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.sz-count.over {
  color: #b4472f;
}

.sz-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  padding: 0 10px;
  border: 1px solid #ecece6;
  border-radius: 9px;
  background: #fafaf7;
}

.sz-search svg {
  width: 14px;
  height: 14px;
  flex: none;
  color: #b0b0a8;
}

.sz-search input {
  width: 100%;
  padding: 9px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #2c2c28;
  font-family: inherit;
  font-size: 12px;
}

.sz-search input::placeholder {
  color: #b3b3ab;
}

.sz-filters {
  display: flex;
  gap: 5px;
  margin: 9px 0 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.sz-filters::-webkit-scrollbar {
  display: none;
}

.sz-filters button {
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

.sz-filters button:hover {
  border-color: #d8d8d0;
}

.sz-filters button.active {
  border-color: #111110;
  background: #111110;
  color: #ffffff;
}

.sz-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.sz-card {
  padding: 10px 11px;
  border: 1px solid #ecece6;
  border-radius: 11px;
  background: #ffffff;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.sz-card:hover {
  border-color: #d9d9d1;
  box-shadow: 0 6px 18px rgba(17, 17, 16, 0.05);
}

.sz-card.is-user {
  border-color: #efdcd3;
  background: #fffdfb;
}

.sz-card-head {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin-bottom: 5px;
}

.sz-source {
  flex: none;
  padding: 1px 5px;
  border-radius: 999px;
  background: #f3f3ed;
  color: #8c8c84;
  font-size: 8.5px;
  font-weight: 600;
}

.sz-source-title {
  overflow: hidden;
  color: #b0b0a8;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sz-user-tag,
.sz-active-tag {
  flex: none;
  margin-left: auto;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 600;
}

.sz-user-tag {
  background: #fdf1ec;
  color: #b4472f;
}

.sz-active-tag {
  background: #eef5ee;
  color: #3f6b45;
}

.sz-card h3 {
  margin: 0;
  color: #262622;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.sz-summary {
  margin: 4px 0 0;
  color: #8c8c84;
  font-size: 10.5px;
  line-height: 1.6;
}

.sz-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.sz-tag {
  padding: 1px 5px;
  border: 1px solid #f0ece7;
  border-radius: 5px;
  background: #fcfbf8;
  color: #a3a39b;
  font-size: 8.5px;
}

.sz-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.sz-action {
  padding: 5px 9px;
  border: 1px solid #e7e7e1;
  border-radius: 7px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10px;
  font-weight: 550;
  cursor: pointer;
}

.sz-action:hover {
  border-color: #cfcfc7;
  color: #1d1d1b;
}

.sz-action--chat {
  border-color: #111110;
  background: #111110;
  color: #ffffff;
}

.sz-action--chat:hover {
  border-color: #000000;
  background: #000000;
  color: #ffffff;
}

.sz-action--danger {
  border-color: transparent;
  background: transparent;
  color: #b0b0a8;
}

.sz-action--danger:hover {
  border-color: #f0d8d0;
  background: #fdf4f1;
  color: #b4472f;
}

.sz-detail {
  margin-top: 7px;
  border-top: 1px dashed #f0f0ea;
  padding-top: 6px;
}

.sz-detail summary {
  color: #a3a39b;
  font-size: 9.5px;
  cursor: pointer;
}

.sz-detail pre {
  max-height: 220px;
  margin: 6px 0 0;
  overflow: auto;
  padding: 8px;
  border-radius: 8px;
  background: #f8f8f4;
  color: #5c5c55;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.sz-empty {
  margin: 24px 4px;
  color: #9a9a92;
  font-size: 11px;
  line-height: 1.7;
  text-align: center;
}

.sz-notice {
  margin: 0 0 9px;
  padding: 6px 8px;
  border-radius: 7px;
  background: #f4f8f3;
  color: #4d6b4f;
  font-size: 10px;
  line-height: 1.55;
}

.sz-error {
  margin: 0;
  color: #b4472f;
  font-size: 10.5px;
  line-height: 1.55;
}

.sz-credit {
  margin: 16px 2px 0;
  color: #b3b3ab;
  font-size: 9px;
  line-height: 1.7;
}

.sz-credit a {
  color: #9a9a92;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.sz-credit a:hover {
  color: #b4472f;
}

.sz-ghost {
  flex: none;
  padding: 5px 8px;
  border: 1px solid #e7e7e1;
  border-radius: 7px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10px;
  cursor: pointer;
}

.sz-primary {
  padding: 6px 12px;
  border: 1px solid #b4472f;
  border-radius: 8px;
  background: #b4472f;
  color: #ffffff;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.sz-primary:hover:not(:disabled) {
  border-color: #9c3b26;
  background: #9c3b26;
}

.sz-primary:disabled {
  border-color: #e4d7d1;
  background: #e4d7d1;
  cursor: default;
}

@media (max-width: 560px) {
  .sz-intro {
    flex-direction: column;
  }
  .sz-distill-open {
    align-self: flex-start;
  }
  .sz-field-row {
    flex-wrap: wrap;
  }
  .sz-field--type {
    flex: 1 1 100%;
  }
}
</style>
