class Admin::BaseController < ApplicationController
  before_action :require_admin

  private

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
