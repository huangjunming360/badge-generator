#!/usr/bin/env bash
# 从 main 拉取最新代码，构建前端，重启后端。
# 安全：拉取前检查未提交文件，拉取后检查冲突，失败就回滚。
#
# 用法：cd /root/newapp && bash deploy/update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="/var/www/badge-generator"
PIDFILE="$ROOT/tmp/pids/puma.pid"

echo "=========================================="
echo "  Badge Generator 部署更新"
echo "=========================================="

# ─── 1. 安全检查 ─────────────────────────────────

echo ""
echo "==> [1/8] 检查本地是否有未提交的修改"
if ! git -C "$ROOT" diff --quiet --exit-code; then
  echo "  ⚠ 有未提交的修改，先 stash："
  git -C "$ROOT" stash push -m "deploy-autostash-$(date +%Y%m%d%H%M%S)"
  STASHED=true
else
  STASHED=false
fi

# ─── 2. 拉取 ─────────────────────────────────────

echo ""
echo "==> [2/8] 切换到 main 并拉取最新代码"
git -C "$ROOT" checkout main
if ! git -C "$ROOT" pull origin main; then
  echo "  ✗ git pull 失败，可能是冲突。回滚到之前的版本。"
  git -C "$ROOT" checkout main
  git -C "$ROOT" reset --hard ORIG_HEAD
  exit 1
fi

# ─── 3. 还原 stash ──────────────────────────────

if [ "$STASHED" = true ]; then
  echo ""
  echo "==> [3/8] 还原本地未提交的修改"
  git -C "$ROOT" stash pop || echo "  ⚠ stash pop 失败（可能冲突），修改仍在 stash 中"
fi

# ─── 4. 安装 Ruby 依赖 ──────────────────────────

echo ""
echo "==> [4/8] 安装 Ruby 依赖"
cd "$ROOT"
bundle install

# ─── 5. 数据库迁移 ──────────────────────────────

echo ""
echo "==> [5/8] 数据库迁移"
bin/rails db:migrate

# ─── 6. 前端构建 ────────────────────────────────

echo ""
echo "==> [6/8] 构建前端"
cd "$ROOT/frontend"
npm install --legacy-peer-deps
npm run build

# ─── 7. 发布到 nginx ────────────────────────────

echo ""
echo "==> [7/8] 发布前端到 nginx"
# 清理旧的 Rails public 构建产物
rm -rf "$ROOT/public/assets"
# 编译 Rails admin CSS
cd "$ROOT"
RAILS_ENV=development bin/rails assets:precompile 2>/dev/null || echo "  ⚠ assets:precompile 跳过（可能缺 models.json）"
# 前端静态文件
rsync -a --delete "$ROOT/frontend/dist/" "$TARGET/"
# admin CSS 等 Rails 静态资源
if [ -d "$ROOT/public/assets" ]; then
  cp -r "$ROOT/public/assets/" "$TARGET/assets_rails/"
fi
su -c "chown -R www-data:www-data $TARGET"

# ─── 8. 重启后端 ────────────────────────────────

echo ""
echo "==> [8/8] 重启 Rails 后端"
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE")
  kill "$OLD_PID" 2>/dev/null || true
  echo "  停止旧进程 PID=$OLD_PID"
  sleep 2
fi
cd "$ROOT"
PIDFILE="$PIDFILE" bin/rails s -p 8000 -b 127.0.0.1 -d
NEW_PID=$(cat "$PIDFILE" 2>/dev/null || echo "?")
echo "  新进程 PID=$NEW_PID"

# ─── 完成 ────────────────────────────────────────

IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "服务器")
echo ""
echo "=========================================="
echo "  ✓ 更新完成"
echo "  http://$IP/"
echo "  http://$IP/admin"
echo "=========================================="
