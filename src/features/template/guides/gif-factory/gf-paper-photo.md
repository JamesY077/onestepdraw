风格：摄影纸艺知识图解（G18 · 知识图解）

来源：GIF 工厂（https://github.com/WoYun520/gif-factory），原创制作脚本与 Skill 说明采用 MIT；素材及第三方组件按各自许可。

## 素材输入
一个已核实的机关或金融问题；可附实物图、数据、参与方和旁白。

## Stepframe 使用约束
- 先分清用户要求直接使用的原图、视频、字稿和仅作风格参考的模板图。用户附件始终是内容主体，本模板不得替换、覆盖或忽略原素材。
- 已选中时间轴片段时只修改选中的内容；附件直改仍沿用现有原素材路由。本模板只补充风格与制作约束，不改变任务目标。
- 本地动态预览为 Stepframe 绘制的中性方法示意，不包含原仓库的第三方角色、插画或品牌素材。
- 应用模板时发送的是本地 JPG 静帧；GIF 仅用于模板库动态预览，不作为模型参考图。
- 黑纸、灰度摄影剪贴、暖白撕边与少量黄色强调；用接触、操作和账目变化解释，不用术语堆叠。
- 不声称已运行原仓库脚本或已调用未安装的外部 Skill / 服务。需要外部 Lemo-Opuscar、Punk、字体或音乐时，明确说明依赖和授权边界。

## 原制作说明（已解析为原仓库链接）
# vibe 知识大赏

把一个原理变成观众能跟上的操作：零件怎样接触、怎样复位，一笔钱从哪里来、记到哪里、最后还剩多少。适合生活机关、机械结构、物理现象和金融机制的解释。

[返回分类](https://github.com/WoYun520/gif-factory/blob/main/styles/README.md) · [完整案例与来源](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/README.md) · [独立 Skill v0.6.0](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/SKILL.md)

[先看两分钟无水印合集](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/highlights/README.md)，观察三种风格和不同题目的动作、旁白与切换节奏。

## 先选内容，再选画面

| 内容 | 题材示例 | 制作时先确认 |
| --- | --- | --- |
| 生活机关 | 拉链、按动笔、弹子锁 | 具体结构类型，接触、锁止与复位 |
| 机械结构 | 机械表、开放式差速器 | 观察坐标、齿轮与接触关系、连续状态 |
| 物理现象 | 吸管留水、铜管与磁铁、结构承重 | 比较条件、变化的变量、守恒与示意范围 |
| 金融机制 | 分期费用、贷款创造存款、优惠券分摊 | 参与方、现金与账目、示例条件和省略项 |

| 风格 | 画面与动作 | 已有方法示例 |
| --- | --- | --- |
| 摄影纸艺 | 黑纸、灰度摄影剪贴、暖白撕边；签约、递凭证、盖章或剖面联动 | [贷款创造存款](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/loan-creation/README.md) |
| 彩色贴纸风 | 奶油纸底、彩色二维白边贴纸；同一组物件持续操作、路径到达再记账 | [优惠券到底谁买单](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/coupon-funding/README.md) |
| 复古档案记录 | 档案夹、账纸、暖色照片；有限打字、红笔核对与盖章 | [大包装一定更划算吗](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/unit-price-archive/README.md) |
| 同屏实验 · 内置 | 相同条件与同步操作，先看差异，再通过局部透视、回路、受力或能量解释 | [铜管与磁铁](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/copper-magnet-same-screen/README.md) |
| 立体剖面联动 · 外部 Skill | 使用 lemo-opuscar 的分色机械图解，外壳剖开后观察真实零件联动 | [齿轮减速原理](https://github.com/WoYun520/gif-factory/blob/main/examples/mechanism-explainers/gear-reduction-cutaway/README.md) |

前四种为内置制作说明；同屏实验使用独立流程，无需外部 Lemo Skill，详见[制作说明](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/references/same-screen-experiments.md)。**立体剖面联动实际调用 [Lemo-Opuscar by Lemomo（LemoLab）](https://github.com/lemomo-ai/lemo-opuscar) 的 `lemo-opuscar` Skill**，复用其齿形、描边代码及材质、剖面渲染方法。齿轮片的布局、稿件、镜头、时序和声音为本期定制。上游依赖另行安装，见[调用与署名说明](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/references/lemo-cutaway.md)。

明确指定的风格优先，续作沿用当前选择；没有指定、也没有接续工程时，从摄影纸艺起步。已有三种金融/消费方法示例、同屏实验的铜管完整片和两支五秒小样，以及一支外部 Skill 齿轮案例，不代表每种题材和风格的组合都有现成工程。

## 可以直接这样说

> 用摄影纸艺讲拉链怎么扣上，先让观众看完整实物，再看拉头里面的合拢过程。交付无水印竖屏成片、封面和可编辑工程。

> 用彩色贴纸风讲优惠券谁承担，让同一组顾客、商店和平台道具完成付款与结算，金额用一份模型驱动。

> 用复古档案记录讲大包装如何比单价，把两张价签记到账纸上，再统一到每100毫升比较。

> 用同屏实验讲铜管与磁铁，在同一时刻释放两枚相同磁铁，只改变铜管是否有贯通纵缝，再用透视与电流回路解释。

> 调用 lemo-opuscar Skill，用立体剖面和真实零件联动讲齿轮减速，沿用当前声线，交付完整视频与工程，来源写清 Lemo-Opuscar。

具体配色、素材、动作与检查点由[独立 Skill](https://github.com/WoYun520/gif-factory/blob/main/skills/paper-mechanism-explainer/SKILL.md)按所选分支引导，立体剖面读取外部 Skill 的当前规范。制作时核实新题目的原理，按真实旁白安排动作，并检查实际导出画面。准确的机构几何可按机械分支制作，微缩场景和三维人物不在此分支中。

## 工具和交付

这是制作方法与文件检查工具，需要可用的视频渲染环境、本地素材或相应生成工具；不附模型、服务额度或渲染器。已有旁白可以复用，新配音跟随当前用户选择和授权。工具详情见[使用指南](https://github.com/WoYun520/gif-factory/blob/main/GUIDE.md#需要装什么)。

摄影纸艺、贴纸与档案新片通常为1080×1920、30fps；同屏实验与本期外部 Skill 齿轮片为1920×1080、24fps。时长随讲解与阅读需要安排，接续作品沿用已定画幅。交付成片、同风格封面、可编辑工程及来源说明，默认无个人水印和固定作者名。配乐署名放在来源及发布文案中。

仓库案例提供影片、封面、静音预览、字幕、数据模型与署名，供观察与复作参考；铜管案例另外附自有三维画面源码，通用渲染依赖需安装；不分发本机字体、配音模型、私有音轨缓存或完整制作环境。
