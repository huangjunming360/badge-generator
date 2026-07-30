# Badge Generator 项目约定

## 提交与分支

加完一个小功能就 commit 并推送到 `dev`，不要攒一大堆改动再一次性提交。

- 日常工作以 `dev` 为基准，功能提交直接推 `dev`
- `master` / `main` 是稳定分支，禁止直接 push，只通过 PR 从 `dev` 合入
- commit message 用中文，遵循 `feat:` / `fix:` / `docs:` / `chore:` / `style:` 前缀

## 安全铁律（必须先读再写代码）

默认不信任任何请求、任何参数、任何用户。每写一行代码前过三遍：

### 第一遍：写之前

1. 这个 endpoint 需要登录吗？→ 加 `require_authentication`
2. 这个 endpoint 花钱吗？（LLM、存储、网络）→ 加 `rate_limit`
3. 这个数据属于哪个用户？→ 从 `Current.user` 出发

### 第二遍：写的时候

```
Current.user.resources.find(params[:id])   // ✅ 正确
Resource.find(params[:id])                  // ❌ 立即删除这行
```

新 endpoint 默认 `require_authentication`，公开访问是例外。
`allow_unauthenticated_access` / `skip_before_action` 必须有注释写明为什么。

### 第三遍：写完检查（三行清单）

| 类型 | 自查 |
|------|------|
| 数据隔离 | 所有 find/index 都 scope 在 `Current.user` 下吗？ |
| 创建归属 | new 用的 `Current.user.resources.new` 吗？不是 `Resource.new`？ |
| 速率限制 | 花钱的路径有 rate_limit 吗？ |
| 管理员操作用户 | user_params 里 permit 了 role / model_level / 敏感字段吗？ |
| 死代码 | 旧的 endpoint/controller 被取代后删了吗？ |

哪行答不上来就不提交。

## 提交前必须验证

```bash
bin/rails test    # 全部通过
bin/rubocop       # 无 offense
```

两者任一不通过就不提交。
Failing = 不提交。不提交。不提交。不。提。交。

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

## API 鉴权守则（必读）

### 原则

所有数据访问必须基于 `Current.user`。绝对不能用 `Model.all` / `Model.find` 无 scope 查询。

### 三必须检查清单

每条 API 端点写完后自查：

| 检查项 | 正确做法 | 错误例子 |
|--------|---------|---------|
| 数据隔离 | `Current.user.cards.find(params[:id])` | `Card.find(params[:id])` |
| 创建归属 | `Current.user.cards.new(...)` | `Card.new(...)` 不设 user |
| 列表 scope | `Current.user.cards.order(...)` | `Card.order(...)` |

### 速率限制

调用 LLM 的端点（建卡）必须加 `rate_limit`，防止 API Key 被盗刷：

```ruby
rate_limit to: 20, within: 1.minute, only: :create,
  with: -> { render json: { errors: ["请求过于频繁"] }, status: :too_many_requests }
```

### API 鉴权流程

```
Api::BaseController
  ├── skip_before_action :require_authentication  // 不用 redirect 方式
  ├── before_action :require_api_authentication   // 改为 JSON 401
  │
  └── 公开端点（如 schema, setup）加：
       skip_before_action :require_api_authentication, only: :show
```

### 管理员鉴权

```
Admin::BaseController
  ├── 检查 authenticated? → 否则弹 401
  ├── 检查 Current.user.admin? → 否则弹 alert 踢回首页
  ├── 检查 Current.user.banned? → terminate_session
  └── 检查 Current.user.active? → 否则拒绝
```

### 管理员创建用户

永远不要在 `user_params` 里 permit `:role` 或 `:model_level`：

```ruby
# 错误：攻击者可伪造请求提权
params.require(:user).permit(:email_address, :password, :role, :model_level)

# 正确：在 action 中显式赋值
@user.role = "user"
@user.model_level = 4
```

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

## 开发经验手册（踩坑记）

### 数据库与部署

- **SQLite 易损坏**。多次 kill -9 + 进程残留会导致 `database disk image is malformed`。务必用 `-d` 模式启动，`kill` 前确认 PID。备份习惯：`cp storage/development.sqlite3 /tmp/backup.sqlite3`
- **首次启动无管理员**。RootLayout 调用 `/api/v1/setup` 检查，`needs_setup: true` 时所有页面自动跳 `/setup`
- **`public/index.html` 是静态文件**，Rails 直接返回不经过控制器。别指望 before_action 能拦截它
- **前端构建产物放 `public/`**，`cp dist/index.html public/ && cp -r dist/assets public/`
- **生产环境用 nginx** 反代，`deploy/nginx/badge-generator.conf` 已写好

### 权限与安全

- **数据隔离三件套**：`Current.user.cards.find`、`Current.user.cards.new`、`Current.user.cards.where`
- **API 鉴权两层**：`require_api_authentication`（登录） + 封禁/激活检查在 `Api::BaseController`
- **管理员不能操作自己**：toggle_active、toggle_ban、toggle_role、destroy 都要检查 `@user == Current.user`
- **`user_params` 不能 permit `:role` `:model_level`**，在 action 里显式赋值
- **SSL 验证**：别用 `VERIFY_NONE`，用 `cert_store.set_default_paths`。CI 会扫描字面量
- **XSS 防护**：别用 `innerHTML` 拼用户输入，用 `createElement` + `textContent`/`value`

### 前端开发

