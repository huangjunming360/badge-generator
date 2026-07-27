# newapp

Rails 8 + SQLite 的最简聊天应用。带对话记忆，回复逐字流式输出。

## 环境

- Ruby 4.0.6（rbenv 管理）
- Rails 8.1.3
- SQLite 3.37.2
- Tailwind CSS 4

## 启动

```bash
bin/rails s -p 8000        # http://localhost:8000
bin/dev                    # 同时跑 Tailwind watch（改样式时用）
```

## 配置

密钥放项目根 `.env`（已 gitignore），参考 `.env.example`：

```
LLM_BASE_URL=https://api.aicodemirror.com/api/claudecode
LLM_MODEL=claude-sonnet-5
LLM_API_KEY=sk-ant-...
```

## 实现要点

- 记忆：`Conversation#context_messages` 每次提问把该会话最近 40 条消息一起发给模型。
- 流式：`ReplyJob` 解析 Anthropic SSE，攒够 24 字节或 120ms 就用 Turbo Stream 替换气泡。
- 队列用默认的 `:async`（进程内线程池）。重启进程会丢掉正在生成的回复，生产环境需换 Solid Queue 或 Sidekiq。
- 目前没有登录鉴权，任何访问者都能看到并操作所有对话。仅限本地开发，对外暴露前必须加鉴权。
