import type { AgentToolDefinition } from '@/types/agent'
import type { AgentToolCall } from './tools'

/** 单轮最多 8 次模型 Step；工具失败也占步数，防止无效循环。 */
export const AGENT_MAX_RUN_STEPS = 8

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
      name: 'generate_storyboard',
      description: '生成一支完整多镜头视频。只有完整分镜与生成范围已确认后调用；一次记录全部镜头，宿主按镜号续跑，最多4路并发，失败自动重试并按顺序入轨。',
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
            minItems: 2,
            maxItems: 32,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'prompt', 'duration'],
              properties: {
                id: { type: 'string', description: '唯一镜号，如 S01、S02；必须保留完整分镜里的所有镜号。' },
                prompt: { type: 'string', description: '该镜完整提示词，重复必要的外观/场景/风格锚点，并写明与前后镜的承接。' },
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
        required: ['target', 'reason', 'prompt'],
        properties: {
          target: { type: 'string', enum: ['create'] },
          reason: { type: 'string', description: '一句中文说明为什么下一步需要创作对话，不超过 60 字。' },
          prompt: { type: 'string', description: '用户确认后在同一对话继续的具体创作任务，必须承接已有文案、完整脚本和素材；多镜头保留全部镜号、时长、逐镜提示词与连续性锚点，禁止只带S01或用同上省略。' },
        },
      },
    },
  },
]

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
    case 'generate_storyboard': {
      const count = Array.isArray(call.args.shots) ? call.args.shots.length : 0
      return { title: '生成完整分镜视频', detail: `${count} 个镜头 · 最多 4 路并发` }
    }
    case 'open_voice':
      return { title: '打开配音工作台', detail: short(call.args.text) }
    case 'open_3d':
      return { title: '打开 3D 工作台', detail: short(call.args.prompt) }
    default:
      return { title: call.name ? `未知工具：${short(call.name, 32)}` : '未知工具', detail: '未执行' }
  }
}
