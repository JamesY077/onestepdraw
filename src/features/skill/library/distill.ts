/**
 * 长内容蒸馏：把书稿、长视频转写、播客、课程笔记变成可执行的 Skill。
 *
 * 方法来源：cangjie-skill 的 RIA-TV++（整体理解 → 方法单元 → 三重验证 → 写成 Skill），
 * 这里把多阶段流水线压成一次文本模型调用，更适合本地应用里的即时使用。
 */

import { chatCompletion } from '@/api/aiping'
import { buildTextExtraBody } from '@/models/text'
import { parseSkillContent } from '@/features/skill/parse'
import {
  resolveArtSkillsBackendModel,
  type ArtSkillsModelPreference,
} from '@/features/skill/models'
import type { ChatMessage } from '@/types/api'
import type { SkillSourceType } from './types'

/** 一次最多接受的原文长度；超出部分截断并在提示里说明。 */
export const DISTILL_MAX_INPUT_CHARS = 26000

export interface DistillInput {
  /** 来源标题，例如《影响力》第 3 章、某期播客。 */
  title: string
  sourceType: SkillSourceType
  /** 原文：书稿节选、视频转写、播客文字稿、课程笔记。 */
  text: string
  /** 可选：希望蒸馏出的能力主要服务什么场景。 */
  focus?: string
  modelPreference?: ArtSkillsModelPreference | null
}

export interface DistilledSkillDraft {
  name: string
  summary: string
  content: string
}

export interface DistillResult {
  drafts: DistilledSkillDraft[]
  backendModel: string
}

const SOURCE_LABELS: Record<SkillSourceType, string> = {
  book: '书籍 / 书稿',
  video: '长视频转写',
  podcast: '播客文字稿',
  course: '课程讲义',
  article: '长文 / 资料集',
  github: 'GitHub 资料',
}

const DISTILL_SYSTEM_PROMPT = `你是步帧的「内容蒸馏器」，方法来自 cangjie-skill 的 RIA-TV++。

你的任务：把用户给的一段长内容，蒸馏成 1–3 个**可执行的 Agent Skill**。
这不是书摘、读后感、摘要，也不是扮演作者。只保留「换一个人拿到也能照做」的能力。

## 蒸馏流程（在内部完成，不要输出过程）

1. 整体理解：核心命题、论证结构、适用对象、前提条件、作者没解决的问题。
2. 抽方法单元：只抽决策框架、操作流程、判断规则（阈值/信号/反例）、清单、模板。故事与金句只作解释材料。
3. 三重验证：可执行？有边界？可复用？三条都过才写成 Skill；只过一条的降级为「参考」，不要硬凑。
4. 写成 Skill：每份都必须包含何时使用、输入、步骤、输出格式、检查清单、反例/边界。
5. 收口：标出来源与局限，不复制原文长段。

## 输出契约

- 只输出 Markdown，不要解释、不要前言、不要代码围栏包裹整份文档。
- 每个 Skill 以 YAML frontmatter 开头：

---
name: 中文名（不超过 12 个字）
description: 一句话说明什么时候该用这个 Skill
---

- 每个 Skill 的结构固定为：

# 名称

## 何时使用
## 输入
## 步骤
## 输出格式
## 检查清单
## 反例 / 边界

- 步骤 3–7 步，每步都能直接执行；不写「深入分析」「综合考虑」。
- 规则尽量带条件、阈值或判断信号。
- 一个 Skill 只解决一类问题；能力太多就拆成多个。
- 多个 Skill 之间必须用单独一行 \`<<<SKILL>>>\` 分隔，最多 3 个。
- 不要输出除 Skill 文档以外的任何内容。

## 硬性边界

- 不编造原文没有的数据、案例或结论。
- 不把作者个人经历当成普适方法。
- 不复制受版权保护的长段落，用你自己的话重写方法与步骤。
- 材料不足以支撑一个可执行 Skill 时，输出 1 个「资料不足」说明型 Skill，写清缺什么，而不是硬编。`

function stripThinkingBlocks(content: string): string {
  return content
    .replace(/<(?:think|thinking|reasoning)\b[^>]*>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, '')
    .trim()
}

function stripOuterFence(content: string): string {
  const trimmed = content.trim().replace(/^\uFEFF/, '')
  const match = trimmed.match(/^```(?:markdown|md)?[ \t]*\r?\n/)
  if (!match) return trimmed
  return trimmed.slice(match[0].length).replace(/\r?\n?```[ \t]*$/, '').trim()
}

function normalizeSection(raw: string): string {
  const withoutFence = stripOuterFence(stripThinkingBlocks(raw))
  const lines = withoutFence.split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*---\s*$/.test(line))
  if (start >= 0) return lines.slice(start).join('\n').trim()
  const heading = lines.findIndex((line) => /^#\s+/.test(line))
  if (heading >= 0) return lines.slice(heading).join('\n').trim()
  return withoutFence
}

/** 把模型输出拆成多份 Skill，并抽取展示用的名称与简介。 */
export function parseDistilledOutput(raw: string): DistilledSkillDraft[] {
  const sections = raw
    .split(/\n\s*<<<SKILL>>>\s*\n/)
    .map(normalizeSection)
    .filter((section) => section.length > 40)

  const drafts: DistilledSkillDraft[] = []
  const seen = new Set<string>()
  for (const content of sections) {
    const parsed = parseSkillContent(content, 'distilled-skill.md')
    const name = parsed.name.trim().slice(0, 24) || '未命名 Skill'
    if (seen.has(name)) continue
    seen.add(name)
    const summary =
      parsed.description && !parsed.description.startsWith('已加载 Skill 规范')
        ? parsed.description.trim().slice(0, 140)
        : '从长内容中蒸馏出的可执行 Skill。'
    drafts.push({ name, summary, content })
    if (drafts.length >= 3) break
  }
  return drafts
}

export async function distillSkillPackage(input: DistillInput): Promise<DistillResult> {
  const title = input.title.trim() || '未命名内容'
  const rawText = input.text.trim()
  if (rawText.length < 200) {
    throw new Error('原文太短，至少粘贴 200 字，才能抽出可执行的方法。')
  }
  const truncated = rawText.slice(0, DISTILL_MAX_INPUT_CHARS)
  const backendModel = resolveArtSkillsBackendModel(input.modelPreference)
  const focus = input.focus?.trim()

  const userPrompt = [
    `来源标题：${title}`,
    `来源类型：${SOURCE_LABELS[input.sourceType]}`,
    focus ? `希望重点服务：${focus}` : '',
    rawText.length > truncated.length
      ? `（原文过长，已截取前 ${DISTILL_MAX_INPUT_CHARS} 字；请在局限里说明这一点。）`
      : '',
    '',
    '原文如下：',
    '<<<',
    truncated,
    '>>>',
    '',
    '请按输出契约蒸馏成 1–3 个可执行 Skill。',
  ]
    .filter(Boolean)
    .join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: DISTILL_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]

  const extraBody = buildTextExtraBody(backendModel)
  if (backendModel.toLowerCase().startsWith('deepseek')) {
    extraBody.enable_thinking = false
  }

  const raw = await chatCompletion({
    model: backendModel,
    messages,
    temperature: 0.4,
    max_tokens: 3200,
    extra_body: extraBody,
  })

  const drafts = parseDistilledOutput(raw)
  if (!drafts.length) {
    throw new Error('没有解析到可用的 Skill，请补充更完整的原文后重试。')
  }
  return { drafts, backendModel }
}
