import { computed, nextTick, ref, watch, type Ref } from 'vue'

/** 输入框里的 @ 引用：面板状态、插入、高亮与回车时的补全。 */
export interface MentionEntry {
  key: string
  token: string
  label: string
  kind: 'template' | 'attachment' | 'clip' | 'skill'
  index: number
}

/** 从光标往前找 '@'，返回触发位置；空白之后才算一次新的引用输入。 */
function findMentionStart(value: string, caret: number): number {
  for (let i = caret - 1; i >= 0 && caret - i <= 24; i -= 1) {
    const ch = value[i]
    if (ch === '@') {
      const before = value[i - 1]
      // 邮箱、已插入的 @模板1 不再触发
      if (before && !/\s/.test(before)) return -1
      return i
    }
    if (/\s/.test(ch)) return -1
  }
  return -1
}

export function useMentionRefs(textarea: Ref<HTMLTextAreaElement | null>) {
  const open = ref(false)
  const query = ref('')
  const start = ref(-1)
  const activeKey = ref('')

  const isInsideMention = computed(() => {
    const el = textarea.value
    const value = el?.value ?? ''
    const caret = el?.selectionStart ?? 0
    return findMentionStart(value, caret) >= 0
  })

  function onInput() {
    const el = textarea.value
    if (!el) return
    const at = findMentionStart(el.value, el.selectionStart)
    if (at < 0) {
      close()
      return
    }
    open.value = true
    start.value = at
    query.value = el.value.slice(at + 1, el.selectionStart)
  }

  function close() {
    open.value = false
    start.value = -1
    query.value = ''
    activeKey.value = ''
  }

  /** 把光标处的 @查询 替换成完整引用文本，并把光标放到后面。 */
  function insert(token: string) {
    const el = textarea.value
    if (!el || start.value < 0) return
    const before = el.value.slice(0, start.value)
    const caret = el.selectionStart
    const after = el.value.slice(caret)
    const next = `${before}${token} ${after}`
    el.value = next
    const pos = before.length + token.length + 1
    nextTick(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    close()
  }

  /** 输入框为空时按 @，直接给出所有可选引用。 */
  function triggerOnEmpty() {
    const el = textarea.value
    if (!el) return false
    if (el.value.trim()) return false
    el.value = '@'
    el.setSelectionRange(1, 1)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  watch(open, (value) => {
    if (!value) activeKey.value = ''
  })

  return { open, query, activeKey, isInsideMention, onInput, insert, close, triggerOnEmpty }
}

/** 在渲染预览里把 @引用 高亮成小标签。 */
export function splitMentionSegments(text: string, tokens: string[]): { text: string; mention: boolean }[] {
  if (!tokens.length) return [{ text, mention: false }]
  let pattern: RegExp
  try {
    pattern = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  } catch {
    return [{ text, mention: false }]
  }
  const parts: { text: string; mention: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: text.slice(last, index), mention: false })
    parts.push({ text: match[0], mention: true })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false })
  return parts
}
