<template>
  <header class="studio-header" :style="{ '--studio-accent': accent }">
    <div class="studio-header-main">
      <button class="studio-brand" type="button" aria-label="返回赭墨对话" @click="router.push('/chat')">
        <BrandMark :size="26" />
        <span class="studio-brand-name">{{ BRAND_NAME_EN }}</span>
      </button>

      <div class="studio-heading">
        <ShinyLabel class="studio-kicker" :text="kicker" />
        <h1 class="studio-heading-title">{{ title }}</h1>
        <p v-if="subtitle" class="studio-heading-sub">{{ subtitle }}</p>
      </div>

      <div class="studio-header-actions">
        <slot name="actions" />
        <button class="studio-action" type="button" @click="router.push('/settings')">设置</button>
      </div>
    </div>

  </header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import BrandMark from '@/components/agent/BrandMark.vue'
import ShinyLabel from '@/components/ui/ShinyLabel.vue'
import { BRAND_NAME_EN } from '@/features/brand'

withDefaults(
  defineProps<{
    kicker: string
    title: string
    subtitle?: string
    accent?: string
  }>(),
  { accent: 'var(--sf-ink)', subtitle: '' },
)

const router = useRouter()
</script>

<style scoped>
.studio-header {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0;
  padding: 18px 28px 12px;
}

.studio-header-main {
  display: flex;
  align-items: center;
  gap: 20px;
}

.studio-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 5px 12px 5px 5px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font: inherit;
  cursor: pointer;
  transition:
    background var(--transition-base),
    border-color var(--transition-base);
}

.studio-brand:hover {
  background: var(--sf-surface-2);
  border-color: var(--sf-line-strong);
}

.studio-brand-logo {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}

.studio-brand-name {
  font-family: var(--sf-font-brand);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.012em;
  line-height: 1;
}

.studio-kicker {
  align-self: flex-start;
  color: var(--sf-terra);
  font-size: 9.5px;
  font-weight: 680;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.studio-heading {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.studio-heading-title {
  font-family: var(--sf-font-ui);
  font-size: clamp(21px, 1.9vw, 27px);
  font-weight: 690;
  letter-spacing: -0.038em;
  line-height: 1.16;
  color: var(--sf-ink);
}

.studio-heading-sub {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--sf-ink-3);
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
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: var(--sf-surface);
  color: var(--sf-ink-2);
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
  background: var(--sf-surface-3);
  border-color: var(--sf-line-strong);
  color: var(--sf-ink);
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
