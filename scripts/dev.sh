#!/usr/bin/env bash
# scripts/dev.sh — 一键启动后端 + 前端开发环境
#
# 用法: bash scripts/dev.sh [--port <port>]
#
# 流程:
#   1. 清理旧端口文件
#   2. 后台启动 Python 后端（写 .backend-port）
#   3. 等待端口文件出现
#   4. 启动 Vite 前端（读取 .backend-port 配置 proxy）
#   5. 退出时自动清理后端进程和端口文件
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
PORT_FILE="$FRONTEND_DIR/.backend-port"
BACKEND_PID=""

# --- 清理 ---
cleanup() {
    echo ""
    if [ -n "$BACKEND_PID" ]; then
        echo "Stopping backend (PID $BACKEND_PID)..."
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    rm -f "$PORT_FILE"
    echo "Cleaned up."
}
trap cleanup EXIT INT TERM

# --- 参数 ---
PORT_FLAG=""
if [ "${1:-}" = "--port" ] && [ -n "${2:-}" ]; then
    PORT_FLAG="--port $2"
fi

# --- 清理旧文件 ---
rm -f "$PORT_FILE"

# --- 启动后端 ---
echo "Starting backend..."
cd "$BACKEND_DIR"
python -m src.cli serve $PORT_FLAG &
BACKEND_PID=$!

# --- 等待端口文件 ---
echo "Waiting for backend..."
for i in $(seq 1 30); do
    if [ -f "$PORT_FILE" ]; then
        break
    fi
    sleep 1
done

if [ ! -f "$PORT_FILE" ]; then
    echo "ERROR: Backend failed to start within 30s"
    exit 1
fi

PORT=$(cat "$PORT_FILE")
echo "Backend ready on port $PORT"

# --- 启动前端 ---
echo "Starting frontend..."
cd "$FRONTEND_DIR"
npx vite
