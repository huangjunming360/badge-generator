#!/usr/bin/env bash
# 构建前端并发布到 nginx 的站点目录。
#
# 不让 nginx 直读 frontend/dist：nginx 以 www-data 运行，
# 而 /home/ubuntu 默认权限 0750（Ubuntu 有意隔离家目录），
# 放宽它的影响面超出本项目。发布到 /var/www 只需一次目录授权。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="/var/www/badge-generator"

if [ ! -d "$TARGET" ]; then
  echo "站点目录不存在，请先执行一次："
  echo "  sudo mkdir -p $TARGET"
  echo "  sudo chown ubuntu:www-data $TARGET && sudo chmod 750 $TARGET"
  exit 1
fi

echo "==> 构建前端"
cd "$ROOT/frontend"
npm run build

echo "==> 发布到 $TARGET"
# --delete 清掉上一次构建的旧哈希文件，避免站点目录无限膨胀。
# --no-group 不要把源文件的属组（ubuntu）同步过来，
# 否则会覆盖掉目标目录的 www-data 属组，nginx 又读不到了。
rsync -a --delete --no-group "$ROOT/frontend/dist/" "$TARGET/"

# nginx 靠属组读文件：目录要 x 才能进，文件要 r 才能读。
sudo chgrp -R www-data "$TARGET"
find "$TARGET" -type d -exec chmod 750 {} +
find "$TARGET" -type f -exec chmod 640 {} +

echo "==> 完成。前端 http://127.0.0.1:8080/"
