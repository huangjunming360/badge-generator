# frozen_string_literal: true

# Centralizes the later ordinary-user template rollout. Admins are never
# limited here; every non-admin action is gated by a server-side setting.
class TemplateDesignPolicy
  class AccessDenied < StandardError; end
  class QuotaExceeded < StandardError; end

  DEFAULT_TEMPLATE_LIMIT = 10
  DEFAULT_SESSION_LIMIT = 10
  DEFAULT_MONTHLY_GENERATION_LIMIT = 3
  DEFAULT_REFERENCE_ASSET_LIMIT = 4
  DEFAULT_CONCURRENT_GENERATION_LIMIT = 1

  def self.ensure_design_access!(user)
    return if user.admin?
    return if Setting.bool("user_templates_enabled", default: false)

    raise AccessDenied, "普通用户模板设计尚未开放"
  end

  def self.ensure_template_capacity!(user)
    ensure_design_access!(user)
    return if user.admin?

    limit = setting_limit("user_template_limit", DEFAULT_TEMPLATE_LIMIT)
    return if user.owned_badge_templates.count < limit

    raise QuotaExceeded, "已达到可创建模板数量上限（#{limit}）"
  end

  def self.ensure_session_capacity!(user)
    ensure_design_access!(user)
    return if user.admin?

    limit = setting_limit("user_template_session_limit", DEFAULT_SESSION_LIMIT)
    return if user.template_design_sessions.count < limit

    raise QuotaExceeded, "已达到设计会话数量上限（#{limit}）"
  end

  def self.ensure_generation_capacity!(user, include_concurrency: true)
    ensure_design_access!(user)
    return if user.admin?

    limit = setting_limit("user_template_generation_monthly_limit", DEFAULT_MONTHLY_GENERATION_LIMIT)
    used = planned_generation_count(user)
    raise QuotaExceeded, "本月 AI 模板生成额度已用完（#{limit} 次）" if used >= limit

    return unless include_concurrency

    concurrent_limit = setting_limit("user_template_concurrent_generation_limit", DEFAULT_CONCURRENT_GENERATION_LIMIT)
    active = user.template_generation_jobs.where(status: TemplateDesignSession::ACTIVE_JOB_STATUSES).count
    return if active < concurrent_limit

    raise QuotaExceeded, "正在处理的设计任务已达到并发上限（#{concurrent_limit}）"
  end

  def self.reference_asset_limit(user)
    return TemplateGenerationJob::MAX_REFERENCE_ASSETS if user.admin?

    setting_limit("user_template_reference_asset_limit", DEFAULT_REFERENCE_ASSET_LIMIT)
      .clamp(0, TemplateGenerationJob::MAX_REFERENCE_ASSETS)
  end

  def self.settings_payload
    {
      enabled: Setting.bool("user_templates_enabled", default: false),
      template_limit: setting_limit("user_template_limit", DEFAULT_TEMPLATE_LIMIT),
      session_limit: setting_limit("user_template_session_limit", DEFAULT_SESSION_LIMIT),
      reference_asset_limit: setting_limit("user_template_reference_asset_limit", DEFAULT_REFERENCE_ASSET_LIMIT)
        .clamp(0, TemplateGenerationJob::MAX_REFERENCE_ASSETS),
      concurrent_generation_limit: setting_limit("user_template_concurrent_generation_limit", DEFAULT_CONCURRENT_GENERATION_LIMIT),
      monthly_generation_limit: setting_limit("user_template_generation_monthly_limit", DEFAULT_MONTHLY_GENERATION_LIMIT)
    }
  end

  def self.setting_limit(key, default)
    value = Setting.get(key, default: default).to_i
    value.clamp(0, 1_000)
  end

  def self.planned_generation_count(user)
    dispatched = user.template_generation_jobs.where(job_type: "template_generation", created_at: Time.current.all_month).count
    queued = user.template_design_sessions.joins(:messages)
      .where(template_design_messages: { state: "queued", created_at: Time.current.all_month }).count
    dispatched + queued
  end
  private_class_method :planned_generation_count
end
