#!/bin/zsh

# OneStep 本地启动脚本
# 首次运行会自动准备 Node.js、安装依赖并构建前端，然后打开本地页面。

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

NODE_VERSION="22.12.0"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
CACHE_DIR="$RUNTIME_DIR/cache"

pause_on_error() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    echo
    echo "OneStep 启动失败（退出码 $exit_code）。"
    echo "按回车关闭窗口。"
    read -r _
  fi
}
trap pause_on_error EXIT

node_version_ok() {
  local raw_version="$1"
  local version="${raw_version#v}"
  local major="${version%%.*}"
  local rest="${version#*.}"
  local minor="${rest%%.*}"

  if ! [[ "$major" =~ '^[0-9]+$' ]] || ! [[ "$minor" =~ '^[0-9]+$' ]]; then
    return 1
  fi

  if (( major == 20 && minor >= 19 )); then
    return 0
  fi

  if (( major == 22 && minor >= 12 )); then
    return 0
  fi

  if (( major > 22 )); then
    return 0
  fi

  return 1
}

current_runtime_ok() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    return 1
  fi
  node_version_ok "$(node -v 2>/dev/null || true)"
}

install_local_node() {
  local machine_arch
  local node_arch
  local node_dist
  local node_dir
  local tarball
  local checksums
  local expected_hash
  local actual_hash

  machine_arch="$(uname -m)"
  case "$machine_arch" in
    arm64)
      node_arch="arm64"
      ;;
    x86_64)
      node_arch="x64"
      ;;
    *)
      echo "暂不支持当前 macOS 架构：$machine_arch"
      exit 1
      ;;
  esac

  node_dist="node-v$NODE_VERSION-darwin-$node_arch"
  node_dir="$RUNTIME_DIR/$node_dist"
  tarball="$CACHE_DIR/$node_dist.tar.gz"
  checksums="$CACHE_DIR/SHASUMS256-$NODE_VERSION.txt"

  echo "正在下载 Node.js v$NODE_VERSION（macOS $node_arch）…"
  mkdir -p "$CACHE_DIR"
  curl --fail --location --output "$tarball" "https://nodejs.org/dist/v$NODE_VERSION/$node_dist.tar.gz"
  curl --fail --location --output "$checksums" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"

  expected_hash="$(awk -v file="$node_dist.tar.gz" '$2 == file { print $1 }' "$checksums")"
  actual_hash="$(shasum -a 256 "$tarball" | awk '{ print $1 }')"

  if [ -z "$expected_hash" ] || [ "$expected_hash" != "$actual_hash" ]; then
    echo "Node.js 下载校验失败。"
    exit 1
  fi

  rm -rf "$node_dir"
  tar -xzf "$tarball" -C "$RUNTIME_DIR"
  export PATH="$node_dir/bin:$PATH"
}

ensure_node() {
  local machine_arch
  local node_arch
  local node_dist
  local node_dir

  machine_arch="$(uname -m)"
  case "$machine_arch" in
    arm64)
      node_arch="arm64"
      ;;
    x86_64)
      node_arch="x64"
      ;;
    *)
      node_arch=""
      ;;
  esac

  if [ -n "$node_arch" ]; then
    node_dist="node-v$NODE_VERSION-darwin-$node_arch"
    node_dir="$RUNTIME_DIR/$node_dist"
    if [ -x "$node_dir/bin/node" ]; then
      export PATH="$node_dir/bin:$PATH"
      if current_runtime_ok; then
        echo "使用项目内置 Node.js $(node -v)。"
        return
      fi
    fi
  fi

  if current_runtime_ok; then
    echo "使用系统 Node.js $(node -v)。"
    return
  fi

  install_local_node

  if ! current_runtime_ok; then
    echo "需要 Node.js v20.19+ 或 v22.12+（包含 npm）。"
    exit 1
  fi

  echo "使用项目内置 Node.js $(node -v)。"
}

ensure_env_file() {
  if [ -f ".env" ]; then
    return
  fi

  if [ -f ".env.example" ]; then
    cp ".env.example" ".env"
  else
    {
      echo "VITE_APP_NAME=OneStep"
      echo "VITE_APP_VERSION=1.0.0"
      echo "VITE_API_BASE_URL=/api/v1"
      echo "VITE_API_DOCS_URL=https://aiping.cn/docs"
    } > ".env"
  fi

  echo "已创建 .env。"
}

install_dependencies() {
  if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    if [ ! "package.json" -nt "node_modules/.package-lock.json" ]; then
      return
    fi
  fi

  echo "正在安装依赖…"
  if [ -f "package-lock.json" ]; then
    npm ci || npm install
  else
    npm install
  fi
}

build_if_needed() {
  if [ ! -f "dist/index.html" ]; then
    echo "正在构建 OneStep…"
    npm run build
    return
  fi

  local newer
  newer="$(find src public index.html package.json vite.config.ts -newer dist/index.html -print -quit 2>/dev/null || true)"
  if [ -n "$newer" ]; then
    echo "检测到源码更新，正在重新构建…"
    npm run build
  fi
}

echo "正在启动 OneStep…"
ensure_node
ensure_env_file
install_dependencies
build_if_needed

APP_PORT="${ONESTEP_PORT:-5500}"
echo
echo "本地地址：http://127.0.0.1:$APP_PORT"
echo "关闭此窗口或按 Ctrl+C 即可停止 OneStep。"
echo

exec node server/local/server.mjs --port "$APP_PORT"
