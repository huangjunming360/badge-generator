#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PIDFILE="tmp/pids/puma.pid"
if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"

  # 验证 PID 是否属于 puma 进程
  if ps -p "$PID" -o comm= 2>/dev/null | grep -q puma; then
    if kill "$PID" 2>/dev/null; then
      echo "✓ Rails 已停止"
      rm -f "$PIDFILE"
    else
      echo "⚠ 无法停止进程 (PID $PID)"
    fi
  else
    echo "⚠ PID 文件存在但进程不是 puma"
    rm -f "$PIDFILE"
  fi
else
  echo "⚠ Puma 没有在运行"
fi
