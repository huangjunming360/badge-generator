class Api::BaseController < ActionController::API
  include ActionController::Cookies
  include Authentication
  skip_before_action :require_authentication

  rescue_from ActiveRecord::RecordNotFound do
    render json: { errors: [ "记录不存在" ] }, status: :not_found
  end

  rescue_from ActionController::ParameterMissing do |e|
    render json: { errors: [ e.message ] }, status: :bad_request
  end

  before_action :require_api_authentication

  private

  def require_api_authentication
    unless authenticated?
      render json: { errors: [ "请先登录" ] }, status: :unauthorized
    end
  end

  def render_error(messages, status:)
    render json: { errors: Array(messages) }, status: status
  end
end
