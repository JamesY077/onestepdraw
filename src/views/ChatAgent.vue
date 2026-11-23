<template>
  <div class="chat-page">
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
          <span class="heading-sub">{{ AGENT_MODEL_NAME }}</span>
        </div>

        <div class="header-actions">
          <span class="local-badge">本地</span>
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

      <div ref="scrollRef" class="chat-scroll" @scroll="handleScroll">
        <section v-if="!messages.length" class="welcome">
          <div class="welcome-mark">
            <BrandMark :size="46" />
          </div>
          <h2>今天想做什么？</h2>
          <p class="welcome-copy">
            OneStep 是你的本地 AI 创作助手。写东西、想点子、做分镜、推敲提示词，都可以从这里开始。
          </p>

          <div class="suggestion-grid">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion.title"
              type="button"
              class="suggestion-card"
              @click="applySuggestion(suggestion.prompt)"
            >
              <span class="suggestion-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
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
            已连接 AIPing · 对话只保存在这台设备
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
          />
        </section>
      </div>

      <div class="composer-area">
        <div class="composer-inner">
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AgentSidebar from '@/components/agent/AgentSidebar.vue'
import AgentComposer from '@/components/agent/AgentComposer.vue'
import AgentMessage from '@/components/agent/AgentMessage.vue'
import BrandMark from '@/components/agent/BrandMark.vue'
import { useAgentStore } from '@/stores/agentStore'
import { useApiStore } from '@/stores/apiStore'
import { AGENT_MODEL_NAME } from '@/api/agent'

const store = useAgentStore()
const apiStore = useApiStore()
const route = useRoute()
const router = useRouter()

const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof AgentComposer> | null>(null)
const draft = ref('')
const sidebarOpen = ref(false)
const stickToBottom = ref(true)

const suggestions = [
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
]

const messages = computed(() => store.activeConversation?.messages || [])
const headerTitle = computed(() => store.activeConversation?.title || '新对话')

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

function handleScroll() {
  const element = scrollRef.value
  if (!element) return
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 90
}

function syncRouteWithActive() {
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
  nextTick(() => scrollToBottom('auto'))
}

function handleDelete(id: string) {
  store.deleteConversation(id)
  syncRouteWithActive()
  nextTick(() => scrollToBottom('auto'))
}

function handleLogout() {
  if (store.isStreaming) store.stopStreaming()
  if (!window.confirm('退出登录？本机保存的对话不会被删除。')) return
  store.flush()
  apiStore.clear()
  router.replace('/login')
}

async function handleSend(content: string) {
  stickToBottom.value = true
  await store.sendMessage(content)
  syncRouteWithActive()
  await nextTick()
  scrollToBottom('smooth')
  composerRef.value?.focus()
}

async function handleRetry() {
  stickToBottom.value = true
  await store.regenerate()
  await nextTick()
  scrollToBottom('smooth')
}

function applySuggestion(prompt: string) {
  draft.value = prompt
  nextTick(() => composerRef.value?.focus())
}

watch(
  () => store.activeId,
  () => {
    syncRouteWithActive()
    nextTick(() => scrollToBottom('auto'))
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
    nextTick(() => scrollToBottom('auto'))
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
    document.title = title ? `${title} · OneStep` : 'OneStep'
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
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  if (id && store.conversations.some((conversation) => conversation.id === id)) {
    store.selectConversation(id)
  } else if (store.activeId) {
    router.replace(`/chat/${store.activeId}`)
  }
  nextTick(() => scrollToBottom('auto'))
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', flushConversations)
})

onBeforeUnmount(() => {
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
    padding: 26px 16px 32px;
    gap: 24px;
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
</style>
