#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PIDFILE="tmp/pids/puma.pid"
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null && echo "✓ Rails 已停止" || echo "⚠ 进程不存在"
  rm -f "$PIDFILE"
else
  echo "⚠ Puma 没有在运行"
fi
