/**
 * 内置「蒸馏 Skill」库。
 *
 * 这些 Skill 是把书、长视频、播客、课程里的方法论重新写成可执行规范后的结果，
 * 不是书摘：每份都包含何时使用、步骤、输出格式、检查清单与反例。
 * 蒸馏方法参考 cangjie-skill 的 RIA-TV++，Skill 正文存放在 skills/library/ 下。
 */

import videoScriptSkill from '../../../../skills/video-script/SKILL.md?raw'
import type { DistilledSkill, SkillChannel, SkillSourceType } from './types'

const libraryModules = import.meta.glob('../../../../skills/library/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readLibrary(file: string): string {
  const key = Object.keys(libraryModules).find((path) => path.endsWith(`/${file}`))
  return key ? libraryModules[key] : ''
}

const SHORT_VIDEO_SCRIPT = videoScriptSkill

interface BuiltinMeta {
  id: string
  name: string
  summary: string
  sourceType: SkillSourceType
  sourceTitle: string
  origin?: string
  license?: string
  channels: SkillChannel[]
  domains: string[]
  /** 读取 skills/library 下的文件；省略时使用单独导入的正文。 */
  file?: string
  content?: string
}

const BUILTIN_META: BuiltinMeta[] = [
  {
    id: 'short-video-script',
    name: '短视频脚本导演',
    summary: '把一句话变成可执行分镜：先定命题与落点，再拆镜头、写每镜提示词、按镜生成。',
    sourceType: 'github',
    sourceTitle: 'grill-me + video-director',
    origin: 'https://github.com/win4r/video-director',
    license: 'MIT',
    channels: ['video', 'chat', 'copy'],
    domains: ['视频', '脚本', '分镜'],
    content: SHORT_VIDEO_SCRIPT,
  },
  {
    id: 'viral-copywriting',
    name: '爆款文案',
    summary: '标题钩子、证据链、价值主张与单一行动指令，专治「没人看完」。',
    sourceType: 'book',
    sourceTitle: '《爆款文案》',
    license: 'MIT',
    channels: ['copy', 'video', 'chat'],
    domains: ['写作', '营销'],
    file: 'viral-copywriting.md',
  },
  {
    id: 'contagious-stepps',
    name: '疯传 STEPPS',
    summary: '用社交货币、诱因、情绪、公共性、实用价值与故事诊断传播方案。',
    sourceType: 'book',
    sourceTitle: '《疯传》',
    license: 'MIT',
    channels: ['copy', 'video', 'chat'],
    domains: ['传播', '营销'],
    file: 'contagious-stepps.md',
  },
  {
    id: 'influence-persuasion',
    name: '影响力设计',
    summary: '七个说服机制 + 反操控检查，写提案与销售页时知道边界在哪。',
    sourceType: 'book',
    sourceTitle: '《影响力》',
    license: 'MIT',
    channels: ['copy', 'chat', 'video'],
    domains: ['心理', '沟通'],
    file: 'influence-persuasion.md',
  },
  {
    id: 'first-principles',
    name: '第一性原理',
    summary: '拆到硬约束，识别继承来的默认假设，再从基本事实重建方案。',
    sourceType: 'book',
    sourceTitle: '《第一性原理》',
    license: 'MIT',
    channels: ['chat', 'copy'],
    domains: ['认知', '创新'],
    file: 'first-principles.md',
  },
  {
    id: 'multidisciplinary-models',
    name: '多元思维模型',
    summary: '能力圈、逆向、安全边际、机会成本、复利与误判心理的决策清单。',
    sourceType: 'book',
    sourceTitle: '《穷查理宝典》',
    license: 'MIT',
    channels: ['chat', 'copy'],
    domains: ['决策', '投资'],
    file: 'multidisciplinary-models.md',
  },
  {
    id: 'ai-project-canvas',
    name: 'AI 项目评估',
    summary: '七格画布判断一个 AI 机会值不值得做，并给出两周可证伪的试点。',
    sourceType: 'course',
    sourceTitle: '吴恩达《AI for Everyone》',
    license: 'MIT',
    channels: ['chat', 'copy'],
    domains: ['AI', '商业'],
    file: 'ai-project-canvas.md',
  },
  {
    id: 'system-prompt-design',
    name: '系统提示词设计',
    summary: '角色、目标、步骤、工具、输出格式、边界与失败处理的可评测写法。',
    sourceType: 'github',
    sourceTitle: 'system-prompt-skills',
    origin: 'https://github.com/kangarooking/cangjie-skill',
    license: 'MIT',
    channels: ['chat', 'copy'],
    domains: ['AI', '提示词'],
    file: 'system-prompt-design.md',
  },
  {
    id: 'thousand-true-fans',
    name: '1000 个铁粉',
    summary: '为个人品牌设计直接关系：内容支柱、最小产品与复购路径。',
    sourceType: 'book',
    sourceTitle: '《1000 个铁粉》',
    license: 'MIT',
    channels: ['chat', 'copy', 'video'],
    domains: ['创作者', '商业'],
    file: 'thousand-true-fans.md',
  },
  {
    id: 'cangjie-distill',
    name: '内容蒸馏',
    summary: '把书、长视频、播客蒸馏成可调用 Skill：整体理解、方法单元、三重验证。',
    sourceType: 'github',
    sourceTitle: 'cangjie-skill · RIA-TV++',
    origin: 'https://github.com/kangarooking/cangjie-skill',
    license: 'MIT',
    channels: ['chat', 'copy'],
    domains: ['方法论', '蒸馏'],
    file: 'cangjie-distill.md',
  },
]

export const BUILTIN_DISTILLED_SKILLS: DistilledSkill[] = BUILTIN_META.map((meta) => ({
  id: meta.id,
  name: meta.name,
  summary: meta.summary,
  sourceType: meta.sourceType,
  sourceTitle: meta.sourceTitle,
  origin: meta.origin,
  license: meta.license,
  channels: meta.channels,
  domains: meta.domains,
  skillCount: 1,
  content: meta.content || readLibrary(meta.file || ''),
  kind: 'builtin' as const,
}))
