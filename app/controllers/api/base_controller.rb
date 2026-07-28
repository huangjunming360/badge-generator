# JSON API 的独立基类。
#
# 刻意不继承 ApplicationController：那里的 allow_browser 是 before_action，
# 遇到无法识别或过旧的 UA 会回 406 且响应体是 HTML 页面，
# JSON 客户端拿到的不是 JSON。API 也不需要 importmap 相关的 ETag 逻辑。
#
# 用 ActionController::API 而非 Base，天然不带 CSRF token 校验、
# cookie session 和视图层。
class Api::BaseController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound do
    render_error("记录不存在", status: :not_found)
  end

  rescue_from ActionController::ParameterMissing do |e|
    render_error(e.message, status: :bad_request)
  end

  private

  # 统一错误格式，客户端只需认 errors 数组。
  def render_error(messages, status:)
    render json: { errors: Array(messages) }, status: status
  end
end
