# Card → JSON。刻意不用 as_json 平铺数据库列：
# 客户端要的是领域概念，不该重复实现模型层的默认值与回落逻辑。
#
# portrait 给相对路径，不拼绝对 URL —— 前后端分离下两边永远同源
# （开发期 vite 代理，生产 nginx 反代），拼上 Rails 自己的 host
# 反而会指向后端端口、变成跨域请求。
class CardSerializer
  include Rails.application.routes.url_helpers

  def initialize(card)
    @card = card
  end

  # 列表用：不含 raw_input。它可能是整份简历或 OCR 全文，
  # 放进列表会让响应体膨胀到不可用。
  def as_summary
    ai = @card.data.presence&.dig("_ai_fields")
    {
      id: @card.id,
      fields: @card.normalized_data,
      ai_fields: ai&.map { |f| f.slice("key", "value", "label", "icon", "selected") },
      filled_count: @card.filled_count,
      source_name: @card.source_name,
      used_ocr: !!@card.used_ocr,
      width_mm: @card.width,
      height_mm: @card.height,
      default_size: @card.default_size?,
      portrait: portrait_payload,
      badge_template: template_payload,
      created_at: @card.created_at&.iso8601,
      updated_at: @card.updated_at&.iso8601
    }
  end

  def as_detail
    as_summary.merge(raw_input: @card.raw_input)
  end

  private

  # 返回 URL 而不是 base64：附件上限 5MB，base64 后约 6.7MB，
  # 会让 JSON 解析和列表接口失控，且 URL 可被浏览器缓存。
  def portrait_payload
    return nil unless @card.portrait.attached?

    blob = @card.portrait.blob
    {
      # proxy 而非 redirect：Disk service 的签名 URL 只有 5 分钟有效期，
      # 前端可能把地址存在 state 里稍后才渲染。
      # 给相对路径而不是给绝对 URL：开发期前端跑在 vite（5173/8080），
      # Rails 在 8000。拿 request.base_url 拼出来的是 http://127.0.0.1:8000/…，
      # 浏览器从前端那个源去加载就是跳域，而 vite 代理只管相对路径请求，
      # 绝对地址会绕过代理直连 8000，被同源策略拦下、<img> 加载失败。
      # 相对路径交由浏览器按当前源解析，开发过 vite 代理、
      # 生产过 nginx 反代，两边都同源，也就不需要 CORS。
      url: rails_storage_proxy_url(@card.portrait, only_path: true),
      filename: blob.filename.to_s,
      content_type: blob.content_type,
      byte_size: blob.byte_size
    }
  end

  def template_payload
    return nil unless @card.badge_template && @card.badge_template_version

    {
      id: @card.badge_template.id,
      name: @card.badge_template.name,
      version_id: @card.badge_template_version.id,
      version: @card.badge_template_version.version
    }
  end
end
