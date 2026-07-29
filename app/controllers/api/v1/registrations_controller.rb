class Api::V1::RegistrationsController < Api::BaseController
  skip_before_action :require_api_authentication, only: :create

  def create
    unless Setting.bool("allow_registration", default: true)
      return render json: { errors: [ "注册已关闭" ] }, status: :forbidden
    end

    user = User.new(reg_params)
    user.role = "user"
    user.model_level = 4
    user.active = false
    if user.save
      start_new_session_for user
      render json: {
        user: {
          email_address: user.email_address,
          admin: user.admin?,
          model_level: user.model_level,
          model_level_label: user.model_level_label
        }
      }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_content
    end
  end

  private

  def reg_params
    params.permit(:email_address, :password, :password_confirmation)
  end
end
