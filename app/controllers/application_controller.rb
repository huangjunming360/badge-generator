class ApplicationController < ActionController::Base
  include Authentication
  allow_browser versions: :modern
  stale_when_importmap_changes
  before_action :check_admin_exists, :require_active_user

  helper_method :all_models, :default_model_id, :default_model_label

  private

  def check_admin_exists
    return if Rails.env.test?
    return if admin_signed_in? || admin_being_created?
    return if User.admins.any?
    Rails.logger.warn("[Setup] 无管理员，跳转 /setup")
    redirect_to "/setup", allow_other_host: false
  end

  def admin_signed_in?
    authenticated? && Current.user&.admin?
  end

  def admin_being_created?
    controller_name == "setup" || request.path.start_with?("/api/v1/setup", "/setup", "/assets", "/up")
  end

  def all_models
    Rails.application.config.x.models["models"] || []
  end

  def default_model_id
    Rails.application.config.x.models["default"]
  end

  def default_model_label
    models = all_models
    default = models.find { |m| m["id"] == default_model_id } || models.first
    default ? default["label"] : "未配置"
  end
end
