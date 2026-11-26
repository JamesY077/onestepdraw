/** OpenMotion 模板目录条目：元数据 + 远程资源地址，二进制按需缓存。 */
export interface OpenMotionTemplateFile {
  path: string
  url: string
  bytes: number
}

export interface OpenMotionTemplate {
  id: string
  name: string
  summary: string
  /** 风格描述：字体、配色、版式。 */
  style: string
  /** 官方审阅要点：复刻时最容易丢掉的创作决定。 */
  reviewFocus: string
  /** 宣传用途，例如 产品发布。 */
  useCase: string
  /** 视觉呈现，例如 界面动效 / 文字动效，可能含多个逗号分隔值。 */
  presentation: string
  brand: string
  /** 参考片长（秒）。 */
  duration: number
  width: number
  height: number
  colors: string[]
  cover: string
  video: string
  /** motion.md 创作文档。 */
  motionDoc: string
  /** 动效说明包。 */
  motionGuide: string
  /** 原作链接，用于署名。 */
  sourceUrl: string
  /** 是否有可编辑工程（index.html + 文件清单）。 */
  editable: boolean
  indexUrl: string
  files: OpenMotionTemplateFile[]
}

export function openMotionTags(template: OpenMotionTemplate): string[] {
  return [template.useCase, template.presentation]
    .flatMap((value) => value.split(/[,，、]/))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
}

/** 复刻提示词：与 OpenMotion 的模板交接格式对齐，但指向 Stepframe 自己的动效工程能力。 */
export function buildOpenMotionHandoff(template: OpenMotionTemplate): string {
  const resource = template.editable
    ? '可编辑工程（含 index.html 与素材清单），在副本上改编'
    : '参考创作，仅有参考视频与 motion.md 动效说明，没有原片工程'
  const lines = [
    `使用说明：请使用 Stepframe 的动效工程能力（HyperFrames 同源引擎）完成复刻，产物是可编辑工程，不是一次性视频。`,
    `指定模板：${template.name}（${template.id}）`,
    `资源类型：${resource}。`,
    `参考视频：${template.video || '未提供'}`,
    `motion.md：${template.motionDoc || '未提供'}`,
    template.motionGuide ? `动效说明：${template.motionGuide}` : '',
    template.style ? `风格：${template.style}` : '',
    template.reviewFocus ? `复刻重点：${template.reviewFocus}` : '',
    `参考时长：${template.duration || '未知'} 秒，画幅 ${template.width}×${template.height}。`,
    template.sourceUrl ? `原作署名：${template.sourceUrl}` : '',
    `创作要求：先读取这条准确资源（用 read_motion_template 拉取 motion.md 与工程文件），根据参考和我的内容创建独立作品，不承诺精确复刻；保留已有工程与已有时间轴片段。`,
    `先核对产品名、功能文案；需要界面展示时核对截图或录屏，缺必要材料先说明。Logo 可用文字品牌，未提供音频时静音。`,
    `保持参考的镜头顺序、节奏、动效语言与停留点，替换为我的文案、品牌与素材；不要整片套同一个缩放动作。`,
    `交付时在同一个动效工程里继续改，完成后把工程放到时间轴并说明与参考的差距。`,
    `我的要求：`,
  ]
  return lines.filter(Boolean).join('\n')
}

/** 「贴个视频链接，做同款」：没有目录条目时的参考复刻入口。 */
export function buildReferenceRemakePrompt(url: string): string {
  return [
    '使用说明：请使用 Stepframe 的动效工程能力（HyperFrames 同源引擎）做参考复刻，产物是可编辑工程。',
    `参考视频链接：${url}`,
    '创作要求：先获取并逐镜分析这条参考（开场钩子、镜头顺序、运动路径、停留点、转场、字幕与配色），写成 motion.md 再开始搭建工程。',
    '保留参考的创作结构与动效语言，换成我的主题、文案与品牌；不承诺像素级复刻，交付时说明差距。',
    '先核对产品名与功能文案，缺截图、录屏或 Logo 等必要材料时先告诉我；未提供音频时静音。',
    '我的要求：',
  ].join('\n')
}
