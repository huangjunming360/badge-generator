class Card < ApplicationRecord
  # 标准化字段。LLM 只能填这些，顺序即展示顺序。
  FIELDS = %w[
    name name_en title department organization
    phone email website address employee_id tagline
  ].freeze

  # 字段中文名，给界面显示用。
  FIELD_LABELS = {
    "name" => "姓名",
    "name_en" => "英文名",
    "title" => "职位",
    "department" => "部门",
    "organization" => "单位",
    "phone" => "电话",
    "email" => "邮箱",
    "website" => "网址",
    "address" => "地址",
    "employee_id" => "工号",
    "tagline" => "标语"
  }.freeze

  # 证件照/大头照。本阶段只存不用，后续模板渲染时才读。
  has_one_attached :portrait

  PORTRAIT_TYPES = %w[image/png image/jpeg].freeze
  PORTRAIT_MAX_BYTES = 5.megabytes

  validates :raw_input, presence: { message: "请先输入个人资料" }
  validate :portrait_must_be_supported_image

  # 保证读出来总是 11 个 key 齐全的 Hash，视图不用做 nil 判断。
  def normalized_data
    stored = data.presence || {}
    FIELDS.index_with { |f| stored[f].presence }
  end

  def filled_count
    normalized_data.count { |_, v| v.present? }
  end

  private

  def portrait_must_be_supported_image
    return unless portrait.attached?

    unless PORTRAIT_TYPES.include?(portrait.blob.content_type)
      errors.add(:portrait, "只支持 PNG 或 JPG 格式的照片")
    end

    if portrait.blob.byte_size > PORTRAIT_MAX_BYTES
      errors.add(:portrait, "照片不能超过 #{PORTRAIT_MAX_BYTES / 1.megabyte}MB")
    end
  end
end
