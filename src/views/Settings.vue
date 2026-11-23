<template>
  <div class="settings-page">
    <header class="topbar">
      <div class="topbar-inner">
        <button class="ghost-btn" @click="router.back()">返回工作台</button>
        <div class="title-block">
          <span class="kicker">系统</span>
          <h1>工作台设置</h1>
        </div>
      </div>
    </header>

    <main class="content">
      <section class="hero-card">
        <div>
          <span class="kicker">控制中心</span>
          <h2>把生成环境调顺，一次配置，长期可用。</h2>
        </div>
        <p>API 访问、提示词增强、翻译模型与默认 Skill 都集中在这里。改动会自动保存在当前浏览器。</p>
      </section>

      <section class="card">
        <div class="section-head">
          <span class="kicker">连接</span>
          <h3>API 配置</h3>
        </div>
        <div class="info-list">
          <div class="row row-service-url">
            <div class="service-url-block">
              <span class="label">服务地址</span>
              <input
                v-model="settingsApiBaseUrl"
                class="text-input service-url-input"
                placeholder="https://api.openai.com/v1"
                readonly
              />
              <p class="field-hint">如需修改 Base URL 或 API Key，请先点击“编辑配置”。</p>
              <a
                class="helper-link"
                href="https://aiping.cn/user/apikey"
                target="_blank"
                rel="noopener"
              >
                快速获取AI Ping-APIKEY
              </a>
            </div>
          </div>
          <div class="row">
            <span class="label">API 密钥</span>
            <span class="value">{{ maskedKeyText }}</span>
          </div>
          <div class="row">
            <span class="label">状态</span>
            <span :class="['status', apiStore.isConnected ? 'connected' : 'unknown']">
              {{ apiStore.isConnected ? '已连接' : '未验证' }}
            </span>
          </div>
        </div>
        <div class="btn-row">
          <button class="ghost-btn" @click="openEditConfig">编辑配置</button>
          <button class="primary-btn" :disabled="testing" @click="handleTest">
            {{ testing ? '正在测试...' : '测试连接' }}
          </button>
        </div>
        <div v-if="testStatus" :class="['status-msg', testStatusType]">{{ testStatus }}</div>
      </section>

      <section class="card polish-card">
        <div class="section-head">
          <span class="kicker">提示词优化</span>
          <h3>提示词增强</h3>
        </div>

        <div class="setting-toggle-row">
          <div class="setting-toggle-text">
            <strong>默认开启 AI 润色</strong>
            <p class="field-hint">开启后，图片页与视频页的「AI 润色」按钮可直接使用，无需再填写模型 ID。已选 Skill 时，润色会按 Skill 规范改写提示词并补齐必要画面元素。</p>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: settingsStore.promptPolishEnabled }"
            type="button"
            role="switch"
            :aria-checked="settingsStore.promptPolishEnabled"
            aria-label="提示词增强开关"
            @click="togglePromptPolish"
          >
            <span class="toggle-knob" aria-hidden="true" />
          </button>
        </div>

        <div class="info-list">
          <div class="row">
            <span class="label">优化模型</span>
            <span class="value">{{ settingsStore.promptPolishModel || defaultPolishModel }}</span>
          </div>
          <div class="row">
            <span class="label">调用状态</span>
            <span :class="['status', settingsStore.promptPolishEnabled ? 'connected' : 'unknown']">
              {{ settingsStore.promptPolishEnabled ? '已开启' : '已关闭' }}
            </span>
          </div>
        </div>
        <p class="field-hint">默认使用 {{ defaultPolishModel }}，可直接在前端点击优化，无需任何额外配置。</p>

        <details class="advanced-block">
          <summary>高级：自定义优化模型与系统提示词</summary>
          <div class="input-group">
            <label for="polish-model">优化模型 ID</label>
            <input
              id="polish-model"
              v-model.trim="settingsStore.promptPolishModel"
              class="text-input"
              :placeholder="defaultPolishModel"
              @blur="settingsStore.saveToStorage()"
            />
            <a href="https://www.aiping.cn/modelList" target="_blank" rel="noopener" class="helper-link">
              查看官方模型列表
            </a>
          </div>
          <div class="input-group">
            <label for="polish-system-prompt">系统提示词</label>
            <textarea
              id="polish-system-prompt"
              v-model.trim="settingsStore.promptPolishSystemPrompt"
              class="text-area"
              :placeholder="defaultPolishSystemPrompt"
              @blur="settingsStore.saveToStorage()"
            />
            <p class="field-hint">留空时将使用默认优化提示词。</p>
          </div>
        </details>

        <div class="btn-row">
          <button class="ghost-btn" @click="resetPolishPrompt">恢复默认</button>
          <button class="primary-btn" @click="savePolishSettings">保存提示词设置</button>
        </div>
        <div v-if="polishStatus" class="status-msg success">{{ polishStatus }}</div>
      </section>

      <section class="card">
        <div class="section-head">
          <span class="kicker">文案工具</span>
          <h3>翻译设置</h3>
        </div>
        <div class="input-group">
          <label for="translation-model">翻译模型 ID</label>
          <input
            id="translation-model"
            v-model.trim="settingsStore.translationModel"
            class="text-input"
            :placeholder="defaultTranslationModel"
            @blur="handleTranslationModelBlur"
          />
          <p class="field-hint">
            配音页点击「翻译」时使用此模型；留空会回落到 {{ defaultTranslationModel }}。
          </p>
          <a href="https://www.aiping.cn/modelList" target="_blank" rel="noopener" class="helper-link">
            查看官方模型列表
          </a>
        </div>
        <div class="btn-row">
          <button class="ghost-btn" @click="resetTranslationModel">恢复默认</button>
          <button class="primary-btn" @click="saveTranslationSettings">保存翻译设置</button>
        </div>
        <div v-if="translationStatus" class="status-msg success">{{ translationStatus }}</div>
      </section>

      <section class="card skill-settings-card">
        <div class="section-head">
          <span class="kicker">默认 Skill</span>
          <h3>内置图片设计规范</h3>
        </div>
        <p class="field-hint">
          这三个内置 Skill 默认参与每次图片生成，与生图页多选的风格 Skill 合并后一起下发。
        </p>
        <div class="skill-toggle-list">
          <div v-for="skill in defaultQualitySkills" :key="skill.id" class="skill-toggle-row">
            <div class="skill-toggle-text">
              <strong>{{ skill.name }}</strong>
              <small>{{ skill.description }}</small>
              <a
                v-if="skill.source"
                class="skill-source-link"
                :href="skill.source"
                target="_blank"
                rel="noopener"
              >
                原始 Skill 仓库 ↗
              </a>
            </div>
            <button
              class="toggle-switch"
              :class="{ on: skillStore.isDefaultQualitySkillEnabled(skill.id) }"
              type="button"
              role="switch"
              :aria-checked="skillStore.isDefaultQualitySkillEnabled(skill.id)"
              :aria-label="`${skillStore.isDefaultQualitySkillEnabled(skill.id) ? '关闭' : '开启'} ${skill.name}`"
              @click="skillStore.setDefaultQualitySkillEnabled(skill.id, !skillStore.isDefaultQualitySkillEnabled(skill.id))"
            >
              <span class="toggle-knob" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="btn-row">
          <button class="ghost-btn" type="button" @click="skillStore.enableAllDefaultQualitySkills()">
            全部开启
          </button>
        </div>
      </section>

      <section class="card about-card">
        <div class="section-head">
          <span class="kicker">关于</span>
          <h3>项目信息</h3>
        </div>
        <div class="info-list">
          <div class="row">
            <span class="label">版本</span>
            <span class="value">v1.2.0</span>
          </div>
          <div class="row">
            <span class="label">文档</span>
            <a href="https://aiping.cn/docs" target="_blank" rel="noopener" class="link">aiping.cn/docs</a>
          </div>
        </div>
      </section>

      <section class="card danger-card">
        <div class="section-head">
          <span class="kicker">重置</span>
          <h3>退出登录并清除本地会话</h3>
        </div>
        <p class="danger-copy">这会从当前浏览器中移除 API 配置以及本地会话记录。</p>
        <button class="danger-btn" @click="handleClear">清除并退出登录</button>
      </section>
    </main>

    <div v-if="showEditConfig" class="modal-overlay" @click.self="showEditConfig = false">
      <div class="modal">
        <span class="kicker">编辑配置</span>
        <h3>更新 API 访问信息</h3>
        <div class="input-group">
          <label for="edit-base-url">服务地址</label>
          <input
            id="edit-base-url"
            v-model="newApiBaseUrl"
            class="text-input"
            placeholder="https://api.openai.com/v1"
          />
          <p class="field-hint">服务地址可自由填写，仅支持 OpenAI baseURL 格式，例如：https://api.openai.com/v1。</p>
        </div>
        <ApiKeyInput v-model="newApiKey" />
        <a
          class="helper-link"
          href="https://aiping.cn/user/apikey"
          target="_blank"
          rel="noopener"
        >
          快速获取AI Ping-APIKEY
        </a>
        <div v-if="editStatus" :class="['status-msg', editStatusType]">{{ editStatus }}</div>
        <div class="btn-row">
          <button class="ghost-btn" @click="showEditConfig = false">取消</button>
          <button class="primary-btn" :disabled="!newApiBaseUrl || !newApiKey || saving" @click="handleSaveConfig">
            {{ saving ? '正在保存...' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import ApiKeyInput from '@/components/ApiKeyInput.vue'
import { useApiStore } from '@/stores/apiStore'
import { useChatStore } from '@/stores/chatStore'
import {
  DEFAULT_PROMPT_POLISH_MODEL,
  DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT,
  DEFAULT_TRANSLATION_MODEL,
  useSettingsStore,
} from '@/stores/settingsStore'
import { useSkillStore } from '@/stores/skillStore'
import { DEFAULT_QUALITY_SKILLS } from '@/features/skill/builtin'
import { maskApiKey } from '@/utils/format'
import { testConnectionWithDetail } from '@/api/aiping'
import { AIPING_PUBLIC_API_BASE_URL, isOpenAiBaseUrlFormat } from '@/api/config'

const router = useRouter()
const apiStore = useApiStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const skillStore = useSkillStore()
const defaultQualitySkills = DEFAULT_QUALITY_SKILLS

const showEditConfig = ref(false)
const newApiKey = ref('')
const newApiBaseUrl = ref('')
const settingsApiBaseUrl = ref(apiStore.apiBaseUrl || AIPING_PUBLIC_API_BASE_URL)
const saving = ref(false)
const editStatus = ref('')
const editStatusType = ref<'success' | 'error'>('success')

const testing = ref(false)
const testStatus = ref('')
const testStatusType = ref<'success' | 'error'>('success')
const polishStatus = ref('')
const defaultPolishSystemPrompt = DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT
const defaultPolishModel = DEFAULT_PROMPT_POLISH_MODEL
const translationStatus = ref('')
const defaultTranslationModel = DEFAULT_TRANSLATION_MODEL

const maskedKeyText = computed(() => (apiStore.apiKey ? maskApiKey(apiStore.apiKey) : '未设置'))

onMounted(() => {
  settingsStore.loadFromStorage()
  skillStore.loadFromStorage()
})

function openEditConfig() {
  newApiBaseUrl.value = apiStore.apiBaseUrl || AIPING_PUBLIC_API_BASE_URL
  newApiKey.value = apiStore.apiKey || ''
  editStatus.value = ''
  showEditConfig.value = true
}

async function handleTest() {
  testing.value = true
  testStatus.value = ''
  const result = await testConnectionWithDetail()
  testing.value = false
  if (result.ok) {
    testStatus.value = 'API 连接成功。'
    testStatusType.value = 'success'
    apiStore.isConnected = true
  } else {
    testStatus.value = result.message || '连接失败，请检查 Base URL 和 API Key。'
    testStatusType.value = 'error'
    apiStore.isConnected = false
  }
}

async function handleSaveConfig() {
  if (!newApiBaseUrl.value.trim() || !newApiKey.value.trim()) return
  if (!isOpenAiBaseUrlFormat(newApiBaseUrl.value)) {
    editStatus.value = '服务地址格式不正确，请填写 OpenAI baseURL 格式，例如：https://api.openai.com/v1。'
    editStatusType.value = 'error'
    return
  }

  saving.value = true
  editStatus.value = ''
  const ok = await apiStore.testAndSave(newApiKey.value.trim(), newApiBaseUrl.value.trim())
  saving.value = false
  if (ok) {
    settingsApiBaseUrl.value = apiStore.apiBaseUrl
    editStatus.value = '保存成功，连接验证通过。'
    editStatusType.value = 'success'
    setTimeout(() => {
      showEditConfig.value = false
      editStatus.value = ''
    }, 900)
  } else {
    editStatus.value = apiStore.connectionError || '连接验证失败，请检查 Base URL 和 API Key。'
    editStatusType.value = 'error'
  }
}

function handleClear() {
  if (confirm('确定要清除配置并退出吗？')) {
    apiStore.clear()
    chatStore.clearMessages()
    router.replace('/setup')
  }
}

function savePolishSettings() {
  settingsStore.saveToStorage()
  polishStatus.value = '提示词设置已保存。'
  setTimeout(() => {
    polishStatus.value = ''
  }, 1200)
}

function resetPolishPrompt() {
  settingsStore.promptPolishSystemPrompt = ''
  settingsStore.promptPolishModel = DEFAULT_PROMPT_POLISH_MODEL
  savePolishSettings()
}

function togglePromptPolish() {
  settingsStore.promptPolishEnabled = !settingsStore.promptPolishEnabled
  if (settingsStore.promptPolishEnabled && !settingsStore.promptPolishModel.trim()) {
    settingsStore.promptPolishModel = DEFAULT_PROMPT_POLISH_MODEL
  }
  settingsStore.saveToStorage()
}

function handleTranslationModelBlur() {
  if (!settingsStore.translationModel.trim()) {
    settingsStore.translationModel = DEFAULT_TRANSLATION_MODEL
  }
  settingsStore.saveToStorage()
}

function flashTranslationStatus(message: string) {
  translationStatus.value = message
  window.setTimeout(() => {
    translationStatus.value = ''
  }, 1200)
}

function saveTranslationSettings() {
  if (!settingsStore.translationModel.trim()) {
    settingsStore.translationModel = DEFAULT_TRANSLATION_MODEL
  }
  settingsStore.saveToStorage()
  flashTranslationStatus('翻译设置已保存。')
}

function resetTranslationModel() {
  settingsStore.translationModel = DEFAULT_TRANSLATION_MODEL
  settingsStore.saveToStorage()
  flashTranslationStatus('已恢复默认翻译模型。')
}
</script>

<style scoped>
.settings-page {
  min-height: 100dvh;
  padding: 20px;
  color: rgba(29, 29, 27, 0.92);
  background: #ffffff;
}

.settings-page::before {
  display: none;
}

.topbar-inner,
.content,
.modal {
  width: min(100%, var(--page-max-width, 1480px));
  margin: 0 auto;
}

.topbar {
  padding-bottom: 18px;
}

.topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 24px;
  border: 1px solid var(--color-border);
  border-radius: 28px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.04);
}

