class Api::V1::ProgressController < Api::BaseController
  skip_before_action :require_api_authentication

  def show
    tracker = ProgressTracker.new(params[:id])
    render json: tracker.get
  end
end
