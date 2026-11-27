import { OPENMOTION_TEMPLATES } from '@/features/template/openmotionCatalog'
import { openMotionTags, type OpenMotionTemplate } from '@/features/template/openmotionTypes'
import { fetchMotionText, motionAssetUrl, checkMotionProject } from '@/api/motion'
import { useMotionStore } from '@/stores/motionStore'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { AgentToolCall } from './tools'
import type { AgentConversation, AgentProduction } from '@/types/agent'
import { aspectSize } from '@/types/edit'

const MAX_DOC_CHARS = 16_000
const MAX_SOURCE_CHARS = 80_000
/** 单次工具参数过大很容易撞上模型输出上限；超过这个长度必须分块写入。 */
const MAX_SINGLE_WRITE_CHARS = 24_000

export function motionDimensions(production: Pick<AgentProduction, 'aspectRatio' | 'resolution'>) {
  const base = aspectSize(production.aspectRatio)
  const scale = production.resolution === '2K' ? 2 : production.resolution === '1080P' ? 1.5 : 1
  return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) }
}

function normalizeAssetReference(value: string) {
  const withoutQuery = value.trim().split(/[?#]/, 1)[0]
  try {
    return decodeURIComponent(withoutQuery).replace(/^\.\//, '')
  } catch {
    return withoutQuery.replace(/^\.\//, '')
  }
}

/** 只接受真实媒体元素属性；注释或 JS 字符串里出现路径不算引用。 */
export function motionSourceAssetReferences(source: string): Set<string> {
  const references = new Set<string>()
  const html = source.replace(/<!--[\s\S]*?-->/g, '')
  const tags = html.match(/<(?:img|video|audio|source|image|use)\b[^>]*>/gi) || []
  for (const tag of tags) {
    const attributes = tag.matchAll(/(?:src|srcset|href|xlink:href|data-var-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)
    for (const match of attributes) {
      const value = match[1] || match[2] || match[3] || ''
      for (const candidate of value.split(',')) {
        const url = candidate.trim().split(/\s+/, 1)[0]
        if (url) references.add(normalizeAssetReference(url))
      }
    }
  }
  return references
}

export function motionSourceHasAsset(source: string, path: string): boolean {
  return motionSourceAssetReferences(source).has(normalizeAssetReference(path))
}

/**
 * 找源码里的根合成。官方模板的 data-composition-id 不一定是 `main`
 * （如 `google-salsa-089`），只看 main 会把完整模板误判成缺画幅。
 * 优先 main，其次第一个带画幅的合成，最后退回第一个合成。
 */
export function motionRootComposition(source: string) {
  const html = String(source || '')
  const candidates: Array<{ tag: string; width: number; height: number; id: string }> = []
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b[^>]*\bdata-composition-id\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0]
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || ''
    candidates.push({
      tag,
      id: match[2],
      width: Number(attr('data-width')) || 0,
      height: Number(attr('data-height')) || 0,
    })
  }
  return candidates.find((item) => item.id.toLowerCase() === 'main') ||
    candidates.find((item) => item.width && item.height) ||
    candidates[0]
}

function activeAnimationShot(conversation: AgentConversation) {
  const production = conversation.production
  if (production?.engine !== 'animation' || production.status !== 'running') return undefined
  return production.shots.find((shot) => shot.status === 'running')
}

function validateShotSource(
  source: string,
  shot: ReturnType<typeof activeAnimationShot>,
  conversation: AgentConversation,
) {
  if (!shot) return
  const htmlWithoutComments = source.replace(/<!--[\s\S]*?-->/g, '')
  if (shot.motionId && !htmlWithoutComments.includes(shot.id)) throw new Error(`${shot.id} 源码必须保留镜号标记 ${shot.id}。`)
  const production = conversation.production
  if (production) {
    const expected = motionDimensions(production)
    const composition = motionRootComposition(htmlWithoutComments)
    const width = composition?.width || 0
    const height = composition?.height || 0
    // 可编辑模板可能本来就是竖屏/其他画幅；预览与导出都用 contain 等比缩放，
    // 保留模板原画幅比强行拉伸更安全。只允许「制作单画幅」或「本镜模板画幅」。
    const nativeWidth = Number(shot.motionWidth) || 0
    const nativeHeight = Number(shot.motionHeight) || 0
    const matchesProduction = width === expected.width && height === expected.height
    const matchesTemplate = nativeWidth > 0 && nativeHeight > 0 && width === nativeWidth && height === nativeHeight
    if (!matchesProduction && !matchesTemplate) {
      throw new Error(`${shot.id} 主 composition 必须为 data-width="${expected.width}" data-height="${expected.height}"（${production.aspectRatio} · ${production.resolution}），或沿用本镜模板画幅 ${nativeWidth || '?'}×${nativeHeight || '?'}。`)
    }
  }
  const missing = (shot.requiredAssetPaths || []).filter((path) => !motionSourceHasAsset(source, path))
  if (missing.length) throw new Error(`${shot.id} 未在真实媒体元素中引用用户原始素材：${missing.join('、')}。禁止近似重绘 Logo。`)
  if (shot.requiredAssetPaths?.length && /filter\s*:[^;}]*(?:invert|brightness\s*\(\s*0)/i.test(source)) {
    throw new Error(`${shot.id} 含有 invert / brightness(0) 滤镜，可能改变用户 Logo 原色，已拒绝写回。`)
  }
}

async function importMotionAsset(motionId: string, source: string, fileName = '') {
  const response = await fetch('/local/motion/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: motionId, source, fileName }),
  })
  const payload = await response.json()
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || '导入动效素材失败。')
  return payload
}

function findTemplate(id: unknown): OpenMotionTemplate {
  const key = String(id || '').trim()
  const template = OPENMOTION_TEMPLATES.find((item) => item.id === key)
  if (!template) throw new Error(`目录里没有模板 ${key || '(空)'}，请先用 list_motion_templates 检索。`)
  return template
}

function summarizeTemplate(template: OpenMotionTemplate) {
  return {
    id: template.id,
    name: template.name,
    summary: template.summary,
    tags: openMotionTags(template),
    duration: template.duration,
    editable: template.editable,
    brand: template.brand,
  }
}

/**
 * 动效工程相关工具。与普通生成工具分开：它们读写的是本地 HTML 工程，
 * 不调用任何付费生成接口；只有 render 会启动本机 CLI。
 */
export async function executeMotionTool(
  call: AgentToolCall,
  conversation: AgentConversation,
  timeline: { allowedClipIds?: Set<string>; allowedMotionIds?: Set<string> },
): Promise<unknown> {
  const motion = useMotionStore()
  const projects = useEditProjectStore()
  if (
    timeline.allowedMotionIds &&
    ['read_motion_project', 'write_motion_project', 'import_motion_asset', 'review_motion_project', 'render_motion_project'].includes(call.name) &&
    !timeline.allowedMotionIds.has(String(call.args.motionId || ''))
  ) {
    throw new Error('已阻止访问未选中的动效工程。')
  }

  if (call.name === 'list_motion_templates') {
    const query = String(call.args.query || '').trim().toLowerCase()
    const tag = String(call.args.tag || '').trim()
    const limit = Math.min(12, Math.max(1, Number(call.args.limit) || 6))
    const matches = OPENMOTION_TEMPLATES.filter((template) => {
      if (call.args.editableOnly && !template.editable) return false
      if (tag && !openMotionTags(template).includes(tag)) return false
      if (!query) return true
      return [template.name, template.summary, template.style, template.brand, template.reviewFocus, template.useCase, template.presentation]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    return {
      ok: true,
      total: matches.length,
      templates: matches.slice(0, limit).map(summarizeTemplate),
      message: '选定模板后用 read_motion_template 读取 motion.md 与复刻重点，再决定是否 create_motion_project。',
    }
  }

  if (call.name === 'read_motion_template') {
    const template = findTemplate(call.args.templateId)
    let document = ''
    let documentError = ''
    if (call.args.includeDocument !== false && template.motionDoc) {
      try {
        document = (await fetchMotionText(template.motionDoc)).slice(0, MAX_DOC_CHARS)
      } catch (error) {
        documentError = String((error as Error)?.message || error)
      }
    }
    return {
      ok: true,
      template: {
        ...summarizeTemplate(template),
        style: template.style,
        reviewFocus: template.reviewFocus,
        width: template.width,
        height: template.height,
        sourceUrl: template.sourceUrl,
        referenceVideo: motionAssetUrl(template.video),
        cover: motionAssetUrl(template.cover),
        files: template.files.map((file) => file.path),
      },
      motionDocument: document,
      documentError,
      message: template.editable
        ? '这条模板有可编辑工程，create_motion_project 会按文件清单复制成独立副本。'
        : '这条模板只有参考视频与动效说明：按镜头顺序、停留点与动效语言重建，不要承诺精确复刻。',
    }
  }

  if (call.name === 'create_motion_project') {
    if (timeline.allowedMotionIds) throw new Error('已阻止在元素级修改中创建未选中的动效工程。')
    if (!conversation.projectId) throw new Error('当前对话没有关联剪辑项目，无法把动效工程放入时间轴。')
    const shot = activeAnimationShot(conversation)
    if (shot?.motionId || shot?.clipId) throw new Error(`${shot.id} 已创建工程 ${shot.motionId || shot.clipId}，请继续写回源码，不要重复创建。`)
    if (shot) {
      if (Number(call.args.at) !== shot.timelineStart || Number(call.args.duration) !== shot.duration) {
        throw new Error(`${shot.id} 必须固定使用 at=${shot.timelineStart ?? 0}、duration=${shot.duration}，不得改变镜头槽位。`)
      }
    }
    if (shot && typeof call.args.source === 'string' && call.args.source.trim()) {
      throw new Error(`${shot.id} 请分两步执行：先 create_motion_project 获得 motionId 与素材路径，再 write_motion_project 写回完整源码。`)
    }
    const template = call.args.templateId ? findTemplate(call.args.templateId) : undefined
    const rawName = String(call.args.name || template?.name || '未命名动效').slice(0, 72)
    const name = shot ? `${shot.id} · ${rawName}` : rawName
    const dimensions = shot && conversation.production ? motionDimensions(conversation.production) : undefined
    const project = await motion.create({
      name,
      template,
      width: dimensions?.width || template?.width,
      height: dimensions?.height || template?.height,
      shotId: shot?.id,
    })
    const requiredAssetPaths: string[] = []
    let clipId = ''
    try {
      if (shot) {
        shot.motionId = project.id
        shot.motionWidth = Number(project.width) || undefined
        shot.motionHeight = Number(project.height) || undefined
        for (const source of shot.requiredAssetSources || []) {
          const imported = await importMotionAsset(project.id, source)
          requiredAssetPaths.push(String(imported.path))
        }
        shot.requiredAssetPaths = requiredAssetPaths
        // 可编辑模板副本已经是完整工程（画幅、镜号都注入过）；先记为可用，
        // 后续 write 会再校验一次，避免「只 create 没 write」被误判失败。
        if (project.sourceReady) shot.motionSourceReady = true
      }
      const source = typeof call.args.source === 'string' ? call.args.source.trim() : ''
      if (source) {
        validateShotSource(source, shot, conversation)
        await motion.saveSource(project.id, source)
        if (shot) shot.motionSourceReady = true
      }
      const shotTrack = shot ? projects.createTrack(conversation.projectId, 'video') : null
      const clip = projects.appendAsset(
        conversation.projectId,
        {
          kind: 'motion',
          name,
          url: project.entryUrl || '',
          motionId: project.id,
          source: 'chat',
        },
        {
          at: shot?.timelineStart ?? (typeof call.args.at === 'number' ? call.args.at : undefined),
          duration: shot?.duration || template?.duration || (typeof call.args.duration === 'number' ? call.args.duration : undefined),
          trackId: shotTrack?.id,
        },
      )
      if (!clip) throw new Error('时间轴片段创建失败。')
      clipId = clip.id
      if (shot) shot.clipId = clip.id
      return {
        ok: true,
        motionId: project.id,
        clipId: clip.id,
        shotId: shot?.id,
        requiredAssetPaths,
        entryUrl: project.entryUrl,
        missingFiles: project.missingFiles || [],
        message: requiredAssetPaths.length
          ? `工程已入轨。用户原始素材已复制到 ${requiredAssetPaths.join('、')}；write_motion_project 的源码必须真实引用这些路径，禁止重绘或改色。`
          : '动效工程已入轨。改文案与动效用 read_motion_project / write_motion_project；要出片再 render_motion_project。',
      }
    } catch (error) {
      // 创建、素材导入、源码写回和入轨是一个事务；任何一步失败都不留下孤儿工程或半入轨片段。
      if (clipId) projects.removeClip(conversation.projectId, clipId)
      if (shot) {
        shot.motionId = undefined
        shot.clipId = undefined
        shot.motionWidth = undefined
        shot.motionHeight = undefined
        shot.requiredAssetPaths = undefined
        shot.motionSourceReady = false
      }
      try {
        await motion.discard(project.id)
      } catch (rollbackError) {
        throw new Error(`${(error as Error)?.message || error}；工程回滚失败：${(rollbackError as Error)?.message || rollbackError}`)
      }
      throw error
    }
  }

  if (call.name === 'import_motion_asset') {
    const motionId = String(call.args.motionId || '').trim()
    const source = String(call.args.source || '').trim()
    if (!motionId || !source) throw new Error('需要 motionId 与上传素材地址 source。')
    const shot = activeAnimationShot(conversation)
    if (shot && shot.motionId !== motionId) throw new Error(`${shot.id} 只能导入到自己的工程 ${shot.motionId || '(尚未创建)'}。`)
    const payload = await importMotionAsset(motionId, source, String(call.args.fileName || ''))
    return {
      ...payload,
      message: `素材已复制到 ${payload.path}。请在 index.html 中使用这个相对路径，不要再调用图片/视频生成。`,
    }
  }

  if (call.name === 'read_motion_project') {
    const motionId = String(call.args.motionId || '').trim()
    if (!motionId) throw new Error('缺少 motionId。')
    const shot = activeAnimationShot(conversation)
    if (shot && shot.motionId && shot.motionId !== motionId) throw new Error(`${shot.id} 只能读取自己的工程 ${shot.motionId}。`)
    const state = await motion.load(motionId, true)
    if (!state.source) throw new Error(state.error || '读取工程失败。')
    return {
      ok: true,
      motionId,
      meta: state.meta,
      variables: state.variables,
      source: state.source.slice(0, MAX_SOURCE_CHARS),
      truncated: state.source.length > MAX_SOURCE_CHARS,
    }
  }

  if (call.name === 'write_motion_project') {
    const motionId = String(call.args.motionId || '').trim()
    const source = String(call.args.source || '')
    if (!motionId || !source.trim()) throw new Error('需要 motionId 与完整源码 source。')
    const shot = activeAnimationShot(conversation)
    if (shot && shot.motionId !== motionId) throw new Error(`${shot.id} 只能写回自己的工程 ${shot.motionId || '(尚未创建)'}。`)
    const mode = call.args.mode === 'append' ? 'append' : 'replace'
    const final = call.args.final === true

    if (mode === 'replace') {
      if (source.length > MAX_SINGLE_WRITE_CHARS) {
        throw new Error(
          `单次写回 ${source.length} 字符，超过安全上限 ${MAX_SINGLE_WRITE_CHARS}。`
          + ' 请先用 update_plan 把写回拆成阶段：第一次 mode=replace 写最小可运行骨架，'
          + '之后每次 mode=append 追加一块，最后一块传 final=true；不要一次塞入整份大源码。',
        )
      }
      validateShotSource(source, shot, conversation)
      const state = await motion.saveSource(motionId, source)
      if (shot) shot.motionSourceReady = true
      return {
        ok: true,
        motionId,
        mode,
        chars: source.length,
        variables: state.variables,
        message: '工程已写回磁盘，预览会重新加载。未渲染 MP4；需要出片时再调用 render_motion_project。',
      }
    }

    // append：每次只追加一段，最后一块再校验完整源码，避免半成品被当成成品。
    const state = await motion.load(motionId, true)
    if (!state.source?.trim()) throw new Error('append 之前必须先用 mode=replace 写入最小可运行骨架。')
    const combined = `${state.source}${source}`
    if (combined.length > MAX_SOURCE_CHARS) {
      throw new Error(`工程源码已达到 ${combined.length} 字符，超过 ${MAX_SOURCE_CHARS} 上限。请精简内容，不要继续追加内嵌大文件。`)
    }
    if (final) validateShotSource(combined, shot, conversation)
    const saved = await motion.saveSource(motionId, combined)
    if (shot && final) shot.motionSourceReady = true
    return {
      ok: true,
      motionId,
      mode,
      final,
      chars: combined.length,
      appended: source.length,
      variables: saved.variables,
      message: final
        ? '最后一块已追加并完成完整校验，工程可预览；继续用 review_motion_project 复查。'
        : `本次追加 ${source.length} 字符，当前共 ${combined.length} 字符。继续追加下一块；最后一块必须传 final=true。`,
    }
  }

  if (call.name === 'review_motion_project') {
    const motionId = String(call.args.motionId || '').trim()
    if (!motionId) throw new Error('缺少 motionId。')
    const report = await checkMotionProject(motionId, Number(call.args.samples) || 5)
    const actionable = report.findings
      .filter((finding) => finding.severity !== 'info')
      .slice(0, 24)
      .map((finding) => ({
        severity: finding.severity,
        stage: finding.stage,
        code: finding.code,
        message: finding.message,
        selector: finding.selector,
        time: finding.time,
      }))
    return {
      ok: report.passed,
      motionId,
      summary: report.summary,
      browserSkipped: report.browserSkipped,
      findings: actionable,
      message: report.ok
        ? '复查通过；没有 error 级问题。warning 可作为优化项，不必重写整份工程。'
        : '复查发现 error 级问题：请只在最新源码上修正对应元素（字体、安全区、重叠、对比度），修完再调用 review_motion_project；禁止重做整份工程或回退此前的修改。',
    }
  }

  if (call.name === 'render_motion_project') {
    const motionId = String(call.args.motionId || '').trim()
    if (!motionId) throw new Error('缺少 motionId。')
    // 模板工程可能长达几十秒；本镜只占时间轴的 duration 秒，
    // 只渲染这一段，避免为 5 秒镜头整段渲染 48 秒模板。
    const shot = activeAnimationShot(conversation)
    const end = shot && shot.motionId === motionId ? Number(shot.duration) || 0 : 0
    const url = await motion.render(motionId, end || undefined)
    // 时间轴固定使用 HyperFrames 实时工程预览：渲染只是导出产物，
    // 不再把片段换成 MP4 快照，避免某次空白/过期渲染长期占住轨道。
    return {
      ok: true,
      url,
      motionId,
      message: 'MP4 已渲染完成；时间轴仍使用实时工程预览，导出时按 motionId 现场出片。',
    }
  }

  throw new Error(`未知的动效工具：${call.name}`)
}
