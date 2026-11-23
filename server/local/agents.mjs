/**
 * 本机 Agent 检测与调用。
 *
 * OneStep 自身不绑定某一家 Agent：启动后扫描 PATH，找出用户已经安装的
 * CLI Agent（Claude Code、Codex、OpenCode、Qoder、WorkBuddy、DSH 等），
 * 再以「项目目录 + 一段任务提示词」的方式拉起对应命令，把输出流回前端。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'

const PRESETS = [
  {
    id: 'claude',
    name: 'Claude Code',
    vendor: 'Anthropic',
    commands: ['claude'],
    description: 'Anthropic 官方终端 Agent，擅长读写代码与多步任务。',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    installUrl: 'https://claude.com/claude-code',
    output: 'claude-json',
    args: (prompt) => [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions',
      prompt,
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    vendor: 'OpenAI',
    commands: ['codex'],
    description: 'OpenAI Codex CLI，可直接在项目目录中执行任务。',
    installCommand: 'npm install -g @openai/codex',
    installUrl: 'https://github.com/openai/codex',
    output: 'plain',
    args: (prompt, rootDir) => [
      'exec',
      '--skip-git-repo-check',
      '--color',
      'never',
      '--sandbox',
      'workspace-write',
      '-C',
      rootDir,
      prompt,
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    vendor: 'OpenCode',
    commands: ['opencode'],
    description: '开源的终端编程 Agent，支持多模型与本地服务。',
    installCommand: 'npm install -g opencode-ai',
    installUrl: 'https://opencode.ai',
    output: 'plain',
    args: (prompt) => ['run', '--auto', prompt],
  },
  {
    id: 'qoder',
    name: 'Qoder',
    vendor: 'Qoder',
    commands: ['qodercli', 'qoder', 'qcoder'],
    description: 'Qoder 命令行 Agent，支持仓库级理解与自动改代码。',
    installCommand: 'npm install -g @qoder-ai/qodercli',
    installUrl: 'https://qoder.com',
    output: 'plain',
    args: (prompt) => ['-p', '--permission-mode', 'accept_edits', prompt],
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy / WorkBuddy CLI',
    vendor: '腾讯',
    commands: ['codebuddy', 'cbc', 'codebuddy-code'],
    description: '腾讯 CodeBuddy Code（WorkBuddy CLI），支持国内站点登录与主流模型。',
    installCommand: 'npm install -g @tencent-ai/codebuddy-code',
    installUrl: 'https://www.codebuddy.cn/docs/cli/installation',
    output: 'plain',
    args: (prompt) => ['-p', '-y', prompt],
  },
  {
    id: 'dsh',
    name: 'DeepSeek Harness',
    vendor: 'DeepSeek',
    commands: ['dsh'],
    description: 'DeepSeek 开源的 Agent 运行框架，headless 模式执行单次任务。',
    installCommand: 'npm install -g @deepseek-ai/dsh',
    installUrl: 'https://github.com/deepseek-ai/deepseek-harness',
    output: 'plain',
    args: (prompt) => ['--profile', 'headless', '--approval-policy', 'never', prompt],
  },
  {
    id: 'cursor',
    name: 'Cursor CLI',
    vendor: 'Cursor',
    commands: ['cursor-agent', 'cursor'],
    description: 'Cursor 的终端 Agent，读取本地项目并直接修改文件。',
    installCommand: 'curl https://cursor.com/install -fsS | bash',
    installUrl: 'https://cursor.com/cli',
    output: 'plain',
    args: (prompt) => ['-p', '--force', prompt],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    vendor: 'Google',
    commands: ['gemini'],
    description: 'Google 官方终端 Agent，适合代码与文档任务。',
    installCommand: 'npm install -g @google/gemini-cli',
    installUrl: 'https://github.com/google-gemini/gemini-cli',
    output: 'plain',
    args: (prompt) => ['-p', prompt, '--approval-mode', 'yolo'],
  },
  {
    id: 'aider',
    name: 'Aider',
    vendor: 'Aider',
    commands: ['aider'],
    description: '面向代码库的结对编程 Agent，支持本地模型。',
    installCommand: 'python -m pip install aider-install && aider-install',
    installUrl: 'https://aider.chat',
    output: 'plain',
    args: (prompt) => ['--yes', '--no-pretty', '--message', prompt],
  },
]

const EXTRA_BIN_DIRS = [
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.npm-global', 'bin'),
  path.join(os.homedir(), '.bun', 'bin'),
  path.join(os.homedir(), '.cargo', 'bin'),
  path.join(os.homedir(), '.volta', 'bin'),
  path.join(os.homedir(), '.qoder', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
  '/bin',
  ...(isWindows
    ? [
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
      ]
    : []),
]

const PATH_DIRS = Array.from(
  new Set([
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean),
    ...EXTRA_BIN_DIRS,
  ]),
)

const WIN_EXTS = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)

function executableCandidates(command) {
  if (!isWindows) return [command]
  return [command, ...WIN_EXTS.map((extension) => `${command}${extension.toLowerCase()}`)]
}

function findCommand(commands) {
  for (const command of commands) {
    for (const directory of PATH_DIRS) {
      for (const candidate of executableCandidates(command)) {
        const full = path.join(directory, candidate)
        try {
          if (fs.statSync(full).isFile()) return full
        } catch {
          // 不存在就继续找。
        }
      }
    }
  }
  return ''
}

function readVersion(command) {
  return new Promise((resolve) => {
    execFile(
      command,
      ['--version'],
      { timeout: 2500, windowsHide: true },
      (error, stdout, stderr) => {
        const text = `${stdout || ''}\n${stderr || ''}`.trim()
        if (error && !text) {
          resolve('')
          return
        }
        const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || ''
        resolve(firstLine.trim().slice(0, 48))
      },
    )
  })
}

let cache = { at: 0, agents: [] }
const CACHE_MS = 30_000

async function detectAgent(preset) {
  const command = findCommand(preset.commands)
  if (!command) {
    return {
      ...publicPreset(preset),
      installed: false,
      command: '',
      commandPath: '',
      version: '',
    }
  }
  const version = await readVersion(command)
  return {
    ...publicPreset(preset),
    installed: true,
    command,
    commandPath: command,
    version,
  }
}

function publicPreset(preset) {
  const { args, commands, output, ...rest } = preset
  return { ...rest, commands }
}

export async function detectAgents({ refresh = false } = {}) {
  if (!refresh && Date.now() - cache.at < CACHE_MS) return cache.agents
  const agents = await Promise.all(PRESETS.map(detectAgent))
  cache = { at: Date.now(), agents }
  return agents
}

export function getPreset(id) {
  return PRESETS.find((preset) => preset.id === id) || null
}

export async function getInstalledAgent(id) {
  const preset = getPreset(id)
  if (!preset) return null
  const command = findCommand(preset.commands)
  if (!command) return null
  return { preset, command }
}

/** 把前端对话整理成一次性的 CLI 任务提示词。 */
export function buildRunPrompt({ messages, rootDir, baseUrl, agentName }) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim(),
    )
    .slice(-30)
    .map((message) => {
      const role = message.role === 'user' ? '用户' : '助手'
      const content = message.content.trim()
      return `${role}：${content.length > 4000 ? `${content.slice(0, 4000)}…` : content}`
    })
    .join('\n\n')

  return [
    `你是 ${agentName}，正在 OneStep 的对话区里工作。`,
    '',
    `工作目录：${rootDir}`,
    `本地服务：${baseUrl}`,
    '',
    '你可以直接读取、修改工作目录里的文件，也可以运行命令。',
    'OneStep 是一个本地 Vue 3 + Vite 项目，界面在 src/，本地服务在 server/local/，构建命令是 npm run build。',
    '',
    '生成能力（已注入 AIPING_API_KEY 与 AIPING_BASE_URL 环境变量，直接运行即可）：',
    '- 生成图片：node scripts/onestep-generate.mjs image --prompt "画面描述" --ratio 16:9',
    '- 生成视频：node scripts/onestep-generate.mjs video --prompt "镜头描述" --ratio 16:9 --resolution 768P --duration 5',
    '图片可选比例：21:9 / 16:9 / 3:2 / 4:3 / 1:1 / 3:4 / 2:3 / 9:16，默认 16:9。',
    '视频分辨率只支持 768P 与 2K，时长 4–15 秒，默认 768P / 5 秒。',
    '脚本会把结果保存到 generated/，并输出 /generated/... 链接；请在最终回复里用 Markdown 图片或视频链接展示结果。',
    '',
    '工作原则：',
    '- 用户要生成图片或视频时，先简短确认尺寸、比例、时长（用户已经说明就直接执行），然后必须真正运行脚本，不要在回复里假装已经生成。',
    '- 生成任务可能耗时数分钟，请耐心等待脚本输出，不要中途放弃。',
    '- 能直接完成的任务就直接做，不要只给方案。',
    '- 只修改与当前任务相关的文件，不要执行删除类命令，不要提交 git。',
    '- 用中文回答，先说结果，再简要说明改了什么。',
    '',
    '对话记录：',
    history || '（暂无）',
    '',
    '请处理最后一条用户消息。',
  ].join('\n')
}

