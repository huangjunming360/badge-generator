# frozen_string_literal: true

class Api::V1::TemplateDesignSessionsController < Api::BaseController
  rate_limit to: 12, within: 1.hour, only: %i[create append_message],
    with: -> { render json: { errors: [ "模板设计请求过于频繁，请稍后再试" ] }, status: :too_many_requests }

  before_action :ensure_design_access
  before_action :load_session, only: %i[show update append_message interrupt]

  def index
    sessions = Current.user.template_design_sessions.order(updated_at: :desc)
    render json: { sessions: sessions.map { |session| session_payload(session, include_details: false) } }
  end

  def show
    render json: { session: session_payload(@session, include_details: true) }
  end

  def create
    TemplateDesignPolicy.ensure_session_capacity!(Current.user)
    TemplateDesignPolicy.ensure_generation_capacity!(Current.user) if initial_message.present?
    session = Current.user.template_design_sessions.create!({ name: "未命名设计会话" }.merge(session_params))
    assets = validated_reference_assets
    return if performed?

    session.reference_assets.attach(assets) if assets.present?
    message = initial_message
    session.queue_user_message!(content: message) if message.present?
    render json: { session: session_payload(session.reload, include_details: true) }, status: :created
  rescue TemplateDesignPolicy::QuotaExceeded => e
    render json: { errors: [ e.message ] }, status: :too_many_requests
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def update
    @session.update!(session_params)
    render json: { session: session_payload(@session, include_details: true) }
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def append_message
    content = params.require(:content).to_s.strip
    return render json: { errors: [ "设计需求不能为空" ] }, status: :unprocessable_content if content.blank?

    TemplateDesignPolicy.ensure_generation_capacity!(Current.user)
    assets = validated_reference_assets
    return if performed?

    message = @session.queue_user_message!(content: content, assets: assets, configuration: configuration_params.presence)
    render json: { message: message_payload(message.reload), session: session_payload(@session.reload, include_details: false) }, status: :accepted
  rescue TemplateDesignPolicy::QuotaExceeded => e
    render json: { errors: [ e.message ] }, status: :too_many_requests
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def interrupt
    @session.interrupt_and_dispatch!
    render json: { session: session_payload(@session.reload, include_details: true) }
  end

  private

  def ensure_design_access
    TemplateDesignPolicy.ensure_design_access!(Current.user)
  rescue TemplateDesignPolicy::AccessDenied => e
    render json: { errors: [ e.message ] }, status: :forbidden
  end

  def load_session
    @session = Current.user.template_design_sessions.find(params[:id])
  end

  def session_params
    permitted = params.permit(:name, :status, configuration: [ :complexity, :reference_notes, :model_id, :width_mm, :height_mm,
                                                               { semantic_fields: [ :key, :label, :default_value ] } ])
    result = {}
    result[:name] = permitted[:name].to_s.truncate(80) if permitted.key?(:name)
    result[:status] = permitted[:status] if permitted.key?(:status)
    result[:configuration] = permitted[:configuration].to_h if permitted.key?(:configuration)
    result
  end

  def configuration_params
    params.fetch(:configuration, ActionController::Parameters.new).permit(:complexity, :reference_notes, :model_id, :width_mm, :height_mm,
                                                                           semantic_fields: [ :key, :label, :default_value ]).to_h
  end

  def initial_message
    params[:initial_message].to_s.strip.truncate(8_000)
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

  def session_payload(session, include_details:)
    payload = {
      id: session.id,
      name: session.name,
      status: session.status,
      configuration: session.effective_configuration,
      created_at: session.created_at.iso8601,
      updated_at: session.updated_at.iso8601,
      active_job: session.template_generation_jobs.where(status: TemplateDesignSession::ACTIVE_JOB_STATUSES).order(created_at: :desc).first.then { |job| job && job_payload(job) }
    }
    return payload unless include_details

    payload.merge(
      assets: asset_payload(session.reference_assets),
      messages: session.messages.order(created_at: :asc).map { |message| message_payload(message) },
      jobs: session.template_generation_jobs.order(created_at: :desc).map { |job| job_payload(job) }
    )
  end

  def message_payload(message)
    {
      id: message.id,
      role: message.role,
      state: message.state,
      content: message.content,
      metadata: message.metadata,
      job_id: message.template_generation_job_id,
      assets: asset_payload(message.reference_assets),
      created_at: message.created_at.iso8601
    }
  end

  def job_payload(job)
    {
      id: job.id,
      job_type: job.job_type,
      status: job.status,
      stage: job.stage,
      stage_message: job.stage_message,
      attempts: job.attempts,
      error_message: job.error_message,
      created_at: job.created_at.iso8601,
      completed_at: job.completed_at&.iso8601
    }
  end

  def asset_payload(attachments)
    attachments.map { |attachment| { id: attachment.id, name: attachment.filename.to_s, content_type: attachment.content_type, url: rails_blob_path(attachment.blob, only_path: true) } }
  end
end
