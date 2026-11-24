# 华尔街财经解读（Wall Street Explainer）

模板库「财经解读」分类的完整方法论留档，融合自 [HeyChengC/wallstreet-explainer](https://github.com/HeyChengC/wallstreet-explainer)（MIT）。

应用里参与生成的是蒸馏版 `src/features/template/guides/wallstreet-explainer.md`：每轮对话都会随模板一起发给模型，所以只保留能直接执行的视觉规则、组件选择和避免项。这里保留原仓库的完整规则与组件表，供继续扩展或人工对照。

## 文件

| 文件 | 内容 |
| --- | --- |
| `references/style.md` | 色板、舞台、字体、字幕、大数字的具体参数 |
| `references/motion.md` | 动效原理、量化指标、15 种镜头手法 |
| `references/rules.md` | 43 条硬规则与检查方式 |
| `references/grammar.md` | 镜头怎么接、转场与承接 |
| `references/thinking.md` | 选题、结构、信息取舍 |
| `references/opening.md` | 开头 5–7 秒的钩子 |
| `references/presenter.md` | 真人口播层怎么用 |
| `references/sourcing.md` | 真素材去哪找、怎么核许可 |
| `references/audio.md` | 配音、音乐、音效 |
| `references/lessons.md` | 从参考片与失败版本里得到的结论 |
| `references/review.md` | 交片前怎么自查 |
| `kit.md` | 横屏 31 个场景的参数与选法 |
| `kit-vertical.md` | 竖屏 9:16 的精装组件与道具 |
| `LICENSE` | 原仓库 MIT 许可 |

原仓库的渲染脚本（Playwright + ffmpeg）、`kit/` 运行时与示例片没有带进来：步帧用的是自己的生成与剪辑链路，只需要这套风格语言。要跑原仓库的模板渲染，直接克隆原仓库即可。

## 应用里的位置

- 分类：`财经解读`（`finance`）
- 模板：`W1 华尔街财经解读`（`ws-explainer`）
- 海报与参考静帧：`public/templates/wallstreet/`
  - `number.jpg` 大数字（海报）
  - `title.jpg` 片名
  - `equation.jpg` 算账
  - `article.jpg` 原文刷黄
  - `chart.jpg` 图表
- 条目定义：`src/features/template/extra.ts`（手工维护，不会被导入脚本覆盖）
- 蒸馏版风格说明：`src/features/template/guides/wallstreet-explainer.md`

## 注意

- 这些静帧截自原仓库示例片，片中新闻截图与实拍仅作**风格参考**，不是可商用素材；正式创作要换成自己核实过、有授权的真素材。
- 参考图里的文字、数字和公司名不要照抄。
- 原仓库里明确标注为「占位」的图片（`assets/kit/ph/`）没有带进来。
