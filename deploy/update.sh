#!/usr/bin/env bash
# 从 main 拉取最新代码，构建前端，重启后端。
# 用法：./deploy/update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="/var/www/badge-generator"
PIDFILE="$ROOT/tmp/pids/puma.pid"

echo "==> 1/6 拉取最新代码"
git -C "$ROOT" checkout main
git -C "$ROOT" pull origin main

echo "==> 2/6 安装 Ruby 依赖"
cd "$ROOT"
bundle install

echo "==> 3/6 数据库迁移"
bin/rails db:migrate

echo "==> 4/6 构建前端"
cd "$ROOT/frontend"
npm install --legacy-peer-deps
npm run build

echo "==> 5/6 发布前端到 nginx"
rsync -a --delete "$ROOT/frontend/dist/" "$TARGET/"
su -c "chown -R www-data:www-data $TARGET"

echo "==> 6/6 重启 Rails 后端"
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
  sleep 2
fi
cd "$ROOT"
PIDFILE="$PIDFILE" bin/rails s -p 8000 -b 127.0.0.1 -d

echo "==>  ✓ 更新完成，访问 http://$(hostname -I | awk '{print $1}')/"
