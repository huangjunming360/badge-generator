# 大模型接入配置。密钥只从环境变量读，不写进代码库。
# 本地开发把值放在项目根的 .env（已 gitignore）。
Rails.application.config.x.llm = {
  base_url: ENV.fetch("LLM_BASE_URL", "https://api.aicodemirror.com/api/claudecode"),
  api_key: ENV["LLM_API_KEY"],
  model: ENV.fetch("LLM_MODEL", "claude-sonnet-5"),
  max_tokens: ENV.fetch("LLM_MAX_TOKENS", "2048").to_i,
  timeout: ENV.fetch("LLM_TIMEOUT", "120").to_i
}
