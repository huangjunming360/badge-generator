class SettingsController < ApplicationController
  # 要求登录才能切换模型
  before_action :require_authentication

  def update
    models = available_models
    index  = params[:model_index].to_i

    if index >= 0 && index < models.length
      selected = models[index]
      # 检查用户权限等级：用户 level ≤ 模型 level 才可访问
      if authenticated? && selected["level"].to_i < Current.user.model_level.to_i
        return head :forbidden
      end
      session[:selected_model] = selected
    end

    head :ok
  end

  private

  def available_models
    Rails.application.config.x.models["models"] || []
  end
  helper_method :available_models
end
