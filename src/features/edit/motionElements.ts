import type { AgentMotionElementRef } from '@/types/agent'

const EXCLUDED_TAGS = new Set(['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE'])
/** 这些元素即使铺满画布也可能是用户真正想选的画面主体。 */
const FULL_BLEED_MEDIA_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE', 'OBJECT', 'IFRAME'])
/** HyperFrames 的合成根、时间轴片段和显式背景壳只负责承载内容，不作为可选元素。 */
const BACKGROUND_SELECTOR = [
  '[data-composition-id]',
  '.clip',
  '[data-background]',
  '[data-bg]',
  '.background',
  '.bg-layer',
  '.paper-bg',
].join(',')

export function motionElementKey(element: Pick<AgentMotionElementRef, 'hfId' | 'id' | 'selector'>): string {
  return element.hfId ? `hf:${element.hfId}` : element.id ? `id:${element.id}` : `selector:${element.selector}`
}

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)
}

/** 优先使用工程稳定 ID；没有 ID 时保留可复现的 DOM 路径作为 AI 定位上下文。 */
export function motionElementSelector(element: Element): string {
  const hfId = element.getAttribute('data-hf-id')
  if (hfId) return `[data-hf-id="${cssEscape(hfId)}"]`
  if (element.id) return `#${cssEscape(element.id)}`
  const parts: string[] = []
  let current: Element | null = element
  while (current && current.tagName !== 'BODY' && parts.length < 8) {
    const tag = current.tagName.toLowerCase()
    const parent: HTMLElement | null = current.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const siblings = [...parent.children].filter((child) => child.tagName === current!.tagName)
    const index = siblings.indexOf(current) + 1
    parts.unshift(`${tag}:nth-of-type(${index})`)
    current = parent
  }
  return parts.join(' > ')
}

/** 元素所在的镜头 / 场景壳；用来区分不同部分里的同名元素。 */
const SECTION_SELECTOR = 'section, .clip, [data-scene], [data-shot], [data-composition-id]'
/** 画面内部的模块容器：面板、图层、字幕条等，AI 靠它理解“哪个部分里的元素”。 */
const MODULE_TAGS = new Set(['SECTION', 'MAIN', 'ASIDE', 'FIGURE', 'HEADER', 'FOOTER', 'NAV'])

function compact(value: string | null | undefined, limit = 80): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

/** 常见模块名给用户看一眼就懂；没有命中时保留工程里的原始 id/class。 */
const MODULE_LABELS: Record<string, string> = {
  panel: '面板',
  hero: '主视觉',
  copy: '文案区',
  brand: '品牌区',
  chart: '图表',
  list: '列表',
  card: '卡片',
  caption: '字幕',
  subtitle: '副标题',
  title: '标题区',
  logo: 'Logo',
  bar: '信息条',
  footer: '页脚',
  header: '页头',
  stage: '舞台',
  world: '场景',
  camera: '镜头',
  badge: '标签',
  metric: '数据块',
  quote: '引文',
  grid: '网格',
  column: '栏',
}

function moduleLabelOf(element: Element): string {
  const explicit = compact(element.getAttribute('data-label') || element.getAttribute('aria-label'), 40)
  if (explicit) return explicit
  const tokens = [element.id, ...elementClass(element).split(/\s+/)]
    .filter(Boolean)
    .map((token) => token.toLowerCase())
  for (const token of tokens) {
    if (MODULE_LABELS[token]) return MODULE_LABELS[token]
    const match = Object.keys(MODULE_LABELS).find((key) => token.includes(key))
    if (match) return MODULE_LABELS[match]
  }
  return compact(element.id || elementClass(element).split(/\s+/).filter(Boolean)[0] || element.tagName.toLowerCase(), 40)
}

function elementClass(element: Element): string {
  return (element.getAttribute('class') || '').trim()
}

function motionElementRole(element: Element, text: string): string {
  const tag = element.tagName.toUpperCase()
  const source = element.getAttribute('src') || element.getAttribute('data-var-src') || ''
  const hint = [
    element.id,
    elementClass(element),
    element.getAttribute('alt'),
    element.getAttribute('aria-label'),
    element.getAttribute('data-role'),
    source,
  ].filter(Boolean).join(' ').toLowerCase()
  const media = tag === 'IMG' || tag === 'PICTURE' || tag === 'VIDEO' || tag === 'SVG' || tag === 'CANVAS' || tag === 'OBJECT'
  // Logo 必须先于普通图片判断；文字层只有明确叫 logo/标志时才按 Logo 处理。
  if (/logo|logotype|wordmark|标志|徽标/.test(hint) || (media && /brand|品牌/.test(hint))) return 'Logo'
  if (tag === 'IMG' || tag === 'PICTURE') return '图片'
  if (tag === 'VIDEO') return '视频'
  if (tag === 'SVG') return text ? '图形文字' : '图形'
  if (tag === 'TEXT') return '文字'
  if (['RECT', 'CIRCLE', 'ELLIPSE', 'PATH', 'LINE', 'POLYGON', 'POLYLINE', 'USE'].includes(tag)) return '图形'
  if (tag === 'G') return '图形组'
  if (text) return '文字'
  if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return '控件'
  return '容器'
}

