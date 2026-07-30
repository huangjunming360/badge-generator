#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1 -d
mkdir -p tmp/pids log
nohup env TEMPLATE_GENERATION_POLL_SECONDS=2 bin/rails template_generation:worker > log/template-generation-worker.log 2>&1 < /dev/null &
echo $! > tmp/pids/template-generation-worker.pid
echo "✓ Rails 已启动 (port 8000)"
echo "✓ 模板生成 worker 已启动"
