class Admin::PermissionsController < Admin::BaseController
  def index
    @users = User.order(:model_level, :email_address)
  end

  def update
    @user = User.find(params[:id])
    if @user.admin?
      return redirect_to admin_permissions_path, alert: "管理员权限不可修改"
    end
    if @user.update(model_level: params[:model_level].to_i)
      redirect_to admin_permissions_path, notice: "#{@user.email_address} 权限已更新"
    else
      redirect_to admin_permissions_path, alert: "更新失败"
    end
  end
end
