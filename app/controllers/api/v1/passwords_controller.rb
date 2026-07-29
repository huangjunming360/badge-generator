class Api::V1::PasswordsController < Api::BaseController
  rate_limit to: 5, within: 10.minutes, only: :update,
    with: -> { render json: { errors: [ "尝试次数过多" ] }, status: :too_many_requests }

  def update
    user = Current.user

    unless user.authenticate(params[:current_password])
      return render json: { errors: [ "当前密码错误" ] }, status: :unprocessable_content
    end

    if user.update(password: params[:new_password], password_confirmation: params[:new_password_confirmation])
      user.sessions.where.not(id: Current.session&.id).destroy_all  # 踢掉其他设备
      render json: { message: "密码已更新" }
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_content
    end
  end
end
