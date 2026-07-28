# frozen_string_literal: true

# 从一组图片中识别哪张是证件照。调用 LLM 视觉模型判断。
class PortraitDetector
  class Error < StandardError; end

  PROMPT = "这些图片是从文档中提取的。哪一张是人的证件照/大头照/头像？如果都没有返回 null。只返回图片序号（1-based）或 null。"

  def initialize(model_id: nil)
    @model_id = model_id
  end

  # images: [{ path:, data: }] → 返回选中的图片数据，或 nil
  def detect(images)
    return nil if images.blank?
    return images.first if images.one?

    images.each_with_index do |img, idx|
      result = ask_llm(images, idx)
      return images[idx] if result == "yes"
    end
    nil
  rescue => e
    Rails.logger.warn("Portrait detection failed: #{e.message}")
    nil
  end

  private

  def ask_llm(images, target_idx)
    client = LlmService.new(model_id: @model_id)

    # 用简短的文字描述让模型判断，不传实际图片（避免兼容问题）
    info = images.map.with_index { |img, i|
      "#{i + 1}. #{img[:path]} (#{img[:data].bytesize} bytes)"
    }.join("\n")

    messages = [
      { role: "user", content: "从以下图片中选出证件照：\n#{info}\n\n图片 #{target_idx + 1} 是证件照吗？只回答 yes 或 no。" }
    ]

    client.complete(messages, system: PROMPT, max_tokens: 32).strip.downcase
  end
end
