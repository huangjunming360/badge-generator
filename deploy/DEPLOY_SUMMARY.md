# 部署踩坑记录 & 改进方案

> 2026-07-30 首次部署到 Ubuntu 服务器（root + deploy 用户混合模式）

---

## 一、踩坑全记录

### 0. 环境

| 项目 | 值 |
|------|-----|
| 服务器 | Ubuntu (内网) |
| Web 服务器 | nginx |
| Ruby | 4.0.6 (rbenv) |
| Rails | 8.1.3 → 8.1.3.1 |
| Node | 24.18.1 (nvm) |
| 运行用户 | root（系统）+ deploy（应用） |
| 代码位置 | `/root/newapp` |
| nginx 站点目录 | `/var/www/badge-generator` |

### 1. 用户隔离问题

- `/root` 目录默认权限 `700`，deploy 用户无法 `cd /root/newapp`
- **解决**：`chmod +rx /root`（最简单）或把代码搬到 `/home/deploy/` 下
- 若要新建部署用户：`useradd -r -s /bin/false -m deploy`

### 2. nginx 配置问题

- **软链接指错路径**：链接到了 `/home/ubuntu/newapp/...`，实际代码在 `/root/newapp/`
- **默认站点冲突**：`/etc/nginx/sites-enabled/default` 占了 80 端口，自己的配置不生效
- **缺少 `/admin` 反代**：只配了 `/api/` 反代，访问 `/admin` 返回 404
- **解决**：修正软链接 + `rm default` + 配置加 `location /admin/`

### 3. Rails 后端启动问题

- **`activestorage 8.1.3` 有 CVE-2026-66066**（libvips 任意文件读取漏洞）
  - 修复版 `8.1.3.1`
  - 需要 `ruby-vips` gem 和 libvips 系统库（`apt install libvips-dev`）
- **`ruby-vips` 版本冲突**：`Gemfile` 中通过不同依赖间接声明了两个版本
  - 解决：保留 `~> 2.3`，删掉重复的 `~> 2.0`
- **`config/models.json` 缺失**：服务器上无此文件，`assets:precompile` 和首次 LLM 调用均失败
- **`openai_use_system_role` 未传递**：初始化设了 `true`，但 `LlmService#configure_provider!` 重新配置时没带这个参数，导致豆包 API 收到 `developer` role 报错

### 4. 前端构建问题

- **npm registry 指向腾讯内网镜像**（`mirrors.tencentyun.com`），该地址不通
  - 但 `npm config list` 显示的是 `registry.npmjs.org`——实际是 `package-lock.json` 里锁了腾讯源的 `resolved` URL
  - 解决：删除 `package-lock.json` 重新 install
- **`@tailwindcss/vite@4.1.12` 不兼容 Vite 8**：peer dependency 只到 v7
  - 解决：`npm install --legacy-peer-deps`
- **`react-router` 升级后不兼容**：`npm audit fix --force` 升到 v8，但 v8 依赖 React 19，项目用 React 18
  - 报错：`useOptimistic is not a function`
  - 解决：锁回 `react-router@7.18.1`
- **`tsc` 找不到**：前端依赖未安装（`npm install`）

### 5. nginx 静态资源问题

- **`/assets/` 指向 React 静态目录**，但 admin 页面的 CSS 是 Rails 编译的 Tailwind（在 `public/assets/` 下）
  - 解决：`rails assets:precompile` 生成 Rails CSS，或 `/assets/` 反代给 Rails
- **admin 页面 "1960 风格"**：原因同上，CSS 没加载

### 6. 运维问题

- **deploy 用户不能 sudo**：`su -c` 需要 root 密码，不适合脚本自动化
- **没有 systemd service**：服务器重启后需要手动启动 Puma
- **`publish.sh` 过时**：写死了 `/home/ubuntu/` 和 `sudo`，不适合当前环境

---

## 二、改进方案

### P0 — 马上可做的

| 问题 | 改进 |
|------|------|
| tesseract-ocr 未安装 | 上线前 `apt install -y tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-chi-tra` |
| 每次部署要手动找命令 | ✅ 已写好 `deploy/update.sh`（安全拉取 + 构建，nginx 相关让用户手动） |
| 前端 `--legacy-peer-deps` 烦人 | 在 `frontend/.npmrc` 里写入 `legacy-peer-deps=true`，以后免参数 |
| `publish.sh` 过时 | 更新为用当前路径 + `su -c` |
| npm lock 文件写死腾讯源 | 确保用 npmjs.org 生成新 lock，提交到仓库，避免服务器删 lock 重装 |

### P1 — 建议做

| 问题 | 改进 |
|------|------|
| 代码在 `/root/` 下 | 建议搬到 `/opt/newapp/` 或 `/srv/newapp/`，避免 `chmod +rx /root` 的安全风险 |
| Puma 无守护进程 | 写一个 systemd service：开机自启、崩溃自愈、日志统一管理 |
| `config/models.json` 每次要手动传 | 加到部署脚本里自动从 CI 或 git-secret 同步 |
| admin CSS 每次都忘编译 | 给 `deploy/publish.sh` 加上 `assets:precompile` |

### P2 — 长远看

| 问题 | 改进 |
|------|------|
| 前端 Vite 8 + Tailwind v4 不兼容 | 等 `@tailwindcss/vite` 发布支持 Vite 8 的版本后去掉 `--legacy-peer-deps` |
| 缺少 CI 自动部署 | GitHub Actions 合入 main 后自动 SSH 到服务器执行 `update.sh` |
| nginx 配置分散 | 考虑前端 nginx 配置也走 CI/CD 管理，不手动改服务器 |
| 数据库备份 | 添加定时任务 `cron` 自动备份 SQLite |

---

## 三、理想部署流程（目标）

```
                 GitHub                     服务器
              ┌──────────┐              ┌──────────────┐
 开发 → PR →  │   main   │──auto──deploy→│  /opt/newapp │
              │  (CI 跑   │              │  systemd     │
              │  test+    │              │  puma.service│
              │  rubocop) │              │  + nginx     │
              └──────────┘              └──────────────┘
                                              │
                                         nginx :80
                                              │
                                         ┌────┴────┐
                                         │ 用户浏览器│
                                         └─────────┘
```

当前 `update.sh` 实现了中间的"安全拉取 + 构建"部分，剩下的手动发版。
