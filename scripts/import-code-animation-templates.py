#!/usr/bin/env python3
"""把 code-animation-prompts 的 341 种风格导入模板库。

数据来源：https://github.com/XiaoyeCodes/code-animation-prompts
- docs/STYLES.md 提供编号、风格名与系列；
- assets/library/风格提示词/<系列>/<编号>_<名称>.md 是可直接用的风格提示词；
- 同名 .jpg（196 张）是参考静帧，缩到 560px 后落到 public/templates/code-animation/；
- 没有静帧的风格生成一张「文字参考」占位图，避免界面出现破图。

用法：
  python3 scripts/import-code-animation-templates.py                 # 从镜像下载
  python3 scripts/import-code-animation-templates.py --source ~/repo  # 用本地仓库
  python3 scripts/import-code-animation-templates.py --limit 12       # 调试
  python3 scripts/import-code-animation-templates.py --keep-posters   # 保留已生成的图
"""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = "XiaoyeCodes/code-animation-prompts"
REF = "main"
LIB = "skills/code-animation-prompts/assets/library/风格提示词"
WORKDIR = Path(__file__).resolve().parent.parent
CACHE = WORKDIR / ".cache" / "code-animation-prompts"
# 示例图清单要跟着代码走：换机器重新导入时靠它区分「原素材静帧」和「AI 示例」。
GENERATED_MANIFEST = WORKDIR / "scripts" / "template-stills.json"
LEGACY_MANIFEST = CACHE / "generated.json"
POSTER_DIR = WORKDIR / "public" / "templates" / "code-animation"
OUTPUT = WORKDIR / "src" / "features" / "template" / "builtin.ts"

GUIDE_LIMIT = 2100
POSTER_WIDTH = 560
POSTER_HEIGHT = 315
POSTER_QUALITY = 80
PLACEHOLDER_QUALITY = 82

# 目录 → (分类 id, 中文名, 英文名)。顺序就是模板库里分类的排列顺序。
SERIES = {
    "A-G_代码样片": ("code-samples", "代码样片", "Code Samples"),
    "M_动态风格": ("motion", "动态风格", "Motion"),
    "K_卡通画风": ("cartoon", "卡通画风", "Cartoon"),
    "Z_中国风": ("chinese", "中国风", "Chinese"),
    "H_现成版式": ("layouts", "现成版式", "Layouts"),
    "R_照参考学来的": ("reference", "参考学习", "Reference"),
    "L_Lemo-Opuscar": ("lemo-opuscar", "Lemo-Opuscar", "Lemo-Opuscar"),
    "V_mg-styles-15": ("mg-styles", "MG 风格", "MG Styles"),
    "X_code-video": ("code-video", "Code Video", "Code Video"),
    "O_奥斯卡98部": ("oscars", "奥斯卡 98 部", "Oscars"),
}

MIRRORS = (
    "https://gcore.jsdelivr.net/gh/{repo}@{ref}/{path}",
    "https://gh-proxy.com/https://raw.githubusercontent.com/{repo}/{ref}/{path}",
    "https://ghproxy.net/https://raw.githubusercontent.com/{repo}/{ref}/{path}",
)

# 这些章节是在教模型怎么交付代码，不是画面风格，直接丢掉。
DROP_SECTION = re.compile(
    r"(内容|输出|交付|写完|自检|自查|评分|参考出处|分镜|示范片|学的是|旧编号"
    r"|怎么用|怎么找|来源|技术路线|technical|deliver|output|checklist|workflow|before you)",
    re.I,
)

# 这些章节是真正的视觉规则，保留。
KEEP_SECTION = re.compile(
    r"(风格|style|颜色|配色|色调|色彩|color|palette|字体|font|版面|layout|构图|composition"
    r"|动起来|运动|motion|怎么画|画法|规则|rule|signature|look|不要|避免|avoid"
    r"|补充|定死|质感|texture|镜头|camera|节奏|timing|声音|sound|材质|material"
    r"|元素|element|版式|导演|director|装置|光影)",
    re.I,
)

