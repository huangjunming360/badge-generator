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
        semantic_fields: @job.payload.fetch("semantic_fields", BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS),
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

  # A reviewed generation is only ever materialized as an unpublished private
  # draft. Publishing remains a separate, explicit administrator action.
  def create_draft
    return render_review_required unless reviewed_generation_job?

    created = false
    template = nil
    version = nil

    @job.with_lock do
      audit = @job.stage_results.to_h.fetch("draft_template", {})
      if audit["template_id"].present? && audit["version_id"].present?
        template = Current.user.owned_badge_templates.find(audit.fetch("template_id"))
        version = template.versions.find(audit.fetch("version_id"))
      else
        BadgeTemplate.transaction do
          template = Current.user.owned_badge_templates.create!(
            name: draft_name,
            orientation: draft_orientation,
            width_mm: draft_dimension("width_mm", 55),
            height_mm: draft_dimension("height_mm", 85),
            status: "draft",
            visibility: "private"
          )
          version = template.versions.create!(
            created_by: Current.user,
            version: template.next_version_number,
            source_html: generated_source.fetch("html"),
            source_css: generated_source.fetch("css"),
            semantic_fields: @job.payload.fetch("semantic_fields", BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS),
            source_kind: "ai_generated"
          )
          TemplateAssetBinder.attach_generation_assets!(
            template: template,
            user: Current.user,
            generation_job_id: @job.id
          )
          @job.update!(stage_results: @job.stage_results.to_h.merge(
            "draft_template" => {
              "template_id" => template.id,
              "version_id" => version.id,
              "created_at" => Time.current.iso8601
            }
          ))
          created = true
        end
      end
    end

    render json: {
      template: BadgeTemplateSerializer.new(template).admin_detail,
      version: BadgeTemplateSerializer.new(template).version_detail(version),
      generation_job_id: @job.id
    }, status: created ? :created : :ok
  rescue KeyError
    render json: { errors: [ "任务结果不完整，无法创建草稿" ] }, status: :unprocessable_content
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  private

  def load_job
    @job = Current.user.template_generation_jobs.find(params[:id])
  end

  def reviewed_generation_job?
    @job.generation_job? && @job.status == "succeeded" && @job.stage == "review_ready"
  end

  def render_review_required
    render json: { errors: [ "仅视觉审核完成的生成任务可以创建草稿" ] }, status: :unprocessable_content
  end

  def generated_source
    @job.result.to_h
  end

  def draft_name
    requested = params.permit(:name)[:name].to_s.squish
    return requested.truncate(80) if requested.present?

    requirement = @job.payload.to_h["requirement"].to_s.squish
    return "AI 模板草稿" if requirement.blank?

    "AI 草稿：#{requirement}".truncate(80)
  end

  def draft_dimension(key, fallback)
    @job.payload.to_h.fetch(key, fallback).to_f.round.clamp(Card::MIN_SIZE_MM, Card::MAX_SIZE_MM)
  end

  def draft_orientation
    draft_dimension("width_mm", 55) > draft_dimension("height_mm", 85) ? "landscape" : "portrait"
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
