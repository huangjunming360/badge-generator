class Api::V1::Internal::TemplateAgentController < ActionController::API
  # This endpoint is intentionally not user-session authenticated: it is an
  # outbound-only service-account protocol for the private GPU node.
  before_action :require_node_authentication

  rescue_from ActiveRecord::RecordNotFound do
    render json: { errors: [ "记录不存在" ] }, status: :not_found
  end

  def heartbeat
    @node.update!(
      capabilities: normalized_capabilities,
      last_seen_at: Time.current
    )
    renewing = renew_current_lease!
    claimed = TemplateGenerationJob.claim_next_for!(@node) if ready_for_visual_repair? && !renewing
    render json: {
      desired_config: @node.effective_desired_config,
      cancel_current_job: cancelled_current_job?,
      job: claimed && job_payload(*claimed)
    }
  end

  def complete
    job = @node.template_generation_jobs.find(params[:id])
    result = completion_params[:report]&.to_h || {}
    unless valid_node_report?(result)
      return render json: { errors: [ "视觉审计报告格式无效或过大" ] }, status: :unprocessable_content
    end
    if completion_params[:status] == "succeeded"
      source_html = completion_params[:source_html].to_s
      source_css = completion_params[:source_css].to_s
      report = BadgeTemplateRenderer.validate_source(source_html, source_css, semantic_fields: job.payload.fetch("semantic_fields", BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS))
      return render json: { errors: report.fetch("errors") }, status: :unprocessable_content unless report.fetch("valid")

      result = result.merge("source_html" => source_html, "source_css" => source_css, "validation_report" => report)
    end
    unless job.complete_from_node!(@node, lease_token: completion_params[:lease_token], status: completion_params[:status], result: result, error: completion_params[:error])
      return render json: { errors: [ "任务租约无效或已过期" ] }, status: :conflict
    end

    complete_parent_generation!(job, result, completion_params[:status], completion_params[:error])
    head :no_content
  end

  private

  def require_node_authentication
    node_key = request.headers["X-Template-Agent-Node"].to_s
    token = request.authorization.to_s.delete_prefix("Bearer ").strip
    @node = GpuNode.find_by!(node_key: node_key)
    return if @node.active? && @node.authenticate_token(token)

    render json: { errors: [ "节点认证失败" ] }, status: :unauthorized
  end

  def heartbeat_params
    params.permit(:current_job_id, :sent_at,
                  capabilities: [ :gpu_name, :vram_mb, :mai_ready, :renderer_ready,
                                  :agent_model_id, :agent_model_ready, :agent_model_error, :agent_version ])
  end

  def completion_params
    params.permit(:lease_token, :status, :source_html, :source_css, :error, report: {})
  end

  def valid_node_report?(report)
    report = report.to_h.deep_stringify_keys
    return false unless report.is_a?(Hash)
    return false if JSON.generate(report).bytesize > 256.kilobytes

    stop_reason = report["stop_reason"]
    return true if stop_reason.blank?

    iterations = report["iterations"] || report[:iterations]
    return false if iterations && (!iterations.is_a?(Array) || iterations.length > 200 || iterations.any? { |item| !item.is_a?(Hash) })

    %w[visual_check_passed no_visual_improvement time_budget_exhausted max_iterations_reached model_call_budget_exhausted].include?(stop_reason.to_s)
  rescue JSON::GeneratorError, TypeError
    false
  end

  def job_payload(job, lease_token)
    payload = job.payload
    {
      id: job.id.to_s,
      lease_token: lease_token,
      job_type: job.job_type,
      requirement: payload["requirement"].to_s,
      diagnostics: payload["diagnostics"].to_s,
      complexity: job.complexity,
      source_html: payload["source_html"].to_s,
      source_css: payload["source_css"].to_s,
      width_mm: payload.fetch("width_mm", 55).to_i,
      height_mm: payload.fetch("height_mm", 85).to_i,
      reference_notes: payload.fetch("reference_notes", "").to_s,
      semantic_fields: payload.fetch("semantic_fields", BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS)
    }
  end

  def normalized_capabilities
    capabilities = heartbeat_params.fetch(:capabilities, {}).to_h
    %w[mai_ready renderer_ready agent_model_ready].each do |key|
      capabilities[key] = ActiveModel::Type::Boolean.new.cast(capabilities[key]) if capabilities.key?(key)
    end
    capabilities["vram_mb"] = capabilities["vram_mb"].to_i if capabilities["vram_mb"].present?
    capabilities["agent_model_id"] = capabilities["agent_model_id"].to_s.truncate(120).presence
    capabilities["agent_model_error"] = capabilities["agent_model_error"].to_s.truncate(300).presence
    capabilities
  end

  def renew_current_lease!
    job_id = heartbeat_params[:current_job_id].presence
    return false unless job_id

    @node.template_generation_jobs.find_by(id: job_id)&.renew_node_lease!(@node) || false
  end

  # A cancelled job deliberately retains its node association until this
  # heartbeat, allowing an outbound-only node to receive a reliable stop
  # command without exposing an inbound endpoint.
  def cancelled_current_job?
    job_id = heartbeat_params[:current_job_id].presence
    return false unless job_id

    @node.template_generation_jobs.where(id: job_id, status: "cancelled").exists?
  end

  def ready_for_visual_repair?
    @node.ready_for_visual_repair?
  end

  def complete_parent_generation!(job, result, status, error)
    parent_id = job.payload.to_h["parent_generation_job_id"]
    return if parent_id.blank?

    parent = job.requested_by.template_generation_jobs.find_by(id: parent_id, job_type: "template_generation")
    return unless parent

    parent.with_lock do
      return unless parent.status == "waiting_for_visual_review"

      if status == "succeeded"
        reviewed = parent.result.to_h.merge(
          "html" => result.fetch("source_html"),
          "css" => result.fetch("source_css"),
          "validation_report" => result.fetch("validation_report"),
          "visual_review" => result
        )
        parent.update!(status: "succeeded", stage: "review_ready", stage_message: "视觉检查已完成，等待人工审核", result: reviewed, completed_at: Time.current)
        parent.template_design_session&.finish_job!(parent, succeeded: true, proposal: reviewed)
      else
        parent.update!(status: "failed", stage: "visual_review", stage_message: "视觉检查失败", error_message: error.to_s.truncate(2_000), completed_at: Time.current)
        parent.template_design_session&.finish_job!(parent, succeeded: false, error: error)
      end
    end
  end
end