function motionElementSection(element: Element): {
  sectionId?: string
  sectionLabel?: string
  sectionSelector?: string
} {
  let section: Element | null = null
  try {
    section = typeof element.closest === 'function' ? element.closest(SECTION_SELECTOR) : null
  } catch {
    section = null
  }
  if (!section) {
    let current = element.parentElement
    while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
      if (current.tagName === 'SECTION' || elementClass(current).split(/\s+/).includes('clip')) {
        section = current
        break
      }
      current = current.parentElement
    }
  }
  if (!section) return {}
  const sectionId = compact(
    section.getAttribute('data-composition-id') || section.getAttribute('data-scene') || section.id,
    40,
  )
  const heading = typeof section.querySelector === 'function'
    ? compact(section.querySelector('h1, h2, h3, [data-title], [data-role="title"]')?.textContent, 36)
    : ''
  const rawLabel = compact(
    section.getAttribute('data-label') ||
      section.getAttribute('aria-label') ||
      heading ||
      section.getAttribute('data-shot') ||
      sectionId,
    60,
  )
  // 镜头壳通常只有 id="s02"；显示成 S02，用户才容易和分镜编号对上。
  const label = (/^s\d+$/i.test(rawLabel) ? rawLabel.toUpperCase() : rawLabel) || '当前画面'
  const className = elementClass(section)
  const selector = `${section.tagName.toLowerCase()}${section.id ? `#${section.id}` : ''}${className.split(/\s+/).includes('clip') ? '.clip' : ''}`
  return {
    sectionId: sectionId || undefined,
    sectionLabel: label,
    sectionSelector: selector,
  }
}

