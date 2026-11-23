<template>
  <div class="chat-page" :class="chatMode.isCreate ? 'is-create' : 'is-chat'">
    <div v-if="sidebarOpen" class="sidebar-backdrop" aria-hidden="true" @click="sidebarOpen = false" />

    <AgentSidebar
      class="sidebar-slot"
      :class="{ 'is-open': sidebarOpen }"
      :conversations="store.sortedConversations"
      :active-id="store.activeId"
      @new="handleNew"
      @select="handleSelect"
      @delete="handleDelete"
      @logout="handleLogout"
      @close="sidebarOpen = false"
    />

    <main class="chat-main">
      <header class="chat-header">
        <button type="button" class="menu-button" aria-label="打开侧栏" @click="sidebarOpen = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div class="chat-heading">
          <h1>{{ headerTitle }}</h1>
          <span class="heading-sep" aria-hidden="true">/</span>
          <span class="heading-sub">{{ headerEngine }}</span>
        </div>

        <div class="header-actions">
          <button
            type="button"
            class="template-shortcut"
            title="打开模板库"
            @click="openTemplatePage"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
              <rect x="3.4" y="4.4" width="7.2" height="7.2" rx="2" />
              <rect x="13.4" y="4.4" width="7.2" height="7.2" rx="2" />
              <rect x="3.4" y="14.4" width="7.2" height="5.2" rx="2" />
              <rect x="13.4" y="14.4" width="7.2" height="5.2" rx="2" />
            </svg>
            <span>模板库</span>
          </button>
          <button
            v-if="activeProjectId"
            type="button"
            class="mode-badge project-shortcut"
            title="进入剪辑台"
            @click="router.push(`/edit/${activeProjectId}`)"
          >
            剪辑台 ↗
          </button>
          <span class="mode-badge" :class="{ 'is-create': chatMode.isCreate }">
            <i v-if="chatMode.isCreate" class="badge-dot" aria-hidden="true" />
            {{ chatMode.conversationLabel }}
          </span>
          <span class="local-badge">本地</span>
          <button type="button" class="new-chat-icon" title="设置" aria-label="设置" @click="router.push('/settings')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15.1 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.11a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49.86z" />
            </svg>
          </button>
          <button type="button" class="new-chat-icon" title="新对话" aria-label="新对话" @click="handleNew">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      <div v-if="store.authExpired" class="expired-banner" role="alert">
        AIPing 登录已过期，正在返回登录页…
      </div>

      <div v-else-if="localAgentStore.pendingSelection" class="engine-warning" role="status">
        <span>
          没有检测到 {{ localAgentStore.pendingSelection.name }}，当前使用内置 AIPing 模型。
        </span>
        <button type="button" @click="localAgentStore.scan(true)">重新扫描</button>
      </div>

      <div ref="scrollRef" class="chat-scroll" @scroll="handleScroll">
        <section v-if="!messages.length" class="welcome">
          <div class="welcome-mark">
            <BrandMark :size="46" />
          </div>
          <p v-if="chatMode.isCreate" class="welcome-eyebrow">Creative Mode</p>
          <h2>{{ welcomeTitle }}</h2>
          <p class="welcome-copy">
            {{
              chatMode.isCreate
                ? '先说说你想拍什么。步帧会问清镜头、光线与节奏，再带你进剪辑台，把它慢慢剪成一支片。'
                : '步帧是你的本地 AI 创作助手。写东西、想点子、做分镜、推敲提示词，都可以从这里开始。'
            }}
          </p>

          <div v-if="chatMode.isCreate" class="create-flow" aria-label="创作流程">
            <span class="flow-step"><b>01</b>说需求</span>
            <i class="flow-sep" aria-hidden="true" />
            <span class="flow-step"><b>02</b>答几轮问题</span>
            <i class="flow-sep" aria-hidden="true" />
            <span class="flow-step"><b>03</b>进剪辑台</span>
          </div>

          <div class="suggestion-grid">
            <button
              v-for="(suggestion, index) in suggestions"
              :key="suggestion.title"
              type="button"
              class="suggestion-card"
              @click="applySuggestion(suggestion.prompt)"
            >
              <span class="suggestion-icon" aria-hidden="true">
                <span v-if="chatMode.isCreate" class="suggestion-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path :d="suggestion.icon" />
                </svg>
              </span>
              <span class="suggestion-copy">
                <span class="suggestion-title">{{ suggestion.title }}</span>
                <span class="suggestion-desc">{{ suggestion.description }}</span>
              </span>
              <span class="suggestion-arrow" aria-hidden="true">↗</span>
            </button>
          </div>

          <p class="welcome-note">
            <span class="note-dot" aria-hidden="true" />
            {{
              chatMode.isCreate
                ? '创作对话会自动建立剪辑项目 · 生成的素材按段落入轨'
                : localAgentStore.isLocalEngine
                  ? `由 ${localAgentStore.selectedLabel} 执行创作 · 对话只保存在这台设备`
                  : '已连接 AIPing · 对话只保存在这台设备'
            }}
          </p>
        </section>

        <section v-else class="message-list" aria-live="polite">
          <AgentMessage
            v-for="message in messages"
            :key="message.id"
            :message="message"
            :is-streaming="message.status === 'streaming'"
            :can-retry="message.id === lastAssistantId"
            @retry="handleRetry"
            @generation-retry="handleGenerationRetry"
            @ask-answer="handleAskAnswer"
          />
        </section>
      </div>

      <div class="composer-area">
        <div class="composer-inner">
          <p v-if="templatesNotice" class="composer-templates-note" role="status">
            <i class="note-dot" aria-hidden="true" />
            {{ templatesNotice }}
          </p>
          <p v-else-if="chatMode.isCreate" class="composer-mode-note">
            <i class="note-dot" aria-hidden="true" />
            创作模式 · 生成结果会自动进入剪辑项目
          </p>
          <AgentComposer
            ref="composerRef"
            v-model="draft"
            :disabled="store.isStreaming"
            @send="handleSend"
            @stop="store.stopStreaming"
          />
        </div>
      </div>
    </main>

    <StudioIsland />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { confirmDialog } from '@/features/ui/dialog'
