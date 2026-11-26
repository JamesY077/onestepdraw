# 步帧 Stepframe

> 一句话，一步成帧。

步帧是一个本地运行的 AI 创作助手。登录后是一个 Codex 风格的对话界面，内嵌 **DeepSeek V4.1 Flash**（`DeepSeek-V4.1-Flash-1017`），模型能力仍然由 **AIPing** 提供。也可以把对话交给这台电脑上已经安装的 CLI Agent（Codex、OpenCode、Qoder、Claude Code、WorkBuddy、DSH 等）来执行。

> 这是一个从 `aiping-imagevideo` 派生出的新项目，主界面已从「创作工作台」收敛为「本地 AI Agent」。旧的图片 / 视频 / 配音 / 3D 页面作为隐藏路由保留，后续可以作为 Agent 工具接入。

## 名字与图标

「步帧」有两层意思：一步一帧，把一句话做成一支片；同时 stepped frame（步进帧）也是动画里的常用手法。英文名 **Stepframe** 由此而来。

![步帧 Stepframe 图标](design/app-icon/app-icon.preview.png)

赤陶色 `#B4553A` 的圆角底上放一个奶油色画框，框里是从低到高逐级抬升的台阶：画框是「帧」，台阶是「步」，抬升的那一端表示下一步正在生成。实底加线条，不用渐变、阴影和材质特效，缩到 32px 仍然认得出来。

图标源文件在 `design/app-icon/`（SVG / PNG / 分层 SVG / 预览）。桌面版用的 `build/icon.icns` 由 `bash scripts/make-icon.sh` 从 `build/icon.png` 生成；网页侧使用 `public/favicon.svg`、`public/icon-192.png`、`public/icon-512.png`、`public/apple-touch-icon.png` 与 `public/site.webmanifest`。

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
- **对话即创作**：普通对话完整完成聊天、灵感、文案、脚本、分镜与提示词；需要实际生成或编辑素材时先展示切换确认卡，用户确认后才在同一对话进入创作模式，调用本项目的图片与视频模型。
  - 图片默认 `Seedream 5.0 Lite` + `16:9`；
  - 视频默认 `MiniMax H3` + `16:9` + `768P` + `5s`。
