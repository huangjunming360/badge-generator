class Admin::GeneralSettingsController < Admin::BaseController
  # 布尔类型的设置项
  BOOL_KEYS = %i[allow_registration require_login_for_models mineru_enabled portrait_detect].freeze
  # 文本类型的设置项
  TEXT_KEYS = %i[site_title mineru_model extract_model portrait_model allowed_extensions].freeze
  # 写入 .env 的设置项
  ENV_KEYS = %w[MINERU_API_KEY].freeze

  def show
    @settings = {}
    BOOL_KEYS.each { |k| @settings[k] = Setting.bool(k.to_s) }
    TEXT_KEYS.each { |k| @settings[k] = Setting.get(k.to_s) }
    ENV_KEYS.each { |k| @settings[k] = ENV[k].presence }
    @settings[:mineru_key_configured] = ENV["MINERU_API_KEY"].present?
    @all_models = all_models_for_select
  end

  def update
    BOOL_KEYS.each { |k| Setting.set(k.to_s, params[k] == "1" ? "true" : "false") }
    TEXT_KEYS.each { |k| Setting.set(k.to_s, params[k].to_s) if params[k].present? }

    # 写入 .env
    save_env_file(params)

    redirect_to admin_general_settings_path, notice: "设置已保存"
  end

  private

  def save_env_file(params)
    env_path = Rails.root.join(".env")
    content = File.exist?(env_path) ? File.read(env_path) : ""

    ENV_KEYS.each do |key|
      val = params[key]
      next if val.nil?

      if val.blank?
        # 删除该行
        content = content.gsub(/^#{key}=.*\n?/, "")
      elsif content.match?(/^#{key}=/m)
        content = content.gsub(/^#{key}=.*$/, "#{key}=#{val}")
      else
        content += "\n#{key}=#{val}"
      end
    end

    File.write(env_path, content.strip + "\n") unless content == File.read(env_path)
  rescue => e
    Rails.logger.warn("写入 .env 失败: #{e.message}")
  end

  def all_models_for_select
    models = Rails.application.config.x.models["models"] || []
    models.map { |m| [ m["label"], m["id"] ] }
  end
end