# 交付要求 / 代码实现细节，出现在句子里也会污染画面提示词。
DROP_LINE = re.compile(
    r"(只输出|html 代码块|index\.html|不要解释|不要用省略号|不要写.?其余同上|canvas 固定"
    r"|draw\(t\)|requestAnimationFrame|mulberry32|\?t=|带种子的随机|代码必须完整可运行"
    r"|用 CSS 让|按空格暂停|网址带|参考实现|绘制函数|2D context|公共函数|S\.[A-Z]\d"
    r"|存状态用的空对象|原生 HTML|JavaScript|外部库|前端动效工程师|字体文件或图片"
    r"|Rendering must be deterministic|precomputed|ffmpeg|CC0|licen[cs]e|trademark|CREDITS"
    r"|On-screen text must be correct|Assets: only)",
    re.I,
)

# 把只在代码里有意义的词换成画面语言，别让实现细节盖过风格。
CODE_WORDS = {
    "destination-out": "挖孔",
    "globalCompositeOperation": "叠加",
    "离屏 canvas": "单独一层",
    "setLineDash": "虚线",
    "ctx.letterSpacing": "字距",
    "letterSpacing": "字距",
    "shadowColor": "投影颜色",
    "shadowBlur": "投影模糊",
    "shadowOffsetX": "投影横向偏移",
    "shadowOffsetY": "投影纵向偏移",
}

PAREN_NOISE = re.compile(r"[（(][^（()）]*浏览器[^（()）]*[）)]")

# 这些短语只是“怎么把代码跑起来”，留着会干扰画面描述。
CODE_PHRASE = re.compile(r"用代码[（(]\s*Canvas\s*2D\s*[）)]\s*画", re.I)

META_KEYS = ("长什么样", "适合", "适合讲", "关键词")


def filter_sentences(text: str) -> str:
    """只丢掉交付/代码相关的句子，保留同段里的画面描述。"""
    kept = [
        sentence.strip()
        for sentence in re.split(r"(?<=[。！？!?])\s*", text)
        if sentence.strip() and not DROP_LINE.search(sentence)
    ]
    return " ".join(kept).strip()


def normalize(text: str) -> str:
    """把实现细节换成画面语言，顺带清掉括注里的浏览器/技术说明。"""
    # O 系列每条都是「中文正文 + English: 英文正文」，只留中文。
    if re.search(r"[\u4e00-\u9fff]", text):
        marker = re.search(r"\n\s*English\s*[:：]?\s*\n", text)
        if marker and marker.start() > 0:
            text = text[: marker.start()]
    for word, replacement in CODE_WORDS.items():
        text = text.replace(word, replacement)
    text = PAREN_NOISE.sub("", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def http_get(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "onestep-template-import"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch(path: str, validate=None, retries: int = 2) -> bytes:
    """镜像可能返回 200 + 错误说明，validate 不通过就换下一个镜像。"""
    last: Exception | None = None
    for attempt in range(retries):
        for pattern in MIRRORS:
            url = pattern.format(repo=REPO, ref=REF, path=urllib.parse.quote(path, safe="/"))
            try:
                data = http_get(url)
                if validate is not None and not validate(data):
                    raise ValueError("返回内容不是目标文件")
                return data
            except Exception as error:  # noqa: BLE001 - 换镜像重试
                last = error
        time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"下载失败：{path}（{last}）")


def list_repo_files() -> list[str]:
    """列出风格提示词目录下的 .md / .jpg，优先用 GitHub tree API。"""
    cached = CACHE / "tree.json"
    if cached.exists():
        try:
            data = json.loads(cached.read_text(encoding="utf-8"))
            if data.get("paths"):
                return data["paths"]
        except Exception:  # noqa: BLE001
            pass
    url = f"https://api.github.com/repos/{REPO}/git/trees/{REF}?recursive=1"
    data = json.loads(http_get(url, timeout=60).decode("utf-8"))
    paths = [
        item["path"]
        for item in data.get("tree", [])
        if item.get("type") == "blob" and item["path"].startswith(LIB + "/")
    ]
    if not paths:
        raise RuntimeError("GitHub tree 里没有找到风格提示词")
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps({"paths": paths}, ensure_ascii=False), encoding="utf-8")
    return paths


def series_of(relative: str) -> str:
    return relative.split("/")[0]


def code_sort_key(code: str) -> tuple[str, int, str]:
    match = re.match(r"([A-Za-z]+)(\d+)", code)
    if match:
        return (match.group(1).upper(), int(match.group(2)), code)
    return (code.upper(), 0, code)


