class GpuNode < ApplicationRecord
  has_secure_password :token, validations: false
  has_many :template_generation_jobs, dependent: :restrict_with_error

  validates :node_key, presence: true, uniqueness: true, length: { maximum: 80 }, format: { with: /\A[a-z0-9][a-z0-9-]*\z/ }
  validates :name, presence: true, length: { maximum: 120 }
  validate :desired_config_is_hash

  def effective_desired_config
    { "paused" => false, "max_iterations" => 3, "max_concurrency" => 1 }.merge(desired_config || {})
  end

  def online?
    last_seen_at.present? && last_seen_at > 2.minutes.ago
  end

  def ready_for_visual_repair?
    online? && active? && effective_desired_config.fetch("paused") == false &&
      capabilities.to_h["mai_ready"] == true && capabilities.to_h["renderer_ready"] == true
  end

  private

  def desired_config_is_hash
    errors.add(:desired_config, "必须是对象") unless desired_config.is_a?(Hash)
  end
end
