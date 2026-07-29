# frozen_string_literal: true

# 从一组图片中识别哪张是证件照。走 RubyLLM 多模态调用。
class PortraitDetector
  class Error < StandardError; end

  PROMPT = "这些图片是从文档中提取的。哪一张是人的证件照/大头照/头像？如果都没有返回 null。只回答图片序号（1-based）或 null。"

  def initialize(model_id: nil)
    @model_id = model_id
  end

  # images: [{ path:, data: }] → 返回匹配的图片 hash，或 nil
  def detect(images)
    return nil if images.blank?
    return images.first if images.one?

    candidates = images.select { |img| img.is_a?(Hash) && img[:data] && (8_000..500_000).cover?(img[:data].bytesize) }
    return candidates.first if candidates.one? || candidates.empty?

    ask_llm(candidates)
  rescue => e
    Rails.logger.warn("Portrait detection failed: #{e.message}")
    candidates&.first
  end

  private

  def ask_llm(candidates)
    config = resolve_config
    return candidates.first if config.blank?

    # 配置 RubyLLM 的 provider
    RubyLLM.configure do |c|
      if config["api"] == "openai"
        c.openai_api_key = config["api_key"]
        c.openai_api_base = config["api_base"]
      else
        c.anthropic_api_key = config["api_key"]
        c.anthropic_api_base = config["api_base"]
      end
    end

    chat = RubyLLM.chat(
      model: config["model"],
      provider: config["api"],
      assume_model_exists: true
    )

    # 构建多模态消息
    content = RubyLLM::Content.new(PROMPT)
    candidates.each_with_index do |img, i|
      ext = File.extname(img[:path]).downcase
      mime = ext == ".png" ? "image/png" : "image/jpeg"
      # 用 StringIO 包装二进制数据，Attachment 需要 io_like? 为 true
      io = StringIO.new(img[:data])
      attachment = RubyLLM::Attachment.new(io, filename: img[:path])
      content.attachments << attachment if attachment.image?
    end

    chat.add_message(role: :user, content: content)
    response = chat.complete
    text = response.content.to_s.strip
    idx = text.to_i - 1
    (idx >= 0 && idx < candidates.length) ? candidates[idx] : candidates.first
  end

  def resolve_config
    models = Rails.application.config.x.models["models"] || []
    model = @model_id ? models.find { |m| m["id"] == @model_id } : nil
    model || models.find { |m| m["id"] == (Rails.application.config.x.models["default"] || "") } || models.first || {}
  end
end
