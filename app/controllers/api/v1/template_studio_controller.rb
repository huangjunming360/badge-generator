class Api::V1::TemplateStudioController < Api::BaseController
  rate_limit to: 10, within: 1.hour, only: :generate,
    with: -> { render json: { errors: [ "模板生成请求过于频繁，请稍后再试" ] }, status: :too_many_requests }

  before_action :ensure_design_access
  before_action :load_template, only: %i[show update archive]

  def index
    render json: { templates: Current.user.owned_badge_templates.order(updated_at: :desc).map { |template| BadgeTemplateSerializer.new(template).admin_detail } }
  end

  def show
    render json: { template: BadgeTemplateSerializer.new(@template).admin_detail }
  end

  def create
    TemplateDesignPolicy.ensure_template_capacity!(Current.user)
    template = nil
    BadgeTemplate.transaction do
      template = Current.user.owned_badge_templates.create!(template_params.merge(visibility: "private"))
      create_version!(template)
      TemplateAssetBinder.attach_generation_assets!(
        template: template,
        user: Current.user,
        generation_job_id: params[:generation_job_id]
      )
    end
    render json: { template: BadgeTemplateSerializer.new(template).admin_detail }, status: :created
  rescue TemplateDesignPolicy::QuotaExceeded => e
    render json: { errors: [ e.message ] }, status: :too_many_requests
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
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

  def archive
    @template.update!(status: "archived")
    render json: { template: BadgeTemplateSerializer.new(@template).admin_detail }
  end

  def generate
    TemplateDesignPolicy.ensure_generation_capacity!(Current.user)
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
    render json: { job: job_payload(job) }, status: :accepted
  rescue TemplateDesignPolicy::QuotaExceeded => e
    render json: { errors: [ e.message ] }, status: :too_many_requests
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  private

  def ensure_design_access
    TemplateDesignPolicy.ensure_design_access!(Current.user)
  rescue TemplateDesignPolicy::AccessDenied => e
    render json: { errors: [ e.message ] }, status: :forbidden
  end

  def load_template
    @template = Current.user.owned_badge_templates.find(params[:id])
  end

  def template_params
    params.require(:badge_template).permit(:name, :orientation, :width_mm, :height_mm)
  end

  def source_params
    params.fetch(:source, ActionController::Parameters.new).permit(:source_html, :source_css,
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
      source_kind: "manual"
    )
  end

  def generation_params
    params.permit(:requirement, :complexity, :reference_notes, :model_id, :width_mm, :height_mm,
                  semantic_fields: [ :key, :label, :default_value ])
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

  def validated_reference_assets
    assets = Array(params[:reference_assets]).compact
    return [] if assets.empty?
    limit = TemplateDesignPolicy.reference_asset_limit(Current.user)
    if assets.length > limit
      render json: { errors: [ "参考素材最多上传 #{limit} 个" ] }, status: :unprocessable_content
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

  def job_payload(job)
    { id: job.id, status: job.status, stage: job.stage, stage_message: job.stage_message, created_at: job.created_at.iso8601 }
  end
end
