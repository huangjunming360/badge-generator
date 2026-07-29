class Api::V1::PasswordsController < Api::BaseController
  def update
    user = Current.user

    unless user.authenticate(params[:current_password])
      return render json: { errors: [ "当前密码错误" ] }, status: :unprocessable_content
    end

    if user.update(password: params[:new_password], password_confirmation: params[:new_password_confirmation])
      render json: { message: "密码已更新" }
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_content
    end
  end
end
