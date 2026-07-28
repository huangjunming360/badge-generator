class Admin::ModelsController < Admin::BaseController
  def show
    load_config
  end

  def update
    @config_path = Rails.root.join("config/models.json")
    raw = JSON.parse(File.read(@config_path))

    raw["default"] = params[:default_model]

    # 用 permit 处理 ActionController::Parameters
    models = params.fetch(:models, {}).values.map do |m|
      m.permit(:id, :label, :api, :model_name, :api_key, :api_base, :level)
    end
    raw["models"] = models.map do |m|
      {
        "id" => m["id"],
        "label" => m["label"],
        "api" => m["api"],
        "model" => m["model_name"],
        "api_key" => m["api_key"],
        "api_base" => m["api_base"],
        "level" => m["level"].to_i
      }.compact
    end

    errors = validate_models_config!(raw)
    unless errors.empty?
      load_config
      flash.now[:alert] = "配置校验失败: #{errors.join('; ')}"
      return render :show, status: :unprocessable_content
    end

    File.write(@config_path, JSON.pretty_generate(raw) + "\n")
    # 重新加载配置
    Rails.application.config.x.models = {
      "default" => raw["default"],
      "models"  => raw["models"]
    }

    redirect_to admin_models_path, notice: "模型配置已保存"
  rescue JSON::ParserError, StandardError => e
    load_config
    flash.now[:alert] = "保存失败: #{e.message}"
    render :show, status: :unprocessable_content
  end

  private

  def load_config
    @config_path = Rails.root.join("config/models.json")
    raw = JSON.parse(File.read(@config_path))
    @models = raw["models"] || []
    @default_model = raw["default"]
    @config_content = JSON.pretty_generate(raw)
  rescue
    @models = []
    @default_model = nil
    @config_content = "{}"
  end
end