import AgentSidebar from '@/components/agent/AgentSidebar.vue'
import AgentComposer from '@/components/agent/AgentComposer.vue'
import AgentMessage from '@/components/agent/AgentMessage.vue'
import BrandMark from '@/components/agent/BrandMark.vue'
import StudioIsland from '@/components/StudioIsland.vue'
import { useAgentStore } from '@/stores/agentStore'
import { useApiStore } from '@/stores/apiStore'
import { useLocalAgentStore } from '@/stores/localAgentStore'
import { useModelStore } from '@/stores/modelStore'
import { useChatModeStore } from '@/stores/chatModeStore'
import { useEditProjectStore } from '@/stores/editProjectStore'
import { consumeTemplatesFlash, describeTemplatesFlash } from '@/features/template/navigation'
import type { ComposerSubmit } from '@/types/agent'

const store = useAgentStore()
const apiStore = useApiStore()
const localAgentStore = useLocalAgentStore()
const modelStore = useModelStore()
const chatMode = useChatModeStore()
const projectStore = useEditProjectStore()
const route = useRoute()
const router = useRouter()

function openTemplatePage() {
  router.push({ path: '/templates', query: { from: router.currentRoute.value.fullPath } })
}

const activeProjectId = computed(() => store.activeConversation?.projectId || '')

const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof AgentComposer> | null>(null)
const draft = ref('')
const sidebarOpen = ref(false)
const stickToBottom = ref(true)
/** 从模板库引用回来后，在输入框上方说明一句。 */
const templatesNotice = ref('')
let templatesNoticeTimer = 0

const suggestions = computed(() => (chatMode.isCreate ? createSuggestions : chatSuggestions))

