<template>
  <div class="settings-page">
    <div class="settings-shell">
      <header class="settings-header">
        <button class="back-btn" type="button" @click="router.back()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.5 6 8.5 12l6 6" />
          </svg>
          返回
        </button>

        <div class="header-title">
          <h1>设置</h1>
          <p>全部配置只保存在这台设备上，不会上传到任何服务器。</p>
        </div>

        <span :class="['status-pill', apiStore.isConnected ? 'ok' : 'idle']">
          <i aria-hidden="true" />
          {{ apiStore.isConnected ? '已连接' : '未验证' }}
        </span>
      </header>

      <div class="settings-body">
        <aside class="settings-nav" aria-label="设置分区">
          <div v-for="group in navGroups" :key="group.label" class="nav-group">
            <span class="nav-group-label">{{ group.label }}</span>
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              :class="['nav-item', { active: activeSection === item.id }]"
              @click="scrollToSection(item.id)"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="nav-foot">
            <span>步帧</span>
            <span>v1.2.0</span>
          </div>
        </aside>

        <main class="settings-main">
          <!-- 账号与连接 -->
          <section id="account" class="panel">
            <div class="panel-head">
              <h2>账号与连接</h2>
              <p>步帧通过 AIPing 调用模型。密钥只存放在当前浏览器会话中。</p>
            </div>

            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">服务地址</span>
                <span class="detail-value mono">{{ settingsApiBaseUrl }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">API 密钥</span>
                <span class="detail-value mono">{{ maskedKeyText }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">连接状态</span>
                <span :class="['tag', apiStore.isConnected ? 'ok' : 'idle']">
                  {{ apiStore.isConnected ? '已连接' : '未验证' }}
                </span>
              </div>
            </div>

            <div class="panel-actions">
              <button class="btn ghost" type="button" @click="openEditConfig">编辑配置</button>
              <button class="btn solid" type="button" :disabled="testing" @click="handleTest">
                {{ testing ? '正在测试…' : '测试连接' }}
              </button>
              <a class="text-link" href="https://aiping.cn/user/apikey" target="_blank" rel="noopener">
                获取 AIPing 密钥 ↗
              </a>
            </div>

            <p v-if="testStatus" :class="['notice', testStatusType]">{{ testStatus }}</p>
          </section>

          <!-- 关于 -->
          <section id="about" class="panel">
            <div class="panel-head">
              <h2>关于与数据</h2>
              <p>版本信息，以及清除本机数据的入口。</p>
            </div>

            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">版本</span>
                <span class="detail-value">v1.2.0</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">仓库</span>
                <a class="detail-value text-link" :href="repoUrl" target="_blank" rel="noopener">
                  {{ repoUrlLabel }}
                </a>
              </div>
              <div class="detail-row">
                <span class="detail-label">文档</span>
                <a class="detail-value text-link" href="https://aiping.cn/docs" target="_blank" rel="noopener">
                  aiping.cn/docs
                </a>
              </div>
            </div>

            <div class="danger-block">
              <div>
                <strong>退出登录并清除本地会话</strong>
                <p>会移除当前浏览器中的 API 配置与对话记录，不影响已生成的文件。</p>
              </div>
              <button class="btn danger" type="button" @click="handleClear">清除并退出</button>
            </div>
          </section>

          <!-- 本机 Agent -->
          <section id="agents" class="panel">
            <div class="panel-head panel-head-row">
              <div>
                <h2>本机 Agent</h2>
                <p>
                  步帧启动后会自动扫描这台电脑上已安装的 CLI Agent。选中后，对话会交给它执行，
                  可以直接读写项目、生成图片和视频。
                </p>
              </div>
              <button
                class="btn ghost"
                type="button"
                :disabled="localAgentStore.isScanning"
                @click="scanAgents"
              >
                {{ localAgentStore.isScanning ? '扫描中…' : '重新扫描' }}
              </button>
            </div>

            <div class="engine-summary">
              <div class="engine-current">
                <span
                  class="engine-status-dot"
                  :class="{ local: localAgentStore.isLocalEngine }"
                  aria-hidden="true"
                />
                <div class="engine-current-copy">
                  <strong>当前：{{ localAgentStore.selectedLabel }}</strong>
                  <small>{{ localAgentStore.selectedHint || '内置模型，无需安装任何 CLI' }}</small>
                </div>
              </div>
              <span class="tag ok">已安装 {{ localAgentStore.installedCount }} 个</span>
            </div>

            <p v-if="localAgentStore.status === 'error'" class="notice error">
              {{ localAgentStore.error }}
            </p>
            <p v-else-if="localAgentStore.isScanning" class="notice">
              正在扫描 PATH 与常见安装目录…
            </p>

            <div v-if="localAgentStore.installedAgents.length" class="engine-list">
              <div
                v-for="agent in localAgentStore.installedAgents"
                :key="agent.id"
                class="engine-row"
                :class="{ selected: localAgentStore.selectedId === agent.id }"
              >
                <div class="engine-row-main">
                  <strong>
                    {{ agent.name }}
                    <span class="engine-vendor">{{ agent.vendor }}</span>
                    <span v-if="agent.source === 'app'" class="source-tag">桌面应用内置</span>
                  </strong>
                  <span class="engine-meta">{{ agent.version || '版本未知' }}</span>
                  <span v-if="agent.commandPath" class="engine-path mono">{{ agent.commandPath }}</span>
                </div>
                <button
                  class="btn tiny"
                  type="button"
                  :disabled="localAgentStore.selectedId === agent.id"
                  @click="selectEngine(agent.id)"
                >
                  {{ localAgentStore.selectedId === agent.id ? '使用中' : '使用这个' }}
                </button>
              </div>
            </div>
            <p v-else-if="!localAgentStore.isScanning" class="engine-empty-note">
              还没有检测到已安装的 Agent。可以从下方安装一个，或填写自定义命令。
            </p>

            <div class="engine-row builtin-row">
              <div class="engine-row-main">
                <strong>AIPing · DeepSeek <span class="engine-vendor">内置</span></strong>
                <span class="engine-meta">不依赖本机 CLI，开箱可用</span>
              </div>
              <button
                class="btn tiny"
                type="button"
                :disabled="!localAgentStore.isLocalEngine"
                @click="selectEngine('builtin')"
              >
                {{ localAgentStore.isLocalEngine ? '切回内置' : '使用中' }}
              </button>
            </div>

            <details v-if="localAgentStore.missingAgents.length" class="advanced-block">
              <summary>安装更多 Agent（{{ localAgentStore.missingAgents.length }}）</summary>
              <div class="install-list">
                <div v-for="agent in localAgentStore.missingAgents" :key="agent.id" class="install-row">
                  <div class="install-copy">
                    <strong>{{ agent.name }} <span class="engine-vendor">{{ agent.vendor }}</span></strong>
                    <code class="install-command">{{ agent.installCommand }}</code>
                    <p v-if="agent.installHint" class="field-hint">{{ agent.installHint }}</p>
                    <p v-if="agent.appPath" class="field-hint">
                      检测到桌面端 {{ agent.appPath.split('/').pop()?.replace('.app', '') }}，
                      但桌面端没有提供命令行入口，步帧暂时无法调用它。
                    </p>
                  </div>
                  <div class="install-actions">
                    <button class="btn tiny" type="button" @click="copyInstall(agent)">
                      {{ copiedInstallId === agent.id ? '已复制' : '复制命令' }}
                    </button>
                    <a
                      v-if="agent.installUrl"
                      class="text-link"
                      :href="agent.installUrl"
                      target="_blank"
                      rel="noopener"
                    >
                      官网 ↗
                    </a>
                  </div>
                </div>
              </div>
            </details>

            <details class="advanced-block custom-block">
              <summary>其他 Agent（自定义命令，高级）</summary>
              <p class="field-hint">
                如果上面的列表里没有你要的 Agent，而它又提供了命令行工具，可以在这里接入。
                填一条能在终端直接运行的命令即可，不需要写脚本。
              </p>

              <div class="custom-agent-grid">
                <div class="field">
                  <label for="custom-agent-name">显示名称</label>
                  <input
                    id="custom-agent-name"
                    v-model.trim="customName"
                    class="text-input"
                    placeholder="例如：我的 Agent"
                  />
                </div>
                <div class="field">
                  <label for="custom-agent-command">终端命令</label>
                  <input
                    id="custom-agent-command"
                    v-model.trim="customCommand"
                    class="text-input mono"
                    placeholder='例如：my-agent --task "{prompt}"'
                  />
                </div>
              </div>

              <p class="field-hint">
                命令里的 <code>{prompt}</code> 会替换成对话内容；不写时提示词会追加到末尾。
                命令在项目根目录执行，权限与你本机终端一致。
              </p>

              <div class="panel-actions">
                <button class="btn solid" type="button" :disabled="!customCommand.trim()" @click="saveCustomAgent">
                  保存并使用
                </button>
                <button v-if="localAgentStore.custom.command" class="btn ghost" type="button" @click="removeCustomAgent">
                  删除自定义命令
                </button>
              </div>

              <p v-if="customStatus" class="notice success">{{ customStatus }}</p>
            </details>

            <ul class="agent-notes">
              <li>Agent 会在项目目录中运行，权限与你本机终端一致，请只选择自己信任的 Agent。</li>
              <li>扫描由本地服务完成；用静态托管或远程访问打开页面时，本机 Agent 不可用。</li>
              <li>对话仍在步帧里进行，记录只保存在这台设备。</li>
            </ul>
          </section>

          <!-- 创作偏好 -->
          <section id="creation" class="panel">
            <div class="panel-head">
              <h2>创作偏好</h2>
              <p>控制提示词润色与翻译默认使用的模型。</p>
            </div>

            <div class="switch-row">
              <div class="switch-copy">
                <strong>默认开启 AI 润色</strong>
                <p>图片页与视频页的「AI 润色」可直接使用；已选 Skill 时会按 Skill 规范补齐画面元素。</p>
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

            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">润色模型</span>
                <span class="detail-value mono">{{ settingsStore.promptPolishModel || defaultPolishModel }}</span>
              </div>
            </div>

            <details class="advanced-block">
              <summary>高级：自定义润色模型与系统提示词</summary>
              <div class="field">
                <label for="polish-model">润色模型 ID</label>
                <input
                  id="polish-model"
                  v-model.trim="settingsStore.promptPolishModel"
                  class="text-input"
                  :placeholder="defaultPolishModel"
                  @blur="settingsStore.saveToStorage()"
                />
                <a href="https://www.aiping.cn/modelList" target="_blank" rel="noopener" class="text-link">
                  查看官方模型列表 ↗
                </a>
              </div>
              <div class="field">
                <label for="polish-system-prompt">系统提示词</label>
                <textarea
                  id="polish-system-prompt"
                  v-model.trim="settingsStore.promptPolishSystemPrompt"
                  class="text-area"
                  :placeholder="defaultPolishSystemPrompt"
                  @blur="settingsStore.saveToStorage()"
                />
                <p class="field-hint">留空时使用默认优化提示词。</p>
              </div>
            </details>

            <div class="panel-actions">
              <button class="btn ghost" type="button" @click="resetPolishPrompt">恢复默认</button>
              <button class="btn solid" type="button" @click="savePolishSettings">保存</button>
            </div>
            <p v-if="polishStatus" class="notice success">{{ polishStatus }}</p>

            <div class="divider" />

            <div class="sub-block">
              <div class="sub-head">
                <h3>翻译模型</h3>
                <p>配音页点击「翻译」时使用，留空回落到 {{ defaultTranslationModel }}。</p>
              </div>
              <div class="field">
                <label for="translation-model">模型 ID</label>
                <input
                  id="translation-model"
                  v-model.trim="settingsStore.translationModel"
                  class="text-input"
                  :placeholder="defaultTranslationModel"
                  @blur="handleTranslationModelBlur"
                />
              </div>
              <div class="panel-actions">
                <button class="btn ghost" type="button" @click="resetTranslationModel">恢复默认</button>
                <button class="btn solid" type="button" @click="saveTranslationSettings">保存</button>
              </div>
              <p v-if="translationStatus" class="notice success">{{ translationStatus }}</p>
            </div>
          </section>

          <!-- 默认 Skill -->
          <section id="skills" class="panel">
            <div class="panel-head">
              <h2>默认 Skill</h2>
              <p>这些内置设计规范默认参与每次图片生成，与生图页选中的风格合并下发。</p>
            </div>

            <div class="skill-list">
              <div v-for="skill in defaultQualitySkills" :key="skill.id" class="skill-row">
                <div class="skill-copy">
                  <strong>{{ skill.name }}</strong>
                  <small>{{ skill.description }}</small>
                  <a
                    v-if="skill.source"
                    class="text-link"
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

            <div class="panel-actions">
              <button class="btn ghost" type="button" @click="skillStore.enableAllDefaultQualitySkills()">
                全部开启
              </button>
            </div>
          </section>

          <!-- 安装到 Agent -->
          <section id="agent" class="panel">
            <div class="panel-head">
              <h2>让 Agent 安装步帧</h2>
              <p>步帧是纯本地项目，不依赖云端托管。把下面的指令交给你的 Agent，它会自己克隆仓库、安装依赖并启动。</p>
            </div>

            <div class="repo-bar">
              <span class="repo-label">GitHub</span>
              <a class="repo-url" :href="repoUrl" target="_blank" rel="noopener">{{ repoUrlLabel }}</a>
              <button class="btn tiny" type="button" @click="copyRepo">
                {{ repoCopied ? '已复制' : '复制地址' }}
              </button>
            </div>

            <div class="agent-tabs" role="tablist" aria-label="Agent 客户端">
              <button
                v-for="tab in agentTabs"
                :key="tab.key"
                type="button"
                role="tab"
                class="agent-tab"
                :class="{ active: agentTab === tab.key }"
                :aria-selected="agentTab === tab.key"
                @click="agentTab = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>

            <p class="agent-hint">{{ activeAgentTab.hint }}</p>

            <pre class="agent-code">{{ activeAgentTab.prompt }}</pre>

            <div class="panel-actions">
              <button class="btn solid" type="button" @click="copyAgentPrompt">
                {{ agentCopied ? '已复制指令' : '复制指令' }}
              </button>
              <a class="text-link" :href="repoUrl" target="_blank" rel="noopener">打开仓库 ↗</a>
            </div>

            <ul class="agent-notes">
              <li>指令里不包含任何 API Key。首次打开页面时，由你自己填入或更换密钥。</li>
              <li>项目只监听本机地址，数据与生成的素材都留在本机。</li>
              <li>若端口被占用，启动脚本会自动顺延，终端里会打印实际地址。</li>
            </ul>
          </section>
        </main>
      </div>
    </div>

    <StudioIsland />

    <div v-if="showEditConfig" class="modal-overlay" @click.self="showEditConfig = false">
      <div class="modal">
        <h3>更新 API 访问信息</h3>
        <p class="modal-lead">密钥只保存在当前浏览器会话中。</p>
        <div class="field">
          <label for="edit-base-url">服务地址</label>
          <input
            id="edit-base-url"
            v-model="newApiBaseUrl"
            class="text-input"
            placeholder="https://aiping.cn/api/v1"
          />
          <p class="field-hint">需要 OpenAI baseURL 格式，例如：https://aiping.cn/api/v1。</p>
        </div>
        <ApiKeyInput v-model="newApiKey" />
        <a class="text-link" href="https://aiping.cn/user/apikey" target="_blank" rel="noopener">
          获取 AIPing 密钥 ↗
        </a>
        <p v-if="editStatus" :class="['notice', editStatusType]">{{ editStatus }}</p>
        <div class="panel-actions">
          <button class="btn ghost" type="button" @click="showEditConfig = false">取消</button>
          <button class="btn solid" type="button" :disabled="!newApiBaseUrl || !newApiKey || saving" @click="handleSaveConfig">
            {{ saving ? '正在保存…' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { confirmDialog } from '@/features/ui/dialog'
import ApiKeyInput from '@/components/ApiKeyInput.vue'
import StudioIsland from '@/components/StudioIsland.vue'
import { useApiStore } from '@/stores/apiStore'
import { useChatStore } from '@/stores/chatStore'
import {
  DEFAULT_PROMPT_POLISH_MODEL,
  DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT,
  DEFAULT_TRANSLATION_MODEL,
  useSettingsStore,
} from '@/stores/settingsStore'
import { useSkillStore } from '@/stores/skillStore'
import { useLocalAgentStore } from '@/stores/localAgentStore'
import { DEFAULT_QUALITY_SKILLS } from '@/features/skill/builtin'
import { maskApiKey } from '@/utils/format'
import { testConnectionWithDetail } from '@/api/aiping'
import { AIPING_PUBLIC_API_BASE_URL, isOpenAiBaseUrlFormat } from '@/api/config'

const router = useRouter()
const apiStore = useApiStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const skillStore = useSkillStore()
const localAgentStore = useLocalAgentStore()
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

const customName = ref(localAgentStore.custom.name)
const customCommand = ref(localAgentStore.custom.command)
const customStatus = ref('')
const copiedInstallId = ref('')

function scanAgents() {
  void localAgentStore.scan(true)
}

function selectEngine(id: string) {
  localAgentStore.select(id)
}

async function copyInstall(agent: { id: string; installCommand: string }) {
  if (await copyText(agent.installCommand)) {
    copiedInstallId.value = agent.id
    window.setTimeout(() => {
      if (copiedInstallId.value === agent.id) copiedInstallId.value = ''
    }, 1600)
  }
}

function saveCustomAgent() {
  if (!customCommand.value.trim()) return
  localAgentStore.saveCustomAgent({ name: customName.value, command: customCommand.value })
  customName.value = localAgentStore.custom.name
  customCommand.value = localAgentStore.custom.command
  customStatus.value = `已保存，后续对话将由 ${localAgentStore.selectedLabel} 执行。`
  window.setTimeout(() => {
    customStatus.value = ''
  }, 2600)
}

async function removeCustomAgent() {
  const ok = await confirmDialog({
    title: '删除自定义命令',
    message: '删除后这条自定义命令不会保留，之后会继续使用内置模型。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  localAgentStore.clearCustomAgent()
  customName.value = ''
  customCommand.value = ''
  customStatus.value = '已删除自定义命令，当前使用内置模型。'
  window.setTimeout(() => {
    customStatus.value = ''
  }, 2200)
}

const maskedKeyText = computed(() => (apiStore.apiKey ? maskApiKey(apiStore.apiKey) : '未设置'))

/* ---------------------------------- 分区导航 ---------------------------------- */

const navGroups = [
  {
    label: '全局设置',
    items: [
      { id: 'account', label: '账号与连接' },
      { id: 'about', label: '关于与数据' },
    ],
  },
  {
    label: '图像视频创作',
    items: [
      { id: 'creation', label: '创作偏好' },
      { id: 'skills', label: '默认 Skill' },
    ],
  },
  {
    label: '安装与接入',
    items: [
      { id: 'agents', label: '本机 Agent' },
      { id: 'agent', label: '让 Agent 安装步帧' },
    ],
  },
]
const navItems = navGroups.flatMap((group) => group.items)
const activeSection = ref('account')
let observer: IntersectionObserver | null = null

function scrollToSection(id: string) {
  activeSection.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setupSectionObserver() {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible?.target?.id) activeSection.value = visible.target.id
    },
    { rootMargin: '-12% 0px -55% 0px', threshold: [0.05, 0.3, 0.6] },
  )
  navItems.forEach((item) => {
    const element = document.getElementById(item.id)
    if (element) observer?.observe(element)
  })
}

/* ---------------------------------- Agent 安装 ---------------------------------- */

const repoUrl = 'https://github.com/JamesY077/onestepdraw'
const repoUrlLabel = 'github.com/JamesY077/onestepdraw'
const localRootDir = ref('<步帧项目目录>')

type AgentTabKey = 'claude-code' | 'cursor' | 'codex' | 'local'
const agentTab = ref<AgentTabKey>('claude-code')
const agentCopied = ref(false)
const repoCopied = ref(false)

const installPrompt = computed(() =>
  [
    '请帮我在这台电脑上安装并运行步帧：',
    '',
    `1. 克隆仓库：git clone ${repoUrl}.git ~/onestepdraw`,
    '2. 进入目录后运行 npm install',
    '3. 运行 npm start，完成后把访问地址告诉我（默认 http://127.0.0.1:5500，端口被占用会自动顺延）',
    '4. 打开页面后，由我自己填写 AIPing API Key：https://aiping.cn/user/apikey',
    '',
    '注意：这是纯本地离线项目，不需要你读取、写入或向我索要任何密钥，也不要把项目内容上传到第三方服务。',
  ].join('\n'),
)

const localPrompt = computed(() =>
  [
    '步帧已经安装在这台电脑上：',
    '',
    `项目目录：${localRootDir.value}`,
    '',
    '请进入这个目录并完成以下事情：',
    '1. 先阅读 README.md 了解项目结构与启动方式',
    '2. 运行 npm install（依赖已存在可跳过）',
    '3. 运行 npm start，完成后把访问地址告诉我',
    '4. 后续改代码时直接修改 src/ 下的文件，改完运行 npm run build',
    '',
    '注意：这是纯本地离线项目，AIPing API Key 由我在页面里自行填写，不需要你处理任何密钥。',
  ].join('\n'),
)

const agentTabs = computed<Array<{ key: AgentTabKey; label: string; hint: string; prompt: string }>>(() => [
  {
    key: 'claude-code',
    label: 'Claude Code',
    hint: '在任意目录运行 claude，然后把指令发给它。',
    prompt: installPrompt.value,
  },
  {
    key: 'cursor',
    label: 'Cursor',
    hint: '在 Cursor 中新开一个对话，把指令粘贴给 Agent。',
    prompt: installPrompt.value,
  },
  {
    key: 'codex',
    label: 'Codex',
    hint: '在终端运行 codex，把指令粘贴进去。',
    prompt: installPrompt.value,
  },
  {
    key: 'local',
    label: '本地已安装',
    hint: '已经下载过本项目时，让 Agent 直接基于本地目录工作。',
    prompt: localPrompt.value,
  },
])

const activeAgentTab = computed(
  () => agentTabs.value.find((tab) => tab.key === agentTab.value) || agentTabs.value[0],
)

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function copyAgentPrompt() {
  if (await copyText(activeAgentTab.value.prompt)) {
    agentCopied.value = true
    window.setTimeout(() => {
      agentCopied.value = false
    }, 1600)
  }
}

async function copyRepo() {
  if (await copyText(repoUrl)) {
    repoCopied.value = true
    window.setTimeout(() => {
      repoCopied.value = false
    }, 1600)
  }
}

async function loadLocalInfo() {
  try {
    const response = await fetch('/local/info', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    if (typeof data?.rootDir === 'string' && data.rootDir) {
      localRootDir.value = data.rootDir
    }
  } catch {
    // 静态托管环境下保留占位路径。
  }
}

onMounted(() => {
  settingsStore.loadFromStorage()
  skillStore.loadFromStorage()
  localAgentStore.ensureScanned()
  void loadLocalInfo()
  setupSectionObserver()
  if (window.location.hash === '#agents') {
    window.setTimeout(() => scrollToSection('agents'), 120)
  }
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

/* ---------------------------------- 账号操作 ---------------------------------- */

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
    editStatus.value = '服务地址格式不正确，请填写 OpenAI baseURL 格式，例如：https://aiping.cn/api/v1。'
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

async function handleClear() {
  const ok = await confirmDialog({
    title: '清除配置',
    message: '清除配置并退出？本机保存的对话也会一起清空。',
    confirmText: '清除并退出',
    danger: true,
  })
  if (!ok) return
  apiStore.clear()
  chatStore.clearMessages()
  router.replace('/setup')
}

/* ---------------------------------- 创作偏好 ---------------------------------- */

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
  padding: 28px 24px 48px;
  color: #1d1d1b;
  background: #fbfbf9;
}

@media (min-width: 901px) {
  .settings-page {
    padding-right: 104px;
  }
}

.settings-shell {
  width: min(100%, 1180px);
  margin: 0 auto;
}

/* ---------------------------------- 顶部 ---------------------------------- */

.settings-header {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 4px 2px 26px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 34px;
  padding: 0 12px 0 8px;
  border: 1px solid #e7e7e0;
  border-radius: 999px;
  background: #ffffff;
  color: #55554f;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease;
}

.back-btn:hover {
  border-color: #c9c9c1;
  color: #111111;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.header-title {
  flex: 1;
  min-width: 0;
}

.header-title h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.header-title p {
  margin: 4px 0 0;
  color: #8a8a82;
  font-size: 12.5px;
  line-height: 1.6;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid #e7e7e0;
  border-radius: 999px;
  background: #ffffff;
  color: #6d6d65;
  font-size: 12px;
  font-weight: 600;
}

.status-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b6b6ae;
}

.status-pill.ok i {
  background: #1f9d63;
}

/* ---------------------------------- 布局 ---------------------------------- */

.settings-body {
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr);
  gap: 36px;
  align-items: start;
}

.settings-nav {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group + .nav-group {
  margin-top: 15px;
}

.nav-group-label {
  padding: 0 10px 6px;
  color: #a4a49c;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.nav-item {
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #77776f;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}

.nav-item:hover {
  background: #f1f1ec;
  color: #1d1d1b;
}

.nav-item.active {
  background: #f0f0ea;
  color: #111111;
  font-weight: 600;
}

.nav-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 18px;
  padding: 14px 10px 0;
  border-top: 1px solid #ecece7;
  color: #b0b0a8;
  font-size: 11px;
}

.settings-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding-bottom: 24px;
}

/* ---------------------------------- 面板 ---------------------------------- */

.panel {
  scroll-margin-top: 20px;
  padding: 24px 26px;
  border: 1px solid #eaeae3;
  border-radius: 18px;
  background: #ffffff;
}

.panel-head {
  margin-bottom: 18px;
}

.panel-head h2 {
  margin: 0;
  font-size: 16.5px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.panel-head p {
  max-width: 68ch;
  margin: 6px 0 0;
  color: #8a8a82;
  font-size: 12.5px;
  line-height: 1.7;
}

.detail-list {
  overflow: hidden;
  border: 1px solid #eeeee8;
  border-radius: 12px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 46px;
  padding: 10px 14px;
  background: #fcfcfa;
}

.detail-row + .detail-row {
  border-top: 1px solid #f0f0ea;
}

.detail-label {
  flex: 0 0 auto;
  color: #77776f;
  font-size: 12.5px;
}

.detail-value {
  min-width: 0;
  color: #2b2b27;
  font-size: 12.5px;
  text-align: right;
  overflow-wrap: anywhere;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}

.tag.ok {
  background: #edf7f0;
  color: #1f7a4d;
}

.tag.idle {
  background: #f4f4ef;
  color: #77776f;
}

.panel-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 15px;
  border-radius: 9px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}

.btn.ghost {
  border: 1px solid #e7e7e0;
  background: #ffffff;
  color: #3d3d38;
}

.btn.ghost:hover {
  border-color: #c9c9c1;
  background: #fafaf7;
}

.btn.solid {
  border: 1px solid #111111;
  background: #111111;
  color: #ffffff;
}

.btn.solid:hover {
  background: #2b2b27;
}

.btn.solid:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn.danger {
  border: 1px solid #efd5d2;
  background: #fdf4f3;
  color: #b4342c;
}

.btn.danger:hover {
  background: #fbe9e7;
}

.btn.tiny {
  min-height: 28px;
  padding: 0 11px;
  border: 1px solid #e7e7e0;
  background: #ffffff;
  color: #55554f;
  font-size: 11.5px;
}

.btn.tiny:hover {
  border-color: #c9c9c1;
}

.text-link {
  color: #6d6d65;
  font-size: 12.5px;
  text-decoration: none;
  text-underline-offset: 3px;
}

.text-link:hover {
  color: #111111;
  text-decoration: underline;
}

.notice {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 9px;
  font-size: 12.5px;
  line-height: 1.6;
}

.notice.success {
  background: #edf7f0;
  color: #1f7a4d;
}

.notice.error {
  background: #fdf1ef;
  color: #b4342c;
}

.divider {
  height: 1px;
  margin: 24px 0;
  background: #f0f0ea;
}

/* ---------------------------------- 表单 ---------------------------------- */

.field {
  margin-top: 14px;
}

label {
  display: block;
  margin-bottom: 7px;
  color: #77776f;
  font-size: 11.5px;
  font-weight: 600;
}

.text-input,
.text-area {
  width: 100%;
  border: 1px solid #e7e7e0;
  border-radius: 10px;
  background: #ffffff;
  color: #1d1d1b;
  font: inherit;
  font-size: 13px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.text-input {
  min-height: 40px;
  padding: 0 12px;
}

.text-area {
  min-height: 116px;
  padding: 11px 12px;
  line-height: 1.7;
  resize: vertical;
}

.text-input:focus,
.text-area:focus {
  outline: none;
  border-color: #b9b9b0;
  box-shadow: 0 0 0 3px rgba(17, 17, 16, 0.05);
}

.field-hint {
  margin: 6px 0 0;
  color: #9d9d95;
  font-size: 11.5px;
  line-height: 1.6;
}

.field .text-link {
  display: inline-block;
  margin-top: 8px;
}

/* ---------------------------------- 开关 ---------------------------------- */

.switch-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 16px;
  border: 1px solid #eeeee8;
  border-radius: 12px;
  background: #fcfcfa;
}

.switch-copy {
  min-width: 0;
}

.switch-copy strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.switch-copy p {
  max-width: 62ch;
  margin: 4px 0 0;
  color: #8a8a82;
  font-size: 12px;
  line-height: 1.65;
}

.toggle-switch {
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 24px;
  margin-top: 2px;
  padding: 0;
  border: 1px solid #deded7;
  border-radius: 999px;
  background: #e7e7e0;
  cursor: pointer;
  transition: background 200ms ease, border-color 200ms ease;
}

.toggle-switch.on {
  border-color: transparent;
  background: #111111;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(17, 17, 16, 0.18);
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.toggle-switch.on .toggle-knob {
  transform: translateX(18px);
}

/* ---------------------------------- 高级 / 翻译 ---------------------------------- */

.advanced-block {
  margin-top: 12px;
  border: 1px solid #eeeee8;
  border-radius: 12px;
  background: #fcfcfa;
}

.advanced-block > summary {
  padding: 11px 14px;
  color: #6d6d65;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.advanced-block > summary::-webkit-details-marker {
  display: none;
}

.advanced-block[open] > summary {
  border-bottom: 1px solid #eeeee8;
}

.advanced-block .field {
  margin: 0;
  padding: 12px 14px;
}

.advanced-block .field + .field {
  border-top: 1px solid #f0f0ea;
}

.sub-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}

.sub-head p {
  margin: 4px 0 0;
  color: #8a8a82;
  font-size: 12px;
  line-height: 1.6;
}

.sub-block > .field:first-of-type {
  margin-top: 14px;
}

/* ---------------------------------- Skill ---------------------------------- */

.skill-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #eeeee8;
  border-radius: 12px;
}

.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 16px;
  background: #fcfcfa;
}

.skill-row + .skill-row {
  border-top: 1px solid #f0f0ea;
}

.skill-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.skill-copy strong {
  font-size: 13px;
  font-weight: 600;
}

.skill-copy small {
  color: #8a8a82;
  font-size: 11.5px;
  line-height: 1.55;
}

.skill-copy .text-link {
  align-self: flex-start;
  margin-top: 2px;
  font-size: 11px;
}

/* ---------------------------------- Agent ---------------------------------- */

.repo-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #eeeee8;
  border-radius: 11px;
  background: #fcfcfa;
}

.repo-label {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 5px;
  background: #efefe9;
  color: #77776f;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.repo-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #2b2b27;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}

.repo-url:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.agent-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
}

.agent-tab {
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid #e7e7e0;
  border-radius: 999px;
  background: #ffffff;
  color: #6d6d65;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}

.agent-tab:hover {
  border-color: #c9c9c1;
  color: #1d1d1b;
}

.agent-tab.active {
  border-color: #111111;
  background: #111111;
  color: #ffffff;
}

.agent-hint {
  margin: 10px 0 0;
  color: #9d9d95;
  font-size: 11.5px;
}

.agent-code {
  max-height: 340px;
  margin: 10px 0 0;
  padding: 14px 16px;
  overflow: auto;
  border: 1px solid #eeeee8;
  border-radius: 12px;
  background: #fcfcfa;
  color: #3d3d38;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 16px 0 0;
  padding: 14px 0 0;
  border-top: 1px solid #f0f0ea;
  list-style: none;
}

.agent-notes li {
  position: relative;
  padding-left: 14px;
  color: #8a8a82;
  font-size: 12px;
  line-height: 1.65;
}

.agent-notes li::before {
  position: absolute;
  top: 8px;
  left: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #c9c9c1;
  content: '';
}

/* ---------------------------------- 危险操作 ---------------------------------- */

.danger-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid #f2e3e1;
  border-radius: 12px;
  background: #fffbfa;
}

.danger-block strong {
  font-size: 13px;
  font-weight: 600;
}

.danger-block p {
  margin: 4px 0 0;
  color: #9a8b88;
  font-size: 11.5px;
  line-height: 1.6;
}

/* ---------------------------------- 弹窗 ---------------------------------- */

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(17, 17, 16, 0.26);
  backdrop-filter: blur(6px);
}

