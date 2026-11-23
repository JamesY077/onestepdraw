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
start-macos.command       # macOS 一键启动
start-windows.bat         # Windows 一键启动
```

## 说明

- `/image`、`/video`、`/voice`、`/model3d`、`/skill`、`/settings` 仍可通过右侧悬浮导航或地址直接访问。
- 「动作捕捉 / 视频动捕」入口已移除。
