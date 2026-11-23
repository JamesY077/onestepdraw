import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { BUILTIN_DISTILLED_SKILLS } from '@/features/skill/library/builtin'
import type {
  DistilledSkill,
  SkillChannel,
  SkillSourceType,
} from '@/features/skill/library/types'
import type { DistilledSkillDraft } from '@/features/skill/library/distill'
import { MAX_ACTIVE_SKILLS, useSkillStore } from '@/stores/skillStore'

const USER_SKILLS_KEY = 'onestep_distilled_skills_v1'
const MAX_USER_SKILLS = 30
const MAX_CONTENT_CHARS = 30000

export type SkillActivation = 'added' | 'duplicate' | 'full'

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `distill_${crypto.randomUUID()}`
  }
  return `distill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeSkill(raw: any): DistilledSkill | null {
  if (!raw || typeof raw.name !== 'string' || typeof raw.content !== 'string') return null
  const content = raw.content.trim().slice(0, MAX_CONTENT_CHARS)
  if (!content) return null
  const channels: SkillChannel[] = Array.isArray(raw.channels)
    ? raw.channels.filter((item: unknown): item is SkillChannel =>
        ['chat', 'image', 'video', 'copy'].includes(String(item)),
      )
    : ['chat', 'copy']
  return {
    id: typeof raw.id === 'string' ? raw.id : makeId(),
    name: raw.name.trim().slice(0, 24) || '未命名 Skill',
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 160) : '',
    sourceType: (['book', 'video', 'podcast', 'course', 'article', 'github'] as SkillSourceType[]).includes(
      raw.sourceType,
    )
      ? raw.sourceType
      : 'article',
    sourceTitle: typeof raw.sourceTitle === 'string' ? raw.sourceTitle.slice(0, 80) : '我的蒸馏',
    origin: typeof raw.origin === 'string' ? raw.origin : undefined,
    license: typeof raw.license === 'string' ? raw.license : undefined,
    channels: channels.length ? channels : ['chat', 'copy'],
    domains: Array.isArray(raw.domains)
      ? raw.domains.filter((item: unknown) => typeof item === 'string').slice(0, 6)
      : ['我的蒸馏'],
    skillCount: 1,
    content,
    kind: 'user',
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

function loadUserSkills(): DistilledSkill[] {
  try {
    const raw = localStorage.getItem(USER_SKILLS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeSkill)
      .filter((item): item is DistilledSkill => !!item)
      .slice(0, MAX_USER_SKILLS)
  } catch {
    return []
  }
}

export const useSkillLibraryStore = defineStore('skillLibrary', () => {
  const userSkills = ref<DistilledSkill[]>(loadUserSkills())

  const allSkills = computed<DistilledSkill[]>(() => [
    ...userSkills.value,
    ...BUILTIN_DISTILLED_SKILLS,
  ])

  function persist() {
    try {
      localStorage.setItem(
        USER_SKILLS_KEY,
        JSON.stringify(
          userSkills.value.slice(0, MAX_USER_SKILLS).map((skill) => ({
            ...skill,
            content: skill.content.slice(0, MAX_CONTENT_CHARS),
          })),
        ),
      )
    } catch {
      // 内容过大时忽略持久化，当前会话仍然可用。
    }
  }

  /** 保存一组蒸馏结果，返回实际新增数量。 */
  function saveDrafts(
    drafts: DistilledSkillDraft[],
    meta: { sourceTitle: string; sourceType: SkillSourceType; domains?: string[] },
  ): number {
    let added = 0
    for (const draft of drafts) {
      const exists = userSkills.value.some((skill) => skill.name === draft.name)
      if (exists) continue
      userSkills.value.unshift({
        id: makeId(),
        name: draft.name,
        summary: draft.summary,
        sourceType: meta.sourceType,
        sourceTitle: meta.sourceTitle,
        origin: '本地蒸馏',
        license: '用户自有',
        channels: ['chat', 'copy', 'video'],
        domains: meta.domains?.length ? meta.domains : ['我的蒸馏'],
        skillCount: 1,
        content: draft.content.slice(0, MAX_CONTENT_CHARS),
        kind: 'user',
        createdAt: Date.now(),
      })
      added += 1
      if (userSkills.value.length > MAX_USER_SKILLS) {
        userSkills.value = userSkills.value.slice(0, MAX_USER_SKILLS)
      }
    }
    persist()
    return added
  }

  function removeSkill(id: string) {
    userSkills.value = userSkills.value.filter((skill) => skill.id !== id)
    persist()
  }

  /** 把 Skill 加入生成页的已启用列表（最多 3 个）。 */
  function activate(skill: DistilledSkill): SkillActivation {
    const skillStore = useSkillStore()
    if (skillStore.activeSkills.some((item) => item.name === skill.name)) return 'duplicate'
    if (skillStore.activeSkills.length >= MAX_ACTIVE_SKILLS) return 'full'
    const added = skillStore.addActiveSkillFromContent(skill.content, `${skill.name}.md`)
    return added ? 'added' : 'duplicate'
  }

  function isActive(skill: DistilledSkill): boolean {
    return useSkillStore().activeSkills.some((item) => item.name === skill.name)
  }

  return {
    userSkills,
    allSkills,
    saveDrafts,
    removeSkill,
    activate,
    isActive,
  }
})
