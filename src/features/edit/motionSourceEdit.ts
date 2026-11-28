/**
 * 在动效工程源码里定位一个元素，并给出可直接用于 patch 的原文片段。
 *
 * 预览里点选的元素已经知道 id / data-hf-id / selector，但模型只拿到 selector
 * 时仍要整份读取源码才能改；这里把「第几行 + 这一段 HTML」一并交给模型，
 * 小改动可以直接 patch，不必反复读取整个工程。
 */

export interface MotionElementLocation {
  /** 元素起始偏移（含开标签前的缩进）。 */
  start: number
  /** 元素结束偏移（闭合标签之后）。 */
  end: number
  /** 开标签结束位置（`>` 之后）。 */
  openEnd: number
  /** 闭合标签开始位置；自闭合元素等于 end。 */
  closeStart: number
  tagName: string
  /** 1 起始的行号。 */
  line: number
  /** 原样截取的源码片段，可直接作为 patch 的 find。 */
  snippet: string
  selfClosing: boolean
}

interface ElementRefLike {
  id?: string
  hfId?: string
  selector?: string
  tagName?: string
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 从某个偏移往前找 `<`，确认命中的是开标签而不是属性值里的文字。 */
function openingTagStart(source: string, index: number): number {
  const start = source.lastIndexOf('<', index)
  if (start < 0) return -1
  const between = source.slice(start, index)
  if (between.includes('>')) return -1
  if (/^<\//.test(between)) return -1
  return start
}

interface OpenTag {
  start: number
  end: number
  tagName: string
  selfClosing: boolean
}

/** 从 `<` 开始读一个完整的开标签，正确处理属性值里的 `>`。 */
function readOpenTag(source: string, start: number): OpenTag | null {
  const match = /^<([a-zA-Z][\w:-]*)/.exec(source.slice(start, start + 80))
  if (!match) return null
  let quote = ''
  for (let index = start + match[0].length; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') {
      const before = source.slice(start, index)
      return {
        start,
        end: index + 1,
        tagName: match[1].toLowerCase(),
        selfClosing: /\/\s*$/.test(before),
      }
    }
  }
  return null
}

/** 从元素起始位置配对结束标签；脚本/样式里的 `<` 不会被当成标签。 */
function findElementEnd(source: string, open: OpenTag): number {
  if (open.selfClosing || VOID_TAGS.has(open.tagName)) return open.end
  const tag = escapeRegExp(open.tagName)
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'gi')
  pattern.lastIndex = open.end
  let depth = 1
  let cursor = open.end
  while (cursor < source.length) {
    pattern.lastIndex = cursor
    const match = pattern.exec(source)
    if (!match) break
    const closing = match[1] === '/'
    const selfClosing = match[2] === '/'
    // 跳过 script/style 内容：里面可能出现字面量 `</div>`。
    if (!closing && (open.tagName === 'script' || open.tagName === 'style')) {
      const closeTag = `</${open.tagName}>`
      const closeIndex = source.toLowerCase().indexOf(closeTag, match.index)
      if (closeIndex < 0) break
      return closeIndex + closeTag.length
    }
    if (closing) depth -= 1
    else if (!selfClosing) depth += 1
    if (depth === 0) return match.index + match[0].length
    cursor = match.index + match[0].length
  }
  return -1
}

function lineOf(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') line += 1
  }
  return line
}

function locateByMarker(source: string, marker: string): number {
  let found = -1
  let count = 0
  let from = 0
  while (true) {
    const index = source.indexOf(marker, from)
    if (index < 0) break
    count += 1
    if (count > 1) return -2
    found = index
    from = index + marker.length
  }
  return count === 1 ? found : -1
}

interface ChildTag {
  start: number
  open: OpenTag
}

