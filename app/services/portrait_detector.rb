# frozen_string_literal: true

# 从一组图片中识别哪张是证件照。直接调用 LLM 视觉 API，
# 不走 RubyLLM（它的 add_message 不支持多模态 content 数组）。
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

    # 启发式筛选：排除过小（图标）和过大（全页扫描）
    candidates = images.select { |img|
      sz = img[:data].bytesize
      (8_000..500_000).cover?(sz)
    }
    return candidates.first if candidates.one?
    return candidates.first if candidates.empty?

    ask_llm(candidates)
  rescue => e
    Rails.logger.warn("Portrait detection failed: #{e.message}")
    candidates.first
  end

  private

  def ask_llm(candidates)
    config = resolve_config
    base = config["api_base"].to_s
    endpoint = base.end_with?("/chat/completions") ? base : "#{base}/chat/completions"

    # 构建 OpenAI 格式的多模态消息
    content = []
    candidates.each_with_index do |img, i|
      ext = File.extname(img[:path]).downcase
      mime = ext == ".png" ? "image/png" : "image/jpeg"
      encoded = Base64.strict_encode64(img[:data])
      next if encoded.bytesize > 500_000  # 单图限制 500KB

      content << { type: "text", text: "图片 #{i + 1}: #{img[:path]}" }
      content << {
        type: "image_url",
        image_url: { url: "data:#{mime};base64,#{encoded}" }
      }
    end

    # 如果没有图片能成功编码，退回启发式结果
    return candidates.first if content.empty?

    content << { type: "text", text: "\n哪张是证件照？只回答序号（1-#{candidates.length}）或 null。" }

    body = {
      model: config["model"],
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: content }
      ],
      max_tokens: 32
    }

    response = http_post(endpoint, body.to_json, config["api_key"])
    text = response.dig("choices", 0, "message", "content") || ""
    idx = text.strip.to_i - 1
    (idx >= 0 && idx < candidates.length) ? candidates[idx] : candidates.first
  end

  def resolve_config
    models = Rails.application.config.x.models["models"] || []
    model = @model_id ? models.find { |m| m["id"] == @model_id } : nil
    model || models.find { |m| m["id"] == models_config["default"] } || models.first || {}
  end

  def models_config
    Rails.application.config.x.models || {}
  end

  def http_post(url, body_json, api_key)
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 60
    http.open_timeout = 15

    req = Net::HTTP::Post.new(uri)
    req["Content-Type"] = "application/json"
    req["Authorization"] = "Bearer #{api_key}"
    req.body = body_json

    res = http.request(req)
    raise Error, "HTTP #{res.code}" unless res.code.to_i == 200
    JSON.parse(res.body)
  rescue JSON::ParserError
    raise Error, "非 JSON 响应"
  end
end
