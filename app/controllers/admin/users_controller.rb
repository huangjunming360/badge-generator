class Admin::UsersController < Admin::BaseController
  def index
    @users = User.order(created_at: :desc)
  end

  def batch
    ids = params[:user_ids]&.split(",")&.map(&:to_i)&.compact
    return redirect_to admin_users_path, alert: "未选择用户" if ids.blank?

    users = User.where(id: ids).where.not(id: Current.user.id)  # 不能操作自己
    case params[:batch_action]
    when "ban"    then users.update_all(banned_at: Time.current)
    when "unban"  then users.update_all(banned_at: nil)
    when "activate"   then users.update_all(active: true)
    when "deactivate" then users.update_all(active: false)
    end
    redirect_to admin_users_path, notice: "已处理 #{users.count} 个用户"
  end

  def new
    @user = User.new
  end

  def create
    @user = User.new(user_params)
    @user.role = (params[:user]&.[](:role) || "user")
    @user.model_level = (params[:user]&.[](:model_level) || 4).to_i
    if @user.save
      redirect_to admin_users_path, notice: "用户创建成功"
    else
      render :new, status: :unprocessable_content
    end
  end

  def toggle_role
    @user = User.find(params[:id])
    return redirect_to admin_users_path, alert: "不能操作自己的账号" if @user == Current.user
    @user.update!(role: @user.admin? ? "user" : "admin")
    redirect_to admin_users_path, notice: "角色已更新"
  end

  def update_level
    @user = User.find(params[:id])
    return redirect_to admin_users_path, alert: "不能操作自己的账号" if @user == Current.user
    if @user.update(model_level: params[:model_level].to_i)
      redirect_to admin_users_path, notice: "权限等级已更新"
    else
      redirect_to admin_users_path, alert: "更新失败"
    end
  end

  def reset_password
    @user = User.find(params[:id])
    return redirect_to admin_users_path, alert: "不能重置自己的密码" if @user == Current.user
    new_pw = params[:new_password].to_s.strip
    return redirect_to admin_users_path, alert: "密码至少 6 位" if new_pw.length < 6
    if @user.update(password: new_pw, password_confirmation: new_pw)
      redirect_to admin_users_path, notice: "密码已重置"
    else
      redirect_to admin_users_path, alert: @user.errors.full_messages.first
    end
  end

  def toggle_active
    @user = User.find(params[:id])
    return redirect_to admin_users_path, alert: "不能操作自己的账号" if @user == Current.user
    @user.active? ? @user.deactivate! : @user.activate!
    redirect_to admin_users_path, notice: "用户状态已更新"
  end

  def toggle_ban
    @user = User.find(params[:id])
    return redirect_to admin_users_path, alert: "不能操作自己的账号" if @user == Current.user
    @user.banned? ? @user.unban! : @user.ban!
    redirect_to admin_users_path, notice: "用户封禁状态已更新"
  end

  def destroy
    @user = User.find(params[:id])
    return redirect_to admin_users_path, alert: "不能删除自己的账号" if @user == Current.user
    @user.destroy!
    redirect_to admin_users_path, notice: "用户已删除"
  end

  private

  def user_params
    params.require(:user).permit(:email_address, :password, :password_confirmation)
  end
end
