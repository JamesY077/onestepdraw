<template>
  <div class="mention-input" :class="{ 'is-placeholder': isEmpty && !focused }">
    <div class="mi-stack">
      <!-- 高亮层：只负责显示，@引用用强调色标出 -->
      <div ref="mirrorRef" class="mi-mirror" aria-hidden="true">
      <template v-if="isEmpty && placeholder">
        <span class="mi-placeholder">{{ placeholder }}</span>
      </template>
      <template v-else>
        <span v-for="(segment, index) in segments" :key="index" :class="segment.mention ? 'mi-mention' : ''">{{
          segment.text
        }}</span>
        <span class="mi-caret">&nbsp;</span>
      </template>
    </div>

      <!-- 真正可编辑的输入层：文字透明，只显示光标，避免两层重影 -->
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

/** 高度跟随内容，最多 maxRows 行。 */
function resize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const style = getComputedStyle(el)
  const lineHeight = Number.parseFloat(style.lineHeight) || 22
  const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  const max = lineHeight * props.maxRows + padding
  const next = Math.min(el.scrollHeight, max)
  el.style.height = `${next}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

function handleInput() {
  resize()
  emit('input')
}

/** 输入框滚动时，高亮层跟着滚，避免文字和光标错位。 */
function handleScroll() {
  if (!mirrorRef.value || !textareaRef.value) return
  mirrorRef.value.scrollTop = textareaRef.value.scrollTop
}

watch(model, () => nextTick(resize))
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
  position: relative;
  width: 100%;
  min-width: 0;
}

/*
 * 镜像层与输入层必须共用同一个盒子：
 * 外层无论怎么加内边距（剪辑页会把 padding 加在输入框外壳上），
 * 两者都同时内缩，文字与光标才不会错位。
 */
.mi-stack {
  position: relative;
  width: 100%;
}

.mi-mirror,
.mi-input {
  width: 100%;
  padding: 0;
  border: 0;
  font: inherit;
  font-size: inherit;
  line-height: 1.65;
  letter-spacing: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* 高亮层只负责渲染文字与颜色 */
.mi-mirror {
  min-height: 1.65em;
  max-height: calc(1.65em * 8);
  overflow: hidden;
  color: var(--sf-ink);
  pointer-events: none;
}

.mi-placeholder {
  color: var(--sf-ink-3);
}

/* @引用与普通文字明显区分：强调色 + 底色 */
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

/* 输入层叠在高亮层上，文字透明、光标可见 */
.mi-input {
  position: absolute;
  inset: 0;
  height: 100%;
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--sf-terra);
}

.mi-input::selection {
  background: rgba(180, 85, 58, 0.2);
}

.mi-input:disabled {
  cursor: not-allowed;
}
</style>
