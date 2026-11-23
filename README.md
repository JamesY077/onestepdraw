# OneStep

一个本地运行的 AI 创作助手。登录后是一个 Codex 风格的对话界面，内嵌 **DeepSeek V4.1 Flash**（`DeepSeek-V4.1-Flash-1017`），模型能力仍然由 **AIPing** 提供。也可以把对话交给这台电脑上已经安装的 CLI Agent（Codex、OpenCode、Qoder、Claude Code、WorkBuddy、DSH 等）来执行。

> 这是一个从 `aiping-imagevideo` 派生出的新项目，主界面已从「创作工作台」收敛为「本地 AI Agent」。旧的图片 / 视频 / 配音 / 3D 页面作为隐藏路由保留，后续可以作为 Agent 工具接入。

## 特性

- **本地优先**：前端构建产物由本机 Node 服务托管，只监听 `127.0.0.1`，数据与对话记录都留在本机。
- **极简登录页**：只需 AIPing API Key；服务地址放在「高级设置」中，默认使用 AIPing 官方接口。
- **Codex 式对话页**：
  - 左侧历史会话列表，按今天 / 昨天 / 近 7 天分组；
  - 新建对话、搜索、删除、快捷键 `⌘K` / `Ctrl+K`；
  - 流式输出、停止生成、重新生成、复制回答；
  - Markdown 渲染（标题、列表、表格、代码块与一键复制）；
  - 支持推理模型的「思考过程」折叠展示；
  - 对话自动保存在浏览器本地，不上传服务器。
- **对话即创作**：在对话里描述需求，Agent 会先追问缺失的比例 / 时长 / 分辨率，再直接调用本项目的图片与视频模型生成结果。
  - 图片默认 `Seedream 5.0 Lite` + `16:9`；
  - 视频默认 `MiniMax H3` + `16:9` + `768P` + `5s`。
- **对话模型可选**：选择内置 AIPing 时，输入框会同时出现模型选择器；从 AIPing 模型列表实时拉取对话模型，支持关键字搜索与切换，默认 `DeepSeek-V4.1-Flash-1017`。
- **右侧悬浮导航**：对话、Skill、图片、视频、配音、3D、设置固定在页面右侧；移动端折叠为一个按钮。
- **本机 Agent 自动检测**：启动后扫描 PATH、常见安装目录，以及 macOS 桌面应用包内置的命令行入口（例如 `DeepSeek Harness.app` 自带的 `dsh`）；在对话输入框左下角直接切换，选中后由它来执行创作。
- **Agent 一键安装**：设置页提供可复制的安装指令，让 Claude Code、Cursor、Codex 自行克隆仓库、安装依赖并启动，指令中不包含任何密钥。
- **简约白色调**：无首页、无多余入口，整体为浅色界面。
- **可恢复的登录态**：API Key 保存在 `sessionStorage`，浏览器会话结束时自动清除；登录周期按自然周轮换。

## 本地安装与启动

### 环境要求

- Node.js ≥ 20.19 或 ≥ 22.12（带 npm）
- 可访问 `https://aiping.cn` 的网络

### 方式一：macOS 一键启动（推荐）

双击 `start-macos.command`。脚本会自动：

1. 检测并准备 Node.js（缺少时下载到 `.runtime/`）；
2. 首次运行创建 `.env`；
3. 安装依赖；
4. 首次启动或源码有更新时构建前端；
5. 启动本地服务并自动打开浏览器。

### 方式二：Windows 一键启动

双击 `start-windows.bat`（需已安装 Node.js）。

### 方式三：命令行

```bash
npm install
cp .env.example .env    # 首次运行
npm start               # 构建并启动本地服务
```

默认地址：<http://127.0.0.1:5500>。如果端口被占用，本地服务会自动顺延到下一个可用端口。

开发模式：

```bash
npm run dev             # Vite 开发服务器，默认 http://127.0.0.1:5500
```

### 本地服务做了什么

`server/local/server.mjs` 是一个零依赖的 Node 服务：

- 托管 `dist/` 静态文件，并支持 SPA 路由回退；
- 将 `/api` 反向代理到 `https://aiping.cn`，支持 SSE 流式透传；
- `GET /local/agents` 扫描本机已安装的 CLI Agent；
- `POST /local/agent/run` 在项目目录中拉起选中的 Agent，并以 SSE 回传输出；
- 托管 `generated/`，用于展示 Agent 生成的图片和视频；
- 代理旧的 `/v2fun-assets` 与 `/ai-image-assets` 资源；
- 只监听本机地址，默认自动打开浏览器。

## 登录