function nodeText(element: Element): string {
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
    elementClass(element)
      .split(/\s+/)
      .filter((name) => name && !name.startsWith('hf-'))
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('')
  }`
}

/**
 * 元素属于哪个模块：从最近的面板 / 图层容器开始，到镜头为止。
 * 只给 selector 时 AI 仍要猜“这是榜单卡还是字幕条”，补上层级就不用猜。
 */
function motionElementModule(element: Element): {
  moduleLabel?: string
  moduleSelector?: string
  modulePath?: string
} {
  const chain: string[] = []
  let module: Element | null = null
  let current = element.parentElement
  while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML' && chain.length < 5) {
    const classes = elementClass(current)
      .split(/\s+/)
      .filter((name) => name && !name.startsWith('hf-'))
    // 镜头壳本身不算模块：AI 已经从「所属镜头」知道是哪一个画面。
    const isSceneShell = current.tagName === 'SECTION' ||
      classes.includes('clip') ||
      (typeof current.hasAttribute === 'function' && (
        current.hasAttribute('data-composition-id') ||
        current.hasAttribute('data-scene') ||
        current.hasAttribute('data-shot')
      ))
    if (isSceneShell) break
    const named = !!current.id || classes.length > 0 || MODULE_TAGS.has(current.tagName)
    if (named) {
      chain.unshift(nodeText(current))
      // 最近的有名字容器就是模块；没有 id/class 的纯布局壳继续往上找。
      if (!module) module = current
    }
    current = current.parentElement
  }
  if (!module) return {}
  const label = moduleLabelOf(module)
  return {
    moduleLabel: label || undefined,
    moduleSelector: module.id || elementClass(module)
      ? `${module.tagName.toLowerCase()}${module.id ? `#${module.id}` : ''}${
          elementClass(module)
            .split(/\s+/)
            .filter((name) => name && !name.startsWith('hf-'))
            .slice(0, 2)
            .map((name) => `.${name}`)
            .join('')
        }`
      : module.tagName.toLowerCase(),
    modulePath: chain.length ? chain.join(' > ') : undefined,
  }
}

/** 只保留最近三层父级，够 AI 定位又不会把整棵 DOM 塞进提示词。 */
function motionElementParentPath(element: Element): string | undefined {
  const parts: string[] = []
  let current = element.parentElement
  while (current && parts.length < 3) {
    const tag = current.tagName.toLowerCase()
    if (tag === 'body' || tag === 'html' || tag === 'section' || tag === 'main') break
    const classes = elementClass(current)
      .split(/\s+/)
      .filter((name) => name && !name.startsWith('hf-'))
      .slice(0, 2)
    parts.unshift(`${tag}${current.id ? `#${current.id}` : ''}${classes.map((name) => `.${name}`).join('')}`)
    current = current.parentElement
  }
  return parts.length ? parts.join(' > ') : undefined
}

/** 把元素中心点换算成九宫格位置，便于用户和 AI 用“画面哪一块”来区分。 */
function motionElementRegion(
  rect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
): string | undefined {
  if (!viewport?.width || !viewport?.height) return undefined
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const horizontal = centerX < viewport.width / 3 ? '左' : centerX > (viewport.width * 2) / 3 ? '右' : '中'
  const vertical = centerY < viewport.height / 3 ? '上' : centerY > (viewport.height * 2) / 3 ? '下' : '中'
  const labels: Record<string, string> = {
    左上: '左上方',
    中上: '正上方',
    右上: '右上方',
    左中: '左侧',
    中中: '画面中央',
    右中: '右侧',
    左下: '左下方',
    中下: '正下方',
    右下: '右下方',
  }
  return labels[`${horizontal}${vertical}`]
}

export function isSelectableMotionElement(
  element: Element,
  viewport?: { width: number; height: number },
): boolean {
  if (EXCLUDED_TAGS.has(element.tagName)) return false
  if (element.hasAttribute('data-hyperframes-player-shader-options')) return false
  try {
    if (element.matches(BACKGROUND_SELECTOR)) return false
  } catch {
    // 极旧环境没有 matches 时退回几何判断。
  }
  const rect = element.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  if (style?.display === 'none' || style?.visibility === 'hidden' || Number(style?.opacity ?? 1) <= 0.01) {
    return false
  }
  const frame = viewport || (view
    ? {
        width: element.ownerDocument.documentElement?.clientWidth || view.innerWidth,
        height: element.ownerDocument.documentElement?.clientHeight || view.innerHeight,
      }
    : undefined)
  if (frame?.width && frame.height) {
    const fullBleed = rect.width >= frame.width * 0.94 && rect.height >= frame.height * 0.94
    const directText = [...element.childNodes].some(
      (node) => node.nodeType === 3 && !!node.textContent?.trim(),
    )
    // 铺满画布的 SVG 根只是内容画布（背景纸、舞台），其子元素仍然可以单独选中。
    if (fullBleed && element.tagName === 'SVG') return false
    // 铺满画布的容器是背景板/合成壳；只有真实媒体或带直接文字的画面层保留可选。
    if (fullBleed && !FULL_BLEED_MEDIA_TAGS.has(element.tagName) && !directText) return false
  }
  return true
}

export function snapshotMotionElement(
  element: Element,
  iframeRect: DOMRect,
  stageRect: DOMRect,
  selectedAtMotionTime: number,
  iframeViewport: { width: number; height: number },
): AgentMotionElementRef {
  const rect = element.getBoundingClientRect()
  const scaleX = iframeRect.width / Math.max(1, iframeViewport.width)
  const scaleY = iframeRect.height / Math.max(1, iframeViewport.height)
  // getBoundingClientRect 已包含 GSAP transform；这里只做 iframe → 主画面坐标换算。
  const x = iframeRect.left - stageRect.left + rect.left * scaleX
  const y = iframeRect.top - stageRect.top + rect.top * scaleY
  const id = element.id || undefined
  const hfId = element.getAttribute('data-hf-id') || undefined
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  const source = element.getAttribute('src') || element.getAttribute('data-var-src') || undefined
  const role = motionElementRole(element, text)
  return {
    hfId,
    id,
    selector: motionElementSelector(element),
    label: text
      ? `${role}「${text.slice(0, 24)}」`
      : `${role}${id ? `（${id}）` : hfId ? `（${hfId}）` : ''}`,
    tagName: element.tagName.toLowerCase(),
    textContent: text || undefined,
    src: source?.slice(0, 500),
    sourceFile: 'index.html',
    selectedAtMotionTime,
    boundingBox: { x, y, width: rect.width * scaleX, height: rect.height * scaleY },
    ...motionElementSection(element),
    ...motionElementModule(element),
    parentPath: motionElementParentPath(element),
    region: motionElementRegion(rect, iframeViewport),
    role,
  }
}

/** 框选保留叶子视觉元素，避免一个区域同时选中它的全部祖先。 */
export function collapseMotionAncestors(elements: Element[]): Element[] {
  const unique = [...new Set(elements)]
  return unique.filter((element) => !unique.some((other) => other !== element && element.contains(other)))
}
