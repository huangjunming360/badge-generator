# 挂牌展示。仅在开发环境中公开访问，生产环境需先补鉴权。
class CardsController < ApplicationController
  before_action :require_authentication
  before_action :check_admin_exists

  def show
    @card = Current.user.cards.find(params[:id])
    render layout: "public"
  rescue ActiveRecord::RecordNotFound
    render plain: "挂牌不存在", status: :not_found
  end
end
