# Stepframe Agent Harness

> 基于 DeepSeek Harness（DSH）官方源码的首期落地：为内置 Stepframe Agent 建立真正的多步工具循环，同时保留现有素材直路由、生成卡片、剪辑事务和本机 CLI Agent。

## 1. 源码拆解结论

参考仓库：[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)。重点阅读了 `docs/architecture.md`、`docs/subsystems/tools.md`、`docs/subsystems/session.md`，以及 `packages/core/agent-loop`、`packages/core/tools`、`packages/core/session` 的关键实现。

DSH 的核心价值不是“工具数量多”，而是以下运行时约束：

| DSH 机制 | 步帧首期借鉴 | 没有照搬的部分 |
| --- | --- | --- |
| Turn / Step 状态机 | 一个用户 Turn 最多 8 个模型 Step；无工具调用时结束 | Cordis Context、Scope、Fiber 生命周期树 |
| provider-neutral 流聚合 | OpenAI 兼容 SSE 中文本、推理和 `tool_calls` 分片聚合 | 自研通用多 provider block 协议 |
| 原始 JSON 参数拼接 | 按 tool-call index 聚合参数，完整流结束后才解析 | PTC / nested execution token |
| tool result 回注 | `assistant.tool_calls` 与 `tool.tool_call_id` 完整配对后继续推理 | 完整 append-only Session surface |
| 工具有序提交 | 默认顺序执行，最多 4 个/Step，错误结果也回注 | 并发 body 调度；创作写入和付费任务默认非并发安全 |
| 取消与截断保护 | AbortSignal 贯穿模型和工具；`length/max_tokens` 不执行半成品工具 | 跨进程 tool outcome-unknown 修复 |
| 持久化投影 | 消息上持久化 Run、Plan、ToolActivity；刷新闭合残留 running | 多后端 JSONL writer、单写者锁和 fork/lineage |
| 纯 UI presenter | schema、宿主执行和展示投影分离，旧会话可直接重放 | Cordis 插件注册与动态 declaration merging |
| 上下文控制 | 保留最近 40 条历史、工具结果 1.6 万字上限、项目摘要按需读取 | 自动 token 压缩和 surface replacement |

不引入 Cordis 微内核，是因为步帧当前不需要第三方插件热插拔。首期的正确性边界是：**多步协议合法、工具可观察、写入安全、取消不悬空、刷新不伪装运行中**。

## 2. 现有问题与改造映射

改造前，内置 Agent 的实际路径是：

```text
单次文本流 → 解析 Markdown 控制块 → 最多执行首个生成工具 → 结束
```

主要缺口：无原生 tools、无 tool role、无结果回注、无统一执行状态、刷新后 streaming/running 残留。停止后立刻切换会话还有运行状态竞态；本机 CLI 有 stdout 但非零退出会被误判成功。

改造后的内置路径：

```text
用户消息
  → Step 1：system + 最近历史 + 原生工具 schemas
  → 聚合 assistant content / reasoning / tool_calls
  → 顺序执行工具并记录 Activity
  → assistant(tool_calls) + tool(tool_call_id, result) 回注
  → Step 2…N：模型根据真实结果继续
  → 无工具调用：解析提问卡片/旧时间轴格式，完成 Turn
```

本机 Codex、DSH、Claude Code 等 CLI 仍走 `/local/agent/run`，其内部工具与权限由 CLI 自己管理；本期没有把 stdout 文本猜测成 Stepframe 已审批的结构化事件。普通模式的 CLI 提示词只提供文字任务与 `onestep-mode-handoff` 协议，不注入生成脚本使用的 `AIPING_API_KEY`，并以 `ONESTEP_ALLOW_GENERATION=0` 让 `scripts/onestep-generate.mjs` fail-closed；DSH 聊天凭据改用单独的 `ONESTEP_CHAT_API_KEY`。

## 3. 模块职责

```text
src/api/agent.ts
  AIPing 请求、SSE 边界、原生 tool_calls 聚合、JSON 响应兼容

src/features/agent/harness.ts
  与 Vue/Pinia 无关的 Turn/Step 循环、步数/批量上限、取消、tool result 回注

src/features/agent/toolDefinitions.ts
  模型可见 JSON Schema、8 步上限、纯 presentCall 展示投影

src/features/agent/tools.ts
  旧文本协议兼容、时间轴参数白名单、生成参数归一化

src/features/agent/recovery.ts
  页面刷新后的消息、Run、Activity、Generation 中断恢复

src/features/agent/production.ts
  完整分镜校验、账号级 4 路并发槽位、批次队列与逐镜进度摘要

src/stores/agentStore.ts
  会话事实源、工具宿主、现有生成与剪辑事务、持久化、引擎路由

src/components/agent/AgentRunTrace.vue
  计划与工具执行轨迹；普通短聊完成后不留下冗余面板
```

