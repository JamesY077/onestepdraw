import type {
  AgentMessage,
  AgentStoryboardDraftShot,
  AgentStoryboardPlan,
  AgentStoryboardReference,
} from '@/types/agent'

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] || character)
}

function promptLines(prompt: string, maxLines = 5): string[] {
  const characters = Array.from(prompt.replace(/\s+/g, ' ').trim())
  const lines: string[] = []
  while (characters.length && lines.length < maxLines) {
    lines.push(characters.splice(0, 25).join(''))
  }
  if (characters.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`
  return lines.length ? lines : ['等待补充分镜脚本']
}

function storyboardSvgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
}

/** 只接受静态自包含 SVG；图片上下文之外也不允许脚本、事件或网络子资源。 */
export function normalizeAnimationStoryboardSvg(source?: string): string {
  const svg = String(source || '').trim()
  if (!svg || svg.length > 24000 || !/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) return ''
  if (/<\s*(script|foreignObject|image|use|iframe|object|embed)\b|\son[a-z]+\s*=|\b(?:href|src)\s*=|url\s*\(/i.test(svg)) return ''
  return svg
}

/** 动画优先展示模型逐镜编写的 SVG；缺失时由本地代码绘制可读示意卡。 */
export function createAnimationStoryboardImage(
  shot: Pick<AgentStoryboardDraftShot, 'id' | 'prompt' | 'duration' | 'referenceSvg'>,
  index: number,
  aspectRatio: string,
): string {
  const customSvg = normalizeAnimationStoryboardSvg(shot.referenceSvg)
  if (customSvg) return storyboardSvgDataUrl(customSvg)
  const [width, height] = aspectRatio === '9:16' ? [720, 1280] : aspectRatio === '1:1' ? [960, 960] : [1280, 720]
  const palettes = [
    ['#f4eee5', '#b85c40', '#263b36'],
    ['#e9eff0', '#376b73', '#d29b55'],
    ['#f2ede7', '#6b5c85', '#bf775c'],
    ['#edf0e6', '#587052', '#b65b48'],
  ]
  const [background, accent, ink] = palettes[index % palettes.length]
  const horizontal = width > height
  const artX = horizontal ? Math.round(width * 0.57) : Math.round(width * 0.12)
  const artY = horizontal ? Math.round(height * 0.15) : Math.round(height * 0.49)
  const artWidth = horizontal ? Math.round(width * 0.33) : Math.round(width * 0.76)
  const artHeight = horizontal ? Math.round(height * 0.7) : Math.round(height * 0.35)
  const lines = promptLines(shot.prompt, horizontal ? 5 : 4)
  const textStart = horizontal ? Math.round(height * 0.35) : Math.round(height * 0.25)
  const fontSize = horizontal ? 27 : 30
  const lineHeight = horizontal ? 43 : 48
  const text = lines.map((line, lineIndex) =>
    `<text x="${Math.round(width * 0.08)}" y="${textStart + lineIndex * lineHeight}" fill="${ink}" font-size="${fontSize}" font-family="Inter, PingFang SC, sans-serif">${escapeXml(line)}</text>`,
  ).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <path d="M0 ${height - 46}H${width}" stroke="${ink}" stroke-opacity=".16"/>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.14)}" fill="${accent}" font-size="18" font-weight="700" letter-spacing="4" font-family="monospace">${escapeXml(shot.id)} / ${shot.duration}s</text>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.14) + 32}" fill="${ink}" fill-opacity=".55" font-size="13" letter-spacing="2" font-family="monospace">CODED STORYBOARD</text>
  ${text}
  <rect x="${artX}" y="${artY}" width="${artWidth}" height="${artHeight}" rx="24" fill="none" stroke="${ink}" stroke-opacity=".22" stroke-width="2"/>
  <circle cx="${artX + artWidth * 0.66}" cy="${artY + artHeight * 0.42}" r="${Math.min(artWidth, artHeight) * 0.24}" fill="${accent}"/>
  <rect x="${artX + artWidth * 0.13}" y="${artY + artHeight * 0.22}" width="${artWidth * 0.35}" height="${artHeight * 0.55}" rx="12" fill="${ink}"/>
  <path d="M${artX + artWidth * 0.12} ${artY + artHeight * 0.84}C${artX + artWidth * 0.4} ${artY + artHeight * 0.62},${artX + artWidth * 0.62} ${artY + artHeight * 0.95},${artX + artWidth * 0.9} ${artY + artHeight * 0.7}" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
  <text x="${Math.round(width * 0.08)}" y="${height - 17}" fill="${ink}" fill-opacity=".5" font-size="12" font-family="monospace">LOCAL SVG · EDIT BEFORE EXECUTION</text>
</svg>`
  return storyboardSvgDataUrl(svg)
}

/** 用户上传素材与显式引用的模板图优先于任何新生成参考图。 */
export function storyboardUserReferences(message?: Pick<AgentMessage, 'attachments' | 'templates'>): AgentStoryboardReference[] {
  const references: AgentStoryboardReference[] = []
  for (const attachment of message?.attachments || []) {
    if (attachment.kind === 'image' && attachment.url) {
      references.push({ image: attachment.url, source: 'user', name: attachment.name })
    } else if (attachment.kind === 'video' && attachment.url) {
      references.push({ image: attachment.frames?.[0], video: attachment.url, source: 'user', name: attachment.name })
    }
  }
  for (const attachment of (message?.templates || []).flatMap((template) => template.assets || [])) {
    if (attachment.kind === 'image' && attachment.url) {
      references.push({ image: attachment.url, source: 'user', name: attachment.name })
    } else if (attachment.kind === 'video' && attachment.url) {
      references.push({ image: attachment.frames?.[0], video: attachment.url, source: 'user', name: attachment.name })
    }
  }
  for (const template of message?.templates || []) {
    for (const image of template.images || []) {
      if (image) references.push({ image, source: 'user', name: template.name })
    }
  }
  return references
}

export function storyboardReferencesReady(plan?: AgentStoryboardPlan | null): boolean {
  return !!plan?.shots.length && plan.shots.every((shot) =>
    shot.referenceStatus === 'ready' && !!(shot.referenceImage || shot.referenceVideo),
  )
}
