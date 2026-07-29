# 公开挂牌展示。不继承 API 的 require_authentication，
# 挂牌页是公开访问的。
class CardsController < ApplicationController
  # 挂牌页供分享/预览，无需登录
  skip_before_action :check_admin_exists, :require_authentication, only: :show

  def show
    @card = Card.find(params[:id])
    render layout: "public"
  rescue ActiveRecord::RecordNotFound
    render plain: "挂牌不存在", status: :not_found
  end
end
