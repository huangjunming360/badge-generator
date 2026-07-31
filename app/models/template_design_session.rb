# frozen_string_literal: true

class TemplateDesignSession < ApplicationRecord
  STATUSES = %w[active completed archived].freeze
  ACTIVE_JOB_STATUSES = %w[queued leased waiting_for_visual_review].freeze

  belongs_to :owner, class_name: "User"
  has_many :messages, class_name: "TemplateDesignMessage", dependent: :destroy
  has_many :template_generation_jobs, dependent: :restrict_with_error
  has_many_attached :reference_assets

  validates :name, presence: true, length: { maximum: 80 }
  validates :status, inclusion: { in: STATUSES }
  validate :configuration_is_hash

  def queue_user_message!(content:, assets: [], configuration: nil)
    transaction do
      update!(configuration: configuration) if configuration.present?
      message = messages.create!(role: "user", state: "queued", content: content.to_s.strip)
      message.reference_assets.attach(assets) if assets.present?
      dispatch_next_message!
      message
    end
  end

  def dispatch_next_message!
    with_lock do
      return if template_generation_jobs.where(status: ACTIVE_JOB_STATUSES).exists?

      message = messages.queued.first
      return unless message

      config = effective_configuration
      job = owner.template_generation_jobs.create!(
        template_design_session: self,
        job_type: "template_generation",
        complexity: config.fetch("complexity"),
        payload: {
          "requirement" => message.content.truncate(4_000),
          "reference_notes" => config.fetch("reference_notes"),
          "model_id" => config["model_id"],
          "width_mm" => config.fetch("width_mm"),
          "height_mm" => config.fetch("height_mm"),
          "semantic_fields" => config.fetch("semantic_fields"),
          "design_message_id" => message.id
        }
      )
      job.reference_assets.attach(reference_assets.blobs + message.reference_assets.blobs)
      message.update!(state: "processing", template_generation_job: job)
      job
    end
  end

  def finish_job!(job, succeeded:, proposal: nil, error: nil)
    with_lock do
      message = messages.find_by(template_generation_job: job)
      message&.update!(state: succeeded ? "complete" : "failed")
      messages.create!(
        role: "assistant",
        state: succeeded ? "complete" : "failed",
        content: succeeded ? "已完成这一轮设计，并生成了可审核草案。" : "这一轮设计未完成：#{error.to_s.truncate(300)}",
        metadata: succeeded ? { "proposal" => proposal.to_h.slice("html", "css", "notes", "validation_report"), "job_id" => job.id } : { "job_id" => job.id, "error" => error.to_s.truncate(2_000) }
      )
      dispatch_next_message!
    end
  end

  def interrupt_and_dispatch!
    with_lock do
      template_generation_jobs.where(status: ACTIVE_JOB_STATUSES).find_each do |job|
        job.cancel!
      end
      messages.where(state: "processing").update_all(state: "cancelled", updated_at: Time.current)
      dispatch_next_message!
    end
  end

  def effective_configuration
    {
      "complexity" => 5,
      "reference_notes" => "",
      "width_mm" => 55,
      "height_mm" => 85,
      "semantic_fields" => BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS
    }.merge(configuration || {}).tap do |config|
      config["complexity"] = config["complexity"].to_i.clamp(1, 10)
      config["width_mm"] = config["width_mm"].to_f.clamp(20, 200)
      config["height_mm"] = config["height_mm"].to_f.clamp(20, 200)
      config["reference_notes"] = config["reference_notes"].to_s.truncate(8_000)
    end
  end

  private

  def configuration_is_hash
    errors.add(:configuration, "必须是对象") unless configuration.is_a?(Hash)
  end
end
