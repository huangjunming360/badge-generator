require "test_helper"

class HtmlTemplateSanitizerTest < ActiveSupport::TestCase
  def sanitizer
    HtmlTemplateSanitizer.new
  end

  test "保留安全布局、纯文本占位符、渐变和伪元素" do
    document = {
      html: <<~HTML,
        <article id="badge" class="badge badge--vip" data-slot="badge" aria-label="嘉宾证">
          <header><span>{{headerLabel}}</span></header>
          <section role="group">
            <figure data-slot="portrait">{{portrait}}</figure>
            <figure data-slot="reference-image">{{reference_image}}</figure>
            <h1>{{name}}</h1>
            <p>{{organization}}</p>
            <div data-slot="selected-fields">{{selected_fields}}</div>
          </section>
        </article>
      HTML
      css: <<~CSS
        .badge {
          display: grid;
          background: linear-gradient(135deg, #fff, #ddeeff);
        }
        .badge::before { content: ""; position: absolute; inset: 0; }
      CSS
    }

    result = sanitizer.call(document)

    assert_equal document[:css], result["css"]
    assert_includes result["html"], "{{headerLabel}}"
    assert_includes result["html"], "{{portrait}}"
    assert_includes result["html"], "{{reference_image}}"
    assert_includes result["html"], "{{name}}"
    assert_includes result["html"], "{{selected_fields}}"
    assert_includes result["html"], 'data-slot="portrait"'
  end

  test "允许唯一根元素声明受限的画布宽高" do
    result = sanitizer.call(
      html: <<~HTML,
        <article class="badge" data-canvas-width="360" data-canvas-height="220">
          {{name}}
        </article>
      HTML
      css: ".badge { width: 100%; height: 100%; }"
    )

    assert_includes result["html"], 'data-canvas-width="360"'
    assert_includes result["html"], 'data-canvas-height="220"'
  end

  test "拒绝不完整、越界或不在唯一根元素上的画布尺寸" do
    invalid_html = [
      '<article data-canvas-width="320">{{name}}</article>',
      '<article data-canvas-width="999" data-canvas-height="220">{{name}}</article>',
      '<article data-canvas-width="320px" data-canvas-height="220">{{name}}</article>',
      '<article><div data-canvas-width="320" data-canvas-height="220">{{name}}</div></article>',
      '<article data-canvas-width="320" data-canvas-height="220">{{name}}</article><div>x</div>'
    ]

    invalid_html.each do |html|
      assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError, html) do
        sanitizer.call(html: html, css: "")
      end
    end
  end

  test "要求文档恰好包含 html 和 css 字符串" do
    invalid_documents = [
      nil,
      [],
      { html: "<div>x</div>" },
      { html: "<div>x</div>", css: "", extra: true },
      { html: "<div>x</div>", css: nil }
    ]

    invalid_documents.each do |document|
      assert_raises(HtmlTemplateSanitizer::DocumentError) { sanitizer.call(document) }
    end
  end

  test "限制 html css 单项和总字节数" do
    html_error = assert_raises(HtmlTemplateSanitizer::LimitError) do
      sanitizer.call(html: "x" * (HtmlTemplateSanitizer::MAX_HTML_BYTES + 1), css: "")
    end
    assert_match(/html/, html_error.message)

    css_error = assert_raises(HtmlTemplateSanitizer::LimitError) do
      sanitizer.call(html: "<div>x</div>", css: " " * (HtmlTemplateSanitizer::MAX_CSS_BYTES + 1))
    end
    assert_match(/css/, css_error.message)
  end

  test "拒绝脚本和可执行或可联网的 html 元素" do
    %w[script iframe object embed form link meta style svg img video audio].each do |tag|
      html = "<div>ok</div><#{tag}>bad</#{tag}>"

      error = assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
        sanitizer.call(html: html, css: "")
      end
      assert_match(/#{tag}/, error.message)
    end
  end

  test "拒绝事件 style url 属性及命名空间属性" do
    attributes = [
      'onclick="alert(1)"',
      'onerror="alert(1)"',
      'style="color:red"',
      'href="https://example.com"',
      'src="data:text/html,x"',
      'xlink:href="https://example.com"'
    ]

    attributes.each do |attribute|
      assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
        sanitizer.call(html: "<div #{attribute}>x</div>", css: "")
      end
    end
  end

  test "拒绝占用宿主截图根属性" do
    assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: '<div data-badge-root="">x</div>', css: "")
    end
  end

  test "拒绝属性上下文中的占位符" do
    error = assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: '<div title="{{name}}">{{name}}</div>', css: "")
    end

    assert_match(/纯文本节点/, error.message)
  end

  test "拒绝未知占位符并要求可信节点占位符独占文本节点" do
    assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: "<div>{{evil}}</div>", css: "")
    end
    assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: "<div>照片：{{ portrait }}</div>", css: "")
    end
    assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: "<div>{{broken</div>", css: "")
    end
  end

  test "拒绝注释和完整 html 文档" do
    assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: "<!-- hidden --><div>x</div>", css: "")
    end
    assert_raises(HtmlTemplateSanitizer::UnsafeHtmlError) do
      sanitizer.call(html: "<html><body><div>x</div></body></html>", css: "")
    end
  end

  test "拒绝 css import url 和无 url 包装的 image set" do
    attacks = [
      '@import "https://example.com/a.css";',
      ".badge { background: url(https://example.com/a.png); }",
      '.badge { background: u\\72l("https://example.com/a.png"); }',
      '.badge { background: image-set("https://example.com/a.png" 1x); }',
      "@font-face { font-family: pwn; src: local(system-ui); }"
    ]

    attacks.each do |css|
      assert_raises(HtmlTemplateSanitizer::UnsafeCssError, css) do
        sanitizer.call(html: "<div>x</div>", css: css)
      end
    end
  end

  test "拒绝 css 执行函数和旧浏览器执行属性" do
    attacks = [
      ".badge { width: expression(alert(1)); }",
      ".badge { width: e\\78pression(alert(1)); }",
      ".badge { behavior: url(payload.htc); }",
      ".badge { -moz-binding: url(payload.xml); }",
      ".badge { color: j\\61vascript; }"
    ]

    attacks.each do |css|
      assert_raises(HtmlTemplateSanitizer::UnsafeCssError, css) do
        sanitizer.call(html: "<div>x</div>", css: css)
      end
    end
  end

  test "拒绝会让预览和导出不确定的动画与过渡" do
    attacks = [
      ".badge { animation: pulse 1s infinite; }",
      ".badge { -webkit-animation-name: pulse; }",
      ".badge { transition: opacity 200ms; }",
      "@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }"
    ]

    attacks.each do |css|
      assert_raises(HtmlTemplateSanitizer::UnsafeCssError, css) do
        sanitizer.call(html: "<div>x</div>", css: css)
      end
    end
  end

  test "拒绝 css 中的模板占位符" do
    assert_raises(HtmlTemplateSanitizer::UnsafeCssError) do
      sanitizer.call(html: "<div>x</div>", css: ".badge { color: {{color}}; }")
    end
  end

  test "拒绝命中宿主文档和 html2canvas 容器的 selector" do
    attacks = [
      "body { display: none !important; }",
      "b\\6f dy { display: none !important; }",
      ":root { visibility: hidden; }",
      ".badge iframe { display: none !important; }",
      ".html2canvas-container { display: none !important; }",
      ".html2canvas\\2d container { display: none !important; }",
      "[class~=html2canvas-container] { display: none !important; }",
      "[data-badge-root] { width: 1px !important; }"
    ]

    attacks.each do |css|
      assert_raises(HtmlTemplateSanitizer::UnsafeCssError, css) do
        sanitizer.call(html: "<div>x</div>", css: css)
      end
    end

    result = sanitizer.call(
      html: '<div class="badge"><span class="body">x</span></div>',
      css: ".badge .body { display: block; }"
    )
    assert_includes result["css"], ".badge .body"
  end

  test "拒绝 style 闭合注入和不完整 css" do
    attacks = [
      '.badge { content: "</style><script>alert(1)</script>"; }',
      ".badge { color: red",
      ".badge { content: 'unterminated; }",
      ".badge { color: red; }}",
      "@keyframes"
    ]

    attacks.each do |css|
      assert_raises(HtmlTemplateSanitizer::UnsafeCssError, css) do
        sanitizer.call(html: "<div>x</div>", css: css)
      end
    end
  end

  test "css 转义不能绕过 import url 和 javascript 检查" do
    attacks = [
      '@\\69mport "https://example.com/a.css";',
      ".badge { background-image: \\75\\72\\6c(https://example.com/a.png); }",
      ".badge { content: 'j\\61vascript'; }"
    ]

    attacks.each do |css|
      assert_raises(HtmlTemplateSanitizer::UnsafeCssError, css) do
        sanitizer.call(html: "<div>x</div>", css: css)
      end
    end
  end
end
