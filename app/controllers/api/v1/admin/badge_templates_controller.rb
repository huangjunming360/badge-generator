class Api::V1::Admin::BadgeTemplatesController < Api::BaseController
  rate_limit to: 10, within: 1.hour, only: :enqueue_visual_repair,
    with: -> { render json: { errors: [ "视觉修复请求过于频繁，请稍后再试" ] }, status: :too_many_requests }
  rate_limit to: 10, within: 1.hour, only: :generate,
    with: -> { render json: { errors: [ "模板生成请求过于频繁，请稍后再试" ] }, status: :too_many_requests }

  before_action :require_api_admin
  before_action :load_template, only: %i[show update publish archive compare rollback enqueue_visual_repair]

  def index
    templates = Current.user.owned_badge_templates.order(updated_at: :desc)
    render json: { templates: templates.map { |template| BadgeTemplateSerializer.new(template).admin_detail } }
  end

  def show
    render json: { template: BadgeTemplateSerializer.new(@template).admin_detail }
  end

  def create
    template = nil
    BadgeTemplate.transaction do
      template = Current.user.owned_badge_templates.create!(template_params)
      create_version!(template)
      TemplateAssetBinder.attach_generation_assets!(
        template: template,
        user: Current.user,
        generation_job_id: params[:generation_job_id]
      )
    end
    render json: { template: BadgeTemplateSerializer.new(template).admin_detail }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def generate
    values = generation_params.to_h
    requirement = values["requirement"].to_s.strip
    raise ActionController::ParameterMissing, "requirement" if requirement.blank?
    model_id = values["model_id"].presence
    return unless template_model_available?(model_id)
    assets = validated_reference_assets
    return if performed?

    job = Current.user.template_generation_jobs.create!(
      job_type: "template_generation",
      complexity: values.fetch("complexity", 5).to_i.clamp(1, 10),
      payload: {
        "requirement" => requirement.truncate(4_000),
        "reference_notes" => values.fetch("reference_notes", "").to_s.truncate(8_000),
        "model_id" => model_id,
        "width_mm" => values.fetch("width_mm", 55).to_f.clamp(20, 200),
        "height_mm" => values.fetch("height_mm", 85).to_f.clamp(20, 200),
        "semantic_fields" => values["semantic_fields"].presence || BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS
      }
    )
    job.reference_assets.attach(assets) if assets.present?
    render json: { job: generation_job_payload(job) }, status: :accepted
  rescue ActiveRecord::RecordInvalid, BadgeTemplateGenerator::Error, LlmService::Error => e
    render json: { errors: [ e.message ] }, status: :unprocessable_content
  end

  def update
    BadgeTemplate.transaction do
      @template.update!(template_params)
      create_version!(@template) if source_params[:source_html].present? || source_params.key?(:source_css)
      TemplateAssetBinder.attach_generation_assets!(
        template: @template,
        user: Current.user,
        generation_job_id: params[:generation_job_id]
      )
    end
    render json: { template: BadgeTemplateSerializer.new(@template).admin_detail }
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def publish
    version = @template.versions.find(params.require(:version_id))
    @template.publish!(version)
    render json: { template: BadgeTemplateSerializer.new(@template).admin_detail }
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def archive
    @template.update!(status: "archived")
    render json: { template: BadgeTemplateSerializer.new(@template).admin_detail }
  end

  def compare
    base = @template.versions.find(params.require(:base_version_id))
    target = @template.versions.find(params.require(:target_version_id))
    render json: {
      base: BadgeTemplateSerializer.new(@template).version_detail(base),
      target: BadgeTemplateSerializer.new(@template).version_detail(target),
      changed: {
        html: base.source_html != target.source_html,
        css: base.source_css != target.source_css
      }
    }
  end

  def rollback
    source = @template.versions.find(params.require(:version_id))
    version = nil
    BadgeTemplate.transaction do
      version = @template.versions.create!(
        created_by: Current.user,
        version: @template.next_version_number,
        source_html: source.source_html,
        source_css: source.source_css,
        source_kind: "rollback"
      )
      @template.update!(status: "draft")
    end
    render json: { version: BadgeTemplateSerializer.new(@template).version_detail(version) }, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def enqueue_visual_repair
    version = @template.versions.find(params.require(:version_id))
    report = BadgeTemplateRenderer.validate_source(version.source_html, version.source_css, semantic_fields: version.semantic_fields)
    return render json: { errors: report.fetch("errors") }, status: :unprocessable_content unless report.fetch("valid")

    job = Current.user.template_generation_jobs.create!(
      badge_template: @template,
      job_type: "visual_repair",
      complexity: visual_repair_params.fetch(:complexity, 5).to_i.clamp(1, 10),
      payload: {
        "source_html" => version.source_html,
        "source_css" => version.source_css,
        "diagnostics" => visual_repair_params[:diagnostics].to_s.truncate(4_000),
        "requirement" => visual_repair_params[:requirement].to_s.truncate(4_000),
        "width_mm" => @template.width_mm,
        "height_mm" => @template.height_mm,
        "semantic_fields" => version.semantic_fields
      }
    )
    render json: { job: job_payload(job) }, status: :accepted
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  private

  def load_template
    @template = Current.user.owned_badge_templates.find(params[:id])
  end

  def template_params
    params.require(:badge_template).permit(:name, :orientation, :width_mm, :height_mm)
  end

  def source_params
    params.fetch(:source, ActionController::Parameters.new).permit(:source_html, :source_css, :source_kind,
                                                                   semantic_fields: [ :key, :label, :default_value ])
  end

  def create_version!(template)
    source = source_params
    raise ActionController::ParameterMissing, "source" if source[:source_html].blank?

    template.versions.create!(
      created_by: Current.user,
      version: template.next_version_number,
      source_html: source[:source_html],
      source_css: source[:source_css].to_s,
      semantic_fields: source[:semantic_fields].presence || template.versions.order(version: :desc).pick(:semantic_fields) || BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS,
      source_kind: source[:source_kind].presence || "manual"
    )
  end

  def visual_repair_params
    params.permit(:version_id, :complexity, :diagnostics, :requirement)
  end

  def generation_params
    params.permit(:requirement, :complexity, :reference_notes, :model_id, :width_mm, :height_mm,
                  semantic_fields: [ :key, :label, :default_value ])
  end

  def validated_reference_assets
    assets = Array(params[:reference_assets]).compact
    return [] if assets.empty?
    if assets.length > TemplateGenerationJob::MAX_REFERENCE_ASSETS
      render json: { errors: [ "参考素材最多上传 #{TemplateGenerationJob::MAX_REFERENCE_ASSETS} 个" ] }, status: :unprocessable_content
      return []
    end

    invalid = assets.find do |asset|
      !TemplateGenerationJob::REFERENCE_ASSET_TYPES.include?(asset.content_type.to_s) || asset.size.to_i > TemplateGenerationJob::MAX_REFERENCE_ASSET_BYTES
    end
    if invalid
      render json: { errors: [ "参考素材只支持 PNG/JPEG/WebP，单个不超过 #{TemplateGenerationJob::MAX_REFERENCE_ASSET_BYTES / 1.megabyte}MB" ] }, status: :unprocessable_content
      return []
    end
    assets
  end

  def template_model_available?(model_id)
    return true if model_id.blank?

    model = (Rails.application.config.x.models || {}).fetch("models", []).find { |entry| entry["id"] == model_id }
    unless model
      render json: { errors: [ "未知的模型" ] }, status: :unprocessable_content
      return false
    end

    return true if model["level"].to_i >= Current.user.model_level.to_i || model["level"].to_i.negative?

    render json: { errors: [ "无权限使用该模型" ] }, status: :forbidden
    false
  end

  def job_payload(job)
    {
      id: job.id,
      status: job.status,
      job_type: job.job_type,
      complexity: job.complexity,
      attempts: job.attempts,
      result: job.result,
      error_message: job.error_message,
      created_at: job.created_at.iso8601
    }
  end

  def generation_job_payload(job)
    job_payload(job).merge(stage: job.stage, stage_message: job.stage_message, stage_results: job.stage_results)
  end
end
