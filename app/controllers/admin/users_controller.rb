class Admin::UsersController < Admin::BaseController
  def index
    @users = User.order(created_at: :desc)
  end

  def new
    @user = User.new
  end

  def create
    @user = User.new(user_params)
    if @user.save
      redirect_to admin_users_path, notice: "用户创建成功"
    else
      render :new, status: :unprocessable_content
    end
  end

  def toggle_active
    @user = User.find(params[:id])
    @user.active? ? @user.deactivate! : @user.activate!
    redirect_to admin_users_path, notice: "用户状态已更新"
  end

  def toggle_ban
    @user = User.find(params[:id])
    @user.banned? ? @user.unban! : @user.ban!
    redirect_to admin_users_path, notice: "用户封禁状态已更新"
  end

  def destroy
    @user = User.find(params[:id])
    @user.destroy!
    redirect_to admin_users_path, notice: "用户已删除"
  end

  private

  def user_params
    params.require(:user).permit(:email_address, :password, :password_confirmation, :role)
  end
end
