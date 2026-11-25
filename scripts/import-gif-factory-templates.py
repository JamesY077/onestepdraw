#!/usr/bin/env python3
"""把 GIF 工厂的 MIT 制作说明接入 Stepframe 模板与 Skill 库。

来源：https://github.com/WoYun520/gif-factory

用法：
  python3 scripts/import-gif-factory-templates.py
  python3 scripts/import-gif-factory-templates.py --source /path/to/gif-factory

--source 可以是完整仓库，也可以是只缓存了部分文档的目录；缺失文件会从 GitHub
API 下载并写回该缓存。需要 Python 3 与 Pillow，不安装任何项目外依赖。

只收录制作方法、说明和本地预览。第三方角色 IP 明确排除：光栅卡与两款动态
海报使用本脚本绘制的中性方法示意。动态 GIF 只用于卡片预览，应用模板时始终
使用同步导出的 JPG 静帧，避免把动画文件误当作视觉模型参考图。
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import http.client
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REPO = "WoYun520/gif-factory"
REF = "main"
REPO_URL = f"https://github.com/{REPO}"
API = f"https://api.github.com/repos/{REPO}"
GUIDE_DIR = ROOT / "src/features/template/guides/gif-factory"
SKILL_DIR = ROOT / "skills/library"
MEDIA_DIR = ROOT / "public/templates/gif-factory"
OUTPUT_TS = ROOT / "src/features/template/gifFactory.ts"

CATEGORIES = [
    ("stickers", "GIF 表情包", "GIF Stickers"),
    ("lenticular", "光栅变画卡", "Lenticular Cards"),
    ("posters", "动态海报", "Motion Posters"),
    ("signatures", "动态签名", "Art Signatures"),
    ("titles", "电影片头", "Cinematic Titles"),
    ("palettes", "封面配色", "Cover Palettes"),
    ("storybooks", "动态绘本", "Motion Storybooks"),
    ("brand-films", "品牌短片", "Brand Films"),
    ("explainers", "知识图解", "Visual Explainers"),
]

# doc 是原仓库说明；section 可只取一个二级标题。input 描述直接进入现有创作
# 流程的素材要求；delivery 是当前模板最具体的输出约束。
TEMPLATES: list[dict[str, Any]] = [
    dict(id="gf-pixel-light", code="G01", name="像素轻动效", nameEn="Pixel Light Motion", category="stickers", doc="styles/pixel-light/STYLE.md", media="docs/previews/pixel-light.gif", input="1 张像素角色图或角色描述；批量时可附台词清单。", delivery="默认 1:1、约 2 秒；每张姿态和表情不同，字幕固定，保留像素阶梯边缘。"),
    dict(id="gf-pixel-actions", code="G02", name="像素完整动作", nameEn="Pixel Full Actions", category="stickers", doc="styles/pixel-actions/STYLE.md", media="docs/previews/pixel-actions.gif", input="1 张像素角色图，以及挥手、比心或行礼等一个完整动作。", delivery="头、躯干、手脚与衣发共同完成动作；不能只旋转手臂或整图缩放。"),
    dict(id="gf-illustrated-actions", code="G03", name="插画角色动作", nameEn="Illustrated Character Actions", category="stickers", doc="styles/illustrated-actions/STYLE.md", media="docs/previews/illustrated-actions.gif", input="1 张有清晰五官和服装的插画角色图；可附动作与台词。", delivery="保留插画画风、角色身份和服装；默认 1:1，先检查首尾姿态与接触位置。"),
    dict(id="gf-photo-people", code="G04", name="真人轻动效", nameEn="Photo Light Motion", category="stickers", doc="styles/photo-people/STYLE.md", media="docs/previews/photo-people.gif", input="用户有权使用的本人或授权人物照片，以及点头、眨眼等轻动作。", delivery="保留本人五官、衣着与光线，不自行美颜、换脸或改成二次元。"),
    dict(id="gf-photo-pets", code="G05", name="宠物拟人表情", nameEn="Pet Stickers", category="stickers", doc="styles/photo-pets/STYLE.md", media="docs/previews/photo-pets.gif", input="1 张清晰宠物照片，以及表情、道具或聊天台词。", delivery="保留毛色、花纹和脸部特征；动作服务表情，不擅自更换宠物身份。"),
    dict(id="gf-clay-mascot", code="G06", name="粘土吉祥物", nameEn="Clay Mascot", category="stickers", doc="styles/clay-mascot/STYLE.md", media="docs/previews/clay-mascot.gif", input="角色设定或吉祥物参考图；可附品牌色、动作和台词。", delivery="圆润、哑光、有体积感；保持眼睛、轮廓和光线一致，不宣称交付真实三维模型。"),
    dict(id="gf-lenticular", code="G07", name="双状态光栅卡", nameEn="Dual-state Lenticular Card", category="lenticular", doc="styles/lenticular/STYLE.md", schematic="lenticular", input="同一主体的 2 张状态图；先检查角度、眼线、下巴、肩线和构图能否对齐。", delivery="默认竖版、约 6 秒循环；纵向细条来回变画，标题固定，不用拉伸或黑边掩盖错配。"),
    dict(id="gf-type-linked", code="G08", name="人物字体联动", nameEn="Character & Type Motion", category="posters", doc="styles/type-linked/STYLE.md", schematic="type", input="用户有权使用的角色原画，以及片名、日期、地点等必须保留的文字。", delivery="保留原画，让人物动作与文字呼应；文字避开脸和关键道具，重要信息始终可读。"),
    dict(id="gf-comic-fusion", code="G09", name="漫画印刷融合海报", nameEn="Comic Print Fusion", category="posters", doc="styles/comic-fusion/STYLE.md", schematic="comic", input="用户有权使用的人物素材与海报文案；可附 2–4 色印刷配色参考。", delivery="人物、背景和字作为整体重新设计，用少量颜色、墨线与网点；明确这是两种完整状态切换。"),
    dict(id="gf-signature-word", code="G10", name="纯文字连笔签名", nameEn="Word-only Signature", category="signatures", doc="skills/dynamic-art-signature/references/styles.md", section="纯文字连笔", media="docs/previews/signature-word-only.gif", posterPosition=0.78, input="准确姓名；可附定稿字稿、字体参考、单色或渐变配色。", delivery="沿真实笔迹快写并慢收末锋；保留细线、小点和回钩，不用横向擦除冒充书写。"),
    dict(id="gf-signature-motif", code="G11", name="意象融字签名", nameEn="Motif-fused Signature", category="signatures", doc="skills/dynamic-art-signature/references/styles.md", section="意象融字", media="skills/dynamic-art-signature/assets/media/Levi.gif", posterPosition=0.78, input="准确姓名与鸟、月亮、植物等一个意象；可附字稿和配色。", delivery="意象进入笔画、轮廓或字内留白，而不是旁边摆图标；名字始终完整可认。"),
    dict(id="gf-signature-instrument", code="G12", name="乐器融字签名", nameEn="Instrument-fused Signature", category="signatures", doc="skills/dynamic-art-signature/references/styles.md", section="乐器融字", media="docs/previews/dynamic-signatures-instruments.gif", posterPosition=0.78, input="准确姓名、乐器与书体方向；可附用户自有字稿。", delivery="琴弦、笛身、音孔或琴框与目标字共享笔画；换字体后重新规划路径，不套固定坐标。"),
    dict(id="gf-signature-ink", code="G13", name="墨迹聚合签名", nameEn="Ink Assembly Signature", category="signatures", doc="skills/dynamic-art-signature/references/styles.md", section="墨迹聚合", schematic="ink", input="清晰定稿字稿或姓名与书体；可附墨色、底色和聚合节奏。", delivery="墨迹碎片从原字稿切出并回到原笔画；可搭配书写，最终名字、颜色和慢收锋完整。"),
    dict(id="gf-cinematic-title", code="G14", name="电影片头字设计", nameEn="Cinematic Title Lettering", category="titles", doc="skills/cinematic-title-lettering/SKILL.md", media="skills/cinematic-title-lettering/assets/style-catalog/previews/handwriting-scenes-01.jpg", input="片名原文；可附 F/EN 编号、定稿字稿、字体参考与必须沿用的场景图。", delivery="把整组字、排法与场景一起设计；用户提供的内容优先，不能只用系统字体拉伸代替原创字稿。"),
    dict(id="gf-article-palette", code="G15", name="文章封面配色", nameEn="Article Cover Palette", category="palettes", doc="skills/article-cover-palette/SKILL.md", media="skills/article-cover-palette/assets/cards/030-落日与海.jpg", input="文章、标题或内容摘要；可附现有封面、品牌色、指定编号或 HEX。", delivery="只交付主推配色、必要的备选及底色/标题/小字/点缀分工；不自动设计封面，不假装调用外部 Punk。"),
    dict(id="gf-storybook", code="G16", name="低帧动态绘本", nameEn="Compact Motion Storybook", category="storybooks", doc="skills/compact-storybook/SKILL.md", media="examples/storybooks/tea-party/realbook-writing-preview.gif", input="故事文本或插画；可附角色设定、正文、横屏/竖屏选择与已授权音乐。", delivery="每页一个完整动作和结果停留，再做翻页；保持角色、道具与前后页状态连续，不用镜头晃动代替剧情。"),
    dict(id="gf-brand-film", code="G17", name="吉祥物品牌短片", nameEn="Mascot Brand Film", category="brand-films", doc="references/brand-film.md", schematic="brand", input="用户自有或获授权的吉祥物、产品、包装与品牌文案；可附 Logo、音乐和画幅。", delivery="谁动手、碰到什么、发生什么变化、品牌在哪里出现必须清楚；保留分层可修改性，不套表情包规格。"),
    dict(id="gf-paper-photo", code="G18", name="摄影纸艺知识图解", nameEn="Photographic Paper Explainer", category="explainers", doc="styles/paper-mechanism-explainer/STYLE.md", schematic="paper", input="一个已核实的机关或金融问题；可附实物图、数据、参与方和旁白。", delivery="黑纸、灰度摄影剪贴、暖白撕边与少量黄色强调；用接触、操作和账目变化解释，不用术语堆叠。"),
    dict(id="gf-paper-stickers", code="G19", name="彩色贴纸知识图解", nameEn="Color Sticker Explainer", category="explainers", doc="styles/paper-mechanism-explainer/STYLE.md", schematic="stickers", input="一个已核实的机制问题；金融题材需给参与方、示例条件与金额关系。", delivery="奶油纸底、彩色二维白边贴纸；同一组物件持续操作，路径到达再记账，以统一状态模型驱动。"),
    dict(id="gf-paper-archive", code="G20", name="复古档案知识图解", nameEn="Retro Archive Explainer", category="explainers", doc="styles/paper-mechanism-explainer/STYLE.md", schematic="archive", input="一个可核查的问题与原始资料；可附账纸、价签、照片、数据和旁白。", delivery="档案夹、账纸、暖色摄影、有限打字、红笔与核对章；示例数据不冒充真实报价。"),
    dict(id="gf-same-screen", code="G21", name="同屏对照实验", nameEn="Same-screen Controlled Experiment", category="explainers", doc="styles/paper-mechanism-explainer/STYLE.md", schematic="experiment", input="一个可通过对照解释的问题；明确相同起始条件、同步操作和唯一关键变量。", delivery="先直接观察结果差异，再用局部透视、回路、受力或能量解释；这是内置流程，不自动调用 Lemo-Opuscar。"),
]

SKILLS = [
    ("gif-factory-router", "GIF 工厂创作路由", "按用途选择表情包、卡片、海报、签名、片头、配色、绘本、品牌短片或知识图解流程。", "SKILL.md", ["chat", "image", "video", "copy"], ["GIF 工厂", "创作路由", "多模态"]),
    ("gif-signature", "动态艺术签名", "按真实字形设计中英文连笔、意象融字、乐器融字与墨迹聚合动画。", "skills/dynamic-art-signature/SKILL.md", ["chat", "image", "video"], ["动态签名", "字稿", "书写动画"]),
    ("gif-cinematic-title", "电影片头字设计", "把片名、字形与场景作为整体设计，支持自定义字稿、图片与 F/EN 风格编号。", "skills/cinematic-title-lettering/SKILL.md", ["chat", "image", "video", "copy"], ["电影片头", "字形", "排版"]),
    ("gif-article-palette", "文章封面配色", "按文章内容与情绪推荐底色、标题、小字和点缀色，只选色，不冒充封面设计。", "skills/article-cover-palette/SKILL.md", ["chat", "image", "copy"], ["封面", "配色", "文章"]),
    ("gif-storybook", "低帧动态绘本", "将故事拆成固定构图、单次动作与结果停留的连续书页。", "skills/compact-storybook/SKILL.md", ["chat", "image", "video", "copy"], ["动态绘本", "连续性", "分镜"]),
    ("gif-mechanism-explainer", "vibe 知识图解", "用摄影纸艺、贴纸、复古档案或同屏实验讲清机关、物理与金融机制。", "skills/paper-mechanism-explainer/SKILL.md", ["chat", "image", "video", "copy"], ["知识视频", "图解", "实验"]),
]


def api_json(url: str) -> Any:
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "Stepframe-gif-factory-import"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read())
        except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GitHub 下载失败：{url}") from last_error


def download(path: str, target: Path) -> None:
    data = api_json(f"{API}/contents/{urllib.parse.quote(path)}?ref={REF}")
    # contents API 对超过 1MB 的文件返回空 content，需要改读它给出的 blob。
    if not data.get("content") and data.get("git_url"):
        data = api_json(data["git_url"])
    if not data.get("content"):
        raise RuntimeError(f"GitHub 没有返回文件内容：{path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(data["content"]))


def source_file(source: Path | None, path: str) -> Path:
    if source:
        candidate = source / path
        if candidate.exists() and candidate.stat().st_size:
            return candidate
        download(path, candidate)
        return candidate
    cache = ROOT / ".cache/gif-factory" / path
    if not cache.exists() or not cache.stat().st_size:
        download(path, cache)
    return cache


def markdown_section(text: str, heading: str) -> str:
    match = re.search(rf"^## {re.escape(heading)}\s*$", text, re.MULTILINE)
    if not match:
        raise ValueError(f"找不到二级标题：{heading}")
    next_heading = re.search(r"^## ", text[match.end():], re.MULTILINE)
    end = match.end() + next_heading.start() if next_heading else len(text)
    return text[match.start():end].strip()


def clean_markdown(text: str, doc: str) -> str:
    # 作品画廊的 HTML 表格对生成模型没有价值；保留方法、参数与检查说明。
    text = re.sub(r"<table\b[\s\S]*?</table>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<img\b[^>]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<a\b[^>]*>|</a>", "", text, flags=re.IGNORECASE)

    base = f"{REPO_URL}/blob/{REF}/{doc}"

    def absolute_link(match: re.Match[str]) -> str:
        label, url = match.group(1), match.group(2)
        if url.startswith(("http://", "https://", "#")):
            return match.group(0)
        return f"[{label}]({urllib.parse.urljoin(base, url)})"

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", absolute_link, text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def guide_for(item: dict[str, Any], source: Path | None) -> str:
    original = source_file(source, item["doc"]).read_text(encoding="utf-8")
    if item.get("section"):
        original = markdown_section(original, item["section"])
    original = clean_markdown(original, item["doc"])
    category = next(label for key, label, _ in CATEGORIES if key == item["category"])
    preview_note = (
        "本地动态预览为 Stepframe 绘制的中性方法示意，不包含原仓库的第三方角色、插画或品牌素材。"
        if item.get("schematic")
        else "本地预览来自上述来源的项目案例，只用于选择效果；其中的角色、字体、音乐与品牌权利不因代码 MIT 许可而转授。"
    )
    return f"""风格：{item['name']}（{item['code']} · {category}）

