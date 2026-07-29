# 前端 SPA 入口。所有非 /admin /api /rails 的路径都渲染 public/index.html。
# nginx 部署时这个控制器不会被命中——静态文件直接由 nginx 托管。
class FrontendController < ApplicationController
  # SPA 路由不受管理员检查限制，/setup 页面通过 API 自行判断
  skip_before_action :check_admin_exists
  allow_unauthenticated_access
  skip_before_action :require_active_user

  def index
    render file: Rails.root.join("public/index.html"), layout: false
  end
end
