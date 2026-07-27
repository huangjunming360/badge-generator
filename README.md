# newapp

https://github.com/huangjunming360/badge-generator

Rails 8 + SQLite 的名片/资料标准化应用。

## 环境

- Ruby 4.0.6（rbenv 管理）
- Rails 8.1.3
- SQLite 3
- Tailwind CSS 4

## 首次设置

```bash
cp .env.example .env          # 编辑填入 API Key
rbenv install 4.0.6           # 安装 Ruby（如未安装）
gem install bundler -v 4.0.16
bundle install
rails db:migrate
```

## 启动

```bash
rails s -p 8000               # http://localhost:8000
bin/dev                       # 同时跑 Tailwind watch（改样式时用）
```

## 分支与 PR 流程

- `master` — 稳定分支，禁止直接 push，只通过 PR 合入
- `dev`   — 开发分支，日常工作以它为基准

```bash
# 1. 从 dev 切出分支干活
git checkout dev
git checkout -b 你的分支名

# 2. 开发、提交、推送
git add .
git commit -m "feat: xxx"
git push origin 你的分支名

# 3. 在 GitHub 发 PR，target 选 dev

# 4. PR 合并后删掉自己的分支，没用了
git branch -d 你的分支名
git push origin --delete 你的分支名

# 5. 功能稳定后在 GitHub 发 PR：dev → master
```

## bin/ 目录说明

`bin/rails` 是 Rails 项目的入口。系统 `rails` 命令通过它来判断当前目录是否是 Rails 项目——找不到 `bin/rails` 时 `rails` 会退化为 `rails new`。

因此 `bin/` 必须保留、不能删除，且需提交到 git。

## 配置

密钥放项目根 `.env`（已 gitignore），参考 `.env.example`：

```
LLM_BASE_URL=https://api.aicodemirror.com/api/claudecode
LLM_MODEL=claude-sonnet-5
LLM_API_KEY=sk-ant-...
```

## 排错

- **`rails xxx` 总跳转到 `rails new` 帮助页**：说明当前目录缺少 `bin/rails`，`rails install` 重新生成的 binstubs 不对，需要写入 Rails 格式的 `bin/rails`。
- **Ruby 编译失败、ZJIT/YJIT 符号找不到**：检查 PATH 中是否有 Anaconda 的 `nm`（`/opt/anaconda3/bin/nm`），它会干扰链接器。编译前执行 `PATH="/usr/bin:/bin:/opt/homebrew/bin:$HOME/.rbenv/bin" rbenv install 4.0.6`。

## 实现要点

- 记忆：`Conversation#context_messages` 每次提问把该会话最近 40 条消息一起发给模型。
- 流式：`ReplyJob` 解析 Anthropic SSE，攒够 24 字节或 120ms 就用 Turbo Stream 替换气泡。
- 队列用默认的 `:async`（进程内线程池）。重启进程会丢掉正在生成的回复，生产环境需换 Solid Queue 或 Sidekiq。
- 目前没有登录鉴权，任何访问者都能看到并操作所有对话。仅限本地开发，对外暴露前必须加鉴权。
