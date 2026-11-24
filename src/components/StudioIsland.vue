<template>
  <nav class="studio-island" :class="[`tone-${tone}`, { 'is-expanded': expanded }]" aria-label="创作分区快速切换">
    <button
      class="island-toggle"
      type="button"
      :aria-label="expanded ? '收起创作导航' : '打开创作导航'"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="4" width="6.2" height="6.2" rx="1.8" />
        <rect x="13.8" y="4" width="6.2" height="6.2" rx="1.8" />
        <rect x="4" y="13.8" width="6.2" height="6.2" rx="1.8" />
        <rect x="13.8" y="13.8" width="6.2" height="6.2" rx="1.8" />
      </svg>
    </button>

    <Transition name="island-menu">
      <div v-show="desktop || expanded" class="island-shell">
       <div class="island-list">
    <button
      class="island-item island-home"
      type="button"
      aria-label="对话"
      @click="expanded = false; go({ path: '/chat' })"
    >
      <span class="island-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M4.5 5.8h15v10.4h-8.1L7 20.2v-4H4.5z" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="island-tip" aria-hidden="true">对话</span>
    </button>

    <span class="island-divider" aria-hidden="true" />

    <button
      v-for="item in items"
      :key="item.path"
      class="island-item"
      :class="{ active: item.path === activePath }"
      type="button"
      :aria-label="item.label"
      :aria-current="item.path === activePath ? 'page' : undefined"
      @click="expanded = false; go(item)"
    >
      <span class="island-icon" aria-hidden="true">
        <svg v-if="item.key === 'project'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <rect x="3.2" y="5" width="17.6" height="14" rx="3" />
          <path d="M3.6 9.2h16.8M8 5.2v4M14.2 5.2v4" />
          <path d="M9.6 13.2h4.8M9.6 16h3" opacity="0.6" />
        </svg>
        <svg v-else-if="item.key === 'skill'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <path d="M12 3.2 13.9 9l5.8 1.9-5.8 1.9L12 18.6l-1.9-5.8L4.3 10.9 10.1 9z" />
          <path d="M18.6 16.4v3M17.1 17.9h3" />
        </svg>
        <svg v-else-if="item.key === 'image'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <rect x="3.2" y="4.8" width="17.6" height="14.4" rx="3.4" />
          <circle cx="8.4" cy="9.6" r="1.5" />
          <path d="M3.6 17.1l4.9-4.6 3.6 3.2 2.9-2.5 5.4 4.2" />
        </svg>
        <svg v-else-if="item.key === 'video'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <rect x="3.2" y="4.8" width="17.6" height="14.4" rx="3.4" />
          <path d="M10.4 9.6 15 12l-4.6 2.4z" fill="currentColor" stroke="none" />
        </svg>
        <svg v-else-if="item.key === 'model3d'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <path d="M12 2.9 20.1 7v10L12 21.1 3.9 17V7z" />
          <path d="M3.9 7 12 11.2 20.1 7M12 11.2v9.9" opacity="0.6" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <rect x="9" y="3.2" width="6" height="11" rx="3" />
          <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0" />
          <path d="M12 17.8v3" />
        </svg>
      </span>
      <span class="island-tip" aria-hidden="true">{{ item.label }}</span>
    </button>

    <span class="island-divider" aria-hidden="true" />

    <button
      class="island-item"
      :class="{ active: route.path.startsWith('/templates') }"
      type="button"
      aria-label="模板库"
      :aria-current="route.path.startsWith('/templates') ? 'page' : undefined"
      @click="expanded = false; go({ path: '/templates' })"
    >
      <span class="island-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
          <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="3" />
          <path d="M3.6 9h16.8M8.6 4.4v15.2" />
          <path d="M12.4 12.2h4.8M12.4 15.4h3.2" opacity="0.6" />
        </svg>
      </span>
      <span class="island-tip" aria-hidden="true">模板库</span>
    </button>

    <span class="island-divider" aria-hidden="true" />

    <button
      class="island-item"
      :class="{ active: route.path.startsWith('/settings') }"
      type="button"
      aria-label="设置"
      :aria-current="route.path.startsWith('/settings') ? 'page' : undefined"
      @click="expanded = false; go({ path: '/settings' })"
    >
      <span class="island-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15.1 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.11a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49.86z" />
        </svg>
      </span>
      <span class="island-tip" aria-hidden="true">设置</span>
    </button>
       </div>
      </div>
    </Transition>
  </nav>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

withDefaults(defineProps<{ tone?: 'dark' | 'light' }>(), { tone: 'light' })

const router = useRouter()
const route = useRoute()
const expanded = ref(false)
const desktop = ref(false)
let media: MediaQueryList | null = null

function handleDesktopChange(event: MediaQueryListEvent | MediaQueryList) {
  desktop.value = event.matches
  if (desktop.value) expanded.value = false
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') expanded.value = false
}

