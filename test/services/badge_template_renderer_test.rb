require "test_helper"

class BadgeTemplateRendererTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email_address: "template-renderer@test.com", password: "test123", password_confirmation: "test123")
    @card = @user.cards.create!(raw_input: "张三", data: { "name" => "张三", "organization" => "上海交通大学" })
    @template = @user.owned_badge_templates.create!(name: "测试模板")
  end

  def create_version(html:, css: "")
    @template.versions.create!(
      created_by: @user,
      version: @template.next_version_number,
      source_html: html,
      source_css: css
    )
  end

  test "渲染固定字段并保留安全 HTML" do
    version = create_version(html: '<div class="badge"><h1>{{ card.name }}</h1><p>{{ fields.organization }}</p></div>')

    html = BadgeTemplateRenderer.render(version: version, card: @card)

    assert_includes html, "张三"
    assert_includes html, "上海交通大学"
    assert_includes html, "data-badge-root"
    assert_includes html, "main[data-badge-root]"
    assert_includes html, "Content-Security-Policy"
  end

  test "用户字段会被转义" do
    @card.update!(data: { "name" => '<img src="https://evil.example/x">' })
    version = create_version(html: "<div>{{ card.name }}</div>")

    html = BadgeTemplateRenderer.render(version: version, card: @card)

    assert_includes html, "&lt;img"
    assert_not_includes html, '<img src="https://evil.example/x"'
  end

  test "拒绝脚本和 CSS 外链" do
    script_report = BadgeTemplateRenderer.validate_source("<script>alert(1)</script>", "")
    css_report = BadgeTemplateRenderer.validate_source("<div>安全</div>", "@import url(https://evil.example/a.css);")

    assert_not script_report.fetch("valid")
    assert_not css_report.fetch("valid")
  end

  test "非本站图片在渲染时会移除 src" do
    version = create_version(html: '<img src="https://evil.example/photo.png" alt="x">')

    html = BadgeTemplateRenderer.render(version: version, card: @card)

    assert_includes html, '<img alt="x">'
    assert_not_includes html, "evil.example"
  end

  test "没有上传头像时提供本地默认头像" do
    version = create_version(html: '<img src="{{ card.portrait_url }}" alt="默认头像">')

    html = BadgeTemplateRenderer.render(version: version, card: @card)

    assert_includes html, 'src="/default-avatar.svg"'
  end

  test "模板首个元素不会撑出成品画布" do
    version = create_version(html: '<article class="badge"><div>内容</div></article>')

    html = BadgeTemplateRenderer.render(version: version, card: @card)

    assert_includes html, "max-width:100%;max-height:100%;overflow:hidden"
  end

  test "拒绝未允许的 Liquid 标签" do
    report = BadgeTemplateRenderer.validate_source("{% assign x = 'x' %}{{ x }}", "")

    assert_not report.fetch("valid")
    assert_includes report.fetch("errors").first, "assign"
  end
end
