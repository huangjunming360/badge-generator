class Admin::PermissionsController < Admin::BaseController
  def index
    @levels = User::MODEL_LEVELS
    @model_counts = count_by_level(config_models, "level")
    @user_counts = count_by_level(User.all, "model_level")
  end

  private

  def config_models
    Rails.application.config.x.models["models"] || []
  end

  def count_by_level(collection, attr)
    counts = Hash.new(0)
    collection.each { |item| counts[item.is_a?(Hash) ? (item[attr] || 0).to_i : item.send(attr).to_i] += 1 }
    counts
  end
end