1. 打开本地页面，进入登录页；
2. 填写 AIPing API Key（[获取地址](https://aiping.cn/user/apikey)）；
3. 如需自定义服务地址，展开「高级设置」；
4. 连接成功后自动进入对话页。

API Key 只保存在当前浏览器会话中，不会写入项目文件或上传到第三方服务器。

## 对话内生成

在对话页直接说需求即可，例如：

- 「帮我生成一张极简白色香水主视觉，16:9」
- 「做一段 5 秒的视频：雨夜跑车，768P」

Agent 会先确认缺失的关键参数，然后调用本机模型。生成结果以卡片形式出现在消息下方，可点击查看原图 / 播放视频。视频生成会显示排队与渲染进度。

### 两种对话模式

输入框上方是对话模式开关，输入框底部一行是 Agent 与自动程度，模型选择在发送按钮左边：

- **普通对话 / 创作对话**：普通对话只聊不建项目；创作对话在你说完需求后自动创建项目并进入剪辑台。
- **默认模式 / 完全模式**：默认模式会分轮提问；完全模式由模型自己补齐所有细节，在同一条回复里直接生成，不需要你回答任何问题。
- 两种对话都保持纯白底，创作对话用这些提示区分：顶栏墨色「创作对话」徽标、衬线标题与 CREATIVE MODE 眉标、编号流程图和 01–04 编号卡片、输入框上方的「创作模式 · 生成结果会自动进入剪辑项目」提示，以及陶土色发送键。

### 剪辑台（创作对话）

进入剪辑台后，同一个项目里同时有：

- **预览区**：按时间轴播放当前画面，支持空格播放 / 暂停、方向键微调播放头；
- **时间轴**：画面 / 叠加 / 音频三条轨道，拖动片段改位置，拖两端裁剪，双击跳到片段开头，Delete 删除；
- **素材库**：对话里生成的图片、视频、配音会自动入库；也可以从本机上传（≤1.2MB，保存在本地）；
- **创作对话**：继续用自然语言改片，例如「把第二个镜头挪到 2 秒」「删掉最后一段」「音量小一点」，模型会输出时间轴操作并在本地直接执行；
- **按段落入轨**：创作对话里生成的图片、视频会自动按类型落到对应轨道，音频落到音频轨。

项目保存在本机 `localStorage`（`onestep_edit_projects_v1`），可在剪辑台左侧切换、重命名和删除。点「导出工程」会下载项目 JSON，包含素材地址与完整时间轴。

### 全站「添加至项目」

图片生成、视频生成、配音音频库、Skill 测试结果、对话里的生成结果卡，都带「添加至项目」按钮。点击后选择目标项目即可把素材加入素材库并追加到对应轨道，方便把散落在各模块的产出统一到一个片子里。

默认参数：

| 类型 | 模型 | 默认参数 |
| --- | --- | --- |
| 图片 | Doubao-Seedream-5.0-lite | 16:9（可选 4:3 / 3:4 / 1:1 / 9:16） |
| 视频 | MiniMax-H3 | 16:9 / 768P / 5 秒（4–15 秒，可选 2K） |

### grill-me 视频版（项目内置）

协议原文在 `skills/grill-me/SKILL.md`，同一份文件同时用于：

- 内置 AIPing 对话的系统提示词（`src/features/agent/prompt.ts`）；
- 本机 Agent 的任务提示词（`server/local/agents.mjs`）。

`.claude/skills/grill-me` 与 `.opencode/skills/grill-me` 是指向它的软链，所以在这个仓库里工作的 Claude Code / OpenCode 也能直接加载。

它约束的是「问什么、怎么问、什么时候停」：

- 只问这一轮能定的问题，依赖其他答案的留到下一轮；
- 每轮 2–4 问，最多 3 轮；每问固定给 `1` `2` `3` 三个具体方案 + `4` 自定义，并用「← 推荐」标出推荐项，回数字即可选中；
- 能自己推断的（镜头、光线、收尾）不问；
- 提问结束先出拍摄单，确认后才生成；
- 一次只生成一个连续镜头，多场景拆成多次生成。

### 给全机其他 Agent 安装通用版

通用版（不限视频，可拷问产品方向、写作、决策）已安装在 `~/.workbuddy/skills/grill-me/SKILL.md`，并以相对软链接入：

```text
~/.claude/skills/grill-me
~/.codex/skills/grill-me
~/.agents/skills/grill-me
~/.config/opencode/skills/grill-me
~/.qoder/skills/grill-me
~/.gemini/skills/grill-me
~/.dsh/skills/grill-me
（以及 .grok / .trae / .trae-cn / .vibe / .kiro / .hermes / .rovodev / .continue / .augment）
```

更新时只改 `~/.workbuddy/skills/grill-me/SKILL.md`，所有 Agent 立即生效。触发方式是在对话里说「grill me」或「拷问我」；这个仓库里的 `grill-me` 会自动替换为视频版。

## 安装到你的 Agent

OneStep 是纯本地项目，不需要云端托管，也不需要在任何平台注册应用。把下面这段指令交给 Claude Code、Cursor 或 Codex，它会自己完成克隆、安装与启动：

```text
请帮我在这台电脑上安装并运行 OneStep：

1. 克隆仓库：git clone https://github.com/JamesY077/onestepdraw.git ~/onestepdraw
2. 进入目录后运行 npm install
3. 运行 npm start，完成后把访问地址告诉我（默认 http://127.0.0.1:5500，端口被占用会自动顺延）
4. 打开页面后，由我自己填写 AIPing API Key：https://aiping.cn/user/apikey

注意：这是纯本地离线项目，不需要你读取、写入或向我索要任何密钥，也不要把项目内容上传到第三方服务。
```

首次打开页面时由你自己输入 AIPing 密钥，项目不会把密钥写进仓库或任何配置文件。仓库地址：<https://github.com/JamesY077/onestepdraw>。

## 选择本机 Agent 来创作

OneStep 启动后会自动检测本机已安装的 Agent，不需要额外配置。

1. 用 `npm start` 启动后打开对话页；
2. 点击输入框左下角的引擎名称（默认 `AIPing · DeepSeek`）；
3. 在弹出列表中选择已经安装的 Agent；
4. 正常发消息即可，对话会交给它执行。

设置页的「本机 Agent」分区还可以：

- 手动重新扫描；
- 查看每个 Agent 的版本与可执行文件路径（来自桌面应用时会标注「桌面应用内置」）；
- 查看未安装 Agent 的安装命令并一键复制；
- 对只提供桌面端、没有命令行入口的应用给出说明；
- 在「其他 Agent（自定义命令，高级）」里接入列表之外的 CLI。

扫描依赖本地服务，所以只有用 `npm start`（或单独运行 `node server/local/server.mjs`）打开页面时才可用；只用 `npm run dev` 的 Vite 开发服务器、或静态托管时，检测和调用不可用。

关于自定义命令：

- 命令在项目根目录执行，权限与你本机终端一致；
- 命令里可以用 `{prompt}` 占位，OneStep 会把对话整理成提示词填入；
- 没有 `{prompt}` 时，提示词会追加到命令末尾；
- 示例：`my-agent --cwd . --task "{prompt}"`。

为了让它能真正出图 / 出视频，本地服务会给 Agent 进程注入 `AIPING_API_KEY` 与 `AIPING_BASE_URL`，并提供脚本：

```bash
node scripts/onestep-generate.mjs image --prompt "画面描述" --ratio 16:9
node scripts/onestep-generate.mjs video --prompt "镜头描述" --ratio 16:9 --resolution 768P --duration 5
```

脚本会把结果保存到 `generated/`，并打印 `/generated/...` 链接；对话里的 Markdown 图片与视频链接由本地服务直接托管。密钥只存在于 Agent 子进程环境中，不会写入文件。

选择 DeepSeek Harness（`dsh`）时，本地服务会生成一份临时 dsh patch，把当前 AIPing 地址、密钥和所选模型接成 dsh 的 provider，因此桌面端安装的 dsh 也可以直接用 OneStep 的配置执行。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia、Vue Router
- Tailwind CSS 4
- axios（旧功能）、fetch + SSE（Agent 对话）
- marked + DOMPurify（Markdown 安全渲染）

## 项目结构

```
src/
  api/agent.ts            # AIPing /chat/completions 流式对话
  api/models.ts           # AIPing 对话模型列表与缓存
  api/localAgents.ts      # 本机 Agent 扫描与 SSE 调用
  components/agent/       # 对话页组件（侧栏、消息、输入框、Markdown、生成结果卡）
  features/agent/prompt.ts# Agent 系统提示词（含工具调用协议与 grill-me 视频澄清）
  features/agent/tools.ts # 工具块 / 时间轴操作解析、默认参数与生成任务构建
  features/generate/      # 图片 / 视频参数构建与轮询
  components/edit/        # 剪辑台：预览、时间轴、创作对话
  components/common/      # 添加至项目按钮与全局项目弹窗
  stores/agentStore.ts    # 本地会话持久化、发送与生成执行
  stores/chatModeStore.ts # 普通 / 创作对话、默认 / 完全模式
  stores/editProjectStore.ts # 剪辑项目、轨道、片段与时间轴操作
  stores/assetInboxStore.ts  # 全站「添加至项目」投递
  stores/localAgentStore.ts # 本机 Agent 检测、选择与自定义命令
  stores/modelStore.ts    # 对话模型选择与持久化
  types/edit.ts           # 项目 / 轨道 / 片段数据模型
  views/ApiKeySetup.vue   # 登录页
  views/ChatAgent.vue     # 对话主页
  views/EditStudio.vue    # 剪辑台主页
skills/grill-me/SKILL.md  # 视频版拷问协议，前端与本机 Agent 共用
server/local/server.mjs   # 本地静态服务 + API 代理 + Agent 运行接口
server/local/agents.mjs   # Agent 预设、PATH 扫描与进程流式输出
scripts/onestep-generate.mjs # 供 Agent 调用的图片 / 视频生成脚本
start-macos.command       # macOS 一键启动
start-windows.bat         # Windows 一键启动
```

## 说明

- `/edit`（剪辑项目）、`/image`、`/video`、`/voice`、`/model3d`、`/skill`、`/settings` 仍可通过右侧悬浮导航或地址直接访问。
- 剪辑台内隐藏悬浮导航，避免遮挡对话面板；用左上角返回对话、右上角齿轮进入设置。
- 「动作捕捉 / 视频动捕」入口已移除。
