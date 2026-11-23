<template>
  <nav class="studio-island" :class="`tone-${tone}`" aria-label="创作分区快速切换">
    <button
      class="island-item island-home"
      type="button"
      aria-label="对话"
      @click="go({ path: '/chat' })"
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
      :style="{ '--item-accent': item.accent, '--item-accent-soft': item.accentSoft }"
      type="button"
      :aria-label="item.label"
      :aria-current="item.path === activePath ? 'page' : undefined"
      @click="go(item)"
    >
      <span class="island-icon" aria-hidden="true">
        <svg v-if="item.key === 'skill'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
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
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

withDefaults(defineProps<{ tone?: 'dark' | 'light' }>(), { tone: 'dark' })

const router = useRouter()
const route = useRoute()

const items = [
  {
    path: '/skill',
    key: 'skill',
    label: 'Skill 创作',
    accent: '#a78bfa',
    accentSoft: 'rgba(167, 139, 250, 0.22)',
  },
  {
    path: '/image',
    key: 'image',
    label: '图片生成',
    accent: '#d9cdb8',
    accentSoft: 'rgba(217, 205, 184, 0.20)',
  },
  {
    path: '/video',
    key: 'video',
    label: '视频生成',
    accent: '#8fb6ff',
    accentSoft: 'rgba(143, 182, 255, 0.20)',
  },
  {
    path: '/voice',
    key: 'voice',
    label: '配音创作',
    accent: '#fb923c',
    accentSoft: 'rgba(251, 146, 60, 0.22)',
  },
  {
    path: '/model3d',
    key: 'model3d',
    label: '3D 建模',
    accent: '#38bdf8',
    accentSoft: 'rgba(56, 189, 248, 0.22)',
  },
]

const activePath = computed(() => items.find((item) => route.path.startsWith(item.path))?.path || '')

function go(item: { path: string }) {
  if (route.path !== item.path) router.push(item.path)
}
</script>

<style scoped>
/*
 * 悬浮岛：宽度固定，只显示图标。
 * 悬停单个图标时在右侧弹出该分区的文字气泡，容器本身不做尺寸动画，
 * 避免展开时遮挡页面内容、也不会出现圆角裁切。
 */
.studio-island {
  position: fixed;
  left: 14px;
  top: 50%;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 58px;
  padding: 10px 8px;
  transform: translateY(-50%);
  /* 不能裁剪：气泡要溢出到胶囊右侧 */
  overflow: visible;
  border-radius: 28px;
}

/* 深色页面上的胶囊 */
.studio-island.tone-dark {
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(10, 12, 20, 0.74);
  box-shadow:
    0 26px 64px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(22px) saturate(150%);
}

/* 浅色页面（Skill 创作）上的胶囊 */
.studio-island.tone-light {
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(255, 255, 255, 0.82);
  box-shadow:
    0 22px 54px rgba(15, 23, 42, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(22px) saturate(150%);
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
  cursor: pointer;
  transition: background 180ms ease;
}

.tone-dark .island-item {
  color: rgba(226, 232, 246, 0.66);
}

.tone-light .island-item {
  color: rgba(51, 65, 85, 0.76);
}

.tone-dark .island-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.96);
}

.tone-light .island-item:hover {
  background: rgba(15, 23, 42, 0.06);
  color: rgba(15, 23, 42, 0.94);
}

/* 尚未开放的分区：保留图标但整体变灰，不可点击 */
.island-item.is-disabled {
  cursor: not-allowed;
}

.tone-dark .island-item.is-disabled,
.tone-dark .island-item.is-disabled:hover {
  background: transparent;
  color: rgba(226, 232, 246, 0.2);
}

.tone-light .island-item.is-disabled,
.tone-light .island-item.is-disabled:hover {
  background: transparent;
  color: rgba(51, 65, 85, 0.24);
}

.island-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transition:
    background 180ms ease,
    color 180ms ease,
    box-shadow 220ms ease;
}

.island-icon svg {
  width: 18px;
  height: 18px;
}

/* 当前所在分区 */
.island-item.active .island-icon {
  background: var(--item-accent-soft);
  color: var(--item-accent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--item-accent) 44%, transparent),
    0 0 22px -6px var(--item-accent);
}

.tone-dark .island-item.active {
  color: #fff;
}

.tone-light .island-item.active {
  color: rgba(15, 23, 42, 0.96);
}

.island-divider {
  width: 22px;
  height: 1px;
  margin: 5px 0;
}

.tone-dark .island-divider {
  background: rgba(255, 255, 255, 0.13);
}

.tone-light .island-divider {
  background: rgba(15, 23, 42, 0.13);
}

/* 悬停时在右侧弹出的单项气泡 */
.island-tip {
  position: absolute;
  left: calc(100% + 14px);
  top: 50%;
  z-index: 1;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(-6px, -50%);
  transition:
    opacity 150ms ease,
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.tone-dark .island-tip {
  color: #fff;
  background: rgba(16, 18, 28, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
}

.tone-light .island-tip {
  color: rgba(15, 23, 42, 0.96);
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(15, 23, 42, 0.10);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
}

/* 气泡左侧的小尖角 */
.island-tip::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 1px;
  transform: translateY(-50%) rotate(45deg);
}

.tone-dark .island-tip::before {
  background: rgba(16, 18, 28, 0.94);
  border-left: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.tone-light .island-tip::before {
  background: rgba(255, 255, 255, 0.96);
  border-left: 1px solid rgba(15, 23, 42, 0.10);
  border-bottom: 1px solid rgba(15, 23, 42, 0.10);
}

.island-item:hover .island-tip,
.island-item:focus-visible .island-tip {
  opacity: 1;
  transform: translate(0, -50%);
}

@media (hover: none), (max-width: 900px) {
  .studio-island {
    left: 6px;
    width: 52px;
    padding: 8px 6px;
  }

  .island-item {
    width: 40px;
    height: 40px;
  }

  /* 触屏没有 hover，气泡常驻反而是噪音，直接隐藏 */
  .island-tip {
    display: none;
  }
}
</style>
