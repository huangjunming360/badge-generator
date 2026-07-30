require "test_helper"

class Api::V1::BadgeTemplatesTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "template-admin@test.com", password: "test123", password_confirmation: "test123", role: "admin")
    @other_admin = User.create!(email_address: "other-template-admin@test.com", password: "test123", password_confirmation: "test123", role: "admin")
    @user = User.create!(email_address: "template-user@test.com", password: "test123", password_confirmation: "test123")
  end

  def sign_in(user)
    post session_url, params: { email_address: user.email_address, password: "test123" }
    follow_redirect!
  end

  def body
    JSON.parse(@response.body)
  end

  def source
    {
      source_html: '<section class="badge"><h1>{{ card.name }}</h1><p>{{ fields.organization }}</p></section>',
      source_css: ".badge { color: #123456; }"
    }
  end

  def create_template
    post "/api/v1/admin/badge_templates", params: {
      badge_template: { name: "夏令营模板", orientation: "portrait", width_mm: 55, height_mm: 85 },
      source: source
    }
    assert_response :created
    BadgeTemplate.find(body.dig("template", "id"))
  end

  test "非管理员不能创建模板" do
    sign_in(@user)

    post "/api/v1/admin/badge_templates", params: {
      badge_template: { name: "越权模板" }, source: source
    }

    assert_response :forbidden
    assert_equal [ "需要管理员权限" ], body["errors"]
  end

  test "草稿对普通用户不可见，发布后可读取并预览" do
    sign_in(@admin)
    template = create_template
    version = template.versions.first

    sign_in(@user)
    get "/api/v1/badge_templates"
    assert_response :success
    assert_empty body["templates"]

    sign_in(@admin)
    post "/api/v1/admin/badge_templates/#{template.id}/publish", params: { version_id: version.id }
    assert_response :success
    assert_equal "published", body.dig("template", "status")

    card = @user.cards.create!(raw_input: "王五", data: { "name" => "王五", "organization" => "北京大学" })
    sign_in(@user)
    get "/api/v1/badge_templates"
    assert_response :success
    assert_equal template.id, body.dig("templates", 0, "id")

    get "/api/v1/badge_templates/#{template.id}/preview", params: { card_id: card.id }
    assert_response :success
    assert_includes body["html"], "王五"
    assert_includes body["html"], "北京大学"
  end

  test "管理员只能读取自己拥有的草稿和源码" do
    sign_in(@admin)
    template = create_template

    sign_in(@other_admin)
    get "/api/v1/admin/badge_templates/#{template.id}"

    assert_response :not_found
    assert_equal [ "记录不存在" ], body["errors"]
  end

  test "卡片只能绑定已发布模板的具体版本" do
    sign_in(@admin)
    template = create_template
    version = template.versions.first

    card = @user.cards.create!(raw_input: "王五")
    sign_in(@user)
    patch "/api/v1/cards/#{card.id}", params: { card: { badge_template_version_id: version.id } }
    assert_response :not_found

    sign_in(@admin)
    post "/api/v1/admin/badge_templates/#{template.id}/publish", params: { version_id: version.id }
    assert_response :success

    sign_in(@user)
    patch "/api/v1/cards/#{card.id}", params: { card: { badge_template_version_id: version.id } }
    assert_response :success
    assert_equal template.id, body.dig("card", "badge_template", "id")
    assert_equal version.id, body.dig("card", "badge_template", "version_id")
  end

  test "管理员只能为自己模板排队视觉修复" do
    sign_in(@admin)
    template = create_template
    version = template.versions.first

    post "/api/v1/admin/badge_templates/#{template.id}/enqueue_visual_repair", params: {
      version_id: version.id,
      complexity: 8,
      diagnostics: "底部文字溢出",
      requirement: "保持夏令营风格"
    }

    assert_response :accepted
    job = @admin.template_generation_jobs.find(body.dig("job", "id"))
    assert_equal "queued", job.status
    assert_equal 8, job.complexity
    assert_equal "底部文字溢出", job.payload["diagnostics"]

    sign_in(@other_admin)
    post "/api/v1/admin/badge_templates/#{template.id}/enqueue_visual_repair", params: { version_id: version.id }
    assert_response :not_found
  end

  test "模板生成拒绝未知模型，避免任务执行时静默回退" do
    sign_in(@admin)

    post "/api/v1/admin/badge_templates/generate", params: {
      requirement: "简洁的科技营名牌",
      complexity: 4,
      model_id: "not-a-configured-model"
    }

    assert_response :unprocessable_content
    assert_equal [ "未知的模型" ], body["errors"]
    assert_empty @admin.template_generation_jobs
  end

  test "模板生成会保存合法参考素材和画布尺寸" do
    sign_in(@admin)
    asset = fixture_file_upload("portrait.png", "image/png")

    original_run = TemplateGenerationOrchestrator.method(:run)
    TemplateGenerationOrchestrator.define_singleton_method(:run) { |_job| nil }
    post "/api/v1/admin/badge_templates/generate", params: {
      requirement: "参考这张图的视觉气质",
      width_mm: 85,
      height_mm: 55,
      reference_assets: [ asset ]
    }
    TemplateGenerationOrchestrator.define_singleton_method(:run, original_run)

    assert_response :accepted
    job = @admin.template_generation_jobs.find(body.dig("job", "id"))
    assert_equal 85.0, job.payload["width_mm"]
    assert_equal 55.0, job.payload["height_mm"]
    assert_equal 1, job.reference_assets.count
  end

  test "保存 AI 草案时只复制当前管理员生成任务的参考素材" do
    sign_in(@admin)
    job = @admin.template_generation_jobs.create!(job_type: "template_generation", payload: { "requirement" => "品牌模板" })
    job.reference_assets.attach(fixture_file_upload("portrait.png", "image/png"))

    post "/api/v1/admin/badge_templates", params: {
      badge_template: { name: "品牌模板", orientation: "portrait", width_mm: 55, height_mm: 85 },
      source: { source_html: '<img src="{{ assets.reference_1 }}" alt="品牌">', source_css: "" },
      generation_job_id: job.id
    }

    assert_response :created
    template = @admin.owned_badge_templates.find(body.dig("template", "id"))
    assert_equal 1, template.design_assets.count

    sign_in(@other_admin)
    post "/api/v1/admin/badge_templates", params: {
      badge_template: { name: "越权素材", orientation: "portrait", width_mm: 55, height_mm: 85 },
      source: source,
      generation_job_id: job.id
    }
    assert_response :not_found
  end

  test "模板生成拒绝过多或不支持的参考素材" do
    sign_in(@admin)
    text = fixture_file_upload("note.txt", "text/plain")
    too_many = Array.new(5) { fixture_file_upload("portrait.png", "image/png") }

    post "/api/v1/admin/badge_templates/generate", params: { requirement: "x", reference_assets: too_many }
    assert_response :unprocessable_content
    assert_includes body["errors"].first, "最多上传"

    post "/api/v1/admin/badge_templates/generate", params: { requirement: "x", reference_assets: [ text ] }
    assert_response :unprocessable_content
    assert_includes body["errors"].first, "只支持"
  end

  test "管理员显式应用完成的视觉修复为新草稿版本" do
    sign_in(@admin)
    template = create_template
    job = @admin.template_generation_jobs.create!(
      badge_template: template,
      job_type: "visual_repair",
      status: "succeeded",
      complexity: 5,
      result: {
        "source_html" => "<h1>{{ card.name }}</h1>",
        "source_css" => "h1 { color: #2468ac; }"
      }
    )

    post "/api/v1/admin/template_generation_jobs/#{job.id}/apply"

    assert_response :created
    assert_equal "ai_repaired", body.dig("version", "source_kind")
    assert_equal 2, template.reload.versions.count
    assert_equal "draft", template.status
  end

  test "管理员可以对比版本，并从历史版本创建新的草稿回滚" do
    sign_in(@admin)
    template = create_template
    original = template.versions.first
    template.versions.create!(
      created_by: @admin,
      version: 2,
      source_html: "<h1>{{ card.organization }}</h1>",
      source_css: "h1 { color: #654321; }"
    )
    revised = template.versions.find_by!(version: 2)
    template.publish!(revised)

    get "/api/v1/admin/badge_templates/#{template.id}/compare", params: {
      base_version_id: original.id,
      target_version_id: revised.id
    }

    assert_response :success
    assert_equal true, body.dig("changed", "html")
    assert_equal original.id, body.dig("base", "id")
    assert_equal revised.id, body.dig("target", "id")

    post "/api/v1/admin/badge_templates/#{template.id}/rollback", params: { version_id: original.id }

    assert_response :created
    assert_equal "rollback", body.dig("version", "source_kind")
    assert_equal original.source_html, body.dig("version", "source_html")
    assert_equal "draft", template.reload.status
    assert_equal 3, template.versions.count
  end
end
