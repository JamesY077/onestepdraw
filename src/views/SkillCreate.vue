<script setup lang="ts">
// 创作 Skill 页面：左侧对话生成，右侧 Skill 文档编辑 + 效果测试。
import { computed, nextTick, ref } from 'vue'
import { generateSkill, type SkillTurn } from '@/features/skill/generate'
import { parseSkillContent } from '@/features/skill/parse'
import { ARTSKILLS_DISPLAY_NAME } from '@/features/skill/models'
import { MAX_ACTIVE_SKILLS, useSkillStore } from '@/stores/skillStore'
import { showErrorMessage } from '@/utils/errors'
import { useGenerate } from '@/composables/useGenerate'
import { useChatStore } from '@/stores/chatStore'
import { imageModelModules, videoModelModules } from '@/models'
import StudioHeader from '@/components/StudioHeader.vue'
import AppTopNav from '@/components/AppTopNav.vue'
import AddToProjectButton from '@/components/common/AddToProjectButton.vue'

const skillStore = useSkillStore()
const chatStore = useChatStore()
const { generate } = useGenerate()

const accent = 'var(--studio-accent-skill)'

// —— 模版例子专区 ——
const templates = [
  { title: '电影质感剧照', prompt: '帮我创作一个影视风格的 skill，用于生成电影质感的剧照、关键帧和短片镜头。' },
  { title: '短视频带货', prompt: '帮我创作一个短视频带货口播的 skill，输出开场钩子、卖点脚本与分镜。' },
  { title: '产品宣传片', prompt: '帮我创作一个产品宣传片的 skill，强调质感、使用场景与卖点呈现。' },
  { title: '国风插画', prompt: '帮我创作一个国风插画风格的 skill，用于生成角色、场景和装饰性插画。' },
  { title: '品牌视觉 VI', prompt: '帮我创作一个品牌视觉规范 skill，输出标志延展、主视觉、色彩与版式规则。' },
  { title: '3D 卡通角色', prompt: '帮我创作一个 3D 卡通角色设计 skill，生成三视图、表情和动作参考。' },
  { title: '游戏场景概念', prompt: '帮我创作一个游戏场景概念设计 skill，强调世界观、光影、氛围和镜头叙事。' },
  { title: '电商产品主图', prompt: '帮我创作一个电商产品主图 skill，突出卖点、质感、背景和促销构图。' },
  { title: '美食摄影', prompt: '帮我创作一个美食摄影 skill，生成高质感产品美食的食材和餐厅氛围图。' },
  { title: '建筑室内空间', prompt: '帮我创作一个建筑与室内概念方案 skill，生成空间效果图与材质灯光方案。' },
  { title: '漫剧分镜', prompt: '帮我创作一个漫剧分镜 skill，输出章节镜头、台词和画面节奏规范。' },
  { title: '儿童绘本', prompt: '帮我创作一个儿童绘本 skill，生成温暖治愈的插画、角色和页版设计。' },
]

const quickTemplates = templates.slice(0, 4)

// —— 对话 ——
const input = ref('')
const messages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
const isGenerating = ref(false)
const messagesRef = ref<HTMLElement | null>(null)

// —— Skill 文档 ——
const markdown = ref('')
const rightTab = ref<'editor' | 'test'>('editor')
const applied = ref(false)

const skillName = computed(() => {
  if (!markdown.value.trim()) return ARTSKILLS_DISPLAY_NAME
  return parseSkillContent(markdown.value).name
})

const charCount = computed(() => markdown.value.trim().length)

function useTemplate(prompt: string) {
  input.value = prompt
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || isGenerating.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: text })
  isGenerating.value = true
  scrollToBottom()
  try {
    const history: SkillTurn[] = messages.value
      .slice(0, -1)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))
    // 把当前 markdown 作为上下文，便于模型基于已有内容继续修改。
    if (markdown.value.trim()) {
      history.push({ role: 'assistant', content: markdown.value })
    }
    const result = await generateSkill({
      prompt: text,
      modelPreference: skillStore.modelPreference,
      history,
    })
    markdown.value = result.content
    messages.value.push({
      role: 'assistant',
      content: `已按 ${ARTSKILLS_DISPLAY_NAME} 生成 Skill，可在右侧编辑、应用或下载。`,
    })
    rightTab.value = 'editor'
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      content: `生成失败：${e instanceof Error ? e.message : '未知错误，请重试。'}`,
    })
  } finally {
    isGenerating.value = false
    scrollToBottom()
  }
}

