<template>
  <div class="mention-input" :class="{ 'is-placeholder': isEmpty && !focused }">
    <div class="mi-stack">
      <!-- 显示层：垫在输入框下面，负责颜色与 @引用高亮 -->
      <div ref="mirrorRef" class="mi-mirror" aria-hidden="true">
        <template v-if="isEmpty && placeholder">
          <span class="mi-placeholder">{{ placeholder }}</span>
        </template>
        <template v-else>
          <span
            v-for="(segment, index) in segments"
            :key="index"
            :class="segment.mention ? 'mi-mention' : ''"
          >{{ segment.text }}</span>
          <span class="mi-caret">&nbsp;</span>
        </template>
      </div>

      <!-- 真正的输入层：在文档流里决定高度，文字透明只留光标 -->
      <textarea
        ref="textareaRef"
        v-model="model"
        class="mi-input"
        rows="1"
        spellcheck="false"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="$emit('keydown', $event)"
        @input="handleInput"
        @scroll="handleScroll"
        @paste="$emit('paste', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { splitMentionSegments } from '@/composables/useMentionRefs'

const props = withDefaults(
  defineProps<{
    placeholder?: string
    /** 可高亮的引用标记，例如 @模板1、@素材1 */
    tokens?: string[]
    /** 超过多少行后不再长高，改为内部滚动 */
    maxRows?: number
  }>(),
  { placeholder: '', tokens: () => [], maxRows: 8 },
)

const emit = defineEmits<{
  (event: 'keydown', payload: KeyboardEvent): void
  (event: 'paste', payload: ClipboardEvent): void
  (event: 'input'): void
}>()

const model = defineModel<string>({ default: '' })
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const mirrorRef = ref<HTMLElement | null>(null)
const focused = ref(false)

const isEmpty = computed(() => !model.value)
const segments = computed(() => splitMentionSegments(model.value, props.tokens))

/**
 * 输入框随内容长高，到 maxRows 行封顶后改为内部滚动。
 * 高亮层绝对定位铺在输入框背后，两者共用同一盒模型，因此永远对齐。
 */
function resize() {
  const el = textareaRef.value
  if (!el) return
  const style = getComputedStyle(el)
  const lineHeight = Number.parseFloat(style.lineHeight) || 22
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  const max = lineHeight * props.maxRows + padding

  el.style.height = 'auto'
  const next = Math.min(el.scrollHeight, max)
  el.style.height = `${next}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

function handleInput() {
  resize()
  emit('input')
}

/** 输入框滚动时让高亮层跟随，避免长文本时两层错位。 */
function handleScroll() {
  if (!mirrorRef.value || !textareaRef.value) return
  mirrorRef.value.scrollTop = textareaRef.value.scrollTop
}

watch(model, () => nextTick(resize))
watch(
  () => props.maxRows,
  () => nextTick(resize),
)
onMounted(resize)

function focus() {
  textareaRef.value?.focus()
}

function getTextarea(): HTMLTextAreaElement | null {
  return textareaRef.value
}

/** 把光标放到指定位置，供 @ 插入后使用。 */
function setCaret(position: number) {
  const el = textareaRef.value
  if (!el) return
  el.focus()
  el.setSelectionRange(position, position)
}

defineExpose({ focus, resize, getTextarea, setCaret })
</script>

<style scoped>
.mention-input {
  display: block;
  width: 100%;
  min-width: 0;
}

/* 输入框与高亮层共用这一个盒子 */
.mi-stack {
  position: relative;
  width: 100%;
  min-width: 0;
}

.mi-mirror,
.mi-input {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  font: inherit;
  font-size: inherit;
  line-height: 1.65;
  letter-spacing: inherit;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* 高亮层：垫在输入框下方，只负责显示 */
.mi-mirror {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 固定用墨色，避免被外层深色主题的 --sf-ink 改写成白字 */
  color: var(--sf-ink, #241f19);
  -webkit-text-fill-color: currentColor;
  pointer-events: none;
}

.mi-placeholder {
  color: var(--sf-ink-3);
}

/* @引用与普通文字区分：强调色 + 底色 */
.mi-mention {
  display: inline-block;
  margin: 0 1px;
  padding: 0 4px;
  border-radius: 5px;
  background: var(--sf-terra-wash);
  color: var(--sf-terra);
  font-weight: 600;
}

.mi-caret {
  color: transparent;
}

/*
 * 输入层在文档流里，负责决定高度；
 * 文字完全透明，只保留可见光标，避免与高亮层重影。
 */
.mi-input {
  position: relative;
  z-index: 1;
  min-height: 1.65em;
  resize: none;
  outline: none;
  background: transparent;
  /* 输入层只留光标：文字完全透明，显示交给下面的高亮层 */
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none;
  caret-color: var(--sf-ink);
}

.mi-input::selection {
  background: rgba(180, 85, 58, 0.2);
}
</style>
