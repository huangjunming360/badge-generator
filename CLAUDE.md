# Badge Generator 项目约定

## 提交与分支

加完一个小功能就 commit 并推送到 `dev`，不要攒一大堆改动再一次性提交。

- 日常工作以 `dev` 为基准，功能提交直接推 `dev`
- `master` / `main` 是稳定分支，禁止直接 push，只通过 PR 从 `dev` 合入
- commit message 用中文，遵循 `feat:` / `fix:` / `docs:` / `chore:` / `style:` 前缀

## 提交前必须验证

```bash
bin/rails test    # 全部通过
bin/rubocop       # 无 offense
```

两者任一不通过就不提交。

## LLM 调用

统一走 `LlmService.new(function: :xxx)`，模型配置集中在 `config/llm.yml` 的 `functions` 段。
`AnthropicClient` 已 DEPRECATED，新代码不要用。

代码里只出现用途名，不出现具体模型名。换模型只改 YAML，不改 Ruby。

## 启动

```bash
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1
```

必须显式指定 `PIDFILE`，否则 Rails 会误判系统的 `/run/tat_agent.pid` 而拒绝启动。

## 不要动的文件

`.env`、`config/master.key`、`storage/` 含密钥和本地开发数据，均已 gitignore，不要提交也不要删。

## 已知风险

`cards` 的 index/show 无任何鉴权，任何访问者可看到所有记录。仅限本地开发，对外暴露前必须补访问控制。