.title-block {
  flex: 1;
}

.kicker {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-hint);
}

h1,
h2,
h3 {
  color: var(--color-text);
  letter-spacing: -0.04em;
}

h1 {
  font-size: 28px;
}

.content {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding-bottom: 24px;
}

.hero-card,
.card {
  border: 1px solid var(--color-border);
  border-radius: 28px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.04);
}

.hero-card {
  grid-column: 1 / -1;
  padding: 34px 32px;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 18px;
  align-items: end;
  background: #fafaf8;
}

.hero-card h2 {
  max-width: 12ch;
  margin-top: 10px;
  font-size: clamp(34px, 4.4vw, 56px);
  line-height: 0.98;
}

.hero-card p,
.danger-copy {
  color: var(--color-text-secondary);
  line-height: 1.8;
}

.card {
  padding: 28px;
}

.section-head {
  margin-bottom: 18px;
}

.section-head h3 {
  margin-top: 8px;
  font-size: 24px;
}

.info-list {
  overflow: hidden;
  border: 1px solid #e8e8e2;
  border-radius: 22px;
  background: #ffffff;
}

.row,
.btn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.row {
  padding: 16px 18px;
}

.row + .row {
  border-top: 1px solid #ecece7;
}

.row-service-url {
  align-items: stretch;
}

