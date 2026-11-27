import { computed, nextTick, ref, watch, type Ref } from 'vue'

/** 输入框里的 @ 引用：面板状态、插入、高亮与回车时的补全。 */
export interface MentionEntry {
  key: string
  token: string
  label: string
  kind: 'template' | 'attachment' | 'clip' | 'skill'
  index: number
}

/** 从光标往前找 '@'，返回触发位置；空白或中文标点之后算一次新的引用输入。 */
function findMentionStart(value: string, caret: number): number {
  for (let i = caret - 1; i >= 0 && caret - i <= 24; i -= 1) {
    const ch = value[i]
    if (ch === '@') {
      const before = value[i - 1]
      // 邮箱/英文单词里的 @ 不触发；中文没有空格习惯，汉字或标点后的 @ 仍应打开引用。
      if (before && /[A-Za-z0-9._%+-]/.test(before)) return -1
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
    if (!el) return
    // 菜单打开后用户可能用方向键移动过光标；插入前按当前光标重新定位 @。
    const caret = el.selectionEnd ?? el.selectionStart ?? 0
    const at = findMentionStart(el.value, caret)
    const from = at >= 0 ? at : start.value
    if (from < 0) return
    const before = el.value.slice(0, from)
    const after = el.value.slice(caret)
    // 已经紧跟空格或中文标点时不再重复补空格。
    const suffix = !after || !/^[\s，。！？、；：,.!?;:]/.test(after) ? ' ' : ''
    const insertText = `${token}${suffix}`
    const next = `${before}${insertText}${after}`
    el.value = next
    const pos = before.length + insertText.length
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
  // 长的 token 优先，避免 @模板1 抢先匹配 @模板10 的前缀；重复 token 只保留一个。
  const unique = [...new Set(tokens.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!unique.length) return [{ text, mention: false }]
  let pattern: RegExp
  try {
    pattern = new RegExp(`(${unique.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
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