const welcomeTitle = computed(() => (chatMode.isCreate ? '想拍一支什么样的片？' : '今天想做什么？'))
const chatSuggestions = [
  {
    title: '写一段产品文案',
    description: '克制、有质感的新品首发文案',
    prompt: '为一个新上线的本地 AI 创作助手写一段产品首发文案，克制、有质感，不超过 200 字。',
    icon: 'M5 5.8h14v9.4H9.5L5 18.4z',
  },
  {
    title: '设计一支短片分镜',
    description: '把一个想法拆成 6 个镜头',
    prompt: '把「一个人在深夜的城市里寻找灵感」拆成 6 个短片分镜，列出画面、运镜、时长和一句旁白。',
    icon: 'M4 6.5h16v11H4zM4 10h16M8 6.5v11',
  },
  {
    title: '优化 AI 绘画提示词',
    description: '从一句灵感到可直接出图',
    prompt: '把「雨夜霓虹灯下的复古跑车」扩写成一段中文 AI 绘画提示词，包含主体、场景、构图、镜头、光线、色彩和质感。',
    icon: 'M12 4.2 14 9l4.8 2-4.8 2-2 4.8-2-4.8L5.2 11 10 9z',
  },
  {
    title: '帮我理清一个想法',
    description: '把模糊需求变成执行计划',
    prompt: '我想做一个个人项目，但还没想清楚。请用结构化提问帮我理清目标、受众、范围和下一步。',
    icon: 'M6 5.5h12v13H6zM9 9h6M9 12h6M9 15h3.5',
  },
  {
    title: '生成一张产品主视觉',
    description: '直接出图，默认 16:9',
    prompt: '帮我生成一张极简白色风格的香水产品主视觉，磨砂玻璃瓶身，柔光侧逆光，16:9。',
    icon: 'M4 6.5h16v11H4zM7.5 10.2a1.3 1.3 0 1 0 0 .01M4.6 16.5l4.3-4 3.2 2.8 2.5-2.2 4.8 3.6',
  },
  {
    title: '生成一段 5 秒短片',
    description: '直接出视频，默认 768P',
    prompt: '帮我生成一段 5 秒的视频：雨夜霓虹灯下的复古跑车缓缓驶过，镜头低角度跟拍，16:9，768P。',
    icon: 'M4 6.5h16v11H4zM10.2 10 14 12l-3.8 2z',
  },
]

/** 创作对话的快捷入口：直接能开拍的题，先澄清再进剪辑台。 */
const createSuggestions = [
  {
    title: '拍一支雨夜短片',
    description: '15 秒氛围片，先进剪辑台',
    prompt: '我想拍一支 15 秒的雨夜短片：便利店门口的橘猫等雨停，暖灯和湿地面反光，安静、有电影感。',
    icon: 'M4 6.5h16v11H4zM10.2 10 14 12l-3.8 2z',
  },
  {
    title: '做一支产品展示片',
    description: '从卖点到镜头节奏',
    prompt: '帮我做一支 20 秒的极简香水产品展示片，白色背景、磨砂玻璃瓶、缓慢推近，最后落在品牌名上。',
    icon: 'M4 6.5h16v11H4zM7.5 10.2a1.3 1.3 0 1 0 0 .01M4.6 16.5l4.3-4 3.2 2.8 2.5-2.2 4.8 3.6',
  },
  {
    title: '把故事拆成分镜',
    description: '先出拍摄单，再逐段落轨',
    prompt: '把「一个人在深夜的城市里寻找灵感」拆成 4 个镜头，做成 20 秒短片，先给我拍摄单。',
    icon: 'M4 6.5h16v11H4zM4 10h16M8 6.5v11',
  },
  {
    title: '拍一个品牌氛围片',
    description: '情绪、色调、运镜一次说清',
    prompt: '给一个手冲咖啡品牌拍一支 15 秒氛围片：清晨木桌、水流、蒸汽、手部特写，暖色调，情绪安静。',
    icon: 'M12 4.2 14 9l4.8 2-4.8 2-2 4.8-2-4.8L5.2 11 10 9z',
  },
]

const messages = computed(() => store.activeConversation?.messages || [])
const headerTitle = computed(() => store.activeConversation?.title || '新对话')
const headerEngine = computed(() =>
  localAgentStore.isLocalEngine ? localAgentStore.selectedLabel : modelStore.selectedId,
)

