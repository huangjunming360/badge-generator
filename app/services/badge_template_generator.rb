# frozen_string_literal: true

# Uses the configured LLM function to produce a safe, versionable template source.
class BadgeTemplateGenerator
  class Error < StandardError; end

  RESULT_KEYS = %w[html css notes].freeze
  MAX_REQUEST_BYTES = 20.kilobytes

  def initialize(client: nil)
    @client = client
  end

  def generate(requirement:, complexity: 5, reference_notes: nil, model_id: nil, width_mm: 55, height_mm: 85, reference_assets: [])
    call_function(
      :template_codegen,
      build_generation_request(requirement, complexity, reference_notes, width_mm, height_mm),
      model_id: model_id,
      attachments: reference_assets
    )
  end

  def repair(html:, css:, diagnostics:, requirement: nil)
    payload = {
      requirement: requirement.to_s,
      html: html.to_s,
      css: css.to_s,
      diagnostics: diagnostics.to_s
    }
    ensure_request_size!(payload)
    call_function(:template_repair, payload)
  end

  private

  def build_generation_request(requirement, complexity, reference_notes, width_mm, height_mm)
    payload = {
      requirement: requirement.to_s,
      complexity: [ [ complexity.to_i, 1 ].max, 10 ].min,
      reference_notes: reference_notes.to_s,
      canvas: { width_mm: width_mm.to_f.clamp(20, 200), height_mm: height_mm.to_f.clamp(20, 200) }
    }
    ensure_request_size!(payload)
    payload
  end

  def call_function(function, payload, model_id: nil, attachments: [])
    client = @client || LlmService.new(function: function, model_id: model_id)
    response = client.complete(
      [ { role: "user", content: JSON.generate(payload), attachments: attachments } ],
      system: client.function_prompt,
      max_tokens: client.function_max_tokens || 4096
    )
    result = parse_response(response)
    report = BadgeTemplateRenderer.validate_source(result.fetch("html"), result.fetch("css"))
    raise Error, report.fetch("errors").join("；") unless report.fetch("valid")

    result.merge("validation_report" => report)
  rescue KeyError, JSON::ParserError => e
    raise Error, "模板生成结果格式错误：#{e.message}"
  end

  def parse_response(response)
    text = response.to_s.strip.gsub(/\A```(?:json)?\s*/, "").gsub(/\s*```\z/, "")
    first = text.index("{")
    last = text.rindex("}")
    text = text[first..last] if first && last && last >= first
    parsed = JSON.parse(text)
    raise JSON::ParserError, "必须返回 JSON 对象" unless parsed.is_a?(Hash)

    result = parsed.slice(*RESULT_KEYS)
    raise JSON::ParserError, "缺少 html 或 css" if result["html"].blank? || result["css"].nil?

    result["notes"] = result["notes"].to_s
    result
  end

  def ensure_request_size!(payload)
    return if JSON.generate(payload).bytesize <= MAX_REQUEST_BYTES

    raise Error, "模板设计请求过大"
  end
end
