# frozen_string_literal: true

# Centralizes the later ordinary-user template rollout. Admins are never
# limited here; every non-admin action is gated by a server-side setting.
class TemplateDesignPolicy
  class AccessDenied < StandardError; end
  class QuotaExceeded < StandardError; end

  DEFAULT_TEMPLATE_LIMIT = 10
  DEFAULT_MONTHLY_GENERATION_LIMIT = 3

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

  def self.ensure_generation_capacity!(user)
    ensure_design_access!(user)
    return if user.admin?

    limit = setting_limit("user_template_generation_monthly_limit", DEFAULT_MONTHLY_GENERATION_LIMIT)
    used = user.template_generation_jobs.where(job_type: "template_generation", created_at: Time.current.all_month).count
    return if used < limit

    raise QuotaExceeded, "本月 AI 模板生成额度已用完（#{limit} 次）"
  end

  def self.settings_payload
    {
      enabled: Setting.bool("user_templates_enabled", default: false),
      template_limit: setting_limit("user_template_limit", DEFAULT_TEMPLATE_LIMIT),
      monthly_generation_limit: setting_limit("user_template_generation_monthly_limit", DEFAULT_MONTHLY_GENERATION_LIMIT)
    }
  end

  def self.setting_limit(key, default)
    value = Setting.get(key, default: default).to_i
    value.clamp(0, 1_000)
  end
end
