class Api::V1::SessionsController < Api::BaseController
  skip_before_action :require_api_authentication, only: %i[show create]

  def show
    if authenticated?
      render json: {
        user: {
          email_address: Current.user.email_address,
          admin: Current.user.admin?,
          model_level: Current.user.model_level,
          model_level_label: Current.user.model_level_label
        }
      }
    else
      render json: { user: nil }, status: :ok
    end
  end

  def create
    user = User.authenticate_by(params.permit(:email_address, :password))

    if user.nil?
      return render json: { errors: [ "邮箱或密码错误" ] }, status: :unauthorized
    end

    if user.banned?
      return render json: { errors: [ "账号已被封禁" ] }, status: :unauthorized
    end

    unless user.active?
      return render json: { errors: [ "账号尚未激活" ] }, status: :unauthorized
    end

    start_new_session_for user
    render json: {
      user: {
        email_address: user.email_address,
        admin: user.admin?,
        model_level: user.model_level,
        model_level_label: user.model_level_label
      }
    }
  end

  def destroy
    terminate_session
    render json: { message: "已退出登录" }
  end
end