def plain(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\([^)]+\)", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def fill_placeholders(text: str) -> str:
    def replace(match: re.Match[str]) -> str:
        inner = match.group(1)
        if "默认" in inner:
            tail = inner.split("默认", 1)[1].lstrip("：: ")
            return tail.strip()
        return ""

    text = re.sub(r"\{\{(.*?)\}\}", replace, text)
    return re.sub(r"\s+", " ", text).strip(" ：:，,")


def clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    boundary = max(cut.rfind("。"), cut.rfind(". "), cut.rfind("；"), cut.rfind("; "))
    if boundary > limit * 0.55:
        cut = cut[: boundary + 1]
    return cut.rstrip(" ,;，；") + "…"


def useful_line(line: str) -> bool:
    # 交付/代码相关的废弃交给 filter_sentences 按句子处理，这里只挡明显不是句子的行。
    stripped = line.strip()
    if re.match(r"^(const|let|var|function|return|if|for|while|import|export|class)\b", stripped):
        return False
    if re.match(r"^[{}()[\];,.<>=+\-*/|&]+$", stripped):
        return False
    return True


def clean_block(lines: list[str]) -> list[str]:
    """把一段 markdown 变成适合进提示词的短句列表。"""
    paragraphs: list[str] = []
    buffer: list[str] = []
    in_fence = False

    def flush() -> None:
        if not buffer:
            return
        joined = plain(" ".join(buffer))
        buffer.clear()
        if not joined or not useful_line(joined):
            return
        joined = fill_placeholders(joined)
        joined = CODE_PHRASE.sub("画", joined)
        joined = filter_sentences(joined)
        if joined:
            paragraphs.append(joined)

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            flush()
            continue
        if in_fence:
            continue
        if not stripped:
            flush()
            continue
        if stripped.startswith(">"):
            # 引用块多为“这条提示词重新写过”的说明，不属于风格。
            flush()
            continue
        if re.match(r"^\|?\s*-{3,}", stripped):
            continue
        if stripped.startswith("|"):
            cells = [plain(cell) for cell in stripped.strip("|").split("|")]
            cells = [cell for cell in cells if cell and not re.fullmatch(r"[-: ]+", cell)]
            if not cells:
                continue
            if all(re.fullmatch(r"[#\d]+", cell) for cell in cells):
                continue
            if any(cell in ("Item", "项目", "要点") for cell in cells):
                continue
            flush()
            if useful_line(" · ".join(cells)):
                paragraphs.append(fill_placeholders(" · ".join(cells)))
            continue
        if re.match(r"^#{1,6}\s", stripped):
            flush()
            continue
        # 列表项和“适合讲：”这类短标签单独成句，避免挤成一整段。
        if re.match(r"^(\d+\.|[-*])\s+", stripped) or re.match(
            r"^(适合讲|适合|关键词|长什么样|主题)[：:]", stripped
        ):
            flush()
            item = re.sub(r"^(\d+\.|[-*])\s+", "", stripped)
            item = plain(item)
            if useful_line(item):
                item = fill_placeholders(item)
                item = CODE_PHRASE.sub("画", item)
                item = filter_sentences(item)
                if item:
                    paragraphs.append(item)
            continue
        buffer.append(stripped)
    flush()
    return paragraphs


def split_sections(markdown: str) -> tuple[list[dict], str]:
    """拆出开头的元信息与正文小节。标题里的 # 也算小节，兼容素材里的写法。"""
    lines = markdown.splitlines()
    title = ""
    meta: dict[str, str] = {}
    sections: list[dict] = []
    current: dict | None = None
    started = False

    for index, raw in enumerate(lines):
        line = raw.rstrip()
        stripped = line.strip()
        if not started:
            if not stripped:
                continue
            started = True
            if stripped.startswith("# "):
                title = stripped[2:].strip()
                continue
        heading = re.match(r"^#{1,6}\s+(.+)$", stripped)
        if heading:
            current = {"title": heading.group(1).strip(), "lines": []}
            sections.append(current)
            continue
        bullets = re.match(r"^[-*]\s*([^：:]{1,12})[：:]\s*(.+)$", stripped)
        if bullets and (current is None):
            meta[bullets.group(1).strip()] = fill_placeholders(plain(bullets.group(2)))
            continue
        if current is not None:
            current["lines"].append(line)
        elif stripped:
            meta.setdefault("简介", plain(stripped))
    return sections, title


