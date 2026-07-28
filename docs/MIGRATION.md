# 配置迁移说明

## 变更摘要

模型配置从 `.env` + `config/llm.yml` 迁移到 `config/models.json`，一个文件管理所有模型和密钥。

## 迁移步骤

### 1. 创建 `config/models.json`

参考 `config/models.example.json`，把原来的 `.env` 内容填进去：

**旧格式（`.env`）：**
```env
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_API_BASE=https://api.aicodemirror.com/api/claudecode
```

**新格式（`config/models.json`）：**
```json
{
  "default": "claude_haiku",
  "models": [
    {
      "id": "claude_haiku",
      "label": "Claude Haiku 4.5",
      "api": "anthropic",
      "model": "claude-haiku-4-5-20251001",
      "api_key": "sk-ant-xxx",
      "api_base": "https://api.aicodemirror.com/api/claudecode"
    },
    {
      "id": "claude_sonnet",
      "label": "Claude Sonnet 5",
      "api": "anthropic",
      "model": "claude-sonnet-5",
      "api_key": "sk-ant-xxx",
      "api_base": "https://api.aicodemirror.com/api/claudecode"
    }
  ]
}
```

### 2. 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `default` | 是 | 默认使用的模型 `id` |
| `models[].id` | 是 | 模型唯一标识，用于代码引用 |
| `models[].label` | 是 | 前端下拉菜单显示的名称 |
| `models[].api` | 是 | `anthropic` 或 `openai` |
| `models[].model` | 是 | API 调用的模型名 |
| `models[].api_key` | 否 | 该模型的 API 密钥，不填则用全局默认 |
| `models[].api_base` | 否 | 该模型的 API 端点，不填则用官方默认 |

### 3. 清理旧文件

```bash
# .env 里如果只有 LLM 相关配置，可以直接删
rm .env

# 或者在 .env 里只删 LLM 相关行，保留其他配置
```

### 4. 验证

```bash
rails runner "puts Rails.application.config.x.models['models'].map{|m|m['label']}"
# 应输出所有模型名称

rails s -p 8000
# 打开浏览器，右上角齿轮应显示模型列表
```

## 添加新模型

直接编辑 `config/models.json`，在 `models` 数组加一条，重启服务即可：

```json
{
  "id": "deepseek",
  "label": "DeepSeek V3",
  "api": "openai",
  "model": "deepseek-chat",
  "api_key": "sk-xxx",
  "api_base": "https://api.deepseek.com/v1"
}
```

不需要改任何代码。
