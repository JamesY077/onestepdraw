# Stepframe Agent Harness

> 基于 DeepSeek Harness（DSH）官方源码的首期落地：为内置 Stepframe Agent 建立真正的多步工具循环，同时保留现有素材直路由、生成卡片、剪辑事务和本机 CLI Agent。

## 1. 源码拆解结论

参考仓库：[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)。重点阅读了 `docs/architecture.md`、`docs/subsystems/tools.md`、`docs/subsystems/session.md`，以及 `packages/core/agent-loop`、`packages/core/tools`、`packages/core/session` 的关键实现。

DSH 的核心价值不是“工具数量多”，而是以下运行时约束：

| DSH 机制 | 步帧首期借鉴 | 没有照搬的部分 |
| --- | --- | --- |
| Turn / Step 状态机 | 持续执行模型 Step，直到无工具调用或用户主动停止，不设固定步数上限 | Cordis Context、Scope、Fiber 生命周期树 |
| provider-neutral 流聚合 | OpenAI 兼容 SSE 中文本、推理和 `tool_calls` 分片聚合 | 自研通用多 provider block 协议 |
| 原始 JSON 参数拼接 | 按 tool-call index 聚合参数，完整流结束后才解析 | PTC / nested execution token |
| tool result 回注 | `assistant.tool_calls` 与 `tool.tool_call_id` 完整配对后继续推理 | 完整 append-only Session surface |
| 工具有序提交 | 默认顺序执行，不限制单步工具数量，错误结果也回注 | 并发 body 调度；创作写入和付费任务默认非并发安全 |
| 取消与截断保护 | AbortSignal 贯穿模型和工具；`length/max_tokens` 不执行半成品工具，带“拆小一点”提示自动重试 2 次；流断开/5 分钟无数据也自动重试并回滚半截文本 | 跨进程 tool outcome-unknown 修复 |
| 持久化投影 | 消息上持久化 Run、Plan、ToolActivity；刷新闭合残留 running | 多后端 JSONL writer、单写者锁和 fork/lineage |
| 纯 UI presenter | schema、宿主执行和展示投影分离，旧会话可直接重放 | Cordis 插件注册与动态 declaration merging |
| 上下文控制 | 最近 8 条逐字保留、更早轮次压成摘要、每步 64k 字符预算、工具结果 16k 上限 | 自动 token 压缩和 surface replacement |

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

本机 Codex、DSH、Claude Code 等 CLI 只在普通对话走 `/local/agent/run`，其内部工具与权限由 CLI 自己管理；本期没有把 stdout 文本猜测成 Stepframe 已审批的结构化事件。普通模式的 CLI 提示词只提供文字任务与 `onestep-mode-handoff` 协议，不注入生成脚本使用的 `AIPING_API_KEY`，并以 `ONESTEP_ALLOW_GENERATION=0` 让 `scripts/onestep-generate.mjs` fail-closed；DSH 聊天凭据改用单独的 `ONESTEP_CHAT_API_KEY`。创作对话统一使用下面的受控 Harness，确保引擎白名单与分镜确认不能被本机命令绕过。

## 3. 模块职责

