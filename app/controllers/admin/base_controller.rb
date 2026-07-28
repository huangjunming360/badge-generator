class Admin::BaseController < ApplicationController
  before_action :require_admin

  private

  def validate_models_config!(raw)
    errors = []

    unless raw.is_a?(Hash)
      return [ "配置必须是 JSON 对象" ]
    end

    unless raw["default"].is_a?(String) && raw["default"].present?
      errors << "缺少 default 字段或不是有效字符串"
    end

    unless raw["models"].is_a?(Array) && raw["models"].any?
      errors << "models 字段必须是数组且至少有一个模型"
    end

    raw["models"]&.each_with_index do |m, i|
      if m["id"].blank?
        errors << "模型 #{i + 1}: 缺少 id"
      end
      if m["label"].blank?
        errors << "模型 #{i + 1}: 缺少 label"
      end
      if m["api"].blank?
        errors << "模型 #{m["id"] || i + 1}: 缺少 api (anthropic/openai)"
      end
      if m["model"].blank?
        errors << "模型 #{m["id"] || i + 1}: 缺少 model 名称"
      end
    end

    errors
  end

  def require_admin
    resume_session || request_authentication

    user = Current.user
    if user.nil?
      redirect_to root_path, alert: "无权访问管理后台"
    elsif user.banned?
      terminate_session
      redirect_to new_session_path, alert: "账号已被封禁"
    elsif !user.active?
      redirect_to root_path, alert: "账号尚未激活"
    elsif !user.admin?
      redirect_to root_path, alert: "无权访问管理后台"
    end
  end
end
