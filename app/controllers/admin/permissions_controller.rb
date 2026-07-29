class Admin::PermissionsController < Admin::BaseController
  def show
    @levels = User.model_levels
  end

  def update
    if params[:levels].present?
      incoming = params[:levels].to_unsafe_h.transform_keys(&:to_i)

      # 保留 internal 等级（界面不可见，保存时不会提交）
      User.model_levels.each do |key, info|
        incoming[key] = info if info[:internal]
      end

      Setting.set("level_definitions", incoming.to_json)
      Rails.cache.delete("level_definitions") if Rails.cache
      redirect_to admin_permissions_path, notice: "权限等级设置已更新"
    else
      redirect_to admin_permissions_path, alert: "保存失败"
    end
  end
end
