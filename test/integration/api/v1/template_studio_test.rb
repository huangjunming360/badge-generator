require "test_helper"

class Api::V1::TemplateStudioTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email_address: "studio-user@test.com", password: "test123", password_confirmation: "test123")
    @other_user = User.create!(email_address: "studio-other@test.com", password: "test123", password_confirmation: "test123")
  end

  def sign_in(user)
    post session_url, params: { email_address: user.email_address, password: "test123" }
    follow_redirect!
  end

  def body
    JSON.parse(response.body)
  end

  def source
    { source_html: "<section><h1>{{ card.name }}</h1></section>", source_css: "section { padding: 8mm; }" }
  end

  test "普通用户模板工作台默认关闭" do
    sign_in(@user)

    get "/api/v1/template_studio"

    assert_response :forbidden
    assert_equal [ "普通用户模板设计尚未开放" ], body["errors"]
  end

  test "启用后普通用户只能创建和读取自己的私有模板" do
    Setting.set("user_templates_enabled", true)
    sign_in(@user)

    post "/api/v1/template_studio", params: {
      badge_template: { name: "我的私有模板", orientation: "portrait", width_mm: 55, height_mm: 85 },
      source: source
    }

    assert_response :created
    template_id = body.dig("template", "id")
    assert_equal "private", BadgeTemplate.find(template_id).visibility

    sign_in(@other_user)
    get "/api/v1/template_studio/#{template_id}"
    assert_response :not_found

    get "/api/v1/badge_templates"
    assert_empty body["templates"]
  end

  test "后台额度限制创建数和当月 AI 生成数" do
    Setting.set("user_templates_enabled", true)
    Setting.set("user_template_limit", 1)
    Setting.set("user_template_generation_monthly_limit", 1)
    sign_in(@user)

    post "/api/v1/template_studio", params: {
      badge_template: { name: "第一张", orientation: "portrait", width_mm: 55, height_mm: 85 }, source: source
    }
    assert_response :created

    post "/api/v1/template_studio", params: {
      badge_template: { name: "第二张", orientation: "portrait", width_mm: 55, height_mm: 85 }, source: source
    }
    assert_response :too_many_requests
    assert_includes body["errors"].first, "数量上限"

    post "/api/v1/template_studio/generate", params: { requirement: "极简科技风" }
    assert_response :accepted
    assert_equal "queued", @user.template_generation_jobs.last.status

    post "/api/v1/template_studio/generate", params: { requirement: "再生成一次" }
    assert_response :too_many_requests
    assert_includes body["errors"].first, "额度已用完"
  end

  test "普通用户直接生成受后台并发任务上限约束" do
    Setting.set("user_templates_enabled", true)
    Setting.set("user_template_generation_monthly_limit", 10)
    Setting.set("user_template_concurrent_generation_limit", 1)
    @user.template_generation_jobs.create!(job_type: "template_generation", complexity: 5, payload: { "requirement" => "正在生成" })
    sign_in(@user)

    post "/api/v1/template_studio/generate", params: { requirement: "再生成一次" }

    assert_response :too_many_requests
    assert_includes body.fetch("errors").first, "并发上限"
  end
end
