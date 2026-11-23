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
  components/agent/       # 对话页组件（侧栏、消息、输入框、Markdown）
  features/agent/prompt.ts# Agent 系统提示词
  stores/agentStore.ts    # 本地会话持久化与发送逻辑
  views/ApiKeySetup.vue   # 登录页
  views/ChatAgent.vue     # 对话主页
server/local/server.mjs   # 本地静态服务 + API 代理
start-macos.command       # macOS 一键启动
start-windows.bat         # Windows 一键启动
```

## 说明

- 旧的 `/image`、`/video`、`/voice`、`/model3d`、`/skill`、`/settings` 路由仍可通过地址直接访问，但没有出现在主界面导航中。
- 「动作捕捉 / 视频动捕」入口已移除。
