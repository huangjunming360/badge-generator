# frozen_string_literal: true

# RubyLLM 封装层，按用途自动选择协议和模型。
#
# 用法（按用途调用）：
#
#   名片提取 —— 轻量模型
#     LlmService.new.complete([{ role: "user", content: text }], system: PROMPT)
#
#   通用对话 —— 主力模型
#     LlmService.new(function: :chat).complete(messages)
#
#   翻译
#     LlmService.new(function: :translation).complete(messages)
#
#   文本向量化
#     LlmService.new(function: :embedding).embed("文本")
#
# 每种用途对应的 (协议, 模型) 在 config/llm.yml functions 段配。

class LlmService
  class Error < StandardError; end

  def initialize(function: :card_extraction)
    @function = function.to_sym
    @config = resolve_function_config
  end

  def complete(messages, system: nil, max_tokens: nil)
    chat = build_chat(system: system, max_tokens: max_tokens || @config[:max_tokens])

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
    RubyLLM.embed(text, model: @config[:model], provider: @config[:api])
  rescue RubyLLM::Error => e
    raise Error, "Embedding 失败: #{e.message}"
  end

  private

  def build_chat(system:, max_tokens:)
    chat = RubyLLM.chat(
      model: @config[:model],
      provider: @config[:api],
      assume_model_exists: true
    )
    chat.with_instructions(system) if system.present?
    chat.with_temperature(@config[:temperature].to_f) if @config[:temperature]
    chat.with_params(max_tokens: max_tokens.to_i) if max_tokens.to_i > 0
    chat
  end

  def resolve_function_config
    raw = Rails.application.config.x.llm_config || {}
    func = raw.dig(:functions, @function) || {}

    {
      api: (func[:api] || :anthropic).to_sym,
      model: func[:model] || "claude-sonnet-5",
      temperature: func[:temperature] || 0.3,
      max_tokens: func[:max_tokens] || 4096
    }
  end
end
