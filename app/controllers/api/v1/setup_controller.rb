class Api::V1::SetupController < Api::BaseController
  skip_before_action :require_api_authentication

  def show
    render json: { needs_setup: User.admins.none? }
  end

  def create
    if User.admins.any?
      return render json: { errors: ["管理员已存在"] }, status: :forbidden
    end

    user = User.new(admin_params)
    user.role = "admin"
    user.active = true

    if user.save
      start_new_session_for user
      render json: {
        user: {
          email_address: user.email_address,
          admin: true,
          model_level: 0,
          model_level_label: "最高"
        }
      }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_content
    end
  end

  private

  def admin_params
    params.permit(:email_address, :password, :password_confirmation)
  end
end