来源：GIF 工厂（{REPO_URL}），原创制作脚本与 Skill 说明采用 MIT；素材及第三方组件按各自许可。

## 素材输入
{item['input']}

## Stepframe 使用约束
- 先分清用户要求直接使用的原图、视频、字稿和仅作风格参考的模板图。用户附件始终是内容主体，本模板不得替换、覆盖或忽略原素材。
- 已选中时间轴片段时只修改选中的内容；附件直改仍沿用现有原素材路由。本模板只补充风格与制作约束，不改变任务目标。
- {preview_note}
- 应用模板时发送的是本地 JPG 静帧；GIF 仅用于模板库动态预览，不作为模型参考图。
- {item['delivery']}
- 不声称已运行原仓库脚本或已调用未安装的外部 Skill / 服务。需要外部 Lemo-Opuscar、Punk、字体或音乐时，明确说明依赖和授权边界。

## 原制作说明（已解析为原仓库链接）
{original}
"""


def load_frames(path: Path, limit: int = 24) -> tuple[list[Image.Image], list[int]]:
    image = Image.open(path)
    frames: list[Image.Image] = []
    durations: list[int] = []
    count = getattr(image, "n_frames", 1)
    indexes = list(range(count)) if count <= limit else sorted(set(round(i * (count - 1) / (limit - 1)) for i in range(limit)))
    for index in indexes:
        image.seek(index)
        frames.append(image.convert("RGBA"))
        durations.append(max(70, min(180, int(image.info.get("duration", 100) or 100))))
    return frames, durations


def resize(frame: Image.Image, maximum: int) -> Image.Image:
    result = frame.copy()
    result.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    return result


def export_media(item: dict[str, Any], source: Path | None) -> None:
    target_id = item["id"]
    if item.get("schematic"):
        frames = schematic_frames(item["schematic"])
        durations = [110] * len(frames)
    else:
        frames, durations = load_frames(source_file(source, item["media"]))
    poster_index = round((len(frames) - 1) * item.get("posterPosition", 0.35))
    poster = resize(frames[poster_index], 560).convert("RGB")
    poster.save(MEDIA_DIR / f"{target_id}.jpg", quality=86, optimize=True)
    if item.get("schematic") or str(item.get("media", "")).lower().endswith(".gif"):
        rgb_frames = [resize(frame, 400).convert("RGB") for frame in frames]
        # 所有帧共用一块调色板。逐帧自适应调色板再 optimize 会让部分浏览器
        # 错用索引，出现花屏；像素画关闭抖动也能保留清楚的块面边缘。
        palette = rgb_frames[poster_index].quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        preview_frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in rgb_frames]
        preview_frames[0].save(
            MEDIA_DIR / f"{target_id}.gif",
            save_all=True,
            append_images=preview_frames[1:],
            duration=durations,
            loop=0,
            disposal=2,
            optimize=False,
        )


def font(size: int) -> ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def base_canvas(background: str = "#f4eee7") -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (480, 600), background)
    return image, ImageDraw.Draw(image)


def schematic_frames(kind: str) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for index in range(18):
        phase = index / 18
        image, draw = base_canvas("#f3ede5" if kind != "comic" else "#efe4d2")
        if kind == "lenticular":
            draw.rounded_rectangle((50, 74, 430, 546), radius=18, fill="#fffaf4", outline="#b9573f", width=3)
            draw.text((78, 98), "STATE  /  SHIFT", font=font(25), fill="#382f2a")
            toggle = (math.sin(phase * math.tau) + 1) / 2
            for x in range(78, 402, 8):
                state = ((x - 78) // 8) % 2 == 0
                color = "#b9573f" if state == (toggle > 0.5) else "#344b55"
                draw.ellipse((x, 188, x + 8, 318), fill=color)
                draw.polygon([(x, 318), (x + 8, 318), (x + 8, 450), (x, 450)], fill=color)
            draw.text((158, 492), "A  <->  B", font=font(24), fill="#382f2a")
        elif kind == "type":
            shift = round(math.sin(phase * math.tau) * 24)
            draw.rectangle((0, 0, 480, 20), fill="#b9573f")
            draw.ellipse((70, 164 + shift, 196, 290 + shift), fill="#d6a789")
            draw.rounded_rectangle((52, 282 + shift, 218, 510 + shift), radius=70, fill="#344b55")
            draw.text((238, 136 - shift), "M", font=font(108), fill="#b9573f")
            draw.text((244, 248 + shift), "OVE", font=font(62), fill="#382f2a")
            draw.line((242, 340, 414, 340 + shift), fill="#b9573f", width=8)
            draw.text((246, 386), "TYPE IN MOTION", font=font(18), fill="#382f2a")
        elif kind == "comic":
            toggle = index < 9
            ink = "#20272b"
            accent = "#c64d38" if toggle else "#346c73"
            for y in range(50, 570, 18):
                for x in range(24 + (y % 36), 470, 36):
                    draw.ellipse((x, y, x + 3, y + 3), fill="#c7b9a6")
            draw.polygon([(64, 490), (142, 152), (288, 112), (396, 486)], fill=accent)
            draw.ellipse((154, 166, 294, 306), fill="#e9bda0")
            draw.polygon([(140, 186), (220, 112), (312, 186), (268, 158), (198, 204)], fill=ink)
            draw.rectangle((178, 298, 320, 478), fill=ink)
            draw.text((46, 44), "PRINT / 02" if toggle else "PRINT / 01", font=font(38), fill=ink)
            draw.text((264, 512), "FUSION", font=font(28), fill=accent)
        elif kind == "ink":
            draw.rectangle((0, 0, 480, 600), fill="#25272a")
            mask = Image.new("1", (480, 600))
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.text((92, 236), "Ink", font=font(142), fill=1)
            targets = [(x, y) for y in range(220, 410, 9) for x in range(70, 410, 9) if mask.getpixel((x, y))]
            amount = min(1, phase * 1.35)
            for particle, (tx, ty) in enumerate(targets):
                sx = 240 + math.sin(particle * 12.73) * 270
                sy = 290 + math.cos(particle * 7.19) * 290
                x = sx + (tx - sx) * amount
                y = sy + (ty - sy) * amount
                size = 4 + particle % 5
                draw.rectangle((x, y, x + size, y + size), fill="#d7e7e2" if particle % 3 else "#c77b62")
            if phase > 0.76:
                draw.text((92, 236), "Ink", font=font(142), fill="#e7efdf")
            draw.text((126, 468), "FRAGMENTS  ->  FORM", font=font(19), fill="#a8b6b2")
        elif kind == "brand":
            draw.rectangle((0, 0, 480, 600), fill="#f4e8d8")
            amount = min(1, phase * 1.7)
            draw.rounded_rectangle((238, 164, 420, 490), radius=12, fill="#fffaf1", outline="#b9573f", width=4)
            draw.polygon([(238, 164), (420, 164), (388, 108), (270, 108)], fill="#c87353")
            draw.text((266, 202), "YOUR", font=font(26), fill="#553b30")
            draw.text((266, 238), "BRAND", font=font(26), fill="#553b30")
            mascot_y = 330 + round(math.sin(phase * math.tau) * 12)
            draw.ellipse((54, mascot_y - 130, 182, mascot_y - 2), fill="#cf8b55")
            draw.arc((68, mascot_y - 116, 168, mascot_y - 20), 195, 342, fill="#f3c68e", width=8)
            draw.ellipse((91, mascot_y - 77, 101, mascot_y - 67), fill="#332b27")
            draw.ellipse((137, mascot_y - 77, 147, mascot_y - 67), fill="#332b27")
            product_x = 104 + (308 - 104) * amount
            product_y = 386 + (356 - 386) * amount
            draw.rounded_rectangle((product_x - 38, product_y - 20, product_x + 38, product_y + 20), radius=12, fill="#e2b05f", outline="#8c563c", width=3)
            draw.line((190, 412, 238, 412), fill="#b9573f", width=5)
            draw.text((82, 522), "CHARACTER  ->  PRODUCT  ->  BRAND", font=font(16), fill="#6c5145")
        elif kind == "paper":
            draw.rectangle((0, 0, 480, 600), fill="#202322")
            draw.polygon([(48, 98), (422, 82), (434, 514), (58, 534)], fill="#eee8dc")
            draw.rectangle((82, 128, 244, 320), fill="#777873")
            draw.ellipse((114, 156, 214, 256), fill="#bfc0b9")
            draw.rectangle((108, 254, 224, 320), fill="#40423f")
            draw.text((274, 134), "HOW", font=font(38), fill="#292b29")
            draw.text((274, 184), "IT", font=font(38), fill="#292b29")
            draw.text((274, 234), "WORKS", font=font(31), fill="#292b29")
            for tooth in range(15):
                x = 92 + tooth * 20
                closed = tooth / 15 < phase * 1.45
                draw.polygon([(x, 386), (x + 13, 386), (x + 7, 410 if closed else 428)], fill="#d3a62e")
                draw.polygon([(x, 456), (x + 13, 456), (x + 7, 432 if closed else 414)], fill="#d3a62e")
            draw.rounded_rectangle((82 + phase * 210, 364, 128 + phase * 210, 472), radius=8, outline="#292b29", width=5)
            draw.text((92, 488), "CONTACT / CLOSE / HOLD", font=font(18), fill="#292b29")
        elif kind == "stickers":
            draw.rectangle((0, 0, 480, 600), fill="#f4e9cf")
            labels = [("YOU", "#d56d52"), ("SHOP", "#4d8b86"), ("APP", "#d3a62e")]
            for item, (label, color) in enumerate(labels):
                x = 54 + item * 142
                draw.rounded_rectangle((x - 6, 144, x + 114, 306), radius=24, fill="#fffdf5")
                draw.rounded_rectangle((x, 150, x + 108, 300), radius=20, fill=color)
                draw.text((x + 20, 208), label, font=font(23), fill="#fffdf5")
            coin_x = 102 + phase * 270
            coin_y = 390 + math.sin(phase * math.pi) * -80
            draw.line((102, 390, 386, 390), fill="#ad9c82", width=4)
            draw.ellipse((coin_x - 25, coin_y - 25, coin_x + 25, coin_y + 25), fill="#f3c842", outline="#fffdf5", width=6)
            draw.text((94, 486), "ONE ORDER / ONE STATE MODEL", font=font(17), fill="#594e40")
        elif kind == "archive":
            draw.rectangle((0, 0, 480, 600), fill="#c9ad82")
            draw.polygon([(48, 116), (154, 116), (174, 88), (424, 88), (424, 532), (48, 532)], fill="#dfc79e")
            draw.rectangle((72, 128, 400, 510), fill="#f4e8ca")
            draw.text((100, 152), "PRICE ARCHIVE", font=font(27), fill="#574638")
            for line in range(7):
                y = 214 + line * 34
                draw.line((102, y, 366, y), fill="#b9a98e", width=2)
                if line / 7 < phase * 1.3:
                    draw.line((102, y - 12, 224 + (line % 3) * 38, y - 12), fill="#65574b", width=5)
            stamp = min(1, phase * 1.8)
            if stamp > 0.55:
                draw.ellipse((278, 350, 382, 454), outline="#a64b3d", width=6)
                draw.text((294, 384), "CHECK", font=font(20), fill="#a64b3d")
            draw.text((100, 464), "UNIT PRICE / EVIDENCE", font=font(18), fill="#a64b3d")
        elif kind == "experiment":
            draw.rectangle((0, 0, 480, 600), fill="#182b34")
            draw.text((106, 54), "A", font=font(30), fill="#f0e9dc")
            draw.text((340, 54), "B", font=font(30), fill="#f0e9dc")
            for x, slit in [(110, False), (300, True)]:
                draw.rounded_rectangle((x, 110, x + 72, 474), radius=30, outline="#b7c9c9", width=5)
                if slit:
                    draw.line((x + 36, 152, x + 36, 424), fill="#182b34", width=9)
                    draw.line((x + 36, 152, x + 36, 424), fill="#c77b62", width=2)
            fall_a = min(1, phase * 1.4)
            fall_b = min(1, phase * 0.72)
            draw.ellipse((127, 128 + fall_a * 280, 155, 156 + fall_a * 280), fill="#d9a84a")
            draw.ellipse((317, 128 + fall_b * 280, 345, 156 + fall_b * 280), fill="#d9a84a")
            draw.line((240, 112, 240, 478), fill="#56717b", width=2)
            draw.text((76, 514), "SAME START / ONE VARIABLE", font=font(19), fill="#d7e7e2")
        frames.append(image.convert("RGBA"))
    return frames


def write_skills(source: Path | None) -> None:
    for skill_id, name, summary, doc, channels, domains in SKILLS:
        original = clean_markdown(source_file(source, doc).read_text(encoding="utf-8"), doc)
        content = f"""# Stepframe 接入说明

