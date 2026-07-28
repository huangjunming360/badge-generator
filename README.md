# Badge Generator

名片/胸卡生成器。AI 提取资料 → 在线设计 → 打印挂牌。

## 环境

- Ruby 4.0.6（rbenv 管理）
- Rails 8.1.3
- SQLite 3
- Node.js 22（前端构建）
- tesseract 4.1.1（chi_sim + chi_tra + eng）、poppler-utils —— OCR 依赖

## 首次设置

```bash
# 1. Ruby
rbenv install 4.0.6
gem install bundler
bundle install

# 2. 数据库
rails db:create db:migrate db:seed     # 创建管理员: admin@example.com / admin123

# 3. 模型配置
cp config/models.example.json config/models.json
# 编辑 config/models.json 填入你的 API Key

# 4. 前端构建（可选，如果改了前端代码）
cd frontend && yarn install && yarn build
cp -r dist/* ../public/
cd ..
```

## 启动

```bash
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1
```

访问 http://localhost:8000

必须显式指定 `PIDFILE`，否则 Rails 会误判系统的 `/run/tat_agent.pid` 而拒绝启动。

## 架构

| 路径 | 用途 |
|------|------|
| `/` | React SPA（首页/设计/历史记录） |
| `/login` | 登录 |
| `/register` | 注册 |
| `/admin` | 管理后台（需管理员登录） |
| `/api/v1/*` | JSON API |

## 管理后台

管理员登录后右上角用户菜单 → 后台：

- **用户管理** — 创建/激活/封禁用户
- **权限管理** — 编辑权限等级名称与说明
- **通用设置** — 站点标题、开放注册、模型需登录
- **模型配置** — 可视化编辑或 JSON 编辑模型列表

## 模型配置

`config/models.json` 管理所有可用模型。可在管理后台在线编辑。

```json
{
  "default": "claude_haiku",
  "models": [
    { "id": "claude_haiku", "label": "Claude Haiku 4.5", "api": "anthropic", "model": "claude-haiku-4-5-20251001", "api_key": "sk-...", "api_base": "https://..." }
  ]
}
```

## 权限等级

数字越小权限越高。用户 `level ≤ 模型 level` 即可使用该模型。

| 等级 | 说明 |
|------|------|
| 0 最高 | 管理员专属，可用全部模型 |
| 1 高级 | 可用绝大多数模型 |
| 2 中级 | 可用中级及以下模型 |
| 3 普通 | 可用普通及开放模型 |
| 4 开放 | 仅可用开放模型 |

等级名称和说明可在后台「权限管理」自定义。

## 分支与 PR 流程

- `main` — 稳定分支，只通过 PR 合入
- `dev` — 开发分支

```bash
git checkout dev
git checkout -b 你的分支名
# 开发、提交
git add . && git commit -m "feat: xxx"
git push origin 你的分支名
# GitHub 发 PR → dev
```

## 支持的输入

文字直接粘贴，或上传文件：

| 格式 | 处理方式 |
|---|---|
| docx | `docx` gem，含表格 |
| pdf | `pdf-reader` 读文字层；扫描版自动转 OCR |
| xlsx / csv | `roo` |
| txt / md | 直接读取 |
| png / jpg / tif / bmp | tesseract OCR |

上限 10MB，抽出的文本截断到 2 万字。
