#!/usr/bin/env bash
# 从指定分支安全拉取最新代码，更新依赖和数据库，构建前端。
# ⚠ 不自动发版到 nginx。
#
# 用法：
#   bash deploy/update.sh              # 默认 main
#   bash deploy/update.sh dev          # 指定分支
#   bash deploy/update.sh beta         # 指定分支
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-main}"

echo "=========================================="
echo "  Badge Generator 代码更新"
echo "  分支: $BRANCH"
echo "=========================================="
echo ""

# ─── 1. 安全检查 ─────────────────────────────────

echo "==> [1/6] 检查本地修改"
if ! git -C "$ROOT" diff --quiet --exit-code; then
  echo "  有未提交的修改，暂时 stash……"
  git -C "$ROOT" stash push -m "deploy-$(date +%Y%m%d%H%M%S)"
  STASHED=true
else
  STASHED=false
fi

# ─── 2. 拉取 ─────────────────────────────────────

echo ""
echo "==> [2/6] git fetch && git checkout $BRANCH && git pull origin $BRANCH"

# 先 fetch 确保远程分支信息最新
git -C "$ROOT" fetch origin

# 检查本地分支是否存在
if ! git -C "$ROOT" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  # 本地分支不存在，尝试从远程创建
  if git -C "$ROOT" rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    echo "  本地分支不存在，从 origin/$BRANCH 创建..."
    git -C "$ROOT" checkout -b "$BRANCH" "origin/$BRANCH"
  else
    echo "  ✗ 分支 $BRANCH 在本地和远程都不存在"
    exit 1
  fi
else
  # 本地分支存在，正常 checkout
  git -C "$ROOT" checkout "$BRANCH"
fi

# 拉取最新代码
if ! git -C "$ROOT" pull origin "$BRANCH"; then
  echo ""
  echo "  ✗ git pull 失败，自动回滚。"
  git -C "$ROOT" reset --hard ORIG_HEAD
  exit 1
fi

# ─── 3. 还原 stash ──────────────────────────────

if [ "$STASHED" = true ]; then
  echo ""
  echo "==> [3/6] 还原本地修改"
  git -C "$ROOT" stash pop || echo "  ⚠ stash pop 冲突，修改仍在 stash 中"
fi

# ─── 4. Ruby 依赖 ────────────────────────────────

echo ""
echo "==> [4/6] bundle install"
cd "$ROOT"
bundle install

# ─── 5. 数据库迁移 ──────────────────────────────

echo ""
echo "==> [5/6] 数据库迁移"
bin/rails db:migrate

# ─── 6. 前端构建 ────────────────────────────────

echo ""
echo "==> [6/6] 构建前端"
cd "$ROOT/frontend"
npm install --legacy-peer-deps
npm run build

# ─── 完成 ────────────────────────────────────────

echo ""
echo "=========================================="
echo "  ✓ 代码更新完成"
echo ""
echo "  还剩一步：手动发版到 nginx"
echo "  ------------------------------"
echo "  rsync -a --delete frontend/dist/ /var/www/badge-generator/"
echo "  su -c \"chown -R www-data:www-data /var/www/badge-generator\""
echo ""
echo "  如果需要重启 Rails："
echo "  ------------------------------"
echo "  kill \$(cat tmp/pids/puma.pid)"
echo "  PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1 -d"
echo "=========================================="