/** 拆分用户自定义命令，支持引号，避免把整串命令当成一个可执行文件名。 */
export function splitCommandLine(input) {
  const text = String(input || '').trim()
  if (!text) return []
  const tokens = []
  let current = ''
  let quote = ''
  let escaped = false

  for (const char of text) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

/**
 * 用用户自定义命令构造一个临时 preset。
 * 命令里可以用 {prompt} 占位；没有占位时把提示词作为最后一个参数追加。
 */
export function buildCustomAgent({ name, command }) {
  const tokens = splitCommandLine(command)
  if (!tokens.length) return null

  const [bin, ...rest] = tokens
  const hasPromptPlaceholder = tokens.some((token) => token.includes('{prompt}'))
  const template = hasPromptPlaceholder ? rest : [...rest, '{prompt}']
  const label = String(name || '').trim() || path.basename(bin)

  return {
    preset: {
      id: 'custom',
      name: label,
      vendor: '自定义',
      description: '用户自定义的本地 Agent 命令。',
      commands: [bin],
      installCommand: '',
      installUrl: '',
      output: 'plain',
      args: (prompt) => template.map((token) => token.replaceAll('{prompt}', prompt)),
    },
    command: bin,
  }
}


function stripAnsi(text) {
  return text
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '')
}

function extractClaudeText(line, state) {
  let payload
  try {
    payload = JSON.parse(line)
  } catch {
    return ''
  }

  if (
    payload?.type === 'stream_event' &&
    payload?.event?.type === 'content_block_delta' &&
    payload?.event?.delta?.type === 'text_delta'
  ) {
    state.emitted = true
    return payload.event.delta.text || ''
  }

  if (payload?.type === 'result' && !state.emitted && typeof payload.result === 'string') {
    state.emitted = true
    return payload.result
  }

  if (payload?.type === 'assistant' && !state.emitted) {
    const blocks = payload?.message?.content
    if (Array.isArray(blocks)) {
      const text = blocks
        .filter((block) => block?.type === 'text')
        .map((block) => block.text)
        .join('')
      if (text) {
        state.emitted = true
        return text
      }
    }
  }

  return ''
}

