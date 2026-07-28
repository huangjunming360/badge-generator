class Admin::BaseController < ApplicationController
  before_action :require_admin

  private

  def require_admin
    resume_session || request_authentication
    unless Current.user&.admin?
      redirect_to root_path, alert: "无权访问管理后台"
    end
  end
end