来源：[GIF 工厂]({REPO_URL}) · `{doc}`。原创脚本与 Skill 说明采用 MIT；第三方角色、字体、音乐、品牌及外部 Skill 不随 MIT 转授权。

- 本文用于{summary}
- 用户提供的原图、视频、字稿与文案优先，模板预览只作风格参考。选中片段与附件直改继续使用 Stepframe 原素材路由，不因为本 Skill 重做或覆盖未选内容。
- 原仓库的相对链接已改写为来源链接。链接中的脚本、字体、案例与外部服务不表示已经安装或执行；不要编造运行结果、导出文件、授权或服务额度。
- 当前创作只调用 Stepframe 已提供的图片/视频生成与本机能力。Punk-Posters、Lemo-Opuscar 等外部能力不得声称自动调用；需要时说明依赖，由用户另行提供。
- 动态预览不等于最终成片。只完成提示词、脚本或分镜时如实说明，实际导出后再核对首尾帧、动作过程、文字、声音与连续性。

---

{original}
"""
        (SKILL_DIR / f"{skill_id}.md").write_text(content, encoding="utf-8")


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_typescript() -> None:
    imports = [f"import {item['id'].replace('-', '_')} from './guides/gif-factory/{item['id']}.md?raw'" for item in TEMPLATES]
    categories = ",\n".join(
        f"  {{ id: {ts_string(key)}, label: {ts_string(label)}, labelEn: {ts_string(labelEn)} }}" for key, label, labelEn in CATEGORIES
    )
    entries = []
    for item in TEMPLATES:
        category, category_en = next((label, en) for key, label, en in CATEGORIES if key == item["category"])
        animated = bool(item.get("schematic")) or str(item.get("media", "")).endswith(".gif")
        entries.append(f"""  {{
    id: {ts_string(item['id'])},
    code: {ts_string(item['code'])},
    name: {ts_string(item['name'])},
    nameEn: {ts_string(item['nameEn'])},
    category: {ts_string(category)},
    categoryEn: {ts_string(category_en)},
    demo: {ts_string(item['input'])},
    poster: '/templates/gif-factory/{item['id']}.jpg',
    {f"animatedPreview: '/templates/gif-factory/{item['id']}.gif'," if animated else ''}
    {f"previewKind: 'schematic'," if item.get('schematic') else ''}
    still: true,
    generated: false,
    guide: {item['id'].replace('-', '_')},
  }}""")
    joined_entries = ",\n".join(entries)
    content = f"""import type {{ BuiltinTemplate, TemplateCategory }} from './types'
{chr(10).join(imports)}

