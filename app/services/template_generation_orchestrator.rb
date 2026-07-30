# frozen_string_literal: true

# Runs the server-side part of a template generation workflow. Visual review is
# deliberately separate and is delegated to the private GPU node.
class TemplateGenerationOrchestrator
  def self.run(job)
    new(job).run
  end

  def initialize(job, generator: BadgeTemplateGenerator.new)
    @job = job
    @generator = generator
  end

  def run(lease_token: nil)
    @lease_token = lease_token
    return unless lease_valid?

    @job.update!(started_at: Time.current, stage: "queued")
    payload = @job.payload.to_h
    @job.advance_stage!("understanding", message: "正在整理需求和复杂度约束", result: understanding_result(payload))
    renew_lease!
    @job.advance_stage!("generating", message: "正在生成视觉草案")
    proposal = @generator.generate(
      requirement: payload.fetch("requirement"),
      complexity: @job.complexity,
      reference_notes: payload["reference_notes"],
      model_id: payload["model_id"],
      width_mm: payload["width_mm"],
      height_mm: payload["height_mm"],
      reference_assets: @job.reference_assets
    )
    @job.advance_stage!("validating", message: "正在检查模板安全性和可渲染性", result: proposal.fetch("validation_report"))
    renew_lease!
    visual_job = enqueue_visual_review!(proposal, payload)
    @job.advance_stage!("visual_review", message: visual_node_available? ? "已交给视觉节点进行隔离检查" : "等待视觉节点连接后进行隔离检查", result: { "job_id" => visual_job.id, "node_connected" => visual_node_available? })
    @job.update!(status: "waiting_for_visual_review", result: proposal, lease_token_digest: nil, lease_expires_at: nil)
  rescue StandardError => e
    fail_job!(e)
  end

  private

  def lease_valid?
    if @lease_token.present?
      @job.server_lease_valid?(@lease_token)
    elsif @job.status == "queued"
      @lease_token = @job.claim_for_server!
      @lease_token.present?
    else
      false
    end
  end

  def renew_lease!
    @job.renew_server_lease!(@lease_token)
  end

  def fail_job!(error)
    return unless @lease_token.present? && @job.server_lease_valid?(@lease_token)

    @job.update!(status: "failed", stage_message: error.message.to_s.truncate(200), error_message: error.message.to_s.truncate(2_000), completed_at: Time.current, lease_token_digest: nil, lease_expires_at: nil)
  end

  def enqueue_visual_review!(proposal, payload)
    @job.requested_by.template_generation_jobs.create!(
      job_type: "visual_repair",
      complexity: @job.complexity,
      payload: {
        "source_html" => proposal.fetch("html"),
        "source_css" => proposal.fetch("css"),
        "diagnostics" => "自动视觉检查：检查溢出、重叠、低对比度、分辨率和布局问题；仅在确有问题时修复。",
        "requirement" => payload.fetch("requirement").to_s,
        "width_mm" => payload.fetch("width_mm", 55),
        "height_mm" => payload.fetch("height_mm", 85),
        "parent_generation_job_id" => @job.id
      }
    )
  end

  def understanding_result(payload)
    {
      "requirement" => payload.fetch("requirement").to_s.truncate(4_000),
      "complexity" => @job.complexity,
      "model_id" => payload["model_id"],
      "reference_notes_present" => payload["reference_notes"].to_s.present?,
      "canvas" => { "width_mm" => payload.fetch("width_mm", 55), "height_mm" => payload.fetch("height_mm", 85) },
      "reference_assets_count" => @job.reference_assets.count
    }
  end

  def visual_node_available?
    GpuNode.where(active: true).where.not(last_seen_at: nil).where("last_seen_at > ?", 2.minutes.ago).exists?
  end
end
