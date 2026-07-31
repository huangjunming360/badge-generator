# frozen_string_literal: true

class Api::V1::TemplateDesignsController < Api::BaseController
  MAX_IMAGE_BYTES = 2.megabytes
  MAX_BASE64_BYTES = ((MAX_IMAGE_BYTES + 2) / 3) * 4
  IMAGE_TYPES = {
    "image/jpeg" => ".jpg",
    "image/png" => ".png",
    "image/webp" => ".webp"
  }.freeze

  # 一次连续设计最多包含 1 次初稿和 100 次视觉复审；仍保留小时级上限，
  # 防止凭据被盗后无限消耗模型额度。
  rate_limit to: 120, within: 1.hour, only: :create,
    with: -> { render json: { errors: [ "AI 模板设计请求过于频繁，请稍后再试" ] }, status: :too_many_requests }

  def create
    # 设计上下文必须先从 Current.user 定位卡片，不能让其他用户借此消耗
    # 模型额度；未来加入保存/版本能力时也不会留下越权入口。
    Current.user.cards.find(params[:card_id])

    prompt = params[:prompt].to_s.strip
    return render_error("请先描述你想要的工牌样式", status: :unprocessable_content) if prompt.blank?
    return render_error("设计要求不能超过 2000 个字符", status: :unprocessable_content) if prompt.length > 2_000
    model_id = effective_model_id(params[:model_id])
    return unless model_available?(model_id)

    preview = decode_image(params[:preview_image], kind: :preview)
    return if performed?

    reference = decode_image(params[:reference_image], kind: :reference)
    return if performed?

    result = CustomTemplateDesigner.new(model_id: model_id).call(
      prompt: prompt,
      current_design: design_params.to_h,
      current_document: current_document_params,
      history: history_params,
      preview_attachment: preview,
      reference_attachment: reference
    )
    render json: result
  rescue CustomTemplateDesigner::ResponseFormatError => e
    render_error(e.message, status: :bad_gateway)
  rescue CustomTemplateDesigner::Error => e
    render_error(e.message, status: :unprocessable_content)
  rescue LlmService::UnknownModel => e
    render_error(e.message, status: :unprocessable_content)
  rescue LlmService::Error => e
    render_error(e.message, status: :bad_gateway)
  ensure
    preview&.close!
    reference&.close!
  end

  private

  def effective_model_id(model_id)
    model_id.presence ||
      Rails.application.config.x.llm_functions&.dig("custom_template_design", "model").presence ||
      Rails.application.config.x.models&.dig("default").presence ||
      configured_models.first&.dig("id")
  end

  def model_available?(model_id)
    model = configured_models.find { |entry| entry["id"] == model_id }
    unless model
      render_error("未知的模型", status: :unprocessable_content)
      return false
    end

    level = model["level"].to_i
    return true if level.negative? || level >= Current.user.model_level.to_i

    render_error("无权限使用该模型", status: :forbidden)
    false
  end

  def configured_models
    (Rails.application.config.x.models || {}).fetch("models", [])
  end

  def design_params
    raw = params.fetch(:current_design, ActionController::Parameters.new)
    raw.permit(
      :orientation, :layout, :sizeMode, :showPhoto, :showQR, :showBarcode, :showDots,
      :headerLabel, :subLabel, :backgroundColor, :surfaceColor, :primaryColor,
      :textColor, :mutedColor, :fontFamily, :nameAlign, :nameScale,
      :cornerRadius, :cardWidth, :cardHeight, :photoShape, :density, :decoration
    )
  end

  def history_params
    Array(params[:history]).last(8).filter_map do |entry|
      next unless entry.is_a?(ActionController::Parameters) || entry.is_a?(Hash)

      role = (entry[:role] || entry["role"]).to_s
      next unless %w[user assistant].include?(role)

      content = entry[:content] || entry["content"]
      { role: role, content: content.to_s.truncate(1_000) }
    end
  end

  def current_document_params
    raw = params[:current_document]
    return nil unless raw.is_a?(ActionController::Parameters) || raw.is_a?(Hash)

    document = raw.is_a?(ActionController::Parameters) ? raw : ActionController::Parameters.new(raw)
    document.permit(:html, :css).to_h
  end

  def decode_image(value, kind:)
    return nil if value.blank?

    encoded_data_url = value.to_s
    return invalid_image(kind) if encoded_data_url.bytesize > MAX_BASE64_BYTES + 128

    match = encoded_data_url.match(%r{\Adata:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)\z})
    return invalid_image(kind) unless match

    encoded = match[2].delete("\r\n\t ")
    return invalid_image(kind) if encoded.bytesize > MAX_BASE64_BYTES

    data = Base64.strict_decode64(encoded)
    return invalid_image(kind) if data.bytesize > MAX_IMAGE_BYTES
    detected_type = Marcel::MimeType.for(StringIO.new(data))
    return invalid_image(kind) unless detected_type == match[1] && IMAGE_TYPES.key?(detected_type)

    file = Tempfile.new([ "template-#{kind}", IMAGE_TYPES.fetch(detected_type) ], binmode: true)
    file.binmode
    file.write(data)
    file.rewind
    file
  rescue ArgumentError
    invalid_image(kind)
  end

  def invalid_image(kind)
    label = kind == :reference ? "参考图" : "预览图"
    render_error("#{label}格式无效，仅支持不超过 2MB 的 JPEG、PNG 或 WebP", status: :unprocessable_content)
    nil
  end
end