/**
 * 拉起 Agent 进程并流式回调输出。
 * 返回 { child, done, stop }，done 在进程退出后 resolve。
 */
export function runAgent({
  preset,
  command,
  prompt,
  rootDir,
  baseUrl,
  apiKey,
  apiBaseUrl,
  onDelta,
  onLog,
}) {
  const env = {
    ...process.env,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
    ONESTEP_ROOT: rootDir,
    ONESTEP_BASE_URL: baseUrl,
  }
  if (apiKey) env.AIPING_API_KEY = apiKey
  if (apiBaseUrl) env.AIPING_BASE_URL = apiBaseUrl

  const child = spawn(command, preset.args(prompt, rootDir), {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: isWindows,
    // POSIX 下单独开进程组，停止时可以连同子进程一起结束。
    detached: !isWindows,
  })

  const state = { emitted: false, buffer: '', stderr: [] }

  const handleLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (preset.output === 'claude-json') {
      const text = extractClaudeText(trimmed, state)
      if (text) onDelta(text)
      return
    }
    onDelta(`${stripAnsi(line)}\n`)
  }

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    if (preset.output === 'claude-json') {
      state.buffer += text
      const lines = state.buffer.split('\n')
      state.buffer = lines.pop() || ''
      lines.forEach(handleLine)
      return
    }
    onDelta(stripAnsi(text))
  })

  child.stderr.on('data', (chunk) => {
    // stderr 多为进度与告警；回传为日志，由前端折叠展示。
    const text = stripAnsi(chunk.toString('utf8'))
    if (!text.trim()) return
    state.stderr.push(text)
    if (state.stderr.length > 60) state.stderr.shift()
    onLog?.(text)
  })

  function stop(signal = 'SIGTERM') {
    if (!child.pid || child.killed) return
    try {
      if (!isWindows) {
        process.kill(-child.pid, signal)
        return
      }
    } catch {
      // 进程组已退出时回退到单进程结束。
    }
    try {
      child.kill(signal)
    } catch {
      // 忽略已退出进程。
    }
  }

  const done = new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({ exitCode: -1, error: error?.message || 'Agent 启动失败。' })
    })
    child.on('close', (code) => {
      if (state.buffer) handleLine(state.buffer)
      resolve({
        exitCode: typeof code === 'number' ? code : -1,
        stderrTail: state.stderr.join('').slice(-2400).trim(),
      })
    })
  })

  return { child, done, stop }
}

export function listPresets() {
  return PRESETS.map(publicPreset)
}
