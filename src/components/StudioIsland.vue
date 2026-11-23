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

withDefaults(defineProps<{ tone?: 'dark' | 'light' }>(), { tone: 'light' })

const router = useRouter()
const route = useRoute()

const items = [
  { path: '/skill', key: 'skill', label: 'Skill 创作' },
  { path: '/image', key: 'image', label: '图片生成' },
  { path: '/video', key: 'video', label: '视频生成' },
  { path: '/voice', key: 'voice', label: '配音创作' },
  { path: '/model3d', key: 'model3d', label: '3D 建模' },
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
  border: 1px solid #e8e8e2;
  border-radius: 28px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(17, 17, 16, 0.06);
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
  color: #8a8a82;
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease;
}

.island-item:hover {
  background: #f5f5f1;
  color: #111110;
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
  background: #111111;
  color: #ffffff;
}

.island-item.active {
  color: #111110;
}

.island-divider {
  width: 22px;
  height: 1px;
  margin: 5px 0;
  background: #ecece7;
}

/* 悬停时在右侧弹出的单项气泡 */
.island-tip {
  position: absolute;
  left: calc(100% + 14px);
  top: 50%;
  z-index: 1;
  padding: 6px 12px;
  border: 1px solid #e8e8e2;
  border-radius: 999px;
  background: #ffffff;
  color: #1d1d1b;
  box-shadow: 0 8px 20px rgba(17, 17, 16, 0.08);
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
