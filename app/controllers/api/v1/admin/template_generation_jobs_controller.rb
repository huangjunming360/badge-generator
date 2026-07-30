class Api::V1::Admin::TemplateGenerationJobsController < Api::BaseController
  before_action :require_api_admin
  before_action :load_job

  def show
    render json: { job: job_payload(@job) }
  end

  def apply
    unless @job.status == "succeeded" && @job.badge_template
      return render json: { errors: [ "任务尚未产生可应用的修复结果" ] }, status: :unprocessable_content
    end

    template = Current.user.owned_badge_templates.find(@job.badge_template_id)
    result = @job.result.to_h
    version = nil
    BadgeTemplate.transaction do
      version = template.versions.create!(
        created_by: Current.user,
        version: template.next_version_number,
        source_html: result.fetch("source_html"),
        source_css: result.fetch("source_css"),
        source_kind: "ai_repaired"
      )
    end
    render json: {
      version: BadgeTemplateSerializer.new(template).version_detail(version)
    }, status: :created
  rescue KeyError
    render json: { errors: [ "任务结果不完整，无法应用" ] }, status: :unprocessable_content
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  private

  def load_job
    @job = Current.user.template_generation_jobs.find(params[:id])
  end

  def job_payload(job)
    {
      id: job.id,
      badge_template_id: job.badge_template_id,
      job_type: job.job_type,
      status: job.status,
      stage: job.stage,
      stage_message: job.stage_message,
      stage_results: job.stage_results,
      complexity: job.complexity,
      attempts: job.attempts,
      result: job.result,
      error_message: job.error_message,
      created_at: job.created_at.iso8601,
      completed_at: job.completed_at&.iso8601
    }
  end
end
