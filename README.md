# OneStep

一个本地运行的 AI 创作助手。登录后是一个 Codex 风格的对话界面，内嵌 **DeepSeek V4.1 Flash**（`DeepSeek-V4.1-Flash-1017`），模型能力仍然由 **AIPing** 提供。

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
- **右侧悬浮导航**：对话、Skill、图片、视频、配音、3D、设置固定在页面右侧；移动端折叠为一个按钮。
- **MCP 接入**：内置零依赖 MCP Server，可让 Claude Code、Cursor、Codex、Claude Desktop 直接调用 OneStep 的图片 / 视频生成能力。
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

默认参数：

| 类型 | 模型 | 默认参数 |
| --- | --- | --- |
| 图片 | Doubao-Seedream-5.0-lite | 16:9（可选 4:3 / 3:4 / 1:1 / 9:16） |
| 视频 | MiniMax-H3 | 16:9 / 768P / 5 秒（4–15 秒，可选 2K） |

## 接入外部 Agent（MCP）

项目内置一个零依赖的 MCP Server，通过 stdio 暴露三个工具：

- `generate_image`：文生图，返回图片 URL；
- `generate_video`：创建视频任务，可等待完成或立即返回 `task_id`；
- `check_video`：查询视频任务状态。

设置页「Agent 接入」会根据当前账号生成可直接复制的配置。也可以手动运行：

```bash
AIPING_API_KEY=sk-xxxx node server/mcp/server.mjs
```

Claude Code：

```bash
claude mcp add onestep -e AIPING_API_KEY=sk-xxxx -- node "/绝对路径/onestepdraw/server/mcp/server.mjs"
```

Cursor / Claude Desktop（`mcpServers` 配置）：

```json
{
  "mcpServers": {
    "onestep": {
      "command": "node",
      "args": ["/绝对路径/onestepdraw/server/mcp/server.mjs"],
      "env": { "AIPING_API_KEY": "sk-xxxx" }
    }
  }
}
```

Codex（`~/.codex/config.toml`）：

```toml
[mcp_servers.onestep]
command = "node"
args = ["/绝对路径/onestepdraw/server/mcp/server.mjs"]
env = { AIPING_API_KEY = "sk-xxxx" }
```

可选环境变量：`AIPING_BASE_URL`、`ONESTEP_IMAGE_MODEL`、`ONESTEP_VIDEO_MODEL`。

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
  components/agent/       # 对话页组件（侧栏、消息、输入框、Markdown、生成结果卡）
  features/agent/prompt.ts# Agent 系统提示词（含工具调用协议）
  features/agent/tools.ts # 工具块解析、默认参数与生成任务构建
  features/generate/      # 图片 / 视频参数构建与轮询
  stores/agentStore.ts    # 本地会话持久化、发送与生成执行
  views/ApiKeySetup.vue   # 登录页
  views/ChatAgent.vue     # 对话主页
server/local/server.mjs   # 本地静态服务 + API 代理
server/mcp/server.mjs     # 零依赖 MCP Server（stdio）
start-macos.command       # macOS 一键启动
start-windows.bat         # Windows 一键启动
```

## 说明

- `/image`、`/video`、`/voice`、`/model3d`、`/skill`、`/settings` 仍可通过右侧悬浮导航或地址直接访问。
- 「动作捕捉 / 视频动捕」入口已移除。
