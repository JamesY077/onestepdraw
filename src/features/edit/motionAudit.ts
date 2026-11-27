/**
 * 动效工程的安全区与文字间距复查。
 *
 * 官方 hyperframes check 负责字体、运行时、对比度等；这里补上它没有覆盖的
 * 「画面内缩 5% 动作安全区 / 10% 文字安全区」以及文字互相重叠、过近。
 * 只在浏览器里读取同源预览 iframe，不发起任何网络请求。
 */

export interface MotionAuditIssue {
  severity: 'error' | 'warning' | 'info'
  code: 'safe_area' | 'title_safe_area' | 'text_overlap' | 'text_too_close'
  message: string
  selector: string
  time: number
  label: string
}

interface Candidate {
  el: HTMLElement
  label: string
  selector: string
  kind: 'text' | 'media'
  left: number
  top: number
  right: number
  bottom: number
}

const MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'TEXT', 'USE'])

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`)
}

function selectorFor(element: HTMLElement): string {
  const hfId = element.getAttribute('data-hf-id')
  if (hfId) return `[data-hf-id="${escapeSelector(hfId)}"]`
  if (element.id) return `#${escapeSelector(element.id)}`
  const parts: string[] = []
  let current: HTMLElement | null = element
  for (let depth = 0; current && depth < 4; depth += 1) {
    const tag = current.tagName.toLowerCase()
    const parent: HTMLElement | null = current.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const sameTag = [...parent.children].filter((child) => child.tagName === current!.tagName)
    const index = sameTag.indexOf(current) + 1
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag)
    if (current.parentElement?.hasAttribute('data-composition-id')) break
    current = parent
  }
  return parts.join(' > ')
}

function directText(element: HTMLElement): string {
  return [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isVisible(element: HTMLElement, style: CSSStyleDeclaration): boolean {
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  if (Number(style.opacity) < 0.06) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  return true
}

/** 只收集真实内容元素：直接文字、媒体，或带 data-hf-id 的显式可编辑层。 */
function collectCandidates(root: HTMLElement): Candidate[] {
  const view = root.ownerDocument?.defaultView
  if (!view) return []
  const rootRect = root.getBoundingClientRect()
  const viewportArea = Math.max(1, rootRect.width * rootRect.height)
  const candidates: Candidate[] = []
  const seen = new Set<string>()

  const nodes = root.querySelectorAll<HTMLElement>('*')
  for (const element of nodes) {
    // 预览工程可能有很多装饰层；限制数量，避免一次复查卡住主线程。
    if (candidates.length >= 160) break
    const style = view.getComputedStyle(element)
    if (!isVisible(element, style)) continue
    const text = directText(element)
    const isMedia = MEDIA_TAGS.has(element.tagName)
    const hasHfId = element.hasAttribute('data-hf-id')
    if (!text && !isMedia && !hasHfId) continue
    if (!text && !isMedia && hasHfId && element.children.length) continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (rect.right <= rootRect.left || rect.left >= rootRect.right) continue
    if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue
    // 满屏背景、纸张、遮罩不是内容，不参与安全区判断。
    if (rect.width * rect.height >= viewportArea * 0.94) continue
    const key = `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)},${text.slice(0, 12)}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      el: element,
      label: text.slice(0, 24) || (element.tagName === 'IMG' ? '图片' : element.tagName.toLowerCase()),
      selector: selectorFor(element),
      kind: text ? 'text' : 'media',
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    })
  }
  return candidates
}

function overlaps(left: Candidate, right: Candidate): number {
  const width = Math.min(left.right, right.right) - Math.max(left.left, right.left)
  const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
  return width > 0 && height > 0 ? width * height : 0
}

function contains(parent: Candidate, child: Candidate): boolean {
  return parent.left <= child.left + 1 && parent.top <= child.top + 1 &&
    parent.right >= child.right - 1 && parent.bottom >= child.bottom - 1
}

/**
 * 复查单个时间点。root 通常是 [data-composition-id] 根节点。
 * 返回去重后的问题，供检查器直接展示。
 */
export function auditMotionFrame(root: HTMLElement | null, time = 0): MotionAuditIssue[] {
  if (!root) return []
  const rect = root.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return []
  const candidates = collectCandidates(root)
  const issues: MotionAuditIssue[] = []
  const push = (issue: MotionAuditIssue) => {
    const key = `${issue.code}|${issue.selector}|${issue.message}`
    if (!issues.some((item) => `${item.code}|${item.selector}|${item.message}` === key)) issues.push(issue)
  }

  const action = {
    left: rect.left + rect.width * 0.05,
    top: rect.top + rect.height * 0.05,
    right: rect.right - rect.width * 0.05,
    bottom: rect.bottom - rect.height * 0.05,
  }
  const title = {
    left: rect.left + rect.width * 0.1,
    top: rect.top + rect.height * 0.1,
    right: rect.right - rect.width * 0.1,
    bottom: rect.bottom - rect.height * 0.1,
  }

  for (const item of candidates) {
    const outsideAction = item.left < action.left - 1 || item.top < action.top - 1 ||
      item.right > action.right + 1 || item.bottom > action.bottom + 1
    if (!outsideAction) continue
    const outsideTitle = item.kind === 'text' && (
      item.left < title.left - 1 || item.top < title.top - 1 ||
      item.right > title.right + 1 || item.bottom > title.bottom + 1
    )
    push({
      severity: outsideTitle ? 'warning' : 'info',
      code: outsideTitle ? 'title_safe_area' : 'safe_area',
      message: outsideTitle
        ? `文字「${item.label}」超出 10% 文字安全区，投屏或裁切时可能被切掉。`
        : `「${item.label}」超出 5% 动作安全区，边缘可能被裁切。`,
      selector: item.selector,
      time,
      label: item.label,
    })
  }

  const texts = candidates.filter((item) => item.kind === 'text')
  for (let left = 0; left < texts.length; left += 1) {
    for (let right = left + 1; right < texts.length; right += 1) {
      const a = texts[left]
      const b = texts[right]
      if (contains(a, b) || contains(b, a)) continue
      const area = overlaps(a, b)
      if (area > 6) {
        push({
          severity: 'warning',
          code: 'text_overlap',
          message: `文字「${a.label}」与「${b.label}」重叠，阅读会互相干扰。`,
          selector: a.selector,
          time,
          label: a.label,
        })
        continue
      }
      const gapX = Math.max(a.left - b.right, b.left - a.right)
      const gapY = Math.max(a.top - b.bottom, b.top - a.bottom)
      if (gapX >= 0 && gapX < 6 && gapY < 0) {
        push({
          severity: 'info',
          code: 'text_too_close',
          message: `文字「${a.label}」与「${b.label}」水平间距不足 6px，容易挤在一起。`,
          selector: a.selector,
          time,
          label: a.label,
        })
      } else if (gapY >= 0 && gapY < 4 && gapX < 0) {
        push({
          severity: 'info',
          code: 'text_too_close',
          message: `文字「${a.label}」与「${b.label}」垂直间距不足 4px，容易挤在一起。`,
          selector: a.selector,
          time,
          label: a.label,
        })
      }
    }
  }

  return issues
}

export function auditMotionDocument(doc: Document | null | undefined, time = 0): MotionAuditIssue[] {
  if (!doc) return []
  const root = doc.querySelector<HTMLElement>('[data-composition-id]') || doc.body
  return auditMotionFrame(root, time)
}
