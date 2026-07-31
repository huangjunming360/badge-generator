class TemplateGenerationJob < ApplicationRecord
  JOB_TYPES = %w[template_generation visual_repair].freeze
  GENERATION_STAGES = %w[queued understanding generating validating visual_review review_ready].freeze
  STATUSES = %w[queued leased waiting_for_visual_review succeeded failed cancelled].freeze
  LEASE_DURATION = 10.minutes
  REFERENCE_ASSET_TYPES = %w[image/png image/jpeg image/webp].freeze
  MAX_REFERENCE_ASSETS = 4
  MAX_REFERENCE_ASSET_BYTES = 8.megabytes

  belongs_to :requested_by, class_name: "User"
  belongs_to :badge_template, optional: true
  belongs_to :gpu_node, optional: true
  belongs_to :template_design_session, optional: true
  has_many_attached :reference_assets

  validates :job_type, inclusion: { in: JOB_TYPES }
  validates :status, inclusion: { in: STATUSES }
  validates :stage, inclusion: { in: GENERATION_STAGES }
  validates :complexity, numericality: { only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: 10 }
  validate :payload_is_safe_shape

  scope :available_for_node, -> { where(status: "queued", job_type: "visual_repair").order(created_at: :asc) }
  scope :available_for_server, -> { where(status: "queued", job_type: "template_generation").order(created_at: :asc) }

  def advance_stage!(name, message:, result: nil)
    raise ArgumentError, "无效的生成阶段" unless GENERATION_STAGES.include?(name.to_s)

    updates = { stage: name, stage_message: message.to_s.truncate(200), updated_at: Time.current }
    updates[:stage_results] = stage_results.to_h.merge(name.to_s => result) if result
    updates[:started_at] = Time.current if name.to_s == "understanding" && started_at.blank?
    update!(updates)
  end

  def generation_job?
    job_type == "template_generation"
  end

  def self.claim_next_for!(node)
    transaction do
      where(status: "leased").where("lease_expires_at < ?", Time.current).update_all(
        status: "queued", gpu_node_id: nil, lease_token_digest: nil, lease_expires_at: nil, updated_at: Time.current
      )
      job = available_for_node.lock.first
      return nil unless job

      lease_token = SecureRandom.urlsafe_base64(32)
      job.update!(
        status: "leased",
        gpu_node: node,
        lease_token_digest: BCrypt::Password.create(lease_token),
        lease_expires_at: LEASE_DURATION.from_now,
        attempts: job.attempts + 1
      )
      [ job, lease_token ]
    end
  end

  # Template generation runs on the Rails side. The lease makes a process
  # restart recoverable without allowing a GPU node to pick up a server task.
  def self.claim_next_for_server!
    transaction do
      where(job_type: "template_generation", status: "leased", gpu_node_id: nil)
        .where("lease_expires_at < ?", Time.current)
        .update_all(status: "queued", lease_token_digest: nil, lease_expires_at: nil, updated_at: Time.current)
      job = available_for_server.lock.first
      return nil unless job

      lease_token = job.claim_for_server!
      return nil unless lease_token

      [ job, lease_token ]
    end
  end

  def claim_for_server!
    with_lock do
      return nil unless generation_job? && status == "queued" && gpu_node_id.nil?

      lease_token = SecureRandom.urlsafe_base64(32)
      update!(
        status: "leased",
        lease_token_digest: BCrypt::Password.create(lease_token),
        lease_expires_at: LEASE_DURATION.from_now,
        attempts: attempts + 1
      )
      lease_token
    end
  end

  def lease_valid_for?(node, token)
    return false unless leased? && gpu_node_id == node.id && lease_expires_at&.future? && token.present? && lease_token_digest.present?

    BCrypt::Password.new(lease_token_digest).is_password?(token)
  end

  def renew_node_lease!(node)
    with_lock do
      return false unless leased? && gpu_node_id == node.id && lease_expires_at&.future?

      update!(lease_expires_at: LEASE_DURATION.from_now)
      true
    end
  end

  def release_node_lease!
    with_lock do
      return false unless leased? && gpu_node_id.present?

      update!(
        status: "queued",
        gpu_node_id: nil,
        lease_token_digest: nil,
        lease_expires_at: nil
      )
      true
    end
  end

  def server_lease_valid?(token)
    return false unless generation_job? && leased? && gpu_node_id.nil? && lease_expires_at&.future? && token.present? && lease_token_digest.present?

    BCrypt::Password.new(lease_token_digest).is_password?(token)
  end

  def renew_server_lease!(token)
    with_lock do
      raise ActiveRecord::StaleObjectError, self unless server_lease_valid?(token)

      update!(lease_expires_at: LEASE_DURATION.from_now)
    end
  end

  def complete!(status:, result:, error: nil)
    raise ArgumentError, "无效的完成状态" unless %w[succeeded failed].include?(status)

    update!(
      status: status,
      result: result,
      error_message: error.to_s.truncate(2_000).presence,
      completed_at: Time.current,
      lease_token_digest: nil,
      lease_expires_at: nil
    )
  end

  private

  def leased?
    status == "leased"
  end

  def payload_is_safe_shape
    allowed = %w[source_html source_css diagnostics requirement reference_notes model_id width_mm height_mm semantic_fields parent_generation_job_id design_message_id]
    return if payload.is_a?(Hash) && payload.keys.all? { |key| allowed.include?(key.to_s) }

    errors.add(:payload, "包含不支持的字段")
  end
end