.modal {
  width: min(100%, 520px);
  padding: 26px;
  border: 1px solid #eaeae3;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 80px rgba(17, 17, 16, 0.14);
}

.modal h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.modal-lead {
  margin: 6px 0 4px;
  color: #8a8a82;
  font-size: 12.5px;
}

/* ---------------------------------- 响应式 ---------------------------------- */

@media (max-width: 1023px) {
  .settings-body {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .settings-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    overflow: visible;
    padding-bottom: 4px;
  }

  .nav-label,
  .nav-foot {
    display: none;
  }

  .nav-group {
    display: contents;
  }

  .nav-group-label {
    display: none;
  }

  .nav-item {
    flex: 0 0 auto;
    padding: 7px 12px;
    border: 1px solid #e7e7e0;
    border-radius: 999px;
    background: #ffffff;
    white-space: nowrap;
  }

  .nav-item.active {
    border-color: #111111;
    background: #111111;
    color: #ffffff;
  }
}

@media (max-width: 767px) {
  .settings-page {
    padding: 16px 64px 36px 14px;
  }

  .settings-header {
    flex-wrap: wrap;
    gap: 10px 12px;
    padding-bottom: 18px;
  }

  .header-title {
    order: 3;
    flex-basis: 100%;
  }

  .header-title h1 {
    font-size: 21px;
  }

  .status-pill {
    margin-left: auto;
  }

  .panel {
    padding: 20px 18px;
    border-radius: 16px;
  }

  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 11px 12px;
  }

  .detail-value {
    text-align: left;
  }

  .panel-actions .btn {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .switch-row,
  .skill-row,
  .danger-block {
    align-items: flex-start;
  }

  .switch-row,
  .danger-block {
    flex-direction: column;
    gap: 12px;
  }

  .skill-row {
    gap: 14px;
  }

  .repo-bar {
    flex-wrap: wrap;
  }

  .repo-url {
    flex-basis: 100%;
    order: 3;
  }

  .danger-block .btn {
    width: 100%;
  }

  .modal-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .modal {
    max-height: min(88dvh, 720px);
    overflow-y: auto;
    padding: 22px 18px;
  }
}
/* ------------------------------ 本机 Agent ------------------------------ */

