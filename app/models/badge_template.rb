class BadgeTemplate < ApplicationRecord
  ORIENTATIONS = %w[portrait landscape].freeze
  STATUSES = %w[draft published archived].freeze
  VISIBILITIES = %w[private public].freeze

  belongs_to :owner, class_name: "User"
  belongs_to :published_version, class_name: "BadgeTemplateVersion", optional: true
  has_many :versions, class_name: "BadgeTemplateVersion", dependent: :destroy
  has_many :cards, dependent: :restrict_with_error

  validates :name, presence: true, length: { maximum: 80 }
  validates :orientation, inclusion: { in: ORIENTATIONS }
  validates :status, inclusion: { in: STATUSES }
  validates :visibility, inclusion: { in: VISIBILITIES }
  validates :width_mm, :height_mm,
            numericality: { only_integer: true, greater_than_or_equal_to: Card::MIN_SIZE_MM,
                            less_than_or_equal_to: Card::MAX_SIZE_MM }
  validate :published_version_belongs_to_template

  scope :published, -> { where(status: "published").where.not(published_version_id: nil) }
  scope :publicly_available, -> { published.where(visibility: "public") }

  def self.visible_to(user)
    publicly_available.or(where(owner: user))
  end

  def next_version_number
    versions.maximum(:version).to_i + 1
  end

  def publish!(version)
    raise ActiveRecord::RecordInvalid, version unless version.badge_template_id == id

    transaction do
      update!(published_version: version, status: "published")
    end
  end

  private

  def published_version_belongs_to_template
    return unless published_version
    return if published_version.badge_template_id == id

    errors.add(:published_version, "必须属于当前模板")
  end
end
