# 全局不变量：字段定义、尺寸边界、上传约束。
# 单独一个端点而不是塞进每张卡的响应 —— 它们随记录重复传输是浪费，
# 但前端确实需要它们来渲染标签和做前置校验。
class Api::V1::SchemaController < Api::BaseController
  skip_before_action :require_api_authentication, only: :show

  def show
    render json: {
      fields: Card::FIELDS.map { |key|
        {
          key: key,
          label: Card::FIELD_LABELS[key],
          default: Card::FIELD_DEFAULTS[key]
        }
      },
      size: {
        default_width_mm: Card::DEFAULT_WIDTH_MM,
        default_height_mm: Card::DEFAULT_HEIGHT_MM,
        min_mm: Card::MIN_SIZE_MM,
        max_mm: Card::MAX_SIZE_MM
      },
      preview: {
        scales: Card::PREVIEW_SCALES,
        default_scale: Card::DEFAULT_PREVIEW_SCALE
      },
      portrait: {
        content_types: Card::PORTRAIT_TYPES,
        max_bytes: Card::PORTRAIT_MAX_BYTES
      },
      # 可选模型清单。只暴露 id 与展示名 —— api_key / api_base 是凭据，
      # 绝不能出现在响应里。按用户权限等级过滤。
      models: {
        available: models_config["models"].to_a
          .select { |m| m["level"].to_i >= Current.user&.model_level.to_i }
          .map { |m| m.slice("id", "label") },
        default: models_config["default"]
      },
      upload: {
        allowed_extensions: DocumentTextExtractor.accepted_extensions,
        max_bytes: DocumentTextExtractor::MAX_BYTES
      },
      mineru: {
        available: Setting.bool("mineru_enabled", default: false) && ENV["MINERU_API_KEY"].present?,
        portrait_detect: Setting.bool("portrait_detect", default: true)
      }
    }
  end

  private

  def models_config
    Rails.application.config.x.models || {}
  end
end
