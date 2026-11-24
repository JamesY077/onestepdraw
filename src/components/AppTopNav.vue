<template>
  <header class="app-top-nav">
    <GlassSurface
      class="app-top-nav__glass"
      width="100%"
      height="52px"
      :border-radius="26"
      :blur="14"
      :opacity="0.9"
      :brightness="52"
      :saturation="1.15"
      :background-opacity="0.55"
      :refraction="false"
    >
      <nav class="app-top-nav__inner" aria-label="创作分区切换">
        <button
          v-for="item in items"
          :key="item.path"
          type="button"
          class="nav-tab"
          :class="{ active: isActive(item) }"
          :style="{ '--tab-accent': item.color }"
          :aria-current="isActive(item) ? 'page' : undefined"
          @click="go(item)"
        >
          <span class="nav-tab__icon" aria-hidden="true" v-html="item.icon" />
          <span class="nav-tab__label">{{ item.label }}</span>
        </button>
      </nav>
    </GlassSurface>
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import GlassSurface from '@/components/bits/GlassSurface.vue'

const router = useRouter()
const route = useRoute()

interface NavItem {
  path: string
  label: string
  color: string
  icon: string
}

/** 图标用 24 网格的内联 SVG，跟随按钮当前色。 */
const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const items: NavItem[] = [
  {
    path: '/chat',
    label: '对话',
    color: '#241f19',
    icon: svg('<path d="M4.5 5.8h15v10.4h-8.1L7 20.2v-4H4.5z" />'),
  },
  {
    path: '/edit',
    label: '剪辑',
    color: '#b4553a',
    icon: svg('<rect x="3.4" y="5" width="17.2" height="14" rx="2.6" /><path d="M3.6 9.4h16.8M8.2 5.2v4.2M14.4 5.2v4.2" />'),
  },
  {
    path: '/skill',
    label: 'Skill',
    color: '#8a6a2f',
    icon: svg('<path d="M12 3.6l1.9 4.4 4.7.5-3.5 3.2.9 4.7-4-2.4-4 2.4.9-4.7L5.4 8.5l4.7-.5z" />'),
  },
  {
    path: '/image',
    label: '图片',
    color: '#5c6247',
    icon: svg('<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.8" /><path d="M3.8 15.6 8.6 11l3.4 3 2.8-2.4 5.4 4.1" /><circle cx="8.6" cy="8.6" r="1.5" />'),
  },
  {
    path: '/video',
    label: '视频',
    color: '#7a4a6b',
    icon: svg('<rect x="3.2" y="5.4" width="13" height="13.2" rx="2.6" /><path d="M16.4 10.4 21 7.6v8.8l-4.6-2.8z" />'),
  },
  {
    path: '/voice',
    label: '配音',
    color: '#3f6b5a',
    icon: svg('<rect x="9" y="3.2" width="6" height="11" rx="3" /><path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3" />'),
  },
  {
    path: '/model3d',
    label: '3D',
    color: '#4a5670',
    icon: svg('<path d="M12 3.6 20 8v8l-8 4.4L4 16V8z" /><path d="M4 8l8 4.4L20 8M12 12.4v8" />'),
  },
  {
    path: '/templates',
    label: '模板库',
    color: '#a05a2c',
    icon: svg('<rect x="3.4" y="4.4" width="7.2" height="7.2" rx="2" /><rect x="13.4" y="4.4" width="7.2" height="7.2" rx="2" /><rect x="3.4" y="14.4" width="7.2" height="5.2" rx="2" /><rect x="13.4" y="14.4" width="7.2" height="5.2" rx="2" />'),
  },
  {
    path: '/settings',
    label: '设置',
    color: '#6b6154',
    icon: svg('<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11A1.7 1.7 0 0 0 15.1 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.11a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49.86z" />'),
  },
]

function isActive(item: NavItem): boolean {
  if (item.path === '/chat') return route.path.startsWith('/chat')
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}

function go(item: NavItem) {
  if (isActive(item)) return
  void router.push(item.path)
}
</script>

<style scoped>
/*
 * 统一顶部导航：每个页面最上方的一条玻璃导航。
 * 参与页面文档流（不浮动），页面因此不需要额外的顶部占位。
 */
.app-top-nav {
  position: relative;
  z-index: 30;
  display: flex;
  width: 100%;
  flex: none;
  justify-content: center;
  padding: 10px clamp(12px, 2.4vw, 26px) 6px;
}

.app-top-nav__glass {
  width: 100%;
  max-width: 980px;
}

.app-top-nav__inner {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0 8px;
}

.nav-tab {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--sf-ink-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--sf-dur-2) var(--sf-ease-out),
    background var(--sf-dur-2) var(--sf-ease-out),
    transform var(--sf-dur-2) var(--sf-ease-out);
}

.nav-tab__icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  flex: none;
  opacity: 0.72;
  transition: opacity var(--sf-dur-2) var(--sf-ease-out);
}

.nav-tab__icon :deep(svg) {
  width: 15px;
  height: 15px;
}

.nav-tab:hover {
  background: rgba(36, 31, 25, 0.05);
  color: var(--sf-ink);
}

/* 当前分区：用该分区自己的颜色做底色与文字，便于一眼定位 */
.nav-tab.active {
  background: color-mix(in srgb, var(--tab-accent) 12%, transparent);
  color: var(--tab-accent);
  font-weight: 700;
}

.nav-tab.active .nav-tab__icon {
  opacity: 1;
}

.nav-tab.active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 1px;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: var(--tab-accent);
  transform: translateX(-50%);
}

.nav-tab:focus-visible {
  outline: 2px solid var(--sf-terra);
  outline-offset: 1px;
}

@media (max-width: 1080px) {
  .nav-tab {
    padding: 7px 9px;
    font-size: 12px;
  }
}

@media (max-width: 900px) {
  .app-top-nav__inner {
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .app-top-nav__inner::-webkit-scrollbar {
    display: none;
  }
}
</style>
