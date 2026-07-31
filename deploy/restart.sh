#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/tmp/pids/puma.pid"

if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"
  echo "→ 停止旧进程 (PID $PID)..."

  # 验证 PID 是否属于 puma 进程
  if ps -p "$PID" -o comm= 2>/dev/null | grep -q puma; then
    kill "$PID" 2>/dev/null || true

    # 等待进程退出，最多 30 秒
    TIMEOUT=30
    ELAPSED=0
    while [ $ELAPSED -lt $TIMEOUT ]; do
      if ! ps -p "$PID" > /dev/null 2>&1; then
        echo "  进程已停止"
        rm -f "$PIDFILE"
        break
      fi
      sleep 1
      ELAPSED=$((ELAPSED + 1))
    done

    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo "  ⚠ 超时，进程可能仍在运行"
    fi
  else
    echo "  ⚠ PID 文件存在但进程不是 puma，清理无效 PID 文件"
    rm -f "$PIDFILE"
  fi
fi

echo "→ 启动新进程..."
cd "$ROOT"
PIDFILE="$PIDFILE" bin/rails s -p 8000 -b 127.0.0.1 -d
echo "✓ Rails 已重启 (port 8000)"
