class RegistrationsController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
  skip_before_action :require_active_user, only: %i[new create]
  before_action :check_registration_open, only: %i[new create]

  def new
    @user = User.new
  end

  def create
    @user = User.new(user_params)
    @user.role = "user"
    @user.model_level = 4
    @user.active = false
    if @user.save
      start_new_session_for @user
      redirect_to root_path, notice: "注册成功"
    else
      render :new, status: :unprocessable_content
    end
  end

  private

  def check_registration_open
    unless Setting.bool("allow_registration", default: true)
      redirect_to new_session_path, alert: "注册已关闭"
    end
  end

  def user_params
    params.require(:user).permit(:email_address, :password, :password_confirmation)
  end
end
