require "test_helper"

class Api::V1::TemplateDesignSessionsTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "design-admin@test.com", password: "test123", password_confirmation: "test123", role: "admin", model_level: 4)
    @other = User.create!(email_address: "design-other@test.com", password: "test123", password_confirmation: "test123", role: "admin")
    @original_models = Rails.application.config.x.models
    Rails.application.config.x.models = {
      "default" => "fast",
      "models" => [
        { "id" => "fast", "label" => "极速", "level" => 4, "capabilities" => [ "text_generation" ] },
        { "id" => "restricted", "label" => "受限", "level" => 1, "capabilities" => [ "text_generation" ] },
        { "id" => "visual-only", "label" => "视觉", "level" => 4, "capabilities" => [ "vision_input" ] }
      ]
    }
  end

  teardown do
    Rails.application.config.x.models = @original_models
  end

  def sign_in(user)
    post session_url, params: { email_address: user.email_address, password: "test123" }
    follow_redirect!
  end

  def body
    JSON.parse(response.body)
  end

  test "会话持久化首条需求、任务和待发送消息" do
    sign_in(@admin)

    post "/api/v1/template_design_sessions", params: {
      name: "夏令营名牌",
      initial_message: "做一个清爽的蓝色夏令营名牌",
      configuration: { complexity: 6, width_mm: 55, height_mm: 85, model_id: "fast" }
    }

    assert_response :created
    session = body.fetch("session")
    assert_equal "夏令营名牌", session.fetch("name")
    assert_equal 6, session.dig("configuration", "complexity")
    assert_equal "processing", session.fetch("messages").first.fetch("state")
    assert_equal "template_generation", session.fetch("active_job").fetch("job_type")
    session_id = session.fetch("id")

    post "/api/v1/template_design_sessions/#{session_id}/append_message", params: { content: "把主标题更醒目" }
    assert_response :accepted
    assert_equal "queued", body.dig("message", "state")

    get "/api/v1/template_design_sessions/#{session_id}"
    assert_response :success
    assert_equal 2, body.dig("session", "messages").count { |message| message["role"] == "user" }
    assert_equal 1, body.dig("session", "jobs").length
  end

  test "暂停当前任务会取消租约并立即派发下一条需求" do
    sign_in(@admin)
    session = @admin.template_design_sessions.create!(name: "暂停测试")
    first = session.queue_user_message!(content: "第一版")
    second = session.queue_user_message!(content: "第二版")

    assert_equal "processing", first.reload.state
    assert_equal "queued", second.reload.state

    post "/api/v1/template_design_sessions/#{session.id}/interrupt"

    assert_response :success
    assert_equal "cancelled", first.reload.state
    assert_equal "processing", second.reload.state
    assert_equal "cancelled", first.template_generation_job.reload.status
    assert_equal "用户已停止本轮设计", first.template_generation_job.stage_results.dig("cancellation", "reason")
    assert_equal "queued", second.template_generation_job.reload.status
  end

  test "其他用户不能读取或中断会话" do
    session = @admin.template_design_sessions.create!(name: "私有会话")
    sign_in(@other)

    get "/api/v1/template_design_sessions/#{session.id}"
    assert_response :not_found

    post "/api/v1/template_design_sessions/#{session.id}/interrupt"
    assert_response :not_found
  end

  test "普通用户首条会话同样受会话数和月度生成额度限制" do
    user = User.create!(email_address: "design-quota@test.com", password: "test123", password_confirmation: "test123")
    Setting.set("user_templates_enabled", true)
    Setting.set("user_template_session_limit", 2)
    Setting.set("user_template_generation_monthly_limit", 1)
    sign_in(user)

    post "/api/v1/template_design_sessions", params: { name: "第一轮", initial_message: "做蓝色名牌" }
    assert_response :created

    post "/api/v1/template_design_sessions", params: { name: "第二轮", initial_message: "做红色名牌" }
    assert_response :too_many_requests
    assert_includes body.fetch("errors").first, "额度已用完"

    post "/api/v1/template_design_sessions", params: { name: "空会话" }
    assert_response :created

    post "/api/v1/template_design_sessions", params: { name: "第三个会话" }
    assert_response :too_many_requests
    assert_includes body.fetch("errors").first, "会话数量上限"
  end

  test "普通用户可在运行中继续排队，但排队消息也计入月度额度" do
    user = User.create!(email_address: "design-queue-quota@test.com", password: "test123", password_confirmation: "test123")
    Setting.set("user_templates_enabled", true)
    Setting.set("user_template_generation_monthly_limit", 2)
    Setting.set("user_template_concurrent_generation_limit", 1)
    sign_in(user)

    post "/api/v1/template_design_sessions", params: { name: "排队额度", initial_message: "做第一版" }
    assert_response :created
    session_id = body.dig("session", "id")

    post "/api/v1/template_design_sessions/#{session_id}/append_message", params: { content: "继续修改第二版" }
    assert_response :accepted
    assert_equal "queued", body.dig("message", "state")

    post "/api/v1/template_design_sessions/#{session_id}/append_message", params: { content: "继续修改第三版" }
    assert_response :too_many_requests
    assert_includes body.fetch("errors").first, "额度已用完"
  end

  test "创建会话会拒绝未知模型和不具备文本生成能力的模型" do
    sign_in(@admin)

    assert_no_difference "TemplateDesignSession.count" do
      post "/api/v1/template_design_sessions", params: {
        name: "未知模型", configuration: { model_id: "missing" }
      }
    end
    assert_response :unprocessable_content
    assert_includes body.fetch("errors"), "未知的模型"

    assert_no_difference "TemplateDesignSession.count" do
      post "/api/v1/template_design_sessions", params: {
        name: "视觉模型", configuration: { model_id: "visual-only" }
      }
    end
    assert_response :unprocessable_content
    assert_includes body.fetch("errors"), "该模型不支持文本生成"
  end

  test "普通用户不能在创建会话时选择超过权限等级的模型" do
    user = User.create!(email_address: "design-model-level@test.com", password: "test123", password_confirmation: "test123", model_level: 4)
    Setting.set("user_templates_enabled", true)
    sign_in(user)

    assert_no_difference "TemplateDesignSession.count" do
      post "/api/v1/template_design_sessions", params: {
        name: "越权模型", configuration: { model_id: "restricted" }
      }
    end

    assert_response :forbidden
    assert_includes body.fetch("errors"), "无权限使用该模型"
  end

  test "管理员更新和追加需求都会校验会话指定模型" do
    sign_in(@admin)
    session = @admin.template_design_sessions.create!(name: "模型校验", configuration: { "model_id" => "fast" })

    patch "/api/v1/template_design_sessions/#{session.id}", params: {
      configuration: { model_id: "visual-only" }
    }
    assert_response :unprocessable_content
    assert_equal "fast", session.reload.configuration.fetch("model_id")

    patch "/api/v1/template_design_sessions/#{session.id}", params: {
      configuration: { model_id: "restricted" }
    }
    assert_response :forbidden
    assert_equal "fast", session.reload.configuration.fetch("model_id")

    assert_no_difference "TemplateDesignMessage.count" do
      post "/api/v1/template_design_sessions/#{session.id}/append_message", params: {
        content: "换一个模型", configuration: { model_id: "missing" }
      }
    end
    assert_response :unprocessable_content
    assert_includes body.fetch("errors"), "未知的模型"
  end

  test "普通用户更新和追加需求同样不能绕过模型权限" do
    user = User.create!(email_address: "design-model-update@test.com", password: "test123", password_confirmation: "test123", model_level: 4)
    Setting.set("user_templates_enabled", true)
    session = user.template_design_sessions.create!(name: "普通用户模型校验", configuration: { "model_id" => "fast" })
    sign_in(user)

    patch "/api/v1/template_design_sessions/#{session.id}", params: {
      configuration: { model_id: "restricted" }
    }
    assert_response :forbidden
    assert_equal "fast", session.reload.configuration.fetch("model_id")

    assert_no_difference "TemplateDesignMessage.count" do
      post "/api/v1/template_design_sessions/#{session.id}/append_message", params: {
        content: "不能越权", configuration: { model_id: "restricted" }
      }
    end
    assert_response :forbidden
    assert_includes body.fetch("errors"), "无权限使用该模型"
  end
end
