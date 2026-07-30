#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/tmp/pids/puma.pid"

if [ -f "$PIDFILE" ]; then
  echo "→ 停止旧进程..."
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
  sleep 1
fi

echo "→ 启动新进程..."
cd "$ROOT"
PIDFILE="$PIDFILE" bin/rails s -p 8000 -b 127.0.0.1 -d
echo "✓ Rails 已重启 (port 8000)"