def summarize_legacy(markdown: str, name: str, code: str, category: str) -> str:
    """Lemo-Opuscar 的 12 节 STYLE.md：按小节语义压成可直接用的风格摘要。"""

    sections: list[tuple[str, list[str]]] = []
    meta: dict[str, str] = {}
    essence = ""
    current: list[str] | None = None

    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            current = []
            sections.append((stripped[3:].strip(), current))
            continue
        if current is None:
            match = re.match(r"^[-*]\s*([^：:]{1,10})[：:]\s*(.+)$", stripped)
            if match and match.group(1).strip() in META_KEYS:
                meta[match.group(1).strip()] = fill_placeholders(plain(match.group(2)))
                continue
            if stripped.startswith(">"):
                quote = plain(stripped.lstrip(">").strip())
                if quote and not quote.lower().startswith(("references", "reference")):
                    essence = (essence + " " + quote).strip()
            continue
        current.append(line)

    def body(prefix: str) -> list[str]:
        for title, content in sections:
            if re.match(rf"^{re.escape(prefix)}(?!\d)", title):
                return content
        return []

    def bullets(lines: list[str], limit: int, length: int) -> list[str]:
        picked: list[str] = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith(("|", "---", "#")):
                continue
            if not re.match(r"^([-*]|\d+\.)\s", stripped):
                continue
            item = plain(re.sub(r"^([-*]|\d+\.)\s+", "", stripped))
            if item:
                picked.append(clip(fill_placeholders(item), length))
            if len(picked) >= limit:
                break
        return picked

    def paragraphs(lines: list[str], limit: int, length: int) -> list[str]:
        picked: list[str] = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith(("|", "---", "#")):
                continue
            if re.match(r"^([-*]|\d+\.)\s", stripped):
                continue
            item = plain(stripped)
            if item:
                picked.append(clip(fill_placeholders(item), length))
            if len(picked) >= limit:
                break
        return picked

    parts: list[str] = [f"风格：{name}（{code} · {category}）"]
    if meta.get("长什么样"):
        parts.append(f"长什么样：{clip(meta['长什么样'], 260)}")
    if meta.get("适合"):
        parts.append(f"适合：{clip(meta['适合'], 160)}")
    if essence:
        parts.append(f"风格内核：{clip(essence, 460)}")

    # 1 内核 · 2 材质 · 3 用色 · 5 运动 · 6 镜头 · 9 常见问题
    groups = (
        ("关键特征", "1.", 1, 3),
        ("质感与用色", "2.", 1, 2),
        ("用色", "3.", 1, 2),
        ("节奏", "5.", 1, 2),
        ("镜头", "6.", 1, 1),
        ("避免", "9.", 2, 4),
    )
    for label, prefix, para_limit, bullet_limit in groups:
        lines = body(prefix)
        picked = paragraphs(lines, para_limit, 240) + bullets(lines, bullet_limit, 140)
        if picked:
            parts.append(f"{label}：\n" + "\n".join(f"- {item}" for item in picked))
    return clip(normalize("\n\n".join(parts)), GUIDE_LIMIT)


HEADING_ALIASES = {
    "style": "风格",
    "signature": "特征",
    "look": "画面",
    "palette": "配色",
    "fonts": "字体",
    "font": "字体",
    "motion": "运动",
    "camera": "镜头",
    "sound": "声音",
}


def clean_heading(title: str) -> str:
    """把小节标题压成短标签；纯英文的长标题对读者没信息量。"""
    base = re.sub(r"\s*[（(][^（()）]*[）)]\s*", "", title).strip()
    key = base.lower()
    if key in HEADING_ALIASES:
        return HEADING_ALIASES[key]
    if not re.search(r"[\u4e00-\u9fff]", base) and len(base) > 12:
        return "要点"
    return base or "要点"


