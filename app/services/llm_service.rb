# frozen_string_literal: true

# LLM 调用封装。模型和密钥全部来自 config/models.json，
# 用户可在前端切换模型，选中的模型存入 session。
#
# 用法：
#   LlmService.new(session: session).complete(messages, system: PROMPT)

class LlmService
  class Error < StandardError; end

  def initialize(session: nil)
    @session = session
    @config = resolve_config
  end

  def complete(messages, system: nil, max_tokens: 4096)
    # 每个模型独立密钥 → 调用前配置
    configure_provider!

    chat = RubyLLM.chat(
      model: @config["model"],
      provider: @config["api"],
      assume_model_exists: true
    )
    chat.with_instructions(system) if system.present?
    chat.with_temperature(0.0)
    chat.with_params(max_tokens: max_tokens.to_i) if max_tokens.to_i > 0

    messages.each do |msg|
      role = (msg[:role] || msg["role"]).to_s
      next if role == "system"
      chat.add_message(role: role.to_sym, content: msg[:content] || msg["content"])
    end

    response = chat.complete
    response.content.to_s
  rescue RubyLLM::Error => e
    raise Error, "AI 服务响应异常: #{e.message}"
  rescue => e
    raise Error, "LLM 调用失败: #{e.message}"
  end

  def embed(text)
    RubyLLM.embed(text, model: @config["model"], provider: @config["api"])
  rescue RubyLLM::Error => e
    raise Error, "Embedding 失败: #{e.message}"
  end

  private

  def resolve_config
    # 用户在前端选的模型优先
    if @session && (selected = @session[:selected_model])
      return selected
    end

    # 否则用默认模型
    models = all_models
    default_id = models_config["default"]
    models.find { |m| m["id"] == default_id } || models.first || {}
  end

  def all_models
    models_config["models"] || []
  end

  def configure_provider!
    api  = @config["api"]
    key  = @config["api_key"]
    base = @config["api_base"]

    return if key.blank? && base.blank?

    RubyLLM.configure do |c|
      if api == "openai"
        c.openai_api_key  = key if key.present?
        c.openai_api_base = base if base.present?
      else
        c.anthropic_api_key  = key if key.present?
        c.anthropic_api_base = base if base.present?
      end
    end
  end

  def models_config
    Rails.application.config.x.models || {}
  end
end
