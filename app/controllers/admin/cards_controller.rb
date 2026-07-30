class Admin::CardsController < Admin::BaseController
  PER_PAGE = 30

  def index
    scope = Card.includes(:user).order(created_at: :desc)
    # 管理视角：默认看全部用户的卡片，可按用户筛选。
    if params[:user_id].present?
      scope = scope.where(user_id: params[:user_id])
      @filtered_user = User.find_by(id: params[:user_id])
    end

    @total = scope.count
    @page = [ params[:page].to_i, 1 ].max
    @pages = (@total / PER_PAGE.to_f).ceil
    @cards = scope.limit(PER_PAGE).offset((@page - 1) * PER_PAGE)
    @users = User.order(:email_address).pluck(:email_address, :id).map { |email, id| [ email, id ] }
  end

  def destroy
    card = Card.find(params[:id])
    card.destroy!
    redirect_back fallback_location: admin_cards_path, notice: "记录已删除"
  end

  def batch_destroy
    ids = Array(params[:ids]).reject(&:blank?)
    if ids.empty?
      redirect_to admin_cards_path, alert: "未选择任何记录"
      return
    end
    count = Card.where(id: ids).destroy_all.size
    redirect_to admin_cards_path, notice: "已删除 #{count} 条记录"
  end
end
