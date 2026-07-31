class GpuNode < ApplicationRecord
  DEFAULT_DESIRED_CONFIG = {
    "paused" => false,
    # 200 is a hard ceiling, not an instruction to keep repairing. The node
    # stops earlier on a clean render, no improvement, cancellation, or budget.
    "max_iterations" => 200,
    "max_model_calls" => 400,
    "max_concurrency" => 1,
    # The selected model and its public-compatible endpoint are control-plane
    # settings. Credentials never enter this record or leave the GPU host.
    "claude_model_id" => nil,
    "claude_model" => nil,
    "claude_base_url" => nil
  }.freeze

  has_secure_password :token, validations: false
  has_many :template_generation_jobs, dependent: :restrict_with_error

  validates :node_key, presence: true, uniqueness: true, length: { maximum: 80 }, format: { with: /\A[a-z0-9][a-z0-9-]*\z/ }
  validates :name, presence: true, length: { maximum: 120 }
  validate :desired_config_is_hash

  def effective_desired_config
    configured = desired_config.to_h
    DEFAULT_DESIRED_CONFIG.merge(
      "paused" => ActiveModel::Type::Boolean.new.cast(
        configured.fetch("paused", DEFAULT_DESIRED_CONFIG.fetch("paused"))
      ),
      "max_iterations" => configured.fetch("max_iterations", DEFAULT_DESIRED_CONFIG.fetch("max_iterations")).to_i.clamp(1, 200),
      "max_model_calls" => configured.fetch("max_model_calls", DEFAULT_DESIRED_CONFIG.fetch("max_model_calls")).to_i.clamp(1, 400),
      # The current worker is deliberately single-process. Do not advertise
      # concurrency that the Python node cannot honor.
      "max_concurrency" => 1,
      "claude_model_id" => configured["claude_model_id"].presence,
      "claude_model" => configured["claude_model"].presence,
      "claude_base_url" => configured["claude_base_url"].presence
    )
  end

  def online?
    last_seen_at.present? && last_seen_at > 2.minutes.ago
  end

  def ready_for_visual_repair?
    online? && active? && effective_desired_config.fetch("paused") == false &&
      capabilities.to_h["mai_ready"] == true && capabilities.to_h["renderer_ready"] == true &&
      capabilities.to_h["agent_model_ready"] == true
  end

  private

  def desired_config_is_hash
    errors.add(:desired_config, "必须是对象") unless desired_config.is_a?(Hash)
  end
end