/**
 * GIF 工厂模板，由 scripts/import-gif-factory-templates.py 生成。
 * 方法与 Skill：https://github.com/WoYun520/gif-factory （原创说明 MIT）。
 * 动态 GIF 只用于预览；templateStore 始终将 JPG 静帧交给现有创作链路。
 */
export const GIF_FACTORY_CATEGORIES: TemplateCategory[] = [
{categories},
]

export const GIF_FACTORY_TEMPLATES: BuiltinTemplate[] = [
{joined_entries},
]
"""
    content = re.sub(r"[ \t]+\n", "\n", content)
    OUTPUT_TS.write_text(content, encoding="utf-8")


def write_notice(source: Path | None) -> None:
    license_text = source_file(source, "LICENSE").read_text(encoding="utf-8")
    media_sources = [f"- `{item['id']}`：`{item['media']}`" for item in TEMPLATES if item.get("media")]
    schematics = "、".join(f"`{item['id']}`" for item in TEMPLATES if item.get("schematic"))
    notice = f"""# GIF 工厂模板来源与素材边界

来源：{REPO_URL}
导入分支：`{REF}`。生成脚本：`scripts/import-gif-factory-templates.py`。

## 许可
原仓库明确将**原创制作脚本与 Skill 说明**置于 MIT 下，许可证原文附在本文件末尾。
模板中的制作说明据此导入并保留来源；Stepframe 的适配说明不改变原作归属。

