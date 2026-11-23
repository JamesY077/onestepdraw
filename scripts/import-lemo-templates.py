#!/usr/bin/env python3
"""把 lemo-opuscar 的风格库导入模板库。

数据来源：https://github.com/lemomo-ai/lemo-opuscar
- styles/README.md 提供分类、风格中英文名与示例片名；
- styles/<id>/poster.jpg 提供预览图（这里缩到 560px，落到 public/templates/）；
- styles/<id>/STYLE.md 提供风格说明（这里压成 ~2k 字的可执行摘要）。

用法：
  python3 scripts/import-lemo-templates.py
  python3 scripts/import-lemo-templates.py --ref main --workers 8
"""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

REPO = "lemomo-ai/lemo-opuscar"
MIRRORS = (
    "https://gcore.jsdelivr.net/gh/{repo}@{ref}/{path}",
    "https://fastly.jsdelivr.net/gh/{repo}@{ref}/{path}",
    "https://api.github.com/repos/{repo}/contents/{path}?ref={ref}",
)
WORKDIR = Path(__file__).resolve().parent.parent
CACHE = WORKDIR / ".cache" / "lemo-templates"
POSTER_DIR = WORKDIR / "public" / "templates"
OUTPUT = WORKDIR / "src" / "features" / "template" / "builtin.ts"
GUIDE_LIMIT = 2100
POSTER_WIDTH = 560
POSTER_QUALITY = 80


def fetch(path: str, ref: str, retries: int = 3) -> bytes:
    urls = [pattern.format(repo=REPO, ref=ref, path=path) for pattern in MIRRORS]
    last: Exception | None = None
    for attempt in range(retries):
        for url in urls:
            try:
                headers = {"User-Agent": "onestep-template-import"}
                if "api.github.com" in url:
                    headers["Accept"] = "application/vnd.github.raw"
                request = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(request, timeout=20) as response:
                    return response.read()
            except Exception as error:  # noqa: BLE001 - 失败后换镜像重试
                last = error
        time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"下载失败：{path}（{last}）")


def parse_readme(text: str) -> tuple[list[dict], list[dict]]:
    categories: list[dict] = []
    styles: list[dict] = []
    current: dict | None = None
    for line in text.splitlines():
        heading = re.match(r"^## (.+?) · (.+)$", line)
        if heading:
            current = {"labelEn": heading.group(1).strip(), "label": heading.group(2).strip()}
            categories.append(current)
            continue
        if not current or not line.startswith("|"):
            continue
        if line.startswith("|---") or line.startswith("| Style"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) < 4:
            continue
        folder = re.search(r"\[`([^`]+)`\]", cells[2])
        if not folder:
            continue
        styles.append(
            {
                "id": folder.group(1),
                "name": cells[1].strip(),
                "nameEn": cells[0].replace("✦", "").strip(),
                "category": current["label"],
                "categoryEn": current["labelEn"],
                "demo": cells[3].replace("*", "").strip(),
            }
        )
    return categories, styles


def plain(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\([^)]+\)", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    boundary = max(cut.rfind(". "), cut.rfind("。"), cut.rfind("; "))
    if boundary > limit * 0.55:
        cut = cut[: boundary + 1]
    return cut.rstrip(" ,;，；") + "…"


def summarize(markdown: str) -> str:
    """把 12 节的 STYLE.md 压成一段可直接进提示词的风格说明。"""
    lines = [line.rstrip() for line in markdown.splitlines()]
    essence = ""
    for line in lines:
        if line.startswith("## "):
            break
        if line.startswith(">"):
            quote = plain(line.lstrip(">").strip())
            if not quote or quote.lower().startswith("references"):
                continue
            essence = (essence + " " + quote).strip()
    essence = clip(essence, 520)

    sections: dict[str, list[str]] = {}
    current = ""
    for line in lines:
        heading = re.match(r"^##\s+(.+)$", line)
        if heading:
            current = heading.group(1).strip()
            sections[current] = []
            continue
        if current:
            sections[current].append(line)

    def first_section(prefix: str) -> list[str]:
        for key, content in sections.items():
            if key.startswith(prefix):
                return content
        return []

    def bullets(content: list[str], limit: int, length: int) -> list[str]:
        picked: list[str] = []
        for line in content:
            stripped = line.strip()
            if not stripped or stripped.startswith(("|", "---")):
                continue
            if not re.match(r"^([-*]|\d+\.)\s", stripped):
                continue
            item = plain(re.sub(r"^([-*]|\d+\.)\s+", "", stripped))
            if item:
                picked.append(clip(item, length))
            if len(picked) >= limit:
                break
        return picked

    def paragraphs(content: list[str], limit: int, length: int) -> list[str]:
        picked: list[str] = []
        for line in content:
            stripped = line.strip()
            if not stripped or stripped.startswith(("|", "---", "#")):
                continue
            # 只取纯段落；编号 / 列表交给 bullets，避免同一条出现两次。
            if re.match(r"^([-*]|\d+\.)\s", stripped):
                continue
            item = plain(stripped)
            if item:
                picked.append(clip(item, length))
            if len(picked) >= limit:
                break
        return picked

    core = first_section("1.")
    core_lines = paragraphs(core, 1, 300) + bullets(core, 4, 150)
    layout = first_section("2.")
    edit = first_section("3.")
    grade = first_section("6.")
    native = first_section("8.")
    pitfalls = first_section("11.")

    parts: list[str] = []
    if essence:
        parts.append(f"风格内核：{essence}")
    if core_lines:
        parts.append("关键特征：\n" + "\n".join(f"- {item}" for item in core_lines))
    framing = paragraphs(layout, 1, 260) + bullets(layout, 1, 150) + bullets(edit, 2, 150)
    if framing:
        parts.append("构图与节奏：\n" + "\n".join(f"- {item}" for item in framing))
    texture = bullets(grade, 2, 150) + bullets(native, 1, 150)
    if texture:
        parts.append("质感与动作：\n" + "\n".join(f"- {item}" for item in texture))
    avoid = bullets(pitfalls, 3, 150)
    if avoid:
        parts.append("避免：\n" + "\n".join(f"- {item}" for item in avoid))

    guide = "\n\n".join(parts)
    return clip(guide, GUIDE_LIMIT)