/** 列出容器直接子元素（只扫一层），用于按 selector 层级逐级下钻。 */
function directChildren(source: string, container: OpenTag): ChildTag[] {
  const children: ChildTag[] = []
  if (container.selfClosing || VOID_TAGS.has(container.tagName)) return children
  const pattern = /<(\/?)([a-zA-Z][\w:-]*)/g
  pattern.lastIndex = container.end
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    if (match[1] === '/') {
      depth -= 1
      if (depth < 0) break
      continue
    }
    const open = readOpenTag(source, match.index)
    if (!open) continue
    if (open.tagName === 'script' || open.tagName === 'style') {
      // 跳过脚本/样式正文，避免里面的 `</div>` 破坏层级。
      const closeIndex = source.toLowerCase().indexOf(`</${open.tagName}>`, open.end)
      if (closeIndex < 0) break
      if (depth === 0) children.push({ start: open.start, open })
      pattern.lastIndex = closeIndex + open.tagName.length + 3
      continue
    }
    if (depth === 0) children.push({ start: open.start, open })
    if (!open.selfClosing && !VOID_TAGS.has(open.tagName)) depth += 1
  }
  return children
}

interface SelectorPart {
  tag: string
  classes: string[]
  /** nth-of-type 的序号；没有时按第一个匹配。 */
  ordinal: number
}

function parseSelectorPart(part: string): SelectorPart {
  const nth = /:nth-of-type\((\d+)\)/.exec(part)
  const withoutNth = part.replace(/:nth-of-type\(\d+\)/g, '').replace(/\[[^\]]*\]/g, '')
  const tagMatch = /^([a-zA-Z][\w:-]*)/.exec(withoutNth)
  return {
    tag: tagMatch ? tagMatch[1].toLowerCase() : '',
    classes: [...withoutNth.matchAll(/\.([\w-]+)/g)].map((match) => match[1]),
    ordinal: nth ? Math.max(1, Number(nth[1])) : 0,
  }
}

function selectorPartMatches(source: string, open: OpenTag, part: SelectorPart): boolean {
  if (part.tag && open.tagName !== part.tag) return false
  if (!part.classes.length) return true
  const openText = source.slice(open.start, open.end)
  const classMatch = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(openText)
  const value = classMatch ? (classMatch[2] ?? classMatch[3] ?? '') : ''
  const tokens = new Set(value.split(/\s+/).filter(Boolean))
  return part.classes.every((name) => tokens.has(name))
}

/**
 * 按完整 selector 链从 body 逐级下钻。
 *
 * 只取最后一段会在同名/同标签元素里命中第一个，把改动写到 `#root` 之类的容器上，
 * 所以必须每一级都限定在上一级的直接子元素里。
 */
function locateBySelectorChain(source: string, selector: string): number {
  const parts = selector.split('>').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return -1
  const bodyMatch = /<body\b/i.exec(source)
  const rootMatch = /<html\b/i.exec(source)
  const anchor = bodyMatch ?? rootMatch
  if (!anchor) return -1
  const anchorTag = readOpenTag(source, anchor.index)
  if (!anchorTag) return -1
  let container: OpenTag = anchorTag
  let found = -1
  for (const raw of parts) {
    const part = parseSelectorPart(raw)
    const children: ChildTag[] = directChildren(source, container).filter((child) =>
      selectorPartMatches(source, child.open, part),
    )
    const target = part.ordinal ? children[part.ordinal - 1] : children[0]
    if (!target) return -1
    found = target.start
    container = target.open
  }
  return found
}

export function locateMotionElement(source: string, element: ElementRefLike): MotionElementLocation | null {
  if (!source) return null
  let pass: number[] = []
  if (element.hfId) {
    pass = [
      locateByMarker(source, `data-hf-id="${element.hfId}"`),
      locateByMarker(source, `data-hf-id='${element.hfId}'`),
    ]
  }
  if (!pass.some((value) => value >= 0) && element.id) {
    pass = [
      locateByMarker(source, `id="${element.id}"`),
      locateByMarker(source, `id='${element.id}'`),
    ]
  }
  let start = pass.find((value) => value > 0) ?? -1
  if (start < 0 && element.selector) start = locateBySelectorChain(source, element.selector)
  if (start < 0) return null

  const tagStart = openingTagStart(source, start)
  if (tagStart < 0) return null
  const open = readOpenTag(source, tagStart)
  if (!open) return null
  if (element.tagName && open.tagName !== element.tagName.toLowerCase()) return null
  const end = findElementEnd(source, open)
  if (end < 0) return null

  return {
    start: tagStart,
    end,
    openEnd: open.end,
    closeStart: open.selfClosing ? end : Math.max(open.end, end - `</${open.tagName}>`.length),
    tagName: open.tagName,
    line: lineOf(source, tagStart),
    snippet: source.slice(tagStart, end),
    selfClosing: open.selfClosing,
  }
}

