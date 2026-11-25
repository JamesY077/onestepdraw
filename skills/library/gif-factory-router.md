# Stepframe 接入说明

来源：[GIF 工厂](https://github.com/WoYun520/gif-factory) · `SKILL.md`。原创脚本与 Skill 说明采用 MIT；第三方角色、字体、音乐、品牌及外部 Skill 不随 MIT 转授权。

- 本文用于按用途选择表情包、卡片、海报、签名、片头、配色、绘本、品牌短片或知识图解流程。
- 用户提供的原图、视频、字稿与文案优先，模板预览只作风格参考。选中片段与附件直改继续使用 Stepframe 原素材路由，不因为本 Skill 重做或覆盖未选内容。
- 原仓库的相对链接已改写为来源链接。链接中的脚本、字体、案例与外部服务不表示已经安装或执行；不要编造运行结果、导出文件、授权或服务额度。
- 当前创作只调用 Stepframe 已提供的图片/视频生成与本机能力。Punk-Posters、Lemo-Opuscar 等外部能力不得声称自动调用；需要时说明依赖，由用户另行提供。
- 动态预览不等于最终成片。只完成提示词、脚本或分镜时如实说明，实际导出后再核对首尾帧、动作过程、文字、声音与连续性。

---

---
name: pixel-gif-sticker-pack
description: 根据图片或文字制作角色表情包、光栅变画卡、动态海报、动态签名、电影片头、文章封面配色、动态绘本、品牌短片及「vibe 知识大赏」系列知识短视频。按用途选择做法，保留用户已定的画风、素材和要求，导出并检查实际作品。
---

# GIF 工厂

接续用户最新的素材、数量、文字、尺寸和已选方案。角色图、场景图、片名、定稿字稿和配乐都可以由用户提供；先分清直接使用的素材与风格参考，只补缺少的部分。沿用已认可的选择，不因换用途重做整个项目。对外叫 GIF 工厂，调用名保留 `$pixel-gif-sticker-pack`。

## 先按用途找做法

在[分类说明](https://github.com/WoYun520/gif-factory/blob/main/styles/README.md)看效果，按需阅读对应说明。各类用途平等，不把画风当成用途；[作品库](https://github.com/WoYun520/gif-factory/blob/main/GALLERY.md)保留案例状态，待确认的版本不能当成已认可模板。

| 要做什么 | 看哪里 |
| --- | --- |
| 表情包 | 下文，以及[外观](https://github.com/WoYun520/gif-factory/blob/main/references/appearance.md)、[轻动效](https://github.com/WoYun520/gif-factory/blob/main/references/light-motion.md) |
| 光栅变画卡 | [双状态变画](https://github.com/WoYun520/gif-factory/blob/main/references/lenticular.md) |
| 动态海报 | [海报制作](https://github.com/WoYun520/gif-factory/blob/main/references/dynamic-posters.md) |
| 动态签名 | [签名入口](https://github.com/WoYun520/gif-factory/blob/main/references/dynamic-signatures.md)、[独立 Skill](https://github.com/WoYun520/gif-factory/blob/main/skills/dynamic-art-signature/SKILL.md) |
| 电影片头 | [独立 Skill](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/SKILL.md)、[中文50种字形](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/style-catalog.md)、[英文50款](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/english-titles.md) |
| 文章封面配色 | [独立 Skill](https://github.com/WoYun520/gif-factory/blob/main/skills/article-cover-palette/SKILL.md)、[说明与安装](https://github.com/WoYun520/gif-factory/blob/main/skills/article-cover-palette/README.md)、[100套色卡](https://github.com/WoYun520/gif-factory/blob/main/skills/article-cover-palette/references/color-cards.md) |
| 动态绘本 | [绘本入口](https://github.com/WoYun520/gif-factory/blob/main/references/storybook.md)、[独立 Skill](https://github.com/WoYun520/gif-factory/blob/main/skills/compact-storybook/SKILL.md) |
| 品牌短片 | [短片制作](https://github.com/WoYun520/gif-factory/blob/main/references/brand-film.md) |
| vibe 知识大赏 | [独立 Skill](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/SKILL.md)、[内置风格与外部立体剖面](https://github.com/WoYun520/gif-factory/blob/main/styles/paper-mechanism-explainer/STYLE.md) |

卡片先检查两图的角度、眼线、下巴和肩线，默认 480×720、6 秒、标题固定。海报先区分保留原画加动态字，还是连人物、背景和字一起重新设计；现有漫画海报是两幅完整状态切换，不能说成逐字独立动画。游戏界面的 GIF 演示也不等于可玩的游戏。

文章选色、指定色号或评估现有配色走文章封面配色分支，只交付用色建议、现成色卡或配色交接单，不负责封面设计和生成。推荐搭配外部Punk-Posters制作封面，分别安装并按各自许可使用。100套是颜色库，不是100种文章或版式；保留用户已选构图、素材和合适的原配色，不套用表情包依赖。

签名先看[四种风格的动图和做法](https://github.com/WoYun520/gif-factory/blob/main/skills/dynamic-art-signature/references/styles.md)：纯文字连笔、意象融字、乐器融字、墨迹聚合。字体、颜色和动效可以搭配。支持多种字体和自定义字稿，纯文字直接沿字迹写出；带独立上方意象时，安排快写、约一秒停顿和慢收锋，普通款用平面墨迹。电影片头把字形、排法、场景一起设计，默认横向；提供的原图和定稿字稿按要求沿用。绘本默认固定画面、实际 6fps、每页约三秒、一个动作加结果停留，前后页道具要接得上。品牌短片交付视频和所需工程，不套表情包的方形循环规格。具体参数以各自说明和用户要求为准。

生活机关、机械结构、物理现象或金融机制的讲解视频走「vibe 知识大赏」分支，先选内容，再选摄影纸艺、彩色贴纸、复古档案或同屏实验；续作沿用已选风格和声线。用统一状态模型驱动接触、转动、物理变化或金额变化，默认无个人水印。摄影纸艺、贴纸与档案新片起步1080×1920、30fps，同屏实验起步1920×1080、24fps，已选格式优先。微缩场景与三维人物不在该分支中。只要选题时先给方案，批准制作后再完成成片、封面和可编辑工程。已有案例不代表所有题材与风格组合都已经验证。

用户选择同屏实验、相同条件对照或延续吸管/铜管实验时，读取[同屏实验流程](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/references/same-screen-experiments.md)，用独立场景、统一时钟和控制条件制作。该内置分支也可使用三维局部透视，不因出现透视或三维几何而自动转入外部 lemo-opuscar。铜管完整片附自有三维画面源码；原理与模型范围需随新题目重建。

用户选择既有齿轮案例的外部立体剖面联动、Lemo 分色机械图解或 lemo-opuscar Skill 时，读取[外部 Skill 工作流](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/references/lemo-cutaway.md)，实际调用另行安装的 `lemo-opuscar` Skill，并在来源说明中标明 Lemo-Opuscar by Lemomo（LemoLab）。GIF 工厂只提供调用入口与案例，上游 Skill 和运行时需另行准备；画幅与帧率按该分支或用户已选工程，已验收的齿轮片为1920×1080、24fps。

## 表情包先分清画风和动作

像素画用清楚的像素块和阶梯边缘，默认 320×320，缩放保持像素边缘。插画、真人和宠物默认高清 512×512；照片保留本人或宠物的特征、光线和衣着，不自行美颜或改成二次元。GLB 模型先渲染能看清脸和特征的正面或四分之三侧面。高清尺寸不保证动作和五官一致。

- **轻动效**：每张有不同的表情或姿势，再加小幅点头、弹跳、摇摆，字幕固定。用 `scripts/export_pack.py`，读[轻动效](https://github.com/WoYun520/gif-factory/blob/main/references/light-motion.md)。不能只给同一张脸换很多句字幕。
- **完整动作**：用连续姿态让脸、头、肩、躯干、相关手脚和衣发一起配合。像素用 `scripts/export_pixel_actions.py` 和[像素动作](https://github.com/WoYun520/gif-factory/blob/main/references/pixel-actions.md)；插画或照片用 `scripts/export_keyframes.py` 和[高清动作](https://github.com/WoYun520/gif-factory/blob/main/references/keyframes.md)。不能用整张图变形或只转手臂代替完整动作。

新角色或动作先内部做一个代表样片检查；用户已授权整套就继续，不额外设置逐张确认。延续案例时实际查看对应版本和[样片状态](https://github.com/WoYun520/gif-factory/blob/main/references/appearance.md#sample-status)，不把废弃实验当模板，也不默认各种组合都有同样可靠的现成导出方法。

## 做素材和组合

每张先有一句聊天用语、一个看得见的姿态或道具、一个动作重点。用可用的图像生成工具做新素材；常用 4×4 透明角色图集，格间留足空白，指定顺序、身份特征和一致取景，文字在组合时另加。

打开实际图集逐格核对，按可见姿态配字幕，修正错格、缺格、穿帮和裁断的手发。数量按有效作品计算，不按生成次数计算。默认不把私人参考截图和原图放进分享压缩包。

看[清晰度说明](https://github.com/WoYun520/gif-factory/blob/main/references/clarity.md)判断源图细节，放大旧像素图不能补回细节。连续动作和返修按[画面稳定检查](https://github.com/WoYun520/gif-factory/blob/main/references/stability.md)看实际解码帧、原尺寸脸部、正常播放及首尾接缝；有问题修该帧和邻帧，不能靠模糊、降帧或偷换成轻动效遮掩。

## 导出和交付

普通表情包用 Python 3、Pillow；运行脚本 `--help`，按[素材清单格式](https://github.com/WoYun520/gif-factory/blob/main/references/manifest.md)准备图集、格位、动作和本地可用字体。`export_pack.py` 默认高清；明确像素画时用 `--render-style pixel`，命令行优先于素材清单。

`export_pack.py` 和 `export_keyframes.py` 写 GIF、ZIP 时不需要 FFmpeg；加 `--preview` 制作 MP4 预览时才需要。其他用途的依赖见各自说明和[使用指南](https://github.com/WoYun520/gif-factory/blob/main/GUIDE.md#需要装什么)。先检查当前环境，只补所选功能需要的工具；本仓库不自带生图模型或付费服务。

每张交付独立循环 GIF，成组加 ZIP。默认约两秒；完整动作按实际动作安排，明确的平台限制优先。需要视频预览时，从最终 GIF 的实际帧合成；高清默认无标题网格，`--preview-layout chapters` 可加分类标题。静态拼图须标为静态预览。

核对实际数量、字幕不重复、可见动作、帧延时、循环、透明度、安全边距、ZIP 内容和视频解码，再看各类正常播放。技术通过、视觉自查和用户认可分开记录，不宣称所有平台兼容或所有案例稳定。