.panel-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.panel-head-row > div {
  min-width: 0;
}

.panel-head-row .btn {
  flex: none;
  margin-top: 2px;
}

.engine-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 12px;
  padding: 13px 14px;
  border: 1px solid #e9e9e3;
  border-radius: 11px;
  background: #fdfdfb;
}

.engine-current {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.engine-status-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #58a274;
  box-shadow: 0 0 0 3px rgba(88, 162, 116, 0.12);
}

.engine-status-dot.local {
  background: #4f86c6;
  box-shadow: 0 0 0 3px rgba(79, 134, 198, 0.13);
}

.engine-current-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.engine-current-copy strong {
  color: #242421;
  font-size: 12.8px;
  font-weight: 600;
}

.engine-current-copy small {
  overflow: hidden;
  color: #99998f;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engine-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.engine-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 13px;
  border: 1px solid #ecece6;
  border-radius: 10px;
  background: #ffffff;
}

.engine-row.selected {
  border-color: #d7d7cd;
  background: #fbfbf7;
}

.builtin-row {
  margin-top: 10px;
  border-style: dashed;
  background: #fdfdfb;
}

.engine-row-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.engine-row-main strong {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #262622;
  font-size: 12.8px;
  font-weight: 600;
}

.engine-vendor {
  padding: 1px 6px;
  border: 1px solid #ecece6;
  border-radius: 999px;
  color: #96968c;
  font-size: 9.5px;
  font-weight: 500;
}

