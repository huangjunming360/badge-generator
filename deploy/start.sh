#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1 -d
echo "✓ Rails 已启动 (port 8000)"