模型请求只包含 `name/description/parameters`。执行函数、Pinia store、项目对象、权限与 UI presenter 不会泄露进请求体。

## 4. 普通对话与创作对话

两种模式共享同一个 `AgentConversation`，但模型工具和宿主权限不同：

| 模式 | 可以完成 | 模型工具 | 明确禁止 |
| --- | --- | --- | --- |
| 普通对话 | 聊天、灵感、建议、文案、脚本、分镜、提示词写作与润色 | `update_plan`、`suggest_create_mode` | 生成或编辑素材、修改时间轴、跳转工作台、附件直改 |
| 创作对话 | 图片/视频创作、完整分镜整片生成、素材承接、项目读取、时间轴编辑及工作台跳转 | 全部 8 个工具 | 无用户意图的额外生成、越界修改未选片段 |

文案、脚本、分镜和提示词是完整的文字交付，不自动升级成生成任务。只有用户下一步明确要求实际生成或编辑素材时，模型才提议交接。宿主同时 fail-closed：即使模型在普通模式偷跑 `generate_image` / `generate_video`，也只记录 `confirmation_required` 与确认卡，不执行生成。

结构化 `AgentCreativeHandoff` 持久化在 assistant 消息中，界面显示「是否切换到创作模式继续任务？」：

1. **切换并继续**才将原会话改为 `mode=create`，创建或关联剪辑项目，并把交接 prompt、原用户附件和模板作为下一轮创作输入；conversationId 与历史消息不变。
2. **暂不切换**只把卡片记为 dismissed，继续普通对话，不创建项目。
3. 完全模式只减少创作细节追问，不能跳过这张确认卡。
4. 原生 `suggest_create_mode` 与旧 `onestep-mode-handoff` 文本块都只表示建议，模型无法静默切换。

## 5. 工具契约与副作用

创作对话提供 8 个工具；普通对话只开放上表中的 2 个：

- `update_plan`：复杂任务最多 6 个阶段；简单任务不制造计划。
- `read_project`：读取最新项目摘要和片段 ID。
- `edit_timeline`：移动、裁剪、删除、音量、透明度；仍调用 `editProjectStore.applyTimelineOps()`。
- `generate_image` / `generate_video`：提交后台任务，复用现有参数构建、模型路由、轮询、生成卡片与自动入轨。
- `generate_storyboard`：一次提交完整 brief、连续性约束与全部镜头；宿主逐镜持久化并按镜号执行，不依赖模型逐步记住整片。
- `open_voice` / `open_3d`：只跳转并预填工作台，不自动付费生成。

### 完整制作单

`generate_storyboard` 要求至少两个镜头，每个镜头包含唯一镜号、4–15 秒时长和完整提示词；片名、完整需求、连续性要求、画幅和分辨率与镜头一起写入 `AgentProduction`。之后切换模式、追加消息或刷新页面都能从制作单恢复完整分镜，而不是只剩当前一镜。

- `delivery=full`：自动跑完剩余全部镜头，直到整片完成或明确失败。
- `delivery=batch`：每批最多 4 镜；`preview`：只生成下一个镜头，等待用户确认。
- 账号级并发槽位最多 4 路，多个 Agent/制作单共享；队列始终按镜号顺序建立卡片。
- 每个镜号预先分配固定时间轴起点。S03 先完成可以先入轨到 `[S03 起点, S03 终点]`，但不会占用 S02 的位置；S02 之后完成再回填它自己的空档。
- 每镜首次失败后自动重试 2 次（最多 3 次尝试），单镜异常只标记该镜失败，不会让整片永远停在 running。
- 续跑提交完整镜头列表；宿主只复用提示词、时长、画幅和分辨率全部未变的成功镜头，其余重生成。改稿成功的镜头原位替换旧片段，不会在同一位置叠出两段视频。
- 每轮系统提示词都注入完整制作单和逐镜状态，因此长对话截断历史后仍知道尚未完成哪些镜号。

