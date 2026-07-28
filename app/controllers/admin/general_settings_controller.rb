class Admin::GeneralSettingsController < Admin::BaseController
  # 布尔类型的设置项
  BOOL_KEYS = %i[allow_registration require_login_for_models mineru_enabled].freeze
  # 文本类型的设置项
  TEXT_KEYS = %i[site_title mineru_model extract_model portrait_model allowed_extensions].freeze

  def show
    @settings = {}
    BOOL_KEYS.each { |k| @settings[k] = Setting.bool(k.to_s) }
    TEXT_KEYS.each { |k| @settings[k] = Setting.get(k.to_s) }
    @all_models = all_models_for_select
  end

  def update
    BOOL_KEYS.each { |k| Setting.set(k.to_s, params[k] == "1" ? "true" : "false") }
    TEXT_KEYS.each { |k| Setting.set(k.to_s, params[k].to_s) if params[k].present? }

    redirect_to admin_general_settings_path, notice: "设置已保存"
  end

  private

  def all_models_for_select
    models = Rails.application.config.x.models["models"] || []
    models.map { |m| [ m["label"], m["id"] ] }
  end
end
