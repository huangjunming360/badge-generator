# 前端 SPA 入口。所有非 /admin /api 的路径都渲染前端的 index.html。
class FrontendController < ApplicationController
  allow_unauthenticated_access
  skip_before_action :require_active_user

  def index
    render file: Rails.root.join("public/app.html"), layout: false
  end
end
