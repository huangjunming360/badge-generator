class Admin::GeneralSettingsController < Admin::BaseController
  def show
    @settings = {
      site_title: Setting.get("site_title", default: "Badge Generator"),
      allow_registration: Setting.bool("allow_registration", default: true),
      require_login_for_models: Setting.bool("require_login_for_models", default: false)
    }
  end

  def update
    Setting.set("site_title", params[:site_title])
    Setting.set("allow_registration", params[:allow_registration] == "1")
    Setting.set("require_login_for_models", params[:require_login_for_models] == "1")

    redirect_to admin_settings_path, notice: "设置已保存"
  end
end
