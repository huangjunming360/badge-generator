# 部署说明

前后端分离：前端静态产物由 nginx 托管，`/api` 反代给 Rails。两者同源，无需 CORS。

```
浏览器 → nginx :8080 ┬─ /            → /var/www/badge-generator（前端）
                     ├─ /api/        → Rails :8000
                     └─ /rails/active_storage/ → Rails :8000（证件照）
```

## 首次安装

```bash
sudo apt-get install -y nginx

# 站点目录：ubuntu 写入，www-data 读取
sudo mkdir -p /var/www/badge-generator
sudo chown ubuntu:www-data /var/www/badge-generator
sudo chmod 750 /var/www/badge-generator

sudo ln -sf /home/ubuntu/newapp/deploy/nginx/badge-generator.conf \
            /etc/nginx/sites-enabled/badge-generator.conf
sudo nginx -t && sudo systemctl reload nginx
```

nginx 不直读 `frontend/dist`：它以 `www-data` 运行，而 `/home/ubuntu` 默认权限
`0750`（Ubuntu 有意用它隔离家目录）。发布到 `/var/www` 只需一次目录授权，
不用放宽家目录权限。

## 日常发布

```bash
./deploy/publish.sh        # 构建 + 发布 + 修属组权限
```

`publish.sh` 里 `rsync` 必须带 `--no-group`，否则会把源文件的 `ubuntu` 属组
同步过去，覆盖掉目标目录的 `www-data` 属组，nginx 就又读不到了。

## 启动后端

```bash
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1
```

必须显式指定 `PIDFILE`，否则 Rails 会误判系统的 `/run/tat_agent.pid` 而拒绝启动。

## 开发模式

```bash
cd frontend && npm run dev    # :5173，/api 已配 proxy 转 :8000
```

## 安全边界

nginx 只监听 `127.0.0.1:8080`，本机或 SSH 隧道访问。

**对外暴露前必须先补鉴权。** `/api/v1/cards` 目前没有任何访问控制，任何请求方
都能拉取全部记录，含原始简历文本与证件照 URL。JSON API 把这个暴露面从
"需要打开页面"扩大到"可脚本化批量抓取"。
