#!/usr/bin/env python3
"""用 Seedream 5.0 Lite 给没有参考静帧的风格生成示例图。

原素材里有 145 条只有文字提示词。这里按每条的 guide 写一段「还原风格」的
文生图提示词，生成 16:9 单帧示例，缩到 560×315 后写到
public/templates/code-animation/<code>.jpg，并记录到 .cache 的 manifest。

用法：
  AIPING_API_KEY=... python3 scripts/generate-template-stills.py
  AIPING_API_KEY=... python3 scripts/generate-template-stills.py --only K4,Z1,H2
  AIPING_API_KEY=... python3 scripts/generate-template-stills.py --force --workers 3
  python3 scripts/generate-template-stills.py --dry-run
"""

from __future__ import annotations

import argparse
import concurrent.futures
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

WORKDIR = Path(__file__).resolve().parent.parent
CACHE = WORKDIR / ".cache" / "code-animation-prompts"
# 清单进版本库（scripts/template-stills.json），重新导入时才知道哪些图是 AI 生成的。
MANIFEST = WORKDIR / "scripts" / "template-stills.json"
LEGACY_MANIFEST = CACHE / "generated.json"
IMAGES = CACHE / "generated"
POSTER_DIR = WORKDIR / "public" / "templates" / "code-animation"
BUILTIN = WORKDIR / "src" / "features" / "template" / "builtin.ts"

API_BASE = os.environ.get("AIPING_API_BASE", "https://aiping.cn/api/v1")
MODEL = "Doubao-Seedream-5.0-lite"
POSTER_WIDTH = 560
POSTER_HEIGHT = 315


def read_entries() -> list[dict]:
    source = BUILTIN.read_text(encoding="utf-8")
    blocks = [
        block
        for block in re.findall(r"  \{\n    id: .*?\n  \},", source, re.S)
        if '    code: "' in block
    ]
    entries: list[dict] = []
    for block in blocks:
        def field(name: str) -> str:
            match = re.search(rf'    {name}: ("(?:[^"\\]|\\.)*")', block)
            return json.loads(match.group(1)) if match else ""

        if "still: false" not in block:
            continue
        name = field("name")
        if name in ("待补充", ""):
            continue
        entries.append(
            {
                "code": field("code"),
                "name": name,
                "category": field("category"),
                "guide": field("guide"),
            }
        )
    return entries


def style_body(guide: str) -> str:
    body = "\n".join(
        line for line in guide.splitlines() if not line.startswith("风格：")
    ).strip()
    return body[:900]


def build_prompt(entry: dict) -> str:
    body = style_body(entry["guide"])
    short = len(body) < 120
    hint = (
        f"\n这条风格只有一句话，请把「{entry['name']}」当成画面的核心隐喻，画出它字面上的景象，让风格一眼可辨。"
        if short
        else ""
    )
    return f"""一张 16:9 的电影感单帧画面，用来展示「{entry['name']}」这种视觉风格（{entry['category']}）。
风格参考：
{body}{hint}

画面要求：
- 画一个具体的场景或主体（人物、器物、风景任选其一），构图完整，光线明确；主体要清晰可辨、占画面足够比例，不要小到只剩一个点；
- 颜色、质感、笔触、版式严格贴合上面的风格说明，让人一眼认出是这个风格；
- 单帧截图：不要拼图、多宫格、边框、界面截图、水印或签名；
- 不要画任何已有的影视、动漫、游戏角色（超级英雄、马里奥、皮卡丘、米老鼠等），也不要出现可识别的品牌标志；需要人物时画原创角色；
- 画面里不要出现文字、字幕、数字或 logo；如果这个风格本身依赖文字排版，最多用 2 个不同的简短英文单词，字母必须正确清晰，同一个词不要重复出现，不要中文和长句。"""


