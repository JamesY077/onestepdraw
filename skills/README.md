# 步帧 Skill 目录

这里存放会被应用直接加载的 Skill 文件。两类：

- `grill-me/SKILL.md`、`video-script/SKILL.md`：对话 Agent 的创作流程规范，构建时以 `?raw` 注入系统提示词。
- `library/*.md`：模板库「Skill 专区」里的内置蒸馏 Skill，由 `src/features/skill/library/builtin.ts` 读取。

## 来源与许可

| Skill | 来源 | 许可 |
| --- | --- | --- |
| `grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/grill-me)（视频版由本项目改写） | MIT |
| `video-script` | 参考 [win4r/video-director](https://github.com/win4r/video-director) 的结构与时间观、`grill-me` 的提问协议，结合步帧单镜生成能力重写 | MIT |
| `library/cangjie-distill` | 改编自 [cangjie-skill](https://github.com/kangarooking/cangjie-skill) 的 RIA-TV++ 方法 | MIT |
| `library/system-prompt-design` | 参考 cangjie-skill 的 system-prompt-skills 蒸馏成果 | MIT |
| 其余 `library/*` | 依据公开的方法论框架重写为可执行步骤，不复制原文 | MIT |

## 写作约定

- 一份 Skill 只解决一类问题；结构固定为：何时使用 / 输入 / 步骤 / 输出格式 / 检查清单 / 反例与边界。
- 步骤必须能直接执行，带条件、阈值或判断信号。
- 不写书摘、读后感或作者角色扮演。
- 新增内置 Skill 后，在 `src/features/skill/library/builtin.ts` 的 `BUILTIN_META` 里补一条元数据（来源、类型、适用场景、领域）。
