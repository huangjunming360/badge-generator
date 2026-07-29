class Admin::GeneralSettingsController < Admin::BaseController
  BOOL_KEYS = %i[allow_registration require_login_for_models mineru_enabled portrait_detect ai_fields_enabled].freeze
  TEXT_KEYS = %i[site_title mineru_model mineru_extensions extract_model portrait_model allowed_extensions].freeze
  SECRET_KEYS = %i[mineru_api_key].freeze

  def show
    @settings = {}
    BOOL_KEYS.each { |k| @settings[k] = Setting.bool(k.to_s) }
    TEXT_KEYS.each { |k| @settings[k] = Setting.get(k.to_s) }
    SECRET_KEYS.each { |k| @settings[k] = Setting.get(k.to_s) }
    @settings[:mineru_key_configured] = Setting.get("mineru_api_key").present? || ENV["MINERU_API_KEY"].present?
    @all_models = all_models_for_select
  end

  def update
    BOOL_KEYS.each { |k| Setting.set(k.to_s, params[k] == "1" ? "true" : "false") }
    TEXT_KEYS.each { |k| Setting.set(k.to_s, params.key?(k) ? params[k].to_s : Setting.get(k.to_s)) }
    SECRET_KEYS.each { |k| Setting.set(k.to_s, params[k].to_s) if params[k].present? }
    redirect_to admin_general_settings_path, notice: "设置已保存"
  end

  private

  def all_models_for_select
    models = Rails.application.config.x.models["models"] || []
    models.map { |m| [ m["label"], m["id"] ] }
  end
end