def summarize(markdown: str, name: str, code: str, category: str) -> str:
    if re.search(r"^##\s+\d+\.", markdown, re.M):
        return summarize_legacy(markdown, name, code, category)

    sections, _title = split_sections(markdown)
    meta: dict[str, str] = {}
    for section in sections:
        for line in section["lines"]:
            match = re.match(r"^[-*]\s*([^：:]{1,10})[：:]\s*(.+)$", line.strip())
            if match and match.group(1).strip() in META_KEYS and match.group(1).strip() not in meta:
                meta[match.group(1).strip()] = fill_placeholders(plain(match.group(2)))

    blocks: list[tuple[str, list[str]]] = []
    main_paragraphs: list[str] = []
    avoid_paragraphs: list[str] = []
    for section in sections:
        heading = section["title"]
        body = clean_block(section["lines"])
        if not body:
            continue
        if heading.startswith("风格提示词"):
            main_paragraphs.extend(body)
            continue
        if DROP_SECTION.search(heading):
            # “写完后自己过一遍（不要输出）”这类章节先按交付要求丢掉。
            continue
        if re.match(r"^(不要|避免|avoid)\b", heading, re.I):
            avoid_paragraphs.extend(body)
            continue
        if KEEP_SECTION.search(heading):
            blocks.append((clean_heading(heading), body))

    parts: list[str] = [f"风格：{name}（{code} · {category}）"]
    if meta.get("长什么样"):
        parts.append(f"长什么样：{meta['长什么样']}")
    if meta.get("适合"):
        parts.append(f"适合：{meta['适合']}")
    if meta.get("关键词"):
        parts.append(f"关键词：{meta['关键词']}")
    if main_paragraphs:
        parts.append("提示词：\n" + "\n".join(main_paragraphs))
    for heading, body in blocks:
        parts.append(f"{heading}：\n" + "\n".join(body))
    if avoid_paragraphs:
        parts.append("避免：\n" + "\n".join(avoid_paragraphs))
    return clip(normalize("\n\n".join(parts)), GUIDE_LIMIT)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:  # noqa: BLE001
                continue
    return ImageFont.load_default()


def placeholder_poster(code: str, name: str, category: str, category_en: str) -> bytes:
    """没有静帧时的占位图：只写编号与名称，居中排版，避开卡片四角的角标。"""
    image = Image.new("RGB", (POSTER_WIDTH, POSTER_HEIGHT), "#f7f5ee")
    draw = ImageDraw.Draw(image)
    # 极简纸感：细横线 + 左侧色条，和步帧的白 / 赤陶界面一致。
    for y in range(0, POSTER_HEIGHT, 8):
        draw.line((0, y, POSTER_WIDTH, y), fill="#f4f1e8")
    draw.rectangle((0, 0, 4, POSTER_HEIGHT), fill="#d8d2c4")
    draw.rectangle((POSTER_WIDTH / 2 - 11, 84, POSTER_WIDTH / 2 + 11, 88), fill="#b4472f")

    code_font = load_font(64)
    name_font = load_font(24)
    note_font = load_font(15)

    def centered(text: str, top: int, font, fill: str) -> None:
        width = draw.textlength(text, font=font)
        draw.text(((POSTER_WIDTH - width) / 2, top), text, font=font, fill=fill)

    centered(code, 108, code_font, "#2a2a26")
    centered(name[:14], 184, name_font, "#4a4a44")
    centered("纯文字提示词", 218, note_font, "#b0aca2")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=PLACEHOLDER_QUALITY, optimize=True, progressive=True)
    return buffer.getvalue()


