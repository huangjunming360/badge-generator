class ApplicationController < ActionController::Base
  allow_browser versions: :modern
  stale_when_importmap_changes

  helper_method :all_models, :default_model_id, :default_model_label

  private

  def all_models
    Rails.application.config.x.models["models"] || []
  end

  def default_model_id
    Rails.application.config.x.models["default"]
  end

  def default_model_label
    models = all_models
    default = models.find { |m| m["id"] == default_model_id } || models.first
    default ? default["label"] : "未配置"
  end
end