.source-tag {
  padding: 1px 6px;
  border: 1px solid #dcebdf;
  border-radius: 999px;
  background: #f6fbf7;
  color: #3f7d58;
  font-size: 9.5px;
  font-weight: 500;
}

.custom-block {
  padding-bottom: 4px;
}

.custom-block > summary {
  border-bottom: 0;
}

.custom-block[open] > summary {
  border-bottom: 1px solid #eeeee8;
}

.custom-block .field-hint {
  padding: 0 14px;
}

.custom-block .custom-agent-grid {
  padding: 2px 14px 0;
}

.custom-block .panel-actions {
  padding: 0 14px;
}

.custom-block .notice {
  margin: 10px 14px 6px;
}

.engine-meta {
  color: #8f8f86;
  font-size: 11px;
}

.engine-path {
  overflow: hidden;
  max-width: 420px;
  color: #aaaaa1;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engine-empty-note {
  margin: 0 0 4px;
  padding: 12px 13px;
  border: 1px dashed #e6e6df;
  border-radius: 10px;
  color: #9c9c92;
  font-size: 11.5px;
  line-height: 1.7;
}

.install-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.install-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #efefe9;
  border-radius: 9px;
  background: #fdfdfb;
}

.install-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.install-copy strong {
  color: #2b2b27;
  font-size: 12.2px;
  font-weight: 600;
}

.install-command {
  overflow-x: auto;
  padding: 5px 8px;
  border: 1px solid #ecece5;
  border-radius: 6px;
  background: #f7f7f2;
  color: #55554d;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  white-space: pre;
}

.install-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.panel-subhead {
  margin: 22px 0 10px;
  padding-top: 16px;
  border-top: 1px solid #f0f0ea;
}

.panel-subhead strong {
  color: #242421;
  font-size: 12.8px;
  font-weight: 600;
}

.panel-subhead p {
  margin: 4px 0 0;
  color: #94948b;
  font-size: 11.5px;
  line-height: 1.65;
}

.panel-subhead code,
.field-hint code {
  padding: 1px 4px;
  border-radius: 4px;
  background: #f4f4ef;
  color: #66665e;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
}

.custom-agent-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .panel-head-row {
    flex-direction: column;
  }

  .engine-row,
  .install-row {
    flex-direction: column;
    align-items: stretch;
  }

  .engine-row .btn,
  .install-actions {
    align-self: flex-start;
  }

  .custom-agent-grid {
    grid-template-columns: 1fr;
  }

  .engine-path {
    max-width: 100%;
  }
}
</style>
