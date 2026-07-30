# frozen_string_literal: true

class TemplateDesignMessage < ApplicationRecord
  ROLES = %w[user assistant system].freeze
  STATES = %w[queued processing complete cancelled failed].freeze

  belongs_to :template_design_session
  belongs_to :template_generation_job, optional: true
  has_many_attached :reference_assets

  validates :role, inclusion: { in: ROLES }
  validates :state, inclusion: { in: STATES }
  validates :content, length: { maximum: 8_000 }
  validate :metadata_is_hash

  scope :queued, -> { where(role: "user", state: "queued").order(created_at: :asc) }

  private

  def metadata_is_hash
    errors.add(:metadata, "必须是对象") unless metadata.is_a?(Hash)
  end
end