def http_json(url: str, body: dict, key: str, timeout: int = 240) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def generate(prompt: str, key: str, retries: int = 5) -> str:
    """返回图片 URL；对限流与网关错误做退避重试。"""
    body = {
        "model": MODEL,
        "prompt": prompt,
        "size": "2K",
        "ratio": "16:9",
        "output_format": "jpeg",
        "watermark": False,
        "sequential_image_generation": "disabled",
        "response_format": "url",
    }
    last: Exception | None = None
    for attempt in range(retries):
        try:
            data = http_json(f"{API_BASE}/images/generations", body, key)
            items = data.get("data") or []
            if not items or not items[0].get("url"):
                raise RuntimeError(f"返回里没有图片：{str(data)[:160]}")
            return items[0]["url"]
        except urllib.error.HTTPError as error:
            last = error
            if error.code not in (429, 500, 502, 503, 504):
                detail = error.read().decode("utf-8", "ignore")[:200]
                raise RuntimeError(f"HTTP {error.code}：{detail}") from error
            time.sleep(min(30, 3 * 2**attempt) + 1)
        except Exception as error:  # noqa: BLE001 - 网络抖动同样重试
            last = error
            time.sleep(min(20, 2 * 2**attempt) + 1)
    raise RuntimeError(f"重试 {retries} 次仍失败：{last}")


def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as response:
        return response.read()


def save_poster(data: bytes, code: str) -> None:
    image = Image.open(io.BytesIO(data)).convert("RGB")
    ratio = POSTER_WIDTH / POSTER_HEIGHT
    width, height = image.size
    if width / height > ratio:
        new_width = round(height * ratio)
        left = (width - new_width) // 2
        image = image.crop((left, 0, left + new_width, height))
    elif width / height < ratio:
        new_height = round(width / ratio)
        top = (height - new_height) // 2
        image = image.crop((0, top, width, top + new_height))
    image = image.resize((POSTER_WIDTH, POSTER_HEIGHT), Image.LANCZOS)
    POSTER_DIR.mkdir(parents=True, exist_ok=True)
    image.save(
        POSTER_DIR / f"{code.lower()}.jpg",
        format="JPEG",
        quality=82,
        optimize=True,
        progressive=True,
    )


def load_manifest() -> dict:
    for path in (MANIFEST, LEGACY_MANIFEST):
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
    return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="", help="只处理这些编号，逗号分隔，例如 K4,Z1")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--force", action="store_true", help="已有图片也重新生成")
    parser.add_argument("--dry-run", action="store_true", help="只打印提示词")
    args = parser.parse_args()

    entries = read_entries()
    if args.only:
        wanted = {item.strip().upper() for item in args.only.split(",") if item.strip()}
        entries = [entry for entry in entries if entry["code"].upper() in wanted]
    print(f"待生成 {len(entries)} 条")

    if args.dry_run:
        for entry in entries[:5]:
            print("=" * 30, entry["code"], entry["name"])
            print(build_prompt(entry))
        return 0

    key = os.environ.get("AIPING_API_KEY", "").strip()
    if not key:
        raise SystemExit("缺少 AIPING_API_KEY")

    IMAGES.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    todo = [
        entry
        for entry in entries
        if args.force
        or not (POSTER_DIR / f"{entry['code'].lower()}.jpg").exists()
        or entry["code"].lower() not in manifest
    ]
    print(f"其中需要调用模型 {len(todo)} 条")

    def work(entry: dict) -> tuple[str, str]:
        prompt = build_prompt(entry)
        url = generate(prompt, key)
        data = download(url)
        (IMAGES / f"{entry['code'].lower()}.jpg").write_bytes(data)
        save_poster(data, entry["code"])
        manifest[entry["code"].lower()] = {
            "code": entry["code"],
            "name": entry["name"],
            "prompt": prompt,
            "url": url,
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        return entry["code"], "ok"

    if not todo:
        print("没有需要生成的条目")
        return 0

    failures: list[tuple[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(work, entry): entry for entry in todo}
        for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            entry = futures[future]
            try:
                code, state = future.result()
            except Exception as error:  # noqa: BLE001
                code, state = entry["code"], f"失败：{error}"
                failures.append((code, str(error)))
            print(f"[{index}/{len(todo)}] {code} · {state}", flush=True)
            payload = json.dumps(manifest, ensure_ascii=False, indent=1)
            MANIFEST.parent.mkdir(parents=True, exist_ok=True)
            MANIFEST.write_text(payload, encoding="utf-8")

    print(f"完成 {len(todo) - len(failures)} 条，失败 {len(failures)} 条")
    for code, detail in failures:
        print(f"  - {code}: {detail}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