const lastAssistantId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'assistant') return messages.value[index].id
  }
  return ''
})

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  const element = scrollRef.value
  if (!element) return
  element.scrollTo({ top: element.scrollHeight, behavior })
}

/** 有消息时贴底，没有消息时回到顶部，避免欢迎页被 6 个快捷卡片顶到下方。 */
function resetScroll(behavior: ScrollBehavior = 'auto') {
  const element = scrollRef.value
  if (!element) return
  if (messages.value.length) {
    element.scrollTo({ top: element.scrollHeight, behavior })
  } else {
    element.scrollTo({ top: 0, behavior })
  }
}

function handleScroll() {
  const element = scrollRef.value
  if (!element) return
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 90
}

function syncRouteWithActive() {
  // 创作对话会主动跳到剪辑台；此时活动会话变化不应把路由改回 /chat。
  if (route.path.startsWith('/edit')) return
  const id = store.activeId
  const target = id ? `/chat/${id}` : '/chat'
  if (route.path !== target) router.replace(target)
}

function handleNew() {
  if (store.isStreaming) store.stopStreaming()
  const conversation = store.createConversation(true)
  sidebarOpen.value = false
  syncRouteWithActive()
  router.replace(`/chat/${conversation.id}`)
  nextTick(() => composerRef.value?.focus())
}

function handleSelect(id: string) {
  if (store.isStreaming) store.stopStreaming()
  store.selectConversation(id)
  sidebarOpen.value = false
  syncRouteWithActive()
  nextTick(() => resetScroll('auto'))
}

function handleDelete(id: string) {
  store.deleteConversation(id)
  syncRouteWithActive()
  nextTick(() => resetScroll('auto'))
}

async function handleLogout() {
  if (store.isStreaming) store.stopStreaming()
  const ok = await confirmDialog({
    title: '退出登录',
    message: '退出登录？本机保存的对话不会被删除。',
    confirmText: '退出登录',
  })
  if (!ok) return
  store.flush()
  apiStore.clear()
  router.replace('/login')
}

async function handleSend(payload: ComposerSubmit) {
  const { content, attachments, templates } = payload
  stickToBottom.value = true
  if (chatMode.isCreate) {
    const conversation = store.activeConversation || store.createConversation(true)
    const titleSource = content || templates?.[0]?.name || attachments[0]?.name || ''
    const project =
      projectStore.findProjectByConversation(conversation.id) ||
      projectStore.createProject(projectTitle(titleSource), conversation.id)
    store.attachProject(conversation.id, project.id)
    void store.sendMessage(content, {
      conversationId: conversation.id,
      mode: 'create',
      automation: chatMode.automation,
      attachments,
      templates,
    })
    // 先让 activeId 监听把 /chat 路由同步完，再进剪辑台，避免被 replace 抢回。
    await nextTick()
    void router.push(`/edit/${project.id}`)
    return
  }

  await store.sendMessage(content, {
    conversationId: store.activeId || undefined,
    mode: 'chat',
    automation: chatMode.automation,
    attachments,
    templates,
  })
  syncRouteWithActive()
  await nextTick()
  scrollToBottom('smooth')
  composerRef.value?.focus()
}

function projectTitle(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.slice(0, 18) || '未命名项目'
}

async function handleRetry() {
  stickToBottom.value = true
  await store.regenerate()
  await nextTick()
  scrollToBottom('smooth')
}

function handleGenerationRetry(messageId: string) {
  store.retryGeneration(messageId)
}

function handleAskAnswer(payload: { messageId: string; optionId: string; label: string }) {
  stickToBottom.value = true
  store.answerAsk(payload.messageId, payload.optionId, payload.label)
  nextTick(() => scrollToBottom('smooth'))
}

function applySuggestion(prompt: string) {
  draft.value = prompt
  nextTick(() => composerRef.value?.focus())
}

watch(
  () => store.activeId,
  () => {
    syncRouteWithActive()
    nextTick(() => resetScroll('auto'))
  },
)

watch(
  () => route.params.id,
  (id) => {
    if (typeof id !== 'string' || !id || id === store.activeId) return
    if (store.conversations.some((conversation) => conversation.id === id)) {
      store.selectConversation(id)
    }
  },
)

