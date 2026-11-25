风格：电影片头字设计（G14 · 电影片头）

来源：GIF 工厂（https://github.com/WoYun520/gif-factory），原创制作脚本与 Skill 说明采用 MIT；素材及第三方组件按各自许可。

## 素材输入
片名原文；可附 F/EN 编号、定稿字稿、字体参考与必须沿用的场景图。

## Stepframe 使用约束
- 先分清用户要求直接使用的原图、视频、字稿和仅作风格参考的模板图。用户附件始终是内容主体，本模板不得替换、覆盖或忽略原素材。
- 已选中时间轴片段时只修改选中的内容；附件直改仍沿用现有原素材路由。本模板只补充风格与制作约束，不改变任务目标。
- 本地预览来自上述来源的项目案例，只用于选择效果；其中的角色、字体、音乐与品牌权利不因代码 MIT 许可而转授。
- 应用模板时发送的是本地 JPG 静帧；GIF 仅用于模板库动态预览，不作为模型参考图。
- 把整组字、排法与场景一起设计；用户提供的内容优先，不能只用系统字体拉伸代替原创字稿。
- 不声称已运行原仓库脚本或已调用未安装的外部 Skill / 服务。需要外部 Lemo-Opuscar、Punk、字体或音乐时，明确说明依赖和授权边界。

## 原制作说明（已解析为原仓库链接）
---
name: cinematic-title-lettering
description: 设计电影片名和横向片头图，有中文 50 种字形和英文 50 款基础字体及装饰封面可选，支持自定义字体与字稿。适合手写片名、换片名、字与场景一起设计、成组片头，以及三幅竖列宣传图。
---

# 电影片头字设计

根据片名和故事的感觉设计字。用户已经定下的文案、图片和字稿要保留；允许改的部分再重新搭配。

场景图、片名文案和现成字稿都可以由用户提供，也可以只提供其中一部分。先分清哪些是要直接使用的素材、哪些只是风格参考：提供文案就按原文设计字；提供定稿字稿就直接做排版和融合；提供成品要用的场景图就沿用原图。只补缺少的部分，用户要求改写、重画或换景时再改。

## 按任务看说明

- 英文片名、英文装饰字或 EN 编号：看[50款英文片头](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/english-titles.md)，打开对应字体样张和封面。附带真实字体文件；可直接排字，也可按新片名设计长笔锋和装饰。用 `scripts/prepare_english_title.py` 整理输入。

- 选风格、指定 F 编号、做多款不同的字：看[50 种中文字形](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/style-catalog.md)，实际打开对应原图，不能只读分类名字。延续某款时，生图要附上这张原图，并说明参考的是字的写法还是排法；用户明确要求只用文字时按要求做。
- 用 F41–F50 手写字换片名：看[十款手写字的做法](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/handwriting-stability.md)，附对应原稿与校准字稿，按这款的笔势续写。可用 `scripts/prepare_lettering.py` 整理输入；加 `--scene` 准备完整场景，不加则准备白底字稿。
- 要带场景的完整片头：看[片头怎么做](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/film-title-frames.md)。默认横向宽画面，用户有尺寸要求就按要求。
- 要按参考图换字或试排版：看[五种排法](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/layout-recipes.md)。
- 要三幅竖着排的宣传图：看[三联图做法](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/references/promo-triptychs.md)。
- 要动态片头：先定画面，再完成要求的动画和视频。

## 做图时记住

需要新设计字稿时，先写清楚：哪个字最大、怎么断行、哪一笔有特点、整组字放在场景哪里。已有定稿字稿则围绕它安排场景和位置，按用户要求调整。

1. 把片名当一整组字设计，再写每个字。字可以歪、挤、断开或拖长，保留手写时的停顿，同时让每个字认得出来。用户要原创字形时，系统字体加拉伸和做旧不能代替字稿设计。
2. 多款之间要有写法上的区别。改笔画、粗细、转角和字里的空隙，不能只换颜色和断行。
3. 字和场景一起设计。先看画面哪里能放字，保住人物、道路、光线等重要位置。
4. 元素从字里长出来。比如把收笔接成水线、让竖笔带出枝节，少用旁边独立的小图标。
5. 中文片名的英文副题放进字间合适的空位，大小和颜色跟着主片名走；没有要求可以不加。英文主片名按用户原文完整设计。
6. 把新图和选中的案例并排看：笔画的粗细、转折和整组字的样子有没有延续，字与场景是否一起设计。再逐字检查，缩小看整体。做一组时先检查两款差别明显的，再继续其余款；这是制作中的自查，不额外要求用户逐张确认。交付独立原图，成组时加总览和压缩包，并保存提示词。

延续旧稿时先核对编号和原图。F11–F20 是已选的十款原版，继续使用原稿；其他案例的状态见[分类记录](https://github.com/WoYun520/gif-factory/blob/main/skills/cinematic-title-lettering/assets/style-catalog/catalog.json)。记录里也保留了相近写法的区别，按需要查看。
