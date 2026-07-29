class Api::V1::ProgressController < Api::BaseController
  def show
    tracker = ProgressTracker.new(params[:id], user_id: Current.user&.id)
    render json: tracker.get
  end
end
