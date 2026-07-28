class Card < ApplicationRecord
  # 标准化字段。LLM 只能填这些，顺序即展示顺序。
  FIELDS = %w[
    name name_en title department organization
    phone email website address employee_id tagline
    host_organization host_department event_topic
  ].freeze

  # 活动固定信息：资料里通常不写，缺省就用这套。
  FIELD_DEFAULTS = {
    "host_organization" => "上海交通大学",
    "host_department" => "自然科学研究院",
    "event_topic" => "中法人工智能暑期学校"
  }.freeze

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
    "tagline" => "标语",
    "host_organization" => "组织项目的机构",
    "host_department" => "组织项目的机构部门",
    "event_topic" => "项目主题"
  }.freeze

  # 证件照/大头照。本阶段只存不用，后续模板渲染时才读。
  belongs_to :user, optional: true

  has_one_attached :portrait

  PORTRAIT_TYPES = %w[image/png image/jpeg].freeze
  PORTRAIT_MAX_BYTES = 5.megabytes

  # 挂牌尺寸，单位 mm。默认对齐常见竖版工牌。
  DEFAULT_WIDTH_MM = 54
  DEFAULT_HEIGHT_MM = 85
  # 下限保证内容放得下，上限防止把页面撑爆。
  MIN_SIZE_MM = 20
  MAX_SIZE_MM = 200

  validates :width_mm, :height_mm,
            numericality: {
              only_integer: true,
              greater_than_or_equal_to: MIN_SIZE_MM,
              less_than_or_equal_to: MAX_SIZE_MM,
              message: "需在 #{MIN_SIZE_MM}–#{MAX_SIZE_MM}mm 之间"
            },
            allow_nil: true

  validates :raw_input, presence: { message: "请先输入个人资料" }
  validate :portrait_must_be_supported_image

  # 保证读出来总是 11 个 key 齐全的 Hash，视图不用做 nil 判断。
  def normalized_data
    stored = data.presence || {}
    FIELDS.index_with { |f| stored[f].presence || FIELD_DEFAULTS[f] }
  end

  def filled_count
    normalized_data.count { |_, v| v.present? }
  end

  def width
    width_mm.presence || DEFAULT_WIDTH_MM
  end

  def height
    height_mm.presence || DEFAULT_HEIGHT_MM
  end

  def default_size?
    width == DEFAULT_WIDTH_MM && height == DEFAULT_HEIGHT_MM
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