def resize_poster(data: bytes) -> bytes:
    image = Image.open(io.BytesIO(data))
    image = image.convert("RGB")
    if image.width > POSTER_WIDTH:
        height = round(image.height * POSTER_WIDTH / image.width)
        image = image.resize((POSTER_WIDTH, height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=POSTER_QUALITY, optimize=True, progressive=True)
    return buffer.getvalue()


def valid_image(data: bytes) -> bool:
    return data[:2] == b"\xff\xd8"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="本地仓库根目录（含 skills/...）")
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 个风格，用于调试")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--keep-posters", action="store_true", help="已有海报时跳过，不重新生成")
    args = parser.parse_args()

    if args.source:
        root = args.source.expanduser().resolve()
        library = root / LIB
        if not library.is_dir():
            raise SystemExit(f"本地仓库里没有 {LIB}：{root}")
        rel_paths = [
            str(path.relative_to(root / LIB)).replace(os.sep, "/")
            for path in library.rglob("*")
            if path.suffix.lower() in (".md", ".jpg")
        ]
        markdown_by_rel: dict[str, str] = {}
        for rel in rel_paths:
            if rel.endswith(".md"):
                try:
                    markdown_by_rel[rel] = (library / rel).read_text(encoding="utf-8")
                except Exception:  # noqa: BLE001
                    pass
        image_by_rel: dict[str, str] = {}
        print(f"本地仓库：{root}，找到 {len(rel_paths)} 个文件")
    else:
        rel_paths = [p[len(LIB) + 1 :] for p in list_repo_files()]
        markdown_by_rel = {}
        image_by_rel = {}
        print(f"远端仓库：{REPO}，找到 {len(rel_paths)} 个文件")

    md_rels = sorted(rel for rel in rel_paths if rel.endswith(".md"))
    jpg_rels = {rel[:-4]: rel for rel in rel_paths if rel.endswith(".jpg")}

    styles: list[dict] = []
    for rel in md_rels:
        relative_dir = rel.split("/")[0]
        if relative_dir not in SERIES:
            continue
        file_name = rel.split("/")[-1]
        stem = file_name[:-3]
        code = stem.split("_", 1)[0].strip()
        file_name_part = stem.split("_", 1)[1].strip() if "_" in stem else ""
        styles.append(
            {
                "rel": rel,
                "dir": relative_dir,
                "code": code,
                "file_name": file_name_part,
                "stem": stem,
            }
        )
    styles.sort(key=lambda item: (list(SERIES).index(item["dir"]), code_sort_key(item["code"])))
    if args.limit:
        styles = styles[: args.limit]

    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "markdown").mkdir(exist_ok=True)

    def load_markdown(style: dict) -> str:
        cache_file = CACHE / "markdown" / f"{style['stem']}.md"
        if style["rel"] in markdown_by_rel:
            return markdown_by_rel[style["rel"]]
        if cache_file.exists():
            text = cache_file.read_text(encoding="utf-8")
            if text.lstrip().startswith("#"):
                return text
        text = fetch(
            (LIB + "/" + style["rel"]),
            validate=lambda data: data.lstrip().startswith(b"#"),
        )
        decoded = text.decode("utf-8")
        if not decoded.lstrip().startswith("#"):
            raise RuntimeError("返回的不是提示词正文")
        cache_file.write_text(decoded, encoding="utf-8")
        return decoded

    def load_poster(style: dict) -> bytes | None:
        key = style["rel"][:-3]
        rel_jpg = jpg_rels.get(key)
        if not rel_jpg:
            return None
        cache_file = CACHE / "images" / f"{style['stem']}.jpg"
        if style["rel"][:-3] + ".jpg" in image_by_rel:
            data = Path(image_by_rel[style["rel"][:-3] + ".jpg"]).read_bytes()
            if valid_image(data):
                return data
        if cache_file.exists():
            data = cache_file.read_bytes()
            if valid_image(data):
                return data
        data = fetch(LIB + "/" + rel_jpg, validate=valid_image)
        if not valid_image(data):
            raise RuntimeError("返回的不是 JPEG")
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(data)
        return data

    results: dict[str, dict] = {}

    def process(style: dict) -> tuple[dict, str]:
        errors: list[str] = []
        markdown = ""
        try:
            markdown = load_markdown(style)
        except Exception as error:  # noqa: BLE001
            errors.append(f"提示词：{error}")
        poster_raw: bytes | None = None
        try:
            poster_raw = load_poster(style)
        except Exception as error:  # noqa: BLE001
            errors.append(f"静帧：{error}")
        return style, {"markdown": markdown, "poster": poster_raw, "errors": errors}

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(process, style) for style in styles]
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            style, data = future.result()
            results[style["code"]] = data
            state = "ok" if not data["errors"] else " / ".join(data["errors"])
            print(f"[{index}/{len(styles)}] {style['code']} · {state}")

    POSTER_DIR.mkdir(parents=True, exist_ok=True)
    generated_codes: set[str] = set()
    for manifest in (GENERATED_MANIFEST, LEGACY_MANIFEST):
        if not manifest.exists():
            continue
        try:
            generated_codes = set(json.loads(manifest.read_text(encoding="utf-8")).keys())
            break
        except Exception:  # noqa: BLE001
            continue

    rows: list[str] = []
    skipped: list[str] = []
    used_categories: set[str] = set()
    written = 0

    for style in styles:
        data = results.get(style["code"], {})
        markdown = data.get("markdown") or ""
        sections, title = split_sections(markdown)
        heading_name = re.sub(rf"^{re.escape(style['code'])}\s*", "", title).strip()
        name = heading_name or style["file_name"] or ""
        name = re.sub(r"\s*[（(].*?[）)]\s*$", "", name).strip()
        if not markdown.strip() or not name:
            # 源素材里 M14 等 8 条只留了编号，没有正文；与其放一张空卡片，不如不收录。
            skipped.append(style["code"])
            continue

        series = SERIES[style["dir"]]
        category, category_en = series[1], series[2]
        demo = ""
        for section in sections:
            for line in section["lines"]:
                match = re.match(r"^[-*]\s*示范片[：:]\s*(.+)$", line.strip())
                if match:
                    demo = fill_placeholders(plain(match.group(1)))
                    break

        guide = summarize(markdown, name, style["code"], category)
        if not guide:
            skipped.append(style["code"])
            continue
        if len(guide) < 160:
            # 原素材有些条目只有一句母题，补一句用法，避免模型无从下手。
            guide += (
                "\n\n补充：这是一句母题式的风格提示词，构图、配色和节奏都围绕它展开，"
                "不要引入与它无关的风格。"
            )

        still = bool(data.get("poster"))
        poster_path = POSTER_DIR / f"{style['code'].lower()}.jpg"
        generated = (not still) and style["code"].lower() in generated_codes and poster_path.exists()
        used_categories.add(category)
        if not args.keep_posters or not poster_path.exists():
            if still:
                poster_path.write_bytes(resize_poster(data["poster"]))  # type: ignore[arg-type]
            else:
                poster_path.write_bytes(
                    placeholder_poster(style["code"], name, category, category_en)
                )
            written += 1

        rows.append(
            "  {\n"
            f"    id: {json.dumps('ca-' + style['code'].lower(), ensure_ascii=False)},\n"
            f"    code: {json.dumps(style['code'], ensure_ascii=False)},\n"
            f"    name: {json.dumps(name, ensure_ascii=False)},\n"
            f"    nameEn: {json.dumps(style['code'], ensure_ascii=False)},\n"
            f"    category: {json.dumps(category, ensure_ascii=False)},\n"
            f"    categoryEn: {json.dumps(category_en, ensure_ascii=False)},\n"
            f"    demo: {json.dumps(demo, ensure_ascii=False)},\n"
            f"    poster: {json.dumps('/templates/code-animation/' + style['code'].lower() + '.jpg', ensure_ascii=False)},\n"
            f"    still: {json.dumps(still)},\n"
            f"    generated: {json.dumps(generated)},\n"
            f"    guide: {json.dumps(guide, ensure_ascii=False)},\n"
            "  },"
        )

    category_rows = "\n".join(
        "  {\n"
        f"    id: {json.dumps(series[0], ensure_ascii=False)},\n"
        f"    label: {json.dumps(series[1], ensure_ascii=False)},\n"
        f"    labelEn: {json.dumps(series[2], ensure_ascii=False)},\n"
        "  },"
        for series in SERIES.values()
        if series[1] in used_categories
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "import type { BuiltinTemplate, TemplateCategory } from './types'\n\n"
        "import { EXTRA_CATEGORIES, EXTRA_TEMPLATES } from './extra'\n\n"
        "/**\n"
        f" * 内置模板来自 code-animation-prompts（https://github.com/{REPO}）。\n"
        " * 由 scripts/import-code-animation-templates.py 生成：\n"
        " * - 341 份风格提示词压成可执行摘要，写入 guide；\n"
        " * - 196 张参考静帧缩到 560px 存入 public/templates/code-animation/；\n"
        " * - 没有静帧的风格生成「文字参考」占位图，卡片上 still=false。\n"
        " * 素材免费分享，禁止包装成付费课程 / 付费 skill 销售。\n"
        " */\n"
        "export const TEMPLATE_CATEGORIES: TemplateCategory[] = [\n"
        f"{category_rows}\n"
        "  ...EXTRA_CATEGORIES,\n"
        "]\n\n"
        "export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [\n"
        f"{chr(10).join(rows)}\n"
        "  ...EXTRA_TEMPLATES,\n"
        "]\n",
        encoding="utf-8",
    )

    stills = sum(1 for row in rows if "still: true" in row)
    ai = sum(1 for row in rows if "generated: true" in row)
    print(
        f"写入 {OUTPUT}：{len(rows)} 个模板（{stills} 张原素材静帧 + {ai} 张 AI 示例），"
        f"写入 {written} 张海报"
    )
    if skipped:
        print(f"跳过 {len(skipped)} 个空条目：{'、'.join(skipped)}")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