```text
src/api/agent.ts
  AIPing 请求、SSE 边界、原生 tool_calls 聚合、JSON 响应兼容

src/features/agent/harness.ts
  与 Vue/Pinia 无关的 Turn/Step 循环、取消、tool result 回注

src/features/agent/toolDefinitions.ts
  模型可见 JSON Schema、纯 presentCall 展示投影

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
| 创作对话 · AIGC | 图片/视频创作、完整分镜整片生成、素材承接、项目读取、时间轴编辑及工作台跳转 | AIGC 与通用工具 | 动效工程工具、未确认分镜的新视频生成、越界修改未选片段 |
| 创作对话 · 动画 | OpenMotion / HyperFrames 工程、素材导入、项目读取与时间轴编辑 | 动效与通用工具、共享分镜草案 | 图片/视频付费生成、确认前创建/写回/渲染工程 |

文案、脚本、分镜和提示词是完整的文字交付，不自动升级成生成任务。只有用户下一步明确要求实际生成或编辑素材时，模型才提议交接。宿主同时 fail-closed：即使模型在普通模式偷跑 `generate_image` / `generate_video`，也只记录 `confirmation_required` 与确认卡，不执行生成。

结构化 `AgentCreativeHandoff` 持久化在 assistant 消息中，界面显示「是否切换到创作模式继续任务？」：

1. **切换并继续**才将原会话改为 `mode=create`，创建或关联剪辑项目，并把交接 prompt、原用户附件和模板作为下一轮创作输入；conversationId 与历史消息不变。
2. **暂不切换**只把卡片记为 dismissed，继续普通对话，不创建项目。
3. 完全模式只减少创作细节追问，不能跳过这张确认卡。
4. 原生 `suggest_create_mode` 与旧 `onestep-mode-handoff` 文本块都只表示建议，模型无法静默切换。

## 5. 工具契约与副作用

普通对话只开放上表中的 2 个工具；创作对话按引擎过滤工具，并在宿主执行层再次校验：

- `update_plan`：复杂任务最多 6 个阶段；简单任务不制造计划。
- `read_project`：读取最新项目摘要和片段 ID。
- `edit_timeline`：移动、裁剪、删除、音量、透明度；仍调用 `editProjectStore.applyTimelineOps()`。
- `generate_image`：提交图片后台任务，复用现有参数构建、模型路由、生成卡片与自动入轨。
- `prepare_storyboard`：动画与所有 AIGC 新视频任务（含单镜）先提交完整 brief、连续性约束与全部镜头。动画由本地代码绘制逐镜 SVG 参考图；AIGC 优先复用用户图片/视频，缺失时调用图片模型生成逐镜参考图。此阶段不生成正式视频，也不创建或写入动效工程。
- `generate_storyboard`：旧模型调用的兼容别名，行为与 `prepare_storyboard` 相同，不再直接启动付费队列。
- `generate_video`：只允许已确认分镜范围内的单镜补充或旧任务续跑；新视频请求必须先经过草案确认。
- `open_voice` / `open_3d`：只跳转并预填工作台，不自动付费生成。

### 完整制作单

`prepare_storyboard` 支持 1–32 个镜头，每个镜头包含唯一镜号、4–15 秒时长、完整提示词和参考媒体状态；片名、完整需求、连续性要求、画幅和分辨率与镜头一起写入会话。剪辑台预览框上方用「主画面 / 分镜」卡片切换，新草案自动打开分镜视图。用户可在每张卡上直接修改脚本和时长、上传替换图片/视频，或填写修改意见让 AI 只重做这一镜；未变化的镜头复用原参考图，不重复扣费。只有每镜参考媒体均就绪后，用户才能点击「确认全部分镜并执行」。AIGC 随后创建 `AgentProduction`，并把每镜参考图作为正式视频首帧；动画才把完整草案交给受控 Harness 创建 HyperFrames 工程。之后切换模式、追加消息或刷新页面都能恢复草案与制作单，而不是只剩当前一镜。

- `delivery=full`：自动跑完剩余全部镜头，直到整片完成或明确失败。
- `delivery=batch`：每批最多 4 镜；`preview`：只生成下一个镜头，后续续跑仍需提交完整分镜并重新确认。
- 账号级并发槽位最多 4 路，多个 Agent/制作单共享；队列始终按镜号顺序建立卡片。
- 每个镜号预先分配固定时间轴起点。S03 先完成可以先入轨到 `[S03 起点, S03 终点]`，但不会占用 S02 的位置；S02 之后完成再回填它自己的空档。
- 每镜首次失败后自动重试 2 次（最多 3 次尝试），单镜异常只标记该镜失败，不会让整片永远停在 running。
- 续跑提交完整镜头列表；宿主只复用提示词、时长、画幅和分辨率全部未变的成功镜头，其余重生成。参考图只在同一故事、画幅与脚本未变化时复用。改稿成功的镜头原位替换旧片段，不会在同一位置叠出两段视频。
- 每轮系统提示词都注入完整制作单和逐镜状态，因此长对话截断历史后仍知道尚未完成哪些镜号。

图片和视频是长任务。工具返回 `started` 只代表本地后台任务已经启动，不代表上游已受理，更不代表素材已完成；对话可以继续，生成卡片独立显示进度和结果。这样不会把输入框锁住最长一小时，也不会让模型编造媒体 URL。

视频建单拿到上游 `taskId` 后立即持久化。轮询超时、429/5xx 或网络抖动只重查同一个任务，绝不因为轮询错误重复建单；只有上游明确返回 failed/expired/cancelled 才允许下一次尝试重新建单。

时间轴仍使用发起时 revision、选中 clip 白名单和现有 undo/redo。原生工具多次修改时，每次成功后推进本 Turn 的 revision；用户手动改动会造成 stale，拒绝覆盖并要求重新读取。`read_project` 会同步本 Turn 的 revision 到刚读取的快照，因此模型按提示刷新后可以在后续 Step 安全重试，而不是永久卡在旧版本。

固定媒体片段、附件原素材修改、动画完整源码替换继续走既有专用路径，不经过通用生成工具，避免退化为文生图/文生视频。

## 6. 失败、取消与恢复

- 单个工具业务失败：记录 failed Activity，把 `{ ok:false, error }` 回注模型，由下一 Step 修正或解释。
- 非法工具 JSON：不让 SSE/调度器崩溃，作为参数错误回注。
- 输出 `length/max_tokens`：工具参数可能只有一半，绝不执行；先带“拆小一点”提示自动重试 2 次，仍截断才报错。纯文本被截断时自动从断点续写最多 2 次，回答不会停在半句。
- 流式连接中断：网关没有发送 `[DONE]` / `finish_reason` 就断开，或读取超过 5 分钟没有新字节，判定为连接中断，自动重来这一步（最多 2 次）。重试前通过 `onStepRetry` 回滚已经流到界面的半截文本，避免同一段回答出现两遍；自动重试记录在运行日志里。
- 长任务上下文：每步请求前按 64k 字符预算压缩历史，较早的工具结果只保留前 2k 字符，并从最早的整轮对话开始丢弃；只在 user 边界切分，保证 assistant `tool_calls` 与 tool 结果不被拆散。网关报上下文超限时，预算自动减半再重试（最多 2 次），不会把整轮任务判死。
- 跨轮上下文：新一轮只逐字保留最近 8 条消息，更早的轮次压成摘要（谁要做什么、产出是什么）；摘要明确标注“需要细节请重新读取项目/工程”，避免模型凭记忆改稿。用户不再需要每轮手动新建对话。
- 计划续跑：上一轮 `update_plan` 的计划作为系统事实回注（已完成 / 进行中 / 待办），并明确要求“继续任务”从第一个未完成步骤接上、不要新建计划、已完成步骤不重读。计划只挂在 assistant 消息上、历史正文里看不到，是过去“每次继续都从头读 5 个工程”的根因。
- 工具结果不再被切成非法 JSON：超过 16k 字符时返回合法信封 `{ ok, truncated, chars, preview, note }`，并提示用分页或 patch 拿全量。
- 动效源码读取：`read_motion_project` 支持 `offset/limit` 分页（默认 8000、上限 12000 字符）和 `query` 关键字定位；`hasMore/nextOffset` 明确告知还有多少没读。
- 动效写入：`write_motion_project` 新增 `mode=patch`，用 `edits[{find,replace,all}]` 在原文件上精确替换；找不到原文或命中多次会直接报错，只有新建/大改才用 `replace` + `append` 分块。
- 单步工具数量、单轮生成任务和总步数都不设上限；持续执行到模型结束或用户停止，只保留取消、参数截断和重复调用 ID 的保护。工具参数被输出上限截断时先自动重试 2 次，并提示模型拆小任务；仍截断才停止，且绝不执行半成品 JSON。
- 任务拆解：接到需求先判断阶段数，多阶段时用 `update_plan` 建立 2-12 步计划，一个 Step 只推进一个阶段，并在完成时用一句进度说明（“2/5 已完成…”）继续下一步。单步一次执行 4 个以上工具时，宿主在最后一条 tool result 追加 `[进度提醒]`，要求模型先汇报阶段成果再继续，避免静默跑完。
- 大源码写回：`write_motion_project` 单次 `replace` 超过 24000 字符会被拒绝，并提示改用 `mode=replace` 写骨架、`mode=append` 分块追加、最后一块 `final=true` 再校验完整工程。
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

Harness 测试覆盖：任意字节和 UTF-8 分片、CRLF、多行 data、多个 tool calls、JSON 响应、坏参数、结果有序回注、业务错误恢复、旧协议回退、取消、连续多步与大批次、截断自动重试、时间轴白名单、本机 EOF 和刷新恢复。Store 级回归还覆盖：文案不生成、普通模式偷跑工具只成交接卡、取消不切换、确认保留同一 conversationId 与历史、切换后开放创作工具，以及本机 CLI 普通模式生成门禁。

完整制作单回归额外覆盖：逐镜参考图先行、用户参考图优先、参考未就绪禁止总确认、单镜 AI 重做不波及其他镜头、正式视频使用分镜首帧、S01–S06 全部执行、账号级并发峰值不超过 4、固定时间轴位置、失败重试、改稿原位替换、轮询幂等，以及续跑跳过已成功镜头且不重复生成参考图。计划续跑回归覆盖：上一轮计划（已完成/进行中/待办）回注到本轮系统消息，并校验“不要新建计划、不要整份重读”的约束确实下发给模型。OpenMotion 封面另有入轨与 motion→MP4 残留回归，确保模板封面只用于模板浏览，不遮挡 HTML 首帧。

测试中的模型响应和 SSE 全部在内存构造，不请求 AIPing；创作工具验证使用 Axios mock adapter，所有分镜参考图与视频生成都只会得到 `mock.local` 假数据，不调用真实图片、视频、配音或 3D 付费接口。
