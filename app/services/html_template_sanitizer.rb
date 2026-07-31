# frozen_string_literal: true

require "crass"
require "loofah"

# Validates the small HTML/CSS document returned by the template model.
#
# Unsupported markup is rejected instead of silently removed. This is
# intentional: a model must not be told that an element or declaration worked
# when the sanitizer actually discarded it.
class HtmlTemplateSanitizer
  class Error < StandardError; end
  class DocumentError < Error; end
  class LimitError < Error; end
  class UnsafeHtmlError < Error; end
  class UnsafeCssError < Error; end

  REQUIRED_KEYS = %w[css html].freeze

  MAX_HTML_BYTES = 32.kilobytes
  MAX_CSS_BYTES = 32.kilobytes
  MAX_DOCUMENT_BYTES = 48.kilobytes
  MAX_HTML_NODES = 500
  MAX_HTML_DEPTH = 32
  MAX_ATTRIBUTES_PER_ELEMENT = 16
  MAX_ATTRIBUTE_BYTES = 256
  MAX_CLASS_TOKENS = 32
  MAX_CSS_NODES = 4_000
  MAX_CSS_DEPTH = 32

  ALLOWED_ELEMENTS = %w[
    article aside b blockquote br dd div dl dt em figcaption figure footer h1
    h2 h3 h4 h5 h6 header hr i li main ol p section small span strong sub sup
    time u ul
  ].freeze
  ALLOWED_ATTRIBUTES = %w[
    class dir hidden id inert lang role title
  ].freeze
  SAFE_NAME_PATTERN = /\A[-_A-Za-z][-_A-Za-z0-9]*\z/
  DATA_ATTRIBUTE_PATTERN = /\Adata-[-a-z0-9_]+\z/
  ARIA_ATTRIBUTE_PATTERN = /\Aaria-[-a-z0-9]+\z/
  LANGUAGE_PATTERN = /\A[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\z/
  TEXT_PLACEHOLDERS = %w[
    event_topic event_topic_en headerLabel host_department host_organization
    name name_en organization subLabel
  ].freeze
  NODE_PLACEHOLDERS = %w[
    access_dots barcode portrait qr reference_image selected_fields
  ].freeze
  ALLOWED_PLACEHOLDERS = (TEXT_PLACEHOLDERS + NODE_PLACEHOLDERS).freeze
  PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/
  CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
  DOCUMENT_TAG_PATTERN = /<\s*\/?\s*(?:html|head|body)\b/i
  FORBIDDEN_SELECTOR_PATTERN =
    /(?:\A|[\s,>+~(|])(?::root|html|body|iframe)(?=\z|[\s,.#:\[>+~|)])/i
  RESERVED_DATA_ATTRIBUTES = %w[data-badge-root].freeze
  CANVAS_ATTRIBUTE_RANGES = {
    "data-canvas-width" => (160.0..480.0),
    "data-canvas-height" => (140.0..640.0)
  }.freeze
  CANVAS_VALUE_PATTERN = /\A(?:0|[1-9]\d*)(?:\.\d+)?\z/

  ALLOWED_AT_RULES = [].freeze
  FORBIDDEN_FUNCTIONS = %w[
    expression image-set -webkit-image-set paint src url
  ].freeze
  FORBIDDEN_PROPERTIES = %w[behavior -moz-binding].freeze
  FORBIDDEN_CSS_WORDS = %w[javascript vbscript].freeze

  def call(document)
    value = normalize_document(document)
    html = normalize_string(value.fetch("html"), "html", MAX_HTML_BYTES)
    css = normalize_string(value.fetch("css"), "css", MAX_CSS_BYTES)
    if html.bytesize + css.bytesize > MAX_DOCUMENT_BYTES
      raise LimitError, "HTML/CSS 模板总大小不能超过 #{MAX_DOCUMENT_BYTES} 字节"
    end
    raise DocumentError, "HTML 模板不能为空" if html.strip.empty?

    {
      "html" => sanitize_html(html),
      "css" => sanitize_css(css)
    }
  end

  private

  def normalize_document(document)
    raise DocumentError, "模板必须是只包含 html 和 css 的对象" unless document.is_a?(Hash)
    unless document.keys.all? { |key| key.is_a?(String) || key.is_a?(Symbol) }
      raise DocumentError, "模板字段名必须是字符串"
    end

    keys = document.keys.map(&:to_s)
    unless keys.length == REQUIRED_KEYS.length && keys.sort == REQUIRED_KEYS
      raise DocumentError, "模板必须且只能包含 html 和 css 字段"
    end

    document.each_with_object({}) { |(key, value), result| result[key.to_s] = value }
  end

  def normalize_string(value, label, limit)
    raise DocumentError, "#{label} 必须是字符串" unless value.is_a?(String)

    text = value.encode(Encoding::UTF_8)
    raise DocumentError, "#{label} 包含控制字符" if text.match?(CONTROL_CHARACTER_PATTERN)
    raise LimitError, "#{label} 不能超过 #{limit} 字节" if text.bytesize > limit

    text
  rescue EncodingError
    raise DocumentError, "#{label} 必须是有效的 UTF-8 文本"
  end

  def sanitize_html(html)
    if html.match?(DOCUMENT_TAG_PATTERN)
      raise UnsafeHtmlError, "HTML 只能是片段，不能包含 html、head 或 body"
    end

    fragment = Loofah::HTML5::DocumentFragment.parse(html)
    if fragment.errors.any?
      raise UnsafeHtmlError, "HTML 语法无效：#{fragment.errors.first.message}"
    end

    nodes = collect_html_nodes(fragment)
    raise LimitError, "HTML 节点不能超过 #{MAX_HTML_NODES} 个" if nodes.length > MAX_HTML_NODES

    nodes.each do |node|
      validate_html_node!(node)
    end
    validate_canvas_attributes!(fragment)

    fragment.to_html
  rescue Nokogiri::XML::SyntaxError => e
    raise UnsafeHtmlError, "HTML 语法无效：#{e.message}"
  end

  def collect_html_nodes(fragment)
    nodes = []
    pending = [ fragment ]

    until pending.empty?
      node = pending.pop
      nodes << node
      pending.concat(node.children.to_a.reverse)
    end

    nodes
  end

  def validate_html_node!(node)
    safe_node_types = [
      Nokogiri::XML::Node::DOCUMENT_NODE,
      Nokogiri::XML::Node::DOCUMENT_FRAG_NODE,
      Nokogiri::XML::Node::TEXT_NODE
    ]
    if safe_node_types.include?(node.type)
      validate_text_node!(node) if node.text?
      return
    end

    unless node.element?
      raise UnsafeHtmlError, "HTML 不允许注释、文档声明或处理指令"
    end
    unless ALLOWED_ELEMENTS.include?(node.name.downcase)
      raise UnsafeHtmlError, "HTML 不允许 <#{node.name.downcase}> 元素"
    end
    if node.ancestors.count(&:element?) >= MAX_HTML_DEPTH
      raise LimitError, "HTML 嵌套不能超过 #{MAX_HTML_DEPTH} 层"
    end
    if node.attribute_nodes.length > MAX_ATTRIBUTES_PER_ELEMENT
      raise LimitError, "HTML 每个元素最多允许 #{MAX_ATTRIBUTES_PER_ELEMENT} 个属性"
    end

    node.attribute_nodes.each do |attribute|
      validate_html_attribute!(attribute)
    end
  end

  def validate_html_attribute!(attribute)
    name = attribute.name.downcase
    value = attribute.value.to_s
    if attribute.namespace || !allowed_attribute?(name)
      raise UnsafeHtmlError, "HTML 不允许 #{name} 属性"
    end
    if RESERVED_DATA_ATTRIBUTES.include?(name)
      raise UnsafeHtmlError, "HTML 不允许使用宿主保留属性 #{name}"
    end
    if value.bytesize > MAX_ATTRIBUTE_BYTES
      raise LimitError, "HTML 属性 #{name} 不能超过 #{MAX_ATTRIBUTE_BYTES} 字节"
    end
    if value.match?(CONTROL_CHARACTER_PATTERN)
      raise UnsafeHtmlError, "HTML 属性 #{name} 包含控制字符"
    end
    if value.include?("{{") || value.include?("}}")
      raise UnsafeHtmlError, "占位符只能放在 HTML 纯文本节点中，不能放在 #{name} 属性中"
    end

    validate_special_attribute!(name, value)
  end

  def validate_text_node!(node)
    text = node.text
    return unless text.include?("{{") || text.include?("}}")

    matches = text.scan(PLACEHOLDER_PATTERN)
    remainder = text.gsub(PLACEHOLDER_PATTERN, "")
    if matches.empty? || remainder.include?("{{") || remainder.include?("}}")
      raise UnsafeHtmlError, "HTML 包含格式无效的占位符"
    end

    matches.flatten.each do |name|
      unless ALLOWED_PLACEHOLDERS.include?(name)
        raise UnsafeHtmlError, "HTML 不允许 {{#{name}}} 占位符"
      end
      next unless NODE_PLACEHOLDERS.include?(name)

      standalone_pattern = /\A\{\{\s*#{Regexp.escape(name)}\s*\}\}\z/
      unless text.strip.match?(standalone_pattern)
        raise UnsafeHtmlError, "{{#{name}}} 必须独占一个纯文本节点"
      end
    end
  end

  def allowed_attribute?(name)
    ALLOWED_ATTRIBUTES.include?(name) ||
      name.match?(DATA_ATTRIBUTE_PATTERN) ||
      name.match?(ARIA_ATTRIBUTE_PATTERN)
  end

  def validate_special_attribute!(name, value)
    case name
    when "class"
      tokens = value.split
      unless tokens.length <= MAX_CLASS_TOKENS && tokens.all? { |token| token.match?(SAFE_NAME_PATTERN) }
        raise UnsafeHtmlError, "HTML class 只能包含安全的类名"
      end
    when "id"
      raise UnsafeHtmlError, "HTML id 格式无效" unless value.match?(SAFE_NAME_PATTERN)
    when "dir"
      raise UnsafeHtmlError, "HTML dir 只能是 ltr、rtl 或 auto" unless %w[ltr rtl auto].include?(value)
    when "lang"
      raise UnsafeHtmlError, "HTML lang 格式无效" unless value.match?(LANGUAGE_PATTERN)
    when "role"
      raise UnsafeHtmlError, "HTML role 格式无效" unless value.match?(SAFE_NAME_PATTERN)
    when "aria-hidden"
      raise UnsafeHtmlError, "aria-hidden 只能是 true 或 false" unless %w[true false].include?(value)
    when *CANVAS_ATTRIBUTE_RANGES.keys
      range = CANVAS_ATTRIBUTE_RANGES.fetch(name)
      number = Float(value, exception: false)
      unless value.match?(CANVAS_VALUE_PATTERN) && number&.finite? && range.cover?(number)
        raise UnsafeHtmlError,
              "#{name} 必须是 #{compact_number(range.begin)}-#{compact_number(range.end)} 的数字"
      end
    end
  end

  def validate_canvas_attributes!(fragment)
    canvas_elements = fragment.css(
      "[data-canvas-width], [data-canvas-height]"
    )
    return if canvas_elements.empty?

    root_elements = fragment.children.select(&:element?)
    root = root_elements.first
    unless canvas_elements.one? && root_elements.one? && canvas_elements.first == root
      raise UnsafeHtmlError, "画布宽高只能声明在唯一的 HTML 根元素上"
    end

    missing = CANVAS_ATTRIBUTE_RANGES.keys.reject { |name| root.key?(name) }
    return if missing.empty?

    raise UnsafeHtmlError, "画布宽高属性必须同时声明"
  end

  def compact_number(value)
    value == value.to_i ? value.to_i : value
  end

  def sanitize_css(css)
    return "" if css.empty?

    raise UnsafeCssError, "CSS 不能包含 < 字符或结束 style 标签" if css.include?("<")
    if css.include?("{{") || css.include?("}}")
      raise UnsafeCssError, "CSS 中不允许使用模板占位符"
    end

    validate_css_structure!(css)
    nodes = Crass.parse(css, preserve_comments: true)
    validate_css_top_level!(nodes)
    validate_css_nodes!(nodes)
    css
  end

  def validate_css_top_level!(nodes)
    nodes.each do |node|
      type = node[:node]
      next if %i[comment style_rule whitespace].include?(type)

      if type == :at_rule
        name = node[:name].to_s.downcase
        unless ALLOWED_AT_RULES.include?(name) && node[:block]
          raise UnsafeCssError, "CSS 不允许 @#{name} 规则"
        end

        next
      end

      raise UnsafeCssError, "CSS 包含无效或不支持的语法"
    end
  end

  def validate_css_nodes!(nodes)
    count = 0
    each_css_node(nodes) do |node|
      count += 1
      raise LimitError, "CSS 结构不能超过 #{MAX_CSS_NODES} 个节点" if count > MAX_CSS_NODES

      type = node[:node]
      raise UnsafeCssError, "CSS 包含无效或不完整的语法" if type == :error
      raise UnsafeCssError, "CSS 不允许 url() 或外部资源" if type == :url

      validate_css_function!(node) if type == :function
      validate_css_property!(node) if type == :property
      validate_css_selector!(node) if type == :style_rule
      validate_css_words!(node)
    end
  end

  def validate_css_function!(node)
    name = node[:name].to_s.downcase
    return unless FORBIDDEN_FUNCTIONS.include?(name)

    raise UnsafeCssError, "CSS 不允许 #{name}() 函数"
  end

  def validate_css_property!(node)
    name = node[:name].to_s.downcase
    forbidden = FORBIDDEN_PROPERTIES.include?(name) ||
      name.match?(/\A(?:-[a-z]+-)?(?:animation|transition)(?:-|\z)/)
    return unless forbidden

    raise UnsafeCssError, "CSS 不允许 #{name} 属性"
  end

  def validate_css_selector!(node)
    selector = node.dig(:selector, :value).to_s.downcase
    forbidden = selector.match?(FORBIDDEN_SELECTOR_PATTERN) ||
      selector.include?("html2canvas-container") ||
      selector.include?("data-badge-root")
    return unless forbidden

    raise UnsafeCssError, "CSS selector 不能修改宿主文档或截图容器"
  end

  def validate_css_words!(node)
    words = [ node[:name], node[:value] ].compact.filter_map do |value|
      value.downcase if value.is_a?(String)
    end
    forbidden = FORBIDDEN_CSS_WORDS.find do |word|
      words.any? { |value| value.include?(word) }
    end
    return unless forbidden

    raise UnsafeCssError, "CSS 不允许 #{forbidden} 内容"
  end

  def each_css_node(value, seen = {}, &block)
    return unless value.is_a?(Array) || value.is_a?(Hash)
    return if seen[value.object_id]

    seen[value.object_id] = true
    if value.is_a?(Hash)
      yield value if value.key?(:node)
      value.each_value { |child| each_css_node(child, seen, &block) }
    else
      value.each { |child| each_css_node(child, seen, &block) }
    end
  end

  def validate_css_structure!(css)
    stack = []
    state = :normal
    quote = nil
    escaped = false
    index = 0

    while index < css.length
      character = css[index]
      following = css[index + 1]

      if state == :comment
        if character == "*" && following == "/"
          state = :normal
          index += 1
        end
      elsif state == :string
        if escaped
          escaped = false
        elsif character == "\\"
          escaped = true
        elsif character == quote
          state = :normal
        elsif character == "\n" || character == "\r"
          raise UnsafeCssError, "CSS 字符串不能包含未转义换行"
        end
      elsif character == "/" && following == "*"
        state = :comment
        index += 1
      elsif character == "'" || character == '"'
        state = :string
        quote = character
      elsif character == "\\"
        index += 1
      elsif [ "{", "[", "(" ].include?(character)
        stack << { "{" => "}", "[" => "]", "(" => ")" }.fetch(character)
        raise LimitError, "CSS 嵌套不能超过 #{MAX_CSS_DEPTH} 层" if stack.length > MAX_CSS_DEPTH
      elsif [ "}", "]", ")" ].include?(character)
        raise UnsafeCssError, "CSS 括号不匹配" unless stack.pop == character
      end

      index += 1
    end

    raise UnsafeCssError, "CSS 注释或字符串未闭合" unless state == :normal
    raise UnsafeCssError, "CSS 括号未闭合" unless stack.empty?
  end
end