onMounted(() => {
  media = window.matchMedia('(min-width: 901px) and (hover: hover)')
  handleDesktopChange(media)
  media.addEventListener('change', handleDesktopChange)
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', handleDesktopChange)
  document.removeEventListener('keydown', handleEscape)
})

const items = [
  { path: '/edit', key: 'project', label: '剪辑项目' },
  { path: '/skill', key: 'skill', label: 'Skill 创作' },
  { path: '/image', key: 'image', label: '图片生成' },
  { path: '/video', key: 'video', label: '视频生成' },
  { path: '/voice', key: 'voice', label: '配音创作' },
  { path: '/model3d', key: 'model3d', label: '3D 建模' },
]

/** 侧栏「剪辑项目」固定进项目列表，由用户自己挑项目。 */
const projectPath = computed(() => '/edit')

const activePath = computed(() => items.find((item) => route.path.startsWith(item.path))?.path || '')

function go(item: { path: string; key?: string }) {
  // 已经在某个项目里时，点「剪辑项目」保持当前项目，不被最近项目顶掉。
  const target = item.key === 'project' ? projectPath.value : item.path
  if (route.path !== target) router.push(target)
}
</script>

<style scoped>
/*
 * 创作导航：作为页面布局里的独立侧栏排在内容右侧。
 * 不再用 fixed 覆盖在页面之上，页面内容区因此不会被硬切出一条空白通道。
 * 悬停单个图标时在左侧弹出该分区的文字气泡。
 */
.studio-island {
  position: relative;
  z-index: 90;
  display: flex;
  flex: none;
  align-self: stretch;
  flex-direction: column;
  align-items: center;
  /* 胶囊固定在容器内垂直居中，并留出与内容区的呼吸边距 */
  justify-content: center;
  gap: 4px;
  width: 76px;
  padding: 16px 8px;
  /* 不能裁剪：气泡要溢出到胶囊左侧 */
  overflow: visible;
}

.island-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 58px;
  padding: 10px 8px;
  border: 1px solid var(--sf-line);
  border-radius: 28px;
  background: var(--sf-surface);
  box-shadow: 0 8px 24px rgba(36, 31, 25, 0.06);
}

.island-toggle {
  display: none;
}

.island-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.island-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--sf-ink-3);
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease;
}

.island-item:hover {
  background: var(--sf-surface-3);
  color: var(--sf-ink);
}

.island-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transition: background 180ms ease, color 180ms ease;
}

.island-icon svg {
  width: 18px;
  height: 18px;
}

/* 当前所在分区 */
.island-item.active .island-icon {
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.island-item.active {
  color: var(--sf-ink);
}

.island-divider {
  width: 22px;
  height: 1px;
  margin: 5px 0;
  background: var(--sf-line-soft);
}

/* 悬停时在左侧弹出的单项气泡 */
.island-tip {
  position: absolute;
  right: calc(100% + 14px);
  top: 50%;
  z-index: 1;
  padding: 6px 12px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  box-shadow: 0 8px 20px rgba(36, 31, 25, 0.08);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(6px, -50%);
  transition:
    opacity 150ms ease,
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.island-list-enter-active,
.island-list-leave-active {
  transition: opacity var(--sf-dur-2) var(--sf-ease-out), transform var(--sf-dur-2) var(--sf-ease-out);
  transform-origin: top right;
}

.island-list-enter-from,
.island-list-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .island-list-enter-active,
  .island-list-leave-active {
    transition: none;
  }
}

.island-item:hover .island-tip,
.island-item:focus-visible .island-tip {
  opacity: 1;
  transform: translate(0, -50%);
}

@media (hover: none), (max-width: 900px) {
  .studio-island {
    position: fixed;
    right: 10px;
    top: 50%;
    align-self: auto;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    transform: translateY(-50%);
  }

  .island-shell {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 52px;
    padding: 8px 6px;
    border-radius: 26px;
    box-shadow: 0 12px 34px rgba(36, 31, 25, 0.12);
  }

  .island-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--sf-ink-2);
    cursor: pointer;
  }

  .island-toggle svg {
    width: 18px;
    height: 18px;
  }

  .studio-island.is-expanded .island-toggle {
    background: var(--sf-ink);
    color: var(--sf-surface);
  }

  .island-list {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    width: 52px;
    padding: 8px 6px;
    border: 1px solid var(--sf-line);
    border-radius: 26px;
    background: var(--sf-surface);
    box-shadow: 0 12px 34px rgba(36, 31, 25, 0.12);
  }

  .studio-island.is-expanded .island-list {
    display: flex;
  }

  .island-item {
    width: var(--sf-control-touch);
    height: var(--sf-control-touch);
  }

  /* 触屏没有 hover，气泡常驻反而是噪音，直接隐藏 */
  .island-tip {
    display: none;
  }
}
</style>
