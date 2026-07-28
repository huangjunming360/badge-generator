class SettingsController < ApplicationController
  # 根据设置决定是否要求登录
  before_action :enforce_login_if_required, only: :update

  def update
    models = available_models
    index  = params[:model_index].to_i

    if index >= 0 && index < models.length
      session[:selected_model] = models[index]
    end

    respond_to do |format|
      format.html { redirect_back fallback_location: root_path }
      format.turbo_stream { head :ok }
    end
  end

  private

  def enforce_login_if_required
    return unless Setting.bool("require_login_for_models", default: false)
    resume_session || request_authentication
  end

  def available_models
    Rails.application.config.x.models["models"] || []
  end
  helper_method :available_models
end