function downloadSkill() {
  if (!markdown.value.trim()) return
  const blob = new Blob([markdown.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = skillName.value.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') || 'skill'
  a.href = url
  a.download = `${safeName}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function applyAsActiveSkill() {
  if (!markdown.value.trim()) return
  // 追加而不是覆盖：已上传的 Skill 与新生成的 Skill 可以同时参与生成（上限 3 个）。
  const added = skillStore.addActiveSkillFromContent(markdown.value, `${skillName.value}.md`)
  if (!added) {
    const full = skillStore.activeSkills.length >= MAX_ACTIVE_SKILLS
    showErrorMessage(
      full
        ? `最多同时使用 ${MAX_ACTIVE_SKILLS} 个 Skill，请先在生成页移除一个。`
        : '相同名称的 Skill 已经在使用中，请改个名字再应用。',
    )
    return
  }
  applied.value = true
  setTimeout(() => (applied.value = false), 2000)
}

// —— 效果测试 ——
const testType = ref<'image' | 'video'>('image')
const testPrompt = ref('')
const imageModelId = imageModelModules[0]?.id || ''
const videoModelId = videoModelModules[0]?.id || ''

const testResults = computed(() =>
  chatStore.messages.filter((m) => m.type === 'assistant' && m.generateResult),
)

async function runTest() {
  const text = testPrompt.value.trim()
  if (!text || chatStore.isGenerating) return
  if (testType.value === 'image') {
    await generate(text, 'text2image', imageModelId, undefined, '1:1', 6, false, markdown.value || null)
  } else {
    await generate(text, 'text2video', videoModelId, undefined, '16:9', 6, false, markdown.value || null)
  }
}
</script>

<template>
  <div class="studio-page skill-create" :style="{ '--studio-accent': accent }">
    <AppTopNav />

    <StudioHeader
      kicker="Skill Studio"
      title="创作 Skill"
      subtitle="一句话生成标准化 Skill 文档，可编辑、可应用到生成、可下载复用"
      :accent="'var(--sf-ink)'"
    >
      <template #actions>
        <span class="studio-chip model-chip">
          <span class="model-dot" aria-hidden="true" />
          {{ ARTSKILLS_DISPLAY_NAME }}
        </span>
      </template>
    </StudioHeader>

    <main class="skill-main">
      <!-- 灵感模板 -->
      <section class="template-strip" aria-label="模版例子">
        <span class="template-strip-label">灵感模板</span>
        <div class="template-strip-list studio-scroll">
          <button
            v-for="tpl in templates"
            :key="tpl.title"
            class="template-chip"
            type="button"
            @click="useTemplate(tpl.prompt)"
          >
            {{ tpl.title }}
          </button>
        </div>
      </section>

      <div class="workbench">
        <!-- 左：需求对话 -->
        <section class="studio-panel chat-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Conversation</span>
              <h2 class="studio-panel-title">需求对话</h2>
            </div>
            <span class="studio-panel-meta">{{ messages.length }} 条</span>
          </header>

          <div ref="messagesRef" class="messages studio-scroll">
            <div v-if="!messages.length" class="chat-empty">
              <span class="chat-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3.4 13.8 8.6 19 10.4 13.8 12.2 12 17.4 10.2 12.2 5 10.4 10.2 8.6z" />
                  <path d="M18.4 15.6v3.2M16.8 17.2h3.2" />
                </svg>
              </span>
              <h3>描述你想要的创作规范</h3>
              <p>说明题材、风格、镜头和输出要求，模型会整理成结构化 Skill 文档。</p>
              <div class="chat-empty-actions">
                <button
                  v-for="tpl in quickTemplates"
                  :key="tpl.title"
                  type="button"
                  class="quick-card"
                  @click="useTemplate(tpl.prompt)"
                >
                  <span class="quick-card-title">{{ tpl.title }}</span>
                  <span class="quick-card-desc">{{ tpl.prompt }}</span>
                </button>
              </div>
            </div>

            <div v-for="(msg, i) in messages" :key="i" class="msg" :class="msg.role">
              <span class="msg-role">{{ msg.role === 'user' ? '你' : ARTSKILLS_DISPLAY_NAME }}</span>
              <p class="msg-content">{{ msg.content }}</p>
            </div>

            <div v-if="isGenerating" class="msg assistant">
              <span class="msg-role">{{ ARTSKILLS_DISPLAY_NAME }}</span>
              <p class="msg-content typing">
                <span class="typing-dot" />
                <span class="typing-dot" />
                <span class="typing-dot" />
              </p>
            </div>
          </div>

          <div class="composer">
            <textarea
              v-model="input"
              class="studio-field composer-input"
              rows="3"
              placeholder="描述你的需求，例如：帮我创作一个影视风格的 skill…"
              @keydown.enter.exact.prevent="send"
            />
            <div class="composer-foot">
              <span class="composer-hint">Enter 发送 · Shift + Enter 换行</span>
              <button
                class="studio-btn studio-btn--primary composer-send"
                type="button"
                :disabled="isGenerating || !input.trim()"
                @click="send"
              >
                <span>{{ isGenerating ? '生成中…' : '发送' }}</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <!-- 右：文档与测试 -->
        <section class="studio-panel doc-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Skill Document</span>
              <h2 class="studio-panel-title">{{ skillName }}</h2>
            </div>
            <div class="doc-tabs" role="tablist" aria-label="文档视图">
              <button
                type="button"
                class="doc-tab"
                :class="{ active: rightTab === 'editor' }"
                role="tab"
                :aria-selected="rightTab === 'editor'"
                @click="rightTab = 'editor'"
              >
                Skill 内容
              </button>
              <button
                type="button"
                class="doc-tab"
                :class="{ active: rightTab === 'test' }"
                role="tab"
                :aria-selected="rightTab === 'test'"
                @click="rightTab = 'test'"
              >
                效果测试
              </button>
            </div>
          </header>

          <div class="doc-toolbar">
            <span class="doc-meta">
              <span class="doc-meta-dot" :class="{ ready: !!charCount }" aria-hidden="true" />
              {{ charCount ? `${charCount} 字符 · Markdown` : '还没有内容' }}
            </span>
            <div class="doc-actions">
              <button class="studio-btn" type="button" :disabled="!markdown.trim()" @click="applyAsActiveSkill">
                {{ applied ? '已加入 ✓' : '加入生成 Skill' }}
              </button>
              <button class="studio-btn" type="button" :disabled="!markdown.trim()" @click="downloadSkill">
                下载 .md
              </button>
            </div>
          </div>

          <div v-show="rightTab === 'editor'" class="doc-body">
            <textarea
              v-model="markdown"
              class="studio-field doc-editor studio-scroll"
              placeholder="生成的 Skill 内容会显示在这里，支持直接修改。"
              spellcheck="false"
            />
          </div>

          <div v-show="rightTab === 'test'" class="test-body">
            <div class="test-controls">
              <div class="test-type" role="tablist" aria-label="测试类型">
                <button
                  type="button"
                  class="test-type-btn"
                  :class="{ active: testType === 'image' }"
                  @click="testType = 'image'"
                >
                  图片测试
                </button>
                <button
                  type="button"
                  class="test-type-btn"
                  :class="{ active: testType === 'video' }"
                  @click="testType = 'video'"
                >
                  视频测试
                </button>
              </div>
              <div class="test-input-row">
                <input
                  v-model="testPrompt"
                  class="studio-field test-input"
                  placeholder="输入测试提示词，会携带当前 Skill 规范一起生成"
                  @keydown.enter.prevent="runTest"
                />
                <button
                  class="studio-btn studio-btn--primary"
                  type="button"
                  :disabled="chatStore.isGenerating || !testPrompt.trim()"
                  @click="runTest"
                >
                  {{ chatStore.isGenerating ? '生成中…' : '开始测试' }}
                </button>
              </div>
            </div>

            <div class="test-results studio-scroll">
              <p v-if="!testResults.length" class="test-empty">
                测试结果会显示在这里。生成一次即可验证当前 Skill 的效果。
              </p>
              <template v-for="msg in testResults" :key="msg.id">
                <img
                  v-if="msg.generateResult?.type === 'image'"
                  :src="msg.generateResult.url"
                  class="test-media"
                  loading="lazy"
                  decoding="async"
                  alt="测试结果"
                />
                <video
                  v-else-if="msg.generateResult?.type === 'video'"
                  :src="msg.generateResult.url"
                  class="test-media"
                  controls
                  preload="metadata"
                />
                <div v-if="msg.generateResult" class="test-media-actions">
                  <AddToProjectButton
                    :asset="{
                      name: msg.generateResult.type === 'video' ? 'Skill 测试视频' : 'Skill 测试图片',
                      kind: msg.generateResult.type,
                      url: msg.generateResult.url,
                      thumbnail: msg.generateResult.thumbnail,
                      duration: msg.generateResult.duration,
                      source: 'library',
                    }"
                    compact
                  />
                </div>
              </template>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.skill-create {
  height: 100dvh;
  overflow: hidden;
}

.skill-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 0 28px 22px;
}

/* ---------- 灵感模板 ---------- */

.template-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
  padding: 2px 2px 0;
}

.template-strip-label {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--studio-text-hint);
}

.template-strip-list {
  display: flex;
  flex: 1;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  padding: 4px 2px 6px;
}

.template-chip {
  flex: 0 0 auto;
  padding: 7px 14px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base),
    transform var(--transition-base);
}

.template-chip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--studio-accent) 45%, transparent);
  background: color-mix(in srgb, var(--studio-accent) 14%, transparent);
  color: var(--sf-ink);
}

/* ---------- 工作台 ---------- */

.workbench {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(330px, 0.82fr) minmax(0, 1.18fr);
  gap: 16px;
  min-height: 0;
}

/* ---------- 对话面板 ---------- */

.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chat-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 0 8px;
  text-align: center;
}

.chat-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--studio-accent) 30%, transparent);
  background: color-mix(in srgb, var(--studio-accent) 14%, transparent);
  color: var(--studio-accent);
}

.chat-empty-icon svg {
  width: 22px;
  height: 22px;
}

.chat-empty h3 {
  font-size: 15px;
  font-weight: 700;
  color: rgba(36, 31, 25, 0.92);
}

.chat-empty p {
  max-width: 300px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--studio-text-hint);
}

.chat-empty-actions {
  display: grid;
  width: 100%;
  gap: 8px;
  margin-top: 6px;
}

.quick-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 12px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.035);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition:
    background var(--transition-base),
    border-color var(--transition-base);
}

.quick-card:hover {
  border-color: color-mix(in srgb, var(--studio-accent) 38%, transparent);
  background: color-mix(in srgb, var(--studio-accent) 10%, transparent);
}

.quick-card-title {
  font-size: 12.5px;
  font-weight: 650;
  color: rgba(36, 31, 25, 0.88);
}

.quick-card-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--studio-text-hint);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
}

.msg-role {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--studio-text-hint);
}

.msg-content {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg.user {
  align-items: flex-end;
}

.msg.user .msg-content {
  background: linear-gradient(135deg, rgba(36, 31, 25, 0.14), rgba(36, 31, 25, 0.08));
  border: 1px solid rgba(36, 31, 25, 0.12);
  color: rgba(36, 31, 25, 0.94);
}

.msg.assistant .msg-content {
  border: 1px solid rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.04);
  color: var(--studio-text-soft);
}

.typing {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--studio-accent);
  animation: typing 1.1s infinite ease-in-out;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.composer {
  flex: 0 0 auto;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(36, 31, 25, 0.07);
}

.composer-input {
  padding: 11px 13px;
  font-size: 13px;
  line-height: 1.6;
  max-height: 132px;
}

.composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.composer-hint {
  font-size: 11px;
  color: var(--studio-text-hint);
}

.composer-send {
  min-height: 36px;
  padding: 0 16px;
}

.composer-send svg {
  width: 15px;
  height: 15px;
}

/* ---------- 文档面板 ---------- */

.doc-panel {
  overflow: hidden;
}

.doc-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
}

.doc-tab {
  padding: 6px 13px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--transition-base),
    color var(--transition-base);
}

.doc-tab:hover {
  color: rgba(36, 31, 25, 0.82);
}

.doc-tab.active {
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.doc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.06);
}

.doc-meta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--studio-text-hint);
  white-space: nowrap;
}

.doc-meta-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(36, 31, 25, 0.22);
}

.doc-meta-dot.ready {
  background: var(--sf-success);
  box-shadow: 0 0 6px rgba(31, 122, 86, 0.4);
}

.doc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.doc-body {
  display: flex;
  flex: 1;
  min-height: 0;
  padding: 14px;
}

.doc-editor {
  flex: 1;
  min-height: 0;
  padding: 16px 18px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.75;
}

/* ---------- 效果测试 ---------- */

.test-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.test-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.06);
}

.test-type {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
}

.test-type-btn {
  padding: 5px 13px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--transition-base),
    color var(--transition-base);
}

.test-type-btn.active {
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.test-input-row {
  display: flex;
  gap: 8px;
}

.test-input {
  flex: 1;
  min-width: 0;
  padding: 9px 13px;
  font-size: 12.5px;
}

.test-results {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  min-height: 0;
  padding: 16px 18px;
  overflow-y: auto;
  align-content: start;
}

.test-empty {
  grid-column: 1 / -1;
  padding: 28px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--studio-text-hint);
}

.test-media {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  background: rgba(0, 0, 0, 0.24);
  object-fit: cover;
}

.test-media-actions {
  display: flex;
  justify-content: flex-end;
  margin: -34px 10px 10px 0;
  position: relative;
  z-index: 1;
}

.test-media-actions :deep(.add-to-project) {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(36, 31, 25, 0.12);
  backdrop-filter: blur(8px);
}

/* ---------- 响应式 ---------- */

@media (max-width: 1180px) {
  .workbench {
    grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
  }
}

@media (max-width: 980px) {
  .skill-create {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  .skill-main {
    padding: 0 16px 20px;
  }

  .workbench {
    grid-template-columns: 1fr;
    grid-auto-rows: minmax(0, auto);
  }

  .chat-panel {
    min-height: 460px;
  }

  .doc-panel {
    min-height: 520px;
  }
}
</style>
