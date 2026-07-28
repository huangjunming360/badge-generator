# Badge Generator

https://github.com/huangjunming360/badge-generator

名片/胸卡生成器。当前阶段：资料输入 → AI 提取 → 标准化 JSON。

## 环境

- Ruby 4.0.6（rbenv 管理）
- Rails 8.1.3
- SQLite 3
- Tailwind CSS 4
- tesseract 4.1.1（chi_sim + chi_tra + eng）、poppler-utils —— OCR 依赖

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
PIDFILE=tmp/pids/puma.pid bin/rails s -p 8000 -b 127.0.0.1   # http://localhost:8000
bin/dev                       # 同时跑 Tailwind watch（改样式时用）
```

必须显式指定 `PIDFILE`，否则 Rails 会误判系统的 `/run/tat_agent.pid` 而拒绝启动。

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

## 配置

密钥放项目根 `.env`（已 gitignore），参考 `config/llm.yml`：

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_API_BASE=https://你的网关地址
```

当前默认走 DeepSeek 的 Anthropic 兼容端点，`.env` 形如：

```env
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com/anthropic
```

换回 Claude 官方只需改 `LLM_BASE_URL` 和 `config/llm.yml` 里对应用途的 `model`。

## 模型配置体系

所有模型配置集中在 `config/llm.yml`，结构分两层：

```yaml
# 协议层 —— 只分 Anthropic 和 OpenAI 两类
anthropic:
  api_key: ...
  api_base: ...      # 自部署网关在这设

openai:
  api_key: ...
  # api_base: 可选

# 用途层 —— 每种用途指定用哪个协议和模型
functions:
  用途名:
    api: anthropic   # 或 openai
    model: 模型名
    temperature: ...
```

**协议层**：主流通用接口只有 Anthropic 兼容 和 OpenAI 兼容。DeepSeek、OpenRouter、xAI 等多数供应商都走 OpenAI 协议，区别只在于 base_url 和模型名。

**用途层**：定义每种业务用途的 (协议, 模型)。比如名片提取用轻量模型（便宜够用），翻译用 GPT-4o，通用对话用主力模型，互相独立。

### 添加新用途

只需在 `config/llm.yml` 的 functions 加一条：

```yaml
functions:
  code_review:
    api: anthropic
    model: claude-sonnet-5
    temperature: 0.0
```

### 切换供应商

例如从 OpenAI 换成 DeepSeek，改 base_url 和模型名即可：

```yaml
openai:
  api_key: <%= ENV['DEEPSEEK_API_KEY'] %>
  api_base: https://api.deepseek.com
```

不涉及代码改动。

## 模型调用示例

所有模型调用走 `LlmService`，按用途名调用，由框架自动匹配模型：

```ruby
# 名片提取 —— 轻量模型
LlmService.new.complete(messages, system: CardExtractor::SYSTEM_PROMPT)

# 通用对话 —— 主力模型
LlmService.new(function: :chat).complete(messages)

# 翻译
LlmService.new(function: :translation).complete(messages)

# 向量化
LlmService.new(function: :embedding).embed("文本")
```

代码里只出现用途名，不出现具体模型名。调整模型只需改 YAML，不需改 Ruby。

## 支持的输入

文字直接粘贴，或上传文件：

| 格式 | 处理方式 |
|---|---|
| docx | `docx` gem，含表格 |
| pdf | `pdf-reader` 读文字层；文字层为空（扫描版）自动转 OCR |
| xlsx / xlsm / csv | `roo`，遍历所有 sheet |
| txt / md | 直接读取 |
| png / jpg / tif / bmp | tesseract OCR |

上限 10MB，抽出的文本截断到 2 万字。

## 实现要点

- `DocumentTextExtractor` 只做"文件 → 纯文本"，`CardExtractor` 只做"文本 → 标准化 JSON"，职责分离，加新格式只需加一个分支。
- OCR 用 `--psm 6`（单一文本块按行读）。默认的 `psm 3` 会把"姓名：张三"这类左右布局拆成两行导致字段值错位。
- 走过 OCR 的记录会在结果页标注"OCR 识别，建议核对"。
- 固定 11 字段 schema，见 `app/models/card.rb`。提取不到的字段留 null，不编造。

## 已知限制

- 无鉴权，任何访问者能看到所有记录。仅本地开发，对外暴露前必须加。
- 提取结果本阶段不可编辑，只能重新提交。

## 待做

可编辑表单、字体/配色选择、PNG 下载。
