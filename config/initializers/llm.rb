# frozen_string_literal: true

# 大模型接入配置
# 读取 config/llm.yml → 配置 RubyLLM，同时将完整配置树存入
# Rails.application.config.x.llm_config 供 LlmService 运行时查表。

require "erb"
require "yaml"

llm_config_path = Rails.root.join("config/llm.yml")

if File.exist?(llm_config_path)
  yaml_content = ERB.new(File.read(llm_config_path)).result
  parsed = YAML.safe_load(yaml_content, permitted_classes: [Symbol]) || {}
  raw_config = parsed.deep_symbolize_keys

  Rails.application.config.x.llm_config = raw_config

  RubyLLM.configure do |config|
    anthropic = raw_config[:anthropic]
    if anthropic
      config.anthropic_api_key = anthropic[:api_key] if anthropic[:api_key]
      config.anthropic_api_base = anthropic[:api_base] if anthropic[:api_base]
    end

    openai = raw_config[:openai]
    if openai
      config.openai_api_key = openai[:api_key] if openai[:api_key]
      config.openai_api_base = openai[:api_base] if openai[:api_base]
    end
  end
end
