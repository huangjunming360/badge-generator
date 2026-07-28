class SettingsController < ApplicationController
  allow_unauthenticated_access
  def update
    models = available_models
    index  = params[:model_index].to_i

    if index >= 0 && index < models.length
      session[:selected_model] = models[index]
    end

    respond_to do |format|
      format.html { redirect_back fallback_location: root_path }
      format.turbo_stream { head :ok }
    end
  end

  private

  def available_models
    Rails.application.config.x.models["models"] || []
  end
  helper_method :available_models
end
