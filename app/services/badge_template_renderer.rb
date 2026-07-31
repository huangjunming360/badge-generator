require "liquid"

# Renders untrusted template source in a deliberately small, non-executable
# subset of HTML/CSS. The browser sandbox is a second boundary; this service
# must remain safe when its output is used by exports or background jobs too.
class BadgeTemplateRenderer
  MAX_HTML_BYTES = 100.kilobytes
  MAX_CSS_BYTES = 100.kilobytes
  MAX_OUTPUT_BYTES = 250.kilobytes
  ALLOWED_TAGS = %w[
    article aside b blockquote br code div em figcaption figure footer h1 h2 h3 h4 h5 h6
    header hr i img li main mark p section small span strong sub sup table tbody td tfoot th thead tr ul
  ].freeze
  ALLOWED_ATTRIBUTES = %w[alt aria-label class height id role src title width].freeze
  ALLOWED_LIQUID_TAGS = %w[if else endif for endfor].freeze
  FORBIDDEN_CSS = /@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|url\s*\(/i.freeze
  FORBIDDEN_HTML = /<(?:script|iframe|object|embed|form|input|textarea|select|meta|link)\b/i.freeze
  SAFE_IMAGE_PREFIXES = %w[/rails/active_storage/ /default-avatar.svg].freeze
  SYSTEM_CARD_FIELDS = %w[width_mm height_mm portrait_url].freeze
  LEGACY_FIELD_ALIASES = {
    "name" => "participant_name",
    "name_en" => "participant_name_en",
    "organization" => "organization",
    "host_organization" => "host_organization",
    "host_department" => "host_department",
    "event_topic" => "event_topic",
    "event_topic_en" => "event_topic_en"
  }.freeze

  class InvalidTemplate < StandardError; end

  def self.validate_source(html, css, semantic_fields: BadgeTemplateVersion::DEFAULT_SEMANTIC_FIELDS)
    errors = []
    html = html.to_s
    css = css.to_s
    errors << "HTML 不能为空" if html.blank?
    errors << "HTML 超过 #{MAX_HTML_BYTES / 1.kilobyte}KB" if html.bytesize > MAX_HTML_BYTES
    errors << "CSS 超过 #{MAX_CSS_BYTES / 1.kilobyte}KB" if css.bytesize > MAX_CSS_BYTES
    errors << "HTML 包含不允许的标签" if html.match?(FORBIDDEN_HTML)
    errors << "CSS 包含不允许的规则或外部资源" if css.match?(FORBIDDEN_CSS)
    errors.concat(liquid_errors(html, semantic_fields: semantic_fields))

    begin
      Liquid::Template.parse(html)
    rescue Liquid::Error => e
      errors << "Liquid 模板语法错误：#{e.message}"
    end

    { "valid" => errors.empty?, "errors" => errors }
  end

  def self.render(version:, card:)
    report = validate_source(version.source_html, version.source_css, semantic_fields: version.semantic_fields)
    raise InvalidTemplate, report.fetch("errors").join("；") unless report.fetch("valid")

    html = Liquid::Template.parse(version.source_html).render!(context_for(card, version), strict_variables: true)
    html = sanitize_html(html)
    css = sanitize_css(version.source_css)
    document = document_for(html, css, version.badge_template)
    raise InvalidTemplate, "渲染结果过大" if document.bytesize > MAX_OUTPUT_BYTES

    document
  rescue Liquid::Error => e
    raise InvalidTemplate, "Liquid 渲染失败：#{e.message}"
  end

  def self.context_for(card, version)
    fields = version.semantic_fields.each_with_object({}) do |field, result|
      key = field.fetch("key")
      result[key] = ERB::Util.html_escape(semantic_value(card, field).to_s)
    end
    legacy_card_fields = LEGACY_FIELD_ALIASES.each_with_object({}) do |(legacy_key, semantic_key), result|
      result[legacy_key] = fields[semantic_key] if fields.key?(semantic_key)
    end

    {
      "card" => legacy_card_fields.merge(
        "width_mm" => card.width,
        "height_mm" => card.height,
        "portrait_url" => portrait_url(card)
      ),
      "fields" => fields,
      "assets" => template_asset_urls(version.badge_template)
    }
  end

  def self.semantic_value(card, field)
    key = field.fetch("key")
    stored = card.data.to_h
    return stored[key] if stored.key?(key)

    legacy_key = LEGACY_FIELD_ALIASES.key(key) || key
    return stored[legacy_key] if stored.key?(legacy_key)

    Card::FIELD_DEFAULTS[legacy_key] || field["default_value"]
  end
  private_class_method :semantic_value

  def self.portrait_url(card)
    return "/default-avatar.svg" unless card.portrait.attached?

    Rails.application.routes.url_helpers.rails_storage_proxy_path(card.portrait, only_path: true)
  end
  private_class_method :portrait_url

  def self.template_asset_urls(template)
    template.design_assets.attachments.order(:id).each_with_index.to_h do |attachment, index|
      [ "reference_#{index + 1}", Rails.application.routes.url_helpers.rails_storage_proxy_path(attachment, only_path: true) ]
    end
  end
  private_class_method :template_asset_urls

  def self.sanitize_html(html)
    raise InvalidTemplate, "HTML 包含不允许的标签" if html.match?(FORBIDDEN_HTML)

    sanitized = Rails::Html::SafeListSanitizer.new.sanitize(
      html,
      tags: ALLOWED_TAGS,
      attributes: ALLOWED_ATTRIBUTES
    )
    fragment = Nokogiri::HTML5.fragment(sanitized)
    fragment.css("img").each do |image|
      src = image["src"].to_s
      image.remove_attribute("src") unless SAFE_IMAGE_PREFIXES.any? { |prefix| src.start_with?(prefix) }
    end
    fragment.to_html
  end
  private_class_method :sanitize_html

  def self.sanitize_css(css)
    raise InvalidTemplate, "CSS 包含不允许的规则或外部资源" if css.match?(FORBIDDEN_CSS)

    css.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
       .gsub(/\/\*.*?\*\//m, "")
       .strip
  end
  private_class_method :sanitize_css

  def self.document_for(html, css, template)
    width = template.width_mm
    height = template.height_mm
    <<~HTML
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self' data:">
          <style>
            html,body{margin:0;padding:0;width:#{width}mm;height:#{height}mm;overflow:hidden}
            #{css}
            html,body{width:#{width}mm !important;height:#{height}mm !important;overflow:hidden !important}
            main[data-badge-root]{position:relative;width:100% !important;height:100% !important;overflow:hidden !important;box-sizing:border-box !important}
            main[data-badge-root]>*:first-child{box-sizing:border-box !important;max-width:100% !important;max-height:100% !important;overflow:hidden !important}
          </style>
        </head>
        <body><main data-badge-root>#{html}</main></body>
      </html>
    HTML
  end
  private_class_method :document_for

  def self.liquid_errors(html, semantic_fields:)
    errors = html.scan(/{%\s*(\w+)/).flatten.uniq.filter_map do |tag|
      next if ALLOWED_LIQUID_TAGS.include?(tag)

      "不允许使用 Liquid 标签：#{tag}"
    end
    declared_fields = BadgeTemplateVersion.semantic_field_keys(semantic_fields)
    liquid_references(html).each do |reference|
      root, key = reference.split(".", 2)
      case root
      when "fields"
        errors << "模板引用了未声明的语义字段：#{key}" unless declared_fields.include?(key)
      when "card"
        next if SYSTEM_CARD_FIELDS.include?(key)
        canonical = LEGACY_FIELD_ALIASES[key]
        if canonical.nil?
          errors << "不允许使用 Liquid 变量：#{reference}"
        elsif !declared_fields.include?(canonical)
          errors << "模板引用了未声明的语义字段：#{canonical}"
        end
      when "assets"
        errors << "素材引用格式无效：#{reference}" unless key&.match?(/\Areference_[1-9]\d*\z/)
      else
        errors << "不允许使用 Liquid 变量：#{reference}"
      end
    end
    errors
  end
  private_class_method :liquid_errors

  def self.liquid_references(html)
    html.scan(/(?:{{|{%\s*(?:if|elsif|unless))\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)/).flatten.uniq
  end
  private_class_method :liquid_references
end
