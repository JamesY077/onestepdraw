import videoScriptSkill from '../../../skills/video-script/SKILL.md?raw'
import { buildAgentSystemPrompt } from './prompt'

/**
 * 创作对话默认挂载的指导 Skill。
 * 「短视频脚本导演」蒸馏自 grill-me + video-director：
 * 先一次一个问题问清创作者的真实意图，再拆镜头、写每镜提示词。
 */
export const CREATE_FLOW_SKILL_ID = 'short-video-script'
export const CREATE_FLOW_SKILL_NAME = '短视频脚本导演 · grill-me + video-director'
export const CREATE_FLOW_SKILL_CONTENT = videoScriptSkill

/** 把默认 Skill 拼进系统提示词；只对创作对话生效。 */
export function createFlowSystemPrompt(base: {
  automation: 'default' | 'auto'
  projectSummary?: string
  productionSummary?: string
  extraSkills?: Array<{ name: string; content: string }>
}): string {
  const skills = [
    { name: CREATE_FLOW_SKILL_NAME, content: CREATE_FLOW_SKILL_CONTENT },
    ...(base.extraSkills || []),
  ]
  return buildAgentSystemPrompt({
    mode: 'create',
    automation: base.automation,
    projectSummary: base.projectSummary,
    productionSummary: base.productionSummary,
    skills,
  })
}
