/**
 * 选中片段的上下文：把用户选中的时间轴片段变成一段可读、可定位的说明。
 * 有选中片段时，模型只需要理解这几段，不再把整条时间轴当作修改对象。
 */
import type { AgentClipRef, AgentMotionElementRef } from '@/types/agent'

const KIND_LABEL: Record<AgentClipRef['kind'], string> = {
  video: '视频',
  image: '图片',
  audio: '音频',
  animation: '代码动画',
  motion: '动效工程',
}

function seconds(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  return `${safe.toFixed(1)}s`
}

function percent(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

export function clipTimeRange(clip: Pick<AgentClipRef, 'start' | 'duration'>): string {
  return `${seconds(clip.start)} → ${seconds(clip.start + clip.duration)}`
}

function clipLine(clip: AgentClipRef, index: number): string {
  const details = [
    `id=${clip.id}`,
    `「${clip.name}」`,
    KIND_LABEL[clip.kind] || clip.kind,
    `轨道 ${clip.trackName}`,
    clipTimeRange(clip),
    `时长 ${seconds(clip.duration)}`,
  ]
  if (clip.assetName) details.push(`素材 ${clip.assetName}`)
  if (clip.kind === 'animation') details.push(`源码 ${clip.codeLanguage || 'html'}`)
  if (clip.kind === 'motion' && clip.motionId) details.push(`动效工程 motionId=${clip.motionId}`)
  if (clip.scope === 'track') details.push('选择粒度=整条轨道')
  else if (clip.scope === 'element') details.push('选择粒度=元素级')
  else details.push('选择粒度=整段')
  if (clip.motionElements?.length) details.push(`主画面选中 ${clip.motionElements.length} 个元素（已标注所属模块、画面位置与源码行号）`)
  const volume = percent(clip.volume)
  if (volume) details.push(`音量 ${volume}`)
  const opacity = percent(clip.opacity)
  if (opacity) details.push(`不透明度 ${opacity}`)
  return `${index + 1}. ${details.join('｜')}`
}

function clipNoteLine(clip: AgentClipRef): string {
  const note = typeof clip.note === 'string'
    ? clip.note.replace(/\r?\n+/g, '；').replace(/[ \t]+/g, ' ').trim()
    : ''
  return note ? `   修改意见：${note}` : ''
}

function motionElementIdentity(element: AgentMotionElementRef): string {
  return element.hfId ? `hf:${element.hfId}` : element.id ? `id:${element.id}` : `selector:${element.selector}`
}

function motionElementBounds(element: AgentMotionElementRef): string {
  const box = element.boundingBox
  if (!box) return ''
  return `x=${Math.round(box.x)}, y=${Math.round(box.y)}, ${Math.round(box.width)}×${Math.round(box.height)}`
}

/** 元素清单必须能回答三件事：属于哪个部分、在画面哪里、只改哪一个 selector。 */
function motionElementLines(clip: AgentClipRef): string {
  const elements = clip.motionElements || []
  if (!elements.length) return ''
  const edits = clip.motionElementEdits?.length
    ? clip.motionElementEdits
    : clip.note?.trim()
      ? [{ note: clip.note.trim(), elements }]
      : []
  const lineFor = (element: AgentMotionElementRef, index: number): string => {
    const key = motionElementIdentity(element)
    const requested = edits
      .filter((edit) => edit.elements.some((target) => motionElementIdentity(target) === key))
      .map((edit) => edit.note.trim())
      .filter(Boolean)
    const bounds = motionElementBounds(element)
    return [
      `   选中元素 ${index + 1}：${element.label}（tag=${element.tagName}｜sourceFile=${element.sourceFile}）`,
      `      所属镜头：${element.sectionLabel || '当前画面'}${element.sectionId ? `｜id=${element.sectionId}` : ''}${element.sectionSelector ? `｜${element.sectionSelector}` : ''}`,
      element.moduleLabel || element.modulePath
        ? `      所属模块：${element.moduleLabel || '未命名容器'}${element.moduleSelector ? `（${element.moduleSelector}）` : ''}${element.modulePath ? `｜层级 ${element.modulePath}` : ''}`
        : '',
      element.region ? `      画面位置：${element.region}${bounds ? `｜${bounds}` : ''}` : '',
      element.parentPath ? `      父级结构：${element.parentPath}` : '',
      element.hfId ? `      data-hf-id=${element.hfId}` : '',
      element.id ? `      id=${element.id}` : '',
      `      selector=${element.selector}`,
      `      选择时 motionTime=${element.selectedAtMotionTime.toFixed(2)}s`,
      element.textContent ? `      当前文本=${element.textContent}` : '',
      element.src ? `      当前素材=${element.src}` : '',
      requested.length ? `      本轮要求：${[...new Set(requested)].join('；')}` : '',
      element.sourceLine
        ? `      源码位置：${element.sourceFile} 第 ${element.sourceLine} 行（已给出原文，直接用 write_motion_project 的 patch 改这一段，不要整份重读）`
        : '',
      element.sourceExcerpt
        ? `      源码片段（可直接作为 patch 的 find）：\n\`\`\`\`html\n${element.sourceExcerpt}\n\`\`\`\``
        : '',
      '      只允许修改这个元素及其直接动画，不得改动其他元素；同名文案必须按上面的所属模块与 selector 区分，禁止全局替换。',
    ].filter(Boolean).join('\n')
  }
  const bound = elements.map(lineFor).join('\n')
  const unmatched = edits
    .filter((edit) => edit.note.trim())
    .filter((edit) => !edit.elements.some((target) =>
      elements.some((element) => motionElementIdentity(element) === motionElementIdentity(target))))
    .map((edit) => edit.note.trim())
  const unbound = unmatched.length
    ? `   未匹配到当前元素的意见（先按所属镜头与模块核对目标，禁止按文本全局替换）：\n${[...new Set(unmatched)].map((note) => `      - ${note}`).join('\n')}`
    : ''
  return [bound, unbound].filter(Boolean).join('\n')
}

/** 追加到用户消息后面的选中片段清单；没有选中片段时返回空字符串。 */
export function describeClipContext(clips?: AgentClipRef[]): string {
  if (!clips?.length) return ''
  const animationOnly = clips.every((clip) => clip.kind === 'animation')
  const motionOnly = clips.every((clip) => clip.kind === 'motion')
  const trackScoped = clips.every((clip) => clip.scope === 'track')
  const elementScoped = clips.some((clip) => clip.scope === 'element')
  const scopeRule = trackScoped
    ? '本轮是轨道级修改：用户点选的是整条轨道，可以统一调整这条轨道上的全部片段；不要改动其他轨道。'
    : elementScoped
      ? '本轮是元素级修改：只允许改动点选的元素本身及其直接动画，禁止改动同片段里未选中的元素，也禁止整段重做；'
        + '如果用户没有写具体意见，先针对这些元素给出小范围建议。'
      : '本轮是片段级修改：可以调整所选片段的整体内容与参数，但不要改动未选中的片段。'
  const lines = [
    `[选中片段 · 只改这些] 用户在本轮选中了 ${clips.length} 个片段，请只针对下面的片段回答和修改；`,
    '不要改动未选中的片段，也不需要重做整支片。带「修改意见」的片段优先按那条意见处理，',
    '每条修改意见只作用于它所属的片段。',
    scopeRule,
    animationOnly
      ? '代码动画必须返回 onestep-animation 完整源码补丁，clipId 必须使用下面的 id；禁止生成图片或视频。'
      : motionOnly
        ? '动效工程优先按上下文给出的源码行号 / 原文片段，用 write_motion_project 的 mode=patch 直接改那一段；'
          + '缺少上下文时才用 read_motion_project 的 query 或 offset/limit 定点补读，禁止整份反复重读，也禁止改用文生视频重做。'
          + '同一工程可以同时包含多条元素级修改：逐条在最新源码上叠加，保留此前已经改过的所有元素，'
          + '禁止只保留最后一条意见，也禁止把工程恢复到初始版本。'
          + '带「选中元素」时，必须按「所属镜头 + 所属模块 + selector + data-hf-id」逐个定位；'
          + '不同部分里的同名元素只改意见对应的那一个，禁止按文案全局替换，也不得给未选元素加动画。'
        : '需要移动 / 裁剪 / 删除 / 调音量时，使用 onestep-timeline 操作块，clipId 必须使用下面的 id：',
    ...clips.flatMap((clip, index) => {
      const hasElementEdits = !!clip.motionElements?.length
      const note = hasElementEdits ? '' : clipNoteLine(clip)
      const source = clip.kind === 'animation' && clip.code
        ? `   原始${clip.codeLanguage || 'html'}源码（在此基础上修改，不要重写为视频提示词）：\n${clip.code}`
        : ''
      const elements = motionElementLines(clip)
      return [clipLine(clip, index), note, elements, source].filter(Boolean)
    }),
  ]
  return lines.join('\n')
}

/** 选中片段里可以给模型看的图：图片片段用原图，视频片段用封面，最多 6 张。 */
export function collectClipImages(clips?: AgentClipRef[]): string[] {
  if (!clips?.length) return []
  const urls: string[] = []
  for (const clip of clips) {
    if (clip.thumbnail) urls.push(clip.thumbnail)
    else if (clip.kind === 'image' && clip.url) urls.push(clip.url)
  }
  return [...new Set(urls)].slice(0, 6)
}

/** 写进本地存储前收敛体积：长 data URL 只保留封面。 */
export function persistableClip(clip: AgentClipRef): AgentClipRef {
  const next: AgentClipRef = { ...clip }
  if (next.url?.startsWith('data:') && next.url.length > 380_000) next.url = ''
  if (next.url?.startsWith('blob:')) next.url = ''
  if (next.thumbnail?.startsWith('data:') && next.thumbnail.length > 380_000) {
    next.thumbnail = ''
  }
  // 源码片段只用于本轮定位，不把整段 HTML 长期写进本地会话存储。
  if (next.motionElements?.length) {
    next.motionElements = next.motionElements.map((element) => ({
      ...element,
      sourceExcerpt: element.sourceExcerpt && element.sourceExcerpt.length > 1_100
        ? element.sourceExcerpt.slice(0, 1_100)
        : element.sourceExcerpt,
    }))
  }
  return next
}
