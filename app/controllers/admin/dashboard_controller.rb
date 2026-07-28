class Admin::DashboardController < Admin::BaseController
  def index
    @user_count = User.count
    @active_count = User.active_users.count
    @banned_count = User.banned.count
  end
end
