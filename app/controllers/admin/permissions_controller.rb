class Admin::PermissionsController < Admin::BaseController
  def show
    @levels = User.model_levels
  end

  def update
    if params[:levels].present?
      levels = params[:levels].to_unsafe_h.transform_keys(&:to_i)
      Setting.set("level_definitions", levels.to_json)
      # 重新加载 User 的等级缓存
      Rails.cache.delete("level_definitions") if Rails.cache
      redirect_to admin_permissions_path, notice: "权限等级设置已更新"
    else
      redirect_to admin_permissions_path, alert: "保存失败"
    end
  end
end