/** 截取元素附近几行，给模型足够的 patch 上下文但不淹没对话。 */
export function elementSnippet(source: string, location: MotionElementLocation, limit = 1_100): string {
  const lineStart = source.lastIndexOf('\n', location.start)
  const before = lineStart < 0 ? '' : source.slice(0, lineStart)
  const beforeLines = before.split('\n').slice(-2).join('\n')
  const raw = `${beforeLines}${beforeLines ? '\n' : ''}${location.snippet}`
  return raw.length > limit ? raw.slice(0, limit) : raw
}

function withStyleAttribute(openTagText: string, property: string, value: string): string {
  const styleMatch = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(openTagText)
  if (!styleMatch) {
    return openTagText.replace(/\s*\/?>$/, (tail) => ` style="${property}: ${value};"${tail.trimStart()}`)
  }
  const quote = styleMatch[1][0]
  const body = (styleMatch[2] ?? styleMatch[3] ?? '')
  const pattern = new RegExp(`(^|;)\\s*${escapeRegExp(property)}\\s*:[^;]*`, 'i')
  const next = pattern.test(body)
    ? body.replace(pattern, (_match, prefix) => `${prefix} ${property}: ${value}`)
    : `${body.trim().replace(/;$/, '')}${body.trim() ? '; ' : ''}${property}: ${value}`
  const start = styleMatch.index
  const end = start + styleMatch[0].length
  return `${openTagText.slice(0, start)}style=${quote}${next}${quote}${openTagText.slice(end)}`
}

/** 删除元素自身（保留文件其他部分原样，避免整份重排）。 */
export function removeMotionElement(source: string, location: MotionElementLocation): string {
  let start = location.start
  let end = location.end
  // 连同独占一行的缩进和换行一起删掉，避免留下空行。
  const lineStart = source.lastIndexOf('\n', start) + 1
  const lineEnd = source.indexOf('\n', end)
  if (source.slice(lineStart, start).trim() === '' && lineEnd >= 0) {
    end = lineEnd + 1
    start = lineStart
  }
  return `${source.slice(0, start)}${source.slice(end)}`
}

/** 替换元素里的文字；只有原文唯一时才改，避免误伤同名文案。 */
export function renameMotionElementText(
  source: string,
  location: MotionElementLocation,
  from: string,
  to: string,
): string {
  const innerStart = location.openEnd
  const innerEnd = location.closeStart
  const inner = source.slice(innerStart, innerEnd)
  const occurrences = inner.split(from).length - 1
  if (!from || occurrences !== 1) {
    throw new Error('这段文字在元素里不唯一，无法安全替换。请改用源码或让 AI 修改。')
  }
  const nextInner = inner.replace(from, to)
  return `${source.slice(0, innerStart)}${nextInner}${source.slice(innerEnd)}`
}

/** 用 CSS translate 做局部微调：与 GSAP 的 transform 叠加，不会打断现有动画。 */
export function nudgeMotionElement(
  source: string,
  location: MotionElementLocation,
  dx: number,
  dy: number,
): string {
  const openTagText = source.slice(location.start, location.openEnd)
  const styleMatch = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(openTagText)
  const current = styleMatch ? (styleMatch[2] ?? styleMatch[3] ?? '') : ''
  const translateMatch = /(?:^|;)\s*translate\s*:\s*([^;]+)/i.exec(current)
  let x = 0
  let y = 0
  if (translateMatch) {
    const values = translateMatch[1].trim().split(/\s+/).map((value) => Number.parseFloat(value) || 0)
    x = values[0] || 0
    y = values[1] || 0
  }
  const nextX = Math.round((x + dx) * 10) / 10
  const nextY = Math.round((y + dy) * 10) / 10
  const value = `${nextX}px ${nextY}px`
  const nextOpen = withStyleAttribute(openTagText, 'translate', value)
  return `${source.slice(0, location.start)}${nextOpen}${source.slice(location.openEnd)}`
}
