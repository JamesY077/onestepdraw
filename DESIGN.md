# Stepframe 设计系统

> 暖纸工作台：暖纸底、奶油卡片、墨色文字、赤陶强调。一处定义，所有页面取用。

## 1. 视觉基调

| 角色 | 取值 |
| --- | --- |
| 页面底色 | `--sf-paper` `#f5f0e7` |
| 卡片/面板 | `--sf-surface` `#fffdf8` |
| 正文 | `--sf-ink` `#241f19` |
| 次级文字 | `--sf-ink-2` `#655b4e`（≥4.5:1） |
| 辅助文字 | `--sf-ink-3` `#817565` |
| 强调 | `--sf-terra` `#b4553a` |
| 分隔线 | `--sf-line` `#e2d9cb` |

颜色只写 token，不写裸十六进制；页面里的 `var(--sf-*)` 是唯一来源。

## 2. 字体分工

| 用途 | 字体 | 说明 |
| --- | --- | --- |
| 界面/正文 | Inter Variable | 中文回退 PingFang SC |
| 品牌名/大标题 | Instrument Serif | 仅英文品牌与书法感标题 |
| 模型名/数据 | JetBrains Mono | 版本号、耗时、分辨率 |

字号用 token（`--sf-text-xs` 起），避免新的 10/11px 碎值；触控目标不小于 44px。

## 3. 间距与控件

- 间距阶梯：4 / 8 / 12 / 16 / 20 / 24 / 32。
- 控件高度：`--sf-control-sm` 32、`--sf-control-md` 38、`--sf-control-touch` 44。
- 圆角统一用 `--sf-r-*`，同一个组件只用一个半径层级。
- 焦点样式统一用赤陶色 2px 外描边（`:focus-visible`）。

## 4. 动效规则

- 时长：140 / 220 / 380 / 560ms，缓动 `--sf-ease-out`。
- 只在三处使用：页面进入一次、消息出现、交互反馈（悬停/展开/弹层）。
- 循环动画（DotGrid、RotatingText）在页面隐藏或系统开启"减少动态"时停止。
- 所有动效必须有 `prefers-reduced-motion` 静态降级；装饰不能影响内容可见性。

## 5. vue-bits 组件来源

组件以源码方式安装进 `src/components/bits/`（MIT + Commons Clause，保留 LICENSE.md），
通过 **jsrepo** 从官方注册表分发：

```bash
npx jsrepo init https://raw.githubusercontent.com/DavidHDev/vue-bits/main/public/r --yes
npx jsrepo add FadeContent --registry https://raw.githubusercontent.com/DavidHDev/vue-bits/main/public/r --yes
```

当前使用：SplitText、BlurText、RotatingText、ShinyText、CountUp、Magnet、FadeContent、
ClickSpark、Aurora、StarBorder、GlareHover、DotGrid、SpotlightCard。
重型背景类组件默认不引入，避免拖慢首屏。

> **许可注意（Commons Clause）**：这些组件可以随应用一起商用，但**不能**把组件本身
> 单独或打包成模板、组件库再次分发或转售。不要把本仓库改造成面向外部售卖
> "Vue 动效组件库 / 模板包"。详细条款见 `src/components/bits/LICENSE.md`。

## 6. 验收清单

- [x] `npm run build` 通过（vue-tsc + vite）。
- [x] 桌面 1440×900 与手机 390×844 无横向溢出。
- [x] 登录页、对话页、设置、图片、视频工作台均可正常渲染。
- [x] 减少动态语境下循环动画停止。
- [x] 弹窗 Tab 焦点在弹窗内循环，Esc 取消。