watch(
  () => {
    const last = messages.value[messages.value.length - 1]
    return `${messages.value.length}:${last?.content.length || 0}:${last?.reasoning?.length || 0}`
  },
  () => {
    if (!stickToBottom.value) return
    nextTick(() => resetScroll('auto'))
  },
)

watch(
  () => store.authExpired,
  (expired) => {
    if (!expired) return
    window.setTimeout(() => {
      apiStore.clear()
      router.replace({ path: '/login', query: { expired: '1' } })
    }, 1600)
  },
)

watch(
  () => store.activeConversation?.title,
  (title) => {
    document.title = title ? `${title} · 步帧` : '步帧'
  },
  { immediate: true },
)

// 打开已有会话时跟随它记录的模式，避免把创作对话误当成普通聊天继续发。
watch(
  () => [store.activeConversation?.mode, store.activeConversation?.automation] as const,
  ([mode, automation]) => {
    if (mode === 'create' || mode === 'chat') chatMode.setConversation(mode)
    if (automation === 'auto' || automation === 'default') chatMode.setAutomation(automation)
  },
  { immediate: true },
)

function handleGlobalKeydown(event: KeyboardEvent) {
  const meta = event.metaKey || event.ctrlKey
  if (meta && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    handleNew()
  }
  if (event.key === 'Escape') {
    sidebarOpen.value = false
  }
}

function flushConversations() {
  store.flush()
}

onMounted(() => {
  localAgentStore.ensureScanned()
  modelStore.ensureLoaded()
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  if (id && store.conversations.some((conversation) => conversation.id === id)) {
    store.selectConversation(id)
  } else if (store.activeId) {
    router.replace(`/chat/${store.activeId}`)
  }
  nextTick(() => resetScroll('auto'))
  announceTemplates()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', flushConversations)
})

/** 从模板库回来：说明引用了什么，并把焦点放回输入框。 */
function announceTemplates() {
  const flash = consumeTemplatesFlash()
  if (!flash) return
  templatesNotice.value = `${describeTemplatesFlash(flash)}，直接说你想改哪里或想拍什么。`
  void nextTick(() => {
    composerRef.value?.focus()
    resetScroll('auto')
  })
  window.clearTimeout(templatesNoticeTimer)
  templatesNoticeTimer = window.setTimeout(() => {
    templatesNotice.value = ''
  }, 6000)
}

onBeforeUnmount(() => {
  window.clearTimeout(templatesNoticeTimer)
  store.flush()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('beforeunload', flushConversations)
})
</script>

<style scoped>
.chat-page {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #ffffff;
  color: #1d1d1b;
}

.sidebar-slot {
  flex: none;
}

.chat-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  background: #ffffff;
}

/* 桌面端为右侧悬浮岛留出通道 */
@media (min-width: 901px) {
  .chat-main {
    padding-right: 76px;
  }
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 58px;
  flex: none;
  padding: 0 20px;
  border-bottom: 1px solid #ededE8;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
}

.menu-button {
  display: none;
}

.chat-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chat-heading h1 {
  max-width: 42vw;
  overflow: hidden;
  color: #1d1d1a;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heading-sep {
  color: #d2d2cb;
  font-size: 12px;
}

.heading-sub {
  color: #9b9b93;
  font-size: 12px;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.local-badge {
  padding: 3px 8px;
  border: 1px solid #e6e6e0;
  border-radius: 999px;
  background: #fafaf8;
  color: #8c8c84;
  font-size: 10.5px;
  font-weight: 600;
}

.mode-badge {
  padding: 3px 8px;
  border: 1px solid #e6e6e0;
  border-radius: 999px;
  background: #ffffff;
  color: #8c8c84;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

.mode-badge.is-create {
  border-color: #d9d9cf;
  background: #111110;
  color: #fafaf7;
}

.project-shortcut {
  cursor: pointer;
  color: #5f5f57;
}

.template-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid #e6e6e0;
  border-radius: 999px;
  background: #ffffff;
  color: #6b6b63;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
}

.template-shortcut svg {
  width: 13px;
  height: 13px;
}

.template-shortcut:hover {
  border-color: #d4d4cc;
  background: #fafaf8;
  color: #1d1d1b;
}

@media (max-width: 720px) {
  .template-shortcut span {
    display: none;
  }
  .template-shortcut {
    padding: 5px;
    border-radius: 8px;
  }
}

@media (max-width: 640px) {
  .mode-badge {
    display: none;
  }
}

.new-chat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #85857d;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.new-chat-icon svg {
  width: 16px;
  height: 16px;
}

