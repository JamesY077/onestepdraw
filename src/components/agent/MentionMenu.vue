<template>
  <div
    v-if="open"
    ref="menuRef"
    class="mention-menu"
    role="listbox"
    :aria-label="ariaLabel"
    :style="position"
  >
    <template v-for="group in groups" :key="group.key">
      <p v-if="group.items.length" class="mention-group-label">{{ group.label }}</p>
      <button
        v-for="item in group.items"
        :key="item.key"
        type="button"
        class="mention-option"
        :class="{ active: item.key === activeKey }"
        role="option"
        :aria-selected="item.key === activeKey"
        @mousedown.prevent="pick(item)"
        @mouseenter="$emit('hover', item.key)"
      >
        <span class="mention-thumb" :class="`is-${item.kind}`">
          <img v-if="item.thumb" :src="item.thumb" alt="" />
          <span v-else class="mention-glyph" aria-hidden="true">{{ item.glyph }}</span>
        </span>
        <span class="mention-copy">
          <strong>{{ item.label }}</strong>
          <small v-if="item.hint">{{ item.hint }}</small>
        </span>
        <span class="mention-tag">{{ item.tag }}</span>
      </button>
    </template>

    <p v-if="!hasItems" class="mention-empty">{{ emptyHint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

export interface MentionItem {
  key: string
  kind: 'template' | 'attachment' | 'clip' | 'skill'
  label: string
  hint?: string
  thumb?: string
  glyph?: string
  tag: string
  /** 插入到输入框的引用文本，例如 @模板1。 */
  token: string
}

export interface MentionGroup {
  key: string
  label: string
  items: MentionItem[]
}

const props = withDefaults(
  defineProps<{
    open: boolean
    groups: MentionGroup[]
    activeKey?: string
    position?: Record<string, string>
    emptyHint?: string
    ariaLabel?: string
  }>(),
  {
    activeKey: '',
    position: undefined,
    emptyHint: '没有可引用的内容：先在下方上传素材，或去模板库选一个模板。',
    ariaLabel: '选择要引用的内容',
  },
)

const emit = defineEmits<{
  (event: 'pick', item: MentionItem): void
  (event: 'hover', key: string): void
  (event: 'update:activeKey', key: string): void
}>()

const menuRef = ref<HTMLElement | null>(null)

const hasItems = computed(() => props.groups.some((group) => group.items.length > 0))

function pick(item: MentionItem) {
  emit('pick', item)
}

// 选中项滚动到可视区域，键盘上下选择时不会跑出面板。
watch(
  () => props.activeKey,
  async (key) => {
    if (!props.open || !key) return
    await nextTick()
    menuRef.value?.querySelector('.mention-option.active')?.scrollIntoView({ block: 'nearest' })
  },
)

defineExpose({ hasItems })
</script>

<style scoped>
.mention-menu {
  z-index: 60;
  width: min(380px, calc(100vw - 32px));
  max-height: 320px;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--sf-line);
  border-radius: 14px;
  background: var(--sf-surface);
  box-shadow: var(--sf-shadow-md);
}

.mention-group-label {
  margin: 6px 8px 4px;
  color: var(--sf-ink-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mention-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--sf-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mention-option.active,
.mention-option:hover {
  background: var(--sf-terra-wash);
}

.mention-thumb {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--sf-line-soft);
  border-radius: 8px;
  background: var(--sf-surface-2);
  color: var(--sf-ink-2);
  font-size: 13px;
}

.mention-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-thumb.is-template {
  border-color: var(--sf-terra-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra);
}

.mention-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.mention-copy strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-copy small {
  overflow: hidden;
  color: var(--sf-ink-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-tag {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--sf-surface-3);
  color: var(--sf-ink-3);
  font-size: 10.5px;
  font-weight: 600;
}

.mention-empty {
  margin: 10px;
  color: var(--sf-ink-3);
  font-size: 12px;
  line-height: 1.6;
}
</style>
