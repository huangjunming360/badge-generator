class BadgeTemplateVersion < ApplicationRecord
  SOURCE_KINDS = %w[manual ai_generated ai_repaired rollback].freeze
  MAX_SEMANTIC_FIELDS = 24
  FIELD_KEY = /\A[a-z][a-z0-9_]{0,63}\z/.freeze
  DEFAULT_SEMANTIC_FIELDS = [
    { "key" => "participant_name", "label" => "姓名" },
    { "key" => "participant_name_en", "label" => "英文名" },
    { "key" => "organization", "label" => "单位" },
    { "key" => "host_organization", "label" => "组织机构" },
    { "key" => "host_department", "label" => "组织部门" },
    { "key" => "event_topic", "label" => "项目主题" },
    { "key" => "event_topic_en", "label" => "项目主题英文" }
  ].freeze

  belongs_to :badge_template
  belongs_to :created_by, class_name: "User"
  has_many :cards, dependent: :restrict_with_error

  validates :version, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: :badge_template_id }
  validates :source_html, presence: true, length: { maximum: BadgeTemplateRenderer::MAX_HTML_BYTES }
  validates :source_css, length: { maximum: BadgeTemplateRenderer::MAX_CSS_BYTES }
  validates :source_kind, inclusion: { in: SOURCE_KINDS }
  validate :semantic_fields_are_a_contract
  validate :source_is_safe

  def semantic_field_keys
    self.class.semantic_field_keys(semantic_fields)
  end

  def self.semantic_field_keys(fields)
    Array(fields).filter_map do |field|
      field["key"].to_s.presence if field.is_a?(Hash)
    end
  end

  def self.semantic_fields_or_default(fields)
    fields.presence || DEFAULT_SEMANTIC_FIELDS
  end

  private

  def source_is_safe
    report = BadgeTemplateRenderer.validate_source(source_html, source_css, semantic_fields: semantic_fields)
    self.validation_report = report
    return if report.fetch("valid")

    report.fetch("errors").each { |message| errors.add(:base, message) }
  end

  def semantic_fields_are_a_contract
    fields = semantic_fields
    unless fields.is_a?(Array)
      errors.add(:semantic_fields, "必须是字段数组")
      return
    end
    if fields.empty?
      errors.add(:semantic_fields, "至少声明一个语义字段")
      return
    end
    if fields.length > MAX_SEMANTIC_FIELDS
      errors.add(:semantic_fields, "最多声明 #{MAX_SEMANTIC_FIELDS} 个语义字段")
      return
    end

    keys = fields.filter_map do |field|
      unless field.is_a?(Hash) && field["key"].is_a?(String) && field["label"].is_a?(String)
        errors.add(:semantic_fields, "每个字段都必须包含 key 和 label")
        next
      end
      key = field["key"].strip
      label = field["label"].strip
      errors.add(:semantic_fields, "字段 key 格式无效") unless key.match?(FIELD_KEY)
      errors.add(:semantic_fields, "字段 label 长度需为 1-80 个字符") unless label.length.between?(1, 80)
      default_value = field["default_value"]
      errors.add(:semantic_fields, "默认值必须是字符串") if default_value.present? && !default_value.is_a?(String)
      key
    end
    errors.add(:semantic_fields, "字段 key 不能重复") if keys.length != keys.uniq.length
  end
end
