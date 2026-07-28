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

## 从错误中吸取的教训

### Brakeman 安全扫描

- `params.permit(:role, :model_level, ...)` 属于危险的大规模赋值漏洞，攻击者可伪造请求提权。
- 敏感字段（角色、权限等级）不能放在 `user_params` 里，要在 `create` action 中显式赋值。
- 新建用户的 `role` 永远从代码设为 `"user"`，`model_level` 设为最低权限 `4`。管理员有专门的 `update_level` 端点来改权限。

### RuboCop 数组空格

- `["管理员已存在"]` 会被 RuboCop 的 `Layout/SpaceInsideArrayLiteralBrackets` 报错，需要写成 `[ "管理员已存在" ]`。
- 本地跑 `bin/rubocop` 就能在提交前发现，不要在 CI 才暴露。

### 前端资源路径

**Rails 本地开发模式（Rails 直接托管静态文件）：**
- 前端构建产物放 `public/` 根目录时，`index.html` 引用的 `/assets/xxx.js` 才能被 Rails 正确托管。
- 如果放在 `public/frontend/` 子目录，JS/CSS 会 404，因为 HTML 里的路径是 `/assets/xxx` 而非 `/frontend/assets/xxx`。

**生产环境 nginx 部署（通过 `deploy/publish.sh`）：**
- 构建产物通过 `rsync -a frontend/dist/ /var/www/badge-generator/` 发布到 nginx 站点目录。
- nginx 在 8080 端口直接托管 `/var/www/badge-generator/` 下的所有文件（包括 `index.html` 和 `/assets/` 子目录）。
- 前端构建工具（如 Vite）生成的 `dist/` 结构必须保持 `index.html` 和 `assets/` 在同一层级，否则资源引用会失败。

### Turbo 确认弹窗

- `button_to data: { confirm: "..." }` 在 Turbo 环境下无效，需要用 `data: { turbo_confirm: "..." }`。
- 同理，`DOMContentLoaded` 事件在 Turbo Drive 导航时不会重新触发，需要用 `turbo:load` 事件。

### ERB 中 case/when

- ERB 模板中 `case/when` 跨多个 `<% %>` 标签会导致解析错误，必须用 `if/elsif/else` 或内联 hash 查询替代。

### CodeMirror setValue 触发 change

- CodeMirror 的 `setValue()` 会触发 `change` 事件，导致编辑器上的 `on("change")` 回调误判为脏数据。
- 需要用 `suppressChange` 标志在同步期间忽略 change 事件。

### 模型配置 model 键名

- `config/models.json` 里存的是 `"model"` 键，但 HTML 表单的 name 是 `model_name`（Rails 的 params permit 要求）。
- `fillRow` 从 JSON 读数据时要用 `field === "model_name" ? m.model : m[field]` 做映射，否则提交时 model 字段为空。

## 已知风险

`cards` 的 index/show 无任何鉴权，任何访问者可看到所有记录。仅限本地开发，对外暴露前必须补访问控制。
