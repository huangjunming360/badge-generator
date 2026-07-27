# 名片/胸卡生成器 —— 第一阶段：资料标准化

日期：2026-07-27

## 背景

做一个帮各行各业的人生成胸卡/名片的工具。完整流程规划为：

1. 用户投入个人资料（文本，后续支持 PDF/docx/xlsx 和大头照）
2. AI 把资料标准化成结构化数据
3. 固定 HTML/CSS 模板渲染名片，用户可选字体和配色
4. 实时预览
5. 下载 PNG

**本阶段只做第 1-2 步**：文本输入 → LLM 提取 → 显示标准化 JSON。
第 3-5 步和文件解析、照片上传留给后续阶段，各自单独出 spec。

## 范围

做：
- 单页面，一个文本框收用户粘贴的个人资料
- 调 LLM 提取成固定 schema 的 JSON
- 把提取结果显示出来（格式化 JSON）
- 结果持久化到 SQLite

不做（后续阶段）：
- 可编辑表单、名片预览、字体/配色选择、PNG 下载
- 向用户展示 HTML/CSS 源码
- PDF/docx/xlsx 解析、大头照上传
- 用户账号与鉴权

## 标准化 Schema

固定 11 个字段。LLM 只能填这些字段，提取不到的填 `null`，不允许自行增减字段。

```json
{
  "name": "林小明",
  "name_en": "Xiaoming Lin",
  "title": "高级产品经理",
  "department": "用户增长部",
  "organization": "某某科技有限公司",
  "phone": "13800138000",
  "email": "x@example.com",
  "website": "www.example.com",
  "address": "深圳市南山区科技园",
  "employee_id": "E10086",
  "tagline": "让增长有迹可循"
}
```

选固定 schema 而非自由字段，是因为下游模板需要确定的槽位。将来遇到装不下的行业字段（医师执业证号等）再加 `extras: [{label, value}]` 数组，那是增量改动；反过来从自由字段收敛回固定模板则要重写排版。

## 架构

Rails 8 单应用，SQLite。沿用项目已有的 Turbo + Tailwind + `AnthropicClient`。

### 数据模型

`Card`
- `raw_input` : text —— 用户粘贴的原始资料
- `data` : json —— LLM 产出的标准化结果
- 时间戳

一张卡一条记录，不做版本历史。

### 组件

**`AnthropicClient`（已存在，需扩展）**
现有 `#stream` 方法保留。新增 `#complete(messages)` 做非流式请求，返回完整文本。提取要拿到完整 JSON 才能解析，流式在这里没有价值。

**`CardExtractor`（新增）**
- 输入：原始文本
- 输出：符合 schema 的 Hash
- 职责：拼 prompt（内含 schema 定义和「只输出 JSON、缺失填 null、不要额外字段」的约束）→ 调 `AnthropicClient#complete` → 解析并规范化结果
- 规范化：只保留 schema 内的 11 个 key，缺的补 `null`，值统一转字符串并去空白，空串归一为 `null`
- 容错：解析失败重试一次；仍失败抛 `CardExtractor::ExtractionError`

**`CardsController`（新增）**
- `new` —— 显示输入框
- `create` —— 调 extractor，成功则存 `Card` 并跳转 `show`；失败则回到 `new` 并显示错误
- `show` —— 展示原始输入和格式化后的 JSON

同步调 LLM，不用后台 Job。单次请求几秒，同步等待省掉队列这层复杂度。

### 数据流

```
用户粘贴文本
  → POST /cards
  → CardExtractor 同步调 claude-sonnet-5（非流式）
  → 解析 JSON、按 schema 规范化
  → 存入 Card#data
  → 重定向到 /cards/:id 显示结果
```

## 错误处理

| 情况 | 处理 |
|---|---|
| 输入为空 | 控制器拦下，提示先输入内容 |
| LLM 返回内容不是合法 JSON | 重试一次；仍失败则报错回到输入页，保留用户已输入的文本 |
| LLM 返回合法 JSON 但字段不符 | 规范化步骤丢弃多余 key、补齐缺失 key，不报错 |
| 上游 HTTP 非 200 / 超时 | 冒泡成 `ExtractionError`，页面显示可读的错误信息 |
| 缺少 API key | 启动即由 `AnthropicClient` 抛错，提示配置 `.env` |

原始输入始终保存，提取失败不丢用户数据。

## 测试

`CardExtractor` 单元测试，mock 掉 HTTP 层：
- 正常 JSON 输入 → 得到 11 个字段齐全的 Hash
- LLM 输出带 markdown 代码围栏 → 能正确剥离并解析
- LLM 输出多余字段 → 被丢弃
- LLM 输出缺字段 → 补 `null`
- 第一次返回非 JSON、第二次正常 → 重试成功
- 两次都非 JSON → 抛 `ExtractionError`

另外做一次真实 LLM 的端到端手动验证：粘一段中文自我介绍，确认提取结果正确。

项目当前 `--skip-test` 生成，需要补上 minitest 目录结构。

## 清理

删除上一版聊天 demo 的代码：`Conversation`、`Message` 模型及迁移、`ReplyJob`、`ConversationsController`、`MessagesController`、相关视图和 `composer_controller.js`。与当前方向无关，留着增加噪音。git 历史里有记录，需要时可取回。

`AnthropicClient`、`config/initializers/llm.rb`、`.env` 配置保留复用。

## 已知限制

- 无鉴权，任何访问者能看到所有 Card。仅本地 demo，对外暴露前必须加。
- LLM 提取结果本阶段无法修正，只能重新提交。可编辑表单在下一阶段。
- 模型固定 claude-sonnet-5，经 `LLM_MODEL` 环境变量可换。
