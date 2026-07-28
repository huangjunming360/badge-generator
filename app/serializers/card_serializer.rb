# Card → JSON。刻意不用 as_json 平铺数据库列：
# 客户端要的是领域概念，不该重复实现模型层的默认值与回落逻辑。
#
# 需要 request 上下文来生成 portrait 的绝对 URL —— 项目没配
# default_url_options[:host]，脱离 request 调 rails_blob_url 会抛
# Missing host。所以 host 由调用方（控制器）显式传入。
class CardSerializer
  include Rails.application.routes.url_helpers

  def initialize(card, host:)
    @card = card
    @host = host
  end

  # 列表用：不含 raw_input。它可能是整份简历或 OCR 全文，
  # 放进列表会让响应体膨胀到不可用。
  def as_summary
    {
      id: @card.id,
      fields: @card.normalized_data,
      filled_count: @card.filled_count,
      source_name: @card.source_name,
      used_ocr: !!@card.used_ocr,
      width_mm: @card.width,
      height_mm: @card.height,
      default_size: @card.default_size?,
      portrait: portrait_payload,
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
      url: rails_storage_proxy_url(@card.portrait, host: @host),
      filename: blob.filename.to_s,
      content_type: blob.content_type,
      byte_size: blob.byte_size
    }
  end
end
