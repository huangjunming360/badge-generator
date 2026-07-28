# frozen_string_literal: true

# 从一组图片中识别哪张是证件照。
# 先用大小启发式筛选候选，再调用 LLM 视觉模型确认。
class PortraitDetector
  class Error < StandardError; end

  PROMPT = "这些图片是从文档中提取的。哪一张是人的证件照/大头照/头像？如果都没有返回 null。只回答图片序号（1-based）或 null。"

  def initialize(model_id: nil)
    @model_id = model_id
  end

  # images: [{ path:, data: }] → 返回匹配的图片数据 hash，或 nil
  def detect(images)
    return nil if images.blank?
    return images.first if images.one?

    # 启发式：排除过小（图标）和过大（全页扫描）的图片
    candidates = images.select { |img|
      sz = img[:data].bytesize
      (8_000..500_000).cover?(sz)
    }
    return candidates.first if candidates.one?
    return images.first if candidates.empty?

    # 用 LLM 视觉判断，只传候选图片（减少 token）
    ask_llm(candidates)
  rescue => e
    Rails.logger.warn("Portrait detection failed: #{e.message}")
    candidates&.first || images.first
  end

  private

  def ask_llm(candidates)
    client = LlmService.new(model_id: @model_id)

    # 构建多模态消息：文字描述 + 实际图片
    content = candidates.map.with_index do |img, i|
      { type: "text", text: "图片 #{i + 1}: #{img[:path]}" }
    end
    content << { type: "text", text: "\n哪张是证件照？只回答序号（1-#{candidates.length}）或 null。" }

    # 附上实际图片（base64）
    candidates.each_with_index do |img, i|
      ext = File.extname(img[:path]).downcase
      mime = ext == ".png" ? "image/png" : "image/jpeg"
      encoded = Base64.strict_encode64(img[:data])
      content << {
        type: "image_url",
        image_url: { url: "data:#{mime};base64,#{encoded}" }
      } if encoded.bytesize < 500_000  # 限制单图 500KB
    end

    messages = [ { role: "user", content: content } ]
    response = client.complete(messages, system: PROMPT, max_tokens: 32)
    idx = response.strip.to_i - 1
    (idx >= 0 && idx < candidates.length) ? candidates[idx] : candidates.first
  rescue => e
    Rails.logger.warn("LLM portrait detection failed: #{e.message}")
    candidates.first
  end
end
