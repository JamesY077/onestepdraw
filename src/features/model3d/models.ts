/**
 * 3D 建模分区（V2Fun 系列）模型与参数注册表。
 *
 * 四个模型分属两条能力线：
 * - mesh   ：V2Fun 3D Flash / V2Fun 3D Pro，支持文生 3D、单图 3D、多视角 3D；
 * - motion ：V2Fun 视频动捕 Pro / Turbo，输入视频片段，输出人物动作数据（BVH）。
 *
 * 参数区间与字段名来自官方文档：
 *   https://aiping.cn/docs/API/v2fun-api
 */

export type Model3DKind = 'mesh' | 'motion'
export type MeshInputMode = 'text' | 'image' | 'multi'

export interface Model3DOption {
  /** 调用时传给 `model` 的平台模型名 */
  id: string
  displayName: string
  /** 卡片上的短名（去掉 V2Fun 前缀） */
  shortName: string
  kind: Model3DKind
  badge: string
  description: string
  /** 计费文案 */
  price: string
  /** 支持的能力标签 */
  tags: string[]
  /** 是否支持纹理细节参数（with_texture / hd / pbr） */
  textureOptions: boolean
  /** 动捕模型的计费秒数档位（3 秒一档） */
  motionUnitSeconds?: number
}

export const MODEL3D_OPTIONS: Model3DOption[] = [
  {
    id: 'V2Fun 3D Flash',
    displayName: 'V2Fun 3D Flash',
    shortName: '3D Flash',
    kind: 'mesh',
    badge: 'FAST',
    description: '分钟级出模，几何完整、结构稳定，适合快速预演与批量资产。',
    price: '按任务计费',
    tags: ['文生 3D', '单图 3D', '多视角', '纹理可选'],
    textureOptions: true,
  },
  {
    id: 'V2Fun 3D Pro',
    displayName: 'V2Fun 3D Pro',
    shortName: '3D Pro',
    kind: 'mesh',
    badge: 'PRO',
    description: '更高精度与纹理还原，适合影视、电商 3D 展示与 3D 打印。',
    price: '按任务计费',
    tags: ['文生 3D', '单图 3D', '多视角', '高清纹理'],
    textureOptions: true,
  },
]

export const DEFAULT_MODEL3D_ID = MODEL3D_OPTIONS[0].id

export function getModel3D(id: string | null | undefined): Model3DOption {
  return MODEL3D_OPTIONS.find((item) => item.id === id) || MODEL3D_OPTIONS[0]
}

/** 动捕计费区间：官方按 3 秒一档计费，这里限制单次 1~30 秒。 */
export const MOTION_DURATION_LIMITS = {
  min: 1,
  max: 30,
  step: 1,
  defaultValue: 3,
} as const

export interface PromptPreset {
  label: string
  prompt: string
}

/** 文生 3D 的示例提示词：偏向单体、结构清晰、便于重建。 */
export const MESH_PROMPT_PRESETS: PromptPreset[] = [
  {
    label: '宇航员',
    prompt: '一位宇航员，全身站立，双手自然下垂，头盔反光，白色宇航服细节清晰，写实质感。',
  },
  {
    label: '机械臂',
    prompt: '一台工业机械臂，六轴关节结构清晰，金属外壳带磨损痕迹，底座牢固，产品级细节。',
  },
  {
    label: '复古相机',
    prompt: '一台复古胶片相机，镜头与旋钮结构完整，皮革与金属材质对比明显，正面 45 度视角。',
  },
  {
    label: '卡通角色',
    prompt: '一个可爱的 3D 卡通小恐龙角色，圆润饱满的体型，短手短脚，配色明快，站姿正面。',
  },
  {
    label: '游戏道具',
    prompt: '一把奇幻风格的长剑，剑身有发光符文，护手雕刻精细，武器竖直悬浮，比例修长。',
  },
  {
    label: '家具单品',
    prompt: '一把北欧风格木质单椅，弧线椅背，榫卯结构清晰，浅色橡木材质，完整单体。',
  },
]

/** 多视角槽位：front 必填，其余可选。 */
export const MULTI_VIEW_SLOTS = [
  { key: 'front', label: '正视图', hint: '必填', required: true },
  { key: 'left', label: '左视图', hint: '可选', required: false },
  { key: 'back', label: '背视图', hint: '可选', required: false },
  { key: 'right', label: '右视图', hint: '可选', required: false },
] as const

export type MultiViewKey = (typeof MULTI_VIEW_SLOTS)[number]['key']

export function assetExtension(path: string): string {
  const clean = path.split('?')[0] || ''
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot).toLowerCase() : ''
}
