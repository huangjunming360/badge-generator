class Admin::GeneralSettingsController < Admin::BaseController
  SETTINGS_KEYS = %i[
    site_title allow_registration require_login_for_models
    mineru_enabled mineru_model extract_model portrait_model
    allowed_extensions
  ].freeze

  def show
    @settings = {}
    SETTINGS_KEYS.each do |key|
      @settings[key] = Setting.get(key.to_s)
    end
  end

  def update
    SETTINGS_KEYS.each do |key|
      val = params[key]
      Setting.set(key.to_s, val.is_a?(String) ? val : (val == "1" ? "true" : "false"))
    end

    redirect_to admin_general_settings_path, notice: "设置已保存"
  end
end
