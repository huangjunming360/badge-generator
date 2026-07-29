# frozen_string_literal: true

# 模型配置 & RubyLLM 初始化
# 读取 config/models.json，配置全局 RubyLLM，同时将完整配置
# 存入 Rails.application.config.x.models 供运行时查表。

require "json"

models_path = Rails.root.join("config/models.json")

if File.exist?(models_path)
  raw = JSON.parse(File.read(models_path))
  models = raw["models"] || []

  Rails.application.config.x.models = {
    "default" => raw["default"],
    "models"  => models
  }

  # RubyLLM 全局默认用第一个模型配
  default_model = models.find { |m| m["id"] == raw["default"] } || models.first
  if default_model
    RubyLLM.configure do |config|
      config.request_timeout = 120
      config.openai_use_system_role = true  # 拒绝 developer role，用 system
      if default_model["api"] == "anthropic"
        config.anthropic_api_key  = default_model["api_key"]
        config.anthropic_api_base = default_model["api_base"]
      else
        config.openai_api_key  = default_model["api_key"]
        config.openai_api_base = default_model["api_base"]
      end
    end
  end
else
  Rails.application.config.x.models = { "default" => nil, "models" => [] }
end