- **构建命令**：`cd frontend && yarn build && cp dist/index.html ../public/ && cp -r dist/assets ../public/`
- **Turbo 环境**：`data-confirm` 无效，要用 `data-turbo-confirm`。事件用 `turbo:load` 而非 `DOMContentLoaded`
- **React Router**：所有路由放 RootLayout 内才能共享状态检查
- **跨域图片**：不要用绝对 URL（`127.0.0.1` vs `localhost` 跨域），用相对路径
- **ActiveStorage 图片**：`identify: false` 阻止 content_type 被覆盖
- **FA 图标**：CDN 加载 `font-awesome/6.5.1/css/all.min.css`，用 `<i class="fas fa-xxx">`
- **react-easy-crop**：不支持自由拖拽调框大小，交互模型是移动图片+缩放。比例按钮用 `NaN` 或条件渲染隐藏

### MinerU 集成

- **双模式**：有 Key 走精准 API（上传→OSS→轮询→ZIP），无 Key 走 Agent（仅 Markdown）
- **图片在 ZIP 里**：直接在 `Zip::File.open_buffer` 块内读，别两阶段（先收集 refs 再读）
- **图片筛选**：`process_zip` 按扩展名匹配 `\.(png|jpg|jpeg|webp)$`，并过滤掉小于 512 字节的文件
- **StringIO 陷阱**：rubyzip 某些版本 `get_input_stream.read` 返回 StringIO 而非 String，到处要 `.is_a?(StringIO) ? data.string : data`
- **轮询要加超时**：不能用 `TIMEOUT.times`（时间不准），用 `elapsed` 累加
- **MineruService 重试 SSL**：别做，CI 会报。用 `cert_store`

### 人像识别

- **单独服务**：`PortraitDetector`，走 RubyLLM 多模态，不要自己拼 HTTP
- **候选筛选**：`detect` 过滤掉小于 512 字节的图片（太小可能是图标）
- **null 处理**：LLM 说 null 时返回 nil，别回退到第一张

### 文件上传

- **Tempfile 生命周期**：返回对象而非路径，否则 GC 会删文件。`ensure tmpfile&.close!`
- **文件描述符**：`File.open` 做 body_stream 要用块形式保证关闭
- **文本清洗**：存库前 `encode("UTF-8", invalid: :replace)` + 去控制字符 + 截断

### ERB 模板

- **`case/when` 跨 `<% %>` 标签** → 解析错误，用 `if/elsif` 或 hash 查询
- **`button_to` 生成 `<form>`** → block 级元素，用 `form_class: "inline"` 或手写 `<form style="display:inline">`

### Ruby 4 兼容

- **数组字面量内 rescue** → 语法错误：`[JSON.parse(x) rescue nil]` 不行，要写方法
- **keyword args** → `progress.set(:done, card_id: x)` 在 Ruby 4 是位置参数，用 `progress.done(card_id: x)`

### CI

- **RuboCop**：`Layout/SpaceInsideArrayLiteralBrackets` 要求 `[ "a" ]` 而非 `["a"]`
- **Brakeman**：`params.permit(:role)` → 高危；`VERIFY_NONE` → 高危
- **提交前必跑**：`bin/rails test && bin/rubocop`，不通过不提交

## 项目功能地图

```
app/
├── controllers/
│   ├── admin/           # 管理后台（ERB 页面）
│   │   ├── base         # require_admin（封禁/激活/角色检查）
│   │   ├── users        # 用户 CRUD + 批量 + 角色切换 + 重置密码
│   │   ├── models       # 模型配置（可视化表格 + JSON 编辑器）
│   │   ├── permissions  # 权限等级管理（可拖拽排序）
│   │   ├── general_settings # 通用设置（含 MinerU、AI 字段开关）
│   │   └── dashboard    # 仪表盘
│   ├── api/v1/          # JSON API（React SPA 消费）
│   │   ├── cards        # 卡片 CRUD + 异步解析 + 批量删除
│   │   ├── sessions     # 登录/登出/状态
│   │   ├── registrations# 注册（检查 allow_registration）
│   │   ├── passwords    # 改密码（频率限制 + 踢其他 session）
│   │   ├── schema       # 字段/模型/MinerU/上传配置
│   │   ├── setup        # 首次管理员创建
│   │   └── progress     # 异步解析进度轮询
│   ├── concerns/
│   │   └── authentication # 登录 + 封禁/激活检查
│   └── frontend         # SPA catch-all
├── models/
│   ├── user             # has_secure_password + 权限等级体系
│   ├── card             # 文档解析结果 + 证件照附件
│   ├── setting          # KV 配置存储
│   └── session          # cookie session
├── services/
│   ├── llm_service      # LLM 调用封装（并发限制 + 模型切换）
│   ├── card_extractor   # 固定字段 LLM 提取
│   ├── ai_field_parser  # AI 动态字段提取（实验性）
│   ├── mineru_service   # MinerU 文档解析 API 客户端
│   ├── portrait_detector# 人像识别（多模态 LLM）
│   ├── document_text_extractor # 文件→文本（含 MinerU 集成）
│   ├── progress_tracker # 异步解析进度缓存
│   └── ocr_extractor    # tesseract OCR
└── frontend/src/        # React SPA
    ├── api/             # API 客户端（cards, sessions, client）
    ├── components/
    │   ├── Page1        # 首页（资料输入→AI 提取→字段编辑）
    │   ├── Page2        # 设计页（模板/配色/尺寸）
    │   ├── Page3        # 历史记录（批量操作）
    │   ├── CropModal    # 图片裁切（react-easy-crop）
    │   ├── ModelPicker  # 模型选择器
    │   ├── UserMenu     # 用户菜单（登录/后台/改密码/退出）
    │   ├── LoginPage/RegisterPage/SetupPage/InactivePage/ChangePasswordPage
    │   └── RootLayout   # 路由守卫（setup 检查 + 登录保护）
    └── routes.tsx       # SPA 路由表
```

## 已知风险

（已全部修复，暂无已知风险）
