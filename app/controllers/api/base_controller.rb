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
      return render json: { errors: [ "请先登录" ] }, status: :unauthorized
    end

    user = Current.user
    return unless user

    if user.banned?
      terminate_session
      return render json: { errors: [ "账号已被封禁" ] }, status: :forbidden
    end

    if !user.active?
      terminate_session
      return render json: { errors: [ "账号尚未激活" ] }, status: :forbidden
    end
  end

  def render_error(messages, status:)
    render json: { errors: Array(messages) }, status: status
  end
end