- **对话模型可选**：选择内置 AIPing 时，输入框会同时出现模型选择器；从 AIPing 模型列表实时拉取对话模型，支持关键字搜索与切换，默认 `DeepSeek-V4.1-Flash-1017`。
- **参考素材**：普通对话与创作对话都能一次带最多 8 个图片、视频、音频或文本文件；图片直接交给多模态模型看，视频自动抽关键帧，纯文本模型会先做一次视觉分析，本机 Agent 则拿到原文件路径。
- **模板库**：独立页面 `/templates` 按 11 个系列收录 334 种风格，197 种带参考静帧、137 种由 Seedream 5.0 Lite 生成示例图；主体是 [code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts) 的 333 种代码动画风格，另融合 [wallstreet-explainer](https://github.com/HeyChengC/wallstreet-explainer) 的「华尔街财经解读」；可以多选，选中的模板会带着参考图与风格说明一起进入创作对话，也能把常用的参考素材按「一组」存成自己的模板。
- **Skill 专区**：模板库第三个页签，内置 10 个从书、长视频、播客、课程里蒸馏出的 Agent Skill；每个都能一键带入创作对话，或带着它跳到图片 / 视频生成。还能粘贴原文现场蒸馏新的 Skill。
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

### 方式四：桌面 App（macOS）

不想在浏览器里用，可以打包成原生窗口：

```bash
npm run app             # 构建后在独立窗口里打开（开发用）
npm run app:pack        # 打包成 release/mac-arm64/Stepframe.app
npm run app:dmg         # 打包成 release/Stepframe-<version>-arm64.dmg
```

桌面版把同一套本地服务跑在 Electron 主进程里，窗口打开的是 `http://127.0.0.1:<随机端口>`，所以 `/api` 反代、对话、剪辑台和网页版完全一致。区别有三处：

- **素材不再经过浏览器存储**：上传的原文件直接写进 `~/Library/Application Support/Stepframe/data/generated/uploads/`，项目里只记地址，因此没有体积门槛，只受磁盘空间限制（`ONESTEP_UPLOAD_LIMIT_BYTES` 可以按需设上限）。
- **窗口按 macOS 习惯排布**：顶部给红绿灯留出安全区，顶栏可以拖动窗口，侧栏/顶栏不参与文字选择；窗口大小和位置会被记住。
- **导出走系统「另存为」**：导出视频、导出工程都会弹保存面板，不会悄悄落到下载目录。

素材与生成结果都在 `~/Library/Application Support/Stepframe/data/`；聊天记录、项目结构这类小数据仍在 localStorage 里。桌面版固定监听 `127.0.0.1:41739`（可用 `ONESTEP_APP_PORT` 改），因为浏览器数据按 origin 隔离，端口一变项目就会看起来「消失」。

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

普通对话可以直接完成文字任务，例如「写一条咖啡广告文案」或「把这个卖点拆成 5 镜脚本」，不会因此发起素材生成。继续说「按这个脚本做成视频」时，Agent 会给出「是否切换到创作模式继续任务？」确认卡：

- **切换并继续**：保留同一 conversationId、历史消息、附件与模板，创建或关联剪辑项目，再承接原任务；
- **暂不切换**：留在普通对话，可以继续讨论和润色，不创建项目、不生成素材。

也可以在输入框上方主动选择创作对话，再说「帮我生成一张极简白色香水主视觉，16:9」。Agent 会确认创作所需的关键参数并调用模型。生成结果以卡片形式出现在消息下方，可点击查看原图 / 播放视频；视频生成会显示排队与渲染进度。

内置 Stepframe Agent 已接入轻量 Agent Harness：原生 Function Calling → 工具执行 → 结果回注 → 继续推理，单轮最多 8 步。计划、项目读取、时间轴修改和生成任务都有可折叠执行轨迹；长图片/视频任务仍在后台卡片中运行，不阻塞下一轮对话。不支持原生工具的模型会降级到旧文本协议。架构、权限边界与恢复语义见 [`docs/agent-harness.md`](docs/agent-harness.md)。

### 两种对话模式

输入框上方是对话模式开关，输入框底部一行是 Agent 与自动程度，模型选择在发送按钮左边：

- **普通对话 / 创作对话**：普通对话处理聊天、灵感、建议及文案、脚本、分镜、提示词写作与润色，不直接生成或编辑素材；创作对话复用生成、Skill、素材和剪辑链路，生成结果进入关联项目。
- **默认模式 / 完全模式**：创作对话的默认模式会一次问一个问题；完全模式由模型自己补齐创作细节并直接执行。普通对话即使选择完全模式，实际创作前仍必须由用户确认切换。
- 两种对话都保持纯白底，创作对话用这些提示区分：顶栏墨色「创作对话」徽标、衬线标题与 CREATIVE MODE 眉标、编号流程图和 01–04 编号卡片、输入框上方的「创作模式 · 生成结果会自动进入剪辑项目」提示，以及陶土色发送键。

### 提问卡片

默认模式下，模型不会一次抛一串问题，而是在回复末尾输出一个 `onestep-ask` 块：

- 一次只问一个问题，正文只写一句过渡；
- 固定 3 个具体选项，恰好一个标「推荐」，第 4 行是自定义；
- 对话页把这块渲染成可点击的卡片，点一下就直接把答案发回模型，自定义可以当场输入；
- 选完后已选项打勾、其余选项变灰，模型接着问下一个问题，直到可以出拍摄单。
- 模型如果退回 Markdown 列表写法，前端也会兜底解析成同样的卡片。

### 参考素材与模板库

输入框左下角的回形针可以一次加最多 8 个参考素材，也可以直接把文件拖进输入框或粘贴图片：

- **图片**：压到 1280px 长边后，以多模态 `image_url` 直接发给模型；
- **视频**：附上时长与分辨率，并在本机抽 4 张关键帧一起发送；
- **音频**：附上时长，由模型结合上下文理解用途；
- **文本 / 文件**：读取正文（最多 1.6 万字）后附在消息里。

文件会先传到本机 `generated/uploads/`，返回可访问地址与绝对路径；本机 Agent 拿到的就是这些绝对路径，可以自己用命令行工具读取原文件。如果当前选的是纯文本模型，前端会自动用列表里的多模态模型做一次视觉分析，再把描述交给它；一个多模态模型都没有时会明确说明，而不是假装看过图。

模板库是一个独立页面 `/templates`，对话页顶栏、剪辑台顶栏和输入框的模板按钮都会跳到这里，选完「引用选中模板」再回到进来时的页面。页面内置 334 种风格提示词，按系列分成 11 类：代码样片 26、动态风格 32、卡通画风 38、中国风 15、现成版式 12、参考学习 7、Lemo-Opuscar 59、MG 风格 15、Code Video 31、奥斯卡 98 部 98、财经解读 1。前 10 类来自 [code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)（原素材 341 条里有 8 条只留了编号、没有正文，没有收录）。

「财经解读」是融合 [wallstreet-explainer](https://github.com/HeyChengC/wallstreet-explainer) 得到的一类：深蓝织物舞台、奶油金大数字、镜头持续慢推，图形只演钱和关系，新闻原文与当事人实拍占四成以上。应用时会同时带上 5 张参考静帧（大数字 / 片名 / 算账 / 原文刷黄 / 图表），风格说明见 `src/features/template/guides/wallstreet-explainer.md`；完整方法论（硬规则、动效、竖屏 29 个组件）留档在 `docs/wallstreet-explainer/`。

- 196 种带原素材的参考静帧，卡片直接显示真实画面；
- 其余 137 种只有文字提示词，用 Seedream 5.0 Lite 按各自的风格说明生成 16:9 示例图，卡片右上角标「AI 示例」，和原素材静帧区分开；
- 每个模板都带一份压缩过的风格说明（约 2000–2600 字：画面规则、颜色、字体、版式、动效、避免项），应用时和预览图一起带进对话；
- 模板可以同时引用多个，没有数量上限；应用后自动切回创作对话，输入框上方按 @模板1 / @模板2 排成小组件，参考图与风格说明一起带进这一轮消息；
- 「我的模板」可以新建分组，每组最多 8 个参考素材并写一句用法说明，保存在本机 `localStorage`（`onestep_template_groups_v1`）；
- 引用的模板会显示在输入框上方，可单独点 × 移除或一次清空；发完消息后自动清空，已发送的消息里保留模板引用；
- 搜索覆盖风格名、编号（如 `B3`）和分类；
- 素材来自 `code-animation-prompts`（原素材整理：哔哩哔哩「俯仰观照」），免费使用与转发，禁止包装成付费课程或付费 skill 销售；Lemo-Opuscar / mg-styles-15 / code-video 三个来源保留原 MIT 许可与署名；「财经解读」融合自 `wallstreet-explainer`（MIT），示例静帧只作风格参考；
- 更新风格数据：`python3 scripts/import-code-animation-templates.py` 从镜像拉取提示词与静帧，压成 `src/features/template/builtin.ts`，并把 560px 宽的预览图写到 `public/templates/code-animation/`；`--source <仓库路径>` 改用本地克隆，`--keep-posters` 复用已有图片；手工维护的风格（如「财经解读」）放在 `src/features/template/extra.ts`，脚本重写 `builtin.ts` 时会自动合并，不会被覆盖；
- 补生成示例图：`AIPING_API_KEY=... python3 scripts/generate-template-stills.py` 只处理没有静帧、也还没有 AI 示例的条目；`--only K4,Z1` 指定编号，`--force` 重新生成，`--workers` 控制并发。

### Skill 专区与内容蒸馏

模板库的第三个页签是「Skill 专区」，把 [cangjie-skill](https://github.com/kangarooking/cangjie-skill) 的思路接了进来：**把书、长视频、播客、课程里的方法论蒸馏成 agent 可以直接执行的 Skill**，再让 Skill 在创作流程里被真正调用。

内置 10 个 Skill，正文在 `skills/library/`：

| Skill | 来源 | 适合 |
| --- | --- | --- |
| 短视频脚本导演 | `video-director` + `grill-me`（MIT） | 一句话 → 分镜脚本 → 逐镜生成 |
| 爆款文案 | 《爆款文案》框架 | 标题、口播、卖点、CTA |
| 疯传 STEPPS | 《疯传》 | 传播机制与话题设计 |
| 影响力设计 | 《影响力》 | 提案、销售页、沟通与防操控 |
| 第一性原理 | 《第一性原理》 | 拆假设、重建方案 |
| 多元思维模型 | 《穷查理宝典》 | 高不确定性决策 |
| AI 项目评估 | 吴恩达《AI for Everyone》 | 判断 AI 机会与试点 |
| 系统提示词设计 | system-prompt-skills | Agent 提示词与评测 |
| 1000 个铁粉 | 《1000 个铁粉》 | 个人品牌与复购 |
| 内容蒸馏 | cangjie-skill · RIA-TV++ | 继续蒸馏新内容 |

每个卡片有三个动作：

- **带入创作对话**：把 Skill 加入生成页的已启用列表，切到创作对话并跳到 `/chat`；输入框上方会显示 Skill 胶囊，系统提示词会注入完整规范；
- **图片生成 / 视频生成**：带着同一个 Skill 跳到 `/image` 或 `/video`，在「风格 Skill」区里直接可见、可移除。

「蒸馏新 Skill」支持粘贴原文或导入 `.md` / `.txt` / `.srt` / `.vtt`：

1. 原文最长取 26000 字，先做整体理解；
2. 只抽决策框架、操作流程、判断规则、清单与模板，不写书摘；
3. 每个候选单元过「可执行 / 有边界 / 可复用」三重验证；
4. 输出 1–3 份标准 SKILL.md（何时使用 / 输入 / 步骤 / 输出格式 / 检查清单 / 反例），同名自动去重；
5. 蒸馏结果保存在本机 `localStorage`（`onestep_distilled_skills_v1`），最多 30 份，可随时删除或带入生成页。

蒸馏提示词在 `src/features/skill/library/distill.ts`，内置 Skill 元数据在 `src/features/skill/library/builtin.ts`。

### 剪辑台（创作对话）

进入剪辑台后，同一个项目里同时有：

- **预览区**：按时间轴播放当前画面，画面严格按项目比例缩放，不会被容器拉变形；支持空格播放 / 暂停、方向键微调播放头；
- **时间轴**：不再固定「画面 / 叠加 / 音频」三条专用轨道，素材按类型自动占轨：图片、视频从下往上排，音频落到下方音频轨；同一时间被占用会自动新开一条轨道，空轨道自动收掉。拖动片段改位置或移到兼容轨道（边缘自动吸附到其他片段 / 播放头，并显示参考线），拖两端裁剪，双击跳到片段开头，Delete 删除；音频轨会画出波形，裁切时波形跟着截取；
- **OpenMotion 动效**：内置 287 条模板目录，支持搜索、预览、「复刻模板」和「贴个视频链接，做同款」；可编辑工程复制到本地后调整变量、查看源码，预览和 MP4 渲染共用 HyperFrames 0.9.7。参考复刻保留镜头顺序、节奏、动效语言、停留点和原作署名，不承诺像素级复制；
- **字幕与关键帧**：字幕可新增、编辑、定位并直接烧录进 MP4；片段音量和不透明度支持关键帧及缓动曲线，预览与导出共用同一插值采样器；
- **命名版本**：最多保存 8 个手动命名快照，可查看结构差异和恢复版本，恢复前自动保留撤销点；
- **时间轴高度**：拖动时间轴上沿可以上下调整高度（最低 150px，会记住；双击上沿复位）；轨道变多时轨道区和左侧轨道头同步纵向滚动，刻度尺固定在顶部；
- **播放与剪辑**：播放按钮、回到开头和时间码在预览画面下方；分割、复制、删除、撤销、重做和缩放放在时间轴标题栏；
- **剪辑快捷键**：空格播放 / 暂停；⌘/Ctrl+B 或 ⌘/Ctrl+K 在播放头分割；⌘/Ctrl+D 复制片段；⌘/Ctrl+C / X / V 复制、剪切、粘贴到播放头；Delete 删除；⌘/Ctrl+Z 撤销、⇧⌘/Ctrl+Z 重做；Home / End 跳到片头 / 片尾；`+` / `-` 缩放、`\` 适配窗口；M 静音所在轨道；Esc 取消选择；`?` 打开完整快捷键面板（时间轴标题栏也有入口）；Alt+方向键平移片段、Ctrl/⌘+滚轮以指针为锚点缩放、Shift/普通滚轮横向滚动；
- **素材库**：对话里生成的图片、视频、配音会自动入库；也可以从本机上传（≤1.2MB，保存在本地）；
- **创作对话**：继续用自然语言改片，例如「把第二个镜头挪到 2 秒」「删掉最后一段」「音量小一点」，模型会输出时间轴操作并在本地直接执行；对话栏在桌面端可以拖左边框调宽（360–600px，宽度会记住），窄屏则变成从右侧滑出的抽屉，不再挤压预览与时间轴；
- **按段落入轨**：创作对话里生成的图片、视频、配音会直接落到时间轴，类型不同的素材自动分轨，不会互相压住。

项目保存在本机 `localStorage`（`onestep_edit_projects_v1`），可在剪辑台左侧切换、重命名和删除。点「导出工程」会下载项目 JSON（素材地址 + 完整时间轴）；点「导出视频」会在浏览器里直接渲染并封装 MP4（H.264 + AAC）。

导出依赖浏览器的 WebCodecs：Chrome / Edge 等 Chromium 内核浏览器可用，Safari 需要较新版本，不支持时会给出明确提示而不是静默失败。导出过程显示「渲染 帧数 / 总帧数」进度，可以随时取消；图片、视频（含内嵌音轨）和音频轨会一起混流，音频轨静音时不会写入。动效片段整片导出时先由本机 HyperFrames CLI 渲染成 MP4，只替换导出快照，原时间轴工程仍可编辑；代码动画或素材读取失败会明确中止，避免静默黑场。完成后会重新解析最终 MP4 Blob，独立核对尺寸、时长与音轨。

#### 时间轴为什么顺手

拖动和播放时不做整棵组件树的重渲染，这是「丝滑」的关键：

- 播放头是独立模块里的一帧状态（`src/features/edit/playhead.ts`），时间轴用 `watch` 直接写 `transform`，播放时每帧不触发 Vue 重渲染；
- 拖动只写 DOM：`pointermove` 期间直接改被拖动片段的 `translate3d` 与宽度，松手才提交一次 Pinia 更新，因此一次拖拽只入一条撤销记录；
- 吸附候选点（片段边缘 / 播放头 / 0 秒）在按下时收集成有序数组，移动中用二分查找最近点，阈值按像素算；
- 时间轴按可视窗口虚拟化：只有视口附近的片段和刻度会渲染，240 个片段时拖动仍能保持 60fps；
- 音频波形用 `OfflineAudioContext` 预解码成峰值缓存，之后只按缩放重绘 canvas，不参与播放循环；
- 导出用 `mediabunny`（WebCodecs）在本地编码 H.264 + AAC，导出依赖按需加载，不占剪辑台首屏体积。

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

- 一次只问一个问题，依赖其他答案的留到下一轮；关键分支最多 5 问；
- 每问固定给 `1` `2` `3` 三个具体方案 + `4` 自定义，并用 `recommended` 标出推荐项，点选即可推进；
- 能自己推断的（镜头、光线、收尾）不问；
- 提问结束先出拍摄单，确认后才生成；
- 一次只生成一个连续镜头，多场景拆成多次生成。

### 短视频脚本导演（一句话 → 可执行脚本）

协议原文在 `skills/video-script/SKILL.md`，创作对话的系统提示词会注入同一份文件。它把「一句话」拆成可检查的五步：

1. 一句话命题：谁、在什么处境、做了什么、最后落在哪里；
2. 结构：0–3 秒钩子 → 3–8 秒展开 → 最后 2–3 秒落点；
3. 分镜表：镜号、时长、景别与运镜、画面、字幕、声音、生成方式；
4. 每镜提示词：主体外观 → 动作 → 环境 → 光线 → 镜头 → 风格 → 禁止项；
5. 连续性与质检：角色锚点、场景锚点、尾帧承接，先做 S01 再逐镜推进。

它同时是 Skill 专区里的第一个内置 Skill，可以单独带到图片 / 视频页使用。

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

步帧是纯本地项目，不需要云端托管，也不需要在任何平台注册应用。把下面这段指令交给 Claude Code、Cursor 或 Codex，它会自己完成克隆、安装与启动：

```text
请帮我在这台电脑上安装并运行步帧：

1. 克隆仓库：git clone https://github.com/JamesY077/onestepdraw.git ~/onestepdraw
2. 进入目录后运行 npm install
3. 运行 npm start，完成后把访问地址告诉我（默认 http://127.0.0.1:5500，端口被占用会自动顺延）
4. 打开页面后，由我自己填写 AIPing API Key：https://aiping.cn/user/apikey

注意：这是纯本地离线项目，不需要你读取、写入或向我索要任何密钥，也不要把项目内容上传到第三方服务。
```

首次打开页面时由你自己输入 AIPing 密钥，项目不会把密钥写进仓库或任何配置文件。仓库地址：<https://github.com/JamesY077/onestepdraw>。

## 选择本机 Agent 来创作

步帧启动后会自动检测本机已安装的 Agent，不需要额外配置。

1. 用 `npm start` 启动后打开对话页；
2. 点击输入框左下角的 Agent 图标（默认 `AIPing · DeepSeek`）；
3. 在弹出列表中选择已经安装的 Agent；
4. 正常发消息即可，对话会交给它执行。

列表里的图标取自本机已安装的应用：Codex、OpenCode、Qoder、WorkBuddy / CodeBuddy、DeepSeek Harness 用各自的图标；AIPing 用官方标志里的图形部分（不带字标）；扫不到图标的 Agent 显示名称首字母。

设置页的「本机 Agent」分区还可以：

- 手动重新扫描；
- 查看每个 Agent 的版本与可执行文件路径（来自桌面应用时会标注「桌面应用内置」）；
- 查看未安装 Agent 的安装命令并一键复制；
- 对只提供桌面端、没有命令行入口的应用给出说明；
- 在「其他 Agent（自定义命令，高级）」里接入列表之外的 CLI。

扫描依赖本地服务，所以只有用 `npm start`（或单独运行 `node server/local/server.mjs`）打开页面时才可用；只用 `npm run dev` 的 Vite 开发服务器、或静态托管时，检测和调用不可用。

关于自定义命令：

- 命令在项目根目录执行，权限与你本机终端一致；
- 命令里可以用 `{prompt}` 占位，步帧会把对话整理成提示词填入；
- 没有 `{prompt}` 时，提示词会追加到命令末尾；
- 示例：`my-agent --cwd . --task "{prompt}"`。

为了让它能真正出图 / 出视频，本地服务会给 Agent 进程注入 `AIPING_API_KEY` 与 `AIPING_BASE_URL`，并提供脚本：

```bash
node scripts/onestep-generate.mjs image --prompt "画面描述" --ratio 16:9
node scripts/onestep-generate.mjs video --prompt "镜头描述" --ratio 16:9 --resolution 768P --duration 5
```

脚本会把结果保存到 `generated/`，并打印 `/generated/...` 链接；对话里的 Markdown 图片与视频链接由本地服务直接托管。密钥只存在于 Agent 子进程环境中，不会写入文件。

选择 DeepSeek Harness（`dsh`）时，本地服务会生成一份临时 dsh patch，把当前 AIPing 地址、密钥和所选模型接成 dsh 的 provider，因此桌面端安装的 dsh 也可以直接用步帧的配置执行。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia、Vue Router
- Tailwind CSS 4
- axios（旧功能）、fetch + SSE（Agent 对话）
- marked + DOMPurify（Markdown 安全渲染）

## 项目结构

```
src/
  api/agent.ts            # AIPing 流式对话与原生 tool_calls 聚合
  api/models.ts           # AIPing 对话模型列表与缓存
  api/localAgents.ts      # 本机 Agent 扫描与 SSE 调用
  components/agent/       # 对话组件、执行轨迹、输入框、Markdown、生成结果卡
  features/agent/harness.ts # 多步 Turn/Step、工具结果回注、取消与上限
  features/agent/toolDefinitions.ts # 原生工具 JSON Schema 与纯 UI 投影
  features/agent/recovery.ts # 刷新后的中断状态恢复
  features/agent/prompt.ts# Agent 系统提示词（含工具调用协议与 grill-me 视频澄清）
  features/agent/tools.ts # 旧工具协议 / 时间轴参数、默认参数与生成任务构建
  features/generate/      # 图片 / 视频参数构建与轮询
  components/edit/        # 剪辑台：预览、时间轴、创作对话、波形
  features/edit/          # 播放头状态、吸附、波形峰值、WebCodecs 导出
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
skills/video-script/SKILL.md # 一句话 → 可执行分镜脚本，前端与 Skill 专区共用
skills/library/           # Skill 专区的内置蒸馏 Skill（10 份）
server/local/server.mjs   # 本地静态服务 + API 代理 + Agent 运行接口
server/local/agents.mjs   # Agent 预设、PATH 扫描与进程流式输出
scripts/onestep-generate.mjs # 供 Agent 调用的图片 / 视频生成脚本
start-macos.command       # macOS 一键启动
start-windows.bat         # Windows 一键启动
```

## 无付费回归测试

```bash
npm test                   # Agent Harness + 素材/项目事务回归
npm run test:agent-harness # 原生工具 SSE、多步回注、取消与刷新恢复（全 mock）
npm run test:clip-revision # 固定片段、附件、模板、Skill 与原素材优先级
npm run build              # TypeScript 类型检查 + 生产构建
```

## 说明

- `/edit`（剪辑项目）、`/image`、`/video`、`/voice`、`/model3d`、`/skill`、`/settings` 仍可通过右侧悬浮导航或地址直接访问。
- 剪辑台内隐藏悬浮导航，避免遮挡对话面板；用左上角返回对话、右上角齿轮进入设置。
- 「动作捕捉 / 视频动捕」入口已移除。