.service-url-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.label,
.field-hint,
.helper-link {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.value,
.link {
  color: var(--color-text);
}

.service-url-value {
  display: block;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(17, 17, 16, 0.10);
  border-radius: 16px;
  background: #fafaf8;
  color: #4a4a44;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 700;
}

.status.connected {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status.unknown {
  background: #f5f5f1;
  color: var(--color-text-secondary);
}

.ghost-btn,
.primary-btn,
.danger-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 700;
  transition:
    transform var(--transition-base),
    background var(--transition-base),
    border-color var(--transition-base),
    opacity var(--transition-base);
}

.ghost-btn {
  border: 1px solid var(--color-border);
  background: rgba(17, 17, 16, 0.08);
  color: var(--color-text);
}

.primary-btn {
  border: 1px solid var(--color-action-border);
  background: var(--color-action-bg);
  color: var(--color-action-text);
  box-shadow: 0 8px 18px rgba(17, 17, 16, 0.16);
}

.danger-btn {
  margin-top: 18px;
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
}

.ghost-btn:hover,
.primary-btn:hover,
.danger-btn:hover {
  transform: translateY(-1px);
}

.primary-btn:hover {
  background: var(--color-action-bg-hover);
}

.danger-btn:hover {
  background: #f3c9c6;
}

.btn-row {
  margin-top: 18px;
  flex-wrap: wrap;
}

.status-msg {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 18px;
  font-size: 14px;
}

.status-msg.success {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.status-msg.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.input-group {
  margin-bottom: 18px;
}

label {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.text-input,
.text-area {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: #ffffff;
  color: var(--color-text);
  transition:
    border-color var(--transition-base),
    box-shadow var(--transition-base),
    background var(--transition-base);
}

.text-input {
  min-width: 0;
  padding: 14px 16px;
}

.text-area {
  min-height: 132px;
  padding: 16px 18px;
  line-height: 1.72;
  resize: vertical;
  outline: none;
}

.text-input:read-only {
  color: var(--color-text-secondary);
}

.text-input:focus,
.text-area:focus {
  outline: none;
  border-color: rgba(29, 29, 27, 0.24);
  box-shadow: 0 0 0 4px rgba(17, 17, 16, 0.06);
  background: #ffffff;
}

.helper-link {
  display: inline-block;
  margin-top: 10px;
  color: var(--color-accent);
}

.about-card,
.danger-card {
  grid-column: span 1;
}

/* ---------- 内置默认 Skill ---------- */

.skill-settings-card {
  grid-column: 1 / -1;
}

.skill-toggle-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.skill-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid rgba(17, 17, 16, 0.1);
  border-radius: 18px;
  background: rgba(17, 17, 16, 0.04);
}

.skill-toggle-text {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.skill-toggle-text strong {
  color: rgba(29, 29, 27, 0.94);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.skill-toggle-text small {
  color: rgba(29, 29, 27, 0.5);
  font-size: 12px;
  line-height: 1.55;
}

.skill-source-link {
  justify-self: start;
  color: #66665f;
  font-size: 10.5px;
  text-decoration: none;
}

.skill-source-link:hover {
  color: #111110;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.toggle-switch {
  position: relative;
  flex: 0 0 auto;
  width: 46px;
  height: 27px;
  padding: 0;
  border: 1px solid rgba(17, 17, 16, 0.16);
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.14);
  cursor: pointer;
  transition: background 0.25s ease, border-color 0.25s ease;
}

.toggle-switch.on {
  border-color: transparent;
  background: #111111;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 1px 3px rgba(17, 17, 16, 0.18);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toggle-switch.on .toggle-knob {
  transform: translateX(19px);
  background: #fff;
}

@media (max-width: 1023px) {
  .skill-settings-card {
    grid-column: 1 / -1;
  }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(17, 17, 16, 0.28);
  backdrop-filter: blur(6px);
}

.modal {
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: 28px;
  background: #ffffff;
  box-shadow: 0 24px 80px rgba(17, 17, 16, 0.16);
}

.modal h3 {
  margin-top: 8px;
  margin-bottom: 18px;
  font-size: 30px;
}

@media (max-width: 1023px) {
  .content {
    grid-template-columns: 1fr;
  }

  .hero-card,
  .about-card,
  .danger-card {
    grid-column: 1 / -1;
  }

  .hero-card {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .settings-page {
    padding: 12px;
  }

  .topbar-inner,
  .hero-card,
  .card,
  .modal {
    padding: 20px 16px;
    border-radius: 22px;
  }

  .topbar-inner,
  .row,
  .btn-row {
    flex-direction: column;
    align-items: stretch;
  }

  .topbar {
    padding-bottom: 12px;
  }

  .topbar-inner {
    gap: 12px;
  }

  .hero-card h2 {
    max-width: 100%;
    font-size: clamp(30px, 9vw, 42px);
  }

  h1 {
    font-size: 24px;
  }

  .ghost-btn,
  .primary-btn,
  .danger-btn {
    width: 100%;
  }

  .topbar-inner .ghost-btn {
    width: auto;
    align-self: flex-start;
    min-height: 38px;
    padding: 0 16px;
  }

  .modal-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .modal {
    width: 100%;
    max-height: min(88dvh, 720px);
    overflow-y: auto;
  }
}

/* ---------- 紧凑布局与提示词增强开关 ---------- */

.hero-card {
  padding: 24px 26px;
  align-items: center;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
}

.hero-card h2 {
  max-width: 30ch;
  margin-top: 8px;
  font-size: clamp(22px, 2.4vw, 30px);
  line-height: 1.24;
  letter-spacing: -0.02em;
}

.hero-card p {
  font-size: 13.5px;
}

.card {
  padding: 24px;
}

.section-head {
  margin-bottom: 14px;
}

.section-head h3 {
  margin-top: 6px;
  font-size: 20px;
}

.setting-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 12px;
  border: 1px solid rgba(17, 17, 16, 0.10);
  border-radius: 18px;
  background: rgba(17, 17, 16, 0.05);
}

.setting-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-toggle-text strong {
  color: var(--color-text);
  font-size: 13.5px;
}

.setting-toggle-text .field-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.polish-card .info-list {
  margin-bottom: 10px;
}

.advanced-block {
  margin-top: 12px;
  border: 1px dashed rgba(17, 17, 16, 0.14);
  border-radius: 18px;
  background: rgba(17, 17, 16, 0.025);
}

.advanced-block > summary {
  padding: 12px 16px;
  color: var(--color-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.advanced-block > summary::-webkit-details-marker {
  display: none;
}

.advanced-block[open] > summary {
  border-bottom: 1px dashed rgba(17, 17, 16, 0.12);
}

.advanced-block .input-group {
  padding: 14px 16px 0;
}

.advanced-block .input-group:last-child {
  padding-bottom: 14px;
}

@media (max-width: 900px) {
  .hero-card {
    grid-template-columns: 1fr;
    padding: 20px;
  }
}
</style>
