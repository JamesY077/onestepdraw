import type { AgentToolDefinition } from '@/types/agent'
import type { ConversationMode, CreativeEngineMode } from '@/stores/chatModeStore'
import type { AgentToolCall } from './tools'

/**
 * 模型可见的能力白名单。这里只声明 JSON Schema，执行函数与项目对象留在宿主侧。
 * 多工具由 Harness 顺序执行，避免时间轴写入与付费生成出现并发竞态。
 */
export const AGENT_NATIVE_TOOLS: AgentToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: '更新当前创作任务的简短计划。仅在任务确实需要两个以上阶段时使用；简单聊天或直接生成不要调用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            maxItems: 6,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['content', 'status'],
              properties: {
                content: { type: 'string', description: '一个可验证的阶段，不超过 40 个字。' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_project',
      description: '读取当前剪辑项目的最新轨道、片段 ID、起止时间与画幅。修改前需要刷新项目状态，或用户询问当前项目时调用。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_timeline',
      description: '直接修改当前项目时间轴，不重新生成素材。只操作用户要求的片段；移动、裁剪、删除、音量或透明度修改使用此工具。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['ops'],
        properties: {
          ops: {
            type: 'array',
            minItems: 1,
            maxItems: 30,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['op', 'clipId'],
              properties: {
                op: { type: 'string', enum: ['move', 'trim', 'delete', 'volume', 'opacity'] },
                clipId: { type: 'string', description: '必须来自项目摘要或 read_project 结果。' },
                start: { type: 'number', minimum: 0, description: 'move/trim 使用，单位为秒。' },
                duration: { type: 'number', exclusiveMinimum: 0, description: 'trim 使用，单位为秒。' },
                value: { type: 'number', minimum: 0, maximum: 1, description: 'volume/opacity 使用。' },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: '提交一张图片的后台生成任务。结果与进度会显示在对话卡片中；工具返回“已提交”不代表图片已经生成完成。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', description: '完整、具体的中文画面描述。' },
          aspect_ratio: { type: 'string', enum: ['16:9', '4:3', '3:4', '1:1', '9:16'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description: '提交一段视频的后台生成任务。结果与进度会显示在对话卡片中；工具返回“已提交”不代表视频已经生成完成。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', description: '完整、具体的镜头与运动描述。' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
          resolution: { type: 'string', enum: ['768P', '2K'] },
          duration: { type: 'integer', minimum: 4, maximum: 15 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_storyboard',
      description: '制作完整分镜脚本并准备逐镜参考图。动画由宿主本地代码绘图，AIGC 由宿主复用用户媒体或调用图片模型；不生成正式视频，也不创建动效工程。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'brief', 'continuity', 'aspect_ratio', 'resolution', 'delivery', 'shots'],
        properties: {
          title: { type: 'string', description: '短片名称。' },
          brief: { type: 'string', description: '完整创作需求：用途、受众、叙事、风格、总时长、声音与交付目标，不得只写当前一镜。' },
          continuity: { type: 'string', description: '跨镜统一的角色/产品外观、场景、光线、色彩、镜头语言与首尾状态锚点。' },
          storyboard_text: { type: 'string', description: '完整原始分镜文本，包含全部镜号，不能用“同上”省略。' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
          resolution: { type: 'string', enum: ['768P', '2K'] },
          delivery: { type: 'string', enum: ['full', 'preview', 'batch'], description: '用户确认后希望的执行范围。' },
          shots: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'prompt', 'duration'],
              properties: {
                id: { type: 'string', description: '唯一镜号，如 S01、S02；必须保留完整分镜里的所有镜号。' },
                prompt: { type: 'string', description: '该镜完整画面、动效或生成提示词，并写明与前后镜的承接。' },
                reference_svg: { type: 'string', description: '动画模式必传：该镜代表帧的完整自包含 SVG 源码，直接表现主体、构图与字幕；禁止脚本、外链和位图。AIGC 不传。' },
                duration: { type: 'integer', minimum: 4, maximum: 15 },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_storyboard',
      description: '兼容旧调用的分镜草案入口：记录完整脚本并准备逐镜参考图，等待用户编辑与总确认，不启动正式视频或动效工程。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'brief', 'continuity', 'aspect_ratio', 'resolution', 'delivery', 'shots'],
        properties: {
          title: { type: 'string', description: '短片名称。' },
          brief: { type: 'string', description: '完整创作需求：用途、受众、叙事、风格、总时长、声音与交付目标，不得只写当前一镜。' },
          continuity: { type: 'string', description: '跨镜统一的角色/产品外观、场景、光线、色彩、镜头语言与首尾状态锚点。' },
          storyboard_text: { type: 'string', description: '用户确认的完整原始分镜文本，包含全部镜号，不能用“同上”省略。' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
          resolution: { type: 'string', enum: ['768P', '2K'] },
          delivery: {
            type: 'string',
            enum: ['full', 'preview', 'batch'],
            description: 'full=自动生成全部镜头；preview=只生成下一镜等待确认；batch=每批最多4镜，批后等待确认。',
          },
          shots: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'prompt', 'duration'],
              properties: {
                id: { type: 'string', description: '唯一镜号，如 S01、S02；必须保留完整分镜里的所有镜号。' },
                prompt: { type: 'string', description: '该镜完整提示词，重复必要的外观/场景/风格锚点，并写明与前后镜的承接。' },
                reference_svg: { type: 'string', description: '动画模式必传：该镜代表帧的完整自包含 SVG 源码；禁止脚本、外链和位图。AIGC 不传。' },
                duration: { type: 'integer', minimum: 4, maximum: 15 },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_motion_templates',
      description: '检索 OpenMotion 动效模板目录（HyperFrames 动效：界面动效、文字动效、品牌发布等）。做同款、找动效参考时先用它选准模板，不要凭空编模板名。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: '关键词，匹配名称、品牌、风格与复刻要点。' },
          tag: { type: 'string', description: '标签，例如 产品发布 / 界面动效 / 文字动效。' },
          editableOnly: { type: 'boolean', description: '只看带可编辑工程的模板。' },
          limit: { type: 'number', minimum: 1, maximum: 12 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_motion_template',
      description: '读取指定模板的完整资料：风格、复刻重点、参考视频地址、motion.md 动效说明与可编辑工程文件清单。复刻前必须先读。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['templateId'],
        properties: {
          templateId: { type: 'string', description: '来自 list_motion_templates 或用户给出的 motion- 开头 ID。' },
          includeDocument: { type: 'boolean', description: '是否拉取 motion.md 正文，默认 true。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_motion_project',
      description: '创建可编辑动效工程并放入当前时间轴。可基于 OpenMotion 模板创建副本，也可从空白工程开始。产物是 HTML 工程，不是视频文件。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', description: '工程名称。' },
          templateId: { type: 'string', description: '可选，基于这条 OpenMotion 模板创建副本。' },
          source: { type: 'string', description: '可选，空白工程时直接给出完整 index.html（HyperFrames 原生格式）。' },
          at: { type: 'number', minimum: 0, description: '入轨起点秒数；逐镜执行时必须使用宿主给出的固定位置。' },
          duration: { type: 'number', exclusiveMinimum: 0, description: '时间轴片段时长（秒），必须与当前镜号一致。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'import_motion_asset',
      description: '把用户本轮上传的 Logo、截图或音视频复制进动效工程。source 使用附件清单里的 /generated/uploads/... 地址；返回的 path 可直接写进 HTML。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['motionId', 'source'],
        properties: {
          motionId: { type: 'string', description: 'create_motion_project 返回的工程 ID。' },
          source: { type: 'string', description: '上传附件的 /generated/uploads/... 地址。' },
          fileName: { type: 'string', description: '可选的工程内文件名，保留原扩展名。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_motion_project',
      description: '读取动效工程的源码与参数契约。修改动效前必须先读，不要凭记忆改写。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['motionId'],
        properties: {
          motionId: { type: 'string', description: '动效工程 ID，来自片段或 create_motion_project。' },
          path: { type: 'string', description: '工程内相对路径，默认 index.html。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_motion_project',
      description: '写回动效工程源码（完整文件，不是 diff）。用于改文案、配色、版式、镜头时长与 GSAP 动效。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['motionId', 'source'],
        properties: {
          motionId: { type: 'string' },
          source: { type: 'string', description: '完整可运行源码。' },
          path: { type: 'string', description: '默认 index.html。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'review_motion_project',
      description: '用官方 HyperFrames check 复查动效工程：字体缺失、元素重叠/过近、安全区、对比度与运行时错误。返回可修复的问题清单；发现问题后继续修改源码再复查，不要重做整份工程。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['motionId'],
        properties: {
          motionId: { type: 'string' },
          samples: { type: 'number', description: '抽样时间点数量，默认 5，范围 1-12。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_motion_project',
      description: '用本机 HyperFrames CLI 把动效工程渲染成 MP4 导出产物；不改变时间轴上的实时工程片段。耗时较长，只有用户要出片或整片合成时才调用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['motionId'],
        properties: {
          motionId: { type: 'string' },
          clipId: { type: 'string', description: '可选，指定要导出的时间轴片段。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_voice',
      description: '把用户确认的配音文本带到配音工作台并预填，不直接发起付费生成。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', description: '需要朗读的完整文本。' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_3d',
      description: '把用户确认的建模需求带到 3D 工作台并预填，不直接发起付费生成。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: { prompt: { type: 'string', description: '需要创建的物体及外观描述。' } },
      },
    },
  },
]

/** 普通对话只有规划与模式交接能力，不暴露任何生成、剪辑或工作台跳转工具。 */
export const AGENT_CHAT_NATIVE_TOOLS: AgentToolDefinition[] = [
  AGENT_NATIVE_TOOLS[0],
  {
    type: 'function',
    function: {
      name: 'suggest_create_mode',
      description: '当下一步已明确需要生成或编辑图片、视频、配音、3D 素材时，建议用户切换到创作对话。只展示确认卡，不自动切换、不生成。普通聊天、灵感、话题、文案、脚本或分镜本身不要调用。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'engine', 'reason', 'prompt'],
        properties: {
          target: { type: 'string', enum: ['create'] },
          engine: { type: 'string', enum: ['animation', 'aigc'], description: 'OpenMotion/HyperFrames、动效或模板复刻用 animation；图片/视频生成与素材编辑用 aigc。' },
          reason: { type: 'string', description: '一句中文说明为什么下一步需要创作对话，不超过 60 字。' },
          prompt: { type: 'string', description: '用户确认后在同一对话继续的具体创作任务，必须承接已有文案、完整脚本和素材；多镜头保留全部镜号、时长、逐镜提示词与连续性锚点，禁止只带S01或用同上省略。' },
        },
      },
    },
  },
]

const MOTION_TOOL_NAMES = new Set([
  'list_motion_templates',
  'read_motion_template',
  'create_motion_project',
  'import_motion_asset',
  'read_motion_project',
  'write_motion_project',
  'review_motion_project',
  'render_motion_project',
])
const AIGC_TOOL_NAMES = new Set(['generate_image', 'generate_video', 'generate_storyboard'])

/** 模式同时约束模型可见工具；宿主执行层还会再做一次同样的校验。 */
export function agentToolsForMode(
  mode: ConversationMode,
  creativeEngine: CreativeEngineMode = 'aigc',
): AgentToolDefinition[] {
  if (mode === 'chat') return AGENT_CHAT_NATIVE_TOOLS
  return AGENT_NATIVE_TOOLS.filter((tool) => {
    const name = tool.function.name
    if (creativeEngine === 'animation') return !AIGC_TOOL_NAMES.has(name) && name !== 'open_3d'
    return !MOTION_TOOL_NAMES.has(name)
  })
}

function short(value: unknown, max = 72): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 与 DSH presentCall 类似的纯 UI 投影：只从参数推导，不依赖宿主状态。 */
export function presentAgentToolCall(call: AgentToolCall): { title: string; detail?: string } {
  switch (call.name) {
    case 'suggest_create_mode':
      return { title: '建议切换创作模式', detail: short(call.args.reason) }
    case 'update_plan':
      return { title: '更新创作计划' }
    case 'read_project':
      return { title: '读取剪辑项目', detail: '获取最新轨道与片段状态' }
    case 'edit_timeline': {
      const count = Array.isArray(call.args.ops) ? call.args.ops.length : 0
      return { title: '更新时间轴', detail: `${count} 项操作` }
    }
    case 'generate_image':
      return { title: '提交图片生成', detail: short(call.args.prompt) }
    case 'generate_video':
      return { title: '提交视频生成', detail: short(call.args.prompt) }
    case 'prepare_storyboard':
    case 'generate_storyboard': {
      const count = Array.isArray(call.args.shots) ? call.args.shots.length : 0
      return { title: '制作分镜草案', detail: `${count} 个镜头 · 等待用户确认` }
    }
    case 'list_motion_templates':
      return { title: '检索动效模板', detail: short(call.args.query || call.args.tag || 'OpenMotion 目录') }
    case 'read_motion_template':
      return { title: '读取模板与 motion.md', detail: short(call.args.templateId) }
    case 'create_motion_project':
      return { title: '创建动效工程', detail: short(call.args.name) }
    case 'import_motion_asset':
      return { title: '导入动效素材', detail: short(call.args.fileName || call.args.source) }
    case 'read_motion_project':
      return { title: '读取动效工程源码', detail: short(call.args.motionId) }
    case 'write_motion_project':
      return { title: '写回动效工程源码', detail: short(call.args.motionId) }
    case 'review_motion_project':
      return { title: '复查动效工程', detail: short(call.args.motionId) }
    case 'render_motion_project':
      return { title: '渲染动效 MP4', detail: short(call.args.motionId) }
    case 'open_voice':
      return { title: '打开配音工作台', detail: short(call.args.text) }
    case 'open_3d':
      return { title: '打开 3D 工作台', detail: short(call.args.prompt) }
    default:
      return { title: call.name ? `未知工具：${short(call.name, 32)}` : '未知工具', detail: '未执行' }
  }
}