图片和视频是长任务。工具返回 `started` 只代表本地后台任务已经启动，不代表上游已受理，更不代表素材已完成；对话可以继续，生成卡片独立显示进度和结果。这样不会把输入框锁住最长一小时，也不会让模型编造媒体 URL。

视频建单拿到上游 `taskId` 后立即持久化。轮询超时、429/5xx 或网络抖动只重查同一个任务，绝不因为轮询错误重复建单；只有上游明确返回 failed/expired/cancelled 才允许下一次尝试重新建单。

时间轴仍使用发起时 revision、选中 clip 白名单和现有 undo/redo。原生工具多次修改时，每次成功后推进本 Turn 的 revision；用户手动改动会造成 stale，拒绝覆盖并要求重新读取。`read_project` 会同步本 Turn 的 revision 到刚读取的快照，因此模型按提示刷新后可以在后续 Step 安全重试，而不是永久卡在旧版本。

固定媒体片段、附件原素材修改、动画完整源码替换继续走既有专用路径，不经过通用生成工具，避免退化为文生图/文生视频。

## 6. 失败、取消与恢复

- 单个工具业务失败：记录 failed Activity，把 `{ ok:false, error }` 回注模型，由下一 Step 修正或解释。
- 非法工具 JSON：不让 SSE/调度器崩溃，作为参数错误回注。
- 输出 `length/max_tokens`：不执行 tool calls，避免运行半个 JSON。
- 单批超过 4 个工具或整轮超过 8 步：停止并给出可操作错误。
- 用户停止：abort 当前模型/工具循环；同步释放会话切换，新请求不会被旧 finally 清除。
- 页面刷新：遗留 streaming → stopped；running Activity/Run → stopped；本地等待中的 Generation → failed，并明确“远端状态未知”，提供重试；已落盘的制作单与逐镜状态保留，已成功镜头仍可继续跳过。
- 本机 CLI：非零退出即使有正文也显示错误；EOF 未收到 done/error 判定为连接中断。
- 整片队列异常：制作单进入 failed 而不是 running，未完成镜号标为失败，提示继续生成；已完成镜号的片段和付费结果不会被丢弃。

本期**不声称**能从 token 中断点续写，也不声称刷新后能恢复远端视频轮询。UI 使用“重新尝试”，不是虚假的“断点续跑”。已取得 `taskId` 的镜头在同一应用会话内会继续重查原任务；跨刷新仍以“远端状态未知”提示用户。

## 7. 兼容与降级

- 支持原生 Function Calling 的模型优先走 `tools`。
- HTTP 400 明确拒绝 tools 时，本轮切换到旧 `onestep-tool` 文本协议；旧协议同样进入结果回注循环。
- 旧文本工具由 Harness 执行后，收尾不再二次执行，避免重复提交生成或重复打开工作台。
- 选中动画等固定目标路由不开放通用原生工具，继续使用完整源码保护。
- 旧 `template → templates`、单 `generation → generations`、旧提问卡片和旧时间轴块继续兼容。
- 默认图片/视频模型、MiniMax 参考图协议、配音模型、模板、Skill 和剪辑导出均未改变。

## 8. 无付费验证

```bash
npm run test:agent-harness  # SSE/循环/取消/恢复，内存 mock
npm run test:clip-revision  # 既有素材与项目事务回归
npm test                   # 两组一起
npm run build              # 类型检查 + 生产构建
```

Harness 测试覆盖：任意字节和 UTF-8 分片、CRLF、多行 data、多个 tool calls、JSON 响应、坏参数、结果有序回注、业务错误恢复、旧协议回退、取消、步数/批量上限、截断保护、时间轴白名单、本机 EOF 和刷新恢复。Store 级回归还覆盖：文案不生成、普通模式偷跑工具只成交接卡、取消不切换、确认保留同一 conversationId 与历史、切换后开放创作工具，以及本机 CLI 普通模式生成门禁。

完整制作单回归额外覆盖：S01–S06 全部执行、账号级并发峰值不超过 4、S03 先完成仍保留 S02 的固定位置、单镜失败自动重试后成功、画幅/分辨率变化不复用旧结果、改稿只重生成对应镜号并原位替换、轮询抖动只重查原 `taskId`、上游明确失败最多尝试 3 次，以及续跑跳过已成功镜头不重复扣费。

测试中的模型响应和 SSE 全部在内存构造，不请求 AIPing；创作工具验证使用 Axios mock adapter，唯一一次图片生成也只会得到 `mock.local` 假图，不调用真实图片、视频、配音或 3D 付费接口。
