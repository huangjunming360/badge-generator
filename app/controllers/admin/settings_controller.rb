class Admin::SettingsController < Admin::BaseController
  def edit
    @config_path = Rails.root.join("config/models.json")
    @config_content = File.exist?(@config_path) ? File.read(@config_path) : "{}"
  end

  def update
    @config_path = Rails.root.join("config/models.json")
    content = params[:config_content]
    if content.blank?
      return redirect_to edit_admin_settings_path, alert: "配置内容不能为空"
    end
    begin
      parsed = JSON.parse(content)
      errors = validate_models_config!(parsed)
      unless errors.empty?
        return redirect_to edit_admin_settings_path, alert: "配置校验失败:\n#{errors.join("\n")}"
      end
      File.write(@config_path, content)
      load_models_config!
      redirect_to edit_admin_settings_path, notice: "模型配置已更新"
    rescue JSON::ParserError => e
      redirect_to edit_admin_settings_path, alert: "JSON 格式错误: #{e.message}"
    end
  end

  private

  def load_models_config!
    raw = JSON.parse(File.read(Rails.root.join("config/models.json")))
    Rails.application.config.x.models = {
      "default" => raw["default"],
      "models"  => raw["models"] || []
    }
  end
end
