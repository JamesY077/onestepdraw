<template>
  <header class="studio-header" :style="{ '--studio-accent': accent }">
    <div class="studio-header-main">
      <button class="studio-brand" type="button" aria-label="返回步帧对话" @click="router.push('/chat')">
        <BrandMark :size="26" />
        <span class="studio-brand-name">步帧</span>
      </button>

      <div class="studio-heading">
        <span class="studio-kicker">{{ kicker }}</span>
        <h1 class="studio-heading-title">{{ title }}</h1>
        <p v-if="subtitle" class="studio-heading-sub">{{ subtitle }}</p>
      </div>

      <div class="studio-header-actions">
        <slot name="actions" />
        <button class="studio-action" type="button" @click="router.push('/settings')">设置</button>
      </div>
    </div>

    <p class="studio-save-notice" role="note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2" />
        <path d="M12 8.2v.02M12 11.2v5" />
      </svg>
      温馨提示：生成结果仅保留在当前页面，请及时下载或另存；刷新、关闭页面后可能无法恢复。
    </p>
  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import BrandMark from '@/components/agent/BrandMark.vue'

withDefaults(
  defineProps<{
    kicker: string
    title: string
    subtitle?: string
    accent?: string
  }>(),
  { accent: '#111111', subtitle: '' },
)

const router = useRouter()
</script>

<style scoped>
.studio-header {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 10px;
  padding: 18px 28px 12px;
}

.studio-header-main {
  display: flex;
  align-items: center;
  gap: 20px;
}

/* 顶部居中的保存提醒：所有创作页共用，语言保持克制不抢主操作 */
.studio-save-notice {
  display: inline-flex;
  align-self: center;
  align-items: center;
  gap: 6px;
  max-width: min(100%, 720px);
  padding: 4px 14px;
  border: 1px solid #ecece7;
  border-radius: 999px;
  background: #fafaf8;
  color: #9a9a92;
  font-size: 11px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  text-align: center;
}

.studio-save-notice svg {
  flex: none;
  width: 12px;
  height: 12px;
  opacity: 0.75;
}

.studio-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 5px 12px 5px 5px;
  border: 1px solid #e8e8e2;
  border-radius: 999px;
  background: #ffffff;
  color: #1d1d1b;
  font: inherit;
  cursor: pointer;
  transition:
    background var(--transition-base),
    border-color var(--transition-base);
}

.studio-brand:hover {
  background: #fafaf8;
  border-color: #d2d2ca;
}

.studio-brand-logo {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}

.studio-brand-name {
  font-family: var(--font-family-display);
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.studio-heading {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.studio-heading-title {
  font-family: var(--font-family-display);
  font-size: clamp(18px, 1.5vw, 22px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #111110;
}

.studio-heading-sub {
  margin-top: 2px;
  font-size: 12.5px;
  color: #9a9a92;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.studio-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.studio-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 15px;
  border: 1px solid #e8e8e2;
  border-radius: 999px;
  background: #ffffff;
  color: #4a4a44;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base);
}

.studio-action:hover {
  background: #f5f5f1;
  border-color: #d2d2ca;
  color: #111110;
}

@media (max-width: 1080px) {
  .studio-heading-sub {
    display: none;
  }
}

@media (max-width: 860px) {
  .studio-header {
    padding: 14px 16px 10px;
    gap: 8px;
  }

  .studio-header-main {
    flex-wrap: wrap;
    gap: 10px 12px;
  }

  /* 标题给出基准宽度，操作区放不下时自动换到下一行，不再被模型名挤成竖排 */
  .studio-heading {
    flex: 1 1 200px;
  }

  .studio-save-notice {
    width: 100%;
    padding: 6px 10px;
    border-radius: 12px;
    font-size: 10.5px;
  }

  .studio-brand-name {
    display: none;
  }

  .studio-brand {
    padding: 4px;
  }

  .studio-action {
    min-height: 32px;
    padding: 0 11px;
    font-size: 12px;
  }
}
</style>
