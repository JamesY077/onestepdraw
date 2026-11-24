#!/usr/bin/env bash
# 把 build/icon.png（1024）转成 macOS 需要的 icon.icns。
# 只需要在换了图标之后跑一次：bash scripts/make-icon.sh
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="build/icon.png"
SET="build/icon.iconset"

if [ ! -f "$SRC" ]; then
  echo "缺少 $SRC" >&2
  exit 1
fi

rm -rf "$SET"
mkdir -p "$SET"

for size in 16 32 64 128 256 512 1024; do
  sips -z "$size" "$size" "$SRC" --out "$SET/icon_${size}x${size}.png" >/dev/null
done
# Retina 变体（icon_<n>x<n>@2x 对应 2 倍尺寸）
cp "$SET/icon_32x32.png" "$SET/icon_16x16@2x.png"
cp "$SET/icon_64x64.png" "$SET/icon_32x32@2x.png"
cp "$SET/icon_256x256.png" "$SET/icon_128x128@2x.png"
cp "$SET/icon_512x512.png" "$SET/icon_256x256@2x.png"
cp "$SET/icon_1024x1024.png" "$SET/icon_512x512@2x.png"

iconutil -c icns "$SET" -o build/icon.icns
rm -rf "$SET"
echo "已生成 build/icon.icns"