## 动态预览与模型参考
- `.gif` 只用于模板卡片动态预览；应用模板时使用同名 `.jpg` 静帧。
- 下列预览来自原仓库项目案例，仅用于观察制作方法。角色、字体、配乐、品牌及其他第三方素材按各自许可，不因代码 MIT 而自动获得商业使用权。
- 不含原仓库字体二进制、配音模型、第三方配乐或外部 Skill 运行时。
- {schematics} 的预览是导入脚本绘制的中性方法示意。光栅卡与动态海报为避免第三方角色 IP，未复制原示例人物；其他示意用于离线展示制作原理，不冒充原案例。
- 用户实际创作应使用自己提供且有权使用的角色、照片、字稿、字体、品牌与声音。

## 本地预览对应来源
{chr(10).join(media_sources)}

## 外部依赖
文章配色说明提到 Punk-Posters，知识图解提到 Lemo-Opuscar；它们都是独立项目，未包含也未自动调用，须分别遵守其当前许可。

## MIT License 原文
```text
{license_text.strip()}
```
"""
    (MEDIA_DIR / "NOTICE.md").write_text(notice, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="本地仓库或下载缓存目录")
    args = parser.parse_args()
    source = args.source.resolve() if args.source else None
    GUIDE_DIR.mkdir(parents=True, exist_ok=True)
    SKILL_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    for item in TEMPLATES:
        guide = guide_for(item, source)
        (GUIDE_DIR / f"{item['id']}.md").write_text(guide, encoding="utf-8")
        print(f"guide  {item['id']}")

    # 媒体下载彼此独立，限制并发避免触发 GitHub  secondary rate limit。
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(export_media, item, source): item for item in TEMPLATES}
        for future in concurrent.futures.as_completed(futures):
            future.result()
            print(f"media  {futures[future]['id']}")

    write_skills(source)
    write_typescript()
    write_notice(source)
    print(f"完成：{len(TEMPLATES)} 个模板，{len(SKILLS)} 份 Skill，{len(CATEGORIES)} 个分类。")


if __name__ == "__main__":
    main()