def resize_poster(data: bytes) -> bytes:
    image = Image.open(io.BytesIO(data))
    image = image.convert("RGB")
    if image.width > POSTER_WIDTH:
        height = round(image.height * POSTER_WIDTH / image.width)
        image = image.resize((POSTER_WIDTH, height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=POSTER_QUALITY, optimize=True, progressive=True)
    return buffer.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ref", default="main")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 个风格，用于调试")
    args = parser.parse_args()

    print("读取 styles/README.md …")
    readme = fetch("styles/README.md", args.ref).decode("utf-8")
    categories, styles = parse_readme(readme)
    if args.limit:
        styles = styles[: args.limit]
    print(f"分类 {len(categories)} 个，风格 {len(styles)} 个")

    POSTER_DIR.mkdir(parents=True, exist_ok=True)

    def process(style: dict) -> tuple[str, bytes | None, str, str]:
        style_id = style["id"]
        error = ""
        poster: bytes | None = None
        cached_poster = POSTER_DIR / f"{style_id}.jpg"
        try:
            if cached_poster.exists():
                poster = cached_poster.read_bytes()
            else:
                poster = resize_poster(fetch(f"styles/{style_id}/poster.jpg", args.ref))
        except Exception as exc:  # noqa: BLE001
            error = f"poster: {exc}"
        guide = ""
        cached_style = CACHE / f"{style_id}.md"
        try:
            if cached_style.exists():
                markdown = cached_style.read_text(encoding="utf-8")
            else:
                markdown = fetch(f"styles/{style_id}/STYLE.md", args.ref).decode("utf-8")
                cached_style.parent.mkdir(parents=True, exist_ok=True)
                cached_style.write_text(markdown, encoding="utf-8")
            guide = summarize(markdown)
        except Exception as exc:  # noqa: BLE001
            error = (error + " / " if error else "") + f"STYLE: {exc}"
        return style_id, poster, guide, error

    results: dict[str, tuple[bytes | None, str, str]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process, style): style for style in styles}
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            style = futures[future]
            style_id, poster, guide, error = future.result()
            results[style_id] = (poster, guide, error)
            if poster:
                (POSTER_DIR / f"{style_id}.jpg").write_bytes(poster)
            state = "ok" if not error else error
            print(f"[{index}/{len(styles)}] {style_id} · {state}")

    rows: list[str] = []
    failures: list[str] = []
    for style in styles:
        poster, guide, error = results.get(style["id"], (None, "", "未处理"))
        if not poster or not guide:
            failures.append(f"{style['id']}（{error or '缺少 poster 或 STYLE.md'}）")
            continue
        rows.append(
            "  {\n"
            f"    id: {json.dumps(style['id'], ensure_ascii=False)},\n"
            f"    name: {json.dumps(style['name'], ensure_ascii=False)},\n"
            f"    nameEn: {json.dumps(style['nameEn'], ensure_ascii=False)},\n"
            f"    category: {json.dumps(style['category'], ensure_ascii=False)},\n"
            f"    categoryEn: {json.dumps(style['categoryEn'], ensure_ascii=False)},\n"
            f"    demo: {json.dumps(style['demo'], ensure_ascii=False)},\n"
            f"    poster: {json.dumps('/templates/' + style['id'] + '.jpg', ensure_ascii=False)},\n"
            f"    guide: {json.dumps(guide, ensure_ascii=False)},\n"
            "  },"
        )

    category_rows = "\n".join(
        "  {\n"
        f"    id: {json.dumps(re.sub(r'[^a-z0-9]+', '-', item['labelEn'].lower()).strip('-'), ensure_ascii=False)},\n"
        f"    label: {json.dumps(item['label'], ensure_ascii=False)},\n"
        f"    labelEn: {json.dumps(item['labelEn'], ensure_ascii=False)},\n"
        "  },"
        for item in categories
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "import type { BuiltinTemplate, TemplateCategory } from './types'\n\n"
        "/**\n"
        " * 内置模板来自 lemo-opuscar 风格库（https://github.com/lemomo-ai/lemo-opuscar）。\n"
        " * 由 scripts/import-lemo-templates.py 生成：poster.jpg 缩到 560px 存入 public/templates，\n"
        " * STYLE.md 压成可执行摘要。分类与风格名保持官方 README 的写法。\n"
        " */\n"
        "export const TEMPLATE_CATEGORIES: TemplateCategory[] = [\n"
        f"{category_rows}\n"
        "]\n\n"
        "export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [\n"
        f"{chr(10).join(rows)}\n"
        "]\n",
        encoding="utf-8",
    )

    print(f"写入 {OUTPUT}（{len(rows)} 个模板）")
    if failures:
        print("以下风格没有导入：")
        for item in failures:
            print("  -", item)
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
