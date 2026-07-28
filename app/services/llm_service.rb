# frozen_string_literal: true

# LLM 调用封装。模型和密钥全部来自 config/models.json，
# 用户可在前端切换模型，选中的模型存入 session。
#
# 支持并发限制：全局信号量控制同时运行的 LLM 请求数，
# 避免瞬间打爆供应商速率限制。
#
# 用法：
#   LlmService.new(session: session).complete(messages, system: PROMPT)

class LlmService
  class Error < StandardError; end
  # 模型 id 传错是客户端的问题，与上游服务故障要分开处理，
  # 所以单独一个类型 —— 靠匹配错误消息文字来区分太脆弱。
  class UnknownModel < Error; end

  # 全局并发控制：默认最多 3 个 LLM 请求同时运行
  MAX_CONCURRENCY = ENV.fetch("LLM_MAX_CONCURRENCY", 3).to_i
  SEMAPHORE = Mutex.new
  @@active_requests = 0

  def self.active_requests
    @@active_requests
  end

  def self.await_slot
    loop do
      acquired = false
      SEMAPHORE.synchronize do
        if @@active_requests < MAX_CONCURRENCY
          @@active_requests += 1
          acquired = true
        end
      end
      return if acquired
      sleep 0.1
    end
  end

  def self.release_slot
    SEMAPHORE.synchronize { @@active_requests -= 1 }
  end

  # model_id 供无状态的 JSON API 使用：分离架构下前端不共享 cookie session，
  # 选中的模型随请求参数传入。session 仍供 ERB 页面使用。
  def initialize(session: nil, model_id: nil)
    @session = session
    @model_id = model_id
    @config = resolve_config
  end

  def complete(messages, system: nil, max_tokens: 4096)
    # 等待并发槽位
    self.class.await_slot

    # 每个模型独立密钥 → 调用前配置
    configure_provider!

    chat = RubyLLM.chat(
      model: @config["model"],
      provider: @config["api"],
      assume_model_exists: true
    )
    chat.with_instructions(system) if system.present?
    chat.with_temperature(0.0)
    if @config["no_thinking"] && @config["api"] == "openai"
      # Doubao 等 OpenAI 协议模型：主动发 thinking:disabled 关闭深度推理
      chat.with_params(thinking: { type: "disabled" }, max_tokens: max_tokens.to_i)
    elsif max_tokens.to_i > 0
      chat.with_params(max_tokens: max_tokens.to_i)
    end

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
  ensure
    self.class.release_slot
  end

  def embed(text)
    RubyLLM.embed(text, model: @config["model"], provider: @config["api"])
  rescue RubyLLM::Error => e
    raise Error, "Embedding 失败: #{e.message}"
  end

  private

  def resolve_config
    models = all_models

    # 显式指定的模型 id 最优先（无状态 API 路径）。
    # 认不出的 id 不静默退回默认：那会让用户以为换了模型其实没换。
    if @model_id.present?
      found = models.find { |m| m["id"] == @model_id }
      raise UnknownModel, "未知的模型：#{@model_id}" if found.nil?
      return found
    end

    # 其次用用户在前端选的模型（ERB 页面的 session 路径）
    if @session && (selected = @session[:selected_model])
      return selected
    end

    # 否则用默认模型
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