.new-chat-icon:hover {
  border-color: #e7e7e1;
  background: #fafaf8;
  color: #1d1d1b;
}

.expired-banner {
  padding: 9px 20px;
  border-bottom: 1px solid #f0dede;
  background: #fdf6f6;
  color: #a04444;
  font-size: 12.5px;
  text-align: center;
}

.engine-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 20px;
  border-bottom: 1px solid #f0ead9;
  background: #fdfbf3;
  color: #8a7a45;
  font-size: 12px;
  text-align: center;
}

.engine-warning button {
  padding: 2px 7px;
  border: 1px solid #ebe2c8;
  border-radius: 6px;
  background: #ffffff;
  color: #7d6d36;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.engine-warning button:hover {
  border-color: #dcd0ae;
  background: #fffdf6;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #deded7 transparent;
}

.chat-scroll::-webkit-scrollbar {
  width: 8px;
}

.chat-scroll::-webkit-scrollbar-thumb {
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: #deded7;
  background-clip: padding-box;
}

.welcome {
  display: flex;
  align-items: center;
  flex-direction: column;
  width: min(760px, 100%);
  margin: 0 auto;
  padding: clamp(48px, 12vh, 120px) 24px 40px;
  text-align: center;
}

.welcome-mark {
  margin-bottom: 20px;
  filter: drop-shadow(0 8px 20px rgba(17, 17, 16, 0.09));
}

.welcome h2 {
  margin: 0;
  color: #171715;
  font-family: var(--font-family-display);
  font-size: clamp(26px, 3.4vw, 34px);
  font-weight: 650;
  letter-spacing: -0.04em;
}

.welcome-copy {
  max-width: 480px;
  margin: 11px 0 30px;
  color: #83837b;
  font-size: 13.5px;
  line-height: 1.75;
}

.suggestion-grid {
  display: grid;
  width: 100%;
  max-width: 660px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.suggestion-card {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 14px 14px;
  border: 1px solid #e9e9e3;
  border-radius: 13px;
  background: #fdfdfb;
  color: #1d1d1b;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}

.suggestion-card:hover {
  border-color: #d6d6ce;
  background: #ffffff;
  box-shadow: 0 6px 22px rgba(17, 17, 16, 0.05);
  transform: translateY(-1px);
}

.suggestion-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 1px solid #ebebe5;
  border-radius: 8px;
  background: #f5f5f1;
  color: #6f6f67;
}

.suggestion-icon svg {
  width: 15px;
  height: 15px;
}

.suggestion-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.suggestion-title {
  color: #242421;
  font-size: 12.8px;
  font-weight: 600;
}

.suggestion-desc {
  color: #92928a;
  font-size: 11.5px;
  line-height: 1.5;
}

.suggestion-arrow {
  margin-left: auto;
  color: #bcbcb4;
  font-size: 12px;
  transition: color 150ms ease, transform 150ms ease;
}

.suggestion-card:hover .suggestion-arrow {
  color: #55554e;
  transform: translate(1px, -1px);
}

.welcome-note {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 28px;
  color: #a4a49c;
  font-size: 11px;
}

.note-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #58a274;
}

.message-list {
  display: flex;
  width: min(780px, 100%);
  min-height: 100%;
  margin: 0 auto;
  flex-direction: column;
  gap: 30px;
  padding: 38px 26px 40px;
}

.composer-area {
  flex: none;
  padding: 10px 24px 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, #ffffff 24%);
}

