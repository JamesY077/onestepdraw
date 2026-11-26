import { OPENMOTION_TEMPLATES } from '@/features/template/openmotionCatalog'
import { openMotionTags, type OpenMotionTemplate } from '@/features/template/openmotionTypes'
import { fetchMotionText, motionAssetUrl } from '@/api/motion'
import { useMotionStore } from '@/stores/motionStore'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { AgentToolCall } from './tools'
import type { AgentConversation } from '@/types/agent'

const MAX_DOC_CHARS = 16_000
const MAX_SOURCE_CHARS = 80_000

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
  timeline: { allowedClipIds?: Set<string> },
): Promise<unknown> {
  const motion = useMotionStore()
  const projects = useEditProjectStore()

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
    if (!conversation.projectId) throw new Error('当前对话没有关联剪辑项目，无法把动效工程放入时间轴。')
    const template = call.args.templateId ? findTemplate(call.args.templateId) : undefined
    const name = String(call.args.name || template?.name || '未命名动效').slice(0, 80)
    const project = await motion.create({
      name,
      template,
      width: template?.width,
      height: template?.height,
    })
    const source = typeof call.args.source === 'string' ? call.args.source.trim() : ''
    if (source) await motion.saveSource(project.id, source)
    const clip = projects.appendAsset(
      conversation.projectId,
      {
        kind: 'motion',
        name,
        url: project.entryUrl || '',
        motionId: project.id,
        thumbnail: template ? motionAssetUrl(template.cover) : undefined,
        source: 'chat',
      },
      {
        at: typeof call.args.at === 'number' ? call.args.at : undefined,
        duration: template?.duration || undefined,
      },
    )
    return {
      ok: true,
      motionId: project.id,
      clipId: clip?.id,
      entryUrl: project.entryUrl,
      missingFiles: project.missingFiles || [],
      message: '动效工程已入轨。改文案与动效用 read_motion_project / write_motion_project；要出片再 render_motion_project。',
    }
  }

  if (call.name === 'read_motion_project') {
    const motionId = String(call.args.motionId || '').trim()
    if (!motionId) throw new Error('缺少 motionId。')
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
    const state = await motion.saveSource(motionId, source)
    return {
      ok: true,
      motionId,
      variables: state.variables,
      message: '工程已写回磁盘，预览会重新加载。未渲染 MP4；需要出片时再调用 render_motion_project。',
    }
  }

  if (call.name === 'render_motion_project') {
    const motionId = String(call.args.motionId || '').trim()
    if (!motionId) throw new Error('缺少 motionId。')
    const url = await motion.render(motionId)
    let replacedClipId = ''
    if (conversation.projectId) {
      const project = projects.getProject(conversation.projectId)
      const candidates = project
        ? project.tracks.flatMap((track) => track.clips).filter((clip) => clip.motionId === motionId)
        : []
      const requested = String(call.args.clipId || '')
      const target = candidates.find((clip) => clip.id === requested) || candidates[0]
      if (target) {
        if (timeline.allowedClipIds && !timeline.allowedClipIds.has(target.id)) {
          throw new Error('已阻止替换未选中的片段；MP4 已渲染完成，可手动放回时间轴。')
        }
        projects.replaceMotionClipWithVideo(conversation.projectId, target.id, {
          url,
          name: target.name,
          duration: target.duration,
        })
        replacedClipId = target.id
      }
    }
    return { ok: true, url, clipId: replacedClipId, message: 'MP4 已渲染完成。' }
  }

  throw new Error(`未知的动效工具：${call.name}`)
}
