class BadgeTemplateVersion < ApplicationRecord
  SOURCE_KINDS = %w[manual ai_generated ai_repaired rollback].freeze

  belongs_to :badge_template
  belongs_to :created_by, class_name: "User"
  has_many :cards, dependent: :restrict_with_error

  validates :version, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: :badge_template_id }
  validates :source_html, presence: true, length: { maximum: BadgeTemplateRenderer::MAX_HTML_BYTES }
  validates :source_css, length: { maximum: BadgeTemplateRenderer::MAX_CSS_BYTES }
  validates :source_kind, inclusion: { in: SOURCE_KINDS }
  validate :source_is_safe

  private

  def source_is_safe
    report = BadgeTemplateRenderer.validate_source(source_html, source_css)
    self.validation_report = report
    return if report.fetch("valid")

    report.fetch("errors").each { |message| errors.add(:base, message) }
  end
end