.composer-inner {
  width: min(780px, 100%);
  margin: 0 auto;
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 900px) {
  .sidebar-slot {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    transform: translateX(-102%);
    transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar-slot.is-open {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(17, 17, 16, 0.22);
    backdrop-filter: blur(2px);
  }

  .menu-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: none;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: #7d7d75;
    cursor: pointer;
  }

  .menu-button svg {
    width: 17px;
    height: 17px;
  }

  .menu-button:hover {
    background: #f6f6f2;
  }

  .heading-sub,
  .heading-sep {
    display: none;
  }

  .chat-header {
    padding: 0 14px;
  }

  .message-list {
    padding: 26px 66px 32px 16px;
    gap: 24px;
  }

  .welcome {
    padding-right: 66px;
    padding-left: 20px;
  }

  .composer-area {
    padding: 8px 14px 14px;
  }
}

@media (max-width: 560px) {
  .suggestion-grid {
    grid-template-columns: 1fr;
  }

  .welcome {
    padding-top: 44px;
  }
}

/* ── 创作对话：保持纯白，只增加克制的模式提示 ── */
.chat-page.is-create {
  --create-accent: #b4472f;
  --create-serif: 'Songti SC', 'STSong', 'Noto Serif SC', Georgia, 'Times New Roman', serif;
  background: #ffffff;
}

/* 顶栏徽标：墨色胶囊 + 一点陶土色，提醒当前处于创作模式 */
.is-create .mode-badge.is-create {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-color: #141412;
  background: #141412;
  color: #fafaf7;
  letter-spacing: 0.01em;
}

.badge-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: #e08a63;
}

.is-create .project-shortcut {
  border-color: #e2ddd2;
  background: #ffffff;
  color: #5f5f57;
}

.is-create .project-shortcut:hover {
  border-color: #cfc7b8;
  color: #1d1d1b;
}

/* 欢迎页：衬线标题 + 编号卡片，是模式提示而不是换底色 */
.welcome-eyebrow {
  margin: 0 0 9px;
  color: var(--create-accent);
  font-family: var(--font-family-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.is-create .welcome h2 {
  color: #171715;
  font-family: var(--create-serif);
  font-size: clamp(29px, 3.6vw, 39px);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.28;
}

.is-create .welcome-copy {
  margin-bottom: 20px;
  color: #83837b;
}

.create-flow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 26px;
  padding: 6px 13px;
  border: 1px solid #ece7dc;
  border-radius: 999px;
  background: #ffffff;
  color: #918876;
  font-size: 10.5px;
  letter-spacing: 0.01em;
}

.flow-step {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

.flow-step b {
  color: var(--create-accent);
  font-family: var(--create-serif);
  font-size: 9.5px;
  font-weight: 600;
}

.flow-sep {
  width: 1px;
  height: 9px;
  background: #e2dcd0;
}

.is-create .suggestion-icon {
  align-items: flex-start;
  justify-content: flex-start;
  width: 28px;
  height: 28px;
  padding-top: 1px;
  border: 0;
  background: transparent;
  color: var(--create-accent);
}

.suggestion-index {
  color: var(--create-accent);
  font-family: var(--create-serif);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.is-create .suggestion-title {
  color: #242421;
}

.is-create .note-dot {
  background: var(--create-accent);
}

.is-create .welcome-note {
  color: #a4a49c;
}

/* 输入框上方的模式提示：不碰导航，只在创作模式下出现 */
.composer-mode-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 7px 3px;
  color: #9c9385;
  font-size: 10.5px;
  letter-spacing: 0.01em;
}

.composer-mode-note .note-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--create-accent);
}

/* 从模板库回来时的一句确认，替代模式提示，说明模板已经挂上了 */
.composer-templates-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 7px 3px;
  color: #9c4a30;
  font-size: 10.5px;
  font-weight: 550;
  letter-spacing: 0.01em;
}

.composer-templates-note .note-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: #b4553a;
}

@media (max-width: 640px) {
  .is-create .welcome h2 {
    font-size: 27px;
  }

  .create-flow {
    gap: 8px;
    padding: 6px 10px;
    font-size: 10px;
  }

  .composer-mode-note {
    font-size: 10px;
  }

  .composer-templates-note {
    font-size: 10px;
  }
}
</style>
