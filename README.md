# Badge Generator

名片/胸卡生成器。AI 提取资料 → 在线设计 → 打印挂牌。

前后端分离：React SPA 通过 `/api/v1/*` JSON API 与 Rails 通信。
管理后台仍是 Rails ERB 页面，管理员专属。

## 环境

- Ruby 4.0.6（rbenv 管理）
- Rails 8.1.3
- SQLite 3
- Node.js 22（前端构建用）
- tesseract 4.1.1（chi_sim + chi_tra + eng）、poppler-utils —— OCR 依赖

## 首次设置

```bash
# 1. Ruby & gems
rbenv install 4.0.6
gem install bundler
bundle install

# 2. 数据库
rails db:create db:migrate db:seed
# 创建初始管理员: admin@example.com / admin123

# 3. 模型配置
cp config/models.example.json config/models.json
# 编辑 config/models.json 填入你的 API Key 和 AI 供应商信息

# 4. 前端构建
cd frontend && yarn install && yarn build
rm -rf ../public/assets
cp -r dist/assets ../public/
cp dist/index.html ../public/
cd ..

# 5. 启动
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1
```

打开 http://localhost:8000

> 必须显式指定 `PIDFILE`，否则 Rails 会误判系统的 `/run/tat_agent.pid` 而拒绝启动。

## 架构

| 路径 | 用途 | 鉴权 |
|------|------|------|
| `/` | React SPA 首页（资料输入 → AI 提取） | 无 |
| `/design` | React SPA 设计页（样式/配色/尺寸） | 需登录 |
| `/history` | React SPA 历史记录 | 需登录 |
| `/login` | React SPA 登录页 | 无 |
| `/register` | React SPA 注册页 | 无 |
| `/setup` | 初始管理员创建（无管理员时自动跳转） | 无 |
| `/admin` | Rails 管理后台 | 需管理员 |
| `/api/v1/schema` | 字段/尺寸/模型定义 | 无 |
| `/api/v1/cards` | 卡片 CRUD | 需登录 |
| `/api/v1/session` | 登录/登出/状态 | 创建无，其余需登录 |
| `/api/v1/setup` | 首次设置检查/创建管理员 | 无 |

### 前端部署

前端构建产物放在 `public/` 下由 Rails 直接托管。构建后需要：

```bash
cd frontend && yarn build
rm -rf ../public/assets
cp -r dist/assets ../public/
cp dist/index.html ../public/
```

Rails 的 catch-all 路由把 `/design`、`/history` 等 SPA 路径都指向 `public/index.html`。
`/admin`、`/api`、`/assets` 等路径不受 catch-all 影响。

## 管理后台

管理员登录后，点击右上角用户图标 → 管理后台。

| 页面 | 功能 |
|------|------|
| 后台首页 | 数据概览 |
| 用户管理 | 创建/激活/封禁/删除用户，设置权限等级 |
| 权限管理 | 自定义权限等级名称和说明 |
| 通用设置 | 站点标题、开放注册、模型使用需登录 |
| 模型配置 | 可视化编辑或 JSON 编辑模型列表 |

### 权限等级

数字越小权限越高。用户 `level ≤ 模型 level` 即可使用该模型。
等级名称和说明可在后台「权限管理」自定义。

默认等级：

| 等级 | 说明 |
|------|------|
| 0 最高 | 管理员专属，可用全部模型 |
| 1 高级 | 可用绝大多数模型 |
| 2 中级 | 可用中级及以下模型 |
| 3 普通 | 可用普通及开放模型 |
| 4 开放 | 仅可用开放模型 |

### 首次运行

如果数据库中没有管理员账号，所有页面会自动跳转到 `/setup`，
必须创建初始管理员后才能使用系统（`rails db:seed` 创建的 `admin@example.com` 也算）。

## 模型配置

模型列表由 `config/models.json` 管理，可在管理后台在线编辑。

```json
{
  "default": "deepseek_v4",
  "models": [
    {
      "id": "deepseek_v4",
      "label": "DeepSeek V4 Pro",
      "api": "anthropic",
      "model": "deepseek-v4-pro",
      "api_key": "sk-...",
      "api_base": "https://api.deepseek.com/anthropic",
      "level": 0
    }
  ]
}
```

api 支持 `anthropic`（Anthropic 兼容协议）和 `openai`（OpenAI 兼容协议）。
level 为权限等级，0=最高（管理员专属），4=开放（所有人可用）。

## 开发

### 同时改前端

```bash
# 终端 1：Rails 后端
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000

# 终端 2：Vite 开发服务器（热更新）
cd frontend && yarn dev
# Vite 在 :5173 启动，/api 自动代理到 Rails :8000
```

### 编码约定

- 加完一个小功能就 commit 到当前分支，不要攒一堆
- commit message 用中文，`feat:` / `fix:` / `docs:` / `chore:` 前缀
- 提交前 `bin/rails test` 和 `bin/rubocop` 必须通过

## 分支流程

```bash
git checkout dev
git checkout -b feat/xxx
# 开发...
git add . && git commit -m "feat: xxx"
git push origin feat/xxx
# GitHub 发 PR → dev
```

## 支持的输入

文字直接粘贴，或上传文件：

| 格式 | 处理方式 |
|---|---|
| docx | docx gem，含表格 |
| pdf | pdf-reader 读文字层；扫描版自动转 OCR |
| xlsx / csv | roo |
| txt / md | 直接读取 |
| png / jpg / tif / bmp | tesseract OCR |

上限 10MB，抽出的文本截断到 2 万字。

## 实现要点

- `DocumentTextExtractor` 只做"文件 → 纯文本"
- `CardExtractor` 只做"文本 → 标准化 JSON"
- OCR 用 `--psm 6`（单一文本块按行读）
- 固定 14 字段 schema
